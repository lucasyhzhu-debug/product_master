/**
 * Subscription weekly invoicing — the money-loop spine (Task B9 + B10).
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
 *   - createTopupInvoice (Task B10): builds a `subscription_topup` invoice for delta
 *     lines added mid-week (after initial invoice was sent). Does NOT change week status.
 *   - markTopupInvoicePaid (Task B10): CASH event for a topup invoice. Funds the same
 *     deferred-revenue pool via an additional `topup` ledger entry.
 */

import { v, ConvexError } from "convex/values";
import { protectedMutation } from "../lib/functions";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
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

// ---------------------------------------------------------------------------
// Shared helper — fund a week's deferred-revenue pool from a paid invoice.
// Idempotent: if a creditLedger entry already exists for this invoiceId, no-ops.
// Returns true if funding was applied, false if already funded (idempotent skip).
// Used by both markWeeklyInvoicePaid and markTopupInvoicePaid.
// ---------------------------------------------------------------------------
async function fundWeek(
  ctx: MutationCtx,
  weekId: Id<"subscriptionWeeks">,
  invoiceId: Id<"invoices">,
  createdBy: Id<"users">,
  note: string,
): Promise<boolean> {
  const invoice = await ctx.db.get(invoiceId);
  if (!invoice) throw new ConvexError("Invoice not found");

  // Idempotency: one topup ledger entry per invoice.
  const existing = await ctx.db
    .query("creditLedger")
    .withIndex("by_invoice", (q) => q.eq("invoiceId", invoiceId))
    .first();
  if (existing) return false; // already funded

  const week = await ctx.db.get(weekId);
  if (!week) throw new ConvexError("Week not found");

  await postLedgerEntry(ctx, {
    subscriptionId: week.subscriptionId,
    subscriptionWeekId: weekId,
    type: "topup",
    amount: invoice.finalTotal,
    createdBy,
    invoiceId,
    note,
  });
  await ctx.db.patch(invoiceId, { paymentStatus: "Paid", updatedAt: Date.now() });
  return true;
}

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

    // Fund the deferred-revenue pool (cash in → unearned liability). NOT sales yet.
    // fundWeek handles idempotency (by_invoice) and the ledger+patch atomically.
    const funded = await fundWeek(
      ctx,
      week._id,
      weeklyInvoiceId,
      ctx.user._id,
      "Weekly credit funded (deferred revenue)",
    );
    if (!funded) return week._id; // already funded — idempotent short-circuit

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

/**
 * Build a `subscription_topup` invoice for delta lines added to a week mid-cycle.
 *
 * Idempotency is NOT enforced here (multiple top-ups on the same week are valid —
 * each represents a distinct schedule edit). The caller is responsible for deduplicating
 * if needed. The resulting invoice is independent of weeklyInvoiceId: it is linked only
 * via subscriptionWeekId. Does NOT change week status (week stays delivering/invoiced).
 *
 * Items are the caller-supplied delta lines (ScheduleLine shape). date is omitted on
 * top-up lines (the mid-week edit does not assign a specific delivery date per line).
 */
export const createTopupInvoice = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    subscriptionWeekId: v.id("subscriptionWeeks"),
    addedLines: v.array(
      v.object({
        productName: v.string(),
        qty: v.number(),
        unitPrice: v.number(),
        lineTotal: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (args.addedLines.length === 0) throw new ConvexError("addedLines must not be empty");

    const week = await ctx.db.get(args.subscriptionWeekId);
    if (!week) throw new ConvexError("Week not found");

    const sub = await ctx.db.get(week.subscriptionId);
    if (!sub) throw new ConvexError("Subscription not found");
    const customer = await ctx.db.get(sub.customerId);

    const items = args.addedLines.map((it) => ({
      productName: it.productName,
      qty: it.qty,
      unitPrice: it.unitPrice,
      lineTotal: it.lineTotal,
      // date intentionally omitted — topup lines are not tied to a specific delivery date
    }));
    const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);

    const invoiceNumber = await getNextInvoiceNumber(ctx);

    const settings = await ctx.db.query("businessSettings").first();
    const bank = settings?.defaultBankAccountId
      ? await ctx.db.get(settings.defaultBankAccountId)
      : null;

    const now = Date.now();
    const invoiceId = await ctx.db.insert("invoices", {
      status: "final",
      invoiceNumber,
      invoiceKind: "subscription_topup",
      subscriptionWeekId: week._id,
      customerId: sub.customerId,
      // orderId intentionally omitted — top-up spans the week, not a single order
      orderNumber: `TOPUP-${getWibDateStr(week.weekStart)}`,
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
      finalTotal: subtotal,
      paymentStatus: "Unpaid",
    });

    return invoiceId;
  },
});

/**
 * Mark a top-up invoice paid — CASH event for the delta.
 *
 * Posts an additional `topup` ledger entry against the week (pool = weekly + top-ups).
 * Idempotent via creditLedger.by_invoice: a top-up can't double-fund even if called twice.
 * Does NOT change week status or mark orders paid (top-up does not generate new orders —
 * it adjusts the credit pool for the mid-week schedule edit).
 */
export const markTopupInvoicePaid = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) throw new ConvexError("Invoice not found");
    if (invoice.invoiceKind !== "subscription_topup") {
      throw new ConvexError("Invoice is not a subscription_topup invoice");
    }
    if (!invoice.subscriptionWeekId) {
      throw new ConvexError("Top-up invoice has no subscriptionWeekId");
    }
    if (invoice.paymentStatus === "Paid") {
      return invoice.subscriptionWeekId; // already paid — idempotent
    }

    await fundWeek(
      ctx,
      invoice.subscriptionWeekId,
      args.invoiceId,
      ctx.user._id,
      "Top-up credit funded (deferred revenue — mid-week schedule delta)",
    );
    return invoice.subscriptionWeekId;
  },
});
