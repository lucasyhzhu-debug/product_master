/// <reference types="vite/client" />
/**
 * Phase 74.5.1 Wave 0 — TDD RED tests for processChannelSaleInternal (R4).
 *
 * Covers Req R4 from 74.5.1-SPEC.md:
 *   - Phase 78 substitution + stockTracker reuse (mandatory per Constraint 1).
 *   - Historical `createdAt = event.occurredAt` preservation (NOT Date.now()).
 *   - Inserts `productInventoryTransactions` with transactionType="channel_sale",
 *     source set, quantity=-event.quantity, externalRef composed from ids.
 *   - zero_quantity / unmapped_sku skip-reasons without writing rows.
 *   - CHANNEL_ROUTING_NOT_CONFIGURED bubbles up (no silent catch).
 *
 * RED STATE: imports from `../channelSale` and `../channelRouting` which do
 * NOT exist until Waves 1-2. Tests will fail "Cannot find module" — expected.
 *
 * DO NOT delete the @ts-expect-error comments until implementation lands.
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../../schema";
import type { Id } from "../../_generated/dataModel";
import type { ExternalSource } from "../../lib/externalSource";

import { processChannelSaleInternal } from "../channelSale";
// Phase 78 helpers — exist today, imported for contract reuse assertions.
import { resolveSubstitutionPlan } from "../substitution";
import { createStockTracker } from "../stockTracker";

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

async function seedProduct(
  t: TestContext,
  code: string,
  opts: { fulfillFromProductId?: Id<"menuProducts">; fulfillMultiplier?: number } = {},
): Promise<Id<"menuProducts">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("menuProducts", {
      code,
      name: `Product ${code}`,
      grams: 80,
      defaultPrice: 25000,
      isActive: true,
      unitCost: 5000,
      cachedProductionSummary: "1 Big",
      fulfillFromProductId: opts.fulfillFromProductId,
      fulfillMultiplier: opts.fulfillMultiplier,
    }),
  );
}

async function seedProductInventory(
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
  source: ExternalSource,
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

function makeEvent(overrides: Partial<{
  source: ExternalSource;
  occurredAt: number;
  externalTransactionId: string;
  externalItemId: string;
  outletId: Id<"externalOutlets"> | undefined;
  menuProductId: Id<"menuProducts"> | undefined;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}> = {}) {
  return {
    source: overrides.source ?? "shopee",
    occurredAt: overrides.occurredAt ?? 1_700_000_000_000,
    externalTransactionId: overrides.externalTransactionId ?? "txn-1",
    externalItemId: overrides.externalItemId ?? "item-1",
    outletId: overrides.outletId,
    menuProductId: overrides.menuProductId,
    quantity: overrides.quantity ?? 1,
    unitPrice: overrides.unitPrice ?? 25000,
    totalPrice: overrides.totalPrice ?? 25000,
  };
}

// ---------------------------------------------------------------------------
// Req R4 — processChannelSaleInternal
// ---------------------------------------------------------------------------

describe("Req R4 — processChannelSaleInternal (TDD red; Waves 1-2 make green)", () => {
  test("T-R4.1 deducts exact quantity and writes channel_sale transaction row with source", async () => {
    const t = convexTest(schema, modules);
    const locId = await seedLocation(t, "Warehouse R4.1");
    const productId = await seedProduct(t, "PRD-R4-1");
    await seedProductInventory(t, productId, locId, 10);
    await seedRoutingDefault(t, "shopee", locId);

    const event = makeEvent({ menuProductId: productId, quantity: 3 });

    const result = await t.run(async (ctx) => processChannelSaleInternal(ctx, event));

    expect(result.deducted).toBe(true);

    const txns = await t.run(async (ctx) =>
      ctx.db
        .query("productInventoryTransactions")
        .withIndex("by_product_location", (q) =>
          q.eq("menuProductId", productId).eq("locationId", locId),
        )
        .collect(),
    );

    expect(txns).toHaveLength(1);
    expect(txns[0].quantity).toBe(-3);
    expect(txns[0].transactionType).toBe("channel_sale");
    expect(txns[0].source).toBe("shopee");
  });

  test("T-R4.2 createdAt === event.occurredAt (historical fidelity, NOT Date.now())", async () => {
    const t = convexTest(schema, modules);
    const locId = await seedLocation(t, "Warehouse R4.2");
    const productId = await seedProduct(t, "PRD-R4-2");
    await seedProductInventory(t, productId, locId, 10);
    await seedRoutingDefault(t, "shopee", locId);

    const HISTORICAL_OCCURRED_AT = 1_600_000_000_000; // ~2020 — far in the past
    const event = makeEvent({ menuProductId: productId, quantity: 1, occurredAt: HISTORICAL_OCCURRED_AT });

    await t.run(async (ctx) => processChannelSaleInternal(ctx, event));

    const txns = await t.run(async (ctx) =>
      ctx.db
        .query("productInventoryTransactions")
        .withIndex("by_product_location", (q) =>
          q.eq("menuProductId", productId).eq("locationId", locId),
        )
        .collect(),
    );

    expect(txns[0].createdAt).toBe(HISTORICAL_OCCURRED_AT);
    // Sanity: it must NOT have been replaced with Date.now() (> 1.7T ms).
    expect(txns[0].createdAt).toBeLessThan(1_700_000_000_000);
  });

  test("T-R4.3 substitution plan applied — shortfall writes own ledger row against source product", async () => {
    const t = convexTest(schema, modules);
    const locId = await seedLocation(t, "Warehouse R4.3");
    const sourceProductId = await seedProduct(t, "PRD-R4-3-SRC");
    const mainProductId = await seedProduct(t, "PRD-R4-3-MAIN", {
      fulfillFromProductId: sourceProductId,
      fulfillMultiplier: 2,
    });

    // Direct stock short: main=1 on hand, source=10 on hand; event wants 3 → 1 direct + 2*2=4 substitute.
    await seedProductInventory(t, mainProductId, locId, 1);
    await seedProductInventory(t, sourceProductId, locId, 10);
    await seedRoutingDefault(t, "shopee", locId);

    const event = makeEvent({ menuProductId: mainProductId, quantity: 3 });
    await t.run(async (ctx) => processChannelSaleInternal(ctx, event));

    const mainTxns = await t.run(async (ctx) =>
      ctx.db
        .query("productInventoryTransactions")
        .withIndex("by_product_location", (q) =>
          q.eq("menuProductId", mainProductId).eq("locationId", locId),
        )
        .collect(),
    );
    const sourceTxns = await t.run(async (ctx) =>
      ctx.db
        .query("productInventoryTransactions")
        .withIndex("by_product_location", (q) =>
          q.eq("menuProductId", sourceProductId).eq("locationId", locId),
        )
        .collect(),
    );

    expect(mainTxns).toHaveLength(1);
    expect(mainTxns[0].quantity).toBe(-1);
    expect(sourceTxns).toHaveLength(1);
    expect(sourceTxns[0].quantity).toBe(-4); // 2 shortfall * multiplier 2
  });

  test("T-R4.4 event.quantity <= 0 returns skipReason=zero_quantity, writes no row", async () => {
    const t = convexTest(schema, modules);
    const locId = await seedLocation(t, "Warehouse R4.4");
    const productId = await seedProduct(t, "PRD-R4-4");
    await seedProductInventory(t, productId, locId, 10);
    await seedRoutingDefault(t, "shopee", locId);

    const event = makeEvent({ menuProductId: productId, quantity: 0 });
    const result = await t.run(async (ctx) => processChannelSaleInternal(ctx, event));

    expect(result).toMatchObject({ deducted: false, skipReason: "zero_quantity" });

    const txns = await t.run(async (ctx) =>
      ctx.db.query("productInventoryTransactions").collect(),
    );
    expect(txns).toHaveLength(0);
  });

  test("T-R4.5 event.menuProductId == null returns skipReason=unmapped_sku, writes no row", async () => {
    const t = convexTest(schema, modules);
    const locId = await seedLocation(t, "Warehouse R4.5");
    await seedRoutingDefault(t, "shopee", locId);

    const event = makeEvent({ menuProductId: undefined, quantity: 5 });
    const result = await t.run(async (ctx) => processChannelSaleInternal(ctx, event));

    expect(result).toMatchObject({ deducted: false, skipReason: "unmapped_sku" });

    const txns = await t.run(async (ctx) =>
      ctx.db.query("productInventoryTransactions").collect(),
    );
    expect(txns).toHaveLength(0);
  });

  test("T-R4.6 externalRef = externalTransactionId + externalItemId on inserted row", async () => {
    const t = convexTest(schema, modules);
    const locId = await seedLocation(t, "Warehouse R4.6");
    const productId = await seedProduct(t, "PRD-R4-6");
    await seedProductInventory(t, productId, locId, 10);
    await seedRoutingDefault(t, "shopee", locId);

    const event = makeEvent({
      menuProductId: productId,
      quantity: 1,
      externalTransactionId: "TXN-123",
      externalItemId: "ITM-ABC",
    });

    await t.run(async (ctx) => processChannelSaleInternal(ctx, event));

    const txns = await t.run(async (ctx) =>
      ctx.db
        .query("productInventoryTransactions")
        .withIndex("by_product_location", (q) =>
          q.eq("menuProductId", productId).eq("locationId", locId),
        )
        .collect(),
    );

    expect(txns).toHaveLength(1);
    expect(txns[0].externalRef).toBe("TXN-123ITM-ABC");
  });

  test("T-R4.7 CHANNEL_ROUTING_NOT_CONFIGURED bubbles up (no silent catch)", async () => {
    const t = convexTest(schema, modules);
    const productId = await seedProduct(t, "PRD-R4-7");
    // Intentionally NO routing row seeded.

    const event = makeEvent({ menuProductId: productId, quantity: 1 });

    await expect(
      t.run(async (ctx) => processChannelSaleInternal(ctx, event)),
    ).rejects.toThrow(/CHANNEL_ROUTING_NOT_CONFIGURED/);
  });

  test("T-R4.8 reuses Phase 78 resolveSubstitutionPlan + createStockTracker (contract sanity)", () => {
    // Sanity check that the mandatory reuse targets are importable from this
    // file's scope. Wave 2 implementation MUST import these same helpers —
    // grep for the function names verifies reuse.
    expect(typeof resolveSubstitutionPlan).toBe("function");
    expect(typeof createStockTracker).toBe("function");
  });
});
