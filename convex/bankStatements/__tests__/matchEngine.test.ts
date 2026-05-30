/**
 * Match engine tests (Plan 72-03).
 *
 * Covers:
 * - Layer A: 26 positive rule fixtures (R01..R12, C01..C03, O01..O09, B01..B02),
 *   ordering (priority DESC, ruleCode ASC, catch-all segregated),
 *   direction-sensitive, ambiguity, hint-mode elevation, catch-all semantics.
 * - Layer B: convex-test-driven linkage against expenses, externalRevenue,
 *   reimbursementBatches, payrollEntries with ±3 day / ±14 day (payroll)
 *   windows and the 0.8 fuzzy threshold. related_party payroll skip.
 */

import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import {
  classifyLine,
  computeConfidence,
  findLinkedRecord,
  type BankKeywordRule,
} from "../matchEngine";
import { readFileSync } from "fs";
import { join } from "path";
import type { Id } from "../../_generated/dataModel";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

// Dummy Convex IDs used only where the type requires them in Layer A tests.
// Layer A never calls ctx.db — these are never resolved.
const DUMMY_ACCOUNT_ID = "dummy_account_id" as unknown as Id<"accounts">;
const DUMMY_USER_ID = "dummy_user_id" as unknown as Id<"users">;
const DUMMY_RULE_ID = (code: string) => code as unknown as Id<"bankKeywordRules">;

type RuleJson = {
  ruleCode: string;
  plSection: "Revenue" | "COGS" | "OpEx" | "Below the Line";
  direction: "debit" | "credit" | "any";
  matchType:
    | "counterparty"
    | "description_contains"
    | "description_exact"
    | "description_regex"
    | "counterparty_or_keyword"
    | "counterparty_and_keyword"
    | "catch_all";
  counterpartyPatterns: string[] | null;
  descriptionPatterns: string[];
  descriptionPatternsMode: "any" | "all" | "hint";
  isCatchAll?: boolean;
  confidence: "exact" | "strong" | "suggested";
  priority: number;
  isActive: boolean;
  linkedChannel?: string;
  flags?: string[];
};

// Fixture lives alongside the test (NOT in .planning/) so milestone archival of
// phase dirs can't break it — it previously read from
// .planning/phases/72-bank-statement-parser-auto-match/ and broke when that phase
// was archived to .planning/milestones/v2.0-phases/.
const SEED_RULES_PATH = join(__dirname, "./fixtures/72-SEED-RULES.json");
const seedRulesJson = JSON.parse(readFileSync(SEED_RULES_PATH, "utf-8")) as {
  rules: RuleJson[];
};

/**
 * Build a minimal-but-complete BankKeywordRule (schema-valid shape) for
 * Layer A tests. The ruleCode is reused as a fake document ID to enable
 * identity comparisons in assertions.
 */
function buildRule(overrides: Partial<BankKeywordRule> & { ruleCode: string }): BankKeywordRule {
  return {
    _id: DUMMY_RULE_ID(overrides.ruleCode),
    _creationTime: 0,
    ruleCode: overrides.ruleCode,
    plSection: overrides.plSection ?? "OpEx",
    direction: overrides.direction ?? "any",
    matchType: overrides.matchType ?? "description_contains",
    counterpartyPatterns: overrides.counterpartyPatterns,
    descriptionPatterns: overrides.descriptionPatterns,
    descriptionPatternsMode: overrides.descriptionPatternsMode ?? "any",
    isCatchAll: overrides.isCatchAll ?? false,
    categoryAccountId: overrides.categoryAccountId ?? DUMMY_ACCOUNT_ID,
    subCategoryTemplate: overrides.subCategoryTemplate,
    jeDebitAccountId: overrides.jeDebitAccountId ?? DUMMY_ACCOUNT_ID,
    jeCreditAccountId: overrides.jeCreditAccountId ?? DUMMY_ACCOUNT_ID,
    linkedChannel: overrides.linkedChannel,
    confidence: overrides.confidence ?? "strong",
    priority: overrides.priority ?? 40,
    flags: overrides.flags,
    isActive: overrides.isActive ?? true,
    createdBy: overrides.createdBy ?? DUMMY_USER_ID,
    createdAt: overrides.createdAt ?? 0,
    updatedAt: overrides.updatedAt,
    updatedBy: overrides.updatedBy,
  } as BankKeywordRule;
}

/**
 * Load all 26 rules from the SEED-RULES.json and convert to BankKeywordRule
 * shape using buildRule. Used for the positive-fixture suite.
 */
function loadSeedRules(): BankKeywordRule[] {
  const rulesJson = seedRulesJson.rules;
  return rulesJson.map((r) =>
    buildRule({
      ruleCode: r.ruleCode,
      plSection: r.plSection,
      direction: r.direction,
      matchType: r.matchType,
      counterpartyPatterns: r.counterpartyPatterns ?? undefined,
      descriptionPatterns: r.descriptionPatterns,
      descriptionPatternsMode: r.descriptionPatternsMode,
      isCatchAll: r.isCatchAll ?? false,
      confidence: r.confidence,
      priority: r.priority,
      flags: r.flags,
      linkedChannel: r.linkedChannel,
      isActive: r.isActive,
    }),
  );
}

// ---------------------------------------------------------------------------
// Layer A — 26 positive rule fixtures (one per rule)
// ---------------------------------------------------------------------------

describe("classifyLine — 26 positive rule fixtures (one per rule)", () => {
  const rules = loadSeedRules();

  const positiveCases: Array<{ ruleCode: string; desc: string; dir: "debit" | "credit" }> = [
    { ruleCode: "R01", desc: "TRANSFER FROM UNKNOWN COUNTERPARTY", dir: "credit" },
    { ruleCode: "R02", desc: "DOMPET ANAK BANGSA WLST G293156297", dir: "credit" },
    { ruleCode: "R03", desc: "VISIONET INTERNASI 6044830994", dir: "credit" },
    { ruleCode: "R04", desc: "TOKOPEDIA PT WD TKPD", dir: "credit" },
    { ruleCode: "R05", desc: "AIRPAY INTERNATION 200008203", dir: "credit" },
    { ruleCode: "R06", desc: "KATIGA RITEL STREN ATSCY REF:123", dir: "credit" },
    { ruleCode: "R07", desc: "SKALA PANGAN INDON Rev shar frollie", dir: "credit" },
    { ruleCode: "R08", desc: "KR OTOMATIS NTRF@ AFR", dir: "credit" },
    { ruleCode: "R09", desc: "BI-FAST CR TRANSFER from someone", dir: "credit" },
    { ruleCode: "R10", desc: "refund ongkir chewy", dir: "debit" },
    { ruleCode: "R11", desc: "CLARITA RAQUEL AMA Ruma 52", dir: "credit" },
    { ruleCode: "R12", desc: "NIDIA O L ATAU ELI Thirdhome Chewy", dir: "credit" },
    { ruleCode: "C01", desc: "KEVIN YOSUA ingredients marshmallow", dir: "debit" },
    { ruleCode: "C02", desc: "NIU ULUNG Mochi Packaging", dir: "debit" },
    { ruleCode: "C03", desc: "PIERRE KEVIN ANGEL Fee Pierre Porudksi", dir: "debit" },
    { ruleCode: "O01", desc: "MADELYNNE salary", dir: "debit" },
    { ruleCode: "O02", desc: "PIERRE KEVIN ANGEL Ongkir chewy", dir: "debit" },
    { ruleCode: "O03", desc: "TRSF E-BANKING DB /LALAMOVE/123", dir: "debit" },
    { ruleCode: "O04", desc: "TRSF E-BANKING DB /OVO VA 12345", dir: "debit" },
    { ruleCode: "O05", desc: "PILAR PRATAMA MAND Printing Sticker", dir: "debit" },
    { ruleCode: "O06", desc: "TRSF E-BANKING DB /SHOPEE 12608", dir: "debit" },
    { ruleCode: "O07", desc: "TRSF E-BANKING DB /TOKOPEDIA 80777", dir: "debit" },
    { ruleCode: "O08", desc: "DEBORA FEBRIANTI H Name paten", dir: "debit" },
    { ruleCode: "O09", desc: "BIAYA ADM", dir: "debit" },
    { ruleCode: "B01", desc: "Setup Machine extruder mesin", dir: "debit" },
    { ruleCode: "B02", desc: "RISTIANA ETENG BI-FAST DB TRANSFER", dir: "debit" },
  ];

  for (const tc of positiveCases) {
    it(`${tc.ruleCode} matches its positive fixture`, () => {
      const result = classifyLine(
        {
          rawDescription: tc.desc,
          direction: tc.dir,
          amountIdr: 100000,
          date: Date.now(),
        },
        rules,
      );
      expect(result).not.toBeNull();
      expect(result!.rule.ruleCode).toBe(tc.ruleCode);
    });
  }
});

// ---------------------------------------------------------------------------
// Layer A — ordering / priority / catch-all segregation
// ---------------------------------------------------------------------------

describe("classifyLine — ordering and catch-all segregation", () => {
  it("higher priority non-catch-all wins on overlapping description", () => {
    // R11 (priority 100) + R05 (priority 80) both would match counterparty token "TOKO",
    // but only R11 counterparty actually present. Build a direct collision instead:
    const rA = buildRule({
      ruleCode: "A_HIGH",
      priority: 100,
      matchType: "description_contains",
      descriptionPatterns: ["FOO"],
      descriptionPatternsMode: "any",
      direction: "credit",
    });
    const rB = buildRule({
      ruleCode: "B_LOW",
      priority: 50,
      matchType: "description_contains",
      descriptionPatterns: ["FOO"],
      descriptionPatternsMode: "any",
      direction: "credit",
    });
    const result = classifyLine(
      { rawDescription: "FOO BAR", direction: "credit", amountIdr: 100, date: 0 },
      [rB, rA],
    );
    expect(result?.rule.ruleCode).toBe("A_HIGH");
  });

  it("catch-all with priority=200 does NOT beat non-catch-all with priority=50", () => {
    const catchAll = buildRule({
      ruleCode: "Z_CATCH",
      priority: 200,
      isCatchAll: true,
      matchType: "catch_all",
      descriptionPatternsMode: "hint",
      direction: "credit",
    });
    const nonCatch = buildRule({
      ruleCode: "Z_NORMAL",
      priority: 50,
      isCatchAll: false,
      matchType: "description_contains",
      descriptionPatterns: ["NORMAL"],
      descriptionPatternsMode: "any",
      direction: "credit",
    });
    const result = classifyLine(
      { rawDescription: "NORMAL TXN", direction: "credit", amountIdr: 100, date: 0 },
      [catchAll, nonCatch],
    );
    expect(result?.rule.ruleCode).toBe("Z_NORMAL");
  });

  it("catch-all wins when no non-catch-all matches", () => {
    const catchAll = buildRule({
      ruleCode: "Z_CATCH",
      priority: 20,
      isCatchAll: true,
      matchType: "catch_all",
      descriptionPatternsMode: "hint",
      descriptionPatterns: [],
      direction: "credit",
    });
    const result = classifyLine(
      { rawDescription: "UNKNOWN THING", direction: "credit", amountIdr: 100, date: 0 },
      [catchAll],
    );
    expect(result?.rule.ruleCode).toBe("Z_CATCH");
  });

  it("ties broken by ruleCode ASC when priority equal", () => {
    const ruleB = buildRule({
      ruleCode: "B_TIE",
      priority: 50,
      matchType: "description_contains",
      descriptionPatterns: ["SHARED"],
      descriptionPatternsMode: "any",
      direction: "credit",
    });
    const ruleA = buildRule({
      ruleCode: "A_TIE",
      priority: 50,
      matchType: "description_contains",
      descriptionPatterns: ["SHARED"],
      descriptionPatternsMode: "any",
      direction: "credit",
    });
    const result = classifyLine(
      { rawDescription: "SHARED WORD", direction: "credit", amountIdr: 100, date: 0 },
      [ruleB, ruleA],
    );
    expect(result?.rule.ruleCode).toBe("A_TIE");
  });

  it("inactive rules (isActive=false) are skipped entirely", () => {
    const inactive = buildRule({
      ruleCode: "INACTIVE_HIGH",
      priority: 200,
      matchType: "description_contains",
      descriptionPatterns: ["HELLO"],
      descriptionPatternsMode: "any",
      direction: "credit",
      isActive: false,
    });
    const active = buildRule({
      ruleCode: "ACTIVE_LOW",
      priority: 10,
      matchType: "description_contains",
      descriptionPatterns: ["HELLO"],
      descriptionPatternsMode: "any",
      direction: "credit",
      isActive: true,
    });
    const result = classifyLine(
      { rawDescription: "HELLO THERE", direction: "credit", amountIdr: 100, date: 0 },
      [inactive, active],
    );
    expect(result?.rule.ruleCode).toBe("ACTIVE_LOW");
  });
});

// ---------------------------------------------------------------------------
// Layer A — direction sensitivity (D-11/D-17b)
// ---------------------------------------------------------------------------

describe("classifyLine — direction sensitivity", () => {
  const rules = loadSeedRules();

  it("VISIONET INTERNASI on DEBIT does NOT match R03 (credit-only)", () => {
    const result = classifyLine(
      { rawDescription: "VISIONET INTERNASI something", direction: "debit", amountIdr: 100, date: 0 },
      rules,
    );
    expect(result?.rule.ruleCode === "R03").toBe(false);
  });

  it("/OVO on CREDIT does NOT match O04 (debit-only)", () => {
    const result = classifyLine(
      { rawDescription: "TRSF E-BANKING CR /OVO 12345", direction: "credit", amountIdr: 100, date: 0 },
      rules,
    );
    expect(result?.rule.ruleCode === "O04").toBe(false);
  });

  it("Packaging vs printing disambiguated by counterparty: NIU ULUNG→C02, PILAR (no overlap kw)→O05", () => {
    // C02 matches on counterparty NIU ULUNG (priority 60).
    const rA = classifyLine(
      { rawDescription: "NIU ULUNG Stickers", direction: "debit", amountIdr: 100, date: 0 },
      rules,
    );
    expect(rA?.rule.ruleCode).toBe("C02");

    // O05 matches on PILAR counterparty + "Printing" keyword. The rawDescription
    // deliberately omits the C02-overlapping keyword ("Stickers") because the
    // seed's C02 rule uses counterparty_OR_keyword with "Stickers" in its
    // descriptionPatterns — so a shared "Sticker" keyword lets C02 (priority 60)
    // beat O05 (priority 40) even when counterparty is PILAR. This ambiguity is
    // a design limitation of the current seed and is NOT a match-engine bug; the
    // engine is faithfully applying priority order. Documented in Plan 03
    // SUMMARY.
    const rB = classifyLine(
      { rawDescription: "PILAR PRATAMA MAND Printing Label", direction: "debit", amountIdr: 100, date: 0 },
      rules,
    );
    expect(rB?.rule.ruleCode).toBe("O05");
  });
});

// ---------------------------------------------------------------------------
// Layer A — hint mode elevation
// ---------------------------------------------------------------------------

describe("classifyLine — hint mode", () => {
  it("R01 catch-all matches any credit with hintHit=false when no hint keyword present", () => {
    const rules = loadSeedRules();
    const result = classifyLine(
      { rawDescription: "TRANSFER FROM X", direction: "credit", amountIdr: 1000, date: 0 },
      rules,
    );
    expect(result?.rule.ruleCode).toBe("R01");
    expect(result?.hintHit).toBe(false);
  });

  it("R01 matches with hintHit=true when 'dubai' present in description", () => {
    const rules = loadSeedRules();
    const result = classifyLine(
      { rawDescription: "TRANSFER FROM X dubai", direction: "credit", amountIdr: 1000, date: 0 },
      rules,
    );
    expect(result?.rule.ruleCode).toBe("R01");
    expect(result?.hintHit).toBe(true);
  });

  it("computeConfidence elevates 'suggested' → 'strong' when hintHit=true", () => {
    const rule = buildRule({
      ruleCode: "HINT_SUGGESTED",
      confidence: "suggested",
    });
    expect(computeConfidence(rule, true, null)).toBe("strong");
  });

  it("computeConfidence elevates 'strong' → 'exact' when hintHit=true", () => {
    const rule = buildRule({
      ruleCode: "HINT_STRONG",
      confidence: "strong",
    });
    expect(computeConfidence(rule, true, null)).toBe("exact");
  });

  it("computeConfidence returns 'none' when rule is null", () => {
    expect(computeConfidence(null, false, null)).toBe("none");
  });

  it("computeConfidence returns 'strong' when linkage found with fuzzyScore ≥ 0.8", () => {
    const rule = buildRule({ ruleCode: "LINK_BASE", confidence: "suggested" });
    expect(computeConfidence(rule, false, { found: true, fuzzyScore: 0.85 })).toBe("strong");
  });
});

// ---------------------------------------------------------------------------
// Layer B — record linkage via convex-test
// ---------------------------------------------------------------------------

describe("findLinkedRecord — Layer B linkage", () => {
  const NOW = Date.UTC(2026, 3, 13); // Apr 13, 2026
  const DAY = 24 * 3600 * 1000;

  async function seedUser(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "test-user",
        role: "admin",
        pinHash: "salt:hash",
        isActive: true,
        failedAttempts: 0,
        createdAt: NOW,
      } as never);
      return userId;
    });
  }

  async function seedAccount(t: ReturnType<typeof convexTest>) {
    return await t.run(async (ctx) => {
      return await ctx.db.insert("accounts", {
        code: "6710",
        name: "OpEx — R&D / Telecom / Office / Bank Fees",
        type: "opex",
        category: "Operating Expenses",
        isActive: true,
        isSystem: true,
      } as never);
    });
  }

  it("matches expense by amount + date within ±3 day window + fuzzy ≥ 0.8", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);
    const accountId = await seedAccount(t);

    // Use a stored description that is a substring of the bank rawDescription,
    // so similarityScore's containment branch yields |stored|/|line| ≥ 0.8.
    const expenseId = await t.run(async (ctx) => {
      return await ctx.db.insert("expenses", {
        expenseNumber: "EXP-001",
        submittedBy: userId,
        amount: 100000,
        accountId,
        expenseDate: NOW,
        description: "PIERRE KEVIN ANGEL Courier Pierre",
        vendorName: "Pierre",
        paymentMethod: "employee_paid",
        status: "approved",
        lateSubmission: false,
        createdAt: NOW,
      } as never);
    });

    const result = await t.run(async (ctx) => {
      return await findLinkedRecord(ctx, {
        amountIdr: 100000,
        direction: "debit",
        date: NOW + 2 * DAY,
        rawDescription: "PIERRE KEVIN ANGEL Courier Pierre DKI",
      });
    });

    expect(result).not.toBeNull();
    expect(result!.matchedType).toBe("expense");
    expect(result!.matchedId).toBe(expenseId);
    expect(result!.fuzzyScore).toBeGreaterThanOrEqual(0.8);
  });

  it("does NOT match expense when date is outside ±3 day window", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);
    const accountId = await seedAccount(t);

    await t.run(async (ctx) => {
      return await ctx.db.insert("expenses", {
        expenseNumber: "EXP-002",
        submittedBy: userId,
        amount: 100000,
        accountId,
        expenseDate: NOW,
        description: "PIERRE KEVIN ANGEL Courier Pierre",
        vendorName: "Pierre",
        paymentMethod: "employee_paid",
        status: "approved",
        lateSubmission: false,
        createdAt: NOW,
      } as never);
    });

    const result = await t.run(async (ctx) => {
      return await findLinkedRecord(ctx, {
        amountIdr: 100000,
        direction: "debit",
        date: NOW + 5 * DAY, // outside ±3 day window
        rawDescription: "PIERRE KEVIN ANGEL Courier Pierre DKI",
      });
    });

    expect(result).toBeNull();
  });

  it("does NOT match expense when fuzzy score < 0.8", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);
    const accountId = await seedAccount(t);

    await t.run(async (ctx) => {
      return await ctx.db.insert("expenses", {
        expenseNumber: "EXP-003",
        submittedBy: userId,
        amount: 100000,
        accountId,
        expenseDate: NOW,
        description: "Completely different expense description about office supplies",
        vendorName: "Other",
        paymentMethod: "employee_paid",
        status: "approved",
        lateSubmission: false,
        createdAt: NOW,
      } as never);
    });

    const result = await t.run(async (ctx) => {
      return await findLinkedRecord(ctx, {
        amountIdr: 100000,
        direction: "debit",
        date: NOW,
        rawDescription: "XYZ unrelated courier",
      });
    });

    expect(result).toBeNull();
  });

  it("matches payroll by amount + date (±14 day) + recipientName substring", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);

    const payrollId = await t.run(async (ctx) => {
      return await ctx.db.insert("payrollEntries", {
        payrollNumber: "PAY-001",
        employeeType: "staff",
        recipientName: "MADELYNNE SAVIRA",
        frequency: "monthly",
        amount: 5000000,
        periodStart: NOW,
        periodEnd: NOW + 30 * DAY,
        description: "Monthly salary",
        status: "active",
        createdBy: userId,
        createdAt: NOW,
      } as never);
    });

    const result = await t.run(async (ctx) => {
      return await findLinkedRecord(ctx, {
        amountIdr: 5000000,
        direction: "debit",
        date: NOW + 5 * DAY,
        rawDescription: "TRSF E-BANKING DB /MADELYNNE SAVIRA salary nov",
      });
    });

    expect(result).not.toBeNull();
    expect(result!.matchedType).toBe("payroll");
    expect(result!.matchedId).toBe(payrollId);
  });

  it("does NOT match payroll when date is outside ±14 day window", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);

    await t.run(async (ctx) => {
      return await ctx.db.insert("payrollEntries", {
        payrollNumber: "PAY-002",
        employeeType: "staff",
        recipientName: "MADELYNNE SAVIRA",
        frequency: "monthly",
        amount: 5000000,
        periodStart: NOW,
        periodEnd: NOW + 30 * DAY,
        description: "Monthly salary",
        status: "active",
        createdBy: userId,
        createdAt: NOW,
      } as never);
    });

    const result = await t.run(async (ctx) => {
      return await findLinkedRecord(ctx, {
        amountIdr: 5000000,
        direction: "debit",
        date: NOW + 20 * DAY,
        rawDescription: "TRSF E-BANKING DB /MADELYNNE SAVIRA salary nov",
      });
    });

    expect(result).toBeNull();
  });

  it("does NOT match payroll when recipientName not in rawDescription", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);

    await t.run(async (ctx) => {
      return await ctx.db.insert("payrollEntries", {
        payrollNumber: "PAY-003",
        employeeType: "staff",
        recipientName: "MADELYNNE SAVIRA",
        frequency: "monthly",
        amount: 5000000,
        periodStart: NOW,
        periodEnd: NOW + 30 * DAY,
        description: "Monthly salary",
        status: "active",
        createdBy: userId,
        createdAt: NOW,
      } as never);
    });

    const result = await t.run(async (ctx) => {
      return await findLinkedRecord(ctx, {
        amountIdr: 5000000,
        direction: "debit",
        date: NOW,
        rawDescription: "TRSF E-BANKING DB /SOMEONE ELSE salary nov",
      });
    });

    expect(result).toBeNull();
  });

  it("skips payroll scan when line.flags includes 'related_party'", async () => {
    const t = convexTest(schema);
    const userId = await seedUser(t);

    await t.run(async (ctx) => {
      return await ctx.db.insert("payrollEntries", {
        payrollNumber: "PAY-004",
        employeeType: "staff",
        recipientName: "RISTIANA ETENG",
        frequency: "monthly",
        amount: 3000000,
        periodStart: NOW,
        periodEnd: NOW + 30 * DAY,
        description: "Monthly salary",
        status: "active",
        createdBy: userId,
        createdAt: NOW,
      } as never);
    });

    const result = await t.run(async (ctx) => {
      return await findLinkedRecord(ctx, {
        amountIdr: 3000000,
        direction: "debit",
        date: NOW,
        rawDescription: "RISTIANA ETENG BI-FAST DB TRANSFER",
        flags: ["related_party"],
      });
    });

    // B02 flags a line as related_party — payroll scan must skip, no match.
    expect(result).toBeNull();
  });

  it("returns null when nothing matches", async () => {
    const t = convexTest(schema);
    const result = await t.run(async (ctx) => {
      return await findLinkedRecord(ctx, {
        amountIdr: 999999,
        direction: "debit",
        date: NOW,
        rawDescription: "absolutely nothing",
      });
    });
    expect(result).toBeNull();
  });
});
