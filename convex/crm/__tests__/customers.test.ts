/**
 * Tests for convex/crm/customers.ts — T5 updateCustomerCrmFields + T6 getCustomerRecord + getCrmHomeActiveSubscriptions.
 *
 * Auth pattern: insert user + session via t.run(), pass sessionId to protectedMutation/protectedQuery.
 * References: convex/subscriptions/__tests__/invoicing.test.ts (createSession helper pattern).
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import type { SessionId } from "convex-helpers/server/sessions";
import { anyApi } from "convex/server";
import schema from "../../schema";
import type { Id } from "../../_generated/dataModel";

// Function references via anyApi — used because convex/crm/customers.ts is not
// yet in _generated/api.d.ts (codegen runs on `convex dev`). Each leaf of anyApi
// is already assignable to FunctionReference, so we alias leaves directly.
const updateCustomerCrmFieldsRef = anyApi.crm.customers.updateCustomerCrmFields;
const getCustomerRecordRef = anyApi.crm.customers.getCustomerRecord;
const getCrmHomeActiveSubscriptionsRef = anyApi.crm.customers.getCrmHomeActiveSubscriptions;

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
// T5 — updateCustomerCrmFields
// ---------------------------------------------------------------------------

describe("updateCustomerCrmFields", () => {
  it("manager can patch whatsapp field", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await createSession(t, "manager", "Mgr Test");

    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", { name: "Cafe Test", createdBy: "test" } as never),
    );

    const returned = await t.mutation(updateCustomerCrmFieldsRef, {
      sessionId,
      customerId,
      whatsapp: "+628111000111",
    });

    expect(returned).toBe(customerId);

    const updated = await t.run(async (ctx) => ctx.db.get(customerId));
    expect(updated!.whatsapp).toBe("+628111000111");
  });

  it("admin can patch whatsapp field", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await createSession(t, "admin", "Admin Test");

    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", { name: "Cafe Admin", createdBy: "test" } as never),
    );

    await t.mutation(updateCustomerCrmFieldsRef, {
      sessionId,
      customerId,
      whatsapp: "+628222000222",
    });

    const updated = await t.run(async (ctx) => ctx.db.get(customerId));
    expect(updated!.whatsapp).toBe("+628222000222");
  });

  it("non-provided fields are left untouched", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await createSession(t, "manager", "Mgr NoPatch");

    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", {
        name: "Cafe NoPatch",
        createdBy: "test",
        instagram: "@original",
        notes: "keep me",
      } as never),
    );

    // Only patch whatsapp; instagram + notes must be untouched.
    await t.mutation(updateCustomerCrmFieldsRef, {
      sessionId,
      customerId,
      whatsapp: "+628333000333",
    });

    const updated = await t.run(async (ctx) => ctx.db.get(customerId));
    expect(updated!.whatsapp).toBe("+628333000333");
    expect(updated!.instagram).toBe("@original");
    expect(updated!.notes).toBe("keep me");
  });

  it("order_staff token → Unauthorized", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await createSession(t, "order_staff", "Staff Test");

    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", { name: "Cafe Staff", createdBy: "test" } as never),
    );

    await expect(
      t.mutation(updateCustomerCrmFieldsRef, {
        sessionId,
        customerId,
        whatsapp: "+629000000000",
      }),
    ).rejects.toThrow(/Unauthorized/);
  });
});

// ---------------------------------------------------------------------------
// Shared fixture defaults for T6
// ---------------------------------------------------------------------------

const SUB_DEFAULTS = {
  label: "Test Sub",
  billingModel: "prepaid_weekly_credit" as const,
  unitPrice: 29000,
  confidentialPrice: true,
  baselineDailyQty: 10,
  weeklyQty: 70,
  deliverByTime: "09:00",
  creditRolloverPolicy: "expire" as const,
  changeCutoffHour: 13,
  changeCutoffDayOffset: -1,
  permanentChangeNoticeDays: 14,
  terminationNoticeDays: 30,
  cogsBasis: 0,
  startDate: Date.now(),
  scheduleTemplate: [],
};

const WEEK_DEFAULTS = {
  weekStart: Date.now(),
  weekEnd: Date.now() + 7 * 86400_000,
  status: "planned" as const,
  plannedDays: [],
  creditIssued: 0,
  creditConsumed: 0,
  creditRemaining: 0,
  creditExpired: 0,
  shortfall: 0,
  shortfallFault: "none" as const,
  refundDue: 0,
};

// ---------------------------------------------------------------------------
// T6 — getCustomerRecord
// ---------------------------------------------------------------------------

describe("getCustomerRecord", () => {
  it("returns customer, subscriptions, agreements, pool per sub, and unpaid invoices (Paid excluded)", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "manager", "Mgr Record");

    const NOW = Date.now();
    const LAST_MONDAY = NOW - (NOW % (7 * 86400_000));

    const { customerId, sub1Id, sub2Id, paidInvoiceId, unpaidInvoiceId } =
      await t.run(async (ctx) => {
        const cid = await ctx.db.insert("customers", {
          name: "Cafe Record",
          createdBy: "test",
        } as never);

        const s1 = await ctx.db.insert("subscriptions", {
          ...SUB_DEFAULTS,
          customerId: cid,
          status: "active",
          createdBy: userId,
        } as never);

        const s2 = await ctx.db.insert("subscriptions", {
          ...SUB_DEFAULTS,
          label: "Test Sub 2",
          customerId: cid,
          status: "active",
          createdBy: userId,
        } as never);

        // Current week for sub1 (weekStart ≤ NOW).
        const wid = await ctx.db.insert("subscriptionWeeks", {
          ...WEEK_DEFAULTS,
          subscriptionId: s1,
          weekStart: LAST_MONDAY,
          weekEnd: LAST_MONDAY + 7 * 86400_000 - 1,
        } as never);

        // Ledger entry for sub1's week (topup 200K).
        await ctx.db.insert("creditLedger", {
          subscriptionId: s1,
          subscriptionWeekId: wid,
          type: "topup",
          amount: 200000,
          balanceAfter: 200000,
          createdBy: userId,
        } as never);

        // Paid invoice (should be excluded from unpaidInvoices).
        const paidId = await ctx.db.insert("invoices", {
          status: "final",
          customerId: cid,
          generatedBy: userId,
          updatedAt: NOW,
          sellerName: "PT Frollie",
          bankName: "BCA",
          bankAccountNumber: "123",
          bankAccountName: "BCA Frollie",
          buyerName: "Cafe Record",
          orderNumber: "INV-PAID",
          orderDate: NOW,
          items: [],
          subtotal: 100000,
          finalTotal: 100000,
          paymentStatus: "Paid",
        } as never);

        // Unpaid invoice (should appear in unpaidInvoices).
        const unpaidId = await ctx.db.insert("invoices", {
          status: "final",
          customerId: cid,
          generatedBy: userId,
          updatedAt: NOW,
          sellerName: "PT Frollie",
          bankName: "BCA",
          bankAccountNumber: "123",
          bankAccountName: "BCA Frollie",
          buyerName: "Cafe Record",
          orderNumber: "INV-UNPAID",
          orderDate: NOW,
          items: [],
          subtotal: 200000,
          finalTotal: 200000,
          paymentStatus: "Unpaid",
        } as never);

        return {
          customerId: cid,
          sub1Id: s1,
          sub2Id: s2,
          weekId: wid,
          paidInvoiceId: paidId,
          unpaidInvoiceId: unpaidId,
        };
      });

    const result = await t.query(getCustomerRecordRef, {
      sessionId,
      customerId,
    });

    expect(result).not.toBeNull();
    expect(result!.customer._id).toBe(customerId);

    // Both subscriptions present.
    expect(result!.subscriptions).toHaveLength(2);
    const subIds = result!.subscriptions.map((s: { _id: string }) => s._id);
    expect(subIds).toContain(sub1Id);
    expect(subIds).toContain(sub2Id);

    // Pool present for sub1 (has a week + ledger entry), null for sub2 (no week).
    expect(result!.currentWeekPoolBySubscription[sub1Id]).not.toBeNull();
    expect(result!.currentWeekPoolBySubscription[sub1Id]!.pool.creditIssued).toBe(200000);
    expect(result!.currentWeekPoolBySubscription[sub1Id]!.pool.creditRemaining).toBe(200000);
    expect(result!.currentWeekPoolBySubscription[sub2Id]).toBeNull();

    // Paid invoice excluded; unpaid invoice included.
    const invoiceIds = result!.unpaidInvoices.map((i: { _id: string }) => i._id);
    expect(invoiceIds).not.toContain(paidInvoiceId);
    expect(invoiceIds).toContain(unpaidInvoiceId);
  });

  it("returns null for unknown customerId", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await createSession(t, "manager", "Mgr Null");

    // Create a customer then delete it so the id doesn't resolve.
    const realId = await t.run(async (ctx) =>
      ctx.db.insert("customers", { name: "Real", createdBy: "test" } as never),
    );
    await t.run(async (ctx) => ctx.db.delete(realId));

    const result = await t.query(getCustomerRecordRef, {
      sessionId,
      customerId: realId,
    });
    expect(result).toBeNull();
  });

  it("order_staff → Unauthorized", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await createSession(t, "order_staff", "Staff Record");

    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", { name: "Cafe Staff2", createdBy: "test" } as never),
    );

    await expect(
      t.query(getCustomerRecordRef, { sessionId, customerId }),
    ).rejects.toThrow(/Unauthorized/);
  });
});

// ---------------------------------------------------------------------------
// T6 — getCrmHomeActiveSubscriptions
// ---------------------------------------------------------------------------

describe("getCrmHomeActiveSubscriptions", () => {
  it("returns only active subscriptions with customer name and current week", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "manager", "Mgr Home");

    const NOW = Date.now();
    const LAST_MONDAY = NOW - (NOW % (7 * 86400_000));

    const { activeSub1, endedSub, customerId } = await t.run(async (ctx) => {
      const cid = await ctx.db.insert("customers", {
        name: "Cafe Home",
        createdBy: "test",
      } as never);

      const active1 = await ctx.db.insert("subscriptions", {
        ...SUB_DEFAULTS,
        customerId: cid,
        status: "active",
        createdBy: userId,
      } as never);

      const ended = await ctx.db.insert("subscriptions", {
        ...SUB_DEFAULTS,
        label: "Ended Sub",
        customerId: cid,
        status: "ended",
        createdBy: userId,
      } as never);

      // Current week for active sub.
      await ctx.db.insert("subscriptionWeeks", {
        ...WEEK_DEFAULTS,
        subscriptionId: active1,
        weekStart: LAST_MONDAY,
        weekEnd: LAST_MONDAY + 7 * 86400_000 - 1,
      } as never);

      return { activeSub1: active1, endedSub: ended, customerId: cid };
    });

    const result = await t.query(getCrmHomeActiveSubscriptionsRef, { sessionId });

    // Only active subscription should appear.
    const ids = result.map((r: { subscription: { _id: string } }) => r.subscription._id);
    expect(ids).toContain(activeSub1);
    expect(ids).not.toContain(endedSub);

    // Customer name is populated.
    const row = result.find((r: { subscription: { _id: string } }) => r.subscription._id === activeSub1);
    expect(row).toBeDefined();
    expect(row!.customerName).toBe("Cafe Home");
    expect(row!.customerId).toBe(customerId);
    // currentWeek is populated (has a week with weekStart ≤ NOW).
    expect(row!.currentWeek).not.toBeNull();
  });

  it("order_staff → Unauthorized", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await createSession(t, "order_staff", "Staff Home");

    await expect(
      t.query(getCrmHomeActiveSubscriptionsRef, { sessionId }),
    ).rejects.toThrow(/Unauthorized/);
  });
});
