# Staff Review — fix/bigseller-jwt-expiry-detection

**Branch:** `fix/bigseller-jwt-expiry-detection`
**Commit:** `c5504f2a` (single)
**Base:** `origin/main`
**Reviewer:** staff engineer
**Date:** 2026-05-23
**Files changed:** 3 (+126/-1)

---

## Summary

A small, well-scoped /gsd:debug fix that converts a recurring slow-and-confusing failure mode (3 readiness retries exhausting on a dead token) into a fast, actionable "Token expired" banner. The implementation matches the debug session's "Combined fix surface" plan one-for-one: pure helper, page-1 pre-check, widened fatal banner. Verdict: **ship it.** No criticals. Two minor improvements (one integration-test gap, one comment tweak) and a couple of refinements. The recurrence pattern (3rd code=-1 debug in 2 weeks) is worth surfacing for future planning, but a state-machine refactor is out of scope for this PR.

---

## Critical Issues

None.

---

## Improvements

### I1 — Integration-test gap: no end-to-end coverage of the new pre-check path

`helpers.test.ts` covers the pure `isJwtExpiredOrExpiring` helper across 7 cases (empty, malformed, no-exp, past-exp, future-exp, within-grace, beyond-grace, default-graceMs). That's the right coverage for the helper. **But there is no test that exercises the wired branch end-to-end** — i.e., "fetchPage returns `code=-1, msg='try again later'` + persisted JWT is expired → handleAuthFailure is called, no retry runs, `authError: true` propagates."

`convex/integrations/bigseller/__tests__/sync.test.ts` only covers `shouldPersistRefreshedToken` and `mapWithConcurrency`. There's a clear precedent in that file for using `convexTest` + seeded `platformCredentials` row with a real-shape JWT (`SEEDED_TOKEN` / `NEW_TOKEN` already defined). Adding two cases would be cheap:

1. Seed an EXPIRED-exp token; mock fetch to return `{code:-1, msg:"Failed, please try again later"}`; assert sync ends in `stage:"failed"` with the "Token expired" message AND zero retry log lines AND `lastRefreshStatus:"error"`.
2. Seed a FUTURE-exp token; same code=-1 response; assert the readiness retry loop runs to exhaustion (3 attempts, then page-1 fatal with the browser-logout hint).

Without these, a future refactor (e.g. reordering the JWT check vs the retry-counter check, or accidentally negating `isJwtExpiredOrExpiring`) can silently revert the fix and all 7 helper tests will still pass green. **The Phase-81 lesson** (type-cascade refactors need EXHAUSTIVE schema-literal coverage tests; "import-grep passed" is not a behavior assertion) applies here in spirit — the helper passes, but does the wire?

Recommend adding the two cases before merge. ~30 lines of test code.

### I2 — Inline comment is slightly misleading on `code=-1` overload count

The block comment at sync.ts:921-929 says `code=-1` is overloaded for "upstream sync-task lag AND server-side session timeout" (two conditions). The helper-side comment (helpers.ts:170-176) says "at least three different upstream conditions (sync-task still in progress, missing required field, AND server-side session timeout)". The helper comment is right (Phase 83-01a confirmed missing-required-field also returns code=-1; resolved debug `bigseller-latest-dates-no-orders` documented sync-task lag; this debug adds session-timeout). The sync.ts comment should match the helper's three-condition framing — minor copy-paste drift but readers shouldn't have to cross-reference.

---

## Refinements

### R1 — Consider a small positive grace window at the call site

The call site passes `isJwtExpiredOrExpiring(mucToken)` with the default `graceMs: 0`. The helper supports a grace, the tests cover it, but the call site uses zero. The debug session's "Combined fix surface" plan explicitly proposed a 1-hour grace ("if the persisted `mucToken` is already past `exp`, OR within a 1-hour grace window of expiry"). The shipped code drops the grace.

The conservative reasoning for dropping it: a positive grace + skewed local clock could false-positive a healthy-but-near-exp token into an authError. The aggressive reasoning for adding it back: a token within an hour of `exp` is almost certainly going to die mid-sync anyway, so failing fast with the actionable banner is better than failing slow on the next call. Both are defensible. I would lean toward `graceMs: 60_000` (1 minute, not 1 hour) — enough to absorb container clock drift without surfacing genuine readiness-lag-on-near-exp-token as an auth failure. Drop a comment at the call site documenting the chosen grace either way; right now the zero is implicit and the next reader will ask the same question.

(This is a refinement, not an improvement — the current zero-grace choice ships a strictly narrower fix than the plan proposed, which is fine. The user can iterate on grace empirically once production logs show false-positive vs false-negative rates.)

### R2 — Move the debug session to `.planning/debug/resolved/` post-merge

`.planning/debug/bigseller-muc-token-refresh.md` is untracked in the current `git status`. There's an established convention (`.planning/debug/resolved/` has ~35 prior resolved sessions). Two actions on merge:

1. Populate the "Resolution" section (currently `(populated when fix lands)`) with the commit SHA and a one-line summary.
2. `git mv` the file to `.planning/debug/resolved/bigseller-muc-token-refresh.md`.

This is doc-only and lands direct-to-main per CLAUDE.md.

### R3 — Inline comments are appropriately verbose (no change needed)

The two added comment blocks (sync.ts:921-929 and :955-959) are 9 lines + 3 lines respectively. They explain WHY (`code=-1` is overloaded; the JWT-exp disambiguator is the minimum-complexity safe-narrowing), not WHAT (the code reads itself). For a recurrence-pattern site with three sessions now layered on the same surface, this level of inline rationale is appropriate — future readers won't have to re-derive the design from scratch. Keep as-is.

### R4 — `docs/BIGSELLER_PROFIT_API.md` does not need a new section

The detection branch is internal-to-sync behavior, not part of the BigSeller external API surface that doc covers. Inline comments are the right home. (If a future reader needs to understand "why does the sync fail-fast on locally-expired JWT", the debug session file in `resolved/` is the canonical reference.)

---

## Architectural Observations

These are debt-surfacing notes for future planning — **not** recommendations to change anything in this PR.

### O1 — Plan fidelity (validated)

The debug session prescribed three deliverables:

| Plan item | Shipped? | Where |
|---|---|---|
| (a) JWT-exp pre-check in readiness-retry branch | YES | sync.ts:930-937 |
| (b) Route code=-1 + "try again later" + expired-JWT to authError | YES | sync.ts:935-936 (sets `result.authError = true` → handleAuthFailure invoked by caller at sync.ts:1234) |
| (c) Widen page-1-fatal banner with browser-logout hint | YES | sync.ts:960-966 |

No scope creep. The plan explicitly excluded Path A *recovery* (CAPTCHA-gated re-login) and the implementation correctly stays within those bounds — fast banner only, manual repaste remains the recourse.

### O2 — Two competing exit conditions: ordering is correct

The page-1 readiness branch now has two exit gates: JWT-exp pre-check (sync.ts:930) and readiness-retry counter (sync.ts:939). The order — JWT check FIRST, retry counter SECOND — is correct because:

- If JWT is past `exp` AND code=-1, retrying is provably pointless (the server-side check will reject every retry). Skip straight to authError.
- If JWT is valid AND code=-1, the readiness-lag interpretation is the more probable cause, so retry with backoff.

The false-positive case worth naming: JWT exp is exactly now (sub-second window), code=-1 is a GENUINE readiness lag. Net effect: one false auth banner, user repastes a still-valid token, next sync works. That's a recoverable single-incident UX glitch, not a data-loss bug. Acceptable.

### O3 — `mucToken` is the right token to check

The `mucToken` referenced at sync.ts:930 is the persisted current token from `resolveBigSellerToken(ctx)` at sync.ts:724, NOT a rotated header-captured token from `captureToken` at sync.ts:898. This is correct — we want to check whether the token WE ARE SENDING is locally expired, not whether some header-rotated successor is expired. Verified by reading the variable scope in `processPlatform`.

### O4 — `atob` dependency is safe in Convex's V8 isolate

`decodeJwtPayload` in `convex/lib/jwt.ts` uses `atob` (the Web Platform API). Convex's V8 isolate exposes `atob` globally (it's available in both the `"use node"` action runtime AND the default isolate runtime — verified by inspecting the existing call sites: K3Mart login, BigSeller paste flow, this fix, and the auto-refresh persist block at sync.ts:1280). No risk of moving helpers.ts to a different runtime context breaking the JWT decode.

### O5 — Phase 83 quad-review fixes are PRESERVED

The fix does NOT change `handleAuthFailure` (sync.ts:94-130) and does NOT change `updateToken` (mutations.ts:79-93). Both retain the Phase 83 quad-review I4 fix:

- `handleAuthFailure` omits `currentToken` and `tokenExpiresAt` from the `updateToken` call → the stored token AND expiry are preserved (not erased) via `?? cred.X` in the mutation.
- The fix routes to `handleAuthFailure` via `result.authError = true` → the existing wiring at sync.ts:1234 calls `handleAuthFailure` correctly.

The fix correctly inherits these guarantees without re-implementing them. No regression to the Phase 83 I4 invariant.

### O6 — Recurrence pattern: 3rd code=-1 debug in ~2 weeks

This is the third distinct fix layered on the same page-1 code=-1 surface in 14 days:

| Date | Session | Root cause | Fix |
|---|---|---|---|
| 2026-05-08 | `bigseller-latest-dates-no-orders` (resolved) | Missing required body fields → BigSeller silently returned code=-1 | Phase 83-01a: HAR-fixture body-shape lock + 6 newly-required fields |
| 2026-05-22 | (Phase 83-07 readiness retry) | code=-1 sometimes IS a genuine 10s upstream lag | 3-attempt retry loop with 10s/30s/60s backoff |
| 2026-05-23 | `bigseller-muc-token-refresh` (this PR) | code=-1 can ALSO mean session-revoked-server-side | JWT-exp disambiguator routes the dead-token subset to authError |

Each fix is minimal and correct in isolation; the cumulative effect is that the page-1 branch now has THREE distinct interpretations of code=-1, each with its own gating predicate, all stacked in a single while-loop. This is consistent with the **Phase 83-01a "additive-only fix discipline" lesson** (split A/B/C risk classes, ship A first, test, then B/C only if needed) — each layer is correctly additive and doesn't regress prior interpretations. So this is NOT a violation of that lesson; it's a different axis of detection layered cleanly on top.

**The architectural smell to surface for future planning** (NOT for this PR): BigSeller's session/auth state is currently inferred opportunistically from three signals — HTML response, JSON 401xxx codes, JWT-exp claim — in three different code locations (`detectHtmlResponse`, `isJsonAuthError`, now `isJwtExpiredOrExpiring`). If a fourth interpretation surfaces (e.g., BigSeller adds a new error code, or rate-limits differently for revoked sessions), the next debug session will add a fourth predicate to the same while-loop. At ~4 layers, a small auth-state-machine refactor (single `classifyResponse(parsed, currentToken): "ok" | "auth-failure" | "readiness-lag" | "fatal"` predicate) starts to pay for itself. **Not now.** Surface it as a candidate for a future tech-debt phase if a 4th code=-1 session lands.

### O7 — UI-for-DB-ops adjacent: paste-token flow is already UI-first

The user's preference (per CLAUDE.md memory: "Prefer admin UI pages with buttons over CLI runbooks for manual DB operations") is already satisfied here — the recovery path is a paste-into-admin-Settings flow, not a backend mutation runbook. No new surface area needed.

---

## Acceptance Checklist

- [x] Plan fidelity: all three "Combined fix surface" items shipped
- [x] No scope creep (Path A recovery correctly excluded — CAPTCHA-gated)
- [x] Phase 83 I4 invariant preserved (no erasure of stored token/expiry on auth failure)
- [x] `mucToken` checked is the persisted token, not a header-captured successor
- [x] `atob` available in Convex runtime where helpers.ts is consumed
- [x] Pure-helper unit tests (7 cases) — comprehensive
- [ ] Integration test for wired branch (I1)
- [x] Inline rationale appropriate for recurrence-pattern surface
- [ ] Debug session moved to `.planning/debug/resolved/` post-merge (R2)
- [x] Architectural recurrence surfaced (O6) for future planning

**Merge recommendation:** Ship after addressing I1 (add 2 integration test cases) and I2 (sync.ts comment three-condition fix). R1/R2/R3/R4 are optional.
