/**
 * Tests for convex/crm/timeline.ts — T19 logCustomerInteraction + T21 getCustomerTimeline.
 *
 * Auth pattern: insert user + session via t.run(), pass sessionId to protectedMutation/protectedQuery.
 * Follows the pattern in convex/crm/__tests__/customers.test.ts.
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import type { SessionId } from "convex-helpers/server/sessions";
import { anyApi } from "convex/server";
import schema from "../../schema";
import type { Id, Doc } from "../../_generated/dataModel";

const logCustomerInteractionRef = anyApi.crm.timeline.logCustomerInteraction;
const getCustomerTimelineRef = anyApi.crm.timeline.getCustomerTimeline;

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

/** Store a minimal blob and return its storage Id (mirrors agreements.test.ts pattern). */
async function createStorageId(t: TestT): Promise<Id<"_storage">> {
  return t.run(async (ctx) => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF magic bytes
    const blob = new Blob([bytes], { type: "application/pdf" });
    if (typeof (blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer !== "function") {
      (blob as Blob & { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = async () =>
        bytes.buffer as ArrayBuffer;
    }
    const storageCtx = ctx as unknown as {
      storage: { store: (b: Blob) => Promise<Id<"_storage">> };
    };
    return storageCtx.storage.store(blob);
  });
}

// Shared subscription defaults — mirrors customers.test.ts
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

// ---------------------------------------------------------------------------
// T19 — logCustomerInteraction
// ---------------------------------------------------------------------------

describe("logCustomerInteraction", () => {
  it("manager logs whatsapp_drafted → row with correct actor + at + direction", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "manager", "Mgr Log");

    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", { name: "Cafe Log", createdBy: "test" } as never),
    );

    const before = Date.now();
    const activityId = await t.mutation(logCustomerInteractionRef, {
      sessionId,
      customerId,
      type: "whatsapp_drafted",
      summary: "Sent follow-up",
      note: "Customer asked about pricing",
    });
    const after = Date.now();

    expect(activityId).toBeTruthy();

    const row = await t.run(async (ctx) => ctx.db.get(activityId)) as Doc<"customerActivity"> | null;
    expect(row).not.toBeNull();
    expect(row!.customerId).toBe(customerId);
    expect(row!.type).toBe("whatsapp_drafted");
    expect(row!.actor).toBe(userId);
    expect(row!.at).toBeGreaterThanOrEqual(before);
    expect(row!.at).toBeLessThanOrEqual(after);
    // whatsapp_drafted → category "message" → direction "outbound"
    expect(row!.direction).toBe("outbound");
    expect(row!.summary).toBe("Sent follow-up");
    expect(row!.note).toBe("Customer asked about pricing");
  });

  it("admin logs note → direction outbound (note = message category)", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await createSession(t, "admin", "Admin Log");

    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", { name: "Cafe Admin Log", createdBy: "test" } as never),
    );

    const activityId = await t.mutation(logCustomerInteractionRef, {
      sessionId,
      customerId,
      type: "note",
      summary: "Internal note",
    });

    const row = await t.run(async (ctx) => ctx.db.get(activityId)) as Doc<"customerActivity"> | null;
    expect(row!.type).toBe("note");
    // note → category "message" → direction "outbound"
    expect(row!.direction).toBe("outbound");
  });

  it("logs manual_milestone with subject refs", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "manager", "Mgr Milestone");

    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", { name: "Cafe Milestone", createdBy: "test" } as never),
    );

    const subId = await t.run(async (ctx) =>
      ctx.db.insert("subscriptions", {
        ...SUB_DEFAULTS,
        customerId,
        status: "active",
        createdBy: userId,
      } as never),
    );

    const activityId = await t.mutation(logCustomerInteractionRef, {
      sessionId,
      customerId,
      type: "manual_milestone",
      subtype: "onboarded",
      subscriptionId: subId,
      summary: "Customer onboarded",
    });

    const row = await t.run(async (ctx) => ctx.db.get(activityId)) as Doc<"customerActivity"> | null;
    expect(row!.type).toBe("manual_milestone");
    expect(row!.subtype).toBe("onboarded");
    expect(row!.subscriptionId).toBe(subId);
    // manual_milestone → category "milestone" → direction "system"
    expect(row!.direction).toBe("system");
  });

  it("order_staff token → Unauthorized", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await createSession(t, "order_staff", "Staff Log");

    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", { name: "Cafe Staff Log", createdBy: "test" } as never),
    );

    await expect(
      t.mutation(logCustomerInteractionRef, {
        sessionId,
        customerId,
        type: "note",
        summary: "Not allowed",
      }),
    ).rejects.toThrow(/Unauthorized/);
  });
});

// ---------------------------------------------------------------------------
// T21 — getCustomerTimeline
// ---------------------------------------------------------------------------

describe("getCustomerTimeline", () => {
  it("returns merged DESC feed with orders, invoices, ledger, agreements, and logged rows", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "manager", "Mgr Timeline");
    const fileStorageId = await createStorageId(t);

    const NOW = Date.now();
    // All events within the 14-day window
    const T1 = NOW - 10 * 86_400_000; // 10 days ago
    const T2 = NOW - 5 * 86_400_000;  // 5 days ago
    const T3 = NOW - 2 * 86_400_000;  // 2 days ago
    const T4 = NOW - 1 * 86_400_000;  // 1 day ago

    const { customerId } = await t.run(async (ctx) => {
      const cid = await ctx.db.insert("customers", {
        name: "Cafe Timeline",
        createdBy: "test",
      } as never);

      // Order placed at T1
      await ctx.db.insert("orders", {
        orderNumber: "0625-001",
        customerId: cid,
        customerName: "Cafe Timeline",
        status: "Draft",
        orderDate: T1,
        dueDate: T2,
        paymentStatus: "Unpaid",
        totalAmount: 100000,
        totalCost: 0,
        totalMargin: 100000,
        finalTotal: 100000,
        itemCount: 1,
        deliveryType: "Pickup",
        createdBy: "mgr",
        createdByUserId: userId,
      } as never);

      // Invoice sent at T2
      await ctx.db.insert("invoices", {
        status: "final",
        customerId: cid,
        generatedBy: userId,
        generatedAt: T2,
        updatedAt: T2,
        sellerName: "PT Frollie",
        bankName: "BCA",
        bankAccountNumber: "123",
        bankAccountName: "BCA Frollie",
        buyerName: "Cafe Timeline",
        orderNumber: "INV-001",
        orderDate: T2,
        items: [],
        subtotal: 100000,
        finalTotal: 100000,
        paymentStatus: "Unpaid",
      } as never);

      // Subscription started at T1
      const sid = await ctx.db.insert("subscriptions", {
        ...SUB_DEFAULTS,
        customerId: cid,
        status: "active",
        startDate: T1,
        createdBy: userId,
      } as never);

      // Subscription week (needed for ledger)
      const wid = await ctx.db.insert("subscriptionWeeks", {
        subscriptionId: sid,
        weekStart: NOW - 7 * 86_400_000,
        weekEnd: NOW,
        status: "planned",
        plannedDays: [],
        creditIssued: 0,
        creditConsumed: 0,
        creditRemaining: 0,
        creditExpired: 0,
        shortfall: 0,
        shortfallFault: "none",
        refundDue: 0,
      } as never);

      // Topup at T3 (ledger entry)
      await ctx.db.insert("creditLedger", {
        subscriptionId: sid,
        subscriptionWeekId: wid,
        type: "topup",
        amount: 200000,
        balanceAfter: 200000,
        createdBy: userId,
      } as never);

      // Agreement uploaded at T3
      await ctx.db.insert("supplyAgreements", {
        customerId: cid,
        subscriptionId: sid,
        fileStorageId,
        fileName: "agreement.pdf",
        fileSize: 1024,
        uploadedBy: userId,
        uploadedAt: T3,
        status: "draft",
      } as never);

      // Logged whatsapp activity at T4
      await ctx.db.insert("customerActivity", {
        customerId: cid,
        type: "whatsapp_drafted",
        direction: "outbound",
        at: T4,
        actor: userId,
        summary: "Follow-up sent",
      } as never);

      return { customerId: cid };
    });

    const result = await t.query(getCustomerTimelineRef, {
      sessionId,
      customerId,
    });

    expect(result.items.length).toBeGreaterThanOrEqual(5);

    // All items sorted DESC by at — verify each consecutive pair
    for (let i = 0; i < result.items.length - 1; i++) {
      expect(result.items[i].at).toBeGreaterThanOrEqual(result.items[i + 1].at);
    }

    // Verify key event types are present
    const eventTypes = result.items.map((item: { eventType: string }) => item.eventType);
    expect(eventTypes).toContain("order_placed");
    expect(eventTypes).toContain("invoice_sent");
    expect(eventTypes).toContain("subscription_started");
    expect(eventTypes).toContain("topup");
    expect(eventTypes).toContain("agreement_uploaded");
    expect(eventTypes).toContain("whatsapp_drafted");
  });

  it("actor names resolved from batched Map (not per-row fetch)", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "manager", "Mgr Actor");
    const managerName = "Mgr Actor";

    const NOW = Date.now();
    const T1 = NOW - 5 * 86_400_000;

    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", { name: "Cafe Actor", createdBy: "test" } as never),
    );

    // Insert a logged activity by this user
    await t.run(async (ctx) =>
      ctx.db.insert("customerActivity", {
        customerId,
        type: "note",
        direction: "outbound",
        at: T1,
        actor: userId,
        summary: "Actor test note",
      } as never),
    );

    const result = await t.query(getCustomerTimelineRef, {
      sessionId,
      customerId,
    });

    const noteItem = result.items.find(
      (item: { eventType: string }) => item.eventType === "note",
    );
    expect(noteItem).toBeDefined();
    expect(noteItem!.actor).toBe(managerName);
  });

  it("14-day window excludes older items", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "manager", "Mgr Window");

    const NOW = Date.now();
    const RECENT = NOW - 5 * 86_400_000;
    const OLD = NOW - 20 * 86_400_000; // outside 14-day window

    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", { name: "Cafe Window", createdBy: "test" } as never),
    );

    await t.run(async (ctx) => {
      // Recent activity — should be included
      await ctx.db.insert("customerActivity", {
        customerId,
        type: "note",
        direction: "outbound",
        at: RECENT,
        actor: userId,
        summary: "Recent note",
      } as never);

      // Old activity — must be excluded by 14-day window
      await ctx.db.insert("customerActivity", {
        customerId,
        type: "whatsapp_drafted",
        direction: "outbound",
        at: OLD,
        actor: userId,
        summary: "Old message",
      } as never);
    });

    const result = await t.query(getCustomerTimelineRef, {
      sessionId,
      customerId,
      sinceDays: 14,
    });

    const loggedItems = result.items.filter(
      (item: { eventType: string }) => item.eventType === "note" || item.eventType === "whatsapp_drafted",
    );
    const summaries = loggedItems.map((item: { title: string }) => item.title);

    // Recent note present, old whatsapp absent (windowed by customerActivity index)
    const hasRecent = summaries.some((s: string) => s.includes("Recent note"));
    const hasOld = summaries.some((s: string) => s.includes("Old message"));
    expect(hasRecent).toBe(true);
    expect(hasOld).toBe(false);
  });

  it("types filter narrows to requested category", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createSession(t, "manager", "Mgr Filter");

    const NOW = Date.now();
    const T1 = NOW - 3 * 86_400_000;
    const T2 = NOW - 2 * 86_400_000;

    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", { name: "Cafe Filter", createdBy: "test" } as never),
    );

    await t.run(async (ctx) => {
      // message-type activity
      await ctx.db.insert("customerActivity", {
        customerId,
        type: "whatsapp_drafted",
        direction: "outbound",
        at: T1,
        actor: userId,
        summary: "WhatsApp sent",
      } as never);

      // milestone-type activity
      await ctx.db.insert("customerActivity", {
        customerId,
        type: "manual_milestone",
        direction: "system",
        at: T2,
        actor: userId,
        summary: "Onboarded",
      } as never);
    });

    // Filter to "message" only — should get whatsapp, not milestone
    const result = await t.query(getCustomerTimelineRef, {
      sessionId,
      customerId,
      types: ["message"],
    });

    const eventTypes = result.items.map((item: { eventType: string }) => item.eventType);
    expect(eventTypes).toContain("whatsapp_drafted");
    expect(eventTypes).not.toContain("manual_milestone");
  });

  it("order_staff → Unauthorized", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await createSession(t, "order_staff", "Staff Timeline");

    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", { name: "Cafe Staff TL", createdBy: "test" } as never),
    );

    await expect(
      t.query(getCustomerTimelineRef, { sessionId, customerId }),
    ).rejects.toThrow(/Unauthorized/);
  });
});
