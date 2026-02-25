---
phase: 26-platform-auth-schema
plan: "03"
subsystem: credential-health-ui
tags: [ui, auth, settings, registry-driven, gobiz, bigseller, grabfood, formatters]
dependency_graph:
  requires: [26-01, 26-02]
  provides: [IntegrationHealthCard-PlatformHealthStatus, SettingsTab-6platforms, BigSellerTokenDialog, GoBizTokenDialog-oneclick, formatCountdown-shared]
  affects: [src/components/salesAnalytics/IntegrationHealthCard.tsx, src/components/salesAnalytics/SettingsTab.tsx, src/components/salesAnalytics/GoBizTokenDialog.tsx, src/components/salesAnalytics/BigSellerTokenDialog.tsx, src/lib/formatters.ts, convex/_generated/api.d.ts]
tech_stack:
  added: []
  patterns: [registry-driven-ui, single-prop-component, shared-formatter-util, collapsible-fallback-section]
key_files:
  created:
    - src/lib/formatters.ts
    - src/components/salesAnalytics/BigSellerTokenDialog.tsx
  modified:
    - src/components/salesAnalytics/IntegrationHealthCard.tsx
    - src/components/salesAnalytics/SettingsTab.tsx
    - src/components/salesAnalytics/GoBizTokenDialog.tsx
    - convex/_generated/api.d.ts
    - docs/CHANGELOG.md
    - docs/SCHEMA.md
    - docs/API_REFERENCE.md
decisions:
  - "IntegrationHealthCard accepts single PlatformHealthStatus prop — all UI behavior derived from authStrategy and category fields (no platformId string comparisons)"
  - "SettingsTab uses api.platformCredentials.queries.getHealthStatusAll (not api.platformCredentials.getHealthStatusAll) — Convex path includes the module file"
  - "api.d.ts manually updated to include bigseller/adapter and bigseller/config — stale generated types from before Plan 02 bigseller files were added"
  - "BigSellerTokenDialog auto-previews on paste when input looks like a JWT (3 parts split by dot)"
  - "GoBizTokenDialog shows one-click refresh as primary button; manual paste JSON is collapsible fallback"
  - "formatCountdown takes daysRemaining (number | null) not ms — matches getHealthStatusAll return type"
metrics:
  duration_minutes: 15
  tasks_completed: 3
  files_modified: 8
  completed_date: "2026-02-25"
---

# Phase 26 Plan 03: Credential Health UI Summary

**One-liner:** Built registry-driven credential health panel showing all 6 platforms with authStrategy-driven action buttons, GoBiz one-click token refresh, and BigSeller JWT paste-preview-confirm flow.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extract formatCountdown + refactor IntegrationHealthCard + SettingsTab | ee8eaec | formatters.ts (created), IntegrationHealthCard.tsx, SettingsTab.tsx |
| 2 | GoBiz Refresh Token button + BigSeller paste dialog with JWT preview | daaed32 | GoBizTokenDialog.tsx, BigSellerTokenDialog.tsx (created) |
| Fix | Update api.d.ts + fix TypeScript strict mode errors | a5780aa | convex/_generated/api.d.ts, GoBizTokenDialog.tsx, SettingsTab.tsx |
| 3 | Documentation updates + final build verification | a183785 | CHANGELOG.md, SCHEMA.md, API_REFERENCE.md |

## Verification Results

- [x] `npm run type-check` passes with no errors
- [x] `npm run build` succeeds — 3427 modules transformed, built in ~22s
- [x] `IntegrationHealthCard` accepts single `PlatformHealthStatus` prop (no dual syncHealth+credentialStatus)
- [x] No `platformId === "..."` string comparisons in IntegrationHealthCard
- [x] SettingsTab loops over `getHealthStatusAll` results with auth token
- [x] All 6 platforms rendered via registry loop (not hardcoded blocks)
- [x] `BigSellerTokenDialog` exists and imported by SettingsTab
- [x] `loginWithCredentials` exported from `convex/integrations/gobiz/adapter.ts`
- [x] `saveDirectToken` is `internalMutation`
- [x] `formatCountdown` imported from `src/lib/formatters.ts` in all 3 consumer components
- [x] CHANGELOG.md has v1.4.0 Phase 26 entry
- [x] SCHEMA.md documents 4 new tables
- [x] API_REFERENCE.md documents `getHealthStatusAll` + BigSeller + GoBiz actions

## Key Artifacts

### src/lib/formatters.ts
Shared formatter utilities. Exports `formatCountdown(daysRemaining: number | null): string` and `formatRelativeTime(timestamp: number): string`. Used by IntegrationHealthCard, GoBizTokenDialog, BigSellerTokenDialog.

### src/components/salesAnalytics/IntegrationHealthCard.tsx
Registry-driven platform health row. New interface:
- `health: PlatformHealthStatus` — single prop (replaces old syncHealth + credentialStatus dual-prop pattern)
- `onAction?: () => void` — primary action callback
- `isAdmin?: boolean` — controls action button visibility

Derives all UI behavior from `health.authStrategy` (button label/icon) and `health.category` (icon selection). Shows expiry countdown badge for platforms where `health.hasExpiry === true`.

### src/components/salesAnalytics/SettingsTab.tsx
Updated to:
- Consume `api.platformCredentials.queries.getHealthStatusAll` with auth token
- Loop over returned `PlatformHealthStatus[]` — no more hardcoded k3mart/gobiz/internal blocks
- Dispatch actions via `handleAction(_platformId, authStrategy)` — switch on authStrategy
- Open `BigSellerTokenDialog` for `paste_token` strategy
- Pass `reconnectSteps` from registry data to BigSellerTokenDialog

### src/components/salesAnalytics/BigSellerTokenDialog.tsx
New component. Paste → JWT decode preview → confirm save flow:
1. Textarea for muc_token paste
2. Auto-preview fires when input looks like JWT (3 dot-separated parts)
3. Shows expiry date + countdown with green/yellow/red colors (>7d, 3-7d, <3d)
4. "Save Token" enabled only after successful preview
5. Collapsible instructions section driven by `reconnectSteps` from registry (no hardcoded help text)

### src/components/salesAnalytics/GoBizTokenDialog.tsx
Updated interface: now accepts `authToken: string` instead of `hasExistingToken/tokenExpiresIn/hasRefreshToken` props.
- Primary: "Refresh Token (One-Click)" button wired to `loginWithCredentials` action
- Fallback: manual JSON paste section is collapsible
- Graceful env var error message when GOBIZ_EMAIL/GOBIZ_PASSWORD not configured

### convex/_generated/api.d.ts
Updated to include:
- `integrations/bigseller/adapter` import and module entry
- `integrations/bigseller/config` import and module entry

This fixes TypeScript type errors for `api.integrations.bigseller.adapter.previewBigSellerToken` and `saveBigSellerToken` in BigSellerTokenDialog.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] api.d.ts missing bigseller module entries**
- **Found during:** Task 3 full build verification
- **Issue:** `api.d.ts` was generated before Plan 02 added bigseller adapter files — TypeScript build (`tsc -b`) failed with "Property 'bigseller' does not exist"
- **Fix:** Manually added `integrations/bigseller/adapter` and `integrations/bigseller/config` import + module entries to `api.d.ts`
- **Files modified:** `convex/_generated/api.d.ts`
- **Commit:** a5780aa

**2. [Rule 1 - Bug] Wrong Convex API path — missing query module segment**
- **Found during:** Task 3 full build verification
- **Issue:** Used `api.platformCredentials.getHealthStatusAll` and `api.platformCredentials.getCredentialStatus` but the correct Convex path includes the module file: `api.platformCredentials.queries.getHealthStatusAll`
- **Fix:** Updated both usages in SettingsTab and GoBizTokenDialog
- **Files modified:** `SettingsTab.tsx`, `GoBizTokenDialog.tsx`
- **Commit:** a5780aa

**3. [Rule 2 - Missing type annotation] Implicit `any` in healthData map/find**
- **Found during:** Task 3 full build verification (tsc -b is stricter than tsc --noEmit)
- **Issue:** `healthData` from `useQuery(api.platformCredentials.queries.getHealthStatusAll, ...)` inferred as `any` by TypeScript strict project build
- **Fix:** Added `PlatformHealthStatus` type import; added type cast `(healthData as PlatformHealthStatus[]).map(...)` and for bigsellerHealth find
- **Files modified:** `SettingsTab.tsx`
- **Commit:** a5780aa

## Self-Check

### Files Exist
- [x] `src/lib/formatters.ts` — FOUND (created)
- [x] `src/components/salesAnalytics/IntegrationHealthCard.tsx` — modified
- [x] `src/components/salesAnalytics/SettingsTab.tsx` — modified
- [x] `src/components/salesAnalytics/GoBizTokenDialog.tsx` — modified
- [x] `src/components/salesAnalytics/BigSellerTokenDialog.tsx` — FOUND (created)
- [x] `convex/_generated/api.d.ts` — modified (bigseller entries added)
- [x] `docs/CHANGELOG.md` — modified
- [x] `docs/SCHEMA.md` — modified
- [x] `docs/API_REFERENCE.md` — modified

### Commits Exist
- [x] ee8eaec — feat(26-03): extract formatCountdown + refactor IntegrationHealthCard + SettingsTab
- [x] daaed32 — feat(26-03): GoBiz Refresh Token button + BigSeller paste dialog with JWT preview
- [x] a5780aa — fix(26-03): update api.d.ts + fix TypeScript strict mode errors
- [x] a183785 — docs(26-03): update CHANGELOG + SCHEMA + API_REFERENCE for Phase 26

## Self-Check: PASSED
