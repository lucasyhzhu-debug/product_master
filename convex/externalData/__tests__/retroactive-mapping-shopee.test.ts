/**
 * Phase 79 Wave 0 — Plan 01 Task 2
 *
 * Failing tests for retroactive SKU→menuProduct mapping cascade for Shopee/TikTok.
 *
 * Wave 1 (Plan 04) will extend `applyRetroactiveProductMapping` to:
 *   1. Patch every `externalRevenueItems` row with matching externalItemId;
 *   2. Update parent `externalRevenue.linkedMenuProductId` ONLY when the
 *      remapped SKU is dominant (D-09: max qty, price tie-break);
 *   3. Be idempotent.
 *
 * Until Wave 1 ships, these tests fail red because the current mutation does
 * not cascade to externalRevenueItems.
 *
 * Anchors: D-08 (cascade), D-09 (dominant SKU).
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

type TestT = ReturnType<typeof convexTest>;

async function seedAdminToken(t: TestT): Promise<string> {
  const tok = `admin-${Date.now()}-${Math.random()}`;
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Admin", pinHash: "salt:hash", role: "admin" as const,
      isActive: true, failedAttempts: 0, createdAt: Date.now(),
    } as never);
    await ctx.db.insert("sessions", { userId, token: tok, expiresAt: Date.now() + 8 * 3600 * 1000, createdAt: Date.now() } as never);
  });
  return tok;
}

async function seedMenuProduct(t: TestT, name: string, price: number): Promise<Id<"menuProducts">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("menuProducts", {
      code: name.replace(/\s+/g, "_").toUpperCase(),
      name,
      grams: 80,
      defaultPrice: price,
      isActive: true,
      unitCost: 0,
      cachedProductionSummary: "",
    } as never);
  });
}

async function seedShopeeOrderWithItems(
  t: TestT,
  items: Array<{ sku: string; qty: number; unitPrice: number }>,
): Promise<{ revenueId: Id<"externalRevenue"> }> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const totalGross = items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
    const revenueId = await ctx.db.insert("externalRevenue", {
      source: "shopee" as const,
      revenueGross: totalGross,
      revenueNet: totalGross,
      periodStart: now,
      periodEnd: now,
      transactionDate: now,
      dataOrigin: "api_revenue" as const,
      confidence: "exact" as const,
    } as never);

    for (const it of items) {
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
    return { revenueId };
  });
}

describe("applyRetroactiveProductMapping — Shopee cascade (D-08, D-09)", () => {
  it("cascades to all items with matching externalItemId + updates parent when dominant", async () => {
    const t = convexTest(schema);
    const token = await seedAdminToken(t);
    const mpA = await seedMenuProduct(t, "Product A", 30000);
    const { revenueId } = await seedShopeeOrderWithItems(t, [
      { sku: "A", qty: 5, unitPrice: 30000 },
      { sku: "B", qty: 3, unitPrice: 30000 },
    ]);

    // @ts-expect-error — Wave 1 will expand retroactive mapping signature.
    await t.mutation(api.externalData.mutations.applyRetroactiveProductMapping, {
      token,
      source: "shopee",
      externalProductCode: "A",
      menuProductId: mpA,
    });

    const { items, parent } = await t.run(async (ctx) => {
      const items = await ctx.db
        .query("externalRevenueItems")
        .withIndex("by_revenue", (q: any) => q.eq("revenueId", revenueId))
        .collect();
      const parent = await ctx.db.get(revenueId);
      return { items, parent };
    });

    const aItems = items.filter((i: any) => i.externalItemId === "A");
    const bItems = items.filter((i: any) => i.externalItemId === "B");

    for (const it of aItems) {
      expect(it.linkedMenuProductId).toBe(mpA);
      expect(it.isAutoMatched).toBe(true);
    }
    for (const it of bItems) {
      expect(it.linkedMenuProductId).toBeUndefined();
    }

    // A is dominant (qty 5 > 3) → parent updated.
    expect(parent!.linkedMenuProductId).toBe(mpA);
  });

  it("when two mappings are applied in order, parent ends at the dominant one", async () => {
    const t = convexTest(schema);
    const token = await seedAdminToken(t);
    const mpA = await seedMenuProduct(t, "Product A", 40000);
    const mpB = await seedMenuProduct(t, "Product B", 40000);
    const { revenueId } = await seedShopeeOrderWithItems(t, [
      { sku: "A", qty: 5, unitPrice: 40000 },
      { sku: "B", qty: 3, unitPrice: 40000 },
    ]);

    // B mapped first.
    // @ts-expect-error — Wave 1 will expand signature.
    await t.mutation(api.externalData.mutations.applyRetroactiveProductMapping, {
      token, source: "shopee", externalProductCode: "B", menuProductId: mpB,
    });
    // Then A — dominant, should take parent.
    // @ts-expect-error — Wave 1 will expand signature.
    await t.mutation(api.externalData.mutations.applyRetroactiveProductMapping, {
      token, source: "shopee", externalProductCode: "A", menuProductId: mpA,
    });

    const parent = await t.run(async (ctx) => ctx.db.get(revenueId));
    expect(parent!.linkedMenuProductId).toBe(mpA);
  });

  it("mapping a minor SKU leaves parent unchanged", async () => {
    const t = convexTest(schema);
    const token = await seedAdminToken(t);
    const mpB = await seedMenuProduct(t, "Product B", 30000);
    const { revenueId } = await seedShopeeOrderWithItems(t, [
      { sku: "A", qty: 5, unitPrice: 30000 },
      { sku: "B", qty: 3, unitPrice: 30000 },
    ]);

    // @ts-expect-error — Wave 1 will expand signature.
    await t.mutation(api.externalData.mutations.applyRetroactiveProductMapping, {
      token, source: "shopee", externalProductCode: "B", menuProductId: mpB,
    });

    const parent = await t.run(async (ctx) => ctx.db.get(revenueId));
    // B is minor (qty 3 < 5) — parent MUST remain unset.
    expect(parent!.linkedMenuProductId).toBeUndefined();
  });

  it("is idempotent — running same mapping twice produces the same DB state", async () => {
    const t = convexTest(schema);
    const token = await seedAdminToken(t);
    const mpA = await seedMenuProduct(t, "Product A", 30000);
    const { revenueId } = await seedShopeeOrderWithItems(t, [
      { sku: "A", qty: 2, unitPrice: 30000 },
    ]);

    // @ts-expect-error — Wave 1 will expand signature.
    await t.mutation(api.externalData.mutations.applyRetroactiveProductMapping, {
      token, source: "shopee", externalProductCode: "A", menuProductId: mpA,
    });
    const snap1 = await t.run(async (ctx) => ({
      items: await ctx.db.query("externalRevenueItems").withIndex("by_revenue", (q: any) => q.eq("revenueId", revenueId)).collect(),
      parent: await ctx.db.get(revenueId),
    }));

    // @ts-expect-error — Wave 1 will expand signature.
    await t.mutation(api.externalData.mutations.applyRetroactiveProductMapping, {
      token, source: "shopee", externalProductCode: "A", menuProductId: mpA,
    });
    const snap2 = await t.run(async (ctx) => ({
      items: await ctx.db.query("externalRevenueItems").withIndex("by_revenue", (q: any) => q.eq("revenueId", revenueId)).collect(),
      parent: await ctx.db.get(revenueId),
    }));

    expect(snap2.items.length).toBe(snap1.items.length);
    expect(snap2.parent!.linkedMenuProductId).toBe(snap1.parent!.linkedMenuProductId);
  });
});
