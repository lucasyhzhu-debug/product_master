import { mutation, type MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { requireRole } from "../lib/auth";
import { calculateMenuProductCOGS } from "../lib/costCalculator";

/**
 * Helper: Calculate unit cost and grams from components.
 * Fetches productionUnitTypes and sums: unitCostIdr * quantity for each component.
 */
async function calculateUnitCostFromComponents(
  ctx: MutationCtx,
  components: Array<{ productionUnitTypeId: Id<"productionUnitTypes">; quantity: number }>
): Promise<{ totalCost: number; totalGrams: number }> {
  let totalCost = 0;
  let totalGrams = 0;

  for (const component of components) {
    const unitType = await ctx.db.get(component.productionUnitTypeId);
    if (!unitType) {
      throw new Error(`Production unit type not found: ${component.productionUnitTypeId}`);
    }

    totalCost += unitType.unitCostIdr * component.quantity;
    totalGrams += unitType.gramsPerUnit * component.quantity;
  }

  return { totalCost, totalGrams };
}

/**
 * Helper: Calculate unit cost and grams from componentTypes (Unified BOM).
 *
 * This is the enhanced version that works with the new inventory system.
 * Currently NOT USED because schema migration is pending (Wave 1).
 * Once menuProductComponents.componentTypeId FK is migrated, replace
 * calculateUnitCostFromComponents with this function.
 *
 * @param ctx - Mutation context
 * @param components - Array of { componentTypeId, quantity }
 * @returns { totalCost, totalGrams, breakdown }
 */
async function calculateUnitCostFromComponentTypes(
  ctx: MutationCtx,
  components: Array<{ componentTypeId: Id<"componentTypes">; quantity: number }>
): Promise<{
  totalCost: number;
  totalGrams: number;
  breakdown: {
    production: number;
    directPackaging: number;
    indirectPackaging: number;
  };
}> {
  // Fetch all component types and build input for COGS calculator
  const enrichedComponents = await Promise.all(
    components.map(async (component) => {
      const componentType = await ctx.db.get(component.componentTypeId);
      if (!componentType) {
        throw new Error(`Component type not found: ${component.componentTypeId}`);
      }

      return {
        unitCostIdr: componentType.unitCostIdr,
        category: componentType.category,
        quantity: component.quantity,
        gramsPerUnit: componentType.gramsPerUnit,
      };
    })
  );

  // Calculate COGS breakdown
  const cogsBreakdown = calculateMenuProductCOGS(enrichedComponents);

  // Calculate total grams (only from production components)
  const totalGrams = enrichedComponents
    .filter((c) => c.category === "production" && c.gramsPerUnit !== undefined)
    .reduce((sum, c) => sum + (c.gramsPerUnit ?? 0) * c.quantity, 0);

  return {
    totalCost: cogsBreakdown.total,
    totalGrams,
    breakdown: {
      production: cogsBreakdown.production,
      directPackaging: cogsBreakdown.directPackaging,
      indirectPackaging: cogsBreakdown.indirectPackaging,
    },
  };
}

/**
 * Helper: Update the cached production summary on a menu product.
 * Fetches all components and builds summary string like "1 Big Ball, 2 Mid Ball".
 *
 * TODO (Wave 4): After schema migration, update to include packaging in summary.
 * Example: "3 Mid Ball, 1 Long Box, 3 Wrapper"
 */
async function updateCachedProductionSummary(
  ctx: MutationCtx,
  menuProductId: Id<"menuProducts">
) {
  // Get all components for this menu product
  const components = await ctx.db
    .query("menuProductComponents")
    .withIndex("by_menu_product", (q) => q.eq("menuProductId", menuProductId))
    .collect();

  if (components.length === 0) {
    await ctx.db.patch(menuProductId, { cachedProductionSummary: undefined });
    return;
  }

  // Build summary string
  // TODO (Wave 4): Once schema migrated to componentTypeId, fetch componentTypes instead of productionUnitTypes
  const summaryParts = await Promise.all(
    components
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(async (component) => {
        const unitType = await ctx.db.get(component.productionUnitTypeId);
        const name = unitType?.name ?? "Unknown";
        return `${component.quantity} ${name}`;
      })
  );

  const summary = summaryParts.join(", ");
  await ctx.db.patch(menuProductId, { cachedProductionSummary: summary });
}

/**
 * Create a new menu product.
 * Minimal required fields: name and defaultPrice.
 * Other fields have sensible defaults for quick creation from OrderForm.
 *
 * PRD-4a: Auto-calculates unitCost and grams from components if provided.
 */
export const create = mutation({
  args: {
    token: v.string(),
    code: v.optional(v.string()),
    name: v.string(),
    grams: v.optional(v.number()),
    defaultPrice: v.number(),
    productionType: v.optional(v.string()),
    productionUnits: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    // PRD-4a: Components array for auto-calculation
    components: v.optional(
      v.array(
        v.object({
          productionUnitTypeId: v.id("productionUnitTypes"),
          quantity: v.number(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

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

    // PRD-4a: Auto-calculate unitCost and grams from components
    let unitCost: number | undefined = undefined;
    let grams = args.grams ?? 0;

    if (args.components && args.components.length > 0) {
      const calculated = await calculateUnitCostFromComponents(ctx, args.components);
      unitCost = calculated.totalCost;
      grams = calculated.totalGrams; // Override provided grams if components specified
    }

    const id = await ctx.db.insert("menuProducts", {
      code,
      name: args.name,
      grams,
      defaultPrice: args.defaultPrice,
      productionType: args.productionType ?? "original",
      productionUnits: args.productionUnits ?? 1,
      isActive: args.isActive ?? true,
      unitCost,
    });

    // PRD-4a: Set components if provided
    if (args.components && args.components.length > 0) {
      // Delete any existing components (shouldn't exist for new product, but safety check)
      const existingComponents = await ctx.db
        .query("menuProductComponents")
        .withIndex("by_menu_product", (q) => q.eq("menuProductId", id))
        .collect();

      for (const existing of existingComponents) {
        await ctx.db.delete(existing._id);
      }

      // Create new components
      for (let i = 0; i < args.components.length; i++) {
        const component = args.components[i];
        await ctx.db.insert("menuProductComponents", {
          menuProductId: id,
          productionUnitTypeId: component.productionUnitTypeId,
          quantity: component.quantity,
          sortOrder: i + 1,
        });
      }

      // Update cached production summary
      await updateCachedProductionSummary(ctx, id);
    }

    return id;
  },
});

/**
 * Update an existing menu product.
 * PRD-4a: Auto-calculates unitCost and grams from components if provided.
 */
export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("menuProducts"),
    code: v.optional(v.string()),
    name: v.optional(v.string()),
    grams: v.optional(v.number()),
    defaultPrice: v.optional(v.number()),
    productionType: v.optional(v.string()),
    productionUnits: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    // PRD-4a: Components array for auto-calculation
    components: v.optional(
      v.array(
        v.object({
          productionUnitTypeId: v.id("productionUnitTypes"),
          quantity: v.number(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    // Extract token and id from args to avoid passing them to db.patch
    const { id, token: _, components, ...updates } = args;
    void _; // Suppress unused variable warning

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

    // PRD-4a: Auto-calculate unitCost and grams from components if provided
    if (components !== undefined) {
      if (components.length > 0) {
        const calculated = await calculateUnitCostFromComponents(ctx, components);
        patchData.unitCost = calculated.totalCost;
        patchData.grams = calculated.totalGrams; // Override provided grams if components specified
      } else {
        // If components array is empty, clear unitCost and grams
        patchData.unitCost = undefined;
        patchData.grams = 0;
      }
    }

    await ctx.db.patch(id, patchData);

    // PRD-4a: Update components if provided
    if (components !== undefined) {
      // Delete existing components
      const existingComponents = await ctx.db
        .query("menuProductComponents")
        .withIndex("by_menu_product", (q) => q.eq("menuProductId", id))
        .collect();

      for (const existing of existingComponents) {
        await ctx.db.delete(existing._id);
      }

      // Create new components
      for (let i = 0; i < components.length; i++) {
        const component = components[i];
        await ctx.db.insert("menuProductComponents", {
          menuProductId: id,
          productionUnitTypeId: component.productionUnitTypeId,
          quantity: component.quantity,
          sortOrder: i + 1,
        });
      }

      // Update cached production summary
      await updateCachedProductionSummary(ctx, id);
    }

    return id;
  },
});

/**
 * Delete a menu product.
 * PRD-0: Fixed products cannot be deleted.
 */
export const remove = mutation({
  args: { token: v.string(), id: v.id("menuProducts") },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

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
  args: { token: v.string(), id: v.id("menuProducts") },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

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
    token: v.string(),
    id: v.id("menuProducts"),
    slot: v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4)),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

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
  args: { token: v.string(), id: v.id("menuProducts") },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

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
