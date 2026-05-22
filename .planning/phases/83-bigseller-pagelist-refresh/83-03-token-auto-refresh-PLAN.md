---
phase: 83-bigseller-pagelist-refresh
plan: 03
type: execute
wave: 1
depends_on: []
files_modified:
  - convex/platformCredentials/mutations.ts
  - convex/schema.ts
  - convex/integrations/bigseller/sync.ts
  - convex/integrations/bigseller/__tests__/sync.test.ts
  - src/lib/bigsellerToken.ts
  - src/lib/__tests__/bigsellerToken.test.ts
  - src/components/salesAnalytics/BigSellerSyncPanel.tsx
  - src/components/salesAnalytics/SettingsTab.tsx
  - src/components/salesAnalytics/__tests__/BigSellerSyncPanel.test.tsx
  - docs/SCHEMA.md
  - docs/CHANGELOG.md
  - docs/BIGSELLER_PROFIT_API.md
autonomous: true
requirements: []

must_haves:
  truths:
    - "After a successful BigSeller sync, platformCredentials.currentToken is replaced with the freshest muctoken JWT from the response headers (D-03)"
    - "The persisted token's decoded exp is ~now + 20 days, sliding the TTL forward so the cron does not die from token decay (D-03)"
    - "Token is NOT overwritten when the refreshed header is empty, equals the current token, or any auth error was observed during the sync (D-03 defensive guards)"
    - "updateToken accepts lastRefreshStatus: 'auto-refreshed-from-response' without throwing ArgumentValidationError (Flag #1)"
    - "On BigSellerSyncPanel, a yellow banner shows 'Token expires in <N>h — paste fresh token' when the token expires in under 24h; a red blocking banner shows when expired (D-04)"
    - "CHANGELOG records that BigSeller still accepts the legacy 5-value orderState as of the 01a backfill; 01b W1-W3 archived as standby — no code (D-02)"
  artifacts:
    - path: "convex/platformCredentials/mutations.ts"
      provides: "updateToken validator widened with the auto-refresh literal"
      contains: 'v.literal("auto-refreshed-from-response")'
    - path: "convex/schema.ts"
      provides: "platformCredentials.lastRefreshStatus union widened with the auto-refresh literal"
      contains: 'v.literal("auto-refreshed-from-response")'
    - path: "convex/integrations/bigseller/sync.ts"
      provides: "muctoken header capture + persist-once-at-end of fetchOrders"
      contains: 'getResponseRefreshToken|muctoken'
    - path: "src/lib/bigsellerToken.ts"
      provides: "decodeMucTokenExp() base64url payload decode (no signature verification)"
      exports: ["decodeMucTokenExp"]
    - path: "convex/integrations/bigseller/__tests__/sync.test.ts"
      provides: "token auto-refresh persist/guard tests"
      contains: "auto-refresh"
  key_links:
    - from: "convex/integrations/bigseller/sync.ts"
      to: "internal.platformCredentials.mutations.updateToken"
      via: "ctx.runMutation persist-once-at-end"
      pattern: "updateToken"
    - from: "src/components/salesAnalytics/SettingsTab.tsx"
      to: "src/components/salesAnalytics/BigSellerSyncPanel.tsx"
      via: "tokenExpiresAt / hoursRemaining prop drilling (mirrors tokenExpired prop)"
      pattern: "BigSellerSyncPanel"
---

<objective>
Ship BigSeller token auto-refresh (D-03) plus the 2-state freshness banner (D-04) as one PR, independent of the 83-02 optimizations.

Capture the refreshed `muctoken` JWT that BigSeller returns in the response headers on every successful call, accumulate the freshest one in outer scope, and persist it ONCE at the end of a successful sync via `platformCredentials.mutations.updateToken` with `lastRefreshStatus: "auto-refreshed-from-response"`. This slides the 20-day token TTL forward indefinitely so the nightly cron stops dying from token decay and staff stop manually repasting tokens.

Add a freshness banner on `BigSellerSyncPanel`: yellow when the token expires in under 24h, red blocking when expired. After auto-refresh lands, the banner should rarely fire; when it does, the cron has been failing ~19 days (actionable signal).

Purpose: eliminate the 20-day token-decay operational toil. This is the first write-bearing change in Phase 83 — guard the credential persist defensively.
Output: widened validator + schema, capture/persist logic in sync.ts, frontend banner + helper, tests, docs (including the D-02 CHANGELOG archival note).
</objective>

<execution_context>
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/workflows/execute-plan.md
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/83-bigseller-pagelist-refresh/83-CONTEXT.md
@.planning/phases/83-bigseller-pagelist-refresh/83-PATTERNS.md
@.planning/phases/83-bigseller-pagelist-refresh/83-01b-fallback-and-token-refresh-SPEC.md

<interfaces>
<!-- updateToken — current validator (convex/platformCredentials/mutations.ts:56-84). lastRefreshStatus at L62 MUST widen. -->
```typescript
export const updateToken = internalMutation({
  args: {
    platformId: v.string(),
    currentToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    lastRefreshAt: v.number(),
    lastRefreshStatus: v.union(v.literal("success"), v.literal("error")), // L62 — widen here
    lastRefreshError: v.optional(v.string()),
  },
  // handler patches: currentToken ?? cred.currentToken, tokenExpiresAt, lastRefreshAt, lastRefreshStatus, ...
});
```

<!-- schema.ts:1281 platformCredentials.lastRefreshStatus — MUST widen too (Flag #1) -->
```typescript
lastRefreshStatus: v.optional(v.union(v.literal("success"), v.literal("error"))), // schema.ts:1281
```

<!-- JWT decode helper — backend (convex/lib/jwt.ts:5-15). Do NOT import into src/; duplicate ~8 lines for the frontend twin (CLAUDE.md Pitfall #18 precedent). Reuse THIS directly in sync.ts for tokenExpiresAt. -->
```typescript
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");
  const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return JSON.parse(atob(padded));
}
```

<!-- BIGSELLER_PLATFORM_ID = "bigseller" (convex/integrations/bigseller/config.ts:5) -->
<!-- SettingsTab.tsx:259-262 already derives bigsellerHealth + bigsellerTokenExpired from getHealthStatusAll. -->
<!-- PlatformHealthStatus.daysRemaining (queries.ts:197) is INTEGER days — too coarse for the <24h yellow threshold. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Widen updateToken validator AND platformCredentials schema (Flag #1)</name>
  <read_first>
    - convex/platformCredentials/mutations.ts (L56-84, the updateToken validator)
    - convex/schema.ts (L1278-1284, the platformCredentials lastRefreshStatus field)
    - 83-PATTERNS.md "MUST widen validator" section + Planner Flag #1
  </read_first>
  <action>
CONTEXT D-03/D-04 say "no schema change needed" — that is WRONG for the validator and the table schema (pattern-mapper Flag #1). Two edits:

1. `convex/platformCredentials/mutations.ts:62` — widen the `updateToken` arg validator:
```typescript
    lastRefreshStatus: v.union(
      v.literal("success"),
      v.literal("error"),
      v.literal("auto-refreshed-from-response"),
    ),
```

2. `convex/schema.ts:1281` — widen the table-level union (it is `v.optional(v.union(...))`):
```typescript
    lastRefreshStatus: v.optional(
      v.union(
        v.literal("success"),
        v.literal("error"),
        v.literal("auto-refreshed-from-response"),
      ),
    ),
```

The `updateToken` handler body (L75-83) needs NO change. Do not touch `saveDirectToken` or any other mutation.
  </action>
  <verify>
    <automated>npx convex codegen &amp;&amp; npm run type-check</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'auto-refreshed-from-response' convex/platformCredentials/mutations.ts` returns >= 1
    - `grep -c 'auto-refreshed-from-response' convex/schema.ts` returns >= 1
    - `npm run type-check` exits 0
  </acceptance_criteria>
  <done>Both the mutation validator and the table schema accept "auto-refreshed-from-response"; codegen + type-check pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Capture muctoken header + persist-once-at-end in sync.ts</name>
  <read_first>
    - convex/integrations/bigseller/sync.ts (L592 outer-scope counters; L676 platform loop; L699-714 fetch + responseText; L717-720 detectHtmlResponse abort; L743-747 isJsonAuthError abort)
    - convex/integrations/bigseller/config.ts (BIGSELLER_PLATFORM_ID at L5)
    - convex/lib/jwt.ts (decodeJwtPayload — reuse directly in sync.ts)
    - 83-01b-fallback-and-token-refresh-SPEC.md Wave 4 (mechanism + defensive guards + tests)
    - 83-PATTERNS.md "token capture" section (capture point, auth-error guard, persist-once-at-end)
  </read_first>
  <behavior>
    - persists a refreshed muctoken from response headers after a successful fetch (updateToken called with the new token + lastRefreshStatus "auto-refreshed-from-response")
    - does NOT persist when the refreshed header is empty
    - does NOT persist when the refreshed token equals the current mucToken
    - does NOT persist when an auth error was observed during the sync (HTML response OR JSON auth error)
    - tokenExpiresAt on the persisted token decodes to ~now + 20 days (exp * 1000 from decodeJwtPayload)
  </behavior>
  <action>
In `convex/integrations/bigseller/sync.ts` `fetchOrders`:

1. Declare two outer-scope vars alongside `totalInserted` (near L592):
```typescript
    let latestRefreshedToken = "";
    let authErrorObserved = false;
```

2. Immediately after `responseText = await response.text();` (currently L709), before the `code` parse, capture the header:
```typescript
        const refreshedToken = response.headers.get("muctoken") ?? "";
        if (refreshedToken && refreshedToken !== mucToken) {
          latestRefreshedToken = refreshedToken;
        }
```

3. At BOTH auth-abort points — the `detectHtmlResponse` branch (L717-720) and the `isJsonAuthError` branch (L743-747) — set `authErrorObserved = true;` immediately before their existing early `return`. (The early return alone already prevents reaching the persist block, but set the flag explicitly so it is testable and survives future refactors that remove the early return.)

4. After the per-platform `for` loop completes (after L676's loop closes, before the function's success-path completion / updateSyncLog), add the guarded persist:
```typescript
    // D-03: persist the freshest auto-refreshed muctoken ONCE at end of a
    // successful sync. Guards: skip if empty / equals current / auth error
    // observed. Wrapped in try/catch so a persist failure never fails the
    // sync — we already have the data.
    if (latestRefreshedToken && !authErrorObserved) {
      try {
        let tokenExpiresAt: number | undefined;
        try {
          const payload = decodeJwtPayload(latestRefreshedToken);
          const exp = payload.exp as number | undefined;
          tokenExpiresAt = typeof exp === "number" ? exp * 1000 : undefined;
        } catch {
          tokenExpiresAt = undefined; // malformed token — persist anyway, banner falls back
        }
        await ctx.runMutation(
          internal.platformCredentials.mutations.updateToken,
          {
            platformId: BIGSELLER_PLATFORM_ID,
            currentToken: latestRefreshedToken,
            tokenExpiresAt,
            lastRefreshAt: Date.now(),
            lastRefreshStatus: "auto-refreshed-from-response",
          }
        );
      } catch (err) {
        console.error("BigSeller token auto-refresh persist failed:", err);
      }
    }
```

5. Add imports at the top of the file if not present: `decodeJwtPayload` from `../../lib/jwt`, `BIGSELLER_PLATFORM_ID` from `./config`. Use the existing `internal` import already used at L603/L876.

Do NOT capture or persist inside `pollSyncTask` — the SPEC says persist once at end of fetchOrders to avoid the cron+manual race on the credential row.
  </action>
  <verify>
    <automated>npm run test -- bigseller</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'auto-refreshed-from-response' convex/integrations/bigseller/sync.ts` returns >= 1
    - `grep -c 'authErrorObserved' convex/integrations/bigseller/sync.ts` returns >= 3 (declare + 2 set sites)
    - `grep -c 'updateToken' convex/integrations/bigseller/sync.ts` returns >= 1
    - `npm run test -- bigseller` exits 0 (includes the new sync.test.ts cases from Task 3)
  </acceptance_criteria>
  <done>fetchOrders captures the freshest muctoken header and persists it once at end of a successful sync with the auto-refresh status, guarded against empty / unchanged / auth-error cases, wrapped in try/catch.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Create sync.test.ts with token auto-refresh tests</name>
  <read_first>
    - convex/integrations/bigseller/__tests__/cron.test.ts (L1-25 convexTest harness setup, schema import)
    - convex/integrations/bigseller/__tests__/helpers.test.ts (fixture-import / assertion patterns)
    - 83-01b-fallback-and-token-refresh-SPEC.md Wave 4 "Test additions" block
    - 83-PATTERNS.md Flag #4 (no sync-action test file exists — create this one)
  </read_first>
  <action>
Create NEW file `convex/integrations/bigseller/__tests__/sync.test.ts`. No sync-action test file exists yet (Flag #4). Use the `convexTest(schema)` harness from `cron.test.ts`. Mock `global.fetch` to return a `Response` whose `headers.get("muctoken")` yields a controllable JWT. Seed a `platformCredentials` row for `bigseller` with a known `currentToken`.

Add a `describe("BigSeller token auto-refresh")` with these tests (mirror the SPEC block):
- `it("persists a refreshed muctoken from response headers after a successful fetch")` — mock fetch to return a header with a NEW valid JWT (different from the seeded token); after fetchOrders, assert the `platformCredentials` row's `currentToken` equals the new JWT and `lastRefreshStatus === "auto-refreshed-from-response"`.
- `it("does NOT persist when refreshed token equals current token")` — mock header equal to the seeded token; assert `currentToken` unchanged and `lastRefreshStatus` is NOT "auto-refreshed-from-response".
- `it("does NOT persist when the muctoken header is empty")` — mock no header; assert `currentToken` unchanged.
- `it("does NOT persist when an auth error is detected during the sync")` — mock page-1 success then an HTML/auth-error response; assert `currentToken` unchanged.
- `it("sets tokenExpiresAt to exp*1000 of the refreshed token")` — use the real HAR JWT (`exp:1780911842` from 83-RESEARCH.md:32); assert the persisted `tokenExpiresAt === 1780911842 * 1000`.

Use real assertions (no `expect(true).toBe(true)`). If mocking the action-runtime fetch loop end-to-end is impractical under convexTest, extract the persist-guard decision into a small pure helper in sync.ts (e.g. `shouldPersistRefreshedToken(latest, current, authErrorObserved): boolean`) and unit-test that directly — but the header-capture + updateToken wiring must still be covered by at least the "persists" and "auth error" cases.
  </action>
  <verify>
    <automated>npm run test -- bigseller</automated>
  </verify>
  <acceptance_criteria>
    - file `convex/integrations/bigseller/__tests__/sync.test.ts` exists
    - `grep -c 'auto-refresh' convex/integrations/bigseller/__tests__/sync.test.ts` returns >= 1
    - `grep -c "it(" convex/integrations/bigseller/__tests__/sync.test.ts` returns >= 4
    - `npm run test -- bigseller` exits 0
  </acceptance_criteria>
  <done>New sync.test.ts covers persist-on-refresh, no-persist-when-equal, no-persist-when-empty, no-persist-on-auth-error, and tokenExpiresAt derivation; all green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: decodeMucTokenExp helper + freshness banner on BigSellerSyncPanel</name>
  <read_first>
    - src/components/salesAnalytics/BigSellerSyncPanel.tsx (L274-278 Sync Now disabled condition; L330-346 amber tokenExpired banner; L447-460 red failed-sync block)
    - src/components/salesAnalytics/SettingsTab.tsx (L101 getHealthStatusAll; L259-262 bigsellerHealth + bigsellerTokenExpired; L325-326 BigSellerSyncPanel mount + tokenExpired prop)
    - convex/lib/jwt.ts (decodeJwtPayload — frontend twin source)
    - convex/integrations/bigseller/adapter.ts (L117-133 exp*1000 + daysRemaining math)
    - src/components/salesAnalytics/__tests__/BigSellerSyncPanel.test.tsx (L22 mock pattern, L54+)
    - 83-PATTERNS.md "freshness banner" + Flag #2 (build-vs-reuse decision)
  </read_first>
  <behavior>
    - decodeMucTokenExp returns exp in ms for a valid HAR JWT (exp:1780911842 → 1780911842000)
    - decodeMucTokenExp returns null for a malformed token (2-part / non-base64) and for a token with no exp
    - banner renders yellow "Token expires in <N>h — paste fresh token" when 0 < hoursRemaining < 24
    - banner renders red blocking banner when expired (hoursRemaining <= 0) and disables Sync Now
  </behavior>
  <action>
BUILD-VS-REUSE decision (Flag #2): `getHealthStatusAll.daysRemaining` is INTEGER days — too coarse for the `<24h` yellow threshold. Therefore BUILD `decodeMucTokenExp()` as D-04 specifies. Document this choice in the SUMMARY: "Built decodeMucTokenExp because health daysRemaining is integer-day granularity, insufficient for the 24h banner threshold."

1. Create `src/lib/bigsellerToken.ts` — frontend twin of `convex/lib/jwt.ts` (do NOT import the convex helper; duplicate ~8 lines per CLAUDE.md Pitfall #18 precedent):
```typescript
// Returns exp in ms, or null if the token is malformed / has no exp.
// No signature verification — we trust the server-issued JWT (83-RESEARCH.md).
export function decodeMucTokenExp(mucToken: string): number | null {
  try {
    const parts = mucToken.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}
```

2. Wire `tokenExpiresAt` (ms) down to `BigSellerSyncPanel` as a prop, mirroring the existing `tokenExpired` prop drilling. `SettingsTab.tsx` already has `bigsellerHealth`; it does NOT expose a token to the frontend. Cheapest path that gives sub-day precision: add `tokenExpiresAt: number | null` to `PlatformHealthStatus` in `convex/platformCredentials/queries.ts` (computed from the decoded token alongside the existing `daysRemaining`), pass it through SettingsTab to the panel. If that query already decodes the token to compute `daysRemaining`, reuse that same `exp*1000`. (decodeMucTokenExp remains the helper for any path that has the raw token client-side and for the unit tests.)

(staffreview R3) ONE production freshness source only: the banner reads `tokenExpiresAt` (ms) delivered via the query → SettingsTab → panel prop. `decodeMucTokenExp` is the shared pure decoder that the query handler (or any code holding the raw token) calls to PRODUCE that `tokenExpiresAt`, plus it is unit-tested directly. Do NOT also decode a raw token inside `BigSellerSyncPanel` to compute a second, possibly-divergent freshness value — the panel consumes the precomputed `tokenExpiresAt` and nothing else.

3. In `BigSellerSyncPanel.tsx`, compute `hoursRemaining = tokenExpiresAt != null ? (tokenExpiresAt - Date.now()) / 3600000 : null`. Add two banners using the EXACT class vocabulary from the existing banners:
   - Yellow `<24h` (copy L330-346 amber classes), shown when `hoursRemaining != null && hoursRemaining > 0 && hoursRemaining < 24`: message `Token expires in {Math.ceil(hoursRemaining)}h — paste fresh token`, same `Paste Token` button via `onOpenTokenDialog`.
   - Red expired (copy L447-460 red classes `bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900`), shown when `hoursRemaining != null && hoursRemaining <= 0`. This banner BLOCKS sync: extend the `Sync Now` disabled condition at L277 to also disable when expired (or fold the expired state into the existing `tokenExpired` flow). Icon `AlertTriangle` (already imported).
  </action>
  <verify>
    <automated>npm run test -- bigsellerToken &amp;&amp; npm run test -- BigSellerSyncPanel</automated>
  </verify>
  <acceptance_criteria>
    - file `src/lib/bigsellerToken.ts` exists and exports `decodeMucTokenExp`
    - `grep -c 'decodeMucTokenExp' src/lib/bigsellerToken.ts` returns >= 1
    - file `src/lib/__tests__/bigsellerToken.test.ts` exists with cases for valid JWT, malformed, and missing-exp
    - `grep -c 'Token expires in' src/components/salesAnalytics/BigSellerSyncPanel.tsx` returns >= 1
    - `npm run test -- bigsellerToken` exits 0
    - `npm run test -- BigSellerSyncPanel` exits 0
  </acceptance_criteria>
  <done>decodeMucTokenExp helper + unit tests pass; BigSellerSyncPanel shows yellow <24h and red expired banners; red banner disables Sync Now.</done>
</task>

<task type="auto">
  <name>Task 5: Docs — SCHEMA value, CHANGELOG (incl. D-02 archival note), API doc, build</name>
  <read_first>
    - docs/SCHEMA.md (platformCredentials table section)
    - docs/CHANGELOG.md (top entry format)
    - docs/BIGSELLER_PROFIT_API.md (Last Verified + mechanism section)
    - 83-CONTEXT.md D-02 (CHANGELOG archival note text) + D-03 (token mechanism)
  </read_first>
  <action>
1. `docs/SCHEMA.md` — under the `platformCredentials` table, document the new `lastRefreshStatus` value `"auto-refreshed-from-response"` (alongside the existing `"success"` / `"error"`): "set when the nightly/manual sync captures a fresher muctoken JWT from the BigSeller response headers and slides the 20-day TTL forward (Phase 83-03)."

2. `docs/CHANGELOG.md` — add a Phase 83-03 entry covering: (a) token auto-refresh from the `muctoken` response header + the freshness banner; AND (b) the D-02 archival note, VERBATIM intent: "BigSeller still accepts the legacy 5-value `orderState` (`completed`, `shipped`, `canceled`, `other`, `new`) as of the 83-01a backfill (2026-05). The subtractive 83-01b W1-W3 fallback (drop `canceled`+`new`, switch `currency`/`searchContent` to `""`) is ARCHIVED — documented standby only, NO code shipped. Re-trigger only if BigSeller starts rejecting the legacy values again (would carry a cancellation-data-loss caveat)." This folds the D-02 doc-only note into 83-03 per the structural directive — do NOT create a separate plan for it.

3. `docs/BIGSELLER_PROFIT_API.md` — update the "Last Verified" date and add a short "Token auto-refresh" subsection: every successful BigSeller call returns a fresher `muctoken` JWT in the response headers; the action captures the freshest one and persists it once at end of a successful sync, sliding the 20-day sliding-`exp` TTL forward indefinitely.

4. Run the full build gate.
  </action>
  <verify>
    <automated>npm run build</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'auto-refreshed-from-response' docs/SCHEMA.md` returns >= 1
    - `grep -ci 'orderState' docs/CHANGELOG.md` returns >= 1 AND the new entry contains "ARCHIVED" or "archived"
    - `grep -ci 'auto-refresh' docs/BIGSELLER_PROFIT_API.md` returns >= 1
    - `npm run build` exits 0
  </acceptance_criteria>
  <done>SCHEMA documents the new status value; CHANGELOG carries the token-refresh entry AND the D-02 orderState archival note; API doc updated; build green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| BigSeller API → action runtime | Response headers (incl. `muctoken`) are vendor-controlled, untrusted input. |
| action runtime → platformCredentials row | First write-bearing change in Phase 83; persists a credential token. |
| server → frontend banner | `tokenExpiresAt` (ms) crosses to the client; banner decodes a JWT for display only. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-83-03-01 | Tampering | sync.ts persist-once block | mitigate | Defensive guards (D-03): skip persist if `latestRefreshedToken` empty, equals current token, or `authErrorObserved` true — avoids overwriting a known-good token with a degraded/expired token from a partial-failure response. Wrap persist in try/catch so a bad write never fails the sync. (Task 2) |
| T-83-03-02 | DoS / availability | credential row | mitigate | Persist ONCE at end of a successful sync (not per-page) — avoids cron+manual write race on the singleton `platformCredentials` row. (Task 2) |
| T-83-03-03 | Information disclosure | frontend banner | accept | `decodeMucTokenExp` decodes the JWT payload WITHOUT signature verification — acceptable here: we trust the server-issued token and use the decoded `exp` for display only. Never used for any authz decision. (Task 4) |
| T-83-03-04 | Elevation of privilege | updateToken mutation | accept | `updateToken` is an `internalMutation` — not reachable from the client; only callable via `ctx.runMutation` from the trusted action. No new public surface. |
| T-83-03-05 | Spoofing | muctoken header | accept | Header is vendor-issued over HTTPS to BigSeller; we replay it as-is per the documented sliding-JWT mechanism (83-RESEARCH.md). No signature verification by design. |
</threat_model>

<verification>
- `npx convex codegen && npm run type-check` — validator + schema widening compile.
- `npm run test -- bigseller` — sync auto-refresh tests + existing bigseller suite green.
- `npm run test -- bigsellerToken && npm run test -- BigSellerSyncPanel` — helper + banner tests green.
- `npm run build` — full build passes (no chunk-size breach; banner adds negligible weight).
</verification>

<success_criteria>
- After a successful sync, `platformCredentials.currentToken` is the freshest muctoken and `lastRefreshStatus === "auto-refreshed-from-response"`; decoded `exp` ≈ now + 20 days.
- No persist when token is empty / unchanged / an auth error was observed.
- updateToken accepts the new literal without ArgumentValidationError.
- Yellow `<24h` and red expired banners render correctly; red disables Sync Now.
- CHANGELOG carries the D-02 orderState archival note; SCHEMA + API docs updated.
- Existing bigseller suite stays green; `npm run build` passes.
</success_criteria>

<output>
After completion, create `.planning/phases/83-bigseller-pagelist-refresh/83-03-SUMMARY.md`
</output>
