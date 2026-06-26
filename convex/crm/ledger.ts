/**
 * CRM ledger queries — Phase D CRM surface.
 *
 * T8: getCreditLedgerStatement — reads creditLedger entries for a subscription week
 *     and pipes them through buildLedgerStatement to produce signed-amount + running-balance rows.
 *     getWeekBackReferences — collects all objects linked to a subscription week
 *     (orders, ledger entries, funding invoice) for bidirectional cross-linking (CRM principle A4).
 *
 * Auth: manager + admin only (Pitfall #19).
 */

import { v } from "convex/values";
import { protectedQuery } from "../lib/functions";
import type { Id } from "../_generated/dataModel";
import { buildLedgerStatement } from "./helpers/ledgerStatement";

// ---------------------------------------------------------------------------
// T8: getCreditLedgerStatement
// ---------------------------------------------------------------------------

export const getCreditLedgerStatement = protectedQuery({
  roles: ["manager", "admin"],
  args: { subscriptionWeekId: v.id("subscriptionWeeks") },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("creditLedger")
      .withIndex("by_subscriptionWeek", (q) =>
        q.eq("subscriptionWeekId", args.subscriptionWeekId),
      )
      .collect();

    // Resolve actor names (C10 — never leak raw user ids) and link labels
    // (A1 — show the order/invoice number, not an id fragment). Bounded fan-out:
    // a week has few ledger entries.
    const actorName = new Map<string, string>();
    const linkLabel = new Map<string, string>();
    await Promise.all([
      ...[...new Set(entries.map((e) => e.createdBy as string))].map(async (uid) => {
        const u = await ctx.db.get(uid as Id<"users">);
        if (u) actorName.set(uid, u.name);
      }),
      ...[...new Set(entries.flatMap((e) => (e.orderId ? [e.orderId as string] : [])))].map(
        async (oid) => {
          const o = await ctx.db.get(oid as Id<"orders">);
          if (o) linkLabel.set(oid, o.orderNumber);
        },
      ),
      ...[...new Set(entries.flatMap((e) => (e.invoiceId ? [e.invoiceId as string] : [])))].map(
        async (iid) => {
          const inv = await ctx.db.get(iid as Id<"invoices">);
          if (inv?.invoiceNumber) linkLabel.set(iid, inv.invoiceNumber);
        },
      ),
    ]);

    return buildLedgerStatement(entries, {
      actorName: (uid) => actorName.get(uid),
      linkLabel: (_kind, id) => linkLabel.get(id),
    });
  },
});

// ---------------------------------------------------------------------------
// T8: getWeekBackReferences
// ---------------------------------------------------------------------------

export const getWeekBackReferences = protectedQuery({
  roles: ["manager", "admin"],
  args: { subscriptionWeekId: v.id("subscriptionWeeks") },
  handler: async (ctx, args) => {
    // orders, ledgerEntries, and the week doc are independent — fetch in parallel.
    const [orders, ledgerEntries, week] = await Promise.all([
      ctx.db
        .query("orders")
        .withIndex("by_subscriptionWeek", (q) =>
          q.eq("subscriptionWeekId", args.subscriptionWeekId),
        )
        .collect(),
      ctx.db
        .query("creditLedger")
        .withIndex("by_subscriptionWeek", (q) =>
          q.eq("subscriptionWeekId", args.subscriptionWeekId),
        )
        .collect(),
      ctx.db.get(args.subscriptionWeekId),
    ]);

    const fundingInvoice =
      week?.weeklyInvoiceId ? await ctx.db.get(week.weeklyInvoiceId) : null;

    return { orders, ledgerEntries, fundingInvoice };
  },
});
