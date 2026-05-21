/**
 * Phase 84 Wave 0 — Shared test factories for the QRIS payment integration.
 *
 * Two responsibilities:
 *   1. `makeAwaitingPaymentOrder` seeds a COMPLETE, reservable order so that
 *      `reserveStockForOrderInternal` actually DECREMENTS stock (NOT `{reserved:0}`).
 *      This is the staffreview C5 requirement: without a default storage location +
 *      packaging-BOM componentTypes + inventory stock + orderItems, the downstream
 *      idempotency replay test (84-03) would be a vacuous `0 === 0` pass.
 *   2. `makeQrisPayment` inserts a `qrisPayments` row matching the Plan 02 schema.
 *
 * `readReservedQty` reads the current reserved quantity at a location for a
 * componentType so the replay test can assert the reserve happened exactly once.
 *
 * RED STATE NOTE: the `qrisPayments` table is added to convex/schema.ts in Plan 02
 * (84-02). Until then, `makeQrisPayment` (which inserts into `qrisPayments`) fails
 * at runtime — that is the intended Wave 0 RED contract for the suites that call it.
 * The order/inventory seeding uses tables that already exist, so it is non-vacuous
 * the moment Plan 03's mutation lands.
 */

import type { convexTest } from "convex-test";
import type { Id } from "../../_generated/dataModel";

type TestContext = ReturnType<typeof convexTest>;

export interface SeededAwaitingPaymentOrder {
  orderId: Id<"orders">;
  locationId: Id<"storageLocations">;
  /** The packaging componentType the order's BOM consumes (e.g. a Small Box). */
  packagingComponentTypeId: Id<"componentTypes">;
  menuProductId: Id<"menuProducts">;
  /**
   * Quantity of the packaging componentType that a single COMPLETED reserve
   * should decrement (orderItem.quantity * menuProductComponent.quantity).
   * The replay test asserts the reserved qty rises by exactly this once.
   */
  expectedReserveQty: number;
}

export interface MakeAwaitingPaymentOrderOpts {
  orderNumber?: string;
  finalTotal?: number;
  /** orderItem quantity (default 1). */
  itemQuantity?: number;
  /** packaging components per product unit (default 1). */
  packagingPerUnit?: number;
  /** initial physical stock seeded for the packaging componentType (default 50). */
  initialStock?: number;
}

/**
 * Seed a fully reservable order in AwaitingPayment so that
 * `reserveStockForOrderInternal` decrements real stock.
 *
 * Seeds, in order:
 *   1. a `storageLocations` row registered as the DEFAULT (getDefaultLocation reads `by_default`),
 *   2. a packaging `componentTypes` row with `trackInventory: true` (so it counts toward reserve),
 *   3. a `menuProducts` row + a `menuProductComponents` link to that packaging componentType,
 *   4. an `inventoryBatches` row (FIFO source) + a `componentStock` aggregate at the default location,
 *   5. an `orders` row in `AwaitingPayment` + an `orderItems` row referencing the product,
 *      so `getPackagingComponentsForOrder` returns a non-empty list.
 */
export async function makeAwaitingPaymentOrder(
  t: TestContext,
  opts: MakeAwaitingPaymentOrderOpts = {},
): Promise<SeededAwaitingPaymentOrder> {
  const orderNumber = opts.orderNumber ?? "0521-001";
  const finalTotal = opts.finalTotal ?? 35000;
  const itemQuantity = opts.itemQuantity ?? 1;
  const packagingPerUnit = opts.packagingPerUnit ?? 1;
  const initialStock = opts.initialStock ?? 50;
  const expectedReserveQty = itemQuantity * packagingPerUnit;

  return await t.run(async (ctx) => {
    const now = Date.now();

    // 1. Default storage location (getDefaultLocation reads `by_default` = true).
    const locationId = await ctx.db.insert("storageLocations", {
      name: "Office (test)",
      locationType: "office",
      isActive: true,
      isDefault: true,
      createdBy: "test",
      createdAt: now,
    });

    // 2. Packaging componentType — trackInventory: true so reserve counts it.
    const packagingComponentTypeId = await ctx.db.insert("componentTypes", {
      code: "SMALL_BOX",
      name: "Small Box",
      category: "packaging",
      unitCostIdr: 500,
      unit: "pcs",
      trackInventory: true,
      consumptionStage: "boxing",
      sortOrder: 1,
      isActive: true,
      createdBy: "test",
      createdAt: now,
    });

    // 3. Menu product + BOM link to the packaging componentType.
    const menuProductId = await ctx.db.insert("menuProducts", {
      code: "TEST_ORIG",
      name: "Test Original",
      grams: 80,
      defaultPrice: finalTotal,
      isActive: true,
      unitCost: 500,
      cachedProductionSummary: "1 Small Box",
    });
    await ctx.db.insert("menuProductComponents", {
      menuProductId,
      componentTypeId: packagingComponentTypeId,
      quantity: packagingPerUnit,
      sortOrder: 1,
    });

    // 4. Physical stock: a FIFO batch + aggregate componentStock at the default location.
    await ctx.db.insert("inventoryBatches", {
      componentTypeId: packagingComponentTypeId,
      locationId,
      purchaseDate: now - 1000,
      supplierName: "Test Supplier",
      quantityPurchased: initialStock,
      totalCostIdr: initialStock * 500,
      unitCostIdr: 500,
      quantityRemaining: initialStock,
      quantityReserved: 0,
      status: "active",
      createdBy: "test",
      createdAt: now,
    });
    await ctx.db.insert("componentStock", {
      componentTypeId: packagingComponentTypeId,
      locationId,
      totalStock: initialStock,
      totalReserved: 0,
      weightedUnitCostIdr: 500,
      lastUpdated: now,
    });

    // 5. Customer + order in AwaitingPayment + orderItem referencing the product.
    const customerId = await ctx.db.insert("customers", {
      name: "Test Customer",
      createdBy: "test",
    });
    const orderId = await ctx.db.insert("orders", {
      orderNumber,
      customerId,
      customerName: "Test Customer",
      status: "AwaitingPayment",
      paymentStatus: "Unpaid",
      orderDate: now,
      totalAmount: finalTotal,
      totalCost: 500,
      totalMargin: finalTotal - 500,
      finalTotal,
      deliveryType: "Pickup",
      itemCount: 1,
      createdBy: "test",
    });
    await ctx.db.insert("orderItems", {
      orderId,
      productName: "Test Original",
      quantity: itemQuantity,
      unitPrice: finalTotal,
      unitCost: 500,
      discountAmount: 0,
      lineTotal: finalTotal * itemQuantity,
      lineCost: 500 * itemQuantity,
      lineMargin: (finalTotal - 500) * itemQuantity,
      menuProductId,
    });

    return {
      orderId,
      locationId,
      packagingComponentTypeId,
      menuProductId,
      expectedReserveQty,
    };
  });
}

export interface MakeQrisPaymentOverrides {
  orderId: Id<"orders">;
  externalId?: string;
  xenditQrId?: string;
  qrString?: string;
  amount?: number;
  status?: "pending" | "paid" | "expired";
  expiresAt?: number;
}

/**
 * Insert a `qrisPayments` row with Plan-02-schema defaults.
 * RED until Plan 02 adds the `qrisPayments` table to schema.ts.
 */
export async function makeQrisPayment(
  t: TestContext,
  overrides: MakeQrisPaymentOverrides,
): Promise<Id<"qrisPayments">> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("qrisPayments", {
      orderId: overrides.orderId,
      provider: "xendit",
      externalId: overrides.externalId ?? "0521-001",
      xenditQrId: overrides.xenditQrId ?? "qr_test_abc123",
      qrString: overrides.qrString ?? "00020101021226...TESTQR",
      amount: overrides.amount ?? 35000,
      status: overrides.status ?? "pending",
      expiresAt: overrides.expiresAt ?? Date.now() + 30 * 60 * 1000,
    });
  });
}

/**
 * Read the current reserved quantity for a componentType at a location.
 * Reads the `componentStock.totalReserved` aggregate so the replay test can
 * assert the reserve happened exactly once (decremented, then UNCHANGED on replay).
 */
export async function readReservedQty(
  t: TestContext,
  locationId: Id<"storageLocations">,
  componentTypeId: Id<"componentTypes">,
): Promise<number> {
  return await t.run(async (ctx) => {
    const stock = await ctx.db
      .query("componentStock")
      .withIndex("by_component_location", (q) =>
        q.eq("componentTypeId", componentTypeId).eq("locationId", locationId),
      )
      .first();
    return stock?.totalReserved ?? 0;
  });
}
