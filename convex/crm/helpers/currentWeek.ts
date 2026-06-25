import { QueryCtx } from "../../_generated/server";
import { Doc, Id } from "../../_generated/dataModel";

/**
 * Returns the latest `subscriptionWeeks` row whose `weekStart` is ≤ `now`,
 * i.e. the week that is currently in progress (or most recently completed).
 * Returns `null` if no week has started yet.
 *
 * Uses the `by_subscription_weekStart` compound index — O(log n), no full-scan.
 */
export async function resolveCurrentWeek(
  ctx: QueryCtx,
  subscriptionId: Id<"subscriptions">,
  now: number = Date.now(),
): Promise<Doc<"subscriptionWeeks"> | null> {
  return await ctx.db
    .query("subscriptionWeeks")
    .withIndex("by_subscription_weekStart", (q) =>
      q.eq("subscriptionId", subscriptionId).lte("weekStart", now),
    )
    .order("desc")
    .first();
}
