/**
 * CRM drawdown query — Phase D CRM surface.
 *
 * T25: getCustomerDrawdown — per-day credit drawdown series for a single subscription week.
 *
 * Auth: manager + admin only (Pitfall #19).
 * Principle C10: read derived pool, never re-key totals.
 */

import { v } from "convex/values";
import { protectedQuery } from "../lib/functions";
import { resolveCurrentWeek } from "./helpers/currentWeek";
import { buildDrawdownSeries } from "./helpers/drawdownSeries";
import type { DrawdownSeriesResult } from "./helpers/drawdownSeries";
import type { Doc } from "../_generated/dataModel";

// ---------------------------------------------------------------------------
// T25: getCustomerDrawdown
// ---------------------------------------------------------------------------

export const getCustomerDrawdown = protectedQuery({
  roles: ["manager", "admin"],
  args: {
    subscriptionId: v.id("subscriptions"),
    weekStart: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    week: Doc<"subscriptionWeeks">;
    series: DrawdownSeriesResult;
  } | null> => {
    const now = Date.now();

    // Resolve the target week: explicit weekStart arg or current week.
    let week: Doc<"subscriptionWeeks"> | null;
    if (args.weekStart !== undefined) {
      week = await ctx.db
        .query("subscriptionWeeks")
        .withIndex("by_subscription_weekStart", (q) =>
          q
            .eq("subscriptionId", args.subscriptionId)
            .eq("weekStart", args.weekStart!),
        )
        .first();
    } else {
      week = await resolveCurrentWeek(ctx, args.subscriptionId, now);
    }

    if (!week) return null;

    const { plannedDays } = week;

    // --- Orders delivered in this week window, partitioned by deliveryDate ---
    // Subscription orders reliably carry subscriptionWeekId (set at order creation in
    // convex/subscriptions/scheduling/confirmWeek.ts). Use by_subscriptionWeek scoped to
    // week._id instead of by_subscription (C9 fix — avoids loading all-time history).
    const weekOrders = await ctx.db
      .query("orders")
      .withIndex("by_subscriptionWeek", (q) =>
        q.eq("subscriptionWeekId", week._id),
      )
      .collect();

    // Only delivered (Complete) orders contribute to the series.
    // deliveryDate range check removed — by_subscriptionWeek already scopes to this week.
    const deliveredStatuses = new Set([
      "Complete",
      "CompleteShipped",
      "PickedUp",
    ]);
    const deliveredByDay: { date: number; pcs: number }[] = [];
    for (const order of weekOrders) {
      if (
        order.deliveryDate !== undefined &&
        deliveredStatuses.has(order.status)
      ) {
        // Sum item quantities for this order to get delivered pcs.
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        const pcs = items.reduce((sum, item) => sum + item.quantity, 0);
        deliveredByDay.push({ date: order.deliveryDate, pcs });
      }
    }

    // --- Build pool trajectory from creditLedger.by_subscriptionWeek ---
    // Load all entries for this week, ordered by creation time.
    const ledgerEntries = await ctx.db
      .query("creditLedger")
      .withIndex("by_subscriptionWeek", (q) =>
        q.eq("subscriptionWeekId", week!._id),
      )
      .collect();

    // Sort by _creationTime ascending so we can build the running balance snapshot.
    const sortedEntries = ledgerEntries.slice().sort(
      (a, b) => a._creationTime - b._creationTime,
    );

    // Build a per-day creditRemaining map.
    // Strategy: for each planned day, find the balance after all drawdown entries
    // whose linked order has a deliveryDate ≤ that day. Non-drawdown entries
    // (topup, expiry, adjustment, refund) are attributed to the earliest planned
    // day boundary because they affect the pool before deliveries consume from it.
    //
    // For each planned day d:
    //   1. Accumulate all entries up to (and including) that day's drawdown activity.
    //   2. creditRemaining = balanceAfter of the last entry in scope.
    //
    // Since balanceAfter is already stored, we read it directly (C10 — never re-key).

    // Build a date → Set<orderId> map from delivered orders for date attribution.
    const orderDeliveryDate = new Map<string, number>();
    for (const order of weekOrders) {
      if (order.deliveryDate !== undefined) {
        orderDeliveryDate.set(order._id, order.deliveryDate);
      }
    }

    // Sort planned days ascending for trajectory traversal.
    const sortedPlannedDays = plannedDays.slice().sort((a, b) => a.date - b.date);

    // Build poolTrajectory: one entry per planned day with creditRemaining.
    // We walk through entries in creation-time order, assigning them to the
    // earliest planned day ≥ the entry's attributed date.
    //
    // Attribution:
    //   - drawdown entry with orderId: attributed to that order's deliveryDate (or day boundary).
    //   - topup / expiry / refund / adjustment: attributed to the week's first planned day
    //     (they set the opening balance before deliveries begin).
    const poolTrajectory: { date: number; creditRemaining: number }[] = [];

    if (sortedPlannedDays.length === 0) {
      // No planned days — return empty series.
      return { week, series: buildDrawdownSeries([], [], [], now) };
    }

    // Accumulate entries into day buckets: map date → last balanceAfter seen.
    // For each entry, determine which planned day it belongs to.
    const dayBalances = new Map<number, number>(); // date → last balanceAfter

    for (const entry of sortedEntries) {
      // Determine attributed date for this entry.
      let attributedDate: number;
      if (entry.type === "drawdown" && entry.orderId !== undefined) {
        const delivDate = orderDeliveryDate.get(entry.orderId);
        if (delivDate !== undefined) {
          attributedDate = delivDate;
        } else {
          // Drawdown with unknown order date — attribute to first planned day.
          attributedDate = sortedPlannedDays[0].date;
        }
      } else {
        // Non-drawdown entries (topup, expiry, refund, adjustment):
        // attribute to the first planned day (opening balance adjustment).
        attributedDate = sortedPlannedDays[0].date;
      }

      // Assign balanceAfter to the appropriate planned day bucket.
      // Find the latest planned day whose date ≤ attributedDate.
      // If attributedDate precedes all planned days, assign to the first.
      let targetDate = sortedPlannedDays[0].date;
      for (const pd of sortedPlannedDays) {
        if (pd.date <= attributedDate) {
          targetDate = pd.date;
        }
      }

      // Update the day balance (last entry within the day wins — monotone).
      dayBalances.set(targetDate, entry.balanceAfter);
    }

    // Build trajectory: for each planned day, carry forward the last known balance
    // if no entry was directly attributed to it.
    let lastKnownBalance = 0;
    for (const pd of sortedPlannedDays) {
      if (dayBalances.has(pd.date)) {
        lastKnownBalance = dayBalances.get(pd.date)!;
      }
      poolTrajectory.push({ date: pd.date, creditRemaining: lastKnownBalance });
    }

    const series = buildDrawdownSeries(
      deliveredByDay,
      plannedDays,
      poolTrajectory,
      now,
    );

    return { week, series };
  },
});
