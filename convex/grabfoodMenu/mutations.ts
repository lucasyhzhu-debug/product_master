import { v } from "convex/values";
import { mutation, internalMutation } from "../_generated/server";
import { requireRole } from "../lib/auth";

// ============================================
// GrabFood Menu Simulator - Mutations
// ============================================

/**
 * Generate a file upload URL for menu item photos.
 * Protected: admin only.
 */
export const generateUploadUrl = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Save a photo to a grabfoodMenuItems record and write back to the linked menuProduct.
 * Protected: admin only.
 */
export const savePhoto = mutation({
  args: {
    token: v.string(),
    menuItemId: v.id("grabfoodMenuItems"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const item = await ctx.db.get(args.menuItemId);
    if (!item) throw new Error("Menu item not found");

    // Update grabfoodMenuItems with photo
    await ctx.db.patch(args.menuItemId, {
      photoStorageId: args.storageId,
      updatedAt: Date.now(),
    });

    // Write back to menuProducts (if it exists)
    const menuProduct = await ctx.db.get(item.menuProductId);
    if (menuProduct) {
      await ctx.db.patch(item.menuProductId, {
        photoStorageId: args.storageId,
      });
    }
  },
});

/**
 * Create a new GrabFood menu item linked to a menuProduct.
 * One-to-one mapping enforced (no duplicate menuProductId).
 * Protected: admin only.
 */
export const createItem = mutation({
  args: {
    token: v.string(),
    menuProductId: v.id("menuProducts"),
    grabfoodName: v.string(),
    grabfoodDescription: v.optional(v.string()),
    grabfoodPrice: v.number(),
    grabfoodItemId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    // Validate no duplicate menuProductId (one-to-one mapping)
    const existing = await ctx.db
      .query("grabfoodMenuItems")
      .withIndex("by_menu_product", (q) => q.eq("menuProductId", args.menuProductId))
      .first();
    if (existing) {
      throw new Error("A GrabFood menu item already exists for this menu product");
    }

    // Get max sequence
    const allItems = await ctx.db
      .query("grabfoodMenuItems")
      .withIndex("by_sequence")
      .collect();
    const maxSequence = allItems.length > 0
      ? Math.max(...allItems.map((i) => i.sequence))
      : 0;

    const now = Date.now();
    return await ctx.db.insert("grabfoodMenuItems", {
      menuProductId: args.menuProductId,
      grabfoodItemId: args.grabfoodItemId,
      grabfoodName: args.grabfoodName,
      grabfoodDescription: args.grabfoodDescription,
      grabfoodPrice: args.grabfoodPrice,
      isAvailable: true,
      sequence: maxSequence + 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update fields on an existing GrabFood menu item.
 * Only patches provided fields + updatedAt.
 * Protected: admin only.
 */
export const updateItem = mutation({
  args: {
    token: v.string(),
    menuItemId: v.id("grabfoodMenuItems"),
    fields: v.object({
      grabfoodName: v.optional(v.string()),
      grabfoodDescription: v.optional(v.string()),
      grabfoodPrice: v.optional(v.number()),
      isAvailable: v.optional(v.boolean()),
      grabfoodItemId: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const item = await ctx.db.get(args.menuItemId);
    if (!item) throw new Error("Menu item not found");

    // Build patch from provided fields only
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.fields.grabfoodName !== undefined) patch.grabfoodName = args.fields.grabfoodName;
    if (args.fields.grabfoodDescription !== undefined) patch.grabfoodDescription = args.fields.grabfoodDescription;
    if (args.fields.grabfoodPrice !== undefined) patch.grabfoodPrice = args.fields.grabfoodPrice;
    if (args.fields.isAvailable !== undefined) patch.isAvailable = args.fields.isAvailable;
    if (args.fields.grabfoodItemId !== undefined) patch.grabfoodItemId = args.fields.grabfoodItemId;

    await ctx.db.patch(args.menuItemId, patch);
  },
});

/**
 * Delete a GrabFood menu item.
 * Does NOT delete the linked menuProduct or externalProductMapping.
 * Protected: admin only.
 */
export const deleteItem = mutation({
  args: {
    token: v.string(),
    menuItemId: v.id("grabfoodMenuItems"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const item = await ctx.db.get(args.menuItemId);
    if (!item) throw new Error("Menu item not found");

    await ctx.db.delete(args.menuItemId);
  },
});

/**
 * Reorder GrabFood menu items by setting sequence from array index.
 * Protected: admin only.
 */
export const reorderItems = mutation({
  args: {
    token: v.string(),
    orderedIds: v.array(v.id("grabfoodMenuItems")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const now = Date.now();
    for (let i = 0; i < args.orderedIds.length; i++) {
      await ctx.db.patch(args.orderedIds[i], {
        sequence: i + 1,
        updatedAt: now,
      });
    }
  },
});

/**
 * Populate grabfoodMenuItems from existing externalProductMappings (source: "grabfood").
 * Only creates items for mappings that don't already have a corresponding grabfoodMenuItems record.
 * Protected: admin only.
 */
export const populateFromMappings = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    // Get all GrabFood product mappings
    const mappings = await ctx.db
      .query("externalProductMappings")
      .withIndex("by_source_code", (q) => q.eq("source", "grabfood"))
      .collect();

    const now = Date.now();
    let created = 0;

    for (let i = 0; i < mappings.length; i++) {
      const mapping = mappings[i];

      // Skip if no menuProductId linked
      if (!mapping.menuProductId) continue;

      // Check if already exists
      const existing = await ctx.db
        .query("grabfoodMenuItems")
        .withIndex("by_menu_product", (q) => q.eq("menuProductId", mapping.menuProductId!))
        .first();
      if (existing) continue;

      // Resolve default price from menuProduct
      let defaultPrice = 0;
      if (mapping.menuProductId) {
        const menuProduct = await ctx.db.get(mapping.menuProductId);
        defaultPrice = menuProduct?.defaultPrice ?? 0;
      }

      await ctx.db.insert("grabfoodMenuItems", {
        menuProductId: mapping.menuProductId,
        grabfoodItemId: mapping.externalProductCode,
        grabfoodName: mapping.externalProductName,
        grabfoodPrice: mapping.grabfoodPrice ?? defaultPrice,
        isAvailable: mapping.isAvailable ?? true,
        sequence: i + 1,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }

    return { created };
  },
});

/**
 * Internal mutation to update push state on menu items after a successful push.
 * Called from the pushMenuChanges action.
 */
export const updatePushState = internalMutation({
  args: {
    updates: v.array(
      v.object({
        menuItemId: v.id("grabfoodMenuItems"),
        lastPushedPrice: v.optional(v.number()),
        lastPushedAvailability: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const update of args.updates) {
      const patch: Record<string, unknown> = { lastPushedAt: now };
      if (update.lastPushedPrice !== undefined) patch.lastPushedPrice = update.lastPushedPrice;
      if (update.lastPushedAvailability !== undefined) patch.lastPushedAvailability = update.lastPushedAvailability;
      await ctx.db.patch(update.menuItemId, patch);
    }
  },
});
