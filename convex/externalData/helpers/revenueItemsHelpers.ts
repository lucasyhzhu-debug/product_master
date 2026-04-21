/**
 * externalRevenueItems helpers.
 *
 * Pure + ctx-dependent helpers for querying the externalRevenueItems table.
 * Used by:
 *   - backfillInternalRevenueItemsPageImpl (skip parents with existing children)
 *   - syncInternalOrders adapter (self-heal guard — via the wrapper query
 *     hasExternalRevenueItemsQuery in queries.ts, since actions cannot call
 *     helpers directly)
 *
 * Pattern reference: externalData/queries.ts:67-83 (getLatestSnapshotBatch)
 * uses `.first()` for existence checks — this file mirrors that idiom.
 */

import type { QueryCtx, MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";

/**
 * Returns true iff at least one externalRevenueItems row exists for the given
 * revenueId. Uses the by_revenue index for O(log n) lookup via `.first()`.
 */
export async function hasExternalRevenueItems(
  ctx: QueryCtx | MutationCtx,
  revenueId: Id<"externalRevenue">,
): Promise<boolean> {
  const first = await ctx.db
    .query("externalRevenueItems")
    .withIndex("by_revenue", (q) => q.eq("revenueId", revenueId))
    .first();
  return first !== null;
}
