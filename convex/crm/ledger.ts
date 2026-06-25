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
    return buildLedgerStatement(entries);
  },
});

// ---------------------------------------------------------------------------
// T8: getWeekBackReferences
// ---------------------------------------------------------------------------

export const getWeekBackReferences = protectedQuery({
  roles: ["manager", "admin"],
  args: { subscriptionWeekId: v.id("subscriptionWeeks") },
  handler: async (ctx, args) => {
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_subscriptionWeek", (q) =>
        q.eq("subscriptionWeekId", args.subscriptionWeekId),
      )
      .collect();

    const ledgerEntries = await ctx.db
      .query("creditLedger")
      .withIndex("by_subscriptionWeek", (q) =>
        q.eq("subscriptionWeekId", args.subscriptionWeekId),
      )
      .collect();

    const week = await ctx.db.get(args.subscriptionWeekId);
    const fundingInvoice =
      week?.weeklyInvoiceId ? await ctx.db.get(week.weeklyInvoiceId) : null;

    return { orders, ledgerEntries, fundingInvoice };
  },
});
