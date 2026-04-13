/**
 * Backfill consignment recognition date on linked externalRevenue rows.
 *
 * Run from the Convex dashboard Functions tab:
 *   migrations:consignmentRecognitionDate:inspectConsignmentRecognition  (dry-run)
 *   migrations:consignmentRecognitionDate:backfillConsignmentRecognition (apply)
 *
 * Context: consignment revenue was historically bucketed on periodStart because
 * externalRevenue.transactionDate was never populated for consignment rows, and
 * periodStart/periodEnd were stored as the original consignment span. We now
 * recognize consignment revenue on the cash-receipt date (paidAt for paid
 * settlements, periodEnd for pending) and collapse all three period fields on
 * externalRevenue to that single date so the by_period index keeps working.
 *
 * This migration:
 * 1. For each consignment settlement, target = settlement.paidAt ?? settlement.periodEnd.
 * 2. If linked externalRevenue.{periodStart, periodEnd, transactionDate} differ
 *    from target, patch all three to target.
 * 3. Skips rows already in the target shape — re-running is a no-op.
 *
 * NB: this migration deliberately does NOT modify consignmentSettlements.paidAt.
 * Existing user-captured paidAt values (entered via the SettlementTimeline date
 * picker) carry the real cash-receipt date and must be preserved.
 */

import { internalMutation, internalQuery } from "../_generated/server";

/**
 * Dry-run: list externalRevenue rows the backfill would patch and the target dates,
 * without mutating anything.
 */
export const inspectConsignmentRecognition = internalQuery({
  args: {},
  handler: async (ctx) => {
    const settlements = await ctx.db.query("consignmentSettlements").collect();

    const revenueToPatch: Array<{
      settlementId: string;
      revenueId: string;
      status: "pending" | "paid";
      currentPeriodStart: number;
      currentPeriodEnd: number;
      currentTransactionDate: number | undefined;
      target: number;
      targetSource: "paidAt" | "periodEnd";
    }> = [];

    const orphanedPaidSettlements: Array<{ id: string; paidAt: number | undefined }> = [];

    for (const s of settlements) {
      const target = s.paidAt ?? s.periodEnd;
      const targetSource: "paidAt" | "periodEnd" = s.paidAt !== undefined ? "paidAt" : "periodEnd";

      if (!s.linkedRevenueId) {
        if (s.status === "paid") orphanedPaidSettlements.push({ id: s._id, paidAt: s.paidAt });
        continue;
      }

      const rev = await ctx.db.get(s.linkedRevenueId);
      if (!rev) continue;

      if (
        rev.periodStart === target &&
        rev.periodEnd === target &&
        rev.transactionDate === target
      ) {
        continue;
      }

      revenueToPatch.push({
        settlementId: s._id,
        revenueId: rev._id,
        status: s.status,
        currentPeriodStart: rev.periodStart,
        currentPeriodEnd: rev.periodEnd,
        currentTransactionDate: rev.transactionDate,
        target,
        targetSource,
      });
    }

    return {
      totalSettlements: settlements.length,
      revenueToPatchCount: revenueToPatch.length,
      orphanedPaidSettlementCount: orphanedPaidSettlements.length,
      revenueToPatch,
      orphanedPaidSettlements,
    };
  },
});

/**
 * Apply the backfill. Idempotent — skipping rows already in the target shape means
 * re-running is a no-op. Returns counts of patched rows + their IDs for audit.
 */
export const backfillConsignmentRecognition = internalMutation({
  args: {},
  handler: async (ctx) => {
    const settlements = await ctx.db.query("consignmentSettlements").collect();

    let patched = 0;
    const patchedIds: string[] = [];

    for (const s of settlements) {
      if (!s.linkedRevenueId) continue;

      const rev = await ctx.db.get(s.linkedRevenueId);
      if (!rev) continue;

      const target = s.paidAt ?? s.periodEnd;

      if (
        rev.periodStart === target &&
        rev.periodEnd === target &&
        rev.transactionDate === target
      ) {
        continue;
      }

      await ctx.db.patch(s.linkedRevenueId, {
        periodStart: target,
        periodEnd: target,
        transactionDate: target,
      });
      patched += 1;
      patchedIds.push(s.linkedRevenueId);
    }

    return { patched, patchedIds };
  },
});
