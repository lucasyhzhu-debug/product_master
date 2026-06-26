/**
 * CRM funding dashboard queries — Phase D CRM surface (UAT-fix).
 *
 * getUnpaidSubscriptionInvoices — cross-customer funding hub: all unpaid
 * subscription invoices (kind = subscription_weekly | subscription_topup).
 *
 * Purpose: the Funding Dashboard shows only *weeks* awaiting invoice/payment.
 * A mid-week amendment (topup) invoice may be Unpaid while the dashboard says
 * "All caught up" — a money-safety contradiction with the customer hub.
 * This query surfaces ALL unpaid subscription invoices so the dashboard can
 * reconcile against the customer credit pool (C10, A4).
 *
 * Identification: invoices.invoiceKind ∈ {"subscription_weekly",
 * "subscription_topup"} is the canonical subscription invoice marker (set by
 * buildInvoiceSnapshot in convex/subscriptions/invoicing.ts). We use the
 * by_kind_paymentStatus index — two bounded index scans (one per kind) that
 * never touch the broader invoices table. Post-scan paymentStatus filter
 * excludes "Paid" rows in memory (trivially small set per kind).
 *
 * Auth: manager + admin (Pitfall #19 — CRM routes require manager+).
 */

import { protectedQuery } from "../lib/functions";
import type { Id } from "../_generated/dataModel";

export const getUnpaidSubscriptionInvoices = protectedQuery({
  roles: ["manager", "admin"],
  args: {},
  handler: async (ctx) => {
    // Two index scans — one per subscription invoice kind — via the
    // by_kind_paymentStatus index ([invoiceKind, paymentStatus]).
    // This isolates subscription invoices without scanning the full table.
    const [weeklyInvoices, topupInvoices] = await Promise.all([
      ctx.db
        .query("invoices")
        .withIndex("by_kind_paymentStatus", (q) =>
          q.eq("invoiceKind", "subscription_weekly"),
        )
        .collect(),
      ctx.db
        .query("invoices")
        .withIndex("by_kind_paymentStatus", (q) =>
          q.eq("invoiceKind", "subscription_topup"),
        )
        .collect(),
    ]);

    // Exclude Paid — keep Unpaid and Partial (both actionable for the dashboard).
    const unpaid = [...weeklyInvoices, ...topupInvoices].filter(
      (inv) => inv.paymentStatus !== "Paid",
    );

    // Fan-out: resolve week → subscriptionId + weekStart, subscription label,
    // and customer name. Bounded: a business has a handful of active subscriptions,
    // each with at most one unpaid invoice per week.
    const rows = await Promise.all(
      unpaid.map(async (inv) => {
        let subscriptionId: Id<"subscriptions"> | null = null;
        let subscriptionLabel: string | null = null;
        let weekStart: number | null = null;

        if (inv.subscriptionWeekId) {
          // Week doc carries subscriptionId + weekStart — one db.get, no extra index.
          const week = await ctx.db.get(inv.subscriptionWeekId);
          if (week) {
            weekStart = week.weekStart;
            subscriptionId = week.subscriptionId;
            const sub = await ctx.db.get(week.subscriptionId);
            subscriptionLabel = sub?.label ?? null;
          }
        }

        let customerName: string | null = null;
        if (inv.customerId) {
          const customer = await ctx.db.get(inv.customerId);
          customerName = customer?.name ?? null;
        }

        return {
          invoiceId: inv._id,
          invoiceNumber: inv.invoiceNumber ?? null,
          // amountTotal maps to invoices.finalTotal (the canonical amount field set
          // by buildInvoiceSnapshot: finalTotal = subtotal for subscription invoices).
          amountTotal: inv.finalTotal,
          paymentStatus: inv.paymentStatus,
          customerId: (inv.customerId ?? null) as Id<"customers"> | null,
          customerName,
          subscriptionId,
          subscriptionLabel,
          weekStart,
        };
      }),
    );

    return rows;
  },
});
