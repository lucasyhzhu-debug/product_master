import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../../schema";
import { internal } from "../../../_generated/api";
import { wibMidnightToUtc } from "../../../lib/periodRange";
import type { Id } from "../../../_generated/dataModel";

const modules = import.meta.glob("/convex/**/*.ts");

describe("flipDayLocksAtCutoff", () => {
  it("locks only days whose cutoff has passed", async () => {
    const t = convexTest(schema, modules);

    // Wed 2026-06-24 delivery day: cutoff = Tue 2026-06-23 13:00 WIB
    const dayPast = wibMidnightToUtc(2026, 5, 24);
    // Sat 2026-06-27 delivery day: cutoff = Fri 2026-06-26 13:00 WIB
    const dayFuture = wibMidnightToUtc(2026, 5, 27);
    // now = Thu 2026-06-25 12:00 WIB → past(Wed) cutoff passed, future(Sat) cutoff not yet
    const now = wibMidnightToUtc(2026, 5, 25) + 12 * 3600_000;

    const { weekId } = await t.run(async (ctx) => {
      const userId = (await ctx.db.insert("users", {
        name: "Test Admin",
        pinHash: "salt:hash",
        role: "admin",
        isActive: true,
        failedAttempts: 0,
        createdAt: Date.now(),
      } as never)) as Id<"users">;

      const customerId = (await ctx.db.insert("customers", {
        name: "Cafe Test",
        createdBy: "test",
      } as never)) as Id<"customers">;

      const menuProductId = (await ctx.db.insert("menuProducts", {
        code: "TEST-01",
        name: "Test Product",
        grams: 80,
        defaultPrice: 29000,
        isActive: true,
        unitCost: 0,
        cachedProductionSummary: "1 Big",
      } as never)) as Id<"menuProducts">;

      const subId = (await ctx.db.insert("subscriptions", {
        customerId,
        label: "Test Sub",
        status: "active",
        billingModel: "prepaid_weekly_credit",
        unitPrice: 29000,
        confidentialPrice: false,
        baselineDailyQty: 150,
        weeklyQty: 750,
        deliverByTime: "09:00",
        creditRolloverPolicy: "expire",
        changeCutoffHour: 13,
        changeCutoffDayOffset: -1,
        permanentChangeNoticeDays: 14,
        terminationNoticeDays: 30,
        cogsBasis: 18000,
        startDate: wibMidnightToUtc(2026, 5, 22),
        scheduleTemplate: [{ dayOfWeek: 3, items: [{ menuProductId, qty: 150 }] }],
        createdBy: userId,
      } as never)) as Id<"subscriptions">;

      const weekId = (await ctx.db.insert("subscriptionWeeks", {
        subscriptionId: subId,
        weekStart: wibMidnightToUtc(2026, 5, 22),
        weekEnd: wibMidnightToUtc(2026, 5, 29) - 1,
        status: "planned",
        plannedDays: [
          {
            date: dayPast,
            deliverByTime: "09:00",
            items: [
              {
                menuProductId,
                productName: "Test Product",
                qty: 1,
                unitPrice: 29000,
                lineTotal: 29000,
              },
            ],
            locked: false,
          },
          {
            date: dayFuture,
            deliverByTime: "09:00",
            items: [],
            locked: false,
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

      return { weekId };
    });

    // First run: flip the past-cutoff day
    await t.mutation(
      internal.subscriptions.enforcement.flipDayLocksAtCutoff.flipDayLocksAtCutoff,
      { now },
    );

    const week = await t.run((ctx) => ctx.db.get(weekId));
    expect(week!.plannedDays[0].locked).toBe(true);
    expect(week!.plannedDays[1].locked).toBe(false);
    expect(week!.plannedDays[0].items.length).toBe(1); // items unchanged (metadata-only)

    // Second run: idempotent — no state change
    await t.mutation(
      internal.subscriptions.enforcement.flipDayLocksAtCutoff.flipDayLocksAtCutoff,
      { now },
    );

    const week2 = await t.run((ctx) => ctx.db.get(weekId));
    expect(week2!.plannedDays[0].locked).toBe(true);
    expect(week2!.plannedDays[1].locked).toBe(false);
  });

  // I1 — the 14-day weekStart lower bound must keep an old week out of the scan:
  // an unlocked, past-cutoff day in a week whose weekStart predates the window is
  // NOT fetched and therefore NOT locked (re-locking it was a no-op anyway).
  it("does not fetch/lock weeks whose weekStart is older than the 14-day window", async () => {
    const t = convexTest(schema, modules);

    // now = Thu 2026-06-25 12:00 WIB
    const now = wibMidnightToUtc(2026, 5, 25) + 12 * 3600_000;
    // Old week: weekStart ~60 days before now (well outside the 14-day floor),
    // with a delivery day whose cutoff is long past → would lock if it were scanned.
    const oldWeekStart = wibMidnightToUtc(2026, 3, 27); // 2026-04-27 (~59 days prior)
    const oldDay = wibMidnightToUtc(2026, 3, 29); // past-cutoff delivery day in that week

    const { oldWeekId } = await t.run(async (ctx) => {
      const userId = (await ctx.db.insert("users", {
        name: "Test Admin",
        pinHash: "salt:hash",
        role: "admin",
        isActive: true,
        failedAttempts: 0,
        createdAt: Date.now(),
      } as never)) as Id<"users">;

      const customerId = (await ctx.db.insert("customers", {
        name: "Cafe Old",
        createdBy: "test",
      } as never)) as Id<"customers">;

      const menuProductId = (await ctx.db.insert("menuProducts", {
        code: "TEST-OLD",
        name: "Test Product",
        grams: 80,
        defaultPrice: 29000,
        isActive: true,
        unitCost: 0,
        cachedProductionSummary: "1 Big",
      } as never)) as Id<"menuProducts">;

      const subId = (await ctx.db.insert("subscriptions", {
        customerId,
        label: "Old Sub",
        status: "active",
        billingModel: "prepaid_weekly_credit",
        unitPrice: 29000,
        confidentialPrice: false,
        baselineDailyQty: 150,
        weeklyQty: 750,
        deliverByTime: "09:00",
        creditRolloverPolicy: "expire",
        changeCutoffHour: 13,
        changeCutoffDayOffset: -1,
        permanentChangeNoticeDays: 14,
        terminationNoticeDays: 30,
        cogsBasis: 18000,
        startDate: oldWeekStart,
        scheduleTemplate: [{ dayOfWeek: 3, items: [{ menuProductId, qty: 150 }] }],
        createdBy: userId,
      } as never)) as Id<"subscriptions">;

      const oldWeekId = (await ctx.db.insert("subscriptionWeeks", {
        subscriptionId: subId,
        weekStart: oldWeekStart,
        weekEnd: oldWeekStart + 7 * 86_400_000 - 1,
        status: "planned", // non-terminal so the only thing keeping it unlocked is the index bound
        plannedDays: [
          {
            date: oldDay,
            deliverByTime: "09:00",
            items: [
              {
                menuProductId,
                productName: "Test Product",
                qty: 1,
                unitPrice: 29000,
                lineTotal: 29000,
              },
            ],
            locked: false,
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

      return { oldWeekId };
    });

    await t.mutation(
      internal.subscriptions.enforcement.flipDayLocksAtCutoff.flipDayLocksAtCutoff,
      { now },
    );

    // Out-of-window: the old past-cutoff day stays unlocked because the index range
    // never fetched its week.
    const oldWeek = await t.run((ctx) => ctx.db.get(oldWeekId));
    expect(oldWeek!.plannedDays[0].locked).toBe(false);
  });
});
