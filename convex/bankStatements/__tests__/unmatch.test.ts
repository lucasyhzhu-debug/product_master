/**
 * unmatch mutation tests — Phase 73 Plan 01.
 *
 * Contract: unmatch clears the link, recomputes status. When the line was already
 * `confirmed`, posts a reversal JE with sourceType="bank_statement_reversal" + swapped
 * DR/CR + original.date (business-date preservation, JE-03).
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { seedReconcileFixture } from "./reconcileHelpers";

describe("unmatch", () => {
  it("unmatching a suggested line clears link fields and sets status='unmatched' (no rule classification)", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    await t.mutation(api.bankStatements.mutations.unmatch, {
      token: f.managerToken,
      lineId: f.matchedLineId,
    });

    const line = await t.run(async (ctx) => ctx.db.get(f.matchedLineId));
    expect(line!.matchedType).toBeUndefined();
    expect(line!.matchedId).toBeUndefined();
    expect(line!.matchMethod).toBeUndefined();
    expect(line!.status).toBe("unmatched");
  });

  it("unmatching a suggested line WITH originalCategory present recomputes status='suggested'", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    // Patch matchedLine to simulate a keyword-classified line also linked to a record
    await t.run(async (ctx) => {
      await ctx.db.patch(f.matchedLineId, {
        originalCategory: "OpEx",
      } as never);
    });

    await t.mutation(api.bankStatements.mutations.unmatch, {
      token: f.managerToken,
      lineId: f.matchedLineId,
    });

    const line = await t.run(async (ctx) => ctx.db.get(f.matchedLineId));
    expect(line!.status).toBe("suggested");
  });

  it("unmatching a confirmed line creates a reversal JE with sourceType='bank_statement_reversal' and swapped DR/CR", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    await t.mutation(api.bankStatements.mutations.unmatch, {
      token: f.managerToken,
      lineId: f.confirmedLineId,
    });

    const line = await t.run(async (ctx) => ctx.db.get(f.confirmedLineId));
    expect(line!.reversalJournalEntryId).toBeDefined();
    expect(line!.reversedBy).toBeDefined();
    expect(line!.reversedAt).toBeTypeOf("number");

    const reversalJe = await t.run(async (ctx) => ctx.db.get(line!.reversalJournalEntryId!));
    expect(reversalJe!.sourceType).toBe("bank_statement_reversal");

    const reversalLines = await t.run(async (ctx) =>
      ctx.db
        .query("journalEntryLines")
        .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", reversalJe!._id))
        .collect(),
    );
    expect(reversalLines).toHaveLength(2);
    // Originally: DR expense=250000, CR cash=250000. Reversal must swap:
    const expLine = reversalLines.find((l) => l.accountId === f.expenseAccountId)!;
    const cashLine = reversalLines.find((l) => l.accountId === f.cashAccountId)!;
    expect(expLine.creditAmount).toBe(250000);
    expect(expLine.debitAmount).toBe(0);
    expect(cashLine.debitAmount).toBe(250000);
    expect(cashLine.creditAmount).toBe(0);

    // Original JE marked reversed
    const originalJe = await t.run(async (ctx) => ctx.db.get(f.confirmedJournalEntryId));
    expect(originalJe!.isReversed).toBe(true);
    expect(originalJe!.reversedByEntryId).toBe(reversalJe!._id);
  });

  it("reversal JE date equals ORIGINAL JE date (not Date.now()) — JE-03", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    const original = await t.run(async (ctx) => ctx.db.get(f.confirmedJournalEntryId));

    await t.mutation(api.bankStatements.mutations.unmatch, {
      token: f.managerToken,
      lineId: f.confirmedLineId,
    });

    const line = await t.run(async (ctx) => ctx.db.get(f.confirmedLineId));
    const reversalJe = await t.run(async (ctx) => ctx.db.get(line!.reversalJournalEntryId!));
    expect(reversalJe!.date).toBe(original!.date);
  });

  it("rejects kitchen role", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    await expect(
      t.mutation(api.bankStatements.mutations.unmatch, {
        token: f.kitchenToken,
        lineId: f.matchedLineId,
      }),
    ).rejects.toThrow();
  });

  it("rejects double-unmatch of already-reversed line", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    await t.mutation(api.bankStatements.mutations.unmatch, {
      token: f.managerToken,
      lineId: f.confirmedLineId,
    });

    // Second call should reject — reversalJournalEntryId already set
    await expect(
      t.mutation(api.bankStatements.mutations.unmatch, {
        token: f.managerToken,
        lineId: f.confirmedLineId,
      }),
    ).rejects.toThrow();
  });
});
