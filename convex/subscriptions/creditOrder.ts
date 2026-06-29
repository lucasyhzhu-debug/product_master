/**
 * createCreditFundedOrder — ad-hoc subscription order funded by weekly credit.
 *
 * At creation: reserves credit (sets subscriptionCreditApplied on the order row).
 * No creditLedger entry at this stage; recognition posts the drawdown at delivery (T3).
 *
 * getCreditOrderWhatsappDraft (T7) is appended below — it builds a WhatsApp summary for
 * the operator to send after creating a credit-funded order.
 */
import { v, ConvexError } from "convex/values";
import { protectedMutation, protectedQuery } from "../lib/functions";
import { orderItemInput } from "../orders/validators";
import {
  insertOrderWithItems,
  type OrderInsert,
  type OrderItemInsert,
} from "../orders/helpers/insertOrder";
import { generateNextOrderNumber } from "../orders/helpers/customerResolution";
import { computeCreditSplit } from "./creditMath";
import { getWibDateStr } from "../lib/periodRange";
import { computeWeekAvailableCredit } from "./creditReservation";
import { renderTemplate } from "../whatsappTemplates/render";

export const createCreditFundedOrder = protectedMutation({
  roles: ["manager", "admin"],
  args: {
    customerId: v.id("customers"),
    subscriptionId: v.id("subscriptions"),
    items: v.array(orderItemInput),
    dueDate: v.number(),
    soldBy: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // --- Validate subscription ---
    const sub = await ctx.db.get(args.subscriptionId);
    if (!sub || sub.status !== "active") {
      throw new ConvexError("Subscription is not active");
    }
    if (sub.customerId !== args.customerId) {
      throw new ConvexError("Subscription does not belong to customer");
    }

    // --- Find funded week covering dueDate (status paid or delivering) ---
    const weeks = await ctx.db
      .query("subscriptionWeeks")
      .withIndex("by_subscription_weekStart", (q) => q.eq("subscriptionId", sub._id))
      .collect();
    const week = weeks.find(
      (w) =>
        w.weekStart <= args.dueDate &&
        args.dueDate <= w.weekEnd &&
        (w.status === "paid" || w.status === "delivering"),
    );
    if (!week) {
      throw new ConvexError("No funded subscription week covers this date");
    }

    // --- Compute reservation-aware available credit (see creditReservation.ts) ---
    // Called before insertOrderWithItems → the new order is not yet in the DB,
    // so its reservation is not included. availableCredit = true headroom at create-time.
    const { availableCredit } = await computeWeekAvailableCredit(ctx, week._id);

    // --- Server-side credit split (NEVER trust client amounts for eligible lines — C4) ---
    const allowed = new Set<string>(
      sub.scheduleTemplate.flatMap((d) =>
        d.items.map((it) => it.menuProductId as unknown as string),
      ),
    );
    const split = computeCreditSplit(
      args.items.map((it) => ({
        // Items without menuProductId are treated as off-plan (Set.has returns false)
        menuProductId: it.menuProductId!,
        qty: it.quantity,
        retailUnitPrice: it.unitPrice,
      })),
      allowed,
      sub.unitPrice,
      availableCredit,
    );
    if (split.creditCovered <= 0) {
      throw new ConvexError("No credit-eligible lines for this subscription");
    }

    // --- Build order items at effective prices ---
    // eligible lines → partner price (sub.unitPrice); off-plan lines → retail (client) price
    const orderItems: OrderItemInsert[] = args.items.map((it, i) => {
      const line = split.lines[i];
      return {
        productName: it.productName,
        productVariant: it.productVariant,
        quantity: it.quantity,
        unitPrice: line.effectiveUnitPrice,
        unitCost: it.unitCost,
        discountAmount: 0,
        lineTotal: line.lineTotal,
        lineCost: 0,          // COGS from BOM at production time (matches confirmWeek.ts)
        lineMargin: line.lineTotal,
        menuProductId: it.menuProductId,
      };
    });

    const totalAmount = split.eligibleSubtotal + split.offPlanTotal;
    const fullyCovered = split.amountDue === 0;

    const customer = await ctx.db.get(args.customerId);
    if (!customer) throw new ConvexError("Customer not found");

    const orderNumber = await generateNextOrderNumber(ctx);

    // Field set copied from scheduling/confirmWeek.ts (canonical subscription-order build).
    // status/payment/funding/credit fields overridden per branch below.
    // Do NOT route through statusUpdates — IMP-3 bypass: packaging reservation stays deferred.
    // OrderInsert = WithoutSystemFields<Doc<"orders">>; compiler enforces all required fields.
    const orderFields: OrderInsert = {
      orderNumber,
      customerId: args.customerId,
      customerName: customer.name,       // SNAPSHOT
      customerPhone: customer.phone,     // SNAPSHOT (optional in schema)
      // Full cover: subscription_credit/Paid/PaymentReceived (both decoupled fields set)
      // Partial:    deposit/Unpaid/AwaitingPayment
      status: fullyCovered ? "PaymentReceived" : "AwaitingPayment",
      paymentStatus: fullyCovered ? "Paid" : "Unpaid",
      paymentMethod: fullyCovered ? "subscription_credit" : undefined,
      fundingSource: fullyCovered ? "subscription_credit" : "deposit",
      orderDate: Date.now(),
      dueDate: args.dueDate,
      deliveryDate: args.dueDate,
      deliveryType: "Delivery",          // subscription = always delivery
      totalAmount,
      totalCost: 0,                      // COGS from BOM/production, not partner price
      totalMargin: totalAmount,
      finalTotal: totalAmount,
      itemCount: args.items.length,
      createdBy: ctx.user.name,
      createdByUserId: ctx.user._id,
      isKitchenVisible: true,
      subscriptionId: sub._id,
      subscriptionWeekId: week._id,
      subscriptionCreditApplied: split.creditCovered,  // RESERVATION (no ledger entry yet)
      soldBy: args.soldBy,
      notes: args.notes,
    };

    const orderId = await insertOrderWithItems(ctx, { orderFields, items: orderItems });

    return {
      orderId,
      creditCovered: split.creditCovered,
      amountDue: split.amountDue,
      offPlanTotal: split.offPlanTotal,
      eligibleShortfall: split.eligibleShortfall,
    };
  },
});

// ---------------------------------------------------------------------------
// T7: WhatsApp credit top-up summary draft
// ---------------------------------------------------------------------------

/** Statuses that indicate a planned delivery has been dispatched/completed. */
const CREDIT_DELIVERY_DONE_STATUSES = new Set([
  "AwaitingDelivery",
  "Complete",
  "WaitingShipment",
  "WaitingPickup",
  "CompleteShipped",
  "PickedUp",
]);

/**
 * Build a WhatsApp draft for a credit-funded subscription order.
 *
 * Returns `{ text }` using the `SUBSCRIPTION_CREDIT_TOPUP` template, or
 * `null` if the order is not a credit-funded subscription order or the
 * template has not been seeded.
 *
 * `creditRemaining` = pool − total reserved (including this order) — i.e.
 * how much credit is still uncommitted after this order was created.
 */
export const getCreditOrderWhatsappDraft = protectedQuery({
  roles: ["manager", "admin"],
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;
    if (!order.subscriptionCreditApplied || !order.subscriptionWeekId) return null;
    if (order.dueDate == null) return null;

    const week = await ctx.db.get(order.subscriptionWeekId);
    if (!week) return null;

    // --- Credit pool (reservation-aware, INCLUDING this order — see creditReservation.ts) ---
    // Called AFTER the order is created → this order IS in weekOrders with
    // subscriptionCreditApplied set and no by_order ledger row, so it IS included
    // in `reserved`. availableCredit = credit left AFTER this order (shown in WA summary).
    const { availableCredit: creditRemaining } = await computeWeekAvailableCredit(ctx, week._id);

    const weekOrders = await ctx.db
      .query("orders")
      .withIndex("by_subscriptionWeek", (q) =>
        q.eq("subscriptionWeekId", week._id),
      )
      .collect();

    // --- Planned deliveries remaining ---
    const today = getWibDateStr(order.dueDate);
    const deliveredWibDates = new Set<string>(
      weekOrders
        .filter(
          (o) =>
            CREDIT_DELIVERY_DONE_STATUSES.has(o.status) &&
            o.deliveryDate !== undefined,
        )
        .map((o) => getWibDateStr(o.deliveryDate!)),
    );
    const plannedDeliveriesRemaining = week.plannedDays.filter((d) => {
      const dStr = getWibDateStr(d.date);
      if (dStr >= today) return true;
      return !deliveredWibDates.has(dStr);
    }).length;

    // --- Template ---
    const templateRow = await ctx.db
      .query("whatsappTemplates")
      .withIndex("by_code", (q) => q.eq("code", "SUBSCRIPTION_CREDIT_TOPUP"))
      .first();
    if (!templateRow) return null;

    // --- Order items summary ---
    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();
    const itemsText = items
      .map((it) => {
        const priceK = it.unitPrice / 1000;
        let desc = it.productName;
        if (it.productVariant && !it.productName.includes(it.productVariant)) {
          desc += ` (${it.productVariant})`;
        }
        return `• ${it.quantity}x ${desc} @ ${priceK.toFixed(0)}k`;
      })
      .join("\n");

    const text = renderTemplate(templateRow.templateId, {
      "{customerName}": order.customerName,
      "{itemsText}": itemsText,
      "{creditUsed}": order.subscriptionCreditApplied.toLocaleString("id-ID"),
      "{creditRemaining}": creditRemaining.toLocaleString("id-ID"),
      "{plannedDeliveriesRemaining}": String(plannedDeliveriesRemaining),
    });

    return { text };
  },
});
