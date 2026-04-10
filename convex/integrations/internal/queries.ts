import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";
import { REVENUE_COUNTABLE_STATUSES } from "./config";

/**
 * Fetch orders that qualify as revenue.
 * Used by the internal adapter to build revenue records.
 * Deduplication by orderNumber is handled downstream in saveRevenue.
 *
 * Phase 20: Supports incremental sync via sinceTimestamp.
 * When provided, only fetches orders created since (sinceTimestamp - 24h buffer)
 * to catch orders created before last sync but confirmed after.
 * Note: Convex does not support explicit _creationTime indexes; uses .filter() which
 * still reduces saveRevenue call frequency (primary goal) even without DB-layer savings.
 */
export const getRevenueOrders = internalQuery({
  args: { sinceTimestamp: v.optional(v.number()) },
  handler: async (ctx, args) => {
    let allOrders;

    if (args.sinceTimestamp) {
      // Apply a 24-hour buffer before sinceTimestamp to catch orders that were
      // created before the last sync but confirmed (status changed) after it.
      // The downstream saveRevenue dedup by externalTransactionId handles overlap safely.
      const bufferMs = 24 * 60 * 60 * 1000;
      const cutoff = args.sinceTimestamp - bufferMs;
      allOrders = await ctx.db
        .query("orders")
        .filter((q) => q.gte(q.field("_creationTime"), cutoff))
        .collect();
    } else {
      // First sync: full scan (no prior timestamp)
      allOrders = await ctx.db.query("orders").collect();
    }

    return allOrders.filter((order) =>
      (REVENUE_COUNTABLE_STATUSES as readonly string[]).includes(order.status)
    );
  },
});

/**
 * Fetch order items grouped by order number.
 * Used by the internal adapter to generate externalRevenueItems for COGS resolution.
 * Excludes cancelled items.
 */
export const getOrderItemsByOrderNumbers = internalQuery({
  args: { orderNumbers: v.array(v.string()) },
  handler: async (ctx, args) => {
    const result: Record<string, Array<{
      _id: string;
      productName: string;
      unitPrice: number;
      quantity: number;
      lineTotal: number;
      menuProductId: string | undefined;
    }>> = {};

    for (const orderNumber of args.orderNumbers) {
      const order = await ctx.db
        .query("orders")
        .withIndex("by_order_number", (q) => q.eq("orderNumber", orderNumber))
        .first();
      if (!order) continue;

      const items = await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();

      result[orderNumber] = items
        .filter((item) => !item.isCancelled)
        .map((item) => ({
          _id: item._id as string,
          productName: item.productName ?? "Unknown",
          unitPrice: item.unitPrice ?? 0,
          quantity: item.quantity ?? 1,
          lineTotal: item.lineTotal ?? (item.unitPrice ?? 0) * (item.quantity ?? 1),
          menuProductId: item.menuProductId as string | undefined,
        }));
    }

    return result;
  },
});
