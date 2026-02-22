import { mutation } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { requireRole } from "../lib/auth";

/**
 * Update kitchen configuration (max production target and ball composition).
 * Creates a new config row if none exists, otherwise patches the existing one.
 * Manager/admin only.
 *
 * Phase 21: Also accepts optional defaultPackagingMix for target derivation fallback.
 * The sum validation (bigBall + midBall === max) has been removed — ball targets are
 * independent absolute numbers now, not required to sum to max capacity.
 */
export const updateConfig = mutation({
  args: {
    token: v.string(),
    maxProductionTarget: v.number(),
    bigBallTarget: v.number(),
    midBallTarget: v.number(),
    defaultPackagingMix: v.optional(v.array(v.object({
      menuProductId: v.id("menuProducts"),
      quantity: v.number(),
    }))),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);

    // Validate positive numbers
    if (args.maxProductionTarget <= 0) {
      throw new ConvexError("Max production target must be positive");
    }
    if (args.bigBallTarget < 0 || args.midBallTarget < 0) {
      throw new ConvexError("Ball targets cannot be negative");
    }

    const configData = {
      maxProductionTarget: args.maxProductionTarget,
      bigBallTarget: args.bigBallTarget,
      midBallTarget: args.midBallTarget,
      ...(args.defaultPackagingMix !== undefined && {
        defaultPackagingMix: args.defaultPackagingMix,
      }),
      updatedAt: Date.now(),
      updatedBy: user.name,
    };

    const existing = await ctx.db.query("kitchenConfig").first();

    if (existing) {
      await ctx.db.patch(existing._id, configData);
      return { ...configData, _id: existing._id };
    } else {
      const id = await ctx.db.insert("kitchenConfig", configData);
      return { ...configData, _id: id };
    }
  },
});
