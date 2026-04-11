/**
 * Product Inventory Substitution Tests (Phase 78)
 *
 * Tests: resolveSubstitutionPlan pure helper, menuProducts update validation,
 * fulfillFromInventory integration, getStockForOrder integration.
 */

import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { resolveSubstitutionPlan } from "../../convex/productInventory/substitution";
import type { Id } from "../../convex/_generated/dataModel";

// Worktree-aware module loading: convex-test defaults to import.meta.glob
// relative to node_modules/convex-test which resolves to the main repo.
// Provide explicit modules so tests use this worktree's convex/ files.
const modules = import.meta.glob("../../convex/**/*.*s");

type TestContext = ReturnType<typeof convexTest>;

// ============================================
// Test Helpers
// ============================================

function mockMenuProduct(overrides: Record<string, unknown> = {}): any {
  return {
    _id: "test_product" as any,
    _creationTime: Date.now(),
    code: "TEST",
    name: "Test Product",
    grams: 80,
    defaultPrice: 15000,
    isActive: true,
    unitCost: 5000,
    cachedProductionSummary: "1 Big",
    ...overrides,
  };
}

async function createTestUser(t: TestContext) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Test Admin",
      pinHash: "salt:hash1234",
      role: "admin",
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    });
    await ctx.db.insert("sessions", {
      userId,
      token: "test-token-admin",
      expiresAt: Date.now() + 86400000,
      createdAt: Date.now(),
    });
    return "test-token-admin";
  });
}

async function createMenuProduct(
  t: TestContext,
  overrides: Record<string, unknown> = {}
): Promise<Id<"menuProducts">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("menuProducts", {
      code: `MP-${Math.random().toString(36).substr(2, 6)}`,
      name: "Test Product",
      grams: 80,
      defaultPrice: 15000,
      isActive: true,
      unitCost: 5000,
      cachedProductionSummary: "1 Big",
      ...overrides,
    } as any);
  });
}

async function createLocation(t: TestContext): Promise<Id<"storageLocations">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("storageLocations", {
      name: "Office",
      locationType: "office",
      isActive: true,
      createdBy: "test",
      createdAt: Date.now(),
    });
  });
}

async function createStockRow(
  t: TestContext,
  menuProductId: Id<"menuProducts">,
  locationId: Id<"storageLocations">,
  quantity: number
): Promise<Id<"productInventory">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("productInventory", {
      menuProductId,
      locationId,
      quantity,
      lastUpdated: Date.now(),
    });
  });
}

async function createOrder(
  t: TestContext,
  items: Array<{ menuProductId: Id<"menuProducts">; quantity: number; productName: string }>
) {
  return await t.run(async (ctx) => {
    const customerId = await ctx.db.insert("customers", {
      name: "Test Customer",
      createdBy: "test",
    });

    const totalAmount = items.reduce((sum, i) => sum + i.quantity * 15000, 0);
    const totalCost = items.reduce((sum, i) => sum + i.quantity * 5000, 0);

    const orderId = await ctx.db.insert("orders", {
      orderNumber: "TEST-001",
      customerId,
      customerName: "Test Customer",
      status: "PaymentReceived",
      paymentStatus: "Paid",
      orderDate: Date.now(),
      totalAmount,
      totalCost,
      totalMargin: totalAmount - totalCost,
      finalTotal: totalAmount,
      deliveryType: "Delivery",
      createdBy: "test",
      itemCount: items.length,
      isKitchenVisible: false,
    });

    const orderItemIds: Id<"orderItems">[] = [];
    for (const item of items) {
      const id = await ctx.db.insert("orderItems", {
        orderId,
        menuProductId: item.menuProductId,
        quantity: item.quantity,
        productName: item.productName,
        unitPrice: 15000,
        unitCost: 5000,
        discountAmount: 0,
        lineTotal: 15000 * item.quantity,
        lineCost: 5000 * item.quantity,
        lineMargin: 10000 * item.quantity,
      });
      orderItemIds.push(id);
    }
    return { orderId, orderItemIds };
  });
}

async function createOrderStaffUser(t: TestContext) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Order Staff",
      pinHash: "salt:hash5678",
      role: "order_staff",
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    });
    await ctx.db.insert("sessions", {
      userId,
      token: "test-token-staff",
      expiresAt: Date.now() + 86400000,
      createdAt: Date.now(),
    });
    return "test-token-staff";
  });
}

// ============================================
// 1. resolveSubstitutionPlan Pure Function Tests
// ============================================

describe("resolveSubstitutionPlan", () => {
  test("no substitution configured returns all from direct", () => {
    const product = mockMenuProduct();
    const result = resolveSubstitutionPlan(3, 5, product, null);
    expect(result.directUnits).toBe(3);
    expect(result.substituteUnits).toBe(0);
    expect(result.needsSubstitution).toBe(false);
    expect(result.sourceProduct).toBeNull();
  });

  test("sufficient direct stock uses direct only even with substitution configured", () => {
    const product = mockMenuProduct({
      fulfillFromProductId: "source_id",
      fulfillMultiplier: 3,
    });
    const source = mockMenuProduct({ _id: "source_id", name: "Source" });
    const result = resolveSubstitutionPlan(3, 5, product, source);
    expect(result.directUnits).toBe(3);
    expect(result.substituteUnits).toBe(0);
    expect(result.needsSubstitution).toBe(false);
  });

  test("partial substitution: some direct + remainder from substitute", () => {
    const product = mockMenuProduct({
      fulfillFromProductId: "source_id",
      fulfillMultiplier: 3,
    });
    const source = mockMenuProduct({ _id: "source_id", name: "Source" });
    const result = resolveSubstitutionPlan(3, 1, product, source);
    expect(result.directUnits).toBe(1);
    expect(result.substituteUnits).toBe(6); // shortfall 2 * multiplier 3
    expect(result.needsSubstitution).toBe(true);
    expect(result.sourceProduct).toBe(source);
  });

  test("full substitution: zero direct stock", () => {
    const product = mockMenuProduct({
      fulfillFromProductId: "source_id",
      fulfillMultiplier: 3,
    });
    const source = mockMenuProduct({ _id: "source_id", name: "Source" });
    const result = resolveSubstitutionPlan(3, 0, product, source);
    expect(result.directUnits).toBe(0);
    expect(result.substituteUnits).toBe(9); // 3 * 3
    expect(result.needsSubstitution).toBe(true);
  });

  test("negative direct available treated as zero", () => {
    const product = mockMenuProduct({
      fulfillFromProductId: "source_id",
      fulfillMultiplier: 3,
    });
    const source = mockMenuProduct({ _id: "source_id", name: "Source" });
    const result = resolveSubstitutionPlan(2, -5, product, source);
    expect(result.directUnits).toBe(0);
    expect(result.substituteUnits).toBe(6); // 2 * 3
    expect(result.needsSubstitution).toBe(true);
  });

  test("source product null falls back to direct-only", () => {
    const product = mockMenuProduct({
      fulfillFromProductId: "source_id",
      fulfillMultiplier: 3,
    });
    const result = resolveSubstitutionPlan(3, 0, product, null);
    expect(result.directUnits).toBe(3);
    expect(result.substituteUnits).toBe(0);
    expect(result.needsSubstitution).toBe(false);
  });
});

// ============================================
// 2. menuProducts Update Validation Tests
// ============================================

describe("menuProducts update validation", () => {
  test("self-reference rejected", async () => {
    const t = convexTest(schema, modules);
    const token = await createTestUser(t);
    const productA = await createMenuProduct(t, { name: "Product A" });

    await expect(
      t.mutation(api.menuProducts.mutations.update, {
        token,
        id: productA,
        fulfillFromProductId: productA,
        fulfillMultiplier: 3,
      })
    ).rejects.toThrow("Product cannot fulfill from itself");
  });

  test("forward chain rejected", async () => {
    const t = convexTest(schema, modules);
    const token = await createTestUser(t);
    const productC = await createMenuProduct(t, { name: "Product C (source)" });
    // Product B already has substitution configured
    const productB = await createMenuProduct(t, {
      name: "Product B",
      fulfillFromProductId: productC,
      fulfillMultiplier: 3,
    });
    const productA = await createMenuProduct(t, { name: "Product A" });

    await expect(
      t.mutation(api.menuProducts.mutations.update, {
        token,
        id: productA,
        fulfillFromProductId: productB,
        fulfillMultiplier: 3,
      })
    ).rejects.toThrow("chaining not allowed");
  });

  test("reverse chain rejected", async () => {
    const t = convexTest(schema, modules);
    const token = await createTestUser(t);
    const productA = await createMenuProduct(t, { name: "Product A (source)" });
    // Product C already uses A as source
    await createMenuProduct(t, {
      name: "Product C",
      fulfillFromProductId: productA,
      fulfillMultiplier: 3,
    });
    const productD = await createMenuProduct(t, { name: "Product D" });

    await expect(
      t.mutation(api.menuProducts.mutations.update, {
        token,
        id: productA,
        fulfillFromProductId: productD,
        fulfillMultiplier: 3,
      })
    ).rejects.toThrow("chaining not allowed");
  });

  test("inactive target rejected", async () => {
    const t = convexTest(schema, modules);
    const token = await createTestUser(t);
    const inactiveProduct = await createMenuProduct(t, { name: "Inactive", isActive: false });
    const productA = await createMenuProduct(t, { name: "Product A" });

    await expect(
      t.mutation(api.menuProducts.mutations.update, {
        token,
        id: productA,
        fulfillFromProductId: inactiveProduct,
        fulfillMultiplier: 3,
      })
    ).rejects.toThrow("Source product must be active");
  });

  test("multiplier < 2 rejected", async () => {
    const t = convexTest(schema, modules);
    const token = await createTestUser(t);
    const source = await createMenuProduct(t, { name: "Source" });
    const productA = await createMenuProduct(t, { name: "Product A" });

    await expect(
      t.mutation(api.menuProducts.mutations.update, {
        token,
        id: productA,
        fulfillFromProductId: source,
        fulfillMultiplier: 1,
      })
    ).rejects.toThrow("fulfillMultiplier must be an integer >= 2");
  });

  test("non-integer multiplier rejected", async () => {
    const t = convexTest(schema, modules);
    const token = await createTestUser(t);
    const source = await createMenuProduct(t, { name: "Source" });
    const productA = await createMenuProduct(t, { name: "Product A" });

    await expect(
      t.mutation(api.menuProducts.mutations.update, {
        token,
        id: productA,
        fulfillFromProductId: source,
        fulfillMultiplier: 2.5,
      })
    ).rejects.toThrow("fulfillMultiplier must be an integer >= 2");
  });

  test("valid substitution accepted", async () => {
    const t = convexTest(schema, modules);
    const token = await createTestUser(t);
    const source = await createMenuProduct(t, { name: "Dubai Single" });
    const triple = await createMenuProduct(t, { name: "Dubai Triple" });

    const result = await t.mutation(api.menuProducts.mutations.update, {
      token,
      id: triple,
      fulfillFromProductId: source,
      fulfillMultiplier: 3,
    });

    expect(result).toBe(triple);

    // Verify fields were saved
    const updated = await t.run(async (ctx) => ctx.db.get(triple));
    expect(updated?.fulfillFromProductId).toBe(source);
    expect(updated?.fulfillMultiplier).toBe(3);
  });

  test("clear substitution accepted", async () => {
    const t = convexTest(schema, modules);
    const token = await createTestUser(t);
    const source = await createMenuProduct(t, { name: "Dubai Single" });
    const triple = await createMenuProduct(t, {
      name: "Dubai Triple",
      fulfillFromProductId: source,
      fulfillMultiplier: 3,
    });

    await t.mutation(api.menuProducts.mutations.update, {
      token,
      id: triple,
      clearFulfillFrom: true,
    });

    const updated = await t.run(async (ctx) => ctx.db.get(triple));
    expect(updated?.fulfillFromProductId).toBeUndefined();
    expect(updated?.fulfillMultiplier).toBeUndefined();
  });
});

// ============================================
// 3. fulfillFromInventory Integration Tests
// ============================================

describe("fulfillFromInventory with substitution", () => {
  test("basic substitution: partial direct + substitute", async () => {
    const t = convexTest(schema, modules);
    const staffToken = await createOrderStaffUser(t);
    const locationId = await createLocation(t);

    const singleId = await createMenuProduct(t, { name: "Dubai Single", productType: "food" });
    const tripleId = await createMenuProduct(t, {
      name: "Dubai Triple",
      productType: "food",
      fulfillFromProductId: singleId,
      fulfillMultiplier: 3,
    });

    // Direct stock = 1 triple, Substitute stock = 10 singles
    await createStockRow(t, tripleId, locationId, 1);
    await createStockRow(t, singleId, locationId, 10);

    const { orderId } = await createOrder(t, [
      { menuProductId: tripleId, quantity: 3, productName: "Dubai Triple" },
    ]);

    const result = await t.mutation(api.productInventory.mutations.fulfillFromInventory, {
      token: staffToken,
      orderId,
      locationId,
    });

    expect(result.success).toBe(true);
    expect(result.itemsFulfilled).toBe(1);
    expect(result.deductions).toHaveLength(1);
    expect(result.deductions[0].used).toBe(1); // 1 direct
    expect(result.deductions[0].substituteUsed).toBe(6); // shortfall 2 * multiplier 3
    expect(result.deductions[0].substituteProductName).toBe("Dubai Single");

    // Verify stock levels
    const tripleStock = await t.run(async (ctx) =>
      ctx.db.query("productInventory").withIndex("by_product_location", (q) =>
        q.eq("menuProductId", tripleId).eq("locationId", locationId)
      ).first()
    );
    const singleStock = await t.run(async (ctx) =>
      ctx.db.query("productInventory").withIndex("by_product_location", (q) =>
        q.eq("menuProductId", singleId).eq("locationId", locationId)
      ).first()
    );

    expect(tripleStock?.quantity).toBe(0); // 1 - 1
    expect(singleStock?.quantity).toBe(4); // 10 - 6
  });

  test("no substitution needed when direct stock sufficient", async () => {
    const t = convexTest(schema, modules);
    const staffToken = await createOrderStaffUser(t);
    const locationId = await createLocation(t);

    const singleId = await createMenuProduct(t, { name: "Dubai Single", productType: "food" });
    const tripleId = await createMenuProduct(t, {
      name: "Dubai Triple",
      productType: "food",
      fulfillFromProductId: singleId,
      fulfillMultiplier: 3,
    });

    await createStockRow(t, tripleId, locationId, 5);
    await createStockRow(t, singleId, locationId, 10);

    const { orderId } = await createOrder(t, [
      { menuProductId: tripleId, quantity: 3, productName: "Dubai Triple" },
    ]);

    const result = await t.mutation(api.productInventory.mutations.fulfillFromInventory, {
      token: staffToken,
      orderId,
      locationId,
    });

    expect(result.success).toBe(true);
    expect(result.deductions[0].used).toBe(3);
    expect(result.deductions[0].substituteUsed).toBeUndefined(); // no substitution

    // Single stock untouched
    const singleStock = await t.run(async (ctx) =>
      ctx.db.query("productInventory").withIndex("by_product_location", (q) =>
        q.eq("menuProductId", singleId).eq("locationId", locationId)
      ).first()
    );
    expect(singleStock?.quantity).toBe(10);
  });

  test("two items sharing same substitute source get correct cumulative deductions", async () => {
    const t = convexTest(schema, modules);
    const staffToken = await createOrderStaffUser(t);
    const locationId = await createLocation(t);

    // Shared source: Dubai Single with 12 stock
    const singleId = await createMenuProduct(t, { name: "Dubai Single", productType: "food" });

    // Two products both substituting from singleId
    const tripleAId = await createMenuProduct(t, {
      name: "Dubai Triple",
      productType: "food",
      fulfillFromProductId: singleId,
      fulfillMultiplier: 3,
    });
    const tripleBId = await createMenuProduct(t, {
      name: "Nutella Triple",
      productType: "food",
      fulfillFromProductId: singleId,
      fulfillMultiplier: 3,
    });

    // Both have 0 direct stock
    await createStockRow(t, tripleAId, locationId, 0);
    await createStockRow(t, tripleBId, locationId, 0);
    await createStockRow(t, singleId, locationId, 12);

    const { orderId } = await createOrder(t, [
      { menuProductId: tripleAId, quantity: 1, productName: "Dubai Triple" },
      { menuProductId: tripleBId, quantity: 1, productName: "Nutella Triple" },
    ]);

    const result = await t.mutation(api.productInventory.mutations.fulfillFromInventory, {
      token: staffToken,
      orderId,
      locationId,
    });

    expect(result.success).toBe(true);
    expect(result.deductions).toHaveLength(2);

    // First item: 0 direct + 3 substitute (12 - 3 = 9 remaining)
    expect(result.deductions[0].substituteUsed).toBe(3);
    expect(result.deductions[0].substituteRemaining).toBe(9);

    // Second item: 0 direct + 3 substitute (9 - 3 = 6 remaining, NOT 12 - 3 = 9)
    expect(result.deductions[1].substituteUsed).toBe(3);
    expect(result.deductions[1].substituteRemaining).toBe(6);

    // Verify actual stock
    const singleStock = await t.run(async (ctx) =>
      ctx.db.query("productInventory").withIndex("by_product_location", (q) =>
        q.eq("menuProductId", singleId).eq("locationId", locationId)
      ).first()
    );
    expect(singleStock?.quantity).toBe(6); // 12 - 3 - 3
  });
});

// ============================================
// 4. getStockForOrder Integration Tests
// ============================================

describe("getStockForOrder with substitution", () => {
  test("returns substitution data when direct stock low", async () => {
    const t = convexTest(schema, modules);
    const locationId = await createLocation(t);

    const singleId = await createMenuProduct(t, { name: "Dubai Single", productType: "food" });
    const tripleId = await createMenuProduct(t, {
      name: "Dubai Triple",
      productType: "food",
      fulfillFromProductId: singleId,
      fulfillMultiplier: 3,
    });

    await createStockRow(t, tripleId, locationId, 1);
    await createStockRow(t, singleId, locationId, 10);

    const { orderId } = await createOrder(t, [
      { menuProductId: tripleId, quantity: 3, productName: "Dubai Triple" },
    ]);

    const result = await t.query(api.productInventory.queries.getStockForOrder, {
      orderId,
      locationId,
    });

    expect(result).toHaveLength(1);
    expect(result[0].hasSubstitution).toBe(true);
    expect(result[0].quantityAvailable).toBe(1); // direct
    expect(result[0].substituteNeeded).toBe(6); // (3 - 1) * 3
    expect(result[0].substituteAvailable).toBe(10);
    expect(result[0].substituteProductName).toBe("Dubai Single");
    expect(result[0].substituteMultiplier).toBe(3);
    expect(result[0].isSufficient).toBe(true); // overall: substitute covers the shortfall
  });

  test("returns isSufficient false when both sources insufficient", async () => {
    const t = convexTest(schema, modules);
    const locationId = await createLocation(t);

    const singleId = await createMenuProduct(t, { name: "Dubai Single", productType: "food" });
    const tripleId = await createMenuProduct(t, {
      name: "Dubai Triple",
      productType: "food",
      fulfillFromProductId: singleId,
      fulfillMultiplier: 3,
    });

    await createStockRow(t, tripleId, locationId, 0);
    await createStockRow(t, singleId, locationId, 1); // Only 1 single, need 6

    const { orderId } = await createOrder(t, [
      { menuProductId: tripleId, quantity: 2, productName: "Dubai Triple" },
    ]);

    const result = await t.query(api.productInventory.queries.getStockForOrder, {
      orderId,
      locationId,
    });

    expect(result).toHaveLength(1);
    expect(result[0].substituteNeeded).toBe(6); // 2 * 3
    expect(result[0].substituteAvailable).toBe(1); // only 1
    expect(result[0].isSufficient).toBe(false); // overall insufficient
  });
});
