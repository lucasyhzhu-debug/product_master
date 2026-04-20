/// <reference types="vite/client" />
/**
 * Phase 74.5.1 — Vitest suite for saveRevenueItems deduction hook (R3).
 *
 * Covers Req R3 from 74.5.1-SPEC.md:
 *   - Atomic revenue insert + deduction dispatch inside one internalMutation.
 *   - Feature-flag gating via productInventorySettings.channelDeductionEnabled.
 *   - Rollback on deduction throw (CHANNEL_ROUTING_NOT_CONFIGURED).
 *   - Idempotency — second call with same (revenueId, externalItemId) is a no-op.
 *   - Additive return shape: keeps `ids: Id[]`; adds `deducted/skipped/inserted`.
 *   - `inventoryDeductedAt` field on externalRevenueItems is set on success.
 *
 * Landed after Wave 1 (schema fields) + Wave 2 Plan 05 (impl):
 *   - `channelDeductionEnabled` (object) field on productInventorySettings
 *   - `inventoryDeductedAt` field on externalRevenueItems
 *   - deduction dispatch block inside saveRevenueItemsImpl
 *   - `saveRevenueItemsWithCounts` additive wrapper returning the full impl shape
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../../schema";
import { internal } from "../../_generated/api";
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

type SourceLiteral =
  | "gobiz"
  | "bigseller"
  | "internal"
  | "k3mart"
  | "grabfood"
  | "consignment"
  | "shopee"
  | "tiktok";

async function seedRoutingDefault(
  t: TestContext,
  source: SourceLiteral,
  storageLocationId: Id<"storageLocations">,
) {
  await t.run(async (ctx) => {
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

// Plan 05 (Wave 2) added a pair of internalMutations to
// convex/externalData/mutations.ts:
//   - `saveRevenueItems` — legacy contract, returns `Id[]` for backward compat
//     with bigsellerOrders/mutations.ts:288-292 (destructures `.length`).
//   - `saveRevenueItemsWithCounts` — additive wrapper, returns the full impl
//     shape `{ ids, inserted, deducted, skipped }` for adapter counter wiring
//     (R9). This test exercises the counter contract so the counts wrapper
//     is the correct handle.
//
// Both are `internalMutation` registrations → referenced via `internal.*`
// (the public `api` proxy strips internal handles).
const saveRevenueItems =
  internal.externalData.mutations.saveRevenueItemsWithCounts;

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

    // Invoke saveRevenueItemsWithCounts — Plan 05 Wave 2 surfaces the full
    // impl result object on this additive wrapper.
    const result = await t.mutation(saveRevenueItems, {
      revenueId,
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

    const result = await t.mutation(saveRevenueItems, {
      revenueId,
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
      t.mutation(saveRevenueItems, {
        revenueId,
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

    await t.mutation(saveRevenueItems, args);
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

    const result = await t.mutation(saveRevenueItems, {
      revenueId,
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

    const result = await t.mutation(saveRevenueItems, {
      revenueId,
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
