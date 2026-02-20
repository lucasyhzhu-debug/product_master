/**
 * Product Inventory Mutations
 *
 * Stock operations for finished goods inventory tracking.
 * Tracks boxes of menu products at storage locations.
 * All mutations include full audit logging to productInventoryTransactions.
 */

import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { requireRole } from "../lib/auth";

/**
 * Add stock — Kitchen/staff adds finished goods to a location.
 * Upserts productInventory row and logs the transaction.
 */
export const addStock = mutation({
  args: {
    token: v.string(),
    menuProductId: v.id("menuProducts"),
    locationId: v.id("storageLocations"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["kitchen", "order_staff", "manager", "admin"]);

    // Validate: quantity must be positive
    if (args.quantity <= 0) {
      throw new Error("Quantity must be greater than 0");
    }

    // Validate: menuProduct exists
    const menuProduct = await ctx.db.get(args.menuProductId);
    if (!menuProduct) {
      throw new Error("Menu product not found");
    }

    // Validate: location exists and is active
    const location = await ctx.db.get(args.locationId);
    if (!location) {
      throw new Error("Location not found");
    }
    if (!location.isActive) {
      throw new Error("Location is not active");
    }

    const now = Date.now();

    // Upsert productInventory row
    const existing = await ctx.db
      .query("productInventory")
      .withIndex("by_product_location", (q) =>
        q.eq("menuProductId", args.menuProductId).eq("locationId", args.locationId)
      )
      .first();

    const previousQuantity = existing?.quantity ?? 0;
    const newQuantity = previousQuantity + args.quantity;

    if (existing) {
      await ctx.db.patch(existing._id, {
        quantity: newQuantity,
        lastUpdated: now,
      });
    } else {
      await ctx.db.insert("productInventory", {
        menuProductId: args.menuProductId,
        locationId: args.locationId,
        quantity: newQuantity,
        lastUpdated: now,
      });
    }

    // Log transaction
    await ctx.db.insert("productInventoryTransactions", {
      menuProductId: args.menuProductId,
      locationId: args.locationId,
      transactionType: "add",
      quantity: args.quantity,
      previousQuantity,
      newQuantity,
      performedBy: user.name,
      createdAt: now,
    });

    return { newQuantity };
  },
});

/**
 * Adjust stock — Manager adjustment (spoilage, correction, transfer).
 * quantity can be positive (add) or negative (subtract).
 * Manager override: allows stock to go negative.
 */
export const adjustStock = mutation({
  args: {
    token: v.string(),
    menuProductId: v.id("menuProducts"),
    locationId: v.id("storageLocations"),
    quantity: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);

    // Validate: reason must be non-empty
    if (!args.reason || args.reason.trim().length === 0) {
      throw new Error("Reason is required for stock adjustment");
    }

    // Validate: menuProduct exists
    const menuProduct = await ctx.db.get(args.menuProductId);
    if (!menuProduct) {
      throw new Error("Menu product not found");
    }

    // Validate: location exists
    const location = await ctx.db.get(args.locationId);
    if (!location) {
      throw new Error("Location not found");
    }

    const now = Date.now();

    // Upsert productInventory row
    const existing = await ctx.db
      .query("productInventory")
      .withIndex("by_product_location", (q) =>
        q.eq("menuProductId", args.menuProductId).eq("locationId", args.locationId)
      )
      .first();

    const previousQuantity = existing?.quantity ?? 0;
    const newQuantity = previousQuantity + args.quantity;

    // Build reason — note if going negative (manager override)
    const effectiveReason =
      newQuantity < 0
        ? `${args.reason} [Manager override: stock went negative]`
        : args.reason;

    if (existing) {
      await ctx.db.patch(existing._id, {
        quantity: newQuantity,
        lastUpdated: now,
      });
    } else {
      await ctx.db.insert("productInventory", {
        menuProductId: args.menuProductId,
        locationId: args.locationId,
        quantity: newQuantity,
        lastUpdated: now,
      });
    }

    // Log transaction
    await ctx.db.insert("productInventoryTransactions", {
      menuProductId: args.menuProductId,
      locationId: args.locationId,
      transactionType: "adjust",
      quantity: args.quantity,
      previousQuantity,
      newQuantity,
      reason: effectiveReason,
      performedBy: user.name,
      createdAt: now,
    });

    return { newQuantity };
  },
});

/**
 * Initialize settings — Creates the settings row if none exists.
 * Internal-only: call from seed mutation or cron.
 */
export const initializeSettings = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("productInventorySettings").first();
    if (existing) {
      return existing;
    }

    const id = await ctx.db.insert("productInventorySettings", {
      globalLowStockThreshold: 5,
      autoAdvanceOnDrawdown: true,
      alertMode: "toast",
      updatedBy: "system",
      updatedAt: Date.now(),
    });

    return await ctx.db.get(id);
  },
});

/**
 * Update settings — Admin-only config update.
 */
export const updateSettings = mutation({
  args: {
    token: v.string(),
    globalLowStockThreshold: v.optional(v.number()),
    defaultAddLocationId: v.optional(v.id("storageLocations")),
    autoAdvanceOnDrawdown: v.optional(v.boolean()),
    alertMode: v.optional(v.union(v.literal("toast"), v.literal("toast_and_badge"))),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin"]);

    const now = Date.now();
    const existing = await ctx.db.query("productInventorySettings").first();

    const patch: Record<string, unknown> = {
      updatedBy: user.name,
      updatedAt: now,
    };

    if (args.globalLowStockThreshold !== undefined) {
      patch.globalLowStockThreshold = args.globalLowStockThreshold;
    }
    if (args.defaultAddLocationId !== undefined) {
      patch.defaultAddLocationId = args.defaultAddLocationId;
    }
    if (args.autoAdvanceOnDrawdown !== undefined) {
      patch.autoAdvanceOnDrawdown = args.autoAdvanceOnDrawdown;
    }
    if (args.alertMode !== undefined) {
      patch.alertMode = args.alertMode;
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    } else {
      // Create with defaults then patch
      const id = await ctx.db.insert("productInventorySettings", {
        globalLowStockThreshold: (args.globalLowStockThreshold as number) ?? 5,
        autoAdvanceOnDrawdown: (args.autoAdvanceOnDrawdown as boolean) ?? true,
        alertMode: (args.alertMode as "toast" | "toast_and_badge") ?? "toast",
        updatedBy: user.name,
        updatedAt: now,
        ...(args.defaultAddLocationId !== undefined && {
          defaultAddLocationId: args.defaultAddLocationId,
        }),
      });
      return id;
    }
  },
});
