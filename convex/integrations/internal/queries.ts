import { internalQuery } from "../../_generated/server";
import { REVENUE_COUNTABLE_STATUSES } from "./config";

/**
 * Fetch all orders that qualify as revenue.
 * Used by the internal adapter to build revenue records.
 * Deduplication by orderNumber is handled downstream in saveRevenue.
 */
export const getRevenueOrders = internalQuery({
  args: {},
  handler: async (ctx) => {
    const allOrders = await ctx.db.query("orders").collect();

    return allOrders.filter((order) =>
      (REVENUE_COUNTABLE_STATUSES as readonly string[]).includes(order.status)
    );
  },
});
