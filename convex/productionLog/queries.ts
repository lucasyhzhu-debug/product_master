import { query } from "../_generated/server";
import { v } from "convex/values";

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
        });
      }

      const summary = summaryMap.get(key)!;
      summary[entry.action] += entry.quantity;
    }

    return Array.from(summaryMap.values());
  },
});
