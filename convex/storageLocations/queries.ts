/**
 * Storage Locations Queries
 *
 * Queries for warehouse/office/venue locations.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * List all storage locations
 */
export const list = query({
  args: {
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let locations;

    if (args.activeOnly) {
      locations = await ctx.db
        .query("storageLocations")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
    } else {
      locations = await ctx.db.query("storageLocations").collect();
    }

    // Sort by isDefault (default first), then by name
    return locations.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    });
  },
});

/**
 * Get location by ID
 */
export const getById = query({
  args: {
    id: v.id("storageLocations"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get default location
 */
export const getDefault = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("storageLocations")
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();
  },
});
