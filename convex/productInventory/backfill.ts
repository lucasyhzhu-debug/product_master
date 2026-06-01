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
import { buildEventFromRow, processChannelSaleInternal, type ChannelSaleResult } from "./channelSale";
import { CHANNEL_ROUTING_NOT_CONFIGURED } from "./channelRouting";

const BATCH_SIZE = 200; // D-16: 200-item chunks per page
const MAX_ITERATIONS = 500; // 500 × 200 = 100K items hard cap — safety against runaway loops

/**
 * Result of processing a single backfill page.
 *
 * `itemsProcessed` counts items we *evaluated* this page (unmapped, unroutable,
 * no-revenue, or deducted) — it does NOT count items skipped because they were
 * already deducted (those are walked past silently by the cursor). So a re-run
 * over a fully-backfilled source reports `itemsProcessed: 0` even though it pages
 * through every row.
 *
 * `continueCursor`/`isDone`: pagination over the stable `by_source` index. The
 * caller loops while `!isDone`, passing `continueCursor` back in. We paginate a
 * key we never mutate (`source`) rather than the `inventoryDeductedAt` filter,
 * so patching deducted rows mid-walk cannot shift the window or strand routable
 * rows behind a block of skipped ones (the bug that made the take()-based loop
 * abort/stall). Mirrors `backfillInternalRevenueItemsPageImpl` (PATTERNS.md §3).
 *
 * `unroutable`: items whose `processChannelSaleInternal` threw
 * `CHANNEL_ROUTING_NOT_CONFIGURED` — surfaced distinctly so the operator knows
 * how many rows need a routing rule (vs. unmapped-SKU skips).
 */
export interface ChannelBackfillPageResult {
  itemsProcessed: number;
  deducted: number;
  skipped: number;
  unroutable: number;
  continueCursor: string | null;
  isDone: boolean;
}

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
  cursor: string | null = null,
): Promise<ChannelBackfillPageResult> {
  // Paginate the STABLE `by_source` index (source is never mutated) rather than
  // the `by_source_deductedAt` filter. Patching `inventoryDeductedAt` on success
  // would shift a deductedAt-filtered window, so an un-routable/unmapped item that
  // stays un-patched would sit at the front of every page forever — one such item
  // either aborted the whole page (uncaught throw) or stalled the loop. Walking the
  // stable index by cursor visits every row exactly once and always advances.
  const page = await ctx.db
    .query("externalRevenueItems")
    .withIndex("by_source", (q) => q.eq("source", source))
    .paginate({ cursor, numItems: BATCH_SIZE });

  let itemsProcessed = 0;
  let deducted = 0;
  let skipped = 0;
  let unroutable = 0;

  for (const item of page.page) {
    // Already deducted — walk past silently (D-19 idempotency). Not counted in
    // itemsProcessed so a re-run over a finished source reports 0 work.
    if (item.inventoryDeductedAt !== undefined) continue;

    itemsProcessed++;

    // Pitfall 3 / D74.5.2-L4 silent-drop: unmapped items stay un-patched so they
    // can be re-processed once admin maps the SKU; patching here would orphan them.
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

    try {
      const result: ChannelSaleResult = await processChannelSaleInternal(ctx, event);
      if (result.deducted) {
        // Only mark deducted when the ledger row actually landed.
        await ctx.db.patch(item._id, { inventoryDeductedAt: Date.now() });
        deducted++;
      } else {
        skipped++;
      }
    } catch (err) {
      // CHANNEL_ROUTING_NOT_CONFIGURED throws at resolveChannelRoute — the FIRST
      // step, BEFORE any ledger insert — so skipping leaves no partial write and
      // the row stays un-patched (heals once a routing rule is added). One un-routable
      // row must NOT abort the whole page (the original bug). Re-throw anything else:
      // an error mid-deduction may have left partial inserts, so the page must roll back.
      if (err instanceof Error && err.message.startsWith(CHANNEL_ROUTING_NOT_CONFIGURED)) {
        unroutable++;
        continue;
      }
      throw err;
    }
  }

  return {
    itemsProcessed,
    deducted,
    skipped,
    unroutable,
    continueCursor: page.isDone ? null : page.continueCursor,
    isDone: page.isDone,
  };
}

export const backfillOnePage = internalMutation({
  args: { source: externalSource, cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    return await backfillOnePageImpl(ctx, args.source, args.cursor ?? null);
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
    totalUnroutable: number;
    iterations: number;
    hitCap: boolean;
  }> => {
    let totalDeducted = 0;
    let totalSkipped = 0;
    let totalUnroutable = 0;
    let iterations = 0;
    let hitCap = false;
    let cursor: string | null = null;
    // Terminate on isDone (the cursor walked the whole source), NOT on
    // itemsProcessed===0 — un-routable/unmapped rows leave itemsProcessed>0
    // indefinitely, and a fully-deducted page reports itemsProcessed===0 mid-walk.
    while (iterations++ < MAX_ITERATIONS) {
      // Explicit annotation breaks the same-module circular type inference
      // (action return type → ctx.runMutation → backfillOnePage return type).
      const result: ChannelBackfillPageResult = await ctx.runMutation(
        internal.productInventory.backfill.backfillOnePage,
        { source: args.source, cursor },
      );
      totalDeducted += result.deducted;
      totalSkipped += result.skipped;
      totalUnroutable += result.unroutable;
      cursor = result.continueCursor;
      if (result.isDone) break;
      if (iterations === MAX_ITERATIONS) hitCap = true;
    }
    return { totalDeducted, totalSkipped, totalUnroutable, iterations, hitCap };
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
  args: {
    source: externalSource,
    token: v.string(),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args): Promise<ChannelBackfillPageResult> => {
    await requireRole(ctx, args.token, ["admin"]);
    return await backfillOnePageImpl(ctx, args.source, args.cursor ?? null);
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
  args: { source: ExternalSource; cursor?: string | null },
): Promise<ChannelBackfillPageResult> => {
  return backfillOnePageImpl(ctx, args.source, args.cursor ?? null);
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
