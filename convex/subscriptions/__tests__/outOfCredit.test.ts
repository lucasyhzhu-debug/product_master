import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import type { SessionId } from "convex-helpers/server/sessions";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { coveredQty, remainderQty } from "../outOfCredit";

describe("coveredQty — floor division, integer IDR", () => {
  it("covers the full qty when credit is exactly enough", () => {
    expect(coveredQty(30_000, 10_000)).toBe(3);
  });

  it("floors when credit doesn't cover the last unit", () => {
    // 25_000 IDR / 10_000 = 2.5 → floor = 2
    expect(coveredQty(25_000, 10_000)).toBe(2);
  });

  it("returns 0 when credit is less than one unit", () => {
    expect(coveredQty(5_000, 10_000)).toBe(0);
  });

  it("returns 0 when credit is 0", () => {
    expect(coveredQty(0, 10_000)).toBe(0);
  });

  it("returns 0 when unitPrice is 0 (guard, no division by zero)", () => {
    expect(coveredQty(100_000, 0)).toBe(0);
  });

  it("returns 0 when unitPrice is negative (guard)", () => {
    expect(coveredQty(100_000, -1)).toBe(0);
  });
});

describe("remainderQty", () => {
  it("returns zero when fully covered", () => {
    expect(remainderQty(3, 3)).toBe(0);
  });

  it("returns the uncovered qty", () => {
    expect(remainderQty(5, 2)).toBe(3);
  });

  it("returns the full qty when covered is 0", () => {
    expect(remainderQty(4, 0)).toBe(4);
  });
});

describe("Path A split math end-to-end (pure)", () => {
  it("partial coverage: covered * unitPrice never exceeds remainingCredit", () => {
    const remaining = 25_000;
    const unitPrice = 10_000;
    const totalQty = 5;

    const covered = coveredQty(remaining, unitPrice);
    const coveredLineTotal = covered * unitPrice;

    expect(covered).toBe(2);
    expect(coveredLineTotal).toBe(20_000);
    expect(coveredLineTotal).toBeLessThanOrEqual(remaining);
    expect(remainderQty(totalQty, covered)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// T4 — Integration tests: Path B reservation model + canApplyCredit guard
// ---------------------------------------------------------------------------

// Explicit modules glob from the worktree so convex-test loads the worktree's
// implementations (the default glob in convex-test resolves relative to
// node_modules which is symlinked to the main tree — see worktree docs).
const modules = import.meta.glob("/convex/**/*.ts");

type TestT = ReturnType<typeof convexTest>;

/** Create a manager session and return its token + userId. */
async function createManagerSession(t: TestT): Promise<{ sessionId: SessionId; userId: Id<"users"> }> {
  const token = `manager-token-t4-${Date.now()}-${Math.random()}` as SessionId;
  const userId = await t.run(async (ctx) => {
    const uid = await ctx.db.insert("users", {
      name: "Test Manager T4",
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
 * Seeds an ad-hoc subscription order at AwaitingPayment with the given
 * finalTotal, and a funded week whose creditRemaining matches.
 * Returns orderId + weekId (subscriptionWeekId).
 */
async function seedAwaitingPaymentSubOrder(
  t: TestT,
  opts: { finalTotal: number; creditRemaining: number },
): Promise<{ orderId: Id<"orders">; weekId: Id<"subscriptionWeeks">; sessionId: SessionId }> {
  const { sessionId, userId } = await createManagerSession(t);
  const ids = await t.run(async (ctx) => {
    const customerId = await ctx.db.insert("customers", {
      name: "Sub Cafe T4",
      phone: "+628111222333",
      createdBy: "test",
    } as never);
    const subscriptionId = await ctx.db.insert("subscriptions", {
      customerId,
      label: "Weekly T4",
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
      cogsBasis: 15000,
      startDate: Date.now(),
      scheduleTemplate: [],
      createdBy: userId,
    } as never);
    const weekId = await ctx.db.insert("subscriptionWeeks", {
      subscriptionId,
      weekStart: Date.now(),
      weekEnd: Date.now() + 7 * 86400000,
      status: "paid",
      plannedDays: [],
      creditIssued: opts.creditRemaining,
      creditConsumed: 0,
      creditRemaining: opts.creditRemaining,
      creditExpired: 0,
      shortfall: 0,
      shortfallFault: "none",
      refundDue: 0,
    } as never);
    // Fund the pool: topup ledger entry so creditRemaining is grounded.
    await ctx.db.insert("creditLedger", {
      subscriptionId,
      subscriptionWeekId: weekId,
      type: "topup",
      amount: opts.creditRemaining,
      balanceAfter: opts.creditRemaining,
      createdBy: userId,
    } as never);
    const orderId = await ctx.db.insert("orders", {
      orderNumber: "0629-T4A",
      customerId,
      customerName: "Sub Cafe T4",
      customerPhone: "+628111222333",
      status: "AwaitingPayment",
      paymentStatus: "Unpaid",
      orderDate: Date.now(),
      totalAmount: opts.finalTotal,
      totalCost: 0,
      totalMargin: opts.finalTotal,
      finalTotal: opts.finalTotal,
      deliveryType: "Delivery",
      createdBy: "Test Manager T4",
      createdByUserId: userId,
      itemCount: 1,
      isKitchenVisible: false,
      subscriptionId,
      subscriptionWeekId: weekId,
    } as never);
    return { orderId: orderId as Id<"orders">, weekId: weekId as Id<"subscriptionWeeks"> };
  });
  return { ...ids, sessionId };
}

/**
 * Seeds an ad-hoc subscription order that already has subscriptionCreditApplied set
 * (i.e. the reservation already happened). Status stays AwaitingPayment.
 */
async function seedReservedSubOrder(
  t: TestT,
  opts: { subscriptionCreditApplied: number },
): Promise<{ orderId: Id<"orders">; sessionId: SessionId }> {
  const { sessionId, userId } = await createManagerSession(t);
  const orderId = await t.run(async (ctx) => {
    const customerId = await ctx.db.insert("customers", {
      name: "Sub Cafe T4B",
      phone: "+628111222444",
      createdBy: "test",
    } as never);
    const subscriptionId = await ctx.db.insert("subscriptions", {
      customerId,
      label: "Weekly T4B",
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
      cogsBasis: 15000,
      startDate: Date.now(),
      scheduleTemplate: [],
      createdBy: userId,
    } as never);
    const weekId = await ctx.db.insert("subscriptionWeeks", {
      subscriptionId,
      weekStart: Date.now(),
      weekEnd: Date.now() + 7 * 86400000,
      status: "paid",
      plannedDays: [],
      creditIssued: 50000,
      creditConsumed: 0,
      creditRemaining: 20000, // some credit still "remaining" but reservation took 30k
      creditExpired: 0,
      shortfall: 0,
      shortfallFault: "none",
      refundDue: 0,
    } as never);
    const oid = await ctx.db.insert("orders", {
      orderNumber: "0629-T4B",
      customerId,
      customerName: "Sub Cafe T4B",
      customerPhone: "+628111222444",
      status: "AwaitingPayment",
      paymentStatus: "Unpaid",
      orderDate: Date.now(),
      totalAmount: 30000,
      totalCost: 0,
      totalMargin: 30000,
      finalTotal: 30000,
      deliveryType: "Delivery",
      createdBy: "Test Manager T4B",
      createdByUserId: userId,
      itemCount: 1,
      isKitchenVisible: false,
      subscriptionId,
      subscriptionWeekId: weekId,
      fundingSource: "deposit",
      subscriptionCreditApplied: opts.subscriptionCreditApplied,
    } as never);
    return oid as Id<"orders">;
  });
  return { orderId, sessionId };
}

describe("Path B — applyPartialCreditToAdHocOrder (reservation model)", () => {
  it("reserves credit (sets subscriptionCreditApplied + fundingSource=deposit) with NO eager ledger entry", async () => {
    const t = convexTest(schema, modules);
    const { orderId, weekId: _weekId, sessionId } = await seedAwaitingPaymentSubOrder(t, {
      finalTotal: 30000,
      creditRemaining: 50000,
    });

    const result = await t.mutation(api.subscriptions.outOfCredit.applyPartialCreditToAdHocOrder, {
      orderId,
      sessionId,
    });

    expect(result.coveredAmount).toBe(30000); // full order covered (30k < 50k pool)
    expect(result.remainderAmount).toBe(0);

    const order = await t.run((ctx) => ctx.db.get(orderId));
    expect(order!.subscriptionCreditApplied).toBe(30000); // reserved
    expect(order!.fundingSource).toBe("deposit");

    // NO eager drawdown — recognition posts the drawdown at delivery (D5/IMP-4).
    const ledger = await t.run((ctx) =>
      ctx.db.query("creditLedger").withIndex("by_order", (q) => q.eq("orderId", orderId)).collect(),
    );
    expect(ledger).toHaveLength(0);
  });

  it("getOrderCreditStatus.canApplyCredit is false once the order has a reservation", async () => {
    const t = convexTest(schema, modules);
    const { orderId, sessionId } = await seedReservedSubOrder(t, { subscriptionCreditApplied: 30000 });

    const status = await t.query(api.subscriptions.queries.getOrderCreditStatus, {
      orderId,
      sessionId,
    });

    expect(status.canApplyCredit).toBe(false);
  });
});
