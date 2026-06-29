/**
 * T6 integration tests: createCreditFundedOrder mutation
 *
 * Uses explicit modules glob so convex-test loads the worktree's implementations,
 * not stale main-tree code via the node_modules junction.
 */
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import type { SessionId } from "convex-helpers/server/sessions";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

const modules = import.meta.glob("/convex/**/*.ts");

type TestT = ReturnType<typeof convexTest>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createManagerSession(
  t: TestT,
): Promise<{ sessionId: SessionId; userId: Id<"users"> }> {
  const token = `manager-token-t6-${Date.now()}-${Math.random()}` as SessionId;
  const userId = await t.run(async (ctx) => {
    const uid = await ctx.db.insert("users", {
      name: "Test Manager T6",
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

/** Seeds an active subscription with a funded (delivering) week covering NOW. */
async function seedActiveSubFundedWeek(
  t: TestT,
  opts: { unitPrice: number; creditRemaining: number },
): Promise<{
  customerId: Id<"customers">;
  subId: Id<"subscriptions">;
  weekId: Id<"subscriptionWeeks">;
  productId: Id<"menuProducts">;
  sessionId: SessionId;
  userId: Id<"users">;
  midWeekTs: number;
}> {
  const { sessionId, userId } = await createManagerSession(t);
  const NOW = Date.now();
  const weekStart = NOW - 3 * 86400000; // 3 days ago
  const weekEnd = NOW + 4 * 86400000;   // 4 days ahead
  const midWeekTs = NOW;

  const ids = await t.run(async (ctx) => {
    const productId = (await ctx.db.insert("menuProducts", {
      code: "T6-P1",
      name: "Original T6",
      grams: 80,
      defaultPrice: 10000,
      isActive: true,
      unitCost: 5000,
      cachedProductionSummary: "1 Big",
    } as never)) as Id<"menuProducts">;

    const customerId = (await ctx.db.insert("customers", {
      name: "Sub Customer T6",
      phone: "+628111000001",
      createdBy: "test",
    } as never)) as Id<"customers">;

    const subscriptionId = (await ctx.db.insert("subscriptions", {
      customerId,
      label: "Weekly T6",
      status: "active",
      billingModel: "prepaid_weekly_credit",
      unitPrice: opts.unitPrice,
      confidentialPrice: false,
      baselineDailyQty: 10,
      weeklyQty: 70,
      deliverByTime: "09:00",
      creditRolloverPolicy: "expire",
      changeCutoffHour: 13,
      changeCutoffDayOffset: -1,
      permanentChangeNoticeDays: 14,
      terminationNoticeDays: 30,
      cogsBasis: 4000,
      startDate: weekStart,
      scheduleTemplate: [
        { dayOfWeek: 1, items: [{ menuProductId: productId, qty: 10 }] },
      ],
      createdBy: userId,
    } as never)) as Id<"subscriptions">;

    const weekId = (await ctx.db.insert("subscriptionWeeks", {
      subscriptionId,
      weekStart,
      weekEnd,
      status: "delivering",
      plannedDays: [
        {
          date: midWeekTs,
          deliverByTime: "09:00",
          items: [
            {
              menuProductId: productId,
              productName: "Original T6",
              qty: 10,
              unitPrice: opts.unitPrice,
              lineTotal: 10 * opts.unitPrice,
            },
          ],
          locked: false,
        },
      ],
      creditIssued: opts.creditRemaining,
      creditConsumed: 0,
      creditRemaining: opts.creditRemaining,
      creditExpired: 0,
      shortfall: 0,
      shortfallFault: "none",
      refundDue: 0,
    } as never)) as Id<"subscriptionWeeks">;

    // Fund the pool with a topup ledger entry so deriveCreditPool returns correct value
    await ctx.db.insert("creditLedger", {
      subscriptionId,
      subscriptionWeekId: weekId,
      type: "topup",
      amount: opts.creditRemaining,
      balanceAfter: opts.creditRemaining,
      createdBy: userId,
    } as never);

    return { customerId, subscriptionId, weekId, productId };
  });

  return {
    customerId: ids.customerId,
    subId: ids.subscriptionId,
    weekId: ids.weekId,
    productId: ids.productId,
    sessionId,
    userId,
    midWeekTs,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createCreditFundedOrder — T6", () => {
  it("(a) full cover: sets funded triple + reserves credit, NO ledger entry at creation", async () => {
    const t = convexTest(schema, modules);
    const { customerId, subId, productId, sessionId, midWeekTs } =
      await seedActiveSubFundedWeek(t, { unitPrice: 7000, creditRemaining: 100000 });

    const res = await t.mutation(api.subscriptions.creditOrder.createCreditFundedOrder, {
      customerId,
      subscriptionId: subId,
      dueDate: midWeekTs,
      // Client sends retail price 10000; server must re-price eligible lines to 7000
      items: [
        { productName: "Original T6", quantity: 8, unitPrice: 10000, unitCost: 0, menuProductId: productId },
      ],
      sessionId,
    });

    // creditCovered = 8 × sub.unitPrice(7000) = 56000; amountDue = 0
    expect(res.creditCovered).toBe(56000);
    expect(res.amountDue).toBe(0);
    expect(res.offPlanTotal).toBe(0);

    const order = await t.run((ctx) => ctx.db.get(res.orderId));
    expect(order).not.toBeNull();
    expect(order!.fundingSource).toBe("subscription_credit");
    expect(order!.status).toBe("PaymentReceived");
    expect(order!.paymentStatus).toBe("Paid");
    expect(order!.paymentMethod).toBe("subscription_credit");
    expect(order!.subscriptionCreditApplied).toBe(56000);

    // NO eager drawdown — recognition posts at delivery (T3)
    const ledger = await t.run((ctx) =>
      ctx.db
        .query("creditLedger")
        .withIndex("by_order", (q) => q.eq("orderId", res.orderId))
        .collect(),
    );
    expect(ledger).toHaveLength(0);
  });

  it("(b) partial cover: sets deposit/AwaitingPayment/Unpaid, reserves availableCredit", async () => {
    const t = convexTest(schema, modules);
    // creditRemaining = 30000 < eligibleSubtotal(8×7000=56000) → partial
    const { customerId, subId, productId, sessionId, midWeekTs } =
      await seedActiveSubFundedWeek(t, { unitPrice: 7000, creditRemaining: 30000 });

    const res = await t.mutation(api.subscriptions.creditOrder.createCreditFundedOrder, {
      customerId,
      subscriptionId: subId,
      dueDate: midWeekTs,
      items: [
        { productName: "Original T6", quantity: 8, unitPrice: 10000, unitCost: 0, menuProductId: productId },
      ],
      sessionId,
    });

    // creditCovered = min(56000, 30000) = 30000; amountDue = 56000 - 30000 = 26000
    expect(res.creditCovered).toBe(30000);
    expect(res.amountDue).toBe(26000);

    const order = await t.run((ctx) => ctx.db.get(res.orderId));
    expect(order!.fundingSource).toBe("deposit");
    expect(order!.status).toBe("AwaitingPayment");
    expect(order!.paymentStatus).toBe("Unpaid");
    expect(order!.subscriptionCreditApplied).toBe(30000);

    // No eager ledger entry for partial either
    const ledger = await t.run((ctx) =>
      ctx.db
        .query("creditLedger")
        .withIndex("by_order", (q) => q.eq("orderId", res.orderId))
        .collect(),
    );
    expect(ledger).toHaveLength(0);
  });

  it("(c) off-plan-only cart → ConvexError", async () => {
    const t = convexTest(schema, modules);
    const { customerId, subId, sessionId, midWeekTs } =
      await seedActiveSubFundedWeek(t, { unitPrice: 7000, creditRemaining: 100000 });

    // Create a product NOT in the subscription's scheduleTemplate
    const offplanProductId = (await t.run(async (ctx) =>
      ctx.db.insert("menuProducts", {
        code: "T6-P2",
        name: "Offplan Product T6",
        grams: 45,
        defaultPrice: 5000,
        isActive: true,
        unitCost: 3000,
        cachedProductionSummary: "1 Mid",
      } as never),
    )) as Id<"menuProducts">;

    await expect(
      t.mutation(api.subscriptions.creditOrder.createCreditFundedOrder, {
        customerId,
        subscriptionId: subId,
        dueDate: midWeekTs,
        items: [
          {
            productName: "Offplan Product T6",
            quantity: 5,
            unitPrice: 5000,
            unitCost: 0,
            menuProductId: offplanProductId,
          },
        ],
        sessionId,
      }),
    ).rejects.toThrow("No credit-eligible lines for this subscription");
  });

  it("(d) tampered client price is ignored: server re-prices eligible lines to sub.unitPrice", async () => {
    const t = convexTest(schema, modules);
    const { customerId, subId, productId, sessionId, midWeekTs } =
      await seedActiveSubFundedWeek(t, { unitPrice: 7000, creditRemaining: 100000 });

    const res = await t.mutation(api.subscriptions.creditOrder.createCreditFundedOrder, {
      customerId,
      subscriptionId: subId,
      dueDate: midWeekTs,
      // Client sends inflated unitPrice; server must re-price eligible lines to sub.unitPrice=7000
      items: [
        { productName: "Original T6", quantity: 8, unitPrice: 99999, unitCost: 0, menuProductId: productId },
      ],
      sessionId,
    });

    // Server-side: eligible → effectiveUnitPrice = 7000 (not 99999)
    // creditCovered = min(8 × 7000, 100000) = 56000 (NOT 8 × 99999 = 799992)
    expect(res.creditCovered).toBe(56000);

    const order = await t.run((ctx) => ctx.db.get(res.orderId));
    // Order totalAmount = 8 × 7000 = 56000 (server-priced), not client-sent 99999
    expect(order!.totalAmount).toBe(56000);
    expect(order!.finalTotal).toBe(56000);
    // Full cover since 56000 <= 100000
    expect(order!.status).toBe("PaymentReceived");
  });

  it("(e) no funded week → ConvexError", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createManagerSession(t);

    const { customerId, subId, productId } = await t.run(async (ctx) => {
      const productId = (await ctx.db.insert("menuProducts", {
        code: "T6-P1E",
        name: "Original T6E",
        grams: 80,
        defaultPrice: 10000,
        isActive: true,
        unitCost: 5000,
        cachedProductionSummary: "1 Big",
      } as never)) as Id<"menuProducts">;

      const customerId = (await ctx.db.insert("customers", {
        name: "No Week Customer T6",
        phone: "+628111000099",
        createdBy: "test",
      } as never)) as Id<"customers">;

      // Subscription exists but NO subscriptionWeeks rows → week lookup returns undefined
      const subscriptionId = (await ctx.db.insert("subscriptions", {
        customerId,
        label: "No Week T6",
        status: "active",
        billingModel: "prepaid_weekly_credit",
        unitPrice: 7000,
        confidentialPrice: false,
        baselineDailyQty: 10,
        weeklyQty: 70,
        deliverByTime: "09:00",
        creditRolloverPolicy: "expire",
        changeCutoffHour: 13,
        changeCutoffDayOffset: -1,
        permanentChangeNoticeDays: 14,
        terminationNoticeDays: 30,
        cogsBasis: 4000,
        startDate: Date.now(),
        scheduleTemplate: [
          { dayOfWeek: 1, items: [{ menuProductId: productId, qty: 10 }] },
        ],
        createdBy: userId,
      } as never)) as Id<"subscriptions">;

      return { customerId, subId: subscriptionId, productId };
    });

    await expect(
      t.mutation(api.subscriptions.creditOrder.createCreditFundedOrder, {
        customerId,
        subscriptionId: subId,
        dueDate: Date.now(),
        items: [
          { productName: "Original T6E", quantity: 5, unitPrice: 10000, unitCost: 0, menuProductId: productId },
        ],
        sessionId,
      }),
    ).rejects.toThrow("No funded subscription week covers this date");
  });
});
