/**
 * Integration tests: above-baseline flag at the 3 plannedDays write sites.
 * Task 9 — subscription rule-enforcement Wave 2.
 *
 * Clause 4 (warn-only): every plannedDay written by the system carries
 *   needsSupplierConfirmation = detectAboveBaseline(dayItems, sub.baselineDailyQty)
 *
 * Write sites tested:
 *   1. seedWeek — template path (via buildPlannedDays)
 *   2. seedWeek — previousWeek re-date branch (inline flag)
 *   3. saveWeekPlan — plannedDays map
 *   4. amendConfirmedWeek — plannedDays build
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
// Auth harness — mirrors terminationGuard.test.ts (Task 8)
// ---------------------------------------------------------------------------

async function createSession(
  t: TestT,
  role: "manager" | "admin",
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
// Constants
// ---------------------------------------------------------------------------

const BASELINE = 4; // baselineDailyQty — intentionally small so 5 exceeds it
const WEEK_START = Date.UTC(2026, 5, 22); // 2026-06-22 Mon
const PREV_WEEK_START = Date.UTC(2026, 5, 15); // 2026-06-15 Mon
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function seedMenuProduct(t: TestT): Promise<Id<"menuProducts">> {
  return await t.run(async (ctx) => {
    return (await ctx.db.insert("menuProducts", {
      code: "ORIG-01",
      name: "Original 80g",
      grams: 80,
      defaultPrice: 29000,
      isActive: true,
      unitCost: 0,
      cachedProductionSummary: "1 Big",
    } as never)) as Id<"menuProducts">;
  });
}

async function seedSub(
  t: TestT,
  userId: Id<"users">,
  menuProductId: Id<"menuProducts">,
  overrides: Record<string, unknown> = {},
): Promise<Id<"subscriptions">> {
  return await t.run(async (ctx) => {
    const customerId = (await ctx.db.insert("customers", {
      name: "Test Cafe",
      phone: "+6281234567890",
      createdBy: "test",
    } as never)) as Id<"customers">;

    return (await ctx.db.insert("subscriptions", {
      customerId,
      label: "Test Sub",
      status: "active",
      billingModel: "prepaid_weekly_credit",
      unitPrice: 29000,
      confidentialPrice: false,
      baselineDailyQty: BASELINE, // 4
      weeklyQty: 20,
      deliverByTime: "09:00",
      creditRolloverPolicy: "expire",
      changeCutoffHour: 13,
      changeCutoffDayOffset: -1,
      permanentChangeNoticeDays: 14,
      terminationNoticeDays: 30,
      cogsBasis: 18000,
      startDate: Date.UTC(2026, 0, 1),
      // day0 (Mon): qty=5 — ABOVE baseline(4); day1 (Tue): qty=3 — at-or-below
      scheduleTemplate: [
        { dayOfWeek: 0, items: [{ menuProductId, qty: 5 }] },
        { dayOfWeek: 1, items: [{ menuProductId, qty: 3 }] },
      ],
      createdBy: userId,
      ...overrides,
    } as never)) as Id<"subscriptions">;
  });
}

// ---------------------------------------------------------------------------
// seedWeek — template path
// ---------------------------------------------------------------------------

describe("seedWeek (template path) — above-baseline flag", () => {
  it("sets needsSupplierConfirmation=true on over-baseline day, falsey on at-or-below", async () => {
    const t = convexTest(schema, modules);
    const { token, userId } = await createSession(t, "manager", "Mgr");
    const menuProductId = await seedMenuProduct(t);
    const subscriptionId = await seedSub(t, userId, menuProductId);

    const weekId = await t.mutation(api.subscriptions.weeks.seedWeek, {
      sessionId: token,
      subscriptionId,
      weekStart: WEEK_START,
      source: "template",
    });

    const week = await t.run((ctx) => ctx.db.get(weekId as Id<"subscriptionWeeks">));
    expect(week!.plannedDays).toHaveLength(2);
    const sorted = [...week!.plannedDays].sort((a, b) => a.date - b.date);
    // day0: qty=5 > baseline(4) → true
    expect(sorted[0]!.needsSupplierConfirmation).toBe(true);
    // day1: qty=3 ≤ baseline(4) → falsey
    expect(sorted[1]!.needsSupplierConfirmation).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// seedWeek — previousWeek re-date branch
// ---------------------------------------------------------------------------

describe("seedWeek (previousWeek path) — above-baseline flag", () => {
  it("sets flag inline on re-dated days from previousWeek", async () => {
    const t = convexTest(schema, modules);
    const { token, userId } = await createSession(t, "manager", "Mgr");
    const menuProductId = await seedMenuProduct(t);
    const subscriptionId = await seedSub(t, userId, menuProductId);

    // Seed a prior week with day0 qty=5 (above), day1 qty=3 (below)
    await t.run(async (ctx) => {
      const weekEnd = PREV_WEEK_START + 7 * DAY_MS - 1;
      await ctx.db.insert("subscriptionWeeks", {
        subscriptionId,
        weekStart: PREV_WEEK_START,
        weekEnd,
        status: "planned",
        plannedDays: [
          {
            date: PREV_WEEK_START,
            deliverByTime: "09:00",
            locked: false,
            items: [
              { menuProductId, productName: "Original 80g", qty: 5, unitPrice: 29000, lineTotal: 145000 },
            ],
          },
          {
            date: PREV_WEEK_START + DAY_MS,
            deliverByTime: "09:00",
            locked: false,
            items: [
              { menuProductId, productName: "Original 80g", qty: 3, unitPrice: 29000, lineTotal: 87000 },
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
      } as never);
    });

    const weekId = await t.mutation(api.subscriptions.weeks.seedWeek, {
      sessionId: token,
      subscriptionId,
      weekStart: WEEK_START,
      source: "previousWeek",
    });

    const week = await t.run((ctx) => ctx.db.get(weekId as Id<"subscriptionWeeks">));
    expect(week!.plannedDays).toHaveLength(2);
    const sorted = [...week!.plannedDays].sort((a, b) => a.date - b.date);
    // re-dated day0: qty=5 → true
    expect(sorted[0]!.needsSupplierConfirmation).toBe(true);
    // re-dated day1: qty=3 → falsey
    expect(sorted[1]!.needsSupplierConfirmation).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// saveWeekPlan — plannedDays map
// ---------------------------------------------------------------------------

describe("saveWeekPlan — above-baseline flag", () => {
  it("sets flag on each written plannedDay", async () => {
    const t = convexTest(schema, modules);
    const { token, userId } = await createSession(t, "manager", "Mgr");
    const menuProductId = await seedMenuProduct(t);
    const subscriptionId = await seedSub(t, userId, menuProductId);

    // Seed an empty planned week
    const weekId = await t.run(async (ctx) => {
      const weekEnd = WEEK_START + 7 * DAY_MS - 1;
      return (await ctx.db.insert("subscriptionWeeks", {
        subscriptionId,
        weekStart: WEEK_START,
        weekEnd,
        status: "planned",
        plannedDays: [],
        creditIssued: 0,
        creditConsumed: 0,
        creditRemaining: 0,
        creditExpired: 0,
        shortfall: 0,
        shortfallFault: "none",
        refundDue: 0,
      } as never)) as Id<"subscriptionWeeks">;
    });

    await t.mutation(api.subscriptions.weeks.saveWeekPlan, {
      sessionId: token,
      subscriptionWeekId: weekId,
      days: [
        // qty=5 → above baseline(4)
        { date: WEEK_START, items: [{ menuProductId, qty: 5 }] },
        // qty=4 → at baseline (NOT strictly above, detectAboveBaseline uses >)
        { date: WEEK_START + DAY_MS, items: [{ menuProductId, qty: 4 }] },
      ],
    });

    const week = await t.run((ctx) => ctx.db.get(weekId));
    const sorted = [...week!.plannedDays].sort((a, b) => a.date - b.date);
    expect(sorted[0]!.needsSupplierConfirmation).toBe(true);
    expect(sorted[1]!.needsSupplierConfirmation).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// amendConfirmedWeek — plannedDays build
// ---------------------------------------------------------------------------

describe("amendConfirmedWeek — above-baseline flag", () => {
  it("sets flag on amended plannedDays after an increases-only amendment", async () => {
    const t = convexTest(schema, modules);
    const { token, userId } = await createSession(t, "manager", "Mgr");
    const menuProductId = await seedMenuProduct(t);
    const subscriptionId = await seedSub(t, userId, menuProductId);

    // Seed a confirmed week with initial low qty (both days below baseline)
    // current totals per product: 2+2=4 — ensures new totals (6+4=10) are strictly higher
    const weekId = await t.run(async (ctx) => {
      const weekEnd = WEEK_START + 7 * DAY_MS - 1;
      return (await ctx.db.insert("subscriptionWeeks", {
        subscriptionId,
        weekStart: WEEK_START,
        weekEnd,
        status: "confirmed",
        plannedDays: [
          {
            date: WEEK_START,
            deliverByTime: "09:00",
            locked: false,
            items: [
              { menuProductId, productName: "Original 80g", qty: 2, unitPrice: 29000, lineTotal: 58000 },
            ],
          },
          {
            date: WEEK_START + DAY_MS,
            deliverByTime: "09:00",
            locked: false,
            items: [
              { menuProductId, productName: "Original 80g", qty: 2, unitPrice: 29000, lineTotal: 58000 },
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

    // Amend: day0 → qty=6 (above baseline=4), day1 → qty=4 (at baseline, not above)
    // Aggregate: current=4, new=10 → delta=6 > 0 → passes increases-only guard
    await t.mutation(api.subscriptions.amend.amendConfirmedWeek, {
      sessionId: token,
      subscriptionWeekId: weekId,
      days: [
        { date: WEEK_START, items: [{ menuProductId, qty: 6 }] },
        { date: WEEK_START + DAY_MS, items: [{ menuProductId, qty: 4 }] },
      ],
    });

    const week = await t.run((ctx) => ctx.db.get(weekId));
    const sorted = [...week!.plannedDays].sort((a, b) => a.date - b.date);
    // day0: qty=6 > baseline(4) → true
    expect(sorted[0]!.needsSupplierConfirmation).toBe(true);
    // day1: qty=4 = baseline(4) → falsey (not strictly above)
    expect(sorted[1]!.needsSupplierConfirmation).toBeFalsy();
  });
});
