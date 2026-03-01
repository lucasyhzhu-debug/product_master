/**
 * Tests for getLifetimeTotalsInternal ball counting logic.
 *
 * Verifies that "balls sold" counts BOM production components (Big Ball, Mid Ball)
 * instead of raw product-level quantities. A hamper with 1 Big Ball + 2 Mid Balls
 * should count as 3 balls, not 1 unit.
 *
 * Uses the unified BOM system: menuProductComponents + componentTypes (category="production").
 */

import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { estimateBallsFromName } from "../../convex/externalData/queries";
import {
  createMenuProductWithBOM,
  createExternalRevenue,
} from "./helpers";
import type { TestConvex } from "convex-test";
import type { Id } from "../../convex/_generated/dataModel";

type TestContext = TestConvex<typeof schema>;

// ============================================
// Helper: insert an externalRevenueItem directly
// ============================================
async function createRevenueItem(
  t: TestContext,
  revenueId: Id<"externalRevenue">,
  overrides: {
    source?: "k3mart" | "gobiz" | "internal" | "grabfood";
    productName?: string;
    unitPrice?: number;
    quantity?: number;
    totalPrice?: number;
    linkedMenuProductId?: Id<"menuProducts">;
  } = {}
): Promise<Id<"externalRevenueItems">> {
  const quantity = overrides.quantity ?? 1;
  const unitPrice = overrides.unitPrice ?? 25000;
  return await t.run(async (ctx) => {
    return await ctx.db.insert("externalRevenueItems", {
      revenueId,
      source: overrides.source ?? "gobiz",
      productName: overrides.productName ?? "Test Product",
      unitPrice,
      quantity,
      totalPrice: overrides.totalPrice ?? quantity * unitPrice,
      linkedMenuProductId: overrides.linkedMenuProductId,
      isAutoMatched: !!overrides.linkedMenuProductId,
      createdAt: Date.now(),
    });
  });
}

// ============================================
// Single Product Ball Counting — 3 tests
// ============================================
describe("getLifetimeTotalsInternal ball counting", () => {
  test("product with 1 Big Ball counts as 1 ball", async () => {
    const t = convexTest(schema);

    // Create menu product with 1 BIG_BALL via BOM
    const { menuProductId } = await createMenuProductWithBOM(t, {
      name: "Original 80g",
      ballConfig: [{ code: "BIG_BALL", quantity: 1 }],
    });

    // Create revenue + item linked to this product
    const revenueId = await createExternalRevenue(t, { source: "gobiz" });
    await createRevenueItem(t, revenueId, {
      source: "gobiz",
      productName: "Original 80g",
      quantity: 5,
      linkedMenuProductId: menuProductId,
    });

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    // 5 units * 1 ball/unit = 5 balls
    expect(result.totalBalls).toBe(5);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].totalBalls).toBe(5);
    expect(result.products[0].productName).toBe("Original 80g");
  });

  test("product with 3 Mid Balls counts as 3 balls per unit", async () => {
    const t = convexTest(schema);

    // Create menu product with 3 MID_BALLs (e.g., Bite Triple)
    const { menuProductId } = await createMenuProductWithBOM(t, {
      name: "Bite Triple 135g",
      ballConfig: [{ code: "MID_BALL", quantity: 3 }],
    });

    const revenueId = await createExternalRevenue(t, { source: "k3mart" });
    await createRevenueItem(t, revenueId, {
      source: "k3mart",
      productName: "Bite Triple 135g",
      quantity: 10,
      linkedMenuProductId: menuProductId,
    });

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    // 10 units * 3 balls/unit = 30 balls
    expect(result.totalBalls).toBe(30);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].totalBalls).toBe(30);
  });

  test("product with 1 Big Ball + 2 Mid Balls counts as 3 balls per unit (hamper case)", async () => {
    const t = convexTest(schema);

    // Create menu product with mixed balls (e.g., Original Triple hamper)
    const { menuProductId } = await createMenuProductWithBOM(t, {
      name: "Original Triple 135g",
      ballConfig: [
        { code: "BIG_BALL", quantity: 1 },
        { code: "MID_BALL", quantity: 2 },
      ],
    });

    const revenueId = await createExternalRevenue(t, { source: "internal" });
    await createRevenueItem(t, revenueId, {
      source: "internal",
      productName: "Original Triple 135g",
      quantity: 4,
      linkedMenuProductId: menuProductId,
    });

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    // 4 units * (1 + 2) balls/unit = 12 balls
    expect(result.totalBalls).toBe(12);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].totalBalls).toBe(12);
  });
});

// ============================================
// Unmapped Product Fallback — 1 test
// ============================================
describe("getLifetimeTotalsInternal unmapped fallback", () => {
  test("unmapped product with no multiplier keyword falls back to 1 ball per unit", async () => {
    const t = convexTest(schema);

    const revenueId = await createExternalRevenue(t, { source: "grabfood" });

    // No linkedMenuProductId, name has no multiplier keyword
    await createRevenueItem(t, revenueId, {
      source: "grabfood",
      productName: "Unknown GrabFood Item",
      quantity: 7,
      // linkedMenuProductId intentionally omitted
    });

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    // 7 units * 1 (no keyword match -> default) = 7 balls
    expect(result.totalBalls).toBe(7);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].totalBalls).toBe(7);
    expect(result.products[0].menuProductId).toBeUndefined();
  });
});

// ============================================
// estimateBallsFromName — pure function unit tests
// ============================================
describe("estimateBallsFromName", () => {
  test("'Frollie Triple' returns 3", () => {
    expect(estimateBallsFromName("Frollie Triple")).toBe(3);
  });

  test("'Frollie Double' returns 2", () => {
    expect(estimateBallsFromName("Frollie Double")).toBe(2);
  });

  test("'Frollie Original' returns 1 (default)", () => {
    expect(estimateBallsFromName("Frollie Original")).toBe(1);
  });

  test("'Frollie 6 Pack' returns 6", () => {
    expect(estimateBallsFromName("Frollie 6 Pack")).toBe(6);
  });

  test("unknown product name returns 1 (safe default)", () => {
    expect(estimateBallsFromName("Mystery Snack Box")).toBe(1);
  });

  test("case insensitive: 'TRIPLE PACK' returns 3", () => {
    expect(estimateBallsFromName("TRIPLE PACK")).toBe(3);
  });

  test("'3 Pack' variant returns 3", () => {
    expect(estimateBallsFromName("Frollie 3 Pack")).toBe(3);
  });

  test("'3pack' (no space) variant returns 3", () => {
    expect(estimateBallsFromName("Frollie 3pack")).toBe(3);
  });

  test("'2 pack' variant returns 2", () => {
    expect(estimateBallsFromName("Frollie 2 pack")).toBe(2);
  });

  test("'2pack' (no space) variant returns 2", () => {
    expect(estimateBallsFromName("Snack 2pack")).toBe(2);
  });

  test("'6pack' (no space) variant returns 6", () => {
    expect(estimateBallsFromName("Party 6pack")).toBe(6);
  });

  test("'single' returns 1", () => {
    expect(estimateBallsFromName("Frollie Single")).toBe(1);
  });

  test("empty string returns 1 (safe default)", () => {
    expect(estimateBallsFromName("")).toBe(1);
  });
});

// ============================================
// Name-based estimation integration tests
// ============================================
describe("getLifetimeTotalsInternal name-based estimation for unmapped items", () => {
  test("unmapped 'Triple' product counts 3 balls per unit", async () => {
    const t = convexTest(schema);

    const revenueId = await createExternalRevenue(t, { source: "grabfood" });
    await createRevenueItem(t, revenueId, {
      source: "grabfood",
      productName: "Frollie Triple",
      quantity: 4,
    });

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    // 4 units * 3 balls (triple) = 12 balls
    expect(result.totalBalls).toBe(12);
    expect(result.products[0].totalBalls).toBe(12);
  });

  test("unmapped 'Double' product counts 2 balls per unit", async () => {
    const t = convexTest(schema);

    const revenueId = await createExternalRevenue(t, { source: "k3mart" });
    await createRevenueItem(t, revenueId, {
      source: "k3mart",
      productName: "Frollie Double",
      quantity: 5,
    });

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    // 5 units * 2 balls (double) = 10 balls
    expect(result.totalBalls).toBe(10);
    expect(result.products[0].totalBalls).toBe(10);
  });

  test("unmapped '6 Pack' product counts 6 balls per unit", async () => {
    const t = convexTest(schema);

    const revenueId = await createExternalRevenue(t, { source: "gobiz" });
    await createRevenueItem(t, revenueId, {
      source: "gobiz",
      productName: "Frollie 6 Pack",
      quantity: 2,
    });

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    // 2 units * 6 balls (6 pack) = 12 balls
    expect(result.totalBalls).toBe(12);
    expect(result.products[0].totalBalls).toBe(12);
  });

  test("mixed unmapped products with different multipliers aggregate correctly", async () => {
    const t = convexTest(schema);

    const rev = await createExternalRevenue(t, { source: "internal" });

    // 3 units of "Frollie Triple" -> 3 * 3 = 9 balls
    await createRevenueItem(t, rev, {
      source: "internal",
      productName: "Frollie Triple",
      quantity: 3,
    });

    // 5 units of "Frollie Double" -> 5 * 2 = 10 balls
    await createRevenueItem(t, rev, {
      source: "internal",
      productName: "Frollie Double",
      quantity: 5,
    });

    // 10 units of "Frollie Original" -> 10 * 1 = 10 balls
    await createRevenueItem(t, rev, {
      source: "internal",
      productName: "Frollie Original",
      quantity: 10,
    });

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    // Total: 9 + 10 + 10 = 29 balls
    expect(result.totalBalls).toBe(29);
    expect(result.products).toHaveLength(3);

    const triple = result.products.find((p) => p.productName === "Frollie Triple");
    const double = result.products.find((p) => p.productName === "Frollie Double");
    const original = result.products.find((p) => p.productName === "Frollie Original");

    expect(triple?.totalBalls).toBe(9);
    expect(double?.totalBalls).toBe(10);
    expect(original?.totalBalls).toBe(10);
  });
});

// ============================================
// Aggregation Across Multiple Items — 2 tests
// ============================================
describe("getLifetimeTotalsInternal aggregation", () => {
  test("multiple order items for same product aggregate correctly", async () => {
    const t = convexTest(schema);

    // Create a product with 2 MID_BALLs (Bite Double)
    const { menuProductId } = await createMenuProductWithBOM(t, {
      name: "Bite Double 90g",
      ballConfig: [{ code: "MID_BALL", quantity: 2 }],
    });

    // Two separate revenue records with items for same product
    const rev1 = await createExternalRevenue(t, { source: "k3mart" });
    await createRevenueItem(t, rev1, {
      source: "k3mart",
      productName: "Bite Double 90g",
      quantity: 3,
      linkedMenuProductId: menuProductId,
    });

    const rev2 = await createExternalRevenue(t, { source: "gobiz" });
    await createRevenueItem(t, rev2, {
      source: "gobiz",
      productName: "Bite Double 90g",
      quantity: 5,
      linkedMenuProductId: menuProductId,
    });

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    // (3 + 5) items * 2 balls/item = 16 balls total
    expect(result.totalBalls).toBe(16);
    expect(result.products).toHaveLength(1);
    expect(result.products[0].totalBalls).toBe(16);

    // Verify per-source breakdown
    expect(result.products[0].bySource["k3mart"]).toBe(6); // 3 * 2
    expect(result.products[0].bySource["gobiz"]).toBe(10); // 5 * 2
  });

  test("multiple different products aggregate into correct total", async () => {
    const t = convexTest(schema);

    // Product A: 1 BIG_BALL (Original)
    const { menuProductId: productAId } = await createMenuProductWithBOM(t, {
      code: "ORIG-001",
      name: "Original 80g",
      ballConfig: [{ code: "BIG_BALL", quantity: 1 }],
    });

    // Product B: 1 BIG_BALL + 2 MID_BALL (Triple hamper)
    // Note: BIG_BALL componentType already created by Product A,
    // so createMenuProductWithBOM will create a second one — that's fine,
    // the query scans all componentTypes.
    const { menuProductId: productBId } = await createMenuProductWithBOM(t, {
      code: "TRIPLE-001",
      name: "Original Triple 135g",
      ballConfig: [
        { code: "BIG_BALL", quantity: 1 },
        { code: "MID_BALL", quantity: 2 },
      ],
    });

    const rev = await createExternalRevenue(t, { source: "internal" });

    // 10 units of Original (1 ball each) = 10 balls
    await createRevenueItem(t, rev, {
      source: "internal",
      productName: "Original 80g",
      quantity: 10,
      linkedMenuProductId: productAId,
    });

    // 4 units of Triple (3 balls each) = 12 balls
    await createRevenueItem(t, rev, {
      source: "internal",
      productName: "Original Triple 135g",
      quantity: 4,
      linkedMenuProductId: productBId,
    });

    // 3 units of unmapped item (1 ball fallback) = 3 balls
    await createRevenueItem(t, rev, {
      source: "internal",
      productName: "Mystery Item",
      quantity: 3,
      // no linkedMenuProductId
    });

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    // Total: 10 + 12 + 3 = 25 balls
    expect(result.totalBalls).toBe(25);

    // 3 distinct products
    expect(result.products).toHaveLength(3);

    // Products sorted by totalBalls descending
    const [first, second, third] = result.products;
    expect(first.totalBalls).toBeGreaterThanOrEqual(second.totalBalls);
    expect(second.totalBalls).toBeGreaterThanOrEqual(third.totalBalls);

    // Verify individual product ball counts
    const original = result.products.find((p) => p.productName === "Original 80g");
    const triple = result.products.find((p) => p.productName === "Original Triple 135g");
    const unmapped = result.products.find((p) => p.productName === "Mystery Item");

    expect(original?.totalBalls).toBe(10);
    expect(triple?.totalBalls).toBe(12);
    expect(unmapped?.totalBalls).toBe(3);
    expect(unmapped?.menuProductId).toBeUndefined();
  });
});

// ============================================
// Edge Cases — 2 tests
// ============================================
describe("getLifetimeTotalsInternal edge cases", () => {
  test("returns zero totals when no revenue items exist", async () => {
    const t = convexTest(schema);

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    expect(result.totalBalls).toBe(0);
    expect(result.products).toHaveLength(0);
    expect(result.lifetimeRevenue).toBe(0);
    expect(result.lifetimeTransactions).toBe(0);
  });

  test("linked product with no BOM production components falls back to 1 ball per unit", async () => {
    const t = convexTest(schema);

    // Create a packaging-only menu product (no production components)
    const menuProductId = await t.run(async (ctx) => {
      return await ctx.db.insert("menuProducts", {
        code: "PKG-001",
        name: "Gift Wrap Bundle",
        grams: 0,
        defaultPrice: 10000,
        isActive: true,
        unitCost: 0,
        cachedProductionSummary: "",
        productType: "packaging" as const,
      });
    });

    // Add only a packaging component (not production)
    await t.run(async (ctx) => {
      const boxType = await ctx.db.insert("componentTypes", {
        code: "GIFT_BOX",
        name: "Gift Box",
        category: "packaging",
        unitCostIdr: 500,
        unit: "pcs",
        trackInventory: true,
        consumptionStage: "boxing",
        isActive: true,
        sortOrder: 0,
        createdBy: "test",
        createdAt: Date.now(),
      });
      await ctx.db.insert("menuProductComponents", {
        menuProductId,
        componentTypeId: boxType,
        quantity: 1,
        sortOrder: 0,
      });
    });

    const revenueId = await createExternalRevenue(t, { source: "internal" });
    await createRevenueItem(t, revenueId, {
      source: "internal",
      productName: "Gift Wrap Bundle",
      quantity: 5,
      linkedMenuProductId: menuProductId,
    });

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    // Packaging-only product: 0 production components -> ballsPerProduct = 1 (fallback)
    // 5 units * 1 = 5 balls
    expect(result.totalBalls).toBe(5);
    expect(result.products[0].totalBalls).toBe(5);
  });
});
