/**
 * Phase 80.3 — Analytics Internal-Mirror Dedup (R5 Skip)
 *
 * Regression coverage for the R5 dedup rule in `loadExternalStream`
 * (convex/reports/unitEconomics.ts:163). Three test tiers:
 *
 *   Test 12  — internal-source externalRevenue rows are SKIPPED so a
 *              Direct/WhatsApp/Instagram order is counted exactly once
 *              (via the native orders+orderItems stream), not twice.
 *
 *   Test 12b — gobiz-source externalRevenue rows ARE counted (negative
 *              regression: guards against an over-aggressive R5 widen
 *              that would zero out the GoFood channel — staff-review
 *              addendum 2026-04-14, line 71: "non-optional").
 *
 *   Test 17  — symmetry across every reducer that consumes
 *              loadFilteredData (via the 3 snapshot queries
 *              kpiAndChannelSnapshot, timeSeriesSnapshot, skuSnapshot).
 *              Each reducer is asserted with a specific invariant a
 *              double-count would break.
 *
 * Note on 11-query inventory: the plan/research docs reference 11 legacy
 * queries (kpiSummary, byWeekday, dayHourHeatmap, channelEconomics,
 * volumeByType, unitsPerTxnByChannel, aovByChannel, skuPareto,
 * skuChannelMatrix, channelMomentum, rollingTrend). Phase 80.1
 * consolidated all 11 reducers into 3 grouped snapshot queries (verified
 * via git grep — only kpiAndChannelSnapshot/timeSeriesSnapshot/
 * skuSnapshot are exported by convex/reports/unitEconomics.ts at HEAD of
 * gsd/phase-80.3 branch). All 11 reducers are still covered here, but
 * via their snapshot wrapper rather than as standalone queries.
 *
 * Anchors:
 * - R5 spec: docs/reviews/staffreview-phase-80-task-4b-addendum-2026-04-14.md
 * - Bug investigation: .planning/debug/analytics-sales-mismatch.md
 * - Loader seam: convex/reports/unitEconomics.ts (loadExternalStream)
 * - Mirror writer: convex/integrations/internal/adapter.ts (syncInternalOrders)
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

type TestT = ReturnType<typeof convexTest>;

/** Deterministic NOW per Phase 73 lesson — never use Date.now() in seeded tests. */
const NOW = 1713400000000;
const FROM_TS = NOW - 86400000; // 1 day before
const TO_TS = NOW + 86400000; // 1 day after

async function seedMenuProduct(
  t: TestT,
  name: string,
  code: string,
  defaultPrice: number,
): Promise<Id<"menuProducts">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("menuProducts", {
      code,
      name,
      grams: 80,
      defaultPrice,
      isActive: true,
      unitCost: 0,
      cachedProductionSummary: "",
    } as never),
  );
}

async function seedBigBallBom(
  t: TestT,
  menuProductId: Id<"menuProducts">,
  quantity: number,
): Promise<void> {
  await t.run(async (ctx) => {
    // Create a production-category componentType (BIG_BALL).
    const componentTypeId = await ctx.db.insert("componentTypes", {
      code: "BIG_BALL",
      name: "Big Ball",
      category: "production" as const,
      gramsPerUnit: 80,
      unitCostIdr: 0,
      unit: "pcs",
      trackInventory: false,
      sortOrder: 0,
      isActive: true,
      createdBy: "test",
      createdAt: NOW,
    } as never);
    await ctx.db.insert("menuProductComponents", {
      menuProductId,
      componentTypeId,
      quantity,
      sortOrder: 0,
    } as never);
  });
}

/**
 * Helper used by Test 17 symmetry: insert ONE native Direct order
 * (channel=whatsapp, completedAt=NOW, finalTotal=23000, qty=1, BIG_BALL)
 * AND its internal-mirror twin in externalRevenue+externalRevenueItems
 * (mirroring what syncInternalOrders writes in production). After R5
 * the native row is the sole revenue source; the mirror must contribute
 * zero. If the seed order or the mirror is double-counted, downstream
 * invariants in Test 17 will fail.
 */
async function seedDirectOrderWithMirror(
  t: TestT,
  menuProductId: Id<"menuProducts">,
  orderNumber: string = "0419-001",
): Promise<{ orderId: Id<"orders">; revenueId: Id<"externalRevenue"> }> {
  return await t.run(async (ctx) => {
    const customerId = await ctx.db.insert("customers", {
      name: "Direct Customer",
      createdBy: "test",
    } as never);
    const orderId = await ctx.db.insert("orders", {
      orderNumber,
      customerId,
      customerName: "Direct Customer",
      status: "Complete" as const,
      paymentStatus: "Paid" as const,
      orderDate: NOW,
      completedAt: NOW,
      totalAmount: 23000,
      totalCost: 0,
      totalMargin: 23000,
      finalTotal: 23000,
      itemCount: 1,
      deliveryType: "Pickup",
      channel: "whatsapp" as const,
      createdBy: "test",
    } as never);
    await ctx.db.insert("orderItems", {
      orderId,
      productName: "Original 80g",
      quantity: 1,
      unitPrice: 23000,
      unitCost: 0,
      discountAmount: 0,
      lineTotal: 23000,
      lineCost: 0,
      lineMargin: 23000,
      menuProductId,
    } as never);
    // Mirror — exactly what syncInternalOrders writes for this order.
    const revenueId = await ctx.db.insert("externalRevenue", {
      source: "internal" as const,
      productName: `Order ${orderNumber}`,
      quantitySold: 1,
      transactionCount: 1,
      revenueGross: 23000,
      revenueNet: 23000,
      periodStart: NOW,
      periodEnd: NOW,
      transactionDate: NOW,
      transactionType: "sales" as const,
      externalTransactionId: orderNumber,
      dataOrigin: "db_query" as const,
      confidence: "exact" as const,
    } as never);
    await ctx.db.insert("externalRevenueItems", {
      revenueId,
      source: "internal" as const,
      externalItemId: `${orderNumber}-mirror-1`,
      productName: "Original 80g",
      unitPrice: 23000,
      quantity: 1,
      totalPrice: 23000,
      linkedMenuProductId: menuProductId,
      isAutoMatched: true,
      matchConfidence: "exact" as const,
      createdAt: NOW,
    } as never);
    return { orderId, revenueId };
  });
}

/**
 * Seed a gobiz (GoFood) externalRevenue row + linked child item with NO
 * native orders twin — mirroring real production where GoFood revenue
 * exists ONLY in externalRevenue. After R5 this row MUST still be
 * counted (negative regression test).
 */
async function seedGobizRevenue(
  t: TestT,
  menuProductId: Id<"menuProducts">,
  qty: number = 2,
  unitPrice: number = 30000,
): Promise<Id<"externalRevenue">> {
  return await t.run(async (ctx) => {
    const revenueId = await ctx.db.insert("externalRevenue", {
      source: "gobiz" as const,
      productName: "Original 80g",
      quantitySold: qty,
      revenueGross: qty * unitPrice,
      revenueNet: qty * unitPrice,
      periodStart: NOW,
      periodEnd: NOW,
      transactionDate: NOW,
      transactionType: "sales" as const,
      dataOrigin: "api_revenue" as const,
      confidence: "exact" as const,
    } as never);
    await ctx.db.insert("externalRevenueItems", {
      revenueId,
      source: "gobiz" as const,
      externalItemId: "gobiz-item-1",
      productName: "Original 80g",
      unitPrice,
      quantity: qty,
      totalPrice: qty * unitPrice,
      linkedMenuProductId: menuProductId,
      isAutoMatched: true,
      matchConfidence: "exact" as const,
      createdAt: NOW,
    } as never);
    return revenueId;
  });
}

// ============================================================================
// Test 12 — internal-source externalRevenue is skipped (no double-count)
// ============================================================================

describe("R5 — internal-mirror skip (Test 12)", () => {
  it("kpiAndChannelSnapshot: internal mirror is skipped so a Direct order is counted once", async () => {
    const t = convexTest(schema);
    const mp = await seedMenuProduct(t, "Original 80g", "ORIGINAL_80G", 23000);
    await seedBigBallBom(t, mp, 1);
    await seedDirectOrderWithMirror(t, mp, "0419-001");

    const result = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: FROM_TS,
      toTs: TO_TS,
    });

    // 1 native order × 1 BIG_BALL = 1 unit, 1 order, 23000 net revenue.
    // Pre-R5 this would be 2 (one from native, one from mirror).
    expect(result.kpi.current.orderCount).toBe(1);
    expect(result.kpi.current.netRevenue).toBe(23000);
    expect(result.kpi.current.units).toBe(1);
  });
});

// ============================================================================
// Test 12b — negative regression: gobiz contributes (must NOT be skipped)
// ============================================================================

describe("R5 — gobiz contributes (Test 12b — negative regression)", () => {
  it("kpiAndChannelSnapshot: source='gobiz' (GoFood) IS counted, never skipped", async () => {
    const t = convexTest(schema);
    const mp = await seedMenuProduct(t, "Original 80g", "ORIGINAL_80G_GF", 30000);
    await seedBigBallBom(t, mp, 1);
    // gobiz row only — NO native orders twin.
    await seedGobizRevenue(t, mp, /*qty=*/ 2, /*unitPrice=*/ 30000);

    const result = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: FROM_TS,
      toTs: TO_TS,
    });

    // Hard regression guard: if R5 ever widens to skip "gobiz", these all
    // collapse to 0 and GoFood disappears from every dashboard widget.
    expect(result.kpi.current.units).toBeGreaterThan(0);
    expect(result.kpi.current.netRevenue).toBeGreaterThan(0);
    expect(result.kpi.current.orderCount).toBeGreaterThan(0);

    const gofood = result.channelEconomics.find((c) => c.channel === "GoFood");
    expect(gofood).toBeDefined();
    expect(gofood!.units).toBeGreaterThan(0);
    expect(gofood!.net).toBeGreaterThan(0);
  });
});

// ============================================================================
// Test 17 — symmetry across all reducers that consume loadFilteredData
// ============================================================================
//
// All 11 reducers (kpiSummary, byWeekday, dayHourHeatmap, channelEconomics,
// volumeByType, unitsPerTxnByChannel, aovByChannel, skuPareto,
// skuChannelMatrix, channelMomentum, rollingTrend) are reached through the
// 3 snapshot queries below. Each test seeds 1 native Direct order + its
// internal mirror, then asserts a specific invariant that a double-count
// would break.
// ============================================================================

describe("R5 — symmetry across all loadFilteredData consumers (Test 17)", () => {
  it("kpiSummary (kpiAndChannelSnapshot.kpi): orderCount === 1, not 2", async () => {
    const t = convexTest(schema);
    const mp = await seedMenuProduct(t, "Original 80g", "ORIGINAL_KPI", 23000);
    await seedBigBallBom(t, mp, 1);
    await seedDirectOrderWithMirror(t, mp);
    const r = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: FROM_TS,
      toTs: TO_TS,
    });
    expect(r.kpi.current.orderCount).toBe(1);
    expect(r.kpi.current.units).toBe(1);
    expect(r.kpi.current.netRevenue).toBe(23000);
  });

  it("channelEconomics (kpiAndChannelSnapshot.channelEconomics): Direct.orderCount === 1", async () => {
    const t = convexTest(schema);
    const mp = await seedMenuProduct(t, "Original 80g", "ORIGINAL_CHE", 23000);
    await seedBigBallBom(t, mp, 1);
    await seedDirectOrderWithMirror(t, mp);
    const r = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: FROM_TS,
      toTs: TO_TS,
    });
    const direct = r.channelEconomics.find((c) => c.channel === "Direct");
    expect(direct).toBeDefined();
    expect(direct!.orderCount).toBe(1);
    expect(direct!.units).toBe(1);
    expect(direct!.gross).toBe(23000);
  });

  it("channelMomentum (kpiAndChannelSnapshot.channelMomentum): Direct totalRevenue === 23000", async () => {
    const t = convexTest(schema);
    const mp = await seedMenuProduct(t, "Original 80g", "ORIGINAL_CMO", 23000);
    await seedBigBallBom(t, mp, 1);
    await seedDirectOrderWithMirror(t, mp);
    const r = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: FROM_TS,
      toTs: TO_TS,
    });
    const direct = r.channelMomentum.channels.find((c) => c.channel === "Direct");
    expect(direct).toBeDefined();
    expect(direct!.totalRevenue).toBe(23000);
    // Pre-R5: each bucket would also contain double the units.
    expect(direct!.unitsSpark.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("byWeekday (timeSeriesSnapshot.byWeekday): Σ orders === 1, Σ units === 1", async () => {
    const t = convexTest(schema);
    const mp = await seedMenuProduct(t, "Original 80g", "ORIGINAL_BWK", 23000);
    await seedBigBallBom(t, mp, 1);
    await seedDirectOrderWithMirror(t, mp);
    const r = await t.query(api.reports.unitEconomics.timeSeriesSnapshot, {
      fromTs: FROM_TS,
      toTs: TO_TS,
    });
    const totalOrders = r.byWeekday.orders.reduce((a, b) => a + b, 0);
    const totalUnits = r.byWeekday.units.reduce((a, b) => a + b, 0);
    expect(totalOrders).toBe(1);
    expect(totalUnits).toBe(1);
  });

  it("byWeekdayRolling (timeSeriesSnapshot.byWeekdayRolling): Σ orders === 1, Σ units === 1", async () => {
    const t = convexTest(schema);
    const mp = await seedMenuProduct(t, "Original 80g", "ORIGINAL_BWR", 23000);
    await seedBigBallBom(t, mp, 1);
    await seedDirectOrderWithMirror(t, mp);
    const r = await t.query(api.reports.unitEconomics.timeSeriesSnapshot, {
      fromTs: FROM_TS,
      toTs: TO_TS,
    });
    const totalOrders = r.byWeekdayRolling.orders.reduce((a, b) => a + b, 0);
    const totalUnits = r.byWeekdayRolling.units.reduce((a, b) => a + b, 0);
    expect(totalOrders).toBe(1);
    expect(totalUnits).toBe(1);
  });

  it("rollingTrend (timeSeriesSnapshot.rollingTrend): Σ daily === 23000", async () => {
    const t = convexTest(schema);
    const mp = await seedMenuProduct(t, "Original 80g", "ORIGINAL_RT", 23000);
    await seedBigBallBom(t, mp, 1);
    await seedDirectOrderWithMirror(t, mp);
    const r = await t.query(api.reports.unitEconomics.timeSeriesSnapshot, {
      fromTs: FROM_TS,
      toTs: TO_TS,
    });
    const totalDaily = r.rollingTrend.daily.reduce((a, b) => a + b, 0);
    expect(totalDaily).toBe(23000);
  });

  it("dayHourHeatmap (timeSeriesSnapshot.dayHourHeatmap): Σ grid === 23000", async () => {
    const t = convexTest(schema);
    const mp = await seedMenuProduct(t, "Original 80g", "ORIGINAL_DHH", 23000);
    await seedBigBallBom(t, mp, 1);
    await seedDirectOrderWithMirror(t, mp);
    const r = await t.query(api.reports.unitEconomics.timeSeriesSnapshot, {
      fromTs: FROM_TS,
      toTs: TO_TS,
    });
    const totalGrid = r.dayHourHeatmap.grid.flat().reduce((a, b) => a + b, 0);
    expect(totalGrid).toBe(23000);
  });

  it("volumeByType (timeSeriesSnapshot.volumeByType.day): BIG_BALL Σ === 1", async () => {
    const t = convexTest(schema);
    const mp = await seedMenuProduct(t, "Original 80g", "ORIGINAL_VBT", 23000);
    await seedBigBallBom(t, mp, 1);
    await seedDirectOrderWithMirror(t, mp);
    const r = await t.query(api.reports.unitEconomics.timeSeriesSnapshot, {
      fromTs: FROM_TS,
      toTs: TO_TS,
    });
    const bigBall = r.volumeByType.day.series.find((s) => s.code === "BIG_BALL");
    expect(bigBall).toBeDefined();
    const totalBigBall = bigBall!.values.reduce((a, b) => a + b, 0);
    // Pre-R5: this would be 2 (mirror double-counted as a separate item).
    expect(totalBigBall).toBe(1);
  });

  it("typeMixOverTime (timeSeriesSnapshot.typeMixOverTime.day): BIG_BALL Σ === 1", async () => {
    const t = convexTest(schema);
    const mp = await seedMenuProduct(t, "Original 80g", "ORIGINAL_TMX", 23000);
    await seedBigBallBom(t, mp, 1);
    await seedDirectOrderWithMirror(t, mp);
    const r = await t.query(api.reports.unitEconomics.timeSeriesSnapshot, {
      fromTs: FROM_TS,
      toTs: TO_TS,
    });
    const bigBall = r.typeMixOverTime.day.series.find((s) => s.code === "BIG_BALL");
    expect(bigBall).toBeDefined();
    const totalBigBall = bigBall!.values.reduce((a, b) => a + b, 0);
    expect(totalBigBall).toBe(1);
  });

  it("skuTop / skuPareto (skuSnapshot.skuTop): top SKU revenue === 23000 (not 46000)", async () => {
    const t = convexTest(schema);
    const mp = await seedMenuProduct(t, "Original 80g", "ORIGINAL_SKU", 23000);
    await seedBigBallBom(t, mp, 1);
    await seedDirectOrderWithMirror(t, mp);
    const r = await t.query(api.reports.unitEconomics.skuSnapshot, {
      fromTs: FROM_TS,
      toTs: TO_TS,
    });
    const ours = r.skuTop.rows.find(
      (row) => row.productKey === (mp as unknown as string),
    );
    expect(ours).toBeDefined();
    // Pre-R5: 23000 (native) + 23000 (mirror) = 46000.
    expect(ours!.revenue).toBe(23000);
  });

  it("skuChannelMatrix (skuSnapshot.skuChannelMatrix): Direct cell === 23000 (not 46000)", async () => {
    const t = convexTest(schema);
    const mp = await seedMenuProduct(t, "Original 80g", "ORIGINAL_SCM", 23000);
    await seedBigBallBom(t, mp, 1);
    await seedDirectOrderWithMirror(t, mp);
    const r = await t.query(api.reports.unitEconomics.skuSnapshot, {
      fromTs: FROM_TS,
      toTs: TO_TS,
    });
    const product = r.skuChannelMatrix.matrix.find(
      (row) => row.productKey === (mp as unknown as string),
    );
    expect(product).toBeDefined();
    const directCell = product!.channels.find((c) => c.channel === "Direct");
    expect(directCell).toBeDefined();
    // Pre-R5: native (Direct) + mirror (also Direct via sourceToDisplayChannel)
    // = 46000 in the Direct column.
    expect(directCell!.revenue).toBe(23000);
  });
});
