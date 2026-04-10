---
phase: 20-optimize-convex-query-reads
plan: 03
subsystem: api
tags: [convex, revenue, query-optimization, bandwidth, react-hooks]

# Dependency graph
requires:
  - phase: 20-02
    provides: "getDashboardSummaryByPeriod converted to internalQuery+action; periodPreset pattern established"
provides:
  - "useConvexExternalRevenue always bounded (default 90 days) — prevents full table scan on getRevenue"
  - "OverviewTab passes real period bounds from selectedPeriod+summary to revenue query"
  - "getRevenue uses by_source_period index instead of unbounded by_period scan"
affects: [Sales Analytics, SalesAnalytics.tsx, OverviewTab, revenue table, bandwidth]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hook-level default bounds: React hooks apply a sensible time default (90 days) when callers pass no explicit period, preventing accidental full table scans"
    - "Summary-driven period bounds: OverviewTab derives revenuePeriodBounds from the already-fetched summary.currentPeriod when available, sharing period computation"

key-files:
  created: []
  modified:
    - src/hooks/convex/useExternalData.ts
    - src/components/salesAnalytics/OverviewTab.tsx

key-decisions:
  - "useConvexExternalRevenue defaults to last 90 days (not allTime) when no periodStart provided — single line of defense against unbounded scans regardless of call site"
  - "OverviewTab uses summary.currentPeriod.periodStart/End (already fetched) for bounds — avoids importing convex/lib/periodRange.ts into src/ (tsconfig.app.json include: src only)"
  - "allTime preset passes Date.UTC(2020, 0, 1) explicitly so getRevenue always hits an indexed path, not the unbounded by_period scan"
  - "revenuePeriodBounds falls back to undefined (hook default) while summary is loading — no double-loading issue"

patterns-established:
  - "Hook-level default bounds: add effectivePeriodStart = periodStart ?? (Date.now() - 90d) in hooks to make all callers safe by default"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-02-22
---

# Phase 20 Plan 03: Bound getRevenue Query to Selected Period Summary

**useConvexExternalRevenue now defaults to last 90 days, and OverviewTab passes real period bounds from selectedPeriod to eliminate the 80 MB unbounded getRevenue full table scan**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-22T00:00:00Z
- **Completed:** 2026-02-22
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Added 90-day default bound in `useConvexExternalRevenue` — all callers now safe even without explicit period args
- OverviewTab computes `revenuePeriodBounds` from `selectedPeriod` and `summary.currentPeriod`, passing real start/end to the revenue query
- allTime preset explicitly passes `Date.UTC(2020, 0, 1)` so `getRevenue` hits the `by_source_period` index instead of the unbounded `by_period` scan
- `npm run type-check` and `npm run build` both pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Pass period bounds from OverviewTab to useConvexExternalRevenue** - `be71d17` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/hooks/convex/useExternalData.ts` - Added 90-day default bound in useConvexExternalRevenue; effectivePeriodStart prevents callers from triggering unbounded scans
- `src/components/salesAnalytics/OverviewTab.tsx` - Added useMemo import; added revenuePeriodBounds computed from selectedPeriod + summary.currentPeriod; passes periodStart/periodEnd to useConvexExternalRevenue

## Decisions Made
- **Import path constraint:** `convex/lib/periodRange.ts` is not in `tsconfig.app.json` include scope (`"include": ["src"]`), so we cannot import `calculatePeriodRange` from OverviewTab. Instead, we reuse `summary.currentPeriod` (already fetched) for bounds when available, and fall through to the hook's 90-day default while loading.
- **allTime explicit start:** Rather than passing undefined for allTime and triggering the 90-day default (which would incorrectly truncate all-time data), we explicitly pass `Date.UTC(2020, 0, 1)` as the start. This maintains correct data display while still using the indexed path.
- **Hook-level default vs caller:** Adding the default in the hook ensures any future callers that forget to pass bounds are still protected, not just OverviewTab.

## Deviations from Plan

None - plan executed exactly as written. The plan's recommended approach (default bound in hook + pass real bounds from caller) was implemented as described.

## Issues Encountered
None - type check and build passed on first attempt.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- getRevenue now always bounded — expected 70-90% bandwidth reduction (~80 MB savings)
- Post-deploy verification: check Convex dashboard for getRevenue bandwidth drop after deploying
- Ready for plan 20-04 (next bandwidth target)

---
*Phase: 20-optimize-convex-query-reads*
*Completed: 2026-02-22*
