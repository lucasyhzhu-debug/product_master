---
phase: 26-platform-auth-schema
plan: "02"
subsystem: platform-auth-actions
tags: [auth, gobiz, bigseller, password-grant, jwt-decode, internal-mutation]
dependency_graph:
  requires: [26-01]
  provides: [loginWithCredentials-action, previewBigSellerToken-action, saveBigSellerToken-action, saveDirectToken-internalMutation]
  affects: [convex/platformCredentials/mutations.ts, convex/integrations/gobiz/adapter.ts, convex/integrations/bigseller/adapter.ts, convex/integrations/bigseller/config.ts]
tech_stack:
  added: []
  patterns: [internalMutation-from-action, jwt-decode-preview, graceful-env-var-fallback]
key_files:
  created:
    - convex/integrations/bigseller/adapter.ts
    - convex/integrations/bigseller/config.ts
  modified:
    - convex/platformCredentials/mutations.ts
    - convex/integrations/gobiz/adapter.ts
    - src/components/salesAnalytics/GoBizTokenDialog.tsx
    - convex/externalData/queries.ts
    - src/components/salesAnalytics/OverviewTab.tsx
    - src/components/salesAnalytics/ProductMappingCard.tsx
    - src/hooks/convex/useExternalData.ts
decisions:
  - "saveDirectToken converted to internalMutation — actions call via internal.* path; public wrapper saveDirectTokenPublic added for frontend callers"
  - "saveDirectToken uses updatedBy: 'system' for internal callers that lack user context"
  - "GoBiz loginWithCredentials wraps Bearer prefix around raw access_token from password grant"
  - "BigSeller muc_token stored as currentToken (not refreshToken) — it is the primary access credential"
  - "externalData/queries.ts imports shared externalSource from schema.ts instead of local 3-literal union"
metrics:
  duration_minutes: 8
  tasks_completed: 3
  files_modified: 9
  completed_date: "2026-02-25"
---

# Phase 26 Plan 02: Platform Auth Actions Summary

**One-liner:** Converted saveDirectToken to internalMutation with optional tokenExpiresAt, implemented GoBiz password grant action, and created BigSeller JWT decode-preview + save flow with actual expiry tracking.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Convert saveDirectToken to internalMutation + add tokenExpiresAt param | 14b9fb3 | convex/platformCredentials/mutations.ts, GoBizTokenDialog.tsx, 2 test files |
| 2 | GoBiz loginWithCredentials password grant action | 699363c | convex/integrations/gobiz/adapter.ts |
| 3 | BigSeller paste-token flow with JWT decode preview | 4caef7a | convex/integrations/bigseller/adapter.ts (created), config.ts (created) |

## Verification Results

- [x] `npm run type-check` passes with no errors
- [x] `npm run build` passes — full tsc + vite build clean
- [x] `saveDirectToken` is `internalMutation` with optional `tokenExpiresAt` param
- [x] `saveDirectTokenPublic` wrapper exists for frontend/admin callers (requires `token: v.string()`)
- [x] `GoBizTokenDialog.tsx` updated to use `saveDirectTokenPublic`
- [x] `loginWithCredentials` action in gobiz/adapter.ts calls `internal.platformCredentials.mutations.saveDirectToken`
- [x] `previewBigSellerToken` returns `expiresAt + daysRemaining + uid` preview
- [x] `saveBigSellerToken` stores `muc_token` as `currentToken` with actual `tokenExpiresAt` from JWT exp
- [x] Both BigSeller actions import `decodeJwtPayload` from `convex/lib/jwt.ts` (Plan 01 shared util)
- [x] GoBiz env var fallback returns `{ success: false, error: "...not configured..." }` when missing
- [x] No breaking changes to existing gobiz adapter sync functionality

## Key Artifacts

### convex/platformCredentials/mutations.ts

- `saveDirectToken`: `internalMutation` — called by GoBiz and BigSeller actions via `internal.*` path. Accepts optional `tokenExpiresAt` (uses actual value when provided, falls back to 6h estimate). Uses `updatedBy: "system"` since no user context available.
- `saveDirectTokenPublic`: `mutation` — thin wrapper for frontend callers that performs admin auth check then delegates same logic.

### convex/integrations/gobiz/adapter.ts

New exported `loginWithCredentials` action:
- Validates admin via `validateAdminToken` internal query
- Reads `GOBIZ_EMAIL` + `GOBIZ_PASSWORD` env vars; returns graceful error if absent
- POSTs to `https://api.gobiz.co.id/goid/token` with `client_id: "go-biz-web-new"` + `grant_type: "password"`
- Saves `Bearer {access_token}` + `refresh_token` via `internal.platformCredentials.mutations.saveDirectToken`

### convex/integrations/bigseller/config.ts

Constants: `BIGSELLER_PLATFORM_ID`, `BIGSELLER_TOKEN_COOKIE_NAME`, `BIGSELLER_MAX_SYNC_DAYS`.

### convex/integrations/bigseller/adapter.ts

Two public actions:
- `previewBigSellerToken`: Decodes JWT, returns `{ expiresAt, daysRemaining, uid }` preview without saving
- `saveBigSellerToken`: Decodes JWT exp, saves `muc_token` as `currentToken` with actual `tokenExpiresAt`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] saveDirectToken missing updatedBy field**
- **Found during:** Task 1 implementation
- **Issue:** `saveDirectToken` as `internalMutation` has no user context, but `platformCredentials` schema requires `updatedBy: v.string()` — build failed
- **Fix:** Added `updatedBy: "system"` for internal callers
- **Files modified:** `convex/platformCredentials/mutations.ts`
- **Commit:** f0f9a32

**2. [Rule 1 - Bug] externalData/queries.ts sourceValidator had stale 3-literal union**
- **Found during:** Final build verification
- **Issue:** Plan 01 expanded `externalSource` to 6 literals but `convex/externalData/queries.ts` still had local `v.union(v.literal("k3mart"), v.literal("gobiz"), v.literal("internal"))`. This caused generated API types to be narrow, breaking frontend TypeScript.
- **Fix:** Replaced local `sourceValidator` with `import { externalSource } from "../schema"` — uses the shared validator
- **Files modified:** `convex/externalData/queries.ts`
- **Commit:** f0f9a32

**3. [Rule 1 - Bug] Frontend local source type definitions had stale 3-literal union**
- **Found during:** Final build verification (cascading from deviation 2)
- **Issue:** `OverviewTab.tsx` (RevenueRecord, PlatformBadge), `ProductMappingCard.tsx` (ProductMapping), and `useExternalData.ts` (useCountMappingImpact) all had `"k3mart" | "gobiz" | "internal"` hardcoded — incompatible with expanded backend types
- **Fix:** Updated all 3 files to use full 6-literal union; added GrabFood/BigSeller/Consignment badges to PlatformBadge component
- **Files modified:** `OverviewTab.tsx`, `ProductMappingCard.tsx`, `useExternalData.ts`
- **Commit:** f0f9a32

## Self-Check

### Files Exist

- [x] `convex/integrations/bigseller/adapter.ts` — FOUND (created)
- [x] `convex/integrations/bigseller/config.ts` — FOUND (created)
- [x] `convex/platformCredentials/mutations.ts` — modified (saveDirectToken is now internalMutation)
- [x] `convex/integrations/gobiz/adapter.ts` — modified (loginWithCredentials added)

### Commits Exist

- [x] 14b9fb3 — feat(26-02): convert saveDirectToken to internalMutation + add tokenExpiresAt param
- [x] 699363c — feat(26-02): GoBiz loginWithCredentials password grant action
- [x] 4caef7a — feat(26-02): BigSeller paste-token flow with JWT decode preview
- [x] f0f9a32 — fix(26-02): update externalSource types in frontend after Plan 01 schema expansion

## Self-Check: PASSED
