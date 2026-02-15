import { query } from "../_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  aggregateForProduct,
  buildBallInfoMap,
  getResetsMap,
} from "./helpers";

/**
 * Get recent production log entries, enriched with menu product name.
 */
export const getRecent = query({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    if (args.limit <= 0) return [];

    const entries = await ctx.db
      .query("productionLog")
      .withIndex("by_timestamp")
      .order("desc")
      .take(args.limit);

    // Enrich with menu product name
    return await Promise.all(
      entries.map(async (entry) => {
        const mp = await ctx.db.get(entry.menuProductId);
        return {
          ...entry,
          menuProductName: mp?.name ?? "Unknown",
        };
      })
    );
  },
});

/**
 * Get recent production log entries with cursor-based pagination.
 * Uses Convex paginate() for efficient incremental loading.
 * Enriches each entry with menu product name.
 */
export const getRecentPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const paginatedResult = await ctx.db
      .query("productionLog")
      .withIndex("by_timestamp")
      .order("desc")
      .paginate(args.paginationOpts);

    // Enrich with menu product name
    const enrichedPage = await Promise.all(
      paginatedResult.page.map(async (entry) => {
        const mp = await ctx.db.get(entry.menuProductId);
        return { ...entry, menuProductName: mp?.name ?? "Unknown" };
      })
    );

    return { ...paginatedResult, page: enrichedPage };
  },
});

/**
 * Get production log entries for a specific menu product.
 */
export const getByMenuProduct = query({
  args: { menuProductId: v.id("menuProducts") },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("productionLog")
      .withIndex("by_menu_product", (q) =>
        q.eq("menuProductId", args.menuProductId)
      )
      .order("desc")
      .collect();

    return entries;
  },
});

/**
 * Get aggregated production summary for a given date (YYYY-MM-DD).
 * Groups log entries by menu product and action type.
 */
export const getDailySummary = query({
  args: { date: v.string() }, // YYYY-MM-DD
  handler: async (ctx, args) => {
    // Parse date to get start/end timestamps
    const startOfDay = new Date(args.date + "T00:00:00Z").getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

    // Get all log entries for this day
    const entries = await ctx.db
      .query("productionLog")
      .withIndex("by_timestamp")
      .filter((q) =>
        q.and(
          q.gte(q.field("timestamp"), startOfDay),
          q.lt(q.field("timestamp"), endOfDay)
        )
      )
      .collect();

    // Aggregate by menu product and action
    const summaryMap = new Map<
      string,
      {
        menuProductId: string;
        menuProductName: string;
        box: number;
        unbox: number;
        sticker: number;
        unsticker: number;
        pack: number;
        unpack: number;
        ship_goldfinch: number;
        return_goldfinch: number;
      }
    >();

    for (const entry of entries) {
      const key = entry.menuProductId as string;
      if (!summaryMap.has(key)) {
        const mp = await ctx.db.get(entry.menuProductId);
        summaryMap.set(key, {
          menuProductId: key,
          menuProductName: mp?.name ?? "Unknown",
          box: 0,
          unbox: 0,
          sticker: 0,
          unsticker: 0,
          pack: 0,
          unpack: 0,
          ship_goldfinch: 0,
          return_goldfinch: 0,
        });
      }

      const summary = summaryMap.get(key)!;
      summary[entry.action] += entry.quantity;
    }

    return Array.from(summaryMap.values());
  },
});

// ============================================
// Aggregation Queries (replace productionCounts reads)
// ============================================

/**
 * Get aggregated production counts for all active menu products.
 * Replaces productionCounts.queries.getAll — derives counts from productionLog.
 *
 * Respects productionResets timestamps: only counts log entries after the last reset.
 * Ball info derived from BOM (menuProductComponents + componentTypes).
 */
export const getAggregatedCounts = query({
  args: {},
  handler: async (ctx) => {
    // 1. Get all active menu products
    const menuProducts = await ctx.db
      .query("menuProducts")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // 2. Get all productionResets
    const resetsMap = await getResetsMap(ctx);

    // 3. Build ball info from BOM
    const ballInfoMap = await buildBallInfoMap(ctx);

    // 4. Aggregate for each menu product
    return await Promise.all(
      menuProducts.map(async (mp) => {
        const resetRecord =
          resetsMap.get(mp._id as unknown as string) ?? null;

        const counts = await aggregateForProduct(ctx, mp._id, resetRecord);

        const bomInfo = ballInfoMap.get(mp._id as unknown as string);
        const ballType: "big" | "mid" = bomInfo?.ballType ?? "mid";
        const ballCount: number = bomInfo?.ballCount ?? 0;

        return {
          menuProductId: mp._id,
          menuProductName: mp.name,
          menuProductCode: mp.code,
          posSlot: mp.posSlot,
          productType: mp.productType,
          ballType,
          ballCount,
          boxed: counts.boxed,
          stickered: counts.stickered,
          packed: counts.packed,
          shippedToGoldfinch: counts.shippedToGoldfinch,
          availableForStickering: counts.boxed - counts.stickered,
          availableForPacking: counts.stickered - counts.packed,
          lastResetAt: resetRecord?.lastResetAt,
          lastResetBy: resetRecord?.lastResetBy,
        };
      })
    );
  },
});

/**
 * Get aggregated production counts for a single menu product.
 * Replaces productionCounts.queries.getByMenuProduct.
 */
export const getCountsByMenuProduct = query({
  args: { menuProductId: v.id("menuProducts") },
  handler: async (ctx, args) => {
    // Get reset record for this product
    const resetRecord = await ctx.db
      .query("productionResets")
      .withIndex("by_menu_product", (q) =>
        q.eq("menuProductId", args.menuProductId)
      )
      .first();

    const counts = await aggregateForProduct(
      ctx,
      args.menuProductId,
      resetRecord
    );

    return {
      menuProductId: args.menuProductId,
      boxed: counts.boxed,
      stickered: counts.stickered,
      packed: counts.packed,
      shippedToGoldfinch: counts.shippedToGoldfinch,
      availableForStickering: counts.boxed - counts.stickered,
      availableForPacking: counts.stickered - counts.packed,
      lastResetAt: resetRecord?.lastResetAt,
      lastResetBy: resetRecord?.lastResetBy,
    };
  },
});
