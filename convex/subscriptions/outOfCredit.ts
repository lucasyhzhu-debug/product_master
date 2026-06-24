/**
 * Out-of-credit handling — §8 Paths A and B.
 *
 * Path A  splitScheduledOrderOnCredit
 *   Scheduler-time: a planned-day order total exceeds remaining credit.
 *   Covered qty = floor(remainingCredit / unitPrice) items are kept on the
 *   subscription credit drawdown; the uncovered remainder becomes a top-up
 *   invoice (createTopupInvoice) so the customer is billed separately.
 *   Splitting happens here (before kanban); the kanban never sees the split.
 *
 * Path B  applyPartialCreditToAdHocOrder
 *   An ad-hoc order arrives while some credit remains. Apply
 *   min(remainingCredit, orderTotal) as a drawdown, label fundingSource
 *   "deposit" (the credit acts as a deposit against the order), leave the
 *   uncovered remainder on normal billing (status AwaitingPayment) so the
 *   existing QRIS / bank flow handles it. No new deposit subsystem (§13.2).
 */

import { v, ConvexError } from "convex/values";
import { protectedMutation } from "../lib/functions";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getNextInvoiceNumber } from "../invoices/mutations";
import { getWibDateStr } from "../lib/periodRange";
import { postLedgerEntry } from "./ledger";

// ---------------------------------------------------------------------------
// Pure split-math helpers — unit-testable, no Convex context needed.
// ---------------------------------------------------------------------------

/**
 * Integer IDR: how many units can be covered by the available credit?
 * Uses floor division so we never over-draw.
 *
 * @param remainingCredit  IDR remaining in the credit pool (≥ 0)
 * @param unitPrice        IDR per unit (> 0)
 * @returns                number of units covered (may be 0)
 */
export function coveredQty(remainingCredit: number, unitPrice: number): number {
  if (unitPrice <= 0) return 0;
  return Math.floor(remainingCredit / unitPrice);
}

/**
 * Remainder qty that cannot be covered by credit.
 *
 * @param totalQty  original order-item quantity
 * @param covered   output of coveredQty()
 * @returns         qty that must go on a top-up invoice
 */
export function remainderQty(totalQty: number, covered: number): number {
  return totalQty - covered;
}

// ---------------------------------------------------------------------------
// Internal helper — build a subscription_topup invoice inside a mutation ctx.
// Static imports only (Convex Pitfall #8: no dynamic import()).
// ---------------------------------------------------------------------------
async function createTopupInvoiceInternal(
  ctx: MutationCtx,
  args: {
    subscriptionWeekId: Id<"subscriptionWeeks">;
    productName: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
    generatedBy: Id<"users">;
  },
): Promise<Id<"invoices">> {
  const week = await ctx.db.get(args.subscriptionWeekId);
  if (!week) throw new ConvexError("Subscription week not found");

  const sub = await ctx.db.get(week.subscriptionId);
  if (!sub) throw new ConvexError("Subscription not found");
  const customer = await ctx.db.get(sub.customerId);

  const settings = await ctx.db.query("businessSettings").first();
  const bank = settings?.defaultBankAccountId
    ? await ctx.db.get(settings.defaultBankAccountId)
    : null;

  const now = Date.now();
  const invoiceNumber = await getNextInvoiceNumber(ctx);

  return ctx.db.insert("invoices", {
    status: "final",
    invoiceNumber,
    invoiceKind: "subscription_topup",
    subscriptionWeekId: week._id,
    customerId: sub.customerId,
    orderNumber: `TOPUP-${getWibDateStr(week.weekStart)}`,
    orderDate: week.weekStart,
    generatedAt: now,
    generatedBy: args.generatedBy,
    updatedAt: now,
    sellerName: settings?.businessName ?? "Frollie",
    sellerAddress: settings?.address,
    sellerPhone: settings?.phone,
    sellerEmail: settings?.email,
    sellerNpwp: settings?.npwp,
    sellerLogoStorageId: settings?.logoStorageId,
    bankName: bank?.bankName ?? "",
    bankAccountNumber: bank?.accountNumber ?? "",
    bankAccountName: bank?.name ?? "",
    buyerName: customer?.name ?? "Customer",
    buyerCompany: customer?.companyName,
    buyerNpwp: customer?.npwp,
    buyerAddress: customer?.billingAddress ?? customer?.defaultAddress,
    buyerPhone: customer?.phone,
    items: [
      {
        productName: args.productName,
        qty: args.qty,
        unitPrice: args.unitPrice,
        lineTotal: args.lineTotal,
      },
    ],
    subtotal: args.lineTotal,
    finalTotal: args.lineTotal,
    paymentStatus: "Unpaid",
  });
}

// ---------------------------------------------------------------------------
// Path A — split a scheduled order when credit is insufficient
// ---------------------------------------------------------------------------

/**
 * splitScheduledOrderOnCredit (Path A)
 *
 * When a scheduled-day's single-item order total exceeds remaining credit:
 *   1. Compute covered qty = floor(remainingCredit / unitPrice).
 *   2. Patch the order item to the covered qty and update the order totals.
 *   3. Post a `drawdown` ledger entry for the covered amount (negative, IDR).
 *   4. Route the uncovered remainder to a subscription_topup invoice.
 *
 * Constraints (enforced):
 *   - The order must belong to a subscription week.
 *   - The order must have exactly ONE active (non-cancelled) item. Multi-item
 *     splits require a separate scheduler step outside this mutation.
 *   - If covered qty = 0: the entire order is cancelled and routed to a top-up
 *     invoice (zero-qty subscription order is invalid in the kanban).
 *   - If covered qty ≥ total qty: full drawdown, no split needed.
 *
 * Returns: { coveredOrderId, topupInvoiceId | null, drawdownAmount }
 */
export const splitScheduledOrderOnCredit = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError("Order not found");
    if (!order.subscriptionId || !order.subscriptionWeekId) {
      throw new ConvexError("Order is not linked to a subscription week");
    }

    const week = await ctx.db.get(order.subscriptionWeekId);
    if (!week) throw new ConvexError("Subscription week not found");

    // Remaining credit from the denormalised pool (source of truth = ledger replay).
    const remaining = week.creditRemaining;
    if (remaining < 0) {
      throw new ConvexError(`Week credit is already overdrawn (${remaining} IDR)`);
    }

    // Load active (non-cancelled) order items.
    const allItems = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();
    const items = allItems.filter((it) => !it.isCancelled);

    if (items.length === 0) throw new ConvexError("Order has no active items");
    if (items.length > 1) {
      throw new ConvexError(
        "splitScheduledOrderOnCredit only supports single-item orders; " +
          "split each item individually for multi-item orders",
      );
    }

    const item = items[0];
    const totalQty = item.quantity;
    const unitPrice = item.unitPrice; // integer IDR snapshot

    // Integer floor division — never over-draw the pool.
    const covered = coveredQty(remaining, unitPrice);
    const remainder = remainderQty(totalQty, covered);

    // ── Case 1: full coverage — no split needed ──────────────────────────────
    if (covered >= totalQty) {
      const drawdownAmount = -(totalQty * unitPrice); // negative = debit pool
      await postLedgerEntry(ctx, {
        subscriptionId: order.subscriptionId,
        subscriptionWeekId: order.subscriptionWeekId,
        type: "drawdown",
        amount: drawdownAmount,
        createdBy: ctx.user._id,
        orderId: order._id,
        note: `Full credit drawdown on order ${order.orderNumber}`,
      });
      return {
        coveredOrderId: order._id as Id<"orders"> | null,
        topupInvoiceId: null as Id<"invoices"> | null,
        drawdownAmount,
      };
    }

    // ── Case 2: zero coverage — entire order routes to a top-up invoice ──────
    if (covered === 0) {
      // Cancel the order — a zero-qty subscription order is invalid.
      await ctx.db.patch(order._id, { status: "Cancelled" });

      const topupInvoiceId = await createTopupInvoiceInternal(ctx, {
        subscriptionWeekId: order.subscriptionWeekId,
        productName: item.productName,
        qty: totalQty,
        unitPrice,
        lineTotal: totalQty * unitPrice,
        generatedBy: ctx.user._id,
      });

      return {
        coveredOrderId: null as Id<"orders"> | null,
        topupInvoiceId: topupInvoiceId as Id<"invoices"> | null,
        drawdownAmount: 0,
      };
    }

    // ── Case 3: partial coverage — split the order item ──────────────────────
    const coveredLineTotal = covered * unitPrice; // integer IDR
    const remainderLineTotal = remainder * unitPrice; // integer IDR

    // Patch the existing order item to the covered qty.
    await ctx.db.patch(item._id, {
      quantity: covered,
      lineTotal: coveredLineTotal,
      lineCost: 0, // COGS from BOM, not partner price
      lineMargin: coveredLineTotal,
    });

    // Update order-level totals to reflect the covered portion only.
    await ctx.db.patch(order._id, {
      totalAmount: coveredLineTotal,
      totalMargin: coveredLineTotal,
      finalTotal: coveredLineTotal,
    });

    // Post the drawdown for the covered portion (negative signed IDR).
    const drawdownAmount = -coveredLineTotal;
    await postLedgerEntry(ctx, {
      subscriptionId: order.subscriptionId,
      subscriptionWeekId: order.subscriptionWeekId,
      type: "drawdown",
      amount: drawdownAmount,
      createdBy: ctx.user._id,
      orderId: order._id,
      note: `Partial credit drawdown — ${covered}/${totalQty} units on ${order.orderNumber}`,
    });

    // Route the uncovered remainder to a subscription_topup invoice.
    const topupInvoiceId = await createTopupInvoiceInternal(ctx, {
      subscriptionWeekId: order.subscriptionWeekId,
      productName: item.productName,
      qty: remainder,
      unitPrice,
      lineTotal: remainderLineTotal,
      generatedBy: ctx.user._id,
    });

    return {
      coveredOrderId: order._id as Id<"orders"> | null,
      topupInvoiceId: topupInvoiceId as Id<"invoices"> | null,
      drawdownAmount,
    };
  },
});

// ---------------------------------------------------------------------------
// Path B — apply partial credit to an ad-hoc order
// ---------------------------------------------------------------------------

/**
 * applyPartialCreditToAdHocOrder (Path B)
 *
 * For an ad-hoc order placed by a subscription customer when some credit remains:
 *   1. coveredAmount = min(remainingCredit, order.finalTotal) — integer IDR.
 *   2. Post a `drawdown` ledger entry for coveredAmount (negative, IDR).
 *   3. Set order.fundingSource = "deposit" (credit acting as a pre-payment).
 *   4. Leave order at status "AwaitingPayment" — the uncovered remainder is
 *      collected via the normal QRIS / bank flow. No new deposit subsystem (§13.2).
 *
 * Constraints:
 *   - The order must be linked to a subscription (subscriptionId + subscriptionWeekId).
 *   - The order must be at status "AwaitingPayment"; already-paid orders are
 *     rejected to prevent double-drawdown.
 *   - If remainingCredit = 0, no-ops and returns coveredAmount = 0.
 *
 * Returns: { coveredAmount, remainderAmount }
 */
export const applyPartialCreditToAdHocOrder = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    orderId: v.id("orders"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError("Order not found");
    if (!order.subscriptionId || !order.subscriptionWeekId) {
      throw new ConvexError("Order is not linked to a subscription week");
    }
    if (order.paymentStatus === "Paid") {
      throw new ConvexError("Order is already paid — cannot apply credit");
    }
    if (order.status !== "AwaitingPayment") {
      throw new ConvexError(
        `Order status is ${order.status}; only AwaitingPayment orders can receive a credit application`,
      );
    }

    const week = await ctx.db.get(order.subscriptionWeekId);
    if (!week) throw new ConvexError("Subscription week not found");

    const remaining = week.creditRemaining;

    // No-op when the pool is empty.
    if (remaining <= 0) {
      return { coveredAmount: 0, remainderAmount: order.finalTotal };
    }

    // Integer IDR: never apply more than the order total.
    const coveredAmount = Math.min(remaining, order.finalTotal);
    const remainderAmount = order.finalTotal - coveredAmount;

    // Post the drawdown (negative = debit the pool).
    await postLedgerEntry(ctx, {
      subscriptionId: order.subscriptionId,
      subscriptionWeekId: order.subscriptionWeekId,
      type: "drawdown",
      amount: -coveredAmount,
      createdBy: ctx.user._id,
      orderId: order._id,
      note: `Ad-hoc credit application on ${order.orderNumber} (${coveredAmount} IDR of ${order.finalTotal} IDR total)`,
    });

    // Label the order as deposit-funded; leave AwaitingPayment for the remainder.
    await ctx.db.patch(order._id, {
      fundingSource: "deposit",
      // status intentionally stays AwaitingPayment — remainder handled by QRIS/bank
    });

    return { coveredAmount, remainderAmount };
  },
});
