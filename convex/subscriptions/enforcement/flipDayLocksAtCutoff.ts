import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { isPastCutoff } from "./cutoffMath";

/** Daily cron (05:25 UTC). Sets locked=true on every not-yet-locked planned day
 *  whose change-cutoff has passed, for active and terminating subscriptions.
 *  Metadata-only, idempotent. */
export const flipDayLocksAtCutoff = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();

    const active = await ctx.db
      .query("subscriptions")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    const terminating = await ctx.db
      .query("subscriptions")
      .withIndex("by_status", (q) => q.eq("status", "terminating"))
      .collect();

    for (const sub of [...active, ...terminating]) {
      const weeks = await ctx.db
        .query("subscriptionWeeks")
        .withIndex("by_subscription_weekStart", (q) => q.eq("subscriptionId", sub._id))
        .collect();

      for (const week of weeks) {
        if (week.status === "reconciled" || week.status === "closed") continue;

        let changed = false;
        const plannedDays = week.plannedDays.map((d) => {
          if (
            !d.locked &&
            isPastCutoff(d.date, sub.changeCutoffDayOffset, sub.changeCutoffHour, now)
          ) {
            changed = true;
            return { ...d, locked: true };
          }
          return d;
        });

        if (changed) await ctx.db.patch(week._id, { plannedDays });
      }
    }
  },
});
