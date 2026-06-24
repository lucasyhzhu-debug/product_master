/**
 * Strip confidential subscription pricing for non-managerial callers.
 *
 * A subscription order's orderItems carry the CONFIDENTIAL partner unitPrice,
 * and the order carries totalAmount/finalTotal/totalMargin/totalCost. The kanban
 * (OrderSlideOver / OrderDetail / kitchen board) is reachable by kitchen and
 * order_staff, who must see qty + product (for production) but NOT money.
 *
 * This MUST run server-side (D11: strip, don't hide) — a client-side hide would
 * still leak the price over the wire. Kept as a pure function so it can be unit
 * tested and reused across every order-read query the kanban consumes.
 *
 * "What counts as a subscription order" stays single-sourced via isSubscriptionOrder.
 */
import { isSubscriptionOrder } from "../../subscriptions/revenueGate";

const MANAGERIAL = new Set(["manager", "admin"]);

export function stripSubscriptionPricing<
  O extends Record<string, any>,
  I extends Record<string, any>,
>(order: O, items: I[], role: string): { order: O; items: I[] } {
  if (MANAGERIAL.has(role) || !isSubscriptionOrder(order)) {
    return { order, items };
  }
  return {
    order: {
      ...order,
      totalAmount: undefined,
      finalTotal: undefined,
      totalMargin: undefined,
      totalCost: undefined,
    },
    items: items.map((it) => ({ ...it, unitPrice: undefined, lineTotal: undefined })),
  };
}
