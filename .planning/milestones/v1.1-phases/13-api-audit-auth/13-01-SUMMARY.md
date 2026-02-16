---
phase: 13-api-audit-auth
plan: 01
subsystem: api
tags: [gobiz, multi-merchant, token-refresh, sync-health, cron]

# Dependency graph
requires: []
provides:
  - Multi-merchant GoBiz journal fetch (Crystal + Goldfinch)
  - Automated token refresh cron (30-min interval)
  - Sync health status queries with 6-hour staleness detection
  - seedGoBizOutlets mutation for initial outlet registration
  - getSyncHealthAlert query for dashboard banner
  - getCredentialStatusForManagers query for manager-level health view
affects: [13-02, 13-03, 13-04, 13-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Outlet map pattern: build merchantId->outletId map before sync loop for revenue attribution"
    - "Standalone token refresh cron decoupled from revenue sync"

key-files:
  created: []
  modified:
    - convex/integrations/gobiz/config.ts
    - convex/integrations/gobiz/adapter.ts
    - convex/integrations/gobiz/helpers.ts
    - convex/crons.ts
    - convex/externalData/queries.ts
    - convex/platformCredentials/queries.ts

key-decisions:
  - "Use getCredentialsInternal instead of getTokenInternal for full token resolution (fix pre-existing bug where refreshToken was always null)"
  - "Outlet map built once per sync run, not per transaction -- avoids N+1 queries"
  - "Revenue saved without outletId when merchant has no registered outlet (warning logged, not error)"

patterns-established:
  - "Multi-merchant config: merchantIds array with merchantNames lookup map"
  - "Standalone cron actions: separate token refresh from business logic sync"

# Metrics
duration: 6min
completed: 2026-02-15
---

# Phase 13 Plan 01: Backend GoBiz Enhancements Summary

**Multi-merchant GoBiz sync for Crystal + Goldfinch outlets, 30-min token auto-refresh cron, and sync health monitoring queries with 6-hour staleness detection**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-15T10:35:09Z
- **Completed:** 2026-02-15T10:41:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- GoBiz journal fetch now queries both Crystal (G347061572) and Goldfinch (G293156297) merchants in a single API call
- Token auto-refresh runs every 30 minutes via dedicated cron, independent of revenue sync schedule
- Sync health status API detects 6+ hour failures per platform with staleness flags
- Revenue records attributed to correct outlet via merchantId->outletId mapping
- Managers can view credential health without seeing token details

## Task Commits

Each task was committed atomically:

1. **Task 1: Multi-merchant GoBiz sync + token auto-refresh cron** - `215f7d5` (feat)
2. **Task 2: Sync health status queries and enhanced credential status** - `b5e8a9d` (feat)
3. **Build fix: seedGoBizOutlets missing required fields** - `1f00db4` (fix)

## Files Created/Modified
- `convex/integrations/gobiz/config.ts` - Added merchantIds array, merchantNames map, GOBIZ_OUTLET_SEED
- `convex/integrations/gobiz/adapter.ts` - Multi-merchant fetch, outlet attribution, autoRefreshGoBizToken, seedGoBizOutlets
- `convex/integrations/gobiz/helpers.ts` - buildJournalSearchBody accepts merchantIds array, getMerchantName helper, merchantId in JournalMetrics
- `convex/crons.ts` - Added 30-minute gobiz token refresh cron
- `convex/externalData/queries.ts` - getSyncHealthStatus and getSyncHealthAlert queries
- `convex/platformCredentials/queries.ts` - tokenExpiresIn field, getCredentialStatusForManagers query

## Decisions Made
- Used `getCredentialsInternal` instead of `getTokenInternal` in `resolveGoBizToken` -- the old query only returned `currentToken`, causing `refreshToken` to always be null (pre-existing bug)
- Outlet map built once per sync run to avoid N+1 queries on externalOutlets
- Revenue saved without outletId when merchant has no registered outlet (warning logged, graceful degradation)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed resolveGoBizToken using wrong internal query**
- **Found during:** Task 1
- **Issue:** `resolveGoBizToken` used `getTokenInternal` which only returns `{ currentToken }`, so `refreshToken` was always null from DB
- **Fix:** Changed to `getCredentialsInternal` which returns the full credential record including `refreshToken`
- **Files modified:** convex/integrations/gobiz/adapter.ts
- **Verification:** Type check passes, refreshToken now resolves correctly
- **Committed in:** 215f7d5

**2. [Rule 1 - Bug] Added missing createdBy/createdAt to seedGoBizOutlets**
- **Found during:** Build verification
- **Issue:** `externalOutlets` schema requires `createdBy` and `createdAt` fields but seed mutation didn't provide them
- **Fix:** Added `createdBy: "system:seed"` and `createdAt: Date.now()` to the insert call
- **Files modified:** convex/integrations/gobiz/adapter.ts
- **Verification:** `npm run build` passes
- **Committed in:** 1f00db4

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
After deployment, run `seedGoBizOutlets` from Convex dashboard Functions tab to register both Crystal and Goldfinch outlets before the first multi-merchant sync.

## Next Phase Readiness
- Backend APIs ready for frontend plans (13-03 settings panel, 13-04 sync health dashboard)
- Sync health queries provide data for dashboard banner and monitoring UI
- Token refresh cron ensures token stays alive for unattended operation

---
*Phase: 13-api-audit-auth*
*Completed: 2026-02-15*
