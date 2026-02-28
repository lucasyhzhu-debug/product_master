/**
 * Voucher handling integration tests for Convex backend.
 * Tests discount calculations, validation rules, expiry scenarios, and usage limits.
 *
 * Covers the full voucher lifecycle through the order creation mutation:
 * - Percentage discount calculation (with Math.floor rounding)
 * - Fixed (amount) discount calculation
 * - Minimum order threshold enforcement
 * - Expiry and validity period validation
 * - Usage limit tracking and enforcement
 *
 * Note: Schema uses discountType "percentage" | "amount" (not "fixed").
 * The validateFinalPrice function blocks orders where finalTotal <= 0.
 */

import { convexTest } from 'convex-test';
import { expect, test, describe } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import {
  createCustomer,
  createVoucher,
  createOrderWithVoucher,
  verifyVoucherUsage,
} from './helpers';

// ============================================
// Percentage Discount Calculation Tests (4 tests)
// ============================================

describe('Percentage Discount Calculation', () => {
  test('10% discount on 100K order = 10K discount (final: 90K)', async () => {
    const t = convexTest(schema);

    // ARRANGE: Create 10% voucher
    const voucherId = await createVoucher(t, {
      code: 'SAVE10',
      discountType: 'percentage',
      discountValue: 10,
    });

    // ACT: Create 100K order with voucher
    const { orderId } = await createOrderWithVoucher(t, {
      voucherCode: 'SAVE10',
      orderTotal: 100000,
    });

    // ASSERT: Discount is 10K, final total is 90K
    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.voucherDiscountValue).toBe(10000);
    expect(order?.finalTotal).toBe(90000);
    expect(order?.voucherId).toBeDefined();
    expect(order?.voucherCode).toBe('SAVE10');
  });

  test('25% discount on 200K order = 50K discount (final: 150K)', async () => {
    const t = convexTest(schema);

    await createVoucher(t, {
      code: 'PROMO25',
      discountType: 'percentage',
      discountValue: 25,
    });

    const { orderId } = await createOrderWithVoucher(t, {
      voucherCode: 'PROMO25',
      orderTotal: 200000,
    });

    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    // Math.floor(200000 * 25 / 100) = 50000
    expect(order?.voucherDiscountValue).toBe(50000);
    expect(order?.finalTotal).toBe(150000);
  });

  test('percentage discount uses Math.floor rounding (15% of 100333)', async () => {
    const t = convexTest(schema);

    await createVoucher(t, {
      code: 'ROUND15',
      discountType: 'percentage',
      discountValue: 15,
    });

    const { orderId } = await createOrderWithVoucher(t, {
      voucherCode: 'ROUND15',
      orderTotal: 100333,
    });

    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    // Math.floor(100333 * 15 / 100) = Math.floor(15049.95) = 15049
    expect(order?.voucherDiscountValue).toBe(15049);
    expect(order?.finalTotal).toBe(100333 - 15049);
  });

  test('percentage discount respects maximumDiscount cap', async () => {
    const t = convexTest(schema);

    await createVoucher(t, {
      code: 'CAPPED50',
      discountType: 'percentage',
      discountValue: 50,
      maximumDiscount: 30000, // Cap at 30K even though 50% of 200K = 100K
    });

    const { orderId } = await createOrderWithVoucher(t, {
      voucherCode: 'CAPPED50',
      orderTotal: 200000,
    });

    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    // 50% of 200K = 100K, but capped at 30K
    expect(order?.voucherDiscountValue).toBe(30000);
    expect(order?.finalTotal).toBe(170000);
  });
});

// ============================================
// Fixed (Amount) Discount Calculation Tests (3 tests)
// ============================================

describe('Fixed Discount Calculation', () => {
  test('50K fixed discount on 200K order (final: 150K)', async () => {
    const t = convexTest(schema);

    await createVoucher(t, {
      code: 'FLAT50K',
      discountType: 'amount',
      discountValue: 50000,
    });

    const { orderId } = await createOrderWithVoucher(t, {
      voucherCode: 'FLAT50K',
      orderTotal: 200000,
    });

    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.voucherDiscountValue).toBe(50000);
    expect(order?.finalTotal).toBe(150000);
  });

  test('fixed discount equal to order total succeeds (100% discount allowed)', async () => {
    const t = convexTest(schema);

    await createVoucher(t, {
      code: 'FULL100K',
      discountType: 'amount',
      discountValue: 100000,
    });

    // 100% discount is now a valid business case (validation removed)
    const { orderId } = await createOrderWithVoucher(t, {
      voucherCode: 'FULL100K',
      orderTotal: 100000,
    });

    expect(orderId).toBeDefined();
    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.voucherDiscountValue).toBe(100000);
    expect(order?.finalTotal).toBe(0);
  });

  test('fixed discount greater than order total is capped to order total', async () => {
    const t = convexTest(schema);

    await createVoucher(t, {
      code: 'HUGE150K',
      discountType: 'amount',
      discountValue: 150000,
    });

    // 150K discount on 100K order: discount capped at 100K, finalPrice = 0
    const { orderId } = await createOrderWithVoucher(t, {
      voucherCode: 'HUGE150K',
      orderTotal: 100000,
    });

    expect(orderId).toBeDefined();
    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    // Discount capped at order total
    expect(order?.voucherDiscountValue).toBe(100000);
    expect(order?.finalTotal).toBe(0);
  });
});

// ============================================
// Minimum Order Validation Tests (4 tests)
// ============================================

describe('Minimum Order Validation', () => {
  test('rejects order below minimum threshold', async () => {
    const t = convexTest(schema);

    await createVoucher(t, {
      code: 'MIN100K',
      discountType: 'amount',
      discountValue: 10000,
      minimumOrderAmount: 100000,
    });

    // 80K order with 100K minimum should fail
    await expect(
      createOrderWithVoucher(t, {
        voucherCode: 'MIN100K',
        orderTotal: 80000,
      })
    ).rejects.toThrow('Minimum order of Rp 100.000 required for this voucher');
  });

  test('accepts order exactly at minimum threshold', async () => {
    const t = convexTest(schema);

    await createVoucher(t, {
      code: 'EXACT100K',
      discountType: 'percentage',
      discountValue: 10,
      minimumOrderAmount: 100000,
    });

    // 100K order with 100K minimum should succeed
    const { orderId } = await createOrderWithVoucher(t, {
      voucherCode: 'EXACT100K',
      orderTotal: 100000,
    });

    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.voucherDiscountValue).toBe(10000);
    expect(order?.finalTotal).toBe(90000);
  });

  test('accepts order above minimum threshold', async () => {
    const t = convexTest(schema);

    await createVoucher(t, {
      code: 'ABOVE100K',
      discountType: 'percentage',
      discountValue: 5,
      minimumOrderAmount: 100000,
    });

    // 150K order with 100K minimum should succeed
    const { orderId } = await createOrderWithVoucher(t, {
      voucherCode: 'ABOVE100K',
      orderTotal: 150000,
    });

    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    // Math.floor(150000 * 5 / 100) = 7500
    expect(order?.voucherDiscountValue).toBe(7500);
    expect(order?.finalTotal).toBe(142500);
  });

  test('voucher with no minimum accepts any order total', async () => {
    const t = convexTest(schema);

    await createVoucher(t, {
      code: 'NOMIN',
      discountType: 'amount',
      discountValue: 5000,
      // No minimumOrderAmount set
    });

    // Even a small 30K order should work
    const { orderId } = await createOrderWithVoucher(t, {
      voucherCode: 'NOMIN',
      orderTotal: 30000,
    });

    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.voucherDiscountValue).toBe(5000);
    expect(order?.finalTotal).toBe(25000);
  });
});

// ============================================
// Expiry and Usage Limit Tests (4 tests)
// ============================================

describe('Expiry and Usage Limits', () => {
  test('rejects expired voucher (validUntil in the past)', async () => {
    const t = convexTest(schema);
    const now = Date.now();

    await createVoucher(t, {
      code: 'EXPIRED',
      discountType: 'percentage',
      discountValue: 10,
      validFrom: now - 172800000, // 2 days ago
      validUntil: now - 86400000, // Yesterday (expired)
    });

    await expect(
      createOrderWithVoucher(t, {
        voucherCode: 'EXPIRED',
        orderTotal: 100000,
      })
    ).rejects.toThrow('This voucher has expired');
  });

  test('rejects not-yet-valid voucher (validFrom in the future)', async () => {
    const t = convexTest(schema);
    const now = Date.now();

    await createVoucher(t, {
      code: 'FUTURE',
      discountType: 'percentage',
      discountValue: 20,
      validFrom: now + 86400000, // Tomorrow (not yet valid)
      validUntil: now + 172800000, // Day after tomorrow
    });

    await expect(
      createOrderWithVoucher(t, {
        voucherCode: 'FUTURE',
        orderTotal: 100000,
      })
    ).rejects.toThrow('This voucher is not yet valid');
  });

  test('accepts valid voucher within validity period', async () => {
    const t = convexTest(schema);
    const now = Date.now();

    const voucherId = await createVoucher(t, {
      code: 'VALID',
      discountType: 'percentage',
      discountValue: 15,
      validFrom: now - 86400000, // Yesterday
      validUntil: now + 86400000, // Tomorrow
    });

    const { orderId } = await createOrderWithVoucher(t, {
      voucherCode: 'VALID',
      orderTotal: 200000,
    });

    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    // Math.floor(200000 * 15 / 100) = 30000
    expect(order?.voucherDiscountValue).toBe(30000);
    expect(order?.finalTotal).toBe(170000);

    // Verify usage was tracked
    await verifyVoucherUsage(t, voucherId, 1);
  });

  test('enforces usage limit and tracks usage correctly', async () => {
    const t = convexTest(schema);

    // Create voucher with usageLimit of 2
    const voucherId = await createVoucher(t, {
      code: 'LIMITED2',
      discountType: 'amount',
      discountValue: 10000,
      usageLimit: 2,
    });

    // Use 1: Should succeed
    const customer1 = await createCustomer(t, { name: 'Customer 1', phone: '+62811111111' });
    const { orderId: order1 } = await createOrderWithVoucher(t, {
      voucherCode: 'LIMITED2',
      orderTotal: 50000,
      customerId: customer1,
    });

    const orderOne = await t.run(async (ctx) => ctx.db.get(order1));
    expect(orderOne?.voucherDiscountValue).toBe(10000);
    expect(orderOne?.finalTotal).toBe(40000);

    // Verify usage count is 1
    await verifyVoucherUsage(t, voucherId, 1);

    // Use 2: Should succeed (limit is 2)
    const customer2 = await createCustomer(t, { name: 'Customer 2', phone: '+62822222222' });
    const { orderId: order2 } = await createOrderWithVoucher(t, {
      voucherCode: 'LIMITED2',
      orderTotal: 60000,
      customerId: customer2,
    });

    const orderTwo = await t.run(async (ctx) => ctx.db.get(order2));
    expect(orderTwo?.voucherDiscountValue).toBe(10000);
    expect(orderTwo?.finalTotal).toBe(50000);

    // Verify usage count is 2
    await verifyVoucherUsage(t, voucherId, 2);

    // Use 3: Should fail (limit reached)
    const customer3 = await createCustomer(t, { name: 'Customer 3', phone: '+62833333333' });
    await expect(
      createOrderWithVoucher(t, {
        voucherCode: 'LIMITED2',
        orderTotal: 70000,
        customerId: customer3,
      })
    ).rejects.toThrow('This voucher has reached its usage limit');

    // Verify usage count is still 2 (third attempt didn't increment)
    await verifyVoucherUsage(t, voucherId, 2);
  });
});
