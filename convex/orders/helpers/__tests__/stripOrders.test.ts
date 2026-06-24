import { stripOrder, stripOrders } from "../stripOrders";
import { stripSubscriptionPricing } from "../stripSubscriptionPricing";
import { expect, test } from "vitest";

const sub = { subscriptionId: "s1", totalAmount: 5000 } as any;
const enriched = [{ unitPrice: 100, lineTotal: 100, production: { balls: 3 }, quantity: 1 }] as any[];

test("stripOrder matches stripSubscriptionPricing for kitchen", () => {
  expect(stripOrder("kitchen", sub, enriched))
    .toEqual(stripSubscriptionPricing(sub, enriched, "kitchen"));
});
test("stripOrder tolerates omitted items", () => {
  const { items } = stripOrder("kitchen", sub);
  expect(items).toEqual([]);
});
test("stripOrders strips a batch, preserves enriched non-money fields", () => {
  const { orders, itemsByOrder } = stripOrders("kitchen", [sub], new Map([["o1" as any, enriched]]));
  expect(orders[0].totalAmount).toBeUndefined();
  expect(itemsByOrder.get("o1" as any)![0].production.balls).toBe(3);
});
