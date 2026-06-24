import { query } from "../_generated/server";
import { protectedQuery } from "../lib/functions";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { fetchOrdersWithItemsAndProduction } from "./helpers/batchFetching";
import { stripOrder } from "./helpers/stripOrders";
import { isSubscriptionOrder } from "../subscriptions/revenueGate";
import {
  calculateBallStatsFromItems,
  calculateProductionStatsByType,
  sortByPriorityComparator,
  aggregateKitchenStats,
  calculateOrderBallCounts,
} from "./helpers/kitchenEnrichment";
import { KANBAN_COLUMNS, sortKanbanColumn, buildKanbanCard } from "./helpers/kanbanBuilders";
import type { KanbanOrderCard } from "./helpers/kanbanBuilders";
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
export const list = protectedQuery({
  // gap#2 (residual): ALL kanban/list-viewing roles (Pitfall #19 — omitting
  // kitchen/order_staff crashes any list surface for them on mount). This list
  // emitted subscription-order money (totalAmount/finalTotal/totalMargin/
  // totalCost + per-item lineTotal/unitPrice/lineMargin) unstripped. Confidential
  // partner pricing is now stripped server-side per order (D11: strip, don't hide).
  roles: ["kitchen", "order_staff", "manager", "admin"],
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
        // Single status - use index. Narrowed past the Array.isArray guard, so
        // args.status is a single status literal here.
        const singleStatus = args.status;
        orders = await ctx.db
          .query("orders")
          .withIndex("by_status", (q) => q.eq("status", singleStatus))
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

        // gap#2 (residual): strip confidential partner pricing for non-managers
        // on subscription orders, PER ORDER (every element of the list).
        const stripped = stripOrder(ctx.user.role, order, items);

        return {
          ...stripped.order,
          items: stripped.items,
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
export const listPaginated = protectedQuery({
  // gap#2 (residual): ALL list-viewing roles (Pitfall #19). This emitted the
  // denormalized subscription-order money (totalAmount/finalTotal/totalMargin/
  // totalCost) unstripped. Stripped server-side per page element (D11).
  roles: ["kitchen", "order_staff", "manager", "admin"],
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
    const enrichedPage = paginatedResult.page.map((order) => {
      // gap#2 (residual): strip confidential partner pricing for non-managers on
      // subscription orders, PER PAGE ELEMENT. No items are fetched for the list
      // view, so the strip only nulls the order-level money fields.
      const stripped = stripOrder(ctx.user.role, order);
      return {
        ...stripped.order,
        customer: null,
      };
    });

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
export const get = protectedQuery({
  // gap#2: ALL kanban-viewing roles (Pitfall #19 — omitting kitchen/order_staff
  // crashes the board for them on mount). Confidential subscription pricing is
  // stripped server-side below for non-managers (D11: strip, don't hide).
  roles: ["kitchen", "order_staff", "manager", "admin"],
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

    // gap#2: strip confidential partner pricing for non-managers on subscription orders.
    const stripped = stripOrder(ctx.user.role, order, items);

    return {
      ...stripped.order,
      items: stripped.items,
      customer,
      creatorName,
    };
  },
});

/**
 * Get order by order number.
 */
export const getByOrderNumber = protectedQuery({
  // gap#2: ALL kanban-viewing roles (Pitfall #19). Strip applied below.
  roles: ["kitchen", "order_staff", "manager", "admin"],
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

    // gap#2: strip confidential partner pricing for non-managers on subscription orders.
    const stripped = stripOrder(ctx.user.role, order, items);

    return {
      ...stripped.order,
      items: stripped.items,
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
export const getKitchenOrders = protectedQuery({
  // gap#2: kitchen board roles (Pitfall #19). Strip applied per enriched order below.
  roles: ["kitchen", "order_staff", "manager", "admin"],
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
        const strippedOrder = stripOrder(ctx.user.role, order).order;
        return {
          ...strippedOrder,
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

      // gap#2: strip confidential partner pricing for non-managers on subscription
      // orders. Production records / qty are preserved (kitchen needs them).
      const stripped = stripOrder(ctx.user.role, order, itemsWithProduction);

      return {
        ...stripped.order,
        items: stripped.items,
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
export const getByCustomer = protectedQuery({
  // gap#2 (residual): ALL order-viewing roles (Pitfall #19). Emitted per-order
  // subscription money (totalAmount/finalTotal/totalMargin/totalCost) unstripped.
  // Stripped server-side per order (D11: strip, don't hide).
  roles: ["kitchen", "order_staff", "manager", "admin"],
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .order("desc")
      .collect();

    // gap#2 (residual): strip confidential partner pricing for non-managers on
    // subscription orders, PER ORDER. No items fetched — strips order money only.
    return orders.map(
      (order) => stripOrder(ctx.user.role, order).order
    );
  },
});

/**
 * Get product suggestions based on previous orders.
 * Returns unique product names with their last used price/cost.
 */
export const getProductSuggestions = protectedQuery({
  // gap#2 (residual): order-creation surface (Pitfall #19). This aggregates
  // per-item unitPrice/unitCost as "last used price" suggestions keyed by product
  // name. Subscription order items carry the CONFIDENTIAL partner price in
  // unitPrice, so for non-managers we must EXCLUDE items belonging to subscription
  // orders from the suggestion pool (D11: strip server-side, don't leak).
  roles: ["kitchen", "order_staff", "manager", "admin"],
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const isManagerial = ctx.user.role === "manager" || ctx.user.role === "admin";

    // Get recent order items (bounded to avoid scanning entire history)
    const allItems = await ctx.db.query("orderItems").order("desc").take(500);

    // gap#2 (residual): for non-managers, drop any item whose parent order is a
    // subscription order so the confidential partner price never surfaces as a
    // suggestion. Parent-order lookups are memoized to avoid duplicate reads.
    const subscriptionOrderCache = new Map<string, boolean>();
    const isSubscriptionItem = async (orderId: Id<"orders">) => {
      const key = orderId.toString();
      const cached = subscriptionOrderCache.get(key);
      if (cached !== undefined) return cached;
      const order = await ctx.db.get(orderId);
      const result = order ? isSubscriptionOrder(order) : false;
      subscriptionOrderCache.set(key, result);
      return result;
    };

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
        if (!isManagerial && (await isSubscriptionItem(item.orderId))) {
          continue;
        }
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

    // Completed-today: fetch terminal and near-terminal statuses, filter by completedAt
    const [completedOrders, awaitingDeliveryOrders] = await Promise.all([
      ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", "Complete")).collect(),
      ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", "AwaitingDelivery")).collect(),
    ]);
    const completedTodayOrders = [
      ...completedOrders, ...awaitingDeliveryOrders,
    ].filter((o) => o.completedAt && o.completedAt >= midnight);

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

    // PRD-5: Fetch production unit types for dynamic stats (DB query stays in orchestrator)
    const productionUnitTypes = await ctx.db
      .query("productionUnitTypes")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // WIB day boundaries for due-today calculation
    const wibNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const wibTodayStr = wibNow.toISOString().split("T")[0];
    const wibDayStartUtc = new Date(wibTodayStr + "T00:00:00+07:00").getTime();
    const wibDayEndUtc = wibDayStartUtc + 24 * 60 * 60 * 1000;

    const stats = aggregateKitchenStats({
      pendingOrders, completedTodayOrders, itemsByOrder, productionByItem,
      productionUnitTypes, wibDayStartUtc, wibDayEndUtc,
    });

    return {
      bigBallsNeeded: stats.bigBallsNeeded,
      bigBallsCompleted: stats.bigBallsCompleted,
      midBallsNeeded: stats.midBallsNeeded,
      midBallsCompleted: stats.midBallsCompleted,
      ordersPending: pendingOrders.length,
      ordersCompletedToday: completedTodayOrders.length,
      productionByType: stats.productionByType,
      minTargetToday: stats.minTargetToday,
      ordersLeftToComplete: stats.ordersLeftToComplete,
    };
  },
});

/**
 * Get orders ready for packaging (ProductionComplete status).
 * PRD-5: For packaging view - shows orders that need to be packed.
 */
export const getPackagingOrders = protectedQuery({
  // gap#2 (residual): packaging surface is reachable by ALL roles
  // (canAccessPackaging — Pitfall #19). It returned full orders + items with
  // subscription money (totalAmount/finalTotal/totalMargin/totalCost +
  // lineTotal/unitPrice/lineMargin) unstripped. Stripped server-side per order (D11).
  roles: ["kitchen", "order_staff", "manager", "admin"],
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

        // gap#2 (residual): strip confidential partner pricing for non-managers on
        // subscription orders, PER ORDER. menuProduct/productionComponents on each
        // item are preserved (packaging needs them); only the money fields are nulled.
        const stripped = stripOrder(ctx.user.role, order, enrichedItems);

        return {
          ...stripped.order,
          items: stripped.items,
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

export const getCompletedToday = protectedQuery({
  // gap#2 (residual): KITCHEN surface (Pitfall #19 — omitting kitchen/order_staff
  // crashes the kitchen history view for them on mount). Emitted subscription-order
  // money (order totals + per-item lineTotal/unitPrice/lineMargin) unstripped.
  // Stripped server-side per order (D11: strip, don't hide).
  roles: ["kitchen", "order_staff", "manager", "admin"],
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
    ].filter((o) => o.completedAt && o.completedAt >= midnight);

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
      const { bigBalls, midBalls } = calculateOrderBallCounts(items, productionByItem);

      // gap#2 (residual): strip confidential partner pricing for non-managers on
      // subscription orders, PER ORDER. Ball counts / qty preserved (kitchen needs them).
      const stripped = stripOrder(ctx.user.role, order, items);

      return {
        ...stripped.order,
        items: stripped.items,
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
export const listForKanban = protectedQuery({
  // CR-D: ALL kanban-viewing roles (Pitfall #19 — omitting kitchen/order_staff
  // crashes the board for them on mount). This is the PRIMARY kanban board query;
  // it emitted subscription-order money (totalAmount/finalTotal/totalMargin/
  // totalCost + per-item lineTotal) unstripped to kitchen/order_staff. Confidential
  // partner pricing is now stripped server-side per card (D11: strip, don't hide).
  roles: ["kitchen", "order_staff", "manager", "admin"],
  args: {},
  handler: async (ctx) => {
    const result: Record<string, KanbanOrderCard[]> = {};

    for (const col of KANBAN_COLUMNS) {
      const orders: Doc<"orders">[] = [];
      for (const status of col.statuses) {
        const statusOrders = await ctx.db
          .query("orders")
          .withIndex("by_status_due_date", (q) => q.eq("status", status))
          .collect();
        orders.push(...statusOrders);
      }

      const sortedOrders = sortKanbanColumn(col.key, orders);

      // Enrich with items + creator name
      const enriched = await Promise.all(
        sortedOrders.map(async (order) => {
          const items = await ctx.db
            .query("orderItems")
            .withIndex("by_order", (q) => q.eq("orderId", order._id))
            .filter((q) => q.neq(q.field("isCancelled"), true))
            .collect();

          let creatorName = order.createdBy ?? "admin";
          if (order.createdByUserId) {
            const user = await ctx.db.get(order.createdByUserId);
            if (user) creatorName = user.name;
          }

          // CR-D: strip confidential partner pricing BEFORE building the card so
          // the card inherits the nulled money fields (non-managers on subscription
          // orders). buildKanbanCard copies order.totalAmount/etc + item.lineTotal.
          const stripped = stripOrder(ctx.user.role, order, items);
          return buildKanbanCard(stripped.order, stripped.items, creatorName);
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
