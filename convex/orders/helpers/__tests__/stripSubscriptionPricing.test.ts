import { describe, it, expect, test } from "vitest";
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

// ============================================================
// Characterization Tests (pre-R2): pin TODAY's strip behavior
// These tests are the safety net that Task 2b (R2 seam) must
// keep green. Assertions reflect ACTUAL current behavior only —
// verified against stripSubscriptionPricing.ts + revenueGate.ts.
//
// Behavior confirmed:
//   Strip roles:    any role NOT in {"manager", "admin"}
//   Pass roles:     "manager", "admin" (MANAGERIAL set)
//   Sub detection:  fundingSource === "subscription_credit" OR subscriptionId != null
//   Order stripped: totalAmount, finalTotal, totalMargin, totalCost → undefined
//   Item stripped:  unitPrice, lineTotal, lineMargin, lineCost → undefined
//   Non-sub orders: UNTOUCHED regardless of role
//   Sentinel value: undefined (spread with explicit undefined, not null, not deleted)
//
// No discrepancy vs the task-2a-brief example — field lists and role splits match.
// ============================================================

describe("stripSubscriptionPricing characterization (pre-R2)", () => {
  // ---- shared fixtures ----
  const subOrderByFunding = {
    fundingSource: "subscription_credit",
    totalAmount: 5000,
    finalTotal: 5000,
    totalMargin: 1000,
    totalCost: 4000,
  } as any;

  const subOrderById = {
    subscriptionId: "sub-xyz",
    fundingSource: "direct",
    totalAmount: 5000,
    finalTotal: 5000,
    totalMargin: 1000,
    totalCost: 4000,
  } as any;

  const normalOrder = {
    fundingSource: "normal",
    totalAmount: 5000,
    finalTotal: 5000,
    totalMargin: 1000,
    totalCost: 4000,
  } as any;

  const orderItems = [
    {
      unitPrice: 2500,
      lineTotal: 5000,
      lineMargin: 500,
      lineCost: 2000,
      quantity: 2,
      productName: "X",
    },
  ] as any[];

  // ---- stripped roles × subscription order (via fundingSource) ----
  for (const role of ["kitchen", "order_staff"]) {
    test(`${role}: subscription order (fundingSource) — all money fields stripped to undefined`, () => {
      const { order: o, items: it } = stripSubscriptionPricing(subOrderByFunding, orderItems, role);
      // order-level money stripped
      expect(o.totalAmount).toBeUndefined();
      expect(o.finalTotal).toBeUndefined();
      expect(o.totalMargin).toBeUndefined();
      expect(o.totalCost).toBeUndefined();
      // item-level money stripped
      expect(it[0].unitPrice).toBeUndefined();
      expect(it[0].lineTotal).toBeUndefined();
      expect(it[0].lineMargin).toBeUndefined();
      expect(it[0].lineCost).toBeUndefined();
      // non-money fields preserved
      expect(it[0].quantity).toBe(2);
      expect(it[0].productName).toBe("X");
    });

    test(`${role}: subscription order (subscriptionId) — all money fields stripped to undefined`, () => {
      const { order: o, items: it } = stripSubscriptionPricing(subOrderById, orderItems, role);
      expect(o.totalAmount).toBeUndefined();
      expect(o.finalTotal).toBeUndefined();
      expect(o.totalMargin).toBeUndefined();
      expect(o.totalCost).toBeUndefined();
      expect(it[0].unitPrice).toBeUndefined();
      expect(it[0].lineTotal).toBeUndefined();
      expect(it[0].lineMargin).toBeUndefined();
      expect(it[0].lineCost).toBeUndefined();
    });

    test(`${role}: NON-subscription order — money fields untouched`, () => {
      const { order: o, items: it } = stripSubscriptionPricing(normalOrder, orderItems, role);
      expect(o.totalAmount).toBe(5000);
      expect(o.finalTotal).toBe(5000);
      expect(o.totalMargin).toBe(1000);
      expect(o.totalCost).toBe(4000);
      expect(it[0].unitPrice).toBe(2500);
      expect(it[0].lineTotal).toBe(5000);
      expect(it[0].lineMargin).toBe(500);
      expect(it[0].lineCost).toBe(2000);
    });
  }

  // ---- managerial roles × subscription order — money visible ----
  for (const role of ["manager", "admin"]) {
    test(`${role}: subscription order (fundingSource) — full pricing visible`, () => {
      const { order: o, items: it } = stripSubscriptionPricing(subOrderByFunding, orderItems, role);
      expect(o.totalAmount).toBe(5000);
      expect(o.finalTotal).toBe(5000);
      expect(o.totalMargin).toBe(1000);
      expect(o.totalCost).toBe(4000);
      expect(it[0].unitPrice).toBe(2500);
      expect(it[0].lineTotal).toBe(5000);
      expect(it[0].lineMargin).toBe(500);
      expect(it[0].lineCost).toBe(2000);
    });

    test(`${role}: subscription order (subscriptionId) — full pricing visible`, () => {
      const { order: o, items: it } = stripSubscriptionPricing(subOrderById, orderItems, role);
      expect(o.totalAmount).toBe(5000);
      expect(it[0].unitPrice).toBe(2500);
    });

    test(`${role}: NON-subscription order — money untouched`, () => {
      const { order: o } = stripSubscriptionPricing(normalOrder, orderItems, role);
      expect(o.totalAmount).toBe(5000);
      expect(o.totalMargin).toBe(1000);
    });
  }

  // ---- sentinel: stripped value is undefined, not null ----
  test("stripped fields are undefined (not null) — value semantics", () => {
    const { order: o } = stripSubscriptionPricing(subOrderByFunding, orderItems, "kitchen");
    expect(o.totalAmount).toBeUndefined();
    expect(o.totalAmount).not.toBeNull();
  });

  // ---- original object is not mutated ----
  test("original order object is not mutated by strip", () => {
    stripSubscriptionPricing(subOrderByFunding, orderItems, "kitchen");
    expect(subOrderByFunding.totalAmount).toBe(5000);
  });
});
