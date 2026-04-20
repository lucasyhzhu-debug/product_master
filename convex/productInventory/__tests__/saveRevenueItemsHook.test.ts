/// <reference types="vite/client" />
/**
 * Phase 74.5.1 Wave 0 — TDD RED tests for saveRevenueItems deduction hook (R3).
 *
 * Covers Req R3 from 74.5.1-SPEC.md:
 *   - Atomic revenue insert + deduction dispatch inside one internalMutation.
 *   - Feature-flag gating via productInventorySettings.channelDeductionEnabled.
 *   - Rollback on deduction throw (CHANNEL_ROUTING_NOT_CONFIGURED).
 *   - Idempotency — second call with same (revenueId, externalItemId) is a no-op.
 *   - Additive return shape: keeps `ids: Id[]`; adds `deducted/skipped/inserted`.
 *   - `inventoryDeductedAt` field on externalRevenueItems is set on success.
 *
 * RED STATE: Wave 1 adds:
 *   - `channelDeductionEnabled` (object) field to productInventorySettings
 *   - `inventoryDeductedAt` field to externalRevenueItems
 *   - deduction dispatch block inside saveRevenueItemsImpl
 *
 * Tests fail until schema + logic land. DO NOT delete the @ts-expect-error
 * comments until Wave 1 lands the schema fields and Wave 2 lands the hook.
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

const modules = import.meta.glob("../../**/*.ts");

type TestContext = ReturnType<typeof convexTest>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedLocation(t: TestContext, name: string): Promise<Id<"storageLocations">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("storageLocations", {
      name,
      locationType: "office",
      isActive: true,
      isDefault: false,
      createdBy: "test",
      createdAt: Date.now(),
    }),
  );
}

async function seedProduct(t: TestContext, code: string): Promise<Id<"menuProducts">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("menuProducts", {
      code,
      name: `Product ${code}`,
      grams: 80,
      defaultPrice: 25000,
      isActive: true,
      unitCost: 5000,
      cachedProductionSummary: "1 Big",
    }),
  );
}

async function seedInventory(
  t: TestContext,
  menuProductId: Id<"menuProducts">,
  locationId: Id<"storageLocations">,
  quantity: number,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("productInventory", {
      menuProductId,
      locationId,
      quantity,
      lastUpdated: Date.now(),
    });
  });
}

async function seedRoutingDefault(
  t: TestContext,
  source: string,
  storageLocationId: Id<"storageLocations">,
) {
  await t.run(async (ctx) => {
    // @ts-expect-error — channelRouting table added in Wave 1
    await ctx.db.insert("channelRouting", {
      source,
      outletId: undefined,
      menuProductId: undefined,
      storageLocationId,
      isDefault: true,
      updatedBy: "test",
      updatedAt: Date.now(),
    });
  });
}

async function seedSettings(
  t: TestContext,
  channelDeductionEnabled: Partial<Record<
    "gobiz" | "bigseller" | "internal" | "k3mart" | "grabfood" | "consignment" | "shopee" | "tiktok",
    boolean
  >>,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("productInventorySettings", {
      globalLowStockThreshold: 5,
      autoAdvanceOnDrawdown: true,
      alertMode: "toast",
      updatedBy: "test",
      updatedAt: Date.now(),
      // @ts-expect-error — channelDeductionEnabled field added in Wave 1
      channelDeductionEnabled: {
        gobiz: channelDeductionEnabled.gobiz ?? false,
        bigseller: channelDeductionEnabled.bigseller ?? false,
        internal: channelDeductionEnabled.internal ?? false,
        k3mart: channelDeductionEnabled.k3mart ?? false,
        grabfood: channelDeductionEnabled.grabfood ?? false,
        consignment: channelDeductionEnabled.consignment ?? false,
        shopee: channelDeductionEnabled.shopee ?? false,
        tiktok: channelDeductionEnabled.tiktok ?? false,
      },
    });
  });
}

async function seedRevenueParent(
  t: TestContext,
  source: "shopee" | "tiktok" | "k3mart" | "gobiz" | "grabfood" | "internal" | "bigseller" | "consignment" = "shopee",
): Promise<Id<"externalRevenue">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("externalRevenue", {
      source,
      periodStart: 1_700_000_000_000,
      periodEnd: 1_700_000_000_000,
      transactionDate: 1_700_000_000_000,
      dataOrigin: "api_revenue",
      confidence: "exact",
    }),
  );
}

// `saveRevenueItems` is exported from convex/externalData/mutations.ts.
// Wave 1 extends its return shape and adds deduction dispatch. Until then,
// the API path below resolves to the CURRENT impl (insert-only). Red-test
// intent: the NEW return fields (deducted/skipped/inserted) must appear,
// which they don't today → tests fail with missing fields.
//
// If the function name changes or is relocated in Wave 1, update the import.
// @ts-expect-error — api.externalData.mutations.saveRevenueItems return shape
// is extended in Wave 1; without the extension these tests fail at runtime.
const saveRevenueItems = api.externalData.mutations.saveRevenueItems;

// ---------------------------------------------------------------------------
// Req R3 — saveRevenueItems deduction hook
// ---------------------------------------------------------------------------

describe("Req R3 — saveRevenueItems atomic deduction hook (TDD red; Waves 1-2 make green)", () => {
  test("T-R3.1 flag OFF: items inserted, inventoryDeductedAt undefined, zero tx rows", async () => {
    const t = convexTest(schema, modules);
    const locId = await seedLocation(t, "Warehouse R3.1");
    const productId = await seedProduct(t, "PRD-R3-1");
    await seedInventory(t, productId, locId, 10);
    await seedRoutingDefault(t, "shopee", locId);
    await seedSettings(t, { shopee: false });

    const revenueId = await seedRevenueParent(t, "shopee");

    // Invoke saveRevenueItems — Wave 1 extends the args + return. Until then
    // this call either fails or returns the legacy shape.
    // @ts-expect-error — args shape extended in Wave 1
    const result = await t.mutation(saveRevenueItems, {
      revenueId,
      source: "shopee",
      items: [
        {
          externalItemId: "item-1",
          productName: "Test",
          unitPrice: 25000,
          quantity: 1,
          totalPrice: 25000,
          linkedMenuProductId: productId,
          isAutoMatched: false,
        },
      ],
    });

    expect(result.deducted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.inserted).toBe(1);

    const items = await t.run(async (ctx) =>
      ctx.db
        .query("externalRevenueItems")
        .withIndex("by_revenue", (q) => q.eq("revenueId", revenueId))
        .collect(),
    );
    expect(items).toHaveLength(1);
    // @ts-expect-error — inventoryDeductedAt field added in Wave 1
    expect(items[0].inventoryDeductedAt).toBeUndefined();

    const txns = await t.run(async (ctx) =>
      ctx.db.query("productInventoryTransactions").collect(),
    );
    expect(txns).toHaveLength(0);
  });

  test("T-R3.2 flag ON: inventoryDeductedAt set, one tx row written", async () => {
    const t = convexTest(schema, modules);
    const locId = await seedLocation(t, "Warehouse R3.2");
    const productId = await seedProduct(t, "PRD-R3-2");
    await seedInventory(t, productId, locId, 10);
    await seedRoutingDefault(t, "shopee", locId);
    await seedSettings(t, { shopee: true });

    const revenueId = await seedRevenueParent(t, "shopee");

    // @ts-expect-error — args shape extended in Wave 1
    const result = await t.mutation(saveRevenueItems, {
      revenueId,
      source: "shopee",
      items: [
        {
          externalItemId: "item-2",
          productName: "Test",
          unitPrice: 25000,
          quantity: 1,
          totalPrice: 25000,
          linkedMenuProductId: productId,
          isAutoMatched: false,
        },
      ],
    });

    expect(result.deducted).toBe(1);
    expect(result.inserted).toBe(1);

    const items = await t.run(async (ctx) =>
      ctx.db
        .query("externalRevenueItems")
        .withIndex("by_revenue", (q) => q.eq("revenueId", revenueId))
        .collect(),
    );
    // @ts-expect-error — inventoryDeductedAt field added in Wave 1
    expect(typeof items[0].inventoryDeductedAt).toBe("number");

    const txns = await t.run(async (ctx) =>
      ctx.db.query("productInventoryTransactions").collect(),
    );
    expect(txns).toHaveLength(1);
  });

  test("T-R3.3 atomicity rollback: routing throws → zero items, zero tx rows written", async () => {
    const t = convexTest(schema, modules);
    const productId = await seedProduct(t, "PRD-R3-3");
    // Intentionally NO routing row seeded → CHANNEL_ROUTING_NOT_CONFIGURED throws.
    await seedSettings(t, { shopee: true });

    const revenueId = await seedRevenueParent(t, "shopee");

    await expect(
      // @ts-expect-error — args shape extended in Wave 1
      t.mutation(saveRevenueItems, {
        revenueId,
        source: "shopee",
        items: [
          {
            externalItemId: "item-3",
            productName: "Test",
            unitPrice: 25000,
            quantity: 1,
            totalPrice: 25000,
            linkedMenuProductId: productId,
            isAutoMatched: false,
          },
        ],
      }),
    ).rejects.toThrow(/CHANNEL_ROUTING_NOT_CONFIGURED/);

    // Rollback proof: zero items AND zero tx rows persisted.
    const items = await t.run(async (ctx) =>
      ctx.db
        .query("externalRevenueItems")
        .withIndex("by_revenue", (q) => q.eq("revenueId", revenueId))
        .collect(),
    );
    expect(items).toHaveLength(0);

    const txns = await t.run(async (ctx) =>
      ctx.db.query("productInventoryTransactions").collect(),
    );
    expect(txns).toHaveLength(0);
  });

  test("T-R3.4 idempotency: second call with same (revenueId, externalItemId) is a no-op", async () => {
    const t = convexTest(schema, modules);
    const locId = await seedLocation(t, "Warehouse R3.4");
    const productId = await seedProduct(t, "PRD-R3-4");
    await seedInventory(t, productId, locId, 10);
    await seedRoutingDefault(t, "shopee", locId);
    await seedSettings(t, { shopee: true });

    const revenueId = await seedRevenueParent(t, "shopee");

    const args = {
      revenueId,
      source: "shopee" as const,
      items: [
        {
          externalItemId: "item-idem",
          productName: "Test",
          unitPrice: 25000,
          quantity: 1,
          totalPrice: 25000,
          linkedMenuProductId: productId,
          isAutoMatched: false,
        },
      ],
    };

    // @ts-expect-error — args shape extended in Wave 1
    await t.mutation(saveRevenueItems, args);
    // @ts-expect-error — args shape extended in Wave 1
    const second = await t.mutation(saveRevenueItems, args);

    // Second call inserts nothing new and deducts nothing new.
    expect(second.inserted).toBe(0);
    expect(second.deducted).toBe(0);

    const items = await t.run(async (ctx) =>
      ctx.db
        .query("externalRevenueItems")
        .withIndex("by_revenue", (q) => q.eq("revenueId", revenueId))
        .collect(),
    );
    expect(items).toHaveLength(1);

    const txns = await t.run(async (ctx) =>
      ctx.db.query("productInventoryTransactions").collect(),
    );
    expect(txns).toHaveLength(1);
  });

  test("T-R3.5 return shape backward compat: `ids: Id[]` preserved; new fields are additive", async () => {
    const t = convexTest(schema, modules);
    const locId = await seedLocation(t, "Warehouse R3.5");
    const productId = await seedProduct(t, "PRD-R3-5");
    await seedInventory(t, productId, locId, 10);
    await seedRoutingDefault(t, "shopee", locId);
    await seedSettings(t, { shopee: false });

    const revenueId = await seedRevenueParent(t, "shopee");

    // @ts-expect-error — args shape extended in Wave 1
    const result = await t.mutation(saveRevenueItems, {
      revenueId,
      source: "shopee",
      items: [
        {
          externalItemId: "item-5",
          productName: "Test",
          unitPrice: 25000,
          quantity: 1,
          totalPrice: 25000,
          linkedMenuProductId: productId,
          isAutoMatched: false,
        },
      ],
    });

    expect(Array.isArray(result.ids)).toBe(true);
    expect(result.ids).toHaveLength(result.inserted);
    // Additive fields exist and are numbers.
    expect(typeof result.deducted).toBe("number");
    expect(typeof result.skipped).toBe("number");
    expect(typeof result.inserted).toBe("number");
  });

  test("T-R3.6 mixed eligibility in one call: deducted=1, skipped=2, inserted=3", async () => {
    const t = convexTest(schema, modules);
    const locId = await seedLocation(t, "Warehouse R3.6");
    const productId = await seedProduct(t, "PRD-R3-6");
    await seedInventory(t, productId, locId, 10);
    await seedRoutingDefault(t, "shopee", locId);
    await seedSettings(t, { shopee: true });

    const revenueId = await seedRevenueParent(t, "shopee");

    // @ts-expect-error — args shape extended in Wave 1
    const result = await t.mutation(saveRevenueItems, {
      revenueId,
      source: "shopee",
      items: [
        // 1) unmapped → skipped (no linkedMenuProductId)
        {
          externalItemId: "item-unmapped",
          productName: "Unmapped",
          unitPrice: 25000,
          quantity: 1,
          totalPrice: 25000,
          isAutoMatched: false,
        },
        // 2) eligible → deducted
        {
          externalItemId: "item-deducted",
          productName: "Eligible",
          unitPrice: 25000,
          quantity: 1,
          totalPrice: 25000,
          linkedMenuProductId: productId,
          isAutoMatched: false,
        },
        // 3) zero-qty → skipped
        {
          externalItemId: "item-zeroqty",
          productName: "Zero qty",
          unitPrice: 25000,
          quantity: 0,
          totalPrice: 0,
          linkedMenuProductId: productId,
          isAutoMatched: false,
        },
      ],
    });

    expect(result.deducted).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.inserted).toBe(3);
  });
});
