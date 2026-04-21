"use node";

declare const process: { env: Record<string, string | undefined> };

import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { GOBIZ_CONFIG, GOBIZ_OUTLET_SEED } from "./config";
import {
  wibDateToUtcRange,
  wibDateToUtcIsoRange,
  buildGoBizApiHeaders,
  buildJournalSearchBody,
  buildOrderSearchBody,
  aggregateJournalMetrics,
  parseOrderItems,
  buildJournalDedupKey,
  getMerchantName,
  type JournalMetrics,
} from "./helpers";
import type { ChannelAdapter } from "../_shared/channelAdapter";
import type { ChannelSaleEvent } from "../_shared/channelSaleEvent";

// ─── ChannelAdapter: normalize() + adapter export (Phase 74.5.1 Plan 06) ─────
//
// Pure projection from a canonical GoFood batch payload to ChannelSaleEvent[].
// The existing sync action (syncGoBizRevenue) keeps its existing saveRevenueItems
// write path; `normalize()` is an ADDITIVE export that tests + Plan 05 dispatch
// hook consume. 74.5.2 cutover may consolidate both paths onto this function.
//
// Payload shape is the normalized-for-test form (Wave 0 fixture shape) so tests
// and the adapter share a contract. The live syncGoBizRevenue action feeds its
// internal aggregated journal/order data into `mapOrderToRevenueItems` (inline
// today) — both shapes ultimately converge on the same ChannelSaleEvent fields.
export interface GobizNormalizedBatchOrder {
  readonly orderId: string;
  readonly completedAt: number;
  readonly outletId?: string;
  readonly items: ReadonlyArray<{
    readonly sku?: string;
    readonly menuProductId?: string;
    readonly productName?: string;
    readonly quantity: number;
    readonly unitPrice: number;
    readonly totalPrice: number;
  }>;
}

export interface GobizNormalizedBatch {
  readonly orders: ReadonlyArray<GobizNormalizedBatchOrder>;
}

/**
 * Pure projection: canonical GoFood batch payload → ChannelSaleEvent[].
 * Side-effect-free, no ctx/DB access. Safe for Wave 0 normalize test.
 *
 * Emits `source: "gobiz"` for every event. `externalItemId` derives from
 * `{orderId}-{itemIndex}` to mirror the existing adapter's dedup key shape.
 */
export function gobizNormalize(
  payload: GobizNormalizedBatch
): ChannelSaleEvent[] {
  if (!payload || !payload.orders || payload.orders.length === 0) return [];

  const events: ChannelSaleEvent[] = [];
  for (const order of payload.orders) {
    for (let i = 0; i < order.items.length; i++) {
      const item = order.items[i];
      events.push({
        source: "gobiz" as const,
        occurredAt: order.completedAt,
        externalTransactionId: order.orderId,
        externalItemId: `${order.orderId}-${i}`,
        // Typed Id<"externalOutlets"> cast at the Plan-05 dispatch boundary;
        // normalize() stays string-typed so tests can pass raw fixtures.
        outletId: order.outletId as Id<"externalOutlets"> | undefined,
        menuProductId: item.menuProductId as Id<"menuProducts"> | undefined,
        externalProductCode: item.sku,
        externalProductName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      });
    }
  }
  return events;
}

export const gobizAdapter: ChannelAdapter<GobizNormalizedBatch> = {
  source: "gobiz",
  normalize: gobizNormalize,
};

// ─── Token Resolution ────────────────────────────────────────────────────────
// (ActionCtx is imported from _generated/server — previously redeclared
// locally with any-typed signatures per review N-4.)

async function resolveGoBizToken(ctx: ActionCtx): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
}> {
  const dbCred = await ctx.runQuery(
    internal.platformCredentials.queries.getCredentialsInternal,
    { platformId: "gobiz" }
  );

  return {
    accessToken: dbCred?.currentToken ?? process.env.GOBIZ_API_TOKEN ?? null,
    refreshToken: dbCred?.refreshToken ?? process.env.GOBIZ_REFRESH_TOKEN ?? null,
  };
}

// ─── GoID Auth Headers (from HAR capture) ────────────────────────────────────

const GOBIZ_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.7632.110 Safari/537.36";
const PORTAL_ORIGIN = "https://portal.gofoodmerchant.co.id";

function goidAuthHeaders(): Record<string, string> {
  return {
    "user-agent": GOBIZ_UA,
    "origin": PORTAL_ORIGIN,
    "referer": `${PORTAL_ORIGIN}/auth/login/email`,
    "accept": "application/json, text/plain, */*",
    "content-type": "application/json",
    "Gojek-Country-Code": "ID",
    "Gojek-Timezone": "Asia/Jakarta",
    "X-AppVersion": "transaction-1.22.0-3d465258",
    "X-PhoneMake": "Windows 10 64-bit",
    "X-PhoneModel": "Chrome 145.0.7632.110 on Windows 10 64-bit",
    "X-Platform": "Web",
    "X-User-Locale": "en-US",
    "X-User-Type": "merchant",
    "x-DeviceOS": "Web",
    "x-appId": "go-biz-web-dashboard",
    "x-uniqueid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  };
}

// ─── Token Refresh (GoID API) ────────────────────────────────────────────────

async function attemptTokenRefresh(
  ctx: ActionCtx,
  refreshToken: string,
  _oldAccessToken: string | null
): Promise<string | null> {
  console.log("  Attempting GoBiz token refresh via GoID API...");

  try {
    const resp = await fetch("https://api.gobiz.co.id/goid/token", {
      method: "POST",
      headers: goidAuthHeaders(),
      body: JSON.stringify({
        client_id: "go-biz-web-new",
        grant_type: "refresh_token",
        data: { refresh_token: refreshToken },
      }),
    });

    if (resp.ok) {
      const data = await resp.json() as { access_token?: string; refresh_token?: string };
      if (data.access_token) {
        const newAccessToken = `Bearer ${data.access_token}`;

        await ctx.runMutation(internal.platformCredentials.mutations.updateToken, {
          platformId: "gobiz",
          currentToken: newAccessToken,
          lastRefreshAt: Date.now(),
          lastRefreshStatus: "success",
        });

        console.log("  Token refresh successful (GoID API)");
        return newAccessToken;
      }
    }

    // Try form-urlencoded fallback (some GoID versions accept this)
    const fallbackResp = await fetch("https://api.gobiz.co.id/goid/token", {
      method: "POST",
      headers: {
        ...goidAuthHeaders(),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: "go-biz-web-new",
        refresh_token: refreshToken,
      }).toString(),
    });

    if (fallbackResp.ok) {
      const data = await fallbackResp.json() as { access_token?: string; refresh_token?: string };
      if (data.access_token) {
        const newAccessToken = `Bearer ${data.access_token}`;

        await ctx.runMutation(internal.platformCredentials.mutations.updateToken, {
          platformId: "gobiz",
          currentToken: newAccessToken,
          lastRefreshAt: Date.now(),
          lastRefreshStatus: "success",
        });

        console.log("  Token refresh successful (form-urlencoded fallback)");
        return newAccessToken;
      }
    }
  } catch (err) {
    console.log("  GoID refresh failed:", err instanceof Error ? err.message : String(err));
  }

  // Refresh failed — try password grant as last resort
  const email = process.env.GOBIZ_EMAIL;
  const password = process.env.GOBIZ_PASSWORD;

  if (email && password) {
    console.log("  Attempting password re-login...");
    const newToken = await loginViaGoID(ctx, email, password);
    if (newToken) return newToken;
  }

  // All methods failed
  console.log("  All token refresh methods failed");
  await ctx.runMutation(internal.platformCredentials.mutations.updateToken, {
    platformId: "gobiz",
    lastRefreshAt: Date.now(),
    lastRefreshStatus: "error",
    lastRefreshError: "Refresh token expired and password re-login failed",
  });

  return null;
}

// ─── GoID 2-Step Password Login ──────────────────────────────────────────────

/**
 * Two-step GoID password login (from HAR capture):
 * Step 1: POST /goid/login/request → {email, login_type, client_id}
 * Step 2: POST /goid/token → {client_id, grant_type: "password", data: {email, password}}
 *
 * Both use JSON body with specific Gojek merchant headers.
 * Returns Bearer token string or null on failure.
 */
async function loginViaGoID(
  ctx: ActionCtx,
  email: string,
  password: string
): Promise<string | null> {
  const headers = goidAuthHeaders();

  // Step 1: Login request (challenge initiation)
  const step1Resp = await fetch("https://api.gobiz.co.id/goid/login/request", {
    method: "POST",
    headers,
    body: JSON.stringify({
      email,
      login_type: "password",
      client_id: "go-biz-web-new",
    }),
  });

  if (step1Resp.status !== 201 && step1Resp.status !== 200) {
    const step1Text = await step1Resp.text();
    console.log(`  GoID login/request failed (${step1Resp.status}):`, step1Text.substring(0, 200));
    return null;
  }

  // Step 2: Token grant (password + email in nested data object)
  const step2Resp = await fetch("https://api.gobiz.co.id/goid/token", {
    method: "POST",
    headers,
    body: JSON.stringify({
      client_id: "go-biz-web-new",
      grant_type: "password",
      data: { email, password },
    }),
  });

  if (!step2Resp.ok) {
    const step2Text = await step2Resp.text();
    console.log(`  GoID token grant failed (${step2Resp.status}):`, step2Text.substring(0, 200));
    return null;
  }

  const tokenData = await step2Resp.json() as {
    access_token?: string;
    refresh_token?: string;
  };

  if (!tokenData.access_token) {
    console.log("  GoID token response missing access_token");
    return null;
  }

  const newAccessToken = `Bearer ${tokenData.access_token}`;
  const newRefreshToken = tokenData.refresh_token ?? null;

  await ctx.runMutation(internal.platformCredentials.mutations.saveDirectToken, {
    platformId: "gobiz",
    bearerToken: newAccessToken,
    refreshToken: newRefreshToken ?? undefined,
  });

  console.log("  GoID password login successful");
  return newAccessToken;
}

// ─── API Fetch Helpers ───────────────────────────────────────────────────────

/**
 * Fetch with 401 retry: on 401, attempt token refresh and retry once.
 * Returns the response JSON or throws.
 */
async function fetchWithAuth(
  ctx: ActionCtx,
  url: string,
  body: object,
  accessToken: string,
  refreshToken: string | null,
  retryOn401: boolean = true
): Promise<{ data: any; usedToken: string }> {
  const headers = buildGoBizApiHeaders(accessToken);

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (response.status === 401 && retryOn401 && refreshToken) {
    console.log("  401 Unauthorized, attempting refresh...");
    const newToken = await attemptTokenRefresh(ctx, refreshToken, accessToken);
    if (newToken) {
      return fetchWithAuth(ctx, url, body, newToken, refreshToken, false);
    }
    throw new Error("Token expired and refresh failed");
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return { data, usedToken: accessToken };
}

// ─── Date Range (WIB-aware) ──────────────────────────────────────────────────

/**
 * Generate WIB date strings for the sync range.
 * Adjusts for UTC+7 so we get the correct WIB date at any time of day.
 */
function generateWibDateRange(daysBack: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  // Get current WIB time by adding 7 hours
  const wibNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);

  for (let i = daysBack - 1; i >= 0; i--) {
    const date = new Date(wibNow.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD (in WIB)
    dates.push(dateStr);
  }

  return dates;
}

// ─── Phase A: Journal Sync ───────────────────────────────────────────────────

/**
 * Fetch all journal entries for a single WIB day via paginated journals/search.
 * Returns all hits (unpaginated) for the day.
 */
async function fetchDayJournals(
  ctx: ActionCtx,
  dateStr: string,
  accessToken: string,
  refreshToken: string | null
): Promise<{ hits: any[]; total: number; usedToken: string }> {
  const { from: isoFrom, to: isoTo } = wibDateToUtcIsoRange(dateStr);
  const allHits: any[] = [];
  let total = 0;
  let page = 0;
  let usedToken = accessToken;
  const pageSize = GOBIZ_CONFIG.journalApi.pageSize;

  do {
    const body = buildJournalSearchBody(
      isoFrom, isoTo, [...GOBIZ_CONFIG.merchantIds],
      page * pageSize, pageSize
    );

    const result = await fetchWithAuth(
      ctx, GOBIZ_CONFIG.journalApi.url, body,
      usedToken, refreshToken, page === 0 // only retry on first page
    );

    usedToken = result.usedToken;
    const journalData = result.data;

    if (!journalData.success) {
      throw new Error(`Journals API error: ${JSON.stringify(journalData)}`);
    }

    total = journalData.total ?? 0;
    const hits = journalData.hits ?? [];
    allHits.push(...hits);

    // If we got fewer than pageSize, we've fetched everything
    if (hits.length < pageSize) break;
    page++;
  } while (allHits.length < total);

  return { hits: allHits, total, usedToken };
}

/**
 * Save journal transactions as revenue records.
 * Returns newly created revenue IDs (deduped against existing).
 */
async function saveJournalTransactions(
  ctx: ActionCtx,
  dateStr: string,
  transactions: JournalMetrics[],
  syncLogId: Id<"externalSyncLogs">,
  outletMap: Map<string, Id<"externalOutlets">>
): Promise<Array<{ revenueId: Id<"externalRevenue">; orderNumber: string }>> {
  const { from: periodStart, to: periodEnd } = wibDateToUtcRange(dateStr);
  const newRecords: Array<{ revenueId: Id<"externalRevenue">; orderNumber: string }> = [];

  for (const txn of transactions) {
    const dedupKey = buildJournalDedupKey(txn.orderNumber, txn.transactionTimeMs);

    // Resolve outlet for this transaction's merchant
    const outletId = txn.merchantId ? outletMap.get(txn.merchantId) : undefined;
    if (txn.merchantId && !outletId) {
      console.warn(
        `No registered outlet for merchant_id: ${txn.merchantId} (${getMerchantName(txn.merchantId)}), skipping revenue attribution`
      );
    }

    const results: Array<{ id: string; isNew: boolean }> = await ctx.runMutation(
      internal.externalData.mutations.saveRevenue,
      {
        records: [
          {
            source: "gobiz" as const,
            outletId: outletId ?? undefined,
            periodStart,
            periodEnd,
            dataOrigin: "api_revenue" as const,
            confidence: "exact" as const,
            revenueGross: txn.gross,
            revenueNet: txn.net,
            commission: txn.commission,
            promoBurn: txn.promoDiscount,
            gobizOrderNumber: txn.orderNumber,
            externalTransactionId: dedupKey,
            transactionDate: txn.transactionTimeMs,
            transactionCount: 1,
            syncLogId,
          },
        ],
      }
    );

    // Only track newly created records for order detail enrichment
    if (results.length > 0 && results[0].isNew) {
      newRecords.push({ revenueId: results[0].id as Id<"externalRevenue">, orderNumber: txn.orderNumber });
    }
  }

  return newRecords;
}

// ─── Phase B: Order Details ──────────────────────────────────────────────────

/**
 * Fetch order details and save items for new revenue records.
 * Rate-limited: 200ms between order API calls to avoid throttling.
 */
async function fetchAndSaveOrderDetails(
  ctx: ActionCtx,
  newRecords: Array<{ revenueId: Id<"externalRevenue">; orderNumber: string }>,
  accessToken: string,
  refreshToken: string | null
): Promise<{ itemsSaved: number; ordersFetched: number; matchResults: Record<string, number>; productNames: string[]; itemsDeducted: number; itemsSkipped: number }> {
  let itemsSaved = 0;
  let ordersFetched = 0;
  // Phase 74.5.1 Plan 06 (R9): per-sync counters accumulated across every
  // saveRevenueItemsWithCounts call. With all channelDeductionEnabled flags
  // OFF today, itemsDeducted stays 0 and itemsSkipped == itemsSaved. Flipping
  // flags in 74.5.2 populates real counters via Plan 05's dispatch hook.
  let itemsDeducted = 0;
  let itemsSkipped = 0;
  const matchResults: Record<string, number> = {
    exact: 0, price_only: 0, name_only: 0, none: 0,
  };
  const uniqueProductNames = new Set<string>();

  for (let recordIndex = 0; recordIndex < newRecords.length; recordIndex++) {
    const { revenueId, orderNumber } = newRecords[recordIndex];
    try {
      const body = buildOrderSearchBody(orderNumber);
      const { data: orderData } = await fetchWithAuth(
        ctx, GOBIZ_CONFIG.orderApi.url, body,
        accessToken, refreshToken, false // don't retry on 401 for individual orders
      );

      const items = parseOrderItems(orderData);
      ordersFetched++;

      if (items.length > 0) {
        // Auto-match each item to menu products
        const enrichedItems = [];
        for (const item of items) {
          const matchResult = await ctx.runMutation(
            internal.externalData.mutations.autoMatchMenuProduct,
            {
              productName: item.productName,
              unitPrice: item.unitPrice,
              source: "gobiz" as const,
            }
          );

          matchResults[matchResult.matchConfidence]++;

          uniqueProductNames.add(item.productName);
          enrichedItems.push({
            externalItemId: item.externalItemId,
            productName: item.productName,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            totalPrice: item.totalPrice,
            variants: item.variants,
            linkedMenuProductId: matchResult.linkedMenuProductId,
            isAutoMatched: matchResult.matchConfidence !== "none",
            matchConfidence: matchResult.matchConfidence,
          });
        }

        // Save items for this revenue record.
        // Phase 74.5.1 Plan 06: migrated to saveRevenueItemsWithCounts (Option A)
        // to read `deducted` + `skipped` counters for R9 syncLog wiring.
        // Behavior-preserving: the wrapper delegates to the same
        // saveRevenueItemsImpl as saveRevenueItems — no item-write change.
        const itemsResult: {
          ids: Id<"externalRevenueItems">[];
          inserted: number;
          deducted: number;
          skipped: number;
        } = await ctx.runMutation(
          internal.externalData.mutations.saveRevenueItemsWithCounts,
          { revenueId, items: enrichedItems }
        );
        itemsDeducted += itemsResult.deducted;
        itemsSkipped += itemsResult.skipped;

        itemsSaved += enrichedItems.length;
      }

      // Rate limit: 200ms between order API calls (skip after last record).
      // Previously used `newRecords.indexOf({revenueId, orderNumber})` which
      // always returned -1 (reference equality on a fresh object literal),
      // causing the sleep to fire every iteration. Fixed to use the loop index.
      if (recordIndex < newRecords.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (err) {
      console.log(`  Failed to fetch order ${orderNumber}:`, err instanceof Error ? err.message : String(err));
      // Continue with other orders even if one fails
    }
  }

  return {
    itemsSaved,
    ordersFetched,
    matchResults,
    productNames: Array.from(uniqueProductNames),
    itemsDeducted,
    itemsSkipped,
  };
}

// ─── Main Sync Action ────────────────────────────────────────────────────────

/**
 * Sync GoBiz (GoFood) revenue data using journal-level + order-level APIs.
 *
 * 2-phase approach:
 * Phase A: journals/search → per-transaction revenue records
 * Phase B: orders/search → item details + auto-match for new records
 *
 * On 401: attempts 3-method token refresh cascade, retries once.
 */
export const syncGoBizRevenue = action({
  args: {
    daysBack: v.optional(v.number()),
    triggeredBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const daysBack = args.daysBack ?? GOBIZ_CONFIG.sync.defaultDaysBack;

    // Resolve tokens
    const { accessToken, refreshToken } = await resolveGoBizToken(ctx);
    if (!accessToken) {
      return {
        success: false,
        error: "GoBiz API token not found. Go to Settings > GoBiz > Configure to paste your token.",
        durationMs: Date.now() - startTime,
      };
    }

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
      const dates = generateWibDateRange(daysBack);
      console.log(`GoBiz Sync: ${dates.length} days (${dates[0]} to ${dates[dates.length - 1]})`);

      // Auto-seed outlets (idempotent upsert ensures they exist)
      for (const outlet of GOBIZ_OUTLET_SEED) {
        await ctx.runMutation(internal.externalData.mutations.internalUpsertOutlet, {
          source: outlet.source,
          externalId: outlet.externalId,
          name: outlet.name,
          isActive: true,
        });
      }

      // Build outlet map: merchantId -> outletId for revenue attribution
      const outletMap = new Map<string, Id<"externalOutlets">>();
      const gobizOutlets: Array<{ _id: Id<"externalOutlets">; externalId: string }> = await ctx.runQuery(
        internal.externalData.queries.getActiveOutlets,
        { source: "gobiz" }
      );
      for (const outlet of gobizOutlets) {
        outletMap.set(outlet.externalId, outlet._id);
      }

      let totalGross = 0;
      let totalNet = 0;
      let totalCommission = 0;
      let totalTransactions = 0;
      let totalItemsSaved = 0;
      let totalOrdersFetched = 0;
      // Phase 74.5.1 Plan 06 (R9) — accumulate per-sync counters.
      let totalItemsDeducted = 0;
      let totalItemsSkipped = 0;
      let currentToken = accessToken;

      // All new records across all days (for Phase B)
      const allNewRecords: Array<{ revenueId: Id<"externalRevenue">; orderNumber: string }> = [];

      // ── Phase A: Fetch journals for each day ──
      console.log("Phase A: Fetching journals...");
      for (const dateStr of dates) {
        console.log(`  ${dateStr}...`);

        const { hits, usedToken } = await fetchDayJournals(
          ctx, dateStr, currentToken, refreshToken
        );
        currentToken = usedToken;

        const dayMetrics = aggregateJournalMetrics(hits);

        console.log(
          `    ${dayMetrics.transactionCount} txns - ` +
          `Gross: Rp ${dayMetrics.gross.toLocaleString()}, ` +
          `Net: Rp ${dayMetrics.net.toLocaleString()}, ` +
          `Commission: Rp ${dayMetrics.commission.toLocaleString()}` +
          (dayMetrics.promoDiscount > 0 ? `, Promo: Rp ${dayMetrics.promoDiscount.toLocaleString()}` : "")
        );

        // Save each transaction as a revenue record
        const newRecords = await saveJournalTransactions(
          ctx, dateStr, dayMetrics.transactions, syncLogId, outletMap
        );

        allNewRecords.push(...newRecords);
        totalGross += dayMetrics.gross;
        totalNet += dayMetrics.net;
        totalCommission += dayMetrics.commission;
        totalTransactions += dayMetrics.transactionCount;
      }

      console.log(`Phase A complete: ${totalTransactions} transactions, ${allNewRecords.length} new`);

      // ── Phase B: Fetch order details for new records ──
      if (allNewRecords.length > 0) {
        console.log(`Phase B: Fetching order details for ${allNewRecords.length} new records...`);

        const orderResults = await fetchAndSaveOrderDetails(
          ctx, allNewRecords, currentToken, refreshToken
        );

        totalItemsSaved = orderResults.itemsSaved;
        totalOrdersFetched = orderResults.ordersFetched;
        // Phase 74.5.1 Plan 06 (R9): lift counters for syncLog wiring.
        totalItemsDeducted += orderResults.itemsDeducted;
        totalItemsSkipped += orderResults.itemsSkipped;

        console.log(
          `Phase B complete: ${orderResults.ordersFetched} orders fetched, ` +
          `${orderResults.itemsSaved} items saved`
        );
        console.log(`  Match results: ${JSON.stringify(orderResults.matchResults)}`);

        // Save product mappings for mapping UI
        if (orderResults.productNames.length > 0) {
          await ctx.runMutation(internal.externalData.mutations.saveProductMappings, {
            mappings: orderResults.productNames.map(name => ({
              source: "gobiz" as const,
              externalProductCode: name,
              externalProductName: name,
            })),
          });
          console.log(`  Saved ${orderResults.productNames.length} product mappings`);
        }
      }

      // Phase 74.5.2 Plan 08: legacy Phase C (sticker dedup via
      // gofoodDepot.processSyncSales) and Phase D (finished-goods dedup via
      // the retired per-source mutation) were removed. The unified
      // `saveRevenueItems` call earlier in this sync dispatches through
      // `processChannelSaleInternal` when `channelDeductionEnabled.gobiz` is
      // ON, writing `transactionType: "channel_sale"` + `source: "gobiz"`.

      // Update sync log
      // Phase 74.5.1 Plan 06 (R9): wire itemsDeducted + itemsSkipped.
      await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
        logId: syncLogId,
        status: "success",
        productsCount: totalTransactions,
        durationMs: Date.now() - startTime,
        itemsDeducted: totalItemsDeducted,
        itemsSkipped: totalItemsSkipped,
      });

      return {
        success: true,
        syncLogId,
        daysProcessed: dates.length,
        totalGross,
        totalNet,
        totalCommission,
        totalTransactions,
        newRecords: allNewRecords.length,
        ordersFetched: totalOrdersFetched,
        itemsSaved: totalItemsSaved,
        period: {
          from: dates[0],
          to: dates[dates.length - 1],
        },
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
        logId: syncLogId,
        status: "error",
        errorMessage: errorMsg,
        durationMs: Date.now() - startTime,
      });

      return {
        success: false,
        syncLogId,
        error: errorMsg,
        durationMs: Date.now() - startTime,
      };
    }
  },
});

/**
 * Auto-sync GoBiz revenue via cron job.
 * Runs at WIB business hours (8, 10, 12, 14, 16, 18, 20 WIB).
 *
 * Checks for valid GoBiz token before running sync.
 * Logs as syncType: "cron" in externalSyncLogs.
 */
export const autoSyncGoBizRevenue = internalAction({
  args: {},
  handler: async (ctx) => {
    const startTime = Date.now();

    // Check for valid GoBiz token
    const { accessToken } = await resolveGoBizToken(ctx);

    if (!accessToken) {
      // Log as skipped — no valid token
      await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
        source: "gobiz",
        syncType: "cron",
        status: "success",
        triggeredBy: "cron",
        timestamp: startTime,
      });
      console.log("GoBiz auto-sync skipped: no valid token");
      return { success: false, reason: "no_token" };
    }

    // Run the sync (reuse existing action logic would require duplication,
    // so we create a sync log and run phases inline)
    const syncLogId: Id<"externalSyncLogs"> = await ctx.runMutation(
      internal.externalData.mutations.createSyncLog,
      {
        source: "gobiz",
        syncType: "cron",
        status: "started",
        triggeredBy: "cron",
        timestamp: startTime,
      }
    );

    try {
      const daysBack = GOBIZ_CONFIG.sync.defaultDaysBack;
      const dates = generateWibDateRange(daysBack);
      const { refreshToken } = await resolveGoBizToken(ctx);

      // Auto-seed outlets (idempotent upsert ensures they exist)
      for (const outlet of GOBIZ_OUTLET_SEED) {
        await ctx.runMutation(internal.externalData.mutations.internalUpsertOutlet, {
          source: outlet.source,
          externalId: outlet.externalId,
          name: outlet.name,
          isActive: true,
        });
      }

      // Build outlet map for revenue attribution
      const outletMap = new Map<string, Id<"externalOutlets">>();
      const gobizOutlets: Array<{ _id: Id<"externalOutlets">; externalId: string }> = await ctx.runQuery(
        internal.externalData.queries.getActiveOutlets,
        { source: "gobiz" }
      );
      for (const outlet of gobizOutlets) {
        outletMap.set(outlet.externalId, outlet._id);
      }

      let currentToken = accessToken;
      let totalTransactions = 0;
      // Phase 74.5.1 Plan 06 (R9): accumulate counters across Phase B.
      let totalItemsDeducted = 0;
      let totalItemsSkipped = 0;
      const allNewRecords: Array<{ revenueId: Id<"externalRevenue">; orderNumber: string }> = [];

      // Phase A
      for (const dateStr of dates) {
        const { hits, usedToken } = await fetchDayJournals(
          ctx, dateStr, currentToken, refreshToken
        );
        currentToken = usedToken;
        const dayMetrics = aggregateJournalMetrics(hits);
        const newRecords = await saveJournalTransactions(ctx, dateStr, dayMetrics.transactions, syncLogId, outletMap);
        allNewRecords.push(...newRecords);
        totalTransactions += dayMetrics.transactionCount;
      }

      // Phase B
      if (allNewRecords.length > 0) {
        const orderResults = await fetchAndSaveOrderDetails(ctx, allNewRecords, currentToken, refreshToken);
        totalItemsDeducted += orderResults.itemsDeducted;
        totalItemsSkipped += orderResults.itemsSkipped;

        // Save product mappings for mapping UI
        if (orderResults.productNames.length > 0) {
          await ctx.runMutation(internal.externalData.mutations.saveProductMappings, {
            mappings: orderResults.productNames.map(name => ({
              source: "gobiz" as const,
              externalProductCode: name,
              externalProductName: name,
            })),
          });
        }
      }

      // Phase 74.5.2 Plan 08: legacy auto-sync Phase C + Phase D blocks
      // removed — see manual-sync retirement comment above. Unified path:
      // saveRevenueItems → processChannelSaleInternal (dispatch gated by
      // `channelDeductionEnabled.gobiz`).

      // Phase 74.5.1 Plan 06 (R9): wire itemsDeducted + itemsSkipped.
      await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
        logId: syncLogId,
        status: "success",
        productsCount: totalTransactions,
        durationMs: Date.now() - startTime,
        itemsDeducted: totalItemsDeducted,
        itemsSkipped: totalItemsSkipped,
      });

      console.log(`GoBiz auto-sync complete: ${totalTransactions} txns, ${allNewRecords.length} new`);
      return { success: true, totalTransactions, newRecords: allNewRecords.length };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
        logId: syncLogId,
        status: "error",
        errorMessage: errorMsg,
        durationMs: Date.now() - startTime,
      });

      console.log("GoBiz auto-sync failed:", errorMsg);
      return { success: false, error: errorMsg };
    }
  },
});

// ─── Token Auto-Refresh (standalone cron action) ─────────────────────────────

/**
 * Auto-refresh GoBiz token via 3-method cascade.
 * Runs every 30 minutes via cron, independent of revenue sync schedule.
 * Ensures the token stays alive even outside WIB business hours.
 */
export const autoRefreshGoBizToken = internalAction({
  args: {},
  handler: async (ctx) => {
    const { accessToken, refreshToken } = await resolveGoBizToken(ctx);

    if (!refreshToken) {
      console.log("GoBiz token refresh skipped: no refresh token available");
      return { success: false, reason: "no_refresh_token" };
    }

    const newToken = await attemptTokenRefresh(ctx, refreshToken, accessToken);

    if (newToken) {
      console.log("GoBiz token auto-refresh successful");
      return { success: true };
    } else {
      console.log("GoBiz token auto-refresh failed (all methods exhausted)");
      return { success: false, reason: "all_methods_failed" };
    }
  },
});

// ─── Outlet Seed Mutation ────────────────────────────────────────────────────

// seedGoBizOutlets moved to convex/integrations/gobiz/mutations.ts
// (internalMutation not allowed in "use node" files)

// ─── One-Click Password Grant (AUTH-01) ──────────────────────────────────────

/**
 * Login with GoBiz credentials via password grant endpoint.
 * Reads GOBIZ_EMAIL and GOBIZ_PASSWORD env vars from Convex dashboard.
 * Saves access_token + refresh_token to platformCredentials via internal mutation.
 *
 * Returns { success: true } or { success: false, error: string }.
 */
export const loginWithCredentials = action({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate admin role
    await ctx.runQuery(internal.platformCredentials.queries.validateAdminToken, {
      token: args.token,
    });

    // ── Step 1: Try refresh_token grant (preferred — no captcha needed) ─────
    const dbCred = await ctx.runQuery(
      internal.platformCredentials.queries.getCredentialsInternal,
      { platformId: "gobiz" }
    );
    const storedRefreshToken = dbCred?.refreshToken ?? null;

    if (storedRefreshToken) {
      try {
        // Try JSON body with nested data (matching HAR pattern)
        const refreshResp = await fetch("https://api.gobiz.co.id/goid/token", {
          method: "POST",
          headers: goidAuthHeaders(),
          body: JSON.stringify({
            client_id: "go-biz-web-new",
            grant_type: "refresh_token",
            data: { refresh_token: storedRefreshToken },
          }),
        });

        if (refreshResp.ok) {
          const refreshData = await refreshResp.json() as { access_token?: string; refresh_token?: string };
          if (refreshData.access_token) {
            await ctx.runMutation(internal.platformCredentials.mutations.saveDirectToken, {
              platformId: "gobiz",
              bearerToken: `Bearer ${refreshData.access_token}`,
              refreshToken: refreshData.refresh_token ?? storedRefreshToken,
            });
            // Record successful token refresh in sync history
            await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
              source: "gobiz" as const,
              syncType: "token_refresh" as const,
              status: "success" as const,
              timestamp: Date.now(),
              triggeredBy: "system",
            });
            return { success: true as const };
          }
        }
        // Refresh token expired/invalid — fall through to password grant
      } catch {
        // Network error — fall through to password grant
      }
    }

    // ── Step 2: Two-step GoID password login ────────────────────────────────
    const email = process.env.GOBIZ_EMAIL;
    const password = process.env.GOBIZ_PASSWORD;

    if (!email || !password) {
      await ctx.runMutation(internal.platformCredentials.mutations.updateToken, {
        platformId: "gobiz",
        lastRefreshAt: Date.now(),
        lastRefreshStatus: "error",
        lastRefreshError: "No refresh_token in DB and GOBIZ_EMAIL/PASSWORD env vars not set",
      });
      await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
        source: "gobiz" as const,
        syncType: "token_refresh" as const,
        status: "error" as const,
        errorMessage: "No refresh_token in DB and GOBIZ_EMAIL/PASSWORD env vars not set",
        timestamp: Date.now(),
        triggeredBy: "system",
      });
      return {
        success: false,
        error:
          "Token refresh failed and no credentials configured. Set GOBIZ_EMAIL and GOBIZ_PASSWORD in Convex Dashboard environment variables.",
      };
    }

    try {
      const newToken = await loginViaGoID(ctx, email, password);
      if (newToken) {
        // Record successful password grant login in sync history
        await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
          source: "gobiz" as const,
          syncType: "token_refresh" as const,
          status: "success" as const,
          timestamp: Date.now(),
          triggeredBy: "system",
        });
        return { success: true as const };
      }

      await ctx.runMutation(internal.platformCredentials.mutations.updateToken, {
        platformId: "gobiz",
        lastRefreshAt: Date.now(),
        lastRefreshStatus: "error",
        lastRefreshError: "GoID 2-step password login failed",
      });
      await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
        source: "gobiz" as const,
        syncType: "token_refresh" as const,
        status: "error" as const,
        errorMessage: "GoID 2-step password login failed",
        timestamp: Date.now(),
        triggeredBy: "system",
      });
      return {
        success: false,
        error: "GoID login failed. Check that GOBIZ_EMAIL and GOBIZ_PASSWORD are correct in Convex Dashboard.",
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.externalData.mutations.createSyncLog, {
        source: "gobiz" as const,
        syncType: "token_refresh" as const,
        status: "error" as const,
        errorMessage: errMsg,
        timestamp: Date.now(),
        triggeredBy: "system",
      });
      return {
        success: false,
        error: `GoBiz login error: ${errMsg}`,
      };
    }
  },
});
