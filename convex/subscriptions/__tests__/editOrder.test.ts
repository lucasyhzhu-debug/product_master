/**
 * editUndeliveredSubscriptionOrder — Slice 2 MONEY-PATH orchestrator (T8).
 *
 * Staff reduce/remove pieces on a not-yet-delivered subscription order. The
 * critical invariant (Pitfall #23): reducing items must re-derive the credit
 * reservation DOWN so the pool isn't over-drawn at delivery and available credit
 * isn't under-reported meanwhile.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { SessionId } from "convex-helpers/server/sessions";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { computeWeekAvailableCredit } from "../creditReservation";

type TestT = ReturnType<typeof convexTest>;
type Role = "kitchen" | "order_staff" | "manager" | "admin";

const PRICE = 29_000;
const WEEK_START = Date.UTC(2026, 5, 16);
const MON = WEEK_START;
const WEEKLY_FUND = 750 * PRICE; // full-week topup

async function createSession(
  t: TestT,
  role: Role = "order_staff",
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

interface SeedOpts {
  role?: Role;
  orderStatus?: string;
  weekStatus?: string;
  qty?: number;
  /** subscriptionCreditApplied on the order; undefined → not credit-funded. */
  creditApplied?: number;
  /** seed orderItemProduction + BOM wiring for the edge test. */
  withProduction?: { unitsCompleted: number };
}

async function seed(t: TestT, opts: SeedOpts = {}) {
  const {
    role = "order_staff",
    orderStatus = "BeingPrepared",
    weekStatus = "delivering",
    qty = 150,
    creditApplied,
    withProduction,
  } = opts;

  const { sessionId, userId } = await createSession(t, role);
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
      subscriptionId, weekStart: WEEK_START, weekEnd: WEEK_START + 7 * 86400000 - 1, status: weekStatus,
      plannedDays: [{ date: MON, deliverByTime: "09:00", items: [{ menuProductId, productName: "Original 80g", qty, unitPrice: PRICE, lineTotal: qty * PRICE }], locked: true }],
      creditIssued: WEEKLY_FUND, creditConsumed: 0, creditRemaining: WEEKLY_FUND, creditExpired: 0, shortfall: 0, shortfallFault: "none", refundDue: 0,
    } as never);
    // Funded week (topup only — order NOT yet recognized/delivered → no drawdown row).
    await ctx.db.insert("creditLedger", { subscriptionId, subscriptionWeekId, type: "topup", amount: WEEKLY_FUND, balanceAfter: WEEKLY_FUND, createdBy: userId } as never);

    const orderFields: Record<string, unknown> = {
      orderNumber: "0616-001", customerId, customerName: "Cafe", customerPhone: "+62812", status: orderStatus, paymentStatus: "Unpaid",
      orderDate: Date.now(), dueDate: MON, deliveryDate: MON, totalAmount: qty * PRICE, totalCost: 0, totalMargin: qty * PRICE, finalTotal: qty * PRICE,
      deliveryType: "Delivery", itemCount: 1, createdBy: "Test", isKitchenVisible: true, createdByUserId: userId, subscriptionId, subscriptionWeekId, fundingSource: "subscription_credit",
    };
    if (creditApplied !== undefined) orderFields.subscriptionCreditApplied = creditApplied;
    const orderId = await ctx.db.insert("orders", orderFields as never);
    const orderItemId = await ctx.db.insert("orderItems", { orderId, productName: "Original 80g", quantity: qty, unitPrice: PRICE, unitCost: 0, discountAmount: 0, lineTotal: qty * PRICE, lineCost: 0, lineMargin: qty * PRICE, menuProductId } as never);

    if (withProduction) {
      const productionUnitTypeId = await ctx.db.insert("productionUnitTypes", {
        code: "BIG_BALL", name: "Big Ball", gramsPerUnit: 80, unitCostIdr: 0, color: "#EF4444", sortOrder: 0, isActive: true,
      } as never);
      const componentTypeId = await ctx.db.insert("componentTypes", {
        code: "BIG_BALL", name: "Big Ball", category: "production", gramsPerUnit: 80, unitCostIdr: 0, unit: "pcs", trackInventory: false, sortOrder: 0,
        isActive: true, createdBy: "test", createdAt: Date.now(),
      } as never);
      await ctx.db.insert("menuProductComponents", { menuProductId, componentTypeId, quantity: 1, sortOrder: 0 } as never);
      await ctx.db.insert("orderItemProduction", {
        orderItemId, productionUnitTypeId, productionUnitCode: "BIG_BALL", productionUnitName: "Big Ball",
        unitsRequired: qty, unitsCompleted: withProduction.unitsCompleted, unitsRemaining: Math.max(0, qty - withProduction.unitsCompleted),
      } as never);
    }

    return { customerId, menuProductId, subscriptionId, subscriptionWeekId, orderId, orderItemId };
  });
  return { sessionId, userId, ...ids };
}

describe("editUndeliveredSubscriptionOrder", () => {
  // 1. Reducing a credit-funded undelivered order lowers the reservation AND frees pool credit.
  it("reduces a credit-funded order: reservation drops to new total, available credit rises", async () => {
    const t = convexTest(schema);
    const f = await seed(t, { creditApplied: 150 * PRICE, qty: 150 });

    const before = await t.run(async (ctx) => computeWeekAvailableCredit(ctx, f.subscriptionWeekId));
    expect(before.reserved).toBe(150 * PRICE);
    expect(before.availableCredit).toBe(WEEKLY_FUND - 150 * PRICE);

    const res = await t.mutation(api.subscriptions.editOrder.editUndeliveredSubscriptionOrder, {
      sessionId: f.sessionId,
      orderId: f.orderId,
      lines: [{ itemId: f.orderItemId, newQty: 100 }],
    });
    expect(res).toEqual({ ok: true });

    const order = await t.run(async (ctx) => ctx.db.get(f.orderId));
    expect(order!.totalAmount).toBe(100 * PRICE);
    expect(order!.subscriptionCreditApplied).toBe(100 * PRICE);

    const after = await t.run(async (ctx) => computeWeekAvailableCredit(ctx, f.subscriptionWeekId));
    expect(after.reserved).toBe(100 * PRICE);
    expect(after.availableCredit).toBe(WEEKLY_FUND - 100 * PRICE);
    // Freed credit == the reduction.
    expect(after.availableCredit - before.availableCredit).toBe(50 * PRICE);
  });

  // 2. Done statuses are rejected (deny-list).
  it.each(["AwaitingDelivery", "Complete"])("rejects editing a %s (delivered) order", async (status) => {
    const t = convexTest(schema);
    const f = await seed(t, { orderStatus: status, creditApplied: 150 * PRICE });
    await expect(
      t.mutation(api.subscriptions.editOrder.editUndeliveredSubscriptionOrder, {
        sessionId: f.sessionId, orderId: f.orderId, lines: [{ itemId: f.orderItemId, newQty: 100 }],
      }),
    ).rejects.toThrow(/undelivered/i);
  });

  // 3. Editable statuses resolve.
  it.each(["PaymentReceived", "BeingPrepared"])("allows editing a %s order", async (status) => {
    const t = convexTest(schema);
    const f = await seed(t, { orderStatus: status, creditApplied: 150 * PRICE });
    const res = await t.mutation(api.subscriptions.editOrder.editUndeliveredSubscriptionOrder, {
      sessionId: f.sessionId, orderId: f.orderId, lines: [{ itemId: f.orderItemId, newQty: 120 }],
    });
    expect(res).toEqual({ ok: true });
  });

  // 4. Settled-week guard.
  it.each(["reconciled", "closed"])("rejects editing an order whose week is %s (settled)", async (weekStatus) => {
    const t = convexTest(schema);
    const f = await seed(t, { weekStatus, creditApplied: 150 * PRICE });
    await expect(
      t.mutation(api.subscriptions.editOrder.editUndeliveredSubscriptionOrder, {
        sessionId: f.sessionId, orderId: f.orderId, lines: [{ itemId: f.orderItemId, newQty: 100 }],
      }),
    ).rejects.toThrow(/settled|reconciled|closed/i);
  });

  // 5. Non-credit-funded subscription order: items edit, reservation untouched (stays 0).
  it("edits a non-credit-funded subscription order without touching the reservation", async () => {
    const t = convexTest(schema);
    const f = await seed(t, { creditApplied: undefined, qty: 150 });
    const res = await t.mutation(api.subscriptions.editOrder.editUndeliveredSubscriptionOrder, {
      sessionId: f.sessionId, orderId: f.orderId, lines: [{ itemId: f.orderItemId, newQty: 100 }],
    });
    expect(res).toEqual({ ok: true });
    const order = await t.run(async (ctx) => ctx.db.get(f.orderId));
    expect(order!.totalAmount).toBe(100 * PRICE);
    expect(order!.subscriptionCreditApplied ?? 0).toBe(0);
  });

  // 5b. Rejects an INCREASE (Slice 2 is reduce-only).
  it("rejects increasing a line (reduce-only)", async () => {
    const t = convexTest(schema);
    const f = await seed(t, { qty: 100, creditApplied: 100 * PRICE });
    await expect(
      t.mutation(api.subscriptions.editOrder.editUndeliveredSubscriptionOrder, {
        sessionId: f.sessionId, orderId: f.orderId, lines: [{ itemId: f.orderItemId, newQty: 150 }],
      }),
    ).rejects.toThrow(/reduce|add more/i);
  });

  // 5c. newQty === 0 removes the line.
  it("removes a line when newQty is 0", async () => {
    const t = convexTest(schema);
    const f = await seed(t, { qty: 150, creditApplied: 150 * PRICE });
    await t.mutation(api.subscriptions.editOrder.editUndeliveredSubscriptionOrder, {
      sessionId: f.sessionId, orderId: f.orderId, lines: [{ itemId: f.orderItemId, newQty: 0 }],
    });
    const item = await t.run(async (ctx) => ctx.db.get(f.orderItemId));
    expect(item).toBeNull();
    const order = await t.run(async (ctx) => ctx.db.get(f.orderId));
    expect(order!.totalAmount).toBe(0);
    expect(order!.subscriptionCreditApplied).toBe(0); // capped to new total
  });

  // 6. Edge: reduce below the already-filled production count behaves sanely (no throw).
  it("reduces below the filled production count without throwing (units clamp to 0)", async () => {
    const t = convexTest(schema);
    const f = await seed(t, { qty: 150, creditApplied: 150 * PRICE, withProduction: { unitsCompleted: 120 } });
    const res = await t.mutation(api.subscriptions.editOrder.editUndeliveredSubscriptionOrder, {
      sessionId: f.sessionId, orderId: f.orderId, lines: [{ itemId: f.orderItemId, newQty: 100 }],
    });
    expect(res).toEqual({ ok: true });
    const prod = await t.run(async (ctx) =>
      ctx.db.query("orderItemProduction").withIndex("by_order_item", (q) => q.eq("orderItemId", f.orderItemId)).collect(),
    );
    expect(prod).toHaveLength(1);
    expect(prod[0].unitsRequired).toBe(100);
    expect(prod[0].unitsRemaining).toBe(0); // max(0, 100 - 120)
  });

  // 7. order_staff authorized; kitchen rejected.
  it("authorizes order_staff", async () => {
    const t = convexTest(schema);
    const f = await seed(t, { role: "order_staff", creditApplied: 150 * PRICE });
    const res = await t.mutation(api.subscriptions.editOrder.editUndeliveredSubscriptionOrder, {
      sessionId: f.sessionId, orderId: f.orderId, lines: [{ itemId: f.orderItemId, newQty: 100 }],
    });
    expect(res).toEqual({ ok: true });
  });

  it("rejects kitchen role", async () => {
    const t = convexTest(schema);
    const f = await seed(t, { role: "kitchen", creditApplied: 150 * PRICE });
    await expect(
      t.mutation(api.subscriptions.editOrder.editUndeliveredSubscriptionOrder, {
        sessionId: f.sessionId, orderId: f.orderId, lines: [{ itemId: f.orderItemId, newQty: 100 }],
      }),
    ).rejects.toThrow(/Unauthorized/i);
  });
});
