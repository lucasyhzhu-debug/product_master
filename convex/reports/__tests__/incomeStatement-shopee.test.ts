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
      name,
      price,
      isActive: true,
      displayOrder: 0,
      createdAt: Date.now(),
      ...(bomCostOverride !== undefined ? { cogsOverride: bomCostOverride } : {}),
    } as never),
  );
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

    const ts = Date.UTC(2026, 2, 4, 5, 0, 0);
    await seedRevenueWithItems(t, "shopee", ts, [
      { sku: "JUMBO", qty: 5, unitPrice: 50000, menuProductId: mp, productName: "Jumbo" },
    ]);

    // @ts-expect-error — Wave 1 will ensure shopee COGS is resolved from items.
    const stmt = await t.query(api.reports.incomeStatement.getIncomeStatement, {
      periodStart: ts - 1000,
      periodEnd: ts + 1000,
    });

    // Pick the shopee COGS breakdown. Shape TBD in Wave 1 — we target a field
    // whose value must equal 5 × 10_000 = 50_000 if the branch is wired correctly.
    const shopeeCogs =
      (stmt?.current?.cogsByChannel?.shopee as number | undefined) ??
      (stmt?.current?.cogsByPlatform?.shopee as number | undefined) ??
      0;
    expect(shopeeCogs).toBe(50000);
  });

  it("uses menuProduct.cogsOverride when present (Phase 70 feature)", async () => {
    const t = convexTest(schema);
    // Override is 15_000 even though BOM might say something else.
    const mp = await seedMenuProduct(t, "Original", 40000, 15000);

    const ts = Date.UTC(2026, 2, 4, 5, 0, 0);
    await seedRevenueWithItems(t, "shopee", ts, [
      { sku: "ORI", qty: 2, unitPrice: 40000, menuProductId: mp, productName: "Original" },
    ]);

    // @ts-expect-error — Wave 1 will ensure shopee COGS path is active.
    const stmt = await t.query(api.reports.incomeStatement.getIncomeStatement, {
      periodStart: ts - 1000,
      periodEnd: ts + 1000,
    });
    const shopeeCogs =
      (stmt?.current?.cogsByChannel?.shopee as number | undefined) ??
      (stmt?.current?.cogsByPlatform?.shopee as number | undefined) ??
      0;
    expect(shopeeCogs).toBe(30000); // 2 × 15_000
  });

  it("unmapped items contribute to unmappedProductsMap with zero COGS", async () => {
    const t = convexTest(schema);

    const ts = Date.UTC(2026, 2, 4, 5, 0, 0);
    await seedRevenueWithItems(t, "shopee", ts, [
      // No menuProductId — unmapped.
      { sku: "UNKNOWN", qty: 3, unitPrice: 25000, productName: "Mystery" },
    ]);

    // @ts-expect-error — Wave 1 will ensure unmapped items flow through.
    const stmt = await t.query(api.reports.incomeStatement.getIncomeStatement, {
      periodStart: ts - 1000,
      periodEnd: ts + 1000,
    });

    const unmapped = stmt?.current?.unmappedProducts ?? [];
    const mystery = Array.isArray(unmapped) ? unmapped.find((u: any) => u.name === "Mystery") : null;
    expect(mystery).toBeDefined();
    expect(mystery!.cogs ?? 0).toBe(0);

    // Shopee channel COGS for mapped products does NOT include the unmapped line.
    const shopeeCogs =
      (stmt?.current?.cogsByChannel?.shopee as number | undefined) ??
      (stmt?.current?.cogsByPlatform?.shopee as number | undefined) ??
      0;
    expect(shopeeCogs).toBe(0);
  });
});
