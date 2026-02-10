/**
 * GoFood Depot Edge Case & Integration Tests
 *
 * Tests for sticker deficit tracking, concurrent operations,
 * freshness queries, cron configuration, and regression safety.
 */

import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { internal, api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import type { Id } from "../../convex/_generated/dataModel";
import { readFileSync } from "fs";
import { join } from "path";

type TestContext = ReturnType<typeof convexTest>;

// ============================================
// Shared Helpers
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

// ============================================
// Sticker Deficit Edge Cases
// ============================================
describe("Sticker deficit tracking", () => {
  test("records stickerDeficit when stickers insufficient at Goldfinch", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    const goldfinchId = await createGoldfinchLocation(t);

    // Link sticker to product
    const stickerId = await t.run(async (ctx) => {
      return await ctx.db.insert("componentTypes", {
        code: "STK_OG",
        name: "Sticker OG",
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

    await t.run(async (ctx) => {
      await ctx.db.insert("menuProductComponents", {
        menuProductId: mpId,
        componentTypeId: stickerId,
        quantity: 1,
        sortOrder: 0,
        consumptionStage: "labeling",
      });
    });

    // Pre-seed depot stock (but NO sticker batches at Goldfinch)
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

    expect(result.deficits).toBe(1);

    // Check stickerDeficit was recorded
    const stock = await t.run(async (ctx) => {
      return await ctx.db
        .query("gofoodDepotStock")
        .withIndex("by_menuProduct", (q) => q.eq("menuProductId", mpId))
        .first();
    });

    expect(stock!.stickerDeficit).toBe(3);
  });

  test("deficit accumulates across multiple sales", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    await createGoldfinchLocation(t);

    const stickerId = await t.run(async (ctx) => {
      return await ctx.db.insert("componentTypes", {
        code: "STK_OG",
        name: "Sticker OG",
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

    await t.run(async (ctx) => {
      await ctx.db.insert("menuProductComponents", {
        menuProductId: mpId,
        componentTypeId: stickerId,
        quantity: 1,
        sortOrder: 0,
        consumptionStage: "labeling",
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("gofoodDepotStock", {
        menuProductId: mpId,
        quantity: 20,
        lastUpdated: Date.now(),
      });
    });

    // First sale: 2 deficit
    await t.mutation(internal.gofoodDepot.mutations.processSyncSales, {
      items: [{ menuProductId: mpId, quantity: 2 }],
    });

    // Second sale: 3 more deficit
    await t.mutation(internal.gofoodDepot.mutations.processSyncSales, {
      items: [{ menuProductId: mpId, quantity: 3 }],
    });

    const stock = await t.run(async (ctx) => {
      return await ctx.db
        .query("gofoodDepotStock")
        .withIndex("by_menuProduct", (q) => q.eq("menuProductId", mpId))
        .first();
    });

    // Should accumulate: 2 + 3 = 5
    expect(stock!.stickerDeficit).toBe(5);
  });
});

// ============================================
// Multiple Shipments Same Day
// ============================================
describe("Multiple shipments same day", () => {
  test("supports multiple shipment records on same date", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    await createOfficeLocation(t);
    await createGoldfinchLocation(t);
    const token = await createAuthUser(t, "kitchen");

    // First shipment
    await t.mutation(api.gofoodDepot.mutations.recordShipment, {
      token,
      items: [{ menuProductId: mpId, quantity: 5 }],
    });

    // Second shipment (emergency restock)
    await t.mutation(api.gofoodDepot.mutations.recordShipment, {
      token,
      items: [{ menuProductId: mpId, quantity: 3 }],
    });

    const stock = await t.run(async (ctx) => {
      return await ctx.db
        .query("gofoodDepotStock")
        .withIndex("by_menuProduct", (q) => q.eq("menuProductId", mpId))
        .first();
    });

    expect(stock!.quantity).toBe(8); // 5 + 3

    const shipments = await t.run(async (ctx) => {
      return await ctx.db.query("gofoodDepotShipments").collect();
    });

    expect(shipments.length).toBe(2);
  });
});

// ============================================
// Ship then Sell Sequence
// ============================================
describe("Ship then sell sequence", () => {
  test("stock correctly reflects ship + sell", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    await createOfficeLocation(t);
    await createGoldfinchLocation(t);
    const token = await createAuthUser(t, "kitchen");

    // Ship 10 boxes
    await t.mutation(api.gofoodDepot.mutations.recordShipment, {
      token,
      items: [{ menuProductId: mpId, quantity: 10 }],
    });

    // Sell 3 via GoBiz
    await t.mutation(internal.gofoodDepot.mutations.processSyncSales, {
      items: [{ menuProductId: mpId, quantity: 3 }],
    });

    const stock = await t.run(async (ctx) => {
      return await ctx.db
        .query("gofoodDepotStock")
        .withIndex("by_menuProduct", (q) => q.eq("menuProductId", mpId))
        .first();
    });

    expect(stock!.quantity).toBe(7); // 10 - 3
  });
});

// ============================================
// Freshness Query Tests
// ============================================
describe("getDepotFreshness query", () => {
  test("returns fresh status for stock shipped today", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);

    // Today's date in WIB
    const wibNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const today = wibNow.toISOString().slice(0, 10);

    await t.run(async (ctx) => {
      await ctx.db.insert("gofoodDepotStock", {
        menuProductId: mpId,
        quantity: 5,
        lastUpdated: Date.now(),
      });
      await ctx.db.insert("gofoodDepotShipments", {
        date: today,
        menuProductId: mpId,
        quantity: 5,
        stickersTransferred: 5,
        shippedBy: "test",
        timestamp: Date.now(),
      });
    });

    const result = await t.query(api.gofoodDepot.queries.getDepotFreshness, {
      menuProductId: mpId,
    });

    expect(result.currentQuantity).toBe(5);
    expect(result.freshness).toBe("fresh");
    expect(result.maxAgeDays).toBe(0);
  });

  test("returns zero quantity when no depot stock", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);

    const result = await t.query(api.gofoodDepot.queries.getDepotFreshness, {
      menuProductId: mpId,
    });

    expect(result.currentQuantity).toBe(0);
    expect(result.ageBreakdown.length).toBe(0);
    expect(result.freshness).toBe("fresh"); // No stock = fresh (maxAge 0)
  });
});

// ============================================
// GoFood Daily Order Edge Cases
// ============================================
describe("getGoFoodDailyOrder edge cases", () => {
  test("toShipToday is zero when depot has enough stock", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t, { code: "OG", name: "Original" });

    await t.run(async (ctx) => {
      await ctx.db.insert("productionProductTargets", {
        date: "2026-02-11",
        source: "gofood",
        menuProductId: mpId,
        quantity: 5,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("gofoodDepotStock", {
        menuProductId: mpId,
        quantity: 8, // More than target
        lastUpdated: Date.now(),
      });
    });

    const result = await t.query(
      api.gofoodDepot.queries.getGoFoodDailyOrder,
      { date: "2026-02-11" }
    );

    expect(result!.items[0].toShipToday).toBe(0); // max(0, 5 - 8)
    expect(result!.items[0].existingAtDepot).toBe(8);
    expect(result!.items[0].targetQty).toBe(5);
  });

  test("includes stickerDeficit in order items", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t, { code: "OG", name: "Original" });

    await t.run(async (ctx) => {
      await ctx.db.insert("productionProductTargets", {
        date: "2026-02-11",
        source: "gofood",
        menuProductId: mpId,
        quantity: 10,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("gofoodDepotStock", {
        menuProductId: mpId,
        quantity: 5,
        stickerDeficit: 3,
        lastUpdated: Date.now(),
      });
    });

    const result = await t.query(
      api.gofoodDepot.queries.getGoFoodDailyOrder,
      { date: "2026-02-11" }
    );

    expect(result!.items[0].stickerDeficit).toBe(3);
  });

  test("order number format is GF-MMDD", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("productionProductTargets", {
        date: "2026-03-15",
        source: "gofood",
        menuProductId: mpId,
        quantity: 5,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const result = await t.query(
      api.gofoodDepot.queries.getGoFoodDailyOrder,
      { date: "2026-03-15" }
    );

    expect(result!.orderNumber).toBe("GF-0315");
  });

  test("only includes gofood source targets (not consignment)", async () => {
    const t = convexTest(schema);
    const mpGf = await createMenuProduct(t, { code: "GF", name: "GoFood Item" });
    const mpCon = await createMenuProduct(t, { code: "CON", name: "Consignment Item" });

    await t.run(async (ctx) => {
      // GoFood target
      await ctx.db.insert("productionProductTargets", {
        date: "2026-02-11",
        source: "gofood",
        menuProductId: mpGf,
        quantity: 10,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      // Consignment target (should NOT appear)
      await ctx.db.insert("productionProductTargets", {
        date: "2026-02-11",
        source: "consignment",
        menuProductId: mpCon,
        quantity: 20,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const result = await t.query(
      api.gofoodDepot.queries.getGoFoodDailyOrder,
      { date: "2026-02-11" }
    );

    expect(result!.items.length).toBe(1);
    expect(result!.items[0].productName).toBe("GoFood Item");
  });
});

// ============================================
// Cron Configuration Tests
// ============================================
describe("GoBiz auto-sync cron", () => {
  test("crons.ts contains GoBiz auto-sync at WIB business hours", () => {
    const cronsPath = join(__dirname, "../../convex/crons.ts");
    const cronsContent = readFileSync(cronsPath, "utf-8");

    expect(cronsContent).toContain("sync gobiz revenue");
    expect(cronsContent).toContain("autoSyncGoBizRevenue");
    // WIB hours: 8,10,12,14,16,18,20 = UTC 1,3,5,7,9,11,13
    expect(cronsContent).toContain("0 1,3,5,7,9,11,13 * * *");
  });
});

// ============================================
// Regression Safety Tests
// ============================================
describe("Regression: existing tables unchanged", () => {
  test("productionCounts still has boxed, stickered, packed fields", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);

    const countId = await t.run(async (ctx) => {
      return await ctx.db.insert("productionCounts", {
        menuProductId: mpId,
        boxed: 10,
        stickered: 5,
        packed: 3,
      });
    });

    const count = await t.run(async (ctx) => ctx.db.get(countId));
    expect(count!.boxed).toBe(10);
    expect(count!.stickered).toBe(5);
    expect(count!.packed).toBe(3);
  });

  test("productionLog still accepts box/sticker/pack actions", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);

    const logId = await t.run(async (ctx) => {
      return await ctx.db.insert("productionLog", {
        menuProductId: mpId,
        action: "box",
        quantity: 5,
        timestamp: Date.now(),
        performedBy: "test",
      });
    });

    const log = await t.run(async (ctx) => ctx.db.get(logId));
    expect(log!.action).toBe("box");
  });

  test("inventory batches still work at non-Goldfinch locations", async () => {
    const t = convexTest(schema);
    const officeId = await createOfficeLocation(t);

    const compId = await t.run(async (ctx) => {
      return await ctx.db.insert("componentTypes", {
        code: "BOX_SM",
        name: "Box Small",
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

    const batchId = await t.run(async (ctx) => {
      return await ctx.db.insert("inventoryBatches", {
        componentTypeId: compId,
        locationId: officeId,
        purchaseDate: Date.now(),
        supplierName: "Test",
        quantityPurchased: 100,
        totalCostIdr: 50000,
        unitCostIdr: 500,
        quantityRemaining: 100,
        quantityReserved: 0,
        status: "active",
        createdBy: "test",
        createdAt: Date.now(),
      });
    });

    const batch = await t.run(async (ctx) => ctx.db.get(batchId));
    expect(batch!.quantityRemaining).toBe(100);
  });
});

// ============================================
// Auth Edge Cases
// ============================================
describe("Auth requirements", () => {
  test("recordShipment requires authentication", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    await createOfficeLocation(t);
    await createGoldfinchLocation(t);

    await expect(
      t.mutation(api.gofoodDepot.mutations.recordShipment, {
        token: "invalid-token",
        items: [{ menuProductId: mpId, quantity: 5 }],
      })
    ).rejects.toThrow();
  });

  test("adjustDepotStock requires manager or admin role", async () => {
    const t = convexTest(schema);
    const mpId = await createMenuProduct(t);
    const kitchenToken = await createAuthUser(t, "kitchen");

    await expect(
      t.mutation(api.gofoodDepot.mutations.adjustDepotStock, {
        token: kitchenToken,
        menuProductId: mpId,
        newQuantity: 5,
        reason: "test",
      })
    ).rejects.toThrow();
  });
});

// ============================================
// Goldfinch Sticker Inventory Edge Cases
// ============================================
describe("getGoldfinchStickerInventory edge cases", () => {
  test("excludes production-category components", async () => {
    const t = convexTest(schema);
    const goldfinchId = await createGoldfinchLocation(t);

    // Create production component (NOT packaging)
    const prodCompId = await t.run(async (ctx) => {
      return await ctx.db.insert("componentTypes", {
        code: "BIG_BALL",
        name: "Big Ball",
        category: "production",
        unitCostIdr: 0,
        unit: "pcs",
        trackInventory: false,
        consumptionStage: "production",
        isActive: true,
        sortOrder: 0,
        createdBy: "test",
        createdAt: Date.now(),
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("componentStock", {
        componentTypeId: prodCompId,
        locationId: goldfinchId,
        totalStock: 100,
        totalReserved: 0,
        weightedUnitCostIdr: 0,
        lastUpdated: Date.now(),
      });
    });

    const result = await t.query(
      api.gofoodDepot.queries.getGoldfinchStickerInventory,
      {}
    );

    expect(result.length).toBe(0);
  });

  test("calculates available = totalStock - totalReserved", async () => {
    const t = convexTest(schema);
    const goldfinchId = await createGoldfinchLocation(t);

    const stickerId = await t.run(async (ctx) => {
      return await ctx.db.insert("componentTypes", {
        code: "STK_OG",
        name: "Sticker OG",
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

    await t.run(async (ctx) => {
      await ctx.db.insert("componentStock", {
        componentTypeId: stickerId,
        locationId: goldfinchId,
        totalStock: 50,
        totalReserved: 10,
        weightedUnitCostIdr: 200,
        lastUpdated: Date.now(),
      });
    });

    const result = await t.query(
      api.gofoodDepot.queries.getGoldfinchStickerInventory,
      {}
    );

    expect(result.length).toBe(1);
    expect(result[0].totalStock).toBe(50);
    expect(result[0].totalReserved).toBe(10);
    expect(result[0].available).toBe(40);
  });
});
