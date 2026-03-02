/**
 * Unit tests for pure helper functions:
 * - buildProductCOGSMap (convex/lib/costCalculator.ts)
 * - calculateWeekRange (convex/lib/periodRange.ts)
 *
 * These are pure function tests -- no convex-test setup needed.
 */

import { expect, test, describe } from "vitest";
import { buildProductCOGSMap } from "../../convex/lib/costCalculator";
import { calculateWeekRange } from "../../convex/lib/periodRange";

// ============================================
// buildProductCOGSMap Tests
// ============================================

describe("buildProductCOGSMap", () => {
  test("resolves production + packaging correctly for single product", () => {
    const bomComponents = [
      { menuProductId: "prod1", componentTypeId: "ct1", quantity: 1 }, // BIG_BALL
      { menuProductId: "prod1", componentTypeId: "ct2", quantity: 1 }, // Small Box
      { menuProductId: "prod1", componentTypeId: "ct3", quantity: 1 }, // Sticker
    ];
    const componentTypes = [
      { _id: "ct1", unitCostIdr: 19231, category: "production" },
      { _id: "ct2", unitCostIdr: 1500, category: "packaging" },
      { _id: "ct3", unitCostIdr: 200, category: "packaging" },
    ];
    const result = buildProductCOGSMap(bomComponents, componentTypes);
    expect(result.get("prod1")).toEqual({
      production: 19231,
      packaging: 1700,
      total: 20931,
    });
  });

  test("returns empty map for empty inputs", () => {
    const result = buildProductCOGSMap([], []);
    expect(result.size).toBe(0);
  });

  test("skips unknown component type IDs", () => {
    const bomComponents = [
      { menuProductId: "prod1", componentTypeId: "unknown", quantity: 1 },
    ];
    const result = buildProductCOGSMap(bomComponents, []);
    expect(result.size).toBe(0); // Product not in map because no valid components
  });

  test("handles multiple products", () => {
    const bomComponents = [
      { menuProductId: "prod1", componentTypeId: "ct1", quantity: 1 },
      { menuProductId: "prod2", componentTypeId: "ct1", quantity: 2 },
    ];
    const componentTypes = [
      { _id: "ct1", unitCostIdr: 10000, category: "production" },
    ];
    const result = buildProductCOGSMap(bomComponents, componentTypes);
    expect(result.get("prod1")).toEqual({
      production: 10000,
      packaging: 0,
      total: 10000,
    });
    expect(result.get("prod2")).toEqual({
      production: 20000,
      packaging: 0,
      total: 20000,
    });
  });

  test("handles quantity > 1 for packaging components", () => {
    const bomComponents = [
      { menuProductId: "prod1", componentTypeId: "ct1", quantity: 3 }, // 3x Mid Ball
      { menuProductId: "prod1", componentTypeId: "ct2", quantity: 1 }, // Large Box
      { menuProductId: "prod1", componentTypeId: "ct3", quantity: 3 }, // 3x Sticker
    ];
    const componentTypes = [
      { _id: "ct1", unitCostIdr: 5000, category: "production" },
      { _id: "ct2", unitCostIdr: 2000, category: "packaging" },
      { _id: "ct3", unitCostIdr: 200, category: "packaging" },
    ];
    const result = buildProductCOGSMap(bomComponents, componentTypes);
    expect(result.get("prod1")).toEqual({
      production: 15000, // 3 * 5000
      packaging: 2600, // 2000 + 3*200
      total: 17600,
    });
  });

  test("treats non-production categories as packaging", () => {
    const bomComponents = [
      { menuProductId: "prod1", componentTypeId: "ct1", quantity: 1 },
      { menuProductId: "prod1", componentTypeId: "ct2", quantity: 1 },
    ];
    const componentTypes = [
      { _id: "ct1", unitCostIdr: 500, category: "direct_packaging" },
      { _id: "ct2", unitCostIdr: 100, category: "indirect_packaging" },
    ];
    const result = buildProductCOGSMap(bomComponents, componentTypes);
    expect(result.get("prod1")).toEqual({
      production: 0,
      packaging: 600,
      total: 600,
    });
  });
});

// ============================================
// calculateWeekRange Tests
// ============================================

describe("calculateWeekRange", () => {
  test("returns correct WIB week boundaries", () => {
    // Monday 2026-02-23 00:00 WIB = Sunday 2026-02-22 17:00 UTC
    const weekStart = Date.UTC(2026, 1, 22, 17, 0, 0); // Feb 22 17:00 UTC
    const result = calculateWeekRange(weekStart);

    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    expect(result.currentStart).toBe(weekStart);
    expect(result.currentEnd).toBe(weekStart + WEEK_MS);
    expect(result.previousStart).toBe(weekStart - WEEK_MS);
    expect(result.previousEnd).toBe(weekStart);
  });

  test("previous week does not overlap current", () => {
    const weekStart = Date.UTC(2026, 1, 22, 17, 0, 0);
    const result = calculateWeekRange(weekStart);
    expect(result.previousEnd).toBe(result.currentStart); // No gap, no overlap
  });

  test("week span is exactly 7 days", () => {
    const weekStart = Date.UTC(2026, 0, 5, 17, 0, 0); // Any Monday
    const result = calculateWeekRange(weekStart);
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    expect(result.currentEnd - result.currentStart).toBe(WEEK_MS);
    expect(result.previousEnd - result.previousStart).toBe(WEEK_MS);
  });

  test("handles epoch zero", () => {
    const result = calculateWeekRange(0);
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    expect(result.currentStart).toBe(0);
    expect(result.currentEnd).toBe(WEEK_MS);
    expect(result.previousStart).toBe(-WEEK_MS);
    expect(result.previousEnd).toBe(0);
  });
});
