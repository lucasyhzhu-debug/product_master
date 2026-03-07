---
phase: quick-31
plan: 01
subsystem: ui
tags: [react, salesAnalytics, cleanup, dead-code]

# Dependency graph
requires:
  - phase: 38-frontend-giant-file-splits
    provides: OverviewTab.tsx (split from SalesAnalytics monolith)
provides:
  - Leaner OverviewTab without RevenueTable card (283 -> 179 LOC)
  - 7 orphaned component files deleted (608 LOC removed)
  - Clean overviewUtils.ts without dead types
  - Updated E2E tests with no stale Sales Details references
affects: [salesAnalytics, e2e-tests]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/components/salesAnalytics/OverviewTab.tsx
    - src/components/salesAnalytics/overviewUtils.ts
    - tests/e2e/sales-analytics-overview.spec.ts
    - tests/e2e/sales-analytics-period.spec.ts

key-decisions:
  - "Removed useExternalRevenue query entirely -- eliminates potentially unbounded Convex scan for individual revenue records"
  - "Deleted US-11 E2E test entirely rather than leaving as always-pass (anti-pattern per Phase 39 lessons)"

patterns-established: []

requirements-completed: [QT-31]

# Metrics
duration: 5min
completed: 2026-03-07
---

# Quick Task 31: Remove Sales Details Table Summary

**Deleted RevenueTable card + 7 orphaned components from Sales Analytics OverviewTab, eliminating 608 LOC of dead code and an unbounded Convex query**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-07T03:31:21Z
- **Completed:** 2026-03-07T03:35:56Z
- **Tasks:** 2
- **Files modified:** 4 (+ 7 deleted)

## Accomplishments
- Deleted 7 orphaned component files (RevenueTable, RevenueItemDetails, InternalOrderDetails, StoreGroupHeader, PlatformBadge, ConfidenceBadge, MatchStatusBadge) -- 608 LOC removed
- Cleaned OverviewTab.tsx from 283 to 179 LOC (37% reduction) by removing all Revenue Table card code, dead imports, unused state, and dead hooks (useMemo, useEffect, useNavigate)
- Cleaned overviewUtils.ts by removing 4 dead exports (RevenueRecord, ConfidenceLevel, MatchConfidence, SOURCE_DISPLAY_NAMES)
- Updated 2 E2E test files: removed all references to deleted Sales Details card, deleted US-11 test entirely

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete orphaned components and clean OverviewTab + overviewUtils** - `e769b4f` (refactor)
2. **Task 2: Update E2E tests to remove Sales Details references** - `241b53a` (test)

## Files Created/Modified
- `src/components/salesAnalytics/OverviewTab.tsx` - Removed Revenue Table card, dead imports/state/hooks (283 -> 179 LOC)
- `src/components/salesAnalytics/overviewUtils.ts` - Removed 4 dead type/constant exports
- `src/components/salesAnalytics/RevenueTable.tsx` - DELETED
- `src/components/salesAnalytics/RevenueItemDetails.tsx` - DELETED
- `src/components/salesAnalytics/InternalOrderDetails.tsx` - DELETED
- `src/components/salesAnalytics/StoreGroupHeader.tsx` - DELETED
- `src/components/salesAnalytics/PlatformBadge.tsx` - DELETED
- `src/components/salesAnalytics/ConfidenceBadge.tsx` - DELETED
- `src/components/salesAnalytics/MatchStatusBadge.tsx` - DELETED
- `tests/e2e/sales-analytics-overview.spec.ts` - US-7 rewritten, US-8/US-10 trimmed, US-11 deleted
- `tests/e2e/sales-analytics-period.spec.ts` - Removed revenue table column/empty-state checks

## Decisions Made
- Removed `useExternalRevenue` hook call entirely from OverviewTab -- this was fetching potentially thousands of individual revenue records for the table. The chart, hero cards, and channel summary already provide sufficient analytics coverage.
- Deleted US-11 E2E test entirely rather than leaving it as an always-pass test. Per Phase 39 lessons, `expect(true).toBe(true)` anti-pattern should be eliminated.
- Also removed unused `CardTitle` import (caught by TypeScript during build verification -- Rule 1 auto-fix).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused CardTitle import**
- **Found during:** Task 1 (build verification)
- **Issue:** `CardTitle` was only used by the deleted Revenue Table card header. TypeScript flagged TS6133.
- **Fix:** Removed `CardTitle` from the import statement.
- **Files modified:** src/components/salesAnalytics/OverviewTab.tsx
- **Verification:** `npm run build` passes cleanly
- **Committed in:** e769b4f (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial fix for an unused import not listed in plan. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Sales Analytics Overview page is leaner and faster (one fewer Convex query)
- All remaining components (HeroCards, ChannelSummary, SalesChart, PlatformHierarchy, LifetimeHero) unchanged and fully functional

---
*Quick Task: 31*
*Completed: 2026-03-07*
