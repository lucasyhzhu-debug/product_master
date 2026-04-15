import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal, api } from "../_generated/api";

/**
 * Phase 79 Plan 07 (DA-13): Re-check bigsellerOrders that currently have an
 * empty `skuVoList` by computing the date span of those rows and triggering
 * a fresh BigSeller sync over that range. The preserve-non-empty guard in
 * `upsertOrders` ensures known SKUs are not wiped during the re-sync.
 *
 * Sync runs asynchronously via the existing scheduler chain (startSync →
 * triggerSync → pollSyncTask → fetchOrders). Once `bigsellerSyncState`
 * reaches `complete`, the UI can auto-invoke `backfillBigsellerItems` to
 * materialise items for any newly-populated rows.
 *
 * Action (not mutation) because it chains a Node-runtime sync via
 * `startSync`. Auth via internal-query wrapper since actions cannot touch
 * ctx.db directly.
 */
export const rescanEmptyRows = action({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    // Auth gate — internalQuery wrapper around requireRole.
    await ctx.runQuery(internal.bigsellerOrders.queries.requireAdminByToken, {
      token: args.token,
    });

    const emptyOrders: Array<{ orderTimeMs: number }> = await ctx.runQuery(
      internal.bigsellerOrders.queries.listEmptyRows,
      {}
    );
    if (emptyOrders.length === 0) {
      return {
        success: true as const,
        triggered: false as const,
        emptyOrderCount: 0,
        startDate: null,
        endDate: null,
      };
    }

    // Compute YYYY-MM-DD span across all empty rows (single sync call).
    const dates = emptyOrders.map((o) =>
      new Date(o.orderTimeMs).toISOString().slice(0, 10)
    );
    const startDate = dates.reduce((a, b) => (a < b ? a : b));
    const endDate = dates.reduce((a, b) => (a > b ? a : b));

    // Trigger a fresh sync over the empty-row date span. The scheduler-chain
    // pattern means this returns immediately; the UI watches sync state and
    // calls `backfillBigsellerItems` once the sync completes.
    const result: { success: boolean; error?: string } = await ctx.runAction(
      api.integrations.bigseller.sync.startSync,
      { token: args.token, startDate, endDate }
    );

    if (!result.success) {
      return {
        success: false as const,
        triggered: false as const,
        emptyOrderCount: emptyOrders.length,
        startDate,
        endDate,
        error: result.error ?? "Failed to trigger BigSeller sync",
      };
    }

    return {
      success: true as const,
      triggered: true as const,
      emptyOrderCount: emptyOrders.length,
      startDate,
      endDate,
    };
  },
});
