/**
 * Dispatch Planner Queries
 *
 * Provides the unified weekly plan view, channel configuration,
 * planner settings, consignment outlets, and inventory simulation.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { ChannelSection, UnifiedWeeklyPlan } from "./types";
import { generateWeekDates, CHANNEL_COLORS } from "./helpers";
import { getTodayJakarta } from "../k3martCockpit/helpers";
import {
  assembleDirectChannel,
  assembleGofoodChannel,
  assembleK3martChannel,
  assembleConsignmentChannel,
  computeBallTotals,
} from "./helpers/weeklyPlanBuilder";
import { simulateInventoryForDates } from "./helpers/inventorySimulation";
import { getProductionUnitsByTypePerProduct } from "../reports/productionUnitHelpers";

// ============================================
// Simple config queries
// ============================================

/**
 * Query all dispatchChannelConfig records sorted by priority.
 */
export const getChannelConfig = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("dispatchChannelConfig")
      .withIndex("by_priority")
      .collect();
  },
});

/**
 * Query the single dispatchPlannerSettings record.
 * Returns default { dailyCapacity: 200 } if none exists.
 */
export const getPlannerSettings = query({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("dispatchPlannerSettings").first();
    if (!settings) {
      return { dailyCapacity: 200 };
    }
    return {
      _id: settings._id,
      dailyCapacity: settings.dailyCapacity,
    };
  },
});

/**
 * Query consignmentOutlets with optional enabledOnly filter.
 * Uses by_active index on the unified consignmentOutlets table.
 */
export const getConsignmentOutlets = query({
  args: {
    enabledOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.enabledOnly) {
      return await ctx.db
        .query("consignmentOutlets")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
    }
    return await ctx.db.query("consignmentOutlets").collect();
  },
});

// ============================================
// Main unified weekly plan query
// ============================================

/**
 * Main assembly query for the dispatch planner grid.
 * Reads from orders, externalOutlets, k3martDispatchPlans, dispatchPlans,
 * externalRevenue to build a unified weekly view.
 */
export const getUnifiedWeeklyPlan = query({
  args: { startDate: v.string() },
  handler: async (ctx, args): Promise<UnifiedWeeklyPlan> => {
    const dates = generateWeekDates(args.startDate);
    const todayStr = getTodayJakarta();

    // Capacity comes from kitchenConfig.maxProductionTarget (source of truth for kitchen defaults)
    const kitchenCfg = await ctx.db.query("kitchenConfig").first();
    const dailyCapacity = kitchenCfg?.maxProductionTarget ?? 200;

    // Fetch enabled channels sorted by priority
    const channelConfigs = await ctx.db
      .query("dispatchChannelConfig")
      .withIndex("by_priority")
      .collect();
    const enabledChannels = channelConfigs.filter((c) => c.isEnabled);

    // Fetch all menu products for name lookups
    const allMenuProducts = await ctx.db
      .query("menuProducts")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    const menuProductMap = new Map<string, Doc<"menuProducts">>();
    for (const mp of allMenuProducts) {
      // Skip packaging-only products (e.g., Brochure-How to Eat)
      if (mp.productType === "packaging") continue;
      // Skip products not assigned to a food POS slot (legacy / inactive in POS)
      if (!mp.posSlot) continue;
      menuProductMap.set(mp._id, mp);
    }

    // Fetch all dispatchPlans for this date range
    const allDispatchPlans: Doc<"dispatchPlans">[] = [];
    for (const date of dates) {
      const plans = await ctx.db
        .query("dispatchPlans")
        .withIndex("by_date", (q) => q.eq("date", date))
        .collect();
      allDispatchPlans.push(...plans);
    }

    // Initialize daily totals
    const dailyTotals: Record<string, Record<string, number>> = {};
    // Per-channel per-product per-date quantities (used to compute dailyBallTotals via BOM expansion)
    // Structure: dailyChannelProductQty[date][channel][mpId] = qty
    const dailyChannelProductQty: Record<string, Record<string, Record<string, number>>> = {};
    for (const date of dates) {
      dailyTotals[date] = {};
      dailyChannelProductQty[date] = {};
    }

    const channels: ChannelSection[] = [];

    for (const config of enabledChannels) {
      const channelKey = config.channelKey;
      const section: ChannelSection = {
        channelKey,
        displayName: config.displayName,
        color: config.color || CHANNEL_COLORS[channelKey] || "#888888",
        priority: config.priority,
        isEditable: true, // All channels are editable (past days are read-only per cell)
        outlets: [],
      };

      if (channelKey === "direct") {
        await assembleDirectChannel(
          ctx, section, dates, todayStr, dailyTotals, menuProductMap, allDispatchPlans, dailyChannelProductQty
        );
      } else if (channelKey === "gofood") {
        await assembleGofoodChannel(
          ctx, section, dates, todayStr, dailyTotals, menuProductMap, allDispatchPlans, dailyChannelProductQty
        );
      } else if (channelKey === "k3mart") {
        await assembleK3martChannel(
          ctx, section, dates, todayStr, dailyTotals, menuProductMap, allDispatchPlans, dailyChannelProductQty
        );
      } else if (channelKey === "consignment") {
        await assembleConsignmentChannel(
          ctx, section, dates, todayStr, dailyTotals, menuProductMap, allDispatchPlans, dailyChannelProductQty
        );
      }

      channels.push(section);
    }

    // Compute BOM-expanded ball totals via helper
    const { dailyBallTotals, dailyBallTotalsByChannel } = await computeBallTotals(
      ctx, dates, dailyChannelProductQty
    );

    return {
      dates,
      todayStr,
      dailyCapacity,
      channels,
      dailyTotals,
      dailyBallTotals,
      dailyBallTotalsByChannel,
    };
  },
});

// ============================================
// Inventory simulation query
// ============================================

/**
 * Simulate inventory sufficiency for the 7-day planning window.
 * Walks BOM for each product in dispatch plans, compares against componentStock.
 * Also walks production component hierarchy to calculate ingredient requirements.
 */
export const simulateInventory = query({
  args: { startDate: v.string() },
  handler: async (ctx, args) => {
    return simulateInventoryForDates(ctx, args.startDate);
  },
});

/**
 * Get ball totals and packaging breakdown for a specific date from dispatch plans.
 * Used by "Save targets for kitchen" button in DispatchPlanner.
 * Returns the same shape as getKitchenTargetsForDate source="dispatch_plan".
 */
export const getBallTotalsForDispatchPlanDate = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    // Source A: dispatch plan entries (all channels: gofood, consignment, direct-manual, k3mart via dispatchPlans)
    const dayPlans = await ctx.db
      .query("dispatchPlans")
      .withIndex("by_date", (q: any) => q.eq("date", args.date))
      .collect();

    // Source B: Direct Sales orders with dueDate matching args.date (not Draft/Cancelled)
    // dueDate is stored as epoch ms; convert date string to epoch range for Jakarta timezone
    const dateEpochStart = new Date(args.date + "T00:00:00+07:00").getTime();
    const dateEpochEnd = new Date(args.date + "T23:59:59+07:00").getTime();
    const excludeStatuses = new Set(["Draft", "Cancelled"]);

    const allOrders = await ctx.db
      .query("orders")
      .withIndex("by_status_due_date")
      .collect();
    const directOrders = allOrders.filter((o: Doc<"orders">) => {
      if (!o.dueDate) return false;
      if (excludeStatuses.has(o.status)) return false;
      return o.dueDate >= dateEpochStart && o.dueDate <= dateEpochEnd;
    });

    // Build a menuProductId -> qty map from direct orders
    const orderProductQty = new Map<string, number>();
    for (const order of directOrders) {
      const items = await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q: any) => q.eq("orderId", order._id))
        .collect();
      for (const item of items) {
        if (item.isCancelled) continue;
        if (!item.menuProductId) continue;
        const mpId = item.menuProductId as string;
        orderProductQty.set(mpId, (orderProductQty.get(mpId) ?? 0) + item.quantity);
      }
    }

    // Early return only if both sources are empty
    if (dayPlans.length === 0 && orderProductQty.size === 0) {
      return {
        bigBalls: 0,
        midBalls: 0,
        unitsByType: {} as Record<string, number>,
        packagingBreakdown: [] as Array<{ menuProductId: string; quantity: number }>,
      };
    }

    // Dynamic BOM resolution — iterates all componentTypes where category=production AND unit=pcs.
    // Big Ball + Mid Ball + Hazelnut (+future) are counted automatically (Pitfall #11 closure).
    const { byProduct } = await getProductionUnitsByTypePerProduct(ctx);
    const unitsByType: Record<string, number> = {};
    const packagingMap = new Map<string, number>(); // menuProductId -> quantity

    // Pass 1: dispatch plan entries
    for (const plan of dayPlans) {
      const mpId = plan.menuProductId as string;
      packagingMap.set(mpId, (packagingMap.get(mpId) ?? 0) + plan.plannedQty);
      const perType = byProduct.get(plan.menuProductId);
      if (!perType) continue;
      for (const [code, pcsPerUnit] of perType.entries()) {
        unitsByType[code] = (unitsByType[code] ?? 0) + pcsPerUnit * plan.plannedQty;
      }
    }

    // Pass 2: Direct Sales order-derived quantities
    for (const [mpId, qty] of orderProductQty) {
      packagingMap.set(mpId, (packagingMap.get(mpId) ?? 0) + qty);
      const perType = byProduct.get(mpId as Id<"menuProducts">);
      if (!perType) continue;
      for (const [code, pcsPerUnit] of perType.entries()) {
        unitsByType[code] = (unitsByType[code] ?? 0) + pcsPerUnit * qty;
      }
    }

    const packagingBreakdown = Array.from(packagingMap.entries()).map(([menuProductId, quantity]) => ({
      menuProductId,
      quantity,
    }));

    // Backward-compatible return: existing UI consumers still see bigBalls/midBalls.
    // New callers can use unitsByType which includes HAZELNUT_REGULAR and future types.
    return {
      bigBalls: unitsByType["BIG_BALL"] ?? 0,
      midBalls: unitsByType["MID_BALL"] ?? 0,
      unitsByType,
      packagingBreakdown,
    };
  },
});
