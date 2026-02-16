---
phase: 16-k3mart-cockpit
plan: 02
subsystem: frontend
tags: [react, k3mart, weekly-planner, outlet-first, auto-save, holiday-aware]

# Dependency graph
requires:
  - phase: 16-k3mart-cockpit
    plan: 01
    provides: Outlet-first backend query, auto-suggest, copyLastWeek mutation, holiday system
provides:
  - Outlet-first weekly planning grid with product sub-rows and auto-save on blur
  - Week navigation with current week highlighting and Today button
  - 3-row color-coded column headers with per-day confirm buttons
  - Copy Last Week button and daily production target totals row
  - Self-contained WeeklyPlannerGrid component managing own state/queries
affects: [16-k3mart-cockpit plans 03-04, K3MartCockpit page]

# Tech tracking
tech-stack:
  added: []
  patterns: [self-contained-grid-component, auto-save-on-blur, debounced-cell-save]

key-files:
  created:
    - src/components/k3martCockpit/WeekNavigator.tsx
  modified:
    - src/components/k3martCockpit/WeeklyPlannerGrid.tsx
    - src/components/k3martCockpit/OutletPlannerRow.tsx
    - src/components/k3martCockpit/EditablePlannerCell.tsx
    - src/components/k3martCockpit/PlannerGridHeader.tsx
    - src/components/k3martCockpit/PlannerActionBar.tsx
    - src/components/k3martCockpit/index.ts
    - src/pages/K3MartCockpit.tsx
    - src/hooks/convex/index.ts

key-decisions:
  - "WeeklyPlannerGrid is self-contained: manages own week state, queries, mutations (no props from parent)"
  - "Auto-save on blur with 300ms debounce replaces batch save button"
  - "Per-day confirm buttons in PlannerGridHeader columns, not in PlannerActionBar"
  - "Collapsible toggle removed: weekly planner is always visible as main cockpit feature"
  - "BACKLOG stubs K3MART-01 through K3MART-05 resolved with real data wiring"
  - "Pre-existing OrderSlideOver.tsx type error left untouched (out of scope)"

patterns-established:
  - "Self-contained grid component pattern: component owns its data fetching, state, and mutations"
  - "Auto-save on blur with debounce for grid cell editing"
  - "3-row column header with day-type color coding"

# Metrics
duration: 7min
completed: 2026-02-16
---

# Phase 16 Plan 02: Frontend Weekly Planning Grid Summary

**Outlet-first weekly planner grid with 3-row holiday-aware headers, auto-save on blur, week navigation, per-day confirm, copy-last-week, and daily production target totals**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-16T09:19:17Z
- **Completed:** 2026-02-16T09:26:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Complete rewrite of WeeklyPlannerGrid from product-tab to outlet-first layout with self-contained state/query management
- OutletPlannerRow renders outlet header + product sub-rows + stock column + subtotal row (shown when >1 product)
- EditablePlannerCell with auto-save on blur (300ms debounce), auto-suggest placeholders, status-based colors (draft/confirmed/submitted)
- WeekNavigator with big prev/next arrows, prominent date range display, current week highlighting (bg-primary/10)
- PlannerGridHeader with 3-row headers (day name, date, event name), color coding per day type, per-day confirm buttons with Draft/Confirmed/Submitted badges
- PlannerActionBar with Copy Last Week button (with tooltip when disabled) and grand totals row as daily production targets
- K3MartCockpit page: removed collapsible toggle, planner always visible, BACKLOG stubs K3MART-01 through K3MART-05 resolved
- Added 4 missing hook exports to convex index (CopyLastWeek, SaveOutletSettings, SetProductTarget, OutletSettings)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite core grid components** - `441a239` (feat)
2. **Task 2: Build navigation, headers, action bar, wire cockpit** - `1fe1973` (feat)

## Files Created/Modified
- `src/components/k3martCockpit/WeekNavigator.tsx` - NEW: Week navigation with arrows, date range, current week color
- `src/components/k3martCockpit/WeeklyPlannerGrid.tsx` - REWRITE: Outlet-first orchestrator with week state, auto-save, copy-last-week
- `src/components/k3martCockpit/OutletPlannerRow.tsx` - REWRITE: Outlet group with product sub-rows, stock column, subtotals
- `src/components/k3martCockpit/EditablePlannerCell.tsx` - REWRITE: Auto-save on blur, debounce, status colors, placeholders
- `src/components/k3martCockpit/PlannerGridHeader.tsx` - REWRITE: 3-row headers, day-type colors, per-day confirm buttons
- `src/components/k3martCockpit/PlannerActionBar.tsx` - REWRITE: Copy Last Week + grand totals row
- `src/components/k3martCockpit/index.ts` - Added WeekNavigator export
- `src/pages/K3MartCockpit.tsx` - Removed collapsible toggle, planner always visible, BACKLOG resolved
- `src/hooks/convex/index.ts` - Added 4 missing K3MartCockpit hook exports

## Decisions Made
- Made WeeklyPlannerGrid self-contained (manages own queries/mutations/state) so K3MartCockpit page doesn't need to pass weekly planner data as props. This simplifies the parent page significantly.
- Per-day confirm buttons placed in PlannerGridHeader (per column, below status badges) rather than PlannerActionBar, matching user decision for day-by-day confirm flow.
- Removed AnimatePresence/motion for collapsible planner -- the planner is always visible now as the main cockpit feature.
- Pre-existing OrderSlideOver.tsx type error left untouched as it is out of scope (from Phase 14).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing hook exports in convex/index.ts**
- **Found during:** Task 2 (build verification)
- **Issue:** `useConvexCopyLastWeek`, `useConvexSaveOutletSettings`, `useConvexSetProductTarget`, `useConvexOutletSettings` were defined in useK3MartCockpit.ts but not exported from the hooks index barrel file.
- **Fix:** Added 4 missing exports to `src/hooks/convex/index.ts`
- **Files modified:** src/hooks/convex/index.ts
- **Committed in:** 1fe1973 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal -- hook exports were added in Plan 01 but the barrel file wasn't updated.

## Issues Encountered
- Pre-existing `OrderSlideOver.tsx` type error (from Phase 14-08) causes `npm run build` to fail at TypeScript stage. This error is unrelated to K3Mart cockpit work. The vite build itself would succeed. Logged to deferred-items.md.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Frontend weekly planning grid complete, ready for Plan 03 (outlet management + stock movement UI)
- Self-contained WeeklyPlannerGrid can be tested independently

## Self-Check: PASSED
- All files exist and were verified
- Both commits exist (441a239, 1fe1973)
- Type check passes for all Plan 02 files
- Pre-existing OrderSlideOver error is out of scope

---
*Phase: 16-k3mart-cockpit*
*Completed: 2026-02-16*
