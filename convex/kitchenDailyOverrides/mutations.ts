import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

/**
 * Upsert a per-day kitchen production target override.
 * Takes precedence over dispatch plan and default config in the priority chain.
 *
 * All override fields are optional — a partial override is valid.
 * e.g., only override bigBall, let midBall fall through to plan/defaults.
 *
 * Manager/admin only.
 */
export const setDailyOverride = mutation({
  args: {
    token: v.string(),
    date: v.string(), // YYYY-MM-DD
    bigBallOverride: v.optional(v.number()),
    midBallOverride: v.optional(v.number()),
    packagingOverrides: v.optional(v.array(v.object({
      menuProductId: v.id("menuProducts"),
      quantity: v.number(),
    }))),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);

    const overrideData = {
      date: args.date,
      bigBallOverride: args.bigBallOverride,
      midBallOverride: args.midBallOverride,
      packagingOverrides: args.packagingOverrides,
      setAt: Date.now(),
      setBy: user.name,
    };

    // Upsert: if override exists for date, patch; otherwise insert
    const existing = await ctx.db
      .query("kitchenDailyOverrides")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, overrideData);
      return { _id: existing._id, ...overrideData };
    } else {
      const id = await ctx.db.insert("kitchenDailyOverrides", overrideData);
      return { _id: id, ...overrideData };
    }
  },
});

/**
 * Delete the per-day production target override for a given date.
 * After clearing, the date falls through to dispatch plan then defaults.
 *
 * Manager/admin only.
 */
export const clearDailyOverride = mutation({
  args: {
    token: v.string(),
    date: v.string(), // YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);

    const existing = await ctx.db
      .query("kitchenDailyOverrides")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { deleted: true, date: args.date };
    }

    return { deleted: false, date: args.date };
  },
});
