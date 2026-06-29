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
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getNextInvoiceNumber } from "../invoices/mutations";
import { getWibDateStr } from "../lib/periodRange";
import { isTerminalStatus } from "../orders/helpers/statusTransitions";
import { postLedgerEntry } from "./ledger";
import { computeScheduleTotal, deriveCreditPool, deriveWeekShortfall } from "./creditMath";

/**
 * Fallback company bank account for invoice snapshots when no default bank
 * account is configured in Business Settings (`businessSettings.defaultBankAccountId`).
 *
 * WHY: subscription invoices snapshot bank details at creation. If the default
 * bank is unset, the fields would snapshot empty strings and the invoice / WhatsApp
 * draft would ship a blank "transfer to" account (silent failure). This mirrors the
 * canonical order-confirmation account hardcoded in `src/lib/whatsappTemplates.ts`.
 * The CONFIGURED default (when present) always wins — this is only a safety net.
 * Operators should still configure the real default at /bank-accounts + /business-settings.
 */
export const DEFAULT_BANK = {
  bankName: "BCA",
  accountNumber: "6044830994",
  name: "PT Malo Group Bahagia",
} as const;

// ---------------------------------------------------------------------------
// Pure snapshot builder — shared by both weekly and topup invoice builders.
// Reads businessSettings + default bankAccount internally. Returns the full
// insert object for "invoices" WITHOUT writing to the DB and WITHOUT allocating
// an invoiceNumber (caller does both before calling this).
// ---------------------------------------------------------------------------

/**
 * Build the full invoice insert object (minus _id and _creationTime).
 *
 * Does NO db.insert. Does NOT call getNextInvoiceNumber.
 * The caller is responsible for allocating invoiceNumber before passing it in.
 *
 * Field set is identical for both kinds; only invoiceKind/orderNumber/generatedBy differ.
 */
export async function buildInvoiceSnapshot(
  ctx: MutationCtx,
  args: {
    week: Doc<"subscriptionWeeks">;
    sub: Doc<"subscriptions">;
    customer: Doc<"customers"> | null;
    invoiceKind: "subscription_weekly" | "subscription_topup";
    orderNumber: string;
    invoiceNumber: string;
    items: Array<{ productName: string; qty: number; unitPrice: number; lineTotal: number; date?: number }>;
    generatedBy: Id<"users">;
    now: number;
  },
): Promise<Omit<Doc<"invoices">, "_id" | "_creationTime">> {
  const { week, sub, customer, invoiceKind, orderNumber, invoiceNumber, items, generatedBy, now } = args;

  const settings = await ctx.db.query("businessSettings").first();
  const bank = settings?.defaultBankAccountId
    ? await ctx.db.get(settings.defaultBankAccountId)
    : null;

  const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);

  return {
    status: "final",
    invoiceNumber,
    invoiceKind,
    subscriptionWeekId: week._id,
    customerId: sub.customerId,
    // orderId intentionally omitted — a subscription invoice has no single order.
    orderNumber,
    orderDate: week.weekStart,
    generatedAt: now,
    generatedBy,
    updatedAt: now,
    // Seller snapshot
    sellerName: settings?.businessName ?? "Frollie",
    sellerAddress: settings?.address,
    sellerPhone: settings?.phone,
    sellerEmail: settings?.email,
    sellerNpwp: settings?.npwp,
    sellerLogoStorageId: settings?.logoStorageId,
    // Bank snapshot — fall back to the canonical company account so an invoice
    // never ships a blank "transfer to" (configured default always wins).
    bankName: bank?.bankName ?? DEFAULT_BANK.bankName,
    bankAccountNumber: bank?.accountNumber ?? DEFAULT_BANK.accountNumber,
    bankAccountName: bank?.name ?? DEFAULT_BANK.name,
    // Buyer snapshot — customer-facing invoice block. Prefer the delivery
    // address (a subscription is a recurring delivery) and the WhatsApp contact.
    buyerName: customer?.name ?? "Customer",
    buyerCompany: customer?.companyName,
    buyerNpwp: customer?.npwp,
    buyerAddress:
      customer?.deliveryAddress ??
      customer?.billingAddress ??
      customer?.defaultAddress ??
      customer?.storeAddress,
    buyerPhone: customer?.whatsapp ?? customer?.phone,
    items,
    subtotal,
    finalTotal: subtotal, // required field; there is no separate `total`
    paymentStatus: "Unpaid",
  };
}

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

    const invoiceNumber = await getNextInvoiceNumber(ctx);
    const now = Date.now();

    const snapshot = await buildInvoiceSnapshot(ctx, {
      week,
      sub,
      customer,
      invoiceKind: "subscription_weekly",
      orderNumber: `WEEK-${getWibDateStr(week.weekStart)}`,
      invoiceNumber,
      items,
      generatedBy: ctx.user._id,
      now,
    });
    const invoiceId = await ctx.db.insert("invoices", snapshot);

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
    //
    // IMP-3 (documented intentional bypass — do NOT "fix" by routing through
    // statusUpdates): this raw-patches order.status directly, bypassing the
    // statusUpdates side-effects (packaging stock reservation via
    // reserveStockForOrderInternal, status-transition audit log, and
    // computeIsKitchenVisible). Subscription-order packaging-inventory reservation
    // is DEFERRED to Phase D/E — the weekly cycle currently has no UI and the
    // reservation model for subscription orders is undecided. Until then this stays
    // a deliberate bare patch. Track in Phase D/E.
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", week._id))
      .collect();
    // IMP-2: never revive a terminal-status order. A split-cancelled order (e.g.
    // outOfCredit Path A) is already Cancelled; patching it to PaymentReceived/Paid
    // would resurrect a dead order into the active pipeline. isTerminalStatus covers
    // both Cancelled and Complete (an already-delivered+completed order must also not
    // be reset to PaymentReceived).
    await Promise.all(
      orders
        .filter((order) => !isTerminalStatus(order.status))
        .map((order) =>
          ctx.db.patch(order._id, {
            paymentStatus: "Paid",
            paymentMethod: "subscription_credit",
            status: "PaymentReceived",
          }),
        ),
    );
    await ctx.db.patch(week._id, { status: "delivering", paymentReceivedAt: Date.now() });
    return week._id;
  },
});

// ---------------------------------------------------------------------------
// Shared helper — build a `subscription_topup` invoice inside a mutation ctx.
// Used by both createTopupInvoice (public mutation) and outOfCredit.ts (split path).
// Static imports only (Convex Pitfall #8: no dynamic import()).
// ---------------------------------------------------------------------------

/**
 * Build and insert a `subscription_topup` invoice. Returns the new invoiceId.
 *
 * @param generatedBy  userId to stamp on the invoice (caller passes ctx.user._id)
 */
export async function buildTopupInvoice(
  ctx: MutationCtx,
  args: {
    subscriptionWeekId: Id<"subscriptionWeeks">;
    items: Array<{
      productName: string;
      qty: number;
      unitPrice: number;
      lineTotal: number;
    }>;
    generatedBy: Id<"users">;
  },
): Promise<Id<"invoices">> {
  const week = await ctx.db.get(args.subscriptionWeekId);
  if (!week) throw new ConvexError("Week not found");

  const sub = await ctx.db.get(week.subscriptionId);
  if (!sub) throw new ConvexError("Subscription not found");
  const customer = await ctx.db.get(sub.customerId);

  const invoiceNumber = await getNextInvoiceNumber(ctx);
  const now = Date.now();

  const snapshot = await buildInvoiceSnapshot(ctx, {
    week,
    sub,
    customer,
    invoiceKind: "subscription_topup",
    orderNumber: `TOPUP-${getWibDateStr(week.weekStart)}`,
    invoiceNumber,
    items: args.items,
    generatedBy: args.generatedBy,
    now,
  });
  return ctx.db.insert("invoices", snapshot);
}

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

    const invoiceId = await buildTopupInvoice(ctx, {
      subscriptionWeekId: args.subscriptionWeekId,
      // date intentionally omitted from addedLines shape — topup lines are not tied to a specific delivery date
      items: args.addedLines,
      generatedBy: ctx.user._id,
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

/**
 * billWeekShortfall — bill the projected end-of-week credit shortfall as ONE
 * top-up invoice (user directive 2026-06-29). Used when an amended week's
 * planned consumption exceeds the funded credit ("projected to overrun"): rather
 * than a separate invoice per amendment, the operator bills the whole shortfall
 * once the customer is almost out of credit. Marking it paid funds the pool
 * (existing markTopupInvoicePaid flow), closing the gap.
 *
 * Returns the new invoiceId, or null if there is no shortfall to bill.
 */
export const billWeekShortfall = protectedMutation({
  roles: ["manager", "admin"],
  args: { subscriptionWeekId: v.id("subscriptionWeeks") },
  handler: async (ctx, args) => {
    const week = await ctx.db.get(args.subscriptionWeekId);
    if (!week) throw new ConvexError("Week not found");

    const entries = await ctx.db
      .query("creditLedger")
      .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", args.subscriptionWeekId))
      .collect();
    const pool = deriveCreditPool(entries.map((e) => ({ type: e.type, amount: e.amount })));
    const plannedConsumption = computeScheduleTotal(week.plannedDays);
    const { projectedShortfall } = deriveWeekShortfall({
      plannedConsumption,
      creditIssued: pool.creditIssued,
    });

    if (projectedShortfall <= 0) {
      throw new ConvexError("This week has no projected credit shortfall to bill.");
    }

    // Idempotency: creating a top-up invoice does NOT raise creditIssued until it
    // is marked paid, so a second call would see the same shortfall and bill again
    // → over-funded pool. Refuse while an unpaid shortfall invoice already exists.
    const existingUnpaid = await ctx.db
      .query("invoices")
      .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", args.subscriptionWeekId))
      .filter((q) =>
        q.and(
          q.eq(q.field("invoiceKind"), "subscription_topup"),
          q.neq(q.field("paymentStatus"), "Paid"),
        ),
      )
      .first();
    if (existingUnpaid) {
      throw new ConvexError(
        `An unpaid top-up invoice (${existingUnpaid.invoiceNumber ?? existingUnpaid._id}) already exists ` +
          `for this week. Mark it paid or void it before billing the shortfall again.`,
      );
    }

    const sub = await ctx.db.get(week.subscriptionId);
    if (!sub) throw new ConvexError("Subscription not found");
    const weekLabel = getWibDateStr(week.weekStart);
    const invoiceId = await buildTopupInvoice(ctx, {
      subscriptionWeekId: week._id,
      items: [
        {
          // qty/unitPrice as a single credit line — the shortfall is an amount,
          // not a per-product quantity (amendments span multiple products/days).
          productName: `Additional subscription credit — week of ${weekLabel}`,
          qty: 1,
          unitPrice: projectedShortfall,
          lineTotal: projectedShortfall,
        },
      ],
      generatedBy: ctx.user._id,
    });

    return { invoiceId, projectedShortfall, customerId: sub?.customerId ?? null };
  },
});
