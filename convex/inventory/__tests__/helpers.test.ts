/**
 * Inventory Helper Pure Function Tests
 *
 * Tests for calculateWeightedAvgCost, validateStockAdjustment,
 * getAvailableQuantity, and isBatchExpired.
 */

import { describe, it, expect } from "vitest";
import {
  calculateWeightedAvgCost,
  validateStockAdjustment,
  getAvailableQuantity,
  isBatchExpired,
} from "../helpers";
import type { Doc } from "../../_generated/dataModel";

// Helper to create mock batch for testing
function createMockBatch(overrides: Partial<Doc<"inventoryBatches">> = {}): Doc<"inventoryBatches"> {
  return {
    _id: "test-batch-id" as any,
    _creationTime: Date.now(),
    componentTypeId: "component-id" as any,
    locationId: "location-id" as any,
    purchaseDate: Date.now(),
    supplierName: "Test Supplier",
    quantityPurchased: 100,
    totalCostIdr: 50000,
    unitCostIdr: 500,
    quantityRemaining: 100,
    quantityReserved: 0,
    status: "active",
    createdBy: "test",
    createdAt: Date.now(),
    ...overrides,
  } as Doc<"inventoryBatches">;
}

// ============================================
// calculateWeightedAvgCost Tests
// ============================================
describe("calculateWeightedAvgCost", () => {
  it("should calculate weighted average from single batch", () => {
    const batches = [{ quantityRemaining: 100, unitCostIdr: 500 }];
    expect(calculateWeightedAvgCost(batches)).toBe(500);
  });

  it("should calculate weighted average from multiple batches", () => {
    const batches = [
      { quantityRemaining: 100, unitCostIdr: 500 }, // value: 50000
      { quantityRemaining: 50, unitCostIdr: 600 },  // value: 30000
    ];
    // Total value: 80000, total qty: 150 => avg: 533.33
    expect(calculateWeightedAvgCost(batches)).toBeCloseTo(533.33, 1);
  });

  it("should return 0 for empty batches", () => {
    expect(calculateWeightedAvgCost([])).toBe(0);
  });

  it("should return 0 when all batches have zero quantity", () => {
    const batches = [
      { quantityRemaining: 0, unitCostIdr: 500 },
      { quantityRemaining: 0, unitCostIdr: 600 },
    ];
    expect(calculateWeightedAvgCost(batches)).toBe(0);
  });

  it("should weight by remaining quantity not purchased", () => {
    const batches = [
      { quantityRemaining: 10, unitCostIdr: 1000 },  // value: 10000
      { quantityRemaining: 90, unitCostIdr: 500 },   // value: 45000
    ];
    // Total value: 55000, total qty: 100 => avg: 550
    expect(calculateWeightedAvgCost(batches)).toBe(550);
  });
});

// ============================================
// validateStockAdjustment Tests
// ============================================
describe("validateStockAdjustment", () => {
  it("should accept positive adjustment", () => {
    const batch = createMockBatch({ quantityRemaining: 100, quantityReserved: 0 });
    expect(() => validateStockAdjustment(batch, 50)).not.toThrow();
  });

  it("should accept adjustment down to reserved amount", () => {
    const batch = createMockBatch({ quantityRemaining: 100, quantityReserved: 30 });
    // Remove 70, remaining=30, reserved=30, available=0 => OK
    expect(() => validateStockAdjustment(batch, -70)).not.toThrow();
  });

  it("should reject adjustment creating negative stock", () => {
    const batch = createMockBatch({ quantityRemaining: 50, quantityReserved: 0 });
    expect(() => validateStockAdjustment(batch, -60)).toThrow(
      "negative stock"
    );
  });

  it("should reject adjustment creating negative available stock", () => {
    const batch = createMockBatch({ quantityRemaining: 100, quantityReserved: 80 });
    // Remove 30, remaining=70, reserved=80 => available=-10 => REJECT
    expect(() => validateStockAdjustment(batch, -30)).toThrow(
      "negative available stock"
    );
  });

  it("should accept zero adjustment", () => {
    const batch = createMockBatch({ quantityRemaining: 50, quantityReserved: 10 });
    expect(() => validateStockAdjustment(batch, 0)).not.toThrow();
  });
});

// ============================================
// getAvailableQuantity Tests
// ============================================
describe("getAvailableQuantity", () => {
  it("should return remaining minus reserved", () => {
    const batch = createMockBatch({ quantityRemaining: 100, quantityReserved: 30 });
    expect(getAvailableQuantity(batch)).toBe(70);
  });

  it("should return 0 when fully reserved", () => {
    const batch = createMockBatch({ quantityRemaining: 50, quantityReserved: 50 });
    expect(getAvailableQuantity(batch)).toBe(0);
  });

  it("should return full quantity when nothing reserved", () => {
    const batch = createMockBatch({ quantityRemaining: 200, quantityReserved: 0 });
    expect(getAvailableQuantity(batch)).toBe(200);
  });
});

// ============================================
// isBatchExpired Tests
// ============================================
describe("isBatchExpired", () => {
  it("should return false when no expiry date", () => {
    const batch = createMockBatch({ expiryDate: undefined });
    expect(isBatchExpired(batch)).toBe(false);
  });

  it("should return true when expiry date is in the past", () => {
    const batch = createMockBatch({
      expiryDate: Date.now() - 86400000, // yesterday
    });
    expect(isBatchExpired(batch)).toBe(true);
  });

  it("should return false when expiry date is in the future", () => {
    const batch = createMockBatch({
      expiryDate: Date.now() + 86400000, // tomorrow
    });
    expect(isBatchExpired(batch)).toBe(false);
  });

  it("should use custom now timestamp", () => {
    const batch = createMockBatch({
      expiryDate: 1000000,
    });
    // Before expiry
    expect(isBatchExpired(batch, 500000)).toBe(false);
    // After expiry
    expect(isBatchExpired(batch, 2000000)).toBe(true);
  });
});
