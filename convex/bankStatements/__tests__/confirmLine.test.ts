/**
 * confirmLine mutation tests — Phase 73 Plan 01.
 *
 * Contract: confirm posts a 2-line balanced JE via createJournalEntryWithLines with
 * sourceType='bank_statement' and sourceId=line._id; line transitions to status='confirmed'
 * with audit fields populated.
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { seedReconcileFixture } from "./reconcileHelpers";

describe("confirmLine", () => {
  it("posts a balanced 2-line JE and marks line confirmed", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    await t.mutation(api.bankStatements.mutations.confirmLine, {
      token: f.managerToken,
      lineId: f.matchedLineId,
    });

    const line = await t.run(async (ctx) => ctx.db.get(f.matchedLineId));
    expect(line!.status).toBe("confirmed");
    expect(line!.confirmedJournalEntryId).toBeDefined();
    expect(line!.confirmedBy).toBeDefined();
    expect(line!.confirmedAt).toBeTypeOf("number");

    const je = await t.run(async (ctx) => ctx.db.get(line!.confirmedJournalEntryId!));
    expect(je!.sourceType).toBe("bank_statement");
    expect(je!.sourceId).toBe(f.matchedLineId);

    const jeLines = await t.run(async (ctx) =>
      ctx.db
        .query("journalEntryLines")
        .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", je!._id))
        .collect(),
    );
    expect(jeLines).toHaveLength(2);
    const totalDebit = jeLines.reduce((s, l) => s + l.debitAmount, 0);
    const totalCredit = jeLines.reduce((s, l) => s + l.creditAmount, 0);
    expect(totalDebit).toBe(250000);
    expect(totalCredit).toBe(250000);
    expect(totalDebit).toBe(totalCredit);
  });

  it("throws when line missing jeDebitAccountId", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    await t.run(async (ctx) => {
      await ctx.db.patch(f.matchedLineId, {
        jeDebitAccountId: undefined,
      } as never);
    });

    await expect(
      t.mutation(api.bankStatements.mutations.confirmLine, {
        token: f.managerToken,
        lineId: f.matchedLineId,
      }),
    ).rejects.toThrow(/no JE accounts|classify first/i);
  });

  it("throws when line missing jeCreditAccountId", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    await t.run(async (ctx) => {
      await ctx.db.patch(f.matchedLineId, {
        jeCreditAccountId: undefined,
      } as never);
    });

    await expect(
      t.mutation(api.bankStatements.mutations.confirmLine, {
        token: f.managerToken,
        lineId: f.matchedLineId,
      }),
    ).rejects.toThrow(/no JE accounts|classify first/i);
  });

  it("throws when line already confirmed", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    await expect(
      t.mutation(api.bankStatements.mutations.confirmLine, {
        token: f.managerToken,
        lineId: f.confirmedLineId,
      }),
    ).rejects.toThrow(/Already confirmed/i);
  });

  it("rejects kitchen role", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    await expect(
      t.mutation(api.bankStatements.mutations.confirmLine, {
        token: f.kitchenToken,
        lineId: f.matchedLineId,
      }),
    ).rejects.toThrow();
  });
});
