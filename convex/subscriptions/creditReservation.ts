/**
 * Shared reservation-netting helper for subscription credit availability.
 *
 * Extracted from three formerly-duplicated netting loops:
 *   - getSubscriptionCreditContext  (queries.ts)
 *   - createCreditFundedOrder       (creditOrder.ts)
 *   - getCreditOrderWhatsappDraft   (creditOrder.ts)
 */
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { deriveCreditPool } from "./creditMath";

/**
 * Compute the reservation-aware available credit for a subscription week.
 *
 * availableCredit = max(0, pool.creditRemaining − Σ subscriptionCreditApplied)
 * where the sum runs over orders in the week that:
 *   - have subscriptionCreditApplied > 0
 *   - are NOT Cancelled
 *   - have NO by_order creditLedger drawdown row (un-recognized — recognition
 *     posts the actual drawdown at delivery per D5/IMP-4)
 *
 * Recognized orders (with a by_order ledger row) already reduced
 * pool.creditRemaining via their drawdown entry; they must NOT be double-netted.
 *
 * NOTE — call-site timing determines whether the "current" order is included:
 *   - Called BEFORE creating a new order → the new order is not yet in the DB →
 *     its reservation is NOT included in `reserved`. `availableCredit` reflects
 *     what the operator has to spend before placing the order.
 *   - Called AFTER creating a new order (e.g. getCreditOrderWhatsappDraft) → the
 *     order IS in the DB with subscriptionCreditApplied set and no ledger row →
 *     it IS included in `reserved`. `availableCredit` reflects credit left AFTER
 *     this order (the "remaining credit" shown in the WhatsApp summary).
 *
 * @param ctx    QueryCtx or MutationCtx — only db reads are performed
 * @param weekId The subscriptionWeeks row to compute credit for
 */
export async function computeWeekAvailableCredit(
  ctx: QueryCtx | MutationCtx,
  weekId: Id<"subscriptionWeeks">,
): Promise<{ reserved: number; availableCredit: number; creditRemaining: number }> {
  const ledgerEntries = await ctx.db
    .query("creditLedger")
    .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", weekId))
    .collect();
  const pool = deriveCreditPool(
    ledgerEntries.map((e) => ({ type: e.type, amount: e.amount })),
  );

  const weekOrders = await ctx.db
    .query("orders")
    .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", weekId))
    .collect();

  let reserved = 0;
  for (const o of weekOrders) {
    const applied = o.subscriptionCreditApplied ?? 0;
    if (applied <= 0 || o.status === "Cancelled") continue;
    // Recognized = has a by_order drawdown ledger row.
    // Recognized orders already reduced pool.creditRemaining — do NOT double-net.
    const recognized = await ctx.db
      .query("creditLedger")
      .withIndex("by_order", (q) => q.eq("orderId", o._id))
      .first();
    if (!recognized) reserved += applied;
  }

  return {
    reserved,
    creditRemaining: pool.creditRemaining,
    availableCredit: Math.max(0, pool.creditRemaining - reserved),
  };
}
