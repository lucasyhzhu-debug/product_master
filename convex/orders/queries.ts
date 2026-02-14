import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { fetchOrdersByStatuses } from "./helpers/statusFetching";
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
 */
export const list = query({
  args: {
    status: v.optional(v.union(
      v.literal("Draft"),
      v.literal("AwaitingPayment"),
      v.literal("Confirmed"),
      v.literal("InProduction"),
      v.literal("Boxed"),
      v.literal("Labeled"),
      v.literal("ProductionComplete"),
      v.literal("Packaging"),
      v.literal("WaitingShipment"),
      v.literal("CompleteShipped"),
      v.literal("WaitingPickup"),
      v.literal("PickedUp"),
      v.literal("Cancelled"),
      v.array(v.union(
        v.literal("Draft"),
        v.literal("AwaitingPayment"),
        v.literal("Confirmed"),
        v.literal("InProduction"),
        v.literal("Boxed"),
        v.literal("Labeled"),
        v.literal("ProductionComplete"),
        v.literal("Packaging"),
        v.literal("WaitingShipment"),
        v.literal("CompleteShipped"),
        v.literal("WaitingPickup"),
        v.literal("PickedUp"),
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
    // Fetch orders by status (consolidated from 6 duplicate queries to 1 helper call)
    // Priority 0: Confirmed, InProduction, Packaging (active orders)
    // Priority 1: Boxed, Labeled (post-production workflow)
    // Priority 2: Draft (de-prioritized)
    // Priority 3: WaitingShipment, WaitingPickup (completed packaging, lowest priority)
    const orders = await fetchOrdersByStatuses(ctx, [
      "Draft",
      "Confirmed",
      "InProduction",
      "Packaging",
      "Boxed",
      "Labeled",
      "WaitingShipment",
      "WaitingPickup",
    ]);

    // PRD-5: Get all production unit types for dynamic aggregation
    const productionUnitTypes = await ctx.db
      .query("productionUnitTypes")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // OPTIMIZED: Batch fetch all items and production records (2 queries instead of N + N*M)
    const orderIds = orders.map((o) => o._id);
    const orderDataMap = await fetchOrdersWithItemsAndProduction(ctx, orderIds);

    // Map orders with enriched data and calculations
    const result = orders.map((order) => {
      const orderData = orderDataMap.get(order._id);
      if (!orderData) {
        // Fallback for orders without items
        return {
          ...order,
          items: [],
          bigBallsNeeded: 0,
          midBallsNeeded: 0,
          productionByType: [],
        };
      }

      // Enrich items with production records
      const itemsWithProduction = orderData.items.map((item) => ({
        ...item,
        productionRecords: orderData.production.get(item._id) ?? [],
      }));

      // BOM-01: Dual-read ball stats (BOM first, deprecated fallback)
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

    // PRD-Kitchen-UI-Flow: Priority-based sorting
    return sortOrdersByPriority(result);
  },
});

/**
 * Dual-read ball composition: BOM (production records) first, deprecated fallback.
 * BOM-01: This is the migration bridge function. For items with production records,
 * ball stats are derived from the new system. For historical orders without records,
 * the deprecated fields are used as fallback.
 *
 * CRITICAL: The fallback replicates EXISTING behavior for historical orders:
 *   "original" -> midBallsNeeded (counterintuitive but matches current code, see Pitfall #11)
 *   "bite_sized" -> bigBallsNeeded (current code behavior)
 * For new orders with production records, the records contain correct codes directly.
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
      continue; // Skip deprecated fallback for this item
    }

    // FALLBACK: Deprecated fields for historical orders (pre-BOM)
    // IMPORTANT: Replicates EXISTING calculateOldSystemBallStats behavior exactly.
    // "original" -> midBallsNeeded, "bite_sized" -> bigBallsNeeded
    // This mapping looks counterintuitive but matches the existing code behavior
    // that users have been seeing. Changing it would alter historical display.
    if (item.productionType === "original" && item.productionUnits) {
      midBallsNeeded += item.productionUnits * item.quantity;
    } else if (item.productionType === "bite_sized" && item.productionUnits) {
      bigBallsNeeded += item.productionUnits * item.quantity;
    }
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
 * Sort orders by priority level, then by due date, then by creation time.
 * Priority 0: Confirmed, InProduction, Packaging (active orders)
 * Priority 1: Boxed, Labeled (post-production workflow)
 * Priority 2: Draft (de-prioritized)
 * Priority 3: WaitingShipment, WaitingPickup (completed packaging, lowest priority)
 */
function sortOrdersByPriority<T extends Doc<"orders">>(orders: T[]): T[] {
  return orders.sort((a, b) => {
    // Assign priority based on status
    const getPriority = (status: string): number => {
      if (status === "Confirmed" || status === "InProduction" || status === "Packaging") {
        return 0;
      } else if (status === "Boxed" || status === "Labeled") {
        return 1;
      } else if (status === "Draft") {
        return 2;
      } else if (status === "WaitingShipment" || status === "WaitingPickup") {
        return 3;
      }
      return 4; // Fallback
    };

    const aPriority = getPriority(a.status);
    const bPriority = getPriority(b.status);

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
  });
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
 * PRD-5: Enhanced with dynamic production type stats.
 * OPTIMIZED: Batch fetch all orderItems to avoid N+1 queries.
 */
export const getKitchenStats = query({
  args: {},
  handler: async (ctx) => {
    // Get all orders
    const allOrders = await ctx.db.query("orders").collect();

    // Get midnight today
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    // Filter orders by status first
    // Include Draft + Confirmed + InProduction + Packaging for pending ball counts
    // Draft orders are included in counts (they need balls too, just lower priority)
    const draftOrders = allOrders.filter((o) => o.status === "Draft");
    const confirmedOrders = allOrders.filter((o) => o.status === "Confirmed");
    const inProductionOrders = allOrders.filter((o) => o.status === "InProduction");
    const packagingOrders = allOrders.filter((o) => o.status === "Packaging");
    const pendingOrders = [...draftOrders, ...confirmedOrders, ...inProductionOrders, ...packagingOrders];

    const completedStatuses = [
      "ProductionComplete",
      "Packaging",
      "WaitingShipment",
      "WaitingPickup",
      "CompleteShipped",
      "PickedUp",
    ];
    const completedTodayOrders = allOrders.filter(
      (o) => completedStatuses.includes(o.status) && o._creationTime >= midnight
    );

    // BATCH FETCH: Get all orderItems in one query (avoids N+1)
    const allOrderItems = await ctx.db.query("orderItems").collect();

    // Group items by orderId for O(1) lookup
    const itemsByOrder = new Map<string, typeof allOrderItems>();
    for (const item of allOrderItems) {
      const orderId = item.orderId.toString();
      if (!itemsByOrder.has(orderId)) {
        itemsByOrder.set(orderId, []);
      }
      itemsByOrder.get(orderId)!.push(item);
    }

    // BATCH FETCH: Get all orderItemProduction records (moved before stats calculation for dual-read)
    const allProductionRecords = await ctx.db.query("orderItemProduction").collect();

    // Group production records by orderItemId
    const productionByItem = new Map<string, typeof allProductionRecords>();
    for (const record of allProductionRecords) {
      const itemId = record.orderItemId.toString();
      if (!productionByItem.has(itemId)) {
        productionByItem.set(itemId, []);
      }
      productionByItem.get(itemId)!.push(record);
    }

    // BOM-01: Calculate stats for pending orders using dual-read pattern
    // NEW system: uses orderItemProduction.unitsRemaining (already accounts for balls filled)
    // FALLBACK: uses deprecated fields with ballsFilled subtraction for historical orders
    let bigBallsNeeded = 0;
    let midBallsNeeded = 0;

    for (const order of pendingOrders) {
      const items = itemsByOrder.get(order._id.toString()) ?? [];
      for (const item of items) {
        if (item.isCancelled) continue;

        // Check for production records (NEW system)
        const records = productionByItem.get(item._id.toString()) ?? [];
        const activeRecords = records.filter(r => !r.isCancelled);

        if (activeRecords.length > 0) {
          // NEW system: unitsRemaining already reflects balls filled
          for (const record of activeRecords) {
            if (record.productionUnitCode === "BIG_BALL") {
              bigBallsNeeded += record.unitsRemaining;
            } else if (record.productionUnitCode === "MID_BALL") {
              midBallsNeeded += record.unitsRemaining;
            }
          }
          continue;
        }

        // FALLBACK: Deprecated fields for historical orders (pre-BOM)
        const ballsFilled = item.ballsFilled ?? 0;
        const totalRequired = (item.quantity ?? 0) * (item.productionUnits ?? 0);
        const remaining = Math.max(0, totalRequired - ballsFilled);

        if (item.productionType === "original") {
          midBallsNeeded += remaining;
        } else if (item.productionType === "bite_sized") {
          bigBallsNeeded += remaining;
        }
      }
    }

    // BOM-01: Calculate stats for completed orders today using dual-read pattern
    let bigBallsCompleted = 0;
    let midBallsCompleted = 0;

    for (const order of completedTodayOrders) {
      const items = itemsByOrder.get(order._id.toString()) ?? [];
      for (const item of items) {
        if (item.isCancelled) continue;

        // Check for production records (NEW system)
        const records = productionByItem.get(item._id.toString()) ?? [];
        const activeRecords = records.filter(r => !r.isCancelled);

        if (activeRecords.length > 0) {
          // NEW system: unitsCompleted from production records
          for (const record of activeRecords) {
            if (record.productionUnitCode === "BIG_BALL") {
              bigBallsCompleted += record.unitsCompleted;
            } else if (record.productionUnitCode === "MID_BALL") {
              midBallsCompleted += record.unitsCompleted;
            }
          }
          continue;
        }

        // FALLBACK: Deprecated fields for historical orders (pre-BOM)
        if (item.productionType === "original" && item.productionUnits) {
          midBallsCompleted += item.productionUnits * item.quantity;
        } else if (item.productionType === "bite_sized" && item.productionUnits) {
          bigBallsCompleted += item.productionUnits * item.quantity;
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

    return {
      bigBallsNeeded,
      bigBallsCompleted,
      midBallsNeeded,
      midBallsCompleted,
      ordersPending: pendingOrders.length,
      ordersCompletedToday: completedTodayOrders.length,
      // PRD-5: Dynamic production type stats
      productionByType,
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
    // Get ProductionComplete orders
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "ProductionComplete"))
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
    const draftOrders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "Draft"))
      .collect();

    const confirmedOrders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "Confirmed"))
      .collect();

    const inProductionOrders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "InProduction"))
      .collect();

    const packagingOrders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "Packaging"))
      .collect();

    const orders = [...draftOrders, ...confirmedOrders, ...inProductionOrders, ...packagingOrders];

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
              // BOM-01: Deprecated fields kept for debug comparison only
              deprecated_productionType: item.productionType,
              deprecated_productionUnits: item.productionUnits,
              quantity: item.quantity,
              ballsFilled: item.ballsFilled,
              packageStatus: item.packageStatus,
              // BOM system (source of truth for new orders)
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

    // BATCH FETCH: Get all orderItems in one query (avoids N+1)
    const allOrderItems = await ctx.db.query("orderItems").collect();

    // Group items by orderId for O(1) lookup
    const itemsByOrder = new Map<string, typeof allOrderItems>();
    for (const item of allOrderItems) {
      const orderId = item.orderId.toString();
      if (!itemsByOrder.has(orderId)) {
        itemsByOrder.set(orderId, []);
      }
      itemsByOrder.get(orderId)!.push(item);
    }

    // BATCH FETCH: Get unique customer IDs and fetch customers
    const customerIds = [...new Set(completedToday.map((o) => o.customerId))];
    const customers = await Promise.all(customerIds.map((id) => ctx.db.get(id)));
    const customersById = new Map(
      customers.filter(Boolean).map((c) => [c!._id.toString(), c])
    );

    // BATCH FETCH: Get all orderItemProduction records for dual-read
    const allProductionRecords = await ctx.db.query("orderItemProduction").collect();
    const productionByItem = new Map<string, typeof allProductionRecords>();
    for (const record of allProductionRecords) {
      const itemId = record.orderItemId.toString();
      if (!productionByItem.has(itemId)) {
        productionByItem.set(itemId, []);
      }
      productionByItem.get(itemId)!.push(record);
    }

    // Build result with pre-fetched data
    const result = completedToday.map((order) => {
      const items = itemsByOrder.get(order._id.toString()) ?? [];
      const customer = customersById.get(order.customerId.toString()) ?? null;

      // BOM-01: Calculate ball counts using dual-read pattern
      let bigBalls = 0;
      let midBalls = 0;

      for (const item of items) {
        if (item.isCancelled) continue;

        // Check for production records (NEW system)
        const records = productionByItem.get(item._id.toString()) ?? [];
        const activeRecords = records.filter(r => !r.isCancelled);

        if (activeRecords.length > 0) {
          for (const record of activeRecords) {
            if (record.productionUnitCode === "BIG_BALL") {
              bigBalls += record.unitsCompleted;
            } else if (record.productionUnitCode === "MID_BALL") {
              midBalls += record.unitsCompleted;
            }
          }
          continue;
        }

        // FALLBACK: Deprecated fields for historical orders (pre-BOM)
        if (item.productionType === "original" && item.productionUnits) {
          midBalls += item.productionUnits * item.quantity;
        } else if (item.productionType === "bite_sized" && item.productionUnits) {
          bigBalls += item.productionUnits * item.quantity;
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
