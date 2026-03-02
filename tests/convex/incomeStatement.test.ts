/**
 * Integration tests for getWeeklyIncomeStatement query.
 *
 * Uses convex-test to seed minimal data and verify query output
 * for edge cases: empty weeks, unmapped products, zero-cost, margin nulls.
 */

import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import type { TestConvex } from "convex-test";
import type { Id } from "../../convex/_generated/dataModel";

type TestContext = TestConvex<typeof schema>;

// Monday 2026-01-05 00:00 WIB = Sunday 2026-01-04 17:00 UTC
const TEST_WEEK_START = Date.UTC(2026, 0, 4, 17, 0, 0);

// ============================================
// Helpers: seed test data directly
// ============================================

async function seedExternalRevenue(
  t: TestContext,
  overrides: {
    source?: "gobiz" | "internal" | "k3mart" | "shopee" | "tiktok" | "grabfood" | "bigseller" | "consignment";
    periodStart?: number;
    periodEnd?: number;
    revenueGross?: number;
    revenueNet?: number;
    commission?: number;
    adBurn?: number;
    promoBurn?: number;
    transactionCount?: number;
    externalTransactionId?: string;
  } = {}
): Promise<Id<"externalRevenue">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("externalRevenue", {
      source: overrides.source ?? "gobiz",
      periodStart: overrides.periodStart ?? TEST_WEEK_START,
      periodEnd: overrides.periodEnd ?? (TEST_WEEK_START + 86400000),
      dataOrigin: "api_revenue",
      confidence: "exact",
      revenueGross: overrides.revenueGross ?? 100000,
      revenueNet: overrides.revenueNet ?? 80000,
      commission: overrides.commission,
      adBurn: overrides.adBurn,
      promoBurn: overrides.promoBurn,
      transactionCount: overrides.transactionCount,
      externalTransactionId: overrides.externalTransactionId,
    });
  });
}

async function seedRevenueItem(
  t: TestContext,
  revenueId: Id<"externalRevenue">,
  overrides: {
    source?: "gobiz" | "internal" | "k3mart" | "shopee" | "tiktok" | "grabfood" | "bigseller" | "consignment";
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

async function seedMenuProductWithBOM(
  t: TestContext,
  overrides: {
    code?: string;
    name?: string;
    defaultPrice?: number;
    bomConfig?: Array<{
      code: string;
      name: string;
      category: "production" | "packaging";
      unitCostIdr: number;
      quantity: number;
    }>;
  } = {}
): Promise<{
  menuProductId: Id<"menuProducts">;
  componentTypeIds: Id<"componentTypes">[];
}> {
  const menuProductId = await t.run(async (ctx) => {
    return await ctx.db.insert("menuProducts", {
      code: overrides.code ?? "TEST-001",
      name: overrides.name ?? "Test Product",
      grams: 100,
      defaultPrice: overrides.defaultPrice ?? 25000,
      isActive: true,
      unitCost: 0,
      cachedProductionSummary: "",
      productType: "food" as const,
    });
  });

  const bomConfig = overrides.bomConfig ?? [
    { code: "BIG_BALL", name: "Big Ball", category: "production" as const, unitCostIdr: 19231, quantity: 1 },
    { code: "SMALL_BOX", name: "Small Box", category: "packaging" as const, unitCostIdr: 1500, quantity: 1 },
    { code: "STICKER", name: "Sticker", category: "packaging" as const, unitCostIdr: 200, quantity: 1 },
  ];

  const componentTypeIds: Id<"componentTypes">[] = [];

  for (let i = 0; i < bomConfig.length; i++) {
    const config = bomConfig[i];

    const componentTypeId = await t.run(async (ctx) => {
      return await ctx.db.insert("componentTypes", {
        code: config.code,
        name: config.name,
        category: config.category,
        unitCostIdr: config.unitCostIdr,
        unit: "pcs",
        trackInventory: config.category === "packaging",
        consumptionStage: config.category === "packaging" ? "boxing" : undefined,
        isActive: true,
        sortOrder: i,
        createdBy: "test",
        createdAt: Date.now(),
      });
    });
    componentTypeIds.push(componentTypeId);

    await t.run(async (ctx) => {
      await ctx.db.insert("menuProductComponents", {
        menuProductId,
        componentTypeId,
        quantity: config.quantity,
        sortOrder: i,
      });
    });
  }

  return { menuProductId, componentTypeIds };
}

// ============================================
// Integration Tests
// ============================================

describe("getWeeklyIncomeStatement", () => {
  test("empty week returns all zeros, no crash", async () => {
    const t = convexTest(schema);
    const result = await t.query(
      api.reports.incomeStatement.getWeeklyIncomeStatement,
      { weekStart: TEST_WEEK_START }
    );

    expect(result.current.totalGross).toBe(0);
    expect(result.current.netRevenue).toBe(0);
    expect(result.current.totalCogs).toBe(0);
    expect(result.current.grossProfit).toBe(0);
    expect(result.current.grossMarginPercent).toBeNull();
    expect(result.current.channels).toHaveLength(0);
  });

  test("unmapped product has COGS = 0 and appears in gap analysis", async () => {
    const t = convexTest(schema);

    // Seed 1 revenue record with 1 item WITHOUT linkedMenuProductId
    const revenueId = await seedExternalRevenue(t, {
      source: "gobiz",
      periodStart: TEST_WEEK_START,
      revenueGross: 50000,
    });

    await seedRevenueItem(t, revenueId, {
      source: "gobiz",
      productName: "Unmapped Snack",
      unitPrice: 25000,
      quantity: 2,
      totalPrice: 50000,
      // No linkedMenuProductId -- unmapped
    });

    const result = await t.query(
      api.reports.incomeStatement.getWeeklyIncomeStatement,
      { weekStart: TEST_WEEK_START }
    );

    // Revenue should be counted
    expect(result.current.totalGross).toBe(50000);

    // COGS should be 0 for unmapped product
    expect(result.current.totalCogs).toBe(0);

    // Gap analysis should report unmapped product
    expect(result.current.gapAnalysis.unmappedProducts).toHaveLength(1);
    expect(result.current.gapAnalysis.unmappedProducts[0].name).toBe("Unmapped Snack");
    expect(result.current.gapAnalysis.unmappedProducts[0].count).toBe(2);
    expect(result.current.gapAnalysis.unmappedProducts[0].revenue).toBe(50000);

    // Channel confidence should be "missing" (has unmapped product)
    const gobizChannel = result.current.channels.find((ch) => ch.source === "gobiz");
    expect(gobizChannel).toBeDefined();
    expect(gobizChannel!.confidence).toBe("missing");

    // Product detail should have confidence = "missing"
    const product = gobizChannel!.products.find((p) => p.name === "Unmapped Snack");
    expect(product).toBeDefined();
    expect(product!.confidence).toBe("missing");
    expect(product!.cogsPerUnit).toBeNull();
  });

  test("known BOM COGS accuracy: production + packaging", async () => {
    const t = convexTest(schema);

    // Seed menu product with BOM: BIG_BALL + Small Box + Sticker
    const { menuProductId } = await seedMenuProductWithBOM(t, {
      code: "ORIG-80",
      name: "Original 80g",
      bomConfig: [
        { code: "BIG_BALL", name: "Big Ball", category: "production", unitCostIdr: 19231, quantity: 1 },
        { code: "SMALL_BOX", name: "Small Box", category: "packaging", unitCostIdr: 1500, quantity: 1 },
        { code: "STICKER", name: "Sticker", category: "packaging", unitCostIdr: 200, quantity: 1 },
      ],
    });

    // Seed revenue + item with linked menu product
    const revenueId = await seedExternalRevenue(t, {
      source: "gobiz",
      periodStart: TEST_WEEK_START,
      revenueGross: 35000,
    });

    await seedRevenueItem(t, revenueId, {
      source: "gobiz",
      productName: "Original 80g",
      unitPrice: 35000,
      quantity: 1,
      totalPrice: 35000,
      linkedMenuProductId: menuProductId,
    });

    const result = await t.query(
      api.reports.incomeStatement.getWeeklyIncomeStatement,
      { weekStart: TEST_WEEK_START }
    );

    // Verify COGS accuracy
    expect(result.current.totalProductionCogs).toBe(19231);
    expect(result.current.totalPackagingCogs).toBe(1700); // 1500 + 200
    expect(result.current.totalCogs).toBe(20931);

    // Verify per-channel COGS
    const gobizChannel = result.current.channels.find((ch) => ch.source === "gobiz");
    expect(gobizChannel).toBeDefined();
    expect(gobizChannel!.cogs.production).toBe(19231);
    expect(gobizChannel!.cogs.packaging).toBe(1700);
    expect(gobizChannel!.cogs.total).toBe(20931);

    // Verify product-level detail
    const product = gobizChannel!.products[0];
    expect(product.cogsPerUnit).toBe(20931);
    expect(product.cogsTotal).toBe(20931);
    expect(product.confidence).toBe("calculated");

    // Verify gross profit
    expect(result.current.grossProfit).toBe(35000 - 20931); // 14069
  });

  test("zero net revenue has margin = null, not NaN", async () => {
    const t = convexTest(schema);

    // No revenue records -- all zero
    const result = await t.query(
      api.reports.incomeStatement.getWeeklyIncomeStatement,
      { weekStart: TEST_WEEK_START }
    );

    expect(result.current.grossMarginPercent).toBeNull();
    expect(result.current.grossMarginPercent).not.toBeNaN();
  });

  test("negative net revenue is valid (no crash)", async () => {
    const t = convexTest(schema);

    // Seed revenue with commission greater than gross
    const revenueId = await seedExternalRevenue(t, {
      source: "gobiz",
      periodStart: TEST_WEEK_START,
      revenueGross: 10000,
      commission: 15000, // Commission > gross
    });

    await seedRevenueItem(t, revenueId, {
      source: "gobiz",
      productName: "Low Margin Product",
      unitPrice: 10000,
      quantity: 1,
      totalPrice: 10000,
    });

    const result = await t.query(
      api.reports.incomeStatement.getWeeklyIncomeStatement,
      { weekStart: TEST_WEEK_START }
    );

    // Net revenue should be negative: 10000 - 15000 = -5000
    expect(result.current.netRevenue).toBe(-5000);
    // grossMarginPercent should NOT be NaN
    expect(result.current.grossMarginPercent).not.toBeNaN();
    // grossProfit = netRevenue - COGS = -5000 - 0 = -5000
    expect(result.current.grossProfit).toBe(-5000);
  });

  test("zero-cost component appears in gap analysis", async () => {
    const t = convexTest(schema);

    // Create a component type with zero cost
    await t.run(async (ctx) => {
      await ctx.db.insert("componentTypes", {
        code: "FREE_INSERT",
        name: "Free Insert",
        category: "packaging",
        unitCostIdr: 0,
        unit: "pcs",
        trackInventory: false,
        isActive: true,
        sortOrder: 0,
        createdBy: "test",
        createdAt: Date.now(),
      });
    });

    const result = await t.query(
      api.reports.incomeStatement.getWeeklyIncomeStatement,
      { weekStart: TEST_WEEK_START }
    );

    expect(result.current.gapAnalysis.zeroCostComponents).toHaveLength(1);
    expect(result.current.gapAnalysis.zeroCostComponents[0].name).toBe("Free Insert");
    expect(result.current.gapAnalysis.zeroCostComponents[0].code).toBe("FREE_INSERT");
  });

  test("delta comparison between current and previous week", async () => {
    const t = convexTest(schema);
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    // Previous week revenue
    await seedExternalRevenue(t, {
      source: "gobiz",
      periodStart: TEST_WEEK_START - WEEK_MS, // Previous week
      revenueGross: 100000,
    });

    // Current week revenue
    await seedExternalRevenue(t, {
      source: "gobiz",
      periodStart: TEST_WEEK_START, // Current week
      revenueGross: 150000,
    });

    const result = await t.query(
      api.reports.incomeStatement.getWeeklyIncomeStatement,
      { weekStart: TEST_WEEK_START }
    );

    // Verify deltas
    expect(result.deltas.grossRevenue.amount).toBe(50000); // 150000 - 100000
    expect(result.deltas.grossRevenue.percent).toBeCloseTo(50); // +50%

    // Previous week data is populated
    expect(result.previous.totalGross).toBe(100000);
    expect(result.current.totalGross).toBe(150000);
  });

  test("multiple quantity scales COGS correctly", async () => {
    const t = convexTest(schema);

    const { menuProductId } = await seedMenuProductWithBOM(t, {
      code: "TRIPLE",
      name: "Triple Pack",
      bomConfig: [
        { code: "MID_BALL", name: "Mid Ball", category: "production", unitCostIdr: 5000, quantity: 3 },
        { code: "LARGE_BOX", name: "Large Box", category: "packaging", unitCostIdr: 2000, quantity: 1 },
      ],
    });

    const revenueId = await seedExternalRevenue(t, {
      source: "gobiz",
      periodStart: TEST_WEEK_START,
      revenueGross: 200000,
    });

    // Sold 4 units of Triple Pack
    await seedRevenueItem(t, revenueId, {
      source: "gobiz",
      productName: "Triple Pack",
      unitPrice: 50000,
      quantity: 4,
      totalPrice: 200000,
      linkedMenuProductId: menuProductId,
    });

    const result = await t.query(
      api.reports.incomeStatement.getWeeklyIncomeStatement,
      { weekStart: TEST_WEEK_START }
    );

    // Per-unit COGS: 3*5000 (production) + 2000 (packaging) = 17000
    // Total COGS for 4 units: 4 * 17000 = 68000
    expect(result.current.totalCogs).toBe(68000);
    expect(result.current.totalProductionCogs).toBe(60000); // 4 * 3 * 5000
    expect(result.current.totalPackagingCogs).toBe(8000); // 4 * 2000
  });
});
