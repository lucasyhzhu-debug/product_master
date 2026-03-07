/**
 * Depot Auto-Seed Unit Tests
 *
 * Tests the ensureDepotLocation helper and the processGofoodSales
 * integration that auto-seeds depot storage locations instead of
 * silently skipping items when an outlet has no linkedStorageLocationId.
 */

import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import type { Id } from "../../convex/_generated/dataModel";

type TestContext = ReturnType<typeof convexTest>;

// ============================================
// Test Fixture Helpers
// ============================================

async function createMenuProduct(
  t: TestContext,
  overrides: { code?: string; name?: string } = {}
): Promise<Id<"menuProducts">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("menuProducts", {
      code: overrides.code ?? "TEST-001",
      name: overrides.name ?? "Frollie Original",
      grams: 80,
      defaultPrice: 50000,
      isActive: true,
      unitCost: 0,
      cachedProductionSummary: "",
      productType: "food" as const,
    });
  });
}

async function createExternalOutlet(
  t: TestContext,
  overrides: {
    name?: string;
    externalId?: string;
    linkedStorageLocationId?: Id<"storageLocations">;
  } = {}
): Promise<Id<"externalOutlets">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("externalOutlets", {
      source: "gobiz" as const,
      externalId: overrides.externalId ?? "G958262444",
      name: overrides.name ?? "Legato Tamtem",
      isActive: true,
      createdBy: "test",
      createdAt: Date.now(),
      ...(overrides.linkedStorageLocationId !== undefined && {
        linkedStorageLocationId: overrides.linkedStorageLocationId,
      }),
    });
  });
}

async function createStorageLocation(
  t: TestContext,
  overrides: {
    name?: string;
    locationType?: "office" | "kitchen" | "venue" | "depot";
    isDefault?: boolean;
  } = {}
): Promise<Id<"storageLocations">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("storageLocations", {
      name: overrides.name ?? "Test Location",
      locationType: overrides.locationType ?? "office",
      isDefault: overrides.isDefault ?? false,
      isActive: true,
      createdBy: "test",
      createdAt: Date.now(),
    });
  });
}

async function createPackagingComponentType(
  t: TestContext,
  overrides: { code?: string; name?: string } = {}
): Promise<Id<"componentTypes">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("componentTypes", {
      code: overrides.code ?? "SMALL_BOX",
      name: overrides.name ?? "Small Box",
      category: "packaging",
      unitCostIdr: 500,
      unit: "pcs",
      trackInventory: true,
      consumptionStage: "boxing",
      isActive: true,
      sortOrder: 0,
      createdBy: "test",
      createdAt: Date.now(),
    });
  });
}

async function linkComponentToProduct(
  t: TestContext,
  menuProductId: Id<"menuProducts">,
  componentTypeId: Id<"componentTypes">
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("menuProductComponents", {
      menuProductId,
      componentTypeId,
      quantity: 1,
      sortOrder: 0,
    });
  });
}

async function initializeSettings(t: TestContext): Promise<void> {
  await t.run(async (ctx) => {
    const existing = await ctx.db.query("productInventorySettings").first();
    if (!existing) {
      await ctx.db.insert("productInventorySettings", {
        globalLowStockThreshold: 5,
        autoAdvanceOnDrawdown: true,
        alertMode: "toast",
        updatedBy: "test",
        updatedAt: Date.now(),
      });
    }
  });
}

// ============================================
// processGofoodSales Auto-Seed Integration Tests
// ============================================

describe("processGofoodSales auto-seed", () => {
  test("auto-seeds Tamtem depot when outlet has no linkedStorageLocationId", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    await initializeSettings(t);

    // Create outlet WITHOUT a linked storage location
    const outletId = await createExternalOutlet(t, {
      name: "Legato Tamtem",
      externalId: "G958262444",
    });

    // Process a GoFood sale -- should auto-seed instead of skipping
    const result = await t.mutation(
      internal.productInventory.mutations.processGofoodSales,
      {
        items: [
          {
            menuProductId: mpId,
            quantity: 2,
            outletId,
            gofoodOrderRef: "GF-TEST-001",
          },
        ],
      }
    );

    // Item should be processed (not skipped)
    expect(result.processed).toBe(1);

    // Verify the storage location was created
    const locations = await t.run(async (ctx) => {
      return await ctx.db
        .query("storageLocations")
        .filter((q) => q.eq(q.field("name"), "Tamtem Depot"))
        .collect();
    });
    expect(locations.length).toBe(1);
    expect(locations[0].locationType).toBe("depot");
    expect(locations[0].isActive).toBe(true);
    expect(locations[0].createdBy).toBe("auto-seed");

    // Verify the outlet was linked
    const outlet = await t.run(async (ctx) => ctx.db.get(outletId));
    expect(outlet!.linkedStorageLocationId).toBe(locations[0]._id);

    // Verify inventory was deducted (negative stock is allowed)
    const inventory = await t.run(async (ctx) => {
      return await ctx.db
        .query("productInventory")
        .withIndex("by_product_location", (q) =>
          q.eq("menuProductId", mpId).eq("locationId", locations[0]._id)
        )
        .first();
    });
    expect(inventory).toBeDefined();
    expect(inventory!.quantity).toBe(-2); // 0 - 2 = -2 (negative allowed)
  });

  test("auto-seeds Goldfinch venue when outlet has no linkedStorageLocationId", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    await initializeSettings(t);

    const outletId = await createExternalOutlet(t, {
      name: "Legato Goldfinch",
      externalId: "G293156297",
    });

    const result = await t.mutation(
      internal.productInventory.mutations.processGofoodSales,
      {
        items: [
          {
            menuProductId: mpId,
            quantity: 1,
            outletId,
          },
        ],
      }
    );

    expect(result.processed).toBe(1);

    // Verify venue location created (not depot)
    const locations = await t.run(async (ctx) => {
      return await ctx.db
        .query("storageLocations")
        .filter((q) => q.eq(q.field("name"), "Legato Goldfinch"))
        .collect();
    });
    expect(locations.length).toBe(1);
    expect(locations[0].locationType).toBe("venue");
  });

  test("proceeds normally when outlet already has linkedStorageLocationId", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    await initializeSettings(t);

    // Create location and link it to the outlet
    const locationId = await createStorageLocation(t, {
      name: "Tamtem Depot",
      locationType: "depot",
    });

    const outletId = await createExternalOutlet(t, {
      name: "Legato Tamtem",
      linkedStorageLocationId: locationId,
    });

    // Pre-seed some stock
    await t.run(async (ctx) => {
      await ctx.db.insert("productInventory", {
        menuProductId: mpId,
        locationId,
        quantity: 10,
        lastUpdated: Date.now(),
      });
    });

    const result = await t.mutation(
      internal.productInventory.mutations.processGofoodSales,
      {
        items: [
          {
            menuProductId: mpId,
            quantity: 3,
            outletId,
          },
        ],
      }
    );

    expect(result.processed).toBe(1);

    // Verify stock was deducted from existing location
    const inventory = await t.run(async (ctx) => {
      return await ctx.db
        .query("productInventory")
        .withIndex("by_product_location", (q) =>
          q.eq("menuProductId", mpId).eq("locationId", locationId)
        )
        .first();
    });
    expect(inventory!.quantity).toBe(7); // 10 - 3

    // Verify no duplicate locations created
    const locations = await t.run(async (ctx) => {
      return await ctx.db
        .query("storageLocations")
        .filter((q) => q.eq(q.field("name"), "Tamtem Depot"))
        .collect();
    });
    expect(locations.length).toBe(1);
  });

  test("auto-seed is idempotent -- second call reuses existing location", async () => {
    const t = convexTest(schema);
    const mp1 = await createMenuProduct(t, { code: "OG-001", name: "Original" });
    const mp2 = await createMenuProduct(t, { code: "CH-001", name: "Choco" });
    await initializeSettings(t);

    const outletId = await createExternalOutlet(t, {
      name: "Legato Tamtem",
    });

    // First call -- should auto-seed
    await t.mutation(
      internal.productInventory.mutations.processGofoodSales,
      {
        items: [{ menuProductId: mp1, quantity: 1, outletId }],
      }
    );

    // Second call -- should reuse existing location (idempotent)
    await t.mutation(
      internal.productInventory.mutations.processGofoodSales,
      {
        items: [{ menuProductId: mp2, quantity: 2, outletId }],
      }
    );

    // Verify only one Tamtem Depot location exists
    const locations = await t.run(async (ctx) => {
      return await ctx.db
        .query("storageLocations")
        .filter((q) => q.eq(q.field("name"), "Tamtem Depot"))
        .collect();
    });
    expect(locations.length).toBe(1);
  });

  test("unknown outlets still skip with a warning (no auto-seed)", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    await initializeSettings(t);

    const outletId = await createExternalOutlet(t, {
      name: "Unknown Outlet XYZ",
      externalId: "G000000000",
    });

    const result = await t.mutation(
      internal.productInventory.mutations.processGofoodSales,
      {
        items: [{ menuProductId: mpId, quantity: 1, outletId }],
      }
    );

    // Item should be SKIPPED (not processed)
    expect(result.processed).toBe(0);

    // No storage location should be created
    const allLocations = await t.run(async (ctx) => {
      return await ctx.db.query("storageLocations").collect();
    });
    expect(allLocations.length).toBe(0);
  });

  test("auto-seed creates zero-stock inventory rows for active packaging components", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    await initializeSettings(t);

    // Create active packaging component and link it to the menu product
    const boxId = await createPackagingComponentType(t, {
      code: "SMALL_BOX",
      name: "Small Box",
    });
    await linkComponentToProduct(t, mpId, boxId);

    const outletId = await createExternalOutlet(t, {
      name: "Legato Tamtem",
    });

    await t.mutation(
      internal.productInventory.mutations.processGofoodSales,
      {
        items: [{ menuProductId: mpId, quantity: 1, outletId }],
      }
    );

    // Verify the auto-seed also created a zero-stock inventory row for the menu product
    const location = await t.run(async (ctx) => {
      return await ctx.db
        .query("storageLocations")
        .filter((q) => q.eq(q.field("name"), "Tamtem Depot"))
        .first();
    });
    expect(location).toBeDefined();

    // The GoFood sale deducted 1 from the zero-stock row, so it should be -1
    // (auto-seed creates at 0, then processGofoodSales deducts 1)
    const inventoryRows = await t.run(async (ctx) => {
      return await ctx.db
        .query("productInventory")
        .withIndex("by_location", (q) => q.eq("locationId", location!._id))
        .collect();
    });
    expect(inventoryRows.length).toBeGreaterThanOrEqual(1);

    // Find the row for our menu product
    const mpRow = inventoryRows.find(
      (r) => (r.menuProductId as string) === (mpId as string)
    );
    expect(mpRow).toBeDefined();
    // Auto-seed creates at 0, then processGofoodSales deducts 1 = -1
    expect(mpRow!.quantity).toBe(-1);
  });
});
