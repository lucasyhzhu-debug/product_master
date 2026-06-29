import { v, ConvexError } from "convex/values";
import { protectedMutation } from "../lib/functions";
import { recognizeSubscriptionDelivery } from "./recognition";
import {
  computeIsKitchenVisible,
  logStatusTransition,
} from "../orders/helpers/statusTransitions";

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
 * otherwise read-only). Recognizes the sale via the existing helper AND drives the
 * order to the terminal `Complete` status. Manager+admin; idempotent (re-press =
 * no-op once Complete; recognition de-dupes via creditLedger.by_order).
 *
 * Why Complete (not AwaitingDelivery): recognition originally fired on the
 * BeingPrepared→AwaitingDelivery edge, but subscription orders are read-only on
 * every order surface, so nothing ever moved them from AwaitingDelivery to
 * Complete — they piled up forever in the "awaiting delivery" kanban column with
 * no way to finish (operator-reported bug). The single "Mark delivered" press is
 * the operator confirming the order is delivered, so it lands the order in the
 * terminal state in one step. Recognition is status-agnostic (it reads
 * subscriptionCreditApplied ?? totalAmount and de-dupes on the ledger), so posting
 * the drawdown here is unchanged — no double-draw, same realized-sale timing.
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

    // Drive to the terminal Complete state so the order leaves "awaiting delivery".
    // Mirrors the generic status flow: completedAt stamped, kitchen visibility cleared.
    const fromStatus = order.status;
    await ctx.db.patch(order._id, {
      status: "Complete",
      completedAt: Date.now(),
      isKitchenVisible: computeIsKitchenVisible("Complete"),
    });
    await logStatusTransition(
      ctx,
      order._id,
      fromStatus,
      "Complete",
      "Subscription order marked delivered",
      "user",
      ctx.user._id,
    );

    return {
      orderId: order._id,
      newlyRecognized: !ledgerExistedBefore,
    };
  },
});
