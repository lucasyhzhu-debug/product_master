import { v, ConvexError } from "convex/values";
import { protectedMutation } from "../lib/functions";
import { buildTopupInvoice } from "./invoicing";
import { computeLineTotal } from "./creditMath";

export type TopupLine = { productName: string; qty: number; unitPrice: number; lineTotal: number };

/**
 * Pure server-side delta: per-product positive increase between the funded plan
 * and the amended plan, priced at unitPrice. Decreases are ignored (v1 increases
 * only). Integer IDR. C10: money math lives here, unit-tested.
 */
export function computeTopupDelta(args: {
  currentQtyByProduct: Record<string, number>;
  newQtyByProduct: Record<string, number>;
  unitPrice: number;
  productNameByProduct: Record<string, string>;
}): { addedLines: TopupLine[]; deltaTotal: number } {
  const { currentQtyByProduct, newQtyByProduct, unitPrice, productNameByProduct } = args;
  const addedLines: TopupLine[] = [];
  let deltaTotal = 0;
  for (const productId of Object.keys(newQtyByProduct)) {
    const inc = (newQtyByProduct[productId] ?? 0) - (currentQtyByProduct[productId] ?? 0);
    if (inc > 0) {
      const lineTotal = computeLineTotal(inc, unitPrice);
      addedLines.push({
        productName: productNameByProduct[productId] ?? "Unknown product",
        qty: inc,
        unitPrice,
        lineTotal,
      });
      deltaTotal += lineTotal;
    }
  }
  return { addedLines, deltaTotal };
}

/**
 * Amend a confirmed/invoiced/paid week: re-price the plan, persist plannedDays,
 * and bill the positive delta as an UNPAID subscription_topup invoice (settled
 * later via the existing markTopupInvoicePaid flow). Does NOT regenerate per-day
 * orders for the added qty (R3 — consistent with the existing topup model).
 */
export const amendConfirmedWeek = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    subscriptionWeekId: v.id("subscriptionWeeks"),
    days: v.array(
      v.object({
        date: v.number(),
        items: v.array(v.object({ menuProductId: v.id("menuProducts"), qty: v.number() })),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const week = await ctx.db.get(args.subscriptionWeekId);
    if (!week) throw new ConvexError("Subscription week not found");
    if (!["confirmed", "invoiced", "paid", "delivering"].includes(week.status)) {
      throw new ConvexError(
        `Week status is ${week.status}; only a confirmed/invoiced/paid/delivering week can be amended ` +
          `(use the normal Save Plan for a planned week)`,
      );
    }
    const subscription = await ctx.db.get(week.subscriptionId);
    if (!subscription) throw new ConvexError("Subscription not found");
    const unitPrice = subscription.unitPrice;

    // Resolve product names for every menuProductId in the amendment.
    const productNameByProduct: Record<string, string> = {};
    for (const day of args.days) {
      for (const it of day.items) {
        if (!productNameByProduct[it.menuProductId]) {
          const mp = await ctx.db.get(it.menuProductId);
          if (!mp) throw new ConvexError(`Menu product ${it.menuProductId} not found`);
          productNameByProduct[it.menuProductId] = mp.name;
        }
      }
    }

    // Aggregate current (funded) vs new qty per product.
    const currentQtyByProduct: Record<string, number> = {};
    for (const day of week.plannedDays) {
      for (const it of day.items) {
        currentQtyByProduct[it.menuProductId] = (currentQtyByProduct[it.menuProductId] ?? 0) + it.qty;
      }
    }
    const newQtyByProduct: Record<string, number> = {};
    for (const day of args.days) {
      for (const it of day.items) {
        newQtyByProduct[it.menuProductId] = (newQtyByProduct[it.menuProductId] ?? 0) + it.qty;
      }
    }

    const { addedLines, deltaTotal } = computeTopupDelta({
      currentQtyByProduct,
      newQtyByProduct,
      unitPrice,
      productNameByProduct,
    });
    if (deltaTotal <= 0) {
      throw new ConvexError("Amend supports increases only — the amended plan does not add quantity");
    }

    // Re-price + persist the amended plannedDays (mirrors saveWeekPlan pricing).
    const plannedDays = args.days
      .map((day) => ({
        date: day.date,
        deliverByTime: week.plannedDays.find((d) => d.date === day.date)?.deliverByTime ?? "17:00",
        locked: true,
        items: day.items.map((it) => ({
          menuProductId: it.menuProductId,
          productName: productNameByProduct[it.menuProductId],
          qty: it.qty,
          unitPrice,
          lineTotal: computeLineTotal(it.qty, unitPrice),
        })),
      }))
      .filter((d) => d.items.length > 0)
      .sort((a, b) => a.date - b.date);
    await ctx.db.patch(week._id, { plannedDays });

    // Bill the delta as an unpaid top-up invoice (settled via markTopupInvoicePaid).
    const topupInvoiceId = await buildTopupInvoice(ctx, {
      subscriptionWeekId: week._id,
      items: addedLines,
      generatedBy: ctx.user._id,
    });

    return { topupInvoiceId, deltaTotal, addedLines };
  },
});
