import { v } from "convex/values";
import { query, internalQuery } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import { paginationOptsValidator } from "convex/server";
import { calculatePeriodRange, isWeekend } from "../lib/periodRange";
import type { PeriodPreset } from "../lib/periodRange";
import type { Doc } from "../_generated/dataModel";
import { externalSource } from "../schema";
import { isExternalSource, sourceToPlatform } from "../lib/externalSource";
import { aggregatePeriodRevenue } from "./helpers/dashboardHelpers";
import { bucketKey, formatBucketLabel } from "./helpers/timeSeriesHelpers";
import type { Granularity } from "./helpers/timeSeriesHelpers";
import { computeLifetimeTotals, computePiecesSold } from "./helpers/lifetimeHelpers";
import { countDayTypes, buildSellThroughProducts } from "./helpers/sellThroughHelpers";
import type { ProductAnalysis } from "./helpers/sellThroughHelpers";
import { buildK3MartOutletProducts, buildDemandProducts } from "./helpers/restockHelpers";
import { hasExternalRevenueItems } from "./helpers/revenueItemsHelpers";
import { requireRole } from "../lib/auth";

const sourceValidator = externalSource;

/**
 * Batch-lookup real order data for internal revenue records.
 * Internal orders sync revenueGross = finalTotal (post-discount), but we need
 * the real totalAmount (pre-discount) for accurate gross/net/discount reporting.
 * Uses Promise.all for concurrent index lookups instead of sequential awaits.
 */
export async function fetchInternalOrderDataMap(
  ctx: QueryCtx,
  records: Doc<"externalRevenue">[]
): Promise<Map<string, { totalAmount: number; finalTotal: number; deliveryFee: number }>> {
  const orderNumbers = records
    .filter((r) => r.source === "internal" && r.externalTransactionId)
    .map((r) => r.externalTransactionId!);
  const map = new Map<string, { totalAmount: number; finalTotal: number; deliveryFee: number }>();
  if (orderNumbers.length === 0) return map;
  const lookups = await Promise.all(
    orderNumbers.map((orderNumber) =>
      ctx.db.query("orders")
        .withIndex("by_order_number", (q) => q.eq("orderNumber", orderNumber))
        .first()
    )
  );
  for (const order of lookups) {
    if (order) {
      map.set(order.orderNumber, {
        totalAmount: order.totalAmount,
        finalTotal: order.finalTotal ?? order.totalAmount,
        deliveryFee: order.deliveryFee ?? 0,
      });
    }
  }
  return map;
}

// ─── INTERNAL QUERIES (called by platform adapter actions) ───

export const getActiveOutlets = internalQuery({
  args: { source: sourceValidator },
  handler: async (ctx, args) => {
    // MIS-02: compound index eliminates post-filter
    return await ctx.db
      .query("externalOutlets")
      .withIndex("by_source_active", (q) => q.eq("source", args.source).eq("isActive", true))
      .collect();
  },
});

export const getLatestSnapshotBatch = internalQuery({
  args: { outletId: v.id("externalOutlets") },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("externalStockSnapshots")
      .withIndex("by_outlet_snapshot", (q) => q.eq("outletId", args.outletId))
      .order("desc")
      .first();

    if (!latest) return null;

    // Get all products from this batch
    return await ctx.db
      .query("externalStockSnapshots")
      .withIndex("by_batch", (q) => q.eq("snapshotBatchId", latest.snapshotBatchId))
      .collect();
  },
});

export const getLatestSyncTimestamp = internalQuery({
  args: { source: sourceValidator },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("externalSyncLogs")
      .withIndex("by_source", (q) => q.eq("source", args.source))
      .filter((q) => q.eq(q.field("status"), "success"))
      .order("desc")
      .first();
    return latest?.timestamp ?? null;
  },
});

export const getOutletNameToIdMap = internalQuery({
  args: { source: sourceValidator },
  handler: async (ctx, args) => {
    const outlets = await ctx.db
      .query("externalOutlets")
      .withIndex("by_source", (q) => q.eq("source", args.source))
      .collect();
    const map: Record<string, string> = {};
    for (const outlet of outlets) {
      map[outlet.name] = outlet._id;
    }
    return map;
  },
});

export const getRevenueById = internalQuery({
  args: { revenueId: v.id("externalRevenue") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.revenueId);
  },
});

/**
 * Internal-query wrapper for hasExternalRevenueItems. Needed by the
 * syncInternalOrders ACTION (convex/integrations/internal/adapter.ts:126)
 * because actions cannot call helpers directly — they must go through
 * ctx.runQuery.
 *
 * Pattern reference: getLatestSnapshotBatch / getOutletNameToIdMap in this
 * same file — same wrapping idiom.
 */
export const hasExternalRevenueItemsQuery = internalQuery({
  args: { revenueId: v.id("externalRevenue") },
  handler: async (ctx, args) => hasExternalRevenueItems(ctx, args.revenueId),
});

// ─── PUBLIC QUERIES (called from frontend) ───

export const listOutlets = query({
  args: {
    source: v.optional(sourceValidator),
  },
  handler: async (ctx, args) => {
    if (args.source) {
      return await ctx.db
        .query("externalOutlets")
        .withIndex("by_source", (q) => q.eq("source", args.source!))
        .collect();
    }
    return await ctx.db.query("externalOutlets").collect();
  },
});

export const getLatestSnapshots = query({
  args: {
    outletId: v.id("externalOutlets"),
  },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("externalStockSnapshots")
      .withIndex("by_outlet_snapshot", (q) => q.eq("outletId", args.outletId))
      .order("desc")
      .first();

    if (!latest) return [];

    return await ctx.db
      .query("externalStockSnapshots")
      .withIndex("by_batch", (q) => q.eq("snapshotBatchId", latest.snapshotBatchId))
      .collect();
  },
});

export const getRevenue = query({
  args: {
    source: v.optional(sourceValidator),
    periodStart: v.optional(v.number()),
    periodEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q;
    if (args.source && args.periodStart) {
      q = ctx.db
        .query("externalRevenue")
        .withIndex("by_source_period", (idx) =>
          idx.eq("source", args.source!).gte("periodStart", args.periodStart!)
        )
        .order("desc");
    } else if (args.source) {
      q = ctx.db
        .query("externalRevenue")
        .withIndex("by_source", (idx) => idx.eq("source", args.source!))
        .order("desc");
    } else {
      q = ctx.db.query("externalRevenue").withIndex("by_period").order("desc");
    }

    let results = await q.collect();

    if (args.periodEnd) {
      results = results.filter((r) => r.periodEnd <= args.periodEnd!);
    }

    // Enrich with Customer/Store name
    // Build lookup maps to avoid N+1 queries
    const outletIds = new Set(
      results.filter((r) => r.outletId).map((r) => r.outletId!)
    );
    const outletNameMap = new Map<string, string>();
    for (const outletId of outletIds) {
      const outlet = await ctx.db.get(outletId);
      if (outlet) outletNameMap.set(outletId, outlet.name);
    }

    const internalOrderNumbers = results
      .filter((r) => r.source === "internal" && r.externalTransactionId)
      .map((r) => r.externalTransactionId!);
    const customerNameMap = new Map<string, string>();
    const orderDataMap = new Map<string, { totalAmount: number; finalTotal: number }>();
    if (internalOrderNumbers.length > 0) {
      const orders = await ctx.db.query("orders").collect();
      for (const order of orders) {
        if (internalOrderNumbers.includes(order.orderNumber)) {
          customerNameMap.set(order.orderNumber, order.customerName);
          orderDataMap.set(order.orderNumber, {
            totalAmount: order.totalAmount,
            finalTotal: order.finalTotal ?? order.totalAmount,
          });
        }
      }
    }

    return results.map((r) => {
      let customerStoreName: string | undefined;
      if (r.source === "k3mart" && r.outletId) {
        customerStoreName = outletNameMap.get(r.outletId);
      } else if (r.source === "internal" && r.externalTransactionId) {
        customerStoreName = customerNameMap.get(r.externalTransactionId);
      } else if (r.source === "gobiz" && r.outletId) {
        customerStoreName = outletNameMap.get(r.outletId);
      }

      // Override gross/net for internal orders using real order data
      if (r.source === "internal" && r.externalTransactionId) {
        const orderData = orderDataMap.get(r.externalTransactionId);
        if (orderData) {
          return {
            ...r,
            customerStoreName,
            revenueGross: orderData.totalAmount,
            revenueNet: orderData.finalTotal,
          };
        }
      }

      return { ...r, customerStoreName };
    });
  },
});

/**
 * Get revenue records with cursor-based pagination.
 * Uses Convex paginate() for efficient incremental loading.
 * Supports optional single source filter via index.
 * Enriches with outlet names for display.
 */
export const getRevenuePaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    source: v.optional(sourceValidator),
  },
  handler: async (ctx, args) => {
    let q;
    if (args.source) {
      q = ctx.db
        .query("externalRevenue")
        .withIndex("by_source", (idx) => idx.eq("source", args.source!))
        .order("desc");
    } else {
      q = ctx.db.query("externalRevenue").withIndex("by_period").order("desc");
    }

    const paginatedResult = await q.paginate(args.paginationOpts);

    // Enrich with outlet names (same as getRevenue but only for the page)
    const outletIds = new Set(
      paginatedResult.page.filter((r) => r.outletId).map((r) => r.outletId!)
    );
    const outletNameMap = new Map<string, string>();
    for (const outletId of outletIds) {
      const outlet = await ctx.db.get(outletId);
      if (outlet) outletNameMap.set(outletId, outlet.name);
    }

    const enrichedPage = paginatedResult.page.map((r) => ({
      ...r,
      customerStoreName: r.outletId
        ? outletNameMap.get(r.outletId)
        : undefined,
    }));

    return { ...paginatedResult, page: enrichedPage };
  },
});

export const getSyncLogs = query({
  args: {
    source: v.optional(sourceValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    if (args.source) {
      return await ctx.db
        .query("externalSyncLogs")
        .withIndex("by_source", (q) => q.eq("source", args.source!))
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("externalSyncLogs")
      .withIndex("by_timestamp")
      .order("desc")
      .take(limit);
  },
});

export const getProductMappings = query({
  args: {
    source: v.optional(sourceValidator),
  },
  handler: async (ctx, args) => {
    if (args.source) {
      return await ctx.db
        .query("externalProductMappings")
        .withIndex("by_source_code", (q) => q.eq("source", args.source!))
        .collect();
    }
    return await ctx.db.query("externalProductMappings").collect();
  },
});

/**
 * Get the most recent webhook sync error within the last 24 hours.
 * Used by the Webhooks tab to display a sync error banner.
 */
export const getLatestWebhookError = query({
  args: { source: v.string() },
  handler: async (ctx, args) => {
    if (!isExternalSource(args.source)) return null;
    const source = args.source;
    // Get the last 20 sync logs for this source, check for recent webhook errors
    const logs = await ctx.db
      .query("externalSyncLogs")
      .withIndex("by_source", (q) => q.eq("source", source))
      .order("desc")
      .take(20);

    // Find the most recent webhook error within last 24 hours
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const webhookError = logs.find(
      (log) =>
        log.syncType === "webhook" &&
        log.status === "error" &&
        log.timestamp > oneDayAgo
    );

    if (!webhookError) return null;

    return {
      timestamp: webhookError.timestamp,
      errorMessage: webhookError.errorMessage ?? "Unknown webhook error",
    };
  },
});

/** Internal version for use from actions (e.g., GrabFood adapter). */
export const listProductMappingsInternal = internalQuery({
  args: {
    source: sourceValidator,
  },
  handler: async (ctx, args) => {
    const mappings = await ctx.db
      .query("externalProductMappings")
      .withIndex("by_source_code", (q) => q.eq("source", args.source))
      .collect();

    // Join with menuProducts to get names/prices
    const results = [];
    for (const m of mappings) {
      let menuProduct = null;
      if (m.menuProductId) {
        menuProduct = await ctx.db.get(m.menuProductId);
      }
      results.push({ ...m, menuProduct });
    }
    return results;
  },
});

export const getDashboardSummary = query({
  args: {},
  handler: async (ctx) => {
    // Get all outlets grouped by source
    const outlets = await ctx.db.query("externalOutlets").collect();

    // Get latest sync logs per source
    const k3martLogs = await ctx.db
      .query("externalSyncLogs")
      .withIndex("by_source", (q) => q.eq("source", "k3mart"))
      .order("desc")
      .take(1);

    const gobizLogs = await ctx.db
      .query("externalSyncLogs")
      .withIndex("by_source", (q) => q.eq("source", "gobiz"))
      .order("desc")
      .take(1);

    const internalLogs = await ctx.db
      .query("externalSyncLogs")
      .withIndex("by_source", (q) => q.eq("source", "internal"))
      .order("desc")
      .take(1);

    // Get recent revenue (last 24 hours) -- use index bound instead of post-filter
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentRevenue = await ctx.db
      .query("externalRevenue")
      .withIndex("by_period", (q) => q.gte("periodStart", oneDayAgo))
      .collect();

    const totalGross = recentRevenue.reduce((sum, r) => sum + (r.revenueGross ?? 0), 0);
    const totalNet = recentRevenue.reduce((sum, r) => sum + (r.revenueNet ?? 0), 0);
    const totalTransactions = recentRevenue.reduce((sum, r) => sum + (r.transactionCount ?? 1), 0);
    const totalCommission = recentRevenue.reduce((sum, r) => sum + (r.commission ?? 0), 0);
    const totalAdBurn = recentRevenue.reduce((sum, r) => sum + (r.adBurn ?? 0), 0);
    const totalPromoBurn = recentRevenue.reduce((sum, r) => sum + (r.promoBurn ?? 0), 0);

    return {
      platforms: {
        k3mart: {
          outletCount: outlets.filter((o) => o.source === "k3mart").length,
          activeOutlets: outlets.filter((o) => o.source === "k3mart" && o.isActive).length,
          lastSync: k3martLogs[0] ?? null,
        },
        gobiz: {
          outletCount: outlets.filter((o) => o.source === "gobiz").length,
          activeOutlets: outlets.filter((o) => o.source === "gobiz" && o.isActive).length,
          lastSync: gobizLogs[0] ?? null,
        },
        internal: {
          outletCount: 0,
          activeOutlets: 0,
          lastSync: internalLogs[0] ?? null,
        },
      },
      recentRevenue: {
        totalGross,
        totalNet,
        totalTransactions,
        totalCommission,
        totalAdBurn,
        totalPromoBurn,
        periodLabel: "Last 24 hours",
      },
    };
  },
});

// ─── REVENUE ITEMS QUERIES ───

export const getRevenueItems = query({
  args: {
    revenueId: v.id("externalRevenue"),
  },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("externalRevenueItems")
      .withIndex("by_revenue", (q) => q.eq("revenueId", args.revenueId))
      .collect();

    // Enrich with menu product names
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        let menuProductName: string | undefined;
        if (item.linkedMenuProductId) {
          const product = await ctx.db.get(item.linkedMenuProductId);
          menuProductName = product?.name;
        }
        return {
          ...item,
          menuProductName,
        };
      })
    );

    return enrichedItems;
  },
});

// ─── PERIOD-BASED DASHBOARD SUMMARY ───

export const periodPresetValidator = v.union(
  v.literal("past24hours"),
  v.literal("today"),
  v.literal("yesterday"),
  v.literal("thisWeek"),
  v.literal("last7days"),
  v.literal("last30days"),
  v.literal("thisMonth"),
  v.literal("allTime")
);

/**
 * Fetch all externalRevenueItems for a set of revenue records.
 * Fans out parallel index lookups (same pattern as getLifetimeTotalsInternal).
 */
async function fetchPeriodItems(
  ctx: QueryCtx,
  revenueRecords: Doc<"externalRevenue">[]
): Promise<Doc<"externalRevenueItems">[]> {
  if (revenueRecords.length === 0) return [];
  const batches = await Promise.all(
    revenueRecords.map((r) =>
      ctx.db.query("externalRevenueItems")
        .withIndex("by_revenue", (q) => q.eq("revenueId", r._id))
        .collect()
    )
  );
  return batches.flat();
}

export const getDashboardSummaryByPeriodInternal = internalQuery({
  args: { preset: periodPresetValidator },
  handler: async (ctx, args) => {
    const range = calculatePeriodRange(args.preset as PeriodPreset);

    // Get platform info (same as getDashboardSummary)
    const outlets = await ctx.db.query("externalOutlets").collect();

    const k3martLogs = await ctx.db
      .query("externalSyncLogs")
      .withIndex("by_source", (q) => q.eq("source", "k3mart"))
      .order("desc")
      .take(1);

    const gobizLogs = await ctx.db
      .query("externalSyncLogs")
      .withIndex("by_source", (q) => q.eq("source", "gobiz"))
      .order("desc")
      .take(1);

    const internalLogs = await ctx.db
      .query("externalSyncLogs")
      .withIndex("by_source", (q) => q.eq("source", "internal"))
      .order("desc")
      .take(1);

    // Fetch current period revenue (IRB-01: both bounds at index level)
    const currentRevenue = await ctx.db
      .query("externalRevenue")
      .withIndex("by_period", (q) =>
        q.gte("periodStart", range.currentStart).lt("periodStart", range.currentEnd)
      )
      .collect();

    // Fetch previous period revenue (IRB-01: both bounds at index level)
    const previousRevenue = await ctx.db
      .query("externalRevenue")
      .withIndex("by_period", (q) =>
        q.gte("periodStart", range.previousStart).lt("periodStart", range.previousEnd)
      )
      .collect();

    // Active outlets = distinct outlets with sales in the current period
    const k3martActiveOutletIds = new Set(
      currentRevenue
        .filter((r) => r.source === "k3mart" && r.outletId)
        .map((r) => r.outletId!)
    );
    const gobizActiveOutletIds = new Set(
      currentRevenue
        .filter((r) => r.source === "gobiz" && r.outletId)
        .map((r) => r.outletId!)
    );

    // Pre-fetch order data, BOM data, and period items in parallel
    const [currentOrderDataMap, previousOrderDataMap, bomComponents, componentTypes, currentItems, previousItems] = await Promise.all([
      fetchInternalOrderDataMap(ctx, currentRevenue),
      fetchInternalOrderDataMap(ctx, previousRevenue),
      ctx.db.query("menuProductComponents").collect(),
      ctx.db.query("componentTypes").collect(),
      fetchPeriodItems(ctx, currentRevenue),
      fetchPeriodItems(ctx, previousRevenue),
    ]);
    const currentAgg = aggregatePeriodRevenue(currentRevenue, currentOrderDataMap);
    const previousAgg = aggregatePeriodRevenue(previousRevenue, previousOrderDataMap);

    // Compute pieces sold from revenue records (not aggregated totals) for BOM estimation consistency
    const currentGrossFromRecords = currentRevenue.reduce((s, r) => s + (r.revenueGross ?? 0), 0);
    const previousGrossFromRecords = previousRevenue.reduce((s, r) => s + (r.revenueGross ?? 0), 0);
    const currentPiecesSold = computePiecesSold(currentItems, currentGrossFromRecords, bomComponents, componentTypes);
    const previousPiecesSold = computePiecesSold(previousItems, previousGrossFromRecords, bomComponents, componentTypes);

    return {
      platforms: {
        k3mart: {
          outletCount: outlets.filter((o) => o.source === "k3mart").length,
          activeOutlets: k3martActiveOutletIds.size,
          lastSync: k3martLogs[0] ?? null,
        },
        gobiz: {
          outletCount: outlets.filter((o) => o.source === "gobiz").length,
          activeOutlets: gobizActiveOutletIds.size,
          lastSync: gobizLogs[0] ?? null,
        },
        internal: {
          outletCount: 0,
          activeOutlets: 0,
          lastSync: internalLogs[0] ?? null,
        },
      },
      currentPeriod: {
        ...currentAgg,
        totalPiecesSold: currentPiecesSold,
        periodLabel: range.periodLabel,
        comparisonLabel: range.comparisonLabel,
        periodStart: range.currentStart,
        periodEnd: range.currentEnd,
      },
      previousPeriod: { ...previousAgg, totalPiecesSold: previousPiecesSold },
    };
  },
});

// ─── ORDER DETAILS BY ORDER NUMBER ───

export const getOrderDetailsByOrderNumber = query({
  args: { orderNumber: v.string() },
  handler: async (ctx, args) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_order_number", (q) => q.eq("orderNumber", args.orderNumber))
      .first();

    if (!order) return null;

    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();

    // Get customer name
    let customerName = order.customerName;
    if (!customerName && order.customerId) {
      const customer = await ctx.db.get(order.customerId);
      customerName = customer?.name ?? "Unknown";
    }

    return {
      orderId: order._id,
      orderNumber: order.orderNumber,
      customerName,
      channel: order.channel,
      status: order.status,
      deliveryType: order.deliveryType,
      totalAmount: order.totalAmount,
      finalTotal: order.finalTotal,
      orderLevelDiscount: order.orderLevelDiscount,
      orderLevelDiscountType: order.orderLevelDiscountType,
      voucherCode: order.voucherCode,
      voucherDiscountValue: order.voucherDiscountValue,
      items: items
        .filter((item) => !item.isCancelled)
        .map((item) => ({
          productName: item.productName,
          productVariant: item.productVariant,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.lineTotal,
        })),
    };
  },
});

// ─── RESTOCK PLANNER QUERIES ───

/**
 * Restock overview: returns all channels/outlets with current stock + demand summary.
 * Powers the main grid view of the Restock Planner.
 * Internal only — called via fetchRestockOverview action for on-demand fetching.
 */
export const getRestockOverviewInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;

    // 1. Fetch all active K3 Mart outlets (MIS-02: compound index)
    const k3martOutlets = await ctx.db
      .query("externalOutlets")
      .withIndex("by_source_active", (q) => q.eq("source", "k3mart").eq("isActive", true))
      .collect();

    // 2. Build K3 Mart channel entries
    const k3martChannels = await Promise.all(
      k3martOutlets.map(async (outlet) => {
        // Get latest snapshot batch for current stock
        const latestSnapshot = await ctx.db
          .query("externalStockSnapshots")
          .withIndex("by_outlet_snapshot", (q) => q.eq("outletId", outlet._id))
          .order("desc")
          .first();

        let stockProducts: Doc<"externalStockSnapshots">[] = [];
        if (latestSnapshot) {
          // Filter by batch AND outlet to avoid cross-outlet contamination (IRB-06: compound index)
          stockProducts = await ctx.db
            .query("externalStockSnapshots")
            .withIndex("by_batch_outlet", (q) =>
              q.eq("snapshotBatchId", latestSnapshot.snapshotBatchId).eq("outletId", outlet._id)
            )
            .collect();
        }

        // Get revenue for past 14 days
        const revenue = await ctx.db
          .query("externalRevenue")
          .withIndex("by_source_period", (q) =>
            q.eq("source", "k3mart").gte("periodStart", fourteenDaysAgo)
          )
          .filter((q) => q.eq(q.field("outletId"), outlet._id))
          .collect();

        // Aggregate demand and build product list (pure computation)
        const { products, criticalCount, warningCount, totalDailyDemand } =
          buildK3MartOutletProducts(stockProducts, revenue, 14);

        return {
          type: "k3mart" as const,
          outletId: outlet._id,
          outletName: outlet.name,
          lastSnapshotAt: latestSnapshot?.snapshotAt,
          products,
          criticalCount,
          warningCount,
          totalDailyDemand,
        };
      })
    );

    // 3. GoBiz channel - aggregate from externalRevenueItems
    const gobizRevenue = await ctx.db
      .query("externalRevenue")
      .withIndex("by_source_period", (q) =>
        q.eq("source", "gobiz").gte("periodStart", fourteenDaysAgo)
      )
      .collect();

    // Parallel fetch all externalRevenueItems for all gobiz revenue records
    const allGobizItems = await Promise.all(
      gobizRevenue.map((r) =>
        ctx.db
          .query("externalRevenueItems")
          .withIndex("by_revenue", (q) => q.eq("revenueId", r._id))
          .collect()
      )
    );

    const gobizDemandMap = new Map<string, number>();
    for (let i = 0; i < gobizRevenue.length; i++) {
      const items = allGobizItems[i];
      for (const item of items) {
        gobizDemandMap.set(item.productName, (gobizDemandMap.get(item.productName) ?? 0) + item.quantity);
      }
    }

    // Get manual stock for gobiz
    const gobizManualStock = await ctx.db
      .query("manualStockEntries")
      .withIndex("by_channel", (q) => q.eq("channel", "gobiz"))
      .collect();
    const gobizStockMap = new Map(gobizManualStock.map((s) => [s.productKey, s]));

    const gobizProducts = buildDemandProducts(gobizDemandMap, gobizStockMap, 14);
    const gobizTotalDemand = gobizProducts.reduce((sum, p) => sum + p.dailyRate, 0);

    // 4. Internal channel - look up actual order items for product-level data
    const internalRevenue = await ctx.db
      .query("externalRevenue")
      .withIndex("by_source_period", (q) =>
        q.eq("source", "internal").gte("periodStart", fourteenDaysAgo)
      )
      .collect();

    // Parallel: fetch all orders by order number
    const orderNumbers = internalRevenue
      .map((r) => r.externalTransactionId)
      .filter((n): n is string => !!n);

    const orders = await Promise.all(
      orderNumbers.map((orderNumber) =>
        ctx.db
          .query("orders")
          .withIndex("by_order_number", (q) => q.eq("orderNumber", orderNumber))
          .first()
      )
    );

    // Parallel: fetch all orderItems for found orders
    const validOrders = orders.filter((o): o is NonNullable<typeof o> => o !== null);
    const allOrderItems = await Promise.all(
      validOrders.map((order) =>
        ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect()
      )
    );

    // Build demand map from parallel results
    const internalDemandMap = new Map<string, number>();
    for (let i = 0; i < validOrders.length; i++) {
      const items = allOrderItems[i];
      for (const item of items) {
        if (item.isCancelled) continue;
        const name = item.productName;
        internalDemandMap.set(name, (internalDemandMap.get(name) ?? 0) + item.quantity);
      }
    }

    // Manual stock for internal
    const internalManualStock = await ctx.db
      .query("manualStockEntries")
      .withIndex("by_channel", (q) => q.eq("channel", "internal"))
      .collect();
    const internalStockMap = new Map(internalManualStock.map((s) => [s.productKey, s]));

    const internalProducts = buildDemandProducts(internalDemandMap, internalStockMap, 14);
    const internalTotalDemand = internalProducts.reduce((sum, p) => sum + p.dailyRate, 0);

    // 5. Summary
    const lowStockAlerts = k3martChannels.reduce(
      (sum, c) => sum + c.criticalCount + c.warningCount,
      0
    );

    // Latest sync across all sources
    const allSyncLogs = await ctx.db
      .query("externalSyncLogs")
      .withIndex("by_timestamp")
      .order("desc")
      .take(1);

    return {
      summary: {
        activeChannels: k3martChannels.length + (gobizProducts.length > 0 ? 1 : 0) + (internalProducts.length > 0 ? 1 : 0),
        lowStockAlerts,
        lastSyncAt: allSyncLogs[0]?.timestamp ?? null,
      },
      channels: [
        ...k3martChannels,
        {
          type: "gobiz" as const,
          products: gobizProducts,
          totalDailyDemand: Math.round(gobizTotalDemand * 10) / 10,
        },
        {
          type: "internal" as const,
          products: internalProducts,
          totalDailyDemand: Math.round(internalTotalDemand * 10) / 10,
        },
      ],
    };
  },
});

// ─── SYNC HEALTH STATUS ───

/**
 * Get per-platform sync health status with 6-hour staleness detection.
 * Public, no auth -- read-only health data for monitoring.
 */
export const getSyncHealthStatus = query({
  args: {},
  handler: async (ctx) => {
    const platforms = ["k3mart", "gobiz", "internal"] as const;
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    const now = Date.now();
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

    const result: Record<string, {
      lastSync: { timestamp: number; status: string; error?: string; productsCount?: number; durationMs?: number } | null;
      syncHistory: Array<{ timestamp: number; status: string; syncType: string; productsCount?: number; errorMessage?: string; durationMs?: number }>;
      isStale: boolean;
      staleSinceMs: number | null;
    }> = {};

    for (const source of platforms) {
      // Get last 20 sync logs (for sync history display)
      const logs = await ctx.db.query("externalSyncLogs")
        .withIndex("by_source", q => q.eq("source", source))
        .order("desc")
        .take(20);

      const lastSuccessLog = logs.find(l => l.status === "success");
      const lastLog = logs[0] ?? null;

      const isStale = !lastSuccessLog || (now - lastSuccessLog.timestamp > SIX_HOURS_MS);
      const staleSinceMs = lastSuccessLog ? now - lastSuccessLog.timestamp : null;

      result[source] = {
        lastSync: lastLog ? {
          timestamp: lastLog.timestamp,
          status: lastLog.status,
          error: lastLog.errorMessage,
          productsCount: lastLog.productsCount,
          durationMs: lastLog.durationMs,
        } : null,
        syncHistory: logs.filter(l => l.timestamp > twentyFourHoursAgo).map(l => ({
          timestamp: l.timestamp,
          status: l.status,
          syncType: l.syncType,
          productsCount: l.productsCount,
          errorMessage: l.errorMessage,
          durationMs: l.durationMs,
        })),
        isStale,
        staleSinceMs,
      };
    }

    return result;
  },
});

/**
 * Get sync health alerts for dashboard banner.
 * Returns platforms that have been stale for 6+ hours.
 */
/**
 * Count how many revenue items would be affected by a mapping change.
 * Used to show impact in the confirmation dialog.
 */
export const countMappingImpact = query({
  args: {
    source: sourceValidator,
    externalProductName: v.string(),
  },
  handler: async (ctx, args) => {
    const items = await ctx.db.query("externalRevenueItems")
      .withIndex("by_product_name", (q) =>
        q.eq("source", args.source).eq("productName", args.externalProductName)
      )
      .collect();
    return { count: items.length };
  },
});

export const getSyncHealthAlert = query({
  args: {},
  handler: async (ctx) => {
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    const now = Date.now();
    const alerts: Array<{ platform: string; platformName: string; staleSinceMs: number; lastError?: string }> = [];

    for (const [source, name] of [["k3mart", "K3 Mart"], ["gobiz", "GoFood"]] as const) {
      const lastSuccess = await ctx.db.query("externalSyncLogs")
        .withIndex("by_source", q => q.eq("source", source))
        .filter(q => q.eq(q.field("status"), "success"))
        .order("desc")
        .first();

      if (!lastSuccess || now - lastSuccess.timestamp > SIX_HOURS_MS) {
        const lastLog = await ctx.db.query("externalSyncLogs")
          .withIndex("by_source", q => q.eq("source", source))
          .order("desc")
          .first();

        alerts.push({
          platform: source,
          platformName: name,
          staleSinceMs: lastSuccess ? now - lastSuccess.timestamp : now,
          lastError: lastLog?.errorMessage,
        });
      }
    }

    return { hasAlert: alerts.length > 0, alerts };
  },
});

/**
 * Detailed per-channel sell-through analysis with weekday/weekend split.
 * Called when user drills into a channel/outlet.
 */
export const getChannelSellThrough = query({
  args: {
    channel: v.union(
      v.literal("k3mart"),
      v.literal("gobiz"),
      v.literal("internal"),
      // Phase 79 DA-07: Shopee/TikTok now have per-item data via externalRevenueItems.
      v.literal("shopee"),
      v.literal("tiktok"),
    ),
    outletId: v.optional(v.id("externalOutlets")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;

    // Count weekdays and weekend days in 30-day window
    const { numWeekdays, numWeekendDays } = countDayTypes(thirtyDaysAgo, now);

    // Fetch outlet info if K3 Mart
    let outletName: string | undefined;
    let lastSnapshotAt: number | undefined;

    if (args.channel === "k3mart" && args.outletId) {
      const outlet = await ctx.db.get(args.outletId);
      outletName = outlet?.name;
    }

    // Get current stock for K3 Mart
    let currentStockMap = new Map<string, number>();
    if (args.channel === "k3mart" && args.outletId) {
      const latestSnapshot = await ctx.db
        .query("externalStockSnapshots")
        .withIndex("by_outlet_snapshot", (q) => q.eq("outletId", args.outletId!))
        .order("desc")
        .first();

      if (latestSnapshot) {
        lastSnapshotAt = latestSnapshot.snapshotAt;
        // Filter by batch AND outlet to avoid cross-outlet contamination (IRB-06: compound index)
        const batch = await ctx.db
          .query("externalStockSnapshots")
          .withIndex("by_batch_outlet", (q) =>
            q.eq("snapshotBatchId", latestSnapshot.snapshotBatchId).eq("outletId", args.outletId!)
          )
          .collect();
        for (const s of batch) {
          currentStockMap.set(s.externalProductCode, s.quantity);
        }
      }
    }

    // Get manual stock for non-K3 channels
    if (args.channel !== "k3mart") {
      const manualStock = await ctx.db
        .query("manualStockEntries")
        .withIndex("by_channel", (q) => q.eq("channel", args.channel))
        .collect();
      for (const s of manualStock) {
        currentStockMap.set(s.productKey, s.quantity);
      }
    }

    // Build product-level sell-through analysis
    const productMap = new Map<string, ProductAnalysis>();

    function getOrCreate(key: string, name: string, menuProductId?: string): ProductAnalysis {
      let entry = productMap.get(key);
      if (!entry) {
        entry = {
          productKey: key,
          productName: name,
          menuProductId,
          weekdaySalesTotal: 0,
          weekendSalesTotal: 0,
          last7dSales: 0,
          prev7dSales: 0,
          transactionCount: 0,
        };
        productMap.set(key, entry);
      }
      return entry;
    }

    if (args.channel === "k3mart" && args.outletId) {
      // K3 Mart: use externalRevenue per outlet
      const revenue = await ctx.db
        .query("externalRevenue")
        .withIndex("by_source_period", (q) =>
          q.eq("source", "k3mart").gte("periodStart", thirtyDaysAgo)
        )
        .filter((q) => q.eq(q.field("outletId"), args.outletId!))
        .collect();

      for (const r of revenue) {
        const key = r.externalProductCode ?? r.productName ?? "unknown";
        const entry = getOrCreate(key, r.productName ?? key);
        const qty = r.quantitySold ?? 0;
        const txnDate = r.transactionDate ?? r.periodStart;

        if (isWeekend(txnDate)) {
          entry.weekendSalesTotal += qty;
        } else {
          entry.weekdaySalesTotal += qty;
        }

        if (txnDate >= sevenDaysAgo) {
          entry.last7dSales += qty;
        } else if (txnDate >= fourteenDaysAgo) {
          entry.prev7dSales += qty;
        }

        entry.transactionCount += r.transactionCount ?? 1;
      }
    } else if (args.channel === "gobiz") {
      // GoBiz: use externalRevenueItems
      const revenue = await ctx.db
        .query("externalRevenue")
        .withIndex("by_source_period", (q) =>
          q.eq("source", "gobiz").gte("periodStart", thirtyDaysAgo)
        )
        .collect();

      for (const r of revenue) {
        const items = await ctx.db
          .query("externalRevenueItems")
          .withIndex("by_revenue", (q) => q.eq("revenueId", r._id))
          .collect();

        const txnDate = r.transactionDate ?? r.periodStart;

        for (const item of items) {
          const entry = getOrCreate(
            item.productName,
            item.productName,
            item.linkedMenuProductId as string | undefined
          );
          if (isWeekend(txnDate)) {
            entry.weekendSalesTotal += item.quantity;
          } else {
            entry.weekdaySalesTotal += item.quantity;
          }

          if (txnDate >= sevenDaysAgo) {
            entry.last7dSales += item.quantity;
          } else if (txnDate >= fourteenDaysAgo) {
            entry.prev7dSales += item.quantity;
          }

          entry.transactionCount += 1;
        }
      }
    } else if (args.channel === "shopee" || args.channel === "tiktok") {
      // Phase 79 DA-07: Shopee/TikTok now have per-item data via externalRevenueItems.
      // Per-product volume = Σ item.quantity (NOT revenue / avgPrice). D-04 invariant:
      // do NOT also add r.revenueGross to any qty counter — items carry the attribution.
      const channel = args.channel;
      const revenue = await ctx.db
        .query("externalRevenue")
        .withIndex("by_source_period", (q) =>
          q.eq("source", channel).gte("periodStart", thirtyDaysAgo)
        )
        .collect();

      for (const r of revenue) {
        const items = await ctx.db
          .query("externalRevenueItems")
          .withIndex("by_revenue", (q) => q.eq("revenueId", r._id))
          .collect();

        const txnDate = r.transactionDate ?? r.periodStart;

        for (const item of items) {
          const entry = getOrCreate(
            item.productName,
            item.productName,
            item.linkedMenuProductId as string | undefined
          );
          if (isWeekend(txnDate)) {
            entry.weekendSalesTotal += item.quantity;
          } else {
            entry.weekdaySalesTotal += item.quantity;
          }

          if (txnDate >= sevenDaysAgo) {
            entry.last7dSales += item.quantity;
          } else if (txnDate >= fourteenDaysAgo) {
            entry.prev7dSales += item.quantity;
          }

          entry.transactionCount += 1;
        }
      }
    } else {
      // Internal: look up actual order items for product-level data
      const revenue = await ctx.db
        .query("externalRevenue")
        .withIndex("by_source_period", (q) =>
          q.eq("source", "internal").gte("periodStart", thirtyDaysAgo)
        )
        .collect();

      for (const r of revenue) {
        const orderNumber = r.externalTransactionId;
        if (!orderNumber) continue;
        const txnDate = r.transactionDate ?? r.periodStart;

        const order = await ctx.db
          .query("orders")
          .withIndex("by_order_number", (q) => q.eq("orderNumber", orderNumber))
          .first();
        if (!order) continue;

        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();

        for (const item of items) {
          if (item.isCancelled) continue;
          const entry = getOrCreate(
            item.productName,
            item.productName,
            item.menuProductId as string | undefined
          );

          if (isWeekend(txnDate)) {
            entry.weekendSalesTotal += item.quantity;
          } else {
            entry.weekdaySalesTotal += item.quantity;
          }

          if (txnDate >= sevenDaysAgo) {
            entry.last7dSales += item.quantity;
          } else if (txnDate >= fourteenDaysAgo) {
            entry.prev7dSales += item.quantity;
          }

          entry.transactionCount += 1;
        }
      }
    }

    // Fetch persisted restock targets
    let targets: Doc<"restockTargets">[];
    if (args.outletId) {
      targets = await ctx.db
        .query("restockTargets")
        .withIndex("by_outlet_product", (q) => q.eq("outletId", args.outletId!))
        .collect();
    } else {
      targets = await ctx.db
        .query("restockTargets")
        .withIndex("by_channel", (q) => q.eq("channel", args.channel))
        .collect();
    }
    const targetMap = new Map(targets.map((t) => [t.productKey, t]));

    // Build final product list (pure computation delegated to helper)
    const products = buildSellThroughProducts(productMap, currentStockMap, targetMap, numWeekdays, numWeekendDays);

    // Sort: K3 Mart by days remaining asc, others by daily demand desc
    if (args.channel === "k3mart") {
      products.sort((a, b) => (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0));
    } else {
      products.sort((a, b) => b.overallDailyRate - a.overallDailyRate);
    }

    return {
      channel: {
        type: args.channel,
        outletId: args.outletId,
        outletName,
        lastSnapshotAt,
      },
      products,
    };
  },
});

/**
 * Phase 79 DA-07: lightweight per-product sell-through query that returns an
 * array of rows (instead of the richer stock/target-annotated shape used by
 * getChannelSellThrough). Used by analytics consumers and the Wave 0 invariant
 * tests to verify:
 *   - Shopee/TikTok per-product volume == Σ item.quantity (NOT revenue / avgPrice)
 *   - D-04: parent.revenueGross is NOT double-counted alongside items.totalPrice
 *
 * Implementation mirrors the gobiz/internal branches in getChannelSellThrough
 * but projects to a compact row shape. The full restock/target pipeline lives
 * in getChannelSellThrough; this query is read-only analytics.
 */
export const sellThroughQuery = query({
  args: {
    channel: v.union(
      v.literal("k3mart"),
      v.literal("gobiz"),
      v.literal("internal"),
      v.literal("shopee"),
      v.literal("tiktok"),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    type Row = {
      productKey: string;
      name: string;
      menuProductId: string | undefined;
      quantity: number;
      weekdayQuantity: number;
      weekendQuantity: number;
      revenue: number;
      transactionCount: number;
    };
    const rows = new Map<string, Row>();
    function getOrCreate(key: string, name: string, menuProductId?: string): Row {
      let r = rows.get(key);
      if (!r) {
        r = {
          productKey: key,
          name,
          menuProductId,
          quantity: 0,
          weekdayQuantity: 0,
          weekendQuantity: 0,
          revenue: 0,
          transactionCount: 0,
        };
        rows.set(key, r);
      }
      return r;
    }

    if (args.channel === "shopee" || args.channel === "tiktok" || args.channel === "gobiz") {
      // Phase 79 DA-07 + D-04: per-product volume from externalRevenueItems ONLY.
      // DO NOT add r.revenueGross to qty counters — items carry attribution.
      const channel = args.channel;
      const revenue = await ctx.db
        .query("externalRevenue")
        .withIndex("by_source_period", (q) =>
          q.eq("source", channel).gte("periodStart", thirtyDaysAgo)
        )
        .collect();

      for (const r of revenue) {
        const items = await ctx.db
          .query("externalRevenueItems")
          .withIndex("by_revenue", (q) => q.eq("revenueId", r._id))
          .collect();

        const txnDate = r.transactionDate ?? r.periodStart;
        const weekend = isWeekend(txnDate);

        for (const item of items) {
          const entry = getOrCreate(
            item.productName,
            item.productName,
            item.linkedMenuProductId as string | undefined,
          );
          entry.quantity += item.quantity;
          if (weekend) entry.weekendQuantity += item.quantity;
          else entry.weekdayQuantity += item.quantity;
          entry.revenue += item.totalPrice;
          entry.transactionCount += 1;
        }
      }
    } else if (args.channel === "k3mart") {
      const revenue = await ctx.db
        .query("externalRevenue")
        .withIndex("by_source_period", (q) =>
          q.eq("source", "k3mart").gte("periodStart", thirtyDaysAgo)
        )
        .collect();

      for (const r of revenue) {
        const key = r.externalProductCode ?? r.productName ?? "unknown";
        const entry = getOrCreate(key, r.productName ?? key);
        const qty = r.quantitySold ?? 0;
        const txnDate = r.transactionDate ?? r.periodStart;
        entry.quantity += qty;
        if (isWeekend(txnDate)) entry.weekendQuantity += qty;
        else entry.weekdayQuantity += qty;
        entry.revenue += r.revenueGross ?? 0;
        entry.transactionCount += r.transactionCount ?? 1;
      }
    } else {
      // internal
      const revenue = await ctx.db
        .query("externalRevenue")
        .withIndex("by_source_period", (q) =>
          q.eq("source", "internal").gte("periodStart", thirtyDaysAgo)
        )
        .collect();

      for (const r of revenue) {
        const orderNumber = r.externalTransactionId;
        if (!orderNumber) continue;
        const txnDate = r.transactionDate ?? r.periodStart;
        const weekend = isWeekend(txnDate);
        const order = await ctx.db
          .query("orders")
          .withIndex("by_order_number", (q) => q.eq("orderNumber", orderNumber))
          .first();
        if (!order) continue;
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        for (const item of items) {
          if (item.isCancelled) continue;
          const entry = getOrCreate(
            item.productName,
            item.productName,
            item.menuProductId as string | undefined,
          );
          entry.quantity += item.quantity;
          if (weekend) entry.weekendQuantity += item.quantity;
          else entry.weekdayQuantity += item.quantity;
          entry.revenue += (item.unitPrice ?? 0) * item.quantity;
          entry.transactionCount += 1;
        }
      }
    }

    return Array.from(rows.values()).sort((a, b) => b.quantity - a.quantity);
  },
});

// ─── TIME-SERIES REVENUE QUERY (for stacked charts) ───

export const getRevenueTimeSeries = query({
  args: {
    preset: periodPresetValidator,
    granularity: v.union(v.literal("hourly"), v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
    metric: v.union(v.literal("gross"), v.literal("net"), v.literal("volume")),
  },
  handler: async (ctx, args) => {
    const range = calculatePeriodRange(args.preset as PeriodPreset);

    // Fetch all revenue within range (IRB-01: both bounds at index level)
    const records = await ctx.db
      .query("externalRevenue")
      .withIndex("by_period", (q) =>
        q.gte("periodStart", range.currentStart).lt("periodStart", range.currentEnd)
      )
      .collect();

    // For internal orders, look up real order data for accurate gross/net
    const orderDataMap = await fetchInternalOrderDataMap(ctx, records);

    const granularity = args.granularity as Granularity;

    // Discover all unique sources from fetched records
    const discoveredSources = [...new Set(records.map((r) => r.source))];
    const buckets = new Map<string, Record<string, number>>();

    for (const record of records) {
      const ts = record.transactionDate ?? record.periodStart;
      const key = bucketKey(ts, granularity);
      const platform = record.source;

      if (!buckets.has(key)) {
        const init: Record<string, number> = {};
        for (const src of discoveredSources) init[src] = 0;
        buckets.set(key, init);
      }
      const bucket = buckets.get(key)!;

      let value: number;
      if (args.metric === "volume") {
        value = record.transactionCount ?? (record.quantitySold ?? 0);
      } else if (args.metric === "gross") {
        if (platform === "internal" && record.externalTransactionId) {
          const od = orderDataMap.get(record.externalTransactionId);
          value = od ? od.totalAmount : (record.revenueGross ?? 0);
        } else {
          value = record.revenueGross ?? 0;
        }
      } else {
        // net
        if (platform === "internal" && record.externalTransactionId) {
          const od = orderDataMap.get(record.externalTransactionId);
          value = od ? od.finalTotal : (record.revenueNet ?? record.revenueGross ?? 0);
        } else {
          value = record.revenueNet ?? (record.revenueGross ?? 0);
        }
      }

      bucket[platform] = (bucket[platform] ?? 0) + value;
    }

    // Sort buckets chronologically
    const sortedKeys = Array.from(buckets.keys()).sort();
    const labels = sortedKeys.map((key) => formatBucketLabel(key, granularity));

    // Build series only for sources with non-zero totals (hide empty channels)
    const series = discoveredSources
      .map((p) => ({
        platform: sourceToPlatform(p),
        platformKey: p,
        data: sortedKeys.map((key) => Math.round((buckets.get(key)?.[p] ?? 0) * 100) / 100),
      }))
      .filter((s) => s.data.some((v) => v !== 0));

    return { labels, series };
  },
});

// ─── REVENUE BY OUTLET (Platform -> Outlet hierarchy) ───

export const getRevenueByOutletInternal = internalQuery({
  args: { preset: periodPresetValidator },
  handler: async (ctx, args) => {
    const range = calculatePeriodRange(args.preset as PeriodPreset);

    // Fetch revenue in period (IRB-01: both bounds at index level)
    const records = await ctx.db
      .query("externalRevenue")
      .withIndex("by_period", (q) =>
        q.gte("periodStart", range.currentStart).lt("periodStart", range.currentEnd)
      )
      .collect();

    // Fetch outlet names and internal order data in parallel
    const outletIds = [...new Set(records.filter((r) => r.outletId).map((r) => r.outletId!))];
    const [outletLookups, orderDataMap] = await Promise.all([
      Promise.all(outletIds.map((id) => ctx.db.get(id))),
      fetchInternalOrderDataMap(ctx, records),
    ]);
    const outletNameMap = new Map<string, string>();
    for (const outlet of outletLookups) {
      if (outlet) outletNameMap.set(outlet._id, outlet.name);
    }

    // Group by source -> outletId
    type OutletData = { outletId: string | null; name: string; gross: number; net: number; transactions: number };
    type PlatformData = { platform: string; platformName: string; outlets: OutletData[]; totals: { gross: number; net: number; transactions: number } };

    const platformMap = new Map<string, Map<string, OutletData>>();

    for (const record of records) {
      const platform = record.source;
      if (!platformMap.has(platform)) {
        platformMap.set(platform, new Map());
      }
      const outletMap = platformMap.get(platform)!;
      const outletKey = record.outletId ?? "direct";

      if (!outletMap.has(outletKey)) {
        outletMap.set(outletKey, {
          outletId: record.outletId ?? null,
          name: record.outletId ? (outletNameMap.get(record.outletId) ?? "Unknown") : "Direct Orders",
          gross: 0,
          net: 0,
          transactions: 0,
        });
      }
      const outlet = outletMap.get(outletKey)!;

      let gross: number;
      let net: number;

      if (platform === "internal" && record.externalTransactionId) {
        const od = orderDataMap.get(record.externalTransactionId);
        gross = od ? od.totalAmount : (record.revenueGross ?? 0);
        net = od ? od.finalTotal : (record.revenueGross ?? 0);
      } else {
        gross = record.revenueGross ?? 0;
        net = record.revenueNet ?? (record.revenueGross ?? 0);
      }

      outlet.gross += gross;
      outlet.net += net;
      outlet.transactions += record.transactionCount ?? 1;
    }

    // Build result
    const result: PlatformData[] = [];
    for (const [platform, outletMap] of platformMap) {
      const outlets = Array.from(outletMap.values());
      const totals = outlets.reduce(
        (acc, o) => ({
          gross: acc.gross + o.gross,
          net: acc.net + o.net,
          transactions: acc.transactions + o.transactions,
        }),
        { gross: 0, net: 0, transactions: 0 }
      );
      result.push({
        platform,
        platformName: sourceToPlatform(platform),
        outlets,
        totals,
      });
    }

    // Sort by gross revenue descending (biggest platforms first)
    result.sort((a, b) => b.totals.gross - a.totals.gross);

    return result;
  },
});

// ─── LIFETIME TOTALS (all-time aggregation for hero card) ───
// NOTE: Full table scan — acceptable at current scale (~1K records).
// When externalRevenueItems exceeds ~50K rows, consider pre-aggregation (ANLY-04).

export const getLifetimeTotalsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Parallel table scans — these are independent reads
    const [items, revenues, bomComponents, componentTypes] = await Promise.all([
      ctx.db.query("externalRevenueItems").collect(),
      ctx.db.query("externalRevenue").collect(),
      ctx.db.query("menuProductComponents").collect(),
      ctx.db.query("componentTypes").collect(),
    ]);

    return computeLifetimeTotals(items, revenues, bomComponents, componentTypes);
  },
});

// ─── PHASE 80.2: UNLINKED PRODUCTS BACKFILL STATS ───

/**
 * Admin-only K3Mart backfill stats.
 *
 * Two scans (externalRevenue + externalProductMappings, both filtered by
 * source="k3mart") capped at 4000 rows each → max ~8k reads per call,
 * well under Convex's 16,384 per-query read limit.
 *
 * The frontend pairs this with `getDirectBackfillStats` in a parallel
 * `useQuery` so each admin page section has its own independent read budget
 * and its own scanCapReached flag.
 */
export const getK3MartBackfillStats = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const SCAN_CAP = 4000;
    let scanCapReached = false;

    const parents = await ctx.db
      .query("externalRevenue")
      .withIndex("by_source", (q) => q.eq("source", "k3mart"))
      .take(SCAN_CAP);
    if (parents.length >= SCAN_CAP) scanCapReached = true;

    let linkedParents = 0;
    let unlinkedParents = 0;
    let nullProductCodeParents = 0;
    for (const p of parents) {
      const hasCode =
        p.externalProductCode !== undefined &&
        p.externalProductCode !== null &&
        p.externalProductCode !== "";
      if (!hasCode) nullProductCodeParents++;
      if (p.linkedMenuProductId) {
        linkedParents++;
      } else {
        unlinkedParents++;
      }
    }

    const mappings = await ctx.db
      .query("externalProductMappings")
      .withIndex("by_source_code", (q) => q.eq("source", "k3mart"))
      .take(SCAN_CAP);
    if (mappings.length >= SCAN_CAP) scanCapReached = true;

    const activeMappings = mappings.filter((m) => !!m.menuProductId).length;

    return {
      totalParents: parents.length,
      linkedParents,
      unlinkedParents,
      nullProductCodeParents,
      totalMappings: mappings.length,
      activeMappings,
      scanCapReached,
    };
  },
});

/**
 * Admin-only Direct (source="internal") backfill stats.
 *
 * Uses an O(children) approach: collect distinct revenueIds from
 * externalRevenueItems[source="internal"] into a Set, then set-diff against
 * the internal parents list. Two scans (up to 4000 rows each) instead of
 * calling hasExternalRevenueItems() per parent.
 *
 * If the children cap is reached, `parentsWithChildren` becomes a lower
 * bound (and `orphanParents` an upper bound). `scanCapReached` surfaces
 * this to the UI.
 */
export const getDirectBackfillStats = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const SCAN_CAP = 4000;
    let scanCapReached = false;

    const parents = await ctx.db
      .query("externalRevenue")
      .withIndex("by_source", (q) => q.eq("source", "internal"))
      .take(SCAN_CAP);
    if (parents.length >= SCAN_CAP) scanCapReached = true;

    const children = await ctx.db
      .query("externalRevenueItems")
      .withIndex("by_source", (q) => q.eq("source", "internal"))
      .take(SCAN_CAP);
    if (children.length >= SCAN_CAP) scanCapReached = true;

    const parentIdsWithChildren = new Set<string>();
    for (const c of children) {
      parentIdsWithChildren.add(c.revenueId as unknown as string);
    }

    let parentsWithChildren = 0;
    let orphanParents = 0;
    for (const p of parents) {
      if (parentIdsWithChildren.has(p._id as unknown as string)) {
        parentsWithChildren++;
      } else {
        orphanParents++;
      }
    }

    return {
      totalParents: parents.length,
      parentsWithChildren,
      orphanParents,
      totalChildren: children.length,
      scanCapReached,
    };
  },
});
