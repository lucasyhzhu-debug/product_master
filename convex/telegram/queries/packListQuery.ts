import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";
import type { QueryCtx } from "../../_generated/server";
import { wibMidnightToUtc, getWibComponents } from "../../lib/periodRange";
import { buildKanbanCard, type KanbanOrderCard } from "../../orders/helpers/kanbanBuilders";
import { classifyDue } from "./dueClassification";
import type { Doc } from "../../_generated/dataModel";

// I3 (triple-review): only PaymentReceived + BeingPrepared per plan/spec — these are
// the two CURRENT statuses an order sits in between "paid" and "packed". The
// schema retains 7 legacy "in-progress" statuses for unmigrated production docs,
// but the pack list intentionally ignores them. See SEED-001 design.
const ACTIVE_STATUSES = ["PaymentReceived", "BeingPrepared"] as const;

// Sort: expedited first, then dueDate ascending, then creation time ascending.
function packListComparator(a: Doc<"orders">, b: Doc<"orders">): number {
  const ea = a.expedited ? 0 : 1;
  const eb = b.expedited ? 0 : 1;
  if (ea !== eb) return ea - eb;
  const da = a.dueDate ?? Infinity;
  const db = b.dueDate ?? Infinity;
  if (da !== db) return da - db;
  return a._creationTime - b._creationTime;
}

// Build a lean kanban card for one order, excluding cancelled line items.
async function buildCard(ctx: QueryCtx, order: Doc<"orders">): Promise<KanbanOrderCard> {
  const items = await ctx.db
    .query("orderItems")
    .withIndex("by_order", (q) => q.eq("orderId", order._id))
    .collect();
  const filtered = items.filter((i) => !i.isCancelled);
  return buildKanbanCard(order, filtered, order.createdBy);
}

/**
 * Returns the data for the pack-list report, in three buckets:
 *   - overdue:       PaymentReceived/BeingPrepared, dueDate's WIB day < today
 *   - dueToday:      PaymentReceived/BeingPrepared, dueDate within today's WIB day
 *   - unpaidOverdue: AwaitingPayment, dueDate's WIB day < today (unpaid AND past due)
 *
 * `now` is injectable for tests; production callers pass nothing and we use Date.now().
 * `generatedAt` echoes the `now` used so the formatter renders days-late against the
 * SAME instant the buckets were computed against (no Date.now() drift).
 */
export const getOrdersForPackList = internalQuery({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const wib = getWibComponents(now);
    // Both getWibComponents AND wibMidnightToUtc use 0-indexed month — pass wib.month directly.
    // Day-of-month overflow (day + 1 = 32) is safe; Date.UTC normalizes it.
    const startOfTodayMs = wibMidnightToUtc(wib.year, wib.month, wib.day);
    const endOfTodayMs = wibMidnightToUtc(wib.year, wib.month, wib.day + 1) - 1;

    // ── Paid pack list: two scans on by_status_due_date, bounded by dueDate <= end of today.
    // Convex sorts absent optional fields BEFORE all numbers, so lte("dueDate", X) would
    // include unset dueDate rows — filter those out after collecting.
    const paid: Doc<"orders">[] = [];
    for (const status of ACTIVE_STATUSES) {
      const slice = await ctx.db
        .query("orders")
        .withIndex("by_status_due_date", (q) =>
          q.eq("status", status).lte("dueDate", endOfTodayMs),
        )
        .collect();
      for (const o of slice) {
        if (o.dueDate !== undefined) paid.push(o);
      }
    }
    paid.sort(packListComparator);

    // ── Unpaid past-due: AwaitingPayment, dueDate strictly before start of today WIB.
    // Filter undefined dueDate (sorts before numbers in the index, so .lt includes it).
    const unpaidDocs = (
      await ctx.db
        .query("orders")
        .withIndex("by_status_due_date", (q) =>
          q.eq("status", "AwaitingPayment").lt("dueDate", startOfTodayMs),
        )
        .collect()
    ).filter((o) => o.dueDate !== undefined);
    unpaidDocs.sort(packListComparator);

    // Build paid cards in parallel (independent reads, same Convex txn), then split into
    // overdue vs dueToday and count delivery/pickup in the original (sorted) order.
    const paidCards = await Promise.all(paid.map((order) => buildCard(ctx, order)));
    const overdue: KanbanOrderCard[] = [];
    const dueToday: KanbanOrderCard[] = [];
    let deliveryCount = 0;
    let pickupCount = 0;
    for (let i = 0; i < paid.length; i++) {
      const order = paid[i];
      // dueDate is guaranteed defined here (filtered above); classifyDue → "overdue" | "today".
      if (classifyDue(order.dueDate!, now) === "overdue") overdue.push(paidCards[i]);
      else dueToday.push(paidCards[i]);
      if (order.deliveryType === "Delivery") deliveryCount++;
      else if (order.deliveryType === "Pickup") pickupCount++;
    }

    const unpaidOverdue = await Promise.all(unpaidDocs.map((order) => buildCard(ctx, order)));

    return {
      generatedAt: now,
      totalCount: overdue.length + dueToday.length,
      deliveryCount,
      pickupCount,
      overdue,
      dueToday,
      unpaidOverdue,
    };
  },
});
