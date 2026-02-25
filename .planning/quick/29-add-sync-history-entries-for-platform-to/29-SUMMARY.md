---
quick_task: 29
title: "Add sync history entries for platform token refreshes"
completed: "2026-02-25"
duration_min: 12
tasks_completed: 2
commits: ["64fb6e9", "945f776"]
files_modified:
  - convex/schema.ts
  - convex/externalData/mutations.ts
  - convex/platformCredentials/actions.ts
  - convex/integrations/gobiz/adapter.ts
  - convex/integrations/bigseller/adapter.ts
  - convex/platformCredentials/queries.ts
  - src/components/salesAnalytics/IntegrationHealthCard.tsx
tags: [platform-auth, sync-history, token-refresh, ui]
---

# Quick Task 29: Add sync history entries for platform token refreshes

## One-liner

Token refresh operations for K3Mart, GoBiz, and BigSeller now create externalSyncLogs entries with syncType "token_refresh", visible in the platform cards' sync history with a blue "Token" badge distinct from the gray "Sync" badge for data syncs.

## What Was Done

### Task 1: Schema + Backend
- Added `v.literal("token_refresh")` to `externalSyncLogs.syncType` union in `convex/schema.ts`
- Updated `createSyncLog` internalMutation args to accept the new `token_refresh` syncType
- Extended `sourceValidator` in `convex/externalData/mutations.ts` to use the shared `externalSource` from schema.ts (previously was a narrow 3-literal union; now correctly includes bigseller, grabfood, consignment)
- K3Mart `performK3MartRefresh` in `convex/platformCredentials/actions.ts` now creates a sync log on both success and error after the `updateToken` call
- GoBiz `loginWithCredentials` in `convex/integrations/gobiz/adapter.ts` creates sync logs on: refresh_token grant success, password grant success, no-credentials error, password grant failure, and caught exceptions
- BigSeller `saveBigSellerToken` in `convex/integrations/bigseller/adapter.ts` creates a sync log on successful token paste

### Task 2: Query + UI
- Updated `SyncLogEntry` type in `convex/platformCredentials/queries.ts` to include `"token_refresh"` in the syncType union
- `getHealthStatusAll` now fetches the last 5 sync logs for `always_green` platforms (GrabFood) when credentials are configured
- `getHealthStatusAll` now fetches the last 5 sync logs for `token_expiry` platforms (BigSeller) when a token is configured; wrapped in try/catch to handle any future platforms not in the index
- `src/components/salesAnalytics/IntegrationHealthCard.tsx` renders a blue "Token" badge (`bg-blue-100 text-blue-700`) for `token_refresh` entries and a gray "Sync" badge for `manual`/`cron` entries
- `productsCount` display is suppressed for `token_refresh` entries (always undefined)

## Decisions Made

- **BigSeller source in validator:** `bigseller` is already in the shared `externalSource` validator in schema.ts, so BigSeller token paste events CAN be logged to `externalSyncLogs`. The note in the plan about skipping bigseller was precautionary — no skip needed.
- **sourceValidator expansion:** Rather than just adding `token_refresh` to the syncType, also fixed the narrow `sourceValidator` in `externalData/mutations.ts` which was hardcoded to 3 literals (k3mart, gobiz, internal) — it now uses the shared `externalSource` from schema.ts. This is a correctness fix: BigSeller's `createSyncLog` call would have failed with the old narrow validator.
- **Sync history for all platform types:** GrabFood (always_green) gets sync history only when credentials exist; BigSeller (token_expiry) gets sync history only when a token is configured. Internal and Consignment (no external credentials) continue to have empty sync history.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] sourceValidator in externalData/mutations.ts was too narrow**
- **Found during:** Task 1
- **Issue:** The local `sourceValidator` in `externalData/mutations.ts` only included `k3mart`, `gobiz`, `internal`. Adding a BigSeller sync log call would have caused a TypeScript/Convex validator error since "bigseller" was not in the validator.
- **Fix:** Replaced the hardcoded 3-literal union with the shared `externalSource` import from schema.ts. This is the correct pattern (matches how `externalData/queries.ts` was fixed in Phase 26-02).
- **Files modified:** `convex/externalData/mutations.ts`
- **Commit:** 64fb6e9

## Self-Check: PASSED

- All 7 modified files exist on disk
- Commits 64fb6e9 and 945f776 verified in git log
- `npx tsc --noEmit` — no errors
- `npm run build` — 3427 modules, built in 24.91s, no errors
