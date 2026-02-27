"use node";

/**
 * BigSeller sync scheduler-chain.
 *
 * Lifecycle: startSync (public) -> triggerSync -> pollSyncTask (60s chain) -> fetchOrders
 *
 * Uses scheduler-chain pattern: each stage schedules the next via ctx.scheduler.runAfter().
 * Sync progress tracked reactively in bigsellerSyncState singleton document.
 */

import { v } from "convex/values";
import { action, internalAction, internalMutation } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
  BIGSELLER_API_BASE,
  BIGSELLER_MAX_POLLS,
  BIGSELLER_POLL_INTERVAL_MS,
  BIGSELLER_PLATFORM_ID,
  BIGSELLER_FROLLIE_SHOP_IDS,
  BIGSELLER_MAX_SYNC_DAYS,
} from "./config";
import {
  buildBigSellerHeaders,
  buildPageListBody,
  buildSyncTaskCreateBody,
  detectHtmlResponse,
  mapOrderToRevenue,
  mapOrderToStorage,
  type BigSellerOrderRow,
} from "./helpers";

type ActionCtx = {
  runQuery: (...args: any[]) => Promise<any>;
  runMutation: (...args: any[]) => Promise<any>;
  scheduler: { runAfter: (delay: number, ref: any, args: any) => Promise<any> };
};

// ─── Token Resolution ────────────────────────────────────────────────────────

async function resolveBigSellerToken(ctx: ActionCtx): Promise<string | null> {
  const cred = await ctx.runQuery(
    internal.platformCredentials.queries.getCredentialsInternal,
    { platformId: BIGSELLER_PLATFORM_ID }
  );
  return cred?.currentToken ?? null;
}

// ─── Sync State Management (singleton upsert) ───────────────────────────────

export const updateSyncStage = internalMutation({
  args: {
    stage: v.union(
      v.literal("idle"),
      v.literal("triggering"),
      v.literal("polling"),
      v.literal("fetching"),
      v.literal("storing"),
      v.literal("complete"),
      v.literal("failed"),
      v.literal("retrying"),
    ),
    pollAttempt: v.number(),
    maxPolls: v.number(),
    attempt: v.number(),
    startDate: v.string(),
    endDate: v.string(),
    errorMessage: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    summary: v.optional(v.object({
      totalOrders: v.number(),
      newOrders: v.number(),
      updatedOrders: v.number(),
      totalRevenue: v.number(),
      unmappedSkus: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("bigsellerSyncState").first();
    const data = {
      stage: args.stage,
      pollAttempt: args.pollAttempt,
      maxPolls: args.maxPolls,
      attempt: args.attempt,
      startDate: args.startDate,
      endDate: args.endDate,
      startedAt: existing?.startedAt ?? Date.now(),
      errorMessage: args.errorMessage,
      completedAt: args.completedAt,
      summary: args.summary,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("bigsellerSyncState", {
        ...data,
        startedAt: Date.now(),
      });
    }
  },
});

// ─── Auth Failure Handler ────────────────────────────────────────────────────

async function handleAuthFailure(
  ctx: ActionCtx,
  startDate: string,
  endDate: string,
  attempt: number,
  syncLogId: Id<"externalSyncLogs">,
): Promise<void> {
  await ctx.runMutation(internal.integrations.bigseller.sync.updateSyncStage, {
    stage: "failed",
    pollAttempt: 0,
    maxPolls: BIGSELLER_MAX_POLLS,
    attempt,
    startDate,
    endDate,
    errorMessage: "Token expired -- paste new token in Settings",
    completedAt: Date.now(),
  });

  // Update sync log with error
  await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
    logId: syncLogId,
    status: "error",
    errorMessage: "BigSeller token expired (HTML response detected)",
  });

  // Update platform credential health status to error
  await ctx.runMutation(internal.platformCredentials.mutations.updateToken, {
    platformId: BIGSELLER_PLATFORM_ID,
    lastRefreshAt: Date.now(),
    lastRefreshStatus: "error",
    lastRefreshError: "Token expired (HTML response from BigSeller)",
  });
}

// ─── Public Entry Point ──────────────────────────────────────────────────────

/**
 * Start a BigSeller sync. Admin-only.
 * If no dates provided, uses incremental sync from last successful sync.
 */
export const startSync = action({
  args: {
    token: v.string(),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate admin role
    await ctx.runQuery(internal.platformCredentials.queries.validateAdminToken, {
      token: args.token,
    });

    // Check if sync already in progress
    const currentState = await ctx.runQuery(
      internal.integrations.bigseller.queries.getSyncStateInternal,
      {}
    );
    if (
      currentState &&
      (currentState.stage === "triggering" ||
        currentState.stage === "polling" ||
        currentState.stage === "fetching" ||
        currentState.stage === "storing")
    ) {
      return { success: false as const, error: "Sync already in progress" };
    }

    // Determine date range
    let startDate = args.startDate;
    let endDate = args.endDate;

    if (!startDate || !endDate) {
      // Incremental sync: find last successful bigseller sync
      const lastSync = await ctx.runQuery(
        internal.integrations.bigseller.queries.getLastSuccessfulSyncDate,
        {}
      );
      const now = new Date();
      endDate = endDate || formatDate(now);
      if (lastSync) {
        startDate = startDate || lastSync;
      } else {
        // Default: 30 days ago
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        startDate = startDate || formatDate(thirtyDaysAgo);
      }
    }

    // Validate date range
    const diffMs =
      new Date(endDate).getTime() - new Date(startDate).getTime();
    const diffDays = diffMs / (24 * 60 * 60 * 1000);
    if (diffDays > BIGSELLER_MAX_SYNC_DAYS) {
      return {
        success: false as const,
        error: `Date range exceeds ${BIGSELLER_MAX_SYNC_DAYS} days. BigSeller API limit.`,
      };
    }

    // Set sync stage to triggering
    await ctx.runMutation(internal.integrations.bigseller.sync.updateSyncStage, {
      stage: "triggering",
      pollAttempt: 0,
      maxPolls: BIGSELLER_MAX_POLLS,
      attempt: 1,
      startDate,
      endDate,
    });

    // Create sync log
    const syncLogId: Id<"externalSyncLogs"> = await ctx.runMutation(
      internal.externalData.mutations.createSyncLog,
      {
        source: "bigseller" as const,
        syncType: "manual" as const,
        status: "started" as const,
        timestamp: Date.now(),
        triggeredBy: "admin",
      }
    );

    // Schedule triggerSync
    await ctx.scheduler.runAfter(0, internal.integrations.bigseller.sync.triggerSync, {
      startDate,
      endDate,
      attempt: 1,
      syncLogId,
    });

    return { success: true as const };
  },
});

// ─── Trigger Sync Task on BigSeller ──────────────────────────────────────────

export const triggerSync = internalAction({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    attempt: v.number(),
    syncLogId: v.id("externalSyncLogs"),
  },
  handler: async (ctx, args) => {
    const mucToken = await resolveBigSellerToken(ctx);
    if (!mucToken) {
      await ctx.runMutation(internal.integrations.bigseller.sync.updateSyncStage, {
        stage: "failed",
        pollAttempt: 0,
        maxPolls: BIGSELLER_MAX_POLLS,
        attempt: args.attempt,
        startDate: args.startDate,
        endDate: args.endDate,
        errorMessage: "No BigSeller token configured -- paste token in Settings",
        completedAt: Date.now(),
      });
      await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
        logId: args.syncLogId,
        status: "error",
        errorMessage: "No BigSeller token configured",
      });
      return;
    }

    const headers = buildBigSellerHeaders(mucToken);
    const body = buildSyncTaskCreateBody(args.startDate, args.endDate);

    let responseText: string;
    try {
      const response = await fetch(
        `${BIGSELLER_API_BASE}/sync/task/create.json`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }
      );
      responseText = await response.text();
    } catch (err) {
      await ctx.runMutation(internal.integrations.bigseller.sync.updateSyncStage, {
        stage: "failed",
        pollAttempt: 0,
        maxPolls: BIGSELLER_MAX_POLLS,
        attempt: args.attempt,
        startDate: args.startDate,
        endDate: args.endDate,
        errorMessage: `Network error: ${err instanceof Error ? err.message : String(err)}`,
        completedAt: Date.now(),
      });
      await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
        logId: args.syncLogId,
        status: "error",
        errorMessage: `Network error: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    // HTML detection = auth failure
    if (detectHtmlResponse(responseText)) {
      await handleAuthFailure(ctx, args.startDate, args.endDate, args.attempt, args.syncLogId);
      return;
    }

    let parsed: { code: number; msg?: string };
    try {
      parsed = JSON.parse(responseText);
    } catch {
      await ctx.runMutation(internal.integrations.bigseller.sync.updateSyncStage, {
        stage: "failed",
        pollAttempt: 0,
        maxPolls: BIGSELLER_MAX_POLLS,
        attempt: args.attempt,
        startDate: args.startDate,
        endDate: args.endDate,
        errorMessage: `Invalid JSON response from BigSeller`,
        completedAt: Date.now(),
      });
      return;
    }

    if (parsed.code === -1 && parsed.msg?.toLowerCase().includes("sync task is in progress")) {
      // Join existing sync -- this is expected behavior, not an error
      console.log("BigSeller sync task already in progress -- joining existing sync");
    } else if (parsed.code !== 0) {
      await ctx.runMutation(internal.integrations.bigseller.sync.updateSyncStage, {
        stage: "failed",
        pollAttempt: 0,
        maxPolls: BIGSELLER_MAX_POLLS,
        attempt: args.attempt,
        startDate: args.startDate,
        endDate: args.endDate,
        errorMessage: `BigSeller API error: ${parsed.msg || "Unknown error"} (code: ${parsed.code})`,
        completedAt: Date.now(),
      });
      return;
    }

    // Success or join existing -- move to polling
    await ctx.runMutation(internal.integrations.bigseller.sync.updateSyncStage, {
      stage: "polling",
      pollAttempt: 0,
      maxPolls: BIGSELLER_MAX_POLLS,
      attempt: args.attempt,
      startDate: args.startDate,
      endDate: args.endDate,
    });

    // Schedule first poll after 60s
    await ctx.scheduler.runAfter(
      BIGSELLER_POLL_INTERVAL_MS,
      internal.integrations.bigseller.sync.pollSyncTask,
      {
        startDate: args.startDate,
        endDate: args.endDate,
        pollAttempt: 1,
        maxPolls: BIGSELLER_MAX_POLLS,
        attempt: args.attempt,
        syncLogId: args.syncLogId,
      }
    );
  },
});

// ─── Poll Sync Task Status ───────────────────────────────────────────────────

export const pollSyncTask = internalAction({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    pollAttempt: v.number(),
    maxPolls: v.number(),
    attempt: v.number(),
    syncLogId: v.id("externalSyncLogs"),
  },
  handler: async (ctx, args) => {
    const mucToken = await resolveBigSellerToken(ctx);
    if (!mucToken) {
      await ctx.runMutation(internal.integrations.bigseller.sync.updateSyncStage, {
        stage: "failed",
        pollAttempt: args.pollAttempt,
        maxPolls: args.maxPolls,
        attempt: args.attempt,
        startDate: args.startDate,
        endDate: args.endDate,
        errorMessage: "Token missing during poll -- paste new token",
        completedAt: Date.now(),
      });
      return;
    }

    const headers = buildBigSellerHeaders(mucToken);
    let responseText: string;
    try {
      const response = await fetch(
        `${BIGSELLER_API_BASE}/sync/task/detail/new/get.json`,
        { method: "GET", headers }
      );
      responseText = await response.text();
    } catch (err) {
      // Network error during poll -- continue polling if attempts remain
      if (args.pollAttempt < args.maxPolls) {
        await ctx.scheduler.runAfter(
          BIGSELLER_POLL_INTERVAL_MS,
          internal.integrations.bigseller.sync.pollSyncTask,
          { ...args, pollAttempt: args.pollAttempt + 1 }
        );
      }
      return;
    }

    // HTML detection = auth failure
    if (detectHtmlResponse(responseText)) {
      await handleAuthFailure(ctx, args.startDate, args.endDate, args.attempt, args.syncLogId);
      return;
    }

    let parsed: {
      code: number;
      data?: {
        progressInfo?: {
          taskStatus?: string;
        };
      };
    };
    try {
      parsed = JSON.parse(responseText);
    } catch {
      // Invalid JSON -- continue polling
      if (args.pollAttempt < args.maxPolls) {
        await ctx.scheduler.runAfter(
          BIGSELLER_POLL_INTERVAL_MS,
          internal.integrations.bigseller.sync.pollSyncTask,
          { ...args, pollAttempt: args.pollAttempt + 1 }
        );
      }
      return;
    }

    const taskStatus = parsed?.data?.progressInfo?.taskStatus;

    if (taskStatus === "complete") {
      // Sync complete -- move to fetching orders
      await ctx.runMutation(internal.integrations.bigseller.sync.updateSyncStage, {
        stage: "fetching",
        pollAttempt: args.pollAttempt,
        maxPolls: args.maxPolls,
        attempt: args.attempt,
        startDate: args.startDate,
        endDate: args.endDate,
      });

      // Schedule fetchOrders immediately
      await ctx.scheduler.runAfter(0, internal.integrations.bigseller.sync.fetchOrders, {
        startDate: args.startDate,
        endDate: args.endDate,
        attempt: args.attempt,
        syncLogId: args.syncLogId,
      });
      return;
    }

    if (taskStatus === "fail") {
      // BigSeller sync failed
      if (args.attempt === 1) {
        // Auto-retry once
        await ctx.runMutation(internal.integrations.bigseller.sync.updateSyncStage, {
          stage: "retrying",
          pollAttempt: 0,
          maxPolls: args.maxPolls,
          attempt: 2,
          startDate: args.startDate,
          endDate: args.endDate,
        });
        await ctx.scheduler.runAfter(5000, internal.integrations.bigseller.sync.triggerSync, {
          startDate: args.startDate,
          endDate: args.endDate,
          attempt: 2,
          syncLogId: args.syncLogId,
        });
        return;
      }

      await ctx.runMutation(internal.integrations.bigseller.sync.updateSyncStage, {
        stage: "failed",
        pollAttempt: args.pollAttempt,
        maxPolls: args.maxPolls,
        attempt: args.attempt,
        startDate: args.startDate,
        endDate: args.endDate,
        errorMessage: "BigSeller sync task failed -- check shop connections in BigSeller dashboard",
        completedAt: Date.now(),
      });
      await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
        logId: args.syncLogId,
        status: "error",
        errorMessage: "BigSeller sync task failed",
      });
      return;
    }

    // Still in progress -- check poll limit
    if (args.pollAttempt >= args.maxPolls) {
      if (args.attempt === 1) {
        // Auto-retry once per locked decision
        await ctx.runMutation(internal.integrations.bigseller.sync.updateSyncStage, {
          stage: "retrying",
          pollAttempt: 0,
          maxPolls: args.maxPolls,
          attempt: 2,
          startDate: args.startDate,
          endDate: args.endDate,
        });
        await ctx.scheduler.runAfter(5000, internal.integrations.bigseller.sync.triggerSync, {
          startDate: args.startDate,
          endDate: args.endDate,
          attempt: 2,
          syncLogId: args.syncLogId,
        });
        return;
      }

      // Second attempt also timed out
      await ctx.runMutation(internal.integrations.bigseller.sync.updateSyncStage, {
        stage: "failed",
        pollAttempt: args.pollAttempt,
        maxPolls: args.maxPolls,
        attempt: args.attempt,
        startDate: args.startDate,
        endDate: args.endDate,
        errorMessage: "Sync timed out after 2 attempts",
        completedAt: Date.now(),
      });
      await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
        logId: args.syncLogId,
        status: "error",
        errorMessage: "Sync timed out after 2 attempts",
      });
      return;
    }

    // Continue polling
    await ctx.runMutation(internal.integrations.bigseller.sync.updateSyncStage, {
      stage: "polling",
      pollAttempt: args.pollAttempt,
      maxPolls: args.maxPolls,
      attempt: args.attempt,
      startDate: args.startDate,
      endDate: args.endDate,
    });

    await ctx.scheduler.runAfter(
      BIGSELLER_POLL_INTERVAL_MS,
      internal.integrations.bigseller.sync.pollSyncTask,
      { ...args, pollAttempt: args.pollAttempt + 1 }
    );
  },
});

// ─── Fetch Orders (Paginated) ────────────────────────────────────────────────

export const fetchOrders = internalAction({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    attempt: v.number(),
    syncLogId: v.id("externalSyncLogs"),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const mucToken = await resolveBigSellerToken(ctx);
    if (!mucToken) {
      await ctx.runMutation(internal.integrations.bigseller.sync.updateSyncStage, {
        stage: "failed",
        pollAttempt: 0,
        maxPolls: BIGSELLER_MAX_POLLS,
        attempt: args.attempt,
        startDate: args.startDate,
        endDate: args.endDate,
        errorMessage: "Token missing during fetch -- paste new token",
        completedAt: Date.now(),
      });
      return;
    }

    const headers = buildBigSellerHeaders(mucToken);
    let pageNo = 1;
    let totalPage = 1;
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalRevenue = 0;
    const allSkuCodes = new Set<string>();
    const allPlatforms = new Set<string>();

    // Update stage to fetching
    await ctx.runMutation(internal.integrations.bigseller.sync.updateSyncStage, {
      stage: "fetching",
      pollAttempt: 0,
      maxPolls: BIGSELLER_MAX_POLLS,
      attempt: args.attempt,
      startDate: args.startDate,
      endDate: args.endDate,
    });

    while (pageNo <= totalPage) {
      const body = buildPageListBody(
        args.startDate,
        args.endDate,
        pageNo,
        BIGSELLER_FROLLIE_SHOP_IDS
      );

      let responseText: string;
      try {
        const response = await fetch(
          `${BIGSELLER_API_BASE}/pageList.json`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          }
        );
        responseText = await response.text();
      } catch (err) {
        console.error(`BigSeller pageList fetch error (page ${pageNo}):`, err);
        // Partial failure: continue with next page if possible
        pageNo++;
        continue;
      }

      // HTML detection = auth failure -- abort entire fetch
      if (detectHtmlResponse(responseText)) {
        await handleAuthFailure(ctx, args.startDate, args.endDate, args.attempt, args.syncLogId);
        return;
      }

      let parsed: {
        code: number;
        data?: {
          itemPageVo?: {
            totalPage?: number;
            totalSize?: number;
            rows?: BigSellerOrderRow[];
          };
        };
      };
      try {
        parsed = JSON.parse(responseText);
      } catch {
        console.error(`BigSeller pageList invalid JSON (page ${pageNo})`);
        pageNo++;
        continue;
      }

      if (parsed.code !== 0) {
        console.error(`BigSeller pageList error (page ${pageNo}): code=${parsed.code}`);
        pageNo++;
        continue;
      }

      const pageData = parsed.data?.itemPageVo;
      if (!pageData) {
        console.warn("BigSeller pageList returned no itemPageVo -- empty sync");
        break;
      }

      totalPage = pageData.totalPage ?? 0;
      const rows = pageData.rows ?? [];

      if (rows.length === 0) break;

      // Update stage to storing
      await ctx.runMutation(internal.integrations.bigseller.sync.updateSyncStage, {
        stage: "storing",
        pollAttempt: 0,
        maxPolls: BIGSELLER_MAX_POLLS,
        attempt: args.attempt,
        startDate: args.startDate,
        endDate: args.endDate,
      });

      // Batch upsert orders
      const storageRows = rows.map((row) => mapOrderToStorage(row, args.syncLogId));
      const upsertResult: { inserted: number; updated: number } = await ctx.runMutation(
        internal.bigsellerOrders.mutations.upsertOrders,
        { orders: storageRows }
      );
      totalInserted += upsertResult.inserted;
      totalUpdated += upsertResult.updated;

      // Bridge to externalRevenue
      const revenueRecords = rows.map((row) => mapOrderToRevenue(row, args.syncLogId));
      await ctx.runMutation(internal.externalData.mutations.saveRevenue, {
        records: revenueRecords.map((r) => ({
          source: r.source as "shopee" | "tiktok",
          externalTransactionId: r.externalTransactionId,
          revenueGross: r.revenueGross,
          revenueNet: r.revenueNet,
          commission: r.commission,
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          transactionDate: r.transactionDate,
          dataOrigin: r.dataOrigin,
          confidence: r.confidence,
          transactionType: r.transactionType,
          syncLogId: r.syncLogId,
        })),
      });

      // Collect SKU codes and platforms for product mapping
      for (const row of rows) {
        totalRevenue += row.platformIncome || 0;
        const platform = row.platform?.toLowerCase() || "shopee";
        allPlatforms.add(platform);
        for (const sku of row.skuVoList || []) {
          if (sku.sku) allSkuCodes.add(`${platform}::${sku.sku}`);
        }
      }

      pageNo++;
    }

    // Register product mappings for all unique SKUs per platform
    for (const platformSkuKey of allSkuCodes) {
      const [platform, skuCode] = platformSkuKey.split("::");
      if (!skuCode) continue;
      await ctx.runMutation(internal.externalData.mutations.saveProductMappings, {
        mappings: [
          {
            source: platform as "shopee" | "tiktok",
            externalProductCode: skuCode,
            externalProductName: skuCode, // BigSeller only provides SKU codes, not names
          },
        ],
      });
    }

    // Count unmapped SKUs
    let unmappedSkus = 0;
    for (const platformSkuKey of allSkuCodes) {
      const [platform, skuCode] = platformSkuKey.split("::");
      if (!skuCode) continue;
      const mapping = await ctx.runQuery(
        internal.integrations.bigseller.queries.checkProductMapping,
        { source: platform, externalProductCode: skuCode }
      );
      if (!mapping?.menuProductId) unmappedSkus++;
    }

    const totalOrders = totalInserted + totalUpdated;

    // Update sync stage to complete with summary
    await ctx.runMutation(internal.integrations.bigseller.sync.updateSyncStage, {
      stage: "complete",
      pollAttempt: 0,
      maxPolls: BIGSELLER_MAX_POLLS,
      attempt: args.attempt,
      startDate: args.startDate,
      endDate: args.endDate,
      completedAt: Date.now(),
      summary: {
        totalOrders,
        newOrders: totalInserted,
        updatedOrders: totalUpdated,
        totalRevenue,
        unmappedSkus,
      },
    });

    // Update sync log to success
    const durationMs = Date.now() - startTime;
    await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
      logId: args.syncLogId,
      status: "success",
      productsCount: totalOrders,
      durationMs,
    });

    console.log(
      `BigSeller sync complete: ${totalOrders} orders (${totalInserted} new, ${totalUpdated} updated), ` +
        `revenue: ${totalRevenue} IDR, unmapped SKUs: ${unmappedSkus}`
    );
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
