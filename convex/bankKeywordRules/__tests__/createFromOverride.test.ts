/**
 * createFromOverride mutation tests — Phase 73 Plan 02 Wave 0.
 *
 * Contract (D-10/D-11/D-12):
 *  - manager + admin can invoke; order_staff / kitchen rejected.
 *  - Validates ruleCode against /^[A-Z]\d{2}$/.
 *  - Rejects duplicate ruleCode.
 *  - Catch-all uniqueness guard preserved (same as existing plain create).
 *  - createdBy is populated from session user (ctx.user._id).
 *
 * Note: Plain CRUD (create/update/deactivate) stays admin-only per D-23 + P72 D-19 —
 * those tests already exist in seed.test.ts and are NOT re-tested here.
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

type TestT = ReturnType<typeof convexTest>;

async function seedAccount(t: TestT): Promise<Id<"accounts">> {
  return await t.run(async (ctx) => {
    return (await ctx.db.insert("accounts", {
      code: "6199",
      name: "Test Account",
      type: "opex",
      category: "OpEx",
      isActive: true,
      isSystem: false,
    } as never)) as Id<"accounts">;
  });
}

async function seedUserWithToken(
  t: TestT,
  role: "admin" | "manager" | "order_staff" | "kitchen",
): Promise<{ token: string; userId: Id<"users"> }> {
  const token = `token-${role}-${Date.now()}-${Math.random()}`;
  const userId = await t.run(async (ctx) => {
    const uid = await ctx.db.insert("users", {
      name: `Test ${role}`,
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
  return { token, userId };
}

function validArgs(accountId: Id<"accounts">, ruleCode = "Z50") {
  return {
    ruleCode,
    plSection: "OpEx" as const,
    direction: "debit" as const,
    matchType: "description_contains" as const,
    descriptionPatterns: ["learnt-from-override"],
    descriptionPatternsMode: "any" as const,
    isCatchAll: false,
    categoryAccountId: accountId,
    jeDebitAccountId: accountId,
    jeCreditAccountId: accountId,
    confidence: "suggested" as const,
    priority: 40,
    isActive: true,
  };
}

describe("createFromOverride", () => {
  it("manager role can create rule via createFromOverride (D-12)", async () => {
    const t = convexTest(schema);
    const accountId = await seedAccount(t);
    const { token, userId } = await seedUserWithToken(t, "manager");

    const newId = await t.mutation(api.bankKeywordRules.mutations.createFromOverride, {
      token,
      ...validArgs(accountId, "M01"),
    });
    expect(newId).toBeDefined();

    const rule = await t.run(async (ctx) => ctx.db.get(newId as Id<"bankKeywordRules">));
    expect(rule).toBeTruthy();
    expect(rule!.ruleCode).toBe("M01");
    expect(rule!.createdBy).toBe(userId);
  });

  it("admin role can create rule via createFromOverride", async () => {
    const t = convexTest(schema);
    const accountId = await seedAccount(t);
    const { token } = await seedUserWithToken(t, "admin");

    const newId = await t.mutation(api.bankKeywordRules.mutations.createFromOverride, {
      token,
      ...validArgs(accountId, "A01"),
    });
    expect(newId).toBeDefined();
  });

  it("order_staff rejected", async () => {
    const t = convexTest(schema);
    const accountId = await seedAccount(t);
    const { token } = await seedUserWithToken(t, "order_staff");

    await expect(
      t.mutation(api.bankKeywordRules.mutations.createFromOverride, {
        token,
        ...validArgs(accountId, "Z10"),
      }),
    ).rejects.toThrow();
  });

  it("kitchen rejected", async () => {
    const t = convexTest(schema);
    const accountId = await seedAccount(t);
    const { token } = await seedUserWithToken(t, "kitchen");

    await expect(
      t.mutation(api.bankKeywordRules.mutations.createFromOverride, {
        token,
        ...validArgs(accountId, "Z11"),
      }),
    ).rejects.toThrow();
  });

  it("rejects invalid ruleCode (not /^[A-Z]\\d{2}$/)", async () => {
    const t = convexTest(schema);
    const accountId = await seedAccount(t);
    const { token } = await seedUserWithToken(t, "manager");

    await expect(
      t.mutation(api.bankKeywordRules.mutations.createFromOverride, {
        token,
        ...validArgs(accountId, "bad-code"),
      }),
    ).rejects.toThrow(/Invalid ruleCode/);
  });

  it("rejects duplicate ruleCode", async () => {
    const t = convexTest(schema);
    const accountId = await seedAccount(t);
    const { token } = await seedUserWithToken(t, "manager");

    await t.mutation(api.bankKeywordRules.mutations.createFromOverride, {
      token,
      ...validArgs(accountId, "D01"),
    });
    await expect(
      t.mutation(api.bankKeywordRules.mutations.createFromOverride, {
        token,
        ...validArgs(accountId, "D01"),
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("catch-all uniqueness guard enforced (same as plain create)", async () => {
    const t = convexTest(schema);
    const accountId = await seedAccount(t);
    const { token } = await seedUserWithToken(t, "admin");

    await t.mutation(api.bankKeywordRules.mutations.createFromOverride, {
      token,
      ...validArgs(accountId, "C01"),
      matchType: "catch_all",
      isCatchAll: true,
      direction: "debit",
    });
    // A second active catch-all overlapping on direction MUST throw.
    await expect(
      t.mutation(api.bankKeywordRules.mutations.createFromOverride, {
        token,
        ...validArgs(accountId, "C02"),
        matchType: "catch_all",
        isCatchAll: true,
        direction: "debit",
      }),
    ).rejects.toThrow(/catch-all/i);
  });

  it("createdBy populated from session user", async () => {
    const t = convexTest(schema);
    const accountId = await seedAccount(t);
    const { token, userId } = await seedUserWithToken(t, "manager");

    const newId = await t.mutation(api.bankKeywordRules.mutations.createFromOverride, {
      token,
      ...validArgs(accountId, "U01"),
    });
    const rule = await t.run(async (ctx) => ctx.db.get(newId as Id<"bankKeywordRules">));
    expect(rule!.createdBy).toBe(userId);
  });
});
