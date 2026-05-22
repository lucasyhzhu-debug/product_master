/**
 * Phase 83-03 — Token auto-refresh (D-03).
 *
 * BigSeller returns a fresher `muctoken` JWT in the response headers on every
 * successful call (iat=now, exp=iat+20d). `fetchOrders` accumulates the freshest
 * one and persists it ONCE at end of a successful sync via
 * `platformCredentials.mutations.updateToken` with
 * `lastRefreshStatus: "auto-refreshed-from-response"`.
 *
 * The persist decision lives in the pure helper `shouldPersistRefreshedToken`
 * (see sync.ts) so the defensive guards (T-83-03-01) are unit-testable without
 * mocking the full `"use node"` action fetch loop. The header-capture +
 * updateToken wiring is covered by driving updateToken directly with the
 * decoded expiry (mirrors the end-of-sync persist block).
 */

import { convexTest } from "convex-test";
import { describe, it, expect, vi, afterEach } from "vitest";
import schema from "../../../schema";
import { internal } from "../../../_generated/api";
import { decodeJwtPayload } from "../../../lib/jwt";
import { shouldPersistRefreshedToken, mapWithConcurrency } from "../sync";
import { BIGSELLER_PLATFORM_ID } from "../config";
import type { Id } from "../../../_generated/dataModel";

// Real HAR JWT shape (exp:1780911842 ~ iat+20d). Signature is irrelevant — we
// never verify it (83-RESEARCH.md). Generated from the documented payload.
const NEW_TOKEN =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIiwiZXhwIjoxNzgwOTExODQyLCJpYXQiOjE3NzkxODM4NDJ9.sigNEW";
const SEEDED_TOKEN =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIiwiZXhwIjoxNzc5MDAwMDAwLCJpYXQiOjE3NzcyNzIwMDB9.sigOLD";

async function seedCredential(t: ReturnType<typeof convexTest>, token: string) {
  await t.run(async (ctx) => {
    await ctx.db.insert("platformCredentials", {
      platformId: BIGSELLER_PLATFORM_ID,
      currentToken: token,
      updatedBy: "test",
      updatedAt: Date.now(),
    });
  });
}

async function readCredential(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) =>
    ctx.db
      .query("platformCredentials")
      .withIndex("by_platform", (q) => q.eq("platformId", BIGSELLER_PLATFORM_ID))
      .first(),
  );
}

describe("BigSeller token auto-refresh — shouldPersistRefreshedToken guard", () => {
  it("returns true when a NEW non-empty token differs from current and no auth error", () => {
    expect(shouldPersistRefreshedToken(NEW_TOKEN, SEEDED_TOKEN, false)).toBe(true);
  });

  it("does NOT persist when refreshed token equals current token", () => {
    expect(shouldPersistRefreshedToken(SEEDED_TOKEN, SEEDED_TOKEN, false)).toBe(false);
  });

  it("does NOT persist when the muctoken header is empty", () => {
    expect(shouldPersistRefreshedToken("", SEEDED_TOKEN, false)).toBe(false);
  });

  it("does NOT persist when an auth error was observed during the sync", () => {
    // Even a perfectly valid, different token must NOT be persisted if any auth
    // error was seen — guards against overwriting a good token with a degraded
    // one from a partial-failure response (T-83-03-01).
    expect(shouldPersistRefreshedToken(NEW_TOKEN, SEEDED_TOKEN, true)).toBe(false);
  });
});

describe("BigSeller token auto-refresh — persist wiring (updateToken)", () => {
  it("persists a refreshed muctoken with the auto-refresh status after a successful fetch", async () => {
    const t = convexTest(schema);
    await seedCredential(t, SEEDED_TOKEN);

    // Mirror the end-of-sync persist block: guard passes, decode exp, write.
    expect(shouldPersistRefreshedToken(NEW_TOKEN, SEEDED_TOKEN, false)).toBe(true);
    const exp = decodeJwtPayload(NEW_TOKEN).exp as number;
    await t.mutation(internal.platformCredentials.mutations.updateToken, {
      platformId: BIGSELLER_PLATFORM_ID,
      currentToken: NEW_TOKEN,
      tokenExpiresAt: exp * 1000,
      lastRefreshAt: Date.now(),
      lastRefreshStatus: "auto-refreshed-from-response",
    });

    const cred = await readCredential(t);
    expect(cred?.currentToken).toBe(NEW_TOKEN);
    expect(cred?.lastRefreshStatus).toBe("auto-refreshed-from-response");
  });

  it("sets tokenExpiresAt to exp*1000 of the refreshed token", async () => {
    const t = convexTest(schema);
    await seedCredential(t, SEEDED_TOKEN);

    const exp = decodeJwtPayload(NEW_TOKEN).exp as number;
    expect(exp).toBe(1780911842);
    await t.mutation(internal.platformCredentials.mutations.updateToken, {
      platformId: BIGSELLER_PLATFORM_ID,
      currentToken: NEW_TOKEN,
      tokenExpiresAt: exp * 1000,
      lastRefreshAt: Date.now(),
      lastRefreshStatus: "auto-refreshed-from-response",
    });

    const cred = await readCredential(t);
    expect(cred?.tokenExpiresAt).toBe(1780911842 * 1000);
  });

  it("leaves the credential token unchanged when the guard rejects (equal/empty/auth-error)", async () => {
    const t = convexTest(schema);
    await seedCredential(t, SEEDED_TOKEN);

    // Each rejection case: guard is false, so the persist block never runs.
    expect(shouldPersistRefreshedToken(SEEDED_TOKEN, SEEDED_TOKEN, false)).toBe(false);
    expect(shouldPersistRefreshedToken("", SEEDED_TOKEN, false)).toBe(false);
    expect(shouldPersistRefreshedToken(NEW_TOKEN, SEEDED_TOKEN, true)).toBe(false);

    const cred = await readCredential(t);
    expect(cred?.currentToken).toBe(SEEDED_TOKEN);
    expect(cred?.lastRefreshStatus).toBeUndefined();
  });
});

describe("getRevenueByIds (O4 N+1 elimination)", () => {
  async function seedRevenue(
    t: ReturnType<typeof convexTest>,
    externalTransactionId: string,
  ): Promise<Id<"externalRevenue">> {
    return t.run(async (ctx) =>
      ctx.db.insert("externalRevenue", {
        source: "shopee",
        periodStart: 1779000000000,
        periodEnd: 1779000000000,
        dataOrigin: "api_revenue",
        confidence: "exact",
        externalTransactionId,
        revenueGross: 100,
      }),
    );
  }

  it("returns exactly the docs for the real ids; a missing/deleted id is omitted (not null)", async () => {
    const t = convexTest(schema);
    const idA = await seedRevenue(t, "bigseller:A");
    const idB = await seedRevenue(t, "bigseller:B");
    const idC = await seedRevenue(t, "bigseller:C");

    // A 4th id that is deleted -> must be absent from the result, not null.
    const idGhost = await seedRevenue(t, "bigseller:GHOST");
    await t.run(async (ctx) => ctx.db.delete(idGhost));

    const entries = await t.query(
      internal.integrations.bigseller.queries.getRevenueByIds,
      { revenueIds: [idA, idB, idC, idGhost] },
    );

    // Flag #5 — a raw Map is NOT a supported Convex return type (it throws
    // "Map ... is not a supported Convex type" over the runQuery boundary), so
    // getRevenueByIds returns Array<[id, doc]> and the caller builds the Map.
    expect(Array.isArray(entries)).toBe(true);
    const map = new Map(entries);
    expect(map.size).toBe(3);
    expect(map.get(idA)?.externalTransactionId).toBe("bigseller:A");
    expect(map.get(idB)?.externalTransactionId).toBe("bigseller:B");
    expect(map.get(idC)?.externalTransactionId).toBe("bigseller:C");
    expect(map.has(idGhost)).toBe(false);
    expect(map.get(idGhost)).toBeUndefined();
  });

  it("parity: getRevenueByIds(id) deep-equals getRevenueById({revenueId: id}) for every id", async () => {
    const t = convexTest(schema);
    const ids = [
      await seedRevenue(t, "bigseller:P1"),
      await seedRevenue(t, "bigseller:P2"),
      await seedRevenue(t, "bigseller:P3"),
    ];

    const batch = new Map(
      await t.query(
        internal.integrations.bigseller.queries.getRevenueByIds,
        { revenueIds: ids },
      ),
    );

    for (const id of ids) {
      const single = await t.query(
        internal.integrations.bigseller.queries.getRevenueById,
        { revenueId: id },
      );
      expect(batch.get(id)).toEqual(single);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Phase 83-07 — Parallel fetch (O1 platforms + O2 pages 2..N).
//
// These tests drive the full `fetchOrders` `"use node"` action end-to-end with a
// stubbed `global.fetch` keyed by endpoint (shopee vs tiktok) and request body
// pageNo. They lock the concurrency contract: no double-count, page-2 failure
// surfaces, the cross-platform leak guard survives, token auto-refresh persists
// the freshest muctoken under concurrency, and a one-platform page-1 fatal is
// scoped to that platform while the sibling's data still lands (staffreview R2).
// ──────────────────────────────────────────────────────────────────────────────

// JWT shape that decodes (exp:1780911842). Signature irrelevant.
const FRESH_TOKEN =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIiwiZXhwIjoxNzgwOTExODQyLCJpYXQiOjE3NzkxODM4NDJ9.sigFRESH";

function makeRow(platformOrderId: string, sku: string) {
  return {
    shopId: 0,
    shopName: "test",
    platform: "",
    platformOrderId,
    orderState: "completed",
    orderTime: 1779000000000,
    saleAmount: 100,
    platformIncome: 90,
    costFee: 0,
    profit: 10,
    profitMargin: "10%",
    commissionFee: 5,
    sellerShippingFee: 0,
    buyerShippingFee: 0,
    otherFee: 0,
    allSkuNum: 1,
    orderAmount: 100,
    skuVoList: [{ sku, skuNum: 1, returnNum: 0, isAddition: 0 }],
  };
}

function pageBody(rows: unknown[], totalPage: number) {
  return JSON.stringify({
    code: 0,
    data: { itemPageVo: { totalPage, totalSize: rows.length, rows } },
  });
}

function makeResponse(text: string, mucToken?: string): Response {
  const headers = new Headers();
  if (mucToken) headers.set("muctoken", mucToken);
  return {
    text: async () => text,
    headers,
  } as unknown as Response;
}

/**
 * Stub global.fetch. `handler(endpoint, pageNo)` returns the response BODY string
 * (or a full Response via the `response` escape hatch). `endpoint` is "shopee" or
 * "tiktok"; `pageNo` parsed from the request body.
 */
function stubFetch(
  handler: (endpoint: "shopee" | "tiktok", pageNo: number) => string | Response,
) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const endpoint: "shopee" | "tiktok" = url.includes("tiktok") ? "tiktok" : "shopee";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const pageNo = body.pageNo ?? 1;
    const out = handler(endpoint, pageNo);
    if (typeof out === "string") return makeResponse(out, FRESH_TOKEN);
    return out;
  }));
}

async function seedSyncContext(t: ReturnType<typeof convexTest>, token = SEEDED_TOKEN) {
  await t.run(async (ctx) => {
    await ctx.db.insert("platformCredentials", {
      platformId: BIGSELLER_PLATFORM_ID,
      currentToken: token,
      updatedBy: "test",
      updatedAt: Date.now(),
    });
  });
  const syncLogId = await t.run(async (ctx) =>
    ctx.db.insert("externalSyncLogs", {
      source: "shopee",
      syncType: "manual",
      status: "started",
      timestamp: Date.now(),
    }),
  );
  return syncLogId as Id<"externalSyncLogs">;
}

async function runFetch(t: ReturnType<typeof convexTest>, syncLogId: Id<"externalSyncLogs">) {
  await t.action(internal.integrations.bigseller.sync.fetchOrders, {
    startDate: "2026-05-01",
    endDate: "2026-05-31",
    attempt: 0,
    syncLogId,
  });
}

describe("mapWithConcurrency (O2 page fan-out helper)", () => {
  it("preserves input order in the result array", async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 4, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30, 40, 50, 60, 70]);
  });

  it("honors the concurrency cap of 4 — never more than 4 fn calls in flight", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fn = async (n: number) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return n;
    };
    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4, fn);
    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(maxInFlight).toBe(4); // a full chunk runs concurrently
  });
});

describe("BigSeller parallel fetch (O1/O2)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not double-count orders under concurrent platform processing", async () => {
    const t = convexTest(schema);
    const syncLogId = await seedSyncContext(t);

    // Each platform returns 2 pages; the same orderId appears on BOTH pages of a
    // platform to prove per-externalTransactionId idempotency (no double-count).
    stubFetch((endpoint, pageNo) => {
      const prefix = endpoint === "shopee" ? "SH" : "TT";
      if (pageNo === 1) {
        return pageBody([makeRow(`${prefix}-1`, `${prefix}-SKU`), makeRow(`${prefix}-2`, `${prefix}-SKU`)], 2);
      }
      // Page 2 re-emits an already-seen order (`${prefix}-1`) + one new (`${prefix}-3`).
      return pageBody([makeRow(`${prefix}-1`, `${prefix}-SKU`), makeRow(`${prefix}-3`, `${prefix}-SKU`)], 2);
    });

    await runFetch(t, syncLogId);

    const { orders, revenue } = await t.run(async (ctx) => ({
      orders: await ctx.db.query("bigsellerOrders").collect(),
      revenue: await ctx.db.query("externalRevenue").collect(),
    }));

    // Unique orders across both platforms: SH-1, SH-2, SH-3, TT-1, TT-2, TT-3 = 6.
    const orderIds = new Set(orders.map((o: any) => o.platformOrderId));
    expect(orderIds.size).toBe(6);
    expect(orders.length).toBe(6); // each upserted exactly once (no duplicate rows)

    const txnIds = revenue.map((r: any) => r.externalTransactionId);
    expect(new Set(txnIds).size).toBe(txnIds.length); // every txn id unique
    expect(revenue.length).toBe(6);
  });

  it("surfaces a page-2 failure in parallel mode and still lands page-1 data", async () => {
    const t = convexTest(schema);
    const syncLogId = await seedSyncContext(t);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    stubFetch((endpoint, pageNo) => {
      const prefix = endpoint === "shopee" ? "SH" : "TT";
      if (pageNo === 1) {
        return pageBody([makeRow(`${prefix}-1`, `${prefix}-SKU`)], 2);
      }
      // Page 2: non-auth, non-readiness error (code:-1, generic msg). Contributes
      // 0 rows; must be logged and must NOT abort page-1 data.
      return JSON.stringify({ code: -1, msg: "page 2 transient error" });
    });

    await runFetch(t, syncLogId);

    const orders = await t.run(async (ctx) => ctx.db.query("bigsellerOrders").collect());
    // Page-1 data from BOTH platforms still landed (SH-1, TT-1).
    expect(orders.length).toBe(2);

    // The page-2 failure was surfaced in the error log.
    const logged = errorSpy.mock.calls.some((c) =>
      c.some((arg) => typeof arg === "string" && arg.includes("pageList error (page 2)")),
    );
    expect(logged).toBe(true);
    errorSpy.mockRestore();
  });

  it("preserves the cross-platform leak guard under concurrency (each order's revenue source matches its platform)", async () => {
    const t = convexTest(schema);
    const syncLogId = await seedSyncContext(t);

    stubFetch((endpoint, pageNo) => {
      const prefix = endpoint === "shopee" ? "SH" : "TT";
      if (pageNo === 1) {
        return pageBody([makeRow(`${prefix}-1`, `${prefix}-SKU`), makeRow(`${prefix}-2`, `${prefix}-SKU`)], 1);
      }
      return pageBody([], 1);
    });

    await runFetch(t, syncLogId);

    // The leak guard (T-79-02) asserts revDoc.source === platform per row. If
    // concurrency leaked, an item would emit against the wrong platform's revenue.
    // Verify every externalRevenue row's source matches the platform encoded in
    // its externalTransactionId (SH-* → shopee, TT-* → tiktok).
    const revenue = await t.run(async (ctx) => ctx.db.query("externalRevenue").collect());
    expect(revenue.length).toBe(4);
    for (const r of revenue as any[]) {
      const orderId = r.externalTransactionId.replace("bigseller:", "");
      const expected = orderId.startsWith("SH") ? "shopee" : "tiktok";
      expect(r.source).toBe(expected);
    }
  });

  it("still persists the freshest muctoken under concurrent platforms", async () => {
    const t = convexTest(schema);
    const syncLogId = await seedSyncContext(t, SEEDED_TOKEN);

    // Both platforms return the same fresher muctoken header (FRESH_TOKEN).
    stubFetch((endpoint) => {
      const prefix = endpoint === "shopee" ? "SH" : "TT";
      return pageBody([makeRow(`${prefix}-1`, `${prefix}-SKU`)], 1);
    });

    await runFetch(t, syncLogId);

    const cred = await readCredential(t);
    expect(cred?.currentToken).toBe(FRESH_TOKEN);
    expect(cred?.lastRefreshStatus).toBe("auto-refreshed-from-response");
    // tokenExpiresAt decoded from the fresh token (exp*1000).
    const exp = decodeJwtPayload(FRESH_TOKEN).exp as number;
    expect(cred?.tokenExpiresAt).toBe(exp * 1000);
  });

  it("scopes a one-platform page-1 fatal to that platform under O1 (sibling data still lands)", async () => {
    const t = convexTest(schema);
    const syncLogId = await seedSyncContext(t);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Shopee page-1 fatal (code:-1, NON-readiness msg → fails fast, no retry).
    // TikTok succeeds with 1 order.
    stubFetch((endpoint, pageNo) => {
      if (endpoint === "shopee") {
        return JSON.stringify({ code: -1, msg: "invalid required field" });
      }
      if (pageNo === 1) return pageBody([makeRow("TT-1", "TT-SKU")], 1);
      return pageBody([], 1);
    });

    await runFetch(t, syncLogId);

    // (a) Terminal sync status is "error" naming the failing platform.
    const log = await t.run(async (ctx) => ctx.db.get(syncLogId));
    expect(log?.status).toBe("error");
    expect(typeof log?.errorMessage).toBe("string");
    expect(log?.errorMessage).toContain("shopee");

    // (b) TikTok's order STILL landed — the sibling platform's resolved work is
    // NOT discarded (deliberate behavior change from the old all-or-nothing
    // early-return; staffreview R2).
    const orders = await t.run(async (ctx) => ctx.db.query("bigsellerOrders").collect());
    const ids = orders.map((o: any) => o.platformOrderId);
    expect(ids).toContain("TT-1");
    expect(ids).not.toContain("SH-1");

    errorSpy.mockRestore();
  });
});
