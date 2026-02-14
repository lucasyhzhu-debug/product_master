/**
 * K3 Mart Cockpit Queries
 *
 * Provides comprehensive views for K3 Mart dispatch planning and inventory monitoring.
 * Combines data from outlets, stock snapshots, production counts, and restock targets.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { aggregateForProduct, getResetsMap } from "../productionLog/helpers";

/**
 * Query 1: getOutletStockSummary
 * Returns all active K3 Mart outlets with latest stock snapshots and sales data.
 */
export const getOutletStockSummary = query({
  args: {
    date: v.string(), // YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    // 1. Fetch all active K3 Mart outlets
    const outlets = await ctx.db
      .query("externalOutlets")
      .withIndex("by_source", (q) => q.eq("source", "k3mart"))
      .filter((q) => q.eq(q.field("isActive"), true))
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
    const allRevenue = await ctx.db
      .query("externalRevenue")
      .withIndex("by_source_period", (q) =>
        q.eq("source", "k3mart").gte("periodStart", sevenDaysAgo)
      )
      .filter((q) => q.lt(q.field("periodStart"), todayEnd))
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

        // Get all products from this snapshot batch for this outlet
        const snapshotProducts = await ctx.db
          .query("externalStockSnapshots")
          .withIndex("by_batch", (q) =>
            q.eq("snapshotBatchId", latestSnapshot.snapshotBatchId)
          )
          .filter((q) => q.eq(q.field("outletId"), outlet._id))
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
 * Returns all dispatch plans for a given ISO week plus restock targets.
 */
export const getWeeklyDispatchPlans = query({
  args: {
    weekNumber: v.string(), // "2026-W07"
  },
  handler: async (ctx, args) => {
    // Fetch all dispatch plans for this week
    const plans = await ctx.db
      .query("k3martDispatchPlans")
      .withIndex("by_week", (q) => q.eq("weekNumber", args.weekNumber))
      .collect();

    // Fetch all K3 Mart restock targets
    const targets = await ctx.db
      .query("restockTargets")
      .withIndex("by_channel", (q) => q.eq("channel", "k3mart"))
      .collect();

    // Build unique products and outlets from restock targets
    const productIds = new Set<string>();
    const outletIds = new Set<string>();
    for (const t of targets) {
      if (t.menuProductId) productIds.add(t.menuProductId as string);
      if (t.outletId) outletIds.add(t.outletId as string);
    }

    // Fetch product names and external codes
    const products = await Promise.all(
      Array.from(productIds).map(async (id) => {
        const mp = await ctx.db.get(id as Id<"menuProducts">);
        const mapping = await ctx.db
          .query("externalProductMappings")
          .withIndex("by_menu_product", (q) => q.eq("menuProductId", id as Id<"menuProducts">))
          .first();
        return {
          menuProductId: id,
          productName: mp?.name ?? "Unknown",
          externalProductCode: mapping?.externalProductCode ?? "",
        };
      })
    );

    // Fetch outlet names
    const outlets = await Promise.all(
      Array.from(outletIds).map(async (id) => {
        const outlet = await ctx.db.get(id as Id<"externalOutlets">);
        return { outletId: id, outletName: outlet?.name ?? "Unknown" };
      })
    );

    return {
      plans,
      targets,
      products,
      outlets,
    };
  },
});

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
    const k3martOutlets = await ctx.db
      .query("externalOutlets")
      .withIndex("by_source", (q) => q.eq("source", "k3mart"))
      .filter((q) => q.eq(q.field("isActive"), true))
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

      // Get all products in this snapshot batch for this outlet
      const snapshotProducts = await ctx.db
        .query("externalStockSnapshots")
        .withIndex("by_batch", (q) =>
          q.eq("snapshotBatchId", latestSnapshot.snapshotBatchId)
        )
        .filter((q) => q.eq(q.field("outletId"), outlet._id))
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
      stockSnapshots = await ctx.db
        .query("externalStockSnapshots")
        .withIndex("by_batch", (q) =>
          q.eq("snapshotBatchId", latestSnapshot.snapshotBatchId)
        )
        .filter((q) => q.eq(q.field("outletId"), args.outletId))
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
