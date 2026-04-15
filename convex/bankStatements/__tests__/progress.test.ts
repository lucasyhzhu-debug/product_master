/**
 * getStatementProgress + getStatementProgressBulk tests — Phase 73 Plan 02 Wave 0.
 *
 * Contract (BANK-04):
 *  - getStatementProgress(statementId) returns { total, unmatched, autoMatched,
 *    suggested, confirmed, matched, reconciledPct } using indexed prefix scans
 *    on by_statement_status.
 *  - matched = autoMatched + suggested + confirmed.
 *  - reconciledPct = round((confirmed / total) * 100); 0 when total === 0.
 *  - manager + admin only; kitchen/order_staff rejected.
 *  - Live recompute after manualMatch mutation (Convex reactivity).
 *  - getStatementProgressBulk enforces a 50-id cap (RESEARCH Pitfall 7) and
 *    correctly composes a map across statements with different status mixes.
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { seedReconcileFixture } from "./reconcileHelpers";
import type { Id } from "../../_generated/dataModel";

describe("getStatementProgress", () => {
  it("returns aggregate shape for fresh statement", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    const result = await t.query(api.bankStatements.queries.getStatementProgress, {
      token: f.managerToken,
      statementId: f.statementId,
    });

    expect(result).toMatchObject({
      total: expect.any(Number),
      unmatched: expect.any(Number),
      autoMatched: expect.any(Number),
      suggested: expect.any(Number),
      confirmed: expect.any(Number),
      matched: expect.any(Number),
      reconciledPct: expect.any(Number),
    });
    // Fixture: 1 unmatched, 1 suggested, 1 confirmed, 0 auto_matched → total=3
    expect(result.total).toBe(3);
    expect(result.unmatched).toBe(1);
    expect(result.autoMatched).toBe(0);
    expect(result.suggested).toBe(1);
    expect(result.confirmed).toBe(1);
  });

  it("matched equals autoMatched plus suggested plus confirmed", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    const result = await t.query(api.bankStatements.queries.getStatementProgress, {
      token: f.managerToken,
      statementId: f.statementId,
    });
    expect(result.matched).toBe(result.autoMatched + result.suggested + result.confirmed);
  });

  it("reconciledPct rounds correctly and is 0 when total is 0", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    // Fixture: 1 confirmed of 3 total → round(33.33) = 33
    const withLines = await t.query(api.bankStatements.queries.getStatementProgress, {
      token: f.managerToken,
      statementId: f.statementId,
    });
    expect(withLines.reconciledPct).toBe(33);

    // Empty statement → reconciledPct = 0
    const emptyStatementId = await t.run(async (ctx) =>
      ctx.db.insert("bankStatements", {
        fileHash: `hash-empty-${Math.random()}`,
        fileName: "empty.xlsx",
        accountNumber: "9999999999",
        accountHolder: "empty",
        reportedPeriodStart: Date.UTC(2026, 1, 1),
        reportedPeriodEnd: Date.UTC(2026, 1, 28),
        currency: "Rp",
        openingBalance: 0,
        closingBalance: 0,
        reportedDebitTotal: 0,
        reportedCreditTotal: 0,
        lineCount: 0,
        matchedCount: 0,
        uploadedBy: f.adminUserId,
        createdAt: Date.now(),
      } as never),
    );
    const empty = await t.query(api.bankStatements.queries.getStatementProgress, {
      token: f.managerToken,
      statementId: emptyStatementId as Id<"bankStatements">,
    });
    expect(empty.total).toBe(0);
    expect(empty.reconciledPct).toBe(0);
  });

  it("kitchen role rejected", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    await expect(
      t.query(api.bankStatements.queries.getStatementProgress, {
        token: f.kitchenToken,
        statementId: f.statementId,
      }),
    ).rejects.toThrow();
  });

  it("live recompute after manualMatch mutation reflects new status", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    const before = await t.query(api.bankStatements.queries.getStatementProgress, {
      token: f.managerToken,
      statementId: f.statementId,
    });

    // Unmatched line: 1 → 0 after link. Link to reimbursementId (free in fixture).
    await t.mutation(api.bankStatements.mutations.manualMatch, {
      token: f.managerToken,
      lineId: f.unmatchedLineId,
      matchedType: "reimbursement",
      matchedId: f.reimbursementId,
    });

    const after = await t.query(api.bankStatements.queries.getStatementProgress, {
      token: f.managerToken,
      statementId: f.statementId,
    });
    expect(after.unmatched).toBe(before.unmatched - 1);
    expect(after.suggested).toBe(before.suggested + 1);
    expect(after.total).toBe(before.total);
  });
});

describe("getStatementProgressBulk", () => {
  it("getStatementProgressBulk returns map keyed by statementId", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    const result = await t.query(api.bankStatements.queries.getStatementProgressBulk, {
      token: f.managerToken,
      statementIds: [f.statementId],
    });
    expect(result[f.statementId]).toBeDefined();
    expect(result[f.statementId].total).toBe(3);
  });

  it("getStatementProgressBulk enforces 50 id cap", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    // Build 51 fake statementIds; we only need cap to trigger before per-id work.
    const ids: Id<"bankStatements">[] = [];
    await t.run(async (ctx) => {
      for (let i = 0; i < 51; i++) {
        const id = await ctx.db.insert("bankStatements", {
          fileHash: `bulk-cap-${i}-${Math.random()}`,
          fileName: `bulk-${i}.xlsx`,
          accountNumber: `9999${i}`,
          accountHolder: `bulk-${i}`,
          reportedPeriodStart: Date.UTC(2026, 0, 1),
          reportedPeriodEnd: Date.UTC(2026, 0, 31),
          currency: "Rp",
          openingBalance: 0,
          closingBalance: 0,
          reportedDebitTotal: 0,
          reportedCreditTotal: 0,
          lineCount: 0,
          matchedCount: 0,
          uploadedBy: f.adminUserId,
          createdAt: Date.now(),
        } as never);
        ids.push(id as Id<"bankStatements">);
      }
    });

    await expect(
      t.query(api.bankStatements.queries.getStatementProgressBulk, {
        token: f.managerToken,
        statementIds: ids,
      }),
    ).rejects.toThrow(/50/);
  });

  it("getStatementProgressBulk handles mixed statuses across statements", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    const now = Date.now();
    const lineDate = Date.UTC(2026, 1, 10);

    // Statement A: all-confirmed
    const { statementAId, statementBId } = await t.run(async (ctx) => {
      const accountAcq = await ctx.db.insert("accounts", {
        code: "9999",
        name: "Mixed test acct",
        type: "asset",
        category: "Assets",
        isActive: true,
        isSystem: false,
      } as never);

      const sA = await ctx.db.insert("bankStatements", {
        fileHash: `mixed-A-${Math.random()}`,
        fileName: "A.xlsx",
        accountNumber: "11",
        accountHolder: "A",
        reportedPeriodStart: lineDate,
        reportedPeriodEnd: lineDate,
        currency: "Rp",
        openingBalance: 0,
        closingBalance: 0,
        reportedDebitTotal: 0,
        reportedCreditTotal: 0,
        lineCount: 2,
        matchedCount: 2,
        uploadedBy: f.adminUserId,
        createdAt: now,
      } as never);
      for (let i = 0; i < 2; i++) {
        await ctx.db.insert("bankStatementLines", {
          statementId: sA,
          rowIndex: i + 1,
          date: lineDate,
          month: "2026-02",
          rawDescription: `A-${i}`,
          direction: "debit",
          amountIdr: 1000,
          confidence: "exact",
          status: "confirmed",
          isAutoMatched: true,
          jeDebitAccountId: accountAcq,
          jeCreditAccountId: accountAcq,
        } as never);
      }

      const sB = await ctx.db.insert("bankStatements", {
        fileHash: `mixed-B-${Math.random()}`,
        fileName: "B.xlsx",
        accountNumber: "22",
        accountHolder: "B",
        reportedPeriodStart: lineDate,
        reportedPeriodEnd: lineDate,
        currency: "Rp",
        openingBalance: 0,
        closingBalance: 0,
        reportedDebitTotal: 0,
        reportedCreditTotal: 0,
        lineCount: 3,
        matchedCount: 0,
        uploadedBy: f.adminUserId,
        createdAt: now,
      } as never);
      for (let i = 0; i < 3; i++) {
        await ctx.db.insert("bankStatementLines", {
          statementId: sB,
          rowIndex: i + 1,
          date: lineDate,
          month: "2026-02",
          rawDescription: `B-${i}`,
          direction: "debit",
          amountIdr: 1000,
          confidence: "none",
          status: "unmatched",
          isAutoMatched: false,
        } as never);
      }

      return { statementAId: sA, statementBId: sB };
    });

    const result = await t.query(api.bankStatements.queries.getStatementProgressBulk, {
      token: f.managerToken,
      statementIds: [statementAId as Id<"bankStatements">, statementBId as Id<"bankStatements">],
    });

    expect(result[statementAId].reconciledPct).toBe(100);
    expect(result[statementAId].confirmed).toBe(2);
    expect(result[statementBId].reconciledPct).toBe(0);
    expect(result[statementBId].unmatched).toBe(3);
  });
});
