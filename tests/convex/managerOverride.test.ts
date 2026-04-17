/**
 * Reproduction test for manager override server error.
 */
import { convexTest } from 'convex-test';
import { expect, test, describe } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

/**
 * Create a user + session and return the session token.
 */
async function createAuthenticatedUser(
  t: ReturnType<typeof convexTest>,
  role: 'admin' | 'manager' | 'order_staff' | 'kitchen' = 'manager'
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      name: 'Nilson',
      pinHash: 'fakesalt:fakehash',
      role,
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    });
    const token = 'test-token-' + Math.random().toString(36).slice(2);
    await ctx.db.insert('sessions', {
      userId,
      token,
      expiresAt: Date.now() + 8 * 60 * 60 * 1000,
      createdAt: Date.now(),
    });
    return token;
  });
}

describe('Manager Override Voucher Creation', () => {
  test('direct DB insert matches schema (sanity check)', async () => {
    const t = convexTest(schema);

    const now = Date.now();
    const voucherId = await t.run(async (ctx) => {
      return await ctx.db.insert('vouchers', {
        code: 'MGR-260409-TEST',
        name: 'Manager Override - Nilson',
        description: 'staff Discount',
        discountType: 'amount',
        discountValue: 54000,
        isActive: true,
        validFrom: now,
        validUntil: now + 24 * 60 * 60 * 1000,
        usageLimit: 1,
        usageCount: 0,
        isManagerOverride: true,
        overrideReason: 'staff Discount',
        overrideOrderId: undefined,
        createdBy: 'Nilson',
        createdAt: now,
      });
    });

    expect(voucherId).toBeDefined();
  });

  test('createManagerOverride mutation with fixed amount discount', async () => {
    const t = convexTest(schema);
    const token = await createAuthenticatedUser(t, 'manager');

    const result = await t.mutation(api.vouchers.mutations.createManagerOverride, {
      token,
      reason: 'staff Discount',
      discountType: 'amount',
      discountValue: 54000,
    });

    expect(result).toBeDefined();
    expect(result.code).toMatch(/^MGR-/);
    expect(result.voucherId).toBeDefined();
  });

  test('createManagerOverride mutation with percentage discount', async () => {
    const t = convexTest(schema);
    const token = await createAuthenticatedUser(t, 'manager');

    const result = await t.mutation(api.vouchers.mutations.createManagerOverride, {
      token,
      reason: 'staff discount for event',
      discountType: 'percentage',
      discountValue: 20,
    });

    expect(result).toBeDefined();
    expect(result.code).toMatch(/^MGR-/);
    expect(result.voucherId).toBeDefined();
  });
});
