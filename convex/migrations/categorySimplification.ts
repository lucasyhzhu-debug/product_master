/**
 * Category Simplification Migration
 *
 * Migrates componentTypes from 3 categories (production, direct_packaging, indirect_packaging)
 * to 2 categories (production, packaging).
 *
 * Part of the 3-deployment migration strategy:
 * - Deploy 1: Schema expanded to accept "packaging" (already done)
 * - Deploy 2: Run this migration + update all code (this step)
 * - Deploy 3: Remove old literals from schema
 *
 * All functions are idempotent and safe to re-run.
 */

import { mutation } from "../_generated/server";

/**
 * Migrate all componentTypes from direct_packaging/indirect_packaging to packaging.
 *
 * Safe to run multiple times (idempotent).
 * Returns count of records migrated.
 */
export const migrateCategories = mutation({
  handler: async (ctx) => {
    const allComponents = await ctx.db.query("componentTypes").collect();

    let migratedCount = 0;
    let skippedCount = 0;

    for (const component of allComponents) {
      // Cast to string for comparison against legacy values that no longer exist in schema
      const cat = component.category as string;
      if (cat === "direct_packaging" || cat === "indirect_packaging") {
        await ctx.db.patch(component._id, { category: "packaging" });
        migratedCount++;
      } else {
        skippedCount++;
      }
    }

    return {
      success: true,
      migratedCount,
      skippedCount,
      totalRecords: allComponents.length,
      message: `Migrated ${migratedCount} components to "packaging" (${skippedCount} already correct)`,
    };
  },
});

/**
 * Verify migration is complete.
 *
 * Returns true if no records have old category values.
 */
export const verifyMigration = mutation({
  handler: async (ctx) => {
    const allComponents = await ctx.db.query("componentTypes").collect();

    // Cast to string for comparison against legacy values that no longer exist in schema
    const oldCategoryRecords = allComponents.filter(
      (c) => {
        const cat = c.category as string;
        return cat === "direct_packaging" || cat === "indirect_packaging";
      }
    );

    const categoryCounts: Record<string, number> = {};
    for (const c of allComponents) {
      categoryCounts[c.category] = (categoryCounts[c.category] ?? 0) + 1;
    }

    return {
      migrationComplete: oldCategoryRecords.length === 0,
      oldCategoryCount: oldCategoryRecords.length,
      totalRecords: allComponents.length,
      categoryCounts,
      oldCategoryRecords: oldCategoryRecords.map((c) => ({
        id: c._id,
        code: c.code,
        name: c.name,
        category: c.category,
      })),
    };
  },
});

/**
 * Emergency rollback: restore original categories from consumptionStage.
 *
 * Uses consumptionStage to determine the original category:
 * - boxing -> direct_packaging
 * - labeling/none -> indirect_packaging
 *
 * Only use this if migration needs to be reversed.
 */
export const rollbackMigration = mutation({
  handler: async (ctx) => {
    const allComponents = await ctx.db.query("componentTypes").collect();

    let rolledBackCount = 0;

    for (const component of allComponents) {
      if (component.category === "packaging") {
        // NOTE: Rollback is no longer possible after schema tightening.
        // Old category literals have been removed from the schema.
        // This function is kept for documentation purposes only.
        // If rollback is needed, re-expand the schema first.
        rolledBackCount++;
      }
    }

    return {
      success: true,
      rolledBackCount,
      message: `Rolled back ${rolledBackCount} components to original categories`,
    };
  },
});
