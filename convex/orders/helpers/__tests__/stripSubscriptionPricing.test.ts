import { describe, it, expect } from "vitest";
import { stripSubscriptionPricing } from "../stripSubscriptionPricing";

const order = (extra = {}) => ({ fundingSource: "subscription_credit", totalAmount: 4350000, finalTotal: 4350000, totalMargin: 4350000, totalCost: 0, ...extra });
// CR-E: subscription items carry the CONFIDENTIAL partner price in lineMargin (lineCost is 0).
const items = [{ productName: "Dubai", quantity: 150, unitPrice: 29000, lineTotal: 4350000, lineMargin: 4350000, lineCost: 0, menuProductId: "p1" }];

describe("stripSubscriptionPricing", () => {
  it("strips price fields for a non-manager on a subscription order", () => {
    const r = stripSubscriptionPricing(order(), items, "kitchen");
    expect(r.order.totalAmount).toBeUndefined();
    expect(r.order.finalTotal).toBeUndefined();
    expect(r.order.totalMargin).toBeUndefined();
    expect(r.order.totalCost).toBeUndefined();
    expect(r.items[0].unitPrice).toBeUndefined();
    expect(r.items[0].lineTotal).toBeUndefined();
    // CR-E: lineMargin/lineCost MUST be stripped — partner price leaked via lineMargin.
    expect(r.items[0].lineMargin).toBeUndefined();
    expect(r.items[0].lineCost).toBeUndefined();
    expect(r.items[0].quantity).toBe(150);          // qty + product KEPT
    expect(r.items[0].productName).toBe("Dubai");
  });
  it("keeps prices (incl. lineMargin/lineCost) for a manager", () => {
    const r = stripSubscriptionPricing(order(), items, "manager");
    expect(r.items[0].unitPrice).toBe(29000);
    expect(r.items[0].lineMargin).toBe(4350000);
    expect(r.items[0].lineCost).toBe(0);
    expect(r.order.totalMargin).toBe(4350000);
  });
  it("keeps prices for a non-manager on a NON-subscription order", () => {
    const r = stripSubscriptionPricing(order({ fundingSource: "normal", subscriptionId: undefined }), items, "order_staff");
    expect(r.items[0].unitPrice).toBe(29000);
    expect(r.items[0].lineMargin).toBe(4350000);
  });
});
