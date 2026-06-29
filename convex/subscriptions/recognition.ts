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
import { deriveCreditPool } from "./creditMath";

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

  // IMP-5 — funded-pool invariant (warn, do NOT guard-drop).
  // -------------------------------------------------------------------------
  // INVARIANT: funding (markWeeklyInvoicePaid → `topup`) must precede delivery
  // (this `drawdown`). The normal cycle funds on Monday, then delivers mid-week,
  // so the pool is always positive at recognition time. A delivery against an
  // UNFUNDED pool (no `topup` yet) drives the pool negative and recognizes revenue
  // for cash not received — an operational anomaly worth surfacing.
  //
  // We WARN rather than guard-and-skip on purpose: recognition fires on a single
  // edge (BeingPrepared→AwaitingDelivery / packaging / force-complete) and there is
  // NO guaranteed retry. If we returned-without-posting here, a sale delivered
  // before funding would be SILENTLY LOST whenever funding arrives after delivery
  // and the order never re-enters that edge. Dropping a recognition is worse than
  // surfacing a transient negative pool that self-corrects when the topup lands
  // (the pool is replayed from the full ledger on every postLedgerEntry). So we
  // always post the drawdown and log a console.warn for operator reconciliation.
  const drawdownAmount = order.subscriptionCreditApplied ?? order.totalAmount;

  const priorEntries = await ctx.db
    .query("creditLedger")
    .withIndex("by_subscriptionWeek", (q) =>
      q.eq("subscriptionWeekId", order.subscriptionWeekId!),
    )
    .collect();
  const priorPool = deriveCreditPool(
    priorEntries.map((e) => ({ type: e.type, amount: e.amount })),
  );
  const hasFunding = priorEntries.some((e) => e.type === "topup");
  if (!hasFunding || priorPool.creditRemaining < drawdownAmount) {
    console.warn(
      `[recognizeSubscriptionDelivery] recognizing ${order.orderNumber} against an ` +
        `under-funded credit pool (week ${order.subscriptionWeekId}): ` +
        `funded=${hasFunding}, remaining=${priorPool.creditRemaining}, ` +
        `drawdown=${drawdownAmount}. Pool will go negative until funded — ` +
        `expected funding (markWeeklyInvoicePaid) precedes delivery. Reconcile.`,
    );
  }

  // 1. Drawdown the prepaid credit pool — consumes the deferred-revenue liability.
  await postLedgerEntry(ctx, {
    subscriptionId: order.subscriptionId,
    subscriptionWeekId: order.subscriptionWeekId,
    type: "drawdown",
    amount: -drawdownAmount,
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

/**
 * Single delivery-recognition entry point (Phase D Slice 0, R1). All order
 * status mutations that reach "delivered" call THIS, not recognizeSubscriptionDelivery
 * directly, so the recognition trigger has one home. actingUserId is OPTIONAL:
 * the 3 status mutations pass their acting user; completeOrder/completePackaging
 * (plain mutations with no token in scope) pass undefined → recognizeSubscriptionDelivery
 * falls back to order.createdByUserId, exactly as before. Behavior-preserving.
 */
export async function recognizeOnDelivery(
  ctx: MutationCtx,
  orderId: Id<"orders">,
  actingUserId?: Id<"users">,
): Promise<void> {
  await recognizeSubscriptionDelivery(ctx, orderId, actingUserId);
}
