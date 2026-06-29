/**
 * resyncWeekPlanFromOrders — rebuild plannedDays from the actual orders (2026-06-29).
 *
 * Reproduces the live drift: the schedule shows 250 on Monday while the real,
 * delivered order is 150. Resync must snap plannedDays back to 150 WITHOUT touching
 * the order or any credit ledger entry.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { SessionId } from "convex-helpers/server/sessions";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

type TestT = ReturnType<typeof convexTest>;
const PRICE = 29_000;
const WEEK_START = Date.UTC(2026, 5, 16);
const MON = WEEK_START;

async function createSession(
  t: TestT,
  role: "manager" | "order_staff" | "kitchen" = "manager",
): Promise<{ sessionId: SessionId; userId: Id<"users"> }> {
  const token = `${role}-token-${Date.now()}-${Math.random()}` as SessionId;
  const userId = await t.run(async (ctx) => {
    const uid = await ctx.db.insert("users", {
      name: `Test ${role}`, pinHash: "salt:hash", role, isActive: true,
      failedAttempts: 0, createdAt: Date.now(),
    } as never);
    await ctx.db.insert("sessions", { userId: uid, token, expiresAt: Date.now() + 8 * 3600 * 1000, createdAt: Date.now() } as never);
    return uid as Id<"users">;
  });
  return { sessionId: token, userId };
}

/** Week whose plannedDays claims Monday=250, but the real delivered order is 150. */
async function seedDriftedWeek(t: TestT) {
  const { sessionId, userId } = await createSession(t);
  const ids = await t.run(async (ctx) => {
    const customerId = await ctx.db.insert("customers", { name: "Cafe", phone: "+62812", createdBy: "test" } as never);
    const menuProductId = await ctx.db.insert("menuProducts", {
      code: "ORI-80", name: "Original 80g", grams: 80, defaultPrice: 35000, isActive: true, unitCost: 0, cachedProductionSummary: "1 Big",
    } as never);
    const subscriptionId = await ctx.db.insert("subscriptions", {
      customerId, label: "Weekly", status: "active", billingModel: "prepaid_weekly_credit", unitPrice: PRICE,
      confidentialPrice: true, baselineDailyQty: 150, weeklyQty: 750, deliverByTime: "09:00", creditRolloverPolicy: "expire",
      changeCutoffHour: 13, changeCutoffDayOffset: -1, permanentChangeNoticeDays: 14, terminationNoticeDays: 30,
      cogsBasis: 18000, startDate: WEEK_START, scheduleTemplate: [], createdBy: userId,
    } as never);
    const subscriptionWeekId = await ctx.db.insert("subscriptionWeeks", {
      subscriptionId, weekStart: WEEK_START, weekEnd: WEEK_START + 7 * 86400000 - 1, status: "delivering",
      // SCHEDULE drifted to 250
      plannedDays: [{ date: MON, deliverByTime: "09:00", items: [{ menuProductId, productName: "Original 80g", qty: 250, unitPrice: PRICE, lineTotal: 250 * PRICE }], locked: true }],
      creditIssued: 150 * PRICE, creditConsumed: 0, creditRemaining: 150 * PRICE, creditExpired: 0, shortfall: 0, shortfallFault: "none", refundDue: 0,
    } as never);
    // Funded + a 150 drawdown (delivered) — the ORDER is the truth at 150.
    await ctx.db.insert("creditLedger", { subscriptionId, subscriptionWeekId, type: "topup", amount: 150 * PRICE, balanceAfter: 150 * PRICE, createdBy: userId } as never);
    const orderId = await ctx.db.insert("orders", {
      orderNumber: "0616-001", customerId, customerName: "Cafe", customerPhone: "+62812", status: "AwaitingDelivery", paymentStatus: "Unpaid",
      orderDate: Date.now(), dueDate: MON, deliveryDate: MON, totalAmount: 150 * PRICE, totalCost: 0, totalMargin: 150 * PRICE, finalTotal: 150 * PRICE,
      deliveryType: "Delivery", itemCount: 1, createdBy: "Test Manager", isKitchenVisible: true, createdByUserId: userId, subscriptionId, subscriptionWeekId, fundingSource: "subscription_credit",
    } as never);
    await ctx.db.insert("orderItems", { orderId, productName: "Original 80g", quantity: 150, unitPrice: PRICE, unitCost: 0, discountAmount: 0, lineTotal: 150 * PRICE, lineCost: 0, lineMargin: 150 * PRICE, menuProductId } as never);
    await ctx.db.insert("creditLedger", { subscriptionId, subscriptionWeekId, type: "drawdown", amount: -(150 * PRICE), balanceAfter: 0, createdBy: userId, orderId } as never);
    return { customerId, menuProductId, subscriptionId, subscriptionWeekId, orderId };
  });
  return { sessionId, userId, ...ids };
}

describe("resyncWeekPlanFromOrders", () => {
  it("snaps plannedDays back to the order's real qty (250 schedule → 150 order)", async () => {
    const t = convexTest(schema);
    const f = await seedDriftedWeek(t);

    const res = await t.mutation(api.subscriptions.resyncPlan.resyncWeekPlanFromOrders, {
      sessionId: f.sessionId,
      subscriptionWeekId: f.subscriptionWeekId,
    });

    expect(res.after).toEqual([{ date: MON, qty: 150 }]);

    const week = await t.run(async (ctx) => ctx.db.get(f.subscriptionWeekId));
    expect(week!.plannedDays).toHaveLength(1);
    expect(week!.plannedDays[0].items[0].qty).toBe(150);

    // The order and its drawdown are UNTOUCHED.
    const order = await t.run(async (ctx) => ctx.db.get(f.orderId));
    expect(order!.totalAmount).toBe(150 * PRICE);
    const ledger = await t.run(async (ctx) =>
      ctx.db.query("creditLedger").withIndex("by_order", (q) => q.eq("orderId", f.orderId)).collect(),
    );
    expect(ledger.filter((e) => e.type === "drawdown")).toHaveLength(1);
    expect(ledger.find((e) => e.type === "drawdown")!.amount).toBe(-(150 * PRICE));
  });

  it("drops a planned day that has no (non-cancelled) order", async () => {
    const t = convexTest(schema);
    const f = await seedDriftedWeek(t);
    // Cancel the only order → resync should empty the plan.
    await t.run(async (ctx) => {
      await ctx.db.patch(f.orderId, { status: "Cancelled" });
    });

    const res = await t.mutation(api.subscriptions.resyncPlan.resyncWeekPlanFromOrders, {
      sessionId: f.sessionId,
      subscriptionWeekId: f.subscriptionWeekId,
    });
    expect(res.after).toEqual([]);
    const week = await t.run(async (ctx) => ctx.db.get(f.subscriptionWeekId));
    expect(week!.plannedDays).toHaveLength(0);
  });

  it("allows order_staff to resync (Pitfall #19)", async () => {
    const t = convexTest(schema);
    // Seed using a manager to create the data, then call with order_staff session.
    const f = await seedDriftedWeek(t);
    const { sessionId: staffSession } = await createSession(t, "order_staff");

    const res = await t.mutation(api.subscriptions.resyncPlan.resyncWeekPlanFromOrders, {
      sessionId: staffSession,
      subscriptionWeekId: f.subscriptionWeekId,
    });
    expect(res.after).toEqual([{ date: MON, qty: 150 }]);
  });

  it("rejects kitchen role (unauthorized)", async () => {
    const t = convexTest(schema);
    const f = await seedDriftedWeek(t);
    const { sessionId: kitchenSession } = await createSession(t, "kitchen");

    await expect(
      t.mutation(api.subscriptions.resyncPlan.resyncWeekPlanFromOrders, {
        sessionId: kitchenSession,
        subscriptionWeekId: f.subscriptionWeekId,
      }),
    ).rejects.toThrow();
  });
});
