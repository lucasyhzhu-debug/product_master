/**
 * Production Counts Queries
 *
 * Queries for running production tallies per menu product.
 * Tracks boxed, stickered, and packed counts with derived availability.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get all production counts with derived availability fields.
 * Returns counts for all active menu products, defaulting to zero for products
 * that don't have a productionCounts record yet.
 *
 * Ball info (ballType, ballCount) is derived exclusively from the BOM
 * (menuProductComponents + componentTypes). Products without BOM entries
 * default to 0 ball count (they won't contribute to ball totals).
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const counts = await ctx.db.query("productionCounts").collect();

    // Get all active menu products to include uncreated products with zero defaults
    const menuProducts = await ctx.db
      .query("menuProducts")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const countMap = new Map(counts.map((c) => [c.menuProductId, c]));

    // Derive ball info from BOM (menuProductComponents + componentTypes)
    const allComponents = await ctx.db
      .query("menuProductComponents")
      .collect();

    // Pre-fetch unique component types
    const componentTypeIds = [
      ...new Set(allComponents.map((c) => c.componentTypeId)),
    ];
    const componentTypeMap = new Map<string, { code?: string; category?: string }>();
    for (const id of componentTypeIds) {
      const ct = await ctx.db.get(id);
      if (ct) componentTypeMap.set(id as unknown as string, ct);
    }

    // Build ball info per menu product from BOM
    const ballInfoMap = new Map<
      string,
      { ballType: "big" | "mid"; ballCount: number }
    >();
    for (const comp of allComponents) {
      const ct = componentTypeMap.get(
        comp.componentTypeId as unknown as string
      );
      if (!ct || ct.category !== "production") continue;

      let ballType: "big" | "mid" | null = null;
      if (ct.code === "BIG_BALL") ballType = "big";
      else if (ct.code === "MID_BALL") ballType = "mid";
      else continue;

      const mpId = comp.menuProductId as unknown as string;
      const existing = ballInfoMap.get(mpId);
      if (existing) {
        existing.ballCount += comp.quantity;
      } else {
        ballInfoMap.set(mpId, { ballType, ballCount: comp.quantity });
      }
    }

    return menuProducts.map((mp) => {
      const count = countMap.get(mp._id);
      const boxed = count?.boxed ?? 0;
      const stickered = count?.stickered ?? 0;
      const packed = count?.packed ?? 0;

      // Ball info from BOM only (menuProductComponents + componentTypes)
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
        boxed,
        stickered,
        packed,
        availableForStickering: boxed - stickered,
        availableForPacking: stickered - packed,
        lastResetAt: count?.lastResetAt,
        lastResetBy: count?.lastResetBy,
      };
    });
  },
});

/**
 * Get production counts for a specific menu product.
 * Returns counts with derived availability, defaulting to zero if no record exists.
 */
export const getByMenuProduct = query({
  args: { menuProductId: v.id("menuProducts") },
  handler: async (ctx, args) => {
    const count = await ctx.db
      .query("productionCounts")
      .withIndex("by_menu_product", (q) =>
        q.eq("menuProductId", args.menuProductId)
      )
      .first();

    const boxed = count?.boxed ?? 0;
    const stickered = count?.stickered ?? 0;
    const packed = count?.packed ?? 0;

    return {
      menuProductId: args.menuProductId,
      boxed,
      stickered,
      packed,
      availableForStickering: boxed - stickered,
      availableForPacking: stickered - packed,
      lastResetAt: count?.lastResetAt,
      lastResetBy: count?.lastResetBy,
    };
  },
});
