/**
 * Production Counts Mutations
 *
 * Mutations for managing running production tallies per menu product.
 * Supports resetting counts (single product or all products).
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

/**
 * Reset production counts to zero.
 * If menuProductId is provided, resets only that product's counts.
 * Otherwise, resets all products' counts.
 * Requires manager or admin role.
 */
export const resetCounts = mutation({
  args: {
    token: v.string(),
    menuProductId: v.optional(v.id("menuProducts")),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);

    if (args.menuProductId) {
      // Reset single product
      const count = await ctx.db
        .query("productionCounts")
        .withIndex("by_menu_product", (q) =>
          q.eq("menuProductId", args.menuProductId!)
        )
        .first();

      if (count) {
        await ctx.db.patch(count._id, {
          boxed: 0,
          stickered: 0,
          packed: 0,
          lastResetAt: Date.now(),
          lastResetBy: user.name,
        });
      }
      return { reset: count ? 1 : 0 };
    }

    // Reset all products
    const allCounts = await ctx.db.query("productionCounts").collect();
    for (const count of allCounts) {
      await ctx.db.patch(count._id, {
        boxed: 0,
        stickered: 0,
        packed: 0,
        lastResetAt: Date.now(),
        lastResetBy: user.name,
      });
    }
    return { reset: allCounts.length };
  },
});
