import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../../schema";
import { resolveCurrentWeek } from "../currentWeek";

const modules = import.meta.glob("/convex/**/*.ts");

// Monday 00:00 WIB = Monday 00:00 UTC+7 = Sunday 17:00 UTC the prior day.
// Use a fixed reference: last-Monday = 2026-06-22 00:00 WIB (Sunday 2026-06-21 17:00 UTC).
const LAST_MONDAY_WIB = Date.UTC(2026, 5, 21, 17, 0, 0, 0); // 2026-06-22 00:00 WIB
const NEXT_MONDAY_WIB = LAST_MONDAY_WIB + 7 * 24 * 3600_000; // 2026-06-29 00:00 WIB
const NOW = LAST_MONDAY_WIB + 3 * 24 * 3600_000; // 2026-06-25 Wednesday WIB (between the two)

// Minimal week row fields (only required fields, no optional ones).
const WEEK_DEFAULTS = {
  status: "planned" as const,
  plannedDays: [],
  creditIssued: 0,
  creditConsumed: 0,
  creditRemaining: 0,
  creditExpired: 0,
  shortfall: 0,
  shortfallFault: "none" as const,
  refundDue: 0,
};

describe("resolveCurrentWeek", () => {
  it("returns the last-Monday row given now between last-Monday and next-Monday", async () => {
    const t = convexTest(schema, modules);

    let lastWeekId: string;

    await t.run(async (ctx) => {
      // Minimal parent chain: user → customer → subscription.
      const userId = await ctx.db.insert("users", {
        name: "Test User",
        pinHash: "salt:hash",
        role: "admin",
        isActive: true,
        failedAttempts: 0,
        createdAt: 0,
      });
      const customerId = await ctx.db.insert("customers", {
        name: "Test Customer",
        createdBy: "test",
      });
      const subscriptionId = await ctx.db.insert("subscriptions", {
        customerId,
        label: "Test Sub",
        status: "active",
        billingModel: "prepaid_weekly_credit",
        unitPrice: 29000,
        confidentialPrice: true,
        baselineDailyQty: 10,
        weeklyQty: 70,
        deliverByTime: "09:00",
        creditRolloverPolicy: "expire",
        changeCutoffHour: 13,
        changeCutoffDayOffset: -1,
        permanentChangeNoticeDays: 14,
        terminationNoticeDays: 30,
        cogsBasis: 0,
        startDate: LAST_MONDAY_WIB,
        scheduleTemplate: [],
        createdBy: userId,
      });

      // Past week: starts last-Monday (≤ NOW).
      lastWeekId = await ctx.db.insert("subscriptionWeeks", {
        ...WEEK_DEFAULTS,
        subscriptionId,
        weekStart: LAST_MONDAY_WIB,
        weekEnd: LAST_MONDAY_WIB + 7 * 24 * 3600_000 - 1,
      });

      // Future week: starts next-Monday (> NOW).
      await ctx.db.insert("subscriptionWeeks", {
        ...WEEK_DEFAULTS,
        subscriptionId,
        weekStart: NEXT_MONDAY_WIB,
        weekEnd: NEXT_MONDAY_WIB + 7 * 24 * 3600_000 - 1,
      });

      // Call resolveCurrentWeek inside the same run so ctx is a QueryCtx.
      const result = await resolveCurrentWeek(ctx, subscriptionId, NOW);
      expect(result).not.toBeNull();
      expect(result!._id).toBe(lastWeekId!);
      expect(result!.weekStart).toBe(LAST_MONDAY_WIB);
    });
  });

  it("returns null when no weeks have started yet", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Test User 2",
        pinHash: "salt:hash",
        role: "admin",
        isActive: true,
        failedAttempts: 0,
        createdAt: 0,
      });
      const customerId = await ctx.db.insert("customers", {
        name: "Test Customer 2",
        createdBy: "test",
      });
      const subscriptionId = await ctx.db.insert("subscriptions", {
        customerId,
        label: "Future Sub",
        status: "active",
        billingModel: "prepaid_weekly_credit",
        unitPrice: 29000,
        confidentialPrice: true,
        baselineDailyQty: 10,
        weeklyQty: 70,
        deliverByTime: "09:00",
        creditRolloverPolicy: "expire",
        changeCutoffHour: 13,
        changeCutoffDayOffset: -1,
        permanentChangeNoticeDays: 14,
        terminationNoticeDays: 30,
        cogsBasis: 0,
        startDate: NEXT_MONDAY_WIB,
        scheduleTemplate: [],
        createdBy: userId,
      });

      // Only a future week (starts after NOW).
      await ctx.db.insert("subscriptionWeeks", {
        ...WEEK_DEFAULTS,
        subscriptionId,
        weekStart: NEXT_MONDAY_WIB,
        weekEnd: NEXT_MONDAY_WIB + 7 * 24 * 3600_000 - 1,
      });

      const result = await resolveCurrentWeek(ctx, subscriptionId, NOW);
      expect(result).toBeNull();
    });
  });
});
