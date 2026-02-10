/**
 * GoFood Depot (Goldfinch) Tests
 *
 * Tests for depot stock management, shipment recording, sale processing,
 * manual adjustments, and virtual daily order queries.
 */

import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { internal, api } from "../../convex/_generated/api";
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
      productionType: "original",
      productionUnits: 1,
      isActive: true,
    });
  });
}

async function createOfficeLocation(
  t: TestContext
): Promise<Id<"storageLocations">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("storageLocations", {
      name: "Office",
      locationType: "office",
      isDefault: true,
      isActive: true,
      createdBy: "test",
      createdAt: Date.now(),
    });
  });
}

async function createGoldfinchLocation(
  t: TestContext
): Promise<Id<"storageLocations">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("storageLocations", {
      name: "Goldfinch",
      locationType: "venue",
      isDefault: false,
      isActive: true,
      createdBy: "test",
      createdAt: Date.now(),
    });
  });
}

async function createStickerComponent(
  t: TestContext,
  overrides: { code?: string; name?: string } = {}
): Promise<Id<"componentTypes">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("componentTypes", {
      code: overrides.code ?? "STICKER_SM_OG",
      name: overrides.name ?? "Sticker Small (OG)",
      category: "packaging",
      unitCostIdr: 200,
      unit: "pcs",
      trackInventory: true,
      consumptionStage: "labeling",
      isActive: true,
      sortOrder: 0,
      createdBy: "test",
      createdAt: Date.now(),
    });
  });
}

async function createInventoryBatch(
  t: TestContext,
  componentTypeId: Id<"componentTypes">,
  locationId: Id<"storageLocations">,
  quantity: number = 100
): Promise<Id<"inventoryBatches">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("inventoryBatches", {
      componentTypeId,
      locationId,
      purchaseDate: Date.now(),
      supplierName: "Test Supplier",
      quantityPurchased: quantity,
      totalCostIdr: quantity * 200,
      unitCostIdr: 200,
      quantityRemaining: quantity,
      quantityReserved: 0,
      status: "active",
      createdBy: "test",
      createdAt: Date.now(),
    });
  });
}

async function createComponentStock(
  t: TestContext,
  componentTypeId: Id<"componentTypes">,
  locationId: Id<"storageLocations">,
  totalStock: number
): Promise<Id<"componentStock">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("componentStock", {
      componentTypeId,
      locationId,
      totalStock,
      totalReserved: 0,
      weightedUnitCostIdr: 200,
      lastUpdated: Date.now(),
    });
  });
}

async function createAuthUser(
  t: TestContext,
  role: "kitchen" | "order_staff" | "manager" | "admin" = "kitchen"
): Promise<string> {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name: "Test User",
      pinHash: "salt:hash",
      role,
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    });
  });

  await t.run(async (ctx) => {
    await ctx.db.insert("sessions", {
      userId,
      token: "test-token",
      expiresAt: Date.now() + 3600000,
      createdAt: Date.now(),
    });
  });

  return "test-token";
}

async function createProductionCounts(
  t: TestContext,
  menuProductId: Id<"menuProducts">
): Promise<Id<"productionCounts">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("productionCounts", {
      menuProductId,
      boxed: 0,
      stickered: 0,
      packed: 0,
    });
  });
}

async function linkStickerToProduct(
  t: TestContext,
  menuProductId: Id<"menuProducts">,
  componentTypeId: Id<"componentTypes">
): Promise<Id<"menuProductComponents">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("menuProductComponents", {
      menuProductId,
      componentTypeId,
      quantity: 1,
      sortOrder: 0,
      consumptionStage: "labeling",
    });
  });
}

// ============================================
// Schema Validation Tests
// ============================================
describe("Schema: gofoodDepotStock", () => {
  test("can insert and read depot stock record", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);

    const stockId = await t.run(async (ctx) => {
      return await ctx.db.insert("gofoodDepotStock", {
        menuProductId: mpId,
        quantity: 5,
        lastUpdated: Date.now(),
      });
    });

    const stock = await t.run(async (ctx) => ctx.db.get(stockId));
    expect(stock).toBeDefined();
    expect(stock!.menuProductId).toBe(mpId);
    expect(stock!.quantity).toBe(5);
  });

  test("stickerDeficit is optional and defaults to undefined", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);

    const stockId = await t.run(async (ctx) => {
      return await ctx.db.insert("gofoodDepotStock", {
        menuProductId: mpId,
        quantity: 3,
        lastUpdated: Date.now(),
      });
    });

    const stock = await t.run(async (ctx) => ctx.db.get(stockId));
    expect(stock!.stickerDeficit).toBeUndefined();
  });

  test("by_menuProduct index enables lookup by product", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("gofoodDepotStock", {
        menuProductId: mpId,
        quantity: 10,
        lastUpdated: Date.now(),
      });
    });

    const found = await t.run(async (ctx) => {
      return await ctx.db
        .query("gofoodDepotStock")
        .withIndex("by_menuProduct", (q) => q.eq("menuProductId", mpId))
        .first();
    });

    expect(found).toBeDefined();
    expect(found!.quantity).toBe(10);
  });
});

describe("Schema: gofoodDepotShipments", () => {
  test("can insert and read shipment record", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);

    const shipId = await t.run(async (ctx) => {
      return await ctx.db.insert("gofoodDepotShipments", {
        date: "2026-02-11",
        menuProductId: mpId,
        quantity: 5,
        stickersTransferred: 5,
        shippedBy: "Test User",
        timestamp: Date.now(),
      });
    });

    const ship = await t.run(async (ctx) => ctx.db.get(shipId));
    expect(ship).toBeDefined();
    expect(ship!.date).toBe("2026-02-11");
    expect(ship!.quantity).toBe(5);
    expect(ship!.stickersTransferred).toBe(5);
    expect(ship!.shippedBy).toBe("Test User");
  });

  test("by_date index works for date lookup", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("gofoodDepotShipments", {
        date: "2026-02-10",
        menuProductId: mpId,
        quantity: 3,
        stickersTransferred: 3,
        shippedBy: "test",
        timestamp: Date.now(),
      });
      await ctx.db.insert("gofoodDepotShipments", {
        date: "2026-02-11",
        menuProductId: mpId,
        quantity: 5,
        stickersTransferred: 5,
        shippedBy: "test",
        timestamp: Date.now(),
      });
    });

    const today = await t.run(async (ctx) => {
      return await ctx.db
        .query("gofoodDepotShipments")
        .withIndex("by_date", (q) => q.eq("date", "2026-02-11"))
        .collect();
    });

    expect(today.length).toBe(1);
    expect(today[0].quantity).toBe(5);
  });
});

describe("Schema: productionCounts.shippedToGoldfinch", () => {
  test("shippedToGoldfinch is optional and patchable", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    const countId = await createProductionCounts(t, mpId);

    const before = await t.run(async (ctx) => ctx.db.get(countId));
    expect(before!.shippedToGoldfinch).toBeUndefined();

    await t.run(async (ctx) => {
      await ctx.db.patch(countId, { shippedToGoldfinch: 7 });
    });

    const after = await t.run(async (ctx) => ctx.db.get(countId));
    expect(after!.shippedToGoldfinch).toBe(7);
  });
});

// ============================================
// recordShipment Mutation Tests
// ============================================
describe("recordShipment", () => {
  test("creates new depot stock record on first shipment", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    await createOfficeLocation(t);
    await createGoldfinchLocation(t);
    const token = await createAuthUser(t, "kitchen");

    const result = await t.mutation(api.gofoodDepot.mutations.recordShipment, {
      token,
      items: [{ menuProductId: mpId, quantity: 5 }],
    });

    expect(result.totalBoxes).toBe(5);

    const stock = await t.run(async (ctx) => {
      return await ctx.db
        .query("gofoodDepotStock")
        .withIndex("by_menuProduct", (q) => q.eq("menuProductId", mpId))
        .first();
    });

    expect(stock).toBeDefined();
    expect(stock!.quantity).toBe(5);
  });

  test("increments existing depot stock", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    await createOfficeLocation(t);
    await createGoldfinchLocation(t);
    const token = await createAuthUser(t, "kitchen");

    // Pre-seed existing stock
    await t.run(async (ctx) => {
      await ctx.db.insert("gofoodDepotStock", {
        menuProductId: mpId,
        quantity: 3,
        lastUpdated: Date.now(),
      });
    });

    await t.mutation(api.gofoodDepot.mutations.recordShipment, {
      token,
      items: [{ menuProductId: mpId, quantity: 5 }],
    });

    const stock = await t.run(async (ctx) => {
      return await ctx.db
        .query("gofoodDepotStock")
        .withIndex("by_menuProduct", (q) => q.eq("menuProductId", mpId))
        .first();
    });

    expect(stock!.quantity).toBe(8); // 3 + 5
  });

  test("inserts shipment audit record", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    await createOfficeLocation(t);
    await createGoldfinchLocation(t);
    const token = await createAuthUser(t, "kitchen");

    await t.mutation(api.gofoodDepot.mutations.recordShipment, {
      token,
      items: [{ menuProductId: mpId, quantity: 7 }],
    });

    const shipments = await t.run(async (ctx) => {
      return await ctx.db.query("gofoodDepotShipments").collect();
    });

    expect(shipments.length).toBe(1);
    expect(shipments[0].quantity).toBe(7);
    expect(shipments[0].menuProductId).toBe(mpId);
    expect(shipments[0].shippedBy).toBe("Test User");
  });

  test("updates productionCounts.shippedToGoldfinch", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    await createOfficeLocation(t);
    await createGoldfinchLocation(t);
    const token = await createAuthUser(t, "kitchen");
    const countId = await createProductionCounts(t, mpId);

    await t.mutation(api.gofoodDepot.mutations.recordShipment, {
      token,
      items: [{ menuProductId: mpId, quantity: 4 }],
    });

    const counts = await t.run(async (ctx) => ctx.db.get(countId));
    expect(counts!.shippedToGoldfinch).toBe(4);
  });

  test("rejects zero quantity", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    await createOfficeLocation(t);
    await createGoldfinchLocation(t);
    const token = await createAuthUser(t, "kitchen");

    await expect(
      t.mutation(api.gofoodDepot.mutations.recordShipment, {
        token,
        items: [{ menuProductId: mpId, quantity: 0 }],
      })
    ).rejects.toThrow("Quantity must be positive");
  });

  test("rejects negative quantity", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    await createOfficeLocation(t);
    await createGoldfinchLocation(t);
    const token = await createAuthUser(t, "kitchen");

    await expect(
      t.mutation(api.gofoodDepot.mutations.recordShipment, {
        token,
        items: [{ menuProductId: mpId, quantity: -3 }],
      })
    ).rejects.toThrow("Quantity must be positive");
  });

  test("ships multiple products in one call", async () => {
    const t = convexTest(schema);
    const mp1 = await createMenuProduct(t, { code: "OG-001", name: "Original" });
    const mp2 = await createMenuProduct(t, { code: "CH-001", name: "Choco" });
    await createOfficeLocation(t);
    await createGoldfinchLocation(t);
    const token = await createAuthUser(t, "kitchen");

    const result = await t.mutation(api.gofoodDepot.mutations.recordShipment, {
      token,
      items: [
        { menuProductId: mp1, quantity: 5 },
        { menuProductId: mp2, quantity: 3 },
      ],
    });

    expect(result.totalBoxes).toBe(8);

    const stocks = await t.run(async (ctx) => {
      return await ctx.db.query("gofoodDepotStock").collect();
    });
    expect(stocks.length).toBe(2);
  });

  test("transfers stickers from Office to Goldfinch via FIFO", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    const officeId = await createOfficeLocation(t);
    const goldfinchId = await createGoldfinchLocation(t);
    const token = await createAuthUser(t, "kitchen");
    const stickerId = await createStickerComponent(t);

    // Create sticker batch at Office
    await createInventoryBatch(t, stickerId, officeId, 50);
    await createComponentStock(t, stickerId, officeId, 50);

    const result = await t.mutation(api.gofoodDepot.mutations.recordShipment, {
      token,
      items: [
        {
          menuProductId: mpId,
          quantity: 5,
          stickerTransfers: [
            { componentTypeId: stickerId, quantity: 5 },
          ],
        },
      ],
    });

    expect(result.totalBoxes).toBe(5);
    expect(result.totalStickers).toBe(5);

    // Verify Goldfinch batches were created
    const goldfinchBatches = await t.run(async (ctx) => {
      return await ctx.db
        .query("inventoryBatches")
        .withIndex("by_component_location", (q) =>
          q.eq("componentTypeId", stickerId).eq("locationId", goldfinchId)
        )
        .collect();
    });

    expect(goldfinchBatches.length).toBeGreaterThanOrEqual(1);
    const totalTransferred = goldfinchBatches.reduce(
      (sum, b) => sum + b.quantityRemaining,
      0
    );
    expect(totalTransferred).toBe(5);
  });
});

// ============================================
// processSyncSales (internalMutation) Tests
// ============================================
describe("processSyncSales", () => {
  test("decrements depot stock on sale", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    await createGoldfinchLocation(t);

    // Pre-seed depot stock
    await t.run(async (ctx) => {
      await ctx.db.insert("gofoodDepotStock", {
        menuProductId: mpId,
        quantity: 10,
        lastUpdated: Date.now(),
      });
    });

    const result = await t.mutation(
      internal.gofoodDepot.mutations.processSyncSales,
      { items: [{ menuProductId: mpId, quantity: 3 }] }
    );

    expect(result.processed).toBe(1);

    const stock = await t.run(async (ctx) => {
      return await ctx.db
        .query("gofoodDepotStock")
        .withIndex("by_menuProduct", (q) => q.eq("menuProductId", mpId))
        .first();
    });

    expect(stock!.quantity).toBe(7); // 10 - 3
  });

  test("creates negative stock (debt) when no prior stock record", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    await createGoldfinchLocation(t);

    await t.mutation(internal.gofoodDepot.mutations.processSyncSales, {
      items: [{ menuProductId: mpId, quantity: 2 }],
    });

    const stock = await t.run(async (ctx) => {
      return await ctx.db
        .query("gofoodDepotStock")
        .withIndex("by_menuProduct", (q) => q.eq("menuProductId", mpId))
        .first();
    });

    expect(stock!.quantity).toBe(-2); // Debt
  });

  test("allows stock to go negative (debt) on oversell", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    await createGoldfinchLocation(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("gofoodDepotStock", {
        menuProductId: mpId,
        quantity: 2,
        lastUpdated: Date.now(),
      });
    });

    await t.mutation(internal.gofoodDepot.mutations.processSyncSales, {
      items: [{ menuProductId: mpId, quantity: 5 }],
    });

    const stock = await t.run(async (ctx) => {
      return await ctx.db
        .query("gofoodDepotStock")
        .withIndex("by_menuProduct", (q) => q.eq("menuProductId", mpId))
        .first();
    });

    expect(stock!.quantity).toBe(-3); // 2 - 5 = -3
  });

  test("skips items with zero quantity", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    await createGoldfinchLocation(t);

    const result = await t.mutation(
      internal.gofoodDepot.mutations.processSyncSales,
      { items: [{ menuProductId: mpId, quantity: 0 }] }
    );

    expect(result.processed).toBe(0);
  });

  test("writes production log entry for each sale", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    await createGoldfinchLocation(t);

    await t.mutation(internal.gofoodDepot.mutations.processSyncSales, {
      items: [{ menuProductId: mpId, quantity: 2 }],
    });

    const logs = await t.run(async (ctx) => {
      return await ctx.db.query("productionLog").collect();
    });

    expect(logs.length).toBe(1);
    expect(logs[0].menuProductId).toBe(mpId);
    expect(logs[0].action).toBe("sticker");
    expect(logs[0].quantity).toBe(2);
    expect(logs[0].performedBy).toBe("system");
    expect(logs[0].note).toBe("auto:gobiz-sale");
  });

  test("increments productionCounts.stickered", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    await createGoldfinchLocation(t);
    const countId = await createProductionCounts(t, mpId);

    await t.mutation(internal.gofoodDepot.mutations.processSyncSales, {
      items: [{ menuProductId: mpId, quantity: 4 }],
    });

    const counts = await t.run(async (ctx) => ctx.db.get(countId));
    expect(counts!.stickered).toBe(4);
  });

  test("returns gracefully when Goldfinch location not found", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    // NO Goldfinch location created

    const result = await t.mutation(
      internal.gofoodDepot.mutations.processSyncSales,
      { items: [{ menuProductId: mpId, quantity: 3 }] }
    );

    expect(result.processed).toBe(0);
    expect(result.deficits).toBe(0);
  });

  test("processes multiple items in one batch", async () => {
    const t = convexTest(schema);
    const mp1 = await createMenuProduct(t, { code: "OG", name: "Original" });
    const mp2 = await createMenuProduct(t, { code: "CH", name: "Choco" });
    await createGoldfinchLocation(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("gofoodDepotStock", {
        menuProductId: mp1,
        quantity: 10,
        lastUpdated: Date.now(),
      });
      await ctx.db.insert("gofoodDepotStock", {
        menuProductId: mp2,
        quantity: 5,
        lastUpdated: Date.now(),
      });
    });

    const result = await t.mutation(
      internal.gofoodDepot.mutations.processSyncSales,
      {
        items: [
          { menuProductId: mp1, quantity: 2 },
          { menuProductId: mp2, quantity: 1 },
        ],
      }
    );

    expect(result.processed).toBe(2);
  });

  test("consumes stickers from Goldfinch FIFO on sale", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    const goldfinchId = await createGoldfinchLocation(t);
    const stickerId = await createStickerComponent(t);

    // Link sticker to product (labeling stage)
    await linkStickerToProduct(t, mpId, stickerId);

    // Create sticker batch at Goldfinch
    const batchId = await createInventoryBatch(t, stickerId, goldfinchId, 20);
    await createComponentStock(t, stickerId, goldfinchId, 20);

    await t.mutation(internal.gofoodDepot.mutations.processSyncSales, {
      items: [{ menuProductId: mpId, quantity: 3 }],
    });

    // Sticker batch should have been consumed
    const batch = await t.run(async (ctx) => ctx.db.get(batchId));
    expect(batch!.quantityRemaining).toBe(17); // 20 - 3
  });
});

// ============================================
// recordSale (internalMutation) Tests
// ============================================
describe("recordSale", () => {
  test("decrements depot stock for single sale", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("gofoodDepotStock", {
        menuProductId: mpId,
        quantity: 8,
        lastUpdated: Date.now(),
      });
    });

    const result = await t.mutation(
      internal.gofoodDepot.mutations.recordSale,
      { menuProductId: mpId, quantity: 1 }
    );

    expect(result.success).toBe(true);

    const stock = await t.run(async (ctx) => {
      return await ctx.db
        .query("gofoodDepotStock")
        .withIndex("by_menuProduct", (q) => q.eq("menuProductId", mpId))
        .first();
    });

    expect(stock!.quantity).toBe(7); // 8 - 1
  });

  test("creates negative stock when no prior record", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);

    await t.mutation(internal.gofoodDepot.mutations.recordSale, {
      menuProductId: mpId,
      quantity: 3,
    });

    const stock = await t.run(async (ctx) => {
      return await ctx.db
        .query("gofoodDepotStock")
        .withIndex("by_menuProduct", (q) => q.eq("menuProductId", mpId))
        .first();
    });

    expect(stock!.quantity).toBe(-3);
  });
});

// ============================================
// adjustDepotStock Mutation Tests
// ============================================
describe("adjustDepotStock", () => {
  test("sets depot stock to exact value (manager)", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    const token = await createAuthUser(t, "manager");

    await t.run(async (ctx) => {
      await ctx.db.insert("gofoodDepotStock", {
        menuProductId: mpId,
        quantity: 10,
        lastUpdated: Date.now(),
      });
    });

    await t.mutation(api.gofoodDepot.mutations.adjustDepotStock, {
      token,
      menuProductId: mpId,
      newQuantity: 7,
      reason: "Physical count correction",
    });

    const stock = await t.run(async (ctx) => {
      return await ctx.db
        .query("gofoodDepotStock")
        .withIndex("by_menuProduct", (q) => q.eq("menuProductId", mpId))
        .first();
    });

    expect(stock!.quantity).toBe(7);
  });

  test("creates stock record if none exists", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    const token = await createAuthUser(t, "admin");

    await t.mutation(api.gofoodDepot.mutations.adjustDepotStock, {
      token,
      menuProductId: mpId,
      newQuantity: 12,
      reason: "Initial stock count",
    });

    const stock = await t.run(async (ctx) => {
      return await ctx.db
        .query("gofoodDepotStock")
        .withIndex("by_menuProduct", (q) => q.eq("menuProductId", mpId))
        .first();
    });

    expect(stock).toBeDefined();
    expect(stock!.quantity).toBe(12);
  });
});

// ============================================
// Query Tests
// ============================================
describe("getDepotStock query", () => {
  test("returns enriched stock with product names", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t, {
      code: "OG-001",
      name: "Frollie Original",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("gofoodDepotStock", {
        menuProductId: mpId,
        quantity: 5,
        lastUpdated: Date.now(),
      });
    });

    const stocks = await t.query(api.gofoodDepot.queries.getDepotStock, {});

    expect(stocks.length).toBe(1);
    expect(stocks[0].quantity).toBe(5);
    expect(stocks[0].menuProductName).toBe("Frollie Original");
    expect(stocks[0].menuProductCode).toBe("OG-001");
  });
});

describe("getGoFoodDailyOrder query", () => {
  test("returns null when no GoFood targets", async () => {
    const t = convexTest(schema);

    const result = await t.query(
      api.gofoodDepot.queries.getGoFoodDailyOrder,
      { date: "2026-02-11" }
    );

    expect(result).toBeNull();
  });

  test("assembles virtual order from targets + depot stock", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t, {
      code: "OG",
      name: "Original",
    });

    // Create GoFood target
    await t.run(async (ctx) => {
      await ctx.db.insert("productionProductTargets", {
        date: "2026-02-11",
        source: "gofood",
        menuProductId: mpId,
        quantity: 10,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    // Create depot stock (3 leftover from yesterday)
    await t.run(async (ctx) => {
      await ctx.db.insert("gofoodDepotStock", {
        menuProductId: mpId,
        quantity: 3,
        lastUpdated: Date.now(),
      });
    });

    const result = await t.query(
      api.gofoodDepot.queries.getGoFoodDailyOrder,
      { date: "2026-02-11" }
    );

    expect(result).toBeDefined();
    expect(result!.orderNumber).toBe("GF-0211");
    expect(result!.customerName).toBe("GoFood Depot");
    expect(result!.items.length).toBe(1);

    const item = result!.items[0];
    expect(item.targetQty).toBe(10);
    expect(item.existingAtDepot).toBe(3);
    expect(item.toShipToday).toBe(7); // max(0, 10 - 3)
  });

  test("skips targets with zero quantity", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("productionProductTargets", {
        date: "2026-02-11",
        source: "gofood",
        menuProductId: mpId,
        quantity: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const result = await t.query(
      api.gofoodDepot.queries.getGoFoodDailyOrder,
      { date: "2026-02-11" }
    );

    expect(result).toBeNull();
  });
});

describe("getTodayShipments query", () => {
  test("returns enriched shipments with product names", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t, { name: "Original" });

    await t.run(async (ctx) => {
      await ctx.db.insert("gofoodDepotShipments", {
        date: "2026-02-11",
        menuProductId: mpId,
        quantity: 7,
        stickersTransferred: 7,
        shippedBy: "kitchen",
        timestamp: Date.now(),
      });
    });

    const result = await t.query(api.gofoodDepot.queries.getTodayShipments, {
      date: "2026-02-11",
    });

    expect(result.length).toBe(1);
    expect(result[0].quantity).toBe(7);
    expect(result[0].menuProductName).toBe("Original");
  });

  test("returns empty array for date with no shipments", async () => {
    const t = convexTest(schema);

    const result = await t.query(api.gofoodDepot.queries.getTodayShipments, {
      date: "2026-12-31",
    });

    expect(result.length).toBe(0);
  });
});

describe("getGoldfinchStickerInventory query", () => {
  test("returns only labeling-stage packaging components at Goldfinch", async () => {
    const t = convexTest(schema);
    const goldfinchId = await createGoldfinchLocation(t);

    // Create labeling sticker component
    const stickerId = await createStickerComponent(t, {
      code: "STK_OG",
      name: "Sticker OG",
    });

    // Create boxing component (should NOT be included)
    const boxId = await t.run(async (ctx) => {
      return await ctx.db.insert("componentTypes", {
        code: "BOX_SM",
        name: "Box Small",
        category: "packaging",
        unitCostIdr: 500,
        unit: "pcs",
        trackInventory: true,
        consumptionStage: "boxing",
        isActive: true,
        sortOrder: 1,
        createdBy: "test",
        createdAt: Date.now(),
      });
    });

    // Create stock for both at Goldfinch
    await createComponentStock(t, stickerId, goldfinchId, 20);
    await createComponentStock(t, boxId, goldfinchId, 10);

    const result = await t.query(
      api.gofoodDepot.queries.getGoldfinchStickerInventory,
      {}
    );

    // Should only include labeling-stage sticker, not boxing component
    expect(result.length).toBe(1);
    expect(result[0].componentName).toBe("Sticker OG");
    expect(result[0].totalStock).toBe(20);
  });

  test("returns empty array when no Goldfinch location", async () => {
    const t = convexTest(schema);
    // No Goldfinch location created

    const result = await t.query(
      api.gofoodDepot.queries.getGoldfinchStickerInventory,
      {}
    );

    expect(result.length).toBe(0);
  });
});
