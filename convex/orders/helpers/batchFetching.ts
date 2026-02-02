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
 * Batch fetch all order items and production records for given orders.
 * Groups data in memory to avoid N+1 queries.
 *
 * Performance: 2 DB queries instead of N + N*M queries
 * - 1 query: all orderItems
 * - 1 query: all orderItemProduction
 *
 * @param ctx - Convex query context
 * @param orderIds - List of order IDs to fetch data for
 * @returns Map of orderId -> { items, production }
 */
export async function fetchOrdersWithItemsAndProduction(
  ctx: QueryCtx,
  orderIds: Id<"orders">[]
): Promise<Map<Id<"orders">, OrderDataBatch>> {
  // Convert to Set for O(1) lookup
  const orderIdSet = new Set(orderIds.map((id) => id.toString()));

  // BATCH FETCH: Get all order items in one query
  const allItems = await ctx.db.query("orderItems").collect();

  // BATCH FETCH: Get all production records in one query
  const allProduction = await ctx.db.query("orderItemProduction").collect();

  // Build lookup maps
  const result = new Map<Id<"orders">, OrderDataBatch>();
  const itemIdToOrderId = new Map<string, Id<"orders">>();

  // First pass: Group items by order
  for (const item of allItems) {
    const orderIdStr = item.orderId.toString();

    // Filter to only requested orders
    if (!orderIdSet.has(orderIdStr)) continue;

    // Initialize order data if first item
    if (!result.has(item.orderId)) {
      result.set(item.orderId, {
        items: [],
        production: new Map(),
      });
    }

    // Add item to order
    result.get(item.orderId)!.items.push(item);

    // Track item -> order mapping for production records
    itemIdToOrderId.set(item._id.toString(), item.orderId);
  }

  // Second pass: Group production records by order item
  for (const record of allProduction) {
    const itemIdStr = record.orderItemId.toString();
    const orderId = itemIdToOrderId.get(itemIdStr);

    // Skip if item not in requested orders
    if (!orderId) continue;

    const orderData = result.get(orderId)!;

    // Initialize production array for item if first record
    if (!orderData.production.has(record.orderItemId)) {
      orderData.production.set(record.orderItemId, []);
    }

    // Add production record
    orderData.production.get(record.orderItemId)!.push(record);
  }

  return result;
}

/**
 * Batch fetch all order items (without production records).
 * Simpler version when production records are not needed.
 *
 * Performance: 1 DB query instead of N queries
 *
 * @param ctx - Convex query context
 * @param orderIds - List of order IDs to fetch items for
 * @returns Map of orderId -> items[]
 */
export async function fetchOrderItems(
  ctx: QueryCtx,
  orderIds: Id<"orders">[]
): Promise<Map<Id<"orders">, Doc<"orderItems">[]>> {
  const orderIdSet = new Set(orderIds.map((id) => id.toString()));
  const allItems = await ctx.db.query("orderItems").collect();

  const result = new Map<Id<"orders">, Doc<"orderItems">[]>();

  for (const item of allItems) {
    if (!orderIdSet.has(item.orderId.toString())) continue;

    if (!result.has(item.orderId)) {
      result.set(item.orderId, []);
    }

    result.get(item.orderId)!.push(item);
  }

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
