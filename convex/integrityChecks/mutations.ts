import { internalMutation } from "../_generated/server";

/**
 * Weekly integrity check placeholder.
 * Inserts a "pass" entry to integrityCheckLogs so crons.ts compiles.
 * Plan 11-03 replaces this with the full implementation.
 */
export const runWeeklyCheck = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ctx.db.insert("integrityCheckLogs", {
      timestamp: Date.now(),
      type: "production_counts",
      status: "pass" as const,
      mismatchCount: 0,
    });
  },
});
