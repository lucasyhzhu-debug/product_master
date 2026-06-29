import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { protectedQuery } from "../lib/functions";
import { deriveCreditPool, computeScheduleTotal, deriveWeekShortfall } from "./creditMath";

export const listSubscriptions = protectedQuery({
  roles: ["manager", "admin"],
  args: { customerId: v.optional(v.id("customers")) },
  handler: async (ctx, args) => {
    if (args.customerId) {
      return await ctx.db
        .query("subscriptions")
        .withIndex("by_customer", (q) => q.eq("customerId", args.customerId!))
        .collect();
    }
    return await ctx.db.query("subscriptions").collect();
  },
});

export const getSubscription = protectedQuery({
  roles: ["manager", "admin"],
  // v.string() + normalizeId: stale/malformed URL id returns null (not crash).
  // Additive return: spread preserves all subscription fields; customerName added
  // for SubscriptionPage breadcrumb (A2). Safe for non-CRM callers — extra field.
  args: { subscriptionId: v.string() },
  handler: async (ctx, args) => {
    const subscriptionId = ctx.db.normalizeId("subscriptions", args.subscriptionId);
    if (!subscriptionId) return null;
    const sub = await ctx.db.get(subscriptionId);
    if (!sub) return null;
    const customer = await ctx.db.get(sub.customerId);
    return { ...sub, customerName: customer?.name ?? null };
  },
});

export const getWeekPool = protectedQuery({
  roles: ["manager", "admin"],
  args: { subscriptionWeekId: v.id("subscriptionWeeks") },
  handler: async (ctx, args) => {
    const week = await ctx.db.get(args.subscriptionWeekId);
    if (!week) return null;
    const entries = await ctx.db
      .query("creditLedger")
      .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", args.subscriptionWeekId))
      .collect();
    return { week, pool: deriveCreditPool(entries.map((e) => ({ type: e.type, amount: e.amount }))), entries };
  },
});

/**
 * getWeekShortfall — projected end-of-week credit position for a (possibly
 * amended) week. Drives the "projected to overrun" flag + "Bill shortfall"
 * offer: when the amended plan's consumption exceeds funded credit, the
 * difference is the top-up the operator can bill in one go (billWeekShortfall).
 *
 * `funded` is true once any credit has been deposited (weekly invoice paid).
 * The overrun offer is only meaningful for a funded week — an unfunded week is
 * already fully covered by its unpaid weekly invoice.
 */
export const getWeekShortfall = protectedQuery({
  roles: ["manager", "admin"],
  args: { subscriptionWeekId: v.id("subscriptionWeeks") },
  handler: async (ctx, args) => {
    const week = await ctx.db.get(args.subscriptionWeekId);
    if (!week) return null;
    const entries = await ctx.db
      .query("creditLedger")
      .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", args.subscriptionWeekId))
      .collect();
    const pool = deriveCreditPool(entries.map((e) => ({ type: e.type, amount: e.amount })));
    const plannedConsumption = computeScheduleTotal(week.plannedDays);
    const { projectedShortfall, projectedEndingPool } = deriveWeekShortfall({
      plannedConsumption,
      creditIssued: pool.creditIssued,
    });
    // A shortfall already billed (unpaid top-up invoice) must not re-offer — the
    // gap closes when that invoice is paid (mirrors billWeekShortfall's guard).
    const pendingTopup = await ctx.db
      .query("invoices")
      .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", args.subscriptionWeekId))
      .filter((q) =>
        q.and(
          q.eq(q.field("invoiceKind"), "subscription_topup"),
          q.neq(q.field("paymentStatus"), "Paid"),
        ),
      )
      .first();
    return {
      plannedConsumption,
      creditIssued: pool.creditIssued,
      creditRemaining: pool.creditRemaining,
      projectedShortfall,
      projectedEndingPool,
      funded: pool.creditIssued > 0,
      hasPendingTopup: Boolean(pendingTopup),
      // Only offer when funded, the plan will overrun, AND nothing's already billed.
      shouldOfferTopup: pool.creditIssued > 0 && projectedShortfall > 0 && !pendingTopup,
    };
  },
});

// ---------------------------------------------------------------------------
// Pure helper — unit-testable, no Convex context required.
// ---------------------------------------------------------------------------

/**
 * Returns true when an order's total exceeds the remaining credit in the week pool.
 * Strict inequality: exact coverage (total === credit) is NOT over-credit.
 */
export function isOverCredit(orderFinalTotal: number, creditRemaining: number): boolean {
  return orderFinalTotal > creditRemaining;
}

// ---------------------------------------------------------------------------
// getOrderCreditStatus — read-only credit-status for a single order.
// Consumed by Task 8 (frontend) to render the out-of-credit flag +
// split / apply-credit buttons.
// ---------------------------------------------------------------------------

export const getOrderCreditStatus = protectedQuery({
  roles: ["manager", "admin"],
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const none = {
      isOverCredit: false,
      creditRemaining: null as number | null,
      orderTotal: 0,
      subscriptionWeekId: null as Id<"subscriptionWeeks"> | null,
      canSplit: false,
      canApplyCredit: false,
    };

    const order = await ctx.db.get(args.orderId);
    if (!order || !order.subscriptionId || !order.subscriptionWeekId) return none;

    const week = await ctx.db.get(order.subscriptionWeekId);
    if (!week) return none;

    const creditRemaining = week.creditRemaining;
    const orderTotal = order.totalAmount; // match the drawdown field (totalAmount), not finalTotal
    const over = isOverCredit(orderTotal, creditRemaining);

    // Load active (non-cancelled) items — mirrors splitScheduledOrderOnCredit's guard.
    const allItems = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();
    const activeItems = allItems.filter((it) => !it.isCancelled);

    // Path A (split): mirrors splitScheduledOrderOnCredit constraints:
    //   - subscription order (subscriptionId + subscriptionWeekId) ✓ (checked above)
    //   - exactly ONE active item
    //   - finalTotal > creditRemaining (over-credit)
    //   - creditRemaining >= 0 (mutation rejects negative-credit weeks)
    const canSplit = over && activeItems.length === 1 && creditRemaining >= 0;

    // Path B (apply credit): mirrors applyPartialCreditToAdHocOrder constraints:
    //   - subscription order ✓ (checked above)
    //   - status === "AwaitingPayment"
    //   - paymentStatus !== "Paid"
    //   - creditRemaining > 0 (mutation no-ops at 0, but surface should suppress button)
    const canApplyCredit =
      order.status === "AwaitingPayment" &&
      order.paymentStatus !== "Paid" &&
      creditRemaining > 0;

    return {
      isOverCredit: over,
      creditRemaining,
      orderTotal,
      subscriptionWeekId: order.subscriptionWeekId,
      canSplit,
      canApplyCredit,
    };
  },
});
