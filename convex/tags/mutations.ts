import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Create a new tag.
 */
export const create = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // Check for duplicate name
    const existing = await ctx.db
      .query("tags")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (existing) {
      throw new Error(`Tag "${args.name}" already exists`);
    }

    const id = await ctx.db.insert("tags", {
      name: args.name,
    });

    return id;
  },
});

/**
 * Update an existing tag.
 */
export const update = mutation({
  args: {
    id: v.id("tags"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.id);
    if (!current) {
      throw new Error("Tag not found");
    }

    // Check for duplicate name (excluding current tag)
    const existing = await ctx.db
      .query("tags")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (existing && existing._id !== args.id) {
      throw new Error(`Tag "${args.name}" already exists`);
    }

    await ctx.db.patch(args.id, { name: args.name });
    return args.id;
  },
});

/**
 * Delete a tag.
 * Note: This will NOT automatically remove the tag from recipes/products/packaging.
 * In production, you may want to also clean up tagIds arrays.
 */
export const remove = mutation({
  args: { id: v.id("tags") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return true;
  },
});

/**
 * Seed default tags if they don't exist.
 */
export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const defaultTags = [
      "Dubai-Snack",
      "Extruded-Snack",
      "Sachet",
      "Pouch",
      "Box",
    ];

    const created: string[] = [];

    for (const tagName of defaultTags) {
      const existing = await ctx.db
        .query("tags")
        .withIndex("by_name", (q) => q.eq("name", tagName))
        .first();

      if (!existing) {
        await ctx.db.insert("tags", { name: tagName });
        created.push(tagName);
      }
    }

    return { created, message: `Created ${created.length} default tags` };
  },
});
