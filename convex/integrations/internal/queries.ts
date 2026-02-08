import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";
import { REVENUE_COUNTABLE_STATUSES } from "./config";

/**
 * Fetch orders that qualify as revenue, optionally filtered by creation time.
 * Used by the internal adapter to build revenue records.
 */
export const getRevenueOrders = internalQuery({
  args: {
    sinceTimestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const allOrders = await ctx.db.query("orders").collect();

    return allOrders.filter((order) => {
      // Only revenue-countable statuses
      if (!(REVENUE_COUNTABLE_STATUSES as readonly string[]).includes(order.status)) {
        return false;
      }
      // Incremental: only orders created after the last sync
      if (args.sinceTimestamp && order._creationTime <= args.sinceTimestamp) {
        return false;
      }
      return true;
    });
  },
});
