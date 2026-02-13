/**
 * Ball Distribution Algorithm Tests
 *
 * Comprehensive test suite for the ball distribution algorithm covering:
 * 1. Priority ordering (earliest deadline first)
 * 2. Partial fills across multiple production batches
 * 3. Mixed ball types (BIG_BALL + MID_BALL)
 * 4. Ghost ball prevention (traceability at every stage)
 * 5. Auto-status transitions (Confirmed -> InProduction -> Packaging)
 *
 * Uses completeBalls mutation as the primary entry point, which calls
 * distributeBallsToOrders internally. Tests verify state via direct
 * DB queries on orderItemProduction (source of truth).
 *
 * All fixtures use the unified BOM system (componentTypes + menuProductComponents),
 * NOT deprecated productionType/productionUnits fields.
 */

import { convexTest } from 'convex-test';
import { expect, test, describe } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import {
  createBasicOrder,
  createMenuProductWithBOM,
  createCustomer,
  verifyNoGhostBalls,
} from './helpers';

// ============================================
// 1. Priority Ordering (5 tests)
// ============================================

describe('Priority Ordering', () => {
  test('allocates to earliest deadline order first', async () => {
    const t = convexTest(schema);

    const customerId = await createCustomer(t);
    const { menuProductId } = await createMenuProductWithBOM(t, {
      code: 'PRIO-001',
      ballConfig: [{ code: 'BIG_BALL', quantity: 1 }],
    });

    // Order A: due tomorrow (earlier)
    const orderA = await createBasicOrder(t, {
      customerId,
      menuProductId,
      quantity: 5,
      dueDate: Date.now() + 86400000, // Tomorrow
      status: 'Confirmed',
      productName: 'Order A',
    });

    // Order B: due in 3 days (later)
    const orderB = await createBasicOrder(t, {
      customerId,
      menuProductId,
      quantity: 5,
      dueDate: Date.now() + 86400000 * 3, // 3 days from now
      status: 'Confirmed',
      productName: 'Order B',
    });

    // Only 3 balls available -- not enough for both
    const result = await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'big',
      count: 3,
    });

    expect(result.ballsUsed).toBe(3);

    // Order A (earlier deadline) should have received balls
    const orderAProduction = await t.run(async (ctx) => {
      const items = await ctx.db
        .query('orderItems')
        .withIndex('by_order', (q) => q.eq('orderId', orderA.orderId))
        .collect();
      const records = await ctx.db
        .query('orderItemProduction')
        .withIndex('by_order_item', (q) => q.eq('orderItemId', items[0]._id))
        .collect();
      return records;
    });

    expect(orderAProduction[0].unitsCompleted).toBe(3);
    expect(orderAProduction[0].unitsRemaining).toBe(2);

    // Order B should have received nothing
    const orderBProduction = await t.run(async (ctx) => {
      const items = await ctx.db
        .query('orderItems')
        .withIndex('by_order', (q) => q.eq('orderId', orderB.orderId))
        .collect();
      const records = await ctx.db
        .query('orderItemProduction')
        .withIndex('by_order_item', (q) => q.eq('orderItemId', items[0]._id))
        .collect();
      return records;
    });

    expect(orderBProduction[0].unitsCompleted).toBe(0);
    expect(orderBProduction[0].unitsRemaining).toBe(5);
  });

  test('handles same deadline by order creation time', async () => {
    const t = convexTest(schema);

    const customerId = await createCustomer(t);
    const { menuProductId } = await createMenuProductWithBOM(t, {
      code: 'PRIO-002',
      ballConfig: [{ code: 'BIG_BALL', quantity: 1 }],
    });

    const sameDueDate = Date.now() + 86400000;

    // Order A: created earlier
    const orderA = await createBasicOrder(t, {
      customerId,
      menuProductId,
      quantity: 5,
      dueDate: sameDueDate,
      orderDate: Date.now() - 3600000, // 1 hour ago
      status: 'Confirmed',
      productName: 'Earlier Order',
    });

    // Order B: created later
    const orderB = await createBasicOrder(t, {
      customerId,
      menuProductId,
      quantity: 5,
      dueDate: sameDueDate,
      orderDate: Date.now(), // Now
      status: 'Confirmed',
      productName: 'Later Order',
    });

    // 3 balls -- not enough for both
    await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'big',
      count: 3,
    });

    // Both have same dueDate and same totalUnits (5), so tiebreaker is orderDate ASC
    // Order A (earlier orderDate) gets priority
    const orderARecords = await t.run(async (ctx) => {
      const items = await ctx.db
        .query('orderItems')
        .withIndex('by_order', (q) => q.eq('orderId', orderA.orderId))
        .collect();
      return await ctx.db
        .query('orderItemProduction')
        .withIndex('by_order_item', (q) => q.eq('orderItemId', items[0]._id))
        .collect();
    });

    expect(orderARecords[0].unitsCompleted).toBe(3);

    const orderBRecords = await t.run(async (ctx) => {
      const items = await ctx.db
        .query('orderItems')
        .withIndex('by_order', (q) => q.eq('orderId', orderB.orderId))
        .collect();
      return await ctx.db
        .query('orderItemProduction')
        .withIndex('by_order_item', (q) => q.eq('orderItemId', items[0]._id))
        .collect();
    });

    expect(orderBRecords[0].unitsCompleted).toBe(0);
  });

  test('confirmed orders get priority over InProduction orders with same deadline', async () => {
    const t = convexTest(schema);

    const customerId = await createCustomer(t);
    const { menuProductId } = await createMenuProductWithBOM(t, {
      code: 'PRIO-003',
      ballConfig: [{ code: 'BIG_BALL', quantity: 1 }],
    });

    const sameDueDate = Date.now() + 86400000;

    // Order A: Confirmed
    const orderA = await createBasicOrder(t, {
      customerId,
      menuProductId,
      quantity: 5,
      dueDate: sameDueDate,
      orderDate: Date.now(),
      status: 'Confirmed',
      productName: 'Confirmed Order',
    });

    // Order B: InProduction (already started)
    const orderB = await createBasicOrder(t, {
      customerId,
      menuProductId,
      quantity: 5,
      dueDate: sameDueDate,
      orderDate: Date.now(),
      status: 'InProduction',
      productName: 'InProduction Order',
    });

    // The algorithm fetches Confirmed first, then InProduction
    // Both have same deadline and totalUnits
    await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'big',
      count: 3,
    });

    // Confirmed orders are fetched first in the code, so Order A gets balls first
    const orderARecords = await t.run(async (ctx) => {
      const items = await ctx.db
        .query('orderItems')
        .withIndex('by_order', (q) => q.eq('orderId', orderA.orderId))
        .collect();
      return await ctx.db
        .query('orderItemProduction')
        .withIndex('by_order_item', (q) => q.eq('orderItemId', items[0]._id))
        .collect();
    });

    // Order A should have received balls (it was Confirmed, which is fetched first)
    expect(orderARecords[0].unitsCompleted).toBe(3);
  });

  test('multiple orders with different deadlines get correct sequence', async () => {
    const t = convexTest(schema);

    const customerId = await createCustomer(t);
    const { menuProductId } = await createMenuProductWithBOM(t, {
      code: 'PRIO-004',
      ballConfig: [{ code: 'BIG_BALL', quantity: 1 }],
    });

    const now = Date.now();

    // Order C: due in 3 days
    const orderC = await createBasicOrder(t, {
      customerId,
      menuProductId,
      quantity: 2,
      dueDate: now + 86400000 * 3,
      status: 'Confirmed',
      productName: 'Order C (3 days)',
    });

    // Order A: due tomorrow (earliest)
    const orderA = await createBasicOrder(t, {
      customerId,
      menuProductId,
      quantity: 2,
      dueDate: now + 86400000,
      status: 'Confirmed',
      productName: 'Order A (1 day)',
    });

    // Order B: due in 2 days
    const orderB = await createBasicOrder(t, {
      customerId,
      menuProductId,
      quantity: 2,
      dueDate: now + 86400000 * 2,
      status: 'Confirmed',
      productName: 'Order B (2 days)',
    });

    // 5 balls: enough for A (2) + B (2) + 1 leftover for C
    await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'big',
      count: 5,
    });

    // Verify allocation sequence: A first, then B, then C
    const getCompleted = async (orderId: typeof orderA.orderId) => {
      return await t.run(async (ctx) => {
        const items = await ctx.db
          .query('orderItems')
          .withIndex('by_order', (q) => q.eq('orderId', orderId))
          .collect();
        const records = await ctx.db
          .query('orderItemProduction')
          .withIndex('by_order_item', (q) => q.eq('orderItemId', items[0]._id))
          .collect();
        return records[0].unitsCompleted;
      });
    };

    expect(await getCompleted(orderA.orderId)).toBe(2); // Fully filled
    expect(await getCompleted(orderB.orderId)).toBe(2); // Fully filled
    expect(await getCompleted(orderC.orderId)).toBe(1); // Partially filled
  });

  test('empty queue handles new balls correctly', async () => {
    const t = convexTest(schema);

    // No orders at all -- balls should overflow
    const result = await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'big',
      count: 10,
    });

    expect(result.ballsUsed).toBe(0);
    expect(result.overflow).toBe(10);
    expect(result.completedOrderIds).toHaveLength(0);
    expect(result.transitionedToInProduction).toHaveLength(0);
  });
});

// ============================================
// 2. Partial Fills (6 tests)
// ============================================

describe('Partial Fills', () => {
  test('order needing 10 balls gets 6 now, 4 later across multiple batches', async () => {
    const t = convexTest(schema);

    const order = await createBasicOrder(t, {
      quantity: 10,
      status: 'Confirmed',
      ballConfig: [{ code: 'BIG_BALL', quantity: 1 }],
    });

    // First batch: 6 balls
    await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'big',
      count: 6,
    });

    let records = await t.run(async (ctx) => {
      return await ctx.db
        .query('orderItemProduction')
        .withIndex('by_order_item', (q) => q.eq('orderItemId', order.orderItemIds[0]))
        .collect();
    });

    expect(records[0].unitsCompleted).toBe(6);
    expect(records[0].unitsRemaining).toBe(4);

    // Second batch: 4 balls
    await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'big',
      count: 4,
    });

    records = await t.run(async (ctx) => {
      return await ctx.db
        .query('orderItemProduction')
        .withIndex('by_order_item', (q) => q.eq('orderItemId', order.orderItemIds[0]))
        .collect();
    });

    expect(records[0].unitsCompleted).toBe(10);
    expect(records[0].unitsRemaining).toBe(0);
  });

  test('partial fill maintains unitsRemaining correctly in orderItemProduction', async () => {
    const t = convexTest(schema);

    const order = await createBasicOrder(t, {
      quantity: 20,
      status: 'Confirmed',
      ballConfig: [{ code: 'BIG_BALL', quantity: 1 }],
    });

    // Apply 7 balls
    await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'big',
      count: 7,
    });

    const records = await t.run(async (ctx) => {
      return await ctx.db
        .query('orderItemProduction')
        .withIndex('by_order_item', (q) => q.eq('orderItemId', order.orderItemIds[0]))
        .collect();
    });

    // Invariant: unitsRequired = unitsCompleted + unitsRemaining
    expect(records[0].unitsRequired).toBe(20);
    expect(records[0].unitsCompleted).toBe(7);
    expect(records[0].unitsRemaining).toBe(13);
    expect(records[0].unitsRequired).toBe(records[0].unitsCompleted + records[0].unitsRemaining);
  });

  test('multiple partial fills accumulate correctly', async () => {
    const t = convexTest(schema);

    const order = await createBasicOrder(t, {
      quantity: 15,
      status: 'Confirmed',
      ballConfig: [{ code: 'BIG_BALL', quantity: 1 }],
    });

    // Three batches: 3, 5, 4
    await t.mutation(api.orders.mutations.index.completeBalls, { ballType: 'big', count: 3 });
    await t.mutation(api.orders.mutations.index.completeBalls, { ballType: 'big', count: 5 });
    await t.mutation(api.orders.mutations.index.completeBalls, { ballType: 'big', count: 4 });

    const records = await t.run(async (ctx) => {
      return await ctx.db
        .query('orderItemProduction')
        .withIndex('by_order_item', (q) => q.eq('orderItemId', order.orderItemIds[0]))
        .collect();
    });

    expect(records[0].unitsCompleted).toBe(12); // 3 + 5 + 4
    expect(records[0].unitsRemaining).toBe(3); // 15 - 12
  });

  test('order transitions to InProduction on first partial fill', async () => {
    const t = convexTest(schema);

    const order = await createBasicOrder(t, {
      quantity: 10,
      status: 'Confirmed',
      ballConfig: [{ code: 'BIG_BALL', quantity: 1 }],
    });

    // Verify initial status
    let orderDoc = await t.run(async (ctx) => ctx.db.get(order.orderId));
    expect(orderDoc?.status).toBe('Confirmed');

    // First ball
    const result = await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'big',
      count: 1,
    });

    expect(result.transitionedToInProduction).toHaveLength(1);

    orderDoc = await t.run(async (ctx) => ctx.db.get(order.orderId));
    expect(orderDoc?.status).toBe('InProduction');
  });

  test('order transitions to Packaging when fully filled', async () => {
    const t = convexTest(schema);

    const order = await createBasicOrder(t, {
      quantity: 5,
      status: 'Confirmed',
      ballConfig: [{ code: 'BIG_BALL', quantity: 1 }],
    });

    // Fill completely in one batch
    const result = await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'big',
      count: 5,
    });

    expect(result.completedOrderIds).toHaveLength(1);

    const orderDoc = await t.run(async (ctx) => ctx.db.get(order.orderId));
    expect(orderDoc?.status).toBe('Packaging');
  });

  test('tray exhaustion mid-order leaves remaining orders unfilled', async () => {
    const t = convexTest(schema);

    const customerId = await createCustomer(t);
    const { menuProductId } = await createMenuProductWithBOM(t, {
      code: 'PART-006',
      ballConfig: [{ code: 'BIG_BALL', quantity: 1 }],
    });

    // Order A: needs 8 balls (earlier deadline)
    const orderA = await createBasicOrder(t, {
      customerId,
      menuProductId,
      quantity: 8,
      dueDate: Date.now() + 86400000,
      status: 'Confirmed',
    });

    // Order B: needs 5 balls (later deadline)
    const orderB = await createBasicOrder(t, {
      customerId,
      menuProductId,
      quantity: 5,
      dueDate: Date.now() + 86400000 * 2,
      status: 'Confirmed',
    });

    // Only 10 balls: 8 for A, 2 for B (partially)
    const result = await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'big',
      count: 10,
    });

    expect(result.ballsUsed).toBe(10);
    expect(result.overflow).toBe(0);

    // Order A: fully filled
    const orderARecords = await t.run(async (ctx) => {
      return await ctx.db
        .query('orderItemProduction')
        .withIndex('by_order_item', (q) => q.eq('orderItemId', orderA.orderItemIds[0]))
        .collect();
    });
    expect(orderARecords[0].unitsCompleted).toBe(8);

    // Order B: partially filled
    const orderBRecords = await t.run(async (ctx) => {
      return await ctx.db
        .query('orderItemProduction')
        .withIndex('by_order_item', (q) => q.eq('orderItemId', orderB.orderItemIds[0]))
        .collect();
    });
    expect(orderBRecords[0].unitsCompleted).toBe(2);
    expect(orderBRecords[0].unitsRemaining).toBe(3);
  });
});

// ============================================
// 3. Mixed Ball Types (5 tests)
// ============================================

describe('Mixed Ball Types', () => {
  test('order with 2 products (1 BIG_BALL, 1 MID_BALL) distributes correctly', async () => {
    const t = convexTest(schema);

    const customerId = await createCustomer(t);

    // Create a menu product that needs both BIG and MID balls
    const { menuProductId } = await createMenuProductWithBOM(t, {
      code: 'MIX-001',
      name: 'Combo Pack',
      ballConfig: [
        { code: 'BIG_BALL', quantity: 2 },
        { code: 'MID_BALL', quantity: 3 },
      ],
    });

    const order = await createBasicOrder(t, {
      customerId,
      menuProductId,
      quantity: 1,
      status: 'Confirmed',
    });

    // Distribute big balls
    await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'big',
      count: 5,
    });

    // Distribute mid balls
    await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'mid',
      count: 5,
    });

    const records = await t.run(async (ctx) => {
      return await ctx.db
        .query('orderItemProduction')
        .withIndex('by_order_item', (q) => q.eq('orderItemId', order.orderItemIds[0]))
        .collect();
    });

    const bigRecord = records.find((r) => r.productionUnitCode === 'BIG_BALL');
    const midRecord = records.find((r) => r.productionUnitCode === 'MID_BALL');

    expect(bigRecord?.unitsCompleted).toBe(2);
    expect(bigRecord?.unitsRemaining).toBe(0);
    expect(midRecord?.unitsCompleted).toBe(3);
    expect(midRecord?.unitsRemaining).toBe(0);
  });

  test('order with 3-4 products distributes correct type to each', async () => {
    const t = convexTest(schema);

    const customerId = await createCustomer(t);

    // Product with 1 big, 2 mid, 1 big (total: 2 big, 2 mid per unit)
    const { menuProductId } = await createMenuProductWithBOM(t, {
      code: 'MIX-002',
      name: 'Party Pack',
      ballConfig: [
        { code: 'BIG_BALL', quantity: 3 },
        { code: 'MID_BALL', quantity: 2 },
      ],
    });

    // Order 2 units: needs 6 BIG, 4 MID total
    const order = await createBasicOrder(t, {
      customerId,
      menuProductId,
      quantity: 2,
      status: 'Confirmed',
    });

    // Distribute big balls first
    await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'big',
      count: 6,
    });

    // Distribute mid balls
    await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'mid',
      count: 4,
    });

    const records = await t.run(async (ctx) => {
      return await ctx.db
        .query('orderItemProduction')
        .withIndex('by_order_item', (q) => q.eq('orderItemId', order.orderItemIds[0]))
        .collect();
    });

    const bigRecord = records.find((r) => r.productionUnitCode === 'BIG_BALL');
    const midRecord = records.find((r) => r.productionUnitCode === 'MID_BALL');

    expect(bigRecord?.unitsRequired).toBe(6);
    expect(bigRecord?.unitsCompleted).toBe(6);
    expect(midRecord?.unitsRequired).toBe(4);
    expect(midRecord?.unitsCompleted).toBe(4);
  });

  test('BIG_BALL production only fills BIG_BALL needs, leaves MID_BALL unfilled', async () => {
    const t = convexTest(schema);

    const { menuProductId } = await createMenuProductWithBOM(t, {
      code: 'MIX-003',
      ballConfig: [
        { code: 'BIG_BALL', quantity: 3 },
        { code: 'MID_BALL', quantity: 5 },
      ],
    });

    const order = await createBasicOrder(t, {
      menuProductId,
      quantity: 1,
      status: 'Confirmed',
    });

    // Only produce big balls
    await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'big',
      count: 10,
    });

    const records = await t.run(async (ctx) => {
      return await ctx.db
        .query('orderItemProduction')
        .withIndex('by_order_item', (q) => q.eq('orderItemId', order.orderItemIds[0]))
        .collect();
    });

    const bigRecord = records.find((r) => r.productionUnitCode === 'BIG_BALL');
    const midRecord = records.find((r) => r.productionUnitCode === 'MID_BALL');

    expect(bigRecord?.unitsCompleted).toBe(3);
    expect(bigRecord?.unitsRemaining).toBe(0);
    // MID_BALL should be completely unfilled
    expect(midRecord?.unitsCompleted).toBe(0);
    expect(midRecord?.unitsRemaining).toBe(5);
  });

  test('MID_BALL production only fills MID_BALL needs, leaves BIG_BALL unfilled', async () => {
    const t = convexTest(schema);

    const { menuProductId } = await createMenuProductWithBOM(t, {
      code: 'MIX-004',
      ballConfig: [
        { code: 'BIG_BALL', quantity: 4 },
        { code: 'MID_BALL', quantity: 2 },
      ],
    });

    const order = await createBasicOrder(t, {
      menuProductId,
      quantity: 1,
      status: 'Confirmed',
    });

    // Only produce mid balls
    await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'mid',
      count: 10,
    });

    const records = await t.run(async (ctx) => {
      return await ctx.db
        .query('orderItemProduction')
        .withIndex('by_order_item', (q) => q.eq('orderItemId', order.orderItemIds[0]))
        .collect();
    });

    const bigRecord = records.find((r) => r.productionUnitCode === 'BIG_BALL');
    const midRecord = records.find((r) => r.productionUnitCode === 'MID_BALL');

    // BIG_BALL should be completely unfilled
    expect(bigRecord?.unitsCompleted).toBe(0);
    expect(bigRecord?.unitsRemaining).toBe(4);
    expect(midRecord?.unitsCompleted).toBe(2);
    expect(midRecord?.unitsRemaining).toBe(0);
  });

  test('complex order (mixed types) with partial fill preserves correct unitsRemaining per type', async () => {
    const t = convexTest(schema);

    const { menuProductId } = await createMenuProductWithBOM(t, {
      code: 'MIX-005',
      ballConfig: [
        { code: 'BIG_BALL', quantity: 5 },
        { code: 'MID_BALL', quantity: 8 },
      ],
    });

    const order = await createBasicOrder(t, {
      menuProductId,
      quantity: 2, // Needs: 10 BIG, 16 MID
      status: 'Confirmed',
    });

    // Partial fill of big balls (7 of 10)
    await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'big',
      count: 7,
    });

    // Partial fill of mid balls (10 of 16)
    await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'mid',
      count: 10,
    });

    const records = await t.run(async (ctx) => {
      return await ctx.db
        .query('orderItemProduction')
        .withIndex('by_order_item', (q) => q.eq('orderItemId', order.orderItemIds[0]))
        .collect();
    });

    const bigRecord = records.find((r) => r.productionUnitCode === 'BIG_BALL');
    const midRecord = records.find((r) => r.productionUnitCode === 'MID_BALL');

    // Big: 10 required, 7 completed, 3 remaining
    expect(bigRecord?.unitsRequired).toBe(10);
    expect(bigRecord?.unitsCompleted).toBe(7);
    expect(bigRecord?.unitsRemaining).toBe(3);

    // Mid: 16 required, 10 completed, 6 remaining
    expect(midRecord?.unitsRequired).toBe(16);
    expect(midRecord?.unitsCompleted).toBe(10);
    expect(midRecord?.unitsRemaining).toBe(6);

    // Invariants hold for both
    expect(bigRecord!.unitsRequired).toBe(bigRecord!.unitsCompleted + bigRecord!.unitsRemaining);
    expect(midRecord!.unitsRequired).toBe(midRecord!.unitsCompleted + midRecord!.unitsRemaining);
  });
});

// ============================================
// 4. Ghost Ball Prevention (5 tests)
// ============================================

describe('Ghost Ball Prevention', () => {
  test('balls produced with no pending orders sit as overflow (NOT orphaned)', async () => {
    const t = convexTest(schema);

    // Produce balls with no orders at all
    const result = await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'big',
      count: 20,
    });

    // All balls should overflow (not allocated anywhere)
    expect(result.ballsUsed).toBe(0);
    expect(result.overflow).toBe(20);

    // Ghost ball check should pass (no production records to violate)
    const ghostCheck = await verifyNoGhostBalls(t);
    expect(ghostCheck.passed).toBe(true);
    expect(ghostCheck.totalRecords).toBe(0);
  });

  test('after distribution to all orders, excess balls are traceable (verifyNoGhostBalls passes)', async () => {
    const t = convexTest(schema);

    const order = await createBasicOrder(t, {
      quantity: 3,
      status: 'Confirmed',
      ballConfig: [{ code: 'BIG_BALL', quantity: 1 }],
    });

    // Send 10 balls when only 3 needed
    const result = await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'big',
      count: 10,
    });

    expect(result.ballsUsed).toBe(3);
    expect(result.overflow).toBe(7);

    // No ghost balls -- all production records are valid
    const ghostCheck = await verifyNoGhostBalls(t);
    expect(ghostCheck.passed).toBe(true);
    expect(ghostCheck.totalProduced).toBe(3);
    expect(ghostCheck.totalRemaining).toBe(0);
  });

  test('cancelled order production records are excluded from ghost check', async () => {
    const t = convexTest(schema);

    const order = await createBasicOrder(t, {
      quantity: 5,
      status: 'Confirmed',
      ballConfig: [{ code: 'BIG_BALL', quantity: 1 }],
    });

    // Fill some balls
    await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'big',
      count: 3,
    });

    // Cancel the production records manually (simulating order cancellation)
    await t.run(async (ctx) => {
      const records = await ctx.db
        .query('orderItemProduction')
        .withIndex('by_order_item', (q) => q.eq('orderItemId', order.orderItemIds[0]))
        .collect();
      for (const record of records) {
        await ctx.db.patch(record._id, { isCancelled: true });
      }
    });

    // Ghost check should pass -- cancelled records are excluded
    const ghostCheck = await verifyNoGhostBalls(t);
    expect(ghostCheck.passed).toBe(true);
    expect(ghostCheck.activeRecords).toBe(0);
  });

  test('production pipeline stages all maintain traceability', async () => {
    const t = convexTest(schema);

    // Create multiple orders at different stages
    const orderA = await createBasicOrder(t, {
      quantity: 3,
      status: 'Confirmed',
      ballConfig: [{ code: 'BIG_BALL', quantity: 1 }],
    });

    const orderB = await createBasicOrder(t, {
      quantity: 5,
      status: 'InProduction',
      ballConfig: [{ code: 'MID_BALL', quantity: 1 }],
    });

    // Fill Order A completely (Confirmed -> InProduction -> Packaging)
    await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'big',
      count: 3,
    });

    // Partially fill Order B
    await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'mid',
      count: 2,
    });

    // All records should be traceable at every stage
    const ghostCheck = await verifyNoGhostBalls(t);
    expect(ghostCheck.passed).toBe(true);
    expect(ghostCheck.violations).toHaveLength(0);

    // Verify total counts make sense
    expect(ghostCheck.totalProduced).toBe(5); // 3 big + 2 mid
    expect(ghostCheck.totalRemaining).toBe(3); // Order B has 3 remaining
  });

  test('verify sum of allocated + remaining = total required', async () => {
    const t = convexTest(schema);

    // Create orders with mixed types
    const orderA = await createBasicOrder(t, {
      quantity: 4,
      status: 'Confirmed',
      ballConfig: [{ code: 'BIG_BALL', quantity: 2 }], // Needs 8 big
    });

    const orderB = await createBasicOrder(t, {
      quantity: 3,
      status: 'Confirmed',
      ballConfig: [{ code: 'MID_BALL', quantity: 3 }], // Needs 9 mid
    });

    // Partially fill both
    await t.mutation(api.orders.mutations.index.completeBalls, { ballType: 'big', count: 5 });
    await t.mutation(api.orders.mutations.index.completeBalls, { ballType: 'mid', count: 4 });

    // Ghost check verifies invariant: required = completed + remaining
    const ghostCheck = await verifyNoGhostBalls(t);
    expect(ghostCheck.passed).toBe(true);

    // Verify totals
    expect(ghostCheck.totalProduced).toBe(9); // 5 big + 4 mid
    expect(ghostCheck.totalRemaining).toBe(8); // (8-5) + (9-4) = 3 + 5

    // Total required should be sum of produced + remaining
    expect(ghostCheck.totalProduced + ghostCheck.totalRemaining).toBe(17); // 8 + 9
  });
});

// ============================================
// 5. Auto-Transitions (4 tests)
// ============================================

describe('Auto-Transitions', () => {
  test('confirmed order auto-transitions to InProduction on first ball filled', async () => {
    const t = convexTest(schema);

    const order = await createBasicOrder(t, {
      quantity: 10,
      status: 'Confirmed',
      ballConfig: [{ code: 'BIG_BALL', quantity: 1 }],
    });

    // Verify starting status
    let orderDoc = await t.run(async (ctx) => ctx.db.get(order.orderId));
    expect(orderDoc?.status).toBe('Confirmed');

    // Add just 1 ball
    const result = await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'big',
      count: 1,
    });

    expect(result.transitionedToInProduction).toContainEqual(order.orderId);

    orderDoc = await t.run(async (ctx) => ctx.db.get(order.orderId));
    expect(orderDoc?.status).toBe('InProduction');

    // Verify audit event was logged
    const events = await t.run(async (ctx) => {
      return await ctx.db
        .query('orderEvents')
        .withIndex('by_order', (q) => q.eq('orderId', order.orderId))
        .collect();
    });

    const transitionEvent = events.find(
      (e) => e.eventType === 'status_auto_transition' && e.toStatus === 'InProduction'
    );
    expect(transitionEvent).toBeDefined();
    expect(transitionEvent?.fromStatus).toBe('Confirmed');
  });

  test('InProduction order stays InProduction on partial fill', async () => {
    const t = convexTest(schema);

    const order = await createBasicOrder(t, {
      quantity: 10,
      status: 'InProduction',
      ballConfig: [{ code: 'BIG_BALL', quantity: 1 }],
    });

    // Partial fill
    await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'big',
      count: 5,
    });

    const orderDoc = await t.run(async (ctx) => ctx.db.get(order.orderId));
    expect(orderDoc?.status).toBe('InProduction');
  });

  test('InProduction order auto-transitions to Packaging when production complete', async () => {
    const t = convexTest(schema);

    const order = await createBasicOrder(t, {
      quantity: 5,
      status: 'InProduction',
      ballConfig: [{ code: 'BIG_BALL', quantity: 1 }],
    });

    // Fill completely
    const result = await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'big',
      count: 5,
    });

    expect(result.completedOrderIds).toContainEqual(order.orderId);

    const orderDoc = await t.run(async (ctx) => ctx.db.get(order.orderId));
    expect(orderDoc?.status).toBe('Packaging');

    // Verify items are marked as production complete
    const items = await t.run(async (ctx) => {
      return await ctx.db
        .query('orderItems')
        .withIndex('by_order', (q) => q.eq('orderId', order.orderId))
        .collect();
    });
    expect(items[0].isProductionComplete).toBe(true);

    // Verify audit trail
    const events = await t.run(async (ctx) => {
      return await ctx.db
        .query('orderEvents')
        .withIndex('by_order', (q) => q.eq('orderId', order.orderId))
        .collect();
    });

    const packagingEvent = events.find(
      (e) => e.eventType === 'status_auto_transition' && e.toStatus === 'Packaging'
    );
    expect(packagingEvent).toBeDefined();
  });

  test('Draft status order does NOT get balls allocated', async () => {
    const t = convexTest(schema);

    const order = await createBasicOrder(t, {
      quantity: 5,
      status: 'Draft',
      ballConfig: [{ code: 'BIG_BALL', quantity: 1 }],
    });

    // Try to distribute balls
    const result = await t.mutation(api.orders.mutations.index.completeBalls, {
      ballType: 'big',
      count: 10,
    });

    // All balls should overflow since Draft orders are not eligible
    expect(result.ballsUsed).toBe(0);
    expect(result.overflow).toBe(10);

    // Draft order production records should be untouched
    const records = await t.run(async (ctx) => {
      return await ctx.db
        .query('orderItemProduction')
        .withIndex('by_order_item', (q) => q.eq('orderItemId', order.orderItemIds[0]))
        .collect();
    });

    expect(records[0].unitsCompleted).toBe(0);
    expect(records[0].unitsRemaining).toBe(5);

    // Order should still be Draft
    const orderDoc = await t.run(async (ctx) => ctx.db.get(order.orderId));
    expect(orderDoc?.status).toBe('Draft');
  });
});
