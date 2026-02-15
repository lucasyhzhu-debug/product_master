/**
 * Production Counts Mutations
 *
 * INFRA-03: resetCounts now writes to productionResets table instead of
 * zeroing productionCounts records. The productionCounts table is now
 * a read-only archive — all production data derives from productionLog.
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

/**
 * Reset production counts by inserting/updating productionResets timestamps.
 * The aggregation queries in productionLog/queries.ts filter log entries
 * by these reset timestamps, effectively "zeroing" the counts.
 *
 * If menuProductId is provided, resets only that product.
 * Otherwise, resets all active products.
 * Requires manager or admin role.
 */
export const resetCounts = mutation({
  args: {
    token: v.string(),
    menuProductId: v.optional(v.id("menuProducts")),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);
    const now = Date.now();

    if (args.menuProductId) {
      // Reset single product — upsert productionResets record
      const existing = await ctx.db
        .query("productionResets")
        .withIndex("by_menu_product", (q) =>
          q.eq("menuProductId", args.menuProductId!)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          lastResetAt: now,
          lastResetBy: user.name,
        });
      } else {
        await ctx.db.insert("productionResets", {
          menuProductId: args.menuProductId!,
          lastResetAt: now,
          lastResetBy: user.name,
        });
      }

      return { reset: 1 };
    }

    // Reset all active products — upsert productionResets for each
    const menuProducts = await ctx.db
      .query("menuProducts")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    for (const mp of menuProducts) {
      const existing = await ctx.db
        .query("productionResets")
        .withIndex("by_menu_product", (q) =>
          q.eq("menuProductId", mp._id)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          lastResetAt: now,
          lastResetBy: user.name,
        });
      } else {
        await ctx.db.insert("productionResets", {
          menuProductId: mp._id,
          lastResetAt: now,
          lastResetBy: user.name,
        });
      }
    }

    return { reset: menuProducts.length };
  },
});
