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
