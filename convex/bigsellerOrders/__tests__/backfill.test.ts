/**
 * Phase 79 Wave 0 — Plan 01 Task 2
 *
 * Failing tests for `api.bigsellerOrders.mutations.backfillBigsellerItems` and
 * `api.bigsellerOrders.mutations.rescanEmptyRows`.
 *
 * Wave 1 (Plan 07) will add these exports. Until then these tests fail red
 * because the mutation is not registered on the API.
 *
 * Anchors:
 *  - DA-10 requirement (backfill historical items)
 *  - D-18 (rows with empty skuVoList MUST NOT get placeholder items)
 *  - V4 access control (admin-only)
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

type TestT = ReturnType<typeof convexTest>;

async function seedSession(t: TestT, role: "admin" | "manager" | "kitchen"): Promise<string> {
  const token = `${role}-token-${Date.now()}-${Math.random()}`;
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: `Test ${role}`,
      pinHash: "salt:hash",
      role,
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    } as never);
    await ctx.db.insert("sessions", {
      userId,
      token,
      expiresAt: Date.now() + 8 * 3600 * 1000,
      createdAt: Date.now(),
    } as never);
  });
  return token;
}

async function seedOrderWithRevenue(
  t: TestT,
  platformOrderId: string,
  skus: Array<{ sku: string; skuNum: number }>,
): Promise<{ orderId: Id<"bigsellerOrders">; revenueId: Id<"externalRevenue"> }> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const revenueId = await ctx.db.insert("externalRevenue", {
      source: "shopee" as const,
      revenueGross: 100000,
      revenueNet: 85000,
      periodStart: now,
      periodEnd: now,
      transactionDate: now,
      dataOrigin: "api_revenue" as const,
      confidence: "exact" as const,
      externalTransactionId: platformOrderId,
    } as never);

    const orderId = await ctx.db.insert("bigsellerOrders", {
      platformOrderId,
      shopId: 5090946,
      shopName: "Frollie - S",
      platform: "shopee",
      orderState: "completed",
      orderTimeMs: now,
      saleAmount: 100000,
      orderAmount: 100000,
      platformIncome: 85000,
      costFee: 0,
      profit: 85000,
      profitMargin: "85%",
      commissionFee: -15000,
      sellerShippingFee: 0,
      buyerShippingFee: 0,
      otherFee: 0,
      allSkuNum: skus.reduce((s, x) => s + x.skuNum, 0),
      skuVoList: skus.map((s) => ({ ...s, returnNum: 0, isAddition: 0 })),
      linkedRevenueId: revenueId,
      createdAt: now,
    } as never);

    return { orderId, revenueId };
  });
}

describe("backfillBigsellerItems — idempotency + D-18", () => {
  it("creates items for every SKU line across all seeded orders on first run", async () => {
    const t = convexTest(schema);
    const token = await seedSession(t, "admin");

    await seedOrderWithRevenue(t, "SH-001", [
      { sku: "A", skuNum: 2 },
      { sku: "B", skuNum: 1 },
    ]);
    await seedOrderWithRevenue(t, "SH-002", [{ sku: "C", skuNum: 3 }]);
    await seedOrderWithRevenue(t, "SH-003", [{ sku: "D", skuNum: 1 }]);

    const result = await t.mutation(api.bigsellerOrders.mutations.backfillBigsellerItems, { token });

    expect(result.created).toBe(4); // 2 + 1 + 1 distinct SKU rows across 3 orders

    const items = await t.run(async (ctx) => ctx.db.query("externalRevenueItems").collect());
    expect(items.length).toBe(4);
  });

  it("is idempotent — second run creates 0 items and reports all skipped", async () => {
    const t = convexTest(schema);
    const token = await seedSession(t, "admin");
    await seedOrderWithRevenue(t, "SH-001", [{ sku: "A", skuNum: 2 }]);
    await seedOrderWithRevenue(t, "SH-002", [{ sku: "B", skuNum: 3 }]);

    const first = await t.mutation(api.bigsellerOrders.mutations.backfillBigsellerItems, { token });
    expect(first.created).toBe(2);

    const second = await t.mutation(api.bigsellerOrders.mutations.backfillBigsellerItems, { token });
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(2);

    const items = await t.run(async (ctx) => ctx.db.query("externalRevenueItems").collect());
    expect(items.length).toBe(2);
  });

  it("D-18: skips orders with an empty skuVoList — no placeholder items created", async () => {
    const t = convexTest(schema);
    const token = await seedSession(t, "admin");
    await seedOrderWithRevenue(t, "SH-EMPTY", []);

    const result = await t.mutation(api.bigsellerOrders.mutations.backfillBigsellerItems, { token });
    expect(result.created).toBe(0);

    const items = await t.run(async (ctx) => ctx.db.query("externalRevenueItems").collect());
    expect(items.length).toBe(0);
  });

  it("V4: throws for non-admin callers (manager + kitchen + missing token)", async () => {
    const t = convexTest(schema);
    const managerToken = await seedSession(t, "manager");
    const kitchenToken = await seedSession(t, "kitchen");

    await seedOrderWithRevenue(t, "SH-001", [{ sku: "A", skuNum: 1 }]);

    await expect(
      t.mutation(api.bigsellerOrders.mutations.backfillBigsellerItems, { token: managerToken }),
    ).rejects.toThrow();

    await expect(
      t.mutation(api.bigsellerOrders.mutations.backfillBigsellerItems, { token: kitchenToken }),
    ).rejects.toThrow();

    await expect(
      t.mutation(api.bigsellerOrders.mutations.backfillBigsellerItems, { token: "invalid" }),
    ).rejects.toThrow();
  });
});
