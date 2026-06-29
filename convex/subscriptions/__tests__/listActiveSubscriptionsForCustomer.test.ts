/**
 * T1 integration tests: listActiveSubscriptionsForCustomer query
 *
 * Uses explicit modules glob so convex-test loads the worktree's implementations,
 * not stale main-tree code via the node_modules junction.
 */
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import type { SessionId } from "convex-helpers/server/sessions";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

const modules = import.meta.glob("/convex/**/*.ts");

type TestT = ReturnType<typeof convexTest>;

async function createSession(
  t: TestT,
  role: "order_staff" | "manager" | "admin" | "kitchen",
  suffix: string,
): Promise<{ sessionId: SessionId; userId: Id<"users"> }> {
  const token = `${role}-token-T1-${suffix}-${Math.random()}` as SessionId;
  const userId = await t.run(async (ctx) => {
    const uid = await ctx.db.insert("users", {
      name: `Test ${role} T1 ${suffix}`,
      pinHash: "salt:hash",
      role,
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

/** Seeds a customer with one active funded (delivering) week and one ended sub. */
async function seedActiveSubWithWeek(t: TestT): Promise<{
  customerId: Id<"customers">;
  activeSubId: Id<"subscriptions">;
  sessionId: SessionId;
}> {
  const { sessionId, userId } = await createSession(t, "manager", "seed");
  const NOW = Date.now();
  const weekStart = NOW - 3 * 86400000; // 3 days ago
  const weekEnd = NOW + 4 * 86400000;   // 4 days ahead

  const result = await t.run(async (ctx) => {
    const productId = (await ctx.db.insert("menuProducts", {
      code: "T1-P1",
      name: "Product T1",
      grams: 80,
      defaultPrice: 10000,
      isActive: true,
      unitCost: 5000,
      cachedProductionSummary: "1 Big",
    } as never)) as Id<"menuProducts">;

    const customerId = (await ctx.db.insert("customers", {
      name: "Cafe T1",
      phone: "+628111000101",
      createdBy: "test",
    } as never)) as Id<"customers">;

    // Active subscription with a funded week covering NOW
    const activeSubId = (await ctx.db.insert("subscriptions", {
      customerId,
      label: "Weekly Plan T1",
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

    // Ended subscription — must be excluded from results
    await ctx.db.insert("subscriptions", {
      customerId,
      label: "Old Plan T1",
      status: "ended",
      billingModel: "prepaid_weekly_credit",
      unitPrice: 6000,
      confidentialPrice: false,
      baselineDailyQty: 5,
      weeklyQty: 35,
      deliverByTime: "09:00",
      creditRolloverPolicy: "expire",
      changeCutoffHour: 13,
      changeCutoffDayOffset: -1,
      permanentChangeNoticeDays: 14,
      terminationNoticeDays: 30,
      cogsBasis: 3000,
      startDate: weekStart - 30 * 86400000,
      endDate: weekStart,
      scheduleTemplate: [],
      createdBy: userId,
    } as never);

    // Funded (delivering) week covering NOW
    const weekId = (await ctx.db.insert("subscriptionWeeks", {
      subscriptionId: activeSubId,
      weekStart,
      weekEnd,
      status: "delivering",
      plannedDays: [
        {
          date: NOW,
          deliverByTime: "09:00",
          items: [
            {
              menuProductId: productId,
              productName: "Product T1",
              qty: 10,
              unitPrice: 7000,
              lineTotal: 70000,
            },
          ],
          locked: false,
        },
      ],
      creditIssued: 70000,
      creditConsumed: 0,
      creditRemaining: 70000,
      creditExpired: 0,
      shortfall: 0,
      shortfallFault: "none",
      refundDue: 0,
    } as never)) as Id<"subscriptionWeeks">;

    // Fund the pool via a topup ledger entry
    await ctx.db.insert("creditLedger", {
      subscriptionId: activeSubId,
      subscriptionWeekId: weekId,
      type: "topup",
      amount: 70000,
      balanceAfter: 70000,
      createdBy: userId,
    } as never);

    return { customerId, activeSubId };
  });

  return { ...result, sessionId };
}

test("returns active subs only, with current-week creditRemaining", async () => {
  const t = convexTest(schema, modules);
  const { customerId, activeSubId, sessionId } = await seedActiveSubWithWeek(t);

  const out = await t.query(
    api.subscriptions.queries.listActiveSubscriptionsForCustomer,
    { sessionId, customerId },
  );

  expect(out).toHaveLength(1);
  expect(out[0].subscriptionId).toBe(activeSubId);
  expect(out[0].label).toBe("Weekly Plan T1");
  expect(out[0].creditRemaining).toBeGreaterThan(0);
});

test("creditRemaining is null when the active sub has no covering funded week", async () => {
  const t = convexTest(schema, modules);
  const { sessionId, userId } = await createSession(t, "manager", "nofund");
  const NOW = Date.now();

  const { customerId, subId } = await t.run(async (ctx) => {
    const customerId = (await ctx.db.insert("customers", {
      name: "Cafe T1 NoFund",
      phone: "+628111000103",
      createdBy: "test",
    } as never)) as Id<"customers">;

    // Active subscription with NO covering paid/delivering week for today.
    const subId = (await ctx.db.insert("subscriptions", {
      customerId,
      label: "Unfunded Plan T1",
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
      startDate: NOW - 3 * 86400000,
      scheduleTemplate: [],
      createdBy: userId,
    } as never)) as Id<"subscriptions">;

    // A week that does NOT cover today (already ended) — must not be matched.
    await ctx.db.insert("subscriptionWeeks", {
      subscriptionId: subId,
      weekStart: NOW - 21 * 86400000,
      weekEnd: NOW - 14 * 86400000,
      status: "delivering",
      plannedDays: [],
      creditIssued: 0,
      creditConsumed: 0,
      creditRemaining: 0,
      creditExpired: 0,
      shortfall: 0,
      shortfallFault: "none",
      refundDue: 0,
    } as never);

    return { customerId, subId };
  });

  const out = await t.query(
    api.subscriptions.queries.listActiveSubscriptionsForCustomer,
    { sessionId, customerId },
  );

  expect(out).toHaveLength(1);
  expect(out[0].subscriptionId).toBe(subId);
  expect(out[0].creditRemaining).toBeNull();
});

test("order_staff is authorized; kitchen is rejected", async () => {
  const t = convexTest(schema, modules);

  const { sessionId: sessionStaff } = await createSession(t, "order_staff", "auth");
  const { sessionId: sessionKitchen } = await createSession(t, "kitchen", "auth");

  const customerId = (await t.run(async (ctx) =>
    ctx.db.insert("customers", {
      name: "Cafe T1 Role",
      phone: "+628111000102",
      createdBy: "test",
    } as never),
  )) as Id<"customers">;

  await expect(
    t.query(api.subscriptions.queries.listActiveSubscriptionsForCustomer, {
      sessionId: sessionStaff,
      customerId,
    }),
  ).resolves.toBeDefined();

  await expect(
    t.query(api.subscriptions.queries.listActiveSubscriptionsForCustomer, {
      sessionId: sessionKitchen,
      customerId,
    }),
  ).rejects.toThrow(/not in/);
});
