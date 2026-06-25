import { v, ConvexError } from "convex/values";
import { protectedMutation } from "../lib/functions";
import { recognizeSubscriptionDelivery } from "./recognition";

/**
 * A subscription order is "deliverable" (recognizable) once it is funded and not
 * terminal. AwaitingDelivery is included so re-press is safe — recognition itself
 * is idempotent (creditLedger.by_order).
 */
export function isDeliverableSubscriptionStatus(status: string): boolean {
  return (
    status === "PaymentReceived" ||
    status === "BeingPrepared" ||
    status === "AwaitingDelivery"
  );
}

/**
 * Scoped "Mark delivered" action for subscription orders (order surfaces are
 * otherwise read-only). Transitions the order to AwaitingDelivery and recognizes
 * the sale via the existing helper. Manager+admin; idempotent (re-press = no-op).
 *
 * NOTE (R2): intentionally bypasses generic moveForward stock/production side
 * effects — subscription orders are credit-funded and production rows were created
 * at confirmWeek. recognizeSubscriptionDelivery posts the drawdown + B2B revenue.
 */
export const markSubscriptionDelivered = protectedMutation({
  roles: ["manager", "admin"],
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError("Order not found");
    if (!order.subscriptionId) {
      throw new ConvexError("Not a subscription order");
    }
    if (!isDeliverableSubscriptionStatus(order.status)) {
      throw new ConvexError(
        `Order status is ${order.status}; only a funded subscription order can be marked delivered`,
      );
    }
    if (order.status !== "AwaitingDelivery") {
      await ctx.db.patch(order._id, { status: "AwaitingDelivery" });
    }
    // Capture whether a ledger entry already existed BEFORE recognition (to detect
    // the split-then-deliver path where recognition fired at split time).
    const ledgerExistedBefore = Boolean(
      await ctx.db
        .query("creditLedger")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .first(),
    );
    // Idempotent: returns early if a ledger entry already exists for this order.
    await recognizeSubscriptionDelivery(ctx, order._id, ctx.user._id);
    return {
      orderId: order._id,
      newlyRecognized: !ledgerExistedBefore,
    };
  },
});
