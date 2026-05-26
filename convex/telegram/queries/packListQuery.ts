import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";
import { wibMidnightToUtc, getWibComponents } from "../../lib/periodRange";
import { buildKanbanCard, type KanbanOrderCard } from "../../orders/helpers/kanbanBuilders";
import type { Doc } from "../../_generated/dataModel";

// I3 (triple-review): only PaymentReceived + BeingPrepared per plan/spec — these are
// the two CURRENT statuses an order sits in between "paid" and "packed". The
// schema retains 7 legacy "in-progress" statuses (Confirmed, InProduction, Boxed,
// Labeled, Packaging, WaitingShipment, WaitingPickup) for unmigrated production
// docs, but the morning pack list intentionally ignores them — they're either
// already past packing or use the deprecated production flow. If a live order
// appears in one of those statuses with a dueDate <= today, it will silently NOT
// appear on the pack list. Revisit if a data audit surfaces such orders.
const ACTIVE_STATUSES = ["PaymentReceived", "BeingPrepared"] as const;

/**
 * Returns orders that need to be packed:
 *   - status ∈ {PaymentReceived, BeingPrepared}
 *   - dueDate is set
 *   - dueDate <= end of today WIB
 *
 * `now` is injectable for tests; production callers pass nothing and we use Date.now().
 */
export const getOrdersForPackList = internalQuery({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const wib = getWibComponents(now);
    // End of today WIB = next WIB midnight minus 1 ms.
    // Both getWibComponents AND wibMidnightToUtc use 0-indexed month — pass wib.month directly.
    // Day-of-month overflow (e.g., day + 1 = 32) is safe; Date.UTC normalizes it.
    const endOfTodayMs = wibMidnightToUtc(wib.year, wib.month, wib.day + 1) - 1;

    // Two scans on by_status_due_date: one per active status, bounded by dueDate.
    // Convex stores absent optional fields as `undefined`, and undefined sorts
    // BEFORE all numeric values in an index — so `.lte("dueDate", X)` would
    // include rows where dueDate is unset. Filter those out explicitly after
    // collecting; can't be expressed in the index range.
    const orders: Doc<"orders">[] = [];
    for (const status of ACTIVE_STATUSES) {
      const slice = await ctx.db
        .query("orders")
        .withIndex("by_status_due_date", (q) =>
          q.eq("status", status).lte("dueDate", endOfTodayMs),
        )
        .collect();
      for (const o of slice) {
        if (o.dueDate !== undefined) orders.push(o);
      }
    }

    // Sort: expedited first, then dueDate asc, then _creationTime asc.
    orders.sort((a, b) => {
      const ea = a.expedited ? 0 : 1;
      const eb = b.expedited ? 0 : 1;
      if (ea !== eb) return ea - eb;
      const da = a.dueDate ?? Infinity;
      const db = b.dueDate ?? Infinity;
      if (da !== db) return da - db;
      return a._creationTime - b._creationTime;
    });

    // Build cards. Items fetched per order via by_order index.
    const cards: KanbanOrderCard[] = [];
    let deliveryCount = 0;
    let pickupCount = 0;
    for (const order of orders) {
      const items = await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();
      const filtered = items.filter((i) => !i.isCancelled);
      cards.push(buildKanbanCard(order, filtered, order.createdBy));
      if (order.deliveryType === "Delivery") deliveryCount++;
      else if (order.deliveryType === "Pickup") pickupCount++;
    }

    return {
      totalCount: cards.length,
      deliveryCount,
      pickupCount,
      orders: cards,
    };
  },
});
