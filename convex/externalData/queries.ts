import { v } from "convex/values";
import { query, internalQuery } from "../_generated/server";
import { calculatePeriodRange } from "../lib/periodRange";
import type { PeriodPreset } from "../lib/periodRange";
import type { Doc } from "../_generated/dataModel";

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

// ─── RESTOCK PLANNER QUERIES ───

const WIB_OFFSET_HOURS = 7;

/** Check if a WIB-adjusted timestamp falls on a weekend (Sat=6, Sun=0) */
function isWeekend(utcMs: number): boolean {
  const wibDate = new Date(utcMs + WIB_OFFSET_HOURS * 60 * 60 * 1000);
  const day = wibDate.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Restock overview: returns all channels/outlets with current stock + demand summary.
 * Powers the main grid view of the Restock Planner.
 */
export const getRestockOverview = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;

    // 1. Fetch all active K3 Mart outlets
    const k3martOutlets = await ctx.db
      .query("externalOutlets")
      .withIndex("by_source", (q) => q.eq("source", "k3mart"))
      .filter((q) => q.eq(q.field("isActive"), true))
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
          stockProducts = await ctx.db
            .query("externalStockSnapshots")
            .withIndex("by_batch", (q) =>
              q.eq("snapshotBatchId", latestSnapshot.snapshotBatchId)
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

        // Aggregate demand by product
        const demandMap = new Map<string, { totalSold: number; productName: string }>();
        for (const r of revenue) {
          const key = r.externalProductCode ?? r.productName ?? "unknown";
          const existing = demandMap.get(key);
          const qty = r.quantitySold ?? 0;
          if (existing) {
            existing.totalSold += qty;
          } else {
            demandMap.set(key, {
              totalSold: qty,
              productName: r.productName ?? key,
            });
          }
        }

        const products = stockProducts.map((sp) => {
          const demand = demandMap.get(sp.externalProductCode);
          const dailyRate = demand ? demand.totalSold / 14 : 0;
          const daysRemaining = dailyRate > 0 ? sp.quantity / dailyRate : sp.quantity > 0 ? 999 : 0;
          const status: "critical" | "warning" | "ok" =
            daysRemaining < 1 ? "critical" : daysRemaining < 2 ? "warning" : "ok";

          return {
            productKey: sp.externalProductCode,
            productName: sp.productName,
            currentStock: sp.quantity,
            dailyRate: Math.round(dailyRate * 10) / 10,
            daysRemaining: Math.round(daysRemaining * 10) / 10,
            status,
          };
        });

        // Also add products with demand but no stock data
        for (const [key, demand] of demandMap) {
          if (!products.some((p) => p.productKey === key)) {
            products.push({
              productKey: key,
              productName: demand.productName,
              currentStock: 0,
              dailyRate: Math.round((demand.totalSold / 14) * 10) / 10,
              daysRemaining: 0,
              status: "critical" as const,
            });
          }
        }

        const criticalCount = products.filter((p) => p.status === "critical").length;
        const warningCount = products.filter((p) => p.status === "warning").length;
        const totalDailyDemand = products.reduce((sum, p) => sum + p.dailyRate, 0);

        return {
          type: "k3mart" as const,
          outletId: outlet._id,
          outletName: outlet.name,
          lastSnapshotAt: latestSnapshot?.snapshotAt,
          products,
          criticalCount,
          warningCount,
          totalDailyDemand: Math.round(totalDailyDemand * 10) / 10,
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

    const gobizDemandMap = new Map<string, { totalSold: number; menuProductId?: string }>();
    for (const r of gobizRevenue) {
      const items = await ctx.db
        .query("externalRevenueItems")
        .withIndex("by_revenue", (q) => q.eq("revenueId", r._id))
        .collect();
      for (const item of items) {
        const existing = gobizDemandMap.get(item.productName);
        if (existing) {
          existing.totalSold += item.quantity;
        } else {
          gobizDemandMap.set(item.productName, {
            totalSold: item.quantity,
            menuProductId: item.linkedMenuProductId as string | undefined,
          });
        }
      }
    }

    // Get manual stock for gobiz
    const gobizManualStock = await ctx.db
      .query("manualStockEntries")
      .withIndex("by_channel", (q) => q.eq("channel", "gobiz"))
      .collect();
    const gobizStockMap = new Map(gobizManualStock.map((s) => [s.productKey, s]));

    const gobizProducts = Array.from(gobizDemandMap.entries()).map(([name, demand]) => {
      const dailyRate = demand.totalSold / 14;
      const manualStock = gobizStockMap.get(name);
      const currentStock = manualStock?.quantity;
      const daysRemaining = currentStock !== undefined && dailyRate > 0
        ? currentStock / dailyRate
        : undefined;
      const status = daysRemaining !== undefined
        ? (daysRemaining < 1 ? "critical" as const : daysRemaining < 2 ? "warning" as const : "ok" as const)
        : undefined;
      return {
        productKey: name,
        productName: name,
        currentStock,
        dailyRate: Math.round(dailyRate * 10) / 10,
        daysRemaining: daysRemaining !== undefined ? Math.round(daysRemaining * 10) / 10 : undefined,
        status,
      };
    });

    const gobizTotalDemand = gobizProducts.reduce((sum, p) => sum + p.dailyRate, 0);

    // 4. Internal channel
    const internalRevenue = await ctx.db
      .query("externalRevenue")
      .withIndex("by_source_period", (q) =>
        q.eq("source", "internal").gte("periodStart", fourteenDaysAgo)
      )
      .collect();

    const internalDemandMap = new Map<string, number>();
    for (const r of internalRevenue) {
      const name = r.productName ?? "Other";
      internalDemandMap.set(name, (internalDemandMap.get(name) ?? 0) + (r.quantitySold ?? 1));
    }

    // Manual stock for internal
    const internalManualStock = await ctx.db
      .query("manualStockEntries")
      .withIndex("by_channel", (q) => q.eq("channel", "internal"))
      .collect();
    const internalStockMap = new Map(internalManualStock.map((s) => [s.productKey, s]));

    const internalProducts = Array.from(internalDemandMap.entries()).map(([name, totalSold]) => {
      const dailyRate = totalSold / 14;
      const manualStock = internalStockMap.get(name);
      const currentStock = manualStock?.quantity;
      const daysRemaining = currentStock !== undefined && dailyRate > 0
        ? currentStock / dailyRate
        : undefined;
      const status = daysRemaining !== undefined
        ? (daysRemaining < 1 ? "critical" as const : daysRemaining < 2 ? "warning" as const : "ok" as const)
        : undefined;
      return {
        productKey: name,
        productName: name,
        currentStock,
        dailyRate: Math.round(dailyRate * 10) / 10,
        daysRemaining: daysRemaining !== undefined ? Math.round(daysRemaining * 10) / 10 : undefined,
        status,
      };
    });

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

/**
 * Detailed per-channel sell-through analysis with weekday/weekend split.
 * Called when user drills into a channel/outlet.
 */
export const getChannelSellThrough = query({
  args: {
    channel: v.union(v.literal("k3mart"), v.literal("gobiz"), v.literal("internal")),
    outletId: v.optional(v.id("externalOutlets")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;

    // Count weekdays and weekend days in 30-day window
    let numWeekdays = 0;
    let numWeekendDays = 0;
    for (let d = thirtyDaysAgo; d < now; d += 24 * 60 * 60 * 1000) {
      if (isWeekend(d)) numWeekendDays++;
      else numWeekdays++;
    }
    // Ensure at least 1 to avoid division by zero
    numWeekdays = Math.max(numWeekdays, 1);
    numWeekendDays = Math.max(numWeekendDays, 1);

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
        const batch = await ctx.db
          .query("externalStockSnapshots")
          .withIndex("by_batch", (q) =>
            q.eq("snapshotBatchId", latestSnapshot.snapshotBatchId)
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
    type ProductAnalysis = {
      productKey: string;
      productName: string;
      menuProductId?: string;
      weekdaySalesTotal: number;
      weekendSalesTotal: number;
      last7dSales: number;
      prev7dSales: number;
      transactionCount: number;
    };

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
    } else {
      // Internal: use externalRevenue
      const revenue = await ctx.db
        .query("externalRevenue")
        .withIndex("by_source_period", (q) =>
          q.eq("source", "internal").gte("periodStart", thirtyDaysAgo)
        )
        .collect();

      for (const r of revenue) {
        const key = r.productName ?? "Other";
        const entry = getOrCreate(key, key);
        const qty = r.quantitySold ?? 1;
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

    // Build final product list
    const products = Array.from(productMap.values()).map((p) => {
      const weekdayDailyRate = p.weekdaySalesTotal / numWeekdays;
      const weekendDailyRate = p.weekendSalesTotal / numWeekendDays;
      const totalSold30d = p.weekdaySalesTotal + p.weekendSalesTotal;
      const overallDailyRate = totalSold30d / 30;

      const currentStock = currentStockMap.get(p.productKey);
      const daysRemaining =
        currentStock !== undefined && overallDailyRate > 0
          ? currentStock / overallDailyRate
          : undefined;
      const status =
        daysRemaining !== undefined
          ? daysRemaining < 1
            ? ("critical" as const)
            : daysRemaining < 2
              ? ("warning" as const)
              : ("ok" as const)
          : undefined;

      // Suggestions: cover weekday (5 days) or weekend (2 days) + 20% buffer
      const suggestedWeekday = Math.ceil(weekdayDailyRate * 5 * 1.2);
      const suggestedWeekend = Math.ceil(weekendDailyRate * 2 * 1.2);

      const target = targetMap.get(p.productKey);

      // Trend
      const trendDirection: "up" | "down" | "flat" =
        p.last7dSales > p.prev7dSales * 1.1
          ? "up"
          : p.last7dSales < p.prev7dSales * 0.9
            ? "down"
            : "flat";

      // Confidence
      const confidence: "high" | "medium" | "low" =
        p.transactionCount >= 20 ? "high" : p.transactionCount >= 5 ? "medium" : "low";

      return {
        productKey: p.productKey,
        productName: p.productName,
        menuProductId: p.menuProductId,
        currentStock,
        weekdaySalesTotal: p.weekdaySalesTotal,
        weekendSalesTotal: p.weekendSalesTotal,
        totalSold30d,
        weekdayDailyRate: Math.round(weekdayDailyRate * 10) / 10,
        weekendDailyRate: Math.round(weekendDailyRate * 10) / 10,
        overallDailyRate: Math.round(overallDailyRate * 10) / 10,
        daysRemaining: daysRemaining !== undefined ? Math.round(daysRemaining * 10) / 10 : undefined,
        status,
        suggestedWeekday,
        suggestedWeekend,
        targetWeekday: target?.weekdayTarget,
        targetWeekend: target?.weekendTarget,
        last7dSales: p.last7dSales,
        prev7dSales: p.prev7dSales,
        trendDirection,
        transactionCount: p.transactionCount,
        confidence,
      };
    });

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
