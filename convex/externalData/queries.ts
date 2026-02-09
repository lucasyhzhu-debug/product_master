import { v } from "convex/values";
import { query, internalQuery } from "../_generated/server";
import { calculatePeriodRange } from "../lib/periodRange";
import type { PeriodPreset } from "../lib/periodRange";

const sourceValidator = v.union(v.literal("k3mart"), v.literal("gobiz"), v.literal("internal"));

// ─── INTERNAL QUERIES (called by platform adapter actions) ───

export const getActiveOutlets = internalQuery({
  args: { source: sourceValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("externalOutlets")
      .withIndex("by_source", (q) => q.eq("source", args.source))
      .filter((q) => q.eq(q.field("isActive"), true))
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

    // Get recent revenue (last 24 hours)
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentRevenue = await ctx.db
      .query("externalRevenue")
      .withIndex("by_period")
      .filter((q) => q.gte(q.field("periodStart"), oneDayAgo))
      .collect();

    const totalGross = recentRevenue.reduce((sum, r) => sum + (r.revenueGross ?? 0), 0);
    const totalNet = recentRevenue.reduce((sum, r) => sum + (r.revenueNet ?? 0), 0);
    const totalTransactions = recentRevenue.reduce((sum, r) => sum + (r.transactionCount ?? 0), 0);
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

const periodPresetValidator = v.union(
  v.literal("today"),
  v.literal("yesterday"),
  v.literal("last7days"),
  v.literal("last30days"),
  v.literal("thisMonth")
);

export const getDashboardSummaryByPeriod = query({
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

    // Fetch current period revenue
    const currentRevenue = await ctx.db
      .query("externalRevenue")
      .withIndex("by_period", (q) => q.gte("periodStart", range.currentStart))
      .filter((q) => q.lt(q.field("periodStart"), range.currentEnd))
      .collect();

    // Fetch previous period revenue
    const previousRevenue = await ctx.db
      .query("externalRevenue")
      .withIndex("by_period", (q) => q.gte("periodStart", range.previousStart))
      .filter((q) => q.lt(q.field("periodStart"), range.previousEnd))
      .collect();

    // Aggregate with discount correction for internal orders.
    // Internal sync stores revenueGross = finalTotal (post-discount),
    // but we need gross = totalAmount (pre-discount) and discounts separated.
    async function aggregate(records: typeof currentRevenue) {
      const k3martRecords = records.filter((r) => r.source === "k3mart");
      const gobizRecords = records.filter((r) => r.source === "gobiz");
      const internalRecords = records.filter((r) => r.source === "internal");

      // Per-channel platform aggregation
      function aggregatePlatformChannel(channelRecords: typeof records) {
        const gross = channelRecords.reduce((sum, r) => sum + (r.revenueGross ?? 0), 0);
        const commission = channelRecords.reduce((sum, r) => sum + (r.commission ?? 0), 0);
        const adBurn = channelRecords.reduce((sum, r) => sum + (r.adBurn ?? 0), 0);
        const promoBurn = channelRecords.reduce((sum, r) => sum + (r.promoBurn ?? 0), 0);
        const net = gross - commission - adBurn - promoBurn;
        const txns = channelRecords.reduce((sum, r) => sum + (r.transactionCount ?? 0), 0);
        return { gross, net, txns, commission, adBurn, promoBurn };
      }

      const k3mart = aggregatePlatformChannel(k3martRecords);
      const gobiz = aggregatePlatformChannel(gobizRecords);

      // Platform totals
      const platformGross = k3mart.gross + gobiz.gross;
      const platformCommission = k3mart.commission + gobiz.commission;
      const platformAdBurn = k3mart.adBurn + gobiz.adBurn;
      const platformPromoBurn = k3mart.promoBurn + gobiz.promoBurn;
      const platformNet = k3mart.net + gobiz.net;
      const platformTxns = k3mart.txns + gobiz.txns;

      // Internal: look up real orders for pre-discount totals
      let internalGross = 0;
      let internalNet = 0;
      let totalDiscounts = 0;
      const internalTxns = internalRecords.reduce((sum, r) => sum + (r.transactionCount ?? 0), 0);

      // Batch-lookup orders by order number
      const orderNumbers = internalRecords
        .map((r) => r.externalTransactionId)
        .filter((n): n is string => !!n);

      if (orderNumbers.length > 0) {
        for (const orderNumber of orderNumbers) {
          const order = await ctx.db
            .query("orders")
            .withIndex("by_order_number", (q) => q.eq("orderNumber", orderNumber))
            .first();
          if (order) {
            internalGross += order.totalAmount;
            internalNet += order.finalTotal ?? order.totalAmount;
            totalDiscounts += order.totalAmount - (order.finalTotal ?? order.totalAmount);
          } else {
            // Fallback to revenue record data if order deleted
            const rev = internalRecords.find((r) => r.externalTransactionId === orderNumber);
            if (rev) {
              internalGross += rev.revenueGross ?? 0;
              internalNet += rev.revenueGross ?? 0;
            }
          }
        }
      }

      return {
        totalGross: platformGross + internalGross,
        totalNet: platformNet + internalNet,
        totalTransactions: platformTxns + internalTxns,
        totalCommission: platformCommission,
        totalAdBurn: platformAdBurn,
        totalPromoBurn: platformPromoBurn,
        totalDiscounts,
        platformGross,
        internalGross,
        // Per-channel breakdowns
        channels: {
          k3mart: { gross: k3mart.gross, net: k3mart.net, transactions: k3mart.txns },
          gobiz: { gross: gobiz.gross, net: gobiz.net, transactions: gobiz.txns },
          internal: { gross: internalGross, net: internalNet, transactions: internalTxns },
        },
      };
    }

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
        ...(await aggregate(currentRevenue)),
        periodLabel: range.periodLabel,
        comparisonLabel: range.comparisonLabel,
        periodStart: range.currentStart,
        periodEnd: range.currentEnd,
      },
      previousPeriod: await aggregate(previousRevenue),
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
