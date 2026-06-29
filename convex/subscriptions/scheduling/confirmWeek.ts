/**
 * confirmWeek — generate orders atomically for a planned subscription week.
 *
 * For each plannedDays entry that has items, inserts one orders row at the
 * partner unitPrice, with fundingSource:"subscription_credit".
 * Flips week status planned → confirmed and stamps confirmedAt/confirmedBy.
 *
 * Idempotent: refuses if week.status !== "planned".
 * All writes happen in a single Convex mutation (atomic).
 */
import { v, ConvexError } from "convex/values";
import { protectedMutation } from "../../lib/functions";
import { insertOrderWithItems } from "../../orders/helpers/insertOrder";
import { generateNextOrderNumber } from "../../orders/helpers/customerResolution";
import { formatSubscriptionDeliveryNote } from "../../lib/periodRange";

export const confirmWeek = protectedMutation({
  roles: ["manager", "admin"],
  args: { subscriptionWeekId: v.id("subscriptionWeeks") },
  handler: async (ctx, args) => {
    // --- Load & validate week ---
    const week = await ctx.db.get(args.subscriptionWeekId);
    if (!week) throw new ConvexError("Subscription week not found");
    if (week.status !== "planned")
      throw new ConvexError(`Week is ${week.status}, can only confirm a planned week`);

    // --- Load subscription & customer ---
    const sub = await ctx.db.get(week.subscriptionId);
    if (!sub) throw new ConvexError("Subscription not found");

    if (sub.endDate !== undefined && week.weekStart > sub.endDate) {
      throw new ConvexError(
        "Subscription has been terminated; cannot confirm a week starting after the end date.",
      );
    }

    const customer = await ctx.db.get(sub.customerId);
    if (!customer) throw new ConvexError("Customer not found");

    // --- Generate one order per planned day that has items ---
    for (const day of week.plannedDays) {
      if (day.items.length === 0) continue;

      const orderNumber = await generateNextOrderNumber(ctx);
      const totalAmount = day.items.reduce((s, it) => s + it.lineTotal, 0);

      await insertOrderWithItems(ctx, {
        orderFields: {
          orderNumber,
          customerId: sub.customerId,
          // SNAPSHOT — copied at creation, never mutated
          customerName: customer.name,
          customerPhone: customer.phone ?? "",

          // Canonical status literals (schema.ts:217-235)
          // AwaitingPayment = waiting for credit drawdown (Task B9 flips to PaymentReceived)
          status: "AwaitingPayment",
          // paymentStatus literals: Unpaid | Partial | Paid (schema.ts:240-243)
          paymentStatus: "Unpaid",

          orderDate: Date.now(),
          dueDate: day.date,
          deliveryDate: day.date,

          // Stamp a crystal-clear delivery note so operators know exactly when
          // each subscription card is due (e.g. "Deliver by 09:30; Monday 29/06/26").
          // Uses the day's agreed deliver-by cutoff. Renders in the kanban card's
          // notes section + order detail surfaces.
          notes: formatSubscriptionDeliveryNote(day.date, day.deliverByTime),

          // Financials — partner price is the revenue; COGS resolved from BOM at production time
          totalAmount,
          totalCost: 0,          // COGS from BOM/production, not partner price
          totalMargin: totalAmount,
          finalTotal: totalAmount,

          // Required non-optional fields
          deliveryType: "Delivery",   // v.string() required; subscription = delivery
          itemCount: day.items.length,
          createdBy: ctx.user.name,   // v.string() required

          // Optional but expected for kitchen visibility
          isKitchenVisible: true,
          createdByUserId: ctx.user._id,

          // Subscription linkage
          subscriptionId: sub._id,
          subscriptionWeekId: week._id,
          fundingSource: "subscription_credit",
        },
        items: day.items.map((it) => ({
          productName: it.productName,
          quantity: it.qty,
          unitPrice: it.unitPrice,  // partner price
          unitCost: 0,              // COGS from BOM
          discountAmount: 0,
          lineTotal: it.lineTotal,
          lineCost: 0,
          lineMargin: it.lineTotal,
          menuProductId: it.menuProductId,
        })),
      });
    }

    // --- Flip week planned → confirmed (atomic with the order writes above) ---
    await ctx.db.patch(week._id, {
      status: "confirmed",
      confirmedAt: Date.now(),
      confirmedBy: ctx.user._id,
    });

    return week._id;
  },
});
