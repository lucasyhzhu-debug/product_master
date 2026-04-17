/**
 * revenueGapByPeriod tests — Phase 73 Plan 02 Wave 0 (C1 updated).
 *
 * Contract:
 *  - Rows include every distinct linkedChannel from credit lines in [periodStart,
 *    periodEnd] + synthetic "(unallocated)" row for credits with linkedChannel=null.
 *  - bankCr = SUM(amountIdr) where direction='credit', linkedChannel=row, date
 *    in window.
 *  - Mapped channels: extRev = SUM(externalRevenue.revenueGross) grouped by
 *    mapChannelToSource(channel) in period; diff = bankCr - extRev;
 *    diffPct = (diff/extRev)*100 when extRev>0, else null.
 *  - Unmapped channels go into a separate `unmappedRows` group with
 *    extRev=null, diff=bankCr, diffPct=null (C1 fix).
 *  - "(unallocated)" row has extRev=null and stays in `rows`.
 *  - Kitchen role rejected; empty period returns { rows: [], unmappedRows: [] }.
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { seedReconcileFixture } from "./reconcileHelpers";
import type { Id } from "../../_generated/dataModel";

const periodStart = Date.UTC(2026, 1, 1);
const periodEnd = Date.UTC(2026, 1, 28, 23, 59, 59, 999);
const lineDate = Date.UTC(2026, 1, 15);

async function seedCreditLinesAndRevenue(
  t: ReturnType<typeof convexTest>,
  statementId: Id<"bankStatements">,
) {
  await t.run(async (ctx) => {
    // Credit bank lines with linkedChannel
    await ctx.db.insert("bankStatementLines", {
      statementId,
      rowIndex: 100,
      date: lineDate,
      month: "2026-02",
      rawDescription: "GoPay deposit",
      direction: "credit",
      amountIdr: 1_000_000,
      confidence: "strong",
      status: "auto_matched",
      isAutoMatched: true,
      linkedChannel: "gopay", // maps → gobiz
    } as never);
    await ctx.db.insert("bankStatementLines", {
      statementId,
      rowIndex: 101,
      date: lineDate,
      month: "2026-02",
      rawDescription: "GrabFood deposit",
      direction: "credit",
      amountIdr: 500_000,
      confidence: "strong",
      status: "auto_matched",
      isAutoMatched: true,
      linkedChannel: "grabfood", // maps → grabfood
    } as never);
    await ctx.db.insert("bankStatementLines", {
      statementId,
      rowIndex: 102,
      date: lineDate,
      month: "2026-02",
      rawDescription: "OVO topup",
      direction: "credit",
      amountIdr: 200_000,
      confidence: "strong",
      status: "suggested",
      isAutoMatched: false,
      linkedChannel: "ovo", // unmapped
    } as never);
    // Unallocated (no linkedChannel)
    await ctx.db.insert("bankStatementLines", {
      statementId,
      rowIndex: 103,
      date: lineDate,
      month: "2026-02",
      rawDescription: "Mystery credit",
      direction: "credit",
      amountIdr: 300_000,
      confidence: "none",
      status: "unmatched",
      isAutoMatched: false,
    } as never);
    // Debit line — must be ignored
    await ctx.db.insert("bankStatementLines", {
      statementId,
      rowIndex: 104,
      date: lineDate,
      month: "2026-02",
      rawDescription: "Office debit",
      direction: "debit",
      amountIdr: 400_000,
      confidence: "strong",
      status: "suggested",
      isAutoMatched: false,
      linkedChannel: "gopay",
    } as never);

    // externalRevenue rows
    await ctx.db.insert("externalRevenue", {
      source: "gobiz",
      periodStart: lineDate,
      periodEnd: lineDate,
      revenueGross: 900_000, // close to gopay 1M → small diff
      revenueNet: 850_000,
      dataOrigin: "api_revenue",
      confidence: "exact",
      transactionDate: lineDate,
    } as never);
    await ctx.db.insert("externalRevenue", {
      source: "grabfood",
      periodStart: lineDate,
      periodEnd: lineDate,
      revenueGross: 500_000, // matches grabfood bank exactly → diff=0
      revenueNet: 475_000,
      dataOrigin: "api_revenue",
      confidence: "exact",
      transactionDate: lineDate,
    } as never);
  });
}

describe("revenueGapByPeriod", () => {
  it("rows include every distinct linkedChannel + synthetic (unallocated) row", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);
    await seedCreditLinesAndRevenue(t, f.statementId);

    const result = await t.query(api.bankStatements.queries.revenueGapByPeriod, {
      token: f.managerToken,
      periodStart,
      periodEnd,
    });

    // rows: gopay (mapped), grabfood (mapped), unallocated — ovo is in unmappedRows
    const mappedChannels = result.rows.flatMap(
      (r: { channels: string[] }) => r.channels,
    );
    expect(mappedChannels).toContain("gopay");
    expect(mappedChannels).toContain("grabfood");
    expect(
      result.rows.find((r: { unallocated?: boolean }) => r.unallocated === true),
    ).toBeDefined();
  });

  it("bankCr sums credit lines only in period window per channel", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);
    await seedCreditLinesAndRevenue(t, f.statementId);

    const result = await t.query(api.bankStatements.queries.revenueGapByPeriod, {
      token: f.managerToken,
      periodStart,
      periodEnd,
    });
    const gopay = result.rows.find((r: { channels: string[] }) =>
      r.channels.includes("gopay"),
    );
    expect(gopay).toBeDefined();
    expect(gopay!.bankCr).toBe(1_000_000); // Debit line for gopay must be ignored
    const grabfood = result.rows.find((r: { channels: string[] }) =>
      r.channels.includes("grabfood"),
    );
    expect(grabfood!.bankCr).toBe(500_000);
  });

  it("mapped channels join via mapChannelToSource and compute extRev by source", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);
    await seedCreditLinesAndRevenue(t, f.statementId);

    const result = await t.query(api.bankStatements.queries.revenueGapByPeriod, {
      token: f.managerToken,
      periodStart,
      periodEnd,
    });

    const gopay = result.rows.find((r: { channels: string[] }) =>
      r.channels.includes("gopay"),
    );
    expect(gopay!.source).toBe("gobiz");
    expect(gopay!.extRev).toBe(900_000);
    expect(gopay!.diff).toBe(100_000);
    expect(gopay!.diffPct).toBeCloseTo(100_000 / 900_000 * 100, 2);

    const grabfood = result.rows.find((r: { channels: string[] }) =>
      r.channels.includes("grabfood"),
    );
    expect(grabfood!.source).toBe("grabfood");
    expect(grabfood!.extRev).toBe(500_000);
    expect(grabfood!.diff).toBe(0);
  });

  it("diff and diffPct computed per row; diffPct null when extRev is 0 or null", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);
    await seedCreditLinesAndRevenue(t, f.statementId);

    const result = await t.query(api.bankStatements.queries.revenueGapByPeriod, {
      token: f.managerToken,
      periodStart,
      periodEnd,
    });

    const unallocated = result.rows.find(
      (r: { unallocated?: boolean }) => r.unallocated === true,
    );
    expect(unallocated!.extRev).toBeNull();
    expect(unallocated!.diffPct).toBeNull();
  });

  it("unmapped channels (ovo) go into unmappedRows group with extRev=null (C1)", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);
    await seedCreditLinesAndRevenue(t, f.statementId);

    const result = await t.query(api.bankStatements.queries.revenueGapByPeriod, {
      token: f.managerToken,
      periodStart,
      periodEnd,
    });

    expect(Array.isArray(result.unmappedRows)).toBe(true);
    const ovo = result.unmappedRows.find((r) => r.channel === "ovo");
    expect(ovo).toBeDefined();
    expect(ovo!.bankCr).toBe(200_000);
    expect(ovo!.extRev).toBeNull();
    expect(ovo!.diff).toBe(200_000);
    expect(ovo!.diffPct).toBeNull();
    expect(ovo!.unmapped).toBe(true);

    // ovo MUST NOT appear in rows
    expect(result.rows.find((r) => r.channels.includes("ovo"))).toBeUndefined();
  });

  it("(unallocated) row has extRev=null and stays in rows (not unmappedRows)", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);
    await seedCreditLinesAndRevenue(t, f.statementId);

    const result = await t.query(api.bankStatements.queries.revenueGapByPeriod, {
      token: f.managerToken,
      periodStart,
      periodEnd,
    });
    const unallocated = result.rows.find(
      (r: { unallocated?: boolean }) => r.unallocated === true,
    );
    expect(unallocated).toBeDefined();
    expect(unallocated!.extRev).toBeNull();
    expect(
      result.unmappedRows.find((r) => r.channel === "(unallocated)"),
    ).toBeUndefined();
  });

  it("kitchen role rejected", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);
    await expect(
      t.query(api.bankStatements.queries.revenueGapByPeriod, {
        token: f.kitchenToken,
        periodStart,
        periodEnd,
      }),
    ).rejects.toThrow();
  });

  it("empty period returns empty rows and unmappedRows", async () => {
    const t = convexTest(schema);
    const f = await seedReconcileFixture(t);
    // No credit lines in period 2030
    const result = await t.query(api.bankStatements.queries.revenueGapByPeriod, {
      token: f.managerToken,
      periodStart: Date.UTC(2030, 0, 1),
      periodEnd: Date.UTC(2030, 0, 31),
    });
    expect(result.rows).toEqual([]);
    expect(result.unmappedRows).toEqual([]);
  });
});
