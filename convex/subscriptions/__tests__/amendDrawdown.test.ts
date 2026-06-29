/**
 * Integration tests for the amend → credit draw-down model (2026-06-29).
 *
 * Behavior under test (replaces the old "amend bills a top-up invoice"):
 *   - amendConfirmedWeek bumps the amended day's ORDER (qty + totals) so the
 *     larger delivery draws DOWN the existing credit pool at delivery. It does
 *     NOT create a top-up invoice.
 *   - The mutation reports the projected end-of-week shortfall.
 *   - A day whose order is already delivered (recognized) cannot be amended.
 *   - billWeekShortfall bills the projected shortfall as ONE top-up invoice.
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { SessionId } from "convex-helpers/server/sessions";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

type TestT = ReturnType<typeof convexTest>;

const PRICE = 29_000;
const WEEK_START = Date.UTC(2026, 5, 16); // Monday 2026-06-16 UTC
const TUE = WEEK_START + 86_400_000;

async function createSession(t: TestT): Promise<{ sessionId: SessionId; userId: Id<"users"> }> {
  const token = `manager-token-${Date.now()}-${Math.random()}` as SessionId;
  const userId = await t.run(async (ctx) => {
    const uid = await ctx.db.insert("users", {
      name: "Test Manager",
      pinHash: "salt:hash",
      role: "manager",
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

/**
 * Confirmed + funded week: one Tuesday order of 150 units, pool funded with the
 * weekly total (4,350,000) via a `topup` ledger entry. Mirrors the post-payment
 * state right before a mid-week amendment.
 */
async function seedConfirmedFundedWeek(t: TestT) {
  const { sessionId, userId } = await createSession(t);
  const ids = await t.run(async (ctx) => {
    const customerId = await ctx.db.insert("customers", {
      name: "Cafe Frollie",
      phone: "+6281234567890",
      createdBy: "test",
    } as never);
    const menuProductId = await ctx.db.insert("menuProducts", {
      code: "ORI-80",
      name: "Original 80g",
      grams: 80,
      defaultPrice: 35000,
      isActive: true,
      unitCost: 0,
      cachedProductionSummary: "1 Big",
    } as never);
    const bankAccountId = await ctx.db.insert("bankAccounts", {
      name: "BCA Frollie",
      bankName: "BCA",
      accountNumber: "6044830994",
      isActive: true,
      createdBy: userId,
      createdAt: Date.now(),
    } as never);
    await ctx.db.insert("businessSettings", {
      businessName: "PT Frollie",
      defaultBankAccountId: bankAccountId,
      updatedBy: userId,
      updatedAt: Date.now(),
    } as never);
    const subscriptionId = await ctx.db.insert("subscriptions", {
      customerId,
      label: "Weekly",
      status: "active",
      billingModel: "prepaid_weekly_credit",
      unitPrice: PRICE,
      confidentialPrice: true,
      baselineDailyQty: 150,
      weeklyQty: 750,
      deliverByTime: "09:00",
      creditRolloverPolicy: "expire",
      changeCutoffHour: 13,
      changeCutoffDayOffset: -1,
      permanentChangeNoticeDays: 14,
      terminationNoticeDays: 30,
      cogsBasis: 18000,
      startDate: WEEK_START,
      scheduleTemplate: [{ dayOfWeek: 2, items: [{ menuProductId, qty: 150 }] }],
      createdBy: userId,
    } as never);
    const subscriptionWeekId = await ctx.db.insert("subscriptionWeeks", {
      subscriptionId,
      weekStart: WEEK_START,
      weekEnd: WEEK_START + 7 * 86400000 - 1,
      status: "paid",
      plannedDays: [
        {
          date: TUE,
          deliverByTime: "09:00",
          items: [{ menuProductId, productName: "Original 80g", qty: 150, unitPrice: PRICE, lineTotal: 150 * PRICE }],
          locked: true,
        },
      ],
      creditIssued: 150 * PRICE,
      creditConsumed: 0,
      creditRemaining: 150 * PRICE,
      creditExpired: 0,
      shortfall: 0,
      shortfallFault: "none",
      refundDue: 0,
    } as never);
    // Funded pool: weekly invoice paid → topup ledger entry.
    await ctx.db.insert("creditLedger", {
      subscriptionId,
      subscriptionWeekId,
      type: "topup",
      amount: 150 * PRICE,
      balanceAfter: 150 * PRICE,
      createdBy: userId,
    } as never);
    // The Tuesday order created at confirmWeek.
    const orderId = await ctx.db.insert("orders", {
      orderNumber: "0616-001",
      customerId,
      customerName: "Cafe Frollie",
      customerPhone: "+6281234567890",
      status: "AwaitingPayment",
      paymentStatus: "Unpaid",
      orderDate: Date.now(),
      dueDate: TUE,
      deliveryDate: TUE,
      totalAmount: 150 * PRICE,
      totalCost: 0,
      totalMargin: 150 * PRICE,
      finalTotal: 150 * PRICE,
      deliveryType: "Delivery",
      itemCount: 1,
      createdBy: "Test Manager",
      isKitchenVisible: true,
      createdByUserId: userId,
      subscriptionId,
      subscriptionWeekId,
      fundingSource: "subscription_credit",
    } as never);
    await ctx.db.insert("orderItems", {
      orderId,
      productName: "Original 80g",
      quantity: 150,
      unitPrice: PRICE,
      unitCost: 0,
      discountAmount: 0,
      lineTotal: 150 * PRICE,
      lineCost: 0,
      lineMargin: 150 * PRICE,
      menuProductId,
    } as never);
    return { customerId, menuProductId, subscriptionId, subscriptionWeekId, orderId };
  });
  return { sessionId, userId, ...ids };
}

async function topupInvoiceCount(t: TestT, weekId: Id<"subscriptionWeeks">): Promise<number> {
  return await t.run(async (ctx) => {
    const invs = await ctx.db.query("invoices").collect();
    return invs.filter(
      (i) => i.subscriptionWeekId === weekId && i.invoiceKind === "subscription_topup",
    ).length;
  });
}

describe("amendConfirmedWeek — draws down credit, no top-up invoice", () => {
  it("bumps the day's order and reports the projected shortfall — no invoice created", async () => {
    const t = convexTest(schema);
    const f = await seedConfirmedFundedWeek(t);

    const res = await t.mutation(api.subscriptions.amend.amendConfirmedWeek, {
      sessionId: f.sessionId,
      subscriptionWeekId: f.subscriptionWeekId,
      days: [{ date: TUE, items: [{ menuProductId: f.menuProductId, qty: 250 }] }],
    });

    // +100 units @ 29k = 2.9M
    expect(res.deltaTotal).toBe(100 * PRICE);
    // Funded 150*29k, plan now 250*29k → shortfall = 100*29k
    expect(res.projectedShortfall).toBe(100 * PRICE);
    expect(res.projectedEndingPool).toBe(-(100 * PRICE));

    // NO top-up invoice was created (the whole point).
    expect(await topupInvoiceCount(t, f.subscriptionWeekId)).toBe(0);

    // The day's order was bumped so the larger delivery draws down the pool.
    const order = await t.run(async (ctx) => ctx.db.get(f.orderId));
    expect(order!.totalAmount).toBe(250 * PRICE);
    expect(order!.finalTotal).toBe(250 * PRICE);

    const items = await t.run(async (ctx) =>
      ctx.db.query("orderItems").withIndex("by_order", (q) => q.eq("orderId", f.orderId)).collect(),
    );
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(250);
    expect(items[0].lineTotal).toBe(250 * PRICE);

    // plannedDays reflects the amended qty.
    const week = await t.run(async (ctx) => ctx.db.get(f.subscriptionWeekId));
    expect(week!.plannedDays[0].items[0].qty).toBe(250);
  });

  it("blocks amending a day whose order is already delivered/recognized", async () => {
    const t = convexTest(schema);
    const f = await seedConfirmedFundedWeek(t);

    // Simulate the day already delivered: a drawdown ledger entry keyed on the order.
    await t.run(async (ctx) => {
      await ctx.db.insert("creditLedger", {
        subscriptionId: f.subscriptionId,
        subscriptionWeekId: f.subscriptionWeekId,
        type: "drawdown",
        amount: -(150 * PRICE),
        balanceAfter: 0,
        createdBy: f.userId,
        orderId: f.orderId,
      } as never);
    });

    await expect(
      t.mutation(api.subscriptions.amend.amendConfirmedWeek, {
        sessionId: f.sessionId,
        subscriptionWeekId: f.subscriptionWeekId,
        days: [{ date: TUE, items: [{ menuProductId: f.menuProductId, qty: 250 }] }],
      }),
    ).rejects.toThrow(/already been delivered/);
  });
});

describe("billWeekShortfall — bills the projected shortfall as one top-up", () => {
  it("creates a single top-up invoice for the shortfall after an amendment", async () => {
    const t = convexTest(schema);
    const f = await seedConfirmedFundedWeek(t);

    await t.mutation(api.subscriptions.amend.amendConfirmedWeek, {
      sessionId: f.sessionId,
      subscriptionWeekId: f.subscriptionWeekId,
      days: [{ date: TUE, items: [{ menuProductId: f.menuProductId, qty: 250 }] }],
    });

    const res = await t.mutation(api.subscriptions.invoicing.billWeekShortfall, {
      sessionId: f.sessionId,
      subscriptionWeekId: f.subscriptionWeekId,
    });

    expect(res.projectedShortfall).toBe(100 * PRICE);
    const invoice = await t.run(async (ctx) => ctx.db.get(res.invoiceId));
    expect(invoice!.invoiceKind).toBe("subscription_topup");
    expect(invoice!.finalTotal).toBe(100 * PRICE);
    expect(await topupInvoiceCount(t, f.subscriptionWeekId)).toBe(1);
  });

  it("throws when there is no shortfall to bill", async () => {
    const t = convexTest(schema);
    const f = await seedConfirmedFundedWeek(t);

    await expect(
      t.mutation(api.subscriptions.invoicing.billWeekShortfall, {
        sessionId: f.sessionId,
        subscriptionWeekId: f.subscriptionWeekId,
      }),
    ).rejects.toThrow(/no projected credit shortfall/);
  });
});
