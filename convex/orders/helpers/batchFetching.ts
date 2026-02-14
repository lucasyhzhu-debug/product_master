/**
 * Batch fetching helpers for orders queries.
 * Eliminates N+1 query patterns by fetching all data once and grouping in memory.
 */

import type { QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";

/**
 * Result structure for batch-fetched order data.
 */
export interface OrderDataBatch {
  items: Doc<"orderItems">[];
  production: Map<Id<"orderItems">, Doc<"orderItemProduction">[]>;
}

/**
 * Batch fetch order items and production records for given orders.
 * Uses per-order indexed lookups instead of full table scans.
 *
 * Performance: N + M indexed queries (where N = orders, M = items)
 * instead of 2 full table scans. Scales with active orders (~30-50)
 * not total history (~10000+).
 *
 * @param ctx - Convex query context
 * @param orderIds - List of order IDs to fetch data for
 * @returns Map of orderId -> { items, production }
 */
export async function fetchOrdersWithItemsAndProduction(
  ctx: QueryCtx,
  orderIds: Id<"orders">[]
): Promise<Map<Id<"orders">, OrderDataBatch>> {
  const result = new Map<Id<"orders">, OrderDataBatch>();

  // Fetch items per order in parallel using by_order index
  const allItems: Doc<"orderItems">[] = [];
  await Promise.all(orderIds.map(async (orderId) => {
    const items = await ctx.db.query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect();

    result.set(orderId, {
      items,
      production: new Map(),
    });

    allItems.push(...items);
  }));

  // Fetch production records per item in parallel using by_order_item index
  await Promise.all(allItems.map(async (item) => {
    const records = await ctx.db.query("orderItemProduction")
      .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
      .collect();

    if (records.length > 0) {
      const orderData = result.get(item.orderId);
      if (orderData) {
        orderData.production.set(item._id, records);
      }
    }
  }));

  return result;
}

/**
 * Batch fetch order items (without production records).
 * Uses per-order indexed lookups instead of full table scan.
 *
 * Performance: N indexed queries (where N = orders) instead of 1 full table scan.
 * Scales with active orders, not total history.
 *
 * @param ctx - Convex query context
 * @param orderIds - List of order IDs to fetch items for
 * @returns Map of orderId -> items[]
 */
export async function fetchOrderItems(
  ctx: QueryCtx,
  orderIds: Id<"orders">[]
): Promise<Map<Id<"orders">, Doc<"orderItems">[]>> {
  const result = new Map<Id<"orders">, Doc<"orderItems">[]>();

  await Promise.all(orderIds.map(async (orderId) => {
    const items = await ctx.db.query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect();
    result.set(orderId, items);
  }));

  return result;
}

/**
 * Batch fetch customers for given order list.
 *
 * Performance: Fetches unique customers only (N queries for N unique customers)
 *
 * @param ctx - Convex query context
 * @param orders - List of orders to fetch customers for
 * @returns Map of customerId -> customer
 */
export async function fetchCustomersForOrders(
  ctx: QueryCtx,
  orders: Doc<"orders">[]
): Promise<Map<string, Doc<"customers"> | null>> {
  // Get unique customer IDs
  const uniqueCustomerIds = [...new Set(orders.map((o) => o.customerId))];

  // Fetch all unique customers
  const customers = await Promise.all(
    uniqueCustomerIds.map((id) => ctx.db.get(id))
  );

  // Build lookup map
  const result = new Map<string, Doc<"customers"> | null>();
  for (let i = 0; i < uniqueCustomerIds.length; i++) {
    result.set(uniqueCustomerIds[i].toString(), customers[i]);
  }

  return result;
}
