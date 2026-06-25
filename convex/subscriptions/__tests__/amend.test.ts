import { describe, it, expect } from "vitest";
import { computeTopupDelta } from "../amend";

const NAMES = { p1: "Original 80g", p2: "Bite 45g" };
const PRICE = 10_000;

describe("computeTopupDelta — server-side delta, integer IDR", () => {
  it("bills only the positive per-product increase", () => {
    const r = computeTopupDelta({
      currentQtyByProduct: { p1: 3, p2: 2 },
      newQtyByProduct: { p1: 5, p2: 2 }, // +2 of p1
      unitPrice: PRICE,
      productNameByProduct: NAMES,
    });
    expect(r.deltaTotal).toBe(20_000);
    expect(r.addedLines).toEqual([{ productName: "Original 80g", qty: 2, unitPrice: PRICE, lineTotal: 20_000 }]);
  });
  it("ignores decreases (v1 supports increases only)", () => {
    const r = computeTopupDelta({
      currentQtyByProduct: { p1: 5 },
      newQtyByProduct: { p1: 3 },
      unitPrice: PRICE,
      productNameByProduct: NAMES,
    });
    expect(r.deltaTotal).toBe(0);
    expect(r.addedLines).toEqual([]);
  });
  it("handles a brand-new product line in the amendment", () => {
    const r = computeTopupDelta({
      currentQtyByProduct: { p1: 1 },
      newQtyByProduct: { p1: 1, p2: 4 },
      unitPrice: PRICE,
      productNameByProduct: NAMES,
    });
    expect(r.deltaTotal).toBe(40_000);
    expect(r.addedLines).toEqual([{ productName: "Bite 45g", qty: 4, unitPrice: PRICE, lineTotal: 40_000 }]);
  });
  it("sums multiple increases", () => {
    const r = computeTopupDelta({
      currentQtyByProduct: { p1: 1, p2: 1 },
      newQtyByProduct: { p1: 3, p2: 4 },
      unitPrice: PRICE,
      productNameByProduct: NAMES,
    });
    expect(r.deltaTotal).toBe(50_000); // (+2 + +3) * 10_000
  });
});
