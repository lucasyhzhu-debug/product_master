/**
 * Consignment Settlement Per-Item Breakdown Tests (Phase 74.5.1-07 Task 7.3)
 *
 * Covers the variance-tolerance check that guards `createSettlement` when an
 * optional `items` array is supplied. Per RESEARCH Pitfall 2: per-product
 * breakdown total must match parent totalRevenue within ±1 IDR (rounding
 * tolerance).
 */

import { describe, expect, test } from "vitest";
import { assertItemsMatchTotalRevenue } from "../helpers";

describe("Req R1 / D74.5.1-L3 — consignment createSettlement items variance", () => {
  test("T-R1.consignment.items.1: exact-match items sum passes", () => {
    expect(() =>
      assertItemsMatchTotalRevenue(5_000_000, [
        { totalPrice: 3_000_000 },
        { totalPrice: 2_000_000 },
      ]),
    ).not.toThrow();
  });

  test("T-R1.consignment.items.2: ±1 IDR rounding tolerance passes", () => {
    // 999,999 + 1 = 1,000,000; tolerance absorbs rounding drift.
    expect(() =>
      assertItemsMatchTotalRevenue(1_000_000, [{ totalPrice: 999_999 }]),
    ).not.toThrow();
    expect(() =>
      assertItemsMatchTotalRevenue(1_000_000, [{ totalPrice: 1_000_001 }]),
    ).not.toThrow();
  });

  test("T-R1.consignment.items.3: >1 IDR variance throws descriptive error", () => {
    expect(() =>
      assertItemsMatchTotalRevenue(5_000_000, [
        { totalPrice: 3_000_000 },
        { totalPrice: 1_500_000 },
      ]),
    ).toThrow(
      /Per-product breakdown total \(4500000\) does not match settlement totalRevenue \(5000000\)/,
    );
  });

  test("T-R1.consignment.items.4: empty items array is a no-op (no throw)", () => {
    // Empty array means no breakdown supplied — parent-only path; skip the check.
    expect(() => assertItemsMatchTotalRevenue(5_000_000, [])).not.toThrow();
  });

  test("T-R1.consignment.items.5: error message names both numbers for debugging", () => {
    let err: Error | null = null;
    try {
      assertItemsMatchTotalRevenue(100_000, [{ totalPrice: 50_000 }]);
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/50000/);
    expect(err!.message).toMatch(/100000/);
    expect(err!.message).toMatch(/1 IDR tolerance/);
  });
});
