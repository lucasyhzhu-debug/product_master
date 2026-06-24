/**
 * Task B9b — B2B Wholesale revenue source in the income statement (C1).
 *
 * A recognized subscription delivery is recorded as a creditLedger `drawdown` row
 * (amount negative = -order.totalAmount) carrying orderId; the order's customer has
 * customerType === "b2b_wholesale". This proves:
 *   1. That recognized revenue (Math.abs(amount)) appears in the gross-revenue TOTAL
 *      under a distinct "B2B Wholesale" source.
 *   2. It is attributed to the period by the order's deliveryDate.
 *   3. It does NOT appear in any per-channel externalRevenue bucket (C1) — there is
 *      no externalRevenue row, so no "internal"/retail channel is produced for it.
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

type TestT = ReturnType<typeof convexTest>;

async function seedUser(t: TestT): Promise<Id<"users">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      name: "Tester",
      pinHash: "salt:hash",
      role: "admin",
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    } as never),
  );
}

async function seedCustomer(
  t: TestT,
  customerType: "direct_b2c" | "b2b_wholesale" | undefined,
): Promise<Id<"customers">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("customers", {
      name: "Cafe Co",
      createdBy: "tester",
      ...(customerType ? { customerType } : {}),
    } as never),
  );
}

async function seedDeliveredSubscriptionOrder(
  t: TestT,
  customerId: Id<"customers">,
  deliveryDate: number,
  totalAmount: number,
  createdBy: Id<"users">,
): Promise<{ orderId: Id<"orders">; drawdownId: Id<"creditLedger"> }> {
  return await t.run(async (ctx) => {
    // Minimal subscription + week so the creditLedger Id<"subscriptions"> / Id<"subscriptionWeeks">
    // fields validate. Only their existence matters to this report path — the B2B aggregation
    // resolves drawdown → order → customer, never reads the subscription/week docs.
    const subscriptionId = await ctx.db.insert("subscriptions", {
      customerId,
      label: "Cafe Co Weekly",
      status: "active",
      billingModel: "prepaid_weekly_credit",
      unitPrice: 0,
      confidentialPrice: true,
      baselineDailyQty: 0,
      weeklyQty: 0,
      deliverByTime: "09:00",
      creditRolloverPolicy: "expire",
      changeCutoffHour: 13,
      changeCutoffDayOffset: -1,
      permanentChangeNoticeDays: 14,
      terminationNoticeDays: 30,
      cogsBasis: 0,
      startDate: deliveryDate,
      scheduleTemplate: [],
      createdBy,
    } as never);
    const subscriptionWeekId = await ctx.db.insert("subscriptionWeeks", {
      subscriptionId,
      weekStart: deliveryDate,
      weekEnd: deliveryDate,
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

    const orderId = await ctx.db.insert("orders", {
      orderNumber: "0101-001",
      customerId,
      customerName: "Cafe Co",
      status: "Complete",
      paymentStatus: "Paid",
      orderDate: deliveryDate,
      totalAmount,
      totalCost: 0,
      totalMargin: totalAmount,
      finalTotal: totalAmount,
      deliveryType: "Delivery",
      itemCount: 1,
      createdBy: "tester",
      createdByUserId: createdBy,
      subscriptionId,
      subscriptionWeekId,
      deliveryDate,
      fundingSource: "subscription_credit",
    } as never);

    // Drawdown: amount negative = -totalAmount (recognized revenue = abs).
    const drawdownId = await ctx.db.insert("creditLedger", {
      subscriptionId,
      subscriptionWeekId,
      type: "drawdown",
      amount: -totalAmount,
      balanceAfter: 0,
      orderId,
      createdBy,
      note: "Sale recognized on delivery 0101-001",
    } as never);

    return { orderId, drawdownId };
  });
}

function findChannel(stmt: any, source: string) {
  const channels = stmt?.current?.channels ?? [];
  return Array.isArray(channels)
    ? channels.find((c: any) => c.source === source)
    : null;
}

describe("incomeStatement — B2B Wholesale revenue source (Task B9b / C1)", () => {
  it("recognized B2B drawdown contributes to gross total under a distinct B2B Wholesale source", async () => {
    const t = convexTest(schema);
    const user = await seedUser(t);
    const customer = await seedCustomer(t, "b2b_wholesale");

    const deliveryDate = Date.now() - 3 * 24 * 60 * 60 * 1000;
    await seedDeliveredSubscriptionOrder(t, customer, deliveryDate, 250_000, user);

    const stmt = await t.query(api.reports.incomeStatement.getIncomeStatement, {
      periodStart: deliveryDate - 60 * 60 * 1000,
      periodEnd: deliveryDate + 60 * 60 * 1000,
    });

    const b2b = findChannel(stmt, "b2b_wholesale");
    expect(b2b).toBeDefined();
    expect(b2b.displayName).toBe("B2B Wholesale");
    expect(b2b.gross).toBe(250_000);
    expect(b2b.netRevenue).toBe(250_000);
    expect(b2b.transactions).toBe(1);

    // It feeds the gross-revenue TOTAL.
    expect(stmt.current.totalGross).toBe(250_000);
    expect(stmt.current.netRevenue).toBe(250_000);

    // C1: NOT present in any per-channel externalRevenue bucket.
    expect(findChannel(stmt, "internal")).toBeUndefined();
    expect(findChannel(stmt, "shopee")).toBeUndefined();
    expect(findChannel(stmt, "consignment")).toBeUndefined();
  });

  it("is attributed to the period by the order's deliveryDate (excluded when out of window)", async () => {
    const t = convexTest(schema);
    const user = await seedUser(t);
    const customer = await seedCustomer(t, "b2b_wholesale");

    const deliveryDate = Date.now() - 30 * 24 * 60 * 60 * 1000;
    await seedDeliveredSubscriptionOrder(t, customer, deliveryDate, 100_000, user);

    // Query a window AFTER the delivery — drawdown must not fall in it.
    const stmt = await t.query(api.reports.incomeStatement.getIncomeStatement, {
      periodStart: deliveryDate + 7 * 24 * 60 * 60 * 1000,
      periodEnd: deliveryDate + 14 * 24 * 60 * 60 * 1000,
    });

    expect(findChannel(stmt, "b2b_wholesale")).toBeUndefined();
    expect(stmt.current.totalGross).toBe(0);
  });

  it("non-b2b_wholesale customers do NOT produce a B2B Wholesale line", async () => {
    const t = convexTest(schema);
    const user = await seedUser(t);
    const customer = await seedCustomer(t, "direct_b2c");

    const deliveryDate = Date.now() - 2 * 24 * 60 * 60 * 1000;
    await seedDeliveredSubscriptionOrder(t, customer, deliveryDate, 80_000, user);

    const stmt = await t.query(api.reports.incomeStatement.getIncomeStatement, {
      periodStart: deliveryDate - 60 * 60 * 1000,
      periodEnd: deliveryDate + 60 * 60 * 1000,
    });

    expect(findChannel(stmt, "b2b_wholesale")).toBeUndefined();
    expect(stmt.current.totalGross).toBe(0);
  });
});
