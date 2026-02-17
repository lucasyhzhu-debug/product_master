/**
 * Dispatch Planner Queries
 *
 * Provides the unified weekly plan view, channel configuration,
 * planner settings, consignment outlets, and inventory simulation.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Id, Doc } from "../_generated/dataModel";
import {
  generateWeekDates,
  epochToDateString,
  orderDueDateToProductionStart,
  CHANNEL_COLORS,
} from "./helpers";
import { getTodayJakarta } from "../k3martCockpit/helpers";
import { collectLeafIngredients } from "../lib/hierarchyTraversal";

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
 * Query dispatchConsignmentOutlets with optional enabledOnly filter.
 */
export const getConsignmentOutlets = query({
  args: {
    enabledOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.enabledOnly) {
      return await ctx.db
        .query("dispatchConsignmentOutlets")
        .withIndex("by_enabled", (q) => q.eq("isEnabled", true))
        .collect();
    }
    return await ctx.db.query("dispatchConsignmentOutlets").collect();
  },
});

// ============================================
// Main unified weekly plan query
// ============================================

/** Cell data for a single date slot in the grid */
interface PlanCell {
  plannedQty: number;
  actualQty?: number;
  source: string;
  isReadOnly: boolean;
  isFaded?: boolean;
}

/** Product row within an outlet */
interface ProductRow {
  menuProductId: Id<"menuProducts">;
  productName: string;
  cells: Record<string, PlanCell>;
}

/** Outlet row within a channel */
interface OutletRow {
  id: string;
  name: string;
  type: "outlet" | "order" | "consignment";
  orderId?: Id<"orders">;
  orderNumber?: string;
  dueDate?: string;
  productionStartDate?: string;
  products: ProductRow[];
}

/** Channel section in the grid */
interface ChannelSection {
  channelKey: string;
  displayName: string;
  color: string;
  priority: number;
  isEditable: boolean;
  outlets: OutletRow[];
}

/** Full return type for getUnifiedWeeklyPlan */
interface UnifiedWeeklyPlan {
  dates: string[];
  todayStr: string;
  dailyCapacity: number;
  channels: ChannelSection[];
  dailyTotals: Record<string, Record<string, number>>;
}

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

    // Fetch planner settings
    const settings = await ctx.db.query("dispatchPlannerSettings").first();
    const dailyCapacity = settings?.dailyCapacity ?? 200;

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
    for (const date of dates) {
      dailyTotals[date] = {};
    }

    const channels: ChannelSection[] = [];

    for (const config of enabledChannels) {
      const channelKey = config.channelKey;
      const section: ChannelSection = {
        channelKey,
        displayName: config.displayName,
        color: config.color || CHANNEL_COLORS[channelKey] || "#888888",
        priority: config.priority,
        isEditable: channelKey !== "k3mart", // K3Mart is read-only
        outlets: [],
      };

      if (channelKey === "direct") {
        await assembleDirectChannel(
          ctx, section, dates, todayStr, dailyTotals, menuProductMap, allDispatchPlans
        );
      } else if (channelKey === "gofood") {
        await assembleGofoodChannel(
          ctx, section, dates, todayStr, dailyTotals, menuProductMap, allDispatchPlans
        );
      } else if (channelKey === "k3mart") {
        await assembleK3martChannel(
          ctx, section, dates, todayStr, dailyTotals, menuProductMap
        );
      } else if (channelKey === "consignment") {
        await assembleConsignmentChannel(
          ctx, section, dates, todayStr, dailyTotals, menuProductMap, allDispatchPlans
        );
      }

      channels.push(section);
    }

    return {
      dates,
      todayStr,
      dailyCapacity,
      channels,
      dailyTotals,
    };
  },
});

// ============================================
// Channel assembly helpers (internal)
// ============================================

/**
 * Direct Sales channel: each order with dueDate in the window becomes an outlet row.
 * Quantities count in dailyTotals only at dueDate (not production-start day).
 */
async function assembleDirectChannel(
  ctx: { db: any },
  section: ChannelSection,
  dates: string[],
  todayStr: string,
  dailyTotals: Record<string, Record<string, number>>,
  menuProductMap: Map<string, Doc<"menuProducts">>,
  allDispatchPlans: Doc<"dispatchPlans">[],
) {
  const dateSet = new Set(dates);
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];

  // Convert date range to epoch for querying orders by dueDate
  const rangeStart = new Date(firstDate + "T00:00:00+07:00").getTime();
  const rangeEnd = new Date(lastDate + "T23:59:59+07:00").getTime();

  // Fetch orders with dueDate in range (exclude Draft and Cancelled)
  const orders = await ctx.db
    .query("orders")
    .withIndex("by_status_due_date")
    .collect();

  // Filter: dueDate in range, not Draft/Cancelled
  const excludeStatuses = new Set(["Draft", "Cancelled"]);
  const relevantOrders = orders.filter((o: Doc<"orders">) => {
    if (!o.dueDate) return false;
    if (excludeStatuses.has(o.status)) return false;
    return o.dueDate >= rangeStart && o.dueDate <= rangeEnd;
  });

  for (const order of relevantOrders) {
    const dueDateStr = epochToDateString(order.dueDate!);
    const prodStartStr = orderDueDateToProductionStart(order.dueDate!);

    // Fetch order items
    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q: any) => q.eq("orderId", order._id))
      .collect();

    // Group by menuProductId
    const productQtyMap = new Map<string, { name: string; qty: number }>();
    for (const item of items) {
      if (item.isCancelled) continue;
      const mpId = item.menuProductId ? (item.menuProductId as string) : item.productName;
      const existing = productQtyMap.get(mpId);
      if (existing) {
        existing.qty += item.quantity;
      } else {
        productQtyMap.set(mpId, {
          name: item.productName,
          qty: item.quantity,
        });
      }
    }

    const products: ProductRow[] = [];
    for (const [mpId, { name, qty }] of productQtyMap) {
      const cells: Record<string, PlanCell> = {};
      for (const date of dates) {
        const isPast = date < todayStr;
        const isDueDate = date === dueDateStr;
        const isProdStart = date === prodStartStr;

        if (isDueDate) {
          cells[date] = {
            plannedQty: qty,
            source: "order",
            isReadOnly: true,
            isFaded: false,
          };
        } else if (isProdStart && dateSet.has(prodStartStr)) {
          cells[date] = {
            plannedQty: qty,
            source: "order_production",
            isReadOnly: true,
            isFaded: true, // faded for production-start day
          };
        } else {
          cells[date] = {
            plannedQty: 0,
            source: "none",
            isReadOnly: true,
          };
        }

        // Past days are always read-only (already is for direct)
        if (isPast) {
          cells[date].isReadOnly = true;
        }
      }

      products.push({
        menuProductId: mpId as Id<"menuProducts">,
        productName: name,
        cells,
      });

      // Add to daily totals ONLY at dueDate (not production-start)
      if (dateSet.has(dueDateStr)) {
        dailyTotals[dueDateStr]["direct"] =
          (dailyTotals[dueDateStr]["direct"] ?? 0) + qty;
      }
    }

    section.outlets.push({
      id: order._id as string,
      name: `${order.orderNumber} - ${order.customerName}`,
      type: "order",
      orderId: order._id,
      orderNumber: order.orderNumber,
      dueDate: dueDateStr,
      productionStartDate: prodStartStr,
      products,
    });
  }

  // Add a "Planned (Manual)" outlet for ad-hoc direct sales planning
  const manualProducts: ProductRow[] = [];
  const manualDirectPlans = allDispatchPlans.filter(
    (p) => p.channel === "direct" && !p.orderId
  );

  for (const [mpId, mp] of menuProductMap) {
    const mpPlans = manualDirectPlans.filter(
      (p) => (p.menuProductId as string) === mpId
    );

    const cells: Record<string, PlanCell> = {};
    for (const date of dates) {
      const isPast = date < todayStr;
      const plan = mpPlans.find((p) => p.date === date);
      cells[date] = {
        plannedQty: plan?.plannedQty ?? 0,
        source: plan?.source ?? "none",
        isReadOnly: isPast,
      };

      // Add manual planned qty to daily totals
      if ((plan?.plannedQty ?? 0) > 0) {
        dailyTotals[date]["direct"] =
          (dailyTotals[date]["direct"] ?? 0) + (plan?.plannedQty ?? 0);
      }
    }

    manualProducts.push({
      menuProductId: mpId as Id<"menuProducts">,
      productName: mp.name,
      cells,
    });
  }

  if (manualProducts.length > 0) {
    section.outlets.push({
      id: "direct-manual",
      name: "Planned (Manual)",
      type: "outlet",
      products: manualProducts,
    });
  }
}

/**
 * GoFood channel: each active gobiz outlet becomes a row.
 * Past days use actual sales from externalRevenue; future days use dispatchPlans.
 */
async function assembleGofoodChannel(
  ctx: { db: any },
  section: ChannelSection,
  dates: string[],
  todayStr: string,
  dailyTotals: Record<string, Record<string, number>>,
  menuProductMap: Map<string, Doc<"menuProducts">>,
  allDispatchPlans: Doc<"dispatchPlans">[],
) {
  // Fetch active GoFood outlets
  const gofoodOutlets = await ctx.db
    .query("externalOutlets")
    .withIndex("by_source", (q: any) => q.eq("source", "gobiz"))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .collect();

  // Fetch external revenue for the date range
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  const rangeStart = new Date(firstDate + "T00:00:00+07:00").getTime();
  const rangeEnd = new Date(lastDate + "T23:59:59+07:00").getTime();

  const revenueRecords = await ctx.db
    .query("externalRevenue")
    .withIndex("by_source_period", (q: any) =>
      q.eq("source", "gobiz").gte("periodStart", rangeStart)
    )
    .filter((q: any) => q.lte(q.field("periodStart"), rangeEnd))
    .collect();

  // Filter dispatch plans for gofood channel
  const gofoodPlans = allDispatchPlans.filter(
    (p: Doc<"dispatchPlans">) => p.channel === "gofood"
  );

  for (const outlet of gofoodOutlets) {
    // Get revenue for this outlet
    const outletRevenue = revenueRecords.filter(
      (r: Doc<"externalRevenue">) => r.outletId === outlet._id
    );

    // Get plans for this outlet
    const outletPlans = gofoodPlans.filter(
      (p: Doc<"dispatchPlans">) => p.outletId === outlet._id
    );

    // Build product rows from existing plans and revenue
    const productIds = new Set<string>();
    for (const plan of outletPlans) {
      productIds.add(plan.menuProductId as string);
    }
    for (const rev of outletRevenue) {
      if (rev.linkedMenuProductId) {
        productIds.add(rev.linkedMenuProductId as string);
      }
    }

    const products: ProductRow[] = [];
    for (const mpId of productIds) {
      const mp = menuProductMap.get(mpId);
      const productName = mp?.name ?? "Unknown";

      const cells: Record<string, PlanCell> = {};
      for (const date of dates) {
        const isPast = date < todayStr;
        const dateStart = new Date(date + "T00:00:00+07:00").getTime();
        const dateEnd = dateStart + 24 * 60 * 60 * 1000;

        if (isPast) {
          // Past: use actual sales from externalRevenue
          const dayRevenue = outletRevenue.filter(
            (r: Doc<"externalRevenue">) =>
              r.linkedMenuProductId === mpId &&
              r.periodStart >= dateStart &&
              r.periodStart < dateEnd
          );
          const actualQty = dayRevenue.reduce(
            (sum: number, r: Doc<"externalRevenue">) =>
              sum + (r.quantitySold ?? 0),
            0
          );

          // Also check if there was a planned qty
          const plan = outletPlans.find(
            (p: Doc<"dispatchPlans">) =>
              p.date === date && (p.menuProductId as string) === mpId
          );

          cells[date] = {
            plannedQty: plan?.plannedQty ?? 0,
            actualQty,
            source: plan?.source ?? "actual",
            isReadOnly: true,
          };
        } else {
          // Future: use dispatchPlans
          const plan = outletPlans.find(
            (p: Doc<"dispatchPlans">) =>
              p.date === date && (p.menuProductId as string) === mpId
          );
          cells[date] = {
            plannedQty: plan?.plannedQty ?? 0,
            source: plan?.source ?? "none",
            isReadOnly: false,
          };
        }
      }

      products.push({
        menuProductId: mpId as Id<"menuProducts">,
        productName,
        cells,
      });

      // Add to daily totals
      for (const date of dates) {
        const qty = cells[date]?.plannedQty ?? 0;
        if (qty > 0) {
          dailyTotals[date]["gofood"] =
            (dailyTotals[date]["gofood"] ?? 0) + qty;
        }
      }
    }

    section.outlets.push({
      id: outlet._id as string,
      name: outlet.name,
      type: "outlet",
      products,
    });
  }
}

/**
 * K3Mart channel: read-only. Pulls from k3martDispatchPlans.
 */
async function assembleK3martChannel(
  ctx: { db: any },
  section: ChannelSection,
  dates: string[],
  _todayStr: string,
  dailyTotals: Record<string, Record<string, number>>,
  menuProductMap: Map<string, Doc<"menuProducts">>,
) {
  // Fetch active K3Mart outlets
  const k3martOutlets = await ctx.db
    .query("externalOutlets")
    .withIndex("by_source", (q: any) => q.eq("source", "k3mart"))
    .filter((q: any) => q.eq(q.field("isActive"), true))
    .collect();

  // Fetch k3mart dispatch plans for the date range
  const allK3Plans: Doc<"k3martDispatchPlans">[] = [];
  for (const date of dates) {
    const plans = await ctx.db
      .query("k3martDispatchPlans")
      .withIndex("by_date_status", (q: any) => q.eq("date", date))
      .collect();
    allK3Plans.push(...plans);
  }

  for (const outlet of k3martOutlets) {
    const outletPlans = allK3Plans.filter(
      (p: Doc<"k3martDispatchPlans">) => p.outletId === outlet._id
    );

    // Group by menuProductId
    const productIds = new Set<string>();
    for (const plan of outletPlans) {
      productIds.add(plan.menuProductId as string);
    }

    const products: ProductRow[] = [];
    for (const mpId of productIds) {
      const mp = menuProductMap.get(mpId);
      const productName = mp?.name ?? "Unknown";

      const cells: Record<string, PlanCell> = {};
      for (const date of dates) {
        const plan = outletPlans.find(
          (p: Doc<"k3martDispatchPlans">) =>
            p.date === date && (p.menuProductId as string) === mpId
        );
        cells[date] = {
          plannedQty: plan?.plannedQty ?? 0,
          source: plan ? "k3mart" : "none",
          isReadOnly: true, // Always read-only for K3Mart
        };
      }

      products.push({
        menuProductId: mpId as Id<"menuProducts">,
        productName,
        cells,
      });

      // Add to daily totals
      for (const date of dates) {
        const qty = cells[date]?.plannedQty ?? 0;
        if (qty > 0) {
          dailyTotals[date]["k3mart"] =
            (dailyTotals[date]["k3mart"] ?? 0) + qty;
        }
      }
    }

    section.outlets.push({
      id: outlet._id as string,
      name: outlet.name,
      type: "outlet",
      products,
    });
  }
}

/**
 * Consignment channel: editable. Uses dispatchConsignmentOutlets + dispatchPlans.
 */
async function assembleConsignmentChannel(
  ctx: { db: any },
  section: ChannelSection,
  dates: string[],
  todayStr: string,
  dailyTotals: Record<string, Record<string, number>>,
  menuProductMap: Map<string, Doc<"menuProducts">>,
  allDispatchPlans: Doc<"dispatchPlans">[],
) {
  // Fetch enabled consignment outlets
  const consignmentOutlets = await ctx.db
    .query("dispatchConsignmentOutlets")
    .withIndex("by_enabled", (q: any) => q.eq("isEnabled", true))
    .collect();

  // Filter dispatch plans for consignment channel
  const consignmentPlans = allDispatchPlans.filter(
    (p: Doc<"dispatchPlans">) => p.channel === "consignment"
  );

  for (const outlet of consignmentOutlets) {
    // Get plans for this outlet (match by outletId field in dispatchPlans)
    // For consignment, outletId on dispatchPlans stores the consignment outlet _id cast as externalOutlets id
    // We match by string comparison
    const outletPlans = consignmentPlans.filter(
      (p: Doc<"dispatchPlans">) => (p.outletId as unknown as string) === (outlet._id as string)
    );

    // Get product IDs from outlet's product mappings + existing plans
    const productIds = new Set<string>();
    for (const mapping of outlet.productMappings) {
      productIds.add(mapping.menuProductId as string);
    }
    for (const plan of outletPlans) {
      productIds.add(plan.menuProductId as string);
    }

    const products: ProductRow[] = [];
    for (const mpId of productIds) {
      const mp = menuProductMap.get(mpId);
      const productName = mp?.name ?? "Unknown";

      const cells: Record<string, PlanCell> = {};
      for (const date of dates) {
        const isPast = date < todayStr;
        const plan = outletPlans.find(
          (p: Doc<"dispatchPlans">) =>
            p.date === date && (p.menuProductId as string) === mpId
        );
        cells[date] = {
          plannedQty: plan?.plannedQty ?? 0,
          actualQty: plan?.actualQty ?? undefined,
          source: plan?.source ?? "none",
          isReadOnly: isPast,
        };
      }

      products.push({
        menuProductId: mpId as Id<"menuProducts">,
        productName,
        cells,
      });

      // Add to daily totals
      for (const date of dates) {
        const qty = cells[date]?.plannedQty ?? 0;
        if (qty > 0) {
          dailyTotals[date]["consignment"] =
            (dailyTotals[date]["consignment"] ?? 0) + qty;
        }
      }
    }

    section.outlets.push({
      id: outlet._id as string,
      name: outlet.name,
      type: "consignment",
      products,
    });
  }
}

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

        // Only check tracked inventory components
        if (!ct.trackInventory && ct.category !== "production") continue;

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

        // Find matching ingredient componentType by looking for production + trackInventory
        // that links to this ingredient (via productionComponentIngredients)
        // For simplicity, we use the ingredientId to find all componentTypes that might track this ingredient
        // But the actual stock is on the componentType, so we need the mapping
        // The ingredient stock is in componentStock for the ingredient-tracker componentType
        // We check the cumulative ingredient consumption against available ingredient stock

        // For ingredient stock: look for componentTypes where trackInventory=true
        // and have this ingredient linked. Since we are using raw ingredient quantities from hierarchy,
        // the stock tracking is per ingredient-tracker componentType, not per raw ingredient.
        // This is a simplified check -- assume ingredient names map to componentType names
        const matchingCt = ingredientComponentTypes.find(
          (ct) => ct.name.toLowerCase() === ingInfo.name.toLowerCase()
        );

        const available = matchingCt
          ? (ingredientStockMap.get(matchingCt._id as string) ?? 0)
          : 0;

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

      const matchingCt = ingredientComponentTypes.find(
        (ct) => ct.name.toLowerCase() === ingInfo.name.toLowerCase()
      );
      const currentStock = matchingCt
        ? (ingredientStockMap.get(matchingCt._id as string) ?? 0)
        : 0;

      ingredientStatus.push({
        ingredientName: ingInfo.name,
        currentStock,
        totalRequired7Days: totalRequired,
        runsOutDate: ingredientRunsOutDate.get(ingId) ?? null,
      });
    }

    return { days: result, ingredientStatus };
  },
});
