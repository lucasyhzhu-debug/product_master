---
phase: 24-ingredient-simulation-id-linking
plan: 05
subsystem: ui
tags: [dispatch-planner, date-grid, mutation-fix, react]

# Dependency graph
requires:
  - phase: 24-ingredient-simulation-id-linking
    provides: DispatchPlanner page and savePlanCell mutation
provides:
  - "Direct-manual cell save fix: outletId sentinel stripped before mutation call"
  - "Cells save only on Enter key, blur reverts unsaved changes"
  - "Page renamed Planner everywhere (nav, header, hub)"
  - "Yesterday-anchored 7-day grid: today always second column"
  - "Save to Kitchen buttons inside grid header row per date column"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sentinel string detection before mutation: strip display-only values before passing to Convex validators"
    - "renderColumnAction prop pattern: PlannerGrid accepts ReactNode factory per date column"
    - "Blur-to-revert: editable cell reverts on focus loss, saves only on Enter"

key-files:
  created: []
  modified:
    - convex/dispatchPlanner/mutations.ts
    - src/pages/DispatchPlanner.tsx
    - src/components/dispatchPlanner/PlannerCell.tsx
    - src/components/dispatchPlanner/PlannerGrid.tsx
    - src/components/dispatchPlanner/WeekNav.tsx
    - src/components/layout/Header.tsx
    - src/pages/HubPage.tsx

key-decisions:
  - "direct-manual sentinel stripped in handleSaveCell (frontend) not mutation — keeps mutation handler clean and reusable"
  - "getYesterday() exported from DispatchPlanner.tsx so WeekNav imports it — single source of truth for the anchor date"
  - "renderColumnAction prop pattern on PlannerGrid — loose coupling, grid stays unaware of Save to Kitchen semantics"
  - "PlannerCell blur now reverts (not saves) — explicit Enter-only saves prevent accidental data loss on tab-out"

patterns-established:
  - "Sentinel strip pattern: detect non-ID string sentinels at call site, coerce to undefined before Convex mutation"
  - "Yesterday-anchor: startDate initializer and isCurrentWeek both use getYesterday() for consistent anchor"

requirements-completed: []

# Metrics
duration: 4min
completed: 2026-02-23
---

# Phase 24 Plan 05: Planner Grid UX Fix Summary

**Fixed 6 UAT-identified bugs: direct-manual save error, blur auto-save, page naming, Monday-anchored grid, and misplaced Save-to-Kitchen buttons**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-23T10:25:45Z
- **Completed:** 2026-02-23T10:29:29Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Direct Sales "Planned (Manual)" cells now save without Convex validation error — the "direct-manual" display sentinel is stripped to `undefined` before the mutation call
- Cells save only when user presses Enter; blur now reverts unsaved changes and shows amber ring indicator while dirty
- Page labeled "Planner" consistently in nav header, document title, PageHeader, and HubPage hub card
- Today is always the second column — `getYesterday()` replaces `getCurrentMonday()` for the grid anchor
- Save to Kitchen buttons live inside the grid as a header row above channels, aligned with their respective date columns

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix direct-manual save bug + remove blur-save + rename to Planner** - `a6b38b0` (fix)
2. **Task 2: Yesterday-anchored date grid + Save to Kitchen button placement** - `2fcfc75` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/pages/DispatchPlanner.tsx` - getYesterday() helper, sentinel strip, title rename, renderColumnAction
- `src/components/dispatchPlanner/PlannerCell.tsx` - blur now reverts instead of saves
- `src/components/dispatchPlanner/PlannerGrid.tsx` - renderColumnAction prop + column action row
- `src/components/dispatchPlanner/WeekNav.tsx` - removed local getCurrentMonday(), imports getYesterday from DispatchPlanner
- `src/components/layout/Header.tsx` - nav label "Restock" → "Planner"
- `src/pages/HubPage.tsx` - hub card link label "Restock Planner" → "Planner"

## Decisions Made
- direct-manual sentinel stripped in `handleSaveCell` (frontend) rather than in the mutation — keeps the mutation validator clean and the fix contained to the call site
- `getYesterday()` exported from `DispatchPlanner.tsx` so `WeekNav.tsx` imports it — avoids duplicating the logic and ensures both components share the same anchor
- `renderColumnAction` prop pattern on `PlannerGrid` — grid stays unaware of Save-to-Kitchen semantics; caller injects the button
- PlannerCell blur reverts (not saves) — prevents accidental data commits on tab-out; amber ring indicates unsaved state

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Also updated HubPage.tsx nav card label**
- **Found during:** Task 1 (rename to Planner)
- **Issue:** Plan only listed Header.tsx for the rename but HubPage.tsx also showed "Restock Planner" as a user-visible hub card link label
- **Fix:** Changed HubPage.tsx link label and LINK_ICONS key from "Restock Planner" to "Planner"
- **Files modified:** `src/pages/HubPage.tsx`
- **Verification:** grep for "Restock Planner" in src/pages/DispatchPlanner.tsx returns 0
- **Committed in:** a6b38b0 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical — consistency fix)
**Impact on plan:** Trivial scope extension. HubPage label was user-visible inconsistency that the rename task would otherwise miss.

## Issues Encountered
None — both tasks executed cleanly on first attempt.

## Next Phase Readiness
- Planner page fully functional with all 6 UAT issues resolved
- Direct-manual saves work, Enter-only saves work, grid is yesterday-anchored, Save to Kitchen in correct position
- Ready for UAT verification

---
*Phase: 24-ingredient-simulation-id-linking*
*Completed: 2026-02-23*
