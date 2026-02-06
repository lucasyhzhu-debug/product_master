/**
 * BOM Cost Calculator Tests
 *
 * Tests for calculateMenuProductCOGS (Unified BOM system).
 * Pure function tests -- no Convex context needed.
 *
 * After category simplification: production | packaging (all packaging in COGS).
 */

import { describe, it, expect } from "vitest";
import { calculateMenuProductCOGS } from "../costCalculator";

// ============================================
// calculateMenuProductCOGS() Tests
// ============================================
describe("calculateMenuProductCOGS", () => {
  it("should calculate COGS for production-only product", () => {
    const components = [
      { unitCostIdr: 8000, category: "production" as const, quantity: 1 },
    ];

    const result = calculateMenuProductCOGS(components);

    expect(result.production).toBe(8000);
    expect(result.packaging).toBe(0);
    expect(result.total).toBe(8000);
  });

  it("should calculate COGS with production + packaging", () => {
    const components = [
      { unitCostIdr: 3000, category: "production" as const, quantity: 3 }, // 9000
      { unitCostIdr: 500, category: "packaging" as const, quantity: 1 }, // 500
      { unitCostIdr: 50, category: "packaging" as const, quantity: 3 }, // 150
    ];

    const result = calculateMenuProductCOGS(components);

    expect(result.production).toBe(9000);
    expect(result.packaging).toBe(650);
    expect(result.total).toBe(9650); // production + ALL packaging
  });

  it("should include ALL packaging in total COGS (business decision)", () => {
    const components = [
      { unitCostIdr: 8000, category: "production" as const, quantity: 1 }, // 8000
      { unitCostIdr: 500, category: "packaging" as const, quantity: 1 }, // 500
      { unitCostIdr: 200, category: "packaging" as const, quantity: 1 }, // 200
    ];

    const result = calculateMenuProductCOGS(components);

    expect(result.production).toBe(8000);
    expect(result.packaging).toBe(700);
    expect(result.total).toBe(8700); // ALL packaging included
  });

  it("should handle empty components array", () => {
    const result = calculateMenuProductCOGS([]);

    expect(result.production).toBe(0);
    expect(result.packaging).toBe(0);
    expect(result.total).toBe(0);
  });

  it("should handle multiple production units (e.g., 3 Mid Ball)", () => {
    const components = [
      { unitCostIdr: 4500, category: "production" as const, quantity: 3 },
    ];

    const result = calculateMenuProductCOGS(components);

    expect(result.production).toBe(13500);
    expect(result.total).toBe(13500);
  });

  it("should match ORIGINAL product COGS (1 Big Ball + packaging)", () => {
    // ORIGINAL: 1 Big Ball (80g) + Long Box + Sticker
    const components = [
      { unitCostIdr: 11231, category: "production" as const, quantity: 1 },
      { unitCostIdr: 5000, category: "packaging" as const, quantity: 1 },
      { unitCostIdr: 3000, category: "packaging" as const, quantity: 1 },
    ];

    const result = calculateMenuProductCOGS(components);

    expect(result.production).toBe(11231);
    expect(result.packaging).toBe(8000);
    expect(result.total).toBe(19231);
  });

  it("should handle zero-cost components", () => {
    const components = [
      { unitCostIdr: 0, category: "production" as const, quantity: 5 },
      { unitCostIdr: 0, category: "packaging" as const, quantity: 3 },
    ];

    const result = calculateMenuProductCOGS(components);

    expect(result.production).toBe(0);
    expect(result.packaging).toBe(0);
    expect(result.total).toBe(0);
  });

  it("should handle zero-quantity components", () => {
    const components = [
      { unitCostIdr: 5000, category: "production" as const, quantity: 0 },
    ];

    const result = calculateMenuProductCOGS(components);

    expect(result.production).toBe(0);
    expect(result.total).toBe(0);
  });

  it("should handle legacy categories (backward compat during migration)", () => {
    // Legacy categories should be treated as packaging
    const components = [
      { unitCostIdr: 8000, category: "production", quantity: 1 },
      { unitCostIdr: 500, category: "direct_packaging", quantity: 1 },
      { unitCostIdr: 200, category: "indirect_packaging", quantity: 1 },
    ];

    const result = calculateMenuProductCOGS(components);

    expect(result.production).toBe(8000);
    expect(result.packaging).toBe(700); // Both legacy types counted as packaging
    expect(result.total).toBe(8700);
  });
});
