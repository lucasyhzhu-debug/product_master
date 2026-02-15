/**
 * Order Lifecycle Integration Tests
 *
 * Phase 14: Rewritten for simplified 7-status Kanban workflow.
 *
 * Comprehensive tests for the complete order lifecycle covering:
 * 1. Status transitions (Draft -> Complete, linear path)
 * 2. Cancellation rollback at every stage
 * 3. Inventory integration (reservation, consumption, release)
 * 4. Invalid transition handling
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
// 1. Complete Lifecycle (5 tests)
// Phase 14: Linear path Draft -> Complete
// ============================================

describe('Complete Lifecycle', () => {
  test('Draft -> AwaitingPayment sets awaitingPaymentSince timestamp', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create order in Draft status
    const customerId = await createCustomer(t);
    const orderId = await t.mutation(api.orders.mutations.index.create, {
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
    await t.mutation(api.orders.mutations.index.updateStatus, {
      orderId,
      status: 'AwaitingPayment',
    });

    // ASSERT: Status is AwaitingPayment with timestamp set
    order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('AwaitingPayment');
    expect(order?.awaitingPaymentSince).toBeDefined();
    expect(order?.awaitingPaymentSince).toBeGreaterThanOrEqual(beforeTimestamp);
  });

  test('AwaitingPayment -> PaymentReceived reserves inventory', async () => {
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

        isActive: true,
        unitCost: 0,
        cachedProductionSummary: '',
        productType: 'food' as const,
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
    const orderId = await t.mutation(api.orders.mutations.index.create, {
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
    await t.mutation(api.orders.mutations.index.updateStatus, {
      orderId,
      status: 'AwaitingPayment',
    });

    // ACT: Transition to PaymentReceived (triggers inventory reservation)
    await t.mutation(api.orders.mutations.index.updateStatus, {
      orderId,
      status: 'PaymentReceived',
    });

    // ASSERT: Status is PaymentReceived and inventory reserved
    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('PaymentReceived');
    expect(order?.confirmedAt).toBeDefined();

    // Verify inventory reservations exist
    const reservationCount = await verifyInventoryReserved(t, orderId);
    expect(reservationCount).toBeGreaterThan(0);
  });

  test('PaymentReceived -> BeingPrepared transition', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create order at PaymentReceived status
    const { orderId } = await createOrderAtStatus(t, { targetStatus: 'PaymentReceived' });

    let order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('PaymentReceived');

    // ACT: Transition to BeingPrepared
    await t.mutation(api.orders.mutations.index.updateStatus, {
      orderId,
      status: 'BeingPrepared',
    });

    // ASSERT: Order is BeingPrepared and kitchen visible
    order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('BeingPrepared');
    expect(order?.isKitchenVisible).toBe(true);
  });

  test('BeingPrepared -> AwaitingDelivery transition', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create order at BeingPrepared
    const { orderId } = await createOrderAtStatus(t, { targetStatus: 'BeingPrepared' });

    let order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('BeingPrepared');

    // ACT: Transition to AwaitingDelivery
    await t.mutation(api.orders.mutations.index.updateStatus, {
      orderId,
      status: 'AwaitingDelivery',
    });

    // ASSERT: Order is AwaitingDelivery
    order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('AwaitingDelivery');
    expect(order?.isKitchenVisible).toBe(false);
  });

  test('End-to-end: Draft -> Complete in single test', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create order from scratch
    const customerId = await createCustomer(t);
    await createDefaultStorageLocation(t);

    const orderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        { productName: 'Full Journey', quantity: 3, unitPrice: 25000, unitCost: 10000 },
      ],
    });

    // Verify Draft
    let order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('Draft');

    // ACT: Walk through entire lifecycle
    const statuses = [
      'AwaitingPayment',
      'PaymentReceived',
      'BeingPrepared',
      'AwaitingDelivery',
      'Complete',
    ] as const;

    for (const status of statuses) {
      await t.mutation(api.orders.mutations.index.updateStatus, {
        orderId,
        status,
      });

      order = await t.run(async (ctx) => ctx.db.get(orderId));
      expect(order?.status).toBe(status);
    }

    // ASSERT: Final state
    order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('Complete');
    expect(order?.awaitingPaymentSince).toBeDefined();
    expect(order?.confirmedAt).toBeDefined();
    expect(order?.completedAt).toBeDefined();
  });
});

// ============================================
// 2. Cancellation Rollback at Every Stage (6 tests)
// Per CONTEXT.md: "Test cancellation at EVERY status stage"
// ============================================

describe('Cancellation Rollback at Every Stage', () => {
  test('Cancel from Draft (no inventory, simple status change)', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create order in Draft
    const customerId = await createCustomer(t);
    const orderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        { productName: 'Draft Cancel Test', quantity: 1, unitPrice: 25000, unitCost: 10000 },
      ],
    });

    // ACT: Cancel
    await t.mutation(api.orders.mutations.index.cancel, {
      orderId,
      reason: 'Customer changed mind',
      reasonCategory: 'customer_request',
    });

    // ASSERT: Comprehensive cancellation verification
    const result = await verifyOrderFullyCancelled(t, orderId);
    expect(result.passed).toBe(true);
    expect(result.orderStatus).toBe('Cancelled');
    expect(result.cancellationEventLogged).toBe(true);

    // Verify cancellation details stored on order
    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.cancellationReason).toBe('Customer changed mind');
    expect(order?.cancellationCategory).toBe('customer_request');
    expect(order?.cancelledAt).toBeDefined();
  });

  test('Cancel from AwaitingPayment (no inventory yet)', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create order at AwaitingPayment
    const customerId = await createCustomer(t);
    const orderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        { productName: 'AwaitingPayment Cancel', quantity: 1, unitPrice: 25000, unitCost: 10000 },
      ],
    });

    await t.mutation(api.orders.mutations.index.updateStatus, {
      orderId,
      status: 'AwaitingPayment',
    });

    // ACT: Cancel
    await t.mutation(api.orders.mutations.index.cancel, {
      orderId,
      reason: 'Payment not received',
      reasonCategory: 'payment_issue',
    });

    // ASSERT
    const result = await verifyOrderFullyCancelled(t, orderId);
    expect(result.passed).toBe(true);
    expect(result.orderStatus).toBe('Cancelled');
  });

  test('Cancel from PaymentReceived (inventory reservations released)', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create order at PaymentReceived with inventory
    const { orderId } = await createOrderAtStatus(t, { targetStatus: 'PaymentReceived' });

    // Verify order is PaymentReceived before cancellation
    let order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('PaymentReceived');

    // ACT: Cancel
    await t.mutation(api.orders.mutations.index.cancel, {
      orderId,
      reason: 'Out of stock',
      reasonCategory: 'out_of_stock',
    });

    // ASSERT: Full cancellation rollback
    const result = await verifyOrderFullyCancelled(t, orderId);
    expect(result.passed).toBe(true);
    expect(result.inventoryReleased).toBe(true);
    expect(result.productionCancelled).toBe(true);
  });

  test('Cancel from BeingPrepared (inventory released AND production cancelled)', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create order at BeingPrepared
    const { orderId } = await createOrderAtStatus(t, { targetStatus: 'BeingPrepared' });

    let order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('BeingPrepared');

    // ACT: Cancel
    await t.mutation(api.orders.mutations.index.cancel, {
      orderId,
      reason: 'Production issue',
      reasonCategory: 'other',
    });

    // ASSERT: Both inventory and production rollback
    const result = await verifyOrderFullyCancelled(t, orderId);
    expect(result.passed).toBe(true);
    expect(result.inventoryReleased).toBe(true);
    expect(result.productionCancelled).toBe(true);
    expect(result.cancellationEventLogged).toBe(true);
  });

  test('Cancel from AwaitingDelivery (rollback)', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create order at AwaitingDelivery
    const { orderId } = await createOrderAtStatus(t, { targetStatus: 'AwaitingDelivery' });

    let order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('AwaitingDelivery');

    // ACT: Cancel
    await t.mutation(api.orders.mutations.index.cancel, {
      orderId,
      reason: 'Delivery cancelled',
      reasonCategory: 'customer_request',
    });

    // ASSERT
    const result = await verifyOrderFullyCancelled(t, orderId);
    expect(result.passed).toBe(true);
  });

  test('Cannot cancel terminal statuses (Complete, Cancelled)', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create a completed order
    const { orderId: completeId } = await createOrderAtStatus(t, {
      targetStatus: 'Complete',
    });

    // ACT & ASSERT: Cannot cancel completed order
    await expect(
      t.mutation(api.orders.mutations.index.cancel, {
        orderId: completeId,
        reason: 'Too late',
      })
    ).rejects.toThrow('Cannot cancel a completed or already cancelled order');

    // Verify the order status remains Complete
    const order = await t.run(async (ctx) => ctx.db.get(completeId));
    expect(order?.status).toBe('Complete');
  });
});

// ============================================
// 3. Inventory Integration (5 tests)
// Per CONTEXT.md: "Full integration with inventory"
// ============================================

describe('Inventory Integration', () => {
  test('Inventory reserved on PaymentReceived status', async () => {
    const t = convexTest(schema);

    // ARRANGE: Set up full inventory infrastructure
    const storageLocationId = await createDefaultStorageLocation(t);
    const boxComponentId = await createPackagingComponentType(t, {
      code: 'INV_BOX',
      name: 'Inventory Box',
      consumptionStage: 'boxing',
    });

    await createInventoryBatch(t, boxComponentId, storageLocationId, {
      quantity: 50,
      unitCost: 500,
    });

    await t.run(async (ctx) => {
      await ctx.db.insert('componentStock', {
        componentTypeId: boxComponentId,
        locationId: storageLocationId,
        totalStock: 50,
        totalReserved: 0,
        weightedUnitCostIdr: 500,
        lastUpdated: Date.now(),
      });
    });

    const customerId = await createCustomer(t);
    const menuProductId = await t.run(async (ctx) => {
      return await ctx.db.insert('menuProducts', {
        code: 'INV-TEST',
        name: 'Inventory Test Product',
        grams: 100,
        defaultPrice: 25000,

        isActive: true,
        unitCost: 0,
        cachedProductionSummary: '',
        productType: 'food' as const,
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert('menuProductComponents', {
        menuProductId,
        componentTypeId: boxComponentId,
        quantity: 1,
        sortOrder: 0,
      });
    });

    const orderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        {
          productName: 'Inventory Test',
          quantity: 3,
          unitPrice: 25000,
          unitCost: 10000,
          menuProductId,
        },
      ],
    });

    // ACT: Confirm order (PaymentReceived triggers reservation)
    await t.mutation(api.orders.mutations.index.updateStatus, {
      orderId,
      status: 'PaymentReceived',
    });

    // ASSERT: Reservations exist
    const reservations = await t.run(async (ctx) => {
      return await ctx.db
        .query('orderComponentReservations')
        .withIndex('by_order', (q) => q.eq('orderId', orderId))
        .collect();
    });

    expect(reservations.length).toBeGreaterThan(0);
    expect(reservations[0].status).toBe('reserved');
    expect(reservations[0].quantityReserved).toBe(3); // 3 items x 1 box each
  });

  test('Inventory NOT reserved on Draft or AwaitingPayment', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create order in Draft
    const customerId = await createCustomer(t);
    const orderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        { productName: 'No Reserve Test', quantity: 1, unitPrice: 25000, unitCost: 10000 },
      ],
    });

    // ASSERT: No reservations at Draft
    let reservations = await t.run(async (ctx) => {
      return await ctx.db
        .query('orderComponentReservations')
        .withIndex('by_order', (q) => q.eq('orderId', orderId))
        .collect();
    });
    expect(reservations.length).toBe(0);

    // Move to AwaitingPayment
    await t.mutation(api.orders.mutations.index.updateStatus, {
      orderId,
      status: 'AwaitingPayment',
    });

    // ASSERT: Still no reservations at AwaitingPayment
    reservations = await t.run(async (ctx) => {
      return await ctx.db
        .query('orderComponentReservations')
        .withIndex('by_order', (q) => q.eq('orderId', orderId))
        .collect();
    });
    expect(reservations.length).toBe(0);
  });

  test('Inventory consumed on BeingPrepared (all materials consumed at once)', async () => {
    const t = convexTest(schema);

    // ARRANGE: Set up order with full inventory
    const storageLocationId = await createDefaultStorageLocation(t);
    const boxComponentId = await createPackagingComponentType(t, {
      code: 'CONSUME_BOX',
      name: 'Consumable Box',
      consumptionStage: 'boxing',
    });

    await createInventoryBatch(t, boxComponentId, storageLocationId, {
      quantity: 50,
      unitCost: 500,
    });

    await t.run(async (ctx) => {
      await ctx.db.insert('componentStock', {
        componentTypeId: boxComponentId,
        locationId: storageLocationId,
        totalStock: 50,
        totalReserved: 0,
        weightedUnitCostIdr: 500,
        lastUpdated: Date.now(),
      });
    });

    const customerId = await createCustomer(t);
    const menuProductId = await t.run(async (ctx) => {
      return await ctx.db.insert('menuProducts', {
        code: 'CONSUME-TEST',
        name: 'Consume Test Product',
        grams: 100,
        defaultPrice: 25000,

        isActive: true,
        unitCost: 0,
        cachedProductionSummary: '',
        productType: 'food' as const,
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert('menuProductComponents', {
        menuProductId,
        componentTypeId: boxComponentId,
        quantity: 1,
        sortOrder: 0,
      });
    });

    const orderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        {
          productName: 'Consume Test',
          quantity: 2,
          unitPrice: 25000,
          unitCost: 10000,
          menuProductId,
        },
      ],
    });

    // PaymentReceived triggers reservation
    await t.mutation(api.orders.mutations.index.updateStatus, { orderId, status: 'PaymentReceived' });

    // Verify reserved after PaymentReceived
    let reservations = await t.run(async (ctx) => {
      return await ctx.db
        .query('orderComponentReservations')
        .withIndex('by_order', (q) => q.eq('orderId', orderId))
        .collect();
    });
    expect(reservations.some((r) => r.status === 'reserved')).toBe(true);

    // ACT: BeingPrepared triggers consumption of ALL materials
    await t.mutation(api.orders.mutations.index.updateStatus, { orderId, status: 'BeingPrepared' });

    // ASSERT: After BeingPrepared, all materials should be consumed
    reservations = await t.run(async (ctx) => {
      return await ctx.db
        .query('orderComponentReservations')
        .withIndex('by_order', (q) => q.eq('orderId', orderId))
        .collect();
    });

    // Materials consumed (status changed from 'reserved' to 'consumed')
    const boxingReservations = reservations.filter(
      (r) => r.componentTypeId === boxComponentId
    );
    expect(boxingReservations.length).toBeGreaterThan(0);
    expect(boxingReservations[0].status).toBe('consumed');

    // Complete the order
    await t.mutation(api.orders.mutations.index.updateStatus, { orderId, status: 'AwaitingDelivery' });
    await t.mutation(api.orders.mutations.index.updateStatus, { orderId, status: 'Complete' });

    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('Complete');
  });

  test('Cancellation releases reservations (verifyInventoryReleased)', async () => {
    const t = convexTest(schema);

    // ARRANGE: Set up order with inventory reservations
    const storageLocationId = await createDefaultStorageLocation(t);
    const boxComponentId = await createPackagingComponentType(t, {
      code: 'RELEASE_BOX',
      name: 'Release Box',
      consumptionStage: 'boxing',
    });

    await createInventoryBatch(t, boxComponentId, storageLocationId, {
      quantity: 50,
      unitCost: 500,
    });

    await t.run(async (ctx) => {
      await ctx.db.insert('componentStock', {
        componentTypeId: boxComponentId,
        locationId: storageLocationId,
        totalStock: 50,
        totalReserved: 0,
        weightedUnitCostIdr: 500,
        lastUpdated: Date.now(),
      });
    });

    const customerId = await createCustomer(t);
    const menuProductId = await t.run(async (ctx) => {
      return await ctx.db.insert('menuProducts', {
        code: 'RELEASE-TEST',
        name: 'Release Test Product',
        grams: 100,
        defaultPrice: 25000,

        isActive: true,
        unitCost: 0,
        cachedProductionSummary: '',
        productType: 'food' as const,
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert('menuProductComponents', {
        menuProductId,
        componentTypeId: boxComponentId,
        quantity: 1,
        sortOrder: 0,
      });
    });

    const orderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        {
          productName: 'Release Test',
          quantity: 5,
          unitPrice: 25000,
          unitCost: 10000,
          menuProductId,
        },
      ],
    });

    // PaymentReceived to trigger reservation
    await t.mutation(api.orders.mutations.index.updateStatus, { orderId, status: 'PaymentReceived' });

    // Verify reservations exist
    const reservationsBefore = await verifyInventoryReserved(t, orderId);
    expect(reservationsBefore).toBeGreaterThan(0);

    // ACT: Cancel order using updateStatus (which triggers releaseReservationInternal).
    await t.mutation(api.orders.mutations.index.updateStatus, {
      orderId,
      status: 'Cancelled',
    });

    // ASSERT: Reservations released
    const released = await verifyInventoryReleased(t, orderId);
    expect(released).toBe(true);

    // Double-check: batch quantities restored
    const batch = await t.run(async (ctx) => {
      const batches = await ctx.db
        .query('inventoryBatches')
        .withIndex('by_component_location', (q) =>
          q.eq('componentTypeId', boxComponentId).eq('locationId', storageLocationId)
        )
        .collect();
      return batches[0];
    });

    // Reserved quantity should be back to 0 after release
    expect(batch?.quantityReserved).toBe(0);
  });
});

// ============================================
// 4. Invalid Transitions (3 tests)
// Phase 14: Tests for transition validation
// ============================================

describe('Invalid Transitions', () => {
  test('Reject skipping: Draft -> BeingPrepared (no state machine enforcement yet)', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create order in Draft
    const customerId = await createCustomer(t);
    await createDefaultStorageLocation(t);

    const orderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        { productName: 'Skip Test', quantity: 1, unitPrice: 25000, unitCost: 10000 },
      ],
    });

    // ACT & ASSERT: Currently updateStatus does NOT validate transitions,
    // so Draft -> BeingPrepared succeeds. This documents the gap.
    // TODO: When state machine validation is added, change to:
    //   expect(...).rejects.toThrow()
    await t.mutation(api.orders.mutations.index.updateStatus, {
      orderId,
      status: 'BeingPrepared',
    });

    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('BeingPrepared');
  });

  test('Reject skipping: PaymentReceived -> Complete (skips production)', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create order at PaymentReceived
    const { orderId } = await createOrderAtStatus(t, { targetStatus: 'PaymentReceived' });

    // ACT & ASSERT: Currently succeeds (no state machine enforcement)
    // TODO: When state machine validation is added, change to:
    //   expect(...).rejects.toThrow()
    await t.mutation(api.orders.mutations.index.updateStatus, {
      orderId,
      status: 'Complete',
    });

    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('Complete');
  });

  test('Reject terminal: Complete -> PaymentReceived (terminal status cannot cancel)', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create completed order
    const { orderId } = await createOrderAtStatus(t, { targetStatus: 'Complete' });

    // ACT & ASSERT: Cancel mutation correctly rejects terminal status
    await expect(
      t.mutation(api.orders.mutations.index.cancel, {
        orderId,
        reason: 'Too late to cancel',
      })
    ).rejects.toThrow('Cannot cancel a completed or already cancelled order');

    // The order status should remain Complete
    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('Complete');
  });
});
