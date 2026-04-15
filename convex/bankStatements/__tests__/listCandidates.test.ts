/**
 * listCandidatesForLine + search* + markAssetLinked tests — Phase 73 Plan 02 Wave 0.
 *
 * Contract:
 *  - listCandidatesForLine(lineId) returns 4 groups (expense/revenue/
 *    reimbursement/payroll) within ±3 days, amountIdr===line.amountIdr,
 *    each candidate annotated with alreadyLinkedToLineId when another bank
 *    line already points to the same record (D-04 + RESEARCH Open Q #3).
 *  - Empty groups returned with count=0 (D-05).
 *  - Kitchen role rejected.
 *  - searchExpenses/searchRevenue/searchReimbursements/searchPayroll widen to
 *    whole-table substring match (D-06) — escape hatch dialog backing.
 *  - markAssetLinked is idempotent when called twice with the same expenseId
 *    (I1), and throws "Line already linked to different expense" when a
 *    different expenseId is supplied for an already-linked line (I1 conflict).
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { seedReconcileFixture } from "./reconcileHelpers";

describe("listCandidatesForLine", () => {
  it("returns 4 groups with matching amount and date within ±3 days", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    const result = await t.query(api.bankStatements.queries.listCandidatesForLine, {
      token: f.managerToken,
      lineId: f.unmatchedLineId,
    });
    expect(result).toHaveProperty("expense");
    expect(result).toHaveProperty("revenue");
    expect(result).toHaveProperty("reimbursement");
    expect(result).toHaveProperty("payroll");

    // expenseId is amount=250000, lineDate matches → should appear
    const expenseIds = result.expense.map((e: { _id: string }) => e._id);
    expect(expenseIds).toContain(f.expenseId);
  });

  it("annotates candidates with alreadyLinkedToLineId when already linked", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    // altExpenseId is pre-linked to confirmedLineId in the fixture.
    // Query candidates for unmatchedLine (amount 250000) — altExpenseId has amount=500000,
    // so we need a shared-amount linked target. Instead: query candidates for matchedLineId
    // which has amount=250000 and the seeded expenseId (amount=250000) is not yet linked
    // via the fixture, but matchedLineId IS linked to expenseId. So from unmatchedLine's
    // perspective, expenseId is already linked via matchedLineId.
    const result = await t.query(api.bankStatements.queries.listCandidatesForLine, {
      token: f.managerToken,
      lineId: f.unmatchedLineId,
    });
    const candidate = result.expense.find(
      (e: { _id: string; alreadyLinkedToLineId?: string }) => e._id === f.expenseId,
    );
    expect(candidate).toBeDefined();
    expect(candidate.alreadyLinkedToLineId).toBe(f.matchedLineId);
  });

  it("empty groups returned with count=0 rather than omitted (D-05)", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    const result = await t.query(api.bankStatements.queries.listCandidatesForLine, {
      token: f.managerToken,
      lineId: f.unmatchedLineId,
    });
    // payroll has no seeded candidates → empty array present
    expect(Array.isArray(result.payroll)).toBe(true);
    expect(result.payroll.length).toBe(0);
  });

  it("kitchen role rejected", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    await expect(
      t.query(api.bankStatements.queries.listCandidatesForLine, {
        token: f.kitchenToken,
        lineId: f.unmatchedLineId,
      }),
    ).rejects.toThrow();
  });
});

describe("search* widen queries (D-06)", () => {
  it("searchExpenses substring match by description", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    const result = await t.query(api.bankStatements.queries.searchExpenses, {
      token: f.managerToken,
      searchTerm: "Office supplies",
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    const ids = result.map((r: { _id: string }) => r._id);
    expect(ids).toContain(f.expenseId);
  });

  it("searchRevenue manager role accepted", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    const result = await t.query(api.bankStatements.queries.searchRevenue, {
      token: f.managerToken,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it("searchReimbursements manager role accepted", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    const result = await t.query(api.bankStatements.queries.searchReimbursements, {
      token: f.managerToken,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it("searchPayroll manager role accepted", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    const result = await t.query(api.bankStatements.queries.searchPayroll, {
      token: f.managerToken,
    });
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("markAssetLinked (I1 idempotency)", () => {
  it("second call with same expenseId is a no-op", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    await t.mutation(api.bankStatements.mutations.markAssetLinked, {
      token: f.managerToken,
      bankLineId: f.unmatchedLineId,
      expenseId: f.expenseId,
    });
    // Second call MUST not throw
    await t.mutation(api.bankStatements.mutations.markAssetLinked, {
      token: f.managerToken,
      bankLineId: f.unmatchedLineId,
      expenseId: f.expenseId,
    });

    const line = await t.run(async (ctx) => ctx.db.get(f.unmatchedLineId));
    expect(line!.createdExpenseId).toBe(f.expenseId);
    expect(line!.matchedType).toBe("expense");
    expect(line!.matchedId).toBe(f.expenseId);
  });

  it("second call with DIFFERENT expenseId throws conflict", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    await t.mutation(api.bankStatements.mutations.markAssetLinked, {
      token: f.managerToken,
      bankLineId: f.unmatchedLineId,
      expenseId: f.expenseId,
    });

    await expect(
      t.mutation(api.bankStatements.mutations.markAssetLinked, {
        token: f.managerToken,
        bankLineId: f.unmatchedLineId,
        expenseId: f.altExpenseId,
      }),
    ).rejects.toThrow(/already linked to different expense/i);
  });

  it("kitchen role rejected", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    await expect(
      t.mutation(api.bankStatements.mutations.markAssetLinked, {
        token: f.kitchenToken,
        bankLineId: f.unmatchedLineId,
        expenseId: f.expenseId,
      }),
    ).rejects.toThrow();
  });
});
