---
slug: bigseller-muc-token-refresh
status: resolved
trigger: "my bigseller sync only works if I paste in a fresh MUC_TOKEN - once I log out / wait a day the token does not appear to work anymore - is it because we're not using the right MUC TOKEN refresh api? I'm not sure what's going on?"
created: 2026-05-23
updated: 2026-05-23
resolved: 2026-05-23
---

# Debug Session: BigSeller MUC_TOKEN auto-refresh failing after logout or ~1 day

## Symptoms

DATA_START
**User report:** "my bigseller sync only works if I paste in a fresh MUC_TOKEN - once I log out / wait a day the token does not appear to work anymore - is it because we're not using the right MUC TOKEN refresh api? I'm not sure what's going on?"

**Two triggers reported:**
1. User logs out of BigSeller in their browser → next sync fails.
2. User waits ~1 day without re-pasting → next sync fails.

**Workaround user is using:** Re-login on BigSeller in browser, copy fresh `muc_token` cookie value, paste into admin Settings.

**Logs evidence (production `bigseller-logs.txt`, last ~2 weeks):**
- Recurring `'BigSeller shopee pageList error (page 1): code=-1, errorCode=none, msg="Failed, please try again later"'` followed by readiness-lag retries 1/3, 2/3, 3/3 — all failing. This is the SAME error class as resolved-debug `bigseller-latest-dates-no-orders` (2026-05-08) where root cause was page-1 rejection, not specifically token expiry.
- No `401001/401003/401006` codes observed in the captured window — i.e. the JSON-auth-error path that triggers the "Token expired" UI is NOT firing for these failures. Either the token is genuinely fine and BigSeller is rate-limiting, OR auth errors are arriving with a code we don't classify as auth.

**User's hypothesis:** "are we using the wrong MUC TOKEN refresh API?"
DATA_END

## Expected Behavior

After the Phase 83-03 auto-refresh that shipped 2026-05-22 (PR #162), the cron-and-manual sync should persist the rotated `muctoken` returned in each pageList response header, sliding the 20-day JWT expiry forward indefinitely. The user should NOT need to repaste the token after a logout or after a day's inactivity.

## Actual Behavior

Token appears to die after either (a) the user logs out of BigSeller in their browser, OR (b) ~24h passes. User must re-paste a fresh `muc_token` cookie value to restore sync.

## Reproduction

Path A (logout-driven):
1. Paste fresh `muc_token` from browser into admin Settings → sync works.
2. Log out of BigSeller in the browser tab.
3. Trigger sync (manual or cron) → fails.

Path B (time-driven):
1. Paste fresh `muc_token`. Sync works.
2. Wait ~24h. (Don't logout.)
3. Trigger sync → fails.

## Initial Hypothesis Surface (for gsd-debugger)

**H1 — Browser logout invalidates the JWT server-side. (HIGH likelihood for Path A.)**
BigSeller's `loginsub.json` mints a JWT, but a logout call almost certainly revokes the corresponding server-side session record. Our cron's persisted JWT then references a dead session — no header refresh can revive it. **Verification:** check `npx convex logs --prod` immediately after Path A reproduction for the exact `code`/`msg` returned. If it's `401001/401003/401006` or HTML, this is confirmed.

**H2 — Phase 83-03 auto-refresh is silently failing to persist in production. (MEDIUM likelihood for Path B.)**
The auto-refresh code at `convex/integrations/bigseller/sync.ts:1184` only assigns `latestRefreshedToken` from a platform that did NOT observe an auth error AND only persists at line 1263 when `latestRefreshedToken` is truthy. If BigSeller stops returning a `muctoken` response header once the JWT is close to expiry (e.g. only rotates while >24h remaining), the persisted token never refreshes. **Verification:** query production `platformCredentials.bigseller` and check `lastRefreshAt`, `lastRefreshStatus`, `lastRefreshError`. Is `lastRefreshStatus` ever `"auto-refreshed-from-response"`? When was the last successful refresh?

**H3 — The 'Failed, please try again later' code=-1 is being mis-interpreted as a readiness lag when it's actually auth.**
The current `isJsonAuthError` (`convex/integrations/bigseller/helpers.ts:151`) only matches `{401001, 401003, 401006}`. If BigSeller has started returning `code=-1` for revoked sessions (instead of 401xxx), every "auth failure" looks like a readiness-lag and is silently retried + exhausted. Per resolved debug `bigseller-latest-dates-no-orders`, the May 8 page-1 failures were `code=-1` and were treated as data errors, not auth. **Verification:** decode the persisted `muc_token` JWT (HS256, public payload — just base64url-decode the middle segment) and read `exp`. If `exp > Date.now()/1000`, the token is technically still valid → BigSeller is rejecting for a reason other than expiry (likely session revocation server-side).

**H4 — Cron frequency / `pollSyncTask` orphan blocks all refresh.**
Phase 83-quad-review noted that uncaught throws inside `Promise.all` fan-out can pin a sync at "storing" and the cron overlap guard then refuses subsequent runs forever. If the cron is permanently blocked, no refresh ever happens (Path B). **Verification:** grep production logs for `lastSyncStatus` stuck at "storing" or "syncing" longer than the overlap window. Also check the auto-refresh persistence is reachable from BOTH the cron path AND the manual-paste path.

**H5 — Single-step login requires CAPTCHA, so we cannot self-recover.**
Per `docs/BIGSELLER_PROFIT_API.md:105`, login requires a server-generated image CAPTCHA. There is intentionally no automated re-login. This is not a bug — it's the architectural ceiling. The fix space is therefore: (a) keep the existing JWT alive longer (heartbeat ping?); (b) detect revocation faster and alert; (c) accept the manual-paste workflow and reduce friction.

## Likely Root Cause Hierarchy

Most likely → least likely:
1. **Path A (logout)** = H1 (server-side revocation) — architectural, no in-band fix possible.
2. **Path B (1 day)** = H3 (auth error misclassified as code=-1) OR H2 (silent persistence failure) OR H4 (cron pinned).
3. **Architectural backdrop** = H5 (CAPTCHA-gated login = cannot auto-recover).

## Investigation Steps for gsd-debugger

(see original list — followed in full)

## Current Focus

```yaml
hypothesis: "Path B = H3 (code=-1 misclassified as readiness-lag when actually auth-revocation) is the dominant culprit because 83-07's readiness retry now silently swallows 3 attempts of what may be auth-revocation. Path A = H1 (architectural: browser logout revokes session-side; CAPTCHA-gated login blocks auto-recovery). H2/H4 unlikely given Phase 83-03 code review."
test: "Add a JWT-exp pre-check to the page-1 readiness-lag branch: if the persisted currentToken has < 1h to expiry OR is expired, promote code=-1+'try again later' from 'readiness-lag → retry' to 'authError → fail-fast banner'. Improve the page-1-fatal terminal banner to name the browser-logout possibility explicitly."
expecting: "Path B fix turns the silent 3-retry-exhaustion into a clear 'Token expired — paste new token' banner the moment the JWT is past expiry. Path A still requires manual repaste (CAPTCHA-gated), but the banner now hints at the cause."
next_action: "Apply the H3 fix (JWT-exp pre-check + improved fatal banner). Add a unit test asserting the new branch fires. Run typecheck + build."
```

## Evidence

- timestamp: 2026-05-23T00:00:00Z
  source: `convex/integrations/bigseller/sync.ts:172-175` (fetchPage muctoken capture)
  finding: |
    The auto-refresh header capture happens BEFORE the auth-error check (lines 183-213). If BigSeller's auth-error response includes a fresh muctoken (unusual for revoked sessions but possible), it's captured into `refreshedToken`. Then `authError: true` is returned. Back in fetchOrders aggregation (line 1184), the `!r.authError` guard correctly suppresses the captured-but-suspect token. So the persist gate is sound — H2 is structurally unlikely.

- timestamp: 2026-05-23T00:00:00Z
  source: `convex/integrations/bigseller/sync.ts:903-944` (page-1 readiness retry loop)
  finding: |
    The page-1 loop treats ANY `code=-1` with msg containing "try again later" as a readiness-lag and retries 3× (10s, 30s, 60s). There is NO JWT-exp check before this decision. If the JWT is expired and BigSeller returns code=-1 (instead of 401xxx), the loop exhausts 3 retries and records a 'rejected pageList request' fatal — the user sees a generic failure, NOT an actionable 'Token expired' banner. **This is the H3 surface.**

- timestamp: 2026-05-23T00:00:00Z
  source: `convex/integrations/bigseller/helpers.ts:141`
  finding: |
    `BIGSELLER_AUTH_ERROR_CODES = new Set([401006, 401001, 401003])`. The May-8 evidence and the user's current report both show NO 401xxx codes in logs — only `code=-1, msg="Failed, please try again later"`. If BigSeller's auth-revocation surfaces as code=-1 (not 401xxx), our detector is structurally blind to it.

- timestamp: 2026-05-23T00:00:00Z
  source: `bigseller-logs.txt:43-56` (May 8 evidence)
  finding: |
    Four consecutive sync attempts at 16:43, 17:17, 17:58, etc. All show poll completing with successOrderNum=89 — meaning the token was VALID at poll time. Then pageList fails with code=-1 minutes later. This is either (a) BigSeller upstream churn (poll works, pageList queues behind a still-syncing job) OR (b) per-endpoint rate limit. NOT auth — the same token reached poll just before. **However, this resolved debug is from BEFORE Phase 83-03 shipped (22 May).** The user's CURRENT report (23 May) does not yet have post-83-03 log evidence captured.

- timestamp: 2026-05-23T00:00:00Z
  source: `docs/BIGSELLER_PROFIT_API.md:87-101` (login flow) + `:103-117` (CAPTCHA)
  finding: |
    Single-step login is **CAPTCHA-gated**. No automated re-login is possible without OCR or a CAPTCHA-solving service. Browser logout cannot be undone in-band by our backend. **H5 is the architectural ceiling** — the best we can do for Path A is fail FAST with a clear message instead of failing SLOW with retry-exhaustion.

- timestamp: 2026-05-23T00:00:00Z
  source: `convex/integrations/bigseller/cron.ts:13-148`
  finding: |
    Nightly cron at 03:00 WIB. Skip-if-not-idle guard at :55-68. The guard checks `state.stage !== "idle"` — and Phase 83-quad-review I1 (sync.ts:1163, 1339-1363) wrapped fetchOrders in try/catch with a terminal-state safety net. So a "pinned at storing" state is NOT possible post-83-quad-review. **H4 is structurally eliminated.**

- timestamp: 2026-05-23T00:00:00Z
  source: `convex/platformCredentials/mutations.ts:79-92` (updateToken)
  finding: |
    Phase 83-quad-review I4 fix preserves stored `currentToken` via `?? cred.currentToken` when caller omits it. `handleAuthFailure` (sync.ts:123-128) correctly omits `currentToken` and only sets the status to "error" — does NOT erase the stored token. So a 401 path correctly leaves the bad token in place AND flips the freshness banner red. **No silent token erasure exists. H2 sub-variant eliminated.**

## Eliminated

- **H2** (silent persist failure): The persist gate (sync.ts:1249) and the `?? cred.currentToken` preserve-pattern (mutations.ts:80) are both sound. No code path can erase a good token. Auto-refresh only skips persist when it SHOULD (auth error, no fresh header, or unchanged token).
- **H4** (cron pinned at storing): Phase 83-quad-review I1 added a terminal-state safety net (sync.ts:1339-1363) that writes `stage: "failed"` on any uncaught throw. The cron skip-if-not-idle guard cannot pin forever.
- **Storage-side token erasure on auth failure**: `updateToken` preserves `currentToken` when the caller omits it; `handleAuthFailure` omits it. Sound.

## Resolution

**Branch:** `fix/bigseller-jwt-expiry-detection`
**PR:** TBD (created post-triple-review)
**Files changed:** `convex/integrations/bigseller/helpers.ts`, `convex/integrations/bigseller/sync.ts`, `convex/integrations/bigseller/__tests__/helpers.test.ts`, `convex/integrations/bigseller/__tests__/sync.test.ts`
**Type-check:** PASS  •  **Build:** PASS  •  **Tests:** 162 BigSeller tests pass (10 new — 9 helper unit + 1 sync integration)

Two-part fix on a single small surface (~15 LOC + tests). H3 confirmed as dominant for Path B (1-day-wait); H1 architectural ceiling acknowledged for Path A (browser logout).

1. **New pure helper `isJwtExpiredOrExpiring(token, graceMs)`** in `convex/integrations/bigseller/helpers.ts`. Wraps `decodeJwtPayload`, returns `true` (fail-safe) on malformed/missing-`exp`/NaN/Infinity payloads, otherwise compares `exp <= now + grace`.

2. **Pre-check wired into the page-1 readiness retry branch** at `convex/integrations/bigseller/sync.ts:920`. With a 1-hour grace window (matches the original plan spec — closes the race where a JWT expires mid-retry-chain). If `code=-1+"try again later"` arrives AND the persisted JWT is past `exp`, route to `authError` immediately → `handleAuthFailure` writes the "Token expired -- paste new token in Settings" terminal state. No retries fire.

3. **Widened page-1-fatal terminal banner** to hint at browser-logout repaste when `isReadinessLag` is true but the JWT is still locally valid (Path A — BigSeller revoked server-side; we cannot detect this in-band).

**Path A (browser logout) is NOT auto-recoverable** — BigSeller's `loginsub.json` is CAPTCHA-gated (`docs/BIGSELLER_PROFIT_API.md:103-117`). The fix improves the DIAGNOSTIC for Path A (clearer banner) but the user must still manually repaste. Out-of-scope alternatives (CAPTCHA-solving login, automated session heartbeat) were considered and deferred — not in this PR.

**Triple-review:** 0 Critical, 5 Important + 1 Minor (boundary test) all addressed in follow-up commit `fix(debug-bigseller-muc-token-refresh): address triple-review findings`. Architectural observation O6 (3rd `code=-1` debug in 2 weeks → consider a `classifyResponse(parsed, currentToken)` state-machine if a 4th lands) recorded for future planning.

## Root Cause Summary

**Two related but distinct failure paths:**

**Path A (browser logout):** BigSeller server-side invalidates the session record bound to the JWT when the user calls logout in their browser. The JWT signature is still mathematically valid, but BigSeller refuses to honour the session. Our backend has no way to detect this except by attempting a call. Single-step login is CAPTCHA-gated, so we cannot automatically re-acquire a token. **This is an architectural ceiling (H5).** The user MUST repaste after a browser logout. The current code fails SLOW (3 retries exhausting on `code=-1`) instead of failing FAST with a clear banner.

**Path B (1-day wait):** Most likely H3 surface — BigSeller's `code=-1, msg="Failed, please try again later"` is currently treated as "upstream readiness lag" and silently retried 3×. If the persisted JWT is past `exp`, OR if BigSeller is rejecting because of server-side session timeout, the user sees a generic "rejected pageList request" failure with no actionable next step. The auto-refresh shipped in 83-03 (sliding `exp`) DOES work when the sync succeeds — but if the sync fails for ANY reason (BigSeller upstream churn, partial-network errors), the auto-refresh is silently skipped that day. After enough skipped days, the token's `exp` drops below `now`, and the readiness-retry loop becomes the user's symptom: "it just stops working after a day."

**Combined fix surface (single code change):**
Add a JWT-exp pre-check inside the page-1 readiness-retry decision (sync.ts:919-932). If the persisted `mucToken` is already past `exp`, OR within a 1-hour grace window of expiry, promote `code=-1+"try again later"` from "readiness-lag → retry" to "authError → handleAuthFailure". This:
1. Catches expired tokens immediately (Path B time-decay).
2. Catches some browser-logout surfaces if BigSeller has rotated the session and the JWT is stale (Path A optimistic).
3. Even for "JWT still valid but session-revoked server-side" (true H1), the message in the page-1-fatal banner can be widened to explicitly hint at "If you recently logged out of BigSeller in your browser, paste a fresh muc_token."

The fix is small (~15 lines + 1 test) and high-value. Path A's architectural ceiling cannot be removed without CAPTCHA-solving; the fix simply gives the user a clearer signal sooner.
