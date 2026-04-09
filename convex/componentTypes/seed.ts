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
 * Seed leaf kitchen components into componentTypes + productionComponentLinks
 *
 * Creates 12 new componentTypes rows (category="production") matching existing
 * kitchenComponents codes so historical shift records stay valid.
 * Then creates productionComponentLinks establishing parent-child hierarchy:
 *   - 10 leaf ingredients linked as children of BOTH BIG_BALL and MID_BALL
 *   - NUTELLA_FILLING linked as child of HAZELNUT_REGULAR
 *   - HAZELNUT_REGULAR is a tier-1 ball product (unit="pcs") with no parent links created here
 *
 * Idempotent: checks by_code index before inserting componentTypes,
 * checks by_parent + by_child before inserting links.
 *
 * Run from Convex dashboard: componentTypes/seed:seedLeafKitchenComponents
 */
export const seedLeafKitchenComponents = mutation({
  handler: async (ctx) => {
    console.log("Seeding leaf kitchen components...");

    // 12 components: 11 leaves (unit="g") + 1 tier-1 ball (unit="pcs")
    const leafComponents = [
      { code: "OUTER_MARSHMALLOW", name: "Outer-Marshmallow", unit: "g", sortOrder: 10 },
      { code: "FILLING_PISTACHIO", name: "Filling-Pistachio", unit: "g", sortOrder: 11 },
      { code: "PISTACHIO_SPREAD", name: "Pistachio Spread", unit: "g", sortOrder: 12 },
      { code: "SALT", name: "Salt", unit: "g", sortOrder: 13 },
      { code: "MARSHMALLOW", name: "Marshmallow", unit: "g", sortOrder: 14 },
      { code: "CACAO_POWDER", name: "Cacao Powder", unit: "g", sortOrder: 15 },
      { code: "MILK_POWDER", name: "Milk Powder", unit: "g", sortOrder: 16 },
      { code: "KUNAFA", name: "Kunafa", unit: "g", sortOrder: 17 },
      { code: "PISTACHIO_PASTE", name: "Pistachio Paste", unit: "g", sortOrder: 18 },
      { code: "BUTTER", name: "Butter", unit: "g", sortOrder: 19 },
      { code: "NUTELLA_FILLING", name: "Nutella Filling", unit: "g", sortOrder: 20 },
      { code: "HAZELNUT_REGULAR", name: "Hazelnut-Regular", unit: "pcs", sortOrder: 3 },
    ];

    let componentsCreated = 0;
    let componentsSkipped = 0;
    const codeToId = new Map<string, string>();

    for (const comp of leafComponents) {
      const existing = await ctx.db
        .query("componentTypes")
        .withIndex("by_code", (q) => q.eq("code", comp.code))
        .first();

      if (existing) {
        console.log(`Skipping ${comp.code} - already exists`);
        codeToId.set(comp.code, existing._id);
        componentsSkipped++;
        continue;
      }

      const id = await ctx.db.insert("componentTypes", {
        code: comp.code,
        name: comp.name,
        category: "production",
        unitCostIdr: 0,
        unit: comp.unit,
        trackInventory: false,
        sortOrder: comp.sortOrder,
        isActive: true,
        createdBy: "system-seed",
        createdAt: Date.now(),
      });

      codeToId.set(comp.code, id);
      componentsCreated++;
      console.log(`Created ${comp.code} (${comp.name})`);
    }

    // Resolve parent IDs (BIG_BALL, MID_BALL, HAZELNUT_REGULAR)
    const bigBall = await ctx.db
      .query("componentTypes")
      .withIndex("by_code", (q) => q.eq("code", "BIG_BALL"))
      .first();
    const midBall = await ctx.db
      .query("componentTypes")
      .withIndex("by_code", (q) => q.eq("code", "MID_BALL"))
      .first();
    const hazelnutRegular = codeToId.get("HAZELNUT_REGULAR");

    if (!bigBall || !midBall) {
      console.log("WARNING: BIG_BALL or MID_BALL not found. Run seedProductionComponents first.");
      return {
        success: false,
        componentsCreated,
        componentsSkipped,
        linksCreated: 0,
        linksSkipped: 0,
        message: "BIG_BALL or MID_BALL missing - run seedProductionComponents first",
      };
    }

    // 10 original leaf codes to link to BOTH BIG_BALL and MID_BALL
    const leafCodes = [
      "OUTER_MARSHMALLOW", "FILLING_PISTACHIO", "PISTACHIO_SPREAD",
      "SALT", "MARSHMALLOW", "CACAO_POWDER", "MILK_POWDER",
      "KUNAFA", "PISTACHIO_PASTE", "BUTTER",
    ];

    let linksCreated = 0;
    let linksSkipped = 0;

    // Link each leaf to both BIG_BALL and MID_BALL
    for (const code of leafCodes) {
      const childId = codeToId.get(code);
      if (!childId) {
        console.log(`WARNING: ${code} ID not resolved, skipping links`);
        continue;
      }

      for (const parent of [bigBall, midBall]) {
        // Check if link already exists (by_parent scan + child match)
        const existingLinks = await ctx.db
          .query("productionComponentLinks")
          .withIndex("by_parent", (q) => q.eq("parentComponentId", parent._id))
          .collect();
        const alreadyLinked = existingLinks.some(
          (l) => l.childComponentId === childId
        );

        if (alreadyLinked) {
          linksSkipped++;
          continue;
        }

        await ctx.db.insert("productionComponentLinks", {
          parentComponentId: parent._id,
          childComponentId: childId as any,
          quantityPerUnit: 1,
          unit: "g",
          sortOrder: leafCodes.indexOf(code),
        });
        linksCreated++;
        console.log(`Linked ${code} -> ${parent.code}`);
      }
    }

    // Link NUTELLA_FILLING as child of HAZELNUT_REGULAR
    if (hazelnutRegular) {
      const nutellaFillingId = codeToId.get("NUTELLA_FILLING");
      if (nutellaFillingId) {
        const existingLinks = await ctx.db
          .query("productionComponentLinks")
          .withIndex("by_parent", (q) => q.eq("parentComponentId", hazelnutRegular as any))
          .collect();
        const alreadyLinked = existingLinks.some(
          (l) => l.childComponentId === nutellaFillingId
        );

        if (alreadyLinked) {
          linksSkipped++;
        } else {
          await ctx.db.insert("productionComponentLinks", {
            parentComponentId: hazelnutRegular as any,
            childComponentId: nutellaFillingId as any,
            quantityPerUnit: 1,
            unit: "g",
            sortOrder: 0,
          });
          linksCreated++;
          console.log("Linked NUTELLA_FILLING -> HAZELNUT_REGULAR");
        }
      }
    }

    const msg = `Seeded ${componentsCreated} components (${componentsSkipped} skipped), ${linksCreated} links (${linksSkipped} skipped)`;
    console.log(msg);

    return {
      success: true,
      componentsCreated,
      componentsSkipped,
      linksCreated,
      linksSkipped,
      message: msg,
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
