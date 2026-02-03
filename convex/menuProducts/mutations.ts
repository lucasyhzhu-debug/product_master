import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Create a new menu product.
 * Minimal required fields: name and defaultPrice.
 * Other fields have sensible defaults for quick creation from OrderForm.
 */
export const create = mutation({
  args: {
    code: v.optional(v.string()),
    name: v.string(),
    grams: v.optional(v.number()),
    defaultPrice: v.number(),
    productionType: v.optional(v.string()),
    productionUnits: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Generate code from name if not provided
    const code = args.code ?? `CUSTOM_${args.name.toUpperCase().replace(/\s+/g, '_').slice(0, 20)}`;

    // Check for duplicate code
    const existing = await ctx.db
      .query("menuProducts")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();

    if (existing) {
      // If code already exists, return the existing product's ID
      return existing._id;
    }

    const id = await ctx.db.insert("menuProducts", {
      code,
      name: args.name,
      grams: args.grams ?? 0,
      defaultPrice: args.defaultPrice,
      productionType: args.productionType ?? "original",
      productionUnits: args.productionUnits ?? 1,
      isActive: args.isActive ?? true,
    });

    return id;
  },
});

/**
 * Update an existing menu product.
 */
export const update = mutation({
  args: {
    id: v.id("menuProducts"),
    code: v.optional(v.string()),
    name: v.optional(v.string()),
    grams: v.optional(v.number()),
    defaultPrice: v.optional(v.number()),
    productionType: v.optional(v.string()),
    productionUnits: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    const current = await ctx.db.get(id);
    if (!current) {
      throw new Error("Menu product not found");
    }

    // Check for duplicate code if updating code
    if (updates.code !== undefined && updates.code !== current.code) {
      const newCode = updates.code; // TypeScript narrowing
      const existing = await ctx.db
        .query("menuProducts")
        .withIndex("by_code", (q) => q.eq("code", newCode))
        .first();

      if (existing) {
        throw new Error(`Menu product with code "${newCode}" already exists`);
      }
    }

    // Only include defined updates
    const patchData: Record<string, unknown> = {};
    if (updates.code !== undefined) patchData.code = updates.code;
    if (updates.name !== undefined) patchData.name = updates.name;
    if (updates.grams !== undefined) patchData.grams = updates.grams;
    if (updates.defaultPrice !== undefined) patchData.defaultPrice = updates.defaultPrice;
    if (updates.productionType !== undefined) patchData.productionType = updates.productionType;
    if (updates.productionUnits !== undefined) patchData.productionUnits = updates.productionUnits;
    if (updates.isActive !== undefined) patchData.isActive = updates.isActive;

    await ctx.db.patch(id, patchData);
    return id;
  },
});

/**
 * Delete a menu product.
 * PRD-0: Fixed products cannot be deleted.
 */
export const remove = mutation({
  args: { id: v.id("menuProducts") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.id);
    if (!product) {
      throw new Error("Menu product not found");
    }

    // PRD-0: Block deletion of fixed products
    if (product.isFixed) {
      throw new Error("Cannot delete fixed product. This is a core menu item.");
    }

    await ctx.db.delete(args.id);
    return true;
  },
});

/**
 * Toggle active status of a menu product.
 */
export const toggleActive = mutation({
  args: { id: v.id("menuProducts") },
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.id);
    if (!current) {
      throw new Error("Menu product not found");
    }

    await ctx.db.patch(args.id, { isActive: !current.isActive });
    return !current.isActive;
  },
});

/**
 * PRD-0: Seed fixed products with COGS values.
 * Run from Convex dashboard Functions tab: menuProducts:seedFixedProducts
 *
 * Fixed Products:
 * - ORIGINAL: 80g, Rp 50,000, COGS Rp 19,231
 * - BITE_SINGLE: 45g, Rp 35,000, COGS Rp 12,422
 * - BITE_DOUBLE: 90g (2x45g), Rp 70,000, COGS Rp 24,843
 * - BITE_TRIPLE: 135g (3x45g), Rp 99,000, COGS Rp 36,765
 */
export const seedFixedProducts = mutation({
  args: {},
  handler: async (ctx) => {
    const fixedProducts = [
      {
        code: "ORIGINAL",
        name: "Original",
        grams: 80,
        defaultPrice: 50000,
        productionType: "original",
        productionUnits: 1,
        unitCost: 19231,
        isFixed: true,
        isActive: true,
      },
      {
        code: "BITE_SINGLE",
        name: "Bite Sized Single",
        grams: 45,
        defaultPrice: 35000,
        productionType: "bite_sized",
        productionUnits: 1,
        unitCost: 12422,
        isFixed: true,
        isActive: true,
      },
      {
        code: "BITE_DOUBLE",
        name: "Bite Sized Double",
        grams: 90,
        defaultPrice: 70000,
        productionType: "bite_sized",
        productionUnits: 2,
        unitCost: 24843,
        isFixed: true,
        isActive: true,
      },
      {
        code: "BITE_TRIPLE",
        name: "Bite Sized Triple",
        grams: 135,
        defaultPrice: 99000,
        productionType: "bite_sized",
        productionUnits: 3,
        unitCost: 36765,
        isFixed: true,
        isActive: true,
      },
    ];

    const results = [];

    for (const product of fixedProducts) {
      // Check if product already exists by code
      const existing = await ctx.db
        .query("menuProducts")
        .withIndex("by_code", (q) => q.eq("code", product.code))
        .first();

      if (existing) {
        // Update existing product with new fields
        await ctx.db.patch(existing._id, {
          unitCost: product.unitCost,
          isFixed: product.isFixed,
          grams: product.grams,
          defaultPrice: product.defaultPrice,
          productionType: product.productionType,
          productionUnits: product.productionUnits,
        });
        results.push({ code: product.code, action: "updated", id: existing._id });
      } else {
        // Create new product
        const id = await ctx.db.insert("menuProducts", product);
        results.push({ code: product.code, action: "created", id });
      }
    }

    return results;
  },
});

/**
 * PRD-8: Assign a product to a POS slot (1-4).
 * Atomically swaps slot occupants - if slot is occupied, the current product
 * is removed from that slot (posSlot set to undefined).
 *
 * Business rules:
 * - Only one product per slot (unique constraint enforced)
 * - If target slot occupied → current occupant moved to legacy (posSlot = undefined)
 * - If product already has a different slot → old slot freed
 */
export const assignToSlot = mutation({
  args: {
    id: v.id("menuProducts"),
    slot: v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4)),
  },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.id);
    if (!product) {
      throw new Error("Menu product not found");
    }

    // Check if target slot is occupied by a different product
    const allProducts = await ctx.db.query("menuProducts").collect();
    const occupant = allProducts.find(
      (p) => p.posSlot === args.slot && p._id !== args.id
    );

    // Atomic swap: if slot occupied, remove occupant from slot
    if (occupant) {
      await ctx.db.patch(occupant._id, { posSlot: undefined });
    }

    // Assign product to slot
    await ctx.db.patch(args.id, { posSlot: args.slot });

    return args.id;
  },
});

/**
 * PRD-8: Remove a product from POS (set posSlot to undefined).
 * Moves product to legacy section.
 */
export const removeFromSlot = mutation({
  args: { id: v.id("menuProducts") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.id);
    if (!product) {
      throw new Error("Menu product not found");
    }

    await ctx.db.patch(args.id, { posSlot: undefined });
    return args.id;
  },
});

/**
 * PRD-8: Migration - Set initial posSlot for existing fixed products.
 * Run from Convex dashboard Functions tab: menuProducts:migrateFixedProductsToSlots
 *
 * Migration mapping:
 * - ORIGINAL → posSlot: 1
 * - BITE_SINGLE → posSlot: 2
 * - BITE_DOUBLE → posSlot: 3
 * - BITE_TRIPLE → posSlot: 4
 *
 * Safe to run multiple times (idempotent).
 */
export const migrateFixedProductsToSlots = mutation({
  args: {},
  handler: async (ctx) => {
    const slotMapping: Array<{
      code: string;
      slot: 1 | 2 | 3 | 4;
    }> = [
      { code: "ORIGINAL", slot: 1 },
      { code: "BITE_SINGLE", slot: 2 },
      { code: "BITE_DOUBLE", slot: 3 },
      { code: "BITE_TRIPLE", slot: 4 },
    ];

    const results = [];

    for (const mapping of slotMapping) {
      const product = await ctx.db
        .query("menuProducts")
        .withIndex("by_code", (q) => q.eq("code", mapping.code))
        .first();

      if (product) {
        // Only update if posSlot is not already set
        if (product.posSlot === undefined) {
          await ctx.db.patch(product._id, { posSlot: mapping.slot });
          results.push({
            code: mapping.code,
            slot: mapping.slot,
            action: "assigned",
          });
        } else {
          results.push({
            code: mapping.code,
            slot: product.posSlot,
            action: "already_assigned",
          });
        }
      } else {
        results.push({
          code: mapping.code,
          slot: mapping.slot,
          action: "not_found",
        });
      }
    }

    return results;
  },
});
