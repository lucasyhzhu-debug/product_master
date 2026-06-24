import { describe, it, expect } from "vitest";
import { coveredQty, remainderQty } from "../outOfCredit";

describe("coveredQty — floor division, integer IDR", () => {
  it("covers the full qty when credit is exactly enough", () => {
    expect(coveredQty(30_000, 10_000)).toBe(3);
  });

  it("floors when credit doesn't cover the last unit", () => {
    // 25_000 IDR / 10_000 = 2.5 → floor = 2
    expect(coveredQty(25_000, 10_000)).toBe(2);
  });

  it("returns 0 when credit is less than one unit", () => {
    expect(coveredQty(5_000, 10_000)).toBe(0);
  });

  it("returns 0 when credit is 0", () => {
    expect(coveredQty(0, 10_000)).toBe(0);
  });

  it("returns 0 when unitPrice is 0 (guard, no division by zero)", () => {
    expect(coveredQty(100_000, 0)).toBe(0);
  });

  it("returns 0 when unitPrice is negative (guard)", () => {
    expect(coveredQty(100_000, -1)).toBe(0);
  });
});

describe("remainderQty", () => {
  it("returns zero when fully covered", () => {
    expect(remainderQty(3, 3)).toBe(0);
  });

  it("returns the uncovered qty", () => {
    expect(remainderQty(5, 2)).toBe(3);
  });

  it("returns the full qty when covered is 0", () => {
    expect(remainderQty(4, 0)).toBe(4);
  });
});

describe("Path A split math end-to-end (pure)", () => {
  it("partial coverage: covered * unitPrice never exceeds remainingCredit", () => {
    const remaining = 25_000;
    const unitPrice = 10_000;
    const totalQty = 5;

    const covered = coveredQty(remaining, unitPrice);
    const coveredLineTotal = covered * unitPrice;

    expect(covered).toBe(2);
    expect(coveredLineTotal).toBe(20_000);
    expect(coveredLineTotal).toBeLessThanOrEqual(remaining);
    expect(remainderQty(totalQty, covered)).toBe(3);
  });
});
