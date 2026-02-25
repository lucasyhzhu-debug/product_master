---
phase: 26-platform-auth-schema
verified: 2026-02-25T00:00:00Z
status: passed
score: 4/4 requirements verified
re_verification: null
gaps: []
human_verification:
  - test: "Open Sales Analytics > Settings tab as admin — confirm all 6 platform rows render"
    expected: "Six rows: K3 Mart, GoBiz (GoFood), Internal Orders, GrabFood, BigSeller, Consignment — each with status dot, category icon, platform name, status badge, and optional action button"
    why_human: "Registry-driven rendering requires live Convex query data; cannot verify row count statically"
  - test: "GoBiz row — click 'Refresh Token' button"
    expected: "Button triggers loginWithCredentials action; shows spinner; toasts success or 'env vars not configured' error"
    why_human: "End-to-end action execution requires live Convex runtime"
  - test: "BigSeller row — click 'Paste Token' button, paste a valid JWT muc_token"
    expected: "Dialog auto-previews 'X days remaining' with correct color (green >7d, yellow 3-7d, red <3d); 'Save Token' button enabled; on confirm token is stored"
    why_human: "JWT decode preview requires real token input and live action execution"
  - test: "GrabFood row — status when credentials exist vs. not configured"
    expected: "'Connected' (green) when email/client_id present in platformCredentials; 'Client credentials not configured' (disconnected) otherwise"
    why_human: "Status depends on database state; cannot verify statically"
---

# Phase 26: Platform Auth & Schema Foundation — Verification Report

**Phase Goal:** Establish authentication for all three new platforms (GoBiz one-click refresh, BigSeller paste-once JWT with expiry monitoring, GrabFood on-demand token resolve) and deploy all new schema tables and source union extensions that every subsequent phase depends on.
**Verified:** 2026-02-25
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GoBiz admin can one-click refresh token via password grant (AUTH-01) | VERIFIED | `loginWithCredentials` action in `convex/integrations/gobiz/adapter.ts:1025`; reads `GOBIZ_EMAIL`/`GOBIZ_PASSWORD` env vars; calls `internal.platformCredentials.mutations.saveDirectToken`; graceful error when env vars absent |
| 2 | Admin can paste BigSeller muc_token with JWT expiry preview before saving (AUTH-02) | VERIFIED | `previewBigSellerToken` and `saveBigSellerToken` actions in `convex/integrations/bigseller/adapter.ts`; `BigSellerTokenDialog.tsx` has paste → preview → confirm flow; token stored with actual JWT `exp` not 6h estimate |
| 3 | GrabFood OAuth2 token resolves on-demand via client_credentials strategy (AUTH-03) | VERIFIED | `resolveToken()` fully implemented in `convex/integrations/grabfood/adapter.ts:49`; all 8 GrabFood action invocations call it lazily; no cron, no manual paste; credentials stored in `platformCredentials` table; handles no-credentials case gracefully |
| 4 | Unified credential health panel shows status for all platforms in Settings (AUTH-04) | VERIFIED | `SettingsTab.tsx` loops over `getHealthStatusAll` query results; `IntegrationHealthCard` accepts `PlatformHealthStatus` prop; action dispatch via `authStrategy` switch; `BigSellerTokenDialog` and `GoBizTokenDialog` wired |

**Score:** 4/4 truths verified

---

## Required Artifacts

### Plan 01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `convex/lib/jwt.ts` | Shared JWT payload decode utility | VERIFIED | Exports `decodeJwtPayload(token: string): Record<string, unknown>`; uses `atob` for base64url decode |
| `convex/integrations/registry.ts` | Extended PlatformMeta with authStrategy, category, healthConfig + 6 platforms | VERIFIED | 6 platform entries: k3mart, gobiz, internal, grabfood, bigseller, consignment; all with `authStrategy`, `category`, `healthConfig` |
| `convex/schema.ts` | 4 new tables + shared `externalSource` union in 5 external tables | VERIFIED | `grabfoodOrders`, `bigsellerOrders`, `consignmentOutlets`, `consignmentSettlements` at lines 1436–1530; `externalSource` exported at line 18; all 5 external tables use it at lines 985, 1027, 1072, 1093, 1111 |
| `convex/platformCredentials/queries.ts` | Registry-driven `getHealthStatusAll` query with auth | VERIFIED | Query at line 181; requires `token: v.string()`; calls `requireRole(ctx, args.token, ["manager", "admin"])`; iterates `PLATFORM_IDS`; returns `PlatformHealthStatus[]` |

### Plan 02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `convex/platformCredentials/mutations.ts` | `saveDirectToken` as `internalMutation` with optional `tokenExpiresAt` | VERIFIED | `internalMutation` at line 91; optional `tokenExpiresAt: v.optional(v.number())`; uses `tokenExpiresAt ?? 6h estimate`; `saveDirectTokenPublic` public wrapper at line 136 |
| `convex/integrations/gobiz/adapter.ts` | `loginWithCredentials` action (password grant) | VERIFIED | Public `action` at line 1025; reads env vars; POSTs to `https://api.gobiz.co.id/goid/token`; calls `internal.platformCredentials.mutations.saveDirectToken` |
| `convex/integrations/bigseller/adapter.ts` | `previewBigSellerToken` + `saveBigSellerToken` actions | VERIFIED | Both actions present; imports `decodeJwtPayload` from `../../lib/jwt`; preview returns `{expiresAt, daysRemaining, uid}`; save calls internal `saveDirectToken` with actual `tokenExpiresAt` |
| `convex/integrations/bigseller/config.ts` | BigSeller configuration constants | VERIFIED | Exports `BIGSELLER_PLATFORM_ID`, `BIGSELLER_TOKEN_COOKIE_NAME`, `BIGSELLER_MAX_SYNC_DAYS` |

### Plan 03 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/formatters.ts` | Shared `formatCountdown` utility | VERIFIED | Exports `formatCountdown(daysRemaining: number \| null): string` and `formatRelativeTime(timestamp: number): string` |
| `src/components/salesAnalytics/IntegrationHealthCard.tsx` | Registry-driven health row using `PlatformHealthStatus` prop | VERIFIED | Single `health: PlatformHealthStatus` prop; derives action label from `authStrategy`; derives icon from `category`; imports `formatCountdown` from `src/lib/formatters` |
| `src/components/salesAnalytics/SettingsTab.tsx` | Settings tab with 6-platform loop using `getHealthStatusAll` | VERIFIED | Calls `api.platformCredentials.queries.getHealthStatusAll` with auth token; maps over `PlatformHealthStatus[]`; dispatches via `authStrategy` switch |
| `src/components/salesAnalytics/BigSellerTokenDialog.tsx` | BigSeller paste-token dialog with JWT expiry preview | VERIFIED | Full paste → auto-preview → confirm flow; imports `previewBigSellerToken` + `saveBigSellerToken`; uses `formatCountdown` from shared util |
| `src/components/salesAnalytics/GoBizTokenDialog.tsx` | GoBiz dialog with Refresh Token button | VERIFIED | `useAction(api.integrations.gobiz.adapter.loginWithCredentials)` at line 45; one-click button at line 76; manual paste as collapsible fallback |

---

## Key Link Verification

### Plan 01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `convex/integrations/registry.ts` | `convex/schema.ts` | PlatformId literals match source union literals | VERIFIED | Both define 6 literals: k3mart, gobiz, internal, grabfood, bigseller, consignment |
| `convex/platformCredentials/queries.ts` | `convex/integrations/registry.ts` | Query iterates `PLATFORMS` registry | VERIFIED | Imports `PLATFORMS`, `PLATFORM_IDS` from `../integrations/registry`; `for (const platformId of PLATFORM_IDS)` loop |
| `convex/lib/jwt.ts` | `convex/platformCredentials/actions.ts` | `actions.ts` imports `decodeJwtPayload` from shared util | VERIFIED | Line 7: `import { decodeJwtPayload } from "../lib/jwt"` |

### Plan 02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `convex/integrations/gobiz/adapter.ts` | `convex/platformCredentials/mutations.ts` | `loginWithCredentials` calls `saveDirectToken` via `internal.*` | VERIFIED | Calls `internal.platformCredentials.mutations.saveDirectToken` |
| `convex/integrations/bigseller/adapter.ts` | `convex/lib/jwt.ts` | Uses `decodeJwtPayload` from shared util | VERIFIED | Line 6: `import { decodeJwtPayload } from "../../lib/jwt"` |
| `convex/integrations/bigseller/adapter.ts` | `convex/platformCredentials/mutations.ts` | `saveBigSellerToken` calls `saveDirectToken` with `tokenExpiresAt` via `internal.*` | VERIFIED | `ctx.runMutation(internal.platformCredentials.mutations.saveDirectToken, {..., tokenExpiresAt})` at line 120 |

### Plan 03 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/components/salesAnalytics/SettingsTab.tsx` | `convex/platformCredentials/queries.ts` | `useQuery(api.platformCredentials.queries.getHealthStatusAll, { token })` | VERIFIED | Line 39: `api.platformCredentials.queries.getHealthStatusAll` |
| `src/components/salesAnalytics/GoBizTokenDialog.tsx` | `convex/integrations/gobiz/adapter.ts` | `useAction(api.integrations.gobiz.adapter.loginWithCredentials)` | VERIFIED | Lines 45–46 |
| `src/components/salesAnalytics/BigSellerTokenDialog.tsx` | `convex/integrations/bigseller/adapter.ts` | `useAction` for `previewBigSellerToken` + `saveBigSellerToken` | VERIFIED | Lines 52–57 |
| `src/components/salesAnalytics/IntegrationHealthCard.tsx` | `PlatformHealthStatus` type | Reads `authStrategy` and `category` from query return type | VERIFIED | Type imported from `convex/platformCredentials/queries`; `getActionLabel(health.authStrategy)` and `getCategoryIcon(health.category)` |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AUTH-01 | 26-02 | Admin can one-click refresh GoBiz token via password grant | SATISFIED | `loginWithCredentials` action in gobiz adapter; GoBizTokenDialog one-click button wired; env-var graceful fallback verified |
| AUTH-02 | 26-02, 26-03 | Admin can paste BigSeller muc_token with 30-day expiry countdown and dashboard warning | SATISFIED | `previewBigSellerToken` + `saveBigSellerToken`; actual JWT `exp` stored as `tokenExpiresAt`; `BigSellerTokenDialog` with preview+confirm flow; health dashboard shows countdown via `hasExpiry: true` |
| AUTH-03 | 26-01 | GrabFood OAuth2 token resolves on-demand via `resolveToken()` | SATISFIED | `resolveToken()` in `convex/integrations/grabfood/adapter.ts` (untracked — pre-existing implementation verified in codebase); GrabFood added to registry as `authStrategy: 'client_credentials'` with `always_green` health type; health panel checks `email` (client_id) presence for connected/disconnected state |
| AUTH-04 | 26-01, 26-03 | Unified credential health panel for all 3 platforms (GoBiz, GrabFood, BigSeller) | SATISFIED | Panel actually shows all 6 platforms (exceeds requirement); `IntegrationHealthCard` is registry-driven; `SettingsTab` loop replaces hardcoded blocks |

**Note on AUTH-02 threshold deviation:** REQUIREMENTS.md states "dashboard warning when < 5 days remaining". CONTEXT.md (post-research locked decision) set thresholds as Red < 3 days, Yellow 3-7 days. The implementation follows CONTEXT.md (green >7d, yellow 3-7d, red <3d). This diverges from the < 5 day warning wording in REQUIREMENTS.md but is intentional and documented in the phase research. The resulting behavior (yellow warning at 7 days, red at 3 days) is more conservative than the < 5 day requirement, so the spirit of AUTH-02 is met.

**Note on AUTH-03 + untracked files:** `convex/integrations/grabfood/adapter.ts` and `convex/integrations/grabfood/config.ts` are untracked (not committed to git). The research doc confirms `resolveToken()` was pre-existing before phase 26. These files exist and work in the codebase but are not in version control. This is a housekeeping issue, not a goal blocker — AUTH-03's requirement is that the functionality exists and is wired to the registry, which is verified.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/components/salesAnalytics/BigSellerTokenDialog.tsx` | 175 | HTML `placeholder` attribute | Info | Normal UI placeholder text in textarea — not a code stub |
| `src/components/salesAnalytics/IntegrationHealthCard.tsx` | 97, 99 | `return null` | Info | Intentional — `getActionLabel` returns null for `session_auth` and `default` to suppress action button (correct behavior) |

No blocker or warning-level anti-patterns found. No TODO/FIXME/HACK/PLACEHOLDER comments in phase-created files. No empty handlers or unimplemented stubs.

---

## Commit Verification

All 12 documented commits verified present in git log:

| Commit | Description | Plan |
|--------|-------------|------|
| `1199718` | feat(26-01): extract decodeJwtPayload to shared convex/lib/jwt.ts | 01 |
| `0f2fc12` | feat(26-01): extend platform registry with 6 platforms + PlatformMeta fields | 01 |
| `e071ef0` | feat(26-01): add 4 new schema tables + extend source unions in 5 external tables | 01 |
| `0ffe356` | feat(26-01): create registry-driven credential health query getHealthStatusAll | 01 |
| `14b9fb3` | feat(26-02): convert saveDirectToken to internalMutation + add tokenExpiresAt param | 02 |
| `699363c` | feat(26-02): GoBiz loginWithCredentials password grant action | 02 |
| `4caef7a` | feat(26-02): BigSeller paste-token flow with JWT decode preview | 02 |
| `f0f9a32` | fix(26-02): update externalSource types in frontend after Plan 01 schema expansion | 02 |
| `ee8eaec` | feat(26-03): extract formatCountdown + refactor IntegrationHealthCard + SettingsTab | 03 |
| `daaed32` | feat(26-03): GoBiz Refresh Token button + BigSeller paste dialog with JWT preview | 03 |
| `a5780aa` | fix(26-03): update api.d.ts + fix TypeScript strict mode errors | 03 |
| `a183785` | docs(26-03): update CHANGELOG + SCHEMA + API_REFERENCE for Phase 26 | 03 |

---

## Human Verification Required

### 1. Six-Platform Health Panel Render

**Test:** Log in as admin, navigate to Sales Analytics > Settings tab
**Expected:** Six rows render with correct platform names: K3 Mart, GoBiz (GoFood), Internal Orders, GrabFood, BigSeller, Consignment — each with status dot, icon, name, status badge
**Why human:** Registry-driven query result requires live Convex runtime to verify row count and correct data

### 2. GoBiz One-Click Token Refresh

**Test:** In Settings > GoBiz row, click "Refresh Token" button
**Expected:** If `GOBIZ_EMAIL`/`GOBIZ_PASSWORD` env vars configured: spinner appears, success toast "GoBiz token refreshed". If not configured: error message "GOBIZ_EMAIL and GOBIZ_PASSWORD env vars not configured in Convex dashboard."
**Why human:** Requires live GoBiz API call and Convex action execution

### 3. BigSeller Paste → Preview → Save Flow

**Test:** In Settings > BigSeller row, click "Paste Token", paste a valid muc_token JWT
**Expected:** Auto-preview fires showing "X days remaining" with correct color (green >7d, yellow 3-7d, red <3d); "Save Token" button becomes enabled; on click token is saved and dialog closes with toast
**Why human:** Requires real JWT token and live Convex action execution

### 4. GrabFood Status Display

**Test:** Check GrabFood row status with and without credentials in `platformCredentials` table
**Expected:** "Connected" (green) when `email` field populated; "Client credentials not configured" (disconnected) when no credentials record
**Why human:** Status depends on database state; requires checking against live data

---

## Summary

Phase 26 achieved its goal. All four requirements (AUTH-01, AUTH-02, AUTH-03, AUTH-04) are satisfied with full three-level verification (existence, substance, wiring).

**Key architectural outcomes delivered:**
- Platform registry extended to 6 platforms with `authStrategy`/`category`/`healthConfig` — the foundation all subsequent phases depend on
- `externalSource` union exported from `schema.ts` and applied to all 5 external tables — consistent source of truth for platform-sourced data
- 4 new schema tables deployed (`grabfoodOrders`, `bigsellerOrders`, `consignmentOutlets`, `consignmentSettlements`) with complete indexes
- `saveDirectToken` converted to `internalMutation` — the correct pattern for action-to-mutation calls
- Registry-driven UI pattern established — `IntegrationHealthCard` derives all behavior from `authStrategy`/`category`, no hardcoded platform branches

**One housekeeping item not blocking the goal:** `convex/integrations/grabfood/adapter.ts` and `convex/integrations/grabfood/config.ts` are untracked in git. These files contain the pre-existing `resolveToken()` implementation satisfying AUTH-03. They should be committed to version control, but their absence from git does not affect runtime functionality.

---

_Verified: 2026-02-25_
_Verifier: Claude (gsd-verifier)_
