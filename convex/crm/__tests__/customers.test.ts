/**
 * Tests for convex/crm/customers.ts — T5 updateCustomerCrmFields.
 *
 * Auth pattern: insert user + session via t.run(), pass sessionId to protectedMutation.
 * References: convex/subscriptions/__tests__/invoicing.test.ts (createSession helper pattern).
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import type { SessionId } from "convex-helpers/server/sessions";
import { anyApi } from "convex/server";
import schema from "../../schema";
import type { Id } from "../../_generated/dataModel";

// Function references via anyApi — used because convex/crm/customers.ts is not
// yet in _generated/api.d.ts (codegen runs on `convex dev`). anyApi provides a
// dynamic Proxy that produces valid function references for convex-test.
const crmCustomersApi = anyApi.crm.customers as {
  updateCustomerCrmFields: (typeof anyApi)["crm"]["customers"]["updateCustomerCrmFields"];
};

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

    const returned = await t.mutation(crmCustomersApi.updateCustomerCrmFields, {
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

    await t.mutation(crmCustomersApi.updateCustomerCrmFields, {
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
    await t.mutation(crmCustomersApi.updateCustomerCrmFields, {
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
      t.mutation(crmCustomersApi.updateCustomerCrmFields, {
        sessionId,
        customerId,
        whatsapp: "+629000000000",
      }),
    ).rejects.toThrow(/Unauthorized/);
  });
});
