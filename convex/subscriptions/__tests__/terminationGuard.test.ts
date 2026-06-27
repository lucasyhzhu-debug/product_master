/**
 * Integration tests for termination guard in seedWeek + confirmWeek.
 * Task 8 — subscription rule-enforcement Wave 2.
 *
 * Guard: once sub.endDate is set, seedWeek/confirmWeek refuse a week
 * whose weekStart is strictly after sub.endDate.
 *
 * Auth harness mirrors baselineTermination.test.ts (Task 7).
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import type { SessionId } from "convex-helpers/server/sessions";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

const modules = import.meta.glob("/convex/**/*.ts");

type TestT = ReturnType<typeof convexTest>;

// ---------------------------------------------------------------------------
// Auth harness — mirrors baselineTermination.test.ts (Task 7)
// ---------------------------------------------------------------------------

async function createSession(
  t: TestT,
  role: "manager" | "admin" | "order_staff",
  name: string,
): Promise<{ token: SessionId; userId: Id<"users"> }> {
  const token = `${role}-token-${Date.now()}-${Math.random()}` as SessionId;
  const userId = await t.run(async (ctx) => {
    const uid = await ctx.db.insert("users", {
      name,
      pinHash: "salt:hash",
      role,
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    } as never);
    await ctx.db.insert("sessions", {
      userId: uid,
      token,
      expiresAt: Date.now() + 8 * 3600_000,
      createdAt: Date.now(),
    } as never);
    return uid as Id<"users">;
  });
  return { token, userId };
}

// ---------------------------------------------------------------------------
// Fixed timestamps used across all tests
// ---------------------------------------------------------------------------

const END_DATE = Date.UTC(2026, 5, 30);     // 2026-06-30 (endDate of terminating sub)
const WEEK_BEFORE_END = Date.UTC(2026, 5, 22); // 2026-06-22 Mon — weekStart <= endDate
const WEEK_AFTER_END = Date.UTC(2026, 6, 6);   // 2026-07-06 Mon — weekStart > endDate

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function seedTerminatingSub(
  t: TestT,
  creatorId: Id<"users">,
  overrides: Record<string, unknown> = {},
): Promise<{
  subscriptionId: Id<"subscriptions">;
  customerId: Id<"customers">;
  menuProductId: Id<"menuProducts">;
}> {
  return await t.run(async (ctx) => {
    const customerId = (await ctx.db.insert("customers", {
      name: "Test Cafe",
      phone: "+6281234567890",
      createdBy: "test",
    } as never)) as Id<"customers">;

    const menuProductId = (await ctx.db.insert("menuProducts", {
      code: "ORIG-01",
      name: "Original 80g",
      grams: 80,
      defaultPrice: 29000,
      isActive: true,
      unitCost: 0,
      cachedProductionSummary: "1 Big",
    } as never)) as Id<"menuProducts">;

    const subscriptionId = (await ctx.db.insert("subscriptions", {
      customerId,
      label: "Test Sub",
      status: "terminating",
      billingModel: "prepaid_weekly_credit",
      unitPrice: 29000,
      confidentialPrice: false,
      baselineDailyQty: 100,
      weeklyQty: 500,
      deliverByTime: "09:00",
      creditRolloverPolicy: "expire",
      changeCutoffHour: 13,
      changeCutoffDayOffset: -1,
      permanentChangeNoticeDays: 14,
      terminationNoticeDays: 30,
      cogsBasis: 18000,
      startDate: Date.UTC(2026, 0, 1),
      endDate: END_DATE,
      scheduleTemplate: [{ dayOfWeek: 0, items: [{ menuProductId, qty: 100 }] }],
      createdBy: creatorId,
      ...overrides,
    } as never)) as Id<"subscriptions">;

    return { subscriptionId, customerId, menuProductId };
  });
}

/** Seed a planned week row directly (bypasses seedWeek mutation). */
async function seedPlannedWeek(
  t: TestT,
  subscriptionId: Id<"subscriptions">,
  menuProductId: Id<"menuProducts">,
  weekStart: number,
): Promise<Id<"subscriptionWeeks">> {
  return await t.run(async (ctx) => {
    const weekEnd = weekStart + 7 * 86_400_000 - 1;
    return (await ctx.db.insert("subscriptionWeeks", {
      subscriptionId,
      weekStart,
      weekEnd,
      status: "planned",
      plannedDays: [
        {
          date: weekStart,
          deliverByTime: "09:00",
          locked: false,
          items: [
            {
              menuProductId,
              productName: "Original 80g",
              qty: 100,
              unitPrice: 29000,
              lineTotal: 2900000,
            },
          ],
        },
      ],
      creditIssued: 0,
      creditConsumed: 0,
      creditRemaining: 0,
      creditExpired: 0,
      shortfall: 0,
      shortfallFault: "none",
      refundDue: 0,
    } as never)) as Id<"subscriptionWeeks">;
  });
}

// ---------------------------------------------------------------------------
// seedWeek — termination guard
// ---------------------------------------------------------------------------

describe("seedWeek — termination guard", () => {
  it("throws when weekStart > sub.endDate", async () => {
    const t = convexTest(schema, modules);
    const { token, userId } = await createSession(t, "manager", "Mgr");
    const { subscriptionId } = await seedTerminatingSub(t, userId);

    await expect(
      t.mutation(api.subscriptions.weeks.seedWeek, {
        sessionId: token,
        subscriptionId,
        weekStart: WEEK_AFTER_END,
      }),
    ).rejects.toThrow("Subscription has been terminated");
  });

  it("succeeds when weekStart <= sub.endDate", async () => {
    const t = convexTest(schema, modules);
    const { token, userId } = await createSession(t, "manager", "Mgr");
    const { subscriptionId } = await seedTerminatingSub(t, userId);

    const weekId = await t.mutation(api.subscriptions.weeks.seedWeek, {
      sessionId: token,
      subscriptionId,
      weekStart: WEEK_BEFORE_END,
    });
    expect(weekId).toBeDefined();
  });

  it("succeeds when endDate is undefined (no termination)", async () => {
    const t = convexTest(schema, modules);
    const { token, userId } = await createSession(t, "manager", "Mgr");
    const { subscriptionId } = await seedTerminatingSub(t, userId, {
      status: "active",
      endDate: undefined,
    });

    const weekId = await t.mutation(api.subscriptions.weeks.seedWeek, {
      sessionId: token,
      subscriptionId,
      weekStart: WEEK_AFTER_END,
    });
    expect(weekId).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// confirmWeek — termination guard
// ---------------------------------------------------------------------------

describe("confirmWeek — termination guard", () => {
  it("throws when week.weekStart > sub.endDate", async () => {
    const t = convexTest(schema, modules);
    const { token, userId } = await createSession(t, "manager", "Mgr");
    const { subscriptionId, menuProductId } = await seedTerminatingSub(t, userId);
    const weekId = await seedPlannedWeek(t, subscriptionId, menuProductId, WEEK_AFTER_END);

    await expect(
      t.mutation(api.subscriptions.scheduling.confirmWeek.confirmWeek, {
        sessionId: token,
        subscriptionWeekId: weekId,
      }),
    ).rejects.toThrow("Subscription has been terminated");
  });

  it("succeeds when week.weekStart <= sub.endDate", async () => {
    const t = convexTest(schema, modules);
    const { token, userId } = await createSession(t, "manager", "Mgr");
    const { subscriptionId, menuProductId } = await seedTerminatingSub(t, userId);
    const weekId = await seedPlannedWeek(t, subscriptionId, menuProductId, WEEK_BEFORE_END);

    const result = await t.mutation(api.subscriptions.scheduling.confirmWeek.confirmWeek, {
      sessionId: token,
      subscriptionWeekId: weekId,
    });
    expect(result).toBe(weekId);
  });

  it("succeeds when endDate is undefined (no termination)", async () => {
    const t = convexTest(schema, modules);
    const { token, userId } = await createSession(t, "manager", "Mgr");
    const { subscriptionId, menuProductId } = await seedTerminatingSub(t, userId, {
      status: "active",
      endDate: undefined,
    });
    const weekId = await seedPlannedWeek(t, subscriptionId, menuProductId, WEEK_AFTER_END);

    const result = await t.mutation(api.subscriptions.scheduling.confirmWeek.confirmWeek, {
      sessionId: token,
      subscriptionWeekId: weekId,
    });
    expect(result).toBe(weekId);
  });
});
