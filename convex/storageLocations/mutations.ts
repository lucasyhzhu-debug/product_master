/**
 * Storage Locations Mutations
 *
 * CRUD operations for storage locations.
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Create a new storage location
 */
export const create = mutation({
  args: {
    name: v.string(),
    locationType: v.union(
      v.literal("office"),
      v.literal("kitchen"),
      v.literal("venue")
    ),
    address: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    isDefault: v.optional(v.boolean()),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate: name must be unique
    const existingName = await ctx.db
      .query("storageLocations")
      .filter((q) => q.eq(q.field("name"), args.name))
      .first();

    if (existingName) {
      throw new Error(`Location "${args.name}" already exists`);
    }

    // If setting as default, unset existing default
    if (args.isDefault) {
      const currentDefault = await ctx.db
        .query("storageLocations")
        .filter((q) => q.eq(q.field("isDefault"), true))
        .first();

      if (currentDefault) {
        await ctx.db.patch(currentDefault._id, { isDefault: false });
      }
    }

    const locationId = await ctx.db.insert("storageLocations", {
      name: args.name,
      locationType: args.locationType,
      address: args.address,
      isActive: args.isActive ?? true,
      isDefault: args.isDefault ?? false,
      createdBy: args.createdBy,
      createdAt: Date.now(),
    });

    return locationId;
  },
});

/**
 * Update an existing storage location
 */
export const update = mutation({
  args: {
    id: v.id("storageLocations"),
    name: v.optional(v.string()),
    locationType: v.optional(
      v.union(v.literal("office"), v.literal("kitchen"), v.literal("venue"))
    ),
    address: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const location = await ctx.db.get(args.id);
    if (!location) {
      throw new Error("Location not found");
    }

    // Validate: name must be unique (if changing name)
    if (args.name && args.name !== location.name) {
      const existingName = await ctx.db
        .query("storageLocations")
        .filter((q) => q.eq(q.field("name"), args.name))
        .first();

      if (existingName) {
        throw new Error(`Location "${args.name}" already exists`);
      }
    }

    // If setting as default, unset existing default
    if (args.isDefault && !location.isDefault) {
      const currentDefault = await ctx.db
        .query("storageLocations")
        .filter((q) => q.eq(q.field("isDefault"), true))
        .first();

      if (currentDefault) {
        await ctx.db.patch(currentDefault._id, { isDefault: false });
      }
    }

    await ctx.db.patch(args.id, {
      ...(args.name !== undefined && { name: args.name }),
      ...(args.locationType !== undefined && { locationType: args.locationType }),
      ...(args.address !== undefined && { address: args.address }),
      ...(args.isActive !== undefined && { isActive: args.isActive }),
      ...(args.isDefault !== undefined && { isDefault: args.isDefault }),
    });

    return args.id;
  },
});

/**
 * Delete a storage location (with dependency checking)
 */
export const remove = mutation({
  args: {
    id: v.id("storageLocations"),
  },
  handler: async (ctx, args) => {
    const location = await ctx.db.get(args.id);
    if (!location) {
      throw new Error("Location not found");
    }

    // Check for stock at this location
    const stock = await ctx.db
      .query("componentStock")
      .withIndex("by_location", (q) => q.eq("locationId", args.id))
      .first();

    if (stock && stock.totalStock > 0) {
      throw new Error(
        `Cannot delete location: ${stock.totalStock} units of stock present. Move or adjust stock first.`
      );
    }

    // Check for active batches at this location
    const batches = await ctx.db
      .query("inventoryBatches")
      .withIndex("by_location", (q) => q.eq("locationId", args.id))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (batches) {
      throw new Error(
        "Cannot delete location: active inventory batches present. Deplete or transfer batches first."
      );
    }

    await ctx.db.delete(args.id);

    return true;
  },
});
