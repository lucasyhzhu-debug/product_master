import { query } from "../_generated/server";

/**
 * Kitchen configuration defaults.
 * Used when no config row exists yet (first-time setup).
 */
const DEFAULTS = {
  maxProductionTarget: 200,
  bigBallTarget: 0,
  midBallTarget: 200,
} as const;

/**
 * Get the current kitchen configuration.
 * Returns defaults if no config row exists yet.
 * No auth required -- kitchen staff need to read this.
 */
export const getConfig = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db.query("kitchenConfig").first();

    if (!config) {
      return {
        _id: null,
        maxProductionTarget: DEFAULTS.maxProductionTarget,
        bigBallTarget: DEFAULTS.bigBallTarget,
        midBallTarget: DEFAULTS.midBallTarget,
        updatedAt: null,
        updatedBy: null,
      };
    }

    return {
      _id: config._id,
      maxProductionTarget: config.maxProductionTarget,
      bigBallTarget: config.bigBallTarget,
      midBallTarget: config.midBallTarget,
      updatedAt: config.updatedAt,
      updatedBy: config.updatedBy,
    };
  },
});
