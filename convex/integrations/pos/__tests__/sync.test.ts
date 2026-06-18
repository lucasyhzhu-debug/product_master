import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../../schema";
import { internal } from "../../../_generated/api";
import { salesPageFixture, refundsPageFixture } from "../fixtures";

const seed = async (t: any) =>
  t.run((ctx: any) => ctx.db.insert("platformCredentials", {
    platformId: "pos", currentToken: "frpos_test_x", updatedBy: "test", updatedAt: 0 }));
const posRows = (t: any, table: string) =>
  t.run((ctx: any) => ctx.db.query(table).withIndex("by_source", (q: any) => q.eq("source", "pos")).collect());

beforeEach(() => { process.env.POS_API_BASE_URL = "https://pos.test"; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("syncPosRevenue — write path", () => {
  it("sales: one parent + one item, idempotent across two runs", async () => {
    const t = convexTest(schema); await seed(t);
    let salesCall = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/transactions")) {
        salesCall++;
        // Each run makes exactly one page fetch: fixture data + terminal null cursor → loop breaks after page 1
        return new Response(JSON.stringify({ ...salesPageFixture, nextCursor: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [], nextCursor: null }), { status: 200 });
    }));
    await t.action(internal.integrations.pos.sync.syncPosRevenue, { triggeredBy: "test" });
    await t.action(internal.integrations.pos.sync.syncPosRevenue, { triggeredBy: "test" });
    const parents = await posRows(t, "externalRevenue");
    const items = await posRows(t, "externalRevenueItems");
    expect(parents.filter((p: any) => p.transactionType === "sales")).toHaveLength(1); // upsert, no dup
    expect(items).toHaveLength(1);                                                      // set-once, no dup
    expect(parents[0].revenueGross).toBe(81000);
  });

  it("refund: NEGATIVE-gross parent, NO child items", async () => {
    const t = convexTest(schema); await seed(t);
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("/refunds")
        ? new Response(JSON.stringify(refundsPageFixture), { status: 200 })  // nextCursor null
        : new Response(JSON.stringify({ data: [], nextCursor: null }), { status: 200 })));
    await t.action(internal.integrations.pos.sync.syncPosRevenue, { triggeredBy: "test" });
    const parents = await posRows(t, "externalRevenue");
    const items = await posRows(t, "externalRevenueItems");
    const ret = parents.find((p: any) => p.transactionType === "return");
    expect(ret.revenueGross).toBe(-45000);      // ← subtracts in financials
    expect(ret.externalTransactionId).toBe("R-2026-0042|R|1718700000000");
    expect(items).toHaveLength(0);              // parent-only
  });
});

describe("syncPosRevenue — cursor discipline", () => {
  it("persists the last NON-NULL cursor mid-drain and resumes after a thrown page", async () => {
    const t = convexTest(schema); await seed(t);
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/transactions")) {
        call++;
        if (call === 1) return new Response(JSON.stringify({ ...salesPageFixture, nextCursor: "c1" }), { status: 200 });
        return new Response("boom", { status: 500 });   // page 2 throws
      }
      return new Response(JSON.stringify({ data: [], nextCursor: null }), { status: 200 });
    }));
    await t.action(internal.integrations.pos.sync.syncPosRevenue, { triggeredBy: "test" });
    const cp = await t.query(internal.integrations.pos.checkpoint.getCheckpoint, {});
    expect(cp?.salesCursor).toBe("c1");   // advanced past page 1, NOT reset to ∅; status logged error
  });
});
