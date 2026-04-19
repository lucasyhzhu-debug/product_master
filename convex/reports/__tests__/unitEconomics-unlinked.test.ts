/**
 * Phase 80.2 Wave 3 — Task 3.5
 *
 * Regression tests for UNLINKED_KEY attribution in `convex/reports/unitEconomics.ts`.
 * Pre-fix: K3Mart parents with no externalRevenueItems children landed in
 * the `(Unlinked)` bucket because the "no item-level detail" synthesis branch
 * at lines 207-239 only reads `parent.linkedMenuProductId` — which was never
 * set for K3Mart parents prior to Wave 1 Task 1.3. Post-fix: the cascade sets
 * parent.linkedMenuProductId, so the loader attributes correctly.
 *
 * Path CORRECTED from v2 plan (which specified
 * `convex/reports/unitEconomics.test.ts`). PATTERNS.md §8 identified the
 * actual codebase convention as `convex/reports/__tests__/*.test.ts`.
 *
 * Query CORRECTED: v2 plan referenced `api.reports.unitEconomics.skuPareto`
 * but the standalone `skuPareto` query was consolidated (Phase 80.1) into
 * `skuSnapshot.skuTop` with the same `{ rows, totalRevenue }` shape
 * (verified against unitEconomics.ts:1125-1128, reduceSkuTop:905-966).
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

async function seedK3MartParentLinked(
  t: TestT,
  menuProductId: Id<"menuProducts">,
  opts: {
    externalProductCode: string;
    productName: string;
    quantity: number;
    total: number;
    periodStart: number;
  },
): Promise<Id<"externalRevenue">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("externalRevenue", {
      source: "k3mart" as const,
      externalProductCode: opts.externalProductCode,
      productName: opts.productName,
      quantitySold: opts.quantity,
      revenueGross: opts.total,
      revenueNet: opts.total,
      periodStart: opts.periodStart,
      periodEnd: opts.periodStart,
      transactionDate: opts.periodStart,
      dataOrigin: "api_revenue" as const,
      confidence: "exact" as const,
      linkedMenuProductId: menuProductId, // KEY: this simulates post-Wave-1 state
    } as never);
  });
}

async function seedInternalParentWithChildren(
  t: TestT,
  menuProductId: Id<"menuProducts">,
  opts: {
    orderNumber: string;
    quantity: number;
    unitPrice: number;
    periodStart: number;
  },
): Promise<Id<"externalRevenue">> {
  return await t.run(async (ctx) => {
    const parent = await ctx.db.insert("externalRevenue", {
      source: "internal" as const,
      productName: `Order ${opts.orderNumber}`,
      quantitySold: 1,
      transactionCount: 1,
      revenueGross: opts.quantity * opts.unitPrice,
      revenueNet: opts.quantity * opts.unitPrice,
      periodStart: opts.periodStart,
      periodEnd: opts.periodStart,
      transactionDate: opts.periodStart,
      externalTransactionId: opts.orderNumber,
      dataOrigin: "db_query" as const,
      confidence: "exact" as const,
    } as never);
    await ctx.db.insert("externalRevenueItems", {
      revenueId: parent,
      source: "internal" as const,
      externalItemId: `${opts.orderNumber}-child-1`,
      productName: "Child",
      unitPrice: opts.unitPrice,
      quantity: opts.quantity,
      totalPrice: opts.quantity * opts.unitPrice,
      linkedMenuProductId: menuProductId,
      isAutoMatched: true,
      matchConfidence: "exact" as const,
      createdAt: opts.periodStart,
    } as never);
    return parent;
  });
}

describe("unitEconomics loader — unlinked attribution", () => {
  it("attributes K3Mart parent with linkedMenuProductId + no children to the menu product (not UNLINKED)", async () => {
    const t = convexTest(schema);
    const mp = await seedMenuProduct(t, "Original 80g", 23000);
    const now = Date.now();
    await seedK3MartParentLinked(t, mp, {
      externalProductCode: "K3-001",
      productName: "Original 80g",
      quantity: 5,
      total: 115000,
      periodStart: now,
    });

    // skuSnapshot returns { skuTop: { rows, totalRevenue }, skuChannelMatrix }.
    // productKey is the menuProductId for linked buckets, "__unlinked__" for unlinked.
    const result = await t.query(api.reports.unitEconomics.skuSnapshot, {
      fromTs: now - 1000,
      toTs: now + 1000,
    });

    const ours = result.skuTop.rows.find(
      (r) => r.productKey === (mp as unknown as string),
    );
    expect(ours).toBeDefined();
    expect(ours?.revenue).toBe(115000);

    const unlinked = result.skuTop.rows.find(
      (r) => r.productKey === "__unlinked__",
    );
    // Unlinked bucket must NOT contain this revenue (post-fix the K3Mart
    // parent is attributed to its menuProduct via parent.linkedMenuProductId
    // even with no children — see unitEconomics.ts:207-239)
    expect(unlinked?.revenue ?? 0).toBe(0);
  });

  it("does not regress already-linked parent with children (internal source)", async () => {
    // Phase 80.3 — internal-source externalRevenue rows are now skipped by
    // loadExternalStream (R5 dedup) because they are projections of native
    // `orders` rows. The seed pattern below additionally inserts a native
    // `orders` + `orderItems` twin to mirror real production behavior
    // (syncInternalOrders writes BOTH the native order AND the internal
    // mirror). Post-R5 we expect the native path to be the sole revenue
    // source for Direct sales; the internal mirror must contribute zero
    // additional revenue to the menu-product bucket.
    const t = convexTest(schema);
    const mp = await seedMenuProduct(t, "Original 80g", 23000);
    const now = Date.now();
    await seedInternalParentWithChildren(t, mp, {
      orderNumber: "0129-001",
      quantity: 2,
      unitPrice: 23000,
      periodStart: now,
    });
    // Native orders+orderItems twin — the actual revenue source after R5 skip.
    await t.run(async (ctx) => {
      const customerId = await ctx.db.insert("customers", {
        name: "Test Customer",
        createdBy: "test",
      } as never);
      const orderId = await ctx.db.insert("orders", {
        orderNumber: "0129-001",
        customerId,
        customerName: "Test Customer",
        status: "Complete" as const,
        paymentStatus: "Paid" as const,
        orderDate: now,
        completedAt: now,
        totalAmount: 46000,
        totalCost: 0,
        totalMargin: 46000,
        finalTotal: 46000,
        itemCount: 1,
        deliveryType: "Pickup",
        channel: "whatsapp" as const,
        createdBy: "test",
      } as never);
      await ctx.db.insert("orderItems", {
        orderId,
        productName: "Original 80g",
        quantity: 2,
        unitPrice: 23000,
        unitCost: 0,
        discountAmount: 0,
        lineTotal: 46000,
        lineCost: 0,
        lineMargin: 46000,
        menuProductId: mp,
      } as never);
    });

    const result = await t.query(api.reports.unitEconomics.skuSnapshot, {
      fromTs: now - 1000,
      toTs: now + 1000,
    });
    const ours = result.skuTop.rows.find(
      (r) => r.productKey === (mp as unknown as string),
    );
    expect(ours).toBeDefined();
    // Revenue is 46000 from the NATIVE order only — the internal mirror
    // (also seeded with totalPrice=46000) is skipped by R5. If R5 ever
    // regressed, this would assert 92000 and fail.
    expect(ours?.revenue).toBe(46000);
  });
});
