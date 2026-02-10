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
} from "./config";
import {
  parseK3MartDate,
  formatDate,
  buildDedupKey,
  resolveOutletExternalId,
  transformProductDetailEntry,
} from "./helpers";

function generateBatchId(): string {
  return `k3mart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

    const dbCred = await ctx.runQuery(
      internal.platformCredentials.queries.getTokenInternal,
      { platformId: "k3mart" }
    );
    const token = dbCred?.currentToken ?? process.env.K3MART_API_TOKEN;
    if (!token) {
      console.error("[syncK3MartStock] No API token found!");
      throw new Error(
        "K3MART_API_TOKEN not set. Configure credentials in Settings or set the environment variable."
      );
    }
    console.log("[syncK3MartStock] Token found, source:", dbCred?.currentToken ? "db" : "env");

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
    // Check DB for auto-refreshed token first, fall back to env var
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
