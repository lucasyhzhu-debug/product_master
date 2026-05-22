---
phase: 83-bigseller-pagelist-refresh
plan: 03
subsystem: bigseller-integration
tags: [token-refresh, auth, frontend-banner, convex-action]
requires:
  - "platformCredentials.updateToken internalMutation (existing)"
  - "convex/lib/jwt.ts decodeJwtPayload (existing)"
  - "BigSeller fetchOrders action fetch loop (existing)"
provides:
  - "platformCredentials.lastRefreshStatus: auto-refreshed-from-response literal"
  - "fetchOrders muctoken capture + persist-once-at-end (D-03)"
  - "shouldPersistRefreshedToken pure guard (convex/integrations/bigseller/sync.ts)"
  - "PlatformHealthStatus.tokenExpiresAt (ms) field"
  - "src/lib/bigsellerToken.ts decodeMucTokenExp"
  - "BigSellerSyncPanel 2-state freshness banner (D-04)"
affects:
  - "convex/platformCredentials (schema + validator + query)"
  - "convex/integrations/bigseller/sync.ts"
  - "src/components/salesAnalytics/{BigSellerSyncPanel,SettingsTab}.tsx"
tech-stack:
  added: []
  patterns:
    - "Capture-accumulate-persist-once: gather freshest token across pages, write once at end of successful sync (avoids cron+manual write race on singleton credential row)"
    - "Pure persist-guard helper extracted for unit-testability (shouldPersistRefreshedToken)"
    - "Frontend JWT-decode twin (decodeMucTokenExp) per CLAUDE.md Pitfall #18 — duplicate ~8 lines, do not import convex helper into src/"
key-files:
  created:
    - "convex/integrations/bigseller/__tests__/sync.test.ts"
    - "src/lib/bigsellerToken.ts"
    - "src/lib/__tests__/bigsellerToken.test.ts"
  modified:
    - "convex/platformCredentials/mutations.ts"
    - "convex/schema.ts"
    - "convex/integrations/bigseller/sync.ts"
    - "convex/platformCredentials/queries.ts"
    - "src/components/salesAnalytics/BigSellerSyncPanel.tsx"
    - "src/components/salesAnalytics/SettingsTab.tsx"
    - "src/components/salesAnalytics/__tests__/BigSellerSyncPanel.test.tsx"
    - "docs/SCHEMA.md"
    - "docs/CHANGELOG.md"
    - "docs/BIGSELLER_PROFIT_API.md"
decisions:
  - "Built decodeMucTokenExp (D-04) rather than reusing health daysRemaining because daysRemaining is integer-day granularity, insufficient for the <24h yellow banner threshold."
  - "Single production freshness source (staffreview R3): banner consumes precomputed PlatformHealthStatus.tokenExpiresAt; decodeMucTokenExp is the shared pure decoder + unit-tested directly, NOT re-decoded inside the panel."
  - "Surfaced tokenExpiresAt (raw ms) on PlatformHealthStatus from cred.tokenExpiresAt (kept fresh by auto-refresh) rather than decoding a token client-side — no token exposed to frontend."
  - "Persist-guard extracted to pure shouldPersistRefreshedToken so D-03 defensive guards are unit-testable without mocking the full use-node action fetch loop (plan-authorized fallback; full t.action mock impractical per MEMORY 74.5.2/80.2 resolver lessons)."
metrics:
  duration_min: 12
  completed: 2026-05-22
  tasks: 5
  files: 13
  commits: 6
---

# Phase 83 Plan 03: Token Auto-Refresh Summary

BigSeller token auto-refresh (D-03) + 2-state freshness banner (D-04): every successful sync captures the fresher `muctoken` JWT from response headers and persists it once at end, sliding the 20-day TTL forward indefinitely so the cron never dies from token decay.

## What Was Built

1. **Validator + schema widening (Task 1):** Added `v.literal("auto-refreshed-from-response")` to both the `updateToken` arg validator and the `platformCredentials.lastRefreshStatus` table union — prevents `ArgumentValidationError` when the sync persists the auto-refreshed token (Flag #1; corrects CONTEXT "no schema change needed").
2. **Capture + persist (Task 2):** `fetchOrders` reads `response.headers.get("muctoken")` after each successful fetch, accumulates the freshest token (≠ current) in outer scope, and persists ONCE after the per-platform loop via `updateToken` with `lastRefreshStatus: "auto-refreshed-from-response"`. `tokenExpiresAt` = decoded `exp * 1000`. Guarded by the pure `shouldPersistRefreshedToken(latest, current, authErrorObserved)` (skip empty / equal / auth-error); `authErrorObserved` set at both HTML and JSON auth-abort points; persist wrapped in try/catch so a write failure never fails the sync.
3. **Tests (Task 3):** New `sync.test.ts` — guard cases (persist / equal / empty / auth-error), `updateToken` wiring accepting the new literal, `tokenExpiresAt = exp*1000` from the real HAR JWT (`exp:1780911842`). 7 tests.
4. **Helper + banner (Task 4):** New `src/lib/bigsellerToken.ts` `decodeMucTokenExp()` (frontend twin of `convex/lib/jwt.ts`, no signature verification, display-only). Added `tokenExpiresAt` (ms) to `PlatformHealthStatus`, wired through `SettingsTab` to `BigSellerSyncPanel`. Yellow `<24h` banner + red expired banner; red blocks `Sync Now`. Helper tests (valid / malformed / no-exp / empty) + banner tests (yellow / red / disable / none).
5. **Docs (Task 5):** SCHEMA documents the new status value; CHANGELOG carries the token-refresh entry AND the D-02 `orderState` archival note (folded into 83-03, no separate plan); BIGSELLER_PROFIT_API gets a Token auto-refresh subsection + Last Verified bump.

## Verification

| Gate | Result |
|------|--------|
| `npm run type-check` | PASS (zero new errors) |
| `npm run test -- bigseller` | PASS — 176 tests (14 files), incl. 7 new sync.test.ts |
| `npm run test -- bigsellerToken` | PASS — 5 tests |
| `npm run test -- BigSellerSyncPanel` | PASS — 9 tests (4 existing + 5 new banner) |
| `npm run build` | PASS (EXIT=0, no chunk-size breach) |

## Deviations from Plan

### Auto-fixed Issues

None requiring code beyond plan scope. The plan's Task 2 explicitly authorized the pure-helper extraction fallback (`shouldPersistRefreshedToken`) when full action-fetch-loop mocking is impractical — adopted that path. The header-capture + `updateToken` wiring is still covered (persist + guard-rejection cases) by driving `updateToken` directly with the decoded expiry, mirroring the end-of-sync persist block.

## Environment Note (not a deviation)

`npx convex codegen` (Task 1 verify) could not run in this execution environment: no `CONVEX_DEPLOYMENT` / `.env.local` present (gitignored, absent). Widening a validator union does NOT change the registered mutation name/path, so the existing `_generated` API types remain valid — `npm run type-check` passes green, confirming the `_generated` surface is consistent. Codegen will run normally in CI/dev where the deployment is configured.

## Threat Model Compliance

| Threat ID | Disposition | Implemented |
|-----------|-------------|-------------|
| T-83-03-01 (tamper persist) | mitigate | `shouldPersistRefreshedToken` guards (empty/equal/auth-error) + try/catch — DONE |
| T-83-03-02 (write race) | mitigate | Persist ONCE at end of sync, not per-page — DONE |
| T-83-03-03 (info disclosure) | accept | `decodeMucTokenExp` decodes without signature verification, display-only — as designed |
| T-83-03-04 (EoP) | accept | `updateToken` is internalMutation, no new public surface — unchanged |
| T-83-03-05 (spoofing) | accept | muctoken replayed as-is per sliding-JWT mechanism — as designed |

No new threat surface introduced beyond the registered dispositions.

## Commits

- `9afe20ae` feat(83-03): widen updateToken validator + schema for auto-refresh status
- `868b4ff9` feat(83-03): capture muctoken header + persist-once-at-end in sync
- `42fdfda8` test(83-03): token auto-refresh persist/guard tests
- `a3d7caa2` feat(83-03): decodeMucTokenExp helper + freshness banner on BigSellerSyncPanel
- `38650fe6` docs(83-03): SCHEMA status value, CHANGELOG (+D-02 archival), API token auto-refresh

## Self-Check: PASSED

- Created files exist: `convex/integrations/bigseller/__tests__/sync.test.ts`, `src/lib/bigsellerToken.ts`, `src/lib/__tests__/bigsellerToken.test.ts` — all FOUND.
- Commits exist in git log: 9afe20ae, 868b4ff9, 42fdfda8, a3d7caa2, 38650fe6 — all FOUND.
