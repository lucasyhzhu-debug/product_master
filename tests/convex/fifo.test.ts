/**
 * FIFO Inventory Consumption Tests
 *
 * Comprehensive tests for First-In-First-Out batch consumption covering:
 * 1. Basic FIFO ordering (oldest batch consumed first)
 * 2. Partial batch depletion and cross-batch consumption
 * 3. Expired batch handling (skip expired, error on all expired)
 * 4. Edge cases (negative stock prevention, zero qty, concurrent, batch depletion status)
 *
 * Tests the consumeFromFIFO and applyFIFOConsumption functions from convex/inventory/fifo.ts
 * using convex-test for isolated database per test.
 */

import { convexTest } from 'convex-test';
import { expect, test, describe } from 'vitest';
import schema from '../../convex/schema';
import { consumeFromFIFO, applyFIFOConsumption } from '../../convex/inventory/fifo';
import {
  createStorageLocation,
  createPackagingComponentType,
  createInventoryBatch,
  verifyBatchState,
} from './helpers';

// ============================================
// 1. Basic FIFO Ordering (5 tests)
// ============================================
describe('Basic FIFO ordering', () => {
  test('oldest batch consumed first when 2 batches available', async () => {
    const t = convexTest(schema);
    const locationId = await createStorageLocation(t);
    const componentId = await createPackagingComponentType(t, { code: 'FIFO_BOX_1' });

    const now = Date.now();
    const oldBatchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 100,
      unitCost: 500,
      purchaseDate: now - 172800000, // 2 days ago
    });
    const newBatchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 100,
      unitCost: 600,
      purchaseDate: now, // today
    });

    // Consume 50 units - should come from oldest batch
    const result = await t.run(async (ctx) => {
      return await consumeFromFIFO(ctx, componentId, locationId, 50);
    });

    expect(result.totalQuantity).toBe(50);
    expect(result.consumptions).toHaveLength(1);
    expect(result.consumptions[0].batchId).toBe(oldBatchId);
    expect(result.consumptions[0].quantity).toBe(50);
    expect(result.consumptions[0].unitCost).toBe(500);

    // Apply consumption to update batch quantities
    await t.run(async (ctx) => {
      await applyFIFOConsumption(ctx, result, componentId, locationId);
    });

    await verifyBatchState(t, oldBatchId, 50); // 100 - 50
    await verifyBatchState(t, newBatchId, 100); // unchanged
  });

  test('oldest batch consumed first when 3+ batches available', async () => {
    const t = convexTest(schema);
    const locationId = await createStorageLocation(t);
    const componentId = await createPackagingComponentType(t, { code: 'FIFO_BOX_2' });

    const now = Date.now();
    const oldestBatchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 80,
      unitCost: 450,
      purchaseDate: now - 259200000, // 3 days ago
    });
    const middleBatchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 120,
      unitCost: 500,
      purchaseDate: now - 86400000, // 1 day ago
    });
    const newestBatchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 60,
      unitCost: 550,
      purchaseDate: now, // today
    });

    // Consume 30 units - should come from oldest
    const result = await t.run(async (ctx) => {
      return await consumeFromFIFO(ctx, componentId, locationId, 30);
    });

    expect(result.consumptions).toHaveLength(1);
    expect(result.consumptions[0].batchId).toBe(oldestBatchId);
    expect(result.consumptions[0].quantity).toBe(30);

    await t.run(async (ctx) => {
      await applyFIFOConsumption(ctx, result, componentId, locationId);
    });

    await verifyBatchState(t, oldestBatchId, 50); // 80 - 30
    await verifyBatchState(t, middleBatchId, 120); // unchanged
    await verifyBatchState(t, newestBatchId, 60); // unchanged
  });

  test('middle batch consumed after oldest depleted', async () => {
    const t = convexTest(schema);
    const locationId = await createStorageLocation(t);
    const componentId = await createPackagingComponentType(t, { code: 'FIFO_BOX_3' });

    const now = Date.now();
    const oldBatchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 50,
      unitCost: 400,
      purchaseDate: now - 172800000, // 2 days ago
    });
    const middleBatchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 100,
      unitCost: 500,
      purchaseDate: now - 86400000, // 1 day ago
    });
    const newBatchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 100,
      unitCost: 600,
      purchaseDate: now, // today
    });

    // Consume 80 units - should deplete oldest (50) and take 30 from middle
    const result = await t.run(async (ctx) => {
      return await consumeFromFIFO(ctx, componentId, locationId, 80);
    });

    expect(result.consumptions).toHaveLength(2);
    expect(result.consumptions[0].batchId).toBe(oldBatchId);
    expect(result.consumptions[0].quantity).toBe(50);
    expect(result.consumptions[1].batchId).toBe(middleBatchId);
    expect(result.consumptions[1].quantity).toBe(30);

    await t.run(async (ctx) => {
      await applyFIFOConsumption(ctx, result, componentId, locationId);
    });

    await verifyBatchState(t, oldBatchId, 0); // depleted
    await verifyBatchState(t, middleBatchId, 70); // 100 - 30
    await verifyBatchState(t, newBatchId, 100); // unchanged
  });

  test('newest batch consumed last after all older batches depleted', async () => {
    const t = convexTest(schema);
    const locationId = await createStorageLocation(t);
    const componentId = await createPackagingComponentType(t, { code: 'FIFO_BOX_4' });

    const now = Date.now();
    const oldBatchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 30,
      unitCost: 400,
      purchaseDate: now - 172800000,
    });
    const midBatchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 40,
      unitCost: 500,
      purchaseDate: now - 86400000,
    });
    const newBatchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 80,
      unitCost: 600,
      purchaseDate: now,
    });

    // Consume 100 units - should deplete old (30) + mid (40) + take 30 from new
    const result = await t.run(async (ctx) => {
      return await consumeFromFIFO(ctx, componentId, locationId, 100);
    });

    expect(result.consumptions).toHaveLength(3);
    expect(result.consumptions[0].batchId).toBe(oldBatchId);
    expect(result.consumptions[0].quantity).toBe(30);
    expect(result.consumptions[1].batchId).toBe(midBatchId);
    expect(result.consumptions[1].quantity).toBe(40);
    expect(result.consumptions[2].batchId).toBe(newBatchId);
    expect(result.consumptions[2].quantity).toBe(30);

    await t.run(async (ctx) => {
      await applyFIFOConsumption(ctx, result, componentId, locationId);
    });

    await verifyBatchState(t, oldBatchId, 0);
    await verifyBatchState(t, midBatchId, 0);
    await verifyBatchState(t, newBatchId, 50); // 80 - 30
  });

  test('single batch consumption works correctly', async () => {
    const t = convexTest(schema);
    const locationId = await createStorageLocation(t);
    const componentId = await createPackagingComponentType(t, { code: 'FIFO_BOX_5' });

    const batchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 200,
      unitCost: 500,
    });

    const result = await t.run(async (ctx) => {
      return await consumeFromFIFO(ctx, componentId, locationId, 75);
    });

    expect(result.totalQuantity).toBe(75);
    expect(result.consumptions).toHaveLength(1);
    expect(result.consumptions[0].batchId).toBe(batchId);
    expect(result.consumptions[0].quantity).toBe(75);

    await t.run(async (ctx) => {
      await applyFIFOConsumption(ctx, result, componentId, locationId);
    });

    await verifyBatchState(t, batchId, 125); // 200 - 75
  });
});

// ============================================
// 2. Partial Depletion (5 tests)
// ============================================
describe('Partial depletion', () => {
  test('consuming 75 from 100-unit batch leaves 25 remaining', async () => {
    const t = convexTest(schema);
    const locationId = await createStorageLocation(t);
    const componentId = await createPackagingComponentType(t, { code: 'PARTIAL_1' });

    const batchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 100,
      unitCost: 500,
    });

    const result = await t.run(async (ctx) => {
      return await consumeFromFIFO(ctx, componentId, locationId, 75);
    });

    await t.run(async (ctx) => {
      await applyFIFOConsumption(ctx, result, componentId, locationId);
    });

    await verifyBatchState(t, batchId, 25);

    // Verify batch is still active (not depleted)
    const batch = await t.run(async (ctx) => ctx.db.get(batchId));
    expect(batch?.status).toBe('active');
  });

  test('consuming across 2 batches depletes first and partially depletes second', async () => {
    const t = convexTest(schema);
    const locationId = await createStorageLocation(t);
    const componentId = await createPackagingComponentType(t, { code: 'PARTIAL_2' });

    const now = Date.now();
    const firstBatchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 80,
      unitCost: 500,
      purchaseDate: now - 86400000, // older
    });
    const secondBatchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 120,
      unitCost: 600,
      purchaseDate: now, // newer
    });

    // Consume 100 - should take all 80 from first, 20 from second
    const result = await t.run(async (ctx) => {
      return await consumeFromFIFO(ctx, componentId, locationId, 100);
    });

    expect(result.consumptions).toHaveLength(2);
    expect(result.consumptions[0].quantity).toBe(80);
    expect(result.consumptions[1].quantity).toBe(20);

    await t.run(async (ctx) => {
      await applyFIFOConsumption(ctx, result, componentId, locationId);
    });

    await verifyBatchState(t, firstBatchId, 0); // depleted
    await verifyBatchState(t, secondBatchId, 100); // 120 - 20

    const firstBatch = await t.run(async (ctx) => ctx.db.get(firstBatchId));
    expect(firstBatch?.status).toBe('depleted');
  });

  test('consuming exact batch quantity marks batch as depleted', async () => {
    const t = convexTest(schema);
    const locationId = await createStorageLocation(t);
    const componentId = await createPackagingComponentType(t, { code: 'PARTIAL_3' });

    const batchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 100,
      unitCost: 500,
    });

    const result = await t.run(async (ctx) => {
      return await consumeFromFIFO(ctx, componentId, locationId, 100);
    });

    await t.run(async (ctx) => {
      await applyFIFOConsumption(ctx, result, componentId, locationId);
    });

    await verifyBatchState(t, batchId, 0);

    const batch = await t.run(async (ctx) => ctx.db.get(batchId));
    expect(batch?.status).toBe('depleted');
  });

  test('multiple partial consumptions from same batch accumulate correctly', async () => {
    const t = convexTest(schema);
    const locationId = await createStorageLocation(t);
    const componentId = await createPackagingComponentType(t, { code: 'PARTIAL_4' });

    const batchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 100,
      unitCost: 500,
    });

    // Consume 30
    const result1 = await t.run(async (ctx) => {
      return await consumeFromFIFO(ctx, componentId, locationId, 30);
    });
    await t.run(async (ctx) => {
      await applyFIFOConsumption(ctx, result1, componentId, locationId);
    });
    await verifyBatchState(t, batchId, 70); // 100 - 30

    // Consume 40
    const result2 = await t.run(async (ctx) => {
      return await consumeFromFIFO(ctx, componentId, locationId, 40);
    });
    await t.run(async (ctx) => {
      await applyFIFOConsumption(ctx, result2, componentId, locationId);
    });
    await verifyBatchState(t, batchId, 30); // 70 - 40

    // Consume 30 (final - should deplete)
    const result3 = await t.run(async (ctx) => {
      return await consumeFromFIFO(ctx, componentId, locationId, 30);
    });
    await t.run(async (ctx) => {
      await applyFIFOConsumption(ctx, result3, componentId, locationId);
    });
    await verifyBatchState(t, batchId, 0);

    const batch = await t.run(async (ctx) => ctx.db.get(batchId));
    expect(batch?.status).toBe('depleted');
  });

  test('cost calculation uses weighted average when consuming across batches', async () => {
    const t = convexTest(schema);
    const locationId = await createStorageLocation(t);
    const componentId = await createPackagingComponentType(t, { code: 'PARTIAL_5' });

    const now = Date.now();
    await createInventoryBatch(t, componentId, locationId, {
      quantity: 100,
      unitCost: 500, // 500 IDR/unit
      purchaseDate: now - 86400000, // older
    });
    await createInventoryBatch(t, componentId, locationId, {
      quantity: 100,
      unitCost: 1000, // 1000 IDR/unit
      purchaseDate: now, // newer
    });

    // Consume 150 - takes all 100 from first (500 IDR) + 50 from second (1000 IDR)
    const result = await t.run(async (ctx) => {
      return await consumeFromFIFO(ctx, componentId, locationId, 150);
    });

    // Total cost: (100 * 500) + (50 * 1000) = 50000 + 50000 = 100000
    expect(result.totalCost).toBe(100000);
    // Average cost: 100000 / 150 = 666.67
    expect(result.averageCost).toBeCloseTo(666.67, 1);
    expect(result.totalQuantity).toBe(150);

    // Verify individual consumption costs
    expect(result.consumptions[0].totalCost).toBe(50000); // 100 * 500
    expect(result.consumptions[1].totalCost).toBe(50000); // 50 * 1000
  });
});

// ============================================
// 3. Expired Batch Handling (5 tests)
// ============================================
describe('Expired batch handling', () => {
  test('FIFO skips expired batch and consumes next oldest active batch', async () => {
    const t = convexTest(schema);
    const locationId = await createStorageLocation(t);
    const componentId = await createPackagingComponentType(t, { code: 'EXPIRY_1' });

    const now = Date.now();
    // Oldest batch is expired
    const expiredBatchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 100,
      unitCost: 400,
      purchaseDate: now - 259200000, // 3 days ago
      expiryDate: now - 86400000, // expired yesterday
    });
    // Second oldest is active
    const activeBatchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 100,
      unitCost: 500,
      purchaseDate: now - 86400000, // 1 day ago
    });

    const result = await t.run(async (ctx) => {
      return await consumeFromFIFO(ctx, componentId, locationId, 50);
    });

    // Should skip expired batch and consume from active
    expect(result.consumptions).toHaveLength(1);
    expect(result.consumptions[0].batchId).toBe(activeBatchId);
    expect(result.consumptions[0].quantity).toBe(50);

    await t.run(async (ctx) => {
      await applyFIFOConsumption(ctx, result, componentId, locationId);
    });

    // Expired batch unchanged, active batch reduced
    await verifyBatchState(t, expiredBatchId, 100); // untouched
    await verifyBatchState(t, activeBatchId, 50); // 100 - 50
  });

  test('multiple expired batches skipped correctly', async () => {
    const t = convexTest(schema);
    const locationId = await createStorageLocation(t);
    const componentId = await createPackagingComponentType(t, { code: 'EXPIRY_2' });

    const now = Date.now();
    // Two expired batches
    await createInventoryBatch(t, componentId, locationId, {
      quantity: 50,
      unitCost: 400,
      purchaseDate: now - 345600000, // 4 days ago
      expiryDate: now - 172800000, // expired 2 days ago
    });
    await createInventoryBatch(t, componentId, locationId, {
      quantity: 60,
      unitCost: 450,
      purchaseDate: now - 259200000, // 3 days ago
      expiryDate: now - 86400000, // expired yesterday
    });
    // One active batch
    const activeBatchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 150,
      unitCost: 500,
      purchaseDate: now - 86400000, // 1 day ago
    });

    const result = await t.run(async (ctx) => {
      return await consumeFromFIFO(ctx, componentId, locationId, 100);
    });

    expect(result.consumptions).toHaveLength(1);
    expect(result.consumptions[0].batchId).toBe(activeBatchId);
    expect(result.consumptions[0].quantity).toBe(100);
  });

  test('all batches expired returns error (no stock available)', async () => {
    const t = convexTest(schema);
    const locationId = await createStorageLocation(t);
    const componentId = await createPackagingComponentType(t, { code: 'EXPIRY_3' });

    const now = Date.now();
    await createInventoryBatch(t, componentId, locationId, {
      quantity: 100,
      unitCost: 500,
      purchaseDate: now - 172800000,
      expiryDate: now - 86400000, // expired
    });
    await createInventoryBatch(t, componentId, locationId, {
      quantity: 50,
      unitCost: 600,
      purchaseDate: now - 86400000,
      expiryDate: now - 3600000, // expired 1 hour ago
    });

    await expect(
      t.run(async (ctx) => {
        return await consumeFromFIFO(ctx, componentId, locationId, 10);
      })
    ).rejects.toThrow('Insufficient stock');
  });

  test('partially expired queue consumes from first active batch', async () => {
    const t = convexTest(schema);
    const locationId = await createStorageLocation(t);
    const componentId = await createPackagingComponentType(t, { code: 'EXPIRY_4' });

    const now = Date.now();
    // expired, active, active
    await createInventoryBatch(t, componentId, locationId, {
      quantity: 100,
      unitCost: 400,
      purchaseDate: now - 259200000, // oldest
      expiryDate: now - 86400000, // expired
    });
    const firstActiveBatchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 80,
      unitCost: 500,
      purchaseDate: now - 172800000, // middle
    });
    const secondActiveBatchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 120,
      unitCost: 600,
      purchaseDate: now, // newest
    });

    // Consume 60 - should come from first active batch
    const result = await t.run(async (ctx) => {
      return await consumeFromFIFO(ctx, componentId, locationId, 60);
    });

    expect(result.consumptions).toHaveLength(1);
    expect(result.consumptions[0].batchId).toBe(firstActiveBatchId);
    expect(result.consumptions[0].quantity).toBe(60);

    await t.run(async (ctx) => {
      await applyFIFOConsumption(ctx, result, componentId, locationId);
    });

    await verifyBatchState(t, firstActiveBatchId, 20); // 80 - 60
    await verifyBatchState(t, secondActiveBatchId, 120); // unchanged
  });

  test('expiry check uses current timestamp correctly', async () => {
    const t = convexTest(schema);
    const locationId = await createStorageLocation(t);
    const componentId = await createPackagingComponentType(t, { code: 'EXPIRY_5' });

    const now = Date.now();
    // Batch expires in the future - should NOT be skipped
    const futureBatchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 100,
      unitCost: 500,
      purchaseDate: now - 86400000,
      expiryDate: now + 86400000, // expires tomorrow
    });

    const result = await t.run(async (ctx) => {
      return await consumeFromFIFO(ctx, componentId, locationId, 50);
    });

    // Should consume from batch with future expiry
    expect(result.consumptions).toHaveLength(1);
    expect(result.consumptions[0].batchId).toBe(futureBatchId);
    expect(result.consumptions[0].quantity).toBe(50);
  });
});

// ============================================
// 4. Edge Cases and Constraints (5 tests)
// ============================================
describe('Edge cases and constraints', () => {
  test('consuming more than available stock returns error (prevents negative)', async () => {
    const t = convexTest(schema);
    const locationId = await createStorageLocation(t);
    const componentId = await createPackagingComponentType(t, { code: 'EDGE_1' });

    await createInventoryBatch(t, componentId, locationId, {
      quantity: 50,
      unitCost: 500,
    });

    await expect(
      t.run(async (ctx) => {
        return await consumeFromFIFO(ctx, componentId, locationId, 100);
      })
    ).rejects.toThrow('Insufficient stock');
  });

  test('empty inventory returns error', async () => {
    const t = convexTest(schema);
    const locationId = await createStorageLocation(t);
    const componentId = await createPackagingComponentType(t, { code: 'EDGE_2' });

    // No batches created at all
    await expect(
      t.run(async (ctx) => {
        return await consumeFromFIFO(ctx, componentId, locationId, 10);
      })
    ).rejects.toThrow('Insufficient stock');
  });

  test('concurrent consumption maintains consistency', async () => {
    const t = convexTest(schema);
    const locationId = await createStorageLocation(t);
    const componentId = await createPackagingComponentType(t, { code: 'EDGE_3' });

    const batchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 100,
      unitCost: 500,
    });

    // First consumption: 60 units
    const result1 = await t.run(async (ctx) => {
      return await consumeFromFIFO(ctx, componentId, locationId, 60);
    });
    await t.run(async (ctx) => {
      await applyFIFOConsumption(ctx, result1, componentId, locationId);
    });

    await verifyBatchState(t, batchId, 40); // 100 - 60

    // Second consumption: 30 units (should see updated state)
    const result2 = await t.run(async (ctx) => {
      return await consumeFromFIFO(ctx, componentId, locationId, 30);
    });
    await t.run(async (ctx) => {
      await applyFIFOConsumption(ctx, result2, componentId, locationId);
    });

    await verifyBatchState(t, batchId, 10); // 40 - 30

    // Third consumption: try to consume more than remaining
    await expect(
      t.run(async (ctx) => {
        return await consumeFromFIFO(ctx, componentId, locationId, 20);
      })
    ).rejects.toThrow('Insufficient stock');
  });

  test('zero quantity consumption returns error', async () => {
    const t = convexTest(schema);
    const locationId = await createStorageLocation(t);
    const componentId = await createPackagingComponentType(t, { code: 'EDGE_4' });

    await createInventoryBatch(t, componentId, locationId, {
      quantity: 100,
      unitCost: 500,
    });

    await expect(
      t.run(async (ctx) => {
        return await consumeFromFIFO(ctx, componentId, locationId, 0);
      })
    ).rejects.toThrow('Quantity must be positive');
  });

  test('batch exactly depleting triggers status change to depleted', async () => {
    const t = convexTest(schema);
    const locationId = await createStorageLocation(t);
    const componentId = await createPackagingComponentType(t, { code: 'EDGE_5' });

    const now = Date.now();
    const batchId = await createInventoryBatch(t, componentId, locationId, {
      quantity: 75,
      unitCost: 800,
      purchaseDate: now - 86400000,
    });

    const result = await t.run(async (ctx) => {
      return await consumeFromFIFO(ctx, componentId, locationId, 75);
    });

    await t.run(async (ctx) => {
      await applyFIFOConsumption(ctx, result, componentId, locationId);
    });

    const batch = await t.run(async (ctx) => ctx.db.get(batchId));
    expect(batch?.quantityRemaining).toBe(0);
    expect(batch?.status).toBe('depleted');

    // Verify transaction record was created
    const transactions = await t.run(async (ctx) => {
      return await ctx.db
        .query('componentTransactions')
        .filter((q) => q.eq(q.field('batchId'), batchId))
        .collect();
    });

    expect(transactions).toHaveLength(1);
    expect(transactions[0].transactionType).toBe('consume');
    expect(transactions[0].quantity).toBe(-75); // negative for consumption
    expect(transactions[0].unitCostAtTime).toBe(800);
  });
});
