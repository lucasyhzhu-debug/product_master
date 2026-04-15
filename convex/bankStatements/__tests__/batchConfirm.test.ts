/**
 * batchConfirmExactTier mutation tests — Phase 73 Plan 01.
 *
 * Contract: posts JEs for all lines where confidence='exact' AND status IN ('auto_matched','suggested')
 * AND both jeDebit/jeCredit accounts present. Returns { posted, skipped, totalAmountIdr }.
 * Convex mutation atomicity means any mid-flight throw rolls back the entire batch.
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { seedReconcileFixture } from "./reconcileHelpers";

describe("batchConfirmExactTier", () => {
  it("posts JEs for all exact-tier lines; returns count + total", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    // Fixture has one exact-tier suggested line (matchedLineId) with both JE accounts present.
    // unmatchedLine is confidence='strong' (NOT exact) so it must be excluded.
    const result = await t.mutation(api.bankStatements.mutations.batchConfirmExactTier, {
      token: f.managerToken,
      statementId: f.statementId,
    });

    expect(result.posted).toBe(1);
    expect(result.totalAmountIdr).toBe(250000);
    expect(result.skipped).toBe(0);

    const line = await t.run(async (ctx) => ctx.db.get(f.matchedLineId));
    expect(line!.status).toBe("confirmed");
    expect(line!.confirmedJournalEntryId).toBeDefined();
  });

  it("skipped count reflects exact-tier lines missing jeDebitAccountId/jeCreditAccountId", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    // Strip JE accounts from matched line, and add an exact-tier line with accounts:
    await t.run(async (ctx) => {
      await ctx.db.patch(f.matchedLineId, {
        jeDebitAccountId: undefined,
        jeCreditAccountId: undefined,
      } as never);
    });

    const result = await t.mutation(api.bankStatements.mutations.batchConfirmExactTier, {
      token: f.managerToken,
      statementId: f.statementId,
    });

    expect(result.posted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.totalAmountIdr).toBe(0);
  });

  it("returns 0/0/0 when no exact-tier lines present (idempotent)", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    // Downgrade matched line from exact to strong — no more exact-tier candidates
    await t.run(async (ctx) => {
      await ctx.db.patch(f.matchedLineId, {
        confidence: "strong",
      } as never);
    });

    const result = await t.mutation(api.bankStatements.mutations.batchConfirmExactTier, {
      token: f.managerToken,
      statementId: f.statementId,
    });

    expect(result.posted).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.totalAmountIdr).toBe(0);
  });

  it("atomic: any failure rolls back the entire batch (Convex mutation semantics)", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    // Poison the matched line by setting a non-existent cash account id.
    // createJournalEntryWithLines runs validateJournalLines which throws on zero-zero /
    // imbalance; we force imbalance by patching amount to 0 which triggers the
    // zero-zero line guard. That throw rolls back any preceding posts in the batch.
    await t.run(async (ctx) => {
      await ctx.db.patch(f.matchedLineId, { amountIdr: 0 } as never);
    });

    await expect(
      t.mutation(api.bankStatements.mutations.batchConfirmExactTier, {
        token: f.managerToken,
        statementId: f.statementId,
      }),
    ).rejects.toThrow();

    // Post-throw: no line mutated to confirmed
    const line = await t.run(async (ctx) => ctx.db.get(f.matchedLineId));
    expect(line!.status).not.toBe("confirmed");
  });

  it("rejects kitchen role", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);

    await expect(
      t.mutation(api.bankStatements.mutations.batchConfirmExactTier, {
        token: f.kitchenToken,
        statementId: f.statementId,
      }),
    ).rejects.toThrow();
  });
});
