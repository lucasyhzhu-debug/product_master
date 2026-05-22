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
import { decodeJwtPayload } from "../../lib/jwt";
import {
  BIGSELLER_API_BASE,
  BIGSELLER_MAX_POLLS,
  pollDelayMs,
  BIGSELLER_PLATFORM_ID,
  BIGSELLER_FROLLIE_SHOP_IDS,
  BIGSELLER_MAX_SYNC_DAYS,
  BIGSELLER_SHOP_PLATFORM_MAP,
  BIGSELLER_PAGELIST_READINESS_RETRY_DELAYS_MS,
} from "./config";
import {
  buildBigSellerHeaders,
  buildPageListBody,
  buildSyncTaskCreateBody,
  detectHtmlResponse,
  isJsonAuthError,
  getPageListEndpoint,
  mapOrderToRevenue,
  mapOrderToStorage,
  normalizePlatformFees,
  buildPriceOracle,
  prorateItems,
  type BigSellerOrderRow,
} from "./helpers";

// bigsellerNormalize + bigsellerAdapter live in ./adapter.ts (co-located with
// existing AUTH-02 action exports). Wave 0 normalize test imports from
// ../adapter so that's the canonical location for the adapter export.
// This sync.ts file owns the live saveRevenueItems emit branch (:804-866),
// now migrated to saveRevenueItemsWithCounts for R9 counter wiring.

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
    errorMessage: "BigSeller token expired or invalid",
  });

  // Update platform credential health status to error
  await ctx.runMutation(internal.platformCredentials.mutations.updateToken, {
    platformId: BIGSELLER_PLATFORM_ID,
    lastRefreshAt: Date.now(),
    lastRefreshStatus: "error",
    lastRefreshError: "Token expired or invalid (BigSeller auth failure)",
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

    let parsed: { code: number; msg?: string; errorCode?: number };
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

    // JSON-based auth failure (e.g., code 401006) -- treat same as HTML auth failure
    if (isJsonAuthError(parsed)) {
      console.error(`BigSeller JSON auth error during triggerSync: code=${parsed.code}, errorCode=${parsed.errorCode}, msg=${parsed.msg}`);
      await handleAuthFailure(ctx, args.startDate, args.endDate, args.attempt, args.syncLogId);
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

    // Schedule first poll using the adaptive ramp (current attempt = 0 -> 15s)
    await ctx.scheduler.runAfter(
      pollDelayMs(0),
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
          pollDelayMs(args.pollAttempt),
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
      errorCode?: number;
      msg?: string;
      data?: {
        progressInfo?: {
          taskStatus?: string;
          successOrderNum?: number;
          failOrderNum?: number;
          taskSchedule?: string;
        };
        detailList?: Array<{
          shopId?: number;
          shopName?: string;
          taskStatus?: string;
          successOrderNum?: number;
          errorMsg?: string | null;
        }>;
      };
    };
    try {
      parsed = JSON.parse(responseText);
    } catch {
      // Invalid JSON -- continue polling
      if (args.pollAttempt < args.maxPolls) {
        await ctx.scheduler.runAfter(
          pollDelayMs(args.pollAttempt),
          internal.integrations.bigseller.sync.pollSyncTask,
          { ...args, pollAttempt: args.pollAttempt + 1 }
        );
      }
      return;
    }

    // JSON-based auth failure (e.g., code 401006) -- treat same as HTML auth failure
    if (isJsonAuthError(parsed)) {
      console.error(`BigSeller JSON auth error during pollSyncTask: code=${parsed.code}, errorCode=${parsed.errorCode}, msg=${parsed.msg}`);
      await handleAuthFailure(ctx, args.startDate, args.endDate, args.attempt, args.syncLogId);
      return;
    }

    const taskStatus = parsed?.data?.progressInfo?.taskStatus;

    if (taskStatus === "complete") {
      // Log per-shop successOrderNum so we know how many orders BigSeller's
      // upstream Shopee/TikTok pull actually retrieved. Without this, an
      // empty pageList response is indistinguishable from an upstream-empty
      // pull on BigSeller's side. detailList is documented in
      // docs/BIGSELLER_PROFIT_API.md §sync/task/detail/new/get.json.
      const totalSuccess = parsed?.data?.progressInfo?.successOrderNum ?? -1;
      const detailList = parsed?.data?.detailList ?? [];
      const perShop = detailList
        .map((d) => `${d.shopName ?? d.shopId}=${d.successOrderNum ?? "?"}${d.taskStatus !== "success" ? `/${d.taskStatus}` : ""}${d.errorMsg ? ` (err: ${d.errorMsg})` : ""}`)
        .join(", ");
      console.log(
        `BigSeller poll complete: progressInfo.successOrderNum=${totalSuccess}, perShop=[${perShop}]`
      );

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
      pollDelayMs(args.pollAttempt),
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
    // Phase 74.5.1 Plan 06 (R9): per-sync counters — accumulated across the
    // shopee/tiktok emit branch (below). Wired to updateSyncLog at completion.
    let totalItemsDeducted = 0;
    let totalItemsSkipped = 0;
    const allSkuCodes = new Set<string>();
    const allPlatforms = new Set<string>();
    // D-03 token auto-refresh: accumulate the freshest muctoken returned in the
    // response headers across all platforms/pages; persist ONCE at end of a
    // successful sync. authErrorObserved gates the persist defensively.
    let latestRefreshedToken = "";
    let authErrorObserved = false;

    // Update stage to fetching
    await ctx.runMutation(internal.integrations.bigseller.mutations.updateSyncStage, {
      stage: "fetching",
      pollAttempt: 0,
      maxPolls: BIGSELLER_MAX_POLLS,
      attempt: args.attempt,
      startDate: args.startDate,
      endDate: args.endDate,
    });

    // ── Phase 79: Build price oracle + mapping lookups ONCE per sync run ──
    // The oracle sources per-SKU median prices from historical single-SKU
    // bigsellerOrders. The mapping tables resolve SKU → menuProduct for
    // item naming + auto-match attribution.
    //
    // Both are consumed in the per-platform loop below by `prorateItems`
    // and the `saveRevenueItems` emit branch (Shopee/TikTok only).
    //
    // DA-11 deferral: BigSeller pageList does NOT expose buyerName/buyerPhone/
    // buyerAddress. Only financial buyer* fields (buyerShippingFee,
    // buyerTotalAmount) are returned. Per D-07, customer data capture is
    // deferred entirely this phase.
    // See: .planning/phases/79-shopee-item-level-revenue/79-RESEARCH.md
    //      §Critical finding (BigSeller buyer-field availability).
    const singleSkuOrders: Array<{
      orderAmount?: number;
      saleAmount: number;
      skuVoList: Array<{ sku: string; skuNum: number }>;
    }> = await ctx.runQuery(
      internal.bigsellerOrders.queries.getSingleSkuOrdersForOracle,
      {}
    );
    const priceOracle = buildPriceOracle(singleSkuOrders);

    const allMappings: Array<{
      externalProductCode: string;
      source: string;
      menuProductId: string | null;
      menuProductName: string | null;
      menuProductPrice: number | null;
    }> = await ctx.runQuery(
      internal.integrations.bigseller.queries.getShopeeAndTikTokMappingsWithProducts,
      {}
    );
    const mappingBySku = new Map<
      string,
      { menuProductId?: string; menuProductPrice?: number }
    >();
    const menuProductById = new Map<string, { name: string; price: number }>();
    for (const m of allMappings) {
      mappingBySku.set(m.externalProductCode, {
        menuProductId: m.menuProductId ?? undefined,
        menuProductPrice: m.menuProductPrice ?? undefined,
      });
      if (m.menuProductId && m.menuProductName !== null && m.menuProductPrice !== null) {
        menuProductById.set(m.menuProductId, {
          name: m.menuProductName,
          price: m.menuProductPrice,
        });
      }
    }

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
      // Tracks readiness-race retries on page 1 only. BigSeller can mark the
      // generic sync task `taskStatus=complete` while the per-platform pageList
      // index is still warming up (code:-1, msg:"Failed, please try again later").
      // Reset per platform so each shop gets its own retry budget.
      let page1ReadinessRetries = 0;

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
          // D-03: capture the refreshed muctoken from response headers. The
          // BigSeller server returns a fresher JWT (iat=now, exp=iat+20d) on
          // every successful call. Accumulate the freshest one in outer scope.
          const refreshedToken = response.headers.get("muctoken") ?? "";
          if (refreshedToken && refreshedToken !== mucToken) {
            latestRefreshedToken = refreshedToken;
          }
          responseText = await response.text();
        } catch (err) {
          console.error(`BigSeller ${platform} pageList fetch error (page ${pageNo}):`, err);
          pageNo++;
          continue;
        }

        // HTML detection = auth failure -- abort entire fetch
        if (detectHtmlResponse(responseText)) {
          // D-03 defensive guard: mark auth error so the end-of-sync persist
          // never overwrites a known-good token with a degraded one. The early
          // return alone prevents reaching the persist block; the flag survives
          // future refactors that might remove the early return.
          authErrorObserved = true;
          await handleAuthFailure(ctx, args.startDate, args.endDate, args.attempt, args.syncLogId);
          return;
        }

        let parsed: {
          code: number;
          errorCode?: number;
          msg?: string;
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

        // JSON-based auth failure -- abort entire fetch (same as HTML auth failure)
        if (isJsonAuthError(parsed)) {
          console.error(`BigSeller JSON auth error during fetchOrders (${platform} page ${pageNo}): code=${parsed.code}, errorCode=${parsed.errorCode}, msg=${parsed.msg}`);
          // D-03 defensive guard: see HTML-auth-failure branch above.
          authErrorObserved = true;
          await handleAuthFailure(ctx, args.startDate, args.endDate, args.attempt, args.syncLogId);
          return;
        }

        if (parsed.code !== 0) {
          // Surface real diagnostic — BigSeller returns code:-1 with a msg explaining why
          // (e.g., "sync task in progress", "invalid field"). The previous version
          // logged only the code, which made root-causing impossible from logs alone.
          // Truncate responseText to 500 chars to keep log lines bounded.
          const responseSnippet = responseText.slice(0, 500);
          console.error(
            `BigSeller ${platform} pageList error (page ${pageNo}): ` +
              `code=${parsed.code}, errorCode=${parsed.errorCode ?? "none"}, ` +
              `msg=${JSON.stringify(parsed.msg ?? null)}, body=${responseSnippet}`
          );
          // Readiness-race retry: BigSeller's docs (BIGSELLER_PROFIT_API.md:74-76)
          // confirm `code:-1, msg:"Failed, please try again later"` means the
          // pageList index is still warming up after the generic sync task marked
          // taskStatus=complete. Retry on page 1 only, gated to that exact msg.
          // Other code:-1 modes (missing required field) still fail fast at the
          // page-1 transition below.
          const isReadinessLag =
            pageNo === 1 &&
            parsed.code === -1 &&
            typeof parsed.msg === "string" &&
            parsed.msg.toLowerCase().includes("try again later");
          if (
            isReadinessLag &&
            page1ReadinessRetries < BIGSELLER_PAGELIST_READINESS_RETRY_DELAYS_MS.length
          ) {
            const delay = BIGSELLER_PAGELIST_READINESS_RETRY_DELAYS_MS[page1ReadinessRetries];
            page1ReadinessRetries++;
            console.log(
              `BigSeller ${platform} pageList readiness lag — retry ` +
                `${page1ReadinessRetries}/${BIGSELLER_PAGELIST_READINESS_RETRY_DELAYS_MS.length} ` +
                `in ${delay}ms`,
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue; // retry same page
          }
          // First-page failure on page 1 is fatal: BigSeller is rejecting the request
          // for the entire query. Marking the sync 'failed' (instead of silently
          // completing with 0 orders) lets the user see something is wrong rather
          // than "No orders found for this date range."
          if (pageNo === 1) {
            await ctx.runMutation(internal.integrations.bigseller.mutations.updateSyncStage, {
              stage: "failed",
              pollAttempt: 0,
              maxPolls: BIGSELLER_MAX_POLLS,
              attempt: args.attempt,
              startDate: args.startDate,
              endDate: args.endDate,
              errorMessage:
                `BigSeller ${platform} rejected pageList request: ` +
                `code=${parsed.code}` +
                (parsed.msg ? ` (${parsed.msg})` : ""),
              completedAt: Date.now(),
            });
            await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
              logId: args.syncLogId,
              status: "error",
              errorMessage: `BigSeller ${platform} pageList code=${parsed.code}: ${parsed.msg ?? "unknown"}`,
            });
            return;
          }
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
        const revenueResults: Array<{ id: string; isNew: boolean }> = await ctx.runMutation(internal.externalData.mutations.saveRevenue, {
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
        const revenueIds = revenueResults.map((r) => r.id);
        // Phase 83-04 (O4): prefetch the entire revenue batch ONCE so both the
        // revenue→order linking loop below AND the cross-platform leak guard
        // further down read from one in-memory map — replaces ~400 sequential
        // single-doc per-id lookups per full-month sync. getRevenueByIds returns
        // Array<[id, doc]> (Flag #5 — a raw Map isn't a Convex-serializable
        // return type); build the lookup Map caller-side.
        const revDocEntries = await ctx.runQuery(
          internal.integrations.bigseller.queries.getRevenueByIds,
          { revenueIds: revenueIds as Id<"externalRevenue">[] }
        );
        const revDocsById = new Map(revDocEntries);
        if (revenueIds.length > 0) {
          const links: Array<{ platformOrderId: string; revenueId: Id<"externalRevenue"> }> = [];
          for (const revId of revenueIds) {
            const revDoc = revDocsById.get(revId);
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

        // ── Phase 79: Emit externalRevenueItems per Shopee/TikTok order ──
        // Branch only for shopee/tiktok where skuVoList is populated. The per-
        // platform loop guarantees `platform` is the canonical source for every
        // row in this batch — defensive assertion below catches future
        // refactors that might break that invariant (T-79-02).
        if (platform === "shopee" || platform === "tiktok") {
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const result = revenueResults[i];
            if (!result?.id) continue;
            if (!row.skuVoList || row.skuVoList.length === 0) continue;
            const revenueId = result.id as Id<"externalRevenue">;

            // Cross-platform leak guard (T-79-02): the per-platform loop
            // groups shops by BIGSELLER_SHOP_PLATFORM_MAP[shopId], and
            // mapOrderToRevenue stamps `source = platform.toLowerCase()`,
            // so revenueResults[i] MUST belong to `platform`. If a future
            // refactor breaks that contract, fail loudly rather than emit
            // items against the wrong platform's revenueId.
            const revDoc = revDocsById.get(revenueId);
            if (revDoc && revDoc.source !== platform) {
              throw new Error(
                `Cross-platform leak guard: revenueSource=${revDoc.source} !== order.platform=${platform} (revenueId=${revenueId})`
              );
            }

            const prorated = prorateItems(
              {
                orderAmount: row.orderAmount,
                saleAmount: row.saleAmount,
                skuVoList: row.skuVoList,
              },
              priceOracle,
              mappingBySku
            );
            const items = prorated.map((p) => {
              const mapping = mappingBySku.get(p.sku);
              const menuProductIdStr = mapping?.menuProductId;
              const menuProduct = menuProductIdStr
                ? menuProductById.get(menuProductIdStr)
                : null;
              const productName = menuProduct?.name ?? p.sku; // fallback: raw SKU code
              return {
                externalItemId: p.sku, // D-18 dedup key (revenueId, externalItemId)
                productName,
                unitPrice: p.unitPrice,
                quantity: p.skuNum,
                totalPrice: p.totalPrice,
                linkedMenuProductId: menuProductIdStr
                  ? (menuProductIdStr as Id<"menuProducts">)
                  : undefined,
                isAutoMatched: Boolean(menuProductIdStr),
                matchConfidence: (menuProductIdStr ? "exact" : "none") as
                  | "exact"
                  | "none",
              };
            });
            if (items.length > 0) {
              // Phase 74.5.1 Plan 06 (R9): migrated to saveRevenueItemsWithCounts
              // (Option A) to read `deducted` + `skipped` counters for syncLog
              // wiring. Gate to shopee/tiktok at :808 is PRESERVED — this call
              // only runs when platform is shopee or tiktok.
              const itemsResult: {
                ids: Id<"externalRevenueItems">[];
                inserted: number;
                deducted: number;
                skipped: number;
              } = await ctx.runMutation(
                internal.externalData.mutations.saveRevenueItemsWithCounts,
                { revenueId, items }
              );
              totalItemsDeducted += itemsResult.deducted;
              totalItemsSkipped += itemsResult.skipped;
            }
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

    // ── D-03: persist the freshest auto-refreshed muctoken ONCE at end of a
    // successful sync. Guards (T-83-03-01): skip if empty / equals current /
    // auth error observed during the sync. Persisting once (not per-page,
    // T-83-03-02) avoids the cron+manual write race on the singleton
    // platformCredentials row. Wrapped in try/catch so a persist failure never
    // fails the sync — we already have the order data.
    if (shouldPersistRefreshedToken(latestRefreshedToken, mucToken, authErrorObserved)) {
      try {
        let tokenExpiresAt: number | undefined;
        try {
          const payload = decodeJwtPayload(latestRefreshedToken);
          const exp = payload.exp as number | undefined;
          tokenExpiresAt = typeof exp === "number" ? exp * 1000 : undefined;
        } catch {
          // Malformed token — persist anyway; banner falls back to no-expiry.
          tokenExpiresAt = undefined;
        }
        await ctx.runMutation(
          internal.platformCredentials.mutations.updateToken,
          {
            platformId: BIGSELLER_PLATFORM_ID,
            currentToken: latestRefreshedToken,
            tokenExpiresAt,
            lastRefreshAt: Date.now(),
            lastRefreshStatus: "auto-refreshed-from-response",
          }
        );
      } catch (err) {
        console.error("BigSeller token auto-refresh persist failed:", err);
        // do NOT fail the sync — the order data is already saved.
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
    // Phase 74.5.1 Plan 06 (R9): wire itemsDeducted + itemsSkipped.
    const durationMs = Date.now() - startTime;
    await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
      logId: args.syncLogId,
      status: "success",
      productsCount: totalOrders,
      durationMs,
      itemsDeducted: totalItemsDeducted,
      itemsSkipped: totalItemsSkipped,
    });

    console.log(
      `BigSeller sync complete: ${totalOrders} orders (${totalInserted} new, ${totalUpdated} updated), ` +
        `revenue: ${totalRevenue} IDR, unmapped SKUs: ${unmappedSkus}`
    );
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * D-03 persist-guard decision (pure, unit-testable). Returns true only when the
 * freshest auto-refreshed muctoken should be written back to platformCredentials.
 * Skip when: empty header, unchanged token, or any auth error observed.
 */
export function shouldPersistRefreshedToken(
  latestRefreshedToken: string,
  currentToken: string,
  authErrorObserved: boolean,
): boolean {
  if (authErrorObserved) return false;
  if (!latestRefreshedToken) return false;
  if (latestRefreshedToken === currentToken) return false;
  return true;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
