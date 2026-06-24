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
  // TODO(B-followup): recognize B2B Wholesale sales revenue in the income
  // statement at this point, bucketed on the CUSTOMER'S customerType
  // ("b2b_wholesale"), kept OUT of externalRevenue/per-channel analytics (C1).
  //
  // INVESTIGATION (Task B9): the income statement
  // (convex/reports/incomeStatement.ts → fetchAndAggregate/aggregateWeek)
  // derives ALL revenue (totalGross/netRevenue) EXCLUSIVELY from `externalRevenue`
  // records + `consignmentSettlements`. Its journal-line aggregation
  // (aggregateJournalLines via journalHelpers.ts) targets ONLY `type:"opex"` and
  // `type:"other"` account sets — it feeds OpEx and Other Income/Expense (below
  // gross profit). There is NO revenue-from-journal path: a journal entry posted
  // to a revenue account would be silently ignored by the P&L total.
  //
  // Therefore neither available mechanism cleanly recognizes this revenue in the
  // P&L total without a new seam:
  //   (a) write an `externalRevenue` row — violates C1 (subscription orders are
  //       deliberately excluded from externalRevenue / per-channel dashboards), and
  //   (b) post a GL/journal revenue line — would not surface in totalGross at all.
  //
  // DECISION NEEDED (do NOT fabricate a GL API here): the income statement must
  // grow an explicit "B2B Wholesale" revenue source that reads recognized
  // subscription drawdowns (this ledger) bucketed by customers.customerType, OR a
  // dedicated wholesale-revenue table the P&L aggregates alongside externalRevenue.
  // Until that lands, the drawdown above is the system-of-record for the recognized
  // amount and customers.customerType carries the B2B classification; the figure is
  // simply not yet rolled into the income-statement total.
}
