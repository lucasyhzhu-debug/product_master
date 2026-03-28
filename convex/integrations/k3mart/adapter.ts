"use node";

declare const process: { env: Record<string, string | undefined> };

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  K3MART_CONFIG,
  K3MART_OUTLET_NAME_TO_ID,
  type K3MartProductDetailResponse,
  type K3MartSalesResponse,
  type K3MartDashboardResponse,
  type K3MartStockFlowAddPayload,
  type K3MartStockFlowAddResponse,
  type K3MartStockFlowListResponse,
  type K3MartCancelResponse,
  type K3MartOutletProfileResponse,
} from "./config";
import {
  parseK3MartDate,
  formatDate,
  buildDedupKey,
  resolveOutletExternalId,
  transformProductDetailEntry,
} from "./helpers";
import { getWeekNumber } from "../../k3martCockpit/helpers";

function generateBatchId(): string {
  return `k3mart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Retrieve K3 Mart API token from DB or environment.
 * Checks platform credentials first, falls back to env variable.
 * @throws Error if no token is available
 */
async function getK3MartToken(ctx: {
  runQuery: (...args: any[]) => any;
}): Promise<string> {
  const dbCred = await ctx.runQuery(
    internal.platformCredentials.queries.getTokenInternal,
    { platformId: "k3mart" }
  );
  const token = dbCred?.currentToken ?? process.env.K3MART_API_TOKEN;
  if (!token) {
    throw new Error(
      "K3MART_API_TOKEN not set. Configure credentials in Settings or set the environment variable."
    );
  }
  return token;
}

/**
 * Fetch product detail for a single product ID.
 * Returns all outlets carrying this product in one call.
 */
async function fetchProductDetail(
  productId: number,
  token: string
): Promise<K3MartProductDetailResponse | null> {
  const url = `${K3MART_CONFIG.baseUrl}${K3MART_CONFIG.endpoints.productDetail}/${productId}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `JWT ${token}`,
      ...K3MART_CONFIG.headers,
    },
  });

  if (response.status === 401) {
    throw new Error("TOKEN_EXPIRED: K3Mart API token expired");
  }

  if (!response.ok) {
    console.warn(`[fetchProductDetail] Product ${productId}: HTTP ${response.status}`);
    return null;
  }

  return (await response.json()) as K3MartProductDetailResponse;
}

/**
 * Discover K3 Mart outlets by fetching product detail for each configured product.
 * Each call returns ALL outlets for that product, so we discover outlets automatically.
 * With N product IDs, this makes exactly N API calls.
 */
export const discoverK3MartOutlets = action({
  args: {
    triggeredBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const token = await getK3MartToken(ctx);

    const startTime = Date.now();
    const batchId = generateBatchId();
    const productIds = K3MART_CONFIG.products.ids;

    const syncLogId: Id<"externalSyncLogs"> = await ctx.runMutation(
      internal.externalData.mutations.createSyncLog,
      {
        source: "k3mart",
        snapshotBatchId: batchId,
        syncType: "manual",
        status: "started",
        triggeredBy: args.triggeredBy ?? "manual",
        timestamp: startTime,
      }
    );

    const errors: string[] = [];
    const discoveredOutlets = new Set<string>();
    let totalStockUnits = 0;

    // Group all entries by outlet name across all products
    const outletProductsMap = new Map<string, Array<{
      externalProductId: string;
      externalProductCode: string;
      productName: string;
      quantity: number;
      price: number;
      capital: number;
    }>>();

    for (const productId of productIds) {
      try {
        console.log(`[discoverK3MartOutlets] Fetching product detail for ID ${productId}...`);
        const result = await fetchProductDetail(productId, token);
        if (!result?.data || result.data.length === 0) {
          console.log(`[discoverK3MartOutlets] Product ${productId}: no data`);
          continue;
        }

        console.log(`[discoverK3MartOutlets] Product ${productId}: ${result.data.length} outlet entries`);

        for (const entry of result.data) {
          const transformed = transformProductDetailEntry(entry, productId);
          totalStockUnits += transformed.quantity;
          discoveredOutlets.add(entry.outlet_name);

          const existing = outletProductsMap.get(entry.outlet_name) ?? [];
          existing.push(transformed);
          outletProductsMap.set(entry.outlet_name, existing);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Product ${productId}: ${errorMsg}`);
        if (errorMsg.includes("TOKEN_EXPIRED")) break;
      }
    }

    // Upsert outlets and save snapshots
    for (const [outletName, products] of outletProductsMap) {
      try {
        const externalId = resolveOutletExternalId(outletName, K3MART_OUTLET_NAME_TO_ID);

        const outletDocId: Id<"externalOutlets"> = await ctx.runMutation(
          internal.externalData.mutations.internalUpsertOutlet,
          {
            source: "k3mart",
            externalId,
            name: outletName,
            isActive: true,
          }
        );

        const snapshotAt = Date.now();
        for (let j = 0; j < products.length; j += 200) {
          const batch = products.slice(j, j + 200);
          await ctx.runMutation(
            internal.externalData.mutations.saveSnapshots,
            {
              outletId: outletDocId,
              snapshotBatchId: batchId,
              snapshotAt,
              products: batch.map((p) => ({
                externalProductId: p.externalProductId,
                externalProductCode: p.externalProductCode,
                productName: p.productName,
                quantity: p.quantity,
                price: p.price,
                capital: p.capital,
              })),
            }
          );
        }

        // Save product mappings
        await ctx.runMutation(
          internal.externalData.mutations.saveProductMappings,
          {
            mappings: products.map((p) => ({
              source: "k3mart" as const,
              externalProductCode: p.externalProductCode,
              externalProductName: p.productName,
            })),
          }
        );

        await ctx.runMutation(
          internal.externalData.mutations.updateOutletSyncStatus,
          {
            outletId: outletDocId,
            lastSyncAt: snapshotAt,
            lastSyncStatus: "success",
          }
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Outlet ${outletName}: ${errorMsg}`);
      }
    }

    const finalStatus = errors.some((e) => e.includes("TOKEN_EXPIRED"))
      ? "error"
      : "success";

    await ctx.runMutation(
      internal.externalData.mutations.updateSyncLog,
      {
        logId: syncLogId,
        status: finalStatus as "success" | "error",
        productsCount: totalStockUnits,
        errorMessage: errors.length > 0 ? errors.join("; ") : undefined,
        durationMs: Date.now() - startTime,
      }
    );

    return {
      success: !errors.some((e) => e.includes("TOKEN_EXPIRED")),
      syncLogId,
      outletsScanned: productIds.length,
      outletsFound: discoveredOutlets.size,
      totalStockUnits,
      errors,
      durationMs: Date.now() - startTime,
    };
  },
});

/**
 * Fast stock refresh for known active K3 Mart outlets.
 * Fetches product detail for each configured product ID (returns all outlets per call).
 * With N product IDs, makes exactly N API calls regardless of outlet count.
 */
export const syncK3MartStock = action({
  args: {
    triggeredBy: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    syncLogId: Id<"externalSyncLogs">;
    outletsPolled: number;
    totalStockUnits: number;
    errors: string[];
    durationMs: number;
  }> => {
    console.log("[syncK3MartStock] Starting product-detail stock refresh...");

    const token = await getK3MartToken(ctx);

    const startTime = Date.now();
    const batchId = generateBatchId();
    const productIds = K3MART_CONFIG.products.ids;

    const syncLogId: Id<"externalSyncLogs"> = await ctx.runMutation(
      internal.externalData.mutations.createSyncLog,
      {
        source: "k3mart",
        snapshotBatchId: batchId,
        syncType: "manual",
        status: "started",
        triggeredBy: args.triggeredBy ?? "manual",
        timestamp: startTime,
      }
    );

    // Load active outlets from DB, build name -> outletDoc map
    const activeOutlets: Doc<"externalOutlets">[] = await ctx.runQuery(
      internal.externalData.queries.getActiveOutlets,
      { source: "k3mart" }
    );
    console.log(`[syncK3MartStock] Found ${activeOutlets.length} active outlets:`,
      activeOutlets.map((o) => `${o.name} (ext:${o.externalId})`).join(", "));

    if (activeOutlets.length === 0) {
      console.log("[syncK3MartStock] No active outlets found, exiting.");
      await ctx.runMutation(
        internal.externalData.mutations.updateSyncLog,
        {
          logId: syncLogId,
          status: "success",
          productsCount: 0,
          durationMs: Date.now() - startTime,
        }
      );
      return {
        success: true,
        syncLogId,
        outletsPolled: 0,
        totalStockUnits: 0,
        errors: [] as string[],
        durationMs: Date.now() - startTime,
      };
    }

    // Build name -> outlet doc map for matching
    const outletByName = new Map(activeOutlets.map((o) => [o.name, o]));

    let totalStockUnits = 0;
    const errors: string[] = [];
    const outletsWithData = new Set<string>();

    // Group products by outlet across all product detail calls
    const outletProductsMap = new Map<string, Array<{
      externalProductId: string;
      externalProductCode: string;
      productName: string;
      quantity: number;
      price: number;
      capital: number;
    }>>();

    for (const productId of productIds) {
      try {
        console.log(`[syncK3MartStock] Fetching product detail for ID ${productId}...`);
        const result = await fetchProductDetail(productId, token);
        if (!result?.data || result.data.length === 0) {
          console.log(`[syncK3MartStock] Product ${productId}: no data`);
          continue;
        }

        console.log(`[syncK3MartStock] Product ${productId}: ${result.data.length} outlet entries`);

        for (const entry of result.data) {
          // Only process entries for known active outlets
          const outlet = outletByName.get(entry.outlet_name);
          if (!outlet) {
            console.log(`[syncK3MartStock] Skipping unknown outlet: ${entry.outlet_name}`);
            continue;
          }

          const transformed = transformProductDetailEntry(entry, productId);
          totalStockUnits += transformed.quantity;
          outletsWithData.add(entry.outlet_name);

          const existing = outletProductsMap.get(entry.outlet_name) ?? [];
          existing.push(transformed);
          outletProductsMap.set(entry.outlet_name, existing);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[syncK3MartStock] Product ${productId} ERROR:`, errorMsg);
        errors.push(`Product ${productId}: ${errorMsg}`);
        if (errorMsg.includes("TOKEN_EXPIRED")) break;
      }
    }

    // Save snapshots per outlet
    for (const [outletName, products] of outletProductsMap) {
      const outlet = outletByName.get(outletName);
      if (!outlet) continue;

      try {
        const snapshotAt = Date.now();
        for (let j = 0; j < products.length; j += 200) {
          const batch = products.slice(j, j + 200);
          await ctx.runMutation(
            internal.externalData.mutations.saveSnapshots,
            {
              outletId: outlet._id,
              snapshotBatchId: batchId,
              snapshotAt,
              products: batch.map((p) => ({
                externalProductId: p.externalProductId,
                externalProductCode: p.externalProductCode,
                productName: p.productName,
                quantity: p.quantity,
                price: p.price,
                capital: p.capital,
              })),
            }
          );
        }

        await ctx.runMutation(
          internal.externalData.mutations.updateOutletSyncStatus,
          {
            outletId: outlet._id,
            lastSyncAt: snapshotAt,
            lastSyncStatus: "success",
          }
        );
        console.log(`[syncK3MartStock] Outlet ${outletName}: ${products.length} products saved`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[syncK3MartStock] Outlet ${outletName} ERROR:`, errorMsg);
        errors.push(`Outlet ${outletName}: ${errorMsg}`);
      }
    }

    const finalStatus = errors.some((e) => e.includes("TOKEN_EXPIRED"))
      ? "error"
      : "success";

    await ctx.runMutation(
      internal.externalData.mutations.updateSyncLog,
      {
        logId: syncLogId,
        status: finalStatus as "success" | "error",
        productsCount: totalStockUnits,
        errorMessage: errors.length > 0 ? errors.join("; ") : undefined,
        durationMs: Date.now() - startTime,
      }
    );

    console.log(`[syncK3MartStock] Done: ${productIds.length} API calls, ${outletsWithData.size} outlets updated, ${totalStockUnits} stock units, ${errors.length} errors, ${Date.now() - startTime}ms`);

    return {
      success: !errors.some((e) => e.includes("TOKEN_EXPIRED")),
      syncLogId,
      outletsPolled: outletsWithData.size,
      totalStockUnits,
      errors,
      durationMs: Date.now() - startTime,
    };
  },
});

/**
 * Sync K3 Mart sales transactions.
 *
 * Flow:
 * 1. Determine date range (incremental from last successful sync)
 * 2. Single API call to /vendor-sales/get-all
 * 3. Parse transactions and store with dedup keys
 * 4. Returns exact revenue data (confidence: "exact")
 */
export const syncK3MartSales = action({
  args: {
    triggeredBy: v.optional(v.string()),
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const token = await getK3MartToken(ctx);

    const startTime = Date.now();

    // Create initial sync log
    const syncLogId: Id<"externalSyncLogs"> = await ctx.runMutation(
      internal.externalData.mutations.createSyncLog,
      {
        source: "k3mart",
        syncType: "manual",
        status: "started",
        triggeredBy: args.triggeredBy ?? "manual",
        timestamp: startTime,
      }
    );

    try {
      // Determine date range (incremental)
      let fromDate: string;
      if (args.fromDate) {
        fromDate = args.fromDate;
      } else {
        const lastTimestamp: number | null = await ctx.runQuery(
          internal.externalData.queries.getLatestSyncTimestamp,
          { source: "k3mart" }
        );
        if (lastTimestamp) {
          // Overlap by configured days to catch late-arriving transactions
          const overlapMs = K3MART_CONFIG.sales.overlapDays * 24 * 60 * 60 * 1000;
          fromDate = formatDate(lastTimestamp - overlapMs);
        } else {
          fromDate = K3MART_CONFIG.sales.defaultStartDate;
        }
      }

      // toDate defaults to tomorrow
      const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
      const toDate = args.toDate ?? formatDate(tomorrow);

      // Single fetch to sales API
      const url = new URL(
        `${K3MART_CONFIG.baseUrl}${K3MART_CONFIG.endpoints.sales}`
      );
      url.searchParams.set("from", fromDate);
      url.searchParams.set("to", toDate);

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `JWT ${token}`,
          ...K3MART_CONFIG.headers,
        },
      });

      if (response.status === 401) {
        await ctx.runMutation(
          internal.externalData.mutations.updateSyncLog,
          {
            logId: syncLogId,
            status: "error",
            errorMessage: "TOKEN_EXPIRED: K3Mart API token expired. Please update K3MART_API_TOKEN.",
            durationMs: Date.now() - startTime,
          }
        );
        return {
          success: false,
          error: "TOKEN_EXPIRED",
          syncLogId,
          durationMs: Date.now() - startTime,
        };
      }

      if (!response.ok) {
        throw new Error(`K3Mart sales API error: ${response.status} ${response.statusText}`);
      }

      const json = (await response.json()) as K3MartSalesResponse;

      if (!json.success || !json.data) {
        throw new Error("K3Mart sales API returned unsuccessful response");
      }

      const transactions = json.data;
      let totalUnits = 0;
      let grossSales = 0;
      let totalCommission = 0;
      let netProfit = 0;
      let newTransactions = 0;
      let skippedDuplicates = 0;

      // Look up outlet name -> doc ID mapping (graceful: empty map if no outlets exist yet)
      const outletNameMap = await ctx.runQuery(
        internal.externalData.queries.getOutletNameToIdMap,
        { source: "k3mart" }
      ) as Record<string, string>;

      // Process transactions in batches of 100
      for (let i = 0; i < transactions.length; i += 100) {
        const batch = transactions.slice(i, i + 100);
        const records = batch.map((txn) => {
          const txnDate = parseK3MartDate(txn.transDate);
          const dedupKey = buildDedupKey(txn.transDate, txn.outletName, txn.productCode, txn.qty, txn.total);

          totalUnits += txn.qty;
          grossSales += txn.total;
          totalCommission += txn.commission;
          netProfit += txn.profit;

          // Link to outlet doc if mapping exists
          const outletDocId = outletNameMap[txn.outletName];

          return {
            outletId: outletDocId ? (outletDocId as Id<"externalOutlets">) : undefined,
            source: "k3mart" as const,
            externalProductCode: txn.productCode,
            productName: txn.productName,
            quantitySold: txn.qty,
            revenueGross: txn.total,
            revenueNet: txn.profit,
            commission: txn.commission,
            periodStart: txnDate,
            periodEnd: txnDate,
            transactionDate: txnDate,
            transactionType: (txn.type === "return" ? "return" : "sales") as "sales" | "return",
            externalTransactionId: dedupKey,
            dataOrigin: "api_revenue" as const,
            confidence: "exact" as const,
            transactionCount: 1,
            syncLogId,
          };
        });

        const insertedIds = await ctx.runMutation(
          internal.externalData.mutations.saveRevenue,
          { records }
        );

        newTransactions += insertedIds.length;
        skippedDuplicates += batch.length - insertedIds.length;
      }

      // Update sync log with success
      await ctx.runMutation(
        internal.externalData.mutations.updateSyncLog,
        {
          logId: syncLogId,
          status: "success",
          productsCount: transactions.length,
          durationMs: Date.now() - startTime,
        }
      );

      return {
        success: true,
        syncLogId,
        fromDate,
        toDate,
        totalTransactions: transactions.length,
        newTransactions,
        skippedDuplicates,
        totalUnits,
        grossSales,
        totalCommission,
        netProfit,
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
        error: errorMsg,
        syncLogId,
        durationMs: Date.now() - startTime,
      };
    }
  },
});

/**
 * Fetch outlet dashboard with current stock & prices.
 * Returns products available at the specified outlet.
 */
export const fetchOutletDashboard = action({
  args: { outletId: v.number() },
  handler: async (ctx, args) => {
    const token = await getK3MartToken(ctx);
    const url = `${K3MART_CONFIG.baseUrl}${K3MART_CONFIG.endpoints.dashboard}?outletId=${args.outletId}`;
    const response = await fetch(url, {
      headers: { Authorization: `JWT ${token}`, ...K3MART_CONFIG.headers },
    });
    if (response.status === 401) throw new Error("TOKEN_EXPIRED");
    if (!response.ok) throw new Error(`Dashboard fetch failed: HTTP ${response.status}`);
    const data = (await response.json()) as K3MartDashboardResponse;
    return data.data; // Array of products with stock & price
  },
});

/**
 * Submit a stock-in or stock-out to a single outlet.
 * Fetches fresh dashboard first, then submits.
 */
export const submitStockFlow = action({
  args: {
    outletExternalId: v.number(), // Numeric outlet ID for K3 API
    outletId: v.id("externalOutlets"), // Convex outlet ID
    requestType: v.number(), // 1=stock-in, 0=stock-out
    items: v.array(v.object({
      productId: v.number(),
      productCode: v.string(),
      productName: v.string(),
      qty: v.number(),
      price: v.number(),
    })),
    note: v.optional(v.string()),
    source: v.optional(v.string()), // "kitchen"|"goldfinch"|"outlet"
    submittedBy: v.string(),
    dashboardCache: v.optional(v.any()), // Pre-fetched dashboard data to avoid double API call
  },
  handler: async (ctx, args) => {
    const token = await getK3MartToken(ctx);

    // 1. Get fresh dashboard (or use cache)
    let dashboardProducts = args.dashboardCache;
    if (!dashboardProducts) {
      const dashUrl = `${K3MART_CONFIG.baseUrl}${K3MART_CONFIG.endpoints.dashboard}?outletId=${args.outletExternalId}`;
      const dashResp = await fetch(dashUrl, {
        headers: { Authorization: `JWT ${token}`, ...K3MART_CONFIG.headers },
      });
      if (dashResp.status === 401) throw new Error("TOKEN_EXPIRED");
      if (!dashResp.ok) throw new Error(`Dashboard failed: HTTP ${dashResp.status}`);
      const dashData = (await dashResp.json()) as K3MartDashboardResponse;
      dashboardProducts = dashData.data;
    }

    // 2. Build payload with fresh currentStock/currentPrice
    const detail = args.items.map(item => {
      const dashItem = Array.isArray(dashboardProducts)
        ? dashboardProducts.find((d: any) => d.productId === item.productId)
        : undefined;
      const price = item.price > 0 ? item.price : (dashItem?.price ?? 0);
      return {
        productId: item.productId,
        productName: item.productName,
        productCode: item.productCode,
        qty: item.qty,
        price,
        currentStock: dashItem?.quantity ?? 0,
        currentPrice: price,
        edit: false,
      };
    });

    const payload: K3MartStockFlowAddPayload = {
      outletId: args.outletExternalId,
      header: { requestType: args.requestType, note: args.note },
      detail,
    };

    // 3. Submit to K3 Mart API with 1 retry on 5xx
    let lastError: string = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const url = `${K3MART_CONFIG.baseUrl}${K3MART_CONFIG.endpoints.stockFlowAdd}`;
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `JWT ${token}`,
            "Content-Type": "application/json",
            ...K3MART_CONFIG.headers,
          },
          body: JSON.stringify(payload),
        });

        if (resp.status === 401) throw new Error("TOKEN_EXPIRED");

        if (resp.status >= 500 && attempt < 2) {
          lastError = `HTTP ${resp.status}`;
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        if (!resp.ok) throw new Error(`Stock flow submit failed: HTTP ${resp.status}`);

        const result = (await resp.json()) as K3MartStockFlowAddResponse;

        if (!result.success) throw new Error("K3 Mart API returned success:false");

        // 4. Record the movement in our DB
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
        for (const item of args.items) {
          const dashItem = Array.isArray(dashboardProducts)
            ? dashboardProducts.find((d: any) => d.productId === item.productId)
            : undefined;

          // Find menuProductId from externalProductMappings
          const mappings: any[] = await (ctx as any).runQuery(
            (internal as any).externalData.queries.getProductMappings,
            { source: "k3mart" }
          );
          const mapping = mappings.find((m: any) => m.externalProductCode === item.productCode);

          if (mapping?.menuProductId) {
            await ctx.runMutation(internal.k3martCockpit.mutations.recordStockMovement, {
              date: today,
              outletId: args.outletId,
              direction: args.requestType === 1 ? "stock_in" : "stock_out",
              menuProductId: mapping.menuProductId,
              externalProductId: String(item.productId),
              quantity: item.qty,
              priceAtSubmission: item.price > 0 ? item.price : (dashItem?.price ?? 0),
              currentStockAtSubmission: dashItem?.quantity ?? 0,
              source: args.source as any,
              k3martStatus: "pending",
              note: args.note,
              submittedBy: args.submittedBy,
            });
          }
        }

        return { success: true, attempt, dashboardProducts };
      } catch (err) {
        if (err instanceof Error && err.message === "TOKEN_EXPIRED") throw err;
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }

    throw new Error(`Stock flow submit failed after 2 attempts: ${lastError}`);
  },
});

/**
 * Sequential per-outlet bulk submission with concurrent guard.
 * Submits all confirmed dispatch plans for a given date.
 */
export const submitBulkStockIns = action({
  args: {
    date: v.string(), // YYYY-MM-DD
    submittedBy: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string; results: Array<{ outletId: string; success: boolean; error?: string }> }> => {
    // 1. Get confirmed plans for this date
    // Note: queries module uses public query(); cast needed for action access
    const weekNumber = getWeekNumber(args.date);
    const allPlans: any = await (ctx as any).runQuery(
      (internal as any).k3martCockpit.queries.getWeeklyDispatchPlans,
      { weekNumber }
    );

    const plans: any[] = allPlans.plans.filter(
      (p: any) => p.date === args.date && p.status === "confirmed"
    );

    if (!plans || plans.length === 0) {
      return { success: false, error: "No confirmed plans for this date", results: [] };
    }

    // 2. Group by outlet
    const outletPlans = new Map<string, any[]>();
    for (const plan of plans) {
      const key = plan.outletId;
      if (!outletPlans.has(key)) outletPlans.set(key, []);
      outletPlans.get(key)!.push(plan);
    }

    // 3. Submit sequentially per outlet
    const token = await getK3MartToken(ctx);
    const results: Array<{ outletId: string; success: boolean; error?: string }> = [];

    // Cache dashboard per outlet to avoid duplicate calls for 2 products
    const dashboardCache = new Map<number, any>();

    for (const [outletId, outletPlanList] of outletPlans) {
      try {
        // Get outlet external ID (getActiveOutlets is an internalQuery)
        const outlets = await ctx.runQuery(internal.externalData.queries.getActiveOutlets, {
          source: "k3mart" as const,
        });
        const outlet = outlets.find((o: any) => o._id === outletId);

        if (!outlet) {
          results.push({ outletId, success: false, error: "Outlet not found" });
          continue;
        }

        const outletExternalId = parseInt(outlet.externalId);

        // Fetch dashboard once per outlet
        if (!dashboardCache.has(outletExternalId)) {
          const dashUrl = `${K3MART_CONFIG.baseUrl}${K3MART_CONFIG.endpoints.dashboard}?outletId=${outletExternalId}`;
          const dashResp = await fetch(dashUrl, {
            headers: { Authorization: `JWT ${token}`, ...K3MART_CONFIG.headers },
          });
          if (dashResp.status === 401) throw new Error("TOKEN_EXPIRED");
          if (dashResp.ok) {
            const dashData = (await dashResp.json()) as K3MartDashboardResponse;
            dashboardCache.set(outletExternalId, dashData.data);
          }
        }

        // Build items for this outlet (only stock-in, skip 0-qty)
        const stockInPlans = outletPlanList.filter((p: any) => !p.isStockOut && p.plannedQty > 0);
        if (stockInPlans.length === 0) {
          results.push({ outletId, success: true });
          continue;
        }

        const items = stockInPlans.map((p: any) => ({
          productId: parseInt(p.externalProductId),
          productCode: K3MART_CONFIG.productMap[parseInt(p.externalProductId) as keyof typeof K3MART_CONFIG.productMap]?.code ?? p.externalProductId,
          productName: K3MART_CONFIG.productMap[parseInt(p.externalProductId) as keyof typeof K3MART_CONFIG.productMap]?.name ?? "Unknown",
          qty: p.plannedQty,
        }));

        // Submit via API call (inline to reuse token)
        const dashProducts = dashboardCache.get(outletExternalId);
        const detail = items.map((item: { productId: number; productCode: string; productName: string; qty: number }) => {
          const dashItem = dashProducts?.find((d: any) => d.productId === item.productId);
          const configPrice = K3MART_CONFIG.productMap[item.productId as keyof typeof K3MART_CONFIG.productMap]?.price ?? 0;
          const price = dashItem?.price && dashItem.price > 0 ? dashItem.price : configPrice;
          return {
            productId: item.productId,
            productName: item.productName,
            productCode: item.productCode,
            qty: item.qty,
            price,
            currentStock: dashItem?.quantity ?? 0,
            currentPrice: price,
            edit: false,
          };
        });

        const payload = {
          outletId: outletExternalId,
          header: { requestType: 1, note: `Bulk dispatch ${args.date}` },
          detail,
        };

        let submitSuccess = false;
        for (let attempt = 1; attempt <= 2; attempt++) {
          const url = `${K3MART_CONFIG.baseUrl}${K3MART_CONFIG.endpoints.stockFlowAdd}`;
          const resp = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: `JWT ${token}`,
              "Content-Type": "application/json",
              ...K3MART_CONFIG.headers,
            },
            body: JSON.stringify(payload),
          });

          if (resp.status === 401) throw new Error("TOKEN_EXPIRED");
          if (resp.status >= 500 && attempt < 2) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          if (resp.ok) {
            submitSuccess = true;
            break;
          }
        }

        if (submitSuccess) {
          // Update plan statuses
          for (const plan of stockInPlans) {
            await ctx.runMutation(internal.k3martCockpit.mutations.updateDispatchPlanStatus, {
              planId: plan._id,
              status: "submitted",
              submittedAt: Date.now(),
              submittedBy: args.submittedBy,
            });
          }
          results.push({ outletId, success: true });
        } else {
          results.push({ outletId, success: false, error: "API submission failed" });
        }
      } catch (err) {
        if (err instanceof Error && err.message === "TOKEN_EXPIRED") {
          results.push({ outletId, success: false, error: "Token expired" });
          break; // Stop remaining outlets on token expiry
        }
        results.push({
          outletId,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      success: results.every(r => r.success),
      results,
    };
  },
});

/**
 * Cancel a pending stock flow request.
 */
export const cancelStockFlow = action({
  args: {
    k3martRequestId: v.number(),
    movementId: v.optional(v.id("k3martStockMovements")),
  },
  handler: async (ctx, args) => {
    const token = await getK3MartToken(ctx);
    const url = `${K3MART_CONFIG.baseUrl}${K3MART_CONFIG.endpoints.stockFlowCancel}/${args.k3martRequestId}`;

    const resp = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `JWT ${token}`, ...K3MART_CONFIG.headers },
    });

    if (resp.status === 401) throw new Error("TOKEN_EXPIRED");
    if (!resp.ok) throw new Error(`Cancel failed: HTTP ${resp.status}`);

    const result = (await resp.json()) as K3MartCancelResponse;

    // Update internal movement status if provided
    if (args.movementId) {
      await ctx.runMutation(internal.k3martCockpit.mutations.updateMovementStatus, {
        movementId: args.movementId,
        k3martStatus: "canceled",
      });
    }

    return { success: result.success };
  },
});

/**
 * Verify submission statuses for multiple outlets.
 * Fetches stock flow history for each outlet to check submission status.
 */
export const verifySubmissionStatuses = action({
  args: { outletExternalIds: v.array(v.number()) },
  handler: async (ctx, args) => {
    const token = await getK3MartToken(ctx);
    const results = [];

    for (const outletId of args.outletExternalIds) {
      try {
        const url = `${K3MART_CONFIG.baseUrl}${K3MART_CONFIG.endpoints.stockFlowList}?outletId=${outletId}`;
        const resp = await fetch(url, {
          headers: { Authorization: `JWT ${token}`, ...K3MART_CONFIG.headers },
        });
        if (resp.status === 401) throw new Error("TOKEN_EXPIRED");
        if (!resp.ok) continue;
        const data = (await resp.json()) as K3MartStockFlowListResponse;
        results.push({ outletId, flows: data.data });
      } catch (err) {
        if (err instanceof Error && err.message === "TOKEN_EXPIRED") throw err;
        results.push({ outletId, flows: [], error: String(err) });
      }
    }

    return results;
  },
});

/**
 * Refresh outlets from K3 Mart API.
 * Fetches outlet profile and updates/creates outlets in DB.
 */
export const refreshOutlets = action({
  args: { triggeredBy: v.optional(v.string()) },
  handler: async (ctx, _args) => {
    const token = await getK3MartToken(ctx);
    const url = `${K3MART_CONFIG.baseUrl}${K3MART_CONFIG.endpoints.outletProfile}`;

    const resp = await fetch(url, {
      headers: { Authorization: `JWT ${token}`, ...K3MART_CONFIG.headers },
    });

    if (resp.status === 401) throw new Error("TOKEN_EXPIRED");
    if (!resp.ok) throw new Error(`Outlet refresh failed: HTTP ${resp.status}`);

    const data = (await resp.json()) as K3MartOutletProfileResponse;

    let created = 0;
    let updated = 0;

    for (const apiOutlet of data.data) {
      // Check if outlet exists (getActiveOutlets is an internalQuery)
      const allOutlets = await ctx.runQuery(internal.externalData.queries.getActiveOutlets, {
        source: "k3mart" as const,
      });
      const existing = allOutlets.find((o: any) => o.externalId === String(apiOutlet.id));

      if (existing) {
        // Only update name - do NOT reactivate manually-deactivated outlets
        if (existing.name !== apiOutlet.name) {
          await ctx.runMutation(internal.externalData.mutations.internalUpsertOutlet, {
            source: "k3mart",
            externalId: String(apiOutlet.id),
            name: apiOutlet.name,
            isActive: existing.isActive,
          });
          updated++;
        }
      } else {
        // Create new outlet
        await ctx.runMutation(internal.externalData.mutations.internalUpsertOutlet, {
          source: "k3mart",
          externalId: String(apiOutlet.id),
          name: apiOutlet.name,
          isActive: true,
        });
        created++;
      }
    }

    return { success: true, created, updated, total: data.data.length };
  },
});
