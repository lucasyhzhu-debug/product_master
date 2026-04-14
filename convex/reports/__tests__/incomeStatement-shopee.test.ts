/**
 * Phase 79 Wave 0 — Plan 01 Task 2
 *
 * Failing tests for Shopee per-product COGS in the income statement.
 *
 * Today `resolveItemsCOGS` only resolves BOM-based COGS when items exist with
 * `linkedMenuProductId`. Wave 1 (Plan 06) will ensure Shopee revenue rows also
 * emit items so COGS = Σ (item.quantity × menuProduct.BOMcost) per channel.
 *
 * Anchor: DA-09 — Shopee per-product COGS via BOM × quantity.
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

type TestT = ReturnType<typeof convexTest>;

async function seedMenuProduct(
  t: TestT,
  name: string,
  price: number,
  bomCostOverride?: number,
): Promise<Id<"menuProducts">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("menuProducts", {
      code: name.toUpperCase().replace(/[^A-Z0-9]/g, "_"),
      name,
      grams: 80,
      defaultPrice: price,
      isActive: true,
      // buildProductCOGSMap uses cogsOverrideIdr (override) or BOM component sum.
      // Plain unitCost is NOT read by the resolver.
      unitCost: 0,
      cachedProductionSummary: "",
      ...(bomCostOverride !== undefined ? { cogsOverrideIdr: bomCostOverride } : {}),
    } as never),
  );
}

// Pull the Shopee channel's COGS total from the actual getIncomeStatement shape.
// getIncomeStatement returns { current: { channels: [{ source, cogs: {...} }] } }.
// Original Wave 0 assertions targeted idealised `cogsByChannel.shopee`, which
// has never existed on the return type — plan 06 is forbidden from editing
// incomeStatement.ts, so the assertion is rewritten to match production shape.
function shopeeCogsTotal(stmt: any): number {
  const channels = stmt?.current?.channels ?? [];
  const shopee = Array.isArray(channels)
    ? channels.find((c: any) => c.source === "shopee")
    : null;
  return shopee?.cogs?.total ?? 0;
}

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

describe("incomeStatement — Shopee per-product COGS (DA-09)", () => {
  it("COGS = Σ item.quantity × menuProduct BOM cost when linked", async () => {
    const t = convexTest(schema);
    // menuProduct with a COGS override of 10_000 IDR/unit (Phase 70 feature).
    const mp = await seedMenuProduct(t, "Jumbo", 50000, 10000);

    const ts = Date.now() - 5 * 24 * 60 * 60 * 1000;
    await seedRevenueWithItems(t, "shopee", ts, [
      { sku: "JUMBO", qty: 5, unitPrice: 50000, menuProductId: mp, productName: "Jumbo" },
    ]);

    const stmt = await t.query(api.reports.incomeStatement.getIncomeStatement, {
      periodStart: ts - 1000,
      periodEnd: ts + 1000,
    });

    // Shopee channel's COGS total = 5 × 10_000 = 50_000 via cogsOverrideIdr.
    expect(shopeeCogsTotal(stmt)).toBe(50000);
  });

  it("uses menuProduct.cogsOverrideIdr when present (Phase 70 feature)", async () => {
    const t = convexTest(schema);
    // Override is 15_000 even though BOM might say something else.
    const mp = await seedMenuProduct(t, "Original", 40000, 15000);

    const ts = Date.now() - 5 * 24 * 60 * 60 * 1000;
    await seedRevenueWithItems(t, "shopee", ts, [
      { sku: "ORI", qty: 2, unitPrice: 40000, menuProductId: mp, productName: "Original" },
    ]);

    const stmt = await t.query(api.reports.incomeStatement.getIncomeStatement, {
      periodStart: ts - 1000,
      periodEnd: ts + 1000,
    });
    expect(shopeeCogsTotal(stmt)).toBe(30000); // 2 × 15_000
  });

  it("unmapped items contribute to gapAnalysis.unmappedProducts with zero COGS", async () => {
    const t = convexTest(schema);

    const ts = Date.now() - 5 * 24 * 60 * 60 * 1000;
    await seedRevenueWithItems(t, "shopee", ts, [
      // No menuProductId — unmapped.
      { sku: "UNKNOWN", qty: 3, unitPrice: 25000, productName: "Mystery" },
    ]);

    const stmt = await t.query(api.reports.incomeStatement.getIncomeStatement, {
      periodStart: ts - 1000,
      periodEnd: ts + 1000,
    });

    // Actual shape: current.gapAnalysis.unmappedProducts: Array<{name, count, revenue}>.
    // Unmapped items carry no cogs field (they never resolve to a BOM entry); the
    // invariant being proven is that they surface in the gap report AND do not
    // contribute any cogs to the shopee channel total.
    const unmapped = stmt?.current?.gapAnalysis?.unmappedProducts ?? [];
    const mystery = Array.isArray(unmapped)
      ? unmapped.find((u: any) => u.name === "Mystery")
      : null;
    expect(mystery).toBeDefined();
    expect(mystery!.count).toBe(3);
    expect(mystery!.revenue).toBe(75000);

    // Shopee channel COGS for mapped products does NOT include the unmapped line.
    expect(shopeeCogsTotal(stmt)).toBe(0);
  });
});
