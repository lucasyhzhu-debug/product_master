/**
 * Component Types Queries
 *
 * Queries for unified component types (production + packaging).
 */

import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * List all component types
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

    // Sort by sortOrder, then by name
    return components.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.name.localeCompare(b.name);
    });
  },
});

/**
 * Get component type by ID
 */
export const getById = query({
  args: {
    id: v.id("componentTypes"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * List components by category
 */
export const getByCategory = query({
  args: {
    category: v.union(
      v.literal("production"),
      v.literal("direct_packaging"),
      v.literal("indirect_packaging")
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

    // Sort by sortOrder, then by name
    return components.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.name.localeCompare(b.name);
    });
  },
});

/**
 * Get components that track inventory (packaging only)
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

    // Sort by sortOrder, then by name
    return components.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.name.localeCompare(b.name);
    });
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
