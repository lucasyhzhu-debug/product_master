/**
 * Phase 79 Wave 0 — Plan 01 Task 2
 *
 * Failing tests for the Shopee/TikTok branch of `sellThroughQuery`.
 *
 * Today the query returns product volume by dividing Shopee revenue by a
 * dynamic average price (inferred). Wave 1 (Plan 06) will branch to read
 * real per-product quantity from `externalRevenueItems`, not revenue-extrapolated.
 *
 * Anchor: DA-07 requirement — real per-product volume for Shopee/TikTok.
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

type TestT = ReturnType<typeof convexTest>;

async function seedRevenueWithItems(
  t: TestT,
  source: "shopee" | "tiktok",
  transactionDate: number,
  items: Array<{ sku: string; qty: number; unitPrice: number; menuProductId?: Id<"menuProducts">; productName?: string }>,
): Promise<Id<"externalRevenue">> {
  return await t.run(async (ctx) => {
    const total = items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
    const revenueId = await ctx.db.insert("externalRevenue", {
      source,
      revenueGross: total,
      revenueNet: total,
      periodStart: transactionDate,
      periodEnd: transactionDate,
      transactionDate,
      dataOrigin: "api_revenue" as const,
      confidence: "exact" as const,
    } as never);

    for (const it of items) {
      await ctx.db.insert("externalRevenueItems", {
        revenueId,
        source,
        externalItemId: it.sku,
        productName: it.productName ?? `Product-${it.sku}`,
        unitPrice: it.unitPrice,
        quantity: it.qty,
        totalPrice: it.unitPrice * it.qty,
        linkedMenuProductId: it.menuProductId,
        isAutoMatched: Boolean(it.menuProductId),
        createdAt: transactionDate,
      } as never);
    }
    return revenueId;
  });
}

async function seedMenuProduct(t: TestT, name: string): Promise<Id<"menuProducts">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("menuProducts", {
      code: name.toUpperCase().replace(/[^A-Z0-9]/g, "_"),
      name,
      grams: 80,
      defaultPrice: 50000,
      isActive: true,
      unitCost: 0,
      cachedProductionSummary: "",
    } as never),
  );
}

describe("sellThroughQuery — DA-07 Shopee/TikTok branch", () => {
  it("returns quantity summed from items (not revenue/avgPrice) for shopee", async () => {
    const t = convexTest(schema);
    const mpJumbo = await seedMenuProduct(t, "Jumbo");

    // Use a recent timestamp inside the query's 30-day rolling window.
    const weekdayTs = Date.now() - 5 * 24 * 60 * 60 * 1000;
    await seedRevenueWithItems(t, "shopee", weekdayTs, [
      { sku: "JUMBO", qty: 2, unitPrice: 50000, menuProductId: mpJumbo, productName: "Jumbo" },
    ]);
    await seedRevenueWithItems(t, "shopee", weekdayTs, [
      { sku: "JUMBO", qty: 3, unitPrice: 50000, menuProductId: mpJumbo, productName: "Jumbo" },
    ]);

    const rows = await t.query(api.externalData.queries.sellThroughQuery, { channel: "shopee" });
    const jumbo = Array.isArray(rows)
      ? rows.find((r: any) => r.menuProductId === mpJumbo || r.name === "Jumbo")
      : null;
    expect(jumbo).toBeDefined();
    expect(jumbo!.quantity).toBe(5);
  });

  it("returns quantity summed from items for tiktok branch", async () => {
    const t = convexTest(schema);
    const mpJumbo = await seedMenuProduct(t, "Jumbo");

    const weekdayTs = Date.now() - 5 * 24 * 60 * 60 * 1000;
    await seedRevenueWithItems(t, "tiktok", weekdayTs, [
      { sku: "JUMBO", qty: 4, unitPrice: 50000, menuProductId: mpJumbo, productName: "Jumbo" },
    ]);

    const rows = await t.query(api.externalData.queries.sellThroughQuery, { channel: "tiktok" });
    const jumbo = Array.isArray(rows)
      ? rows.find((r: any) => r.menuProductId === mpJumbo || r.name === "Jumbo")
      : null;
    expect(jumbo).toBeDefined();
    expect(jumbo!.quantity).toBe(4);
  });

  it("counts unmapped items by productName/sku (linkedMenuProductId=null)", async () => {
    const t = convexTest(schema);
    const weekdayTs = Date.now() - 5 * 24 * 60 * 60 * 1000;
    await seedRevenueWithItems(t, "shopee", weekdayTs, [
      { sku: "UNKNOWN-SKU", qty: 2, unitPrice: 40000, productName: "Mystery Box" },
    ]);

    const rows = await t.query(api.externalData.queries.sellThroughQuery, { channel: "shopee" });
    const mystery = Array.isArray(rows) ? rows.find((r: any) => r.name === "Mystery Box" || r.productKey === "UNKNOWN-SKU") : null;
    expect(mystery).toBeDefined();
    expect(mystery!.quantity).toBe(2);
  });

  it("splits weekday vs weekend based on transactionDate (WIB)", async () => {
    const t = convexTest(schema);
    const mpJumbo = await seedMenuProduct(t, "Jumbo");

    // Pick a recent weekend day and weekday inside the 30-day window. WIB
    // weekend = day in {0=Sun, 6=Sat} after applying WIB_OFFSET_MS.
    // Walk back from "now" to find the most recent Saturday and Wednesday.
    const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
    function recent(targetDay: number): number {
      for (let i = 1; i < 30; i++) {
        const ts = Date.now() - i * 24 * 60 * 60 * 1000;
        if (new Date(ts + WIB_OFFSET_MS).getUTCDay() === targetDay) return ts;
      }
      throw new Error("no recent day found");
    }
    const saturdayTs = recent(6);
    const wednesdayTs = recent(3);

    await seedRevenueWithItems(t, "shopee", wednesdayTs, [
      { sku: "JUMBO", qty: 2, unitPrice: 50000, menuProductId: mpJumbo, productName: "Jumbo" },
    ]);
    await seedRevenueWithItems(t, "shopee", saturdayTs, [
      { sku: "JUMBO", qty: 5, unitPrice: 50000, menuProductId: mpJumbo, productName: "Jumbo" },
    ]);

    const rows = await t.query(api.externalData.queries.sellThroughQuery, { channel: "shopee" });
    const jumbo = Array.isArray(rows) ? rows.find((r: any) => r.menuProductId === mpJumbo || r.name === "Jumbo") : null;
    expect(jumbo).toBeDefined();
    // Expect some weekday/weekend breakdown — shape TBD in Wave 1.
    expect(jumbo!.weekdayQuantity ?? 0).toBe(2);
    expect(jumbo!.weekendQuantity ?? 0).toBe(5);
  });
});
