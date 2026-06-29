import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { protectedQuery } from "../lib/functions";
import { deriveCreditPool, computeScheduleTotal, deriveWeekShortfall, computeCreditSplit } from "./creditMath";
import { getWibDateStr } from "../lib/periodRange";
import { computeWeekAvailableCredit } from "./creditReservation";

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
    //   - (subscriptionCreditApplied ?? 0) === 0 — not already reserved (D5/IMP-4)
    //   - creditRemaining > 0 (mutation no-ops at 0, but surface should suppress button)
    const canApplyCredit =
      order.status === "AwaitingPayment" &&
      order.paymentStatus !== "Paid" &&
      (order.subscriptionCreditApplied ?? 0) === 0 &&
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

// ---------------------------------------------------------------------------
// listActiveSubscriptionsForCustomer — lightweight selector for the order
// sheet's B2B subscription picker (Task T1). Returns only active subs with
// the current-week reservation-aware credit remaining.
// Roles: canAccessOrders route → order_staff + manager + admin (Pitfall #19).
// D11: unitPrice (confidential partner price) is NOT returned.
// ---------------------------------------------------------------------------

export const listActiveSubscriptionsForCustomer = protectedQuery({
  roles: ["order_staff", "manager", "admin"],
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const subs = (
      await ctx.db
        .query("subscriptions")
        .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
        .collect()
    ).filter((s) => s.status === "active");

    const todayMs = Date.now();
    const out = await Promise.all(
      subs.map(async (sub) => {
        // Resolve the funded open week covering today (paid or delivering).
        // A covering week always has weekStart <= today, so bound the scan via
        // the index upper bound; keep the JS filter for weekEnd + status.
        const weeks = await ctx.db
          .query("subscriptionWeeks")
          .withIndex("by_subscription_weekStart", (q) =>
            q.eq("subscriptionId", sub._id).lte("weekStart", todayMs),
          )
          .collect();
        const week =
          weeks.find(
            (w) =>
              todayMs <= w.weekEnd &&
              (w.status === "paid" || w.status === "delivering"),
          ) ?? null;

        let creditRemaining: number | null = null;
        if (week) {
          // CRM C10: derive from the pool — never re-key a denormalised total.
          ({ availableCredit: creditRemaining } =
            await computeWeekAvailableCredit(ctx, week._id));
        }

        return { subscriptionId: sub._id, label: sub.label, creditRemaining };
      }),
    );
    return out;
  },
});

// ---------------------------------------------------------------------------
// getSubscriptionCreditContext — reservation-aware credit context for a
// customer's active subscriptions. Used by Task 8 (frontend order form) to
// show how much credit is available and how the current cart splits.
//
// availableCredit = max(0, pool.creditRemaining − reservedByUnrecognized)
// where a credit order is "reserved" if:
//   - subscriptionCreditApplied > 0
//   - status != "Cancelled"
//   - has NO by_order creditLedger row (un-recognized — recognition posts the
//     actual drawdown entry at delivery per D5/IMP-4)
// A recognized order (has a by_order ledger row) already reduced
// pool.creditRemaining via its drawdown entry; must NOT double-reduce.
// ---------------------------------------------------------------------------

/** Statuses that indicate a scheduled delivery has already been dispatched or
 *  completed — planned day is no longer "remaining" for these.
 *  EXPORTED (staffreview IMP-1) so T8's editUndeliveredSubscriptionOrder and the
 *  credit context share ONE notion of "delivered" — guard can't drift. */
export const DELIVERY_DONE_STATUSES = new Set<string>([
  "AwaitingDelivery",
  "Complete",
  // Legacy statuses kept for schema compat
  "WaitingShipment",
  "WaitingPickup",
  "CompleteShipped",
  "PickedUp",
]);

export const getSubscriptionCreditContext = protectedQuery({
  roles: ["order_staff", "manager", "admin"],
  args: {
    customerId: v.id("customers"),
    dueDate: v.number(),
    draftItems: v.array(
      v.object({
        menuProductId: v.id("menuProducts"),
        qty: v.number(),
        retailUnitPrice: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const subs = (
      await ctx.db
        .query("subscriptions")
        .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
        .collect()
    ).filter((s) => s.status === "active");

    const out: Array<{
      subscriptionId: Id<"subscriptions">;
      label: string;
      weekId: Id<"subscriptionWeeks"> | null;
      allowedProductIds: string[];
      availableCredit: number;
      split: ReturnType<typeof computeCreditSplit> | null;
      plannedDeliveriesRemaining: number;
    }> = [];

    for (const sub of subs) {
      // Resolve the funded, still-open week covering dueDate.
      const weeks = await ctx.db
        .query("subscriptionWeeks")
        .withIndex("by_subscription_weekStart", (q) =>
          q.eq("subscriptionId", sub._id),
        )
        .collect();
      const week =
        weeks.find(
          (w) =>
            w.weekStart <= args.dueDate &&
            args.dueDate <= w.weekEnd &&
            (w.status === "paid" || w.status === "delivering"),
        ) ?? null;

      // Allowed products: union of all products in the subscription's schedule template.
      const allowedProductIds = Array.from(
        new Set(
          sub.scheduleTemplate.flatMap((d) =>
            d.items.map((it) => String(it.menuProductId)),
          ),
        ),
      );

      let availableCredit = 0;
      let split: ReturnType<typeof computeCreditSplit> | null = null;
      let plannedDeliveriesRemaining = 0;

      if (week) {
        // Derive reservation-aware available credit (canonical — see creditReservation.ts).
        // Called before any new order is created → the order-in-progress is not yet in
        // the DB, so its reservation is not included (correct: shows pre-order headroom).
        ({ availableCredit } = await computeWeekAvailableCredit(ctx, week._id));

        // Fetch orders separately for status-aware planned-delivery count below.
        const weekOrders = await ctx.db
          .query("orders")
          .withIndex("by_subscriptionWeek", (q) =>
            q.eq("subscriptionWeekId", week._id),
          )
          .collect();

        split = computeCreditSplit(
          args.draftItems,
          new Set(allowedProductIds),
          sub.unitPrice,
          availableCredit,
        );

        // Status-aware planned deliveries remaining:
        // A planned day is "remaining" if it's in the future OR its matched
        // delivery order hasn't reached a dispatched/complete state yet.
        const deliveredWibDates = new Set<string>(
          weekOrders
            .filter(
              (o) =>
                DELIVERY_DONE_STATUSES.has(o.status) &&
                o.deliveryDate !== undefined,
            )
            .map((o) => getWibDateStr(o.deliveryDate!)),
        );
        const today = getWibDateStr(args.dueDate);
        plannedDeliveriesRemaining = week.plannedDays.filter((d) => {
          const dStr = getWibDateStr(d.date);
          if (dStr >= today) return true; // future day: definitely remaining
          return !deliveredWibDates.has(dStr); // past day: remaining unless delivered
        }).length;
      }

      // D11 carve-out (Slice-1 triple-review M-d11): `split.lines[].effectiveUnitPrice`
      // intentionally exposes the subscription's partner unit price to order_staff. This
      // is a DELIBERATE, product-owner-approved exception (2026-06-30) to CRM principle
      // D11 — order_staff need the partner price to explain the credit split at the
      // counter. Do NOT "fix" this by stripping effectiveUnitPrice in a future D11 audit.
      out.push({
        subscriptionId: sub._id,
        label: sub.label,
        weekId: week?._id ?? null,
        allowedProductIds,
        availableCredit,
        split,
        plannedDeliveriesRemaining,
      });
    }
    return out;
  },
});
