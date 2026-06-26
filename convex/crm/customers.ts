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
  // Accept a raw string and normalize defensively: a malformed/stale id from a
  // URL must surface as a friendly not-found (return null), NOT throw an
  // ArgumentValidationError that the frontend renders as a full-page crash
  // (lesson_convex_error_masking / Pitfall #19).
  args: { customerId: v.string() },
  handler: async (ctx, args) => {
    const customerId = ctx.db.normalizeId("customers", args.customerId);
    if (!customerId) return null;
    const customer = await ctx.db.get(customerId);
    if (!customer) return null;

    // subscriptions, agreements, and invoices are independent reads — fetch in
    // parallel. Money is first-class (C10); exclude Paid invoices inline
    // (Unpaid + Partial both surface as actionable).
    const [subscriptions, agreements, unpaidInvoices] = await Promise.all([
      ctx.db
        .query("subscriptions")
        .withIndex("by_customer", (q) => q.eq("customerId", customerId))
        .collect(),
      ctx.db
        .query("supplyAgreements")
        .withIndex("by_customer", (q) => q.eq("customerId", customerId))
        .collect(),
      ctx.db
        .query("invoices")
        .withIndex("by_customer", (q) => q.eq("customerId", customerId))
        .collect()
        .then((invoices) => invoices.filter((i) => i.paymentStatus !== "Paid")),
    ]);

    // Bounded fan-out — a customer has few subscriptions (typically 1–3).
    // Parallelize across subs: each resolves its current week + ledger pool.
    const currentWeekPoolBySubscription: Record<
      string,
      { week: NonNullable<Awaited<ReturnType<typeof resolveCurrentWeek>>>; pool: ReturnType<typeof deriveCreditPool> } | null
    > = {};
    const poolResults = await Promise.all(
      subscriptions.map(async (sub) => {
        const week = await resolveCurrentWeek(ctx, sub._id);
        if (!week) {
          return { subId: sub._id, value: null };
        }
        const entries = await ctx.db
          .query("creditLedger")
          .withIndex("by_subscriptionWeek", (q) =>
            q.eq("subscriptionWeekId", week._id),
          )
          .collect();
        return {
          subId: sub._id,
          value: {
            week,
            pool: deriveCreditPool(
              entries.map((e) => ({ type: e.type, amount: e.amount })),
            ),
          },
        };
      }),
    );
    for (const r of poolResults) {
      currentWeekPoolBySubscription[r.subId] = r.value;
    }

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
