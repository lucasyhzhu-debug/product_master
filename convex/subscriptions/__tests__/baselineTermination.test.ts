/**
 * Integration tests for scheduleBaselineChange + giveTerminationNotice mutations.
 * Task 7 — subscription rule-enforcement Wave 2.
 *
 * Auth harness pattern copied from convex/bankStatements/__tests__/reconcileHelpers.ts
 * (createSession: insert users row + sessions row, return token).
 * Mutations are called with sessionId: token as the first arg (protectedMutation contract).
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
// Auth harness — mirrors convex/subscriptions/__tests__/invoicing.test.ts
// (cast token as SessionId — SessionIdArg branded type from convex-helpers)
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

type SessionResult = { token: SessionId; userId: Id<"users"> };

// ---------------------------------------------------------------------------
// Fixture: seed a minimal active subscription
// ---------------------------------------------------------------------------

async function seedSubscription(
  t: TestT,
  creatorId: Id<"users">,
  overrides: Record<string, unknown> = {},
): Promise<Id<"subscriptions">> {
  return await t.run(async (ctx) => {
    const customerId = (await ctx.db.insert("customers", {
      name: "Test Cafe",
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

    return (await ctx.db.insert("subscriptions", {
      customerId,
      label: "Test Sub",
      status: "active",
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
      startDate: Date.now() - 7 * 86_400_000,
      scheduleTemplate: [{ dayOfWeek: 0, items: [{ menuProductId, qty: 100 }] }],
      createdBy: creatorId,
      ...overrides,
    } as never)) as Id<"subscriptions">;
  });
}

// ---------------------------------------------------------------------------
// scheduleBaselineChange
// ---------------------------------------------------------------------------

describe("scheduleBaselineChange", () => {
  it("stages pendingBaselineChange with effectiveDate ≈ now + 14 days", async () => {
    const t = convexTest(schema, modules);
    const { token, userId } = await createSession(t, "manager", "Mgr");
    const subscriptionId = await seedSubscription(t, userId);

    const before = Date.now();
    await t.mutation(api.subscriptions.mutations.scheduleBaselineChange, {
      sessionId: token,
      subscriptionId,
      newQty: 120,
    });
    const after = Date.now();

    const sub = await t.run((ctx) => ctx.db.get(subscriptionId));
    expect(sub!.pendingBaselineChange).toBeDefined();
    expect(sub!.pendingBaselineChange!.newQty).toBe(120);
    // effectiveDate = noticeDate + 14 * DAY_MS — within [before+14d, after+14d]
    const DAY = 86_400_000;
    expect(sub!.pendingBaselineChange!.effectiveDate).toBeGreaterThanOrEqual(before + 14 * DAY);
    expect(sub!.pendingBaselineChange!.effectiveDate).toBeLessThanOrEqual(after + 14 * DAY);
  });

  it("rejects when subscription status is 'ended'", async () => {
    const t = convexTest(schema, modules);
    const { token, userId } = await createSession(t, "manager", "Mgr");
    const subscriptionId = await seedSubscription(t, userId, { status: "ended" });

    await expect(
      t.mutation(api.subscriptions.mutations.scheduleBaselineChange, {
        sessionId: token,
        subscriptionId,
        newQty: 50,
      }),
    ).rejects.toThrow();
  });

  it("rejects non-positive newQty (zero)", async () => {
    const t = convexTest(schema, modules);
    const { token, userId } = await createSession(t, "manager", "Mgr");
    const subscriptionId = await seedSubscription(t, userId);

    await expect(
      t.mutation(api.subscriptions.mutations.scheduleBaselineChange, {
        sessionId: token,
        subscriptionId,
        newQty: 0,
      }),
    ).rejects.toThrow();
  });

  it("rejects non-integer newQty", async () => {
    const t = convexTest(schema, modules);
    const { token, userId } = await createSession(t, "manager", "Mgr");
    const subscriptionId = await seedSubscription(t, userId);

    await expect(
      t.mutation(api.subscriptions.mutations.scheduleBaselineChange, {
        sessionId: token,
        subscriptionId,
        newQty: 12.5,
      }),
    ).rejects.toThrow();
  });

  it("rejects an order_staff session (role gate)", async () => {
    const t = convexTest(schema, modules);
    const { userId: mgr } = await createSession(t, "manager", "Mgr");
    const { token: staffToken } = await createSession(t, "order_staff", "Staff");
    const subscriptionId = await seedSubscription(t, mgr);

    await expect(
      t.mutation(api.subscriptions.mutations.scheduleBaselineChange, {
        sessionId: staffToken,
        subscriptionId,
        newQty: 10,
      }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// giveTerminationNotice
// ---------------------------------------------------------------------------

describe("giveTerminationNotice", () => {
  it("sets terminationNoticeDate, endDate ≈ now + 30 days, status='terminating'", async () => {
    const t = convexTest(schema, modules);
    const { token, userId } = await createSession(t, "manager", "Mgr");
    const subscriptionId = await seedSubscription(t, userId);

    const before = Date.now();
    await t.mutation(api.subscriptions.mutations.giveTerminationNotice, {
      sessionId: token,
      subscriptionId,
    });
    const after = Date.now();

    const sub = await t.run((ctx) => ctx.db.get(subscriptionId));
    expect(sub!.status).toBe("terminating");
    expect(sub!.terminationNoticeDate).toBeGreaterThanOrEqual(before);
    expect(sub!.terminationNoticeDate).toBeLessThanOrEqual(after);
    const DAY = 86_400_000;
    expect(sub!.endDate).toBeGreaterThanOrEqual(before + 30 * DAY);
    expect(sub!.endDate).toBeLessThanOrEqual(after + 30 * DAY);
  });

  it("rejects a second call when already 'terminating'", async () => {
    const t = convexTest(schema, modules);
    const { token, userId } = await createSession(t, "manager", "Mgr");
    const subscriptionId = await seedSubscription(t, userId);

    await t.mutation(api.subscriptions.mutations.giveTerminationNotice, {
      sessionId: token,
      subscriptionId,
    });

    await expect(
      t.mutation(api.subscriptions.mutations.giveTerminationNotice, {
        sessionId: token,
        subscriptionId,
      }),
    ).rejects.toThrow();
  });

  it("rejects when subscription is already 'ended'", async () => {
    const t = convexTest(schema, modules);
    const { token, userId } = await createSession(t, "manager", "Mgr");
    const subscriptionId = await seedSubscription(t, userId, { status: "ended" });

    await expect(
      t.mutation(api.subscriptions.mutations.giveTerminationNotice, {
        sessionId: token,
        subscriptionId,
      }),
    ).rejects.toThrow();
  });

  it("rejects an order_staff session (role gate)", async () => {
    const t = convexTest(schema, modules);
    const { userId: mgr } = await createSession(t, "manager", "Mgr");
    const { token: staffToken } = await createSession(t, "order_staff", "Staff");
    const subscriptionId = await seedSubscription(t, mgr);

    await expect(
      t.mutation(api.subscriptions.mutations.giveTerminationNotice, {
        sessionId: staffToken,
        subscriptionId,
      }),
    ).rejects.toThrow();
  });
});
