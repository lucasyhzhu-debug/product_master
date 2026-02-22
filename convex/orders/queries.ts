import { query } from "../_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { fetchOrdersWithItemsAndProduction } from "./helpers/batchFetching";
import type { OrderWithItems } from "./types";

// ============================================
// Queries
// ============================================

/**
 * Get production records for all items in an order.
 * Returns orderItemProduction records grouped by order item.
 */
export const getOrderProductionRecords = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    const records = [];
    for (const item of items) {
      const production = await ctx.db
        .query("orderItemProduction")
        .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
        .collect();
      for (const p of production) {
        records.push({
          ...p,
          // Include parent item info for display
          menuProductId: item.menuProductId,
          productName: item.productName,
          quantity: item.quantity,
        });
      }
    }
    return records;
  },
});

/**
 * List orders with optional filters.
 * PRD-0: Uses type-safe union for status filter.
 * Supports both single status and array of statuses for category filtering.
 *
 * @deprecated For new code, prefer `listPaginated` which uses cursor-based pagination.
 * This query is retained for backward compatibility with multi-status category filters
 * (e.g., KitchenView, category tabs) where paginate() cannot be used with array filters.
 */
export const list = query({
  args: {
    status: v.optional(v.union(
      v.literal("Draft"),
      v.literal("AwaitingPayment"),
      v.literal("PaymentReceived"),
      v.literal("BeingPrepared"),
      v.literal("AwaitingDelivery"),
      v.literal("Complete"),
      v.literal("Cancelled"),
      v.array(v.union(
        v.literal("Draft"),
        v.literal("AwaitingPayment"),
        v.literal("PaymentReceived"),
        v.literal("BeingPrepared"),
        v.literal("AwaitingDelivery"),
        v.literal("Complete"),
        v.literal("Cancelled")
      ))
    )),
    channel: v.optional(v.string()),
    dueDateFrom: v.optional(v.number()),
    dueDateTo: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<OrderWithItems[]> => {
    const limit = args.limit ?? 100;

    // Get orders - use index if single status filter is provided
    let orders;
    if (args.status) {
      // Handle array of statuses (fetch all and filter in memory)
      if (Array.isArray(args.status)) {
        orders = await ctx.db.query("orders").order("desc").take(limit * 2);
        orders = orders.filter((o) => (args.status as string[]).includes(o.status));
        orders = orders.slice(0, limit);
      } else {
        // Single status - use index
        orders = await ctx.db
          .query("orders")
          .withIndex("by_status", (q) => q.eq("status", args.status as any))
          .order("desc")
          .take(limit);
      }
    } else {
      orders = await ctx.db.query("orders").order("desc").take(limit);
    }

    // Apply additional filters in memory
    let filtered = [...orders];

    if (args.channel) {
      filtered = filtered.filter((o) => o.channel === args.channel);
    }
    if (args.dueDateFrom) {
      filtered = filtered.filter(
        (o) => o.dueDate && o.dueDate >= args.dueDateFrom!
      );
    }
    if (args.dueDateTo) {
      filtered = filtered.filter(
        (o) => o.dueDate && o.dueDate <= args.dueDateTo!
      );
    }

    // Fetch items and customer for each order
    const result = await Promise.all(
      filtered.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();

        const customer = await ctx.db.get(order.customerId);

        return {
          ...order,
          items,
          customer,
        };
      })
    );

    // Sort by orderDate ascending (earliest transaction first)
    result.sort((a, b) => a.orderDate - b.orderDate);

    return result;
  },
});

// Status literal union for paginated queries (single status only)
const orderStatusLiteral = v.union(
  v.literal("Draft"),
  v.literal("AwaitingPayment"),
  v.literal("PaymentReceived"),
  v.literal("BeingPrepared"),
  v.literal("AwaitingDelivery"),
  v.literal("Complete"),
  v.literal("Cancelled")
);

/**
 * List orders with cursor-based pagination.
 * Uses Convex paginate() for efficient incremental loading.
 *
 * Only supports single status filter (not arrays) because
 * paginate() cannot be chained after .filter().
 * For multi-status category views, use the existing `list` query.
 *
 * Returns denormalized fields (itemCount, totalAmount, customerName)
 * already on the orders table -- no per-order item fetch needed for list view.
 */
export const listPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(orderStatusLiteral),
  },
  handler: async (ctx, args) => {
    let q;
    if (args.status) {
      q = ctx.db
        .query("orders")
        .withIndex("by_status", (idx) => idx.eq("status", args.status!))
        .order("desc");
    } else {
      q = ctx.db.query("orders").order("desc");
    }

    const paginatedResult = await q.paginate(args.paginationOpts);

    // For list view, use denormalized fields already on orders table:
    // - order.itemCount, order.totalAmount, order.customerName, order.customerPhone
    // No additional queries needed -- avoids N+1 item fetches entirely.
    const enrichedPage = paginatedResult.page.map((order) => ({
      ...order,
      customer: null,
    }));

    return { ...paginatedResult, page: enrichedPage };
  },
});

/**
 * Lightweight count query for orders.
 * Used alongside listPaginated to show "X remaining" on Load More button.
 * Convex paginate() does not return total count, so this separate query is needed.
 */
export const countOrders = query({
  args: {
    status: v.optional(orderStatusLiteral),
  },
  handler: async (ctx, args) => {
    let orders;
    if (args.status) {
      orders = await ctx.db
        .query("orders")
        .withIndex("by_status", (idx) => idx.eq("status", args.status!))
        .collect();
    } else {
      orders = await ctx.db.query("orders").collect();
    }
    return orders.length;
  },
});

/**
 * Get a single order with items and customer.
 */
export const get = query({
  args: { id: v.id("orders") },
  handler: async (ctx, args): Promise<(OrderWithItems & { creatorName: string }) | null> => {
    const order = await ctx.db.get(args.id);
    if (!order) return null;

    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();

    const customer = await ctx.db.get(order.customerId);

    // GAP-01: Resolve createdByUserId to user name for slide-over display
    let creatorName = order.createdBy;
    if (order.createdByUserId) {
      const user = await ctx.db.get(order.createdByUserId);
      if (user) creatorName = user.name;
    }

    return {
      ...order,
      items,
      customer,
      creatorName,
    };
  },
});

/**
 * Get order by order number.
 */
export const getByOrderNumber = query({
  args: { orderNumber: v.string() },
  handler: async (ctx, args): Promise<OrderWithItems | null> => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_order_number", (q) => q.eq("orderNumber", args.orderNumber))
      .first();

    if (!order) return null;

    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();

    const customer = await ctx.db.get(order.customerId);

    return {
      ...order,
      items,
      customer,
    };
  },
});

/**
 * Get orders for kitchen view (production pipeline).
 * PRD-1: Returns Confirmed, InProduction, and Packaging orders with ball calculations.
 * PRD-5: Enhanced with dynamic production type support via orderItemProduction.
 * PRD-6: Shows orders until manually completed (after all packages are green/packed).
 * PRD-Kitchen-UI-Flow: Phase 1 - Include WaitingShipment/WaitingPickup with priority sorting.
 *
 * REFACTORED (Phase 2): Optimized to reduce queries from 6 + N + N*M to 3 total.
 */
export const getKitchenOrders = query({
  args: {},
  handler: async (ctx) => {
    // OPTIMIZED: Single indexed lookup for active kitchen-visible orders
    const activeOrders = await ctx.db.query("orders")
      .withIndex("by_kitchen_visible", (q) => q.eq("isKitchenVisible", true))
      .collect();

    // Completed-today orders: terminal status with completedAt since midnight
    // These have isKitchenVisible=false but should still show at bottom until EOD
    const midnightToday = new Date();
    midnightToday.setHours(0, 0, 0, 0);
    const midnightMs = midnightToday.getTime();

    const completedOrders = await ctx.db.query("orders")
      .withIndex("by_status", (q) => q.eq("status", "Complete"))
      .collect();
    const completedTodayOrders = completedOrders
      .filter((o) => o.completedAt && o.completedAt >= midnightMs);

    const orders = [...activeOrders, ...completedTodayOrders];

    // PRD-5: Get all production unit types for dynamic aggregation
    const productionUnitTypes = await ctx.db
      .query("productionUnitTypes")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // OPTIMIZED: Per-order indexed lookups instead of full table scans
    const orderIds = orders.map((o) => o._id);
    const orderDataMap = await fetchOrdersWithItemsAndProduction(ctx, orderIds);

    // Map orders with enriched data and calculations
    const enrichedOrders = orders.map((order) => {
      const orderData = orderDataMap.get(order._id);
      if (!orderData) {
        // Fallback for orders without items
        return {
          ...order,
          items: [] as Array<Doc<"orderItems"> & { productionRecords: Doc<"orderItemProduction">[] }>,
          bigBallsNeeded: 0,
          midBallsNeeded: 0,
          productionByType: [] as Array<{ code: string; name: string; color: string; unitsNeeded: number }>,
        };
      }

      // Enrich items with production records
      const itemsWithProduction = orderData.items.map((item) => ({
        ...item,
        productionRecords: orderData.production.get(item._id) ?? [],
      }));

      // Calculate ball stats from production records
      const { bigBallsNeeded, midBallsNeeded } = calculateBallStatsFromItems(itemsWithProduction);

      // Calculate NEW system production stats (dynamic by type)
      const productionByType = calculateProductionStatsByType(
        itemsWithProduction,
        productionUnitTypes
      );

      return {
        ...order,
        items: itemsWithProduction,
        bigBallsNeeded,
        midBallsNeeded,
        productionByType,
      };
    });

    // Sort: active orders by dueDate ascending (most urgent first),
    // completed-today orders always at bottom
    enrichedOrders.sort((a, b) => {
      const aCompleted = a.status === "Complete";
      const bCompleted = b.status === "Complete";
      // Completed orders always sort to bottom
      if (aCompleted && !bCompleted) return 1;
      if (!aCompleted && bCompleted) return -1;
      // Within completed group, no special sort (recent completions at top)
      if (aCompleted && bCompleted) return 0;
      // Within active group, use priority-based sorting
      return sortByPriorityComparator(a, b);
    });

    return enrichedOrders;
  },
});

/**
 * Calculate ball stats from orderItemProduction records.
 * Items without production records contribute 0 balls.
 */
function calculateBallStatsFromItems(
  items: Array<Doc<"orderItems"> & { productionRecords?: Doc<"orderItemProduction">[] }>
): { bigBallsNeeded: number; midBallsNeeded: number } {
  let bigBallsNeeded = 0;
  let midBallsNeeded = 0;

  for (const item of items) {
    if (item.isCancelled) continue;

    // NEW system: production records (BOM-derived, correct codes)
    const records = item.productionRecords ?? [];
    const activeRecords = records.filter(r => !r.isCancelled);

    if (activeRecords.length > 0) {
      for (const record of activeRecords) {
        if (record.productionUnitCode === "BIG_BALL") {
          bigBallsNeeded += record.unitsRemaining;
        } else if (record.productionUnitCode === "MID_BALL") {
          midBallsNeeded += record.unitsRemaining;
        }
      }
      continue; // Skip items without production records (0 balls)
    }

    // Items without production records contribute 0 balls
  }

  return { bigBallsNeeded, midBallsNeeded };
}

/**
 * Calculate NEW system production statistics by production unit type.
 * Aggregates unitsRemaining from orderItemProduction records.
 */
function calculateProductionStatsByType(
  itemsWithProduction: Array<Doc<"orderItems"> & { productionRecords: Doc<"orderItemProduction">[] }>,
  productionUnitTypes: Doc<"productionUnitTypes">[]
): Array<{
  code: string;
  name: string;
  color: string;
  unitsNeeded: number;
}> {
  return productionUnitTypes
    .map((unitType) => {
      let unitsNeeded = 0;

      for (const item of itemsWithProduction) {
        for (const record of item.productionRecords) {
          if (record.productionUnitTypeId === unitType._id) {
            unitsNeeded += record.unitsRemaining;
          }
        }
      }

      return {
        code: unitType.code,
        name: unitType.name,
        color: unitType.color ?? "#93C572", // Default to pistachio green if not set
        unitsNeeded,
      };
    })
    .filter((p) => p.unitsNeeded > 0);
}

/**
 * Assign priority based on order status.
 * Phase 14: Simplified for 7-status model.
 * Priority 0: BeingPrepared (active production)
 * Priority 1: PaymentReceived (paid, waiting for kitchen)
 * Priority 2: Draft (de-prioritized)
 * Priority 3: AwaitingDelivery (ready for pickup/shipment)
 */
function getStatusPriority(status: string): number {
  if (status === "BeingPrepared") {
    return 0;
  } else if (status === "PaymentReceived") {
    return 1;
  } else if (status === "Draft") {
    return 2;
  } else if (status === "AwaitingDelivery") {
    return 3;
  }
  return 4; // Fallback
}

/**
 * Comparator for sorting active (non-completed) orders by priority, then dueDate, then creation time.
 */
function sortByPriorityComparator<T extends Doc<"orders">>(a: T, b: T): number {
  const aPriority = getStatusPriority(a.status);
  const bPriority = getStatusPriority(b.status);

  // Sort by priority first
  if (aPriority !== bPriority) {
    return aPriority - bPriority;
  }

  // Within same priority group, sort by due date (earliest first)
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate - b.dueDate;
  }

  // Finally by creation time (earliest first)
  return a._creationTime - b._creationTime;
}

/**
 * Get order events for audit trail display.
 * Returns events in reverse chronological order.
 */
export const getOrderEvents = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orderEvents")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .order("desc")
      .collect();
  },
});

/**
 * Get orders by customer.
 */
export const getByCustomer = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .order("desc")
      .collect();

    return orders;
  },
});

/**
 * Get product suggestions based on previous orders.
 * Returns unique product names with their last used price/cost.
 */
export const getProductSuggestions = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    // Get recent order items (bounded to avoid scanning entire history)
    const allItems = await ctx.db.query("orderItems").order("desc").take(500);

    // Group by product name + variant, keep latest
    const suggestions = new Map<
      string,
      {
        productName: string;
        productVariant: string | undefined;
        unitPrice: number;
        unitCost: number;
        lastUsed: number;
      }
    >();

    for (const item of allItems) {
      const key = `${item.productName}|${item.productVariant ?? ""}`;
      if (!suggestions.has(key)) {
        suggestions.set(key, {
          productName: item.productName,
          productVariant: item.productVariant,
          unitPrice: item.unitPrice,
          unitCost: item.unitCost,
          lastUsed: item._creationTime,
        });
      }
    }

    // Sort by last used and limit
    return Array.from(suggestions.values())
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .slice(0, limit);
  },
});

/**
 * Get seller suggestions based on previous orders.
 */
export const getSellerSuggestions = query({
  args: {},
  handler: async (ctx) => {
    const orders = await ctx.db.query("orders").collect();

    const sellers = new Set<string>();
    for (const order of orders) {
      if (order.soldBy) {
        sellers.add(order.soldBy);
      }
    }

    return Array.from(sellers).sort();
  },
});

/**
 * Get channel suggestions based on previous orders.
 */
export const getChannelSuggestions = query({
  args: {},
  handler: async (ctx) => {
    const orders = await ctx.db.query("orders").collect();

    const channels = new Set<string>();
    for (const order of orders) {
      if (order.channel) {
        channels.add(order.channel);
      }
    }

    return Array.from(channels).sort();
  },
});

/**
 * Get kitchen stats for dashboard.
 * PRD-1: Ball production tracking.
 * PRD-5: Enhanced with dynamic production type stats.
 * OPTIMIZED: Batch fetch all orderItems to avoid N+1 queries.
 */
export const getKitchenStats = query({
  args: {},
  handler: async (ctx) => {
    // Get midnight today
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    // OPTIMIZED: Fetch only the statuses we need (Phase 14 simplified)
    const [draftOrders, awaitingPaymentOrders, paymentReceivedOrders, beingPreparedOrders] = await Promise.all([
      ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", "Draft")).collect(),
      ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", "AwaitingPayment")).collect(),
      ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", "PaymentReceived")).collect(),
      ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", "BeingPrepared")).collect(),
    ]);
    const pendingOrders = [...draftOrders, ...awaitingPaymentOrders, ...paymentReceivedOrders, ...beingPreparedOrders];

    // Completed-today: fetch terminal and near-terminal statuses, filter by creation time
    const [completedOrders, awaitingDeliveryOrders] = await Promise.all([
      ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", "Complete")).collect(),
      ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", "AwaitingDelivery")).collect(),
    ]);
    const completedTodayOrders = [
      ...completedOrders, ...awaitingDeliveryOrders,
    ].filter((o) => o._creationTime >= midnight);

    // OPTIMIZED: Per-order indexed lookups for items (not full table scan)
    // Draft and AwaitingPayment orders never have orderItemProduction records
    // (records are created at PaymentReceived/confirmation time) — skip them to
    // eliminate wasted nested DB reads. pendingOrders is still used for counts.
    const productionOrders = [...paymentReceivedOrders, ...beingPreparedOrders];
    const relevantOrders = [...productionOrders, ...completedTodayOrders];
    const relevantOrderIds = [...new Set(relevantOrders.map((o) => o._id))];

    const itemsByOrder = new Map<string, Doc<"orderItems">[]>();
    await Promise.all(relevantOrderIds.map(async (orderId) => {
      const items = await ctx.db.query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", orderId))
        .collect();
      itemsByOrder.set(orderId.toString(), items);
    }));

    // OPTIMIZED: Per-item indexed lookups for production records (not full table scan)
    const allItems = Array.from(itemsByOrder.values()).flat();
    const productionByItem = new Map<string, Doc<"orderItemProduction">[]>();
    await Promise.all(allItems.map(async (item) => {
      const records = await ctx.db.query("orderItemProduction")
        .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
        .collect();
      if (records.length > 0) {
        productionByItem.set(item._id.toString(), records);
      }
    }));

    // Calculate stats for pending orders from orderItemProduction records
    let bigBallsNeeded = 0;
    let midBallsNeeded = 0;

    for (const order of pendingOrders) {
      const items = itemsByOrder.get(order._id.toString()) ?? [];
      for (const item of items) {
        if (item.isCancelled) continue;

        const records = productionByItem.get(item._id.toString()) ?? [];
        const activeRecords = records.filter(r => !r.isCancelled);

        for (const record of activeRecords) {
          if (record.productionUnitCode === "BIG_BALL") {
            bigBallsNeeded += record.unitsRemaining;
          } else if (record.productionUnitCode === "MID_BALL") {
            midBallsNeeded += record.unitsRemaining;
          }
        }
      }
    }

    // Calculate stats for completed orders today from orderItemProduction records
    let bigBallsCompleted = 0;
    let midBallsCompleted = 0;

    for (const order of completedTodayOrders) {
      const items = itemsByOrder.get(order._id.toString()) ?? [];
      for (const item of items) {
        if (item.isCancelled) continue;

        const records = productionByItem.get(item._id.toString()) ?? [];
        const activeRecords = records.filter(r => !r.isCancelled);

        for (const record of activeRecords) {
          if (record.productionUnitCode === "BIG_BALL") {
            bigBallsCompleted += record.unitsCompleted;
          } else if (record.productionUnitCode === "MID_BALL") {
            midBallsCompleted += record.unitsCompleted;
          }
        }
      }
    }

    // PRD-5: Calculate dynamic production type stats (NEW system)
    const productionUnitTypes = await ctx.db
      .query("productionUnitTypes")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // productionByItem already built above (moved for dual-read pattern)

    // Calculate stats per production type
    const productionByType = productionUnitTypes
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((unitType) => {
        let unitsNeeded = 0;
        let unitsCompleted = 0;

        // Pending orders -> units needed (remaining)
        // Pending = Confirmed + InProduction + Packaging
        for (const order of pendingOrders) {
          const items = itemsByOrder.get(order._id.toString()) ?? [];
          for (const item of items) {
            const records = productionByItem.get(item._id.toString()) ?? [];
            for (const record of records) {
              if (record.productionUnitTypeId === unitType._id) {
                unitsNeeded += record.unitsRemaining;
              }
            }
          }
        }

        // Completed orders today -> units completed
        for (const order of completedTodayOrders) {
          const items = itemsByOrder.get(order._id.toString()) ?? [];
          for (const item of items) {
            const records = productionByItem.get(item._id.toString()) ?? [];
            for (const record of records) {
              if (record.productionUnitTypeId === unitType._id) {
                unitsCompleted += record.unitsCompleted;
              }
            }
          }
        }

        return {
          code: unitType.code,
          name: unitType.name,
          color: unitType.color,
          unitsNeeded,
          unitsCompleted,
        };
      });

    // Phase 15: Calculate minTargetToday -- balls needed from orders due today only
    // Use WIB timezone (UTC+7) for date comparison
    const wibNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const wibTodayStr = wibNow.toISOString().split("T")[0]; // "YYYY-MM-DD" in WIB
    // WIB day boundaries in UTC timestamps
    const wibDayStartUtc = new Date(wibTodayStr + "T00:00:00+07:00").getTime();
    const wibDayEndUtc = wibDayStartUtc + 24 * 60 * 60 * 1000;

    let bigBallsNeededToday = 0;
    let midBallsNeededToday = 0;
    let dueTodayOrderCount = 0;

    for (const order of pendingOrders) {
      if (!order.dueDate) continue;
      if (order.dueDate >= wibDayStartUtc && order.dueDate < wibDayEndUtc) {
        dueTodayOrderCount++;
        const items = itemsByOrder.get(order._id.toString()) ?? [];
        for (const item of items) {
          if (item.isCancelled) continue;
          const records = productionByItem.get(item._id.toString()) ?? [];
          const activeRecords = records.filter(r => !r.isCancelled);
          for (const record of activeRecords) {
            if (record.productionUnitCode === "BIG_BALL") {
              bigBallsNeededToday += record.unitsRemaining;
            } else if (record.productionUnitCode === "MID_BALL") {
              midBallsNeededToday += record.unitsRemaining;
            }
          }
        }
      }
    }

    // Phase 15: Count non-terminal, non-cancelled orders still left to complete
    const ordersLeftToComplete = pendingOrders.length;

    return {
      bigBallsNeeded,
      bigBallsCompleted,
      midBallsNeeded,
      midBallsCompleted,
      ordersPending: pendingOrders.length,
      ordersCompletedToday: completedTodayOrders.length,
      // PRD-5: Dynamic production type stats
      productionByType,
      // Phase 15: Due-today ball targets
      minTargetToday: {
        totalBalls: bigBallsNeededToday + midBallsNeededToday,
        bigBalls: bigBallsNeededToday,
        midBalls: midBallsNeededToday,
        orderCount: dueTodayOrderCount,
      },
      // Phase 15: Orders left to complete (non-terminal)
      ordersLeftToComplete,
    };
  },
});

/**
 * Get orders ready for packaging (ProductionComplete status).
 * PRD-5: For packaging view - shows orders that need to be packed.
 */
export const getPackagingOrders = query({
  args: {},
  handler: async (ctx) => {
    // Phase 14: Get BeingPrepared orders (replaces ProductionComplete)
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "BeingPrepared"))
      .collect();

    // Fetch items and menu products for each order
    const result = await Promise.all(
      orders.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();

        // Enrich items with menu product details (for packaging instructions)
        const enrichedItems = await Promise.all(
          items.map(async (item) => {
            let menuProduct: Awaited<ReturnType<typeof ctx.db.get<"menuProducts">>> = null;
            let productionComponents: Array<{
              _id: Id<"menuProductComponents">;
              menuProductId: Id<"menuProducts">;
              componentTypeId: Id<"componentTypes">;
              quantity: number;
              sortOrder: number;
              componentType: Awaited<ReturnType<typeof ctx.db.get<"componentTypes">>>;
            }> = [];

            if (item.menuProductId) {
              menuProduct = await ctx.db.get(item.menuProductId);

              // Get production components for packaging display
              const components = await ctx.db
                .query("menuProductComponents")
                .withIndex("by_menu_product", (q) => q.eq("menuProductId", item.menuProductId!))
                .collect();

              productionComponents = await Promise.all(
                components.map(async (comp) => {
                  const componentType = await ctx.db.get(comp.componentTypeId);
                  return {
                    ...comp,
                    componentType,
                  };
                })
              );
            }

            return {
              ...item,
              menuProduct,
              productionComponents,
            };
          })
        );

        return {
          ...order,
          items: enrichedItems,
        };
      })
    );

    // Sort by due date ASC → order date ASC
    return result.sort((a, b) => {
      if (a.dueDate !== b.dueDate) {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate - b.dueDate;
      }
      return a.orderDate - b.orderDate;
    });
  },
});

/**
 * Debug query to inspect production records for pending orders.
 * Run from Convex dashboard to diagnose ball distribution issues.
 */
export const debugProductionRecords = query({
  args: {},
  handler: async (ctx) => {
    // Get all orders that might need ball distribution
    // Phase 14: Simplified status queries
    const draftOrders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "Draft"))
      .collect();

    const paymentReceivedOrders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "PaymentReceived"))
      .collect();

    const beingPreparedOrders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "BeingPrepared"))
      .collect();

    const orders = [...draftOrders, ...paymentReceivedOrders, ...beingPreparedOrders];

    const result = await Promise.all(
      orders.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();

        const itemsWithRecords = await Promise.all(
          items.map(async (item) => {
            const productionRecords = await ctx.db
              .query("orderItemProduction")
              .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
              .collect();

            return {
              itemId: item._id,
              quantity: item.quantity,
              ballsFilled: item.ballsFilled,
              packageStatus: item.packageStatus,
              productionRecords: productionRecords.map((r) => ({
                code: r.productionUnitCode,
                unitsRequired: r.unitsRequired,
                unitsCompleted: r.unitsCompleted,
                unitsRemaining: r.unitsRemaining,
                isCancelled: r.isCancelled,
              })),
              hasBOMData: productionRecords.some(r => !r.isCancelled),
            };
          })
        );

        return {
          orderId: order._id,
          orderNumber: order.orderNumber,
          status: order.status,
          items: itemsWithRecords,
        };
      })
    );

    return result;
  },
});

/**
 * Get orders completed today.
 * PRD-1: For kitchen view history.
 * OPTIMIZED: Batch fetch items and customers to avoid N+1 queries.
 */
/**
 * Get today's kitchen tray inventory.
 * Returns current ball counts in the trays (survives page refresh).
 * Visual Inventory System: Phase 1
 */
export const getTrayInventory = query({
  args: {},
  handler: async (ctx) => {
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split("T")[0];

    // Look up today's inventory record
    const inventory = await ctx.db
      .query("kitchenInventory")
      .withIndex("by_date", (q) => q.eq("date", today))
      .first();

    if (!inventory) {
      // No record for today yet - return empty trays
      return {
        date: today,
        originalBallCount: 0,
        biteSizedBallCount: 0,
        totalProducedOriginal: 0,
        totalProducedBiteSized: 0,
        lastUpdated: null,
        updatedBy: null,
      };
    }

    return {
      date: inventory.date,
      originalBallCount: inventory.originalBallCount,
      biteSizedBallCount: inventory.biteSizedBallCount,
      totalProducedOriginal: inventory.totalProducedOriginal ?? 0,
      totalProducedBiteSized: inventory.totalProducedBiteSized ?? 0,
      lastUpdated: inventory.lastUpdated,
      updatedBy: inventory.updatedBy ?? null,
    };
  },
});

export const getCompletedToday = query({
  args: {},
  handler: async (ctx) => {
    // Get midnight today
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    // Phase 14: Simplified status fetches
    const [awaitingDeliveryOrders, completedOrders2] = await Promise.all([
      ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", "AwaitingDelivery")).collect(),
      ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", "Complete")).collect(),
    ]);

    const completedToday = [
      ...awaitingDeliveryOrders, ...completedOrders2,
    ].filter((o) => o._creationTime >= midnight);

    // OPTIMIZED: Per-order indexed lookups for items (not full table scan)
    const itemsByOrder = new Map<string, Doc<"orderItems">[]>();
    await Promise.all(completedToday.map(async (order) => {
      const items = await ctx.db.query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();
      itemsByOrder.set(order._id.toString(), items);
    }));

    // Fetch unique customers
    const customerIds = [...new Set(completedToday.map((o) => o.customerId))];
    const customers = await Promise.all(customerIds.map((id) => ctx.db.get(id)));
    const customersById = new Map(
      customers.filter(Boolean).map((c) => [c!._id.toString(), c])
    );

    // OPTIMIZED: Per-item indexed lookups for production records (not full table scan)
    const allItems = Array.from(itemsByOrder.values()).flat();
    const productionByItem = new Map<string, Doc<"orderItemProduction">[]>();
    await Promise.all(allItems.map(async (item) => {
      const records = await ctx.db.query("orderItemProduction")
        .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
        .collect();
      if (records.length > 0) {
        productionByItem.set(item._id.toString(), records);
      }
    }));

    // Build result with pre-fetched data
    const result = completedToday.map((order) => {
      const items = itemsByOrder.get(order._id.toString()) ?? [];
      const customer = customersById.get(order.customerId.toString()) ?? null;

      // Calculate ball counts from orderItemProduction records
      let bigBalls = 0;
      let midBalls = 0;

      for (const item of items) {
        if (item.isCancelled) continue;

        const records = productionByItem.get(item._id.toString()) ?? [];
        const activeRecords = records.filter(r => !r.isCancelled);

        for (const record of activeRecords) {
          if (record.productionUnitCode === "BIG_BALL") {
            bigBalls += record.unitsCompleted;
          } else if (record.productionUnitCode === "MID_BALL") {
            midBalls += record.unitsCompleted;
          }
        }
      }

      return {
        ...order,
        items,
        customer,
        bigBalls,
        midBalls,
      };
    });

    // Sort by completion time (most recent first)
    return result.sort((a, b) => b._creationTime - a._creationTime);
  },
});

// ============================================
// Phase 14: Kanban Board Queries
// ============================================

/**
 * List orders grouped by Kanban column for the board view.
 * Returns 6 columns, each sorted by dueDate ascending (nearest due first).
 * Complete column is limited to last 50 orders for performance.
 *
 * Phase 14: Core query powering the Kanban UI (Plan 04).
 */
export const listForKanban = query({
  args: {},
  handler: async (ctx) => {
    // Define column -> status mapping (matches STATUS_CATEGORIES in statusTransitions.ts)
    const columns = [
      { key: "draft", statuses: ["Draft"] as const },
      { key: "awaiting_payment", statuses: ["AwaitingPayment"] as const },
      { key: "payment_received", statuses: ["PaymentReceived"] as const },
      { key: "being_prepared", statuses: ["BeingPrepared"] as const },
      { key: "awaiting_delivery", statuses: ["AwaitingDelivery"] as const },
      // Include legacy terminal statuses (CompleteShipped, PickedUp) for unmigrated orders
      { key: "complete", statuses: ["Complete", "Cancelled", "CompleteShipped", "PickedUp"] as const },
    ];

    const result: Record<string, Array<{
      _id: string;
      _creationTime: number;
      orderNumber: string;
      status: string;
      customerName: string;
      customerPhone?: string;
      contactWa?: string;
      dueDate?: number;
      completedAt?: number;
      deliveryType?: string;
      deliveryAddress?: string;
      totalAmount: number;
      totalCost: number;
      totalMargin: number;
      finalTotal?: number;
      orderLevelDiscount?: number;
      orderLevelDiscountType?: string;
      voucherDiscountValue?: number;
      expedited?: boolean;
      creatorName: string;
      items: Array<{
        _id: string;
        productName: string;
        productVariant?: string;
        quantity: number;
        lineTotal: number;
      }>;
    }>> = {};

    for (const col of columns) {
      const orders: Doc<"orders">[] = [];
      for (const status of col.statuses) {
        const statusOrders = await ctx.db
          .query("orders")
          .withIndex("by_status_due_date", (q) => q.eq("status", status))
          .collect();
        orders.push(...statusOrders);
      }

      // For "complete" column: limit to last 50 by completedAt descending (performance)
      let sortedOrders: Doc<"orders">[];
      if (col.key === "complete") {
        sortedOrders = orders
          .sort((a, b) => (b.completedAt ?? b._creationTime) - (a.completedAt ?? a._creationTime))
          .slice(0, 50);
      } else if (col.key === "draft") {
        // Draft column: newest first (creation date descending)
        sortedOrders = orders.sort(
          (a, b) => b._creationTime - a._creationTime
        );
      } else {
        // Other columns: dueDate ascending (nearest due first), nulls last
        sortedOrders = orders.sort(
          (a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity)
        );
      }

      // Enrich with items + creator name
      const enriched = await Promise.all(
        sortedOrders.map(async (order) => {
          const items = await ctx.db
            .query("orderItems")
            .withIndex("by_order", (q) => q.eq("orderId", order._id))
            .filter((q) => q.neq(q.field("isCancelled"), true))
            .collect();

          // Resolve creator name from users table
          let creatorName = order.createdBy ?? "admin";
          if (order.createdByUserId) {
            const user = await ctx.db.get(order.createdByUserId);
            if (user) creatorName = user.name;
          }

          return {
            // Identity
            _id: order._id,
            _creationTime: order._creationTime,
            orderNumber: order.orderNumber,
            status: order.status,
            // Customer
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            contactWa: order.contactWa,
            // Timing
            dueDate: order.dueDate,
            completedAt: order.completedAt,
            // Delivery
            deliveryType: order.deliveryType,
            deliveryAddress: order.deliveryAddress,
            // Pricing (used by KanbanCard for discount display)
            totalAmount: order.totalAmount,
            totalCost: order.totalCost,
            totalMargin: order.totalMargin,
            finalTotal: order.finalTotal,
            orderLevelDiscount: order.orderLevelDiscount,
            orderLevelDiscountType: order.orderLevelDiscountType,
            voucherDiscountValue: order.voucherDiscountValue,
            // Flags
            expedited: order.expedited,
            // Creator
            creatorName,
            // Items — lean shape
            items: items.map((item) => ({
              _id: item._id,
              productName: item.productName,
              productVariant: item.productVariant,
              quantity: item.quantity,
              lineTotal: item.lineTotal,
            })),
          };
        })
      );

      result[col.key] = enriched;
    }

    return result;
  },
});

/**
 * Get audit trail for an order.
 * Returns orderEvents enriched with user names, sorted newest first.
 *
 * Phase 14: Powers the audit trail timeline in order details slide-over.
 */
export const getAuditTrail = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("orderEvents")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    // Sort newest first
    events.sort((a, b) => b.timestamp - a.timestamp);

    // Enrich with user names
    const enriched = await Promise.all(
      events.map(async (event) => {
        let userName: string | undefined;
        if (event.userId) {
          const user = await ctx.db.get(event.userId);
          if (user) userName = user.name;
        }
        return { ...event, userName };
      })
    );

    return enriched;
  },
});
