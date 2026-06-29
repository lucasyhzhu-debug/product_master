/**
 * TDD tests for the normalized multi-field dedup in createCustomer.
 *
 * T3: dedup-on-create across phone/whatsapp/altPhone using normalizePhone/phoneMatches.
 *
 * Auth harness mirrors convex/crm/__tests__/customers.test.ts (createSession pattern).
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import type { SessionId } from "convex-helpers/server/sessions";
import { anyApi } from "convex/server";
import schema from "../../schema";
import type { Id } from "../../_generated/dataModel";

const createCustomerRef = anyApi.crm.customers.createCustomer;

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

// ---------------------------------------------------------------------------
// Normalized multi-field dedup tests
// ---------------------------------------------------------------------------

describe("createCustomer normalized dedup", () => {
  it("(d) whatsapp matches existing phone (with formatting) → dedup, no 2nd row, gap-fills name", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await createSession(t, "manager", "Mgr Dedup D");

    // Seed existing customer with plain phone.
    const existingId = await t.run(async (ctx) =>
      ctx.db.insert("customers", {
        name: "Cafe Original",
        phone: "081200001111",
        createdBy: "seeder",
      } as never),
    );

    // Create with whatsapp in +62 country-code form — should normalize to same digits.
    const returnedId = (await t.mutation(createCustomerRef, {
      sessionId,
      name: "Cafe WA Variant",
      whatsapp: "+62 812 0000 1111",
      companyName: "Cafe Corp",
    })) as Id<"customers">;

    expect(returnedId).toBe(existingId);

    const rows = await t.run((ctx) => ctx.db.query("customers").collect());
    expect(rows).toHaveLength(1);

    // Gap-filled: companyName was empty → now set.
    const doc = await t.run((ctx) => ctx.db.get(existingId));
    expect(doc?.companyName).toBe("Cafe Corp");

    // name was non-empty → NOT overwritten.
    expect(doc?.name).toBe("Cafe Original");
  });

  it("(e) new phone matches existing whatsapp → dedup (existing has whatsapp, new provides phone)", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await createSession(t, "manager", "Mgr Dedup E");

    // Seed existing customer with whatsapp only (no phone).
    const existingId = await t.run(async (ctx) =>
      ctx.db.insert("customers", {
        name: "Cafe WA Only",
        whatsapp: "+62 813 5555 6666",
        createdBy: "seeder",
      } as never),
    );

    // Create with phone matching existing whatsapp.
    const returnedId = (await t.mutation(createCustomerRef, {
      sessionId,
      name: "Should Dedup",
      phone: "0813-5555-6666",
    })) as Id<"customers">;

    expect(returnedId).toBe(existingId);

    const rows = await t.run((ctx) => ctx.db.query("customers").collect());
    expect(rows).toHaveLength(1);

    // Gap-fill: existing had no phone → phone is now set.
    const doc = await t.run((ctx) => ctx.db.get(existingId));
    expect(doc?.phone).toBe("0813-5555-6666");
  });

  it("(f) altPhone matches existing phone → dedup", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await createSession(t, "manager", "Mgr Dedup F");

    const existingId = await t.run(async (ctx) =>
      ctx.db.insert("customers", {
        name: "Cafe Alt",
        phone: "08211112222",
        createdBy: "seeder",
      } as never),
    );

    const returnedId = (await t.mutation(createCustomerRef, {
      sessionId,
      name: "Cafe Alt Duplicate",
      altPhone: "+6282 1111 2222",
    })) as Id<"customers">;

    expect(returnedId).toBe(existingId);

    const rows = await t.run((ctx) => ctx.db.query("customers").collect());
    expect(rows).toHaveLength(1);
  });

  it("(g) new altPhone matches existing altPhone → dedup", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await createSession(t, "manager", "Mgr Dedup G");

    const existingId = await t.run(async (ctx) =>
      ctx.db.insert("customers", {
        name: "Cafe AltAlt",
        altPhone: "082233334444",
        createdBy: "seeder",
      } as never),
    );

    const returnedId = (await t.mutation(createCustomerRef, {
      sessionId,
      name: "Cafe AltAlt Dup",
      altPhone: "+62 822-3333-4444",
    })) as Id<"customers">;

    expect(returnedId).toBe(existingId);
    const rows = await t.run((ctx) => ctx.db.query("customers").collect());
    expect(rows).toHaveLength(1);
  });

  it("(h) no number overlap → inserts new row", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await createSession(t, "manager", "Mgr Dedup H");

    await t.run(async (ctx) =>
      ctx.db.insert("customers", {
        name: "Existing Cafe",
        phone: "08100001111",
        createdBy: "seeder",
      } as never),
    );

    await t.mutation(createCustomerRef, {
      sessionId,
      name: "Different Cafe",
      phone: "08199998888",
    });

    const rows = await t.run((ctx) => ctx.db.query("customers").collect());
    expect(rows).toHaveLength(2);
  });

  it("(j) prefix-substring MUST NOT dedup different numbers (false-merge guard)", async () => {
    // "08121" normalizes to "8121"; "0812111122" normalizes to "812111122".
    // "812111122".includes("8121") is TRUE (substring), but these are DIFFERENT customers.
    // This test confirms dedup uses equality, not substring containment.
    const t = convexTest(schema, modules);
    const { sessionId } = await createSession(t, "manager", "Mgr Dedup J");

    await t.run(async (ctx) =>
      ctx.db.insert("customers", {
        name: "Long Number Cafe",
        phone: "0812111122",
        createdBy: "seeder",
      } as never),
    );

    // "08121" is a PREFIX of the existing number — different customer, must NOT dedup.
    await t.mutation(createCustomerRef, {
      sessionId,
      name: "Short Prefix Cafe",
      phone: "08121",
    });

    const rows = await t.run((ctx) => ctx.db.query("customers").collect());
    expect(rows).toHaveLength(2);
  });

  it("(i) exact-phone dedup still works after normalized scan replaces indexed lookup", async () => {
    const t = convexTest(schema, modules);
    const { sessionId } = await createSession(t, "manager", "Mgr Dedup I");

    const existingId = await t.run(async (ctx) =>
      ctx.db.insert("customers", {
        name: "Exact Cafe",
        phone: "08500009999",
        createdBy: "seeder",
      } as never),
    );

    const returnedId = (await t.mutation(createCustomerRef, {
      sessionId,
      name: "Exact Cafe Dup",
      phone: "08500009999",
    })) as Id<"customers">;

    expect(returnedId).toBe(existingId);
    const rows = await t.run((ctx) => ctx.db.query("customers").collect());
    expect(rows).toHaveLength(1);
  });
});
