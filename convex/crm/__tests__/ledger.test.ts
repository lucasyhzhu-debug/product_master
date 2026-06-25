/**
 * Tests for convex/crm/ledger.ts — T8 getCreditLedgerStatement + getWeekBackReferences.
 *
 * Auth pattern: insert user + session via t.run(), pass sessionId to protectedQuery.
 * References: convex/crm/__tests__/customers.test.ts for fixture pattern.
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import type { SessionId } from "convex-helpers/server/sessions";
import { anyApi } from "convex/server";
import schema from "../../schema";
import type { Id } from "../../_generated/dataModel";

// Function references via anyApi — not yet in _generated/api.d.ts (T9 codegen).
const getCreditLedgerStatementRef = anyApi.crm.ledger.getCreditLedgerStatement;
const getWeekBackReferencesRef = anyApi.crm.ledger.getWeekBackReferences;

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
// T8 — getCreditLedgerStatement
// ---------------------------------------------------------------------------

describe("getCreditLedgerStatement", () => {
  it("returns sorted statement rows via buildLedgerStatement", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "manager", "Mgr Ledger");

    const { weekId } = await t.run(async (ctx) => {
      const cid = await ctx.db.insert("customers", {
        name: "Cafe Ledger",
        createdBy: "test",
      } as never);

      const sid = await ctx.db.insert("subscriptions", {
        ...SUB_DEFAULTS,
        customerId: cid,
        status: "active",
        createdBy: userId,
      } as never);

      const wid = await ctx.db.insert("subscriptionWeeks", {
        ...WEEK_DEFAULTS,
        subscriptionId: sid,
      } as never);

      // Two ledger entries: topup then drawdown.
      await ctx.db.insert("creditLedger", {
        subscriptionId: sid,
        subscriptionWeekId: wid,
        type: "topup",
        amount: 300000,
        balanceAfter: 300000,
        createdBy: userId,
      } as never);

      await ctx.db.insert("creditLedger", {
        subscriptionId: sid,
        subscriptionWeekId: wid,
        type: "drawdown",
        amount: -29000,
        balanceAfter: 271000,
        createdBy: userId,
      } as never);

      return { weekId: wid };
    });

    const result = await t.query(getCreditLedgerStatementRef, {
      sessionId,
      subscriptionWeekId: weekId,
    });

    expect(result.rows).toHaveLength(2);

    // Both rows present (buildLedgerStatement sorts by _creationTime).
    const types = result.rows.map((r: { type: string }) => r.type);
    expect(types).toContain("topup");
    expect(types).toContain("drawdown");

    // Amounts are passed through signed.
    const topupRow = result.rows.find((r: { type: string }) => r.type === "topup")!;
    expect(topupRow.signedAmount).toBe(300000);
    expect(topupRow.balanceAfter).toBe(300000);
    expect(topupRow.link).toEqual({ kind: null, id: null });

    const drawdownRow = result.rows.find((r: { type: string }) => r.type === "drawdown")!;
    expect(drawdownRow.signedAmount).toBe(-29000);
    expect(drawdownRow.balanceAfter).toBe(271000);
  });

  it("returns empty rows for a week with no ledger entries", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "admin", "Admin Empty");

    const weekId = await t.run(async (ctx) => {
      const cid = await ctx.db.insert("customers", {
        name: "Cafe Empty",
        createdBy: "test",
      } as never);
      const sid = await ctx.db.insert("subscriptions", {
        ...SUB_DEFAULTS,
        customerId: cid,
        status: "active",
        createdBy: userId,
      } as never);
      return ctx.db.insert("subscriptionWeeks", {
        ...WEEK_DEFAULTS,
        subscriptionId: sid,
      } as never);
    });

    const result = await t.query(getCreditLedgerStatementRef, {
      sessionId,
      subscriptionWeekId: weekId,
    });

    expect(result.rows).toHaveLength(0);
  });

  it("order_staff → Unauthorized", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "order_staff", "Staff Ledger");

    const weekId = await t.run(async (ctx) => {
      const cid = await ctx.db.insert("customers", {
        name: "Cafe Staff",
        createdBy: "test",
      } as never);
      const sid = await ctx.db.insert("subscriptions", {
        ...SUB_DEFAULTS,
        customerId: cid,
        status: "active",
        createdBy: userId,
      } as never);
      return ctx.db.insert("subscriptionWeeks", {
        ...WEEK_DEFAULTS,
        subscriptionId: sid,
      } as never);
    });

    await expect(
      t.query(getCreditLedgerStatementRef, { sessionId, subscriptionWeekId: weekId }),
    ).rejects.toThrow(/Unauthorized/);
  });
});

// ---------------------------------------------------------------------------
// T8 — getWeekBackReferences
// ---------------------------------------------------------------------------

describe("getWeekBackReferences", () => {
  it("returns orders, ledgerEntries, and fundingInvoice for a week", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "manager", "Mgr BackRef");

    const NOW = Date.now();

    const { weekId, orderId, ledgerEntryId, invoiceId } = await t.run(async (ctx) => {
      const cid = await ctx.db.insert("customers", {
        name: "Cafe BackRef",
        createdBy: "test",
      } as never);

      const sid = await ctx.db.insert("subscriptions", {
        ...SUB_DEFAULTS,
        customerId: cid,
        status: "active",
        createdBy: userId,
      } as never);

      // Create the funding invoice first so we can link it to the week.
      const invId = await ctx.db.insert("invoices", {
        status: "final",
        customerId: cid,
        generatedBy: userId,
        updatedAt: NOW,
        sellerName: "PT Frollie",
        bankName: "BCA",
        bankAccountNumber: "123",
        bankAccountName: "BCA Frollie",
        buyerName: "Cafe BackRef",
        orderNumber: "INV-WEEK",
        orderDate: NOW,
        items: [],
        subtotal: 300000,
        finalTotal: 300000,
        paymentStatus: "Unpaid",
      } as never);

      const wid = await ctx.db.insert("subscriptionWeeks", {
        ...WEEK_DEFAULTS,
        subscriptionId: sid,
        weeklyInvoiceId: invId,
      } as never);

      // An order linked to this week.
      const oid = await ctx.db.insert("orders", {
        orderNumber: "T8-001",
        customerId: cid,
        customerName: "Cafe BackRef",
        status: "Draft",
        paymentStatus: "Unpaid",
        orderDate: NOW,
        totalAmount: 29000,
        totalCost: 0,
        totalMargin: 29000,
        finalTotal: 29000,
        deliveryType: "Pickup",
        createdBy: "test",
        itemCount: 1,
        subscriptionId: sid,
        subscriptionWeekId: wid,
      } as never);

      // A ledger entry for this week.
      const lid = await ctx.db.insert("creditLedger", {
        subscriptionId: sid,
        subscriptionWeekId: wid,
        type: "topup",
        amount: 300000,
        balanceAfter: 300000,
        createdBy: userId,
      } as never);

      return { weekId: wid, orderId: oid, ledgerEntryId: lid, invoiceId: invId };
    });

    const result = await t.query(getWeekBackReferencesRef, {
      sessionId,
      subscriptionWeekId: weekId,
    });

    // Orders linked to the week.
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0]._id).toBe(orderId);

    // Ledger entries linked to the week.
    expect(result.ledgerEntries).toHaveLength(1);
    expect(result.ledgerEntries[0]._id).toBe(ledgerEntryId);

    // Funding invoice resolved via weeklyInvoiceId.
    expect(result.fundingInvoice).not.toBeNull();
    expect(result.fundingInvoice!._id).toBe(invoiceId);
  });

  it("fundingInvoice is null when week has no weeklyInvoiceId", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "manager", "Mgr NoInv");

    const weekId = await t.run(async (ctx) => {
      const cid = await ctx.db.insert("customers", {
        name: "Cafe NoInv",
        createdBy: "test",
      } as never);
      const sid = await ctx.db.insert("subscriptions", {
        ...SUB_DEFAULTS,
        customerId: cid,
        status: "active",
        createdBy: userId,
      } as never);
      // No weeklyInvoiceId.
      return ctx.db.insert("subscriptionWeeks", {
        ...WEEK_DEFAULTS,
        subscriptionId: sid,
      } as never);
    });

    const result = await t.query(getWeekBackReferencesRef, {
      sessionId,
      subscriptionWeekId: weekId,
    });

    expect(result.fundingInvoice).toBeNull();
    expect(result.orders).toHaveLength(0);
    expect(result.ledgerEntries).toHaveLength(0);
  });

  it("order_staff → Unauthorized", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "order_staff", "Staff BackRef");

    const weekId = await t.run(async (ctx) => {
      const cid = await ctx.db.insert("customers", {
        name: "Cafe StaffBR",
        createdBy: "test",
      } as never);
      const sid = await ctx.db.insert("subscriptions", {
        ...SUB_DEFAULTS,
        customerId: cid,
        status: "active",
        createdBy: userId,
      } as never);
      return ctx.db.insert("subscriptionWeeks", {
        ...WEEK_DEFAULTS,
        subscriptionId: sid,
      } as never);
    });

    await expect(
      t.query(getWeekBackReferencesRef, { sessionId, subscriptionWeekId: weekId }),
    ).rejects.toThrow(/Unauthorized/);
  });
});
