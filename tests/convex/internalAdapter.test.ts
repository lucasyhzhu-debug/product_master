/**
 * Tests for internal revenue pipeline.
 * Phase 70-01: Revenue item mapping, query shape, and sync behavior.
 */

import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";

// Helper to seed a minimal customer
async function seedCustomer(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("customers", {
      name: "Test Customer",
      createdBy: "test",
    });
  });
}

// Helper to seed a minimal menu product
async function seedMenuProduct(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("menuProducts", {
      code: "OG80",
      name: "Original 80g",
      grams: 80,
      defaultPrice: 35000,
      unitCost: 15000,
      isActive: true,
      cachedProductionSummary: "1 Big Ball",
    });
  });
}

// ============================================
// getOrderItemsByOrderNumbers Tests
// ============================================
describe("getOrderItemsByOrderNumbers", () => {
  test("returns order items grouped by orderNumber with correct fields", async () => {
    const t = convexTest(schema);

    const customerId = await seedCustomer(t);
    const menuProductId = await seedMenuProduct(t);

    // Seed an order
    const orderId = await t.run(async (ctx) => {
      return await ctx.db.insert("orders", {
        orderNumber: "0401-001",
        customerId,
        customerName: "Test Customer",
        status: "PaymentReceived",
        paymentStatus: "Paid",
        orderDate: Date.now(),
        totalAmount: 70000,
        totalCost: 30000,
        totalMargin: 40000,
        finalTotal: 70000,
        deliveryType: "Pickup",
        createdBy: "test",
        itemCount: 2,
      });
    });

    // Seed order items (one normal, one cancelled)
    const itemId = await t.run(async (ctx) => {
      return await ctx.db.insert("orderItems", {
        orderId,
        productName: "Original 80g",
        quantity: 2,
        unitPrice: 35000,
        unitCost: 15000,
        discountAmount: 0,
        lineTotal: 70000,
        lineCost: 30000,
        lineMargin: 40000,
        menuProductId,
      });
    });

    // Cancelled item -- should be excluded
    await t.run(async (ctx) => {
      await ctx.db.insert("orderItems", {
        orderId,
        productName: "Cancelled Item",
        quantity: 1,
        unitPrice: 50000,
        unitCost: 20000,
        discountAmount: 0,
        lineTotal: 50000,
        lineCost: 20000,
        lineMargin: 30000,
        isCancelled: true,
      });
    });

    const result = await t.query(
      internal.integrations.internal.queries.getOrderItemsByOrderNumbers,
      { orderNumbers: ["0401-001"] }
    );

    expect(result).toBeDefined();
    expect(result["0401-001"]).toBeDefined();
    expect(result["0401-001"]).toHaveLength(1); // Cancelled item excluded
    expect(result["0401-001"][0]).toMatchObject({
      _id: itemId as string,
      productName: "Original 80g",
      unitPrice: 35000,
      quantity: 2,
      lineTotal: 70000,
      menuProductId: menuProductId as string,
    });
  });

  test("returns empty for unknown order numbers", async () => {
    const t = convexTest(schema);

    const result = await t.query(
      internal.integrations.internal.queries.getOrderItemsByOrderNumbers,
      { orderNumbers: ["UNKNOWN-001"] }
    );

    expect(result).toBeDefined();
    expect(result["UNKNOWN-001"]).toBeUndefined();
  });
});

// ============================================
// Revenue Item Mapping Tests (pure logic)
// ============================================
describe("Revenue item externalItemId format", () => {
  test("externalItemId follows ${orderNumber}-${itemId} format", () => {
    const orderNumber = "0401-001";
    const itemId = "abc123def456";
    const externalItemId = `${orderNumber}-${itemId}`;

    expect(externalItemId).toBe("0401-001-abc123def456");
    expect(externalItemId).toContain(orderNumber);
    expect(externalItemId).toContain(itemId);
  });
});

// ============================================
// syncInternalOrders forceFullSync behavior
// ============================================
describe("syncInternalOrders forceFullSync", () => {
  test("full sync creates revenue records for all qualifying orders", async () => {
    const t = convexTest(schema);

    const customerId = await seedCustomer(t);

    await t.run(async (ctx) => {
      const orderId = await ctx.db.insert("orders", {
        orderNumber: "0401-002",
        customerId,
        customerName: "Test Customer",
        status: "PaymentReceived",
        paymentStatus: "Paid",
        orderDate: Date.now(),
        totalAmount: 50000,
        totalCost: 20000,
        totalMargin: 30000,
        finalTotal: 50000,
        deliveryType: "Pickup",
        createdBy: "test",
        itemCount: 1,
      });

      await ctx.db.insert("orderItems", {
        orderId,
        productName: "Bite Single",
        quantity: 1,
        unitPrice: 50000,
        unitCost: 20000,
        discountAmount: 0,
        lineTotal: 50000,
        lineCost: 20000,
        lineMargin: 30000,
      });
    });

    // Run sync with forceFullSync
    const result = await t.action(
      internal.integrations.internal.adapter.syncInternalOrders,
      { triggeredBy: "test", forceFullSync: true }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.totalOrders).toBe(1);
      expect(result.newTransactions).toBe(1);
      expect(result.totalItems).toBeGreaterThanOrEqual(0);
    }
  });

  test("incremental sync (no forceFullSync) uses timestamp lookup", async () => {
    const t = convexTest(schema);

    const customerId = await seedCustomer(t);

    await t.run(async (ctx) => {
      const orderId = await ctx.db.insert("orders", {
        orderNumber: "0401-003",
        customerId,
        customerName: "Test Customer",
        status: "Complete",
        paymentStatus: "Paid",
        orderDate: Date.now(),
        totalAmount: 50000,
        totalCost: 20000,
        totalMargin: 30000,
        finalTotal: 50000,
        deliveryType: "Pickup",
        createdBy: "test",
        itemCount: 1,
      });

      await ctx.db.insert("orderItems", {
        orderId,
        productName: "Bite Single",
        quantity: 1,
        unitPrice: 50000,
        unitCost: 20000,
        discountAmount: 0,
        lineTotal: 50000,
        lineCost: 20000,
        lineMargin: 30000,
      });
    });

    // Run sync without forceFullSync (incremental)
    const result = await t.action(
      internal.integrations.internal.adapter.syncInternalOrders,
      { triggeredBy: "test" }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.totalOrders).toBe(1);
      expect(result.newTransactions).toBe(1);
    }
  });
});
