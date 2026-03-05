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
import { getWeekNumber, calculateAutoSuggest, getDayTypeForDate, getWeekDatesFromWeekNumber } from "./helpers";

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

        // Build product list with sales data
        const products = snapshotProducts.map((sp) => {
          // Today's sales for this product
          const todaySales = outletRevenue
            .filter(
              (r) =>
                r.externalProductCode === sp.externalProductCode &&
                r.periodStart >= todayStart &&
                r.periodStart < todayEnd
            )
            .reduce((sum, r) => sum + (r.quantitySold ?? 0), 0);

          // Last 7 days sales for avg calculation
          const sevenDaySales = outletRevenue
            .filter(
              (r) =>
                r.externalProductCode === sp.externalProductCode &&
                r.periodStart >= sevenDaysAgo &&
                r.periodStart < todayEnd
            )
            .reduce((sum, r) => sum + (r.quantitySold ?? 0), 0);

          const avgDailySales7d = sevenDaySales / 7;

          return {
            externalProductId: sp.externalProductId,
            externalProductCode: sp.externalProductCode,
            productName: sp.productName,
            quantity: sp.quantity,
            price: sp.price,
            soldToday: todaySales,
            avgDailySales7d,
            menuProductId: codeToMenuProduct.get(sp.externalProductCode) ?? null,
          };
        });

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

    // Build code -> mapping lookup
    const codeToMapping = new Map<string, typeof productMappings[number]>();
    for (const m of productMappings) {
      codeToMapping.set(m.externalProductCode, m);
    }

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

      for (const sp of snapshotProducts) {
        stockByOutletProduct.set(
          `${outlet._id}_${sp.externalProductCode}`,
          sp.quantity
        );
        priceByOutletProduct.set(
          `${outlet._id}_${sp.externalProductCode}`,
          sp.price
        );
      }
    }

    // 8. Compute previous week totals per outlet+product (for auto-suggest baseline)
    const prevWeekNumber = getPreviousWeekNumber(args.weekNumber);
    const prevWeekPlans = await ctx.db
      .query("k3martDispatchPlans")
      .withIndex("by_week", (q) => q.eq("weekNumber", prevWeekNumber))
      .collect();

    // Aggregate previous week: outletId_menuProductId -> total planned qty
    const prevWeekByOutletProduct = new Map<string, number>();
    const previousWeekTotals: Record<string, number> = {}; // menuProductId -> total
    for (const p of prevWeekPlans) {
      if (!p.isStockOut) {
        const opKey = `${p.outletId}_${p.menuProductId}`;
        prevWeekByOutletProduct.set(
          opKey,
          (prevWeekByOutletProduct.get(opKey) ?? 0) + p.plannedQty
        );
        const mpKey = p.menuProductId as string;
        previousWeekTotals[mpKey] = (previousWeekTotals[mpKey] ?? 0) + p.plannedQty;
      }
    }

    // 9. Build outlet-first response
    const outletResults: Array<{
      outletId: Id<"externalOutlets">;
      outletName: string;
      isActive: boolean;
      products: Array<{
        menuProductId: string;
        productName: string;
        externalProductName: string;
        externalProductCode: string;
        currentStock: number;
        price: number;
        isHidden: boolean;
      }>;
      subtotalByDay: Record<string, number>;
    }> = [];

    for (const outlet of allOutlets) {
      const outletProducts: Array<{
        menuProductId: string;
        productName: string;
        externalProductName: string;
        externalProductCode: string;
        currentStock: number;
        price: number;
        isHidden: boolean;
      }> = [];

      for (const mapping of productMappings) {
        if (!mapping.menuProductId) continue;

        const mpId = mapping.menuProductId as string;
        const productKey = mapping.externalProductCode;
        const targetKey = `${outlet._id}_${productKey}`;
        const target = targetLookup.get(targetKey);

        // Filter hidden products
        if (target?.isHidden === true) continue;

        const mp = menuProducts.get(mpId);
        const stockKey = `${outlet._id}_${productKey}`;
        const currentStock = stockByOutletProduct.get(stockKey) ?? 0;

        // Price priority: restockTargets.customPrice > K3MART snapshot price > 0
        const customPrice = target?.customPrice;
        const snapshotPrice = priceByOutletProduct.get(stockKey) ?? 0;
        const price = customPrice ?? snapshotPrice;

        // K3Mart product name from externalProductMappings
        const k3martName = externalNameByCode.get(productKey) ?? productKey;

        outletProducts.push({
          menuProductId: mpId,
          productName: mp?.name ?? k3martName,
          externalProductName: k3martName,
          externalProductCode: productKey,
          currentStock,
          price,
          isHidden: false,
        });
      }

      // Calculate subtotals by day from existing plans
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

    // 10. Build plans lookup and compute subtotals + totals
    const planCells: Record<
      string,
      {
        plannedQty: number;
        suggestedQty: number;
        isStockOut: boolean;
        status: string;
        source?: string;
        destination?: string;
      }
    > = {};

    const weekTotalsByDay: Record<string, number> = {};
    const weekTotalsByProduct: Record<string, number> = {};
    let grandTotal = 0;

    for (const date of weekDates) {
      weekTotalsByDay[date] = 0;
    }

    for (const plan of plans) {
      if (plan.isStockOut) continue; // Only stock-in counts for planning grid

      const cellKey = `${plan.outletId}_${plan.date}_${plan.menuProductId}`;
      planCells[cellKey] = {
        plannedQty: plan.plannedQty,
        suggestedQty: plan.suggestedQty,
        isStockOut: plan.isStockOut,
        status: plan.status,
        source: plan.source ?? undefined,
        destination: plan.destination ?? undefined,
      };

      // Update subtotals per outlet
      const outletResult = outletResults.find(
        (o) => o.outletId === plan.outletId
      );
      if (outletResult && outletResult.subtotalByDay[plan.date] !== undefined) {
        outletResult.subtotalByDay[plan.date] += plan.plannedQty;
      }

      // Update week totals
      if (weekTotalsByDay[plan.date] !== undefined) {
        weekTotalsByDay[plan.date] += plan.plannedQty;
      }
      const mpKey = plan.menuProductId as string;
      weekTotalsByProduct[mpKey] = (weekTotalsByProduct[mpKey] ?? 0) + plan.plannedQty;
      grandTotal += plan.plannedQty;
    }

    // 11. Compute auto-suggest for empty cells
    for (const outlet of outletResults) {
      for (const product of outlet.products) {
        const opKey = `${outlet.outletId}_${product.menuProductId}`;
        const baseline = prevWeekByOutletProduct.get(opKey) ?? 0;

        for (const date of weekDates) {
          const cellKey = `${outlet.outletId}_${date}_${product.menuProductId}`;
          if (!planCells[cellKey]) {
            const dayType = getDayTypeForDate(date);
            const suggestedQty = calculateAutoSuggest(baseline, dayType);
            planCells[cellKey] = {
              plannedQty: 0,
              suggestedQty,
              isStockOut: false,
              status: "draft",
            };
          }
        }
      }
    }

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

    // Build a map: menuProductId -> { stickered, plannedToday, plannedTomorrow }
    const productMap = new Map<
      string,
      { stickered: number; plannedToday: number; plannedTomorrow: number }
    >();

    // Initialize with aggregated production counts
    for (const pc of allProductionCounts) {
      productMap.set(pc.menuProductId, {
        stickered: pc.stickered,
        plannedToday: 0,
        plannedTomorrow: 0,
      });
    }

    // Aggregate today's planned quantities (only stock-in)
    for (const plan of allTodayPlans) {
      if (!plan.isStockOut) {
        const mpId = plan.menuProductId as string;
        const existing = productMap.get(mpId);
        if (existing) {
          existing.plannedToday += plan.plannedQty;
        } else {
          productMap.set(mpId, {
            stickered: 0,
            plannedToday: plan.plannedQty,
            plannedTomorrow: 0,
          });
        }
      }
    }

    // Aggregate tomorrow's planned quantities (only stock-in)
    for (const plan of allTomorrowPlans) {
      if (!plan.isStockOut) {
        const mpId = plan.menuProductId as string;
        const existing = productMap.get(mpId);
        if (existing) {
          existing.plannedTomorrow += plan.plannedQty;
        } else {
          productMap.set(mpId, {
            stickered: 0,
            plannedToday: 0,
            plannedTomorrow: plan.plannedQty,
          });
        }
      }
    }

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

      for (const sp of snapshotProducts) {
        const existing = k3martStockMap.get(sp.externalProductCode) ?? 0;
        k3martStockMap.set(sp.externalProductCode, existing + sp.quantity);
      }
    }

    // Fetch product mappings to convert externalProductCode -> menuProductId
    const mappings = await ctx.db
      .query("externalProductMappings")
      .withIndex("by_source_code", (q) => q.eq("source", "k3mart"))
      .collect();

    const codeToMenuProduct = new Map<string, Id<"menuProducts">>();
    for (const m of mappings) {
      if (m.menuProductId) {
        codeToMenuProduct.set(m.externalProductCode, m.menuProductId);
      }
    }

    // Aggregate by menuProductId
    const menuProductStockMap = new Map<string, number>();
    for (const [code, qty] of k3martStockMap) {
      const mpId = codeToMenuProduct.get(code);
      if (mpId) {
        const existing = menuProductStockMap.get(mpId) ?? 0;
        menuProductStockMap.set(mpId, existing + qty);
      }
    }

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

    const revenue = await ctx.db
      .query("externalRevenue")
      .withIndex("by_source_period", (q) =>
        q.eq("source", "k3mart").gte("periodStart", startTime)
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
 * Query 6: getStockMovementHistory
 * Filterable audit log of all stock movements.
 */
export const getStockMovementHistory = query({
  args: {
    outletId: v.optional(v.id("externalOutlets")),
    date: v.optional(v.string()), // YYYY-MM-DD
    limit: v.optional(v.number()), // Default 50
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    let movements;

    if (args.outletId && args.date) {
      // Filter by both outlet and date
      movements = await ctx.db
        .query("k3martStockMovements")
        .withIndex("by_outlet_date", (q) =>
          q.eq("outletId", args.outletId!).eq("date", args.date!)
        )
        .order("desc")
        .take(limit);
    } else if (args.outletId) {
      // Filter by outlet only
      movements = await ctx.db
        .query("k3martStockMovements")
        .withIndex("by_outlet_date", (q) => q.eq("outletId", args.outletId!))
        .order("desc")
        .take(limit);
    } else if (args.date) {
      // Filter by date only
      movements = await ctx.db
        .query("k3martStockMovements")
        .withIndex("by_date", (q) => q.eq("date", args.date!))
        .order("desc")
        .take(limit);
    } else {
      // No filters - get most recent movements
      movements = await ctx.db
        .query("k3martStockMovements")
        .order("desc")
        .take(limit);
    }

    return movements.reverse(); // Return oldest first for chronological audit log
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
      for (const sp of snapshotProducts) {
        const mapping = mappingByCode.get(sp.externalProductCode);
        if (mapping && mapping.snapshotPrice === 0 && sp.price > 0) {
          mapping.snapshotPrice = sp.price;
        }
      }
    }

    // Build outlet settings
    const outletSettings = outlets.map((outlet) => {
      const outletTargets = targets.filter(
        (t) => t.outletId === outlet._id
      );

      const productSettings = outletTargets.map((t) => {
        const mapping = mappingByCode.get(t.productKey);
        return {
          productKey: t.productKey,
          menuProductId: t.menuProductId as string | undefined,
          // Show K3Mart name (externalProductName) as primary display
          externalProductName: mapping?.externalName ?? t.productKey,
          // Show POS/menu product name as secondary
          productName: mapping?.menuProductName ?? mapping?.externalName ?? t.productKey,
          // Real default price from snapshot (not 0)
          defaultPrice: mapping?.snapshotPrice ?? 0,
          weekdayTarget: t.weekdayTarget,
          weekendTarget: t.weekendTarget,
          customPrice: t.customPrice ?? null,
          isHidden: t.isHidden ?? false,
        };
      });

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
