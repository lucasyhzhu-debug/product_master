/**
 * Full-shape tests for subscription invoice builders.
 *
 * Strategy: baseline-first.
 *   Step 1 (baseline): assert BOTH createSubscriptionWeeklyInvoice and
 *     createTopupInvoice insert invoices with the full expected field set
 *     BEFORE the buildInvoiceSnapshot refactor — run green = baseline.
 *   Step 2-4: extract helper + repoint both builders.
 *   Step 5: re-run — both tests MUST still pass (behavior-preserving proof).
 *
 * Verified fields per kind: seller/bank/buyer snapshot, invoiceKind,
 *   orderNumber prefix (WEEK-/TOPUP-), subtotal, finalTotal, paymentStatus.
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { SessionId } from "convex-helpers/server/sessions";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

type TestT = ReturnType<typeof convexTest>;

async function createSession(
  t: TestT,
  role: "admin" | "manager",
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

/** Minimal funded-week fixture: customer → subscription → subscriptionWeek (planned status). */
async function seedFundedWeek(t: TestT): Promise<{
  sessionId: SessionId;
  userId: Id<"users">;
  customerId: Id<"customers">;
  subscriptionId: Id<"subscriptions">;
  subscriptionWeekId: Id<"subscriptionWeeks">;
  menuProductId: Id<"menuProducts">;
  bankAccountId: Id<"bankAccounts">;
}> {
  const { sessionId, userId } = await createSession(t, "manager", "Test Manager");

  return await t.run(async (ctx) => {
    const now = Date.now();
    const weekStart = Date.UTC(2026, 5, 16); // Monday 2026-06-16 UTC

    // Customer with buyer snapshot fields
    const customerId = await ctx.db.insert("customers", {
      name: "Cafe Frollie",
      phone: "+6281234567890",
      companyName: "PT Cafe Test",
      npwp: "12.345.678.9-000.000",
      billingAddress: "Jl. Test No. 1",
      createdBy: "test",
    } as never);

    // Menu product (needed for subscription scheduleTemplate)
    const menuProductId = await ctx.db.insert("menuProducts", {
      code: "ORI-80",
      name: "Original 80g",
      grams: 80,
      defaultPrice: 35000,
      isActive: true,
      unitCost: 0,
      cachedProductionSummary: "1 Big",
    } as never);

    // Bank account
    const bankAccountId = await ctx.db.insert("bankAccounts", {
      name: "BCA Frollie",
      bankName: "BCA",
      accountNumber: "6044830994",
      isActive: true,
      createdBy: userId,
      createdAt: now,
    } as never);

    // Business settings — seller snapshot + default bank link
    await ctx.db.insert("businessSettings", {
      businessName: "PT Frollie",
      address: "Jl. Frollie No. 1, Jakarta",
      phone: "+62215551234",
      email: "finance@frollie.id",
      npwp: "01.234.567.8-000.000",
      defaultBankAccountId: bankAccountId,
      updatedBy: userId,
      updatedAt: now,
    } as never);

    // Subscription
    const subscriptionId = await ctx.db.insert("subscriptions", {
      customerId,
      label: "Weekly Delivery",
      status: "active",
      billingModel: "prepaid_weekly_credit",
      unitPrice: 29000,
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
      startDate: weekStart,
      scheduleTemplate: [
        {
          dayOfWeek: 1,
          items: [{ menuProductId, qty: 150 }],
        },
      ],
      createdBy: userId,
    } as never);

    // Week with one planned day
    const subscriptionWeekId = await ctx.db.insert("subscriptionWeeks", {
      subscriptionId,
      weekStart,
      weekEnd: weekStart + 7 * 86400000 - 1,
      status: "planned",
      plannedDays: [
        {
          date: weekStart + 86400000, // Tuesday
          deliverByTime: "09:00",
          items: [
            {
              menuProductId,
              productName: "Original 80g",
              qty: 150,
              unitPrice: 29000,
              lineTotal: 4350000,
            },
          ],
          locked: false,
        },
      ],
      creditIssued: 4350000,
      creditConsumed: 0,
      creditRemaining: 4350000,
      creditExpired: 0,
      shortfall: 0,
      shortfallFault: "none",
      refundDue: 0,
    } as never);

    return { sessionId, userId, customerId, subscriptionId, subscriptionWeekId, menuProductId, bankAccountId };
  });
}

// ---------------------------------------------------------------------------
// Weekly invoice — full shape assertion
// ---------------------------------------------------------------------------

describe("createSubscriptionWeeklyInvoice — full field shape", () => {
  it("inserts an invoice with complete seller/bank/buyer snapshot + kind + orderNumber", async () => {
    const t = convexTest(schema);
    const f = await seedFundedWeek(t);

    const invoiceId = await t.mutation(api.subscriptions.invoicing.createSubscriptionWeeklyInvoice, {
      sessionId: f.sessionId,
      subscriptionWeekId: f.subscriptionWeekId,
    });

    const invoice = await t.run(async (ctx) => ctx.db.get(invoiceId));

    // Status & kind
    expect(invoice!.status).toBe("final");
    expect(invoice!.invoiceKind).toBe("subscription_weekly");
    expect(invoice!.paymentStatus).toBe("Unpaid");

    // orderNumber has the WEEK- prefix and encodes weekStart date
    expect(invoice!.orderNumber).toMatch(/^WEEK-/);

    // Linkage
    expect(invoice!.subscriptionWeekId).toBe(f.subscriptionWeekId);
    expect(invoice!.customerId).toBe(f.customerId);

    // Seller snapshot (from businessSettings)
    expect(invoice!.sellerName).toBe("PT Frollie");
    expect(invoice!.sellerAddress).toBe("Jl. Frollie No. 1, Jakarta");
    expect(invoice!.sellerPhone).toBe("+62215551234");
    expect(invoice!.sellerEmail).toBe("finance@frollie.id");
    expect(invoice!.sellerNpwp).toBe("01.234.567.8-000.000");

    // Bank snapshot (from bankAccounts via defaultBankAccountId)
    expect(invoice!.bankName).toBe("BCA");
    expect(invoice!.bankAccountNumber).toBe("6044830994");
    expect(invoice!.bankAccountName).toBe("BCA Frollie");

    // Buyer snapshot (from customer)
    expect(invoice!.buyerName).toBe("Cafe Frollie");
    expect(invoice!.buyerCompany).toBe("PT Cafe Test");
    expect(invoice!.buyerNpwp).toBe("12.345.678.9-000.000");
    expect(invoice!.buyerAddress).toBe("Jl. Test No. 1"); // billingAddress wins
    expect(invoice!.buyerPhone).toBe("+6281234567890");

    // Line items + totals
    expect(invoice!.items).toHaveLength(1);
    expect(invoice!.items[0]).toMatchObject({
      productName: "Original 80g",
      qty: 150,
      unitPrice: 29000,
      lineTotal: 4350000,
    });
    expect(invoice!.subtotal).toBe(4350000);
    expect(invoice!.finalTotal).toBe(4350000);

    // Idempotency side-effect: week is patched to invoiced
    const week = await t.run(async (ctx) => ctx.db.get(f.subscriptionWeekId));
    expect(week!.weeklyInvoiceId).toBe(invoiceId);
    expect(week!.status).toBe("invoiced");
  });

  it("is idempotent — second call returns the same invoiceId without inserting", async () => {
    const t = convexTest(schema);
    const f = await seedFundedWeek(t);

    const id1 = await t.mutation(api.subscriptions.invoicing.createSubscriptionWeeklyInvoice, {
      sessionId: f.sessionId,
      subscriptionWeekId: f.subscriptionWeekId,
    });
    const id2 = await t.mutation(api.subscriptions.invoicing.createSubscriptionWeeklyInvoice, {
      sessionId: f.sessionId,
      subscriptionWeekId: f.subscriptionWeekId,
    });

    expect(id1).toBe(id2);
    const allInvoices = await t.run(async (ctx) =>
      ctx.db
        .query("invoices")
        .withIndex("by_subscriptionWeek", (q) => q.eq("subscriptionWeekId", f.subscriptionWeekId))
        .collect(),
    );
    expect(allInvoices).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Topup invoice — full shape assertion
// ---------------------------------------------------------------------------

describe("createTopupInvoice — full field shape", () => {
  it("inserts a topup invoice with complete seller/bank/buyer snapshot + kind + orderNumber", async () => {
    const t = convexTest(schema);
    const f = await seedFundedWeek(t);

    const addedLines = [
      { productName: "Jumbo 80g", qty: 50, unitPrice: 40000, lineTotal: 2000000 },
    ];

    const invoiceId = await t.mutation(api.subscriptions.invoicing.createTopupInvoice, {
      sessionId: f.sessionId,
      subscriptionWeekId: f.subscriptionWeekId,
      addedLines,
    });

    const invoice = await t.run(async (ctx) => ctx.db.get(invoiceId));

    // Status & kind
    expect(invoice!.status).toBe("final");
    expect(invoice!.invoiceKind).toBe("subscription_topup");
    expect(invoice!.paymentStatus).toBe("Unpaid");

    // orderNumber has the TOPUP- prefix
    expect(invoice!.orderNumber).toMatch(/^TOPUP-/);

    // Linkage
    expect(invoice!.subscriptionWeekId).toBe(f.subscriptionWeekId);
    expect(invoice!.customerId).toBe(f.customerId);

    // Seller snapshot
    expect(invoice!.sellerName).toBe("PT Frollie");
    expect(invoice!.sellerAddress).toBe("Jl. Frollie No. 1, Jakarta");
    expect(invoice!.sellerPhone).toBe("+62215551234");
    expect(invoice!.sellerEmail).toBe("finance@frollie.id");
    expect(invoice!.sellerNpwp).toBe("01.234.567.8-000.000");

    // Bank snapshot
    expect(invoice!.bankName).toBe("BCA");
    expect(invoice!.bankAccountNumber).toBe("6044830994");
    expect(invoice!.bankAccountName).toBe("BCA Frollie");

    // Buyer snapshot
    expect(invoice!.buyerName).toBe("Cafe Frollie");
    expect(invoice!.buyerCompany).toBe("PT Cafe Test");
    expect(invoice!.buyerNpwp).toBe("12.345.678.9-000.000");
    expect(invoice!.buyerAddress).toBe("Jl. Test No. 1");
    expect(invoice!.buyerPhone).toBe("+6281234567890");

    // Line items + totals (topup lines have NO date field)
    expect(invoice!.items).toHaveLength(1);
    expect(invoice!.items[0]).toMatchObject({
      productName: "Jumbo 80g",
      qty: 50,
      unitPrice: 40000,
      lineTotal: 2000000,
    });
    expect(invoice!.subtotal).toBe(2000000);
    expect(invoice!.finalTotal).toBe(2000000);

    // Topup does NOT change week status
    const week = await t.run(async (ctx) => ctx.db.get(f.subscriptionWeekId));
    expect(week!.weeklyInvoiceId).toBeUndefined(); // no weekly invoice was created
    expect(week!.status).toBe("planned"); // unchanged
  });

  it("supports multiple topups on the same week (no idempotency constraint)", async () => {
    const t = convexTest(schema);
    const f = await seedFundedWeek(t);

    const line = { productName: "Jumbo 80g", qty: 10, unitPrice: 40000, lineTotal: 400000 };

    const id1 = await t.mutation(api.subscriptions.invoicing.createTopupInvoice, {
      sessionId: f.sessionId,
      subscriptionWeekId: f.subscriptionWeekId,
      addedLines: [line],
    });
    const id2 = await t.mutation(api.subscriptions.invoicing.createTopupInvoice, {
      sessionId: f.sessionId,
      subscriptionWeekId: f.subscriptionWeekId,
      addedLines: [line],
    });

    expect(id1).not.toBe(id2);
  });
});
