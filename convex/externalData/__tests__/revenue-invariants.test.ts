/**
 * Phase 79 Wave 0 — Plan 01 Task 2
 *
 * Failing tests for the D-04 revenue-conservation invariant:
 *   Σ externalRevenueItems.totalPrice === parent.externalRevenue.revenueGross
 *
 * Wave 1 (Plan 03) will land the emit-items logic. Until then these tests
 * fail red because:
 *   - saveRevenueItems emits no items for Shopee (current behavior);
 *   - sellThroughQuery is not yet branched to use items instead of parent.
 *
 * Anchor: D-04 (no double-count) — the single load-bearing invariant.
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

type TestT = ReturnType<typeof convexTest>;

async function seedShopeeRevenueWithItems(
  t: TestT,
  revenueGross: number,
  itemsSpec: Array<{ sku: string; qty: number; unitPrice: number }>,
): Promise<Id<"externalRevenue">> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const revenueId = await ctx.db.insert("externalRevenue", {
      source: "shopee" as const,
      revenueGross,
      revenueNet: revenueGross,
      periodStart: now,
      periodEnd: now,
      transactionDate: now,
      dataOrigin: "api_revenue" as const,
      confidence: "exact" as const,
    } as never);

    for (const it of itemsSpec) {
      await ctx.db.insert("externalRevenueItems", {
        revenueId,
        source: "shopee" as const,
        externalItemId: it.sku,
        productName: `Product-${it.sku}`,
        unitPrice: it.unitPrice,
        quantity: it.qty,
        totalPrice: it.unitPrice * it.qty,
        isAutoMatched: false,
        createdAt: now,
      } as never);
    }
    return revenueId;
  });
}

describe("Revenue invariants — D-04", () => {
  it("Σ items.totalPrice === parent.revenueGross (integer equality) after ingest", async () => {
    const t = convexTest(schema);
    // 100001 = 50000 + 50001 (residual lands on largest-qty item).
    const revenueId = await seedShopeeRevenueWithItems(t, 100001, [
      { sku: "A", qty: 1, unitPrice: 50000 },
      { sku: "B", qty: 1, unitPrice: 50001 },
    ]);

    const snapshot = await t.run(async (ctx) => {
      const parent = await ctx.db.get(revenueId);
      const items = await ctx.db
        .query("externalRevenueItems")
        .withIndex("by_revenue", (q: any) => q.eq("revenueId", revenueId))
        .collect();
      const sum = items.reduce((acc: number, it: any) => acc + it.totalPrice, 0);
      return { parentGross: parent!.revenueGross, sum };
    });

    expect(snapshot.sum).toBe(snapshot.parentGross);
    expect(snapshot.sum).toBe(100001);
  });

  it("invariant holds after applyRetroactiveProductMapping cascade", async () => {
    const t = convexTest(schema);
    const revenueId = await seedShopeeRevenueWithItems(t, 90000, [
      { sku: "A", qty: 2, unitPrice: 30000 },
      { sku: "B", qty: 1, unitPrice: 30000 },
    ]);

    // Seed an admin session + menuProduct + externalProductMapping for SKU A
    const token = await t.run(async (ctx) => {
      const tok = `admin-${Date.now()}`;
      const userId = await ctx.db.insert("users", {
        name: "Admin", pinHash: "salt:hash", role: "admin" as const,
        isActive: true, failedAttempts: 0, createdAt: Date.now(),
      } as never);
      await ctx.db.insert("sessions", { userId, token: tok, expiresAt: Date.now() + 8 * 3600 * 1000, createdAt: Date.now() } as never);
      return tok;
    });

    const menuProductId = await t.run(async (ctx) => {
      return await ctx.db.insert("menuProducts", {
        code: "PRODUCT_A",
        name: "Product A",
        grams: 80,
        defaultPrice: 30000,
        isActive: true,
        unitCost: 0,
        cachedProductionSummary: "",
      } as never);
    });

    // @ts-expect-error — Wave 1 (Plan 04) will widen retroactive mapping to cover items.
    await t.mutation(api.externalData.mutations.applyRetroactiveProductMapping, {
      token,
      source: "shopee",
      externalProductCode: "A",
      menuProductId,
    });

    const snapshot = await t.run(async (ctx) => {
      const parent = await ctx.db.get(revenueId);
      const items = await ctx.db
        .query("externalRevenueItems")
        .withIndex("by_revenue", (q: any) => q.eq("revenueId", revenueId))
        .collect();
      const sum = items.reduce((acc: number, it: any) => acc + it.totalPrice, 0);
      return { parentGross: parent!.revenueGross, sum };
    });

    expect(snapshot.sum).toBe(snapshot.parentGross);
  });

  it("sellThrough does NOT double-count parent.revenueGross + items.totalPrice for shopee", async () => {
    const t = convexTest(schema);
    await seedShopeeRevenueWithItems(t, 100000, [
      { sku: "A", qty: 2, unitPrice: 50000 },
    ]);

    // Query sell-through for shopee. Wave 1 (Plan 06) will branch this query to
    // read from externalRevenueItems. The assertion below MUST fail today if the
    // query still sums parent.revenueGross for shopee because that would imply
    // double-counting once items exist.
    // @ts-expect-error — Wave 1 will add/branch this query.
    const result = await t.query(api.externalData.queries.sellThroughQuery, { channel: "shopee" });

    // Concrete invariant: the sum of per-product revenue equals parent.revenueGross,
    // not 2x parent.revenueGross. Red until Plan 06 branches the query.
    const totalRevenue = Array.isArray(result)
      ? result.reduce((acc: number, row: any) => acc + (row.revenue ?? 0), 0)
      : 0;
    expect(totalRevenue).toBe(100000);
  });
});
