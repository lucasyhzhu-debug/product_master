/**
 * Tests for convex/crm/drawdown.ts — T25 getCustomerDrawdown.
 *
 * Auth pattern: insert user + session via t.run(), pass sessionId to protectedQuery.
 * Follows the pattern in convex/crm/__tests__/timeline.test.ts.
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import type { SessionId } from "convex-helpers/server/sessions";
import { anyApi } from "convex/server";
import schema from "../../schema";
import type { Id } from "../../_generated/dataModel";

const getCustomerDrawdownRef = anyApi.crm.drawdown.getCustomerDrawdown;

const modules = import.meta.glob("/convex/**/*.ts");

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

type TestT = ReturnType<typeof convexTest>;

async function createSession(
  t: TestT,
  role: "admin" | "manager" | "order_staff",
  name: string,
): Promise<{ sessionId: SessionId; userId: Id<"users"> }> {
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
      expiresAt: Date.now() + 8 * 3600 * 1000,
      createdAt: Date.now(),
    } as never);
    return uid as Id<"users">;
  });
  return { sessionId: token, userId };
}

// ---------------------------------------------------------------------------
// T25 — getCustomerDrawdown
// ---------------------------------------------------------------------------

describe("getCustomerDrawdown", () => {
  it("returns series with correct delivered/planned partition and leftoverFlag", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "manager", "Mgr Drawdown");

    const NOW = Date.now();
    // All planned days in the past so isPast=true for all points.
    const MON = NOW - 7 * 86_400_000;
    const TUE = MON + 86_400_000;
    const WED = MON + 2 * 86_400_000;
    const WEEK_START = MON;
    const WEEK_END = MON + 7 * 86_400_000;

    // Seed: customer → subscription → menuProduct → week + orders + orderItems.
    const { subscriptionId, weekId, ordMonId, ordTueId } = await t.run(
      async (ctx) => {
        const customerId = await ctx.db.insert("customers", {
          name: "Cafe Drawdown",
          createdBy: "test",
        } as never);

        const menuProductId = await ctx.db.insert("menuProducts", {
          code: "ORIG",
          name: "Original",
          grams: 80,
          defaultPrice: 29000,
          isActive: true,
          unitCost: 0,
          cachedProductionSummary: "",
        } as never);

        const subscriptionId = await ctx.db.insert("subscriptions", {
          customerId,
          label: "Test Sub",
          status: "active",
          billingModel: "prepaid_weekly_credit",
          unitPrice: 29000,
          confidentialPrice: false,
          baselineDailyQty: 10,
          weeklyQty: 70,
          deliverByTime: "09:00",
          creditRolloverPolicy: "expire",
          changeCutoffHour: 13,
          changeCutoffDayOffset: -1,
          permanentChangeNoticeDays: 14,
          terminationNoticeDays: 30,
          cogsBasis: 0,
          startDate: NOW - 30 * 86_400_000,
          scheduleTemplate: [],
          createdBy: userId,
        } as never);

        // Week with 3 planned days (Mon, Tue, Wed), 10 pcs each.
        const weekId = await ctx.db.insert("subscriptionWeeks", {
          subscriptionId,
          weekStart: WEEK_START,
          weekEnd: WEEK_END,
          status: "delivering",
          plannedDays: [
            {
              date: MON,
              deliverByTime: "09:00",
              items: [
                {
                  menuProductId,
                  productName: "Original",
                  qty: 10,
                  unitPrice: 29000,
                  lineTotal: 290000,
                },
              ],
              locked: true,
            },
            {
              date: TUE,
              deliverByTime: "09:00",
              items: [
                {
                  menuProductId,
                  productName: "Original",
                  qty: 10,
                  unitPrice: 29000,
                  lineTotal: 290000,
                },
              ],
              locked: true,
            },
            {
              date: WED,
              deliverByTime: "09:00",
              items: [
                {
                  menuProductId,
                  productName: "Original",
                  qty: 10,
                  unitPrice: 29000,
                  lineTotal: 290000,
                },
              ],
              locked: true,
            },
          ],
          creditIssued: 500000,
          creditConsumed: 160000,
          creditRemaining: 340000,
          creditExpired: 0,
          shortfall: 0,
          shortfallFault: "none",
          refundDue: 0,
        } as never);

        // Monday order — 5 pcs delivered.
        const ordMonId = await ctx.db.insert("orders", {
          orderNumber: "0625-MON",
          customerId,
          customerName: "Cafe Drawdown",
          status: "Complete",
          paymentStatus: "Paid",
          orderDate: MON,
          deliveryDate: MON,
          totalAmount: 145000,
          totalCost: 0,
          totalMargin: 145000,
          finalTotal: 145000,
          itemCount: 1,
          deliveryType: "Delivery",
          createdBy: "test",
          subscriptionId,
          subscriptionWeekId: weekId,
        } as never);
        await ctx.db.insert("orderItems", {
          orderId: ordMonId,
          productName: "Original",
          quantity: 5,
          unitPrice: 29000,
          unitCost: 0,
          discountAmount: 0,
          lineTotal: 145000,
          lineCost: 0,
          lineMargin: 145000,
        } as never);

        // Tuesday order — 3 pcs delivered.
        const ordTueId = await ctx.db.insert("orders", {
          orderNumber: "0625-TUE",
          customerId,
          customerName: "Cafe Drawdown",
          status: "Complete",
          paymentStatus: "Paid",
          orderDate: TUE,
          deliveryDate: TUE,
          totalAmount: 87000,
          totalCost: 0,
          totalMargin: 87000,
          finalTotal: 87000,
          itemCount: 1,
          deliveryType: "Delivery",
          createdBy: "test",
          subscriptionId,
          subscriptionWeekId: weekId,
        } as never);
        await ctx.db.insert("orderItems", {
          orderId: ordTueId,
          productName: "Original",
          quantity: 3,
          unitPrice: 29000,
          unitCost: 0,
          discountAmount: 0,
          lineTotal: 87000,
          lineCost: 0,
          lineMargin: 87000,
        } as never);

        return { subscriptionId, weekId, ordMonId, ordTueId };
      },
    );

    // Insert ledger entries in separate t.run() calls to guarantee _creationTime order.
    // Topup must precede drawdowns so dayBalances[Mon] ends at 400000, not 500000.
    await t.run(async (ctx) => {
      await ctx.db.insert("creditLedger", {
        subscriptionId,
        subscriptionWeekId: weekId,
        type: "topup",
        amount: 500000,
        balanceAfter: 500000,
        createdBy: userId,
      } as never);
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("creditLedger", {
        subscriptionId,
        subscriptionWeekId: weekId,
        type: "drawdown",
        amount: -100000,
        balanceAfter: 400000,
        orderId: ordMonId,
        createdBy: userId,
      } as never);
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("creditLedger", {
        subscriptionId,
        subscriptionWeekId: weekId,
        type: "drawdown",
        amount: -60000,
        balanceAfter: 340000,
        orderId: ordTueId,
        createdBy: userId,
      } as never);
    });

    const result = await t.query(getCustomerDrawdownRef, {
      sessionId,
      subscriptionId,
    });

    expect(result).not.toBeNull();
    expect(result!.week._id).toBe(weekId);

    // 3 planned days → 3 series points.
    const { points, leftoverFlag } = result!.series;
    expect(points.length).toBe(3);

    // Sort ascending by date for deterministic assertion order.
    const sorted = [...points].sort((a, b) => a.date - b.date);
    const [monPt, tuePt, wedPt] = sorted;

    // Monday: 5 delivered, 10 planned, in past, credit reduced to 400000 after drawdown.
    expect(monPt.deliveredPcs).toBe(5);
    expect(monPt.plannedPcs).toBe(10);
    expect(monPt.isPast).toBe(true);
    expect(monPt.creditRemaining).toBe(400000);

    // Tuesday: 3 delivered, credit reduced to 340000.
    expect(tuePt.deliveredPcs).toBe(3);
    expect(tuePt.plannedPcs).toBe(10);
    expect(tuePt.isPast).toBe(true);
    expect(tuePt.creditRemaining).toBe(340000);

    // Wednesday: no order, creditRemaining carries forward from Tuesday.
    expect(wedPt.deliveredPcs).toBe(0);
    expect(wedPt.plannedPcs).toBe(10);
    expect(wedPt.isPast).toBe(true);
    expect(wedPt.creditRemaining).toBe(340000);

    // leftoverFlag fires because last point has creditRemaining > 0.
    expect(leftoverFlag).toBe(true);
  });

  it("explicit weekStart arg resolves the specified week (not the current)", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "admin", "Admin WeekArg");

    const NOW = Date.now();
    const WEEK2_START = NOW - 7 * 86_400_000;

    const { subscriptionId, week2Id } = await t.run(async (ctx) => {
      const customerId = await ctx.db.insert("customers", {
        name: "Cafe WeekArg",
        createdBy: "test",
      } as never);
      const subscriptionId = await ctx.db.insert("subscriptions", {
        customerId,
        label: "Sub WeekArg",
        status: "active",
        billingModel: "prepaid_weekly_credit",
        unitPrice: 29000,
        confidentialPrice: false,
        baselineDailyQty: 10,
        weeklyQty: 70,
        deliverByTime: "09:00",
        creditRolloverPolicy: "expire",
        changeCutoffHour: 13,
        changeCutoffDayOffset: -1,
        permanentChangeNoticeDays: 14,
        terminationNoticeDays: 30,
        cogsBasis: 0,
        startDate: NOW - 30 * 86_400_000,
        scheduleTemplate: [],
        createdBy: userId,
      } as never);

      // Two weeks — the older one has a higher weekStart in the current-week search,
      // but we explicitly request week2 by its weekStart.
      await ctx.db.insert("subscriptionWeeks", {
        subscriptionId,
        weekStart: NOW - 14 * 86_400_000,
        weekEnd: NOW - 7 * 86_400_000,
        status: "reconciled",
        plannedDays: [],
        creditIssued: 0,
        creditConsumed: 0,
        creditRemaining: 0,
        creditExpired: 0,
        shortfall: 0,
        shortfallFault: "none",
        refundDue: 0,
      } as never);

      const week2Id = await ctx.db.insert("subscriptionWeeks", {
        subscriptionId,
        weekStart: WEEK2_START,
        weekEnd: NOW,
        status: "delivering",
        plannedDays: [],
        creditIssued: 100000,
        creditConsumed: 0,
        creditRemaining: 100000,
        creditExpired: 0,
        shortfall: 0,
        shortfallFault: "none",
        refundDue: 0,
      } as never);

      return { subscriptionId, week2Id };
    });

    const result = await t.query(getCustomerDrawdownRef, {
      sessionId,
      subscriptionId,
      weekStart: WEEK2_START,
    });

    expect(result).not.toBeNull();
    expect(result!.week._id).toBe(week2Id);
    expect(result!.week.weekStart).toBe(WEEK2_START);
    // No planned days → empty points, no leftover.
    expect(result!.series.points).toHaveLength(0);
    expect(result!.series.leftoverFlag).toBe(false);
  });

  it("returns null when no subscriptionWeek exists for the subscription", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "manager", "Mgr Null");

    const subscriptionId = await t.run(async (ctx) => {
      const customerId = await ctx.db.insert("customers", {
        name: "Cafe Null",
        createdBy: "test",
      } as never);
      return ctx.db.insert("subscriptions", {
        customerId,
        label: "Sub Null",
        status: "active",
        billingModel: "prepaid_weekly_credit",
        unitPrice: 29000,
        confidentialPrice: false,
        baselineDailyQty: 10,
        weeklyQty: 70,
        deliverByTime: "09:00",
        creditRolloverPolicy: "expire",
        changeCutoffHour: 13,
        changeCutoffDayOffset: -1,
        permanentChangeNoticeDays: 14,
        terminationNoticeDays: 30,
        cogsBasis: 0,
        startDate: Date.now(),
        scheduleTemplate: [],
        createdBy: userId,
      } as never);
    });

    // No subscriptionWeeks rows → resolveCurrentWeek returns null.
    const result = await t.query(getCustomerDrawdownRef, {
      sessionId,
      subscriptionId,
    });

    expect(result).toBeNull();
  });

  it("order_staff token → Unauthorized", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await createSession(t, "manager", "Mgr Auth");
    const { sessionId: staffSession } = await createSession(t, "order_staff", "Staff Auth");

    const subscriptionId = await t.run(async (ctx) => {
      const customerId = await ctx.db.insert("customers", {
        name: "Cafe Auth",
        createdBy: "test",
      } as never);
      return ctx.db.insert("subscriptions", {
        customerId,
        label: "Sub Auth",
        status: "active",
        billingModel: "prepaid_weekly_credit",
        unitPrice: 29000,
        confidentialPrice: false,
        baselineDailyQty: 10,
        weeklyQty: 70,
        deliverByTime: "09:00",
        creditRolloverPolicy: "expire",
        changeCutoffHour: 13,
        changeCutoffDayOffset: -1,
        permanentChangeNoticeDays: 14,
        terminationNoticeDays: 30,
        cogsBasis: 0,
        startDate: Date.now(),
        scheduleTemplate: [],
        createdBy: userId,
      } as never);
    });

    await expect(
      t.query(getCustomerDrawdownRef, { sessionId: staffSession, subscriptionId }),
    ).rejects.toThrow(/Unauthorized/);
  });
});
