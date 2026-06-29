import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import type { SessionId } from "convex-helpers/server/sessions";
import { anyApi } from "convex/server";
import schema from "../../schema";
import type { Id } from "../../_generated/dataModel";
import { isDeliverableSubscriptionStatus } from "../delivery";

describe("isDeliverableSubscriptionStatus", () => {
  it("allows funded/in-progress statuses", () => {
    expect(isDeliverableSubscriptionStatus("PaymentReceived")).toBe(true);
    expect(isDeliverableSubscriptionStatus("BeingPrepared")).toBe(true);
    expect(isDeliverableSubscriptionStatus("AwaitingDelivery")).toBe(true); // re-press safe
  });
  it("rejects not-yet-funded and terminal statuses", () => {
    expect(isDeliverableSubscriptionStatus("Draft")).toBe(false);
    expect(isDeliverableSubscriptionStatus("AwaitingPayment")).toBe(false);
    expect(isDeliverableSubscriptionStatus("Complete")).toBe(false);
    expect(isDeliverableSubscriptionStatus("Cancelled")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// markSubscriptionDelivered — full mutation flow (convex-test)
// Auth pattern mirrors convex/crm/__tests__/drawdown.test.ts.
// ---------------------------------------------------------------------------

const markDeliveredRef = anyApi.subscriptions.delivery.markSubscriptionDelivered;
const modules = import.meta.glob("/convex/**/*.ts");

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

/** Funded subscription + week + topup so recognition has a positive pool. */
async function seedFundedSub(t: TestT, userId: Id<"users">, customerId: Id<"customers">) {
  return await t.run(async (ctx) => {
    const subscriptionId = await ctx.db.insert("subscriptions", {
      customerId,
      label: "Test Sub",
      status: "active",
      billingModel: "prepaid_weekly_credit",
      unitPrice: 29000,
      confidentialPrice: false,
      baselineDailyQty: 5,
      weeklyQty: 35,
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
    const subscriptionWeekId = await ctx.db.insert("subscriptionWeeks", {
      subscriptionId,
      weekStart: Date.now(),
      weekEnd: Date.now() + 7 * 86400000,
      status: "paid",
      plannedDays: [],
      creditIssued: 1015000,
      creditConsumed: 0,
      creditRemaining: 1015000,
      creditExpired: 0,
      shortfall: 0,
      shortfallFault: "none",
      refundDue: 0,
    } as never);
    await ctx.db.insert("creditLedger", {
      subscriptionId,
      subscriptionWeekId,
      type: "topup",
      amount: 1015000,
      balanceAfter: 1015000,
      createdBy: userId,
      note: "Weekly topup",
    } as never);
    return { subscriptionId, subscriptionWeekId };
  });
}

async function seedSubOrder(
  t: TestT,
  userId: Id<"users">,
  customerId: Id<"customers">,
  subscriptionId: Id<"subscriptions">,
  subscriptionWeekId: Id<"subscriptionWeeks">,
  status: string,
): Promise<Id<"orders">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("orders", {
      orderNumber: "0101-009",
      customerId,
      customerName: "Test Cafe",
      status,
      paymentStatus: "Paid",
      orderDate: Date.now(),
      totalAmount: 29000,
      totalCost: 15000,
      totalMargin: 14000,
      finalTotal: 29000,
      deliveryType: "Delivery",
      createdBy: "test",
      createdByUserId: userId,
      itemCount: 1,
      subscriptionId,
      subscriptionWeekId,
    } as never),
  );
}

async function seedCustomer(t: TestT): Promise<Id<"customers">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("customers", { name: "Test Cafe", createdBy: "test" } as never),
  );
}

describe("markSubscriptionDelivered", () => {
  it("completes the order (terminal status + completedAt) and recognizes the sale", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "manager", "Mgr Deliver");
    const customerId = await seedCustomer(t);
    const { subscriptionId, subscriptionWeekId } = await seedFundedSub(t, userId, customerId);
    const orderId = await seedSubOrder(t, userId, customerId, subscriptionId, subscriptionWeekId, "BeingPrepared");

    const result = await t.mutation(markDeliveredRef, { sessionId, orderId });
    expect(result.newlyRecognized).toBe(true);

    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe("Complete"); // not stuck at AwaitingDelivery
    expect(order?.completedAt).toBeTypeOf("number");
    expect(order?.isKitchenVisible).toBe(false);

    const ledger = await t.run(async (ctx) =>
      ctx.db.query("creditLedger").withIndex("by_order", (q) => q.eq("orderId", orderId)).collect(),
    );
    expect(ledger).toHaveLength(1);
    expect(ledger[0].type).toBe("drawdown");
  });

  it("un-sticks an order already in AwaitingDelivery (recognized at split) → Complete, no second drawdown", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "manager", "Mgr Restick");
    const customerId = await seedCustomer(t);
    const { subscriptionId, subscriptionWeekId } = await seedFundedSub(t, userId, customerId);
    const orderId = await seedSubOrder(t, userId, customerId, subscriptionId, subscriptionWeekId, "AwaitingDelivery");
    // Simulate the split-time recognition: a drawdown already exists for this order.
    await t.run(async (ctx) => {
      await ctx.db.insert("creditLedger", {
        subscriptionId,
        subscriptionWeekId,
        type: "drawdown",
        amount: -29000,
        balanceAfter: 986000,
        createdBy: userId,
        orderId,
        note: "Recognized at split",
      } as never);
    });

    const result = await t.mutation(markDeliveredRef, { sessionId, orderId });
    expect(result.newlyRecognized).toBe(false); // already recognized

    const order = await t.run(async (ctx) => ctx.db.get(orderId));
    expect(order?.status).toBe("Complete"); // BUG was: stuck at AwaitingDelivery
    expect(order?.completedAt).toBeTypeOf("number");

    const ledger = await t.run(async (ctx) =>
      ctx.db.query("creditLedger").withIndex("by_order", (q) => q.eq("orderId", orderId)).collect(),
    );
    expect(ledger).toHaveLength(1); // no duplicate drawdown
  });
});
