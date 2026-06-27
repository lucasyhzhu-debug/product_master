import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../../schema";
import { internal } from "../../../_generated/api";
import { wibMidnightToUtc } from "../../../lib/periodRange";
import type { Id } from "../../../_generated/dataModel";

const modules = import.meta.glob("/convex/**/*.ts");

describe("applyPendingBaselineChanges", () => {
  it("applies at/after effectiveDate and clears the pending field", async () => {
    const t = convexTest(schema, modules);
    const E = 2_000_000_000_000;

    const subId = await t.run(async (ctx) => {
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

      return (await ctx.db.insert("subscriptions", {
        customerId,
        label: "Test Sub",
        status: "active",
        billingModel: "prepaid_weekly_credit",
        unitPrice: 29000,
        confidentialPrice: false,
        baselineDailyQty: 8,
        weeklyQty: 40,
        deliverByTime: "09:00",
        creditRolloverPolicy: "expire",
        changeCutoffHour: 13,
        changeCutoffDayOffset: -1,
        permanentChangeNoticeDays: 14,
        terminationNoticeDays: 30,
        cogsBasis: 18000,
        startDate: wibMidnightToUtc(2026, 5, 22),
        scheduleTemplate: [{ dayOfWeek: 1, items: [{ menuProductId, qty: 8 }] }],
        createdBy: userId,
        pendingBaselineChange: { newQty: 12, effectiveDate: E },
      } as never)) as Id<"subscriptions">;
    });

    // Before effectiveDate: no change
    await t.mutation(
      internal.subscriptions.enforcement.applyPendingBaselineChanges
        .applyPendingBaselineChanges,
      { now: E - 1 },
    );
    let sub = await t.run((ctx) => ctx.db.get(subId));
    expect(sub!.baselineDailyQty).toBe(8);
    expect(sub!.pendingBaselineChange).toBeDefined();

    // At effectiveDate: apply and clear
    await t.mutation(
      internal.subscriptions.enforcement.applyPendingBaselineChanges
        .applyPendingBaselineChanges,
      { now: E },
    );
    sub = await t.run((ctx) => ctx.db.get(subId));
    expect(sub!.baselineDailyQty).toBe(12);
    expect(sub!.pendingBaselineChange).toBeUndefined();

    // Second run: idempotent
    await t.mutation(
      internal.subscriptions.enforcement.applyPendingBaselineChanges
        .applyPendingBaselineChanges,
      { now: E },
    );
    sub = await t.run((ctx) => ctx.db.get(subId));
    expect(sub!.baselineDailyQty).toBe(12);
    expect(sub!.pendingBaselineChange).toBeUndefined();
  });
});
