/**
 * K3 Mart Cockpit Queries
 *
 * Provides comprehensive views for K3 Mart dispatch planning and inventory monitoring.
 * Combines data from outlets, stock snapshots, production counts, and restock targets.
 */

import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { aggregateForProduct, getResetsMap } from "../productionLog/helpers";
import { getWeekNumber, getWeekDatesFromWeekNumber } from "./helpers";
import { buildOutletProducts, buildStockAndPriceMaps, buildProductSettings, buildProductionReadinessMap, aggregateStockByMenuProduct, accumulateSnapshotStock, enrichMappingPrices } from "./queryHelpers/stockHelpers";
import { aggregatePreviousWeek, buildOutletProductRows, buildPlanCellsAndTotals, fillAutoSuggest } from "./queryHelpers/dispatchHelpers";
import type { OutletResult, PlanRecord } from "./queryHelpers/dispatchHelpers";

/**
 * Query 1: getOutletStockSummary
 * Returns all active K3 Mart outlets with latest stock snapshots and sales data.
 */
export const getOutletStockSummaryInternal = internalQuery({
  args: {
    date: v.string(), // YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    // 1. Fetch all active K3 Mart outlets (MIS-02: compound index)
    const outlets = await ctx.db
      .query("externalOutlets")
      .withIndex("by_source_active", (q) => q.eq("source", "k3mart").eq("isActive", true))
      .collect();

    if (outlets.length === 0) {
      return { outlets: [], lastSyncAt: null };
    }

    // 2. Get today's date range for sales queries
    const todayStart = new Date(args.date + "T00:00:00+07:00").getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000;

    // 3. Get 7 days ago for avg sales calculation
    const sevenDaysAgo = todayStart - 7 * 24 * 60 * 60 * 1000;

    // 4. Fetch all relevant revenue data (today + last 7 days) for K3 Mart
    // IRB-02: both period bounds at index level
    const allRevenue = await ctx.db
      .query("externalRevenue")
      .withIndex("by_source_period", (q) =>
        q.eq("source", "k3mart").gte("periodStart", sevenDaysAgo).lt("periodStart", todayEnd)
      )
      .collect();

    // 4b. Fetch product mappings to resolve menuProductId
    const productMappings = await ctx.db
      .query("externalProductMappings")
      .withIndex("by_source_code", (q) => q.eq("source", "k3mart"))
      .collect();
    const codeToMenuProduct = new Map<string, string>();
    for (const m of productMappings) {
      if (m.menuProductId) {
        codeToMenuProduct.set(m.externalProductCode, m.menuProductId as string);
      }
    }

    let latestSyncAt: number | null = null;

    // 5. Process each outlet
    const outletResults = await Promise.all(
      outlets.map(async (outlet) => {
        // Get latest snapshot for this outlet
        const latestSnapshot = await ctx.db
          .query("externalStockSnapshots")
          .withIndex("by_outlet_snapshot", (q) => q.eq("outletId", outlet._id))
          .order("desc")
          .first();

        if (!latestSnapshot) {
          return {
            _id: outlet._id,
            name: outlet.name,
            externalId: outlet.externalId,
            isActive: outlet.isActive,
            lastSyncAt: outlet.lastSyncAt ?? null,
            products: [],
          };
        }

        // Track latest sync time
        if (latestSyncAt === null || latestSnapshot.snapshotAt > latestSyncAt) {
          latestSyncAt = latestSnapshot.snapshotAt;
        }

        // Get all products from this snapshot batch for this outlet (IRB-06: compound index)
        const snapshotProducts = await ctx.db
          .query("externalStockSnapshots")
          .withIndex("by_batch_outlet", (q) =>
            q.eq("snapshotBatchId", latestSnapshot.snapshotBatchId).eq("outletId", outlet._id)
          )
          .collect();

        // Filter revenue for this outlet
        const outletRevenue = allRevenue.filter(
          (r) => r.outletId === outlet._id
        );

        // Build product list with sales data (extracted to stockHelpers)
        const products = buildOutletProducts(
          snapshotProducts,
          outletRevenue,
          todayStart,
          todayEnd,
          sevenDaysAgo,
          codeToMenuProduct
        );

        return {
          _id: outlet._id,
          name: outlet.name,
          externalId: outlet.externalId,
          isActive: outlet.isActive,
          lastSyncAt: outlet.lastSyncAt ?? null,
          products,
        };
      })
    );

    return {
      outlets: outletResults,
      lastSyncAt: latestSyncAt,
    };
  },
});

/**
 * Query 2: getWeeklyDispatchPlans
 * Returns outlet-first weekly dispatch plan data with product sub-rows,
 * current stock, auto-suggest quantities, and previous week baselines.
 */
export const getWeeklyDispatchPlans = query({
  args: {
    weekNumber: v.string(), // "2026-W07"
  },
  handler: async (ctx, args) => {
    // 1. Get week dates from weekNumber
    // Parse weekNumber to get a date in that week, then compute the full week
    const weekDates = getWeekDatesFromWeekNumber(args.weekNumber);

    // 2. Fetch all dispatch plans for this week
    const plans = await ctx.db
      .query("k3martDispatchPlans")
      .withIndex("by_week", (q) => q.eq("weekNumber", args.weekNumber))
      .collect();

    // 3. Fetch all K3 Mart restock targets
    const targets = await ctx.db
      .query("restockTargets")
      .withIndex("by_channel", (q) => q.eq("channel", "k3mart"))
      .collect();

    // Build target lookup: outletId_productKey -> target
    const targetLookup = new Map<string, typeof targets[number]>();
    for (const t of targets) {
      if (t.outletId && t.productKey) {
        targetLookup.set(`${t.outletId}_${t.productKey}`, t);
      }
    }

    // 4. Fetch active K3 Mart outlets
    // MIS-02: compound index
    const allOutlets = await ctx.db
      .query("externalOutlets")
      .withIndex("by_source_active", (q) => q.eq("source", "k3mart").eq("isActive", true))
      .collect();

    // 5. Fetch product mappings
    const productMappings = await ctx.db
      .query("externalProductMappings")
      .withIndex("by_source_code", (q) => q.eq("source", "k3mart"))
      .collect();

    // 6. Fetch menu products for names and default prices
    const menuProductIds = new Set<string>();
    for (const m of productMappings) {
      if (m.menuProductId) menuProductIds.add(m.menuProductId as string);
    }

    const menuProducts = new Map<string, { name: string }>();
    for (const id of menuProductIds) {
      const mp = await ctx.db.get(id as Id<"menuProducts">);
      if (mp) menuProducts.set(id, { name: mp.name });
    }

    // 6b. Build K3Mart external name lookup from product mappings
    const externalNameByCode = new Map<string, string>();
    for (const m of productMappings) {
      externalNameByCode.set(m.externalProductCode, m.externalProductName);
    }

    // 7. Get latest stock snapshots per outlet for current stock
    const stockByOutletProduct = new Map<string, number>(); // outletId_externalProductCode -> qty
    const priceByOutletProduct = new Map<string, number>(); // outletId_externalProductCode -> price

    for (const outlet of allOutlets) {
      const latestSnapshot = await ctx.db
        .query("externalStockSnapshots")
        .withIndex("by_outlet_snapshot", (q) => q.eq("outletId", outlet._id))
        .order("desc")
        .first();

      if (!latestSnapshot) continue;

      // IRB-06: compound index
      const snapshotProducts = await ctx.db
        .query("externalStockSnapshots")
        .withIndex("by_batch_outlet", (q) =>
          q.eq("snapshotBatchId", latestSnapshot.snapshotBatchId).eq("outletId", outlet._id)
        )
        .collect();

      // Build stock/price maps (extracted to stockHelpers)
      const { stockEntries, priceEntries } = buildStockAndPriceMaps(
        outlet._id as string,
        snapshotProducts
      );
      for (const [key, qty] of stockEntries) {
        stockByOutletProduct.set(key, qty);
      }
      for (const [key, price] of priceEntries) {
        priceByOutletProduct.set(key, price);
      }
    }

    // 8. Compute previous week totals per outlet+product (for auto-suggest baseline)
    const prevWeekNumber = getPreviousWeekNumber(args.weekNumber);
    const prevWeekPlans = await ctx.db
      .query("k3martDispatchPlans")
      .withIndex("by_week", (q) => q.eq("weekNumber", prevWeekNumber))
      .collect();

    // Aggregate previous week (extracted to dispatchHelpers)
    const { prevWeekByOutletProduct, previousWeekTotals } =
      aggregatePreviousWeek(prevWeekPlans as PlanRecord[]);

    // 9. Build outlet-first response (extracted to dispatchHelpers)
    const outletResults: OutletResult[] = [];

    for (const outlet of allOutlets) {
      const outletProducts = buildOutletProductRows(
        outlet._id,
        productMappings,
        targetLookup,
        menuProducts,
        stockByOutletProduct,
        priceByOutletProduct,
        externalNameByCode
      );

      const subtotalByDay: Record<string, number> = {};
      for (const date of weekDates) {
        subtotalByDay[date] = 0;
      }

      outletResults.push({
        outletId: outlet._id,
        outletName: outlet.name,
        isActive: outlet.isActive,
        products: outletProducts,
        subtotalByDay,
      });
    }

    // 10-11. Build plan cells, compute totals, and fill auto-suggest (extracted to dispatchHelpers)
    const { planCells, weekTotalsByDay, weekTotalsByProduct, grandTotal } =
      buildPlanCellsAndTotals(plans as PlanRecord[], outletResults, weekDates);

    fillAutoSuggest(outletResults, prevWeekByOutletProduct, weekDates, planCells);

    return {
      outlets: outletResults,
      plans: planCells,
      weekDates,
      weekTotals: {
        byDay: weekTotalsByDay,
        byProduct: weekTotalsByProduct,
        grandTotal,
      },
      previousWeekTotals,
    };
  },
});

/**
 * Get the previous week number string from a given week number.
 * E.g., "2026-W07" -> "2026-W06", "2026-W01" -> "2025-W53" (approximate)
 */
function getPreviousWeekNumber(weekNumber: string): string {
  const dates = getWeekDatesFromWeekNumber(weekNumber);
  // Get the Monday of this week, subtract 7 days
  const monday = new Date(dates[0] + "T00:00:00+07:00");
  monday.setDate(monday.getDate() - 7);
  const prevDate = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
  return getWeekNumber(prevDate);
}

/**
 * Query 3: getProductionReadiness
 * Compares stickered production counts vs planned dispatch for today and tomorrow.
 */
export const getProductionReadiness = query({
  args: {
    date: v.string(), // YYYY-MM-DD (today)
  },
  handler: async (ctx, args) => {
    // Calculate tomorrow's date (use noon UTC to avoid timezone edge cases)
    const todayUTC = new Date(args.date + "T12:00:00Z");
    todayUTC.setUTCDate(todayUTC.getUTCDate() + 1);
    const tomorrowStr = todayUTC.toISOString().split("T")[0];

    // Fetch all active menu products and aggregate from productionLog
    const activeMenuProducts = await ctx.db
      .query("menuProducts")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const resetsMap = await getResetsMap(ctx);

    const allProductionCounts = await Promise.all(
      activeMenuProducts.map(async (mp) => {
        const resetRecord = resetsMap.get(mp._id as unknown as string) ?? null;
        const counts = await aggregateForProduct(ctx, mp._id, resetRecord);
        return { menuProductId: mp._id as unknown as string, ...counts };
      })
    );

    // Fetch today's confirmed/submitted dispatch plans
    const todayPlans = await ctx.db
      .query("k3martDispatchPlans")
      .withIndex("by_date_status", (q) =>
        q.eq("date", args.date).eq("status", "confirmed")
      )
      .collect();

    const todaySubmitted = await ctx.db
      .query("k3martDispatchPlans")
      .withIndex("by_date_status", (q) =>
        q.eq("date", args.date).eq("status", "submitted")
      )
      .collect();

    // Fetch tomorrow's confirmed/submitted plans
    const tomorrowPlans = await ctx.db
      .query("k3martDispatchPlans")
      .withIndex("by_date_status", (q) =>
        q.eq("date", tomorrowStr).eq("status", "confirmed")
      )
      .collect();

    const tomorrowSubmitted = await ctx.db
      .query("k3martDispatchPlans")
      .withIndex("by_date_status", (q) =>
        q.eq("date", tomorrowStr).eq("status", "submitted")
      )
      .collect();

    const allTodayPlans = [...todayPlans, ...todaySubmitted];
    const allTomorrowPlans = [...tomorrowPlans, ...tomorrowSubmitted];

    // Build readiness map (extracted to stockHelpers)
    const productMap = buildProductionReadinessMap(
      allProductionCounts,
      allTodayPlans.map((p) => ({ menuProductId: p.menuProductId as string, isStockOut: p.isStockOut, plannedQty: p.plannedQty })),
      allTomorrowPlans.map((p) => ({ menuProductId: p.menuProductId as string, isStockOut: p.isStockOut, plannedQty: p.plannedQty }))
    );

    // Convert to array with deficit calculation
    const products = await Promise.all(
      Array.from(productMap.entries()).map(
        async ([menuProductId, data]) => {
          const menuProduct = await ctx.db.get(
            menuProductId as Id<"menuProducts">
          );

          const deficit = Math.max(
            0,
            data.plannedToday + data.plannedTomorrow - data.stickered
          );

          return {
            menuProductId,
            productName: menuProduct?.name ?? "Unknown Product",
            stickered: data.stickered,
            plannedToday: data.plannedToday,
            plannedTomorrow: data.plannedTomorrow,
            deficit,
          };
        }
      )
    );

    // Sort by deficit descending (highest deficit first), then by name
    products.sort((a, b) => {
      if (b.deficit !== a.deficit) {
        return b.deficit - a.deficit;
      }
      return a.productName.localeCompare(b.productName);
    });

    return { products };
  },
});

/**
 * Query 4: getInventorySources
 * Shows available inventory at Office (stickered), Goldfinch (depot), and K3 Mart outlets.
 */
export const getInventorySources = query({
  args: {},
  handler: async (ctx) => {
    // 1. Office inventory (stickered from productionLog aggregation)
    const activeProducts = await ctx.db
      .query("menuProducts")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const resetsMap = await getResetsMap(ctx);

    const office = await Promise.all(
      activeProducts.map(async (mp) => {
        const resetRecord = resetsMap.get(mp._id as unknown as string) ?? null;
        const counts = await aggregateForProduct(ctx, mp._id, resetRecord);
        return {
          menuProductId: mp._id,
          productName: mp.name,
          stickered: counts.stickered,
        };
      })
    );

    // 2. Goldfinch depot stock
    const depotStock = await ctx.db.query("gofoodDepotStock").collect();

    const goldfinch = await Promise.all(
      depotStock.map(async (ds) => {
        const menuProduct = await ctx.db.get(ds.menuProductId);
        return {
          menuProductId: ds.menuProductId,
          productName: menuProduct?.name ?? "Unknown",
          quantity: ds.quantity,
          stickerDeficit: ds.stickerDeficit ?? 0,
        };
      })
    );

    // 3. K3 Mart total stock (sum across all active outlets)
    // MIS-02: compound index
    const k3martOutlets = await ctx.db
      .query("externalOutlets")
      .withIndex("by_source_active", (q) => q.eq("source", "k3mart").eq("isActive", true))
      .collect();

    // Get latest snapshot for each outlet
    const k3martStockMap = new Map<string, number>();

    for (const outlet of k3martOutlets) {
      const latestSnapshot = await ctx.db
        .query("externalStockSnapshots")
        .withIndex("by_outlet_snapshot", (q) => q.eq("outletId", outlet._id))
        .order("desc")
        .first();

      if (!latestSnapshot) continue;

      // Get all products in this snapshot batch for this outlet (IRB-06: compound index)
      const snapshotProducts = await ctx.db
        .query("externalStockSnapshots")
        .withIndex("by_batch_outlet", (q) =>
          q.eq("snapshotBatchId", latestSnapshot.snapshotBatchId).eq("outletId", outlet._id)
        )
        .collect();

      // Accumulate stock per product code (extracted to stockHelpers)
      accumulateSnapshotStock(snapshotProducts, k3martStockMap);
    }

    // Fetch product mappings to convert externalProductCode -> menuProductId
    const mappings = await ctx.db
      .query("externalProductMappings")
      .withIndex("by_source_code", (q) => q.eq("source", "k3mart"))
      .collect();

    const codeToMenuProduct = new Map<string, string>();
    for (const m of mappings) {
      if (m.menuProductId) {
        codeToMenuProduct.set(m.externalProductCode, m.menuProductId as string);
      }
    }

    // Aggregate by menuProductId (extracted to stockHelpers)
    const menuProductStockMap = aggregateStockByMenuProduct(k3martStockMap, codeToMenuProduct);

    const k3martTotal = await Promise.all(
      Array.from(menuProductStockMap.entries()).map(
        async ([menuProductId, totalStock]) => {
          const menuProduct = await ctx.db.get(
            menuProductId as Id<"menuProducts">
          );
          return {
            menuProductId,
            productName: menuProduct?.name ?? "Unknown",
            totalStock,
          };
        }
      )
    );

    return {
      office,
      goldfinch,
      k3martTotal,
    };
  },
});

/**
 * Query 5: getOutletDetail
 * Deep dive for a single outlet with stock, revenue, movements, and dispatch plans.
 */
export const getOutletDetail = query({
  args: {
    outletId: v.id("externalOutlets"),
    days: v.optional(v.number()), // Default 7 days
  },
  handler: async (ctx, args) => {
    const days = args.days ?? 7;

    // Get outlet
    const outlet = await ctx.db.get(args.outletId);
    if (!outlet) {
      throw new Error("Outlet not found");
    }

    // Get latest snapshot batch
    const latestSnapshot = await ctx.db
      .query("externalStockSnapshots")
      .withIndex("by_outlet_snapshot", (q) => q.eq("outletId", args.outletId))
      .order("desc")
      .first();

    let stockSnapshots: typeof latestSnapshot[] = [];
    if (latestSnapshot) {
      // IRB-06: compound index
      stockSnapshots = await ctx.db
        .query("externalStockSnapshots")
        .withIndex("by_batch_outlet", (q) =>
          q.eq("snapshotBatchId", latestSnapshot.snapshotBatchId).eq("outletId", args.outletId)
        )
        .collect();
    }

    // Get revenue for last N days
    const now = Date.now();
    const startTime = now - days * 24 * 60 * 60 * 1000;

    // IRB-02: both period bounds at index level
    const revenue = await ctx.db
      .query("externalRevenue")
      .withIndex("by_source_period", (q) =>
        q.eq("source", "k3mart").gte("periodStart", startTime).lt("periodStart", now)
      )
      .filter((q) => q.eq(q.field("outletId"), args.outletId))
      .collect();

    // Get stock movements for this outlet (last N days)
    const movements = await ctx.db
      .query("k3martStockMovements")
      .withIndex("by_outlet_date", (q) => q.eq("outletId", args.outletId))
      .order("desc")
      .take(100); // Limit to last 100 movements

    // Get upcoming dispatch plans (next 7 days)
    const today = new Date();
    const datesToFetch: string[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      datesToFetch.push(date.toISOString().split("T")[0]);
    }

    const dispatchPlans = await Promise.all(
      datesToFetch.map((date) =>
        ctx.db
          .query("k3martDispatchPlans")
          .withIndex("by_outlet_date", (q) =>
            q.eq("outletId", args.outletId).eq("date", date)
          )
          .collect()
      )
    );

    const allDispatchPlans = dispatchPlans.flat();

    return {
      outlet,
      stockSnapshots,
      revenue,
      movements: movements.reverse(), // Oldest first
      dispatchPlans: allDispatchPlans,
    };
  },
});

/**
 * Query 7: getOutletSettings
 * Returns all outlet configs (active/inactive, product visibility, custom pricing).
 */
export const getOutletSettings = query({
  args: {},
  handler: async (ctx) => {
    // Fetch all K3 Mart outlets
    const outlets = await ctx.db
      .query("externalOutlets")
      .withIndex("by_source", (q) => q.eq("source", "k3mart"))
      .collect();

    // Fetch all K3 Mart restock targets (contains product settings per outlet)
    const targets = await ctx.db
      .query("restockTargets")
      .withIndex("by_channel", (q) => q.eq("channel", "k3mart"))
      .collect();

    // Fetch product mappings for product names
    const productMappings = await ctx.db
      .query("externalProductMappings")
      .withIndex("by_source_code", (q) => q.eq("source", "k3mart"))
      .collect();

    const menuProductIds = new Set<string>();
    for (const m of productMappings) {
      if (m.menuProductId) menuProductIds.add(m.menuProductId as string);
    }

    const menuProducts = new Map<string, { name: string }>();
    for (const id of menuProductIds) {
      const mp = await ctx.db.get(id as Id<"menuProducts">);
      if (mp) menuProducts.set(id, { name: mp.name });
    }

    // Build mapping from productKey/externalProductCode to product info
    const mappingByCode = new Map<string, {
      externalName: string;
      menuProductName: string | null;
      snapshotPrice: number;
    }>();
    for (const m of productMappings) {
      const menuProduct = m.menuProductId
        ? menuProducts.get(m.menuProductId as string)
        : null;
      mappingByCode.set(m.externalProductCode, {
        externalName: m.externalProductName,  // K3Mart name e.g., "Dubai Chewy Cookie"
        menuProductName: menuProduct?.name ?? null,  // POS name e.g., "Original - Single (45g)"
        snapshotPrice: 0, // Will be enriched from snapshots below
      });
    }

    // Enrich with latest snapshot prices (externalProductMappings has no price field)
    // MIS-02: compound index
    const k3martOutlets = await ctx.db
      .query("externalOutlets")
      .withIndex("by_source_active", (q) => q.eq("source", "k3mart").eq("isActive", true))
      .collect();

    // Get a single snapshot price per product code (from any outlet's latest snapshot)
    for (const outlet of k3martOutlets) {
      const latestSnapshot = await ctx.db
        .query("externalStockSnapshots")
        .withIndex("by_outlet_snapshot", (q) => q.eq("outletId", outlet._id))
        .order("desc")
        .first();
      if (!latestSnapshot) continue;
      // IRB-06: compound index
      const snapshotProducts = await ctx.db
        .query("externalStockSnapshots")
        .withIndex("by_batch_outlet", (q) =>
          q.eq("snapshotBatchId", latestSnapshot.snapshotBatchId).eq("outletId", outlet._id)
        )
        .collect();
      // Enrich mapping prices from snapshots (extracted to stockHelpers)
      enrichMappingPrices(snapshotProducts, mappingByCode);
    }

    // Build outlet settings
    const outletSettings = outlets.map((outlet) => {
      const outletTargets = targets.filter(
        (t) => t.outletId === outlet._id
      );

      // Build product settings (extracted to stockHelpers)
      const productSettings = buildProductSettings(outletTargets, mappingByCode);

      return {
        outletId: outlet._id,
        outletName: outlet.name,
        externalId: outlet.externalId,
        isActive: outlet.isActive,
        products: productSettings,
      };
    });

    return { outlets: outletSettings };
  },
});
