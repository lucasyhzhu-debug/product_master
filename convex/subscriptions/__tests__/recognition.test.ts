/**
 * Tests for recognizeOnDelivery — the single recognition entry point (Phase D Slice 0, R1).
 *
 * Uses convex-test for isolated DB per test. All tests are behavior-preserving:
 * the wrapper delegates to recognizeSubscriptionDelivery without changing logic.
 */

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "../../schema";
import { recognizeOnDelivery } from "../recognition";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type RunCtx = Parameters<Parameters<ReturnType<typeof convexTest>["run"]>[0]>[0];

/** Minimal valid user for creditLedger.createdBy. */
async function insertUser(ctx: RunCtx) {
  return await ctx.db.insert("users", {
    name: "Test User",
    pinHash: "salt:hash",
    role: "admin",
    isActive: true,
    failedAttempts: 0,
    createdAt: Date.now(),
  } as never);
}

/** Minimal valid customer required by orders.customerId FK. */
async function insertCustomer(ctx: RunCtx) {
  return await ctx.db.insert("customers", {
    name: "Test Cafe",
    createdBy: "test",
  } as never);
}

/**
 * Minimal order without subscription linkage (non-subscription order).
 * recognizeOnDelivery must be a no-op for these.
 */
async function insertNonSubOrder(
  ctx: RunCtx,
  userId: Awaited<ReturnType<typeof insertUser>>,
  customerId: Awaited<ReturnType<typeof insertCustomer>>,
) {
  return await ctx.db.insert("orders", {
    orderNumber: "0101-001",
    customerId,
    customerName: "Test Cafe",
    status: "AwaitingDelivery",
    paymentStatus: "Paid",
    orderDate: Date.now(),
    totalAmount: 1000,
    totalCost: 500,
    totalMargin: 500,
    finalTotal: 1000,
    deliveryType: "Delivery",
    createdBy: "test",
    createdByUserId: userId,
    itemCount: 1,
  } as never);
}

/**
 * Minimal subscription + subscriptionWeek fixture for funded-subscription tests.
 * Mirrors the pattern used in postLedgerEntry (requires a week doc to patch).
 */
async function insertSubscriptionFixture(
  ctx: RunCtx,
  userId: Awaited<ReturnType<typeof insertUser>>,
  customerId: Awaited<ReturnType<typeof insertCustomer>>,
) {
  const subscriptionId = await ctx.db.insert("subscriptions", {
    customerId,
    label: "Test Sub",
    status: "active",
    billingModel: "prepaid_weekly_credit",
    unitPrice: 29000,
    confidentialPrice: false,
    baselineDailyQty: 5,
    weeklyQty: 35,
    deliverByTime: "09:00",
    creditRolloverPolicy: "expire",
    changeCutoffHour: 13,
    changeCutoffDayOffset: -1,
    permanentChangeNoticeDays: 14,
    terminationNoticeDays: 30,
    cogsBasis: 15000,
    startDate: Date.now(),
    scheduleTemplate: [],
    createdBy: userId,
  } as never);

  const subscriptionWeekId = await ctx.db.insert("subscriptionWeeks", {
    subscriptionId,
    weekStart: Date.now(),
    weekEnd: Date.now() + 7 * 86400000,
    status: "paid",
    plannedDays: [],
    creditIssued: 1015000,
    creditConsumed: 0,
    creditRemaining: 1015000,
    creditExpired: 0,
    shortfall: 0,
    shortfallFault: "none",
    refundDue: 0,
  } as never);

  // Topup entry to fund the week (funded-pool invariant satisfied).
  await ctx.db.insert("creditLedger", {
    subscriptionId,
    subscriptionWeekId,
    type: "topup",
    amount: 1015000,
    balanceAfter: 1015000,
    createdBy: userId,
    note: "Weekly topup",
  } as never);

  return { subscriptionId, subscriptionWeekId };
}

/**
 * Minimal funded subscription order (with subscriptionId + subscriptionWeekId).
 * recognizeOnDelivery must post a drawdown for these.
 */
async function insertSubOrder(
  ctx: RunCtx,
  orderNumber: string,
  userId: Awaited<ReturnType<typeof insertUser>>,
  customerId: Awaited<ReturnType<typeof insertCustomer>>,
  subscriptionId: Awaited<ReturnType<typeof insertSubscriptionFixture>>["subscriptionId"],
  subscriptionWeekId: Awaited<ReturnType<typeof insertSubscriptionFixture>>["subscriptionWeekId"],
) {
  return await ctx.db.insert("orders", {
    orderNumber,
    customerId,
    customerName: "Test Cafe",
    status: "AwaitingDelivery",
    paymentStatus: "Paid",
    orderDate: Date.now(),
    totalAmount: 29000,
    totalCost: 15000,
    totalMargin: 14000,
    finalTotal: 29000,
    deliveryType: "Delivery",
    createdBy: "test",
    createdByUserId: userId,
    itemCount: 1,
    subscriptionId,
    subscriptionWeekId,
  } as never);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("recognizeOnDelivery no-ops for a non-subscription order", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    const userId = await insertUser(ctx);
    const customerId = await insertCustomer(ctx);
    const orderId = await insertNonSubOrder(ctx, userId, customerId);

    await recognizeOnDelivery(ctx, orderId, userId);

    const ledger = await ctx.db
      .query("creditLedger")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect();
    expect(ledger).toHaveLength(0); // no subscriptionId → no recognition
  });
});

test("recognizeOnDelivery posts exactly one drawdown for a funded subscription order", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    const userId = await insertUser(ctx);
    const customerId = await insertCustomer(ctx);
    const { subscriptionId, subscriptionWeekId } = await insertSubscriptionFixture(ctx, userId, customerId);

    const orderId = await insertSubOrder(ctx, "0101-002", userId, customerId, subscriptionId, subscriptionWeekId);

    await recognizeOnDelivery(ctx, orderId, userId);

    const ledger = await ctx.db
      .query("creditLedger")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect();
    expect(ledger).toHaveLength(1);
    expect(ledger[0].type).toBe("drawdown");
    expect(ledger[0].amount).toBe(-29000);
    expect(ledger[0].createdBy).toBe(userId); // explicit actingUserId used
  });
});

test("recognizeOnDelivery is idempotent — second call produces no extra drawdown", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    const userId = await insertUser(ctx);
    const customerId = await insertCustomer(ctx);
    const { subscriptionId, subscriptionWeekId } = await insertSubscriptionFixture(ctx, userId, customerId);

    const orderId = await insertSubOrder(ctx, "0101-003", userId, customerId, subscriptionId, subscriptionWeekId);

    // Two calls — must produce exactly ONE drawdown row.
    await recognizeOnDelivery(ctx, orderId, userId);
    await recognizeOnDelivery(ctx, orderId, userId);

    const ledger = await ctx.db
      .query("creditLedger")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect();
    expect(ledger).toHaveLength(1);
  });
});

test("recognizeOnDelivery falls back to order.createdByUserId when actingUserId is undefined", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    const userId = await insertUser(ctx);
    const customerId = await insertCustomer(ctx);
    const { subscriptionId, subscriptionWeekId } = await insertSubscriptionFixture(ctx, userId, customerId);

    const orderId = await insertSubOrder(ctx, "0101-004", userId, customerId, subscriptionId, subscriptionWeekId);

    // Pass undefined — mirrors completeOrder/completePackaging (no token in scope).
    await recognizeOnDelivery(ctx, orderId, undefined);

    const ledger = await ctx.db
      .query("creditLedger")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect();
    expect(ledger).toHaveLength(1);
    expect(ledger[0].createdBy).toBe(userId); // falls back to order.createdByUserId
  });
});

// ---------------------------------------------------------------------------
// T3 — subscriptionCreditApplied drawdown
// ---------------------------------------------------------------------------

/**
 * Seeds a user, customer, funded subscription, and an ad-hoc credit order
 * that carries `subscriptionCreditApplied` (only the credit-covered portion).
 */
async function seedAdHocCreditOrder(
  t: ReturnType<typeof convexTest>,
  opts: { totalAmount: number; subscriptionCreditApplied: number },
) {
  return await t.run(async (ctx) => {
    const userId = await insertUser(ctx);
    const customerId = await insertCustomer(ctx);
    const { subscriptionId, subscriptionWeekId } = await insertSubscriptionFixture(
      ctx,
      userId,
      customerId,
    );
    const orderId = await ctx.db.insert("orders", {
      orderNumber: "0102-001",
      customerId,
      customerName: "Test Cafe",
      status: "AwaitingDelivery",
      paymentStatus: "Paid",
      orderDate: Date.now(),
      totalAmount: opts.totalAmount,
      totalCost: 10000,
      totalMargin: opts.totalAmount - 10000,
      finalTotal: opts.totalAmount,
      deliveryType: "Delivery",
      createdBy: "test",
      createdByUserId: userId,
      itemCount: 1,
      subscriptionId,
      subscriptionWeekId,
      subscriptionCreditApplied: opts.subscriptionCreditApplied,
    } as never);
    return { orderId, weekId: subscriptionWeekId, subId: subscriptionId };
  });
}

test("ad-hoc credit order draws subscriptionCreditApplied, not totalAmount", async () => {
  const t = convexTest(schema);
  const { orderId } = await seedAdHocCreditOrder(t, {
    totalAmount: 50000,
    subscriptionCreditApplied: 14000,
  });
  await t.run(async (ctx) => {
    const { recognizeSubscriptionDelivery } = await import("../recognition");
    await recognizeSubscriptionDelivery(ctx, orderId);
  });
  const entries = await t.run(async (ctx) =>
    ctx.db
      .query("creditLedger")
      .withIndex("by_order", (q) => q.eq("orderId", orderId))
      .collect(),
  );
  expect(entries).toHaveLength(1);
  expect(entries[0].amount).toBe(-14000); // reserved amount, NOT -50000
});
