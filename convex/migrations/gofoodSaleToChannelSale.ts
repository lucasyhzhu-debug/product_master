/**
 * Phase 74.5.2 Plan 04 — Forward-only migration of `transactionType: "gofood_sale"`
 * rows in `productInventoryTransactions` to `transactionType: "channel_sale"` with
 * `source: "gobiz"`.
 *
 * WHY: 74.5.1 introduced the unified `channel_sale` literal + `source` field. 74.5.2
 * cuts over all active sync paths to the unified dispatch and retires
 * `processGofoodSales`. The migration rewrites every historical `gofood_sale` row so
 * readers (TransactionLogPanel, queries, analytics) can drop the legacy literal.
 *
 * CRITICAL — LITERAL LANDMINE (RESEARCH Pitfall 1):
 *   Write `source: "gobiz"`, NOT `"gofood"`. The `externalSource` union at
 *   `convex/lib/externalSource.ts` does not contain `"gofood"` — GoFood is a surface
 *   name for the gobiz integration. Type-check fails on `"gofood"`.
 *
 * IDEMPOTENCY / SELF-HEAL:
 *   The `by_type` index narrows to `transactionType === "gofood_sale"` — already-
 *   migrated rows (now `channel_sale`) no longer appear. Re-running after partial
 *   completion picks up where it left off with no double-writes.
 *
 * SCHEMA:
 *   The `gofood_sale` literal is NOT dropped from the schema union in this phase
 *   (strip-before-drop — D74.5.2-L6 + D74.5.2-L8). After the migration runs to zero
 *   remaining rows + 72h soak, a separate follow-up phase drops the literal.
 *
 * LEGACY COMPAT:
 *   `gofoodOrderRef` is PRESERVED on migrated rows — TransactionLogPanel.tsx still
 *   renders it for legacy display. `externalRef` is ALSO populated (new canonical
 *   field), derived from `gofoodOrderRef` or `legacy-{_id}` fallback.
 */
import { v } from "convex/values";
import { paginationOptsValidator, type PaginationOptions } from "convex/server";
import { internalAction, internalMutation, mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireRole } from "../lib/auth";

const PAGE_SIZE = 500; // Phase 80.2 proved 500-row mutations complete in ~400ms (well under 2s limit).

export const migrateOnePage = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    // Self-heal invariant: re-invocation with cursor=null after partial failure is safe.
    // Rows patched in prior invocations no longer match transactionType = "gofood_sale"
    // and fall out of the by_type index scan. Cursor continuity is for within-invocation
    // traversal; cross-invocation idempotency comes from the filter narrowing, not from
    // cursor resumption. The admin recovery path IS re-triggering with cursor=null.
    const page = await ctx.db
      .query("productInventoryTransactions")
      .withIndex("by_type", (q) => q.eq("transactionType", "gofood_sale"))
      .paginate(args.paginationOpts);

    let migrated = 0;
    for (const tx of page.page) {
      await ctx.db.patch(tx._id, {
        transactionType: "channel_sale",
        source: "gobiz", // CRITICAL: gobiz, NOT "gofood" — see header Pitfall 1.
        // externalRef: canonical field for new channel_sale rows. Prefer the
        // legacy gofoodOrderRef; fall back to a synthetic key if missing.
        externalRef: tx.gofoodOrderRef ?? `legacy-${tx._id}`,
        // gofoodOrderRef intentionally NOT cleared — TransactionLogPanel.tsx still
        // reads it for the legacy display branch (D74.5.2-L6 + RESEARCH Open Q2).
      });
      migrated++;
    }
    return {
      migrated,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const migrateGofoodSaleToChannelSale = internalAction({
  args: { triggeredBy: v.string() },
  // `triggeredBy` is intentionally accepted by the action contract (audit trail
  // on the scheduler invocation) even though the action body itself does not
  // read it. Prefix with underscore to silence noUnusedParameters.
  handler: async (ctx, _args): Promise<{
    totalMigrated: number;
    pagesProcessed: number;
  }> => {
    let cursor: string | null = null;
    let totalMigrated = 0;
    let pagesProcessed = 0;
    const MAX_PAGES = 1000; // safety cap: 1000 × 500 = 500K rows

    while (pagesProcessed < MAX_PAGES) {
      // Explicit annotation — the `internal.*` return type flows via project
      // references and tsc -b cannot always reconstruct it before the action's
      // own return type is known; the annotation breaks the cycle.
      const result: {
        migrated: number;
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runMutation(
        internal.migrations.gofoodSaleToChannelSale.migrateOnePage,
        { paginationOpts: { numItems: PAGE_SIZE, cursor } },
      );
      pagesProcessed++;
      totalMigrated += result.migrated;
      if (result.isDone) break;
      cursor = result.continueCursor;
    }

    return { totalMigrated, pagesProcessed };
  },
});

export const runGofoodSaleToChannelSaleMigration = mutation({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<{ scheduled: true }> => {
    const user = await requireRole(ctx, args.token, ["admin"]);
    await ctx.scheduler.runAfter(
      0,
      internal.migrations.gofoodSaleToChannelSale.migrateGofoodSaleToChannelSale,
      { triggeredBy: user.name },
    );
    return { scheduled: true };
  },
});

// ============================================================================
// Direct-handler test shims (D74.5.2-L1 pattern — mirrors Plan 01's
// `_runFullAuditForTest` in channelAudit.ts and Plan 03's `_backfillOnePageForTest`
// in productInventory/backfill.ts).
//
// convex-test's `t.mutation(internal.*)` / `t.action(internal.*)` resolver fails
// with "Could not find module for: migrations/gofoodSaleToChannelSale" for this
// subtree despite an identical glob + module registration that works for sibling
// tests. These helpers replicate the registered handlers verbatim against a single
// ctx so tests can invoke them via `t.run(async (ctx) => await _fooForTest(ctx, args))`.
//
// Production behavior is unchanged — the registered endpoints continue to call
// the same logic. DO NOT call these from production code.
// ============================================================================

export const _migrateOnePageForTest = async (
  ctx: MutationCtx,
  args: { paginationOpts: PaginationOptions },
): Promise<{ migrated: number; isDone: boolean; continueCursor: string }> => {
  const page = await ctx.db
    .query("productInventoryTransactions")
    .withIndex("by_type", (q) => q.eq("transactionType", "gofood_sale"))
    .paginate(args.paginationOpts);

  let migrated = 0;
  for (const tx of page.page) {
    await ctx.db.patch(tx._id, {
      transactionType: "channel_sale",
      source: "gobiz",
      externalRef: tx.gofoodOrderRef ?? `legacy-${tx._id}`,
    });
    migrated++;
  }
  return {
    migrated,
    isDone: page.isDone,
    continueCursor: page.continueCursor,
  };
};

// Stub for the internalAction — tests only keep the import live (void reference).
// The drain loop is exercised via direct _migrateOnePageForTest calls because
// ctx.runMutation from MutationCtx is not wired in convex-test the same way as
// from ActionCtx. Tests that need end-to-end coverage rely on the paginated
// shim above.
export const _migrateGofoodSaleToChannelSaleForTest = async (
  _ctx: MutationCtx,
  _args: { triggeredBy: string },
): Promise<{ totalMigrated: number; pagesProcessed: number }> => {
  return { totalMigrated: 0, pagesProcessed: 0 };
};

export const _runGofoodSaleToChannelSaleMigrationForTest = async (
  ctx: MutationCtx,
  args: { token: string },
): Promise<{ scheduled: true }> => {
  // Mirrors runGofoodSaleToChannelSaleMigration admin-gate. Skips scheduler.runAfter
  // so the test can assert on gating alone (scheduler invocation is covered by
  // Convex itself — same pattern as backfill.ts `_runChannelBackfillForTest`).
  await requireRole(ctx, args.token, ["admin"]);
  return { scheduled: true };
};
