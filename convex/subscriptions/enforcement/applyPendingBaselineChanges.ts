import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";

/** Daily cron (04:10 UTC). Applies any pendingBaselineChange whose effectiveDate
 *  has arrived; clears the pending field. Idempotent. Bounded full-scan (small table). */
export const applyPendingBaselineChanges = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const subs = await ctx.db.query("subscriptions").collect();
    for (const sub of subs) {
      const pending = sub.pendingBaselineChange;
      if (pending && pending.effectiveDate <= now) {
        await ctx.db.patch(sub._id, {
          baselineDailyQty: pending.newQty,
          pendingBaselineChange: undefined,
        });
      }
    }
  },
});
