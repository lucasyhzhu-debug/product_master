// convex/subscriptions/reminders/queries.ts
import { internalQuery } from "../../_generated/server";
import type { QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { getWibComponents } from "../../lib/periodRange";
import type {
  ConfirmRow, InvoiceDueRow, TodayDeliveriesRow, ReconcileRow, DeliveryProgressRow, DeliveryLine,
} from "./types";

const TERMINAL_DELIVERED = "Complete" as const;

/** Subscriptions in `active` status (helper — read once per query). */
async function activeSubscriptions(ctx: QueryCtx) {
  return ctx.db.query("subscriptions").withIndex("by_status", (q) => q.eq("status", "active")).collect();
}

/** The subscriptionWeek whose [weekStart, weekEnd] contains nowMs, for a sub. */
async function currentWeek(ctx: QueryCtx, subscriptionId: Id<"subscriptions">, nowMs: number) {
  const week = await ctx.db
    .query("subscriptionWeeks")
    .withIndex("by_subscription_weekStart", (q) =>
      q.eq("subscriptionId", subscriptionId).lte("weekStart", nowMs),
    )
    .order("desc")
    .first();
  return week && nowMs <= week.weekEnd ? week : null;
}

// Kind 1 — planned weeks (next week) awaiting confirm.
export const getWeeksToConfirm = internalQuery({
  args: {},
  handler: async (ctx): Promise<ConfirmRow[]> => {
    const weeks = await ctx.db.query("subscriptionWeeks").withIndex("by_status", (q) => q.eq("status", "planned")).collect();
    const out: ConfirmRow[] = [];
    for (const w of weeks) {
      const sub = await ctx.db.get(w.subscriptionId);
      if (!sub || sub.status !== "active") continue;
      out.push({ subscriptionId: w.subscriptionId, account: sub.label, weekStart: w.weekStart });
    }
    return out;
  },
});

// Kind 2 — confirmed/invoiced & unpaid weeks.
// amountDue = Σ plannedDays[].items[].lineTotal (the invoice total `createSubscriptionWeeklyInvoice`
// builds). NOT `w.creditIssued`: in the deferred-revenue model credit is issued only at payment, so a
// confirmed-but-unpaid week has creditIssued = 0 (verified vs invoicing.ts createSubscriptionWeeklyInvoice).
export const getWeeklyInvoicesDue = internalQuery({
  args: {},
  handler: async (ctx): Promise<InvoiceDueRow[]> => {
    const out: InvoiceDueRow[] = [];
    for (const status of ["confirmed", "invoiced"] as const) {
      const weeks = await ctx.db.query("subscriptionWeeks").withIndex("by_status", (q) => q.eq("status", status)).collect();
      for (const w of weeks) {
        if (w.paymentReceivedAt) continue; // already paid
        const sub = await ctx.db.get(w.subscriptionId);
        if (!sub || sub.status !== "active") continue;
        const amountDue = w.plannedDays.reduce(
          (s: number, pd) => s + pd.items.reduce((d: number, it) => d + it.lineTotal, 0), 0,
        );
        out.push({ account: sub.label, weekStart: w.weekStart, amountDue, weekStatus: w.status });
      }
    }
    return out;
  },
});

// Kind 3 — today's planned deliveries (per-product split; EC6 deleted-product flag).
export const getTodaySubscriptionDeliveries = internalQuery({
  args: {},
  handler: async (ctx): Promise<TodayDeliveriesRow[]> => {
    const now = Date.now();
    const { year, month, day } = getWibComponents(now);
    const out: TodayDeliveriesRow[] = [];
    for (const sub of await activeSubscriptions(ctx)) {
      const week = await currentWeek(ctx, sub._id, now);
      if (!week) continue;
      for (const pd of week.plannedDays) {
        const c = getWibComponents(pd.date);
        if (c.year !== year || c.month !== month || c.day !== day) continue;
        const lines: DeliveryLine[] = [];
        for (const item of pd.items) {
          const prod = await ctx.db.get(item.menuProductId);
          lines.push({ productName: item.productName, qty: item.qty, missingProduct: prod === null });
        }
        if (lines.length) out.push({ account: sub.label, deliverByTime: pd.deliverByTime, lines });
      }
    }
    return out;
  },
});

// Kind 4 — days approaching tomorrow's change cutoff (notify only; no lock flip — that's Slice 2).
export const getDaysApproachingCutoff = internalQuery({
  args: {},
  handler: async (ctx): Promise<ConfirmRow[]> => {
    const now = Date.now();
    const tomorrow = now + 24 * 60 * 60 * 1000;
    const tc = getWibComponents(tomorrow);
    const out: ConfirmRow[] = [];
    for (const sub of await activeSubscriptions(ctx)) {
      const week = await currentWeek(ctx, sub._id, tomorrow) ?? await currentWeek(ctx, sub._id, now);
      if (!week) continue;
      const hasTomorrow = week.plannedDays.some((pd) => {
        const c = getWibComponents(pd.date);
        return c.year === tc.year && c.month === tc.month && c.day === tc.day && !pd.locked;
      });
      if (hasTomorrow) out.push({ subscriptionId: sub._id, account: sub.label, weekStart: week.weekStart });
    }
    return out;
  },
});

// Kind 5 — prior week still in delivering / unreconciled.
// Only weeks whose delivery window has ended (weekEnd < now) need reconciliation.
// Intentionally does NOT filter by sub.status — a terminated sub's final delivering week still
// needs reconciliation even if the subscription is no longer active.
export const getWeeksToReconcile = internalQuery({
  args: {},
  handler: async (ctx): Promise<ReconcileRow[]> => {
    const now = Date.now();
    const weeks = await ctx.db.query("subscriptionWeeks").withIndex("by_status", (q) => q.eq("status", "delivering")).collect();
    const out: ReconcileRow[] = [];
    for (const w of weeks) {
      if (w.weekEnd >= now) continue; // current in-progress week — not yet reconcilable
      const sub = await ctx.db.get(w.subscriptionId);
      if (!sub) continue;
      out.push({ account: sub.label, weekStart: w.weekStart, shortfall: w.shortfall, refundDue: w.refundDue });
    }
    return out;
  },
});

// Kind 6 — founders weekly delivery progress (pcs vs live plan; delivered via by_subscriptionWeek + Complete).
export const getWeeklyDeliveryProgress = internalQuery({
  args: {},
  handler: async (ctx): Promise<DeliveryProgressRow[]> => {
    const now = Date.now();
    const out: DeliveryProgressRow[] = [];
    for (const sub of await activeSubscriptions(ctx)) {
      const week = await currentWeek(ctx, sub._id, now);
      if (!week) continue;
      const weekPlannedPcs = week.plannedDays.reduce(
        (s: number, pd) => s + pd.items.reduce((d: number, it) => d + it.qty, 0), 0,
      );
      const orders = await ctx.db
        .query("orders")
        .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", week._id))
        .collect();
      let deliveredPcs = 0;
      for (const o of orders) {
        if (o.status !== TERMINAL_DELIVERED) continue;
        const items = await ctx.db.query("orderItems").withIndex("by_order", (q) => q.eq("orderId", o._id)).collect();
        deliveredPcs += items.reduce((s: number, it) => s + it.quantity, 0);
      }
      out.push({
        account: sub.label, weekStart: week.weekStart, weekPlannedPcs, deliveredPcs,
        remaining: Math.max(0, weekPlannedPcs - deliveredPcs),
        overBy: Math.max(0, deliveredPcs - weekPlannedPcs),
      });
    }
    return out;
  },
});
