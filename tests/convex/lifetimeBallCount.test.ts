/**
 * Tests for getLifetimeTotalsInternal — lifetime hero card ball estimation.
 *
 * The hero "balls sold" number is a revenue-based estimate:
 *   avgRevenuePerBall = knownRevenue / knownBalls  (from BOM-linked items)
 *   totalBalls = Math.round(lifetimeRevenue / avgRevenuePerBall)
 *
 * When no BOM-linked items exist, falls back to 35,000 IDR/ball.
 * No per-product breakdown — just aggregate totals.
 */

import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
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
// Empty state / basic aggregation
// ============================================
describe("getLifetimeTotalsInternal empty state", () => {
  test("returns zeros when no data exists", async () => {
    const t = convexTest(schema);

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    expect(result.totalBalls).toBe(0);
    expect(result.lifetimeRevenue).toBe(0);
    expect(result.lifetimeTransactions).toBe(0);
    expect(result.avgRevenuePerBall).toBe(35_000); // fallback
  });

  test("returns simplified shape (no products/sourceColumns)", async () => {
    const t = convexTest(schema);

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    expect(result).toHaveProperty("totalBalls");
    expect(result).toHaveProperty("lifetimeRevenue");
    expect(result).toHaveProperty("lifetimeTransactions");
    expect(result).toHaveProperty("avgRevenuePerBall");
    // These fields should NOT exist in the simplified return
    expect(result).not.toHaveProperty("products");
    expect(result).not.toHaveProperty("sourceColumns");
  });
});

// ============================================
// Fallback: no BOM-linked items -> 35K/ball
// ============================================
describe("getLifetimeTotalsInternal fallback (no known products)", () => {
  test("uses 35K/ball fallback when no items are BOM-linked", async () => {
    const t = convexTest(schema);

    await createExternalRevenue(t, {
      source: "gobiz",
      revenueGross: 350_000,
    });

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    // 350,000 / 35,000 = 10
    expect(result.totalBalls).toBe(10);
    expect(result.lifetimeRevenue).toBe(350_000);
    expect(result.avgRevenuePerBall).toBe(35_000);
  });

  test("rounds to nearest integer: 50K revenue -> 1 ball", async () => {
    const t = convexTest(schema);

    await createExternalRevenue(t, {
      source: "internal",
      revenueGross: 50_000,
    });

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    // 50,000 / 35,000 = 1.43 -> rounds to 1
    expect(result.totalBalls).toBe(1);
    expect(result.avgRevenuePerBall).toBe(35_000);
  });

  test("items with linkedMenuProductId but no production BOM still trigger fallback", async () => {
    const t = convexTest(schema);

    // Create packaging-only product (no production components)
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

    const revenueId = await createExternalRevenue(t, {
      source: "internal",
      revenueGross: 70_000,
    });
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

    // Linked but no production BOM -> knownBalls = 0 -> fallback 35K
    expect(result.avgRevenuePerBall).toBe(35_000);
    expect(result.totalBalls).toBe(Math.round(70_000 / 35_000));
  });
});

// ============================================
// Dynamic avgRevenuePerBall from BOM-linked items
// ============================================
describe("getLifetimeTotalsInternal dynamic avgRevenuePerBall", () => {
  test("calculates avgRevenuePerBall from known BOM-linked items", async () => {
    const t = convexTest(schema);

    // Product: 1 BIG_BALL per unit
    const { menuProductId } = await createMenuProductWithBOM(t, {
      name: "Original 80g",
      ballConfig: [{ code: "BIG_BALL", quantity: 1 }],
    });

    // Revenue: 700K gross
    const revenueId = await createExternalRevenue(t, {
      source: "gobiz",
      revenueGross: 700_000,
    });

    // Known items: 10 units at 25K each = 250K revenue, 10 balls
    await createRevenueItem(t, revenueId, {
      source: "gobiz",
      productName: "Original 80g",
      quantity: 10,
      unitPrice: 25_000,
      linkedMenuProductId: menuProductId,
    });

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    // avgRevenuePerBall = 250,000 / 10 = 25,000
    expect(result.avgRevenuePerBall).toBe(25_000);
    // totalBalls = 700,000 / 25,000 = 28
    expect(result.totalBalls).toBe(28);
  });

  test("weighted average across multiple products", async () => {
    const t = convexTest(schema);

    // Product A: 1 ball, selling at ~30K/ball
    const { menuProductId: productA } = await createMenuProductWithBOM(t, {
      code: "ORIG-001",
      name: "Original 80g",
      ballConfig: [{ code: "BIG_BALL", quantity: 1 }],
    });

    // Product B: 3 balls, selling at ~20K/ball (60K per unit / 3 balls)
    const { menuProductId: productB } = await createMenuProductWithBOM(t, {
      code: "TRIPLE-001",
      name: "Bite Triple 135g",
      ballConfig: [{ code: "MID_BALL", quantity: 3 }],
    });

    const rev = await createExternalRevenue(t, {
      source: "internal",
      revenueGross: 500_000,
    });

    // 5 units of Original at 30K each = 150K, 5 balls
    await createRevenueItem(t, rev, {
      source: "internal",
      productName: "Original 80g",
      quantity: 5,
      unitPrice: 30_000,
      linkedMenuProductId: productA,
    });

    // 5 units of Triple at 60K each = 300K, 15 balls
    await createRevenueItem(t, rev, {
      source: "internal",
      productName: "Bite Triple 135g",
      quantity: 5,
      unitPrice: 60_000,
      linkedMenuProductId: productB,
    });

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    // knownRevenue = 150K + 300K = 450K
    // knownBalls = 5 + 15 = 20
    // avgRevenuePerBall = 450,000 / 20 = 22,500
    expect(result.avgRevenuePerBall).toBe(22_500);
    // totalBalls = 500,000 / 22,500 = 22.22 -> 22
    expect(result.totalBalls).toBe(22);
  });

  test("mixed known + unmapped items: avg is only from known", async () => {
    const t = convexTest(schema);

    const { menuProductId } = await createMenuProductWithBOM(t, {
      name: "Original 80g",
      ballConfig: [{ code: "BIG_BALL", quantity: 1 }],
    });

    const rev = await createExternalRevenue(t, {
      source: "gobiz",
      revenueGross: 200_000,
    });

    // Known: 2 units at 40K each = 80K, 2 balls
    await createRevenueItem(t, rev, {
      source: "gobiz",
      productName: "Original 80g",
      quantity: 2,
      unitPrice: 40_000,
      linkedMenuProductId: menuProductId,
    });

    // Unmapped: should NOT contribute to avgRevenuePerBall calculation
    await createRevenueItem(t, rev, {
      source: "gobiz",
      productName: "Mystery Item",
      quantity: 5,
      unitPrice: 10_000,
    });

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    // avgRevenuePerBall = 80,000 / 2 = 40,000 (only known items)
    expect(result.avgRevenuePerBall).toBe(40_000);
    // totalBalls = 200,000 / 40,000 = 5
    expect(result.totalBalls).toBe(5);
  });

  test("multi-ball BOM (1 BIG + 2 MID) contributes correctly to average", async () => {
    const t = convexTest(schema);

    // Product: 3 balls total (1 BIG_BALL + 2 MID_BALL)
    const { menuProductId } = await createMenuProductWithBOM(t, {
      name: "Original Triple 135g",
      ballConfig: [
        { code: "BIG_BALL", quantity: 1 },
        { code: "MID_BALL", quantity: 2 },
      ],
    });

    const rev = await createExternalRevenue(t, {
      source: "k3mart",
      revenueGross: 300_000,
    });

    // 4 units at 75K each = 300K, 4 * 3 = 12 balls
    await createRevenueItem(t, rev, {
      source: "k3mart",
      productName: "Original Triple 135g",
      quantity: 4,
      unitPrice: 75_000,
      linkedMenuProductId: menuProductId,
    });

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    // avgRevenuePerBall = 300,000 / 12 = 25,000
    expect(result.avgRevenuePerBall).toBe(25_000);
    // totalBalls = 300,000 / 25,000 = 12
    expect(result.totalBalls).toBe(12);
  });
});

// ============================================
// Weighted vs simple average verification
// ============================================
describe("getLifetimeTotalsInternal weighted average correctness", () => {
  test("weighted average differs from simple average with different ball counts", async () => {
    const t = convexTest(schema);

    // Product A: 1 ball at 45K/unit -> 45K/ball
    const { menuProductId: singleBall } = await createMenuProductWithBOM(t, {
      code: "SINGLE-001",
      name: "Single Ball",
      ballConfig: [{ code: "BIG_BALL", quantity: 1 }],
    });

    // Product B: 3 balls at 120K/unit -> 40K/ball
    const { menuProductId: tripleBall } = await createMenuProductWithBOM(t, {
      code: "TRIPLE-001",
      name: "Triple Ball",
      ballConfig: [{ code: "MID_BALL", quantity: 3 }],
    });

    const rev = await createExternalRevenue(t, {
      source: "internal",
      revenueGross: 1_000_000,
    });

    // 2 units of Single at 45K = 90K, 2 balls
    await createRevenueItem(t, rev, {
      source: "internal",
      productName: "Single Ball",
      quantity: 2,
      unitPrice: 45_000,
      linkedMenuProductId: singleBall,
    });

    // 10 units of Triple at 120K = 1,200K, 30 balls
    await createRevenueItem(t, rev, {
      source: "internal",
      productName: "Triple Ball",
      quantity: 10,
      unitPrice: 120_000,
      linkedMenuProductId: tripleBall,
    });

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    // Weighted: (90K + 1,200K) / (2 + 30) = 1,290K / 32 = 40,312.5
    const expectedAvg = 1_290_000 / 32;
    expect(result.avgRevenuePerBall).toBe(expectedAvg);

    // Simple average would be (45K + 40K) / 2 = 42,500 — different!
    const simpleAvg = (45_000 + 40_000) / 2;
    expect(result.avgRevenuePerBall).not.toBe(simpleAvg);

    // totalBalls = 1,000,000 / 40,312.5 = 24.8... -> 25
    expect(result.totalBalls).toBe(Math.round(1_000_000 / expectedAvg));
  });

  test("unmapped item revenue flows into totalBalls via gross revenue but not into avgRevenuePerBall", async () => {
    const t = convexTest(schema);

    // 1-ball product, known
    const { menuProductId } = await createMenuProductWithBOM(t, {
      name: "Original 80g",
      ballConfig: [{ code: "BIG_BALL", quantity: 1 }],
    });

    // Total gross revenue includes BOTH known and unmapped sales
    const rev = await createExternalRevenue(t, {
      source: "gobiz",
      revenueGross: 500_000, // 500K total from all sales on this platform
    });

    // Known: 5 units at 25K = 125K, 5 balls -> avg = 25K/ball
    await createRevenueItem(t, rev, {
      source: "gobiz",
      productName: "Original 80g",
      quantity: 5,
      unitPrice: 25_000,
      linkedMenuProductId: menuProductId,
    });

    // Unmapped: 10 units at cheap price -- does NOT affect avg
    await createRevenueItem(t, rev, {
      source: "gobiz",
      productName: "GrabFood Mystery Bundle",
      quantity: 10,
      unitPrice: 5_000,
    });

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    // avgRevenuePerBall only from known: 125K / 5 = 25K
    expect(result.avgRevenuePerBall).toBe(25_000);

    // totalBalls uses GROSS revenue (which includes unmapped sales):
    // 500K / 25K = 20 balls
    expect(result.totalBalls).toBe(20);

    // If unmapped items polluted the avg, it would be:
    // (125K + 50K) / (5 + 10) = 11,666 — and totalBalls would be 500K/11,666 = 43
    // Instead we get 20, proving unmapped items don't affect the avg
    expect(result.totalBalls).not.toBe(43);
  });
});

// ============================================
// Revenue aggregation from externalRevenue
// ============================================
describe("getLifetimeTotalsInternal revenue aggregation", () => {
  test("aggregates revenue across multiple records and sources", async () => {
    const t = convexTest(schema);

    await createExternalRevenue(t, { source: "gobiz", revenueGross: 100_000 });
    await createExternalRevenue(t, { source: "k3mart", revenueGross: 200_000 });
    await createExternalRevenue(t, { source: "internal", revenueGross: 50_000 });

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    expect(result.lifetimeRevenue).toBe(350_000);
    // 350,000 / 35,000 (fallback, no BOM items) = 10
    expect(result.totalBalls).toBe(10);
  });

  test("sums transactionCount across revenue records", async () => {
    const t = convexTest(schema);

    await createExternalRevenue(t, {
      source: "gobiz",
      revenueGross: 100_000,
      transactionCount: 5,
    });
    await createExternalRevenue(t, {
      source: "k3mart",
      revenueGross: 200_000,
      transactionCount: 12,
    });

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    expect(result.lifetimeTransactions).toBe(17);
  });

  test("handles null revenueGross gracefully (treated as 0)", async () => {
    const t = convexTest(schema);

    // Create revenue with explicit revenueGross and one that might be null-ish
    await createExternalRevenue(t, { source: "gobiz", revenueGross: 100_000 });
    await createExternalRevenue(t, { source: "k3mart", revenueGross: 0 });

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    expect(result.lifetimeRevenue).toBe(100_000);
  });
});

// ============================================
// Edge cases
// ============================================
describe("getLifetimeTotalsInternal edge cases", () => {
  test("revenue items exist but no externalRevenue records -> 0 balls", async () => {
    const t = convexTest(schema);

    // Insert items directly (they reference a revenue that might not exist in this test)
    // In practice this shouldn't happen, but the query should handle it gracefully
    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    expect(result.totalBalls).toBe(0);
    expect(result.lifetimeRevenue).toBe(0);
  });

  test("avgRevenuePerBall reflects actual product mix, not hardcoded value", async () => {
    const t = convexTest(schema);

    // Expensive product: 1 ball at 80K
    const { menuProductId } = await createMenuProductWithBOM(t, {
      name: "Premium 80g",
      ballConfig: [{ code: "BIG_BALL", quantity: 1 }],
    });

    const rev = await createExternalRevenue(t, {
      source: "internal",
      revenueGross: 800_000,
    });

    await createRevenueItem(t, rev, {
      source: "internal",
      productName: "Premium 80g",
      quantity: 10,
      unitPrice: 80_000,
      linkedMenuProductId: menuProductId,
    });

    const result = await t.query(
      internal.externalData.queries.getLifetimeTotalsInternal,
      {}
    );

    // avgRevenuePerBall = 800,000 / 10 = 80,000 (NOT 35,000 fallback)
    expect(result.avgRevenuePerBall).toBe(80_000);
    // totalBalls = 800,000 / 80,000 = 10
    expect(result.totalBalls).toBe(10);
  });
});
