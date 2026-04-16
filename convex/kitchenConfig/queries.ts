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
        defaultPackagingMix: [] as Array<{ menuProductId: Id<"menuProducts">; quantity: number }>,
        // null = all production components enabled (frontend resolves from componentTypes)
        enabledProductionComponents: null as string[] | null,
        // null = all kitchen components enabled
        enabledKitchenComponents: null as string[] | null,
        // No targets for non-BIG/MID ball codes yet
        otherBallTargets: [] as Array<{ code: string; target: number }>,
        // Unified component tracking — null means derive from legacy fields
        componentTracking: null as Array<{ code: string; tracked: boolean; unit: "g" | "pcs" }> | null,
        showJumbo: true,  // backward-compat default: show Jumbo
        updatedAt: null,
        updatedBy: null,
      };
    }

    // When enabledProductionComponents is set, derive showJumbo from it;
    // otherwise fall back to the legacy showJumbo field.
    const derivedShowJumbo = config.enabledProductionComponents
      ? config.enabledProductionComponents.includes("BIG_BALL")
      : (config.showJumbo ?? true);

    return {
      _id: config._id,
      maxProductionTarget: config.maxProductionTarget,
      bigBallTarget: config.bigBallTarget,
      midBallTarget: config.midBallTarget,
      defaultPackagingMix: config.defaultPackagingMix ?? [],
      // null = all enabled; array = explicit enabled list
      enabledProductionComponents: config.enabledProductionComponents ?? null,
      // null = all kitchen components enabled; normalize empty array to null
      enabledKitchenComponents:
        config.enabledKitchenComponents && config.enabledKitchenComponents.length > 0
          ? config.enabledKitchenComponents
          : null,
      otherBallTargets: config.otherBallTargets ?? [],
      // Unified component tracking — null means derive from legacy fields
      componentTracking: config.componentTracking ?? null,
      showJumbo: derivedShowJumbo,
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

      // If no packaging overrides set on the override document, fall through
      // to defaultPackagingMix so packaging breakdown badges stay visible on
      // the kitchen view while an override is active.
      if (packagingBreakdown.length === 0) {
        const config = await ctx.db.query("kitchenConfig").first();
        if (config?.defaultPackagingMix && config.defaultPackagingMix.length > 0) {
          packagingBreakdown = await resolvePackagingBreakdown(ctx, config.defaultPackagingMix);
        }
      }

      // Surface otherBallOverrides so per-day targets for non-BIG/MID codes
      // reach ProductionTargetsBar. Shape matches the defaults branch below.
      const otherBalls: Array<{ code: string; name: string; quantity: number }> = [];
      if (override.otherBallOverrides && override.otherBallOverrides.length > 0) {
        for (const entry of override.otherBallOverrides) {
          if (!entry.target || entry.target <= 0) continue;
          const ct = await ctx.db
            .query("componentTypes")
            .withIndex("by_code", (q) => q.eq("code", entry.code))
            .first();
          if (!ct || !ct.isActive || ct.category !== "production") continue;
          otherBalls.push({ code: entry.code, name: ct.name, quantity: entry.target });
        }
      }

      return {
        bigBalls,
        midBalls,
        otherBalls,
        packagingBreakdown,
        source: "override" as const,
        overrideSource: (override.source ?? "manual") as "manual" | "restock_planner",
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

      // BOM traversal: compute ball totals (by code) and packaging breakdown
      let bigBalls = 0;
      let midBalls = 0;
      // Aggregate any production `pcs` ball type other than BIG_BALL/MID_BALL
      // so e.g. HAZELNUT_REGULAR surfaces as its own target row.
      const otherBallsByCode = new Map<string, { code: string; name: string; quantity: number }>();
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

          // Accumulate ball totals by code (only pcs-unit ball types count)
          if (componentType.unit !== "pcs") continue;

          if (componentType.code === "BIG_BALL") {
            bigBalls += comp.quantity * plannedQty;
          } else if (componentType.code === "MID_BALL") {
            midBalls += comp.quantity * plannedQty;
          } else {
            const existing = otherBallsByCode.get(componentType.code);
            const addQty = comp.quantity * plannedQty;
            if (existing) {
              existing.quantity += addQty;
            } else {
              otherBallsByCode.set(componentType.code, {
                code: componentType.code,
                name: componentType.name,
                quantity: addQty,
              });
            }
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

      const packagingBreakdown = Array.from(packagingBreakdownMap.values());
      const otherBalls = Array.from(otherBallsByCode.values());

      if (packagingBreakdown.length > 0) {
        return {
          bigBalls,
          midBalls,
          otherBalls,
          packagingBreakdown,
          source: "dispatch_plan" as const,
        };
      }
      // packagingBreakdown empty after BOM traversal — fall through to defaults for packaging
      // but preserve ball totals from dispatch plan
      const config2 = await ctx.db.query("kitchenConfig").first();
      let defaultPackaging: Array<{ menuProductId: Id<"menuProducts">; name: string; quantity: number }> = [];
      if (config2?.defaultPackagingMix && config2.defaultPackagingMix.length > 0) {
        defaultPackaging = await resolvePackagingBreakdown(ctx, config2.defaultPackagingMix);
      }
      return {
        bigBalls,
        midBalls,
        otherBalls,
        packagingBreakdown: defaultPackaging,
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

    // Surface targets for non-BIG/MID ball codes saved in
    // kitchenConfig.otherBallTargets. Look up componentType names per code so
    // the ProductionTargetsBar StatCard shows a human-readable label.
    const otherBalls: Array<{ code: string; name: string; quantity: number }> = [];
    if (config?.otherBallTargets && config.otherBallTargets.length > 0) {
      for (const entry of config.otherBallTargets) {
        if (!entry.target || entry.target <= 0) continue;
        // Look up componentType by code to get display name
        const ct = await ctx.db
          .query("componentTypes")
          .withIndex("by_code", (q) => q.eq("code", entry.code))
          .first();
        if (!ct || !ct.isActive || ct.category !== "production") continue;
        otherBalls.push({ code: entry.code, name: ct.name, quantity: entry.target });
      }
    }

    return {
      bigBalls,
      midBalls,
      otherBalls,
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
