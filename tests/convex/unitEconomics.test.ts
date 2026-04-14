/**
 * Integration tests for unitEconomics queries.
 * Phase 80 Plan 01. Key regression guard: Hazelnut (future production types)
 * MUST be counted dynamically — never hardcode BIG_BALL/MID_BALL.
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
// kpiSummary
// ============================================================================

describe("unitEconomics.kpiSummary", () => {
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

    const result = await t.query(api.reports.unitEconomics.kpiSummary, {
      fromTs: ts - 1000,
      toTs: Date.now() + 1000,
    });
    expect(result.current.units).toBe(5);
    expect(result.current.grossRevenue).toBe(250000);
    expect(result.current.netRevenue).toBe(250000);
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

    const result = await t.query(api.reports.unitEconomics.kpiSummary, {
      fromTs: now - 2 * 86400000,
      toTs: now + 1000,
    });
    expect(result.current.units).toBe(0);
    expect(result.current.orderCount).toBe(0);
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

    const result = await t.query(api.reports.unitEconomics.kpiSummary, {
      fromTs: now - 7 * 86400000,
      toTs: now,
    });
    expect(result.current.units).toBe(10);
    expect(result.prior.units).toBe(5);
    expect(result.delta.units).toBe(100); // +100%
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

    const all = await t.query(api.reports.unitEconomics.kpiSummary, {
      fromTs: now - 7 * 86400000,
      toTs: now + 1000,
    });
    expect(all.current.units).toBe(6);

    const directOnly = await t.query(api.reports.unitEconomics.kpiSummary, {
      fromTs: now - 7 * 86400000,
      toTs: now + 1000,
      channels: ["Direct"],
    });
    expect(directOnly.current.units).toBe(3);
  });
});

// ============================================================================
// byWeekday
// ============================================================================

describe("unitEconomics.byWeekday", () => {
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

    const result = await t.query(api.reports.unitEconomics.byWeekday, {
      fromTs: mondayTs - 86400000,
      toTs: mondayTs + 86400000,
    });
    expect(result.labels[0]).toBe("Mon");
    expect(result.orders[0]).toBe(1);
    expect(result.units[0]).toBe(2);
    expect(result.orders.slice(1).every((n: number) => n === 0)).toBe(true);
  });
});

// ============================================================================
// volumeByType — Hazelnut regression
// ============================================================================

describe("unitEconomics.volumeByType", () => {
  test("Hazelnut-Regular appears as a distinct series", async () => {
    const t = convexTest(schema, modules);
    const { hazelnutId } = await seedBaseFixtures(t);
    const mp = await seedMenuProduct(t, "Hazelnut Single", hazelnutId);
    const customerId = await seedCustomer(t);
    const ts = Date.now() - 86400000;
    await seedOrderWithItem(t, customerId, mp, "Hazelnut Single", 4, 50000, 0, {
      completedAt: ts,
    });

    const res = await t.query(api.reports.unitEconomics.volumeByType, {
      fromTs: ts - 1000,
      toTs: Date.now() + 1000,
      granularity: "day",
    });
    const series = res.series.find((s: { code: string }) => s.code === "HAZELNUT_REGULAR");
    expect(series).toBeDefined();
    const total = series!.values.reduce((a: number, b: number) => a + b, 0);
    expect(total).toBe(4);
  });
});

// ============================================================================
// channelEconomics — take-rate math
// ============================================================================

describe("unitEconomics.channelEconomics", () => {
  test("takePct reflects discount / gross, netPerUnit correct", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId } = await seedBaseFixtures(t);
    const mp = await seedMenuProduct(t, "Original", bigBallId);
    const customerId = await seedCustomer(t);
    const ts = Date.now() - 86400000;

    // Gross 100k (4 * 25k), discount 20k → netPerUnit = 80k/4 = 20k, takePct = 20%
    await seedOrderWithItem(t, customerId, mp, "Original", 4, 25000, 20000, {
      channel: "shopee",
      completedAt: ts,
    });

    const rows = await t.query(api.reports.unitEconomics.channelEconomics, {
      fromTs: ts - 1000,
      toTs: Date.now() + 1000,
    });
    const shopee = rows.find((r: { channel: string }) => r.channel === "Shopee");
    expect(shopee).toBeDefined();
    expect(shopee!.gross).toBe(100000);
    expect(shopee!.discount).toBe(20000);
    expect(shopee!.takePct).toBeCloseTo(20, 1);
    expect(shopee!.netPerUnit).toBe(20000);
  });
});

// ============================================================================
// skuPareto — cumulativePct monotonic + "Other" bucket
// ============================================================================

describe("unitEconomics.skuPareto", () => {
  test("top 10 + Other, cumulativePct runs 0→100 monotonic", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId } = await seedBaseFixtures(t);
    const customerId = await seedCustomer(t);
    const ts = Date.now() - 86400000;

    for (let i = 0; i < 12; i++) {
      const mp = await seedMenuProduct(t, `P${i}`, bigBallId);
      await seedOrderWithItem(t, customerId, mp, `P${i}`, 12 - i, 10000, 0, {
        completedAt: ts,
      });
    }

    const { rows } = await t.query(api.reports.unitEconomics.skuPareto, {
      fromTs: ts - 1000,
      toTs: Date.now() + 1000,
      topN: 10,
    });
    expect(rows.length).toBe(11); // 10 top + Other
    expect(rows[10].name).toBe("Other");
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].cumulativePct).toBeGreaterThanOrEqual(rows[i - 1].cumulativePct);
    }
    expect(rows[rows.length - 1].cumulativePct).toBeCloseTo(100, 1);
  });
});

// ============================================================================
// rollingTrend — 7d window
// ============================================================================

describe("unitEconomics.rollingTrend", () => {
  test("rolling7[last] equals mean of last seven daily values (30000 each)", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId } = await seedBaseFixtures(t);
    const mp = await seedMenuProduct(t, "Original", bigBallId);
    const customerId = await seedCustomer(t);
    const now = Date.now();

    // Seed 10 days × Rp 30_000 net each (1 unit/day)
    for (let d = 9; d >= 0; d--) {
      const ts = now - d * 86400000;
      await seedOrderWithItem(t, customerId, mp, "Original", 1, 30000, 0, {
        completedAt: ts,
      });
    }

    const res = await t.query(api.reports.unitEconomics.rollingTrend, {
      fromTs: now - 10 * 86400000,
      toTs: now + 1000,
    });
    expect(res.daily.length).toBeGreaterThan(0);
    expect(res.daily.every((v: number) => v === 30000)).toBe(true);
    expect(res.rolling7[res.rolling7.length - 1]).toBeCloseTo(30000, 1);
  });
});
