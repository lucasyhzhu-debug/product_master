---
phase: 26-platform-auth-schema
verified: 2026-02-25T12:00:00Z
status: passed
score: 4/4 requirements verified
re_verification:
  previous_status: passed
  previous_score: 4/4
  gaps_closed:
    - "GoBiz one-click token refresh (loginWithCredentials) flattened credential body + error surfacing fixed"
    - "BigSeller JWT preview now shows uid via multi-key fallback (uid, user_id, sub, id)"
    - "Platform cards (K3Mart, GoBiz) expand to show sync log history — collapsible toggle restored"
  gaps_remaining: []
  regressions: []
gaps: []
human_verification:
  - test: "Open Sales Analytics > Settings tab as admin — confirm all 6 platform rows render"
    expected: "Six rows: K3 Mart, GoBiz (GoFood), Internal Orders, GrabFood, BigSeller, Consignment — each with status dot, category icon, platform name, status badge, and optional action button"
    why_human: "Registry-driven rendering requires live Convex query data; cannot verify row count statically"
  - test: "GoBiz row — click 'Refresh Token' button"
    expected: "Button triggers loginWithCredentials action; credentials sent as flat JSON { client_id, grant_type, email, password }; on 400 the error message includes GoBiz response body; on success toast 'GoBiz token refreshed'"
    why_human: "End-to-end action execution requires live Convex runtime and configured env vars"
  - test: "BigSeller row — click 'Paste Token' button, paste a valid JWT muc_token"
    expected: "Dialog auto-previews 'X days remaining' with correct color (green >7d, yellow 3-7d, red <3d) AND shows uid decoded from token; 'Save Token' button enabled; on confirm token is stored"
    why_human: "JWT decode preview requires real token input and live action execution"
  - test: "K3Mart or GoBiz card — click the chevron expand toggle"
    expected: "Sync history section expands below the row showing up to 5 recent sync entries with status icon, relative timestamp, and record count; clicking again collapses it"
    why_human: "Requires live externalSyncLogs data and Convex query execution"
  - test: "GrabFood row — status when credentials exist vs. not configured"
    expected: "'Connected' (green) when email/client_id present in platformCredentials; 'Client credentials not configured' (disconnected) otherwise"
    why_human: "Status depends on database state; cannot verify statically"
---

# Phase 26: Platform Auth & Schema Foundation — Verification Report (Re-verification)

**Phase Goal:** Establish authentication for all three new platforms (GoBiz one-click refresh, BigSeller paste-once JWT with expiry monitoring, GrabFood on-demand token resolve) and deploy all new schema tables and source union extensions that every subsequent phase depends on.
**Verified:** 2026-02-25
**Status:** PASSED
**Re-verification:** Yes — after UAT gap closure (Plans 04 and 05)

---

## Re-verification Context

The initial VERIFICATION.md (written after Plans 01-03) reported `status: passed`. Subsequent UAT (`26-UAT.md`) identified three gaps:

1. **GoBiz 400 error** — `loginWithCredentials` body nested credentials under a `data` key instead of top-level
2. **BigSeller uid not shown** — `previewBigSellerToken` only checked `payload.uid`; BigSeller tokens use a different claim key
3. **Sync log expand removed** — Phase 26-03 refactor stripped the collapsible sync history from `IntegrationHealthCard`

Gap closure plans 04 and 05 were executed. This re-verification confirms all three gaps are closed and no regressions introduced.

**Commits confirming gap closure:**

| Commit | Description |
|--------|-------------|
| `de4f8ca` | fix(26-04): flatten GoBiz loginWithCredentials body + surface error message |
| `df8090b` | fix(26-04): expand BigSeller uid lookup to 4 JWT claim keys |
| `40d5650` | feat(26-05): add SyncLogEntry type and syncHistory to PlatformHealthStatus |
| `cf2b553` | feat(26-05): add collapsible sync log to IntegrationHealthCard |

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GoBiz admin can one-click refresh token via password grant (AUTH-01) | VERIFIED | `loginWithCredentials` in `convex/integrations/gobiz/adapter.ts:1049-1060`; flat body `{ client_id, grant_type, email, password }` — no nested `data` key; error body read and surfaced on non-200; token saved via `internal.platformCredentials.mutations.saveDirectToken` |
| 2 | Admin can paste BigSeller muc_token with JWT expiry preview and uid (AUTH-02) | VERIFIED | `previewBigSellerToken` in `convex/integrations/bigseller/adapter.ts:58-59`: uid uses `.find()` across `[payload.uid, payload.user_id, payload.sub, payload.id]`; `BigSellerTokenDialog` wired via `useAction`; expiry preview + confirm flow intact |
| 3 | GrabFood OAuth2 token resolves on-demand via client_credentials strategy (AUTH-03) | VERIFIED | `resolveToken()` in `convex/integrations/grabfood/adapter.ts`; GrabFood in registry as `authStrategy: 'client_credentials'`; all GrabFood actions call it lazily; credentials stored in `platformCredentials` |
| 4 | Unified credential health panel shows status for all platforms in Settings (AUTH-04) | VERIFIED | `SettingsTab.tsx:182` passes `health={health}` full object to `IntegrationHealthCard`; `getHealthStatusAll` returns `PlatformHealthStatus[]` with `syncHistory`; K3Mart/GoBiz cards have expand toggle; `npm run type-check` exits 0 |

**Score:** 4/4 truths verified

---

## Gap Closure Verification

### Gap 1: GoBiz loginWithCredentials credential body (AUTH-01)

**Status: CLOSED**

Previous issue: credentials nested under `data: { email, password }` causing 400 from GoBiz API.

Verified fix at `convex/integrations/gobiz/adapter.ts` lines 1055-1060:

```typescript
body: JSON.stringify({
  client_id: "go-biz-web-new",
  grant_type: "password",
  email,
  password,
}),
```

No `data` key present. Error handler at lines 1069-1083 reads `errData.error_description` from response body and includes it in the returned error string.

### Gap 2: BigSeller uid lookup (AUTH-02)

**Status: CLOSED**

Previous issue: `previewBigSellerToken` only checked `payload.uid`.

Verified fix at `convex/integrations/bigseller/adapter.ts` lines 58-59:

```typescript
const uid = [payload.uid, payload.user_id, payload.sub, payload.id]
  .find((v): v is string => typeof v === "string");
```

Multi-key fallback covers the four most common JWT user-id claim names.

### Gap 3: Sync log expand removed from IntegrationHealthCard (AUTH-04)

**Status: CLOSED**

**Backend** (`convex/platformCredentials/queries.ts`):
- `SyncLogEntry` type exported at line 160
- `PlatformHealthStatus` has `syncHistory: SyncLogEntry[]` at line 185
- `getHealthStatusAll` populates `syncHistory` for `last_sync` platforms (k3mart, gobiz) via `ctx.db.query("externalSyncLogs").withIndex("by_source")...take(5)` at lines 213-275
- `always_green` and `token_expiry` platforms get `syncHistory: []`

**Frontend** (`src/components/salesAnalytics/IntegrationHealthCard.tsx`):
- `ChevronDown`/`ChevronUp` imported (lines 15-16)
- `isExpanded` state at line 123
- `hasSyncHistory = health.syncHistory.length > 0` at line 130
- Expand toggle visible only when `hasSyncHistory` (lines 211-219)
- Sync log renders at lines 226-230+ with `health.syncHistory.map()`

**SettingsTab** (`src/components/salesAnalytics/SettingsTab.tsx`):
- Passes full `health={health}` object at line 182 — `syncHistory` field propagates automatically

---

## Required Artifacts (All Plans)

| Artifact | Status | Details |
|----------|--------|---------|
| `convex/lib/jwt.ts` | VERIFIED | Exports `decodeJwtPayload`; used by `actions.ts` and `bigseller/adapter.ts` |
| `convex/integrations/registry.ts` | VERIFIED | 6 platform entries with `authStrategy`, `category`, `healthConfig`; `PLATFORM_IDS` exported |
| `convex/schema.ts` | VERIFIED | `externalSource` exported; 4 new tables (`grabfoodOrders`, `bigsellerOrders`, `consignmentOutlets`, `consignmentSettlements`); all 5 external tables use `externalSource` |
| `convex/platformCredentials/queries.ts` | VERIFIED | `getHealthStatusAll` requires manager/admin auth; returns `PlatformHealthStatus[]` with `syncHistory`; `SyncLogEntry` type exported |
| `convex/platformCredentials/mutations.ts` | VERIFIED | `saveDirectToken` as `internalMutation` with optional `tokenExpiresAt` |
| `convex/integrations/gobiz/adapter.ts` | VERIFIED | `loginWithCredentials` with flat body + error body surfacing (Plan 04 fix applied) |
| `convex/integrations/bigseller/adapter.ts` | VERIFIED | `previewBigSellerToken` with multi-key uid lookup (Plan 04 fix applied); `saveBigSellerToken` stores actual JWT `exp` |
| `convex/integrations/bigseller/config.ts` | VERIFIED | Exports `BIGSELLER_PLATFORM_ID`, `BIGSELLER_TOKEN_COOKIE_NAME`, `BIGSELLER_MAX_SYNC_DAYS` |
| `src/lib/formatters.ts` | VERIFIED | Exports `formatCountdown` and `formatRelativeTime` |
| `src/components/salesAnalytics/IntegrationHealthCard.tsx` | VERIFIED | Registry-driven; expand toggle + collapsible sync log (Plan 05 restore applied); uses `PlatformHealthStatus` prop |
| `src/components/salesAnalytics/SettingsTab.tsx` | VERIFIED | `getHealthStatusAll` wired; passes full `health` object to cards |
| `src/components/salesAnalytics/BigSellerTokenDialog.tsx` | VERIFIED | Paste -> preview -> confirm flow; `formatCountdown` for color display |
| `src/components/salesAnalytics/GoBizTokenDialog.tsx` | VERIFIED | One-click `loginWithCredentials`; manual paste as collapsible fallback |

---

## Key Links

| From | To | Via | Status |
|------|----|-----|--------|
| `gobiz/adapter.ts loginWithCredentials` | GoBiz API | flat JSON body with `email, password` at top-level (no `data` wrapper) | VERIFIED |
| `bigseller/adapter.ts previewBigSellerToken` | JWT payload | `.find()` across 4 claim keys | VERIFIED |
| `getHealthStatusAll` | `externalSyncLogs` | `withIndex("by_source").order("desc").take(5)` | VERIFIED |
| `IntegrationHealthCard` | `syncHistory[]` | `isExpanded` state + conditional render on `hasSyncHistory` | VERIFIED |
| `SettingsTab` | `IntegrationHealthCard` | `health={health}` full object pass-through at line 182 | VERIFIED |
| `getHealthStatusAll` | `registry.ts` | iterates `PLATFORM_IDS` | VERIFIED |
| `platformCredentials/queries.ts` | `requireRole` | `token: v.string()` arg, manager/admin check | VERIFIED |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AUTH-01 | 26-02, 26-04 | Admin can one-click refresh GoBiz token via password grant | SATISFIED | `loginWithCredentials` flat body fix in 26-04; `GoBizTokenDialog` one-click wired; error body surfaced; REQUIREMENTS.md marked Complete |
| AUTH-02 | 26-02, 26-03, 26-04 | Admin pastes BigSeller muc_token with expiry countdown and uid preview | SATISFIED | `previewBigSellerToken` multi-key uid fix in 26-04; JWT `exp` stored as `tokenExpiresAt`; `BigSellerTokenDialog` full preview flow; REQUIREMENTS.md marked Complete |
| AUTH-03 | 26-01 | GrabFood OAuth2 token resolves on-demand via `resolveToken()` | SATISFIED | `resolveToken()` in `grabfood/adapter.ts`; GrabFood in registry as `client_credentials`; lazy resolution on all GrabFood actions; REQUIREMENTS.md marked Complete |
| AUTH-04 | 26-01, 26-03, 26-05 | Unified credential health panel for all platforms | SATISFIED | Panel shows 6 platforms; K3Mart/GoBiz cards expand to show sync log (Plan 05 restore); auth-gated query; registry-driven rendering; REQUIREMENTS.md marked Complete |

**Note on AUTH-02 threshold deviation:** REQUIREMENTS.md specifies "dashboard warning when < 5 days remaining". Implementation follows CONTEXT.md locked thresholds: green >7d, yellow 3-7d, red <3d. More conservative than the < 5 day requirement; intentional per phase research.

---

## Build Verification

`npm run type-check` exits 0 — no TypeScript errors across all modified files.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `convex/integrations/gobiz/adapter.ts` | 186 | `return null` | Info | End of helper function — intentional null return, not a stub |
| `src/components/salesAnalytics/IntegrationHealthCard.tsx` | 100, 102 | `return null` | Info | `getActionLabel()` returns null for `session_auth`/`default` to suppress action button — intentional |
| `convex/platformCredentials/queries.ts` | 114 | `return null` | Info | Auth helper returns null on no session — intentional pattern |

No blocker or warning anti-patterns. No TODO/FIXME/HACK/PLACEHOLDER in any phase-created files.

---

## Human Verification Required

### 1. Six-Platform Health Panel Render

**Test:** Log in as admin, navigate to Sales Analytics > Settings tab
**Expected:** Six rows render: K3 Mart, GoBiz (GoFood), Internal Orders, GrabFood, BigSeller, Consignment — each with status dot, icon, name, status badge
**Why human:** Registry-driven query requires live Convex runtime

### 2. GoBiz One-Click Token Refresh (Post-Fix)

**Test:** In Settings > GoBiz row, click "Refresh Token" button
**Expected:** If `GOBIZ_EMAIL`/`GOBIZ_PASSWORD` configured: flat credential body sent, token saved, success toast. If not configured: error "GOBIZ_EMAIL and GOBIZ_PASSWORD env vars not configured." On API 400: actionable error message including GoBiz's response body
**Why human:** Requires live GoBiz API call and configured env vars

### 3. BigSeller Paste -> Preview -> Save (Post-Fix)

**Test:** In Settings > BigSeller row, click "Paste Token", paste a real muc_token JWT
**Expected:** Auto-preview fires showing days remaining (correct color) AND uid extracted from token; "Save Token" button enabled; on click stored successfully
**Why human:** Requires real JWT with actual user-id claim

### 4. Sync Log Expand (K3Mart or GoBiz)

**Test:** In Settings, click the ChevronDown expand toggle on the K3Mart or GoBiz card
**Expected:** Sync history section appears with up to 5 recent entries showing status icon, relative timestamp, record count; clicking again collapses
**Why human:** Requires live `externalSyncLogs` data in Convex

### 5. GrabFood Status Display

**Test:** Check GrabFood row status with and without credentials
**Expected:** "Connected" (green) when `email` populated; "Client credentials not configured" otherwise
**Why human:** Depends on database state

---

## Summary

Phase 26 achieved its goal. The three UAT gaps identified after initial verification have been fully closed in Plans 04 and 05.

**Gap closure results:**
- GoBiz `loginWithCredentials` now sends a flat credential body — the 400 error root cause is fixed
- BigSeller `previewBigSellerToken` uses a 4-key fallback for uid extraction
- `IntegrationHealthCard` restored with expand toggle and collapsible sync log; `PlatformHealthStatus` type now carries `syncHistory: SyncLogEntry[]` populated from `externalSyncLogs`

**No regressions detected.** `npm run type-check` passes clean. All 4 requirement IDs (AUTH-01 through AUTH-04) are SATISFIED with three-level verification (existence, substance, wiring). Both REQUIREMENTS.md checks and the requirements tracker table show Phase 26 Complete for all four IDs.

The schema foundation (4 new tables, `externalSource` union, 6-platform registry) required by Phases 27-30 remains intact and unaffected by the gap closure changes.

---

_Verified: 2026-02-25_
_Verifier: Claude (gsd-verifier)_
