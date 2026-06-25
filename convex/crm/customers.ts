/**
 * CRM customer mutations and queries — Phase D CRM surface.
 *
 * T5: updateCustomerCrmFields — patches only provided CRM fields on a customer record.
 * T6: getCustomerRecord — full customer hub view (subscriptions, agreements, credit pools, unpaid invoices).
 *     getCrmHomeActiveSubscriptions — dashboard feed of active subscriptions with current week.
 *
 * Auth: manager + admin only (Pitfall #19 — superset of canAccessCrm so no role throws Unauthorized).
 */

import { v } from "convex/values";
import { protectedMutation, protectedQuery } from "../lib/functions";
import { resolveCurrentWeek } from "./helpers/currentWeek";
import { deriveCreditPool } from "../subscriptions/creditMath";

// ---------------------------------------------------------------------------
// T5: updateCustomerCrmFields
// ---------------------------------------------------------------------------

export const updateCustomerCrmFields = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    customerId: v.id("customers"),
    keyContactName: v.optional(v.string()),
    keyContactRole: v.optional(v.string()),
    whatsapp: v.optional(v.string()),
    email: v.optional(v.string()),
    instagram: v.optional(v.string()),
    otherSocials: v.optional(
      v.array(
        v.object({
          platform: v.string(),
          handle: v.string(),
          url: v.optional(v.string()),
        }),
      ),
    ),
    deliveryAddress: v.optional(v.string()),
    storeAddress: v.optional(v.string()),
    otherAddresses: v.optional(v.array(v.string())),
    altPhone: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { customerId, ...fields } = args;
    // Patch only the fields that were explicitly provided (filter out undefined).
    const patch = Object.fromEntries(
      Object.entries(fields).filter(([, val]) => val !== undefined),
    );
    await ctx.db.patch(customerId, patch);
    return customerId;
  },
});

// ---------------------------------------------------------------------------
// T6: getCustomerRecord
// ---------------------------------------------------------------------------

export const getCustomerRecord = protectedQuery({
  roles: ["manager", "admin"],
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.customerId);
    if (!customer) return null;

    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();

    const agreements = await ctx.db
      .query("supplyAgreements")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();

    // Bounded fan-out — a customer has few subscriptions (typically 1–3).
    const currentWeekPoolBySubscription: Record<
      string,
      { week: NonNullable<Awaited<ReturnType<typeof resolveCurrentWeek>>>; pool: ReturnType<typeof deriveCreditPool> } | null
    > = {};
    for (const sub of subscriptions) {
      const week = await resolveCurrentWeek(ctx, sub._id);
      if (!week) {
        currentWeekPoolBySubscription[sub._id] = null;
        continue;
      }
      const entries = await ctx.db
        .query("creditLedger")
        .withIndex("by_subscriptionWeek", (q) =>
          q.eq("subscriptionWeekId", week._id),
        )
        .collect();
      currentWeekPoolBySubscription[sub._id] = {
        week,
        pool: deriveCreditPool(
          entries.map((e) => ({ type: e.type, amount: e.amount })),
        ),
      };
    }

    const allInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();
    // Money is first-class: read derived pool (CRM principle C10).
    // Exclude Paid invoices; Unpaid + Partial both surface as actionable.
    const unpaidInvoices = allInvoices.filter(
      (i) => i.paymentStatus !== "Paid",
    );

    return { customer, subscriptions, agreements, currentWeekPoolBySubscription, unpaidInvoices };
  },
});

// ---------------------------------------------------------------------------
// T6: getCrmHomeActiveSubscriptions
// ---------------------------------------------------------------------------

export const getCrmHomeActiveSubscriptions = protectedQuery({
  roles: ["manager", "admin"],
  args: {},
  handler: async (ctx) => {
    // Use by_status index to avoid full-table scan (CRM principle B8).
    const active = await ctx.db
      .query("subscriptions")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    // Parallelize across subs; within each, fetch customer + current week together
    // (avoids sequential N+1 awaits per active subscription).
    const out = await Promise.all(
      active.map(async (s) => {
        const [customer, currentWeek] = await Promise.all([
          ctx.db.get(s.customerId),
          resolveCurrentWeek(ctx, s._id),
        ]);
        return {
          subscription: s,
          customerId: s.customerId,
          customerName: customer?.name ?? null,
          currentWeek,
        };
      }),
    );
    return out;
  },
});
