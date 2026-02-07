"use node";

declare const process: { env: Record<string, string | undefined> };

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
  GOBIZ_CONFIG,
  buildIndexName,
  buildNdjsonBody,
  type GoBizMsearchResponse,
} from "./config";

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
    const token = process.env.GOBIZ_API_TOKEN;
    if (!token) {
      throw new Error(
        "GOBIZ_API_TOKEN environment variable is not set. Go to Convex Dashboard → Settings → Environment Variables to set it."
      );
    }

    const startTime = Date.now();

    // Default to today's range if not specified
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);

    const rangeFrom = args.periodStart ?? startOfDay.getTime();
    const rangeTo = args.periodEnd ?? endOfDay.getTime();

    // Create sync log
    const syncLogId: Id<"externalSyncLogs"> = await ctx.runMutation(
      internal.externalData.mutations.createSyncLog,
      {
        source: "gobiz",
        syncType: "manual",
        status: "started",
        triggeredBy: args.triggeredBy ?? "manual",
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
        throw new Error(
          "GoBiz API token expired. Please log into https://app.gobiz.co.id, copy the access_token cookie, and update GOBIZ_API_TOKEN in Convex environment variables."
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
        throw new Error(
          "GoBiz API token expired. Please log into https://app.gobiz.co.id, copy the access_token cookie, and update GOBIZ_API_TOKEN in Convex environment variables."
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
  },
});
