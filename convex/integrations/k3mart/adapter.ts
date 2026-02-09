"use node";

declare const process: { env: Record<string, string | undefined> };

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
  K3MART_CONFIG,
  K3MART_OUTLET_NAMES,
  type K3MartProduct,
  type K3MartDashboardResponse,
  type K3MartSalesResponse,
} from "./config";
import { parseK3MartDate, formatDate, buildDedupKey, resolveOutletName } from "./helpers";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateBatchId(): string {
  return `k3mart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Read a product name from K3 Mart API response (handles both nested and flat-dotted keys). */
function getProductName(raw: K3MartProduct): string {
  if (raw.product?.product_name) return raw.product.product_name;
  // API may return flat dotted keys: "product.product_name"
  const flat = raw as unknown as Record<string, unknown>;
  return String(flat["product.product_name"] ?? flat.product_name ?? "Unknown");
}

function getProductCode(raw: K3MartProduct): string {
  if (raw.product?.product_code) return raw.product.product_code;
  const flat = raw as unknown as Record<string, unknown>;
  return String(flat["product.product_code"] ?? flat.product_code ?? "");
}

function getProductCapital(raw: K3MartProduct): number {
  if (raw.product?.capital !== undefined) return raw.product.capital;
  const flat = raw as unknown as Record<string, unknown>;
  return Number(flat["product.capital"] ?? 0);
}

function transformProduct(raw: K3MartProduct): {
  externalProductId: string;
  externalProductCode: string;
  productName: string;
  quantity: number;
  price: number;
  capital: number;
  priceGrabfoodGofood: number;
  priceGrabmart: number;
  priceShopee: number;
} {
  return {
    externalProductId: String(raw.product_id ?? (raw as unknown as Record<string, unknown>).id ?? ""),
    externalProductCode: getProductCode(raw),
    productName: getProductName(raw),
    quantity: raw.quantity ?? 0,
    price: raw.price ?? 0,
    capital: getProductCapital(raw),
    priceGrabfoodGofood: raw.price_grabfood_gofood ?? 0,
    priceGrabmart: raw.price_grabmart ?? 0,
    priceShopee: raw.price_shopee ?? 0,
  };
}

/**
 * Discover K3 Mart outlets by scanning outlet IDs 1 through maxOutletId.
 * Only saves outlets and products that match the configured product filter.
 *
 * Flow:
 * 1. Loop outlet IDs 1 → maxOutletId
 * 2. Fetch page 1 only for each outlet
 * 3. Filter products by name containing the filter keyword
 * 4. Save matching outlets and their filtered products
 */
export const discoverK3MartOutlets = action({
  args: {
    triggeredBy: v.optional(v.string()),
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
    const batchId = generateBatchId();
    const { discovery } = K3MART_CONFIG;

    // Create initial sync log
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

    let outletsScanned = 0;
    let outletsFound = 0;
    let totalStockUnits = 0;
    const errors: string[] = [];

    for (let outletId = 1; outletId <= discovery.maxOutletId; outletId++) {
      outletsScanned++;

      try {
        // Fetch page 1 only with large page size, sorted by quantity desc
        const url = new URL(
          `${K3MART_CONFIG.baseUrl}${K3MART_CONFIG.endpoints.dashboard}`
        );
        url.searchParams.set("outletId", String(outletId));
        url.searchParams.set("page", "1");
        url.searchParams.set("pageSize", String(discovery.pageSize));
        url.searchParams.set("order", "-quantity");

        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `JWT ${token}`,
            ...K3MART_CONFIG.headers,
          },
        });

        // On 401, stop immediately
        if (response.status === 401) {
          errors.push("TOKEN_EXPIRED: K3Mart API token expired");
          break;
        }

        // Skip non-200 responses
        if (!response.ok) continue;

        const json = (await response.json()) as K3MartDashboardResponse;
        const rawProducts = json.data?.data;
        if (!rawProducts || rawProducts.length === 0) continue;

        // Filter: only products matching the product filter
        const filter = discovery.productFilter.toLowerCase();
        const matchingProducts = rawProducts.filter((p) =>
          getProductName(p).toLowerCase().includes(filter)
        );

        if (matchingProducts.length === 0) continue;

        // Found an outlet with our products!
        outletsFound++;
        const transformed = matchingProducts.map(transformProduct);
        totalStockUnits += transformed.reduce((sum, p) => sum + p.quantity, 0);

        // Upsert outlet
        const outletDocId: Id<"externalOutlets"> = await ctx.runMutation(
          internal.externalData.mutations.internalUpsertOutlet,
          {
            source: "k3mart",
            externalId: String(outletId),
            name: resolveOutletName(outletId, K3MART_OUTLET_NAMES),
            isActive: true,
          }
        );

        // Save filtered stock snapshots
        const snapshotAt = Date.now();
        for (let j = 0; j < transformed.length; j += 200) {
          const batch = transformed.slice(j, j + 200);
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
                priceGrabfoodGofood: p.priceGrabfoodGofood,
                priceGrabmart: p.priceGrabmart,
                priceShopee: p.priceShopee,
                capital: p.capital,
              })),
            }
          );
        }

        // Save product mappings for filtered products
        await ctx.runMutation(
          internal.externalData.mutations.saveProductMappings,
          {
            mappings: transformed.map((p) => ({
              source: "k3mart" as const,
              externalProductCode: p.externalProductCode,
              externalProductName: p.productName,
            })),
          }
        );

        // Update outlet sync status
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
        errors.push(`Outlet #${outletId}: ${errorMsg}`);

        // If token expired, stop immediately
        if (errorMsg.includes("TOKEN_EXPIRED") || errorMsg.includes("token expired")) {
          break;
        }
      }

      // Rate limit between outlets
      await sleep(discovery.delayBetweenOutletsMs);
    }

    // Update sync log
    const finalStatus = errors.some((e) => e.includes("TOKEN_EXPIRED"))
      ? "error"
      : errors.length === 0
        ? "success"
        : "success"; // partial success still counts

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
      outletsScanned,
      outletsFound,
      totalStockUnits,
      errors,
      durationMs: Date.now() - startTime,
    };
  },
});

/**
 * Fast stock refresh for known active K3 Mart outlets.
 * Only polls outlets already saved in externalOutlets (typically 7),
 * instead of scanning 1-200. Completes in ~3s instead of ~60s.
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
    console.log("[syncK3MartStock] Starting fast stock refresh...");

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
    const { discovery } = K3MART_CONFIG;

    // Create sync log
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

    // Only fetch active K3 Mart outlets from DB
    const activeOutlets = await ctx.runQuery(
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

    let totalStockUnits = 0;
    const errors: string[] = [];

    for (const outlet of activeOutlets) {
      const numericId = outlet.externalId;
      console.log(`[syncK3MartStock] Polling outlet ${outlet.name} (ID=${numericId})...`);

      try {
        const url = new URL(
          `${K3MART_CONFIG.baseUrl}${K3MART_CONFIG.endpoints.dashboard}`
        );
        url.searchParams.set("outletId", numericId);
        url.searchParams.set("page", "1");
        url.searchParams.set("pageSize", String(discovery.pageSize));
        url.searchParams.set("order", "-quantity");

        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `JWT ${token}`,
            ...K3MART_CONFIG.headers,
          },
        });

        console.log(`[syncK3MartStock] Outlet ${outlet.name}: HTTP ${response.status}`);

        if (response.status === 401) {
          errors.push("TOKEN_EXPIRED: K3Mart API token expired");
          break;
        }

        if (!response.ok) {
          errors.push(`Outlet ${outlet.name}: HTTP ${response.status}`);
          continue;
        }

        const json = (await response.json()) as K3MartDashboardResponse;
        const rawProducts = json.data?.data;
        console.log(`[syncK3MartStock] Outlet ${outlet.name}: ${rawProducts?.length ?? 0} raw products`);
        if (!rawProducts || rawProducts.length === 0) continue;

        // Debug: dump first raw product structure
        console.log(`[syncK3MartStock] Outlet ${outlet.name}: raw[0] keys=`, Object.keys(rawProducts[0]));
        if (rawProducts[0].product) {
          console.log(`[syncK3MartStock] Outlet ${outlet.name}: raw[0].product keys=`, Object.keys(rawProducts[0].product));
        } else {
          console.log(`[syncK3MartStock] Outlet ${outlet.name}: raw[0] sample=`, JSON.stringify(rawProducts[0]).slice(0, 500));
        }

        // Filter products - handle both nested (product.product_name) and flat structures
        const filter = discovery.productFilter.toLowerCase();
        const matchingProducts = rawProducts.filter((p) =>
          getProductName(p).toLowerCase().includes(filter)
        );
        console.log(`[syncK3MartStock] Outlet ${outlet.name}: ${matchingProducts.length} products matching "${filter}"`);

        if (matchingProducts.length === 0) continue;

        const transformed = matchingProducts.map(transformProduct);
        const outletStock = transformed.reduce((sum, p) => sum + p.quantity, 0);
        totalStockUnits += outletStock;
        console.log(`[syncK3MartStock] Outlet ${outlet.name}: saving ${transformed.length} products, ${outletStock} total units`);

        // Save stock snapshots
        const snapshotAt = Date.now();
        for (let j = 0; j < transformed.length; j += 200) {
          const batch = transformed.slice(j, j + 200);
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
                priceGrabfoodGofood: p.priceGrabfoodGofood,
                priceGrabmart: p.priceGrabmart,
                priceShopee: p.priceShopee,
                capital: p.capital,
              })),
            }
          );
        }

        // Update outlet sync status
        await ctx.runMutation(
          internal.externalData.mutations.updateOutletSyncStatus,
          {
            outletId: outlet._id,
            lastSyncAt: snapshotAt,
            lastSyncStatus: "success",
          }
        );
        console.log(`[syncK3MartStock] Outlet ${outlet.name}: snapshots saved OK`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[syncK3MartStock] Outlet ${outlet.name} ERROR:`, errorMsg);
        errors.push(`Outlet ${outlet.name}: ${errorMsg}`);
        if (errorMsg.includes("TOKEN_EXPIRED")) break;
      }

      // Brief rate limit between outlets
      await sleep(discovery.delayBetweenOutletsMs);
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

    console.log(`[syncK3MartStock] Done: ${activeOutlets.length} outlets polled, ${totalStockUnits} stock units, ${errors.length} errors, ${Date.now() - startTime}ms`);

    return {
      success: !errors.some((e) => e.includes("TOKEN_EXPIRED")),
      syncLogId,
      outletsPolled: activeOutlets.length,
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
