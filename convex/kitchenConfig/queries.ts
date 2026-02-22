import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

/**
 * Kitchen configuration defaults.
 * Used when no config row exists yet (first-time setup).
 */
const DEFAULTS = {
  maxProductionTarget: 200,
  bigBallTarget: 0,
  midBallTarget: 200,
} as const;

/**
 * Get the current kitchen configuration.
 * Returns defaults if no config row exists yet.
 * No auth required -- kitchen staff need to read this.
 */
export const getConfig = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db.query("kitchenConfig").first();

    if (!config) {
      return {
        _id: null,
        maxProductionTarget: DEFAULTS.maxProductionTarget,
        bigBallTarget: DEFAULTS.bigBallTarget,
        midBallTarget: DEFAULTS.midBallTarget,
        updatedAt: null,
        updatedBy: null,
      };
    }

    return {
      _id: config._id,
      maxProductionTarget: config.maxProductionTarget,
      bigBallTarget: config.bigBallTarget,
      midBallTarget: config.midBallTarget,
      updatedAt: config.updatedAt,
      updatedBy: config.updatedBy,
    };
  },
});

/**
 * Get kitchen production targets for a specific date.
 *
 * Priority chain (highest to lowest):
 *   1. kitchenDailyOverrides — manager-set per-day override
 *   2. dispatchPlans — computed from BOM traversal across all plan entries for date
 *   3. kitchenConfig defaults — bigBallTarget / midBallTarget / defaultPackagingMix
 *
 * Returns ball totals + packaging breakdown per menu product, plus the source.
 * No auth required — kitchen staff need to read this.
 */
export const getKitchenTargetsForDate = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    // ------------------------------------------------
    // PRIORITY 1: Per-day override
    // ------------------------------------------------
    const override = await ctx.db
      .query("kitchenDailyOverrides")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .first();

    if (override) {
      const bigBalls = override.bigBallOverride ?? 0;
      const midBalls = override.midBallOverride ?? 0;

      // Build packaging breakdown: use packagingOverrides if set, otherwise derive from ball totals via BOM
      let packagingBreakdown: Array<{ menuProductId: Id<"menuProducts">; name: string; quantity: number }> = [];

      if (override.packagingOverrides && override.packagingOverrides.length > 0) {
        // Explicit override packaging list — just look up names
        packagingBreakdown = await resolvePackagingBreakdown(ctx, override.packagingOverrides);
      }
      // If no packaging overrides set, return empty breakdown (caller can fall through to plan)

      return {
        bigBalls,
        midBalls,
        packagingBreakdown,
        source: "override" as const,
      };
    }

    // ------------------------------------------------
    // PRIORITY 2: Dispatch plan BOM traversal
    // ------------------------------------------------
    const planEntries = await ctx.db
      .query("dispatchPlans")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect();

    if (planEntries.length > 0) {
      // Sum plannedQty per menuProductId across all channels
      const productQtyMap = new Map<string, number>();
      for (const entry of planEntries) {
        const key = entry.menuProductId;
        productQtyMap.set(key, (productQtyMap.get(key) ?? 0) + entry.plannedQty);
      }

      // BOM traversal: compute ball totals and packaging breakdown
      let bigBalls = 0;
      let midBalls = 0;
      const packagingBreakdownMap = new Map<string, { menuProductId: Id<"menuProducts">; name: string; quantity: number }>();

      for (const [menuProductIdStr, plannedQty] of productQtyMap) {
        const menuProductId = menuProductIdStr as Id<"menuProducts">;

        // Look up components for this menu product
        const components = await ctx.db
          .query("menuProductComponents")
          .withIndex("by_menu_product", (q) => q.eq("menuProductId", menuProductId))
          .collect();

        for (const comp of components) {
          const componentType = await ctx.db.get(comp.componentTypeId);
          if (!componentType || componentType.category !== "production") continue;

          // Accumulate ball totals by code
          if (componentType.code === "BIG_BALL") {
            bigBalls += comp.quantity * plannedQty;
          } else if (componentType.code === "MID_BALL") {
            midBalls += comp.quantity * plannedQty;
          }
        }

        // Build packaging breakdown: all menu products contribute to packaging list
        // (packaging-only products have zero balls but appear in the list)
        const menuProduct = await ctx.db.get(menuProductId);
        if (menuProduct) {
          packagingBreakdownMap.set(menuProductIdStr, {
            menuProductId,
            name: menuProduct.name,
            quantity: plannedQty,
          });
        }
      }

      return {
        bigBalls,
        midBalls,
        packagingBreakdown: Array.from(packagingBreakdownMap.values()),
        source: "dispatch_plan" as const,
      };
    }

    // ------------------------------------------------
    // PRIORITY 3: kitchenConfig defaults
    // ------------------------------------------------
    const config = await ctx.db.query("kitchenConfig").first();

    const bigBalls = config?.bigBallTarget ?? DEFAULTS.bigBallTarget;
    const midBalls = config?.midBallTarget ?? DEFAULTS.midBallTarget;

    let packagingBreakdown: Array<{ menuProductId: Id<"menuProducts">; name: string; quantity: number }> = [];
    if (config?.defaultPackagingMix && config.defaultPackagingMix.length > 0) {
      packagingBreakdown = await resolvePackagingBreakdown(ctx, config.defaultPackagingMix);
    }

    return {
      bigBalls,
      midBalls,
      packagingBreakdown,
      source: "defaults" as const,
    };
  },
});

// ------------------------------------------------
// Helper: resolve packaging breakdown with names
// ------------------------------------------------
async function resolvePackagingBreakdown(
  ctx: { db: { get: (id: Id<"menuProducts">) => Promise<{ name: string } | null> } },
  items: Array<{ menuProductId: Id<"menuProducts">; quantity: number }>
): Promise<Array<{ menuProductId: Id<"menuProducts">; name: string; quantity: number }>> {
  const results: Array<{ menuProductId: Id<"menuProducts">; name: string; quantity: number }> = [];
  for (const item of items) {
    const menuProduct = await ctx.db.get(item.menuProductId);
    if (menuProduct) {
      results.push({
        menuProductId: item.menuProductId,
        name: menuProduct.name,
        quantity: item.quantity,
      });
    }
  }
  return results;
}
