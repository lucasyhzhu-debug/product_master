/**
 * Backfill consignment recognition date to periodEnd.
 *
 * Context: consignment revenue was historically bucketed on periodStart because
 * externalRevenue.transactionDate was never populated for consignment rows.
 * We now recognize consignment revenue on the consignment period-end date
 * (cash-basis proxy until a payment-date picker ships).
 *
 * This migration:
 * 1. Collapses every consignment externalRevenue row's periodStart/periodEnd/
 *    transactionDate to the source settlement's periodEnd.
 * 2. For paid settlements whose paidAt differs from periodEnd, overwrites paidAt
 *    to match periodEnd so the settlement card timestamp reflects the same
 *    recognition date the charts now use.
 */

import { internalMutation, internalQuery } from "../_generated/server";

/**
 * Dry-run: list what the backfill would change without mutating anything.
 */
export const inspectConsignmentRecognition = internalQuery({
  args: {},
  handler: async (ctx) => {
    const settlements = await ctx.db.query("consignmentSettlements").collect();

    const settlementsToUpdatePaidAt: Array<{
      id: string;
      outletId: string;
      periodStart: number;
      periodEnd: number;
      paidAt: number;
    }> = [];

    const revenueToCollapse: Array<{
      id: string;
      settlementId: string;
      currentPeriodStart: number;
      currentPeriodEnd: number;
      currentTransactionDate: number | undefined;
      targetEnd: number;
    }> = [];

    for (const s of settlements) {
      if (s.status === "paid" && s.paidAt !== undefined && s.paidAt !== s.periodEnd) {
        settlementsToUpdatePaidAt.push({
          id: s._id,
          outletId: s.outletId,
          periodStart: s.periodStart,
          periodEnd: s.periodEnd,
          paidAt: s.paidAt,
        });
      }

      if (!s.linkedRevenueId) continue;
      const rev = await ctx.db.get(s.linkedRevenueId);
      if (!rev) continue;

      const needsCollapse =
        rev.periodStart !== s.periodEnd ||
        rev.periodEnd !== s.periodEnd ||
        rev.transactionDate !== s.periodEnd;

      if (needsCollapse) {
        revenueToCollapse.push({
          id: rev._id,
          settlementId: s._id,
          currentPeriodStart: rev.periodStart,
          currentPeriodEnd: rev.periodEnd,
          currentTransactionDate: rev.transactionDate,
          targetEnd: s.periodEnd,
        });
      }
    }

    return {
      totalSettlements: settlements.length,
      paidAtFixCount: settlementsToUpdatePaidAt.length,
      revenueCollapseCount: revenueToCollapse.length,
      settlementsToUpdatePaidAt,
      revenueToCollapse,
    };
  },
});

/**
 * Apply the backfill. Idempotent — safe to re-run.
 */
export const backfillConsignmentRecognition = internalMutation({
  args: {},
  handler: async (ctx) => {
    const settlements = await ctx.db.query("consignmentSettlements").collect();

    let paidAtUpdates = 0;
    let revenueCollapses = 0;

    for (const s of settlements) {
      if (s.status === "paid" && s.paidAt !== undefined && s.paidAt !== s.periodEnd) {
        await ctx.db.patch(s._id, { paidAt: s.periodEnd });
        paidAtUpdates += 1;
      }

      if (!s.linkedRevenueId) continue;
      const rev = await ctx.db.get(s.linkedRevenueId);
      if (!rev) continue;

      if (
        rev.periodStart === s.periodEnd &&
        rev.periodEnd === s.periodEnd &&
        rev.transactionDate === s.periodEnd
      ) {
        continue;
      }

      await ctx.db.patch(s.linkedRevenueId, {
        periodStart: s.periodEnd,
        periodEnd: s.periodEnd,
        transactionDate: s.periodEnd,
      });
      revenueCollapses += 1;
    }

    return { paidAtUpdates, revenueCollapses };
  },
});
