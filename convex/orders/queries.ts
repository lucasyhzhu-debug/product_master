import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";

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
 */
export const list = query({
  args: {
    status: v.optional(v.string()),
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
 */
export const getKitchenOrders = query({
  args: {},
  handler: async (ctx) => {
    // Get orders in production-related statuses
    const productionStatuses = [
      "Confirmed",
      "Production",
      "Ready",
      "Shipped",
    ];

    const allOrders = await ctx.db.query("orders").order("desc").collect();

    const filtered = allOrders.filter((o) =>
      productionStatuses.includes(o.status)
    );

    // Fetch items for each order
    const result = await Promise.all(
      filtered.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();

        return {
          ...order,
          items,
        };
      })
    );

    // Sort by due date
    return result.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate - b.dueDate;
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
