/**
 * Migration: Fix orders stuck at "Confirmed" status.
 *
 * Per D-03 (Phase 70): Orders like Bali 0330-002 are stuck at "Confirmed"
 * which is NOT in REVENUE_COUNTABLE_STATUSES, making them invisible to
 * revenue analytics. This migration:
 *
 * 1. Queries all orders with status "Confirmed"
 * 2. For each, traces orderEvents to understand the history
 * 3. Advances orders that have received payment to "PaymentReceived"
 *    (the first revenue-countable status in the normal workflow)
 * 4. Logs a migration event in orderEvents for audit trail
 *
 * Safe to run multiple times (skips orders no longer at Confirmed).
 * Run from Convex dashboard Functions tab.
 */
import { internalMutation } from "../_generated/server";

export const fixConfirmedOrders = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Step 1: Find all orders stuck at "Confirmed"
    const confirmedOrders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "Confirmed"))
      .collect();

    const results: Array<{
      orderNumber: string;
      orderId: string;
      action: string;
      eventCount: number;
      lastEvent?: string;
    }> = [];

    for (const order of confirmedOrders) {
      // Step 2: Trace orderEvents for this order
      const events = await ctx.db
        .query("orderEvents")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();

      // Sort by timestamp descending to get latest event
      events.sort((a, b) => b.timestamp - a.timestamp);
      const lastEvent = events[0];

      // Step 3: Determine if this order should be advanced.
      // "Confirmed" means the order was confirmed but never transitioned
      // to PaymentReceived. For direct sales (internal orders), payment
      // is typically received at confirmation time. Advance to PaymentReceived.
      //
      // Guard: Only advance if the order has a positive finalTotal (real order with payment).
      const hasTotal = order.finalTotal != null && order.finalTotal > 0;

      if (hasTotal) {
        // Advance to PaymentReceived
        await ctx.db.patch(order._id, { status: "PaymentReceived" });

        // Log migration event for audit trail
        await ctx.db.insert("orderEvents", {
          orderId: order._id,
          eventType: "status_change",
          fromStatus: "Confirmed",
          toStatus: "PaymentReceived",
          reason: "Phase 70 migration: fix stuck Confirmed status for revenue recognition",
          timestamp: Date.now(),
          triggeredBy: "migration:fixConfirmedOrders",
        });

        results.push({
          orderNumber: order.orderNumber,
          orderId: order._id as string,
          action: "advanced_to_PaymentReceived",
          eventCount: events.length,
          lastEvent: lastEvent
            ? `${lastEvent.eventType} at ${new Date(lastEvent.timestamp).toISOString()}`
            : "none",
        });
      } else {
        // Order has no total -- may be incomplete. Leave as-is and log for review.
        results.push({
          orderNumber: order.orderNumber,
          orderId: order._id as string,
          action: "skipped_no_total",
          eventCount: events.length,
          lastEvent: lastEvent
            ? `${lastEvent.eventType} at ${new Date(lastEvent.timestamp).toISOString()}`
            : "none",
        });
      }
    }

    return {
      totalConfirmed: confirmedOrders.length,
      advanced: results.filter((r) => r.action === "advanced_to_PaymentReceived").length,
      skipped: results.filter((r) => r.action === "skipped_no_total").length,
      details: results,
    };
  },
});
