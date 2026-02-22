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
 * Uses by_creationTime index for index-backed filtering (avoids full table scan).
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
        .withIndex("by_creationTime", (q) => q.gte("_creationTime", cutoff))
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
