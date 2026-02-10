/**
 * GoFood Depot (Goldfinch) Queries
 *
 * Queries for depot stock, virtual daily order, shipments, and sticker inventory.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get all depot stock records (per-product stock at Goldfinch).
 */
export const getDepotStock = query({
  args: {},
  handler: async (ctx) => {
    const stocks = await ctx.db.query("gofoodDepotStock").collect();

    // Enrich with menu product names
    const enriched = [];
    for (const stock of stocks) {
      const menuProduct = await ctx.db.get(stock.menuProductId);
      enriched.push({
        ...stock,
        menuProductName: menuProduct?.name ?? "Unknown",
        menuProductCode: menuProduct?.code ?? "",
      });
    }

    return enriched;
  },
});

/**
 * Get the virtual GoFood daily order for a given date.
 *
 * Assembles data from:
 * - productionProductTargets (source="gofood")
 * - gofoodDepotStock
 * - gofoodDepotShipments (today)
 * - externalRevenueItems (today, source="gobiz")
 */
export const getGoFoodDailyOrder = query({
  args: {
    date: v.string(), // YYYY-MM-DD
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

    // 2. Get all depot stock
    const allDepotStock = await ctx.db.query("gofoodDepotStock").collect();
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

    // 4. Get today's sales (externalRevenueItems from gobiz for today)
    const todayStart = new Date(args.date + "T00:00:00+07:00").getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000;

    const todayRevenues = await ctx.db
      .query("externalRevenue")
      .withIndex("by_source_period", (q) => q.eq("source", "gobiz"))
      .filter((q) =>
        q.and(
          q.gte(q.field("periodStart"), todayStart),
          q.lt(q.field("periodStart"), todayEnd)
        )
      )
      .collect();

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

    // 5. Get last sync info
    const lastSync = await ctx.db
      .query("externalSyncLogs")
      .withIndex("by_source", (q) => q.eq("source", "gobiz"))
      .order("desc")
      .first();

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

    // Format order number: GF-MMDD
    const mmdd = args.date.slice(5).replace("-", "");

    return {
      orderNumber: `GF-${mmdd}`,
      customerName: "GoFood Depot",
      date: args.date,
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
      .query("storageLocations")
      .withIndex("by_type", (q) => q.eq("locationType", "venue"))
      .filter((q) => q.eq(q.field("isActive"), true))
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
