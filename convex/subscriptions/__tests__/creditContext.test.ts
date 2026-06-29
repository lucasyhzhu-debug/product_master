import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import type { SessionId } from "convex-helpers/server/sessions";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

// Explicit modules glob so convex-test loads the worktree's implementations,
// not the stale main-tree registry via the node_modules junction.
const modules = import.meta.glob("/convex/**/*.ts");

type TestT = ReturnType<typeof convexTest>;

async function createManagerSession(
  t: TestT,
): Promise<{ sessionId: SessionId; userId: Id<"users"> }> {
  const token = `manager-token-t5-${Date.now()}-${Math.random()}` as SessionId;
  const userId = await t.run(async (ctx) => {
    const uid = await ctx.db.insert("users", {
      name: "Test Manager T5",
      pinHash: "salt:hash",
      role: "manager",
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    } as never);
    await ctx.db.insert("sessions", {
      userId: uid,
      token,
      expiresAt: Date.now() + 8 * 3600 * 1000,
      createdAt: Date.now(),
    } as never);
    return uid as Id<"users">;
  });
  return { sessionId: token, userId };
}

/** Seeds a funded (delivering) subscription week covering Date.now(). */
async function seedFundedWeek(
  t: TestT,
  opts: { creditRemaining: number; unitPrice: number },
): Promise<{
  customerId: Id<"customers">;
  subscriptionId: Id<"subscriptions">;
  weekId: Id<"subscriptionWeeks">;
  productId: Id<"menuProducts">;
  sessionId: SessionId;
  userId: Id<"users">;
  midWeekTs: number;
}> {
  const { sessionId, userId } = await createManagerSession(t);
  const NOW = Date.now();
  const weekStart = NOW - 3 * 86400000; // 3 days ago (Mon)
  const weekEnd = NOW + 4 * 86400000; // 4 days ahead (Sun)
  const midWeekTs = NOW;

  const ids = await t.run(async (ctx) => {
    const productId = (await ctx.db.insert("menuProducts", {
      code: "T5-PROD",
      name: "Test Product T5",
      grams: 80,
      defaultPrice: 10000,
      isActive: true,
      unitCost: 5000,
      cachedProductionSummary: "1 Big",
    } as never)) as Id<"menuProducts">;

    const customerId = (await ctx.db.insert("customers", {
      name: "Sub Cafe T5",
      phone: "+628111333444",
      createdBy: "test",
    } as never)) as Id<"customers">;

    const subscriptionId = (await ctx.db.insert("subscriptions", {
      customerId,
      label: "Weekly T5",
      status: "active",
      billingModel: "prepaid_weekly_credit",
      unitPrice: opts.unitPrice,
      confidentialPrice: false,
      baselineDailyQty: 10,
      weeklyQty: 70,
      deliverByTime: "09:00",
      creditRolloverPolicy: "expire",
      changeCutoffHour: 13,
      changeCutoffDayOffset: -1,
      permanentChangeNoticeDays: 14,
      terminationNoticeDays: 30,
      cogsBasis: 4000,
      startDate: weekStart,
      scheduleTemplate: [
        { dayOfWeek: 1, items: [{ menuProductId: productId, qty: 10 }] },
      ],
      createdBy: userId,
    } as never)) as Id<"subscriptions">;

    const weekId = (await ctx.db.insert("subscriptionWeeks", {
      subscriptionId,
      weekStart,
      weekEnd,
      status: "delivering",
      plannedDays: [
        {
          date: midWeekTs,
          deliverByTime: "09:00",
          items: [
            {
              menuProductId: productId,
              productName: "Test Product T5",
              qty: 10,
              unitPrice: opts.unitPrice,
              lineTotal: 10 * opts.unitPrice,
            },
          ],
          locked: false,
        },
      ],
      creditIssued: opts.creditRemaining,
      creditConsumed: 0,
      creditRemaining: opts.creditRemaining,
      creditExpired: 0,
      shortfall: 0,
      shortfallFault: "none",
      refundDue: 0,
    } as never)) as Id<"subscriptionWeeks">;

    // Fund the pool: topup ledger entry so deriveCreditPool returns correct creditRemaining.
    await ctx.db.insert("creditLedger", {
      subscriptionId,
      subscriptionWeekId: weekId,
      type: "topup",
      amount: opts.creditRemaining,
      balanceAfter: opts.creditRemaining,
      createdBy: userId,
    } as never);

    return { customerId, subscriptionId, weekId, productId };
  });

  return { ...ids, sessionId, userId, midWeekTs };
}

describe("getSubscriptionCreditContext — T5", () => {
  it("(a) returns empty array when customer has no subscription", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await createManagerSession(t);
    const customerId = (await t.run(async (ctx) =>
      ctx.db.insert("customers", {
        name: "No Sub Customer T5",
        phone: "+628000000001",
        createdBy: "test",
      } as never),
    )) as Id<"customers">;

    const result = await t.query(api.subscriptions.queries.getSubscriptionCreditContext, {
      customerId,
      dueDate: Date.now(),
      draftItems: [],
      sessionId,
    });
    expect(result).toEqual([]);
  });

  it("(b) active sub + funded delivering week + all-eligible cart → correct availableCredit and split", async () => {
    const t = convexTest(schema, modules);
    const { customerId, productId, sessionId } = await seedFundedWeek(t, {
      creditRemaining: 100000,
      unitPrice: 7000,
    });

    const result = await t.query(api.subscriptions.queries.getSubscriptionCreditContext, {
      customerId,
      dueDate: Date.now(),
      draftItems: [{ menuProductId: productId, qty: 2, retailUnitPrice: 10000 }],
      sessionId,
    });

    expect(result).toHaveLength(1);
    expect(result[0].availableCredit).toBe(100000); // no reservations
    // Eligible subtotal = 2 × unitPrice(7000) = 14000; creditCovered = min(14000, 100000) = 14000
    expect(result[0].split!.creditCovered).toBe(14000);
    expect(result[0].weekId).not.toBeNull();
  });

  it("(c) un-recognized reserved order nets out of availableCredit (100000 − 40000 = 60000)", async () => {
    const t = convexTest(schema, modules);
    const { customerId, subscriptionId, weekId, userId, sessionId } = await seedFundedWeek(t, {
      creditRemaining: 100000,
      unitPrice: 7000,
    });

    // Seed an un-recognized reserved order (has subscriptionCreditApplied but NO by_order ledger row)
    await t.run(async (ctx) => {
      await ctx.db.insert("orders", {
        orderNumber: "0629-T5C",
        customerId,
        customerName: "Sub Cafe T5",
        customerPhone: "+628111333444",
        status: "AwaitingPayment",
        paymentStatus: "Unpaid",
        orderDate: Date.now(),
        totalAmount: 40000,
        totalCost: 0,
        totalMargin: 40000,
        finalTotal: 40000,
        deliveryType: "Delivery",
        createdBy: "Test Manager T5",
        createdByUserId: userId,
        itemCount: 1,
        isKitchenVisible: false,
        subscriptionId,
        subscriptionWeekId: weekId,
        fundingSource: "deposit",
        subscriptionCreditApplied: 40000,
      } as never);
    });

    const result = await t.query(api.subscriptions.queries.getSubscriptionCreditContext, {
      customerId,
      dueDate: Date.now(),
      draftItems: [],
      sessionId,
    });
    expect(result[0].availableCredit).toBe(60000); // 100000 − 40000 reserved
  });

  it("(d) recognized order (has by_order ledger row) does NOT double-reduce availableCredit", async () => {
    const t = convexTest(schema, modules);
    const { customerId, subscriptionId, weekId, userId, sessionId } = await seedFundedWeek(t, {
      creditRemaining: 60000,
      unitPrice: 7000,
    });

    // Seed a recognized order: subscriptionCreditApplied set AND a by_order drawdown ledger entry.
    // The drawdown already reduces deriveCreditPool's creditRemaining.
    await t.run(async (ctx) => {
      const orderId = (await ctx.db.insert("orders", {
        orderNumber: "0629-T5D",
        customerId,
        customerName: "Sub Cafe T5",
        customerPhone: "+628111333444",
        status: "Complete",
        paymentStatus: "Paid",
        orderDate: Date.now(),
        totalAmount: 40000,
        totalCost: 0,
        totalMargin: 40000,
        finalTotal: 40000,
        deliveryType: "Delivery",
        createdBy: "Test Manager T5",
        createdByUserId: userId,
        itemCount: 1,
        isKitchenVisible: false,
        subscriptionId,
        subscriptionWeekId: weekId,
        fundingSource: "deposit",
        subscriptionCreditApplied: 40000,
      } as never)) as Id<"orders">;

      // Recognition: a by_order drawdown entry exists → this order is recognized.
      await ctx.db.insert("creditLedger", {
        subscriptionId,
        subscriptionWeekId: weekId,
        type: "drawdown",
        amount: -40000,
        balanceAfter: 20000,
        orderId,
        createdBy: userId,
      } as never);
    });

    const result = await t.query(api.subscriptions.queries.getSubscriptionCreditContext, {
      customerId,
      dueDate: Date.now(),
      draftItems: [],
      sessionId,
    });
    // Pool: topup(60000) + drawdown(-40000) → creditRemaining = 20000
    // The recognized order must NOT further reduce availableCredit (no double-dip).
    expect(result[0].availableCredit).toBe(20000);
  });

  // ---------------------------------------------------------------------------
  // Tests (f) and (g) cover plannedDeliveriesRemaining status-aware logic:
  //
  // Query rule (lines 323-327 in queries.ts):
  //   - future planned day  (dStr >= today)         → ALWAYS counted
  //   - past planned day    (dStr < today)
  //       + order with deliveryDate on that WIB date AND status in DELIVERY_DONE_STATUSES
  //                                                  → NOT counted (already dispatched)
  //       + no such done order                       → counted (degradation path)
  // ---------------------------------------------------------------------------

  it("(f) plannedDeliveriesRemaining: past day w/ done-status order excluded, future day still counted", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createManagerSession(t);
    const NOW = Date.now();
    // Use whole-day offsets so WIB date strings are guaranteed distinct across timezones.
    const pastDayTs = NOW - 2 * 86400000;    // 2 days ago
    const futureDayTs = NOW + 1 * 86400000;  // tomorrow
    const dueDate = NOW;                      // "today" — between past and future

    const weekStart = NOW - 3 * 86400000;
    const weekEnd = NOW + 4 * 86400000;

    const { customerId, subscriptionId, weekId, productId } = await t.run(async (ctx) => {
      const productId = (await ctx.db.insert("menuProducts", {
        code: "T5-PROD-F",
        name: "Test Product T5-F",
        grams: 80,
        defaultPrice: 10000,
        isActive: true,
        unitCost: 5000,
        cachedProductionSummary: "1 Big",
      } as never)) as Id<"menuProducts">;

      const customerId = (await ctx.db.insert("customers", {
        name: "Sub Cafe T5-F",
        phone: "+628111333555",
        createdBy: "test",
      } as never)) as Id<"customers">;

      const subscriptionId = (await ctx.db.insert("subscriptions", {
        customerId,
        label: "Weekly T5-F",
        status: "active",
        billingModel: "prepaid_weekly_credit",
        unitPrice: 7000,
        confidentialPrice: false,
        baselineDailyQty: 10,
        weeklyQty: 70,
        deliverByTime: "09:00",
        creditRolloverPolicy: "expire",
        changeCutoffHour: 13,
        changeCutoffDayOffset: -1,
        permanentChangeNoticeDays: 14,
        terminationNoticeDays: 30,
        cogsBasis: 4000,
        startDate: weekStart,
        scheduleTemplate: [
          { dayOfWeek: 1, items: [{ menuProductId: productId, qty: 10 }] },
        ],
        createdBy: userId,
      } as never)) as Id<"subscriptions">;

      // Two planned days: one past, one future.
      const weekId = (await ctx.db.insert("subscriptionWeeks", {
        subscriptionId,
        weekStart,
        weekEnd,
        status: "delivering",
        plannedDays: [
          {
            date: pastDayTs,
            deliverByTime: "09:00",
            items: [{ menuProductId: productId, productName: "Test Product T5-F", qty: 10, unitPrice: 7000, lineTotal: 70000 }],
            locked: false,
          },
          {
            date: futureDayTs,
            deliverByTime: "09:00",
            items: [{ menuProductId: productId, productName: "Test Product T5-F", qty: 10, unitPrice: 7000, lineTotal: 70000 }],
            locked: false,
          },
        ],
        creditIssued: 100000,
        creditConsumed: 0,
        creditRemaining: 100000,
        creditExpired: 0,
        shortfall: 0,
        shortfallFault: "none",
        refundDue: 0,
      } as never)) as Id<"subscriptionWeeks">;

      // Fund the pool.
      await ctx.db.insert("creditLedger", {
        subscriptionId,
        subscriptionWeekId: weekId,
        type: "topup",
        amount: 100000,
        balanceAfter: 100000,
        createdBy: userId,
      } as never);

      // Order whose deliveryDate WIB-date matches pastDayTs and status is DELIVERY_DONE.
      // This order signals the past planned day has already been dispatched.
      await ctx.db.insert("orders", {
        orderNumber: "0629-T5F",
        customerId,
        customerName: "Sub Cafe T5-F",
        customerPhone: "+628111333555",
        status: "AwaitingDelivery",  // in DELIVERY_DONE_STATUSES
        paymentStatus: "Paid",
        orderDate: NOW,
        deliveryDate: pastDayTs,     // WIB date matches the past planned day
        totalAmount: 70000,
        totalCost: 0,
        totalMargin: 70000,
        finalTotal: 70000,
        deliveryType: "Delivery",
        createdBy: "Test Manager T5",
        createdByUserId: userId,
        itemCount: 1,
        isKitchenVisible: false,
        subscriptionId,
        subscriptionWeekId: weekId,
        fundingSource: "deposit",
        subscriptionCreditApplied: 70000,
      } as never);

      return { customerId, subscriptionId, weekId, productId };
    });

    const result = await t.query(api.subscriptions.queries.getSubscriptionCreditContext, {
      customerId,
      dueDate,
      draftItems: [],
      sessionId,
    });

    expect(result).toHaveLength(1);
    // Past day: AwaitingDelivery order w/ deliveryDate matching it → excluded from remaining.
    // Future day: no done order, dStr >= today → counted.
    // Expected: 1 (only the future day).
    expect(result[0].plannedDeliveriesRemaining).toBe(1);
  });

  it("(g) plannedDeliveriesRemaining: past day with no done-status order still counts as remaining", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createManagerSession(t);
    const NOW = Date.now();
    const pastDayTs = NOW - 2 * 86400000;  // 2 days ago
    const dueDate = NOW;

    const weekStart = NOW - 3 * 86400000;
    const weekEnd = NOW + 4 * 86400000;

    const customerId = await t.run(async (ctx) => {
      const productId = (await ctx.db.insert("menuProducts", {
        code: "T5-PROD-G",
        name: "Test Product T5-G",
        grams: 80,
        defaultPrice: 10000,
        isActive: true,
        unitCost: 5000,
        cachedProductionSummary: "1 Big",
      } as never)) as Id<"menuProducts">;

      const customerId = (await ctx.db.insert("customers", {
        name: "Sub Cafe T5-G",
        phone: "+628111333666",
        createdBy: "test",
      } as never)) as Id<"customers">;

      const subscriptionId = (await ctx.db.insert("subscriptions", {
        customerId,
        label: "Weekly T5-G",
        status: "active",
        billingModel: "prepaid_weekly_credit",
        unitPrice: 7000,
        confidentialPrice: false,
        baselineDailyQty: 10,
        weeklyQty: 70,
        deliverByTime: "09:00",
        creditRolloverPolicy: "expire",
        changeCutoffHour: 13,
        changeCutoffDayOffset: -1,
        permanentChangeNoticeDays: 14,
        terminationNoticeDays: 30,
        cogsBasis: 4000,
        startDate: weekStart,
        scheduleTemplate: [
          { dayOfWeek: 1, items: [{ menuProductId: productId, qty: 10 }] },
        ],
        createdBy: userId,
      } as never)) as Id<"subscriptions">;

      // Single planned day in the past — NO done-status order.
      // Expected: still counts as remaining (dispatch not confirmed).
      const weekId = (await ctx.db.insert("subscriptionWeeks", {
        subscriptionId,
        weekStart,
        weekEnd,
        status: "delivering",
        plannedDays: [
          {
            date: pastDayTs,
            deliverByTime: "09:00",
            items: [{ menuProductId: productId, productName: "Test Product T5-G", qty: 10, unitPrice: 7000, lineTotal: 70000 }],
            locked: false,
          },
        ],
        creditIssued: 100000,
        creditConsumed: 0,
        creditRemaining: 100000,
        creditExpired: 0,
        shortfall: 0,
        shortfallFault: "none",
        refundDue: 0,
      } as never)) as Id<"subscriptionWeeks">;

      await ctx.db.insert("creditLedger", {
        subscriptionId,
        subscriptionWeekId: weekId,
        type: "topup",
        amount: 100000,
        balanceAfter: 100000,
        createdBy: userId,
      } as never);

      // No order for pastDayTs → deliveredWibDates is empty.
      return customerId;
    });

    const result = await t.query(api.subscriptions.queries.getSubscriptionCreditContext, {
      customerId,
      dueDate,
      draftItems: [],
      sessionId,
    });

    expect(result).toHaveLength(1);
    // Past day with no matching done-status order: NOT in deliveredWibDates → counted.
    // Expected: 1.
    expect(result[0].plannedDeliveriesRemaining).toBe(1);
  });

  it("(e) Cancelled reserved order is excluded from reservation netting", async () => {
    const t = convexTest(schema, modules);
    const { customerId, subscriptionId, weekId, userId, sessionId } = await seedFundedWeek(t, {
      creditRemaining: 100000,
      unitPrice: 7000,
    });

    // Seed a Cancelled order — its reservation should be ignored.
    await t.run(async (ctx) => {
      await ctx.db.insert("orders", {
        orderNumber: "0629-T5E",
        customerId,
        customerName: "Sub Cafe T5",
        customerPhone: "+628111333444",
        status: "Cancelled",
        paymentStatus: "Unpaid",
        orderDate: Date.now(),
        totalAmount: 40000,
        totalCost: 0,
        totalMargin: 40000,
        finalTotal: 40000,
        deliveryType: "Delivery",
        createdBy: "Test Manager T5",
        createdByUserId: userId,
        itemCount: 1,
        isKitchenVisible: false,
        subscriptionId,
        subscriptionWeekId: weekId,
        fundingSource: "deposit",
        subscriptionCreditApplied: 40000,
      } as never);
    });

    const result = await t.query(api.subscriptions.queries.getSubscriptionCreditContext, {
      customerId,
      dueDate: Date.now(),
      draftItems: [],
      sessionId,
    });
    // Cancelled order must NOT reduce availableCredit.
    expect(result[0].availableCredit).toBe(100000);
  });
});
