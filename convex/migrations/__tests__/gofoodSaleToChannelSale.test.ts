/// <reference types="vite/client" />
/**
 * Phase 74.5.2 Plan 05 — gofood_sale → channel_sale migration tests.
 *
 * SPECIFICATION ONLY: Written in a PARALLEL worktree where Plan 04's action
 * file (convex/migrations/gofoodSaleToChannelSale.ts) does not yet exist.
 * Tests land post-merge alongside the Plan 04 output. The post-merge test
 * gate (orchestrator-driven) is the first run; until then, imports will be
 * unresolved — that is expected.
 *
 * Covers:
 *   - D74.5.2-L6 forward-only migration semantics
 *   - Pitfall 1 landmine (source: "gobiz" NOT "gofood")
 *   - gofoodOrderRef preservation on migrated rows (back-compat with TransactionLogPanel)
 *   - externalRef derivation from gofoodOrderRef (or "legacy-{_id}" fallback)
 *   - Self-healing on re-run after partial completion
 *   - Admin-only gate on the public runner mutation
 *
 * INVOCATION PATTERN (from Plan 01 + Plan 03 precedent, D74.5.2-L1):
 *   convex-test's registry resolver fails on t.mutation(internal.*),
 *   t.mutation(api.*), t.action(internal.*), AND ctx.runMutation(internal.*)
 *   inside t.run for files under convex/migrations/ and convex/productInventory/.
 *   Workaround: Plan 04 is expected to export direct-handler test shims
 *   (`_migrateOnePageForTest`, `_migrateGofoodSaleToChannelSaleForTest`,
 *   `_runGofoodSaleToChannelSaleMigrationForTest`) that replicate the
 *   registered handlers verbatim against MutationCtx / ActionCtx.
 *
 * If Plan 04 ships without these shims, this test file's @ts-expect-error
 * markers will surface and a Plan 04 follow-up must add them (matching the
 * channelAudit.ts `_runFullAuditForTest` and backfill.ts `_fooForTest`
 * precedents). See the SUMMARY of Plan 03 for the established pattern.
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../../schema";
import type { Id } from "../../_generated/dataModel";

// Direct-handler test shims per D74.5.2-L1 (added in bridge commit after Wave 2 merge).
import {
  _migrateOnePageForTest,
  _migrateGofoodSaleToChannelSaleForTest,
  _runGofoodSaleToChannelSaleMigrationForTest,
} from "../gofoodSaleToChannelSale";

const modules = import.meta.glob("../../**/*.ts");

type TestContext = ReturnType<typeof convexTest>;

// ---------------------------------------------------------------------------
// Seed helpers — schema-fidelity verified against convex/schema.ts @ HEAD
// (productInventoryTransactions lines 1009-1040, menuProducts 93-123,
// storageLocations 843-860, users 449-475, sessions 476-485).
// ---------------------------------------------------------------------------

async function seedLocation(t: TestContext, name: string): Promise<Id<"storageLocations">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("storageLocations", {
      name,
      locationType: "depot",
      isActive: true,
      isDefault: false,
      createdBy: "test",
      createdAt: Date.now(),
    }),
  );
}

async function seedMenuProduct(t: TestContext, code: string): Promise<Id<"menuProducts">> {
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

async function seedGofoodSaleTxn(
  t: TestContext,
  opts: {
    menuProductId: Id<"menuProducts">;
    locationId: Id<"storageLocations">;
    gofoodOrderRef?: string;
    quantity?: number;
  },
): Promise<Id<"productInventoryTransactions">> {
  const q = opts.quantity ?? 1;
  return await t.run(async (ctx) =>
    ctx.db.insert("productInventoryTransactions", {
      menuProductId: opts.menuProductId,
      locationId: opts.locationId,
      transactionType: "gofood_sale",
      quantity: -q,
      previousQuantity: 10,
      newQuantity: 10 - q,
      gofoodOrderRef: opts.gofoodOrderRef,
      performedBy: "system:gobiz_sync",
      createdAt: Date.now(),
    }),
  );
}

async function seedUserAndSession(
  t: TestContext,
  role: "admin" | "kitchen" | "manager" | "order_staff",
  token: string,
): Promise<void> {
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: `Test ${role}`,
      pinHash: "salt:deadbeef", // Schema requires pinHash; value unused by requireRole().
      role,
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    });
    await ctx.db.insert("sessions", {
      userId,
      token,
      expiresAt: Date.now() + 86_400_000, // 24h ahead
      createdAt: Date.now(),
    });
  });
}

// Drain pagination — invokes the test-shim once per page until isDone.
async function drainMigration(t: TestContext): Promise<{ totalMigrated: number; pages: number }> {
  let cursor: string | null = null;
  let totalMigrated = 0;
  let pages = 0;
  // Safety cap: 20 pages × 500 = 10k rows (well above any test seed size).
  for (let i = 0; i < 20; i++) {
    const result = await t.run(async (ctx) =>
      _migrateOnePageForTest(ctx, { paginationOpts: { numItems: 500, cursor } }),
    );
    pages += 1;
    totalMigrated += result.migrated;
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  return { totalMigrated, pages };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("migrateGofoodSaleToChannelSale", () => {
  test("T1 chunked migration rewrites all gofood_sale rows to channel_sale + source=gobiz", async () => {
    const t = convexTest(schema, modules);
    const locId = await seedLocation(t, "Depot T1");
    const productId = await seedMenuProduct(t, "PRD-T1");

    // Seed 10 gofood_sale rows with varied gofoodOrderRef.
    const seededIds: Array<Id<"productInventoryTransactions">> = [];
    for (let i = 0; i < 10; i++) {
      const id = await seedGofoodSaleTxn(t, {
        menuProductId: productId,
        locationId: locId,
        gofoodOrderRef: `go-${i}`,
      });
      seededIds.push(id);
    }

    // Run migration.
    const { totalMigrated } = await drainMigration(t);
    expect(totalMigrated).toBe(10);

    // Zero gofood_sale rows remain.
    const remaining = await t.run(async (ctx) =>
      ctx.db
        .query("productInventoryTransactions")
        .withIndex("by_type", (q) => q.eq("transactionType", "gofood_sale"))
        .collect(),
    );
    expect(remaining.length).toBe(0);

    // 10 channel_sale rows with source=gobiz.
    const migrated = await t.run(async (ctx) =>
      ctx.db
        .query("productInventoryTransactions")
        .withIndex("by_type", (q) => q.eq("transactionType", "channel_sale"))
        .collect(),
    );
    expect(migrated.length).toBe(10);
    for (const row of migrated) {
      expect(row.source).toBe("gobiz");
      // externalRef must equal original gofoodOrderRef (all seeds had one).
      expect(row.externalRef).toBe(row.gofoodOrderRef);
      // gofoodOrderRef preserved (NOT cleared).
      expect(row.gofoodOrderRef).toMatch(/^go-\d+$/);
    }
  });

  test("T2 writes source: gobiz (landmine Pitfall 1 — NOT gofood)", async () => {
    const t = convexTest(schema, modules);
    const locId = await seedLocation(t, "Depot T2");
    const productId = await seedMenuProduct(t, "PRD-T2");
    const seededId = await seedGofoodSaleTxn(t, {
      menuProductId: productId,
      locationId: locId,
      gofoodOrderRef: "go-lm-1",
    });

    await drainMigration(t);

    const row = await t.run(async (ctx) => ctx.db.get(seededId));
    expect(row).not.toBeNull();
    expect(row!.transactionType).toBe("channel_sale");
    // Exact literal equality check — `externalSource` union at
    // convex/lib/externalSource.ts does not contain "gofood"; writing
    // "gofood" would fail compile-time (Pitfall 1). This runtime assertion
    // guards against future schema drift in the union.
    expect(row!.source).toBe("gobiz");
    expect(row!.source).not.toBe("gofood");
  });

  test("T3 preserves gofoodOrderRef and derives externalRef with legacy-{_id} fallback", async () => {
    const t = convexTest(schema, modules);
    const locId = await seedLocation(t, "Depot T3");
    const productId = await seedMenuProduct(t, "PRD-T3");

    const id1 = await seedGofoodSaleTxn(t, {
      menuProductId: productId,
      locationId: locId,
      gofoodOrderRef: "go-ref-A",
    });
    const id2 = await seedGofoodSaleTxn(t, {
      menuProductId: productId,
      locationId: locId,
      gofoodOrderRef: "go-ref-B",
    });
    const id3 = await seedGofoodSaleTxn(t, {
      menuProductId: productId,
      locationId: locId,
      gofoodOrderRef: undefined, // fallback case
    });

    await drainMigration(t);

    const r1 = await t.run(async (ctx) => ctx.db.get(id1));
    expect(r1?.externalRef).toBe("go-ref-A");
    expect(r1?.gofoodOrderRef).toBe("go-ref-A"); // preserved, NOT cleared

    const r2 = await t.run(async (ctx) => ctx.db.get(id2));
    expect(r2?.externalRef).toBe("go-ref-B");
    expect(r2?.gofoodOrderRef).toBe("go-ref-B");

    const r3 = await t.run(async (ctx) => ctx.db.get(id3));
    expect(r3?.externalRef).toMatch(/^legacy-/);
    expect(r3?.externalRef).toBe(`legacy-${id3}`);
    expect(r3?.gofoodOrderRef).toBeUndefined();
  });

  test("T4 self-healing: re-run after completion is a no-op (zero double-patches)", async () => {
    const t = convexTest(schema, modules);
    const locId = await seedLocation(t, "Depot T4");
    const productId = await seedMenuProduct(t, "PRD-T4");
    for (let i = 0; i < 5; i++) {
      await seedGofoodSaleTxn(t, {
        menuProductId: productId,
        locationId: locId,
        gofoodOrderRef: `go-sh-${i}`,
      });
    }

    // First run — migrates all 5.
    const firstRun = await t.run(async (ctx) =>
      _migrateOnePageForTest(ctx, { paginationOpts: { numItems: 500, cursor: null } }),
    );
    expect(firstRun.migrated).toBe(5);
    expect(firstRun.isDone).toBe(true);

    // Second run — by_type index narrows to "gofood_sale", which now has
    // zero matching rows; migration self-heals to a no-op.
    const secondRun = await t.run(async (ctx) =>
      _migrateOnePageForTest(ctx, { paginationOpts: { numItems: 500, cursor: null } }),
    );
    expect(secondRun.migrated).toBe(0);
    expect(secondRun.isDone).toBe(true);

    // Row count integrity — still exactly 5 channel_sale rows, no duplicates.
    const channelSaleRows = await t.run(async (ctx) =>
      ctx.db
        .query("productInventoryTransactions")
        .withIndex("by_type", (q) => q.eq("transactionType", "channel_sale"))
        .collect(),
    );
    expect(channelSaleRows.length).toBe(5);
    // Every row still has source=gobiz (no double-patch, no cleared source).
    for (const row of channelSaleRows) {
      expect(row.source).toBe("gobiz");
    }
  });

  test("T5 runGofoodSaleToChannelSaleMigration rejects non-admin token", async () => {
    const t = convexTest(schema, modules);
    await seedUserAndSession(t, "admin", "admin-token");
    await seedUserAndSession(t, "kitchen", "kitchen-token");

    // Kitchen token — must throw (requireRole throws "Not authorized").
    await expect(
      t.run(async (ctx) =>
        _runGofoodSaleToChannelSaleMigrationForTest(ctx, { token: "kitchen-token" }),
      ),
    ).rejects.toThrow();

    // Admin token — resolves to { scheduled: true }.
    const result = await t.run(async (ctx) =>
      _runGofoodSaleToChannelSaleMigrationForTest(ctx, { token: "admin-token" }),
    );
    expect(result).toEqual({ scheduled: true });
  });
});

// Intentionally unused in some environments — references the untouched
// internal action helper to keep the import live and exercise type-check.
void _migrateGofoodSaleToChannelSaleForTest;
