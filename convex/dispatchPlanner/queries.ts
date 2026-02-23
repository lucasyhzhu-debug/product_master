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
  /** BOM-expanded ball count per date (sum of bigBalls + midBalls across all channels) */
  dailyBallTotals: Record<string, number>;
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
    // Per-product per-date quantities (used to compute dailyBallTotals via BOM expansion)
    const dailyProductQty: Record<string, Record<string, number>> = {};
    for (const date of dates) {
      dailyTotals[date] = {};
      dailyProductQty[date] = {};
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
          ctx, section, dates, todayStr, dailyTotals, menuProductMap, allDispatchPlans, dailyProductQty
        );
      } else if (channelKey === "gofood") {
        await assembleGofoodChannel(
          ctx, section, dates, todayStr, dailyTotals, menuProductMap, allDispatchPlans, dailyProductQty
        );
      } else if (channelKey === "k3mart") {
        await assembleK3martChannel(
          ctx, section, dates, todayStr, dailyTotals, menuProductMap, dailyProductQty
        );
      } else if (channelKey === "consignment") {
        await assembleConsignmentChannel(
          ctx, section, dates, todayStr, dailyTotals, menuProductMap, allDispatchPlans, dailyProductQty
        );
      }

      channels.push(section);
    }

    // Compute dailyBallTotals: BOM-expand dailyProductQty for each date
    // Load BOM data once for the ball total computation
    const allBomEntriesForBalls = await ctx.db.query("menuProductComponents").collect();
    const componentTypesForBalls = await ctx.db
      .query("componentTypes")
      .withIndex("by_active", (q: any) => q.eq("isActive", true))
      .collect();
    const componentTypeMapForBalls = new Map<string, Doc<"componentTypes">>();
    for (const ct of componentTypesForBalls) {
      componentTypeMapForBalls.set(ct._id as string, ct);
    }
    const bomByProductForBalls = new Map<string, Doc<"menuProductComponents">[]>();
    for (const entry of allBomEntriesForBalls) {
      const mpId = entry.menuProductId as string;
      if (!bomByProductForBalls.has(mpId)) bomByProductForBalls.set(mpId, []);
      bomByProductForBalls.get(mpId)!.push(entry);
    }

    const dailyBallTotals: Record<string, number> = {};
    for (const date of dates) {
      let balls = 0;
      const productQtyForDate = dailyProductQty[date] ?? {};
      for (const [mpId, qty] of Object.entries(productQtyForDate)) {
        const bom = bomByProductForBalls.get(mpId) ?? [];
        for (const entry of bom) {
          const ct = componentTypeMapForBalls.get(entry.componentTypeId as string);
          if (!ct || ct.category !== "production") continue;
          balls += qty * entry.quantity;
        }
      }
      dailyBallTotals[date] = balls;
    }

    return {
      dates,
      todayStr,
      dailyCapacity,
      channels,
      dailyTotals,
      dailyBallTotals,
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
  dailyProductQty: Record<string, Record<string, number>>,
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
        // Track per-product qty for ball total computation
        if (!dailyProductQty[dueDateStr]) dailyProductQty[dueDateStr] = {};
        dailyProductQty[dueDateStr][mpId] =
          (dailyProductQty[dueDateStr][mpId] ?? 0) + qty;
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
        // Track per-product qty for ball total computation
        if (!dailyProductQty[date]) dailyProductQty[date] = {};
        dailyProductQty[date][mpId] =
          (dailyProductQty[date][mpId] ?? 0) + (plan?.plannedQty ?? 0);
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
  dailyProductQty: Record<string, Record<string, number>>,
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

    // Build product rows from existing plans, revenue, and all POS-active products
    const productIds = new Set<string>();
    for (const plan of outletPlans) {
      productIds.add(plan.menuProductId as string);
    }
    for (const rev of outletRevenue) {
      if (rev.linkedMenuProductId) {
        productIds.add(rev.linkedMenuProductId as string);
      }
    }
    // Always show all active POS products so managers can plan even without prior data
    for (const mpId of menuProductMap.keys()) {
      productIds.add(mpId as string);
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
          // Track per-product qty for ball total computation
          if (!dailyProductQty[date]) dailyProductQty[date] = {};
          dailyProductQty[date][mpId] =
            (dailyProductQty[date][mpId] ?? 0) + qty;
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
  dailyProductQty: Record<string, Record<string, number>>,
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

    // Group by menuProductId — always include all POS-active products as baseline
    const productIds = new Set<string>();
    for (const plan of outletPlans) {
      productIds.add(plan.menuProductId as string);
    }
    // Always show all active POS products so managers can plan even without prior data
    for (const mpId of menuProductMap.keys()) {
      productIds.add(mpId as string);
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
          // Track per-product qty for ball total computation
          if (!dailyProductQty[date]) dailyProductQty[date] = {};
          dailyProductQty[date][mpId] =
            (dailyProductQty[date][mpId] ?? 0) + qty;
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
  dailyProductQty: Record<string, Record<string, number>>,
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

    // Get product IDs from outlet's product mappings + existing plans + all POS-active products
    const productIds = new Set<string>();
    for (const mapping of outlet.productMappings) {
      productIds.add(mapping.menuProductId as string);
    }
    for (const plan of outletPlans) {
      productIds.add(plan.menuProductId as string);
    }
    // Always show all active POS products as baseline even if no mappings/plans exist
    for (const mpId of menuProductMap.keys()) {
      productIds.add(mpId as string);
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
          // Track per-product qty for ball total computation
          if (!dailyProductQty[date]) dailyProductQty[date] = {};
          dailyProductQty[date][mpId] =
            (dailyProductQty[date][mpId] ?? 0) + qty;
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
