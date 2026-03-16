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
import { action, internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
  BIGSELLER_API_BASE,
  BIGSELLER_MAX_POLLS,
  BIGSELLER_POLL_INTERVAL_MS,
  BIGSELLER_PLATFORM_ID,
  BIGSELLER_FROLLIE_SHOP_IDS,
  BIGSELLER_MAX_SYNC_DAYS,
  BIGSELLER_SHOP_PLATFORM_MAP,
} from "./config";
import {
  buildBigSellerHeaders,
  buildPageListBody,
  buildSyncTaskCreateBody,
  detectHtmlResponse,
  getPageListEndpoint,
  mapOrderToRevenue,
  mapOrderToStorage,
  normalizePlatformFees,
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

// ─── Sync State Management ───────────────────────────────────────────────────
// updateSyncStage lives in ./mutations.ts (Convex requires mutations in default runtime, not Node.js)

// ─── Auth Failure Handler ────────────────────────────────────────────────────

async function handleAuthFailure(
  ctx: ActionCtx,
  startDate: string,
  endDate: string,
  attempt: number,
  syncLogId: Id<"externalSyncLogs">,
): Promise<void> {
  await ctx.runMutation(internal.integrations.bigseller.mutations.updateSyncStage, {
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
    await ctx.runMutation(internal.integrations.bigseller.mutations.updateSyncStage, {
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
      await ctx.runMutation(internal.integrations.bigseller.mutations.updateSyncStage, {
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
      await ctx.runMutation(internal.integrations.bigseller.mutations.updateSyncStage, {
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
      await ctx.runMutation(internal.integrations.bigseller.mutations.updateSyncStage, {
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
      await ctx.runMutation(internal.integrations.bigseller.mutations.updateSyncStage, {
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
    await ctx.runMutation(internal.integrations.bigseller.mutations.updateSyncStage, {
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
      await ctx.runMutation(internal.integrations.bigseller.mutations.updateSyncStage, {
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
      await ctx.runMutation(internal.integrations.bigseller.mutations.updateSyncStage, {
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
        await ctx.runMutation(internal.integrations.bigseller.mutations.updateSyncStage, {
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

      await ctx.runMutation(internal.integrations.bigseller.mutations.updateSyncStage, {
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
        await ctx.runMutation(internal.integrations.bigseller.mutations.updateSyncStage, {
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
      await ctx.runMutation(internal.integrations.bigseller.mutations.updateSyncStage, {
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
    await ctx.runMutation(internal.integrations.bigseller.mutations.updateSyncStage, {
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
      await ctx.runMutation(internal.integrations.bigseller.mutations.updateSyncStage, {
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
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalRevenue = 0;
    const allSkuCodes = new Set<string>();
    const allPlatforms = new Set<string>();

    // Update stage to fetching
    await ctx.runMutation(internal.integrations.bigseller.mutations.updateSyncStage, {
      stage: "fetching",
      pollAttempt: 0,
      maxPolls: BIGSELLER_MAX_POLLS,
      attempt: args.attempt,
      startDate: args.startDate,
      endDate: args.endDate,
    });

    // Group shop IDs by platform for platform-specific API calls.
    // The common pageList.json returns 0 for Shopee commission/shipping/other fees.
    // Platform-specific endpoints return the real fee breakdown.
    const platformShops = new Map<string, number[]>();
    for (const shopId of BIGSELLER_FROLLIE_SHOP_IDS) {
      const platform = BIGSELLER_SHOP_PLATFORM_MAP[shopId] || "common";
      const existing = platformShops.get(platform) || [];
      existing.push(shopId);
      platformShops.set(platform, existing);
    }

    // Fetch orders per platform using platform-specific endpoints
    for (const [platform, shopIds] of platformShops) {
      const endpoint = getPageListEndpoint(platform);
      const platformTemplate = (platform === "shopee" || platform === "tiktok")
        ? platform
        : "common" as const;

      let pageNo = 1;
      let totalPage = 1;

      while (pageNo <= totalPage) {
        const body = buildPageListBody(
          args.startDate,
          args.endDate,
          pageNo,
          shopIds,
          platformTemplate,
        );

        let responseText: string;
        try {
          const response = await fetch(
            `${BIGSELLER_API_BASE}/${endpoint}`,
            {
              method: "POST",
              headers,
              body: JSON.stringify(body),
            }
          );
          responseText = await response.text();
        } catch (err) {
          console.error(`BigSeller ${platform} pageList fetch error (page ${pageNo}):`, err);
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
          console.error(`BigSeller ${platform} pageList invalid JSON (page ${pageNo})`);
          pageNo++;
          continue;
        }

        if (parsed.code !== 0) {
          console.error(`BigSeller ${platform} pageList error (page ${pageNo}): code=${parsed.code}`);
          pageNo++;
          continue;
        }

        const pageData = parsed.data?.itemPageVo;
        if (!pageData) {
          console.warn(`BigSeller ${platform} pageList returned no itemPageVo -- empty sync`);
          break;
        }

        totalPage = pageData.totalPage ?? 0;
        const rows = pageData.rows ?? [];

        if (rows.length === 0) break;

        // Normalize platform-specific fee fields into common fields
        // Pass loop platform variable -- order.platform is null on platform-specific endpoints (BUG-02)
        for (const row of rows) {
          normalizePlatformFees(row, platform as "shopee" | "tiktok" | "common");
        }

        // Update stage to storing
        await ctx.runMutation(internal.integrations.bigseller.mutations.updateSyncStage, {
          stage: "storing",
          pollAttempt: 0,
          maxPolls: BIGSELLER_MAX_POLLS,
          attempt: args.attempt,
          startDate: args.startDate,
          endDate: args.endDate,
        });

        // Batch upsert orders -- pass platform variable (BUG-02 fix)
        const storageRows = rows.map((row) => mapOrderToStorage(row, args.syncLogId, platform));
        const upsertResult: { inserted: number; updated: number } = await ctx.runMutation(
          internal.bigsellerOrders.mutations.upsertOrders,
          { orders: storageRows }
        );
        totalInserted += upsertResult.inserted;
        totalUpdated += upsertResult.updated;

        // Bridge to externalRevenue -- pass platform variable (BUG-02 fix)
        const revenueRecords = rows.map((row) => mapOrderToRevenue(row, args.syncLogId, platform));
        const revenueIds: string[] = await ctx.runMutation(internal.externalData.mutations.saveRevenue, {
          records: revenueRecords.map((r) => ({
            source: r.source as "shopee" | "tiktok",
            externalTransactionId: r.externalTransactionId,
            revenueGross: r.revenueGross,
            revenueNet: r.revenueNet,
            commission: r.commission,
            deliveryFees: r.deliveryFees,
            transactionCount: r.transactionCount,
            periodStart: r.periodStart,
            periodEnd: r.periodEnd,
            transactionDate: r.transactionDate,
            dataOrigin: r.dataOrigin,
            confidence: r.confidence,
            transactionType: r.transactionType,
            syncLogId: r.syncLogId,
          })),
        });

        // Link revenue IDs back to bigsellerOrders for retroactive mapping
        if (revenueIds.length > 0) {
          const links: Array<{ platformOrderId: string; revenueId: Id<"externalRevenue"> }> = [];
          for (const revId of revenueIds) {
            const revDoc = await ctx.runQuery(
              internal.integrations.bigseller.queries.getRevenueById,
              { revenueId: revId as Id<"externalRevenue"> }
            );
            if (revDoc?.externalTransactionId) {
              const orderId = revDoc.externalTransactionId.replace("bigseller:", "");
              if (orderId) {
                links.push({
                  platformOrderId: orderId,
                  revenueId: revId as Id<"externalRevenue">,
                });
              }
            }
          }
          if (links.length > 0) {
            await ctx.runMutation(
              internal.bigsellerOrders.mutations.linkRevenueToOrders,
              { links }
            );
          }
        }

        // Collect SKU codes and platforms for product mapping
        // Use loop platform variable, not row.platform (null on platform-specific endpoints)
        for (const row of rows) {
          totalRevenue += row.platformIncome ?? 0;
          allPlatforms.add(platform);
          for (const sku of row.skuVoList || []) {
            if (sku.sku) allSkuCodes.add(`${platform}::${sku.sku}`);
          }
        }

        pageNo++;
      }
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
    await ctx.runMutation(internal.integrations.bigseller.mutations.updateSyncStage, {
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
