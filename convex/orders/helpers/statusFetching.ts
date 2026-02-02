/**
 * Status-based order fetching helpers.
 * Eliminates duplicate status query patterns.
 */

import type { QueryCtx } from "../../_generated/server";
import type { Doc } from "../../_generated/dataModel";
import type { OrderStatus } from "./statusTransitions";

/**
 * Fetch orders by multiple statuses.
 * Consolidates duplicate query patterns.
 *
 * Performance: N queries where N = number of statuses
 * (Better than inline duplication, future: could optimize with OR query if Convex supports)
 *
 * @param ctx - Convex query context
 * @param statuses - Array of status values to query
 * @returns Combined array of orders matching any status
 */
export async function fetchOrdersByStatuses(
  ctx: QueryCtx,
  statuses: OrderStatus[]
): Promise<Doc<"orders">[]> {
  const results: Doc<"orders">[] = [];

  for (const status of statuses) {
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", status))
      .collect();

    results.push(...orders);
  }

  return results;
}

/**
 * Fetch orders by single status (convenience wrapper).
 *
 * @param ctx - Convex query context
 * @param status - Single status value
 * @returns Array of orders matching the status
 */
export async function fetchOrdersByStatus(
  ctx: QueryCtx,
  status: OrderStatus
): Promise<Doc<"orders">[]> {
  return await ctx.db
    .query("orders")
    .withIndex("by_status", (q) => q.eq("status", status))
    .collect();
}
