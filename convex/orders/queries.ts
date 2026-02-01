import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

// ============================================
// Types
// ============================================

interface OrderWithItems extends Doc<"orders"> {
  items: Doc<"orderItems">[];
  customer: Doc<"customers"> | null;
}

// ============================================
// Queries
// ============================================

/**
 * List orders with optional filters.
 * PRD-0: Uses type-safe union for status filter.
 */
export const list = query({
  args: {
    status: v.optional(v.union(
      v.literal("Draft"),
      v.literal("AwaitingPayment"),
      v.literal("Confirmed"),
      v.literal("ProductionComplete"),
      v.literal("Packaging"),
      v.literal("WaitingShipment"),
      v.literal("CompleteShipped"),
      v.literal("WaitingPickup"),
      v.literal("PickedUp"),
      v.literal("Cancelled")
    )),
    channel: v.optional(v.string()),
    dueDateFrom: v.optional(v.number()),
    dueDateTo: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<OrderWithItems[]> => {
    const limit = args.limit ?? 100;

    // Get orders - use index if status filter is provided
    let orders;
    if (args.status) {
      orders = await ctx.db
        .query("orders")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(limit);
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

    return result;
  },
});

/**
 * Get a single order with items and customer.
 */
export const get = query({
  args: { id: v.id("orders") },
  handler: async (ctx, args): Promise<OrderWithItems | null> => {
    const order = await ctx.db.get(args.id);
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
 * PRD-1: Returns only Confirmed orders with ball calculations.
 */
export const getKitchenOrders = query({
  args: {},
  handler: async (ctx) => {
    // PRD-1: Get only Confirmed orders
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "Confirmed"))
      .collect();

    // Fetch items for each order and calculate ball needs
    const result = await Promise.all(
      orders.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();

        // Calculate ball needs
        let bigBallsNeeded = 0;
        let midBallsNeeded = 0;

        for (const item of items) {
          if (item.productionType === "original" && item.productionUnits) {
            bigBallsNeeded += item.productionUnits * item.quantity;
          } else if (item.productionType === "bite_sized" && item.productionUnits) {
            midBallsNeeded += item.productionUnits * item.quantity;
          }
        }

        return {
          ...order,
          items,
          bigBallsNeeded,
          midBallsNeeded,
        };
      })
    );

    // PRD-1: Sort by due date ASC → total units DESC → order date ASC
    return result.sort((a, b) => {
      // Sort by due date first (earliest first)
      if (a.dueDate !== b.dueDate) {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate - b.dueDate;
      }

      // Then by total units (most first)
      const aTotalUnits = a.bigBallsNeeded + a.midBallsNeeded;
      const bTotalUnits = b.bigBallsNeeded + b.midBallsNeeded;
      if (aTotalUnits !== bTotalUnits) {
        return bTotalUnits - aTotalUnits;
      }

      // Finally by order date (earliest first)
      return a.orderDate - b.orderDate;
    });
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

    // Get all order items
    const allItems = await ctx.db.query("orderItems").order("desc").collect();

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
 */
export const getKitchenStats = query({
  args: {},
  handler: async (ctx) => {
    // Get all orders
    const allOrders = await ctx.db.query("orders").collect();

    // Calculate stats
    let bigBallsNeeded = 0;
    let bigBallsCompleted = 0;
    let midBallsNeeded = 0;
    let midBallsCompleted = 0;
    let ordersPending = 0;
    let ordersCompletedToday = 0;

    // Get midnight today
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    for (const order of allOrders) {
      // Count pending orders (Confirmed status)
      if (order.status === "Confirmed") {
        ordersPending++;

        // Get items to calculate ball needs
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();

        for (const item of items) {
          if (item.productionType === "original" && item.productionUnits) {
            bigBallsNeeded += item.productionUnits * item.quantity;
          } else if (item.productionType === "bite_sized" && item.productionUnits) {
            midBallsNeeded += item.productionUnits * item.quantity;
          }
        }
      }

      // Count completed orders today
      const completedStatuses = [
        "ProductionComplete",
        "Packaging",
        "WaitingShipment",
        "WaitingPickup",
        "CompleteShipped",
        "PickedUp",
      ];

      if (completedStatuses.includes(order.status) && order._creationTime >= midnight) {
        ordersCompletedToday++;

        // Get items to calculate completed balls
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();

        for (const item of items) {
          if (item.productionType === "original" && item.productionUnits) {
            bigBallsCompleted += item.productionUnits * item.quantity;
          } else if (item.productionType === "bite_sized" && item.productionUnits) {
            midBallsCompleted += item.productionUnits * item.quantity;
          }
        }
      }
    }

    return {
      bigBallsNeeded,
      bigBallsCompleted,
      midBallsNeeded,
      midBallsCompleted,
      ordersPending,
      ordersCompletedToday,
    };
  },
});

/**
 * Get orders completed today.
 * PRD-1: For kitchen view history.
 */
export const getCompletedToday = query({
  args: {},
  handler: async (ctx) => {
    // Get midnight today
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    // Get all orders
    const allOrders = await ctx.db.query("orders").collect();

    // Filter to completed statuses since midnight
    const completedStatuses = [
      "ProductionComplete",
      "Packaging",
      "WaitingShipment",
      "WaitingPickup",
      "CompleteShipped",
      "PickedUp",
    ];

    const completedToday = allOrders.filter(
      (o) => completedStatuses.includes(o.status) && o._creationTime >= midnight
    );

    // Fetch items and customer for each order
    const result = await Promise.all(
      completedToday.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();

        const customer = await ctx.db.get(order.customerId);

        // Calculate ball counts
        let bigBalls = 0;
        let midBalls = 0;

        for (const item of items) {
          if (item.productionType === "original" && item.productionUnits) {
            bigBalls += item.productionUnits * item.quantity;
          } else if (item.productionType === "bite_sized" && item.productionUnits) {
            midBalls += item.productionUnits * item.quantity;
          }
        }

        return {
          ...order,
          items,
          customer,
          bigBalls,
          midBalls,
        };
      })
    );

    // Sort by completion time (most recent first)
    return result.sort((a, b) => b._creationTime - a._creationTime);
  },
});
