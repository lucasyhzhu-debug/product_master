import { mutation } from "../_generated/server";
import { ConvexError, v } from "convex/values";
import { requireRole } from "../lib/auth";

/**
 * Update kitchen configuration (max production target and ball composition).
 * Creates a new config row if none exists, otherwise patches the existing one.
 * Manager/admin only.
 */
export const updateConfig = mutation({
  args: {
    token: v.string(),
    maxProductionTarget: v.number(),
    bigBallTarget: v.number(),
    midBallTarget: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);

    // Validate composition adds up
    if (args.bigBallTarget + args.midBallTarget !== args.maxProductionTarget) {
      throw new ConvexError(
        `Ball targets must add up to max production target: ${args.bigBallTarget} + ${args.midBallTarget} !== ${args.maxProductionTarget}`
      );
    }

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
