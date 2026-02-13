/**
 * Order Lifecycle Integration Tests
 *
 * Comprehensive tests for the complete order lifecycle covering:
 * 1. Status transitions (shipped path: Draft -> CompleteShipped)
 * 2. Status transitions (pickup path: Draft -> PickedUp)
 * 3. Cancellation rollback at every stage
 * 4. Inventory integration (reservation, consumption, release)
 * 5. Invalid transition handling
 *
 * Uses convex-test for isolated DB per test and fixture-based AAA pattern.
 */

import { convexTest } from 'convex-test';
import { expect, test, describe } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import {
  createCustomer,
  createDefaultStorageLocation,
  createBasicOrder,
  createOrderAtStatus,
  createMenuProductWithBOM,
  createPackagingComponentType,
  createInventoryBatch,
  createStorageLocation,
  verifyInventoryReserved,
  verifyInventoryReleased,
  verifyOrderFullyCancelled,
} from './helpers';

// ============================================
// 1. Complete Lifecycle - Shipped Path (6 tests)
// ============================================

describe('Complete Lifecycle - Shipped Path', () => {
  test('Draft -> AwaitingPayment sets awaitingPaymentSince timestamp', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create order in Draft status
    const customerId = await createCustomer(t);
    const orderId = await t.mutation(api.orders.mutations.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        { productName: 'Frollie Original', quantity: 2, unitPrice: 25000, unitCost: 10000 },
      ],
    });

    let order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('Draft');

    const beforeTimestamp = Date.now();

    // ACT: Transition to AwaitingPayment
    await t.mutation(api.orders.mutations.updateStatus, {
      orderId,
      status: 'AwaitingPayment',
    });

    // ASSERT: Status is AwaitingPayment with timestamp set
    order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('AwaitingPayment');
    expect(order?.awaitingPaymentSince).toBeDefined();
    expect(order?.awaitingPaymentSince).toBeGreaterThanOrEqual(beforeTimestamp);
  });

  test('AwaitingPayment -> Confirmed reserves inventory', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create order at AwaitingPayment
    // We need packaging components with inventory for reservation to work
    const storageLocationId = await createDefaultStorageLocation(t);

    // Create packaging component type with inventory tracking
    const boxComponentId = await createPackagingComponentType(t, {
      code: 'SHIP_BOX',
      name: 'Shipping Box',
      unitCostIdr: 500,
      consumptionStage: 'boxing',
    });

    // Create inventory batch for the box
    await createInventoryBatch(t, boxComponentId, storageLocationId, {
      quantity: 100,
      unitCost: 500,
    });

    // Create component stock aggregate
    await t.run(async (ctx) => {
      await ctx.db.insert('componentStock', {
        componentTypeId: boxComponentId,
        locationId: storageLocationId,
        totalStock: 100,
        totalReserved: 0,
        weightedUnitCostIdr: 500,
        lastUpdated: Date.now(),
      });
    });

    // Create menu product that uses the box component
    const customerId = await createCustomer(t);
    const menuProductId = await t.run(async (ctx) => {
      return await ctx.db.insert('menuProducts', {
        code: 'SHIP-TEST',
        name: 'Shipped Test Product',
        grams: 100,
        defaultPrice: 25000,
        productionType: 'original',
        productionUnits: 1,
        isActive: true,
      });
    });

    // Link packaging component to menu product
    await t.run(async (ctx) => {
      await ctx.db.insert('menuProductComponents', {
        menuProductId,
        componentTypeId: boxComponentId,
        quantity: 1,
        sortOrder: 0,
      });
    });

    // Create the order with this menu product
    const orderId = await t.mutation(api.orders.mutations.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        {
          productName: 'Shipped Test Product',
          quantity: 2,
          unitPrice: 25000,
          unitCost: 10000,
          menuProductId,
        },
      ],
    });

    // Move to AwaitingPayment
    await t.mutation(api.orders.mutations.updateStatus, {
      orderId,
      status: 'AwaitingPayment',
    });

    // ACT: Transition to Confirmed (triggers inventory reservation)
    await t.mutation(api.orders.mutations.updateStatus, {
      orderId,
      status: 'Confirmed',
    });

    // ASSERT: Status is Confirmed and inventory reserved
    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('Confirmed');
    expect(order?.confirmedAt).toBeDefined();

    // Verify inventory reservations exist
    const reservationCount = await verifyInventoryReserved(t, orderId);
    expect(reservationCount).toBeGreaterThan(0);
  });

  test('Confirmed -> InProduction transition', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create order at Confirmed status
    const { orderId } = await createOrderAtStatus(t, { targetStatus: 'Confirmed' });

    let order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('Confirmed');

    // ACT: Transition to InProduction
    await t.mutation(api.orders.mutations.updateStatus, {
      orderId,
      status: 'InProduction',
    });

    // ASSERT: Order is InProduction
    order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('InProduction');
  });

  test('InProduction -> Boxed transition (production completion)', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create order at InProduction
    const { orderId } = await createOrderAtStatus(t, { targetStatus: 'InProduction' });

    let order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('InProduction');

    // ACT: Transition to Boxed
    await t.mutation(api.orders.mutations.updateStatus, {
      orderId,
      status: 'Boxed',
    });

    // ASSERT: Order is Boxed
    order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('Boxed');
  });

  test('Boxed -> Labeled transition', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create order at Boxed
    const { orderId } = await createOrderAtStatus(t, { targetStatus: 'Boxed' });

    let order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('Boxed');

    // ACT: Transition to Labeled
    await t.mutation(api.orders.mutations.updateStatus, {
      orderId,
      status: 'Labeled',
    });

    // ASSERT: Order is Labeled
    order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('Labeled');
  });

  test('Labeled -> WaitingShipment -> CompleteShipped full chain', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create order at Labeled
    const { orderId } = await createOrderAtStatus(t, { targetStatus: 'Labeled' });

    let order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('Labeled');

    // ACT: Complete the shipped path
    await t.mutation(api.orders.mutations.updateStatus, {
      orderId,
      status: 'WaitingShipment',
    });

    order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('WaitingShipment');

    await t.mutation(api.orders.mutations.updateStatus, {
      orderId,
      status: 'CompleteShipped',
    });

    // ASSERT: Order is complete
    order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('CompleteShipped');
  });
});

// ============================================
// 2. Complete Lifecycle - Pickup Path (6 tests)
// ============================================

describe('Complete Lifecycle - Pickup Path', () => {
  test('Draft -> AwaitingPayment -> Confirmed (same as shipped)', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create a fresh order
    const customerId = await createCustomer(t);
    await createDefaultStorageLocation(t);

    const orderId = await t.mutation(api.orders.mutations.create, {
      customerId,
      deliveryType: 'Pickup',
      lowPriceConfirmed: true,
      items: [
        { productName: 'Frollie Pickup', quantity: 1, unitPrice: 25000, unitCost: 10000 },
      ],
    });

    // ACT: Transition through Draft -> AwaitingPayment -> Confirmed
    await t.mutation(api.orders.mutations.updateStatus, {
      orderId,
      status: 'AwaitingPayment',
    });

    let order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('AwaitingPayment');

    await t.mutation(api.orders.mutations.updateStatus, {
      orderId,
      status: 'Confirmed',
    });

    // ASSERT: Confirmed with timestamp
    order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('Confirmed');
    expect(order?.confirmedAt).toBeDefined();
  });

  test('Confirmed -> InProduction -> Boxed -> Labeled (same as shipped)', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create order at Confirmed
    const { orderId } = await createOrderAtStatus(t, {
      targetStatus: 'Confirmed',
      deliveryType: 'Pickup',
    });

    // ACT: Transition through production stages
    await t.mutation(api.orders.mutations.updateStatus, { orderId, status: 'InProduction' });
    await t.mutation(api.orders.mutations.updateStatus, { orderId, status: 'Boxed' });
    await t.mutation(api.orders.mutations.updateStatus, { orderId, status: 'Labeled' });

    // ASSERT: Labeled status
    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('Labeled');
  });

  test('Labeled -> WaitingPickup transition (separate from WaitingShipment)', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create order at Labeled with Pickup delivery type
    const { orderId } = await createOrderAtStatus(t, {
      targetStatus: 'Labeled',
      deliveryType: 'Pickup',
    });

    // ACT: Transition to WaitingPickup (not WaitingShipment)
    await t.mutation(api.orders.mutations.updateStatus, {
      orderId,
      status: 'WaitingPickup',
    });

    // ASSERT: WaitingPickup status
    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('WaitingPickup');
  });

  test('WaitingPickup -> PickedUp transition (order complete)', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create order at WaitingPickup
    const { orderId } = await createOrderAtStatus(t, {
      targetStatus: 'WaitingPickup',
      deliveryType: 'Pickup',
    });

    let order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('WaitingPickup');

    // ACT: Mark as picked up
    await t.mutation(api.orders.mutations.updateStatus, {
      orderId,
      status: 'PickedUp',
    });

    // ASSERT: Order is complete
    order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('PickedUp');
  });

  test('WaitingShipment vs WaitingPickup use different delivery paths', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create two orders at Labeled, one for each path
    const { orderId: shippedOrderId } = await createOrderAtStatus(t, {
      targetStatus: 'Labeled',
      deliveryType: 'Delivery',
    });

    const { orderId: pickupOrderId } = await createOrderAtStatus(t, {
      targetStatus: 'Labeled',
      deliveryType: 'Pickup',
    });

    // ACT: Take each order down its respective path
    await t.mutation(api.orders.mutations.updateStatus, {
      orderId: shippedOrderId,
      status: 'WaitingShipment',
    });

    await t.mutation(api.orders.mutations.updateStatus, {
      orderId: pickupOrderId,
      status: 'WaitingPickup',
    });

    // ASSERT: Different statuses for different delivery methods
    const shippedOrder = await t.run(async (ctx) => ctx.db.get(shippedOrderId));
    const pickupOrder = await t.run(async (ctx) => ctx.db.get(pickupOrderId));

    expect(shippedOrder?.status).toBe('WaitingShipment');
    expect(pickupOrder?.status).toBe('WaitingPickup');

    // Both have different delivery types
    expect(shippedOrder?.deliveryType).toBe('Delivery');
    expect(pickupOrder?.deliveryType).toBe('Pickup');
  });

  test('End-to-end pickup: Draft -> PickedUp in single test', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create order from scratch
    const customerId = await createCustomer(t);
    await createDefaultStorageLocation(t);

    const orderId = await t.mutation(api.orders.mutations.create, {
      customerId,
      deliveryType: 'Pickup',
      lowPriceConfirmed: true,
      items: [
        { productName: 'Full Pickup Journey', quantity: 3, unitPrice: 25000, unitCost: 10000 },
      ],
    });

    // Verify Draft
    let order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('Draft');

    // ACT: Walk through entire pickup lifecycle
    const statuses = [
      'AwaitingPayment',
      'Confirmed',
      'InProduction',
      'Boxed',
      'Labeled',
      'WaitingPickup',
      'PickedUp',
    ] as const;

    for (const status of statuses) {
      await t.mutation(api.orders.mutations.updateStatus, {
        orderId,
        status,
      });

      order = await t.run(async (ctx) => ctx.db.get(orderId));
      expect(order?.status).toBe(status);
    }

    // ASSERT: Final state
    order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('PickedUp');
    expect(order?.awaitingPaymentSince).toBeDefined();
    expect(order?.confirmedAt).toBeDefined();
  });
});
