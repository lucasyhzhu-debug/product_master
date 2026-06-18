/**
 * POS sales sync (source #9) — end-to-end income-statement sign verification.
 *
 * The POS adapter stores refunds as a parent-only `transactionType:"return"` row
 * with NEGATIVE `revenueGross` (= -totalRefund). The plan's correctness rests on
 * the income-statement aggregation summing `revenueGross` RAW for platform
 * channels (incomeStatement.ts ~line 298: `channelGross += rec.revenueGross ?? 0`),
 * so a negative return naturally SUBTRACTS. Spec §10 #3 asked this be verified
 * end-to-end rather than assumed — this test pins it.
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

type TestT = ReturnType<typeof convexTest>;

async function seedPosRevenue(
  t: TestT,
  transactionDate: number,
  revenueGross: number,
  transactionType: "sales" | "return",
  externalTransactionId: string,
): Promise<Id<"externalRevenue">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("externalRevenue", {
      source: "pos",
      revenueGross,
      periodStart: transactionDate,
      periodEnd: transactionDate,
      transactionDate,
      transactionType,
      transactionCount: 1,
      externalTransactionId,
      dataOrigin: "api_revenue" as const,
      confidence: "exact" as const,
    } as never),
  );
}

function posChannel(stmt: any): any {
  const channels = stmt?.current?.channels ?? [];
  return Array.isArray(channels)
    ? channels.find((c: any) => c.source === "pos") ?? null
    : null;
}

describe("incomeStatement — POS return sign (negative gross subtracts)", () => {
  it("a POS return subtracts from the POS channel gross (sales + return)", async () => {
    const t = convexTest(schema);
    const ts = Date.now() - 5 * 24 * 60 * 60 * 1000;

    await seedPosRevenue(t, ts, 81000, "sales", "R-2026-0042");
    await seedPosRevenue(t, ts, -45000, "return", "R-2026-0042|R|1718700000000");

    const stmt = await t.query(api.reports.incomeStatement.getIncomeStatement, {
      periodStart: ts - 1000,
      periodEnd: ts + 1000,
    });

    const pos = posChannel(stmt);
    expect(pos).not.toBeNull();
    // 81_000 sale − 45_000 refund = 36_000 net gross for the channel.
    expect(pos.gross).toBe(36000);
  });

  it("a refund-only window yields a NEGATIVE POS channel gross", async () => {
    const t = convexTest(schema);
    const ts = Date.now() - 5 * 24 * 60 * 60 * 1000;

    await seedPosRevenue(t, ts, -45000, "return", "R-2026-0042|R|1718700000000");

    const stmt = await t.query(api.reports.incomeStatement.getIncomeStatement, {
      periodStart: ts - 1000,
      periodEnd: ts + 1000,
    });

    const pos = posChannel(stmt);
    expect(pos).not.toBeNull();
    expect(pos.gross).toBe(-45000);
  });
});
