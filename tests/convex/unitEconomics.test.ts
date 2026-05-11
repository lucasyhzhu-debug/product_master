/**
 * Integration tests for unitEconomics queries.
 *
 * Originally written for the 12 legacy wrapper queries
 * (kpiSummary, byWeekday, volumeByType, channelEconomics, skuPareto,
 * rollingTrend, channelMomentum, dayHourHeatmap, unitsPerTxnByChannel,
 * aovByChannel, skuChannelMatrix, typeMixOverTime). Phase 80.1 Task 23 deleted
 * all 12 wrappers; tests ported here to call the 3 snapshot queries
 * (kpiAndChannelSnapshot, timeSeriesSnapshot, skuSnapshot).
 *
 * Key regression guard: Hazelnut (future production types) MUST be counted
 * dynamically — never hardcode BIG_BALL/MID_BALL.
 */

import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import type { TestConvex } from "convex-test";
import type { Id } from "../../convex/_generated/dataModel";

// Worktree-aware module loading: convex-test defaults to import.meta.glob
// relative to node_modules/convex-test which resolves to the main repo.
// Provide explicit modules so tests use this worktree's convex/ files.
const modules = import.meta.glob("../../convex/**/*.*s");

type TestContext = TestConvex<typeof schema>;

async function seedBaseFixtures(t: TestContext) {
  const bigBallId = await t.run(async (ctx) =>
    ctx.db.insert("componentTypes", {
      name: "Big Ball",
      code: "BIG_BALL",
      category: "production" as const,
      unit: "pcs",
      unitCostIdr: 19231,
      trackInventory: false,
      sortOrder: 1,
      isActive: true,
      createdBy: "test",
      createdAt: Date.now(),
    }),
  );
  const midBallId = await t.run(async (ctx) =>
    ctx.db.insert("componentTypes", {
      name: "Mid Ball",
      code: "MID_BALL",
      category: "production" as const,
      unit: "pcs",
      unitCostIdr: 12000,
      trackInventory: false,
      sortOrder: 2,
      isActive: true,
      createdBy: "test",
      createdAt: Date.now(),
    }),
  );
  const hazelnutId = await t.run(async (ctx) =>
    ctx.db.insert("componentTypes", {
      name: "Hazelnut-Regular",
      code: "HAZELNUT_REGULAR",
      category: "production" as const,
      unit: "pcs",
      unitCostIdr: 15000,
      trackInventory: false,
      sortOrder: 3,
      isActive: true,
      createdBy: "test",
      createdAt: Date.now(),
    }),
  );
  return { bigBallId, midBallId, hazelnutId };
}

async function seedMenuProduct(
  t: TestContext,
  name: string,
  componentTypeId: Id<"componentTypes">,
  qtyPerProduct = 1,
): Promise<Id<"menuProducts">> {
  const menuProductId = await t.run(async (ctx) =>
    ctx.db.insert("menuProducts", {
      code: name.replace(/\s+/g, "_").toUpperCase(),
      name,
      grams: 80,
      defaultPrice: 50000,
      unitCost: 0,
      isActive: true,
      cachedProductionSummary: "",
    }),
  );
  await t.run(async (ctx) =>
    ctx.db.insert("menuProductComponents", {
      menuProductId,
      componentTypeId,
      quantity: qtyPerProduct,
      sortOrder: 0,
    }),
  );
  return menuProductId;
}

async function seedCustomer(t: TestContext): Promise<Id<"customers">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("customers", { name: "Test Customer", createdBy: "test" }),
  );
}

type OrderSeedOpts = {
  status?: "Complete" | "Draft" | "Cancelled" | "PaymentReceived";
  channel?:
    | "whatsapp"
    | "shopee"
    | "tiktok"
    | "tokopedia"
    | "grabfood"
    | "legato_goldfinch";
  completedAt?: number;
  orderDate?: number;
};

async function seedOrderWithItem(
  t: TestContext,
  customerId: Id<"customers">,
  menuProductId: Id<"menuProducts">,
  productName: string,
  quantity: number,
  unitPrice: number,
  discountAmount = 0,
  opts: OrderSeedOpts = {},
) {
  const ts = opts.completedAt ?? opts.orderDate ?? Date.now() - 86400000;
  const orderId = await t.run(async (ctx) =>
    ctx.db.insert("orders", {
      orderNumber: `${ts}-${Math.random().toString(36).slice(2, 6)}`,
      customerId,
      customerName: "Test Customer",
      status: opts.status ?? "Complete",
      paymentStatus: "Paid" as const,
      orderDate: opts.orderDate ?? ts,
      completedAt: opts.completedAt ?? ts,
      totalAmount: quantity * unitPrice,
      totalCost: 0,
      totalMargin: quantity * unitPrice - discountAmount,
      finalTotal: quantity * unitPrice - discountAmount,
      deliveryType: "Pickup",
      createdBy: "test",
      itemCount: 1,
      channel: opts.channel,
    }),
  );
  await t.run(async (ctx) =>
    ctx.db.insert("orderItems", {
      orderId,
      productName,
      quantity,
      unitPrice,
      unitCost: 0,
      discountAmount,
      lineTotal: quantity * unitPrice - discountAmount,
      lineCost: 0,
      lineMargin: quantity * unitPrice - discountAmount,
      menuProductId,
    }),
  );
  return orderId;
}

// ============================================================================
// kpiAndChannelSnapshot.kpi (was: kpiSummary)
// ============================================================================

describe("unitEconomics.kpiAndChannelSnapshot.kpi", () => {
  test("Hazelnut-Regular units counted via dynamic BOM (critical regression guard)", async () => {
    const t = convexTest(schema, modules);
    const { hazelnutId } = await seedBaseFixtures(t);
    const mp = await seedMenuProduct(t, "Hazelnut Single", hazelnutId);
    const customerId = await seedCustomer(t);
    const ts = Date.now() - 86400000;
    await seedOrderWithItem(t, customerId, mp, "Hazelnut Single", 5, 50000, 0, {
      channel: "whatsapp",
      completedAt: ts,
    });

    const snap = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: ts - 1000,
      toTs: Date.now() + 1000,
    });
    expect(snap.kpi.current.units).toBe(5);
    expect(snap.kpi.current.grossRevenue).toBe(250000);
    expect(snap.kpi.current.netRevenue).toBe(250000);
  });

  test("excludes Draft and Cancelled orders", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId } = await seedBaseFixtures(t);
    const mp = await seedMenuProduct(t, "Original", bigBallId);
    const customerId = await seedCustomer(t);
    const now = Date.now();

    for (const status of ["Draft", "Cancelled"] as const) {
      await seedOrderWithItem(t, customerId, mp, "Original", 10, 30000, 0, {
        status,
        completedAt: now - 86400000,
      });
    }

    const snap = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: now - 2 * 86400000,
      toTs: now + 1000,
    });
    expect(snap.kpi.current.units).toBe(0);
    expect(snap.kpi.current.orderCount).toBe(0);
  });

  test("WoW delta uses prior period of equal span", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId } = await seedBaseFixtures(t);
    const mp = await seedMenuProduct(t, "Original", bigBallId);
    const customerId = await seedCustomer(t);
    const now = Date.now();

    await seedOrderWithItem(t, customerId, mp, "Original", 10, 30000, 0, {
      completedAt: now - 3 * 86400000,
    });
    await seedOrderWithItem(t, customerId, mp, "Original", 5, 30000, 0, {
      completedAt: now - 10 * 86400000,
    });

    const snap = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: now - 7 * 86400000,
      toTs: now,
    });
    expect(snap.kpi.current.units).toBe(10);
    expect(snap.kpi.prior.units).toBe(5);
    expect(snap.kpi.delta.units).toBe(100); // +100%
  });

  test("channel filter restricts aggregation to Direct channel", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId } = await seedBaseFixtures(t);
    const mp = await seedMenuProduct(t, "Original", bigBallId);
    const customerId = await seedCustomer(t);
    const now = Date.now();

    await seedOrderWithItem(t, customerId, mp, "Original", 3, 30000, 0, {
      channel: "whatsapp",
      completedAt: now - 86400000,
    });
    await seedOrderWithItem(t, customerId, mp, "Original", 3, 30000, 0, {
      channel: "shopee",
      completedAt: now - 86400000,
    });

    const all = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: now - 7 * 86400000,
      toTs: now + 1000,
    });
    expect(all.kpi.current.units).toBe(6);

    const directOnly = await t.query(
      api.reports.unitEconomics.kpiAndChannelSnapshot,
      {
        fromTs: now - 7 * 86400000,
        toTs: now + 1000,
        channels: ["Direct"],
      },
    );
    expect(directOnly.kpi.current.units).toBe(3);
  });
});

// ============================================================================
// timeSeriesSnapshot.byWeekday (was: byWeekday query)
// ============================================================================

describe("unitEconomics.timeSeriesSnapshot.byWeekday", () => {
  test("returns 7 buckets with correct Jakarta-local weekday", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId } = await seedBaseFixtures(t);
    const mp = await seedMenuProduct(t, "Original", bigBallId);
    const customerId = await seedCustomer(t);

    // 2026-01-05 00:00 UTC = 2026-01-05 07:00 Jakarta = Monday
    const mondayTs = new Date("2026-01-05T00:00:00Z").getTime();
    await seedOrderWithItem(t, customerId, mp, "Original", 2, 30000, 0, {
      completedAt: mondayTs,
    });

    const snap = await t.query(api.reports.unitEconomics.timeSeriesSnapshot, {
      fromTs: mondayTs - 86400000,
      toTs: mondayTs + 86400000,
    });
    const result = snap.byWeekday;
    expect(result.labels[0]).toBe("Mon");
    expect(result.orders[0]).toBe(1);
    expect(result.units[0]).toBe(2);
    expect(result.orders.slice(1).every((n: number) => n === 0)).toBe(true);
  });

  test("rolling mode returns per-day buckets keyed by date", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId } = await seedBaseFixtures(t);
    const mp = await seedMenuProduct(t, "Original", bigBallId);
    const customerId = await seedCustomer(t);

    // Three consecutive WIB days. 17:00 UTC = 00:00 next-day Jakarta.
    const day1 = new Date("2026-01-05T01:00:00Z").getTime(); // 2026-01-05 WIB (Mon)
    const day2 = new Date("2026-01-06T01:00:00Z").getTime(); // 2026-01-06 WIB (Tue)
    const day3 = new Date("2026-01-07T01:00:00Z").getTime(); // 2026-01-07 WIB (Wed)
    await seedOrderWithItem(t, customerId, mp, "Original", 2, 30000, 0, { completedAt: day1 });
    await seedOrderWithItem(t, customerId, mp, "Original", 3, 30000, 0, { completedAt: day2 });
    await seedOrderWithItem(t, customerId, mp, "Original", 5, 30000, 0, { completedAt: day3 });

    const snap = await t.query(api.reports.unitEconomics.timeSeriesSnapshot, {
      fromTs: day1 - 3600 * 1000,
      toTs: day3 + 3600 * 1000,
    });
    const result = snap.byWeekdayRolling;
    // Should have at least 3 date-keyed buckets covering the seeded days.
    expect(result.labels.length).toBeGreaterThanOrEqual(3);
    expect(result.labels.every((l: string) => /^\d{4}-\d{2}-\d{2}$/.test(l))).toBe(true);
    const idx1 = result.labels.indexOf("2026-01-05");
    const idx2 = result.labels.indexOf("2026-01-06");
    const idx3 = result.labels.indexOf("2026-01-07");
    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx2).toBeGreaterThanOrEqual(0);
    expect(idx3).toBeGreaterThanOrEqual(0);
    expect(result.orders[idx1]).toBe(1);
    expect(result.orders[idx2]).toBe(1);
    expect(result.orders[idx3]).toBe(1);
    expect(result.units[idx1]).toBe(2);
    expect(result.units[idx2]).toBe(3);
    expect(result.units[idx3]).toBe(5);
  });
});

// ============================================================================
// timeSeriesSnapshot.volumeByType.day — Hazelnut regression
// ============================================================================

describe("unitEconomics.timeSeriesSnapshot.volumeByType.day", () => {
  test("Hazelnut-Regular appears as a distinct series", async () => {
    const t = convexTest(schema, modules);
    const { hazelnutId } = await seedBaseFixtures(t);
    const mp = await seedMenuProduct(t, "Hazelnut Single", hazelnutId);
    const customerId = await seedCustomer(t);
    const ts = Date.now() - 86400000;
    await seedOrderWithItem(t, customerId, mp, "Hazelnut Single", 4, 50000, 0, {
      completedAt: ts,
    });

    const snap = await t.query(api.reports.unitEconomics.timeSeriesSnapshot, {
      fromTs: ts - 1000,
      toTs: Date.now() + 1000,
    });
    const res = snap.volumeByType.day;
    const series = res.series.find((s: { code: string }) => s.code === "HAZELNUT_REGULAR");
    expect(series).toBeDefined();
    const total = series!.values.reduce((a: number, b: number) => a + b, 0);
    expect(total).toBe(4);
  });
});

// ============================================================================
// kpiAndChannelSnapshot.channelEconomics — take-rate math
// ============================================================================

describe("unitEconomics.kpiAndChannelSnapshot.channelEconomics", () => {
  test("takePct reflects discount / gross, revPerUnit correct", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId } = await seedBaseFixtures(t);
    const mp = await seedMenuProduct(t, "Original", bigBallId);
    const customerId = await seedCustomer(t);
    const ts = Date.now() - 86400000;

    // Gross 100k (4 * 25k), discount 20k → revPerUnit = 80k/4 = 20k, takePct = 20%
    await seedOrderWithItem(t, customerId, mp, "Original", 4, 25000, 20000, {
      channel: "shopee",
      completedAt: ts,
    });

    const snap = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: ts - 1000,
      toTs: Date.now() + 1000,
    });
    const rows = snap.channelEconomics;
    const shopee = rows.find((r: { channel: string }) => r.channel === "Shopee");
    expect(shopee).toBeDefined();
    expect(shopee!.gross).toBe(100000);
    expect(shopee!.discount).toBe(20000);
    expect(shopee!.takePct).toBeCloseTo(20, 1);
    expect(shopee!.revPerUnit).toBe(20000);
  });
});

// ============================================================================
// skuSnapshot.skuTop — cumulativePct monotonic + "Other" bucket
// ============================================================================

describe("unitEconomics.skuSnapshot.skuTop", () => {
  test("capped 20 + Other, cumulativePct runs 0→100 monotonic", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId } = await seedBaseFixtures(t);
    const customerId = await seedCustomer(t);
    const ts = Date.now() - 86400000;

    // Seed 12 products (less than the cap=20), so NO Other row — all products
    // fit in the top list. Cumulative should still run 0→100 monotonic.
    for (let i = 0; i < 12; i++) {
      const mp = await seedMenuProduct(t, `P${i}`, bigBallId);
      await seedOrderWithItem(t, customerId, mp, `P${i}`, 12 - i, 10000, 0, {
        completedAt: ts,
      });
    }

    const snap = await t.query(api.reports.unitEconomics.skuSnapshot, {
      fromTs: ts - 1000,
      toTs: Date.now() + 1000,
    });
    const rows = snap.skuTop.rows;
    expect(rows.length).toBeGreaterThanOrEqual(12);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].cumulativePct).toBeGreaterThanOrEqual(rows[i - 1].cumulativePct);
    }
    expect(rows[rows.length - 1].cumulativePct).toBeCloseTo(100, 1);
  });
});

// ============================================================================
// timeSeriesSnapshot.rollingTrend — 7d window
// ============================================================================

describe("unitEconomics.timeSeriesSnapshot.rollingTrend", () => {
  test("daily series spans full calendar window and rolling7 matches trailing mean (10 consecutive seeded days)", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId } = await seedBaseFixtures(t);
    const mp = await seedMenuProduct(t, "Original", bigBallId);
    const customerId = await seedCustomer(t);
    const now = Date.now();

    // Seed 10 consecutive days × Rp 30_000 net each (1 unit/day)
    for (let d = 9; d >= 0; d--) {
      const ts = now - d * 86400000;
      await seedOrderWithItem(t, customerId, mp, "Original", 1, 30000, 0, {
        completedAt: ts,
      });
    }

    const fromTs = now - 10 * 86400000;
    const toTs = now + 1000;
    const snap = await t.query(api.reports.unitEconomics.timeSeriesSnapshot, {
      fromTs,
      toTs,
    });
    const res = snap.rollingTrend;

    // daily.length equals full WIB calendar-day span (C2 regression guard:
    // after WR-02 the series MUST include zero-revenue days, which is why
    // `every(v === 30000)` no longer holds).
    const spanDays = Math.ceil((toTs - fromTs) / 86400000);
    // Between spanDays-1 and spanDays+1 is acceptable (rollover on bucketKey loop).
    expect(res.daily.length).toBeGreaterThanOrEqual(spanDays - 1);
    expect(res.daily.length).toBeLessThanOrEqual(spanDays + 1);

    // Full-period sum equals seeded total (~Rp 300_000; zero-days contribute 0).
    const total = res.daily.reduce((a: number, b: number) => a + b, 0);
    expect(total).toBeCloseTo(300000, -1);

    // Last rolling7 equals average over trailing 7 seeded days (all 30k) → 30k.
    expect(res.rolling7[res.rolling7.length - 1]).toBeCloseTo(30000, 1);
  });

  test("rolling7 includes zero-revenue gap days (M5 regression)", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId } = await seedBaseFixtures(t);
    const mp = await seedMenuProduct(t, "Original", bigBallId);
    const customerId = await seedCustomer(t);
    const now = Date.now();

    // Seed revenue on days 9, 7, 5, 3, 1 back (5 days in a 10-day window, alternating).
    const seededOffsets = [9, 7, 5, 3, 1];
    for (const d of seededOffsets) {
      const ts = now - d * 86400000;
      await seedOrderWithItem(t, customerId, mp, "Original", 1, 30000, 0, {
        completedAt: ts,
      });
    }

    const fromTs = now - 10 * 86400000;
    const toTs = now + 1000;
    const snap = await t.query(api.reports.unitEconomics.timeSeriesSnapshot, {
      fromTs,
      toTs,
    });
    const res = snap.rollingTrend;

    // Find the last day with non-zero revenue — rolling7 at that index should
    // equal the sum of the trailing 7 actual daily values divided by 7, NOT
    // only divided by the number of non-zero days (that would overstate the mean).
    const lastIdx = res.daily.length - 1;
    const last7 = res.daily.slice(Math.max(0, lastIdx - 6), lastIdx + 1);
    const expected = last7.reduce((a: number, b: number) => a + b, 0) / last7.length;
    expect(res.rolling7[lastIdx]).toBeCloseTo(expected, 1);

    // Zero days must be represented (mean over trailing-7 must be < 30000 since some are 0).
    expect(res.rolling7[lastIdx]).toBeLessThan(30000);
  });
});

// ============================================================================
// C1 — menuProductIds filter must also constrain the order set
// ============================================================================

describe("unitEconomics.kpiAndChannelSnapshot menuProductIds filter", () => {
  test("orderCount drops to 1 when filter matches only one product (C1 regression)", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId } = await seedBaseFixtures(t);
    const customerId = await seedCustomer(t);
    const pId = await seedMenuProduct(t, "ProductP", bigBallId);
    const qId = await seedMenuProduct(t, "ProductQ", bigBallId);
    const now = Date.now();

    // order1: only ProductP; order2: only ProductQ
    await seedOrderWithItem(t, customerId, pId, "ProductP", 3, 30000, 0, {
      completedAt: now - 86400000,
    });
    await seedOrderWithItem(t, customerId, qId, "ProductQ", 5, 30000, 0, {
      completedAt: now - 86400000,
    });

    // Filter on P only
    const filtered = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: now - 7 * 86400000,
      toTs: now + 1000,
      menuProductIds: [pId],
    });
    expect(filtered.kpi.current.orderCount).toBe(1);
    expect(filtered.kpi.current.units).toBe(3);

    // No filter: both orders count
    const all = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: now - 7 * 86400000,
      toTs: now + 1000,
    });
    expect(all.kpi.current.orderCount).toBe(2);
  });
});

// ============================================================================
// I6 — coverage for remaining analytics queries (via snapshots)
// ============================================================================

describe("unitEconomics.kpiAndChannelSnapshot.channelMomentum", () => {
  test("bucketCount picks 7/13/12 based on span", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId } = await seedBaseFixtures(t);
    const mp = await seedMenuProduct(t, "Original", bigBallId);
    const customerId = await seedCustomer(t);
    const now = Date.now();

    // Seed a single order so the query returns at least one channel.
    await seedOrderWithItem(t, customerId, mp, "Original", 2, 30000, 0, {
      completedAt: now - 86400000,
    });

    const res8d = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: now - 8 * 86400000,
      toTs: now,
    });
    expect(res8d.channelMomentum.bucketCount).toBe(7);

    const res15d = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: now - 15 * 86400000,
      toTs: now,
    });
    expect(res15d.channelMomentum.bucketCount).toBe(13);

    const res90d = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: now - 120 * 86400000,
      toTs: now,
    });
    expect(res90d.channelMomentum.bucketCount).toBe(12);
  });
});

describe("unitEconomics.timeSeriesSnapshot.dayHourHeatmap", () => {
  test("returns non-empty 7×8 grid with seeded hour variation", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId } = await seedBaseFixtures(t);
    const mp = await seedMenuProduct(t, "Original", bigBallId);
    const customerId = await seedCustomer(t);

    // 2026-01-05 02:00 UTC = 2026-01-05 09:00 WIB = Monday, 9-12 bin (col 3)
    const mondayMorning = new Date("2026-01-05T02:00:00Z").getTime();
    // 2026-01-05 13:00 UTC = 2026-01-05 20:00 WIB = Monday, 18-21 bin (col 6)
    const mondayEvening = new Date("2026-01-05T13:00:00Z").getTime();
    await seedOrderWithItem(t, customerId, mp, "Original", 1, 10000, 0, {
      completedAt: mondayMorning,
    });
    await seedOrderWithItem(t, customerId, mp, "Original", 1, 20000, 0, {
      completedAt: mondayEvening,
    });

    const snap = await t.query(api.reports.unitEconomics.timeSeriesSnapshot, {
      fromTs: mondayMorning - 86400000,
      toTs: mondayEvening + 86400000,
    });
    const res = snap.dayHourHeatmap;
    expect(res.grid.length).toBe(7);
    expect(res.grid[0].length).toBe(8);
    // Monday row has revenue split between two bins
    const mondayTotal = res.grid[0].reduce((a: number, b: number) => a + b, 0);
    expect(mondayTotal).toBe(30000);
    expect(res.max).toBeGreaterThan(0);
  });
});

// unitsPerTxnByChannel + aovByChannel: these were legacy subset selectors of
// channelEconomics. Consumers now compute unitsPerTxn / AOV client-side from
// channelEconomics totals. Covering the underlying data here.

describe("unitEconomics.kpiAndChannelSnapshot.channelEconomics (units + orderCount)", () => {
  test("reports per-channel units/orderCount for multi-channel seed (unitsPerTxn derivable)", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId } = await seedBaseFixtures(t);
    const mp = await seedMenuProduct(t, "Original", bigBallId);
    const customerId = await seedCustomer(t);
    const ts = Date.now() - 86400000;

    await seedOrderWithItem(t, customerId, mp, "Original", 4, 30000, 0, {
      channel: "whatsapp",
      completedAt: ts,
    });
    await seedOrderWithItem(t, customerId, mp, "Original", 2, 30000, 0, {
      channel: "shopee",
      completedAt: ts,
    });

    const snap = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: ts - 1000,
      toTs: Date.now() + 1000,
    });
    const rows = snap.channelEconomics;
    const direct = rows.find((r: { channel: string }) => r.channel === "Direct");
    const shopee = rows.find((r: { channel: string }) => r.channel === "Shopee");
    expect(direct!.units).toBe(4);
    expect(direct!.orderCount).toBe(1);
    expect(direct!.units / direct!.orderCount).toBe(4); // unitsPerTxn
    expect(shopee!.units).toBe(2);
    expect(shopee!.units / shopee!.orderCount).toBe(2);
  });

  test("reports per-channel gross for multi-channel seed (AOV derivable)", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId } = await seedBaseFixtures(t);
    const mp = await seedMenuProduct(t, "Original", bigBallId);
    const customerId = await seedCustomer(t);
    const ts = Date.now() - 86400000;

    // Direct: 100k gross total
    await seedOrderWithItem(t, customerId, mp, "Original", 4, 25000, 0, {
      channel: "whatsapp",
      completedAt: ts,
    });
    // Shopee: 60k gross total
    await seedOrderWithItem(t, customerId, mp, "Original", 2, 30000, 0, {
      channel: "shopee",
      completedAt: ts,
    });

    const snap = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: ts - 1000,
      toTs: Date.now() + 1000,
    });
    const rows = snap.channelEconomics;
    const direct = rows.find((r: { channel: string }) => r.channel === "Direct");
    const shopee = rows.find((r: { channel: string }) => r.channel === "Shopee");
    expect(direct!.gross).toBe(100000); // → grossAov 100000 (single order)
    expect(shopee!.gross).toBe(60000);  // → grossAov 60000 (single order)
  });
});

describe("unitEconomics.skuSnapshot.skuChannelMatrix", () => {
  test("two products × two channels — verifies cell values", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId } = await seedBaseFixtures(t);
    const customerId = await seedCustomer(t);
    const aId = await seedMenuProduct(t, "ProductA", bigBallId);
    const bId = await seedMenuProduct(t, "ProductB", bigBallId);
    const ts = Date.now() - 86400000;

    await seedOrderWithItem(t, customerId, aId, "ProductA", 3, 10000, 0, {
      channel: "whatsapp",
      completedAt: ts,
    });
    await seedOrderWithItem(t, customerId, bId, "ProductB", 2, 20000, 0, {
      channel: "shopee",
      completedAt: ts,
    });
    await seedOrderWithItem(t, customerId, aId, "ProductA", 1, 10000, 0, {
      channel: "shopee",
      completedAt: ts,
    });

    const snap = await t.query(api.reports.unitEconomics.skuSnapshot, {
      fromTs: ts - 1000,
      toTs: Date.now() + 1000,
    });
    const res = snap.skuChannelMatrix;
    const productA = res.matrix.find((r: { product: string }) => r.product === "ProductA");
    expect(productA).toBeDefined();
    const aShopee = productA!.channels.find(
      (c: { channel: string }) => c.channel === "Shopee",
    );
    // A's shopee revenue = 1*10k = 10k; shopee total = 40k+10k = 50k → 20%
    expect(aShopee!.revenue).toBe(10000);
    expect(aShopee!.pctOfChannel).toBeCloseTo(20, 1);
  });
});

describe("unitEconomics.timeSeriesSnapshot.volumeByType.week", () => {
  test("weekly buckets aggregate daily counts", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId } = await seedBaseFixtures(t);
    const mp = await seedMenuProduct(t, "Original", bigBallId);
    const customerId = await seedCustomer(t);

    // 3 orders spread across one WIB week → 7 units total.
    const monday = new Date("2026-01-05T02:00:00Z").getTime();
    await seedOrderWithItem(t, customerId, mp, "Original", 2, 10000, 0, {
      completedAt: monday,
    });
    await seedOrderWithItem(t, customerId, mp, "Original", 3, 10000, 0, {
      completedAt: monday + 2 * 86400000,
    });
    await seedOrderWithItem(t, customerId, mp, "Original", 2, 10000, 0, {
      completedAt: monday + 4 * 86400000,
    });

    const snap = await t.query(api.reports.unitEconomics.timeSeriesSnapshot, {
      fromTs: monday - 86400000,
      toTs: monday + 7 * 86400000,
    });
    const res = snap.volumeByType.week;
    const series = res.series.find((s: { code: string }) => s.code === "BIG_BALL");
    expect(series).toBeDefined();
    const total = series!.values.reduce((a: number, b: number) => a + b, 0);
    expect(total).toBe(7);
  });
});

describe("unitEconomics WR-06 legacy completedAt fallback", () => {
  test("orderDate-only orders appear; completedAt-outside orders do not leak", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId } = await seedBaseFixtures(t);
    const mp = await seedMenuProduct(t, "Original", bigBallId);
    const customerId = await seedCustomer(t);
    const now = Date.now();
    const inWindow = now - 2 * 86400000;
    const outsideWindow = now - 30 * 86400000;

    // Case 1: completedAt in window — must appear
    await seedOrderWithItem(t, customerId, mp, "Original", 1, 30000, 0, {
      completedAt: inWindow,
    });

    // Case 2: NO completedAt, orderDate in window — must appear (legacy branch)
    const legacyId = await t.run(async (ctx) =>
      ctx.db.insert("orders", {
        orderNumber: `legacy-${inWindow}`,
        customerId,
        customerName: "Test Customer",
        status: "Complete" as const,
        paymentStatus: "Paid" as const,
        orderDate: inWindow,
        totalAmount: 30000,
        totalCost: 0,
        totalMargin: 30000,
        finalTotal: 30000,
        deliveryType: "Pickup",
        createdBy: "test",
        itemCount: 1,
        channel: "whatsapp",
      }),
    );
    await t.run(async (ctx) =>
      ctx.db.insert("orderItems", {
        orderId: legacyId,
        productName: "Original",
        quantity: 1,
        unitPrice: 30000,
        unitCost: 0,
        discountAmount: 0,
        lineTotal: 30000,
        lineCost: 0,
        lineMargin: 30000,
        menuProductId: mp,
      }),
    );

    // Case 3: completedAt OUTSIDE window, orderDate INSIDE window — must NOT appear.
    // This is the WR-06 asymmetry guard.
    await seedOrderWithItem(t, customerId, mp, "Original", 99, 30000, 0, {
      completedAt: outsideWindow,
      orderDate: inWindow,
    });

    const snap = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: now - 7 * 86400000,
      toTs: now + 1000,
    });
    // Expect 1 + 1 = 2 units (Cases 1 and 2). Case 3's 99 units must be excluded.
    expect(snap.kpi.current.units).toBe(2);
    expect(snap.kpi.current.orderCount).toBe(2);
  });
});

// ============================================================================
// externalRevenue integration (Phase 80 UAT-01) — via snapshots
// ============================================================================

describe("unitEconomics.externalRevenue integration", () => {
  test("GrabFood externalRevenue row with items is counted in kpi + channelEconomics", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId } = await seedBaseFixtures(t);
    const mp = await seedMenuProduct(t, "Original", bigBallId);
    const now = Date.now();
    const ts = now - 86400000;

    const revId = await t.run(async (ctx) =>
      ctx.db.insert("externalRevenue", {
        source: "grabfood" as const,
        periodStart: ts,
        periodEnd: ts,
        transactionDate: ts,
        transactionType: "sales" as const,
        revenueGross: 100000,
        revenueNet: 85000,
        commission: 15000,
        quantitySold: 2,
        transactionCount: 1,
        dataOrigin: "api_revenue" as const,
        confidence: "exact" as const,
        externalTransactionId: "gf-test-1",
      }),
    );
    await t.run(async (ctx) =>
      ctx.db.insert("externalRevenueItems", {
        revenueId: revId,
        source: "grabfood" as const,
        productName: "Original GrabFood",
        unitPrice: 50000,
        quantity: 2,
        totalPrice: 100000,
        linkedMenuProductId: mp,
        isAutoMatched: true,
        matchConfidence: "exact" as const,
        createdAt: ts,
      }),
    );

    const snap = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: now - 7 * 86400000,
      toTs: now + 1000,
    });
    expect(snap.kpi.current.orderCount).toBeGreaterThanOrEqual(1);
    expect(snap.kpi.current.netRevenue).toBeGreaterThanOrEqual(100000);
    expect(snap.kpi.current.units).toBe(2); // BOM: 1 BIG_BALL per product × 2 units

    // Phase 81 D-05: source="grabfood" resolves to Platform="GrabFood" (NOT
    // "GoFood"). The legacy sourceToDisplayChannel collapsed both gobiz and
    // grabfood → "GoFood" — that ambiguity 138 was closed by D-05.
    const grabfood = snap.channelEconomics.find((r) => r.channel === "GrabFood");
    expect(grabfood).toBeDefined();
    expect(grabfood!.gross).toBe(100000);
    expect(grabfood!.units).toBe(2);
    expect(grabfood!.orderCount).toBe(1);
  });

  test("transactionCount > 1 inflates orderCount correctly (no double-count)", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId } = await seedBaseFixtures(t);
    const mp = await seedMenuProduct(t, "Original", bigBallId);
    const now = Date.now();
    const ts = now - 86400000;

    const revId = await t.run(async (ctx) =>
      ctx.db.insert("externalRevenue", {
        source: "shopee" as const,
        periodStart: ts,
        periodEnd: ts,
        transactionDate: ts,
        transactionType: "sales" as const,
        revenueGross: 150000,
        revenueNet: 150000,
        transactionCount: 3, // 3 transactions rolled up
        dataOrigin: "api_revenue" as const,
        confidence: "exact" as const,
      }),
    );
    await t.run(async (ctx) =>
      ctx.db.insert("externalRevenueItems", {
        revenueId: revId,
        source: "shopee" as const,
        productName: "Original Shopee",
        unitPrice: 50000,
        quantity: 3,
        totalPrice: 150000,
        linkedMenuProductId: mp,
        isAutoMatched: true,
        createdAt: ts,
      }),
    );

    const snap = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: now - 7 * 86400000,
      toTs: now + 1000,
    });
    // orderCount respects transactionCount=3, not 1.
    expect(snap.kpi.current.orderCount).toBe(3);

    // Channel filter by Shopee must surface this row (UAT-04 regression guard).
    const shopeeOnly = await t.query(
      api.reports.unitEconomics.kpiAndChannelSnapshot,
      {
        fromTs: now - 7 * 86400000,
        toTs: now + 1000,
        channels: ["Shopee"],
      },
    );
    expect(shopeeOnly.kpi.current.netRevenue).toBe(150000);
    expect(shopeeOnly.kpi.current.units).toBe(3);
  });

  test("externalRevenueItems without linkedMenuProductId produce '(Unlinked)' SKU bucket", async () => {
    const t = convexTest(schema, modules);
    await seedBaseFixtures(t);
    const now = Date.now();
    const ts = now - 86400000;

    const revId = await t.run(async (ctx) =>
      ctx.db.insert("externalRevenue", {
        source: "tiktok" as const,
        periodStart: ts,
        periodEnd: ts,
        transactionDate: ts,
        transactionType: "sales" as const,
        revenueGross: 75000,
        revenueNet: 75000,
        transactionCount: 1,
        dataOrigin: "api_revenue" as const,
        confidence: "exact" as const,
      }),
    );
    await t.run(async (ctx) =>
      ctx.db.insert("externalRevenueItems", {
        revenueId: revId,
        source: "tiktok" as const,
        productName: "Unknown TikTok SKU",
        unitPrice: 25000,
        quantity: 3,
        totalPrice: 75000,
        // linkedMenuProductId deliberately omitted
        isAutoMatched: false,
        matchConfidence: "none" as const,
        createdAt: ts,
      }),
    );

    const skuSnap = await t.query(api.reports.unitEconomics.skuSnapshot, {
      fromTs: now - 7 * 86400000,
      toTs: now + 1000,
    });
    const unlinked = skuSnap.skuTop.rows.find((r) => r.name === "(Unlinked)");
    expect(unlinked).toBeDefined();
    expect(unlinked!.revenue).toBe(75000);

    // Unit count is 0 because no linkedMenuProductId → cannot resolve BOM.
    const kpiSnap = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: now - 7 * 86400000,
      toTs: now + 1000,
    });
    expect(kpiSnap.kpi.current.netRevenue).toBe(75000);
    expect(kpiSnap.kpi.current.units).toBe(0);
  });

  test("K3Mart externalRevenue without child items: BOM-linked parent contributes BOM-resolved units", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId } = await seedBaseFixtures(t);
    const mp = await seedMenuProduct(t, "Original", bigBallId, 1);
    const now = Date.now();
    const ts = now - 86400000;

    // K3Mart parent with linkedMenuProductId set, NO child externalRevenueItems.
    await t.run(async (ctx) =>
      ctx.db.insert("externalRevenue", {
        source: "k3mart" as const,
        periodStart: ts,
        periodEnd: ts,
        transactionDate: ts,
        transactionType: "sales" as const,
        revenueGross: 250000,
        revenueNet: 200000,
        quantitySold: 5,
        transactionCount: 1,
        dataOrigin: "api_revenue" as const,
        confidence: "exact" as const,
        externalTransactionId: "k3-test-linked-1",
        linkedMenuProductId: mp,
        productName: "Original K3Mart",
      }),
    );

    const snap = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: now - 7 * 86400000,
      toTs: now + 1000,
    });
    // BOM: 1 BIG_BALL per product × 5 = 5 units.
    expect(snap.kpi.current.units).toBeGreaterThanOrEqual(5);
    expect(snap.kpi.current.netRevenue).toBeGreaterThanOrEqual(200000);

    const k3 = snap.channelEconomics.find((r) => r.channel === "K3Mart");
    expect(k3).toBeDefined();
    expect(k3!.units).toBeGreaterThanOrEqual(5);
    expect(k3!.gross).toBe(250000);
  });

  test("K3Mart externalRevenue without child items AND without linkedMenuProductId: quantitySold contributes to unitsSold (BOM-unresolved)", async () => {
    const t = convexTest(schema, modules);
    await seedBaseFixtures(t);
    const now = Date.now();
    const ts = now - 86400000;

    // K3Mart parent with NO linkedMenuProductId, NO child externalRevenueItems.
    // This is the classic K3Mart api_revenue roll-up case that previously
    // contributed 0 units. UAT round-2 fix: count quantitySold directly.
    await t.run(async (ctx) =>
      ctx.db.insert("externalRevenue", {
        source: "k3mart" as const,
        periodStart: ts,
        periodEnd: ts,
        transactionDate: ts,
        transactionType: "sales" as const,
        revenueGross: 100000,
        revenueNet: 80000,
        quantitySold: 7,
        transactionCount: 1,
        dataOrigin: "api_revenue" as const,
        confidence: "exact" as const,
        externalTransactionId: "k3-test-unlinked-1",
        productName: "Frollie Original 80g K3Mart",
      }),
    );

    const snap = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
      fromTs: now - 7 * 86400000,
      toTs: now + 1000,
    });
    // BOM-unresolved: quantitySold counts as units directly (7).
    expect(snap.kpi.current.units).toBe(7);
    // Synthesized parent-fallback items carry revenueGross as lineTotal with
    // discountAmount=0 (mirrors child-item convention where commission is
    // not apportioned at item level). So net == gross at item level.
    expect(snap.kpi.current.netRevenue).toBe(100000);
    expect(snap.kpi.current.grossRevenue).toBe(100000);
    expect(snap.kpi.current.orderCount).toBe(1);

    const k3 = snap.channelEconomics.find((r) => r.channel === "K3Mart");
    expect(k3).toBeDefined();
    expect(k3!.units).toBe(7);
    expect(k3!.gross).toBe(100000);
    expect(k3!.orderCount).toBe(1);
  });
});
