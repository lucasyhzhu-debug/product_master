import { describe, it, expect } from "vitest";
import { stripSubscriptionPricing } from "../stripSubscriptionPricing";

const order = (extra = {}) => ({ fundingSource: "subscription_credit", totalAmount: 4350000, finalTotal: 4350000, totalMargin: 4350000, totalCost: 0, ...extra });
const items = [{ productName: "Dubai", quantity: 150, unitPrice: 29000, lineTotal: 4350000, menuProductId: "p1" }];

describe("stripSubscriptionPricing", () => {
  it("strips price fields for a non-manager on a subscription order", () => {
    const r = stripSubscriptionPricing(order(), items, "kitchen");
    expect(r.order.totalAmount).toBeUndefined();
    expect(r.order.finalTotal).toBeUndefined();
    expect(r.items[0].unitPrice).toBeUndefined();
    expect(r.items[0].lineTotal).toBeUndefined();
    expect(r.items[0].quantity).toBe(150);          // qty + product KEPT
    expect(r.items[0].productName).toBe("Dubai");
  });
  it("keeps prices for a manager", () => {
    expect(stripSubscriptionPricing(order(), items, "manager").items[0].unitPrice).toBe(29000);
  });
  it("keeps prices for a non-manager on a NON-subscription order", () => {
    const r = stripSubscriptionPricing(order({ fundingSource: "normal", subscriptionId: undefined }), items, "order_staff");
    expect(r.items[0].unitPrice).toBe(29000);
  });
});
