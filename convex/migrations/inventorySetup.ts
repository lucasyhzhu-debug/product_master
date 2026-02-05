/**
 * Inventory Setup Migration
 *
 * Migrates existing productionUnitTypes → componentTypes (category="production")
 *
 * Run from Convex dashboard Functions tab:
 * migrations/inventorySetup:migrateProductionUnitTypes
 */

import { mutation } from "../_generated/server";

/**
 * Migrate productionUnitTypes → componentTypes
 *
 * Creates componentType records with category="production" for each existing
 * productionUnitType. Production components do NOT track inventory (trackInventory: false).
 */
export const migrateProductionUnitTypes = mutation({
  handler: async (ctx) => {
    console.log("Starting migration: productionUnitTypes → componentTypes");

    // Get all existing productionUnitTypes
    const oldTypes = await ctx.db.query("productionUnitTypes").collect();

    console.log(`Found ${oldTypes.length} productionUnitTypes to migrate`);

    let migratedCount = 0;
    const migrationMap: Record<string, { oldId: string; newId: string; code: string }> = {};

    for (const oldType of oldTypes) {
      // Check if already migrated (by code)
      const existing = await ctx.db
        .query("componentTypes")
        .withIndex("by_code", (q) => q.eq("code", oldType.code))
        .first();

      if (existing) {
        console.log(`Skipping ${oldType.code} - already exists in componentTypes`);
        migrationMap[oldType._id] = {
          oldId: oldType._id,
          newId: existing._id,
          code: oldType.code,
        };
        continue;
      }

      // Create new componentType
      const newId = await ctx.db.insert("componentTypes", {
        code: oldType.code,
        name: oldType.name,
        category: "production", // All productionUnitTypes are production components
        gramsPerUnit: oldType.gramsPerUnit,
        unitCostIdr: oldType.unitCostIdr,
        unit: "pcs", // Production units are counted in pieces
        trackInventory: false, // Production is made to order, not tracked in inventory
        reorderPoint: undefined, // Not applicable for production
        reorderQuantity: undefined, // Not applicable for production
        color: oldType.color,
        sortOrder: oldType.sortOrder,
        isActive: oldType.isActive,
        createdBy: "system-migration",
        createdAt: Date.now(),
      });

      migrationMap[oldType._id] = {
        oldId: oldType._id,
        newId: newId,
        code: oldType.code,
      };

      migratedCount++;
      console.log(`Migrated ${oldType.code} (${oldType.name})`);
    }

    console.log(`Migration complete: ${migratedCount} new componentTypes created`);
    console.log(`Total componentTypes (including existing): ${oldTypes.length}`);

    // Return migration map for reference (can be used for FK updates if needed)
    return {
      success: true,
      migratedCount,
      totalCount: oldTypes.length,
      migrationMap,
      message: `Successfully migrated ${migratedCount} productionUnitTypes to componentTypes. Keep productionUnitTypes table for 1 week as backup.`,
    };
  },
});

/**
 * Rollback migration (if needed)
 *
 * Deletes all componentTypes with category="production" that were created by migration.
 * Does NOT restore productionUnitTypes (use database backup for full rollback).
 */
export const rollbackProductionMigration = mutation({
  handler: async (ctx) => {
    console.log("Rolling back: deleting migrated componentTypes");

    const migratedComponents = await ctx.db
      .query("componentTypes")
      .withIndex("by_category", (q) => q.eq("category", "production"))
      .collect();

    let deletedCount = 0;
    for (const component of migratedComponents) {
      if (component.createdBy === "system-migration") {
        await ctx.db.delete(component._id);
        deletedCount++;
        console.log(`Deleted ${component.code}`);
      }
    }

    console.log(`Rollback complete: ${deletedCount} componentTypes deleted`);

    return {
      success: true,
      deletedCount,
      message: `Deleted ${deletedCount} migrated componentTypes. Restore productionUnitTypes from backup if needed.`,
    };
  },
});
