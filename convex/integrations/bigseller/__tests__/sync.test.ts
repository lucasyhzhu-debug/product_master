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
import { describe, it, expect } from "vitest";
import schema from "../../../schema";
import { internal } from "../../../_generated/api";
import { decodeJwtPayload } from "../../../lib/jwt";
import { shouldPersistRefreshedToken } from "../sync";
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
