/**
 * bankKeywordRules seed + CRUD integration tests (Plan 72-04 Task 1).
 *
 * Scenarios:
 *  1. Seed with all 20 accounts present → 26 rules inserted.
 *  2. Idempotency → second run reports all 26 as "updated"; no duplicates.
 *  3. Seed with one account missing → ConvexError, NO rules inserted.
 *  4. Account-ref resolution (R02) → categoryAccountId === accounts._id of
 *     "Revenue — GoPay / GoFood".
 *  5. Unauthorized caller (non-admin token) → requireRole throws.
 *  6. Catch-all regression guard: exactly ONE rule has isCatchAll=true and it
 *     is R01 (T-72-14 mitigation).
 *  7. `create` rejects malformed ruleCode ("ABC").
 *  8. `create` rejects duplicate ruleCode.
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { DEFAULT_ACCOUNT_REFS, DEFAULT_RULES } from "../defaultRules";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TestT = ReturnType<typeof convexTest>;

/**
 * Seed all 20 account refs so bankKeywordRules:seedDefaults can resolve them.
 * Optionally skip one ref to exercise fail-loud.
 */
async function seedAccounts(t: TestT, skip?: string) {
  await t.run(async (ctx) => {
    for (const { accountName } of DEFAULT_ACCOUNT_REFS) {
      if (accountName === skip) continue;
      await ctx.db.insert("accounts", {
        code: `9${Math.floor(Math.random() * 1000)}`,
        name: accountName,
        type: "asset",
        category: "Test",
        isActive: true,
        isSystem: true,
      } as never);
    }
  });
}

/**
 * Seed a bare admin user (no session) so `resolveSeederUserId` can fall back
 * to it when seedDefaults is invoked without a token (dashboard path).
 */
async function seedBareAdminUser(t: TestT) {
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      name: "System Admin",
      pinHash: "salt:hash",
      role: "admin",
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    } as never);
  });
}

async function seedAdminUserAndSession(t: TestT): Promise<string> {
  const sessionId = `test-session-admin-${Date.now()}-${Math.random()}`;
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Test Admin",
      pinHash: "salt:hash",
      role: "admin",
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    } as never);
    await ctx.db.insert("sessions", {
      userId,
      token: sessionId,
      expiresAt: Date.now() + 8 * 3600 * 1000,
      createdAt: Date.now(),
    } as never);
  });
  return sessionId;
}

async function seedKitchenUserAndSession(t: TestT): Promise<string> {
  const sessionId = `test-session-kitchen-${Date.now()}-${Math.random()}`;
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Test Kitchen",
      pinHash: "salt:hash",
      role: "kitchen",
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    } as never);
    await ctx.db.insert("sessions", {
      userId,
      token: sessionId,
      expiresAt: Date.now() + 8 * 3600 * 1000,
      createdAt: Date.now(),
    } as never);
  });
  return sessionId;
}

// ---------------------------------------------------------------------------
// Data-level guards (no runtime needed)
// ---------------------------------------------------------------------------

describe("DEFAULT_RULES data integrity", () => {
  it("has exactly 26 rules", () => {
    expect(DEFAULT_RULES).toHaveLength(26);
  });

  it("has exactly ONE catch-all rule (R01)", () => {
    // Regression guard against future accidental multi-catch-all.
    // The match engine segregates catch-all BEFORE sorting (T-72-14) —
    // a second catch-all would silently break ordering semantics.
    const catchAlls = DEFAULT_RULES.filter((r) => r.isCatchAll);
    expect(catchAlls.length).toBe(1);
    expect(catchAlls[0].ruleCode).toBe("R01");
  });

  it("all rule codes are unique", () => {
    const codes = DEFAULT_RULES.map((r) => r.ruleCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("all rule codes match /^[A-Z]\\d{2}$/", () => {
    for (const r of DEFAULT_RULES) {
      expect(r.ruleCode).toMatch(/^[A-Z]\d{2}$/);
    }
  });

  it("contains the canonical 26 rule codes", () => {
    const codes = new Set(DEFAULT_RULES.map((r) => r.ruleCode));
    const expected = [
      "R01", "R02", "R03", "R04", "R05", "R06", "R07", "R08", "R09", "R10", "R11", "R12",
      "C01", "C02", "C03",
      "O01", "O02", "O03", "O04", "O05", "O06", "O07", "O08", "O09",
      "B01", "B02",
    ];
    for (const code of expected) {
      expect(codes.has(code)).toBe(true);
    }
  });

  it("references exactly 20 logical account refs", () => {
    expect(DEFAULT_ACCOUNT_REFS).toHaveLength(20);
  });

  it("every rule's categoryRef, jeDebitRef, jeCreditRef resolve to a known account ref", () => {
    const known = new Set(DEFAULT_ACCOUNT_REFS.map((r) => r.ref));
    for (const r of DEFAULT_RULES) {
      expect(known.has(r.categoryRef)).toBe(true);
      expect(known.has(r.jeDebitRef)).toBe(true);
      expect(known.has(r.jeCreditRef)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// seedDefaults integration tests
// ---------------------------------------------------------------------------

describe("bankKeywordRules:seedDefaults", () => {
  it("inserts all 26 rules when all 20 account refs resolve", async () => {
    const t = convexTest(schema);
    await seedAccounts(t);
    await seedBareAdminUser(t);

    const results = await t.mutation(api.bankKeywordRules.mutations.seedDefaults, {});
    expect(results).toHaveLength(26);
    expect(results.every((r) => r.action === "created")).toBe(true);

    const count = await t.run(async (ctx) =>
      (await ctx.db.query("bankKeywordRules").collect()).length,
    );
    expect(count).toBe(26);
  });

  it("is idempotent — second run reports all 26 as 'updated' with no duplicates", async () => {
    const t = convexTest(schema);
    await seedAccounts(t);
    await seedBareAdminUser(t);

    await t.mutation(api.bankKeywordRules.mutations.seedDefaults, {});
    const second = await t.mutation(api.bankKeywordRules.mutations.seedDefaults, {});
    expect(second).toHaveLength(26);
    expect(second.every((r) => r.action === "updated")).toBe(true);

    const count = await t.run(async (ctx) =>
      (await ctx.db.query("bankKeywordRules").collect()).length,
    );
    expect(count).toBe(26);
  });

  it("fails loudly and inserts NO rules when an account ref is missing", async () => {
    const t = convexTest(schema);
    await seedAccounts(t, "Revenue — GoPay / GoFood");

    await expect(
      t.mutation(api.bankKeywordRules.mutations.seedDefaults, {}),
    ).rejects.toThrow(/unresolved account refs/);

    // Atomicity: no partial seed.
    const count = await t.run(async (ctx) =>
      (await ctx.db.query("bankKeywordRules").collect()).length,
    );
    expect(count).toBe(0);
  });

  it("resolves R02.categoryAccountId to the 'Revenue — GoPay / GoFood' account", async () => {
    const t = convexTest(schema);
    await seedAccounts(t);
    await seedBareAdminUser(t);

    await t.mutation(api.bankKeywordRules.mutations.seedDefaults, {});

    const r02 = await t.run(async (ctx) =>
      await ctx.db
        .query("bankKeywordRules")
        .withIndex("by_ruleCode", (q) => q.eq("ruleCode", "R02"))
        .first(),
    );
    expect(r02).not.toBeNull();

    const gopayAccount = await t.run(async (ctx) =>
      await ctx.db
        .query("accounts")
        .withIndex("by_name", (q) => q.eq("name", "Revenue — GoPay / GoFood"))
        .first(),
    );
    expect(gopayAccount).not.toBeNull();
    expect(r02!.categoryAccountId).toBe(gopayAccount!._id);
  });

  it("rejects a non-admin caller (kitchen role) when a token is supplied", async () => {
    const t = convexTest(schema);
    await seedAccounts(t);
    const kitchenToken = await seedKitchenUserAndSession(t);

    await expect(
      t.mutation(api.bankKeywordRules.mutations.seedDefaults, { token: kitchenToken }),
    ).rejects.toThrow(/Not authorized/);
  });
});

// ---------------------------------------------------------------------------
// create / update / deactivate (protectedMutation)
// ---------------------------------------------------------------------------

describe("bankKeywordRules:create — validation + auth", () => {
  async function setupWithSeed(): Promise<{ t: TestT; sessionId: string; accountId: string }> {
    const t = convexTest(schema);
    await seedAccounts(t);
    const sessionId = await seedAdminUserAndSession(t);

    // Grab any seeded account id for rule referents.
    const account = await t.run(async (ctx) =>
      await ctx.db.query("accounts").first(),
    );
    return { t, sessionId, accountId: account!._id };
  }

  it("rejects a ruleCode not matching /^[A-Z]\\d{2}$/", async () => {
    const { t, sessionId, accountId } = await setupWithSeed();

    await expect(
      t.mutation(api.bankKeywordRules.mutations.create, {
        sessionId,
        ruleCode: "ABC", // invalid
        plSection: "OpEx",
        direction: "debit",
        matchType: "description_contains",
        descriptionPatterns: ["foo"],
        descriptionPatternsMode: "any",
        isCatchAll: false,
        categoryAccountId: accountId as never,
        jeDebitAccountId: accountId as never,
        jeCreditAccountId: accountId as never,
        confidence: "strong",
        priority: 50,
        isActive: true,
      }),
    ).rejects.toThrow(/Invalid ruleCode/);
  });

  it("rejects a duplicate ruleCode", async () => {
    const { t, sessionId, accountId } = await setupWithSeed();

    // R01 already seeded. Admin session already exists so no-token path can fall back.
    await t.mutation(api.bankKeywordRules.mutations.seedDefaults, {});

    await expect(
      t.mutation(api.bankKeywordRules.mutations.create, {
        sessionId,
        ruleCode: "R01",
        plSection: "Revenue",
        direction: "credit",
        matchType: "catch_all",
        descriptionPatternsMode: "hint",
        isCatchAll: true,
        categoryAccountId: accountId as never,
        jeDebitAccountId: accountId as never,
        jeCreditAccountId: accountId as never,
        confidence: "suggested",
        priority: 20,
        isActive: true,
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("creates a valid new rule with admin session", async () => {
    const { t, sessionId, accountId } = await setupWithSeed();

    const newId = await t.mutation(api.bankKeywordRules.mutations.create, {
      sessionId,
      ruleCode: "Z99",
      plSection: "OpEx",
      direction: "debit",
      matchType: "description_contains",
      descriptionPatterns: ["custom"],
      descriptionPatternsMode: "any",
      isCatchAll: false,
      categoryAccountId: accountId as never,
      jeDebitAccountId: accountId as never,
      jeCreditAccountId: accountId as never,
      confidence: "suggested",
      priority: 10,
      isActive: true,
    });
    expect(newId).toBeDefined();
  });
});
