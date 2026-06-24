import type { Id } from "../../_generated/dataModel";
import { stripSubscriptionPricing } from "./stripSubscriptionPricing";

export function stripOrder<O extends Record<string, any>, I extends Record<string, any>>(
  role: string, order: O, items?: I[],
): { order: O; items: I[] } {
  return stripSubscriptionPricing(order, items ?? [], role);
}

/**
 * Batch price-strip seam (Phase D Slice 0, R2). NOT yet consumed in queries.ts —
 * the 10 current sites strip per-row via `stripOrder`. Intentionally kept as the
 * forward seam for the upcoming Phase D CRM list/timeline read queries, which
 * strip whole batches with a per-order item map. Do not delete as "dead code":
 * it is the batch entry point the next slice (D1/D2/D3) consumes.
 * Seeds a FRESH output map (never the caller's input) so only orders in the
 * batch get items returned, always stripped.
 */
export function stripOrders<O extends Record<string, any>, I extends Record<string, any>>(
  role: string, orders: O[], itemsByOrder?: Map<Id<"orders">, I[]>,
): { orders: O[]; itemsByOrder: Map<Id<"orders">, I[]> } {
  const outItems = new Map<Id<"orders">, I[]>();
  const outOrders = orders.map((o) => {
    const id = o._id as Id<"orders">;
    const { order, items } = stripSubscriptionPricing(o, itemsByOrder?.get(id) ?? [], role);
    if (itemsByOrder) outItems.set(id, items);
    return order;
  });
  return { orders: outOrders, itemsByOrder: outItems };
}
