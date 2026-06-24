/**
 * Subscription revenue recognition at delivery (Task B9, Step 3b).
 *
 * SALES event: when a subscription order physically goes out (transitions to
 * AwaitingDelivery — see "Why AwaitingDelivery" below), we recognize the sale:
 *   1. Post the per-order `drawdown` (amount = -order.totalAmount) against the
 *      prepaid credit pool — this consumes the deferred-revenue liability.
 *   2. Recognize B2B Wholesale revenue for the P&L (bucketed on the customer's
 *      customerType). ⚠ See "P&L revenue seam" — currently a TODO, not wired,
 *      because the income statement has no revenue-from-journal path.
 *
 * Idempotent: fires exactly once per order (guard via creditLedger.by_order).
 *
 * "Why AwaitingDelivery, not Complete": FORWARD_TRANSITIONS is
 * BeingPrepared → AwaitingDelivery → Complete. `AwaitingDelivery` is the status
 * ops sets when the order physically leaves (out for delivery, replaces the old
 * WaitingShipment/WaitingPickup). For a cafe subscription the sale is realized
 * when the day's order is dispatched by deliverByTime, which is the
 * BeingPrepared→AwaitingDelivery edge. `Complete` is the later confirmation that
 * it arrived; recognizing there would lag the realized sale by a hand-off step.
 * The drawdown/revenue must NOT fire at funding (Monday) — only at delivery.
 */

import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { postLedgerEntry } from "./ledger";

/**
 * Recognize a subscription order's sale at delivery. No-op for non-subscription
 * orders and idempotent for already-recognized orders.
 *
 * @param createdBy the user driving the status change (status mutations resolve
 *   this from the session token; pass undefined to fall back to the order's
 *   createdByUserId so the ledger entry always has an author).
 */
export async function recognizeSubscriptionDelivery(
  ctx: MutationCtx,
  orderId: Id<"orders">,
  createdBy?: Id<"users">,
): Promise<void> {
  const order = await ctx.db.get(orderId);
  if (!order?.subscriptionId || !order.subscriptionWeekId) return; // not a subscription order

  // Idempotent — recognize the sale once per order.
  const already = await ctx.db
    .query("creditLedger")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .first();
  if (already) return;

  // Resolve an author for the append-only ledger entry. Prefer the acting user;
  // fall back to the order's creator so the entry is never authorless.
  const author = createdBy ?? order.createdByUserId;
  if (!author) return; // cannot post an authorless ledger entry; skip defensively

  // 1. Drawdown the prepaid credit pool — consumes the deferred-revenue liability.
  await postLedgerEntry(ctx, {
    subscriptionId: order.subscriptionId,
    subscriptionWeekId: order.subscriptionWeekId,
    type: "drawdown",
    amount: -order.totalAmount,
    createdBy: author,
    orderId,
    note: `Sale recognized on delivery ${order.orderNumber}`,
  });

  // 2. P&L revenue seam — B2B Wholesale revenue recognition.
  // -------------------------------------------------------------------------
  // RESOLVED (Task B9b): the drawdown row written above IS the system-of-record for
  // recognized B2B Wholesale revenue, and the income statement now surfaces it in the
  // gross-revenue TOTAL as its own distinct "B2B Wholesale" source. No extra write here:
  //
  //   convex/reports/incomeStatement.ts → fetchAndAggregate reads creditLedger
  //   `drawdown` rows, resolves order → customer, and (for customerType ===
  //   "b2b_wholesale") attributes Math.abs(amount) to the period by the order's
  //   deliveryDate, feeding it into totalGross/netRevenue via aggregateWeek's
  //   B2B_WHOLESALE_SOURCE channel (sumB2BWholesaleInPeriod).
  //
  // C1 holds: this revenue lives ONLY in the P&L total, never in externalRevenue /
  // per-channel dashboards / getDailySalesSummary (subscription orders are excluded
  // there via isSubscriptionOrder — convex/subscriptions/revenueGate.ts). The drawdown
  // is the single recognition path, so there is no double-count.
}
