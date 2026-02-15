/**
 * Order integration tests for Convex backend.
 * Tests order number generation, totals calculation, and status transitions.
 */

import { convexTest } from 'convex-test';
import { expect, test, describe } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import { createCustomer, createDefaultStorageLocation } from './helpers';

// ============================================
// Order Number Generation Tests (4 tests)
// ============================================

describe('Order Number Generation', () => {
  test('generates order number in MMDD-NNN format', async () => {
    const t = convexTest(schema);

    const customerId = await createCustomer(t);

    const orderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        {
          productName: 'Test Product',
          quantity: 1,
          unitPrice: 10000,
          unitCost: 5000,
        },
      ],
    });

    const order = await t.run(async (ctx) => ctx.db.get(orderId));

    // Format: MMDD-NNN
    expect(order?.orderNumber).toMatch(/^\d{4}-\d{3}$/);
  });

  test('starts sequence at 001 for new day', async () => {
    const t = convexTest(schema);

    const customerId = await createCustomer(t);

    const orderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        {
          productName: 'First Order',
          quantity: 1,
          unitPrice: 10000,
          unitCost: 5000,
        },
      ],
    });

    const order = await t.run(async (ctx) => ctx.db.get(orderId));

    // First order of the day should end with -001
    expect(order?.orderNumber).toMatch(/-001$/);
  });

  test('increments sequence for same day', async () => {
    const t = convexTest(schema);

    const customerId = await createCustomer(t);

    // Create first order
    const firstOrderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        { productName: 'Product 1', quantity: 1, unitPrice: 10000, unitCost: 5000 },
      ],
    });

    const firstOrder = await t.run(async (ctx) => ctx.db.get(firstOrderId));
    expect(firstOrder?.orderNumber).toMatch(/-001$/);

    // Create second order
    const secondOrderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        { productName: 'Product 2', quantity: 1, unitPrice: 10000, unitCost: 5000 },
      ],
    });

    const secondOrder = await t.run(async (ctx) => ctx.db.get(secondOrderId));
    expect(secondOrder?.orderNumber).toMatch(/-002$/);

    // Create third order
    const thirdOrderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        { productName: 'Product 3', quantity: 1, unitPrice: 10000, unitCost: 5000 },
      ],
    });

    const thirdOrder = await t.run(async (ctx) => ctx.db.get(thirdOrderId));
    expect(thirdOrder?.orderNumber).toMatch(/-003$/);
  });

  test('order number contains current date prefix', async () => {
    const t = convexTest(schema);

    const customerId = await createCustomer(t);

    const orderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        { productName: 'Test Product', quantity: 1, unitPrice: 10000, unitCost: 5000 },
      ],
    });

    const order = await t.run(async (ctx) => ctx.db.get(orderId));

    // Get expected date prefix
    const now = new Date();
    const expectedPrefix = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

    expect(order?.orderNumber).toMatch(new RegExp(`^${expectedPrefix}-`));
  });
});

// ============================================
// Order Totals Calculation Tests (4 tests)
// ============================================

describe('Order Totals Calculation', () => {
  test('calculates total amount from items', async () => {
    const t = convexTest(schema);

    const customerId = await createCustomer(t);

    const orderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      items: [
        { productName: 'Product A', quantity: 2, unitPrice: 10000, unitCost: 5000 },
        { productName: 'Product B', quantity: 3, unitPrice: 15000, unitCost: 7000 },
      ],
    });

    const order = await t.run(async (ctx) => ctx.db.get(orderId));

    // Total: (2 * 10000) + (3 * 15000) = 20000 + 45000 = 65000
    expect(order?.totalAmount).toBe(65000);
  });

  test('calculates total cost from items', async () => {
    const t = convexTest(schema);

    const customerId = await createCustomer(t);

    const orderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      items: [
        { productName: 'Product A', quantity: 2, unitPrice: 10000, unitCost: 5000 },
        { productName: 'Product B', quantity: 3, unitPrice: 15000, unitCost: 7000 },
      ],
    });

    const order = await t.run(async (ctx) => ctx.db.get(orderId));

    // Total cost: (2 * 5000) + (3 * 7000) = 10000 + 21000 = 31000
    expect(order?.totalCost).toBe(31000);
  });

  test('calculates total margin correctly', async () => {
    const t = convexTest(schema);

    const customerId = await createCustomer(t);

    const orderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      items: [
        { productName: 'Product A', quantity: 2, unitPrice: 10000, unitCost: 5000 },
        { productName: 'Product B', quantity: 3, unitPrice: 15000, unitCost: 7000 },
      ],
    });

    const order = await t.run(async (ctx) => ctx.db.get(orderId));

    // Margin: 65000 - 31000 = 34000
    expect(order?.totalMargin).toBe(34000);
  });

  test('applies discount to line totals', async () => {
    const t = convexTest(schema);

    const customerId = await createCustomer(t);

    const orderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      items: [
        {
          productName: 'Discounted Product',
          quantity: 5,
          unitPrice: 10000,
          unitCost: 4000,
          discountAmount: 2000, // 2000 off per unit
        },
      ],
    });

    const order = await t.run(async (ctx) => ctx.db.get(orderId));

    // Price after discount: 10000 - 2000 = 8000
    // Total: 5 * 8000 = 40000
    expect(order?.totalAmount).toBe(40000);

    // Cost unchanged: 5 * 4000 = 20000
    expect(order?.totalCost).toBe(20000);

    // Margin: 40000 - 20000 = 20000
    expect(order?.totalMargin).toBe(20000);
  });
});

// ============================================
// Status Transitions Tests (4 tests)
// ============================================

describe('Status Transitions', () => {
  test('order starts with Draft status', async () => {
    const t = convexTest(schema);

    const customerId = await createCustomer(t);

    const orderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        { productName: 'Test', quantity: 1, unitPrice: 10000, unitCost: 5000 },
      ],
    });

    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('Draft');
  });

  test('can update order status', async () => {
    const t = convexTest(schema);

    const customerId = await createCustomer(t);
    await createDefaultStorageLocation(t);

    const orderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        { productName: 'Test', quantity: 1, unitPrice: 10000, unitCost: 5000 },
      ],
    });

    await t.mutation(api.orders.mutations.index.updateStatus, {
      orderId,
      status: 'PaymentReceived',
    });

    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('PaymentReceived');
  });

  test('records awaitingPaymentSince timestamp when transitioning to AwaitingPayment', async () => {
    const t = convexTest(schema);

    const customerId = await createCustomer(t);

    const orderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        { productName: 'Test', quantity: 1, unitPrice: 10000, unitCost: 5000 },
      ],
    });

    const beforeTimestamp = Date.now();

    await t.mutation(api.orders.mutations.index.updateStatus, {
      orderId,
      status: 'AwaitingPayment',
    });

    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.awaitingPaymentSince).toBeDefined();
    expect(order?.awaitingPaymentSince).toBeGreaterThanOrEqual(beforeTimestamp);
  });

  test('can cancel order with reason', async () => {
    const t = convexTest(schema);

    const customerId = await createCustomer(t);

    const orderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        { productName: 'Test', quantity: 1, unitPrice: 10000, unitCost: 5000 },
      ],
    });

    await t.mutation(api.orders.mutations.index.cancel, {
      orderId,
      reason: 'Customer changed mind',
    });

    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe('Cancelled');
    expect(order?.cancellationReason).toBe('Customer changed mind');
  });
});

// ============================================
// Additional Order Tests (supplementary)
// ============================================

describe('Order Item Management', () => {
  test('can add item to existing order', async () => {
    const t = convexTest(schema);

    const customerId = await createCustomer(t);

    const orderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        { productName: 'Product A', quantity: 1, unitPrice: 10000, unitCost: 5000 },
      ],
    });

    let order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.itemCount).toBe(1);
    expect(order?.totalAmount).toBe(10000);

    await t.mutation(api.orders.mutations.index.addItem, {
      orderId,
      item: {
        productName: 'Product B',
        quantity: 2,
        unitPrice: 15000,
        unitCost: 7000,
      },
    });

    order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.itemCount).toBe(2);
    expect(order?.totalAmount).toBe(40000); // 10000 + 30000
  });

  test('updates totals when removing item', async () => {
    const t = convexTest(schema);

    const customerId = await createCustomer(t);

    const orderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      items: [
        { productName: 'Product A', quantity: 2, unitPrice: 10000, unitCost: 5000 },
        { productName: 'Product B', quantity: 1, unitPrice: 20000, unitCost: 8000 },
      ],
    });

    let order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.totalAmount).toBe(40000); // 20000 + 20000

    // Get items to find one to remove
    const items = await t.run(async (ctx) => {
      return await ctx.db
        .query('orderItems')
        .withIndex('by_order', (q) => q.eq('orderId', orderId))
        .collect();
    });

    const itemToRemove = items.find((i) => i.productName === 'Product B');

    await t.mutation(api.orders.mutations.index.removeItem, {
      itemId: itemToRemove!._id,
    });

    order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.itemCount).toBe(1);
    expect(order?.totalAmount).toBe(20000); // Only Product A remains
  });

  test('updates payment status', async () => {
    const t = convexTest(schema);

    const customerId = await createCustomer(t);

    const orderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        { productName: 'Test', quantity: 1, unitPrice: 10000, unitCost: 5000 },
      ],
    });

    let order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.paymentStatus).toBe('Unpaid');

    await t.mutation(api.orders.mutations.index.updatePayment, {
      orderId,
      paymentStatus: 'Paid',
      paymentMethod: 'BankTransfer',
    });

    order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.paymentStatus).toBe('Paid');
    expect(order?.paymentMethod).toBe('BankTransfer');
  });

  test('only allows deleting Draft orders', async () => {
    const t = convexTest(schema);

    const customerId = await createCustomer(t);
    await createDefaultStorageLocation(t);

    const orderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        { productName: 'Test', quantity: 1, unitPrice: 10000, unitCost: 5000 },
      ],
    });

    // Change status to PaymentReceived
    await t.mutation(api.orders.mutations.index.updateStatus, {
      orderId,
      status: 'PaymentReceived',
    });

    // Attempt to delete should fail
    await expect(
      t.mutation(api.orders.mutations.index.remove, { orderId })
    ).rejects.toThrow('Only draft orders can be deleted');

    // Change back to Draft - but we can't do that directly, so let's test with a fresh draft
    const draftOrderId = await t.mutation(api.orders.mutations.index.create, {
      customerId,
      lowPriceConfirmed: true,
      items: [
        { productName: 'Draft Test', quantity: 1, unitPrice: 5000, unitCost: 2000 },
      ],
    });

    // This should succeed
    const result = await t.mutation(api.orders.mutations.index.remove, {
      orderId: draftOrderId,
    });
    expect(result).toBe(true);
  });
});
