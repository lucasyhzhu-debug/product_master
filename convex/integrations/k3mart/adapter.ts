"use node";

declare const process: { env: Record<string, string | undefined> };

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
  K3MART_CONFIG,
  type K3MartProduct,
  type K3MartDashboardResponse,
  type K3MartSalesResponse,
} from "./config";
import { parseK3MartDate, formatDate, buildDedupKey } from "./helpers";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateBatchId(): string {
  return `k3mart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    externalProductId: String(raw.product_id),
    externalProductCode: raw.product.product_code,
    productName: raw.product.product_name,
    quantity: raw.quantity,
    price: raw.price,
    capital: raw.product.capital,
    priceGrabfoodGofood: raw.price_grabfood_gofood,
    priceGrabmart: raw.price_grabmart,
    priceShopee: raw.price_shopee,
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
    const token = process.env.K3MART_API_TOKEN;
    if (!token) {
      throw new Error(
        "K3MART_API_TOKEN environment variable is not set. Go to Convex Dashboard → Settings → Environment Variables to set it."
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
          p.product.product_name.toLowerCase().includes(filter)
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
            name: `K3 Mart #${outletId}`,
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
    const token = process.env.K3MART_API_TOKEN;
    if (!token) {
      throw new Error(
        "K3MART_API_TOKEN environment variable is not set. Go to Convex Dashboard → Settings → Environment Variables to set it."
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

          return {
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
