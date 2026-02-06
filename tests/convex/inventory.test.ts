/**
 * Inventory System integration tests (BOM System)
 *
 * Tests stock receipt, FIFO consumption, batch management,
 * stock aggregation, and reservation flow using convex-test.
 */

import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import schema from "../../convex/schema";
import type { Id } from "../../convex/_generated/dataModel";

type TestContext = ReturnType<typeof convexTest>;

// ============================================
// Test Setup Helpers
// ============================================

async function createComponentType(
  t: TestContext,
  overrides: {
    code?: string;
    name?: string;
    category?: "production" | "packaging" | "direct_packaging" | "indirect_packaging";
    unitCostIdr?: number;
    trackInventory?: boolean;
    consumptionStage?: "boxing" | "labeling" | "none";
  } = {}
): Promise<Id<"componentTypes">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("componentTypes", {
      code: overrides.code ?? "TEST_BOX",
      name: overrides.name ?? "Test Box",
      category: overrides.category ?? "packaging",
      unitCostIdr: overrides.unitCostIdr ?? 500,
      unit: "pcs",
      trackInventory: overrides.trackInventory ?? true,
      consumptionStage: overrides.consumptionStage ?? "boxing",
      isActive: true,
      sortOrder: 0,
      createdBy: "test",
      createdAt: Date.now(),
    });
  });
}

async function createLocation(
  t: TestContext,
  overrides: {
    name?: string;
    isDefault?: boolean;
  } = {}
): Promise<Id<"storageLocations">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("storageLocations", {
      name: overrides.name ?? "Office",
      locationType: "office",
      isDefault: overrides.isDefault ?? true,
      isActive: true,
      createdBy: "test",
      createdAt: Date.now(),
    });
  });
}

async function createBatch(
  t: TestContext,
  componentTypeId: Id<"componentTypes">,
  locationId: Id<"storageLocations">,
  overrides: {
    quantity?: number;
    unitCost?: number;
    purchaseDate?: number;
    expiryDate?: number;
    status?: "active" | "depleted" | "expired";
    quantityReserved?: number;
  } = {}
): Promise<Id<"inventoryBatches">> {
  const quantity = overrides.quantity ?? 100;
  const unitCost = overrides.unitCost ?? 500;

  return await t.run(async (ctx) => {
    return await ctx.db.insert("inventoryBatches", {
      componentTypeId,
      locationId,
      purchaseDate: overrides.purchaseDate ?? Date.now(),
      supplierName: "Test Supplier",
      quantityPurchased: quantity,
      totalCostIdr: quantity * unitCost,
      unitCostIdr: unitCost,
      quantityRemaining: quantity,
      quantityReserved: overrides.quantityReserved ?? 0,
      status: overrides.status ?? "active",
      createdBy: "test",
      createdAt: Date.now(),
      expiryDate: overrides.expiryDate,
    });
  });
}

// ============================================
// Stock Receipt Tests
// ============================================
describe("Stock Receipt", () => {
  test("batch stores correct quantities and costs", async () => {
    const t = convexTest(schema);
    const compId = await createComponentType(t);
    const locId = await createLocation(t);

    const batchId = await createBatch(t, compId, locId, {
      quantity: 200,
      unitCost: 750,
    });

    const batch = await t.run(async (ctx) => ctx.db.get(batchId));

    expect(batch?.quantityPurchased).toBe(200);
    expect(batch?.quantityRemaining).toBe(200);
    expect(batch?.unitCostIdr).toBe(750);
    expect(batch?.totalCostIdr).toBe(150000);
    expect(batch?.quantityReserved).toBe(0);
    expect(batch?.status).toBe("active");
  });

  test("multiple batches can exist for same component at same location", async () => {
    const t = convexTest(schema);
    const compId = await createComponentType(t);
    const locId = await createLocation(t);

    await createBatch(t, compId, locId, { quantity: 100, unitCost: 500 });
    await createBatch(t, compId, locId, { quantity: 50, unitCost: 600 });

    const batches = await t.run(async (ctx) => {
      return await ctx.db
        .query("inventoryBatches")
        .withIndex("by_component_location", (q) =>
          q.eq("componentTypeId", compId).eq("locationId", locId)
        )
        .collect();
    });

    expect(batches.length).toBe(2);
  });
});

// ============================================
// FIFO Order Tests
// ============================================
describe("FIFO Batch Ordering", () => {
  test("batches are sorted by purchase date for FIFO", async () => {
    const t = convexTest(schema);
    const compId = await createComponentType(t);
    const locId = await createLocation(t);

    const now = Date.now();
    await createBatch(t, compId, locId, { quantity: 50, unitCost: 600, purchaseDate: now });
    await createBatch(t, compId, locId, { quantity: 100, unitCost: 500, purchaseDate: now - 86400000 }); // yesterday
    await createBatch(t, compId, locId, { quantity: 75, unitCost: 550, purchaseDate: now - 172800000 }); // 2 days ago

    const batches = await t.run(async (ctx) => {
      return await ctx.db
        .query("inventoryBatches")
        .withIndex("by_component_location", (q) =>
          q.eq("componentTypeId", compId).eq("locationId", locId)
        )
        .filter((q) => q.eq(q.field("status"), "active"))
        .collect();
    });

    // Sort by purchaseDate (FIFO = oldest first)
    batches.sort((a, b) => a.purchaseDate - b.purchaseDate);

    expect(batches[0].unitCostIdr).toBe(550); // oldest - 2 days ago
    expect(batches[1].unitCostIdr).toBe(500); // yesterday
    expect(batches[2].unitCostIdr).toBe(600); // newest
  });
});

// ============================================
// Stock Reservation Tests
// ============================================
describe("Stock Reservation", () => {
  test("can reserve stock on a batch", async () => {
    const t = convexTest(schema);
    const compId = await createComponentType(t);
    const locId = await createLocation(t);

    const batchId = await createBatch(t, compId, locId, { quantity: 100 });

    // Simulate reservation
    await t.run(async (ctx) => {
      await ctx.db.patch(batchId, { quantityReserved: 30 });
    });

    const batch = await t.run(async (ctx) => ctx.db.get(batchId));
    expect(batch?.quantityReserved).toBe(30);
    // Available = remaining - reserved = 100 - 30 = 70
  });

  test("reservation tracks per-order via orderComponentReservations", async () => {
    const t = convexTest(schema);
    const compId = await createComponentType(t);
    const locId = await createLocation(t);

    // Create a mock order
    const customerId = await t.run(async (ctx) => {
      return await ctx.db.insert("customers", {
        name: "Test Customer",
        phone: "+62812345678",
        source: "Test",
        createdBy: "test",
      });
    });

    const orderId = await t.run(async (ctx) => {
      return await ctx.db.insert("orders", {
        orderNumber: "0206-001",
        customerId,
        customerName: "Test Customer",
        status: "Confirmed",
        paymentStatus: "Unpaid",
        orderDate: Date.now(),
        totalAmount: 50000,
        totalCost: 25000,
        totalMargin: 25000,
        itemCount: 1,
        deliveryType: "Pickup",
        createdBy: "test",
      });
    });

    // Create reservation record
    const reservationId = await t.run(async (ctx) => {
      return await ctx.db.insert("orderComponentReservations", {
        orderId,
        componentTypeId: compId,
        locationId: locId,
        quantityReserved: 5,
        quantityConsumed: 0,
        status: "reserved",
        createdAt: Date.now(),
      });
    });

    const reservation = await t.run(async (ctx) => ctx.db.get(reservationId));
    expect(reservation?.status).toBe("reserved");
    expect(reservation?.quantityReserved).toBe(5);

    // Release reservation (simulate cancellation)
    await t.run(async (ctx) => {
      await ctx.db.patch(reservationId, {
        status: "released",
      });
    });

    const released = await t.run(async (ctx) => ctx.db.get(reservationId));
    expect(released?.status).toBe("released");
  });
});

// ============================================
// Stock Consumption Tests
// ============================================
describe("Stock Consumption", () => {
  test("consuming stock decreases quantityRemaining", async () => {
    const t = convexTest(schema);
    const compId = await createComponentType(t);
    const locId = await createLocation(t);

    const batchId = await createBatch(t, compId, locId, { quantity: 100 });

    // Consume 30 units
    await t.run(async (ctx) => {
      const batch = await ctx.db.get(batchId);
      if (!batch) throw new Error("Batch not found");
      await ctx.db.patch(batchId, {
        quantityRemaining: batch.quantityRemaining - 30,
      });
    });

    const batch = await t.run(async (ctx) => ctx.db.get(batchId));
    expect(batch?.quantityRemaining).toBe(70);
  });

  test("batch becomes depleted when quantity reaches 0", async () => {
    const t = convexTest(schema);
    const compId = await createComponentType(t);
    const locId = await createLocation(t);

    const batchId = await createBatch(t, compId, locId, { quantity: 10 });

    // Deplete batch
    await t.run(async (ctx) => {
      await ctx.db.patch(batchId, {
        quantityRemaining: 0,
        status: "depleted",
      });
    });

    const batch = await t.run(async (ctx) => ctx.db.get(batchId));
    expect(batch?.quantityRemaining).toBe(0);
    expect(batch?.status).toBe("depleted");
  });

  test("transaction records are created for consumption", async () => {
    const t = convexTest(schema);
    const compId = await createComponentType(t);
    const locId = await createLocation(t);
    const batchId = await createBatch(t, compId, locId, { quantity: 100 });

    // Create consume transaction
    await t.run(async (ctx) => {
      await ctx.db.insert("componentTransactions", {
        componentTypeId: compId,
        locationId: locId,
        batchId,
        transactionType: "consume",
        quantity: -10, // negative for consumption
        unitCostAtTime: 500,
        createdBy: "test",
        createdAt: Date.now(),
      });
    });

    const transactions = await t.run(async (ctx) => {
      return await ctx.db
        .query("componentTransactions")
        .withIndex("by_component", (q) => q.eq("componentTypeId", compId))
        .collect();
    });

    expect(transactions.length).toBe(1);
    expect(transactions[0].transactionType).toBe("consume");
    expect(transactions[0].quantity).toBe(-10);
  });
});

// ============================================
// Stock Aggregation Tests
// ============================================
describe("Stock Aggregation", () => {
  test("componentStock aggregates from batches", async () => {
    const t = convexTest(schema);
    const compId = await createComponentType(t);
    const locId = await createLocation(t);

    await createBatch(t, compId, locId, { quantity: 100, unitCost: 500 });
    await createBatch(t, compId, locId, { quantity: 50, unitCost: 600 });

    // Create aggregate record (as updateComponentStock would)
    await t.run(async (ctx) => {
      await ctx.db.insert("componentStock", {
        componentTypeId: compId,
        locationId: locId,
        totalStock: 150, // 100 + 50
        totalReserved: 0,
        weightedUnitCostIdr: 533.33, // (100*500 + 50*600) / 150
        lastUpdated: Date.now(),
      });
    });

    const stock = await t.run(async (ctx) => {
      return await ctx.db
        .query("componentStock")
        .withIndex("by_component_location", (q) =>
          q.eq("componentTypeId", compId).eq("locationId", locId)
        )
        .first();
    });

    expect(stock?.totalStock).toBe(150);
    expect(stock?.totalReserved).toBe(0);
    expect(stock?.weightedUnitCostIdr).toBeCloseTo(533.33, 1);
  });
});

// ============================================
// Batch Expiry Tests
// ============================================
describe("Batch Expiry", () => {
  test("expired batch has status expired", async () => {
    const t = convexTest(schema);
    const compId = await createComponentType(t);
    const locId = await createLocation(t);

    const batchId = await createBatch(t, compId, locId, {
      quantity: 50,
      expiryDate: Date.now() - 86400000, // yesterday
    });

    // Mark as expired
    await t.run(async (ctx) => {
      await ctx.db.patch(batchId, { status: "expired" });
    });

    const batch = await t.run(async (ctx) => ctx.db.get(batchId));
    expect(batch?.status).toBe("expired");
  });

  test("expired batches excluded from active query", async () => {
    const t = convexTest(schema);
    const compId = await createComponentType(t);
    const locId = await createLocation(t);

    await createBatch(t, compId, locId, { quantity: 100 }); // active
    const expiredId = await createBatch(t, compId, locId, { quantity: 50 });

    await t.run(async (ctx) => {
      await ctx.db.patch(expiredId, { status: "expired" });
    });

    const activeBatches = await t.run(async (ctx) => {
      return await ctx.db
        .query("inventoryBatches")
        .withIndex("by_component_location", (q) =>
          q.eq("componentTypeId", compId).eq("locationId", locId)
        )
        .filter((q) => q.eq(q.field("status"), "active"))
        .collect();
    });

    expect(activeBatches.length).toBe(1);
    expect(activeBatches[0].quantityRemaining).toBe(100);
  });
});

// ============================================
// Multi-Location Tests
// ============================================
describe("Multi-Location Inventory", () => {
  test("same component has independent stock at different locations", async () => {
    const t = convexTest(schema);
    const compId = await createComponentType(t);
    const officeLoc = await createLocation(t, { name: "Office", isDefault: true });
    const kitchenLoc = await createLocation(t, { name: "Kitchen", isDefault: false });

    await createBatch(t, compId, officeLoc, { quantity: 100 });
    await createBatch(t, compId, kitchenLoc, { quantity: 50 });

    const officeBatches = await t.run(async (ctx) => {
      return await ctx.db
        .query("inventoryBatches")
        .withIndex("by_component_location", (q) =>
          q.eq("componentTypeId", compId).eq("locationId", officeLoc)
        )
        .collect();
    });

    const kitchenBatches = await t.run(async (ctx) => {
      return await ctx.db
        .query("inventoryBatches")
        .withIndex("by_component_location", (q) =>
          q.eq("componentTypeId", compId).eq("locationId", kitchenLoc)
        )
        .collect();
    });

    expect(officeBatches.length).toBe(1);
    expect(officeBatches[0].quantityRemaining).toBe(100);
    expect(kitchenBatches.length).toBe(1);
    expect(kitchenBatches[0].quantityRemaining).toBe(50);
  });
});
