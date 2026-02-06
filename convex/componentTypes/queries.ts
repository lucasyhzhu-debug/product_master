/**
 * Component Types Queries
 *
 * Queries for unified component types (production + packaging).
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Sort comparator: by sortOrder ascending, then by name ascending.
 */
function sortBySortOrderThenName<T extends { sortOrder: number; name: string }>(
  a: T,
  b: T
): number {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder;
  }
  return a.name.localeCompare(b.name);
}

/**
 * Enrich components with cost insights from inventory batches.
 */
async function enrichWithCostInsights<T extends { _id: Id<"componentTypes">; trackInventory: boolean }>(
  ctx: QueryCtx,
  components: T[]
): Promise<(T & { costInsights: Awaited<ReturnType<typeof calculateCostInsights>> | undefined })[]> {
  return await Promise.all(
    components.map(async (component) => {
      if (component.trackInventory) {
        const costInsights = await calculateCostInsights(ctx, component._id);
        return { ...component, costInsights };
      }
      return { ...component, costInsights: undefined };
    })
  );
}

/**
 * Calculate cost insights from inventory batches (for packaging components)
 */
async function calculateCostInsights(
  ctx: QueryCtx,
  componentTypeId: Id<"componentTypes">
) {
  // Get all active batches for this component
  const batches = await ctx.db
    .query("inventoryBatches")
    .withIndex("by_component", (q) => q.eq("componentTypeId", componentTypeId))
    .filter((q) => q.eq(q.field("status"), "active"))
    .collect();

  if (batches.length === 0) {
    return {
      latestCost: null,
      lowestCost: null,
      weightedAverageCost: null,
      priceChangePercent: null,
    };
  }

  // Latest cost - most recent batch by purchase date
  const sortedByDate = [...batches].sort((a, b) => b.purchaseDate - a.purchaseDate);
  const latestCost = sortedByDate[0].unitCostIdr;

  // Price change % (latest vs previous batch)
  let priceChangePercent: number | null = null;
  if (sortedByDate.length >= 2) {
    const previousCost = sortedByDate[1].unitCostIdr;
    if (previousCost > 0) {
      priceChangePercent = ((latestCost - previousCost) / previousCost) * 100;
    }
  }

  // Lowest cost - cheapest batch currently active
  const lowestCost = Math.min(...batches.map((b) => b.unitCostIdr));

  // Weighted average cost - weighted by quantityRemaining
  const totalQuantity = batches.reduce((sum, b) => sum + b.quantityRemaining, 0);
  const weightedAverageCost =
    totalQuantity > 0
      ? batches.reduce(
          (sum, b) => sum + b.unitCostIdr * b.quantityRemaining,
          0
        ) / totalQuantity
      : null;

  return {
    latestCost,
    lowestCost,
    weightedAverageCost,
    priceChangePercent,
  };
}

/**
 * List all component types with cost insights for packaging
 */
export const list = query({
  args: {
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let components;

    if (args.activeOnly) {
      components = await ctx.db
        .query("componentTypes")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
    } else {
      components = await ctx.db.query("componentTypes").collect();
    }

    const componentsWithInsights = await enrichWithCostInsights(ctx, components);
    return componentsWithInsights.sort(sortBySortOrderThenName);
  },
});

/**
 * Get component type by ID with cost insights
 */
export const getById = query({
  args: {
    id: v.id("componentTypes"),
  },
  handler: async (ctx, args) => {
    const component = await ctx.db.get(args.id);
    if (!component) return null;

    // Add cost insights for packaging components
    if (component.trackInventory) {
      const costInsights = await calculateCostInsights(ctx, component._id);
      return { ...component, costInsights };
    }

    return { ...component, costInsights: undefined };
  },
});

/**
 * List components by category with cost insights
 */
export const getByCategory = query({
  args: {
    category: v.union(
      v.literal("production"),
      v.literal("packaging")
    ),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let components = await ctx.db
      .query("componentTypes")
      .withIndex("by_category", (q) => q.eq("category", args.category))
      .collect();

    if (args.activeOnly) {
      components = components.filter((c) => c.isActive);
    }

    const componentsWithInsights = await enrichWithCostInsights(ctx, components);
    return componentsWithInsights.sort(sortBySortOrderThenName);
  },
});

/**
 * Get components that track inventory (packaging only) with cost insights
 */
export const getInventoryTracked = query({
  args: {
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let components = await ctx.db
      .query("componentTypes")
      .withIndex("by_track_inventory", (q) => q.eq("trackInventory", true))
      .collect();

    if (args.activeOnly) {
      components = components.filter((c) => c.isActive);
    }

    const componentsWithInsights = await enrichWithCostInsights(ctx, components);
    return componentsWithInsights.sort(sortBySortOrderThenName);
  },
});

/**
 * Get component by code (for lookups)
 */
export const getByCode = query({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("componentTypes")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
  },
});
