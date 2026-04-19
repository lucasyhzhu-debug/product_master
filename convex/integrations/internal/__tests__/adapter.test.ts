/**
 * Phase 80.2 Wave 3 — Task 3.4
 *
 * Tests for the Wave 2 Task 2.4 self-heal guard in `syncInternalOrders`
 * (convex/integrations/internal/adapter.ts:150-156). Pre-fix: unconditional
 * skip-if-not-new branch permanently orphaned any Direct parent synced before
 * the saveRevenueItems emit path was added (~2026-04-10). Post-fix: only skip
 * re-synced parents that ALREADY have >=1 externalRevenueItems child — orphans
 * fall through and backfill.
 *
 * NOVEL PATTERN: this is the first convex-test `t.action(...)` invocation in
 * convex/. `syncInternalOrders` does not call outbound fetch — it's all
 * internal queries + mutations — so no global fetch stub is needed.
 *
 * Directory `convex/integrations/internal/__tests__/` is created as part of
 * this test (PATTERNS.md §7 — did not exist prior).
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../../schema";
import { api } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";

type TestT = ReturnType<typeof convexTest>;

async function seedAdminToken(t: TestT): Promise<string> {
  const tok = `admin-${Date.now()}-${Math.random()}`;
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Admin",
      pinHash: "salt:hash",
      role: "admin" as const,
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    } as never);
    await ctx.db.insert("sessions", {
      userId,
      token: tok,
      expiresAt: Date.now() + 8 * 3600 * 1000,
      createdAt: Date.now(),
    } as never);
  });
  return tok;
}

async function seedMenuProduct(
  t: TestT,
  name: string,
): Promise<Id<"menuProducts">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("menuProducts", {
      code: name.toUpperCase().replace(/[^A-Z0-9]/g, "_"),
      name,
      grams: 80,
      defaultPrice: 23000,
      isActive: true,
      unitCost: 0,
      cachedProductionSummary: "",
    } as never),
  );
}

async function seedOrder(
  t: TestT,
  args: {
    orderNumber: string;
    menuProductId?: Id<"menuProducts">;
    quantity: number;
    unitPrice: number;
  },
) {
  // Required fields enumerated from convex/schema.ts:177-345. See the
  // full rationale in convex/externalData/__tests__/backfillInternalRevenue.test.ts
  // (seedOrderWithItems). This is the single-item variant used for the
  // action-level invocation below.
  return await t.run(async (ctx) => {
    const customerId = await ctx.db.insert("customers", {
      name: "Test Customer",
      phone: "081234567890",
      createdBy: "test",
    } as never);

    const subtotal = args.quantity * args.unitPrice;
    const orderId = await ctx.db.insert("orders", {
      orderNumber: args.orderNumber,
      customerId,
      customerName: "Test Customer",
      status: "Complete" as const, // revenue-countable (see config.ts:9-14)
      paymentStatus: "Paid" as const,
      orderDate: Date.now(),
      totalAmount: subtotal,
      totalCost: 0,
      totalMargin: subtotal,
      finalTotal: subtotal,
      deliveryType: "Pickup",
      createdBy: "test",
      itemCount: 1,
    } as never);

    await ctx.db.insert("orderItems", {
      orderId,
      productName: "Test Product",
      quantity: args.quantity,
      unitPrice: args.unitPrice,
      unitCost: 0,
      discountAmount: 0,
      lineTotal: args.quantity * args.unitPrice,
      lineCost: 0,
      lineMargin: args.quantity * args.unitPrice,
      menuProductId: args.menuProductId,
    } as never);
    return orderId;
  });
}

async function seedOrphanParent(
  t: TestT,
  orderNumber: string,
  total: number,
): Promise<Id<"externalRevenue">> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("externalRevenue", {
      source: "internal" as const,
      productName: `Order ${orderNumber}`,
      quantitySold: 1,
      transactionCount: 1,
      revenueGross: total,
      revenueNet: total,
      periodStart: now,
      periodEnd: now,
      transactionDate: now,
      externalTransactionId: orderNumber,
      dataOrigin: "db_query" as const,
      confidence: "exact" as const,
    } as never);
  });
}

async function countChildrenFor(
  t: TestT,
  revenueId: Id<"externalRevenue">,
): Promise<number> {
  return await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("externalRevenueItems")
      .filter((q) => q.eq(q.field("revenueId"), revenueId))
      .collect();
    return rows.length;
  });
}

describe("syncInternalOrders re-sync heal (guard swap)", () => {
  it("self-heals orphan parent (isNew=false + no children) by creating children", async () => {
    const t = convexTest(schema);
    await seedAdminToken(t); // not used by action but sets up user context
    const mp = await seedMenuProduct(t, "Original 80g");
    await seedOrder(t, {
      orderNumber: "0129-001",
      menuProductId: mp,
      quantity: 2,
      unitPrice: 23000,
    });
    const parentId = await seedOrphanParent(t, "0129-001", 46000);
    expect(await countChildrenFor(t, parentId)).toBe(0);

    // Invoke the action — NOVEL PATTERN: first t.action in codebase.
    // syncInternalOrders has no outbound fetch, so no fetch stub is needed.
    await t.action(api.integrations.internal.adapter.syncInternalOrders, {
      triggeredBy: "test",
    });

    expect(await countChildrenFor(t, parentId)).toBeGreaterThan(0);
  });

  it("does not duplicate children when parent already has them (isNew=false + has children)", async () => {
    const t = convexTest(schema);
    await seedAdminToken(t);
    const mp = await seedMenuProduct(t, "Original 80g");
    await seedOrder(t, {
      orderNumber: "0129-002",
      menuProductId: mp,
      quantity: 2,
      unitPrice: 23000,
    });
    const parentId = await seedOrphanParent(t, "0129-002", 46000);
    // Seed pre-existing child
    await t.run(async (ctx) => {
      await ctx.db.insert("externalRevenueItems", {
        revenueId: parentId,
        source: "internal" as const,
        externalItemId: "0129-002-pre-existing",
        productName: "Original 80g",
        unitPrice: 23000,
        quantity: 2,
        totalPrice: 46000,
        linkedMenuProductId: mp,
        isAutoMatched: true,
        matchConfidence: "exact" as const,
        createdAt: Date.now(),
      } as never);
    });
    const beforeCount = await countChildrenFor(t, parentId);
    expect(beforeCount).toBe(1);

    await t.action(api.integrations.internal.adapter.syncInternalOrders, {
      triggeredBy: "test",
    });

    const afterCount = await countChildrenFor(t, parentId);
    expect(afterCount).toBe(1); // unchanged — guard skipped saveRevenueItems
  });
});
