import { v, ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { protectedMutation } from "../lib/functions";
import { computeLineTotal, computeScheduleTotal, deriveCreditPool, deriveWeekShortfall } from "./creditMath";
import { detectAboveBaseline } from "./enforcement/detectAboveBaseline";
import { insertOrderWithItems } from "../orders/helpers/insertOrder";
import { generateNextOrderNumber } from "../orders/helpers/customerResolution";
import {
  cancelProductionRecords,
  createProductionRecordsForItem,
  updateProductionRecordsForQuantityChange,
} from "../orders/helpers/productionRecords";

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

export type RemovedLine = { productName: string; qty: number; unitPrice: number; lineTotal: number };

/**
 * Pure server-side delta for the DECREASE direction: per-product positive
 * reduction between the funded plan and the amended plan, priced at unitPrice.
 * Increases are ignored. Integer IDR. Symmetric counterpart to computeTopupDelta.
 */
export function computeReduceDelta(args: {
  currentQtyByProduct: Record<string, number>;
  newQtyByProduct: Record<string, number>;
  unitPrice: number;
  productNameByProduct: Record<string, string>;
}): { removedLines: RemovedLine[]; reducedTotal: number } {
  const { currentQtyByProduct, newQtyByProduct, unitPrice, productNameByProduct } = args;
  const removedLines: RemovedLine[] = [];
  let reducedTotal = 0;
  for (const productId of Object.keys(currentQtyByProduct)) {
    const dec = (currentQtyByProduct[productId] ?? 0) - (newQtyByProduct[productId] ?? 0);
    if (dec > 0) {
      const lineTotal = computeLineTotal(dec, unitPrice);
      removedLines.push({
        productName: productNameByProduct[productId] ?? "Unknown product",
        qty: dec,
        unitPrice,
        lineTotal,
      });
      reducedTotal += lineTotal;
    }
  }
  return { removedLines, reducedTotal };
}

/**
 * Product IDs whose amended qty is below the funded qty (a decrease/removal).
 * Used to detect whether a day's plan changed in the decrease direction.
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
 * Has this order already recognized its sale (drawdown posted at delivery)?
 * Recognition is idempotent on creditLedger.by_order, so a single entry = delivered.
 */
export async function isOrderRecognized(ctx: MutationCtx, orderId: Id<"orders">): Promise<boolean> {
  // Only a `drawdown` entry means delivered/recognized. Other entry kinds
  // (refund/adjustment) may also carry an orderId in future flows — don't let
  // those falsely block an amendment of an undelivered day.
  const entry = await ctx.db
    .query("creditLedger")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .filter((q) => q.eq(q.field("type"), "drawdown"))
    .first();
  return Boolean(entry);
}

/**
 * Bump (or create) the subscription order for one amended day so the day's
 * actual delivery — and the drawdown recognized at delivery — reflects the new
 * quantity. Adjusts orderItems + production records + order totals. Increases only.
 */
async function applyDayOrder(
  ctx: MutationCtx,
  args: {
    week: { _id: Id<"subscriptionWeeks">; subscriptionId: Id<"subscriptions"> };
    sub: { customerId: Id<"customers">; unitPrice: number };
    existingOrder: { _id: Id<"orders"> } | null;
    date: number;
    items: Array<{ menuProductId: Id<"menuProducts">; qty: number; productName: string }>;
    actingUserName: string;
    actingUserId: Id<"users">;
  },
): Promise<void> {
  const { week, sub, existingOrder, date, items } = args;
  const unitPrice = sub.unitPrice;

  // No order yet for this day (it had no items at confirm time) — create one,
  // mirroring confirmWeek so the new day delivers + draws down normally.
  if (!existingOrder) {
    if (items.length === 0) return;
    const orderNumber = await generateNextOrderNumber(ctx);
    const customer = await ctx.db.get(sub.customerId);
    const totalAmount = items.reduce((s, it) => s + computeLineTotal(it.qty, unitPrice), 0);
    await insertOrderWithItems(ctx, {
      orderFields: {
        orderNumber,
        customerId: sub.customerId,
        customerName: customer?.name ?? "Customer",
        customerPhone: customer?.phone ?? "",
        status: "AwaitingPayment",
        paymentStatus: "Unpaid",
        orderDate: Date.now(),
        dueDate: date,
        deliveryDate: date,
        totalAmount,
        totalCost: 0,
        totalMargin: totalAmount,
        finalTotal: totalAmount,
        deliveryType: "Delivery",
        itemCount: items.length,
        createdBy: args.actingUserName,
        isKitchenVisible: true,
        createdByUserId: args.actingUserId,
        subscriptionId: week.subscriptionId,
        subscriptionWeekId: week._id,
        fundingSource: "subscription_credit",
      },
      items: items.map((it) => ({
        productName: it.productName,
        quantity: it.qty,
        unitPrice,
        unitCost: 0,
        discountAmount: 0,
        lineTotal: computeLineTotal(it.qty, unitPrice),
        lineCost: 0,
        lineMargin: computeLineTotal(it.qty, unitPrice),
        menuProductId: it.menuProductId,
      })),
    });
    return;
  }

  // Existing order — reconcile each line up to the amended qty (increases only).
  const orderId = existingOrder._id;
  const orderItems = await ctx.db
    .query("orderItems")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();
  const activeByProduct = new Map<string, (typeof orderItems)[number]>();
  for (const oi of orderItems) {
    if (oi.isCancelled || !oi.menuProductId) continue;
    activeByProduct.set(oi.menuProductId, oi);
  }

  let changed = false;
  const amendedProductIds = new Set<string>(items.map((it) => it.menuProductId));
  for (const it of items) {
    const existing = activeByProduct.get(it.menuProductId);
    const lineTotal = computeLineTotal(it.qty, unitPrice);
    if (existing) {
      if (it.qty === existing.quantity) continue; // unchanged
      changed = true;
      await ctx.db.patch(existing._id, {
        quantity: it.qty,
        lineTotal,
        lineMargin: lineTotal,
      });
      await updateProductionRecordsForQuantityChange(ctx, existing._id, it.menuProductId, it.qty);
    } else {
      // A product newly added to an already-existing day's order.
      changed = true;
      const newItemId = await ctx.db.insert("orderItems", {
        orderId,
        productName: it.productName,
        quantity: it.qty,
        unitPrice,
        unitCost: 0,
        discountAmount: 0,
        lineTotal,
        lineCost: 0,
        lineMargin: lineTotal,
        menuProductId: it.menuProductId,
      });
      await createProductionRecordsForItem(ctx, newItemId, it.menuProductId, it.qty);
    }
  }

  // A product present on the existing order but absent from the amended day is a
  // removal — cancel its line + production records (undelivered, so safe). Mirrors
  // the qty-down path; keeps the order total honest and stops it drawing down.
  for (const [productId, oi] of activeByProduct) {
    if (amendedProductIds.has(productId)) continue;
    changed = true;
    await ctx.db.patch(oi._id, { isCancelled: true });
    await cancelProductionRecords(ctx, oi._id);
  }

  if (!changed) return; // nothing changed on this day — skip the total recompute

  // Recompute order totals from all non-cancelled items.
  const refreshed = await ctx.db
    .query("orderItems")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();
  const active = refreshed.filter((oi) => !oi.isCancelled);
  const totalAmount = active.reduce((s, oi) => s + oi.lineTotal, 0);
  await ctx.db.patch(orderId, {
    totalAmount,
    totalCost: 0,
    totalMargin: totalAmount,
    finalTotal: totalAmount,
    itemCount: active.length,
  });
}

/**
 * Fully remove an undelivered day from the week: cancel its order so it no longer
 * delivers or draws down credit. Used when an amendment omits a previously-planned
 * day entirely (a removal — the strongest form of a decrease).
 */
async function cancelDayOrder(ctx: MutationCtx, orderId: Id<"orders">): Promise<void> {
  const orderItems = await ctx.db
    .query("orderItems")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();
  for (const oi of orderItems) {
    if (oi.isCancelled) continue;
    await ctx.db.patch(oi._id, { isCancelled: true });
    await cancelProductionRecords(ctx, oi._id);
  }
  await ctx.db.patch(orderId, {
    status: "Cancelled",
    totalAmount: 0,
    totalCost: 0,
    totalMargin: 0,
    finalTotal: 0,
    itemCount: 0,
  });
}

/**
 * Amend a confirmed/invoiced/paid/delivering week: re-price the plan, persist
 * plannedDays, and **bump each amended day's actual order** so the larger
 * delivery draws DOWN the existing credit pool at delivery (recognition.ts).
 *
 * Per user directive (2026-06-29): an amendment is NOT billed as a separate
 * invoice. The added quantity simply consumes more prepaid credit; the pool runs
 * down faster and, once planned consumption exceeds funded credit, the week shows
 * a projected shortfall that the operator can bill in ONE top-up when ready
 * (billWeekShortfall).
 *
 * Symmetric (2026-06-29 follow-up): amend now also supports DECREASES and full
 * day removals. Reducing an undelivered day shrinks its order so it draws LESS
 * credit at delivery; the leftover simply stays in the pool (projection shows a
 * smaller shortfall / a surplus). No auto-refund — surplus credit carries per the
 * subscription's rollover policy.
 *
 * Guard: a day whose order has already been delivered (recognized) cannot be
 * amended in EITHER direction — its drawdown is locked. Amend future/undelivered
 * days only.
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

    // Fill in names for products that are being REMOVED (present in the funded
    // plan but absent from the amendment) so the reduce-delta lines read sensibly.
    for (const oldDay of week.plannedDays) {
      for (const it of oldDay.items) {
        if (!(it.menuProductId in productNameByProduct)) {
          productNameByProduct[it.menuProductId] = it.productName;
        }
      }
    }

    // Amend is now symmetric: increases draw MORE credit at delivery, decreases
    // (and removals) draw LESS. Compute both directions; require at least one.
    const { addedLines, deltaTotal } = computeTopupDelta({
      currentQtyByProduct,
      newQtyByProduct,
      unitPrice,
      productNameByProduct,
    });
    const { removedLines, reducedTotal } = computeReduceDelta({
      currentQtyByProduct,
      newQtyByProduct,
      unitPrice,
      productNameByProduct,
    });
    if (deltaTotal === 0 && reducedTotal === 0) {
      throw new ConvexError("Nothing to amend — the amended plan is identical to the current plan");
    }

    // Map the week's existing orders by delivery date (non-cancelled).
    const weekOrders = await ctx.db
      .query("orders")
      .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", week._id))
      .collect();
    const orderByDate = new Map<number, (typeof weekOrders)[number]>();
    for (const o of weekOrders) {
      if (o.status === "Cancelled" || o.deliveryDate === undefined) continue;
      orderByDate.set(o.deliveryDate, o);
    }

    // Guard: block changing ANY day whose order is already delivered/recognized —
    // its drawdown is locked, so neither an increase, a decrease, nor a removal is
    // allowed. Build the set of dates whose plan differs (changed or fully removed).
    const amendedDates = new Set(args.days.map((d) => d.date));
    const affectedDates = new Set<number>();
    for (const day of args.days) {
      const dayCurrent = aggregateQtyByProduct(week.plannedDays.filter((d) => d.date === day.date));
      const dayNew = aggregateQtyByProduct([day]);
      const allPids = new Set([...Object.keys(dayCurrent), ...Object.keys(dayNew)]);
      const changed = [...allPids].some((pid) => (dayNew[pid] ?? 0) !== (dayCurrent[pid] ?? 0));
      if (changed) affectedDates.add(day.date);
    }
    // Omitted days (planned with items, absent from the amendment) = full removals.
    for (const oldDay of week.plannedDays) {
      if (oldDay.items.length > 0 && !amendedDates.has(oldDay.date)) {
        affectedDates.add(oldDay.date);
      }
    }
    for (const date of affectedDates) {
      const order = orderByDate.get(date);
      if (order && (await isOrderRecognized(ctx, order._id))) {
        throw new ConvexError(
          `Cannot amend the day starting ${new Date(date).toISOString().slice(0, 10)} — ` +
            `it has already been delivered. Amend only future/undelivered days.`,
        );
      }
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
        needsSupplierConfirmation: detectAboveBaseline(day.items, subscription.baselineDailyQty),
      }))
      .filter((d) => d.items.length > 0)
      .sort((a, b) => a.date - b.date);
    await ctx.db.patch(week._id, { plannedDays });

    // Bump each amended day's order so the larger delivery draws down credit.
    for (const day of plannedDays) {
      await applyDayOrder(ctx, {
        week: { _id: week._id, subscriptionId: week.subscriptionId },
        sub: { customerId: subscription.customerId, unitPrice },
        existingOrder: orderByDate.get(day.date) ?? null,
        date: day.date,
        items: day.items.map((it) => ({
          menuProductId: it.menuProductId,
          qty: it.qty,
          productName: it.productName,
        })),
        actingUserName: ctx.user.name,
        actingUserId: ctx.user._id,
      });
    }

    // Cancel orders for days that were planned but omitted from the amendment
    // (full removals). Recognized days were already blocked above.
    const keptDates = new Set(plannedDays.map((d) => d.date));
    for (const oldDay of week.plannedDays) {
      if (oldDay.items.length > 0 && !keptDates.has(oldDay.date)) {
        const order = orderByDate.get(oldDay.date);
        if (order) await cancelDayOrder(ctx, order._id);
      }
    }

    // Report the projected end-of-week credit position (no invoice created).
    const ledger = await ctx.db
      .query("creditLedger")
      .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", week._id))
      .collect();
    const { creditIssued } = deriveCreditPool(ledger.map((e) => ({ type: e.type, amount: e.amount })));
    const plannedConsumption = computeScheduleTotal(plannedDays);
    const { projectedShortfall, projectedEndingPool } = deriveWeekShortfall({
      plannedConsumption,
      creditIssued,
    });

    return { deltaTotal, addedLines, reducedTotal, removedLines, projectedShortfall, projectedEndingPool };
  },
});
