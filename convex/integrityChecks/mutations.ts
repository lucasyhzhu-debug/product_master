import { internalMutation } from "../_generated/server";
import { aggregateForProduct } from "../productionLog/helpers";

/**
 * Weekly integrity check: compares productionCounts archive against
 * productionLog-derived aggregation.
 *
 * After INFRA-03 consolidation, productionCounts is frozen (no longer written to).
 * Mismatches indicate historical discrepancies between the old dual-write data
 * and the log-derived data. This is EXPECTED and informational — the log is now
 * authoritative.
 *
 * Called by crons.ts on a weekly schedule.
 */
export const runWeeklyCheck = internalMutation({
  args: {},
  handler: async (ctx) => {
    // 1. Fetch all productionCounts records (archived table)
    const allCounts = await ctx.db.query("productionCounts").collect();

    // 2. Fetch all productionResets for timestamp filtering
    const resets = await ctx.db.query("productionResets").collect();
    const resetsMap = new Map(
      resets.map((r) => [r.menuProductId as unknown as string, r])
    );

    // 3. Compare each productionCounts record against log aggregation
    const mismatches: Array<{
      menuProductId: string;
      field: string;
      archived: number;
      logDerived: number;
    }> = [];

    for (const counts of allCounts) {
      const resetRecord =
        resetsMap.get(counts.menuProductId as unknown as string) ?? null;

      const logCounts = await aggregateForProduct(
        ctx,
        counts.menuProductId,
        resetRecord
      );

      // Compare boxed
      if (logCounts.boxed !== counts.boxed) {
        mismatches.push({
          menuProductId: counts.menuProductId as unknown as string,
          field: "boxed",
          archived: counts.boxed,
          logDerived: logCounts.boxed,
        });
      }

      // Compare stickered
      if (logCounts.stickered !== counts.stickered) {
        mismatches.push({
          menuProductId: counts.menuProductId as unknown as string,
          field: "stickered",
          archived: counts.stickered,
          logDerived: logCounts.stickered,
        });
      }

      // Compare packed
      if (logCounts.packed !== counts.packed) {
        mismatches.push({
          menuProductId: counts.menuProductId as unknown as string,
          field: "packed",
          archived: counts.packed,
          logDerived: logCounts.packed,
        });
      }
    }

    // 4. Insert result into integrityCheckLogs
    await ctx.db.insert("integrityCheckLogs", {
      timestamp: Date.now(),
      type: "production_counts",
      status: mismatches.length === 0 ? "pass" : "fail",
      mismatchCount: mismatches.length,
      mismatches:
        mismatches.length > 0 ? JSON.stringify(mismatches) : undefined,
    });
  },
});
