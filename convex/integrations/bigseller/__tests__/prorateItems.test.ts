/**
 * Phase 79 Wave 0 — Plan 01 Task 1
 *
 * Failing tests for the `prorateItems` helper.
 *
 * Anchor invariant (D-01): `Σ items.totalPrice === order.orderAmount` exactly —
 * residual IDR is pushed to the largest-qty item so integer equality holds.
 *
 * Wave 1 (Plan 02) will add the `prorateItems` export to
 * `convex/integrations/bigseller/helpers.ts`. Until then these tests fail red
 * with an import error.
 */

import { describe, it, expect } from "vitest";
// @ts-expect-error — Wave 1 will add this export. Red-bar by design.
import { prorateItems } from "../helpers";

type Sku = { sku: string; skuNum: number };
type MappingEntry = { menuProductId?: string; menuProductPrice?: number };

describe("prorateItems — D-01 sum invariant", () => {
  it("assigns 100% of a single-SKU order to that SKU (residual-safe)", () => {
    const items = prorateItems(
      { orderAmount: 100001, saleAmount: 100001, skuVoList: [{ sku: "A", skuNum: 3 }] },
      new Map<string, number>(),
      new Map<string, MappingEntry>(),
    );
    expect(items).toHaveLength(1);
    expect(items[0].sku).toBe("A");
    expect(items[0].skuNum).toBe(3);
    expect(items[0].totalPrice).toBe(100001); // residual stays on A
    expect(items[0].unitPrice).toBe(33334); // Math.round(100001 / 3) = 33334
  });

  it("pushes residual IDR to the largest-qty SKU in a multi-SKU order", () => {
    // orderAmount 100_001 split across A(qty=2) + B(qty=3) using flat share.
    // 1 IDR residual must land on B (largest qty).
    const items = prorateItems(
      {
        orderAmount: 100001,
        saleAmount: 100001,
        skuVoList: [
          { sku: "A", skuNum: 2 },
          { sku: "B", skuNum: 3 },
        ],
      },
      new Map<string, number>(),
      new Map<string, MappingEntry>(),
    );
    expect(items).toHaveLength(2);
    const sum = items.reduce((acc, it) => acc + it.totalPrice, 0);
    expect(sum).toBe(100001); // integer equality — no FP
  });

  it("uses the oracle price when present (primary signal)", () => {
    const oracle = new Map<string, number>([["A", 50000]]);
    const items = prorateItems(
      { orderAmount: 100000, saleAmount: 100000, skuVoList: [{ sku: "A", skuNum: 2 }] },
      oracle,
      new Map<string, MappingEntry>(),
    );
    expect(items[0].totalPrice).toBe(100000);
    expect(items[0].unitPrice).toBe(50000);
  });

  it("falls back to mappingBySku.menuProductPrice when oracle is empty (secondary)", () => {
    const mapping = new Map<string, MappingEntry>([["A", { menuProductPrice: 50000 }]]);
    const items = prorateItems(
      { orderAmount: 100000, saleAmount: 100000, skuVoList: [{ sku: "A", skuNum: 2 }] },
      new Map<string, number>(),
      mapping,
    );
    expect(items[0].totalPrice).toBe(100000);
    expect(items[0].unitPrice).toBe(50000);
  });

  it("falls back to equal-weighted flat share when oracle and mapping are both empty", () => {
    // 10_000 across [qty 2, qty 3] = 5 units → 2000/unit → A=4000, B=6000.
    const items = prorateItems(
      {
        orderAmount: 10000,
        saleAmount: 10000,
        skuVoList: [
          { sku: "A", skuNum: 2 },
          { sku: "B", skuNum: 3 },
        ],
      },
      new Map<string, number>(),
      new Map<string, MappingEntry>(),
    );
    const sum = items.reduce((acc, it) => acc + it.totalPrice, 0);
    expect(sum).toBe(10000);
    // Flat pro-rata on qty: A gets 2/5, B gets 3/5 of the total.
    expect(items.find((i) => i.sku === "A")!.totalPrice).toBe(4000);
    expect(items.find((i) => i.sku === "B")!.totalPrice).toBe(6000);
  });

  it("property: Σ items.totalPrice === orderAmount for 10 random orders", () => {
    // Deterministic "random" — fixed seed sequence so the property is reproducible.
    const seeds = [
      { amount: 12345, skus: [{ sku: "A", skuNum: 1 }] },
      { amount: 99999, skus: [{ sku: "A", skuNum: 2 }, { sku: "B", skuNum: 3 }] },
      { amount: 100001, skus: [{ sku: "A", skuNum: 7 }, { sku: "B", skuNum: 2 }] },
      { amount: 1, skus: [{ sku: "A", skuNum: 1 }, { sku: "B", skuNum: 1 }] },
      { amount: 7, skus: [{ sku: "A", skuNum: 3 }] },
      { amount: 250000, skus: [{ sku: "A", skuNum: 5 }, { sku: "B", skuNum: 5 }, { sku: "C", skuNum: 1 }] },
      { amount: 333, skus: [{ sku: "A", skuNum: 2 }, { sku: "B", skuNum: 3 }] },
      { amount: 40000, skus: [{ sku: "A", skuNum: 1 }, { sku: "B", skuNum: 1 }, { sku: "C", skuNum: 1 }, { sku: "D", skuNum: 1 }] },
      { amount: 500000, skus: [{ sku: "A", skuNum: 10 }] },
      { amount: 123456789, skus: [{ sku: "A", skuNum: 13 }, { sku: "B", skuNum: 7 }] },
    ];

    for (const s of seeds) {
      const items = prorateItems(
        { orderAmount: s.amount, saleAmount: s.amount, skuVoList: s.skus },
        new Map<string, number>(),
        new Map<string, MappingEntry>(),
      );
      const sum = items.reduce((acc, it) => acc + it.totalPrice, 0);
      expect(sum).toBe(s.amount);
    }
  });

  it("returns [] for an empty skuVoList", () => {
    const items = prorateItems(
      { orderAmount: 100, saleAmount: 100, skuVoList: [] },
      new Map<string, number>(),
      new Map<string, MappingEntry>(),
    );
    expect(items).toEqual([]);
  });
});
