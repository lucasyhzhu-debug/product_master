/**
 * Dispatch Planner Queries
 *
 * Provides the unified weekly plan view, channel configuration,
 * planner settings, consignment outlets, and inventory simulation.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { ChannelSection, UnifiedWeeklyPlan } from "./types";
import { generateWeekDates, CHANNEL_COLORS } from "./helpers";
import { getTodayJakarta } from "../k3martCockpit/helpers";
import { collectLeafIngredients } from "../lib/hierarchyTraversal";
import {
  assembleDirectChannel,
  assembleGofoodChannel,
  assembleK3martChannel,
  assembleConsignmentChannel,
  computeBallTotals,
} from "./helpers/weeklyPlanBuilder";

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
    const dates = generateWeekDates(args.startDate);

    // Fetch all dispatch plans for the date range
    const allPlans: Doc<"dispatchPlans">[] = [];
    for (const date of dates) {
      const plans = await ctx.db
        .query("dispatchPlans")
        .withIndex("by_date", (q: any) => q.eq("date", date))
        .collect();
      allPlans.push(...plans);
    }

    // Fetch all component types
    const componentTypes = await ctx.db
      .query("componentTypes")
      .withIndex("by_active", (q: any) => q.eq("isActive", true))
      .collect();
    const componentTypeMap = new Map<string, Doc<"componentTypes">>();
    for (const ct of componentTypes) {
      componentTypeMap.set(ct._id as string, ct);
    }

    // Fetch all menu product components (BOM)
    const allBomEntries = await ctx.db
      .query("menuProductComponents")
      .collect();

    // Group BOM by menuProductId
    const bomByProduct = new Map<string, Doc<"menuProductComponents">[]>();
    for (const entry of allBomEntries) {
      const mpId = entry.menuProductId as string;
      if (!bomByProduct.has(mpId)) {
        bomByProduct.set(mpId, []);
      }
      bomByProduct.get(mpId)!.push(entry);
    }

    // Fetch current component stock (aggregate across locations)
    const allStock = await ctx.db.query("componentStock").collect();
    const stockByComponent = new Map<string, number>();
    for (const s of allStock) {
      const ctId = s.componentTypeId as string;
      const available = s.totalStock - s.totalReserved;
      stockByComponent.set(
        ctId,
        (stockByComponent.get(ctId) ?? 0) + available
      );
    }

    // ---- Ingredient simulation: collect leaf ingredients per production component ----
    // Cache leaf ingredients per production component to avoid repeated traversals
    const ingredientCache = new Map<string, Awaited<ReturnType<typeof collectLeafIngredients>>>();

    // Identify production components (balls) -- category=production, trackInventory=false
    const productionComponentIds = new Set<string>();
    for (const ct of componentTypes) {
      if (ct.category === "production" && !ct.trackInventory) {
        productionComponentIds.add(ct._id as string);
      }
    }

    // Build ingredient stock map: ingredient-type componentTypes (category=production, trackInventory=true)
    const ingredientComponentTypes = componentTypes.filter(
      (ct) => ct.category === "production" && ct.trackInventory
    );
    const ingredientStockMap = new Map<string, number>(); // ingredientComponentTypeId -> available
    for (const ict of ingredientComponentTypes) {
      ingredientStockMap.set(
        ict._id as string,
        stockByComponent.get(ict._id as string) ?? 0
      );
    }

    // Pre-load ingredient -> componentType mapping for ID-based stock lookup
    const allIngredients = await ctx.db.query("ingredients").collect();
    const ingredientToComponentTypeId = new Map<string, string>(); // ingredientId -> componentTypeId
    const unlinkedIngredientSet = new Set<string>(); // ingredient names (for warning)
    for (const ing of allIngredients) {
      if (ing.ingredientComponentTypeId) {
        ingredientToComponentTypeId.set(ing._id as string, ing.ingredientComponentTypeId as string);
      }
    }

    // Walk through days cumulatively
    const cumulativeRequired = new Map<string, number>();
    const cumulativeIngredientRequired = new Map<string, number>(); // ingredientName -> cumulative qty needed
    // Track by ingredient name for display, keyed by a composite of ingredientName
    const ingredientNameMap = new Map<string, { name: string; unit: string }>(); // ingredientId -> info

    const result: Array<{
      date: string;
      status: "ok" | "low" | "out";
      shortages: Array<{
        componentTypeName: string;
        required: number;
        available: number;
        deficit: number;
      }>;
      ingredientShortages: Array<{
        ingredientName: string;
        required: number;
        available: number;
        deficit: number;
        runsOutDate: string | null;
      }>;
    }> = [];

    // Track when each ingredient first goes negative
    const ingredientRunsOutDate = new Map<string, string>(); // ingredientId -> date string

    for (const date of dates) {
      const dayPlans = allPlans.filter(
        (p: Doc<"dispatchPlans">) => p.date === date
      );

      // Calculate required components and ingredients for this day
      for (const plan of dayPlans) {
        const bom = bomByProduct.get(plan.menuProductId as string);
        if (!bom) continue;

        for (const entry of bom) {
          const ctId = entry.componentTypeId as string;
          const ct = componentTypeMap.get(ctId);
          if (!ct) continue;

          // Track packaging/component requirements
          const unitsNeeded = plan.plannedQty * entry.quantity;
          cumulativeRequired.set(
            ctId,
            (cumulativeRequired.get(ctId) ?? 0) + unitsNeeded
          );

          // For production components (balls), walk hierarchy to get ingredient requirements
          if (productionComponentIds.has(ctId)) {
            if (!ingredientCache.has(ctId)) {
              try {
                const leaves = await collectLeafIngredients(ctx, ct._id);
                ingredientCache.set(ctId, leaves);
              } catch {
                ingredientCache.set(ctId, []);
              }
            }

            const leaves = ingredientCache.get(ctId) ?? [];
            for (const leaf of leaves) {
              const ingKey = leaf.ingredientId as string;
              const ingQtyPerUnit = leaf.totalQuantity; // per 1 unit of this component
              const totalIngNeeded = ingQtyPerUnit * plan.plannedQty;

              cumulativeIngredientRequired.set(
                ingKey,
                (cumulativeIngredientRequired.get(ingKey) ?? 0) + totalIngNeeded
              );

              if (!ingredientNameMap.has(ingKey)) {
                ingredientNameMap.set(ingKey, {
                  name: leaf.ingredientName,
                  unit: leaf.unit,
                });
              }
            }
          }
        }
      }

      // Check packaging/component sufficiency
      const shortages: Array<{
        componentTypeName: string;
        required: number;
        available: number;
        deficit: number;
      }> = [];

      let dayStatus: "ok" | "low" | "out" = "ok";

      for (const [ctId, required] of cumulativeRequired) {
        const ct = componentTypeMap.get(ctId);
        if (!ct) continue;

        // Skip non-tracked packaging items; always process production components
        if (ct.category === "packaging" && !ct.trackInventory) continue;

        const available = stockByComponent.get(ctId) ?? 0;

        if (available < required) {
          dayStatus = "out";
          shortages.push({
            componentTypeName: ct.name,
            required,
            available,
            deficit: required - available,
          });
        } else if (available < required * 1.2) {
          if (dayStatus !== "out") dayStatus = "low";
          shortages.push({
            componentTypeName: ct.name,
            required,
            available,
            deficit: 0,
          });
        }
      }

      // Check ingredient sufficiency
      // Note: ingredient stock is tracked via componentTypes with trackInventory=true
      // We need to find the componentType that corresponds to each ingredient
      // For now, match by name since ingredient-linked componentTypes share names
      const ingredientShortages: Array<{
        ingredientName: string;
        required: number;
        available: number;
        deficit: number;
        runsOutDate: string | null;
      }> = [];

      for (const [ingId, required] of cumulativeIngredientRequired) {
        const ingInfo = ingredientNameMap.get(ingId);
        if (!ingInfo) continue;

        // ID-based ingredient -> componentType lookup
        const linkedCtId = ingredientToComponentTypeId.get(ingId);
        if (!linkedCtId) {
          // Track unlinked ingredient name for warning; skip (no fallback to name match)
          unlinkedIngredientSet.add(ingInfo.name);
          continue;
        }
        const available = ingredientStockMap.get(linkedCtId) ?? 0;

        if (available < required) {
          if (dayStatus !== "out") dayStatus = "out";

          // Track first runs-out date
          if (!ingredientRunsOutDate.has(ingId)) {
            ingredientRunsOutDate.set(ingId, date);
          }

          ingredientShortages.push({
            ingredientName: ingInfo.name,
            required,
            available,
            deficit: required - available,
            runsOutDate: ingredientRunsOutDate.get(ingId) ?? date,
          });
        } else if (available < required * 1.2) {
          if (dayStatus !== "out") dayStatus = "low";
          ingredientShortages.push({
            ingredientName: ingInfo.name,
            required,
            available,
            deficit: 0,
            runsOutDate: null,
          });
        }
      }

      result.push({
        date,
        status: dayStatus,
        shortages,
        ingredientShortages,
      });
    }

    // Build top-level ingredientStatus summary
    const ingredientStatus: Array<{
      ingredientName: string;
      currentStock: number;
      totalRequired7Days: number;
      runsOutDate: string | null;
    }> = [];

    for (const [ingId, totalRequired] of cumulativeIngredientRequired) {
      const ingInfo = ingredientNameMap.get(ingId);
      if (!ingInfo) continue;

      const linkedCtId = ingredientToComponentTypeId.get(ingId);
      const currentStock = linkedCtId ? (ingredientStockMap.get(linkedCtId) ?? 0) : 0;
      // Skip unlinked ingredients in the status summary (already captured in unlinkedIngredientSet)
      if (!linkedCtId) continue;

      ingredientStatus.push({
        ingredientName: ingInfo.name,
        currentStock,
        totalRequired7Days: totalRequired,
        runsOutDate: ingredientRunsOutDate.get(ingId) ?? null,
      });
    }

    return {
      days: result,
      ingredientStatus,
      unlinkedIngredients: Array.from(unlinkedIngredientSet),
    };
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
      return { bigBalls: 0, midBalls: 0, packagingBreakdown: [] as Array<{ menuProductId: string; quantity: number }> };
    }

    // Fetch BOM and componentTypes needed for traversal
    const allBomEntries = await ctx.db.query("menuProductComponents").collect();
    const componentTypes = await ctx.db
      .query("componentTypes")
      .withIndex("by_active", (q: any) => q.eq("isActive", true))
      .collect();
    const componentTypeMap = new Map<string, Doc<"componentTypes">>();
    for (const ct of componentTypes) {
      componentTypeMap.set(ct._id as string, ct);
    }
    const bomByProduct = new Map<string, Doc<"menuProductComponents">[]>();
    for (const entry of allBomEntries) {
      const mpId = entry.menuProductId as string;
      if (!bomByProduct.has(mpId)) bomByProduct.set(mpId, []);
      bomByProduct.get(mpId)!.push(entry);
    }

    let bigBalls = 0;
    let midBalls = 0;
    const packagingMap = new Map<string, number>(); // menuProductId -> quantity

    // Pass 1: dispatch plan entries
    for (const plan of dayPlans) {
      const mpId = plan.menuProductId as string;
      const bom = bomByProduct.get(mpId) ?? [];
      // Aggregate packaging quantity per product
      packagingMap.set(mpId, (packagingMap.get(mpId) ?? 0) + plan.plannedQty);
      // Sum ball totals from BOM
      for (const entry of bom) {
        const ct = componentTypeMap.get(entry.componentTypeId as string);
        if (!ct || ct.category !== "production") continue;
        const qty = plan.plannedQty * entry.quantity;
        if (ct.code === "BIG_BALL") bigBalls += qty;
        else if (ct.code === "MID_BALL") midBalls += qty;
      }
    }

    // Pass 2: Direct Sales order-derived quantities
    for (const [mpId, qty] of orderProductQty) {
      const bom = bomByProduct.get(mpId) ?? [];
      // Add to packaging map (same product may exist in both sources)
      packagingMap.set(mpId, (packagingMap.get(mpId) ?? 0) + qty);
      // Sum ball totals from BOM
      for (const entry of bom) {
        const ct = componentTypeMap.get(entry.componentTypeId as string);
        if (!ct || ct.category !== "production") continue;
        const ballQty = qty * entry.quantity;
        if (ct.code === "BIG_BALL") bigBalls += ballQty;
        else if (ct.code === "MID_BALL") midBalls += ballQty;
      }
    }

    const packagingBreakdown = Array.from(packagingMap.entries()).map(([menuProductId, quantity]) => ({
      menuProductId,
      quantity,
    }));

    return { bigBalls, midBalls, packagingBreakdown };
  },
});
