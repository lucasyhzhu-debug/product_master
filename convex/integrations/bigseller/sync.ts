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

// ─── Capped-concurrency helper (Phase 83-07, O2) ───────────────────────────────
// No existing batched-concurrency helper in the repo (the closest analog is the
// unbounded Promise.all over ctx.db.get in convex/orders/helpers/batchFetching.ts).
// Implemented as a chunked Promise.all: slice `items` into groups of `limit`,
// await each group fully before starting the next. Results preserve input order,
// so page rows collected via this helper stay ordered by pageNo (O2 requirement).
// Bounds total in-flight requests to `limit` (T-83-07-04: DoS / rate-limit).
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const settled = await Promise.all(chunk.map(fn));
    results.push(...settled);
  }
  return results;
}

// Page concurrency cap for the O2 fan-out (pages 2..N within a platform).
const BIGSELLER_PAGE_CONCURRENCY = 4;

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
  // I3 (quad-review): optional scoped message. When one platform's auth failed but
  // a sibling succeeded under O1 parallelism, the caller passes a message naming
  // the failing platform so we don't falsely claim a global token expiry.
  scopedMessage?: { stageMessage: string; logMessage: string },
): Promise<void> {
  await ctx.runMutation(internal.integrations.bigseller.mutations.updateSyncStage, {
    stage: "failed",
    pollAttempt: 0,
    maxPolls: BIGSELLER_MAX_POLLS,
    attempt,
    startDate,
    endDate,
    errorMessage: scopedMessage?.stageMessage ?? "Token expired -- paste new token in Settings",
    completedAt: Date.now(),
  });

  // Update sync log with error
  await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
    logId: syncLogId,
    status: "error",
    errorMessage: scopedMessage?.logMessage ?? "BigSeller token expired or invalid",
  });

  // Update platform credential health status to error
  await ctx.runMutation(internal.platformCredentials.mutations.updateToken, {
    platformId: BIGSELLER_PLATFORM_ID,
    lastRefreshAt: Date.now(),
    lastRefreshStatus: "error",
    lastRefreshError: "Token expired or invalid (BigSeller auth failure)",
  });
}

// ─── Single-page fetch (Phase 83-07, O2) ──────────────────────────────────────
// Performs ONE pageList fetch + parse for a given pageNo and returns a structured
// outcome. Captures the refreshed `muctoken` header (returned, NOT written to any
// shared outer variable — the SEQUENTIAL caller accumulates it post-resolution so
// concurrent page calls stay write-safe; T-83-07-03). Detects HTML/JSON auth
// errors and surfaces them via `authError` so the caller can abort without
// persisting a degraded token. Does NOT perform the page-1 readiness-race retry
// (page-1-only, sequential) or the page-1 fatal status write — those stay in the
// sequential page-1 path in processPlatform.
type FetchPageResult = {
  rows: BigSellerOrderRow[];
  totalPage: number;
  refreshedToken: string;
  authError: boolean;
  // Non-auth, non-fatal error (e.g. readiness lag / code:-1 on page>1). The
  // caller logs it; on page 1 it decides readiness-retry vs fatal.
  errorMsg?: string;
  errorCode?: number;
  // Raw msg from BigSeller for readiness-lag detection on page 1.
  msg?: string;
};

async function fetchPage(
  endpoint: string,
  headers: Record<string, string>,
  body: unknown,
  platform: string,
  pageNo: number,
  currentToken: string,
): Promise<FetchPageResult> {
  let responseText: string;
  let refreshedToken = "";
  try {
    const response = await fetch(`${BIGSELLER_API_BASE}/${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    // D-03: capture the refreshed muctoken from response headers. Returned to the
    // caller (not written to a shared outer variable) so concurrent page fetches
    // cannot race the token accumulation (T-83-07-03).
    const headerToken = response.headers.get("muctoken") ?? "";
    if (headerToken && headerToken !== currentToken) {
      refreshedToken = headerToken;
    }
    responseText = await response.text();
  } catch (err) {
    console.error(`BigSeller ${platform} pageList fetch error (page ${pageNo}):`, err);
    return { rows: [], totalPage: 0, refreshedToken, authError: false, errorMsg: String(err) };
  }

  // HTML detection = auth failure.
  if (detectHtmlResponse(responseText)) {
    return { rows: [], totalPage: 0, refreshedToken, authError: true };
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
    return { rows: [], totalPage: 0, refreshedToken, authError: false, errorMsg: "invalid JSON" };
  }

  // JSON-based auth failure -- same as HTML auth failure.
  if (isJsonAuthError(parsed)) {
    console.error(
      `BigSeller JSON auth error during fetchOrders (${platform} page ${pageNo}): ` +
        `code=${parsed.code}, errorCode=${parsed.errorCode}, msg=${parsed.msg}`,
    );
    return { rows: [], totalPage: 0, refreshedToken, authError: true };
  }

  if (parsed.code !== 0) {
    // Surface real diagnostic — BigSeller returns code:-1 with a msg explaining why
    // (e.g., "sync task in progress", "invalid field"). Truncate to 500 chars.
    const responseSnippet = responseText.slice(0, 500);
    console.error(
      `BigSeller ${platform} pageList error (page ${pageNo}): ` +
        `code=${parsed.code}, errorCode=${parsed.errorCode ?? "none"}, ` +
        `msg=${JSON.stringify(parsed.msg ?? null)}, body=${responseSnippet}`,
    );
    return {
      rows: [],
      totalPage: 0,
      refreshedToken,
      authError: false,
      errorMsg: `code=${parsed.code}`,
      errorCode: parsed.code,
      msg: parsed.msg,
    };
  }

  const pageData = parsed.data?.itemPageVo;
  if (!pageData) {
    console.warn(`BigSeller ${platform} pageList returned no itemPageVo (page ${pageNo}) -- empty`);
    return { rows: [], totalPage: 0, refreshedToken, authError: false };
  }

  return {
    rows: pageData.rows ?? [],
    totalPage: pageData.totalPage ?? 0,
    refreshedToken,
    authError: false,
  };
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
    // Phase 83-07 (O1): per-platform counts are RETURNED from processPlatform and
    // AGGREGATED after Promise.all resolves (single-threaded) — NOT mutated from
    // inside concurrent branches (T-83-07-01). Declared here as the aggregation
    // targets; assigned once below.
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalRevenue = 0;
    // Phase 74.5.1 Plan 06 (R9): per-sync counters wired to updateSyncLog.
    let totalItemsDeducted = 0;
    let totalItemsSkipped = 0;
    const allSkuCodes = new Set<string>();
    const allPlatforms = new Set<string>();
    // D-03 token auto-refresh: the freshest muctoken seen across all platforms/
    // pages; assigned from the post-resolution aggregation (T-83-07-03), persisted
    // ONCE at end of a successful sync. authErrorObserved gates the persist.
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

    // ── Phase 83-07 (O2): per-platform fetch + processing ──────────────────────
    // processPlatform fetches page 1 SEQUENTIALLY (it carries the readiness-race
    // retry + the page-1-fatal handling and reveals totalPage), then fans out
    // pages 2..N with mapWithConcurrency (cap 4, results ordered by pageNo). All
    // collected rows are processed through the existing normalize → upsert →
    // saveRevenue → link → item-emit pipeline. Per-platform counts/token/auth are
    // RETURNED (not mutated on the shared outer scope) so the O1 platform fan-out
    // (Task 2) can aggregate them post-resolution, concurrency-safe (T-83-07-01/03).
    type PlatformResult = {
      // I3 (quad-review): carry the platform name so auth/fatal failures can be
      // scoped + named in the terminal message instead of an all-or-nothing claim.
      platform: string;
      inserted: number;
      updated: number;
      revenue: number;
      itemsDeducted: number;
      itemsSkipped: number;
      skuCodes: string[];
      platforms: string[];
      refreshedToken: string;
      authError: boolean;
      // page-1 fatal rejection scoped to THIS platform (O1: do not abort the
      // sibling platform's already-resolved work — staffreview R2).
      fatalError?: string;
    };

    const processPlatform = async (
      platform: string,
      shopIds: number[],
    ): Promise<PlatformResult> => {
      const result: PlatformResult = {
        platform,
        inserted: 0,
        updated: 0,
        revenue: 0,
        itemsDeducted: 0,
        itemsSkipped: 0,
        skuCodes: [],
        platforms: [],
        refreshedToken: "",
        authError: false,
      };

      // ── I2 (quad-review): guard the unmapped "common" platform. When a shop ID
      // is absent from BIGSELLER_SHOP_PLATFORM_MAP, `platform` defaults to "common".
      // The downstream saveRevenue / saveProductMappings emit casts `r.source` to
      // "shopee" | "tiktok" — feeding "common" would throw deep in the validator.
      // Fail this platform cleanly (scoped, like a page-1 fatal) instead of letting
      // an unsound cast throw. Does NOT affect the configured shopee/tiktok shops. ──
      if (platform !== "shopee" && platform !== "tiktok") {
        result.fatalError =
          `BigSeller shop(s) [${shopIds.join(", ")}] are not mapped to a known ` +
          `platform (resolved to "${platform}"). Add them to BIGSELLER_SHOP_PLATFORM_MAP.`;
        return result;
      }

      const endpoint = getPageListEndpoint(platform);
      const platformTemplate = (platform === "shopee" || platform === "tiktok")
        ? platform
        : "common" as const;

      const buildBody = (pageNo: number) =>
        buildPageListBody(args.startDate, args.endDate, pageNo, shopIds, platformTemplate);

      // Local token accumulator — merged into the platform result; the OUTER
      // latestRefreshedToken is only assigned after Promise.all resolves.
      const captureToken = (token: string) => {
        if (token) result.refreshedToken = token;
      };

      // ── Page 1: SEQUENTIAL (readiness-race retry + page-1 fatal) ──
      let page1: FetchPageResult | null = null;
      let page1ReadinessRetries = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await fetchPage(endpoint, headers, buildBody(1), platform, 1, mucToken);
        captureToken(res.refreshedToken);

        if (res.authError) {
          result.authError = true;
          return result;
        }

        if (res.errorCode !== undefined && res.errorCode !== 0) {
          // Readiness-race retry: page 1 only, gated to the exact warming-up msg.
          const isReadinessLag =
            res.errorCode === -1 &&
            typeof res.msg === "string" &&
            res.msg.toLowerCase().includes("try again later");
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
            continue; // retry page 1
          }
          // Page-1 fatal: BigSeller is rejecting the whole query for this platform.
          // O1 (staffreview R2): scope the failure to THIS platform — record it and
          // return; the sibling platform's resolved data still lands. The caller
          // marks the overall sync 'error' naming the failing platform.
          result.fatalError =
            `BigSeller ${platform} rejected pageList request: code=${res.errorCode}` +
            (res.msg ? ` (${res.msg})` : "");
          return result;
        }
        page1 = res;
        break;
      }

      // ── Update stage to storing ONCE per platform (O1 caveat (a): no per-page
      // 'storing' write that would race / fire N times under the fan-out). ──
      await ctx.runMutation(internal.integrations.bigseller.mutations.updateSyncStage, {
        stage: "storing",
        pollAttempt: 0,
        maxPolls: BIGSELLER_MAX_POLLS,
        attempt: args.attempt,
        startDate: args.startDate,
        endDate: args.endDate,
      });

      const totalPage = page1.totalPage ?? 0;
      // Collect rows in pageNo order: page 1 first, then the ordered fan-out.
      const allRows: BigSellerOrderRow[] = [...page1.rows];

      // ── Pages 2..N: PARALLEL fan-out (cap 4, ordered by pageNo) ──
      if (totalPage > 1) {
        const pageNos: number[] = [];
        for (let n = 2; n <= totalPage; n++) pageNos.push(n);
        const pageResults = await mapWithConcurrency(
          pageNos,
          BIGSELLER_PAGE_CONCURRENCY,
          (n) => fetchPage(endpoint, headers, buildBody(n), platform, n, mucToken),
        );
        // mapWithConcurrency preserves input order, so pageResults[i] is pageNos[i].
        for (const res of pageResults) {
          captureToken(res.refreshedToken);
          if (res.authError) {
            // Auth error on a fanned-out page: surface it, do NOT persist token.
            result.authError = true;
            continue;
          }
          // A non-auth page>1 error logs (in fetchPage) and contributes 0 rows —
          // matches today's `pageNo++; continue`.
          allRows.push(...res.rows);
        }
      }

      if (allRows.length === 0) return result;

      // ── C1 (quad-review): dedup rows by platformOrderId (→ externalTransactionId)
      // BEFORE any processing. The same order can appear on >1 page (BigSeller's
      // pageList is not snapshot-stable across pages). The upsert/saveRevenue path
      // is already idempotent (keyed by externalTransactionId), but the DISPLAY
      // summary (result.revenue sum over rows, totalOrders = inserted+updated) and
      // the per-order item-emit loop double-count a re-seen order. Deduping the row
      // list at the source fixes revenue, order-count, AND itemsDeducted/Skipped in
      // one place (keep first occurrence — page order is preserved by the fan-out). ──
      const seenOrderIds = new Set<string>();
      const dedupedRows: BigSellerOrderRow[] = [];
      for (const row of allRows) {
        const key = row.platformOrderId;
        if (key && seenOrderIds.has(key)) continue;
        if (key) seenOrderIds.add(key);
        dedupedRows.push(row);
      }
      allRows.length = 0;
      allRows.push(...dedupedRows);

      // Normalize platform-specific fee fields into common fields.
      for (const row of allRows) {
        normalizePlatformFees(row, platform as "shopee" | "tiktok" | "common");
      }

      // Batch upsert orders. saveRevenue/upsertOrders are keyed by
      // externalTransactionId (unique per order) → idempotent, cannot double-count
      // (T-83-07-01).
      const storageRows = allRows.map((row) => mapOrderToStorage(row, args.syncLogId, platform));
      const upsertResult: { inserted: number; updated: number } = await ctx.runMutation(
        internal.bigsellerOrders.mutations.upsertOrders,
        { orders: storageRows }
      );
      result.inserted += upsertResult.inserted;
      result.updated += upsertResult.updated;

      // Bridge to externalRevenue.
      const revenueRecords = allRows.map((row) => mapOrderToRevenue(row, args.syncLogId, platform));
      const revenueResults: Array<{ id: string; isNew: boolean }> = await ctx.runMutation(
        internal.externalData.mutations.saveRevenue,
        {
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
        }
      );

      // Link revenue IDs back to bigsellerOrders for retroactive mapping.
      const revenueIds = revenueResults.map((r) => r.id);
      // Phase 83-04 (O4): prefetch the entire revenue batch ONCE (Array<[id,doc]>,
      // Flag #5); build the lookup Map caller-side.
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
              links.push({ platformOrderId: orderId, revenueId: revId as Id<"externalRevenue"> });
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
      // processPlatform stamps `source` from its own `platform`, so the per-row
      // cross-platform leak guard (T-79-02) stays correct under O1 concurrency.
      if (platform === "shopee" || platform === "tiktok") {
        for (let i = 0; i < allRows.length; i++) {
          const row = allRows[i];
          const res = revenueResults[i];
          if (!res?.id) continue;
          if (!row.skuVoList || row.skuVoList.length === 0) continue;
          const revenueId = res.id as Id<"externalRevenue">;

          // Cross-platform leak guard (T-79-02): see comment above. `source` is
          // stamped from this branch's own `platform`, so concurrency cannot
          // route items to the wrong platform.
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
            const itemsResult: {
              ids: Id<"externalRevenueItems">[];
              inserted: number;
              deducted: number;
              skipped: number;
            } = await ctx.runMutation(
              internal.externalData.mutations.saveRevenueItemsWithCounts,
              { revenueId, items }
            );
            result.itemsDeducted += itemsResult.deducted;
            result.itemsSkipped += itemsResult.skipped;
          }
        }
      }

      // Collect SKU codes + platforms (use loop platform variable, not row.platform).
      const skuCodeSet = new Set<string>();
      for (const row of allRows) {
        result.revenue += row.platformIncome ?? 0;
        result.platforms.push(platform);
        for (const sku of row.skuVoList || []) {
          if (sku.sku) skuCodeSet.add(`${platform}::${sku.sku}`);
        }
      }
      result.skuCodes = [...skuCodeSet];

      return result;
    };

    // ── I1 (quad-review): wrap the parallel fan-out + post-aggregation in a
    // try/catch. An uncaught throw inside processPlatform (leak-guard throw,
    // saveRevenue validator error, item-emit failure) rejects Promise.all and
    // escapes fetchOrders with NO terminal state write — pinning bigsellerSyncState
    // at stage "storing" forever, which the startSync overlap guard treats as
    // "in progress" and blocks every future run. On throw, write a terminal
    // "failed" state naming the failing context and abort. Successful-path behavior
    // is unchanged (the early `return`s inside exit the try without hitting catch). ──
    try {
    // ── Phase 83-07 (O1): run both platforms CONCURRENTLY. priceOracle /
    // mappingBySku / menuProductById are built once above and read ONLY inside
    // processPlatform — safe for concurrent use (SPEC O1). Counts are aggregated
    // AFTER the Promise.all resolves (single-threaded). ──
    const platformResults = await Promise.all(
      [...platformShops].map(([platform, shopIds]) => processPlatform(platform, shopIds))
    );

    // ── Aggregate post-resolution (single-threaded — concurrency-safe) ──
    for (const r of platformResults) {
      totalInserted += r.inserted;
      totalUpdated += r.updated;
      totalRevenue += r.revenue;
      totalItemsDeducted += r.itemsDeducted;
      totalItemsSkipped += r.itemsSkipped;
      for (const code of r.skuCodes) allSkuCodes.add(code);
      for (const p of r.platforms) allPlatforms.add(p);
      // Freshest token: any non-empty refreshedToken from a platform that did NOT
      // observe an auth error. (All platforms hit the same server within seconds,
      // so any fresh token is acceptable; auth-error platforms contribute none.)
      if (r.refreshedToken && !r.authError) latestRefreshedToken = r.refreshedToken;
    }
    authErrorObserved = platformResults.some((r) => r.authError);

    // ── Auth failure (I3 quad-review): scope to the failing platform(s). Under O1
    // parallelism a sibling platform may have already persisted data, so we must
    // NOT claim a blanket "token expired" for the whole sync when only one platform
    // hit an auth error. Name the failing platform(s); only claim a true global
    // token expiry when EVERY processed platform saw the auth error. ──
    if (authErrorObserved) {
      const failedAuthPlatforms = platformResults
        .filter((r) => r.authError)
        .map((r) => r.platform);
      const allFailed = platformResults.every((r) => r.authError);
      const named = failedAuthPlatforms.join(", ");
      const scopedMessage = allFailed
        ? undefined // every platform failed auth → genuine global token expiry (default message)
        : {
            stageMessage:
              `BigSeller auth failed for ${named} (token rejected). ` +
              `Other platform data was saved. Paste a fresh token in Settings.`,
            logMessage: `BigSeller auth failure scoped to: ${named}`,
          };
      await handleAuthFailure(
        ctx,
        args.startDate,
        args.endDate,
        args.attempt,
        args.syncLogId,
        scopedMessage,
      );
      return;
    }

    // ── Page-1 fatal (staffreview R2): scope the failure to the offending
    // platform but let the sibling's resolved data stand. Mark the sync 'error'
    // naming the failing platform(s); do NOT silently complete with the partial
    // data as a success. ──
    const fatalPlatforms = platformResults.filter((r) => r.fatalError);
    if (fatalPlatforms.length > 0) {
      const messages = fatalPlatforms.map((r) => r.fatalError).join("; ");
      await ctx.runMutation(internal.integrations.bigseller.mutations.updateSyncStage, {
        stage: "failed",
        pollAttempt: 0,
        maxPolls: BIGSELLER_MAX_POLLS,
        attempt: args.attempt,
        startDate: args.startDate,
        endDate: args.endDate,
        errorMessage: messages,
        completedAt: Date.now(),
      });
      await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
        logId: args.syncLogId,
        status: "error",
        errorMessage: messages,
      });
      return;
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
    } catch (err) {
      // I1 (quad-review): terminal-state safety net. Any uncaught throw from the
      // fan-out / aggregation lands here. Write a terminal "failed" state so the
      // sync is not stuck "storing" (which would block the cron overlap guard
      // indefinitely), and mark the sync log error. Best-effort: if these writes
      // themselves throw, let the action fail — but we've at least attempted to
      // clear the active state.
      const message = err instanceof Error ? err.message : String(err);
      console.error("BigSeller fetchOrders fan-out failed:", err);
      await ctx.runMutation(internal.integrations.bigseller.mutations.updateSyncStage, {
        stage: "failed",
        pollAttempt: 0,
        maxPolls: BIGSELLER_MAX_POLLS,
        attempt: args.attempt,
        startDate: args.startDate,
        endDate: args.endDate,
        errorMessage: `BigSeller sync failed during order processing: ${message}`,
        completedAt: Date.now(),
      });
      await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
        logId: args.syncLogId,
        status: "error",
        errorMessage: `BigSeller sync failed during order processing: ${message}`,
      });
    }
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
