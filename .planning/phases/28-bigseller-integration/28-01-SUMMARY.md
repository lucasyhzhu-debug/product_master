---
phase: 28-bigseller-integration
plan: 01
subsystem: api
tags: [bigseller, scheduler-chain, sync, marketplace, shopee, tiktok, revenue-bridge]

# Dependency graph
requires:
  - phase: 26-sales-analytics-integration
    provides: "Platform credentials, sync logs, health dashboard, externalRevenue bridge"
provides:
  - "BigSeller scheduler-chain sync backend (trigger -> poll -> fetch -> store -> bridge)"
  - "bigsellerOrders table population with SKU breakdowns and fee fields"
  - "Revenue bridge to externalRevenue with actual platform source (shopee/tiktok)"
  - "bigsellerSyncState reactive query for frontend sync progress"
  - "Unit tests for helpers and mutation mapping logic"
affects: [28-02-bigseller-frontend, 30-unified-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scheduler-chain pattern for async API polling (ctx.scheduler.runAfter)"
    - "Singleton sync state document for reactive progress tracking"
    - "Source-level revenue attribution (shopee/tiktok, not bigseller aggregator)"

key-files:
  created:
    - convex/integrations/bigseller/sync.ts
    - convex/integrations/bigseller/helpers.ts
    - convex/integrations/bigseller/queries.ts
    - convex/bigsellerOrders/mutations.ts
    - convex/bigsellerOrders/queries.ts
    - convex/integrations/bigseller/__tests__/helpers.test.ts
    - convex/bigsellerOrders/__tests__/mutations.test.ts
  modified:
    - convex/schema.ts
    - convex/integrations/bigseller/config.ts
    - src/components/salesAnalytics/ProductMappingCard.tsx
    - src/components/salesAnalytics/OverviewTab.tsx
    - src/hooks/convex/useExternalData.ts

key-decisions:
  - "externalSource union extended with shopee/tiktok (NOT added to registry -- these are revenue source labels, not integration platforms)"
  - "Sync state uses 'stage' field (not 'phase') to avoid confusion with GSD phase numbers"
  - "HTML auth failure detection at every API call point prevents silent crashes"
  - "Mutations test uses pure function mapping validation rather than full convex-test due to auth requirements"

patterns-established:
  - "Scheduler-chain: action schedules next step via ctx.scheduler.runAfter, enabling async multi-stage workflows"
  - "Singleton sync state: one document per sync process, upserted on each stage change, reactively queryable"
  - "Source attribution: BigSeller orders use actual platform (shopee/tiktok) as source, not aggregator name"

requirements-completed: [BS-01, BS-02]

# Metrics
duration: 12min
completed: 2026-02-27
---

# Phase 28 Plan 01: BigSeller Sync Backend Summary

**Scheduler-chain sync backend for BigSeller marketplace data: trigger -> poll -> fetch -> store with per-order SKU breakdowns, fee calculations, and actual-platform revenue attribution (shopee/tiktok)**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-27T13:33:33Z
- **Completed:** 2026-02-27T13:45:44Z
- **Tasks:** 4
- **Files modified:** 12

## Accomplishments
- Complete scheduler-chain sync lifecycle: startSync (admin) -> triggerSync -> pollSyncTask (60s, 8 max, auto-retry once) -> fetchOrders (paginated)
- BigSeller orders stored with full fee breakdown (commission, shipping, other) and per-order SKU lists
- Revenue bridge writes to externalRevenue using actual platform source (shopee/tiktok), not "bigseller"
- Reactive sync state tracking via bigsellerSyncState singleton for frontend progress display
- 25 unit tests covering HTML detection, request body validation, fee calculations, and dedup mapping

## Task Commits

1. **Task 1: Schema extension + sync state table + config** - `99edc3a` (feat)
2. **Task 2: Scheduler-chain sync action + helpers** - `e7c4e81` (feat)
3. **Task 3: BigSeller order mutations and queries** - `b4af414` (feat)
4. **Task 4: Unit tests for helpers and mutations** - `29a85cc` (test)
5. **Deviation fix: Source type unions** - `a4dc121` (fix)

## Files Created/Modified
- `convex/schema.ts` - Added bigsellerSyncState table, extended externalSource with shopee/tiktok
- `convex/integrations/bigseller/config.ts` - Added sync constants (API_BASE, MAX_POLLS, SHOP_IDS, PAGE_SIZE)
- `convex/integrations/bigseller/sync.ts` - Scheduler-chain: startSync, triggerSync, pollSyncTask, fetchOrders, updateSyncStage
- `convex/integrations/bigseller/helpers.ts` - Pure functions: buildBigSellerHeaders, buildPageListBody, detectHtmlResponse, mapOrderToRevenue, mapOrderToStorage, buildSyncTaskCreateBody
- `convex/integrations/bigseller/queries.ts` - getSyncState (auth-protected), getSyncStateInternal, getLastSuccessfulSyncDate, checkProductMapping
- `convex/bigsellerOrders/mutations.ts` - upsertOrders (dedup by platformOrderId), applyRetroactiveMapping
- `convex/bigsellerOrders/queries.ts` - listOrders (paginated, filtered), getUnmappedSkus, getOrderStats (COGS caveat flag)
- `convex/integrations/bigseller/__tests__/helpers.test.ts` - 21 tests for pure helper functions
- `convex/bigsellerOrders/__tests__/mutations.test.ts` - 4 tests for storage mapping validation
- `src/components/salesAnalytics/ProductMappingCard.tsx` - Extended source type union
- `src/components/salesAnalytics/OverviewTab.tsx` - Extended source type union
- `src/hooks/convex/useExternalData.ts` - Extended source type union

## Decisions Made
- Extended externalSource union but NOT registry -- shopee/tiktok are revenue source labels, not integration platforms. Adding them to registry would create phantom health cards with no token, no action, and always_green health.
- Used `stage` (not `phase`) for sync state field name to avoid confusion with GSD phase numbers.
- HTML auth failure detection at every API call point (triggerSync, pollSyncTask, fetchOrders) since token may expire mid-sync.
- Mutations test uses mapOrderToStorage validation rather than full convex-test integration test, because listOrders requires auth (requireRole) which needs session setup in convex-test. The dedup logic itself is straightforward (index lookup + patch vs insert).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed hardcoded source type unions in frontend**
- **Found during:** Overall verification (build check)
- **Issue:** Adding shopee/tiktok to externalSource in schema.ts widened the Convex-generated type, causing TS2322 errors in 3 frontend files that had hardcoded narrower source unions
- **Fix:** Extended source type unions in ProductMappingCard.tsx, OverviewTab.tsx, and useExternalData.ts to include shopee and tiktok
- **Files modified:** src/components/salesAnalytics/ProductMappingCard.tsx, src/components/salesAnalytics/OverviewTab.tsx, src/hooks/convex/useExternalData.ts
- **Verification:** npm run build passes with zero errors
- **Committed in:** a4dc121

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking)
**Impact on plan:** Essential for build to pass. The schema change to externalSource affected downstream TypeScript types that the plan did not anticipate.

## Issues Encountered
None beyond the deviation documented above.

## User Setup Required
None - no external service configuration required. BigSeller token must already be configured in platformCredentials (done in Phase 26).

## Next Phase Readiness
- Sync backend is complete and ready for frontend consumption (Plan 02)
- getSyncState query provides reactive sync progress for the frontend progress card
- listOrders, getUnmappedSkus, getOrderStats queries ready for BigSeller sync UI
- startSync action is the entry point for the frontend "Sync Now" button

---
*Phase: 28-bigseller-integration*
*Completed: 2026-02-27*

## Self-Check: PASSED
- All 7 created files verified on disk
- All 5 commits verified in git log
