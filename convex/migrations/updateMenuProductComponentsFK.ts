/**
 * Migration: Update menuProductComponents FK
 *
 * Updates existing menuProductComponents records to use the new componentTypeId FK
 * instead of the old productionUnitTypeId FK.
 *
 * Run this AFTER:
 * 1. migrateProductionUnitTypes (creates componentTypes from productionUnitTypes)
 * 2. Schema deployed with new FK field
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";

export const updateMenuProductComponentsFK = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;

    console.log(`\n🔄 Starting menuProductComponents FK migration (dryRun: ${dryRun})\n`);

    // Get all menuProductComponents
    const allComponents = await ctx.db.query("menuProductComponents").collect();
    console.log(`📊 Found ${allComponents.length} menuProductComponents records`);

    if (allComponents.length === 0) {
      return {
        updated: 0,
        total: 0,
        skipped: 0,
        errors: [],
        message: "No menuProductComponents to migrate",
      };
    }

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const component of allComponents) {
      // Skip if already migrated (componentTypeId exists)
      if (component.componentTypeId) {
        skipped++;
        continue;
      }

      // Get old productionUnitType
      if (!component.productionUnitTypeId) {
        errors.push(`Component ${component._id}: No productionUnitTypeId found`);
        continue;
      }

      const oldProdType = await ctx.db.get(component.productionUnitTypeId);
      if (!oldProdType) {
        errors.push(
          `Component ${component._id}: productionUnitType ${component.productionUnitTypeId} not found`
        );
        continue;
      }

      // Find matching componentType by code
      const newComponentType = await ctx.db
        .query("componentTypes")
        .withIndex("by_code", (q) => q.eq("code", oldProdType.code))
        .first();

      if (!newComponentType) {
        errors.push(
          `Component ${component._id}: No componentType found with code "${oldProdType.code}"`
        );
        continue;
      }

      console.log(
        `  ✓ ${component._id}: ${oldProdType.code} → componentType ${newComponentType._id}`
      );

      // Update the FK
      if (!dryRun) {
        await ctx.db.patch(component._id, {
          componentTypeId: newComponentType._id,
        });
      }

      updated++;
    }

    console.log(`\n✅ Migration complete:`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${errors.length}`);

    if (errors.length > 0) {
      console.log(`\n❌ Errors encountered:`);
      errors.forEach((err) => console.log(`   - ${err}`));
    }

    return {
      updated,
      total: allComponents.length,
      skipped,
      errors,
      message: dryRun
        ? `Dry run complete. Would update ${updated} records.`
        : `Migration complete. Updated ${updated} records.`,
    };
  },
});

/**
 * Rollback migration (if needed)
 * Clears componentTypeId from all menuProductComponents
 */
export const rollbackMenuProductComponentsFK = mutation({
  args: {},
  handler: async (ctx) => {
    console.log(`\n⏪ Rolling back menuProductComponents FK migration\n`);

    const allComponents = await ctx.db.query("menuProductComponents").collect();
    let rolled = 0;

    for (const component of allComponents) {
      if (component.componentTypeId) {
        await ctx.db.patch(component._id, {
          componentTypeId: undefined,
        });
        rolled++;
      }
    }

    console.log(`✅ Rollback complete. Cleared ${rolled} componentTypeId references.`);

    return {
      rolled,
      message: `Rollback complete. ${rolled} records reverted to productionUnitTypeId.`,
    };
  },
});

/**
 * Verify migration status
 * Check how many records have been migrated
 */
export const verifyMigrationStatus = mutation({
  args: {},
  handler: async (ctx) => {
    const allComponents = await ctx.db.query("menuProductComponents").collect();

    const migrated = allComponents.filter((c) => c.componentTypeId).length;
    const notMigrated = allComponents.filter((c) => !c.componentTypeId).length;

    console.log(`\n📊 Migration Status:`);
    console.log(`   Total: ${allComponents.length}`);
    console.log(`   Migrated: ${migrated}`);
    console.log(`   Not Migrated: ${notMigrated}`);

    return {
      total: allComponents.length,
      migrated,
      notMigrated,
      percentage: allComponents.length > 0
        ? Math.round((migrated / allComponents.length) * 100)
        : 0,
    };
  },
});
