import { describe, it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../../schema";
import { api } from "../../../_generated/api";

/**
 * K3Mart lazy token refresh on 401 (2026-07-10).
 *
 * Unlike GoBiz (gobiz/adapter.ts:330), K3Mart historically aborted the sync with
 * TOKEN_EXPIRED on a 401 and waited for a human to press "Refresh Token". The
 * nightly refresh-k3mart-token.yml GitHub Action that was supposed to keep the
 * token warm never once ran successfully (its secrets were never set), so the
 * unattended nightly sales sync had no recovery path at all.
 *
 * These tests pin the recovery contract:
 *   1. 401 -> re-login -> retry once -> succeed, persisting the fresh token.
 *   2. A failed re-login still surfaces TOKEN_EXPIRED (no crash, no masking).
 *   3. The retry happens AT MOST ONCE — a persistently-401 endpoint must not loop.
 */

const STALE = "stale-jwt";
const FRESH = "fresh-jwt";

const seedCred = async (t: any, currentToken: string | undefined = STALE) =>
  t.run((ctx: any) =>
    ctx.db.insert("platformCredentials", {
      platformId: "k3mart",
      email: "vendor@frollie.test",
      password: "hunter2",
      currentToken,
      updatedBy: "test",
      updatedAt: 0,
    }),
  );

const readCred = (t: any) =>
  t.run((ctx: any) =>
    ctx.db
      .query("platformCredentials")
      .withIndex("by_platform", (q: any) => q.eq("platformId", "k3mart"))
      .first(),
  );

const authOf = (init: any): string =>
  (init?.headers?.Authorization as string | undefined) ?? "";

/** Counters so we can assert call counts, not just outcomes. */
type Calls = { login: number; sales: number; validate: number };

/**
 * Build a fetch stub. `salesResponder` decides what the sales endpoint returns
 * for a given Authorization header, which is how we simulate "the stale token is
 * rejected but the fresh one is accepted".
 */
function stubFetch(opts: {
  calls: Calls;
  loginStatus?: number;
  loginBody?: unknown;
  salesStatusFor: (auth: string) => number;
}) {
  const { calls, loginStatus = 200, loginBody = { token: FRESH }, salesStatusFor } = opts;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: any) => {
      const u = String(url);

      if (u.includes("/vendor/login")) {
        calls.login++;
        return new Response(JSON.stringify(loginBody), {
          status: loginStatus,
          headers: { "content-type": "application/json" },
        });
      }

      // performK3MartRefresh validates the new token with a product-detail call.
      if (u.includes("/vendor-stock/detail")) {
        calls.validate++;
        return new Response(JSON.stringify({ success: true, meta: { success: true }, data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (u.includes("/vendor-sales/get-all")) {
        calls.sales++;
        const status = salesStatusFor(authOf(init));
        if (status === 401) return new Response("Unauthorized", { status: 401 });
        return new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      throw new Error(`unexpected fetch: ${u}`);
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("syncK3MartSales — lazy token refresh on 401", () => {
  it("401 on the stale token -> re-logs in, retries once, and succeeds", async () => {
    const t = convexTest(schema);
    await seedCred(t);
    const calls: Calls = { login: 0, sales: 0, validate: 0 };

    stubFetch({
      calls,
      salesStatusFor: (auth) => (auth === `JWT ${STALE}` ? 401 : 200),
    });

    const result: any = await t.action(api.integrations.k3mart.adapter.syncK3MartSales, {
      triggeredBy: "test",
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

    // Exactly one recovery attempt: stale 401, then fresh 200.
    expect(calls.sales).toBe(2);
    expect(calls.login).toBe(1);

    // The refreshed token is persisted, so the NEXT sync starts warm.
    const cred = await readCred(t);
    expect(cred.currentToken).toBe(FRESH);
    expect(cred.lastRefreshStatus).toBe("success");
  });

  it("re-login failure still surfaces TOKEN_EXPIRED (no masking, no retry)", async () => {
    const t = convexTest(schema);
    await seedCred(t);
    const calls: Calls = { login: 0, sales: 0, validate: 0 };

    stubFetch({
      calls,
      loginStatus: 500,
      loginBody: { error: "K3Mart is down" },
      salesStatusFor: () => 401,
    });

    const result: any = await t.action(api.integrations.k3mart.adapter.syncK3MartSales, {
      triggeredBy: "test",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("TOKEN_EXPIRED");

    // Refresh was attempted once and failed; we do NOT re-fetch sales on a failed refresh.
    expect(calls.login).toBe(1);
    expect(calls.sales).toBe(1);

    const cred = await readCred(t);
    expect(cred.lastRefreshStatus).toBe("error");
  });

  it("retries AT MOST ONCE — a persistently-401 endpoint does not loop", async () => {
    const t = convexTest(schema);
    await seedCred(t);
    const calls: Calls = { login: 0, sales: 0, validate: 0 };

    // Login succeeds and hands back a fresh token, but sales rejects EVERY token.
    stubFetch({ calls, salesStatusFor: () => 401 });

    const result: any = await t.action(api.integrations.k3mart.adapter.syncK3MartSales, {
      triggeredBy: "test",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("TOKEN_EXPIRED");

    // The bound that matters: one retry, not N.
    expect(calls.sales).toBe(2);
    expect(calls.login).toBe(1);
  });

  it("logs the token_refresh attempt to externalSyncLogs for observability", async () => {
    const t = convexTest(schema);
    await seedCred(t);
    const calls: Calls = { login: 0, sales: 0, validate: 0 };

    stubFetch({
      calls,
      salesStatusFor: (auth) => (auth === `JWT ${STALE}` ? 401 : 200),
    });

    await t.action(api.integrations.k3mart.adapter.syncK3MartSales, { triggeredBy: "test" });

    const logs: any[] = await t.run((ctx: any) => ctx.db.query("externalSyncLogs").collect());
    const refreshLogs = logs.filter((l: any) => l.syncType === "token_refresh");

    expect(refreshLogs).toHaveLength(1);
    expect(refreshLogs[0].status).toBe("success");
    expect(refreshLogs[0].source).toBe("k3mart");
  });
});
