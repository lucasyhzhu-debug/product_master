/**
 * editUndeliveredSubscriptionOrder — Slice 2 MONEY-PATH orchestrator.
 *
 * Staff reduce (or remove) pieces on a not-yet-delivered subscription order
 * before it ships. This is a thin orchestrator that:
 *   1. guards: must be a subscription order, undelivered (deny-list), not already
 *      recognized (no by_order ledger row), and the week not settled.
 *   2. applies per-line REDUCTIONS / removals by reusing the proven itemCrud math
 *      (extracted into internal helpers — Convex mutations can't call mutations).
 *   3. re-derives the credit reservation DOWN (Pitfall #23): recognition draws
 *      `subscriptionCreditApplied ?? totalAmount` at delivery, and
 *      `computeWeekAvailableCredit` nets the reservation over un-recognized orders.
 *      A stale-high reservation over-draws the pool at delivery AND under-reports
 *      available credit meanwhile — so cap it to the fresh total.
 *   4. resyncs the week plan inline (preserving the settled-week guard).
 *
 * Slice 2 is REDUCE-ONLY: increasing a line is rejected ("add more" = new order).
 *
 * Roles: order_staff edits daily orders (route = canAccessOrders, Pitfall #19);
 * manager + admin also permitted. T9 widens resyncWeekPlanFromOrders to match.
 */
import { v, ConvexError } from "convex/values";
import { protectedMutation } from "../lib/functions";
import { DELIVERY_DONE_STATUSES } from "./queries";
import {
  removeItemInternal,
  updateItemQuantityInternal,
} from "../orders/mutations/itemCrud";
import { resyncWeekPlanInline } from "./resyncPlan";

export const editUndeliveredSubscriptionOrder = protectedMutation({
  roles: ["order_staff", "manager", "admin"],
  args: {
    orderId: v.id("orders"),
    lines: v.array(
      v.object({
        itemId: v.id("orderItems"),
        newQty: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError("Order not found");
    if (!order.subscriptionId || !order.subscriptionWeekId) {
      throw new ConvexError("Not a subscription order");
    }

    // "Undelivered" is a DENY-list (shared DELIVERY_DONE_STATUSES — no drift).
    if (order.status === "Cancelled" || DELIVERY_DONE_STATUSES.has(order.status)) {
      throw new ConvexError(
        `Order is ${order.status} — only undelivered subscription orders can be edited here`,
      );
    }

    // Recognized backstop: an order with a by_order drawdown row already drew the
    // pool down at delivery — editing it would desync billed vs delivered.
    const recognized = await ctx.db
      .query("creditLedger")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .first();
    if (recognized) {
      throw new ConvexError("Order already recognized — cannot edit");
    }

    // Apply per-line reductions / removals (REUSE itemCrud math via internal helpers).
    for (const ln of args.lines) {
      const item = await ctx.db.get(ln.itemId);
      if (!item || item.orderId !== order._id) {
        throw new ConvexError("Item is not on this order");
      }
      if (ln.newQty <= 0) {
        await removeItemInternal(ctx, ln.itemId);
      } else if (ln.newQty < item.quantity) {
        await updateItemQuantityInternal(ctx, ln.itemId, ln.newQty);
      } else if (ln.newQty > item.quantity) {
        throw new ConvexError(
          "Slice 2 only reduces — use 'add more' (a new order) to increase quantity",
        );
      }
      // ln.newQty === item.quantity → no-op
    }

    // Re-derive the credit reservation DOWN (Pitfall #23). Eligible lines were
    // priced at the subscription's partner unitPrice at creation; reductions only
    // lower the eligible total, so a Math.min cap is correct for reduce-only (no
    // full re-split needed). Only touch credit-funded orders (reservation > 0).
    const fresh = await ctx.db.get(args.orderId);
    if (fresh && (fresh.subscriptionCreditApplied ?? 0) > 0) {
      const newReservation = Math.min(fresh.subscriptionCreditApplied!, fresh.totalAmount);
      if (newReservation !== fresh.subscriptionCreditApplied) {
        await ctx.db.patch(args.orderId, { subscriptionCreditApplied: newReservation });
      }
    }

    // Snap the week's plannedDays to the new order reality. Throws on a settled
    // (reconciled/closed) week — editing there must fail loudly.
    await resyncWeekPlanInline(ctx, order.subscriptionWeekId);

    return { ok: true as const };
  },
});
