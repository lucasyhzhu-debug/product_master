/**
 * Component Types Seed Script
 *
 * Seeds initial production components and storage locations.
 *
 * Run from Convex dashboard Functions tab:
 * componentTypes/seed:seedProductionComponents
 * componentTypes/seed:seedStorageLocations
 */

import { mutation } from "../_generated/server";

/**
 * Seed production components (Big Ball, Mid Ball)
 *
 * Based on existing productionUnitTypes data:
 * - Big Ball: 80g, Rp 18,231
 * - Mid Ball: 45g, Rp 11,422
 */
export const seedProductionComponents = mutation({
  handler: async (ctx) => {
    console.log("Seeding production components...");

    const components = [
      {
        code: "BIG_BALL",
        name: "Big Ball",
        category: "production" as const,
        gramsPerUnit: 80,
        unitCostIdr: 18231,
        unit: "pcs",
        trackInventory: false, // Production is made to order
        color: "#93C572", // Pistachio green fill
        sortOrder: 1,
        isActive: true,
      },
      {
        code: "MID_BALL",
        name: "Mid Ball",
        category: "production" as const,
        gramsPerUnit: 45,
        unitCostIdr: 11422,
        unit: "pcs",
        trackInventory: false, // Production is made to order
        color: "#93C572", // Pistachio green fill
        sortOrder: 2,
        isActive: true,
      },
    ];

    let createdCount = 0;
    let skippedCount = 0;

    for (const component of components) {
      // Check if already exists
      const existing = await ctx.db
        .query("componentTypes")
        .withIndex("by_code", (q) => q.eq("code", component.code))
        .first();

      if (existing) {
        console.log(`Skipping ${component.code} - already exists`);
        skippedCount++;
        continue;
      }

      // Create component
      await ctx.db.insert("componentTypes", {
        ...component,
        createdBy: "system-seed",
        createdAt: Date.now(),
      });

      createdCount++;
      console.log(`Created ${component.code} (${component.name})`);
    }

    console.log(`Seed complete: ${createdCount} created, ${skippedCount} skipped`);

    return {
      success: true,
      createdCount,
      skippedCount,
      message: `Seeded ${createdCount} production components (${skippedCount} already existed)`,
    };
  },
});

/**
 * Seed storage locations (Kitchen, Office, Legato Goldfinch)
 *
 * Creates default storage locations for inventory tracking:
 * - Kitchen: Production location
 * - Office: Default location (isDefault: true)
 * - Legato Goldfinch: Venue location
 */
export const seedStorageLocations = mutation({
  handler: async (ctx) => {
    console.log("Seeding storage locations...");

    const locations = [
      {
        name: "Kitchen",
        locationType: "kitchen" as const,
        address: undefined,
        isActive: true,
        isDefault: false,
      },
      {
        name: "Office",
        locationType: "office" as const,
        address: undefined,
        isActive: true,
        isDefault: true, // Default location
      },
      {
        name: "Legato Goldfinch",
        locationType: "venue" as const,
        address: undefined,
        isActive: true,
        isDefault: false,
      },
    ];

    let createdCount = 0;
    let skippedCount = 0;

    for (const location of locations) {
      // Check if already exists by name
      const existing = await ctx.db
        .query("storageLocations")
        .filter((q) => q.eq(q.field("name"), location.name))
        .first();

      if (existing) {
        console.log(`Skipping ${location.name} - already exists`);
        skippedCount++;
        continue;
      }

      // Create location
      await ctx.db.insert("storageLocations", {
        ...location,
        createdBy: "system-seed",
        createdAt: Date.now(),
      });

      createdCount++;
      console.log(`Created ${location.name} (${location.locationType})`);
    }

    console.log(`Seed complete: ${createdCount} created, ${skippedCount} skipped`);

    return {
      success: true,
      createdCount,
      skippedCount,
      message: `Seeded ${createdCount} storage locations (${skippedCount} already existed)`,
    };
  },
});

/**
 * Seed all (production components + storage locations)
 *
 * Convenience function to run both seed functions.
 * Run from Convex dashboard: componentTypes/seed:seedAll
 */
export const seedAll = mutation({
  handler: async (ctx) => {
    console.log("Running all seed functions...");

    // Seed storage locations first (needed for inventory batches)
    const locations = [
      {
        name: "Kitchen",
        locationType: "kitchen" as const,
        address: undefined,
        isActive: true,
        isDefault: false,
      },
      {
        name: "Office",
        locationType: "office" as const,
        address: undefined,
        isActive: true,
        isDefault: true,
      },
      {
        name: "Legato Goldfinch",
        locationType: "venue" as const,
        address: undefined,
        isActive: true,
        isDefault: false,
      },
    ];

    let locationsCreated = 0;
    for (const location of locations) {
      const existing = await ctx.db
        .query("storageLocations")
        .filter((q) => q.eq(q.field("name"), location.name))
        .first();

      if (!existing) {
        await ctx.db.insert("storageLocations", {
          ...location,
          createdBy: "system-seed",
          createdAt: Date.now(),
        });
        locationsCreated++;
      }
    }

    // Seed production components
    const components = [
      {
        code: "BIG_BALL",
        name: "Big Ball",
        category: "production" as const,
        gramsPerUnit: 80,
        unitCostIdr: 18231,
        unit: "pcs",
        trackInventory: false,
        color: "#93C572",
        sortOrder: 1,
        isActive: true,
      },
      {
        code: "MID_BALL",
        name: "Mid Ball",
        category: "production" as const,
        gramsPerUnit: 45,
        unitCostIdr: 11422,
        unit: "pcs",
        trackInventory: false,
        color: "#93C572",
        sortOrder: 2,
        isActive: true,
      },
    ];

    let componentsCreated = 0;
    for (const component of components) {
      const existing = await ctx.db
        .query("componentTypes")
        .withIndex("by_code", (q) => q.eq("code", component.code))
        .first();

      if (!existing) {
        await ctx.db.insert("componentTypes", {
          ...component,
          createdBy: "system-seed",
          createdAt: Date.now(),
        });
        componentsCreated++;
      }
    }

    console.log(
      `Seed complete: ${locationsCreated} locations, ${componentsCreated} components created`
    );

    return {
      success: true,
      locationsCreated,
      componentsCreated,
      message: `Created ${locationsCreated} locations and ${componentsCreated} components`,
    };
  },
});
