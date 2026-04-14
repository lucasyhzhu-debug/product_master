/**
 * Phase 79 Wave 0 — Plan 01 Task 1
 *
 * Failing tests for the `buildPriceOracle` helper.
 *
 * Wave 1 (Plan 02) will add the `buildPriceOracle` export to
 * `convex/integrations/bigseller/helpers.ts`. Until then these tests fail red
 * with an import error ("buildPriceOracle is not exported from ../helpers").
 *
 * Anchor: RESEARCH.md §Code Examples — median-over-single-SKU-orders price oracle.
 */

import { describe, it, expect } from "vitest";
import { buildPriceOracle } from "../helpers";

type Sku = { sku: string; skuNum: number };
type OrderLike = {
  orderAmount?: number;
  saleAmount: number;
  skuVoList: ReadonlyArray<Sku>;
};

function mkOrder(partial: Partial<OrderLike> & { skuVoList: Sku[] }): OrderLike {
  return {
    saleAmount: 0,
    ...partial,
  };
}

describe("buildPriceOracle", () => {
  it("returns an empty Map when given no orders", () => {
    const oracle = buildPriceOracle([]);
    expect(oracle).toBeInstanceOf(Map);
    expect(oracle.size).toBe(0);
  });

  it("computes per-unit price from a single single-SKU order", () => {
    const oracle = buildPriceOracle([
      mkOrder({ orderAmount: 100000, saleAmount: 100000, skuVoList: [{ sku: "A", skuNum: 2 }] }),
    ]);
    expect(oracle.get("A")).toBe(50000);
  });

  it("takes the median across three samples for the same SKU", () => {
    // Per-unit prices: 40_000, 50_000, 60_000 → median 50_000
    const oracle = buildPriceOracle([
      mkOrder({ orderAmount: 40000, saleAmount: 40000, skuVoList: [{ sku: "A", skuNum: 1 }] }),
      mkOrder({ orderAmount: 100000, saleAmount: 100000, skuVoList: [{ sku: "A", skuNum: 2 }] }),
      mkOrder({ orderAmount: 60000, saleAmount: 60000, skuVoList: [{ sku: "A", skuNum: 1 }] }),
    ]);
    expect(oracle.get("A")).toBe(50000);
  });

  it("takes the mean of the two middles for even-length samples", () => {
    // Per-unit prices: 40_000, 50_000, 60_000, 70_000 → median = (50_000 + 60_000) / 2 = 55_000
    const oracle = buildPriceOracle([
      mkOrder({ orderAmount: 40000, saleAmount: 40000, skuVoList: [{ sku: "A", skuNum: 1 }] }),
      mkOrder({ orderAmount: 50000, saleAmount: 50000, skuVoList: [{ sku: "A", skuNum: 1 }] }),
      mkOrder({ orderAmount: 60000, saleAmount: 60000, skuVoList: [{ sku: "A", skuNum: 1 }] }),
      mkOrder({ orderAmount: 70000, saleAmount: 70000, skuVoList: [{ sku: "A", skuNum: 1 }] }),
    ]);
    expect(oracle.get("A")).toBe(55000);
  });

  it("ignores multi-SKU orders (cannot attribute price unambiguously)", () => {
    const oracle = buildPriceOracle([
      mkOrder({
        orderAmount: 100000,
        saleAmount: 100000,
        skuVoList: [
          { sku: "A", skuNum: 1 },
          { sku: "B", skuNum: 1 },
        ],
      }),
    ]);
    expect(oracle.has("A")).toBe(false);
    expect(oracle.has("B")).toBe(false);
  });

  it("ignores orders with skuNum <= 0 or baseAmount <= 0", () => {
    const oracle = buildPriceOracle([
      mkOrder({ orderAmount: 0, saleAmount: 0, skuVoList: [{ sku: "A", skuNum: 1 }] }),
      mkOrder({ orderAmount: 100000, saleAmount: 100000, skuVoList: [{ sku: "A", skuNum: 0 }] }),
      mkOrder({ orderAmount: -50000, saleAmount: -50000, skuVoList: [{ sku: "A", skuNum: 1 }] }),
    ]);
    expect(oracle.has("A")).toBe(false);
  });

  it("prefers orderAmount and falls back to saleAmount when undefined", () => {
    const oracle = buildPriceOracle([
      // Only saleAmount (orderAmount missing) → fallback to saleAmount.
      mkOrder({ saleAmount: 80000, skuVoList: [{ sku: "A", skuNum: 2 }] }),
      // orderAmount present → wins over saleAmount.
      mkOrder({ orderAmount: 100000, saleAmount: 999999, skuVoList: [{ sku: "B", skuNum: 2 }] }),
    ]);
    expect(oracle.get("A")).toBe(40000);
    expect(oracle.get("B")).toBe(50000);
  });
});
