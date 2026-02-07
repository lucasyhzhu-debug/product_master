"use node";

declare const process: { env: Record<string, string | undefined> };

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { K3MART_CONFIG, type K3MartProduct, type K3MartDashboardResponse } from "./config";
import { calculateStockDeltas, summarizeDeltas, type SnapshotProduct } from "../../lib/stockDelta";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateBatchId(): string {
  return `k3mart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function transformProduct(raw: K3MartProduct): SnapshotProduct & {
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

async function fetchOutletPages(
  outletId: string,
  token: string
): Promise<K3MartProduct[]> {
  const allProducts: K3MartProduct[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const url = new URL(
      `${K3MART_CONFIG.baseUrl}${K3MART_CONFIG.endpoints.dashboard}`
    );
    url.searchParams.set("outletId", outletId);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(K3MART_CONFIG.pagination.pageSize));
    url.searchParams.set("order", K3MART_CONFIG.pagination.order);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `JWT ${token}`,
        ...K3MART_CONFIG.headers,
      },
    });

    if (response.status === 401) {
      throw new Error(
        "K3Mart API token expired. Please update K3MART_API_TOKEN in Convex environment variables."
      );
    }

    if (!response.ok) {
      throw new Error(
        `K3Mart API error: ${response.status} ${response.statusText}`
      );
    }

    const json = (await response.json()) as K3MartDashboardResponse;
    allProducts.push(...json.data.data);
    totalPages = json.data.meta.totalPages;
    page++;

    if (page <= totalPages) {
      await sleep(K3MART_CONFIG.rateLimit.betweenPagesMs);
    }
  } while (page <= totalPages);

  return allProducts;
}

/**
 * Sync K3 Mart stock data for all active outlets.
 *
 * Flow:
 * 1. Fetch stock data for each active K3Mart outlet
 * 2. Store raw snapshots
 * 3. Compare with previous snapshots to calculate stock deltas
 * 4. Write inferred revenue records from deltas
 * 5. Update sync logs and outlet status
 */
export const syncK3MartStock = action({
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

    // Get active K3Mart outlets
    const outlets: Array<{
      _id: Id<"externalOutlets">;
      _creationTime: number;
      source: "k3mart" | "gobiz";
      externalId: string;
      name: string;
      address?: string;
      isActive: boolean;
      lastSyncAt?: number;
      lastSyncStatus?: "success" | "error" | "partial";
      lastSyncError?: string;
      createdBy: string;
      createdAt: number;
    }> = await ctx.runQuery(
      internal.externalData.queries.getActiveOutlets,
      { source: "k3mart" }
    );

    if (outlets.length === 0) {
      await ctx.runMutation(
        internal.externalData.mutations.updateSyncLog,
        {
          logId: syncLogId,
          status: "error",
          errorMessage: "No active K3Mart outlets configured. Add outlets in Settings.",
          durationMs: Date.now() - startTime,
        }
      );
      return {
        success: false,
        error: "No active K3Mart outlets configured",
        syncLogId,
      };
    }

    let totalProducts = 0;
    let totalSalesInferred = 0;
    const errors: string[] = [];

    for (let i = 0; i < outlets.length; i++) {
      const outlet = outlets[i];

      try {
        // Fetch all pages for this outlet
        const rawProducts = await fetchOutletPages(
          outlet.externalId,
          token
        );

        const snapshotAt = Date.now();
        const transformed = rawProducts.map(transformProduct);

        // Save raw snapshots (batch by 200)
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

        totalProducts += transformed.length;

        // Save product mappings (auto-discover new products)
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

        // Get previous snapshot for stock delta calculation
        const previousBatch: Array<{
          _id: Id<"externalStockSnapshots">;
          _creationTime: number;
          outletId: Id<"externalOutlets">;
          snapshotBatchId: string;
          snapshotAt: number;
          externalProductId: string;
          externalProductCode: string;
          productName: string;
          quantity: number;
          price: number;
          capital?: number;
        }> | null = await ctx.runQuery(
          internal.externalData.queries.getLatestSnapshotBatch,
          { outletId: outlet._id }
        );

        if (previousBatch && previousBatch.length > 0) {
          // Only calculate deltas if we have a previous snapshot to compare with
          // And the previous batch is different from current (not same batchId)
          const prevBatchId = previousBatch[0]?.snapshotBatchId;
          if (prevBatchId && prevBatchId !== batchId) {
            const previousProducts: SnapshotProduct[] = previousBatch.map((s: typeof previousBatch[number]) => ({
              externalProductId: s.externalProductId,
              externalProductCode: s.externalProductCode,
              productName: s.productName,
              quantity: s.quantity,
              price: s.price,
              capital: s.capital,
            }));

            const currentProducts: SnapshotProduct[] = transformed.map((p) => ({
              externalProductId: p.externalProductId,
              externalProductCode: p.externalProductCode,
              productName: p.productName,
              quantity: p.quantity,
              price: p.price,
              capital: p.capital,
            }));

            const deltas = calculateStockDeltas(previousProducts, currentProducts);
            const salesDeltas = deltas.filter((d) => d.quantitySold > 0);

            if (salesDeltas.length > 0) {
              const summary = summarizeDeltas(deltas);
              totalSalesInferred += summary.totalUnitsSold;

              // Save inferred revenue records
              await ctx.runMutation(
                internal.externalData.mutations.saveRevenue,
                {
                  records: salesDeltas.map((d) => ({
                    outletId: outlet._id,
                    source: "k3mart" as const,
                    externalProductCode: d.externalProductCode,
                    productName: d.productName,
                    quantitySold: d.quantitySold,
                    revenueGross: d.estimatedRevenue,
                    costOfGoods: d.estimatedCost,
                    periodStart: previousBatch[0]!.snapshotAt,
                    periodEnd: snapshotAt,
                    dataOrigin: "stock_delta" as const,
                    confidence: "inferred" as const,
                    syncLogId,
                  })),
                }
              );
            }
          }
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
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Outlet ${outlet.name} (${outlet.externalId}): ${errorMsg}`);

        await ctx.runMutation(
          internal.externalData.mutations.updateOutletSyncStatus,
          {
            outletId: outlet._id,
            lastSyncAt: Date.now(),
            lastSyncStatus: "error",
            lastSyncError: errorMsg,
          }
        );

        // If token expired, stop processing more outlets
        if (errorMsg.includes("token expired")) {
          break;
        }
      }

      // Rate limit between outlets
      if (i < outlets.length - 1) {
        await sleep(K3MART_CONFIG.rateLimit.betweenOutletsMs);
      }
    }

    // Update sync log with final results
    const finalStatus = errors.length === 0
      ? "success"
      : errors.length === outlets.length
        ? "error"
        : "success"; // partial success still counts

    await ctx.runMutation(
      internal.externalData.mutations.updateSyncLog,
      {
        logId: syncLogId,
        status: finalStatus as "success" | "error",
        productsCount: totalProducts,
        errorMessage: errors.length > 0 ? errors.join("; ") : undefined,
        durationMs: Date.now() - startTime,
      }
    );

    return {
      success: errors.length === 0,
      syncLogId,
      totalProducts,
      totalSalesInferred,
      outletsProcessed: outlets.length,
      errors,
      durationMs: Date.now() - startTime,
    };
  },
});
