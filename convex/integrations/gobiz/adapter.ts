"use node";

declare const process: { env: Record<string, string | undefined> };

import { v } from "convex/values";
import { action, internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
  GOBIZ_CONFIG,
  buildIndexName,
  buildNdjsonBody,
  type GoBizMsearchResponse,
} from "./config";

type ActionCtx = {
  runQuery: (...args: any[]) => Promise<any>;
  runMutation: (...args: any[]) => Promise<any>;
};

/**
 * Resolve GoBiz API token: DB first, then env var fallback.
 */
async function resolveGoBizToken(ctx: ActionCtx): Promise<string | null> {
  const dbCred = await ctx.runQuery(
    internal.platformCredentials.queries.getTokenInternal,
    { platformId: "gobiz" }
  );
  return dbCred?.currentToken ?? process.env.GOBIZ_API_TOKEN ?? null;
}

/**
 * Core GoBiz revenue sync logic shared by public action and cron.
 */
async function performGoBizSync(
  ctx: ActionCtx,
  opts: {
    periodStart?: number;
    periodEnd?: number;
    triggeredBy: string;
    syncType: "manual" | "cron";
  }
): Promise<{
  success: boolean;
  syncLogId?: Id<"externalSyncLogs">;
  revenueGross?: number;
  revenueNet?: number;
  transactionCount?: number;
  period?: { start: string; end: string };
  error?: string;
  durationMs: number;
}> {
  const token = await resolveGoBizToken(ctx);
  if (!token) {
    return {
      success: false,
      error: "GoBiz API token not found. Go to Settings > GoBiz > Configure to paste your token.",
      durationMs: 0,
    };
  }

  const startTime = Date.now();

  // Default to today's range if not specified
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);

  const rangeFrom = opts.periodStart ?? startOfDay.getTime();
  const rangeTo = opts.periodEnd ?? endOfDay.getTime();

  // Create sync log
  const syncLogId: Id<"externalSyncLogs"> = await ctx.runMutation(
    internal.externalData.mutations.createSyncLog,
    {
      source: "gobiz",
      syncType: opts.syncType,
      status: "started",
      triggeredBy: opts.triggeredBy,
      timestamp: startTime,
    }
  );

  try {
    // Build index name from the query date
    const queryDate = new Date(rangeFrom);
    const indexName = buildIndexName(queryDate);
    const ndjsonBody = buildNdjsonBody(indexName, rangeFrom, rangeTo);

    // Custom headers for the request
    const customHeaders = {
      ...GOBIZ_CONFIG.headers,
      "x-range-from": String(rangeFrom),
      "x-range-to": String(rangeTo),
      "x-custom-interval": "1d",
    };

    // Fetch gross revenue (proxy/44)
    const grossUrl = `${GOBIZ_CONFIG.baseUrl}${GOBIZ_CONFIG.analyticsPath}/proxy/${GOBIZ_CONFIG.proxies.grossRevenue.id}/_msearch`;
    const grossResponse = await fetch(grossUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-ndjson",
        Authorization: `Bearer ${token}`,
        ...customHeaders,
        "x-dashboard-id": GOBIZ_CONFIG.proxies.grossRevenue.dashboardId,
        "x-panel-id": GOBIZ_CONFIG.proxies.grossRevenue.panelId,
      },
      body: ndjsonBody,
    });

    if (grossResponse.status === 401) {
      // Try to mark token as expired in DB (may not exist if using env var)
      try {
        await ctx.runMutation(
          internal.platformCredentials.mutations.updateToken,
          {
            platformId: "gobiz",
            lastRefreshAt: Date.now(),
            lastRefreshStatus: "error" as const,
            lastRefreshError: "Token expired (401)",
          }
        );
      } catch {
        // No DB row -- token came from env var, nothing to update
      }
      throw new Error(
        "GoBiz API token expired. Go to Settings > GoBiz > Configure to paste a new token."
      );
    }

    if (!grossResponse.ok) {
      throw new Error(
        `GoBiz gross revenue API error: ${grossResponse.status} ${grossResponse.statusText}`
      );
    }

    const grossData = (await grossResponse.json()) as GoBizMsearchResponse;

    // Fetch net revenue (proxy/4)
    const netUrl = `${GOBIZ_CONFIG.baseUrl}${GOBIZ_CONFIG.analyticsPath}/proxy/${GOBIZ_CONFIG.proxies.netRevenue.id}/_msearch`;
    const netResponse = await fetch(netUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-ndjson",
        Authorization: `Bearer ${token}`,
        ...customHeaders,
        "x-dashboard-id": GOBIZ_CONFIG.proxies.netRevenue.dashboardId,
        "x-panel-id": GOBIZ_CONFIG.proxies.netRevenue.panelId,
      },
      body: ndjsonBody,
    });

    if (netResponse.status === 401) {
      try {
        await ctx.runMutation(
          internal.platformCredentials.mutations.updateToken,
          {
            platformId: "gobiz",
            lastRefreshAt: Date.now(),
            lastRefreshStatus: "error" as const,
            lastRefreshError: "Token expired (401)",
          }
        );
      } catch {
        // No DB row -- token came from env var
      }
      throw new Error(
        "GoBiz API token expired. Go to Settings > GoBiz > Configure to paste a new token."
      );
    }

    if (!netResponse.ok) {
      throw new Error(
        `GoBiz net revenue API error: ${netResponse.status} ${netResponse.statusText}`
      );
    }

    const netData = (await netResponse.json()) as GoBizMsearchResponse;

    // Extract values (amounts are in cents, divide by 100 for IDR)
    const grossAggs = grossData.responses?.[0]?.aggregations;
    const netAggs = netData.responses?.[0]?.aggregations;
    const transactionCount = grossData.responses?.[0]?.hits?.total?.value ?? 0;

    const revenueGross = (grossAggs?.total_amount?.value ?? 0) / 100;
    const revenueNet = (netAggs?.total_merchant_share?.value ?? 0) / 100;

    // Save revenue record
    await ctx.runMutation(
      internal.externalData.mutations.saveRevenue,
      {
        records: [{
          source: "gobiz" as const,
          transactionCount,
          revenueGross,
          revenueNet,
          periodStart: rangeFrom,
          periodEnd: rangeTo,
          dataOrigin: "api_revenue" as const,
          confidence: "exact" as const,
          syncLogId,
        }],
      }
    );

    // Update sync log
    await ctx.runMutation(
      internal.externalData.mutations.updateSyncLog,
      {
        logId: syncLogId,
        status: "success",
        productsCount: transactionCount,
        durationMs: Date.now() - startTime,
      }
    );

    return {
      success: true,
      syncLogId,
      revenueGross,
      revenueNet,
      transactionCount,
      period: {
        start: new Date(rangeFrom).toISOString(),
        end: new Date(rangeTo).toISOString(),
      },
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    await ctx.runMutation(
      internal.externalData.mutations.updateSyncLog,
      {
        logId: syncLogId,
        status: "error",
        errorMessage: errorMsg,
        durationMs: Date.now() - startTime,
      }
    );

    return {
      success: false,
      syncLogId,
      error: errorMsg,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Sync GoBiz (GoFood) revenue data.
 *
 * Flow:
 * 1. Query proxy/44 for gross revenue + transaction count
 * 2. Query proxy/4 for net revenue (merchant share)
 * 3. Store combined revenue record with confidence: "exact"
 */
export const syncGoBizRevenue = action({
  args: {
    periodStart: v.optional(v.number()),
    periodEnd: v.optional(v.number()),
    triggeredBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await performGoBizSync(ctx, {
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      triggeredBy: args.triggeredBy ?? "manual",
      syncType: "manual",
    });
  },
});

/**
 * Internal action: Auto-sync GoBiz revenue (called by cron every 3h).
 * Silently skips if no token is available.
 */
export const syncGoBizRevenueCron = internalAction({
  args: {},
  handler: async (ctx) => {
    return await performGoBizSync(ctx, {
      triggeredBy: "cron",
      syncType: "cron",
    });
  },
});
