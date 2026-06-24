import type { Id } from "../../_generated/dataModel";
import { stripSubscriptionPricing } from "./stripSubscriptionPricing";

export function stripOrder<O extends Record<string, any>, I extends Record<string, any>>(
  role: string, order: O, items?: I[],
): { order: O; items: I[] } {
  return stripSubscriptionPricing(order, items ?? [], role);
}

export function stripOrders<O extends Record<string, any>, I extends Record<string, any>>(
  role: string, orders: O[], itemsByOrder?: Map<Id<"orders">, I[]>,
): { orders: O[]; itemsByOrder: Map<Id<"orders">, I[]> } {
  // Seed outItems from the input map so caller-keyed entries are preserved
  const outItems = new Map<Id<"orders">, I[]>(itemsByOrder);
  const outOrders = orders.map((o) => {
    const id = o._id as Id<"orders">;
    const { order, items } = stripSubscriptionPricing(o, itemsByOrder?.get(id) ?? [], role);
    if (itemsByOrder) outItems.set(id, items);
    return order;
  });
  return { orders: outOrders, itemsByOrder: outItems };
}
