/**
 * GoFood Depot (Goldfinch) Queries
 *
 * Queries for depot stock, virtual daily order, shipments, sticker inventory,
 * restock suggestions (GF-04), and per-outlet product mappings (GF-02).
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import { computeRestockSuggestion, getWibDayOfWeek } from "./helpers";
import { getWibDateStr } from "../lib/periodRange";

/**
 * Get depot stock records.
 *
 * When outletId is provided, filters by by_outlet_product index and enriches
 * with productInventory data at the outlet's linkedStorageLocationId.
 * When outletId is omitted, falls back to listing all records (legacy behavior).
 */
export const getDepotStock = query({
  args: {
    outletId: v.optional(v.id("externalOutlets")),
  },
  handler: async (ctx, args) => {
    let stocks;

    if (args.outletId) {
      const outlet = await ctx.db.get(args.outletId);
      const linkedLocationId = outlet?.linkedStorageLocationId;

      if (!linkedLocationId) {
        return []; // Outlet not yet linked to a storage location
      }

      // Single source of truth: productInventory at outlet's linked location
      const invRows = await ctx.db
        .query("productInventory")
        .withIndex("by_location", (q) => q.eq("locationId", linkedLocationId))
        .collect();

      const enriched = [];
      for (const row of invRows) {
        const menuProduct = await ctx.db.get(row.menuProductId);
        if (!menuProduct) continue;

        enriched.push({
          _id: row._id,
          menuProductId: row.menuProductId,
          menuProductName: menuProduct.name,
          menuProductCode: menuProduct.code ?? "",
          quantity: row.quantity,
          outletId: args.outletId,
          productInventoryQty: row.quantity,
          locationId: linkedLocationId,
        });
      }

      return enriched.sort((a, b) => a.menuProductName.localeCompare(b.menuProductName));
    } else {
      // Legacy: return all records
      stocks = await ctx.db.query("gofoodDepotStock").collect();

      const enriched = [];
      for (const stock of stocks) {
        const menuProduct = await ctx.db.get(stock.menuProductId);
        enriched.push({
          ...stock,
          menuProductName: menuProduct?.name ?? "Unknown",
          menuProductCode: menuProduct?.code ?? "",
          productInventoryQty: null as number | null,
        });
      }

      return enriched;
    }
  },
});

/**
 * Get the virtual GoFood daily order for a given date.
 *
 * Assembles data from:
 * - productionProductTargets (source="gofood")
 * - gofoodDepotStock
 * - gofoodDepotShipments (today)
 * - externalRevenue (today, source="gobiz", optionally filtered by outletId)
 */
export const getGoFoodDailyOrder = query({
  args: {
    date: v.string(), // YYYY-MM-DD
    outletId: v.optional(v.id("externalOutlets")), // Filter revenue by outlet when provided
  },
  handler: async (ctx, args) => {
    // 1. Get GoFood targets for today
    const gofoodTargets = await ctx.db
      .query("productionProductTargets")
      .withIndex("by_date_source", (q) =>
        q.eq("date", args.date).eq("source", "gofood")
      )
      .collect();

    // Filter to targets with quantity > 0
    const activeTargets = gofoodTargets.filter((t) => t.quantity > 0);

    if (activeTargets.length === 0) {
      return null; // No GoFood targets today
    }

    // 2. Get all depot stock (per-outlet if outletId provided, else all)
    let allDepotStock;
    if (args.outletId) {
      allDepotStock = await ctx.db
        .query("gofoodDepotStock")
        .withIndex("by_outlet_product", (q) => q.eq("outletId", args.outletId))
        .collect();
    } else {
      allDepotStock = await ctx.db.query("gofoodDepotStock").collect();
    }
    const depotStockMap = new Map(
      allDepotStock.map((s) => [s.menuProductId as string, s])
    );

    // 3. Get today's shipments
    const todayShipments = await ctx.db
      .query("gofoodDepotShipments")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect();

    // Aggregate shipments per product
    const shippedTodayMap = new Map<string, number>();
    for (const s of todayShipments) {
      const key = s.menuProductId as string;
      shippedTodayMap.set(key, (shippedTodayMap.get(key) ?? 0) + s.quantity);
    }

    // 4. Get today's sales (externalRevenue from gobiz for today, optionally per outlet)
    const todayStart = new Date(args.date + "T00:00:00+07:00").getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000;

    let todayRevenues;
    if (args.outletId) {
      // Filter by outlet using by_outlet index, then filter by date
      todayRevenues = await ctx.db
        .query("externalRevenue")
        .withIndex("by_outlet", (q) => q.eq("outletId", args.outletId))
        .filter((q) =>
          q.and(
            q.eq(q.field("source"), "gobiz"),
            q.gte(q.field("periodStart"), todayStart),
            q.lt(q.field("periodStart"), todayEnd)
          )
        )
        .collect();
    } else {
      // IRB-02: both period bounds at index level
      todayRevenues = await ctx.db
        .query("externalRevenue")
        .withIndex("by_source_period", (q) =>
          q.eq("source", "gobiz").gte("periodStart", todayStart).lt("periodStart", todayEnd)
        )
        .collect();
    }

    // Get items for today's revenues
    const soldTodayMap = new Map<string, number>();
    for (const rev of todayRevenues) {
      const items = await ctx.db
        .query("externalRevenueItems")
        .withIndex("by_revenue", (q) => q.eq("revenueId", rev._id))
        .collect();

      for (const item of items) {
        if (item.linkedMenuProductId) {
          const key = item.linkedMenuProductId as string;
          soldTodayMap.set(
            key,
            (soldTodayMap.get(key) ?? 0) + item.quantity
          );
        }
      }
    }

    // 5. Get last sync info (optionally for the specific outlet)
    let lastSync;
    if (args.outletId) {
      lastSync = await ctx.db
        .query("externalSyncLogs")
        .withIndex("by_outlet", (q) => q.eq("outletId", args.outletId))
        .order("desc")
        .first();
    } else {
      lastSync = await ctx.db
        .query("externalSyncLogs")
        .withIndex("by_source", (q) => q.eq("source", "gobiz"))
        .order("desc")
        .first();
    }

    // 6. Assemble virtual order items
    const items = [];
    for (const target of activeTargets) {
      const menuProduct = await ctx.db.get(target.menuProductId);
      if (!menuProduct) continue;

      const mpId = target.menuProductId as string;
      const depotStock = depotStockMap.get(mpId);
      const existingAtDepot = depotStock?.quantity ?? 0;
      const shippedToday = shippedTodayMap.get(mpId) ?? 0;
      const soldToday = soldTodayMap.get(mpId) ?? 0;
      const stickerDeficit = depotStock?.stickerDeficit ?? 0;

      items.push({
        menuProductId: target.menuProductId,
        productName: menuProduct.name,
        productCode: menuProduct.code,
        targetQty: target.quantity,
        existingAtDepot,
        toShipToday: Math.max(0, target.quantity - existingAtDepot),
        shippedToday,
        soldToday,
        currentDepotStock: existingAtDepot,
        stickerDeficit,
      });
    }

    // Format order number: GF-MMDD (or GF-MMDD-outletId suffix if per-outlet)
    const mmdd = args.date.slice(5).replace("-", "");

    return {
      orderNumber: `GF-${mmdd}`,
      customerName: "GoFood Depot",
      date: args.date,
      outletId: args.outletId ?? null,
      items,
      lastSyncAt: lastSync?.timestamp,
      lastSyncStatus: lastSync?.status,
    };
  },
});

/**
 * Get today's shipments to Goldfinch.
 */
export const getTodayShipments = query({
  args: {
    date: v.string(), // YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    const shipments = await ctx.db
      .query("gofoodDepotShipments")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect();

    // Enrich with product names
    const enriched = [];
    for (const s of shipments) {
      const menuProduct = await ctx.db.get(s.menuProductId);
      enriched.push({
        ...s,
        menuProductName: menuProduct?.name ?? "Unknown",
      });
    }

    return enriched;
  },
});

/**
 * Get sticker inventory at Goldfinch for labeling-stage components
 * linked to menu products with GoFood targets.
 */
export const getGoldfinchStickerInventory = query({
  args: {},
  handler: async (ctx) => {
    // Find Goldfinch location
    const goldfinchLocation = await ctx.db
      // MIS-03: compound index
      .query("storageLocations")
      .withIndex("by_type_active", (q) => q.eq("locationType", "venue").eq("isActive", true))
      .first();

    if (!goldfinchLocation) return [];

    // Get all componentStock at Goldfinch
    const stocks = await ctx.db
      .query("componentStock")
      .withIndex("by_location", (q) =>
        q.eq("locationId", goldfinchLocation._id)
      )
      .collect();

    // Enrich with component type info
    const enriched = [];
    for (const stock of stocks) {
      const componentType = await ctx.db.get(stock.componentTypeId);
      if (!componentType) continue;

      // Only include labeling-stage packaging components
      if (
        componentType.category !== "packaging" ||
        componentType.consumptionStage !== "labeling"
      ) {
        continue;
      }

      enriched.push({
        componentTypeId: stock.componentTypeId,
        componentName: componentType.name,
        componentCode: componentType.code,
        totalStock: stock.totalStock,
        totalReserved: stock.totalReserved,
        available: stock.totalStock - stock.totalReserved,
      });
    }

    return enriched;
  },
});

/**
 * Get freshness info for depot stock.
 * Returns shipment dates with quantities for age calculation.
 */
export const getDepotFreshness = query({
  args: {
    menuProductId: v.id("menuProducts"),
    lookbackDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const lookbackDays = args.lookbackDays ?? 5;
    const wibNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const today = wibNow.toISOString().slice(0, 10);

    // Get recent shipments for this product
    const shipments = await ctx.db
      .query("gofoodDepotShipments")
      .withIndex("by_product_date", (q) =>
        q.eq("menuProductId", args.menuProductId)
      )
      .order("desc")
      .collect();

    // Filter to recent days
    const cutoffDate = new Date(wibNow.getTime() - lookbackDays * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const recentShipments = shipments.filter((s) => s.date >= cutoffDate);

    // Group by date
    const byDate = new Map<string, number>();
    for (const s of recentShipments) {
      byDate.set(s.date, (byDate.get(s.date) ?? 0) + s.quantity);
    }

    // Calculate age of stock (FIFO: oldest sold first)
    const depotStock = await ctx.db
      .query("gofoodDepotStock")
      .withIndex("by_menuProduct", (q) =>
        q.eq("menuProductId", args.menuProductId)
      )
      .first();

    const currentQty = depotStock?.quantity ?? 0;

    // Work backwards from most recent shipments
    const dateEntries = Array.from(byDate.entries())
      .sort((a, b) => b[0].localeCompare(a[0])); // Newest first

    let remaining = currentQty;
    const ageBreakdown: Array<{ date: string; quantity: number; ageDays: number }> = [];

    for (const [date, qty] of dateEntries) {
      if (remaining <= 0) break;

      const takeQty = Math.min(remaining, qty);
      const ageDays = Math.floor(
        (new Date(today).getTime() - new Date(date).getTime()) /
          (24 * 60 * 60 * 1000)
      );

      ageBreakdown.push({ date, quantity: takeQty, ageDays });
      remaining -= takeQty;
    }

    // Determine freshness level
    const maxAge = ageBreakdown.length > 0
      ? Math.max(...ageBreakdown.map((a) => a.ageDays))
      : 0;

    const freshness: "fresh" | "day_old" | "aging" =
      maxAge === 0 ? "fresh" : maxAge === 1 ? "day_old" : "aging";

    return {
      currentQuantity: currentQty,
      ageBreakdown,
      freshness,
      maxAgeDays: maxAge,
      today,
    };
  },
});

/**
 * Check if seed (seedFinishedGoodsLocations) has been run.
 * Returns seedRequired=true when any GoBiz outlet lacks linkedStorageLocationId.
 * Used to show the full-page seed warning blocker (GF-05).
 */
export const isSeedRequired = query({
  args: {},
  handler: async (ctx) => {
    const gobizOutlets = await ctx.db
      .query("externalOutlets")
      .withIndex("by_source", (q) => q.eq("source", "gobiz"))
      .collect();

    const settings = await ctx.db.query("productInventorySettings").first();
    const unlinkedOutlets = gobizOutlets.filter((o) => !o.linkedStorageLocationId);

    return {
      seedRequired: unlinkedOutlets.length > 0 || !settings,
      unlinkedOutlets: unlinkedOutlets.map((o) => ({ id: o._id, name: o.name })),
    };
  },
});

/**
 * Compute restock suggestions per product for a given GoFood outlet (GF-04).
 *
 * Rules (WIB timezone):
 * - Monday: reset to previous Thursday's total sold
 * - Friday / Saturday: n+2 buffer on 3-day average
 * - All other days: n+1 buffer on 3-day average
 *
 * Returns per-product suggestion with calculation breakdown.
 */
export const getRestockSuggestions = query({
  args: {
    outletId: v.id("externalOutlets"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const todayWib = getWibDateStr(now);
    const dayOfWeek = getWibDayOfWeek(now);

    // We need sales for the last 4 days (3 for average + find prev Thursday)
    // Look back up to 14 days to ensure we find a Thursday
    const lookbackStart = getWibDateStr(now - 14 * 24 * 60 * 60 * 1000);

    // Build timestamp range for the lookback window (WIB midnight boundaries)
    const lookbackStartMs = new Date(lookbackStart + "T00:00:00+07:00").getTime();
    const todayEndMs = new Date(todayWib + "T23:59:59+07:00").getTime();

    // Get all external revenue records for this outlet within the window
    const revenues = await ctx.db
      .query("externalRevenue")
      .withIndex("by_outlet", (q) => q.eq("outletId", args.outletId))
      .filter((q) =>
        q.and(
          q.gte(q.field("periodStart"), lookbackStartMs),
          q.lte(q.field("periodStart"), todayEndMs)
        )
      )
      .collect();

    // Build a map: date -> { menuProductId -> quantity sold }
    const salesByDateAndProduct = new Map<string, Map<string, number>>();

    for (const rev of revenues) {
      // Convert periodStart to WIB date
      const revDate = getWibDateStr(rev.periodStart);

      // Skip today's data (we're suggesting for tomorrow)
      if (revDate >= todayWib) continue;

      const items = await ctx.db
        .query("externalRevenueItems")
        .withIndex("by_revenue", (q) => q.eq("revenueId", rev._id))
        .collect();

      for (const item of items) {
        if (!item.linkedMenuProductId) continue;
        const mpId = item.linkedMenuProductId as string;

        if (!salesByDateAndProduct.has(revDate)) {
          salesByDateAndProduct.set(revDate, new Map());
        }
        const dayMap = salesByDateAndProduct.get(revDate)!;
        dayMap.set(mpId, (dayMap.get(mpId) ?? 0) + item.quantity);
      }
    }

    // Get all dates sorted descending (most recent first, excluding today)
    const allDates = Array.from(salesByDateAndProduct.keys()).sort((a, b) =>
      b.localeCompare(a)
    );

    // Last 3 days for the rolling average (excluding today)
    const last3Dates = allDates.slice(0, 3);

    // Find the most recent Thursday for Monday reset
    let prevThursdayDate: string | null = null;
    for (const d of allDates) {
      const dMs = new Date(d + "T12:00:00+07:00").getTime();
      const dDow = new Date(dMs + 7 * 60 * 60 * 1000).getUTCDay();
      if (dDow === 4) {
        // Thursday
        prevThursdayDate = d;
        break;
      }
    }

    // Collect all menu product IDs that appear in any day's sales
    const allMenuProductIds = new Set<string>();
    for (const dayMap of salesByDateAndProduct.values()) {
      for (const mpId of dayMap.keys()) {
        allMenuProductIds.add(mpId);
      }
    }

    // Compute suggestions per product
    const suggestions: Array<{
      menuProductId: string;
      productName: string;
      suggestion: number;
      breakdown: string;
      salesLast3Days: number[];
      previousThursdayTotal: number;
    }> = [];

    for (const mpId of allMenuProductIds) {
      // Sales for last 3 days (oldest first for the helper)
      const salesLast3Days = last3Dates
        .map((d) => salesByDateAndProduct.get(d)?.get(mpId) ?? 0)
        .reverse(); // helper expects [day-3, day-2, day-1] (oldest first)

      // Previous Thursday total
      const previousThursdayTotal = prevThursdayDate
        ? (salesByDateAndProduct.get(prevThursdayDate)?.get(mpId) ?? 0)
        : 0;

      const { suggestion, breakdown } = computeRestockSuggestion(
        salesLast3Days,
        dayOfWeek,
        previousThursdayTotal
      );

      // Look up product name via typed query
      const menuProduct = await ctx.db
        .query("menuProducts")
        .filter((q) => q.eq(q.field("_id"), mpId))
        .first();

      suggestions.push({
        menuProductId: mpId,
        productName: menuProduct?.name ?? "Unknown",
        suggestion,
        breakdown,
        salesLast3Days,
        previousThursdayTotal,
      });
    }

    return {
      outletId: args.outletId,
      todayWib,
      dayOfWeek,
      suggestions,
    };
  },
});

/**
 * Get per-outlet product mappings for a given GoFood outlet (GF-02).
 *
 * Returns:
 * - mappings: all configured mappings for this outlet
 * - unmappedProducts: GoFood product names seen in revenue data but with no mapping
 */
export const getOutletProductMappings = query({
  args: {
    outletId: v.id("externalOutlets"),
  },
  handler: async (ctx, args) => {
    // 1. Get all saved mappings for this outlet
    const mappings = await ctx.db
      .query("gofoodOutletProductMappings")
      .withIndex("by_outlet", (q) => q.eq("outletId", args.outletId))
      .collect();

    // 2. Enrich each mapping with the linked menu product name
    const enrichedMappings = [];
    for (const mapping of mappings) {
      let menuProductName: string | undefined;
      if (mapping.menuProductId) {
        const mp = await ctx.db.get(mapping.menuProductId);
        menuProductName = mp?.name;
      }
      enrichedMappings.push({
        _id: mapping._id,
        outletId: mapping.outletId,
        externalProductName: mapping.externalProductName,
        menuProductId: mapping.menuProductId,
        menuProductName,
        isActive: mapping.isActive,
        updatedAt: mapping.updatedAt,
      });
    }

    // 3. Find GoFood product names from recent revenue items for this outlet
    //    that don't have a mapping yet (unmapped)
    const mappedNames = new Set(mappings.map((m) => m.externalProductName));

    // Look at the last 30 days of revenue items
    const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentRevenues = await ctx.db
      .query("externalRevenue")
      .withIndex("by_outlet", (q) => q.eq("outletId", args.outletId))
      .filter((q) => q.gte(q.field("periodStart"), cutoffMs))
      .collect();

    const seenProductNames = new Set<string>();
    for (const rev of recentRevenues) {
      const items = await ctx.db
        .query("externalRevenueItems")
        .withIndex("by_revenue", (q) => q.eq("revenueId", rev._id))
        .collect();
      for (const item of items) {
        seenProductNames.add(item.productName);
      }
    }

    // Unmapped = seen in revenue data but no mapping row exists
    const unmappedProducts = Array.from(seenProductNames).filter(
      (name) => !mappedNames.has(name)
    );

    return {
      mappings: enrichedMappings,
      unmappedProducts,
    };
  },
});
