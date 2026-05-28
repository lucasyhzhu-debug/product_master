// convex/telegram/salesSummary/__tests__/salesSummaryQuery.test.ts
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../../schema";
import { internal } from "../../../_generated/api";

const modules = import.meta.glob("/convex/**/*.ts");
type Ctx = TestConvex<typeof schema>;

function wibMidnight(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d, -7, 0, 0, 0);
}
const DAY_NOW = wibMidnight(2026, 5, 28) + 23 * 3600_000; // Thu 23:00 WIB
const DAY_START = wibMidnight(2026, 5, 28);

// Seed a GoFood (gobiz) revenue row + optional item children.
async function seedGoFood(
  t: Ctx,
  outletName: string,
  gross: number,
  periodStart: number,
  items: { name: string; qty: number }[],
) {
  await t.run(async (ctx) => {
    const outletId = await ctx.db.insert("externalOutlets", {
      source: "gobiz", externalId: `gf-${outletName}`, name: outletName,
      isActive: true, createdBy: "test", createdAt: periodStart,
    });
    const revId = await ctx.db.insert("externalRevenue", {
      source: "gobiz", outletId, revenueGross: gross,
      periodStart, periodEnd: periodStart, transactionDate: periodStart,
      transactionCount: 1, dataOrigin: "api_revenue", confidence: "exact",
    });
    for (const it of items) {
      await ctx.db.insert("externalRevenueItems", {
        revenueId: revId, source: "gobiz", productName: it.name,
        unitPrice: 0, quantity: it.qty, totalPrice: 0,
        isAutoMatched: false, createdAt: periodStart,
      });
    }
  });
}

// Seed a Direct (internal) order — Direct gross comes from orders, products from orderItems.
async function seedDirect(
  t: Ctx, orderNumber: string, total: number, periodStart: number,
  items: { name: string; qty: number; cancelled?: boolean }[],
) {
  await t.run(async (ctx) => {
    const customerId = await ctx.db.insert("customers", { name: "C", phone: "08", createdBy: "test" });
    const orderId = await ctx.db.insert("orders", {
      orderNumber, customerId, customerName: "C", status: "Complete", paymentStatus: "Paid",
      orderDate: periodStart, totalAmount: total, totalCost: 0, totalMargin: total,
      finalTotal: total, deliveryType: "Pickup", createdBy: "test", itemCount: items.length,
    });
    for (const it of items) {
      await ctx.db.insert("orderItems", {
        orderId, productName: it.name, quantity: it.qty, unitPrice: 0, unitCost: 0,
        discountAmount: 0, lineTotal: 0, lineCost: 0, lineMargin: 0, isCancelled: it.cancelled,
      });
    }
    await ctx.db.insert("externalRevenue", {
      source: "internal", externalTransactionId: orderNumber, revenueGross: total,
      periodStart, periodEnd: periodStart, transactionDate: periodStart,
      transactionCount: 1, dataOrigin: "db_query", confidence: "exact",
    });
  });
}

describe("salesSummaryQuery — daily", () => {
  it("groups GoFood by outlet with per-outlet products; sorts channels by gross", async () => {
    const t = convexTest(schema, modules);
    await seedGoFood(t, "Crystal", 2_300_000, DAY_START + 3600_000,
      [{ name: "Jumbo", qty: 12 }, { name: "Original Triple", qty: 8 }]);
    await seedGoFood(t, "Tamtem", 1_800_000, DAY_START + 3600_000, [{ name: "Jumbo", qty: 9 }]);
    await seedDirect(t, "0528-001", 2_100_000, DAY_START + 3600_000,
      [{ name: "Jumbo", qty: 15 }, { name: "Cancelled", qty: 5, cancelled: true }]);

    const data = await t.query(internal.telegram.salesSummary.salesSummaryQuery.getSalesSummary,
      { cadence: "daily", now: DAY_NOW });

    expect(data.channels.map((c) => c.platform)).toEqual(["GoFood", "Direct"]);
    const gofood = data.channels[0];
    expect(gofood.gross).toBe(4_100_000);
    expect(gofood.outlets.map((o) => o.name).sort()).toEqual(["Crystal", "Tamtem"]);
    const crystal = gofood.outlets.find((o) => o.name === "Crystal")!;
    expect(crystal.products[0]).toEqual({ name: "Jumbo", qty: 12 });
    // Direct: products from orderItems, cancelled excluded
    const direct = data.channels[1];
    expect(direct.gross).toBe(2_100_000);
    expect(direct.products).toEqual([{ name: "Jumbo", qty: 15 }]);
    // grandTotal
    expect(data.grandTotal.gross).toBe(6_200_000);
    expect(data.grandTotal.orders).toBe(3);
    expect(data.grandTotal.deltaPct).toBeNull(); // daily = no delta
  });

  it("omits channels with zero sales", async () => {
    const t = convexTest(schema, modules);
    await seedDirect(t, "0528-001", 100_000, DAY_START + 3600_000, [{ name: "Jumbo", qty: 1 }]);
    const data = await t.query(internal.telegram.salesSummary.salesSummaryQuery.getSalesSummary,
      { cadence: "daily", now: DAY_NOW });
    expect(data.channels.map((c) => c.platform)).toEqual(["Direct"]);
  });

  it("falls back to externalRevenue.productName when a GoFood row has no item children", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const outletId = await ctx.db.insert("externalOutlets", {
        source: "gobiz", externalId: "gf-x", name: "Goldfinch", isActive: true, createdBy: "t", createdAt: DAY_START });
      await ctx.db.insert("externalRevenue", {
        source: "gobiz", outletId, revenueGross: 500_000, productName: "Bite Single", quantitySold: 4,
        periodStart: DAY_START + 3600_000, periodEnd: DAY_START + 3600_000, transactionDate: DAY_START + 3600_000,
        transactionCount: 1, dataOrigin: "api_revenue", confidence: "exact" });
    });
    const data = await t.query(internal.telegram.salesSummary.salesSummaryQuery.getSalesSummary,
      { cadence: "daily", now: DAY_NOW });
    expect(data.channels[0].outlets[0].products).toEqual([{ name: "Bite Single", qty: 4 }]);
  });
});

describe("salesSummaryQuery — weekly delta", () => {
  it("computes gross deltaPct vs the prior week", async () => {
    const t = convexTest(schema, modules);
    const NOW = wibMidnight(2026, 5, 25) + 7 * 3600_000; // Mon 07:00 WIB
    // current week (18–24 May): 1,100,000 ; previous week (11–17 May): 1,000,000 → +10%
    await seedGoFood(t, "Crystal", 1_100_000, wibMidnight(2026, 5, 20), [{ name: "Jumbo", qty: 5 }]);
    await seedGoFood(t, "Crystal", 1_000_000, wibMidnight(2026, 5, 13), [{ name: "Jumbo", qty: 4 }]);
    const data = await t.query(internal.telegram.salesSummary.salesSummaryQuery.getSalesSummary,
      { cadence: "weekly", now: NOW });
    expect(data.channels[0].gross).toBe(1_100_000);
    expect(data.channels[0].deltaPct).toBeCloseTo(10, 1);
    expect(data.grandTotal.deltaPct).toBeCloseTo(10, 1);
  });
});
