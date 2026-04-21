/// <reference types="vite/client" />
/**
 * Phase 74.5.2 Plan 03 — Backfill integration tests (regression suite).
 *
 * Covers:
 *  - R8 / D-16 : ledger createdAt === revenue.transactionDate (NOT Date.now())
 *  - SC3 / D-19: idempotency — second run produces zero double-deduction
 *  - D74.5.2-L4: silent-drop guard — null linkedMenuProductId skips WITHOUT
 *    patching inventoryDeductedAt (stays eligible for future re-match + backfill)
 *  - D74.5.2-L13: flag-independence — backfill runs regardless of
 *    channelDeductionEnabled[source] (OFF, ON, missing key all work)
 *  - D-17: admin-only gate on runChannelBackfill; per-source audit gate on
 *    getChannelBackfillPreflight
 *  - Per-source isolation: Shopee backfill does NOT process TikTok rows
 *  - Chunking: 200+ items per source process correctly across pages
 *
 * Pattern rationale: uses `t.run(ctx => ctx.runMutation(internal.*, ...))`
 * (known-green in channelSale.test.ts) to invoke internalMutation logic via
 * the Convex runtime. The admin-gated PUBLIC mutation `runChannelBackfill` is
 * invoked via `t.mutation(api.*)` (known-green in bankKeywordRules/seed.test.ts).
 * The broken `t.action(internal.*)` path (Plan 01 finding D74.5.2-L1) is NOT
 * used.
 *
 * Test note: Plan 02 shipped `backfill.ts` before these tests. This is a
 * regression suite (post-hoc) rather than RED-first TDD — acceptable per plan
 * framing; bugs discovered here are escalated, not silently patched.
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../../schema";
import type { Id } from "../../_generated/dataModel";
// Plan 01 precedent (D74.5.2-L1): convex-test's module resolver fails for
// `t.mutation(internal.*)` / `t.query(api.*)` against the productInventory/
// subtree with "Could not find module for: productInventory/backfill", despite
// an identical glob + module registration that works elsewhere. Direct-handler
// invocation via `_fooForTest` helpers mirrors the known-green channelSale.test.ts
// and channelAudit.test.ts patterns.
import {
  _backfillOnePageForTest,
  _runChannelBackfillForTest,
  _getChannelBackfillPreflightForTest,
} from "../backfill";

const modules = import.meta.glob("../../**/*.ts");

type TestT = ReturnType<typeof convexTest>;

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedLocation(t: TestT, name = "Test Depot"): Promise<Id<"storageLocations">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("storageLocations", {
      name,
      locationType: "depot",
      isActive: true,
      isDefault: false,
      createdBy: "system:test",
      createdAt: Date.now(),
    }),
  );
}

async function seedProduct(
  t: TestT,
  code: string,
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
    }),
  );
}

async function seedStock(
  t: TestT,
  menuProductId: Id<"menuProducts">,
  locationId: Id<"storageLocations">,
  quantity: number,
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("productInventory", {
      menuProductId,
      locationId,
      quantity,
      lastUpdated: Date.now(),
    });
  });
}

/**
 * Seed a source-default (Tier 4) channelRouting rule so
 * `processChannelSaleInternal` can resolve the location without outletId or
 * menuProductId filters. Mirrors channelSale.test.ts:seedRoutingDefault.
 */
async function seedRoutingDefault(
  t: TestT,
  source: string,
  storageLocationId: Id<"storageLocations">,
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("channelRouting", {
      source: source as never,
      outletId: undefined,
      menuProductId: undefined,
      storageLocationId,
      isDefault: true,
      updatedBy: "system:test",
      updatedAt: Date.now(),
    });
  });
}

async function seedRevenueParent(
  t: TestT,
  overrides: Partial<{
    source: string;
    externalTransactionId: string;
    transactionDate: number;
    periodStart: number;
    periodEnd: number;
  }> = {},
): Promise<Id<"externalRevenue">> {
  const FIXED = overrides.transactionDate ?? 1_700_000_000_000;
  return await t.run(async (ctx) =>
    ctx.db.insert("externalRevenue", {
      source: (overrides.source ?? "shopee") as never,
      externalTransactionId: overrides.externalTransactionId ?? "txn-1",
      transactionDate: FIXED,
      periodStart: overrides.periodStart ?? FIXED,
      periodEnd: overrides.periodEnd ?? FIXED,
      dataOrigin: "api_revenue",
      confidence: "exact",
      revenueGross: 100000,
    }),
  );
}

async function seedRevenueItem(
  t: TestT,
  revenueId: Id<"externalRevenue">,
  overrides: Partial<{
    source: string;
    externalItemId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    linkedMenuProductId: Id<"menuProducts"> | undefined;
    inventoryDeductedAt: number | undefined;
  }> = {},
): Promise<Id<"externalRevenueItems">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("externalRevenueItems", {
      revenueId,
      source: (overrides.source ?? "shopee") as never,
      externalItemId: overrides.externalItemId ?? "item-1",
      productName: overrides.productName ?? "Test Product",
      quantity: overrides.quantity ?? 5,
      unitPrice: overrides.unitPrice ?? 20000,
      totalPrice: overrides.totalPrice ?? 100000,
      linkedMenuProductId: overrides.linkedMenuProductId,
      isAutoMatched: false,
      matchConfidence: overrides.linkedMenuProductId ? "exact" : "none",
      inventoryDeductedAt: overrides.inventoryDeductedAt,
      createdAt: Date.now(),
    }),
  );
}

async function seedUserSession(
  t: TestT,
  role: "admin" | "manager" | "order_staff" | "kitchen",
): Promise<string> {
  const token = `${role}-token-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
    });
  });
  return token;
}

/**
 * Run backfillOnePage via direct-handler helper inside t.run — matches the
 * known-green pattern from channelAudit.test.ts (`_runFullAuditForTest`).
 * Avoids the `t.mutation(internal.*)` convex-test module-resolution bug for
 * this subtree (D74.5.2-L1 / Plan 01).
 */
async function runBackfillPage(t: TestT, source: string) {
  return await t.run(async (ctx) =>
    _backfillOnePageForTest(ctx, { source: source as never }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("backfillChannelDeductions", () => {
  test("idempotent: re-run after completion produces zero double-deductions (SC3 / D-19)", async () => {
    const t = convexTest(schema, modules);
    const locationId = await seedLocation(t);
    const menuProductId = await seedProduct(t, "TEST-IDEM");
    await seedStock(t, menuProductId, locationId, 100);
    await seedRoutingDefault(t, "shopee", locationId);
    const revenueId = await seedRevenueParent(t, {
      source: "shopee",
      externalTransactionId: "shopee-idem-1",
    });
    const itemId = await seedRevenueItem(t, revenueId, {
      source: "shopee",
      externalItemId: "shopee-item-idem-1",
      quantity: 5,
      linkedMenuProductId: menuProductId,
      inventoryDeductedAt: undefined,
    });

    // First run: deduct once.
    const firstResult = await runBackfillPage(t, "shopee");
    expect(firstResult.itemsProcessed).toBe(1);
    expect(firstResult.deducted).toBe(1);
    expect(firstResult.skipped).toBe(0);

    // Verify exactly one channel_sale ledger row + item patched.
    await t.run(async (ctx) => {
      const txRows = (await ctx.db
        .query("productInventoryTransactions")
        .collect())
        .filter((tx) => tx.transactionType === "channel_sale");
      expect(txRows.length).toBe(1);
      expect(txRows[0].source).toBe("shopee");
      expect(txRows[0].quantity).toBe(-5);
      const item = await ctx.db.get(itemId);
      expect(item?.inventoryDeductedAt).toBeTypeOf("number");
    });

    // Second run: the by_source_deductedAt index narrows to un-deducted
    // rows — completed rows no longer match. Expect zero work.
    const secondResult = await runBackfillPage(t, "shopee");
    expect(secondResult.itemsProcessed).toBe(0);
    expect(secondResult.deducted).toBe(0);
    expect(secondResult.skipped).toBe(0);

    // Still exactly one ledger row — no double-deduction.
    await t.run(async (ctx) => {
      const txRows = (await ctx.db
        .query("productInventoryTransactions")
        .collect())
        .filter((tx) => tx.transactionType === "channel_sale");
      expect(txRows.length).toBe(1);
    });
  });

  test("preserves revenue.transactionDate as ledger createdAt, NOT Date.now() (R8 / D-16)", async () => {
    const t = convexTest(schema, modules);
    const HISTORICAL_TS = 1_600_000_000_000; // ~2020 — far in the past
    const locationId = await seedLocation(t);
    const menuProductId = await seedProduct(t, "TEST-TS");
    await seedStock(t, menuProductId, locationId, 50);
    await seedRoutingDefault(t, "tiktok", locationId);
    const revenueId = await seedRevenueParent(t, {
      source: "tiktok",
      externalTransactionId: "tt-ts-1",
      transactionDate: HISTORICAL_TS,
      periodStart: HISTORICAL_TS,
      periodEnd: HISTORICAL_TS,
    });
    await seedRevenueItem(t, revenueId, {
      source: "tiktok",
      externalItemId: "tt-item-1",
      quantity: 2,
      unitPrice: 25000,
      totalPrice: 50000,
      linkedMenuProductId: menuProductId,
    });

    await runBackfillPage(t, "tiktok");

    await t.run(async (ctx) => {
      const tx = (await ctx.db
        .query("productInventoryTransactions")
        .collect())
        .find((row) => row.transactionType === "channel_sale");
      expect(tx).toBeDefined();
      expect(tx!.createdAt).toBe(HISTORICAL_TS);
      // Paranoia: wall-clock now is well above the historical timestamp.
      expect(tx!.createdAt).toBeLessThan(Date.now());
    });
  });

  test("null linkedMenuProductId: skip but do NOT patch inventoryDeductedAt (D74.5.2-L4)", async () => {
    const t = convexTest(schema, modules);
    // No routing seed needed — skip happens before route resolution.
    const revenueId = await seedRevenueParent(t, {
      source: "bigseller",
      externalTransactionId: "bs-null-1",
    });
    const itemId = await seedRevenueItem(t, revenueId, {
      source: "bigseller",
      externalItemId: "bs-item-null",
      quantity: 1,
      linkedMenuProductId: undefined, // KEY: unmapped SKU
      inventoryDeductedAt: undefined,
    });

    const result = await runBackfillPage(t, "bigseller");
    expect(result.itemsProcessed).toBe(1);
    expect(result.deducted).toBe(0);
    expect(result.skipped).toBe(1);

    await t.run(async (ctx) => {
      // No ledger row written.
      const txRows = (await ctx.db
        .query("productInventoryTransactions")
        .collect())
        .filter((tx) => tx.transactionType === "channel_sale");
      expect(txRows.length).toBe(0);

      // CRITICAL (D74.5.2-L4): inventoryDeductedAt MUST remain undefined so
      // the item stays eligible for re-processing once an admin maps the SKU.
      // Patching here would orphan the row permanently.
      const item = await ctx.db.get(itemId);
      expect(item?.inventoryDeductedAt).toBeUndefined();
    });
  });

  test("runChannelBackfill rejects non-admin token (admin-only gate)", async () => {
    const t = convexTest(schema, modules);
    const kitchenToken = await seedUserSession(t, "kitchen");
    const managerToken = await seedUserSession(t, "manager");
    const adminToken = await seedUserSession(t, "admin");

    // Non-admin rejections via direct-handler (D74.5.2-L1).
    await expect(
      t.run(async (ctx) =>
        _runChannelBackfillForTest(ctx, {
          source: "shopee" as never,
          token: kitchenToken,
        }),
      ),
    ).rejects.toThrow();

    await expect(
      t.run(async (ctx) =>
        _runChannelBackfillForTest(ctx, {
          source: "shopee" as never,
          token: managerToken,
        }),
      ),
    ).rejects.toThrow();

    await expect(
      t.run(async (ctx) =>
        _runChannelBackfillForTest(ctx, {
          source: "shopee" as never,
          token: "invalid-token",
        }),
      ),
    ).rejects.toThrow();

    // Admin passes the gate.
    const result = await t.run(async (ctx) =>
      _runChannelBackfillForTest(ctx, {
        source: "shopee" as never,
        token: adminToken,
      }),
    );
    expect(result).toEqual({ scheduled: true });
  });

  test("flag-independent: backfill runs regardless of channelDeductionEnabled state (D74.5.2-L13)", async () => {
    const t = convexTest(schema, modules);
    const locationId = await seedLocation(t);
    const menuProductId = await seedProduct(t, "TEST-FLAG");
    await seedStock(t, menuProductId, locationId, 10);
    await seedRoutingDefault(t, "shopee", locationId);

    // Seed productInventorySettings with Shopee flag explicitly OFF to prove
    // backfill does not gate on it (D74.5.2-L13). Schema requires 8 specific
    // keys in channelDeductionEnabled — see schema.ts:1057.
    await t.run(async (ctx) => {
      await ctx.db.insert("productInventorySettings", {
        globalLowStockThreshold: 5,
        autoAdvanceOnDrawdown: true,
        alertMode: "toast",
        channelDeductionEnabled: {
          bigseller: false,
          consignment: false,
          gobiz: false,
          grabfood: false,
          internal: false,
          k3mart: false,
          shopee: false,
          tiktok: false,
        },
        updatedBy: "system:test",
        updatedAt: Date.now(),
      } as never);
    });

    const revenueId = await seedRevenueParent(t, {
      source: "shopee",
      externalTransactionId: "shopee-flag-off-1",
    });
    await seedRevenueItem(t, revenueId, {
      source: "shopee",
      externalItemId: "shopee-item-flag-1",
      quantity: 3,
      linkedMenuProductId: menuProductId,
    });

    const result = await runBackfillPage(t, "shopee");
    // Backfill deducts even though the dispatch flag is OFF.
    expect(result.deducted).toBe(1);
    expect(result.skipped).toBe(0);

    await t.run(async (ctx) => {
      const txRows = (await ctx.db
        .query("productInventoryTransactions")
        .collect())
        .filter((tx) => tx.transactionType === "channel_sale");
      expect(txRows.length).toBe(1);
      expect(txRows[0].source).toBe("shopee");
    });
  });

  test("per-source isolation: Shopee backfill does not process TikTok rows", async () => {
    const t = convexTest(schema, modules);
    const locationId = await seedLocation(t);
    const shopeeProduct = await seedProduct(t, "TEST-SHOP");
    const tiktokProduct = await seedProduct(t, "TEST-TT");
    await seedStock(t, shopeeProduct, locationId, 20);
    await seedStock(t, tiktokProduct, locationId, 20);
    await seedRoutingDefault(t, "shopee", locationId);
    await seedRoutingDefault(t, "tiktok", locationId);

    const shopeeRev = await seedRevenueParent(t, {
      source: "shopee",
      externalTransactionId: "shop-iso-1",
    });
    const shopeeItemId = await seedRevenueItem(t, shopeeRev, {
      source: "shopee",
      externalItemId: "shop-i-1",
      linkedMenuProductId: shopeeProduct,
      quantity: 2,
    });

    const tiktokRev = await seedRevenueParent(t, {
      source: "tiktok",
      externalTransactionId: "tt-iso-1",
    });
    const tiktokItemId = await seedRevenueItem(t, tiktokRev, {
      source: "tiktok",
      externalItemId: "tt-i-1",
      linkedMenuProductId: tiktokProduct,
      quantity: 4,
    });

    // Only run Shopee backfill.
    const result = await runBackfillPage(t, "shopee");
    expect(result.itemsProcessed).toBe(1);
    expect(result.deducted).toBe(1);

    await t.run(async (ctx) => {
      const txRows = (await ctx.db
        .query("productInventoryTransactions")
        .collect())
        .filter((tx) => tx.transactionType === "channel_sale");
      expect(txRows.length).toBe(1);
      expect(txRows[0].source).toBe("shopee");

      // TikTok item remains un-deducted.
      const tiktokItem = await ctx.db.get(tiktokItemId);
      expect(tiktokItem?.inventoryDeductedAt).toBeUndefined();

      // Shopee item is patched.
      const shopeeItem = await ctx.db.get(shopeeItemId);
      expect(shopeeItem?.inventoryDeductedAt).toBeTypeOf("number");
    });
  });

  test("chunking: 200+ items in one source process across multiple pages without drops", async () => {
    const t = convexTest(schema, modules);
    const locationId = await seedLocation(t);
    const menuProductId = await seedProduct(t, "TEST-CHUNK");
    // Enough stock to cover all items.
    await seedStock(t, menuProductId, locationId, 1000);
    await seedRoutingDefault(t, "k3mart", locationId);

    // Seed 250 un-deducted items across 250 parents (one item each for clarity).
    const TOTAL = 250;
    const itemIds: Array<Id<"externalRevenueItems">> = [];
    for (let i = 0; i < TOTAL; i++) {
      const revenueId = await seedRevenueParent(t, {
        source: "k3mart",
        externalTransactionId: `k3-chunk-${i}`,
      });
      const itemId = await seedRevenueItem(t, revenueId, {
        source: "k3mart",
        externalItemId: `k3-item-${i}`,
        quantity: 1,
        linkedMenuProductId: menuProductId,
      });
      itemIds.push(itemId);
    }

    // First page: BATCH_SIZE=200, so expect 200 processed.
    const page1 = await runBackfillPage(t, "k3mart");
    expect(page1.itemsProcessed).toBe(200);
    expect(page1.deducted).toBe(200);

    // Second page: remaining 50.
    const page2 = await runBackfillPage(t, "k3mart");
    expect(page2.itemsProcessed).toBe(50);
    expect(page2.deducted).toBe(50);

    // Third page: empty.
    const page3 = await runBackfillPage(t, "k3mart");
    expect(page3.itemsProcessed).toBe(0);

    // All items are deducted, exactly TOTAL ledger rows.
    await t.run(async (ctx) => {
      const txRows = (await ctx.db
        .query("productInventoryTransactions")
        .collect())
        .filter((tx) => tx.transactionType === "channel_sale");
      expect(txRows.length).toBe(TOTAL);

      for (const id of itemIds) {
        const item = await ctx.db.get(id);
        expect(item?.inventoryDeductedAt).toBeTypeOf("number");
      }
    });
  });

  test("preflight query: admin-only, reports pendingItems + per-source blockingAuditIssues (D-17)", async () => {
    const t = convexTest(schema, modules);
    const adminToken = await seedUserSession(t, "admin");
    const kitchenToken = await seedUserSession(t, "kitchen");

    const locationId = await seedLocation(t);
    const menuProductId = await seedProduct(t, "TEST-PRE");
    await seedStock(t, menuProductId, locationId, 20);
    await seedRoutingDefault(t, "shopee", locationId);

    const revenueId = await seedRevenueParent(t, {
      source: "shopee",
      externalTransactionId: "shop-pre-1",
    });
    await seedRevenueItem(t, revenueId, {
      source: "shopee",
      externalItemId: "shop-pre-i-1",
      linkedMenuProductId: menuProductId,
    });

    // Seed 1 blocking audit issue for shopee, 0 for tiktok.
    await t.run(async (ctx) => {
      const reportId = await ctx.db.insert("channelAuditReports", {
        status: "pending",
        totalItemsScanned: 1,
        issuesFound: 1,
        issuesByType: {
          unmapped_sku: 1,
          stale_mapping: 0,
          malformed_item: 0,
          duplicate_transaction: 0,
          orphan_item: 0,
        },
        startedAt: Date.now(),
        triggeredBy: "test",
      } as never);
      await ctx.db.insert("channelAuditIssues", {
        reportId,
        source: "shopee",
        issueType: "unmapped_sku",
        severity: "block",
        itemId: undefined,
        detail: "Unmatched SKU: Unmatched",
        detectedAt: Date.now(),
        resolvedAt: undefined,
      } as never);
    });

    // Non-admin rejected (via direct-handler, D74.5.2-L1).
    await expect(
      t.run(async (ctx) =>
        _getChannelBackfillPreflightForTest(ctx, {
          source: "shopee" as never,
          token: kitchenToken,
        }),
      ),
    ).rejects.toThrow();

    // Admin: shopee shows 1 pending + 1 blocking issue.
    const shopeePreflight = await t.run(async (ctx) =>
      _getChannelBackfillPreflightForTest(ctx, {
        source: "shopee" as never,
        token: adminToken,
      }),
    );
    expect(shopeePreflight.pendingItems).toBe(1);
    expect(shopeePreflight.blockingAuditIssues).toBe(1);

    // TikTok: per-source gate — 0 of each, unaffected by shopee blocking issue.
    const tiktokPreflight = await t.run(async (ctx) =>
      _getChannelBackfillPreflightForTest(ctx, {
        source: "tiktok" as never,
        token: adminToken,
      }),
    );
    expect(tiktokPreflight.pendingItems).toBe(0);
    expect(tiktokPreflight.blockingAuditIssues).toBe(0);
  });
});
