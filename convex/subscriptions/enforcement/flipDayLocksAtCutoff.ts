import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { isPastCutoff } from "./cutoffMath";
import { DAY_MS } from "./effectiveDates";

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

    // 14-day weekStart lower bound: safely covers the current week (weekStart up
    // to ~6 days back) plus margin. Days needing a lock have dates ~today/future
    // whose week falls in this window; re-locking already-locked older weeks was a
    // no-op, so correctness is unchanged while the scan stays bounded over calendar
    // time (no longer +52 rows/sub/year).
    const weekStartFloor = now - 14 * DAY_MS;

    await Promise.all(
      [...active, ...terminating].map(async (sub) => {
        const weeks = await ctx.db
          .query("subscriptionWeeks")
          .withIndex("by_subscription_weekStart", (q) =>
            q.eq("subscriptionId", sub._id).gte("weekStart", weekStartFloor),
          )
          .collect();

        for (const week of weeks) {
          // Belt-and-suspenders: a 14-day window can still include a freshly-
          // reconciled week — skip terminal weeks.
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
      }),
    );
  },
});
