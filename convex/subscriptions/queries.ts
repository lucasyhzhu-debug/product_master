import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { protectedQuery } from "../lib/functions";
import { deriveCreditPool } from "./creditMath";

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
  args: { subscriptionId: v.id("subscriptions") },
  handler: async (ctx, args) => await ctx.db.get(args.subscriptionId),
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
      kind: "none" as const,
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
    const orderTotal = order.finalTotal;
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

    // Derive kind from which action is possible.
    // "scheduled" = split path (over credit, single item); "adhoc" = apply-credit path.
    // If neither applies, default to "scheduled" (still a subscription order, just in-credit).
    const kind: "scheduled" | "adhoc" = canApplyCredit ? "adhoc" : "scheduled";

    return {
      kind,
      isOverCredit: over,
      creditRemaining,
      orderTotal,
      subscriptionWeekId: order.subscriptionWeekId,
      canSplit,
      canApplyCredit,
    };
  },
});
