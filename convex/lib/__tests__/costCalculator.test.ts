import { describe, it, expect, test } from "vitest";
import {
  getBaseUnit,
  normalizeToBaseUnit,
  calculateCostPerBaseUnit,
  calculateLineCost,
  accumulateOrderCogs,
} from "../costCalculator";

// ============================================
// getBaseUnit() Tests - 6 tests
// ============================================
describe("getBaseUnit", () => {
  it("should return 'g' for 'kg' input", () => {
    expect(getBaseUnit("kg")).toBe("g");
  });

  it("should return 'g' for 'g' input", () => {
    expect(getBaseUnit("g")).toBe("g");
  });

  it("should return 'ml' for 'l' input", () => {
    expect(getBaseUnit("l")).toBe("ml");
  });

  it("should return 'ml' for 'ml' input", () => {
    expect(getBaseUnit("ml")).toBe("ml");
  });

  it("should return 'cm' for 'm' input", () => {
    expect(getBaseUnit("m")).toBe("cm");
  });

  it("should return the same unit for 'pcs' input", () => {
    expect(getBaseUnit("pcs")).toBe("pcs");
  });
});

// ============================================
// normalizeToBaseUnit() Tests - 8 tests
// ============================================
describe("normalizeToBaseUnit", () => {
  it("should convert kg to g by multiplying by 1000", () => {
    expect(normalizeToBaseUnit(2, "kg")).toBe(2000);
  });

  it("should convert l to ml by multiplying by 1000", () => {
    expect(normalizeToBaseUnit(1.5, "l")).toBe(1500);
  });

  it("should convert m to cm by multiplying by 100", () => {
    expect(normalizeToBaseUnit(3, "m")).toBe(300);
  });

  it("should keep g unchanged", () => {
    expect(normalizeToBaseUnit(500, "g")).toBe(500);
  });

  it("should keep ml unchanged", () => {
    expect(normalizeToBaseUnit(250, "ml")).toBe(250);
  });

  it("should keep pcs unchanged", () => {
    expect(normalizeToBaseUnit(10, "pcs")).toBe(10);
  });

  it("should handle zero quantity", () => {
    expect(normalizeToBaseUnit(0, "kg")).toBe(0);
  });

  it("should handle decimal values for kg conversion", () => {
    expect(normalizeToBaseUnit(0.5, "kg")).toBe(500);
  });
});

// ============================================
// calculateCostPerBaseUnit() Tests - 6 tests
// ============================================
describe("calculateCostPerBaseUnit", () => {
  it("should calculate cost per gram for kg purchases", () => {
    // Buy 2kg for 20000 (no shipping) = 10 per gram
    const result = calculateCostPerBaseUnit(20000, 0, 2, "kg");
    expect(result.costPerUnit).toBeCloseTo(10, 5);
    expect(result.baseUnit).toBe("g");
  });

  it("should include shipping cost in calculation", () => {
    // Buy 1kg for 8000 + 2000 shipping = 10000 total / 1000g = 10 per gram
    const result = calculateCostPerBaseUnit(8000, 2000, 1, "kg");
    expect(result.costPerUnit).toBeCloseTo(10, 5);
    expect(result.baseUnit).toBe("g");
  });

  it("should calculate cost per ml for liter purchases", () => {
    // Buy 2L for 10000 (no shipping) = 5 per ml
    const result = calculateCostPerBaseUnit(10000, 0, 2, "l");
    expect(result.costPerUnit).toBeCloseTo(5, 5);
    expect(result.baseUnit).toBe("ml");
  });

  it("should calculate cost per cm for meter purchases", () => {
    // Buy 5m for 50000 = 100 per cm
    const result = calculateCostPerBaseUnit(50000, 0, 5, "m");
    expect(result.costPerUnit).toBeCloseTo(100, 5);
    expect(result.baseUnit).toBe("cm");
  });

  it("should return 0 cost when volume is 0", () => {
    const result = calculateCostPerBaseUnit(10000, 1000, 0, "kg");
    expect(result.costPerUnit).toBe(0);
    expect(result.baseUnit).toBe("g");
  });

  it("should handle pcs unit type correctly", () => {
    // Buy 100 pcs for 50000 = 500 per piece
    const result = calculateCostPerBaseUnit(50000, 0, 100, "pcs");
    expect(result.costPerUnit).toBeCloseTo(500, 5);
    expect(result.baseUnit).toBe("pcs");
  });
});

// ============================================
// calculateLineCost() Tests - 4 tests
// ============================================
describe("calculateLineCost", () => {
  it("should calculate line cost for gram quantities", () => {
    // 500g at 10 per gram = 5000
    const result = calculateLineCost(10, 500, "g");
    expect(result).toBeCloseTo(5000, 5);
  });

  it("should convert kg to g and calculate cost", () => {
    // 2kg (= 2000g) at 5 per gram = 10000
    const result = calculateLineCost(5, 2, "kg");
    expect(result).toBeCloseTo(10000, 5);
  });

  it("should convert liters to ml and calculate cost", () => {
    // 0.5L (= 500ml) at 2 per ml = 1000
    const result = calculateLineCost(2, 0.5, "l");
    expect(result).toBeCloseTo(1000, 5);
  });

  it("should handle pcs unit without conversion", () => {
    // 25 pcs at 100 per piece = 2500
    const result = calculateLineCost(100, 25, "pcs");
    expect(result).toBeCloseTo(2500, 5);
  });
});

// ============================================
// accumulateOrderCogs() Tests
// ============================================
const cogsMapFixture = new Map([
  ["p1", { production: 100, packaging: 20, total: 120 }],
]);
test("sums mapped items, skips cancelled/unmapped/missing-id", () => {
  const items = [
    { menuProductId: "p1", quantity: 2 },
    { menuProductId: "p1", quantity: 1, isCancelled: true },
    { menuProductId: "p2", quantity: 5 },        // not in map → skip
    { quantity: 9 },                              // no id → skip
  ] as any[];
  expect(accumulateOrderCogs(items, cogsMapFixture)).toEqual({ production: 200, packaging: 40, total: 240 });
});
