import { v, ConvexError } from "convex/values";
import { protectedMutation } from "../lib/functions";
import { buildTopupInvoice } from "./invoicing";
import { computeLineTotal } from "./creditMath";

/**
 * Aggregate total qty per menuProductId across all days in a plan.
 * Pure helper — no Convex context required; unit-testable.
 */
export function aggregateQtyByProduct(
  days: Array<{ items: Array<{ menuProductId: string; qty: number }> }>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const day of days) {
    for (const it of day.items) {
      result[it.menuProductId] = (result[it.menuProductId] ?? 0) + it.qty;
    }
  }
  return result;
}

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
 * Product IDs whose amended qty is below the funded qty (a decrease/removal).
 * v1 amend is increases-only.
 */
export function findProductDecreases(
  currentQtyByProduct: Record<string, number>,
  newQtyByProduct: Record<string, number>,
): string[] {
  const decreased: string[] = [];
  for (const productId of Object.keys(currentQtyByProduct)) {
    if ((newQtyByProduct[productId] ?? 0) < (currentQtyByProduct[productId] ?? 0)) {
      decreased.push(productId);
    }
  }
  return decreased;
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

    // Aggregate current (funded) vs new qty per product.
    const currentQtyByProduct = aggregateQtyByProduct(week.plannedDays);
    const newQtyByProduct = aggregateQtyByProduct(args.days);

    // Batch-resolve product names for every unique menuProductId in the amendment.
    const uniqueProductIds = [...new Set(args.days.flatMap((d) => d.items.map((it) => it.menuProductId)))];
    const productDocs = await Promise.all(uniqueProductIds.map((id) => ctx.db.get(id)));
    const productNameByProduct: Record<string, string> = {};
    for (let i = 0; i < uniqueProductIds.length; i++) {
      const mp = productDocs[i];
      if (!mp) throw new ConvexError(`Menu product ${uniqueProductIds[i]} not found`);
      productNameByProduct[uniqueProductIds[i]] = mp.name;
    }

    const decreases = findProductDecreases(currentQtyByProduct, newQtyByProduct);
    if (decreases.length > 0) {
      throw new ConvexError(
        "Amend supports increases only — one or more products would decrease or be removed. " +
          "Handle reductions via reconcile/refund, not amend.",
      );
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
        deliverByTime: week.plannedDays.find((d) => d.date === day.date)?.deliverByTime ?? subscription.deliverByTime ?? "17:00",
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
