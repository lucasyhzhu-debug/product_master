/**
 * createCreditFundedOrder — ad-hoc subscription order funded by weekly credit.
 *
 * At creation: reserves credit (sets subscriptionCreditApplied on the order row).
 * No creditLedger entry at this stage; recognition posts the drawdown at delivery (T3).
 *
 * T7 will append a getSubscriptionOrderHistory query to this file — leave room below.
 */
import { v, ConvexError } from "convex/values";
import { protectedMutation } from "../lib/functions";
import { orderItemInput } from "../orders/validators";
import {
  insertOrderWithItems,
  type OrderInsert,
  type OrderItemInsert,
} from "../orders/helpers/insertOrder";
import { generateNextOrderNumber } from "../orders/helpers/customerResolution";
import { computeCreditSplit, deriveCreditPool } from "./creditMath";

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

    // --- Compute reservation-aware available credit (mirrors getSubscriptionCreditContext) ---
    const ledgerEntries = await ctx.db
      .query("creditLedger")
      .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", week._id))
      .collect();
    const pool = deriveCreditPool(
      ledgerEntries.map((e) => ({ type: e.type, amount: e.amount })),
    );

    // Subtract unrealized reservations: orders with subscriptionCreditApplied but no
    // by_order drawdown yet (recognition posts the drawdown at delivery — T3).
    const weekOrders = await ctx.db
      .query("orders")
      .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", week._id))
      .collect();
    let reserved = 0;
    for (const o of weekOrders) {
      const applied = o.subscriptionCreditApplied ?? 0;
      if (applied <= 0 || o.status === "Cancelled") continue;
      const recognized = await ctx.db
        .query("creditLedger")
        .withIndex("by_order", (q) => q.eq("orderId", o._id))
        .first();
      if (!recognized) reserved += applied;
    }
    const availableCredit = Math.max(0, pool.creditRemaining - reserved);

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
