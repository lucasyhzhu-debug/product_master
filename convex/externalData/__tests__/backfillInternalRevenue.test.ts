/**
 * Phase 80.2 Wave 3 — Task 3.3
 *
 * Integration tests for `backfillInternalRevenueItems` admin mutation
 * (Wave 2 Task 2.3). Covers all 6 counters: parentsScanned, parentsBackfilled,
 * itemsInserted, skippedHasChildren, skippedMissingOrder, skippedEmptyOrderItems.
 *
 * Seed harness mirrors retroactive-mapping-shopee.test.ts (admin-token) and
 * sell-through-shopee.test.ts (parent + items shape). Native order seeding
 * is custom per Task 3.3 spec — the `orders`/`orderItems`/`customers` field
 * sets are enumerated from schema.ts:177-345 to satisfy convex-test's
 * runtime validator.
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
  price: number,
): Promise<Id<"menuProducts">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("menuProducts", {
      code: name.toUpperCase().replace(/[^A-Z0-9]/g, "_"),
      name,
      grams: 80,
      defaultPrice: price,
      isActive: true,
      unitCost: 0,
      cachedProductionSummary: "",
    } as never),
  );
}

async function seedInternalParent(
  t: TestT,
  args: { orderNumber: string; total: number },
): Promise<Id<"externalRevenue">> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("externalRevenue", {
      source: "internal" as const,
      productName: `Order ${args.orderNumber}`,
      quantitySold: 1,
      transactionCount: 1,
      revenueGross: args.total,
      revenueNet: args.total,
      periodStart: now,
      periodEnd: now,
      transactionDate: now,
      externalTransactionId: args.orderNumber,
      dataOrigin: "db_query" as const,
      confidence: "exact" as const,
    } as never);
  });
}

async function seedK3MartParent(
  t: TestT,
  orderNumber: string,
): Promise<Id<"externalRevenue">> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("externalRevenue", {
      source: "k3mart" as const,
      externalProductCode: "K3-IGNORED",
      productName: "Should be ignored",
      quantitySold: 1,
      revenueGross: 1000,
      revenueNet: 1000,
      periodStart: now,
      periodEnd: now,
      transactionDate: now,
      externalTransactionId: orderNumber,
      dataOrigin: "api_revenue" as const,
      confidence: "exact" as const,
    } as never);
  });
}

async function seedOrderWithItems(
  t: TestT,
  orderNumber: string,
  items: Array<{
    menuProductId?: Id<"menuProducts">;
    productName: string;
    quantity: number;
    unitPrice: number;
  }>,
): Promise<Id<"orders">> {
  // Required fields enumerated from convex/schema.ts:177-345 — verified
  // against schema ground truth, not eyeballed.
  //
  //   customers (lines 177-190): name (req), createdBy (req). phone is
  //   optional.
  //
  //   orders (lines 192-318): minimum non-optional set is orderNumber,
  //   customerId, customerName, status, paymentStatus, orderDate, totalAmount,
  //   totalCost, totalMargin, finalTotal, deliveryType, createdBy, itemCount.
  //   All other fields (deliveryFee, channel, voucherId, etc.) are v.optional.
  //
  //   orderItems (lines 329-345): orderId, productName, quantity, unitPrice,
  //   unitCost, discountAmount, lineTotal, lineCost, lineMargin all required;
  //   productVariant, menuProductId, isProductionComplete optional.
  return await t.run(async (ctx) => {
    const customerId = await ctx.db.insert("customers", {
      name: "Test Customer",
      phone: "081234567890",
      createdBy: "test",
    } as never);

    const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    const orderId = await ctx.db.insert("orders", {
      orderNumber,
      customerId,
      customerName: "Test Customer",
      status: "Complete" as const,
      paymentStatus: "Paid" as const,
      orderDate: Date.now(),
      totalAmount: subtotal,
      totalCost: 0,
      totalMargin: subtotal,
      finalTotal: subtotal,
      deliveryType: "Pickup",
      createdBy: "test",
      itemCount: items.length,
    } as never);

    for (const item of items) {
      await ctx.db.insert("orderItems", {
        orderId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitCost: 0,
        discountAmount: 0,
        lineTotal: item.quantity * item.unitPrice,
        lineCost: 0,
        lineMargin: item.quantity * item.unitPrice,
        menuProductId: item.menuProductId,
      } as never);
    }
    return orderId;
  });
}

describe("backfillInternalRevenueItems", () => {
  it("backfills orphan parent with matching order+items", async () => {
    const t = convexTest(schema);
    const token = await seedAdminToken(t);
    const mp = await seedMenuProduct(t, "Original 80g", 23000);
    await seedInternalParent(t, { orderNumber: "0129-001", total: 46000 });
    await seedOrderWithItems(t, "0129-001", [
      {
        menuProductId: mp,
        productName: "Original 80g",
        quantity: 2,
        unitPrice: 23000,
      },
    ]);

    const r = await t.mutation(
      api.externalData.mutations.backfillInternalRevenueItems,
      {
        token,
        limit: 500,
      },
    );
    expect(r.parentsScanned).toBe(1);
    expect(r.parentsBackfilled).toBe(1);
    expect(r.itemsInserted).toBe(1);
    expect(r.skippedHasChildren).toBe(0);
    expect(r.skippedMissingOrder).toBe(0);
    expect(r.skippedEmptyOrderItems).toBe(0);
    expect(r.isDone).toBe(true);
  });

  it("second run is a no-op (idempotent)", async () => {
    const t = convexTest(schema);
    const token = await seedAdminToken(t);
    const mp = await seedMenuProduct(t, "Original 80g", 23000);
    await seedInternalParent(t, { orderNumber: "0129-001", total: 46000 });
    await seedOrderWithItems(t, "0129-001", [
      {
        menuProductId: mp,
        productName: "Original 80g",
        quantity: 2,
        unitPrice: 23000,
      },
    ]);

    await t.mutation(api.externalData.mutations.backfillInternalRevenueItems, {
      token,
      limit: 500,
    });
    const r2 = await t.mutation(
      api.externalData.mutations.backfillInternalRevenueItems,
      { token, limit: 500 },
    );
    expect(r2.parentsBackfilled).toBe(0);
    expect(r2.itemsInserted).toBe(0);
    expect(r2.skippedHasChildren).toBe(1);
  });

  it("skips parent that already has children", async () => {
    const t = convexTest(schema);
    const token = await seedAdminToken(t);
    const mp = await seedMenuProduct(t, "Original 80g", 23000);
    const parentId = await seedInternalParent(t, {
      orderNumber: "0129-001",
      total: 46000,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("externalRevenueItems", {
        revenueId: parentId,
        source: "internal" as const,
        externalItemId: "0129-001-pre-existing",
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

    const r = await t.mutation(
      api.externalData.mutations.backfillInternalRevenueItems,
      {
        token,
        limit: 500,
      },
    );
    expect(r.parentsBackfilled).toBe(0);
    expect(r.skippedHasChildren).toBe(1);
    expect(r.itemsInserted).toBe(0);
  });

  it("skips parent whose order is missing", async () => {
    const t = convexTest(schema);
    const token = await seedAdminToken(t);
    await seedInternalParent(t, { orderNumber: "DELETED-001", total: 10000 });
    // no seedOrderWithItems — order deliberately absent

    const r = await t.mutation(
      api.externalData.mutations.backfillInternalRevenueItems,
      {
        token,
        limit: 500,
      },
    );
    expect(r.parentsBackfilled).toBe(0);
    expect(r.skippedMissingOrder).toBe(1);
  });

  it("skips parent whose order has zero orderItems", async () => {
    const t = convexTest(schema);
    const token = await seedAdminToken(t);
    await seedInternalParent(t, { orderNumber: "0129-002", total: 5000 });
    await seedOrderWithItems(t, "0129-002", []); // empty items

    const r = await t.mutation(
      api.externalData.mutations.backfillInternalRevenueItems,
      {
        token,
        limit: 500,
      },
    );
    expect(r.parentsBackfilled).toBe(0);
    expect(r.skippedEmptyOrderItems).toBe(1);
  });

  it("ignores non-internal parents (e.g. k3mart)", async () => {
    const t = convexTest(schema);
    const token = await seedAdminToken(t);
    await seedK3MartParent(t, "K3-0129-001");

    const r = await t.mutation(
      api.externalData.mutations.backfillInternalRevenueItems,
      {
        token,
        limit: 500,
      },
    );
    expect(r.parentsScanned).toBe(0); // k3mart row NOT scanned — by_source filter
  });
});
