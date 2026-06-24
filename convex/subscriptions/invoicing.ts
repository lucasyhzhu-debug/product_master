/**
 * Subscription weekly invoicing — the money-loop spine (Task B9).
 *
 * Deferred-revenue model (user directive 2026-06-23): the weekly credit is a
 * PREPAID VOUCHER. Cash and sales are SEPARATE events.
 *   - createSubscriptionWeeklyInvoice: builds the `final` weekly invoice from the
 *     week's plannedDays. The invoiceNumber (INV-YYMM-NNN) is the customer's
 *     bank-transfer reference (gap#1).
 *   - markWeeklyInvoicePaid: CASH event. Funds the deferred-revenue pool (a `topup`
 *     ledger entry = the liability balance) and marks the week's orders cash-Paid.
 *     Posts NO drawdown — sales are recognized per order at delivery
 *     (see recognition.ts / recognizeSubscriptionDelivery).
 */

import { v, ConvexError } from "convex/values";
import { protectedMutation } from "../lib/functions";
import { getNextInvoiceNumber } from "../invoices/mutations";
import { getWibDateStr } from "../lib/periodRange";
import { postLedgerEntry } from "./ledger";

/**
 * Build a `final` subscription weekly invoice from a confirmed/planned week.
 *
 * Idempotent: if the week already has a weeklyInvoiceId, returns it unchanged.
 * The invoice has NO orderId (a subscription week spans many orders); it carries
 * `customerId` (denormalized, B0) so it is reachable by customer, and a synthetic
 * `orderNumber` = `WEEK-<weekStart YYYY-MM-DD>` (the invoices schema requires
 * orderNumber). The invoiceNumber is the customer's bank-transfer reference.
 */
export const createSubscriptionWeeklyInvoice = protectedMutation({
  roles: ["manager", "admin"],
  args: { subscriptionWeekId: v.id("subscriptionWeeks") },
  handler: async (ctx, args) => {
    const week = await ctx.db.get(args.subscriptionWeekId);
    if (!week) throw new ConvexError("Week not found");
    if (week.weeklyInvoiceId) return week.weeklyInvoiceId; // idempotent

    const sub = await ctx.db.get(week.subscriptionId);
    if (!sub) throw new ConvexError("Subscription not found");
    const customer = await ctx.db.get(sub.customerId);

    // One invoice line per planned item; each line carries its delivery `date`.
    const items = week.plannedDays.flatMap((d) =>
      d.items.map((it) => ({
        productName: it.productName,
        qty: it.qty,
        unitPrice: it.unitPrice,
        lineTotal: it.lineTotal,
        date: d.date,
      })),
    );
    const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);

    const invoiceNumber = await getNextInvoiceNumber(ctx);

    // Mirror createDraft's seller/bank snapshot. Field names grounded against
    // businessSettings (businessName/address/...) and bankAccounts (bankName/
    // accountNumber/name) — NOT the brief's pseudocode names.
    const settings = await ctx.db.query("businessSettings").first();
    const bank = settings?.defaultBankAccountId
      ? await ctx.db.get(settings.defaultBankAccountId)
      : null;

    const now = Date.now();
    const invoiceId = await ctx.db.insert("invoices", {
      status: "final",
      invoiceNumber,
      invoiceKind: "subscription_weekly",
      subscriptionWeekId: week._id,
      customerId: sub.customerId,
      // orderId intentionally omitted — a subscription invoice has no single order.
      orderNumber: `WEEK-${getWibDateStr(week.weekStart)}`,
      orderDate: week.weekStart,
      generatedAt: now,
      generatedBy: ctx.user._id,
      updatedAt: now,
      // Seller snapshot
      sellerName: settings?.businessName ?? "Frollie",
      sellerAddress: settings?.address,
      sellerPhone: settings?.phone,
      sellerEmail: settings?.email,
      sellerNpwp: settings?.npwp,
      sellerLogoStorageId: settings?.logoStorageId,
      // Bank snapshot
      bankName: bank?.bankName ?? "",
      bankAccountNumber: bank?.accountNumber ?? "",
      bankAccountName: bank?.name ?? "",
      // Buyer snapshot
      buyerName: customer?.name ?? "Customer",
      buyerCompany: customer?.companyName,
      buyerNpwp: customer?.npwp,
      buyerAddress: customer?.billingAddress ?? customer?.defaultAddress,
      buyerPhone: customer?.phone,
      items,
      subtotal,
      finalTotal: subtotal, // required field is finalTotal (there is no `total`)
      paymentStatus: "Unpaid",
    });

    await ctx.db.patch(week._id, { weeklyInvoiceId: invoiceId, status: "invoiced" });
    return invoiceId;
  },
});

/**
 * Mark the week's weekly invoice paid — CASH event only.
 *
 * Funds the deferred-revenue pool via a single `topup` ledger entry
 * (amount = invoice finalTotal), settles the invoice, and marks the week's
 * generated orders cash-Paid (paid from the prepaid credit). It does NOT post a
 * drawdown and does NOT recognize sales — that happens per order at delivery
 * (recognizeSubscriptionDelivery). Idempotent via creditLedger.by_invoice.
 */
export const markWeeklyInvoicePaid = protectedMutation({
  roles: ["manager", "admin"],
  args: { subscriptionWeekId: v.id("subscriptionWeeks") },
  handler: async (ctx, args) => {
    const week = await ctx.db.get(args.subscriptionWeekId);
    if (!week) throw new ConvexError("Week not found");
    if (!week.weeklyInvoiceId) throw new ConvexError("No weekly invoice to pay");
    if (week.status !== "invoiced") {
      throw new ConvexError(`Week is ${week.status}, expected invoiced`);
    }
    const weeklyInvoiceId = week.weeklyInvoiceId;
    const invoice = await ctx.db.get(weeklyInvoiceId);
    const total = invoice?.finalTotal ?? 0;

    // Idempotency: if a topup for this invoice already exists, don't double-fund.
    const existingTopup = await ctx.db
      .query("creditLedger")
      .withIndex("by_invoice", (q) => q.eq("invoiceId", weeklyInvoiceId))
      .first();
    if (existingTopup) return week._id;

    // Fund the deferred-revenue pool (cash in → unearned liability). NOT sales yet.
    await postLedgerEntry(ctx, {
      subscriptionId: week.subscriptionId,
      subscriptionWeekId: week._id,
      type: "topup",
      amount: total,
      createdBy: ctx.user._id,
      invoiceId: weeklyInvoiceId,
      note: "Weekly credit funded (deferred revenue)",
    });
    await ctx.db.patch(weeklyInvoiceId, { paymentStatus: "Paid", updatedAt: Date.now() });

    // Orders are cash-settled from the prepaid voucher, but NOT yet drawn down /
    // recognized. Drawdown + revenue recognition happen at each delivery.
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", week._id))
      .collect();
    for (const order of orders) {
      await ctx.db.patch(order._id, {
        paymentStatus: "Paid",
        paymentMethod: "subscription_credit",
        status: "PaymentReceived",
      });
    }
    await ctx.db.patch(week._id, { status: "delivering", paymentReceivedAt: Date.now() });
    return week._id;
  },
});
