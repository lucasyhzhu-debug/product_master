"use node";

declare const process: { env: Record<string, string | undefined> };

import { v } from "convex/values";
import { action, internalAction, internalMutation } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { GOBIZ_CONFIG } from "./config";
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
import { GOBIZ_OUTLET_SEED } from "./config";

type ActionCtx = {
  runQuery: (...args: any[]) => Promise<any>;
  runMutation: (...args: any[]) => Promise<any>;
};

// ─── Token Resolution ────────────────────────────────────────────────────────

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

// ─── Token Refresh (3-method cascade) ────────────────────────────────────────

async function attemptTokenRefresh(
  ctx: ActionCtx,
  refreshToken: string,
  oldAccessToken: string | null
): Promise<string | null> {
  console.log("  Attempting GoBiz token refresh...");

  const cookies: Record<string, string> = {
    refresh_token: refreshToken,
    auth_method: "goid",
    language: "en",
  };

  if (oldAccessToken) {
    const token = oldAccessToken.startsWith("Bearer ")
      ? oldAccessToken.substring(7)
      : oldAccessToken;
    cookies.access_token = token;
  }

  const headers = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
  };

  // Method 1: Cookie refresh
  try {
    const resp = await fetch(GOBIZ_CONFIG.tokenRefresh.microAppUrl, {
      method: "GET",
      headers: {
        ...headers,
        cookie: Object.entries(cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join("; "),
      },
      redirect: "manual",
    });

    const setCookie = resp.headers.get("set-cookie") ?? "";
    const accessMatch = setCookie.match(/access_token=([^;]+)/);
    const refreshMatch = setCookie.match(/refresh_token=([^;]+)/);

    if (accessMatch) {
      const newAccessToken = `Bearer ${accessMatch[1]}`;
      const newRefreshToken = refreshMatch ? refreshMatch[1] : refreshToken;

      await ctx.runMutation(internal.platformCredentials.mutations.updateToken, {
        platformId: "gobiz",
        currentToken: newAccessToken,
        refreshToken: newRefreshToken,
        lastRefreshAt: Date.now(),
        lastRefreshStatus: "success",
      });

      console.log("  Token refresh successful (cookie method)");
      return newAccessToken;
    }
  } catch (err) {
    console.log("  Cookie refresh failed:", err instanceof Error ? err.message : String(err));
  }

  // Method 2: Token rotate
  try {
    const resp = await fetch(GOBIZ_CONFIG.tokenRefresh.rotateUrl, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "origin": GOBIZ_CONFIG.portalBaseUrl,
        "referer": `${GOBIZ_CONFIG.portalBaseUrl}/analytics/sales-gofood`,
        cookie: Object.entries(cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join("; "),
      },
    });

    const setCookie = resp.headers.get("set-cookie") ?? "";
    const accessMatch = setCookie.match(/access_token=([^;]+)/);

    if (accessMatch) {
      const newAccessToken = `Bearer ${accessMatch[1]}`;

      await ctx.runMutation(internal.platformCredentials.mutations.updateToken, {
        platformId: "gobiz",
        currentToken: newAccessToken,
        lastRefreshAt: Date.now(),
        lastRefreshStatus: "success",
      });

      console.log("  Token refresh successful (rotate method)");
      return newAccessToken;
    }
  } catch (err) {
    console.log("  Token rotate failed:", err instanceof Error ? err.message : String(err));
  }

  // Method 3: API refresh
  try {
    const resp = await fetch(GOBIZ_CONFIG.tokenRefresh.apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": GOBIZ_CONFIG.portalBaseUrl,
        "user-agent": headers["user-agent"],
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.access_token) {
        const newAccessToken = `Bearer ${data.access_token}`;
        const newRefreshToken = data.refresh_token ?? refreshToken;

        await ctx.runMutation(internal.platformCredentials.mutations.updateToken, {
          platformId: "gobiz",
          currentToken: newAccessToken,
          refreshToken: newRefreshToken,
          lastRefreshAt: Date.now(),
          lastRefreshStatus: "success",
        });

        console.log("  Token refresh successful (API method)");
        return newAccessToken;
      }
    }
  } catch (err) {
    console.log("  API refresh failed:", err instanceof Error ? err.message : String(err));
  }

  // All methods failed
  console.log("  All token refresh methods failed");
  await ctx.runMutation(internal.platformCredentials.mutations.updateToken, {
    platformId: "gobiz",
    lastRefreshAt: Date.now(),
    lastRefreshStatus: "error",
    lastRefreshError: "All refresh methods failed (cookie, rotate, API)",
  });

  return null;
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

    const ids: Id<"externalRevenue">[] = await ctx.runMutation(
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
            gobizOrderNumber: txn.orderNumber,
            externalTransactionId: dedupKey,
            transactionDate: txn.transactionTimeMs,
            transactionCount: 1,
            syncLogId,
          },
        ],
      }
    );

    // If saveRevenue returned an id, it was newly created (not deduped)
    if (ids && ids.length > 0) {
      newRecords.push({ revenueId: ids[0], orderNumber: txn.orderNumber });
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
): Promise<{ itemsSaved: number; ordersFetched: number; matchResults: Record<string, number> }> {
  let itemsSaved = 0;
  let ordersFetched = 0;
  const matchResults: Record<string, number> = {
    exact: 0, price_only: 0, name_only: 0, none: 0,
  };

  for (const { revenueId, orderNumber } of newRecords) {
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

        // Save items for this revenue record
        await ctx.runMutation(internal.externalData.mutations.saveRevenueItems, {
          revenueId,
          items: enrichedItems,
        });

        itemsSaved += enrichedItems.length;
      }

      // Rate limit: 200ms between order API calls
      if (newRecords.indexOf({ revenueId, orderNumber }) < newRecords.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (err) {
      console.log(`  Failed to fetch order ${orderNumber}:`, err instanceof Error ? err.message : String(err));
      // Continue with other orders even if one fails
    }
  }

  return { itemsSaved, ordersFetched, matchResults };
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
          `Commission: Rp ${dayMetrics.commission.toLocaleString()}`
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

        console.log(
          `Phase B complete: ${orderResults.ordersFetched} orders fetched, ` +
          `${orderResults.itemsSaved} items saved`
        );
        console.log(`  Match results: ${JSON.stringify(orderResults.matchResults)}`);
      }

      // ── Phase C: Auto-consume stickers for GoFood sales ──
      try {
        // Collect all NEW revenue items with linkedMenuProductId from gobiz
        const gofoodSaleItems: Array<{ menuProductId: string; quantity: number }> = [];

        for (const { revenueId } of allNewRecords) {
          const items: Array<{
            linkedMenuProductId?: string;
            quantity: number;
            source: string;
          }> = await ctx.runQuery(
            api.externalData.queries.getRevenueItems,
            { revenueId }
          );

          for (const item of items) {
            if (item.linkedMenuProductId && item.source === "gobiz") {
              gofoodSaleItems.push({
                menuProductId: item.linkedMenuProductId,
                quantity: item.quantity,
              });
            }
          }
        }

        if (gofoodSaleItems.length > 0) {
          console.log(`Phase C: Processing ${gofoodSaleItems.length} GoFood sale items for sticker deduction...`);

          // Aggregate by menuProductId
          const aggregated = new Map<string, number>();
          for (const item of gofoodSaleItems) {
            aggregated.set(
              item.menuProductId,
              (aggregated.get(item.menuProductId) ?? 0) + item.quantity
            );
          }

          const batchItems = Array.from(aggregated.entries()).map(
            ([menuProductId, quantity]) => ({ menuProductId, quantity })
          );

          const phaseC = await ctx.runMutation(
            internal.gofoodDepot.mutations.processSyncSales,
            { items: batchItems as any }
          );

          console.log(
            `Phase C complete: ${phaseC.processed} products processed, ${phaseC.deficits} deficits`
          );
        }
      } catch (phaseCError) {
        // Phase C failure should NOT fail the overall sync
        console.log(
          "Phase C (sticker deduction) failed:",
          phaseCError instanceof Error ? phaseCError.message : String(phaseCError)
        );
      }

      // Update sync log
      await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
        logId: syncLogId,
        status: "success",
        productsCount: totalTransactions,
        durationMs: Date.now() - startTime,
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
        await fetchAndSaveOrderDetails(ctx, allNewRecords, currentToken, refreshToken);
      }

      // Phase C: Auto-consume stickers for GoFood sales
      try {
        const gofoodSaleItems: Array<{ menuProductId: string; quantity: number }> = [];

        for (const { revenueId } of allNewRecords) {
          const items: Array<{
            linkedMenuProductId?: string;
            quantity: number;
            source: string;
          }> = await ctx.runQuery(
            api.externalData.queries.getRevenueItems,
            { revenueId }
          );

          for (const item of items) {
            if (item.linkedMenuProductId && item.source === "gobiz") {
              gofoodSaleItems.push({
                menuProductId: item.linkedMenuProductId,
                quantity: item.quantity,
              });
            }
          }
        }

        if (gofoodSaleItems.length > 0) {
          const aggregated = new Map<string, number>();
          for (const item of gofoodSaleItems) {
            aggregated.set(
              item.menuProductId,
              (aggregated.get(item.menuProductId) ?? 0) + item.quantity
            );
          }

          const batchItems = Array.from(aggregated.entries()).map(
            ([menuProductId, quantity]) => ({ menuProductId, quantity })
          );

          await ctx.runMutation(
            internal.gofoodDepot.mutations.processSyncSales,
            { items: batchItems as any }
          );
        }
      } catch (phaseCError) {
        console.log(
          "Auto-sync Phase C failed:",
          phaseCError instanceof Error ? phaseCError.message : String(phaseCError)
        );
      }

      await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
        logId: syncLogId,
        status: "success",
        productsCount: totalTransactions,
        durationMs: Date.now() - startTime,
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

/**
 * Seed GoBiz outlets (Crystal + Goldfinch) into externalOutlets table.
 * Idempotent: only creates outlets that don't already exist.
 *
 * Run from Convex dashboard Functions tab during initial setup:
 *   integrations.gobiz.adapter.seedGoBizOutlets
 */
export const seedGoBizOutlets = internalMutation({
  args: {},
  handler: async (ctx) => {
    const created: string[] = [];
    const skipped: string[] = [];

    for (const outlet of GOBIZ_OUTLET_SEED) {
      // Check if outlet already exists by source + externalId
      const existing = await ctx.db
        .query("externalOutlets")
        .withIndex("by_source_external_id", (q) =>
          q.eq("source", outlet.source).eq("externalId", outlet.externalId)
        )
        .first();

      if (existing) {
        skipped.push(`${outlet.name} (${outlet.externalId})`);
        continue;
      }

      await ctx.db.insert("externalOutlets", {
        source: outlet.source,
        externalId: outlet.externalId,
        name: outlet.name,
        isActive: true,
      });

      created.push(`${outlet.name} (${outlet.externalId})`);
    }

    console.log(`seedGoBizOutlets: created ${created.length}, skipped ${skipped.length}`);
    return { created, skipped };
  },
});
