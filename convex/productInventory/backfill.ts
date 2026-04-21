/**
 * Phase 74.5.2 Plan 02: Per-source historical backfill for channel deductions.
 *
 * Admin clicks a per-source button on /admin/unlinked-products-backfill; that dispatches
 * `runChannelBackfill({ source, token })`, which schedules the internalAction
 * `backfillChannelDeductions({ source })`. The action paginates via the
 * `by_source_deductedAt` index (rows with `inventoryDeductedAt === undefined`),
 * invoking `backfillOnePage` until the query returns zero rows.
 *
 * Idempotency guarantee (D-19): `inventoryDeductedAt` is set-once on successful
 * deduction. Re-running after completion returns zero work (the index narrows to
 * un-deducted rows; completed rows no longer match). Pitfall 3 (RESEARCH): NEVER
 * patch `inventoryDeductedAt` on skip-reason paths; only patch when
 * `result.deducted === true`.
 *
 * Flag-independence (D74.5.2-L13): This action does NOT read
 * `channelDeductionEnabled`. It is a data-repair operation separate from live-sync
 * gating. Admin may run with flag OFF and flip ON afterward.
 *
 * Timestamp preservation (D-16): Calls `processChannelSaleInternal` via
 * `buildEventFromRow`, which sets `occurredAt = revenue.transactionDate ?? ...`.
 * The Layer-4 core writes `createdAt: event.occurredAt` on the ledger row —
 * historical transactionDate is preserved, NOT the wall-clock Date.now().
 */
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internalAction, internalMutation, mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { externalSource } from "../schema";
import type { ExternalSource } from "../lib/externalSource";
import { requireRole } from "../lib/auth";
import { buildEventFromRow, processChannelSaleInternal } from "./channelSale";

const BATCH_SIZE = 200; // D-16: 200-item chunks per page
const MAX_ITERATIONS = 500; // 500 × 200 = 100K items hard cap — safety against runaway loops

/**
 * Shared helper: processes a single page of unprocessed `externalRevenueItems`
 * for the given source. Called by both:
 *   - `backfillOnePage` (internalMutation) — scheduler-triggered ceremonial wrapper
 *   - `runOneChannelBackfillPage` (admin mutation) — UI client-loop path
 *
 * No `ctx.runMutation` indirection. Mirrors the `saveRevenueItemsImpl` pattern
 * at `convex/externalData/mutations.ts:804` — both the public and internal
 * registered endpoints call this function inline against a single ctx.
 *
 * Contract guarantees (identical across both callers):
 *  - D-19 idempotency: `inventoryDeductedAt` patched ONLY on `result.deducted === true`.
 *  - D74.5.2-L4 silent-drop: unmapped `linkedMenuProductId` rows are skipped WITHOUT
 *    patching so they can be re-processed once admin resolves the SKU mapping.
 *  - D-16 timestamp preservation: delegates to `buildEventFromRow` which sets
 *    `occurredAt = revenue.transactionDate ?? revenue.periodStart ?? _creationTime`.
 *  - D74.5.2-L13 flag-independence: does NOT read `channelDeductionEnabled`.
 */
export async function backfillOnePageImpl(
  ctx: MutationCtx,
  source: ExternalSource,
): Promise<{ itemsProcessed: number; deducted: number; skipped: number }> {
  const items = await ctx.db
    .query("externalRevenueItems")
    .withIndex("by_source_deductedAt", (q) =>
      q.eq("source", source).eq("inventoryDeductedAt", undefined))
    .take(BATCH_SIZE);

  let deducted = 0;
  let skipped = 0;
  for (const item of items) {
    // Pitfall 3: pre-filter null linkedMenuProductId — do NOT patch inventoryDeductedAt on skip.
    // D74.5.2-L4 silent-drop guard: unmapped items stay un-patched so they can be
    // re-processed once admin maps the SKU; patching here would orphan them.
    if (!item.linkedMenuProductId) {
      skipped++;
      continue;
    }
    const revenue = await ctx.db.get(item.revenueId);
    if (!revenue) {
      skipped++;
      continue;
    }
    const event = buildEventFromRow(revenue, item);
    const result = await processChannelSaleInternal(ctx, event);
    if (result.deducted) {
      // Only mark deducted when the ledger row actually landed.
      await ctx.db.patch(item._id, { inventoryDeductedAt: Date.now() });
      deducted++;
    } else {
      skipped++;
    }
  }
  return { itemsProcessed: items.length, deducted, skipped };
}

export const backfillOnePage = internalMutation({
  args: { source: externalSource },
  handler: async (ctx, args) => {
    return await backfillOnePageImpl(ctx, args.source);
  },
});

/**
 * Scheduler-triggered backfill loop. This action is the ceremonial wrapper invoked
 * via `ctx.scheduler.runAfter` from `runChannelBackfill`. It loops internally via
 * `ctx.runMutation(backfillOnePage)` until pages are empty or MAX_ITERATIONS hits.
 *
 * `hitCap` observability: `hitCap: true` means the 500-iteration safety ceiling was
 * reached — inspect the Convex dashboard for the remaining backlog. This field is a
 * dashboard/logs diagnostic; the admin UI (Plan 06) does NOT consume `hitCap`. The UI
 * uses `runOneChannelBackfillPage` directly in a client-loop and observes completion
 * via `itemsProcessed === 0`. Keep `backfillChannelDeductions` as a scheduler-only
 * ceremonial wrapper.
 */
export const backfillChannelDeductions = internalAction({
  args: { source: externalSource, triggeredBy: v.string() },
  handler: async (ctx, args): Promise<{
    totalDeducted: number;
    totalSkipped: number;
    iterations: number;
    hitCap: boolean;
  }> => {
    let totalDeducted = 0;
    let totalSkipped = 0;
    let iterations = 0;
    let hitCap = false;
    while (iterations++ < MAX_ITERATIONS) {
      const result = await ctx.runMutation(
        internal.productInventory.backfill.backfillOnePage,
        { source: args.source },
      );
      totalDeducted += result.deducted;
      totalSkipped += result.skipped;
      if (result.itemsProcessed === 0) break;
      if (iterations === MAX_ITERATIONS) hitCap = true;
    }
    return { totalDeducted, totalSkipped, iterations, hitCap };
  },
});

/**
 * Admin-triggerable per-source backfill. UI dispatches with `source="gobiz"` for
 * the GoFood button (Pitfall 1: GoFood's externalSource is "gobiz", NOT "gofood").
 *
 * Auth: requireRole admin. Returns { scheduled: true } immediately; the action
 * loops asynchronously via scheduler.runAfter(0).
 */
export const runChannelBackfill = mutation({
  args: { source: externalSource, token: v.string() },
  handler: async (ctx, args): Promise<{ scheduled: true }> => {
    const user = await requireRole(ctx, args.token, ["admin"]);
    await ctx.scheduler.runAfter(
      0,
      internal.productInventory.backfill.backfillChannelDeductions,
      { source: args.source, triggeredBy: user.name },
    );
    return { scheduled: true };
  },
});

/**
 * Admin-facing public wrapper for UI-driven iteration (client-loop).
 * Pairs with `useRunChannelBackfill` (Plan 06). The UI calls this in a loop,
 * advancing until `itemsProcessed === 0`, matching the existing
 * `useDirectBackfillPage` pattern on /admin/unlinked-products-backfill.
 *
 * Idempotent; admin-only; flag-independent (D74.5.2-L13). Shares the exact
 * same body as `backfillOnePage` via the `backfillOnePageImpl` helper —
 * no `ctx.runMutation` indirection.
 *
 * GrabFood: returns `{ itemsProcessed: 0, deducted: 0, skipped: 0 }` because
 * the source has no ingested items to backfill (D74.5.2-L15). UI disables the
 * button via `isEmpty` based on the preflight query.
 */
export const runOneChannelBackfillPage = mutation({
  args: { source: externalSource, token: v.string() },
  handler: async (ctx, args): Promise<{
    itemsProcessed: number;
    deducted: number;
    skipped: number;
  }> => {
    await requireRole(ctx, args.token, ["admin"]);
    return await backfillOnePageImpl(ctx, args.source);
  },
});

/**
 * Preflight query for the per-source backfill UI.
 *
 * Returns:
 *  - pendingItems: count of un-deducted items for the source (capped at 5000 —
 *    UI should display "5000+" when the cap is reached)
 *  - blockingAuditIssues: per-source count of open audit issues with severity="block"
 *
 * Per D-17 + Pitfall 4: audit gate is per-source. Shopee blocking issues don't
 * gate K3Mart backfill and vice versa.
 *
 * Auth: requireRole admin (write-adjacent; do not broaden to manager/staff).
 */
export const getChannelBackfillPreflight = query({
  args: { source: externalSource, token: v.string() },
  handler: async (ctx, args): Promise<{
    pendingItems: number;
    blockingAuditIssues: number;
  }> => {
    await requireRole(ctx, args.token, ["admin"]);

    // Count pending items (may be large — cap preflight count at 5000 and display "5000+" in UI).
    // Uses the new by_source_deductedAt index for efficient narrow.
    const PREFLIGHT_CAP = 5000;
    const pending = await ctx.db
      .query("externalRevenueItems")
      .withIndex("by_source_deductedAt", (q) =>
        q.eq("source", args.source).eq("inventoryDeductedAt", undefined))
      .take(PREFLIGHT_CAP);

    // Per D-17 + Pitfall 4: per-source audit gate. Shopee blocking issues don't affect K3Mart.
    const blockingIssues = await ctx.db
      .query("channelAuditIssues")
      .withIndex("by_source_open", (q) =>
        q.eq("source", args.source).eq("resolvedAt", undefined))
      .filter((q) => q.eq(q.field("severity"), "block"))
      .take(1000);

    return {
      pendingItems: pending.length,
      blockingAuditIssues: blockingIssues.length,
    };
  },
});

// ============================================================================
// Test-only direct-handler helpers (D74.5.2-L1 / Plan 01 precedent).
//
// convex-test's `t.mutation(internal.*)` / `t.query(api.*)` resolver fails
// with "Could not find module for: productInventory/backfill" for this
// subtree despite an identical glob + module registration that works for
// sibling tests. The same bug was diagnosed in Plan 01 for channelAudit.ts
// (`_runFullAuditForTest`) and fixed via direct-handler exports.
//
// These helpers replicate the registered handlers verbatim against a single
// ctx. Tests call them via `await t.run(async (ctx) => await _fooForTest(ctx, args))`.
// Production behavior is unchanged — the registered endpoints continue to
// call the same logic they always have.
//
// DO NOT call these from production code. Exported only for test access.
// ============================================================================

// Delegates to backfillOnePageImpl — the shared helper (Plan 06) that both
// registered endpoints already call. Keeping delegation (not duplication) prevents
// the test shim from silently diverging from production logic on future bug fixes.
export const _backfillOnePageForTest = async (
  ctx: MutationCtx,
  args: { source: ExternalSource },
): Promise<{ itemsProcessed: number; deducted: number; skipped: number }> => {
  return backfillOnePageImpl(ctx, args.source);
};

export const _runChannelBackfillForTest = async (
  ctx: MutationCtx,
  args: { source: ExternalSource; token: string },
): Promise<{ scheduled: true }> => {
  // Mirror runChannelBackfill admin-gate. Skips scheduler.runAfter so the test
  // can assert on gating alone (scheduler invocation is covered by Convex itself).
  await requireRole(ctx, args.token, ["admin"]);
  return { scheduled: true };
};

export const _getChannelBackfillPreflightForTest = async (
  ctx: QueryCtx,
  args: { source: ExternalSource; token: string },
): Promise<{ pendingItems: number; blockingAuditIssues: number }> => {
  await requireRole(ctx, args.token, ["admin"]);

  const PREFLIGHT_CAP = 5000;
  const pending = await ctx.db
    .query("externalRevenueItems")
    .withIndex("by_source_deductedAt", (q) =>
      q.eq("source", args.source).eq("inventoryDeductedAt", undefined))
    .take(PREFLIGHT_CAP);

  const blockingIssues = await ctx.db
    .query("channelAuditIssues")
    .withIndex("by_source_open", (q) =>
      q.eq("source", args.source).eq("resolvedAt", undefined))
    .filter((q) => q.eq(q.field("severity"), "block"))
    .take(1000);

  return {
    pendingItems: pending.length,
    blockingAuditIssues: blockingIssues.length,
  };
};
