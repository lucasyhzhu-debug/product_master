import { describe, it, expect } from "vitest";
import {
  generateOrderNumber,
  calculateLineTotals,
  calculateOrderTotals,
  calculateProductionUnitsNeeded,
} from "../helpers";

// ============================================
// generateOrderNumber() Tests - 8 tests
// ============================================
describe("generateOrderNumber", () => {
  it("should format order number as MMDD-NNN", () => {
    const date = new Date(2024, 0, 31); // January 31
    const result = generateOrderNumber(date, 0);
    expect(result).toBe("0131-001");
  });

  it("should pad month with leading zero", () => {
    const date = new Date(2024, 0, 15); // January 15
    const result = generateOrderNumber(date, 0);
    expect(result).toBe("0115-001");
  });

  it("should pad day with leading zero", () => {
    const date = new Date(2024, 11, 5); // December 5
    const result = generateOrderNumber(date, 0);
    expect(result).toBe("1205-001");
  });

  it("should increment sequence based on existing orders", () => {
    const date = new Date(2024, 0, 31);
    const result = generateOrderNumber(date, 5);
    expect(result).toBe("0131-006");
  });

  it("should pad sequence number to 3 digits", () => {
    const date = new Date(2024, 0, 31);
    const result = generateOrderNumber(date, 0);
    expect(result).toMatch(/^\d{4}-\d{3}$/);
  });

  it("should handle double digit months", () => {
    const date = new Date(2024, 9, 20); // October 20
    const result = generateOrderNumber(date, 0);
    expect(result).toBe("1020-001");
  });

  it("should handle double digit days", () => {
    const date = new Date(2024, 2, 25); // March 25
    const result = generateOrderNumber(date, 0);
    expect(result).toBe("0325-001");
  });

  it("should handle high sequence numbers", () => {
    const date = new Date(2024, 0, 31);
    const result = generateOrderNumber(date, 99);
    expect(result).toBe("0131-100");
  });
});

// ============================================
// calculateLineTotals() Tests - 4 tests
// ============================================
describe("calculateLineTotals", () => {
  it("should calculate line totals without discount", () => {
    const result = calculateLineTotals(2, 50000, 30000, 0);
    expect(result.lineTotal).toBe(100000); // 2 * 50000
    expect(result.lineCost).toBe(60000); // 2 * 30000
    expect(result.lineMargin).toBe(40000); // 100000 - 60000
  });

  it("should calculate line totals with discount", () => {
    const result = calculateLineTotals(3, 40000, 25000, 5000);
    // discountedPrice = 40000 - 5000 = 35000
    expect(result.lineTotal).toBe(105000); // 3 * 35000
    expect(result.lineCost).toBe(75000); // 3 * 25000
    expect(result.lineMargin).toBe(30000); // 105000 - 75000
  });

  it("should handle single quantity", () => {
    const result = calculateLineTotals(1, 75000, 50000, 10000);
    expect(result.lineTotal).toBe(65000); // 1 * (75000 - 10000)
    expect(result.lineCost).toBe(50000); // 1 * 50000
    expect(result.lineMargin).toBe(15000); // 65000 - 50000
  });

  it("should handle zero cost (free items)", () => {
    const result = calculateLineTotals(5, 20000, 0, 0);
    expect(result.lineTotal).toBe(100000); // 5 * 20000
    expect(result.lineCost).toBe(0);
    expect(result.lineMargin).toBe(100000); // All profit
  });
});

// ============================================
// calculateOrderTotals() Tests - 2 tests
// ============================================
describe("calculateOrderTotals", () => {
  it("should sum totals from multiple items", () => {
    const items = [
      { quantity: 2, unitPrice: 50000, unitCost: 30000 },
      { quantity: 3, unitPrice: 40000, unitCost: 25000, discountAmount: 5000 },
    ];
    const result = calculateOrderTotals(items);
    // Item 1: lineTotal=100000, lineCost=60000
    // Item 2: lineTotal=105000 (3 * 35000), lineCost=75000
    expect(result.totalAmount).toBe(205000);
    expect(result.totalCost).toBe(135000);
    expect(result.totalMargin).toBe(70000);
  });

  it("should return zeros for empty array", () => {
    const result = calculateOrderTotals([]);
    expect(result.totalAmount).toBe(0);
    expect(result.totalCost).toBe(0);
    expect(result.totalMargin).toBe(0);
  });
});

// ============================================
// calculateProductionUnitsNeeded() Tests - 11 tests
// ============================================
describe("calculateProductionUnitsNeeded", () => {
  // Basic functionality
  it("should calculate units for Original (1 ball per unit)", () => {
    const result = calculateProductionUnitsNeeded(1, 5);
    expect(result.unitsRequired).toBe(5);
  });

  it("should calculate units for Bite Sized Single (1 ball per unit)", () => {
    const result = calculateProductionUnitsNeeded(1, 3);
    expect(result.unitsRequired).toBe(3);
  });

  it("should calculate units for Bite Sized Double (2 balls per unit)", () => {
    const result = calculateProductionUnitsNeeded(2, 4);
    expect(result.unitsRequired).toBe(8);
  });

  it("should calculate units for Bite Sized Triple (3 balls per unit)", () => {
    const result = calculateProductionUnitsNeeded(3, 2);
    expect(result.unitsRequired).toBe(6);
  });

  // Edge cases
  it("should handle zero quantity", () => {
    const result = calculateProductionUnitsNeeded(3, 0);
    expect(result.unitsRequired).toBe(0);
  });

  it("should handle zero units per product", () => {
    const result = calculateProductionUnitsNeeded(0, 5);
    expect(result.unitsRequired).toBe(0);
  });

  it("should handle both zero", () => {
    const result = calculateProductionUnitsNeeded(0, 0);
    expect(result.unitsRequired).toBe(0);
  });

  // Large quantities
  it("should handle large quantity (100 units)", () => {
    const result = calculateProductionUnitsNeeded(1, 100);
    expect(result.unitsRequired).toBe(100);
  });

  it("should handle combo pack with multiple unit types (simulated)", () => {
    // Combo pack: 1 big ball + 2 mid balls
    // For 3 units ordered:
    const bigBalls = calculateProductionUnitsNeeded(1, 3);
    const midBalls = calculateProductionUnitsNeeded(2, 3);
    expect(bigBalls.unitsRequired).toBe(3);
    expect(midBalls.unitsRequired).toBe(6);
  });

  // Input validation
  it("should throw error for negative unitsPerProduct", () => {
    expect(() => {
      calculateProductionUnitsNeeded(-1, 5);
    }).toThrow("unitsPerProduct must be non-negative");
  });

  it("should throw error for negative quantity", () => {
    expect(() => {
      calculateProductionUnitsNeeded(3, -2);
    }).toThrow("quantity must be non-negative");
  });
});
