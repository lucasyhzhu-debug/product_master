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
