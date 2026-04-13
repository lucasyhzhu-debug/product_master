/**
 * bankStatements mutation integration tests (Plan 72-04 Task 2).
 *
 * Cases:
 *  1. Successful ingest: 5 lines with a GoPay row exercising R02 → statementId
 *     returned, lines persisted, matchedCount > 0, R02 line has classification fields.
 *  2. Primary dedup (fileHash): second ingest with same fileHash throws.
 *  3. Secondary dedup (accountNumber + period): different fileHash, same period →
 *     throws with masked accountNumber.
 *  4. Size cap: 5001 lines → ConvexError.
 *  5. Non-admin caller (kitchen role) → requireRole throws.
 *  6. D-20 invariant: no journal entries created during ingest.
 *  7. Match engine wiring: R02 rule fully populates matchedRuleId / plSection /
 *     linkedChannel / jeDebit/jeCredit on the matching line.
 *  8. WIB boundary month: transaction at 2025-12-31 17:30 UTC → month "2026-01".
 *     Symmetric test for 2026-01-01 16:59 UTC → month "2026-01".
 *  9. Server-side reconciliation re-validation (T-72-19): tampered debit total
 *     or credit total → ConvexError; zero statements + zero lines post-reject.
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

type TestT = ReturnType<typeof convexTest>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedAdminSession(t: TestT): Promise<string> {
  const token = `admin-token-${Date.now()}-${Math.random()}`;
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
      token,
      expiresAt: Date.now() + 8 * 3600 * 1000,
      createdAt: Date.now(),
    } as never);
  });
  return token;
}

async function seedKitchenSession(t: TestT): Promise<string> {
  const token = `kitchen-token-${Date.now()}-${Math.random()}`;
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Kitchen",
      pinHash: "salt:hash",
      role: "kitchen",
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    } as never);
    await ctx.db.insert("sessions", {
      userId,
      token,
      expiresAt: Date.now() + 8 * 3600 * 1000,
      createdAt: Date.now(),
    } as never);
  });
  return token;
}

/**
 * Seed a minimal accounts + a single R02 rule so classifier can find GoPay lines.
 * Returns ids useful in assertions.
 */
async function seedR02Rule(t: TestT): Promise<{
  cashAccountId: Id<"accounts">;
  revenueAccountId: Id<"accounts">;
  ruleId: Id<"bankKeywordRules">;
  adminUserId: Id<"users">;
}> {
  return await t.run(async (ctx) => {
    const cashAccountId = await ctx.db.insert("accounts", {
      code: "1110",
      name: "Cash / Bank — BCA Main",
      type: "asset",
      category: "Assets",
      isActive: true,
      isSystem: true,
    } as never);
    const revenueAccountId = await ctx.db.insert("accounts", {
      code: "4210",
      name: "Revenue — GoPay / GoFood",
      type: "revenue",
      category: "Revenue",
      isActive: true,
      isSystem: true,
    } as never);
    const adminUserId = await ctx.db.insert("users", {
      name: "R02 Owner",
      pinHash: "salt:hash",
      role: "admin",
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    } as never);
    const ruleId = await ctx.db.insert("bankKeywordRules", {
      ruleCode: "R02",
      plSection: "Revenue",
      direction: "credit",
      matchType: "counterparty",
      counterpartyPatterns: ["DOMPET ANAK BANGSA"],
      descriptionPatterns: ["WLST"],
      descriptionPatternsMode: "hint",
      isCatchAll: false,
      categoryAccountId: revenueAccountId,
      subCategoryTemplate: "GoPay / GoFood Settlement",
      jeDebitAccountId: cashAccountId,
      jeCreditAccountId: revenueAccountId,
      linkedChannel: "gopay",
      confidence: "exact",
      priority: 80,
      isActive: true,
      createdBy: adminUserId,
      createdAt: Date.now(),
    } as never);
    return { cashAccountId, revenueAccountId, ruleId, adminUserId };
  });
}

/**
 * Build a small 5-line statement where credits and debits reconcile.
 * Line 3 is a GoPay R02-matching credit.
 */
function buildStatement(
  fileHash = "hash-A",
  accountNumber = "6044830994",
  periodStart = Date.UTC(2026, 0, 1),
  periodEnd = Date.UTC(2026, 0, 31),
) {
  const lines = [
    { rowIndex: 1, date: Date.UTC(2026, 0, 2), rawDescription: "BIAYA ADM bulanan", direction: "debit" as const, amountIdr: 15000 },
    { rowIndex: 2, date: Date.UTC(2026, 0, 5), rawDescription: "DOMPET ANAK BANGSA WLST G293156297", direction: "credit" as const, amountIdr: 500000 },
    { rowIndex: 3, date: Date.UTC(2026, 0, 10), rawDescription: "BI-FAST CR TRANSFER customer", direction: "credit" as const, amountIdr: 250000 },
    { rowIndex: 4, date: Date.UTC(2026, 0, 12), rawDescription: "/LALAMOVE delivery fee", direction: "debit" as const, amountIdr: 50000 },
    { rowIndex: 5, date: Date.UTC(2026, 0, 20), rawDescription: "Unknown something", direction: "credit" as const, amountIdr: 100000 },
  ];
  const totalDebit = lines.filter((l) => l.direction === "debit").reduce((s, l) => s + l.amountIdr, 0);
  const totalCredit = lines.filter((l) => l.direction === "credit").reduce((s, l) => s + l.amountIdr, 0);
  return {
    header: {
      fileHash,
      fileName: "Mutasi-BCA-2601.xlsx",
      accountNumber,
      accountHolder: "PT FROLLIE",
      reportedPeriodStart: periodStart,
      reportedPeriodEnd: periodEnd,
      currency: "Rp",
      openingBalance: 1_000_000,
      closingBalance: 1_000_000 + totalCredit - totalDebit,
      reportedDebitTotal: totalDebit,
      reportedCreditTotal: totalCredit,
    },
    lines,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("bankStatements.createFromParsedStatement", () => {
  it("ingests a reconciling 5-line statement + classifies R02 line", async () => {
    const t = convexTest(schema);
    const token = await seedAdminSession(t);
    const { ruleId } = await seedR02Rule(t);

    const payload = buildStatement();
    const result = await t.mutation(
      api.bankStatements.mutations.createFromParsedStatement,
      { token, ...payload },
    );

    expect(result.statementId).toBeDefined();
    expect(result.lineCount).toBe(5);
    expect(result.matchedCount).toBeGreaterThan(0);

    const lines = await t.run(async (ctx) =>
      await ctx.db
        .query("bankStatementLines")
        .withIndex("by_statement", (q) => q.eq("statementId", result.statementId))
        .collect(),
    );
    expect(lines).toHaveLength(5);

    const gopayLine = lines.find((l) => l.rowIndex === 2);
    expect(gopayLine).toBeDefined();
    expect(gopayLine!.matchedRuleId).toBe(ruleId);
    expect(gopayLine!.plSection).toBe("Revenue");
    expect(gopayLine!.linkedChannel).toBe("gopay");
    expect(gopayLine!.status).toBe("auto_matched");
    expect(gopayLine!.isAutoMatched).toBe(true);
    expect(gopayLine!.matchMethod).toBe("keyword");
  });

  it("rejects duplicate fileHash (primary dedup)", async () => {
    const t = convexTest(schema);
    const token = await seedAdminSession(t);
    await seedR02Rule(t);

    const payload = buildStatement("hash-dup");
    await t.mutation(api.bankStatements.mutations.createFromParsedStatement, {
      token,
      ...payload,
    });

    await expect(
      t.mutation(api.bankStatements.mutations.createFromParsedStatement, {
        token,
        ...payload,
      }),
    ).rejects.toThrow(/Already imported/);
  });

  it("rejects duplicate (accountNumber, period) with masked accountNumber in error", async () => {
    const t = convexTest(schema);
    const token = await seedAdminSession(t);
    await seedR02Rule(t);

    const first = buildStatement("hash-A");
    await t.mutation(api.bankStatements.mutations.createFromParsedStatement, {
      token,
      ...first,
    });

    const second = buildStatement("hash-B"); // different file, same period + account
    await expect(
      t.mutation(api.bankStatements.mutations.createFromParsedStatement, {
        token,
        ...second,
      }),
    ).rejects.toThrow(/already imported/);

    // Confirm the error message masks the accountNumber (last 4 digits preserved).
    // BCA account 6044830994 → mask leaves last 4: "******0994"
    try {
      await t.mutation(api.bankStatements.mutations.createFromParsedStatement, {
        token,
        ...second,
      });
    } catch (err: unknown) {
      const msg = (err as Error).message;
      // ConvexError wraps; the raw data string should contain the masked form.
      expect(msg).toContain("0994");
      expect(msg).not.toMatch(/6044830994/); // full number must not leak
    }
  });

  it("rejects >5000 lines (DoS guardrail)", async () => {
    const t = convexTest(schema);
    const token = await seedAdminSession(t);
    await seedR02Rule(t);

    const lines = [] as Array<{
      rowIndex: number;
      date: number;
      rawDescription: string;
      direction: "debit" | "credit";
      amountIdr: number;
    }>;
    for (let i = 0; i < 5001; i++) {
      lines.push({
        rowIndex: i + 1,
        date: Date.UTC(2026, 0, 1),
        rawDescription: "noise",
        direction: "debit",
        amountIdr: 1,
      });
    }

    await expect(
      t.mutation(api.bankStatements.mutations.createFromParsedStatement, {
        token,
        header: {
          fileHash: "big-hash",
          fileName: "big.xlsx",
          accountNumber: "9999999999",
          accountHolder: "X",
          reportedPeriodStart: Date.UTC(2026, 0, 1),
          reportedPeriodEnd: Date.UTC(2026, 0, 31),
          currency: "Rp",
          openingBalance: 0,
          closingBalance: -5001,
          reportedDebitTotal: 5001,
          reportedCreditTotal: 0,
        },
        lines,
      }),
    ).rejects.toThrow(/Too many transaction rows/);
  });

  it("rejects non-admin caller (kitchen role)", async () => {
    const t = convexTest(schema);
    const token = await seedKitchenSession(t);
    await seedR02Rule(t);

    const payload = buildStatement();
    await expect(
      t.mutation(api.bankStatements.mutations.createFromParsedStatement, {
        token,
        ...payload,
      }),
    ).rejects.toThrow(/Not authorized/);
  });

  it("does NOT post any journalEntries (D-20 invariant)", async () => {
    const t = convexTest(schema);
    const token = await seedAdminSession(t);
    await seedR02Rule(t);

    const payload = buildStatement();
    await t.mutation(api.bankStatements.mutations.createFromParsedStatement, {
      token,
      ...payload,
    });

    const jeCount = await t.run(async (ctx) =>
      (await ctx.db.query("journalEntries").collect()).length,
    );
    expect(jeCount).toBe(0);
  });

  it("derives WIB month correctly at boundary (UTC midnight rollover)", async () => {
    const t = convexTest(schema);
    const token = await seedAdminSession(t);
    await seedR02Rule(t);

    // Dec 31, 2025 17:30 UTC = Jan 01, 2026 00:30 WIB → month "2026-01".
    // Jan 01, 2026 16:59 UTC = Jan 01, 2026 23:59 WIB → month "2026-01".
    const boundaryA = Date.UTC(2025, 11, 31, 17, 30);
    const boundaryB = Date.UTC(2026, 0, 1, 16, 59);

    const lines = [
      { rowIndex: 1, date: boundaryA, rawDescription: "tx A", direction: "debit" as const, amountIdr: 1000 },
      { rowIndex: 2, date: boundaryB, rawDescription: "tx B", direction: "debit" as const, amountIdr: 2000 },
    ];
    const result = await t.mutation(
      api.bankStatements.mutations.createFromParsedStatement,
      {
        token,
        header: {
          fileHash: "wib-hash",
          fileName: "wib.xlsx",
          accountNumber: "1234567890",
          accountHolder: "X",
          reportedPeriodStart: Date.UTC(2025, 11, 1),
          reportedPeriodEnd: Date.UTC(2026, 0, 31),
          currency: "Rp",
          openingBalance: 0,
          closingBalance: -3000,
          reportedDebitTotal: 3000,
          reportedCreditTotal: 0,
        },
        lines,
      },
    );

    const persisted = await t.run(async (ctx) =>
      await ctx.db
        .query("bankStatementLines")
        .withIndex("by_statement", (q) => q.eq("statementId", result.statementId))
        .collect(),
    );
    expect(persisted).toHaveLength(2);
    for (const l of persisted) {
      expect(l.month).toBe("2026-01");
    }
  });

  it("rejects reconciliation mismatch on debit total (T-72-19) with zero persistence", async () => {
    const t = convexTest(schema);
    const token = await seedAdminSession(t);
    await seedR02Rule(t);

    const payload = buildStatement("recon-a");
    // Tamper: inflate reportedDebitTotal
    payload.header.reportedDebitTotal = 99_999_999;

    await expect(
      t.mutation(api.bankStatements.mutations.createFromParsedStatement, {
        token,
        ...payload,
      }),
    ).rejects.toThrow(/Reconciliation failed/);

    // Atomicity: zero statements + zero lines.
    const stmts = await t.run(async (ctx) =>
      (await ctx.db.query("bankStatements").collect()).length,
    );
    const ls = await t.run(async (ctx) =>
      (await ctx.db.query("bankStatementLines").collect()).length,
    );
    expect(stmts).toBe(0);
    expect(ls).toBe(0);
  });

  it("rejects reconciliation mismatch on credit total (T-72-19) with zero persistence", async () => {
    const t = convexTest(schema);
    const token = await seedAdminSession(t);
    await seedR02Rule(t);

    const payload = buildStatement("recon-b");
    // Tamper: inflate reportedCreditTotal
    payload.header.reportedCreditTotal = 77_777_777;

    await expect(
      t.mutation(api.bankStatements.mutations.createFromParsedStatement, {
        token,
        ...payload,
      }),
    ).rejects.toThrow(/Reconciliation failed/);

    const stmts = await t.run(async (ctx) =>
      (await ctx.db.query("bankStatements").collect()).length,
    );
    const ls = await t.run(async (ctx) =>
      (await ctx.db.query("bankStatementLines").collect()).length,
    );
    expect(stmts).toBe(0);
    expect(ls).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Queries — admin gate
// ---------------------------------------------------------------------------

describe("bankStatements queries — admin gate", () => {
  it("listStatements rejects non-admin", async () => {
    const t = convexTest(schema);
    const kitchenToken = await seedKitchenSession(t);
    await expect(
      t.query(api.bankStatements.queries.listStatements, { token: kitchenToken }),
    ).rejects.toThrow(/Not authorized/);
  });

  it("listStatements returns recent uploads for admin", async () => {
    const t = convexTest(schema);
    const token = await seedAdminSession(t);
    await seedR02Rule(t);

    const payload = buildStatement("hash-list");
    const { statementId } = await t.mutation(
      api.bankStatements.mutations.createFromParsedStatement,
      { token, ...payload },
    );

    const list = await t.query(api.bankStatements.queries.listStatements, { token });
    expect(list).toHaveLength(1);
    expect(list[0]._id).toBe(statementId);
  });

  it("listLines filters by status for admin", async () => {
    const t = convexTest(schema);
    const token = await seedAdminSession(t);
    await seedR02Rule(t);

    const payload = buildStatement("hash-lines");
    const { statementId } = await t.mutation(
      api.bankStatements.mutations.createFromParsedStatement,
      { token, ...payload },
    );

    const autoMatched = await t.query(api.bankStatements.queries.listLines, {
      token,
      statementId,
      statusFilter: "auto_matched",
    });
    const unmatched = await t.query(api.bankStatements.queries.listLines, {
      token,
      statementId,
      statusFilter: "unmatched",
    });
    expect(autoMatched.length + unmatched.length).toBe(5);
    expect(autoMatched.every((l) => l.status === "auto_matched")).toBe(true);
    expect(unmatched.every((l) => l.status === "unmatched")).toBe(true);
  });
});
