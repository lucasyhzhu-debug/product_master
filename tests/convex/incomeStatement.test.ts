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
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

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
      periodEnd: overrides.periodEnd ?? ((overrides.periodStart ?? TEST_WEEK_START) + DAY_MS),
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

  // Insert all component types in parallel, then link to menu product in parallel
  const componentTypeIds = await Promise.all(
    bomConfig.map((config, i) =>
      t.run(async (ctx) =>
        ctx.db.insert("componentTypes", {
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
        })
      )
    )
  );

  await Promise.all(
    bomConfig.map((config, i) =>
      t.run(async (ctx) =>
        ctx.db.insert("menuProductComponents", {
          menuProductId,
          componentTypeId: componentTypeIds[i],
          quantity: config.quantity,
          sortOrder: i,
        })
      )
    )
  );

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

    // missingChannels: grabfood is known-missing (OAuth pending)
    expect(result.current.gapAnalysis.missingChannels).toHaveLength(1);
    expect(result.current.gapAnalysis.missingChannels[0].source).toBe("grabfood");

    // Delta percent is null when previous week is also zero (not NaN or 0)
    expect(result.deltas.grossRevenue.percent).toBeNull();
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

    // Verify gross profit and margin
    expect(result.current.grossProfit).toBe(35000 - 20931); // 14069
    expect(result.current.grossMarginPercent).toBeCloseTo(40.2, 1); // 14069/35000 * 100
  });

  test("zero net revenue has margin = null, not NaN", async () => {
    const t = convexTest(schema);

    // No revenue records -- all zero
    const result = await t.query(
      api.reports.incomeStatement.getWeeklyIncomeStatement,
      { weekStart: TEST_WEEK_START }
    );

    expect(result.current.grossMarginPercent).toBeNull();
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

    // Unmapped product should appear in gap analysis (no linkedMenuProductId)
    expect(result.current.gapAnalysis.unmappedProducts).toHaveLength(1);
    expect(result.current.gapAnalysis.unmappedProducts[0].name).toBe("Low Margin Product");
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

  test("consignment settlement included with revShare deduction", async () => {
    const t = convexTest(schema);

    // Seed a menu product with BOM for COGS resolution
    const { menuProductId } = await seedMenuProductWithBOM(t, {
      code: "CONSIGN-001",
      name: "Consignment Product",
      bomConfig: [
        { code: "BIG_BALL", name: "Big Ball", category: "production", unitCostIdr: 10000, quantity: 1 },
        { code: "SMALL_BOX", name: "Small Box", category: "packaging", unitCostIdr: 1000, quantity: 1 },
      ],
    });

    // Seed an externalRevenue record linked to the consignment settlement
    const linkedRevenueId = await seedExternalRevenue(t, {
      source: "consignment",
      periodStart: TEST_WEEK_START,
      revenueGross: 50000,
    });

    // Seed revenue items on the linked revenue
    await seedRevenueItem(t, linkedRevenueId, {
      source: "consignment",
      productName: "Consignment Product",
      unitPrice: 25000,
      quantity: 2,
      totalPrice: 50000,
      linkedMenuProductId: menuProductId,
    });

    // Create a consignment outlet (required by schema)
    const outletId = await t.run(async (ctx) => {
      return await ctx.db.insert("consignmentOutlets", {
        name: "Test Outlet",
        type: "retail",
        revSharePercent: 20,
        isActive: true,
        createdBy: "test",
        createdAt: Date.now(),
      });
    });

    // Seed the consignment settlement itself
    await t.run(async (ctx) => {
      await ctx.db.insert("consignmentSettlements", {
        outletId,
        periodStart: TEST_WEEK_START,
        periodEnd: TEST_WEEK_START + DAY_MS,
        totalRevenue: 50000,
        revSharePercent: 20,
        revShareAmount: 10000,
        frolliePayment: 40000,
        status: "pending",
        linkedRevenueId: linkedRevenueId,
        createdBy: "test",
        createdAt: Date.now(),
      });
    });

    const result = await t.query(
      api.reports.incomeStatement.getWeeklyIncomeStatement,
      { weekStart: TEST_WEEK_START }
    );

    // Consignment channel should exist
    const consignChannel = result.current.channels.find((ch) => ch.source === "consignment");
    expect(consignChannel).toBeDefined();
    expect(consignChannel!.gross).toBe(50000);
    expect(consignChannel!.revShare).toBe(10000);
    expect(consignChannel!.netRevenue).toBe(40000); // 50000 - 10000

    // COGS should be resolved: 2 * (10000 + 1000) = 22000
    expect(consignChannel!.cogs.total).toBe(22000);
    expect(consignChannel!.cogs.production).toBe(20000); // 2 * 10000
    expect(consignChannel!.cogs.packaging).toBe(2000); // 2 * 1000

    // Products should be mapped
    expect(consignChannel!.products).toHaveLength(1);
    expect(consignChannel!.products[0].confidence).toBe("calculated");

    // Total revShare in deductions
    expect(result.current.totalRevShare).toBe(10000);
  });

  test("internal order discount correction via order data", async () => {
    const t = convexTest(schema);

    // Create a customer first (required by orders schema; customers has no createdAt)
    const customerId = await t.run(async (ctx) => {
      return await ctx.db.insert("customers", { name: "Test Customer", createdBy: "test" });
    });

    // Create an order with discount + delivery fee (orders table has no createdAt)
    await t.run(async (ctx) => {
      await ctx.db.insert("orders", {
        orderNumber: "0105-001",
        customerId,
        customerName: "Test Customer",
        status: "Complete",
        paymentStatus: "Paid",
        orderDate: Date.now(),
        totalAmount: 100000,     // Pre-discount product value
        totalCost: 0,
        totalMargin: 0,
        finalTotal: 85000,       // After 20000 discount + 15000 deliveryFee
        deliveryFee: 15000,
        deliveryType: "Delivery",
        itemCount: 1,
        createdBy: "test",
      });
    });

    // Seed externalRevenue for the internal channel.
    // externalTransactionId = orderNumber (fetchInternalOrderDataMap looks up by orderNumber)
    const revenueId = await seedExternalRevenue(t, {
      source: "internal",
      periodStart: TEST_WEEK_START,
      revenueGross: 100000,
      externalTransactionId: "0105-001",
    });

    await seedRevenueItem(t, revenueId, {
      source: "internal",
      productName: "Internal Product",
      unitPrice: 100000,
      quantity: 1,
      totalPrice: 100000,
    });

    const result = await t.query(
      api.reports.incomeStatement.getWeeklyIncomeStatement,
      { weekStart: TEST_WEEK_START }
    );

    const internalChannel = result.current.channels.find((ch) => ch.source === "internal");
    expect(internalChannel).toBeDefined();

    // Gross = totalAmount = 100000
    expect(internalChannel!.gross).toBe(100000);

    // Discount = totalAmount - (finalTotal - deliveryFee) = 100000 - (85000 - 15000) = 30000
    // Note: in production, this formula captures all price reductions including vouchers
    expect(internalChannel!.discount).toBe(30000);

    // Net = gross - discount = 100000 - 30000 = 70000
    expect(internalChannel!.netRevenue).toBe(70000);
  });

  test("WIB timezone boundary: record at Mon 00:01 WIB lands in correct week", async () => {
    const t = convexTest(schema);

    // Monday 2026-01-05 00:01 WIB = Sunday 2026-01-04 17:01 UTC
    // This is 1 minute after the week start, should be IN the current week
    const justAfterWeekStart = TEST_WEEK_START + 60000; // +1 minute

    // Record 1 minute before week start — should be in PREVIOUS week
    const justBeforeWeekStart = TEST_WEEK_START - 60000; // -1 minute

    // Seed revenue just after the boundary (current week)
    await seedExternalRevenue(t, {
      source: "gobiz",
      periodStart: justAfterWeekStart,
      revenueGross: 50000,
    });

    // Seed revenue just before the boundary (previous week)
    await seedExternalRevenue(t, {
      source: "gobiz",
      periodStart: justBeforeWeekStart,
      revenueGross: 30000,
    });

    const result = await t.query(
      api.reports.incomeStatement.getWeeklyIncomeStatement,
      { weekStart: TEST_WEEK_START }
    );

    // Current week should have the 50000 record
    expect(result.current.totalGross).toBe(50000);
    // Previous week should have the 30000 record
    expect(result.previous.totalGross).toBe(30000);
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

  test("empty week returns zero OpEx/EBIT/Other/NetIncome fields", async () => {
    const t = convexTest(schema);
    const result = await t.query(
      api.reports.incomeStatement.getWeeklyIncomeStatement,
      { weekStart: TEST_WEEK_START }
    );

    // All new P&L fields should exist with zeros/nulls
    expect(result.current.opex).toEqual([]);
    expect(result.current.totalOpEx).toBe(0);
    expect(result.current.ebit).toBe(0);
    expect(result.current.ebitMarginPercent).toBeNull();
    expect(result.current.otherItems).toEqual([]);
    expect(result.current.totalOther).toBe(0);
    expect(result.current.netIncome).toBe(0);
    expect(result.current.netMarginPercent).toBeNull();
  });

  test("multi-channel revenue aggregation: gobiz + consignment + internal", async () => {
    const t = convexTest(schema);

    // ── 1. Seed 3 BOM-linked menu products in parallel (one per channel) ──
    const [
      { menuProductId: productAId },  // Product A: 1x BIG_BALL (10000) + 1x SMALL_BOX (2000) = 12000 COGS/unit
      { menuProductId: productBId },  // Product B: 1x MID_BALL (5000) + 1x SMALL_BOX (2000) + 1x STICKER (500) = 7500 COGS/unit
      { menuProductId: productCId },  // Product C: 2x MID_BALL (5000) + 1x LARGE_BOX (3000) = 13000 COGS/unit
    ] = await Promise.all([
      seedMenuProductWithBOM(t, {
        code: "GOBIZ-001",
        name: "Gobiz Product",
        bomConfig: [
          { code: "BIG_BALL", name: "Big Ball", category: "production", unitCostIdr: 10000, quantity: 1 },
          { code: "SMALL_BOX", name: "Small Box", category: "packaging", unitCostIdr: 2000, quantity: 1 },
        ],
      }),
      seedMenuProductWithBOM(t, {
        code: "CONSIGN-002",
        name: "Consignment Product",
        bomConfig: [
          { code: "MID_BALL", name: "Mid Ball", category: "production", unitCostIdr: 5000, quantity: 1 },
          { code: "SMALL_BOX_B", name: "Small Box", category: "packaging", unitCostIdr: 2000, quantity: 1 },
          { code: "STICKER_B", name: "Sticker", category: "packaging", unitCostIdr: 500, quantity: 1 },
        ],
      }),
      seedMenuProductWithBOM(t, {
        code: "INTERNAL-003",
        name: "Internal Product",
        bomConfig: [
          { code: "MID_BALL_C", name: "Mid Ball", category: "production", unitCostIdr: 5000, quantity: 2 },
          { code: "LARGE_BOX_C", name: "Large Box", category: "packaging", unitCostIdr: 3000, quantity: 1 },
        ],
      }),
    ]);

    // ── 2. Seed gobiz channel: gross 100000, commission 10000, 2 units of Product A ──
    const gobizRevenueId = await seedExternalRevenue(t, {
      source: "gobiz",
      periodStart: TEST_WEEK_START,
      revenueGross: 100000,
      commission: 10000,
    });
    await seedRevenueItem(t, gobizRevenueId, {
      source: "gobiz",
      productName: "Gobiz Product",
      unitPrice: 50000,
      quantity: 2,
      totalPrice: 100000,
      linkedMenuProductId: productAId,
    });

    // ── 3. Seed consignment channel: gross 50000, revShare 10000 (20%) ──
    // externalRevenue.revenueGross = 99999 (sentinel) -- proves gross comes from settlement, not revenue record
    const consignRevenueId = await seedExternalRevenue(t, {
      source: "consignment",
      periodStart: TEST_WEEK_START,
      revenueGross: 99999, // SENTINEL: if double-counting bug exists, totalGross would include 99999 instead of 50000
    });
    await seedRevenueItem(t, consignRevenueId, {
      source: "consignment",
      productName: "Consignment Product",
      unitPrice: 25000,
      quantity: 2,
      totalPrice: 50000,
      linkedMenuProductId: productBId,
    });

    // Create consignment outlet
    const outletId = await t.run(async (ctx) => {
      return await ctx.db.insert("consignmentOutlets", {
        name: "Test Outlet",
        type: "retail",
        revSharePercent: 20,
        isActive: true,
        createdBy: "test",
        createdAt: Date.now(),
      });
    });

    // Create consignment settlement
    await t.run(async (ctx) => {
      await ctx.db.insert("consignmentSettlements", {
        outletId,
        periodStart: TEST_WEEK_START,
        periodEnd: TEST_WEEK_START + DAY_MS,
        totalRevenue: 50000,
        revSharePercent: 20,
        revShareAmount: 10000,
        frolliePayment: 40000,
        status: "pending",
        linkedRevenueId: consignRevenueId,
        createdBy: "test",
        createdAt: Date.now(),
      });
    });

    // ── 4. Seed internal channel: gross 80000, discount 15000 ──
    const customerId = await t.run(async (ctx) => {
      return await ctx.db.insert("customers", { name: "Test Customer", createdBy: "test" });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("orders", {
        orderNumber: "0105-002",
        customerId,
        customerName: "Test Customer",
        status: "Complete",
        paymentStatus: "Paid",
        orderDate: Date.now(),
        totalAmount: 80000,
        totalCost: 0,
        totalMargin: 0,
        finalTotal: 75000,
        deliveryFee: 10000,
        deliveryType: "Delivery",
        itemCount: 1,
        createdBy: "test",
      });
    });

    // Discount = totalAmount - (finalTotal - deliveryFee) = 80000 - (75000 - 10000) = 15000
    // Internal gross comes from orders.totalAmount (80000), NOT externalRevenue.revenueGross.
    // Sentinel value 88888 proves the query reads from the correct source.
    const internalRevenueId = await seedExternalRevenue(t, {
      source: "internal",
      periodStart: TEST_WEEK_START,
      revenueGross: 88888, // SENTINEL: if bug reads from externalRevenue instead of orders, totalGross would be wrong
      externalTransactionId: "0105-002",
    });
    await seedRevenueItem(t, internalRevenueId, {
      source: "internal",
      productName: "Internal Product",
      unitPrice: 40000,
      quantity: 2,
      totalPrice: 80000,
      linkedMenuProductId: productCId,
    });

    // ── 5. Call query and assert ──
    const result = await t.query(
      api.reports.incomeStatement.getWeeklyIncomeStatement,
      { weekStart: TEST_WEEK_START }
    );

    // ── Structural assertion: exactly 3 channels ──
    expect(result.current.channels).toHaveLength(3);

    // ── Channel ordering: sorted by gross descending ──
    expect(result.current.channels[0].source).toBe("gobiz");     // 100000
    expect(result.current.channels[1].source).toBe("internal");   // 80000
    expect(result.current.channels[2].source).toBe("consignment"); // 50000

    // ── Per-channel assertions: gobiz ──
    const gobiz = result.current.channels[0];
    expect(gobiz.gross).toBe(100000);
    expect(gobiz.commission).toBe(10000);
    expect(gobiz.netRevenue).toBe(90000);
    expect(gobiz.cogs.production).toBe(20000);   // 2 * 10000
    expect(gobiz.cogs.packaging).toBe(4000);     // 2 * 2000
    expect(gobiz.cogs.total).toBe(24000);

    // ── Per-channel assertions: consignment ──
    const consignment = result.current.channels[2];
    expect(consignment.gross).toBe(50000);
    expect(consignment.revShare).toBe(10000);
    expect(consignment.netRevenue).toBe(40000);
    expect(consignment.cogs.production).toBe(10000);  // 2 * 5000
    expect(consignment.cogs.packaging).toBe(5000);    // 2 * (2000 + 500)
    expect(consignment.cogs.total).toBe(15000);

    // ── Per-channel assertions: internal ──
    const internal = result.current.channels[1];
    expect(internal.gross).toBe(80000);
    expect(internal.discount).toBe(15000);
    expect(internal.netRevenue).toBe(65000);
    expect(internal.cogs.production).toBe(20000);  // 2 * 2 * 5000
    expect(internal.cogs.packaging).toBe(6000);    // 2 * 3000
    expect(internal.cogs.total).toBe(26000);

    // ── Cross-channel total assertions ──
    expect(result.current.totalGross).toBe(230000);            // 100000 + 50000 + 80000
    expect(result.current.totalCommission).toBe(10000);
    expect(result.current.totalRevShare).toBe(10000);
    expect(result.current.totalDiscounts).toBe(15000);
    expect(result.current.totalDeductions).toBe(35000);        // 10000 + 10000 + 15000
    expect(result.current.netRevenue).toBe(195000);            // 230000 - 35000
    expect(result.current.totalProductionCogs).toBe(50000);    // 20000 + 10000 + 20000
    expect(result.current.totalPackagingCogs).toBe(15000);     // 4000 + 5000 + 6000
    expect(result.current.totalCogs).toBe(65000);              // 50000 + 15000
    expect(result.current.grossProfit).toBe(130000);           // 195000 - 65000
    expect(result.current.grossMarginPercent).toBeCloseTo(66.67, 2); // 130000/195000 * 100
    expect(result.current.totalAdBurn).toBe(0);
    expect(result.current.totalPromoBurn).toBe(0);

    // ── Channel-level confidence: all exact (exact revenue sources, all products BOM-linked) ──
    expect(gobiz.confidence).toBe("exact");
    expect(consignment.confidence).toBe("exact");
    expect(internal.confidence).toBe("exact");

    // ── Product-level confidence: all calculated (BOM-linked) ──
    expect(gobiz.products.every((p) => p.confidence === "calculated")).toBe(true);
    expect(consignment.products.every((p) => p.confidence === "calculated")).toBe(true);
    expect(internal.products.every((p) => p.confidence === "calculated")).toBe(true);

    // ── Gap analysis happy path ──
    expect(result.current.gapAnalysis.unmappedProducts).toHaveLength(0);
    expect(result.current.gapAnalysis.totalMappedProducts).toBe(3);  // counts distinct revenue item rows, not unit quantities
    expect(result.current.gapAnalysis.totalProducts).toBe(3);
    expect(result.current.gapAnalysis.zeroCostComponents).toHaveLength(0);

    // missingChannels: grabfood is known-missing (no data seeded, OAuth pending)
    expect(result.current.gapAnalysis.missingChannels).toHaveLength(1);
    expect(result.current.gapAnalysis.missingChannels[0].source).toBe("grabfood");
  });
});

// ============================================
// Helpers: seed journal entry data
// ============================================

async function seedAccount(
  t: TestContext,
  overrides: {
    code: string;
    name: string;
    type: "asset" | "liability" | "equity" | "revenue" | "cogs" | "opex" | "other";
    category?: string;
  }
): Promise<Id<"accounts">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("accounts", {
      code: overrides.code,
      name: overrides.name,
      type: overrides.type,
      category: overrides.category ?? "Test",
      isActive: true,
      isSystem: false,
    });
  });
}

async function seedUser(t: TestContext): Promise<Id<"users">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name: "Test User",
      pinHash: "salt:hash",
      role: "admin",
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    });
  });
}

async function seedJournalEntryWithLines(
  t: TestContext,
  opts: {
    userId: Id<"users">;
    entryDate: number;
    lines: Array<{
      accountId: Id<"accounts">;
      debitAmount: number;
      creditAmount: number;
    }>;
  }
): Promise<Id<"journalEntries">> {
  const journalEntryId = await t.run(async (ctx) => {
    return await ctx.db.insert("journalEntries", {
      entryNumber: `JE-TEST-${Date.now()}`,
      date: opts.entryDate,
      description: "Test journal entry",
      sourceType: "manual",
      isReversed: false,
      createdBy: opts.userId,
      createdAt: Date.now(),
    });
  });

  for (const line of opts.lines) {
    await t.run(async (ctx) => {
      await ctx.db.insert("journalEntryLines", {
        journalEntryId,
        accountId: line.accountId,
        entryDate: opts.entryDate,
        debitAmount: line.debitAmount,
        creditAmount: line.creditAmount,
      });
    });
  }

  return journalEntryId;
}

// ============================================
// P&L OpEx/EBIT/Other/NetIncome Tests
// ============================================

describe("P&L OpEx/EBIT/Other/NetIncome", () => {
  test("OpEx aggregation groups by GL account, filters near-zero-balance, sorts by code", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);

    // Seed 3 OpEx accounts
    const acc6100 = await seedAccount(t, { code: "6100", name: "Salaries & Wages", type: "opex" });
    const acc6200 = await seedAccount(t, { code: "6200", name: "Rent & Utilities", type: "opex" });
    const acc6300 = await seedAccount(t, { code: "6300", name: "Transportation", type: "opex" });

    // Need a balancing account (asset)
    const accCash = await seedAccount(t, { code: "1100", name: "Cash", type: "asset" });

    // Seed journal entries within the test week
    // 6100 gets DR 500000 (non-zero)
    // 6200 gets DR 0.005 (near-zero, should be filtered)
    // 6300 gets DR 300000 (non-zero)
    const entryDate = TEST_WEEK_START + DAY_MS; // Within current week

    await seedJournalEntryWithLines(t, {
      userId,
      entryDate,
      lines: [
        { accountId: acc6100, debitAmount: 500000, creditAmount: 0 },
        { accountId: accCash, debitAmount: 0, creditAmount: 500000 },
      ],
    });

    await seedJournalEntryWithLines(t, {
      userId,
      entryDate,
      lines: [
        { accountId: acc6200, debitAmount: 0.005, creditAmount: 0 },
        { accountId: accCash, debitAmount: 0, creditAmount: 0.005 },
      ],
    });

    await seedJournalEntryWithLines(t, {
      userId,
      entryDate,
      lines: [
        { accountId: acc6300, debitAmount: 300000, creditAmount: 0 },
        { accountId: accCash, debitAmount: 0, creditAmount: 300000 },
      ],
    });

    const result = await t.query(
      api.reports.incomeStatement.getWeeklyIncomeStatement,
      { weekStart: TEST_WEEK_START }
    );

    // 6200 should be filtered (near-zero), only 6100 and 6300 should appear
    expect(result.current.opex).toHaveLength(2);
    // Sorted by code ascending
    expect(result.current.opex[0].code).toBe("6100");
    expect(result.current.opex[0].name).toBe("Salaries & Wages");
    expect(result.current.opex[0].total).toBe(500000);
    expect(result.current.opex[1].code).toBe("6300");
    expect(result.current.opex[1].name).toBe("Transportation");
    expect(result.current.opex[1].total).toBe(300000);

    // totalOpEx includes ALL items (including near-zero before filtering)
    expect(result.current.totalOpEx).toBeCloseTo(800000.005, 2);
  });

  test("Other Income/Expense: credit-normal account shows negative total", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);

    // 7100 Interest Income: credit-normal -> debit - credit = negative
    const acc7100 = await seedAccount(t, { code: "7100", name: "Interest Income", type: "other" });
    const accCash = await seedAccount(t, { code: "1100", name: "Cash", type: "asset" });

    const entryDate = TEST_WEEK_START + DAY_MS;

    // Interest Income: DR Cash 10000, CR Interest Income 10000
    await seedJournalEntryWithLines(t, {
      userId,
      entryDate,
      lines: [
        { accountId: accCash, debitAmount: 10000, creditAmount: 0 },
        { accountId: acc7100, debitAmount: 0, creditAmount: 10000 },
      ],
    });

    const result = await t.query(
      api.reports.incomeStatement.getWeeklyIncomeStatement,
      { weekStart: TEST_WEEK_START }
    );

    // total = debit - credit = 0 - 10000 = -10000 (income)
    expect(result.current.otherItems).toHaveLength(1);
    expect(result.current.otherItems[0].code).toBe("7100");
    expect(result.current.otherItems[0].total).toBe(-10000);
    expect(result.current.totalOther).toBe(-10000);
  });

  test("reversed entry in same period cancels out", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);

    const acc6100 = await seedAccount(t, { code: "6100", name: "Salaries & Wages", type: "opex" });
    const accCash = await seedAccount(t, { code: "1100", name: "Cash", type: "asset" });

    const entryDate = TEST_WEEK_START + DAY_MS;

    // Original: DR 6100 100000, CR Cash 100000
    await seedJournalEntryWithLines(t, {
      userId,
      entryDate,
      lines: [
        { accountId: acc6100, debitAmount: 100000, creditAmount: 0 },
        { accountId: accCash, debitAmount: 0, creditAmount: 100000 },
      ],
    });

    // Reversal: CR 6100 100000, DR Cash 100000
    await seedJournalEntryWithLines(t, {
      userId,
      entryDate,
      lines: [
        { accountId: acc6100, debitAmount: 0, creditAmount: 100000 },
        { accountId: accCash, debitAmount: 100000, creditAmount: 0 },
      ],
    });

    const result = await t.query(
      api.reports.incomeStatement.getWeeklyIncomeStatement,
      { weekStart: TEST_WEEK_START }
    );

    // Net = 0, so 6100 should be filtered from display
    expect(result.current.opex).toHaveLength(0);
    expect(result.current.totalOpEx).toBe(0);
  });

  test("EBIT = grossProfit - totalOpEx, margins use netRevenue as denominator", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);

    // Seed revenue: gross 1000000
    await seedExternalRevenue(t, {
      source: "gobiz",
      periodStart: TEST_WEEK_START,
      revenueGross: 1000000,
    });

    // Seed OpEx: DR 200000
    const acc6100 = await seedAccount(t, { code: "6100", name: "Salaries & Wages", type: "opex" });
    const accCash = await seedAccount(t, { code: "1100", name: "Cash", type: "asset" });

    await seedJournalEntryWithLines(t, {
      userId,
      entryDate: TEST_WEEK_START + DAY_MS,
      lines: [
        { accountId: acc6100, debitAmount: 200000, creditAmount: 0 },
        { accountId: accCash, debitAmount: 0, creditAmount: 200000 },
      ],
    });

    const result = await t.query(
      api.reports.incomeStatement.getWeeklyIncomeStatement,
      { weekStart: TEST_WEEK_START }
    );

    // grossProfit = netRevenue - COGS = 1000000 - 0 = 1000000
    expect(result.current.grossProfit).toBe(1000000);
    // ebit = grossProfit - totalOpEx = 1000000 - 200000 = 800000
    expect(result.current.ebit).toBe(800000);
    // ebitMarginPercent = ebit / netRevenue * 100 = 800000 / 1000000 * 100 = 80
    expect(result.current.ebitMarginPercent).toBeCloseTo(80, 1);
  });

  test("Net Income = EBIT - totalOther", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);

    // Revenue: 1000000
    await seedExternalRevenue(t, {
      source: "gobiz",
      periodStart: TEST_WEEK_START,
      revenueGross: 1000000,
    });

    // OpEx: DR 200000
    const acc6100 = await seedAccount(t, { code: "6100", name: "Salaries & Wages", type: "opex" });
    const accCash = await seedAccount(t, { code: "1100", name: "Cash", type: "asset" });

    await seedJournalEntryWithLines(t, {
      userId,
      entryDate: TEST_WEEK_START + DAY_MS,
      lines: [
        { accountId: acc6100, debitAmount: 200000, creditAmount: 0 },
        { accountId: accCash, debitAmount: 0, creditAmount: 200000 },
      ],
    });

    // Other: Interest Expense DR 50000
    const acc7200 = await seedAccount(t, { code: "7200", name: "Interest Expense", type: "other" });
    await seedJournalEntryWithLines(t, {
      userId,
      entryDate: TEST_WEEK_START + DAY_MS,
      lines: [
        { accountId: acc7200, debitAmount: 50000, creditAmount: 0 },
        { accountId: accCash, debitAmount: 0, creditAmount: 50000 },
      ],
    });

    // Other: Interest Income CR 10000
    const acc7100 = await seedAccount(t, { code: "7100", name: "Interest Income", type: "other" });
    await seedJournalEntryWithLines(t, {
      userId,
      entryDate: TEST_WEEK_START + DAY_MS,
      lines: [
        { accountId: accCash, debitAmount: 10000, creditAmount: 0 },
        { accountId: acc7100, debitAmount: 0, creditAmount: 10000 },
      ],
    });

    const result = await t.query(
      api.reports.incomeStatement.getWeeklyIncomeStatement,
      { weekStart: TEST_WEEK_START }
    );

    // grossProfit = 1000000
    // ebit = 1000000 - 200000 = 800000
    // totalOther = 50000 + (-10000) = 40000 (net expense)
    // netIncome = ebit - totalOther = 800000 - 40000 = 760000
    expect(result.current.ebit).toBe(800000);
    expect(result.current.totalOther).toBe(40000);
    expect(result.current.netIncome).toBe(760000);
    // netMarginPercent = 760000 / 1000000 * 100 = 76
    expect(result.current.netMarginPercent).toBeCloseTo(76, 1);
  });

  test("deltas computed for new fields", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);

    // Seed OpEx account
    const acc6100 = await seedAccount(t, { code: "6100", name: "Salaries & Wages", type: "opex" });
    const accCash = await seedAccount(t, { code: "1100", name: "Cash", type: "asset" });

    // Revenue for previous week
    await seedExternalRevenue(t, {
      source: "gobiz",
      periodStart: TEST_WEEK_START - WEEK_MS,
      revenueGross: 800000,
    });

    // OpEx for previous week: 100000
    await seedJournalEntryWithLines(t, {
      userId,
      entryDate: TEST_WEEK_START - WEEK_MS + DAY_MS,
      lines: [
        { accountId: acc6100, debitAmount: 100000, creditAmount: 0 },
        { accountId: accCash, debitAmount: 0, creditAmount: 100000 },
      ],
    });

    // Revenue for current week
    await seedExternalRevenue(t, {
      source: "gobiz",
      periodStart: TEST_WEEK_START,
      revenueGross: 1000000,
    });

    // OpEx for current week: 200000
    await seedJournalEntryWithLines(t, {
      userId,
      entryDate: TEST_WEEK_START + DAY_MS,
      lines: [
        { accountId: acc6100, debitAmount: 200000, creditAmount: 0 },
        { accountId: accCash, debitAmount: 0, creditAmount: 200000 },
      ],
    });

    const result = await t.query(
      api.reports.incomeStatement.getWeeklyIncomeStatement,
      { weekStart: TEST_WEEK_START }
    );

    // Verify deltas exist for new fields
    expect(result.deltas.totalOpEx).toBeDefined();
    expect(result.deltas.totalOpEx.amount).toBe(100000); // 200000 - 100000
    expect(result.deltas.totalOpEx.percent).toBeCloseTo(100); // 100000/100000 * 100

    expect(result.deltas.ebit).toBeDefined();
    // Current EBIT = 1000000 - 200000 = 800000
    // Previous EBIT = 800000 - 100000 = 700000
    expect(result.deltas.ebit.amount).toBe(100000);

    expect(result.deltas.ebitMarginPp).toBeDefined();
    // Current ebitMargin = 800000/1000000*100 = 80%
    // Previous ebitMargin = 700000/800000*100 = 87.5%
    // Delta = 80 - 87.5 = -7.5 pp
    expect(result.deltas.ebitMarginPp).toBeCloseTo(-7.5, 1);

    expect(result.deltas.totalOther).toBeDefined();
    expect(result.deltas.netIncome).toBeDefined();
    expect(result.deltas.netMarginPp).toBeDefined();
  });
});
