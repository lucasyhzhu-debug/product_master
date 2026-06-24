/**
 * Calendar + funding-dashboard read queries for Subscription Phase B.
 *
 * Consumed by:
 *   B14 — /crm/subscriptions/:id/calendar (uses getPlanningWeek + listWeeks)
 *   B15 — /crm/funding-dashboard (uses getFundingDashboard)
 *
 * Index usage:
 *   by_subscription_weekStart — bounded range scan on (subscriptionId, weekStart)
 *   by_status                 — bounded scan on status for funding dashboard
 *   No unbounded .collect() over subscriptions or weeks.
 */

import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { protectedQuery } from "../../lib/functions";

// ---------------------------------------------------------------------------
// getPlanningWeek
// Returns the subscriptionWeeks row for a given (subscriptionId, weekStart)
// pair, or null if it has not yet been seeded. Also returns the subscription.
// ---------------------------------------------------------------------------
export const getPlanningWeek = protectedQuery({
  roles: ["manager", "admin"],
  args: {
    subscriptionId: v.id("subscriptions"),
    weekStart: v.number(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db.get(args.subscriptionId);
    if (!subscription) return null;

    const week = await ctx.db
      .query("subscriptionWeeks")
      .withIndex("by_subscription_weekStart", (q) =>
        q.eq("subscriptionId", args.subscriptionId).eq("weekStart", args.weekStart),
      )
      .first();

    return { week: week ?? null, subscription };
  },
});

// ---------------------------------------------------------------------------
// listWeeks
// Returns all weeks for a subscription, most-recent first.
// Bounded by subscriptionId — no unbounded collect.
// ---------------------------------------------------------------------------
export const listWeeks = protectedQuery({
  roles: ["manager", "admin"],
  args: { subscriptionId: v.id("subscriptions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subscriptionWeeks")
      .withIndex("by_subscription_weekStart", (q) =>
        q.eq("subscriptionId", args.subscriptionId),
      )
      .order("desc")
      .collect();
  },
});

// ---------------------------------------------------------------------------
// getFundingDashboard
// Returns weeks in "invoiced" (awaiting payment) and "confirmed" (awaiting
// invoice) status, enriched with subscription + customer name so the
// funding-dashboard UI (B15) can render without extra round-trips.
//
// Shape per row:
//   { week, subscriptionId, subscriptionLabel, customerId, customerName }
//
// Index: by_status (bounded per status literal — two separate scans, each
// bounded; no full-table scan).
// ---------------------------------------------------------------------------
export const getFundingDashboard = protectedQuery({
  roles: ["manager", "admin"],
  args: {},
  handler: async (ctx) => {
    // Two bounded index scans — one per status of interest.
    const [invoicedWeeks, confirmedWeeks] = await Promise.all([
      ctx.db
        .query("subscriptionWeeks")
        .withIndex("by_status", (q) => q.eq("status", "invoiced"))
        .collect(),
      ctx.db
        .query("subscriptionWeeks")
        .withIndex("by_status", (q) => q.eq("status", "confirmed"))
        .collect(),
    ]);

    const allWeeks = [...invoicedWeeks, ...confirmedWeeks];

    // Deduplicate subscription lookups.
    const subIds = [...new Set(allWeeks.map((w) => w.subscriptionId))];
    const subs = await Promise.all(subIds.map((id) => ctx.db.get(id)));
    const subMap = new Map(
      subs.flatMap((s) => (s ? [[s._id as string, s]] : [])),
    );

    // Deduplicate customer lookups.
    const customerIds = [
      ...new Set(subs.flatMap((s) => (s ? [s.customerId] : []))),
    ] as Id<"customers">[];
    const customers = await Promise.all(
      customerIds.map((id) => ctx.db.get(id)),
    );
    const customerMap = new Map(
      customers.flatMap((c) => (c ? [[c._id as string, c.name]] : [])),
    );

    return allWeeks.map((week) => {
      const sub = subMap.get(week.subscriptionId as string);
      const customerName = sub ? (customerMap.get(sub.customerId as string) ?? null) : null;
      return {
        week,
        subscriptionId: week.subscriptionId,
        subscriptionLabel: sub?.label ?? null,
        customerId: sub?.customerId ?? null,
        customerName,
      };
    });
  },
});
