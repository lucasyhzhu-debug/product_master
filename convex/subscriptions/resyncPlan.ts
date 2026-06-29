import { v, ConvexError } from "convex/values";
import { protectedMutation } from "../lib/functions";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { detectAboveBaseline } from "./enforcement/detectAboveBaseline";

/**
 * Resync a week's `plannedDays` to match its actual orders — INTERNAL helper
 * (operates on ctx directly). Shared by the public `resyncWeekPlanFromOrders`
 * mutation and the subscription edit orchestrator (which can't call mutations).
 *
 * PRESERVES the settled-week guard: a reconciled/closed week throws — editing an
 * order in a settled week must fail loudly, never silently rewrite a closed plan.
 */
export async function resyncWeekPlanInline(
  ctx: MutationCtx,
  subscriptionWeekId: Id<"subscriptionWeeks">,
): Promise<{ before: { date: number; qty: number }[]; after: { date: number; qty: number }[]; dayCount: number }> {
  const week = await ctx.db.get(subscriptionWeekId);
  if (!week) throw new ConvexError("Subscription week not found");
  // Settled weeks are immutable — don't rewrite a reconciled/closed plan.
  if (week.status === "reconciled" || week.status === "closed") {
    throw new ConvexError(`Week is ${week.status} and settled — its plan cannot be resynced`);
  }
  const subscription = await ctx.db.get(week.subscriptionId);
  if (!subscription) throw new ConvexError("Subscription not found");

  const orders = await ctx.db
    .query("orders")
    .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", week._id))
    .collect();

  // Group active order items by delivery date, merging duplicate products.
  type Line = {
    menuProductId: Id<"menuProducts">;
    productName: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  };
  const byDate = new Map<number, Line[]>();
  for (const o of orders) {
    if (o.status === "Cancelled" || o.deliveryDate === undefined) continue;
    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", o._id))
      .collect();
    for (const oi of items) {
      if (oi.isCancelled || !oi.menuProductId) continue;
      const arr = byDate.get(o.deliveryDate) ?? [];
      const existing = arr.find((a) => a.menuProductId === oi.menuProductId);
      if (existing) {
        existing.qty += oi.quantity;
        existing.lineTotal += oi.lineTotal;
      } else {
        arr.push({
          menuProductId: oi.menuProductId,
          productName: oi.productName,
          qty: oi.quantity,
          unitPrice: oi.unitPrice,
          lineTotal: oi.lineTotal,
        });
      }
      byDate.set(o.deliveryDate, arr);
    }
  }

  // Preserve each day's existing deliverByTime + locked state where known.
  const metaByDate = new Map(
    week.plannedDays.map((d) => [d.date, { deliverByTime: d.deliverByTime, locked: d.locked }]),
  );
  const plannedDays = [...byDate.entries()]
    .map(([date, items]) => {
      const meta = metaByDate.get(date);
      return {
        date,
        deliverByTime: meta?.deliverByTime ?? subscription.deliverByTime ?? "17:00",
        locked: meta?.locked ?? true,
        items: items.map((it) => ({
          menuProductId: it.menuProductId,
          productName: it.productName,
          qty: it.qty,
          unitPrice: it.unitPrice,
          lineTotal: it.lineTotal,
        })),
        needsSupplierConfirmation: detectAboveBaseline(
          items.map((i) => ({ menuProductId: i.menuProductId, qty: i.qty })),
          subscription.baselineDailyQty,
        ),
      };
    })
    .filter((d) => d.items.length > 0)
    .sort((a, b) => a.date - b.date);

  const sumQty = (days: typeof week.plannedDays) =>
    days.map((d) => ({ date: d.date, qty: d.items.reduce((s, i) => s + i.qty, 0) }));
  const before = sumQty(week.plannedDays);

  await ctx.db.patch(week._id, { plannedDays });

  return { before, after: sumQty(plannedDays), dayCount: plannedDays.length };
}

/**
 * Resync a week's `plannedDays` (the Schedule Calendar view) to match the week's
 * ACTUAL orders — the source of truth for what is/was delivered and drawn down.
 *
 * Why this exists (2026-06-29): the schedule and the orders can drift apart — e.g.
 * an amend updated `plannedDays` but failed to bump the matching order (a day/date
 * mismatch), leaving the schedule showing 250 while the real, delivered order is
 * 150. Recognition draws down `order.totalAmount`, so the ORDER is authoritative;
 * the schedule must follow it. This rebuilds `plannedDays` from the non-cancelled
 * orders + their non-cancelled items, grouped by delivery date.
 *
 * Safe: touches ONLY `plannedDays` (display/plan). It does NOT change any order,
 * orderItem, production record, or credit ledger entry — so it can never alter
 * what was billed or drawn down. It only makes the schedule tell the truth.
 */
export const resyncWeekPlanFromOrders = protectedMutation({
  roles: ["order_staff", "manager", "admin"],
  args: { subscriptionWeekId: v.id("subscriptionWeeks") },
  handler: async (ctx, args) => {
    return await resyncWeekPlanInline(ctx, args.subscriptionWeekId);
  },
});
