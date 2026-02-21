---
phase: 17-unified-dispatch-planner-3rd-outlet
plan: 06
subsystem: ui, api, database
tags: [dispatch-planner, timezone, uat-fixes, convex]

# Dependency graph
requires:
  - phase: 17-unified-dispatch-planner-3rd-outlet (plans 01-05)
    provides: "Full dispatch planner implementation with 4 tables, queries, mutations, and frontend"
provides:
  - "Timezone-safe getWeekDates using Intl.DateTimeFormat for Jakarta day-of-week"
  - "Packaging-only product filtering from dispatch planner grid"
  - "Direct Sales manual planning outlet with editable future cells"
  - "3-tab settings dialog (Channels, Outlets, Capacity) with merged priority+toggle"
  - "Working Simulate Inventory button with toast feedback"
  - "Commission rate removed from schema and all UI"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Intl.DateTimeFormat for timezone-safe day-of-week calculation (replaces Date.getDay())"
    - "useEffect for async state transitions instead of render-time setState"

key-files:
  created: []
  modified:
    - convex/k3martCockpit/helpers.ts
    - convex/schema.ts
    - convex/dispatchPlanner/queries.ts
    - convex/dispatchPlanner/mutations.ts
    - src/components/dispatchPlanner/WeekNav.tsx
    - src/components/dispatchPlanner/CapacityBar.tsx
    - src/components/dispatchPlanner/ChannelSettingsDialog.tsx
    - src/pages/DispatchPlanner.tsx
    - docs/CHANGELOG.md

key-decisions:
  - "Use Intl.DateTimeFormat instead of Date.getDay() for timezone-safe day-of-week in all getWeekDates/getCurrentMonday functions"
  - "Add Planned (Manual) outlet in Direct Sales channel rather than making order rows editable"
  - "Filter packaging products at menuProductMap level (single filter point for all channels)"
  - "Remove commissionRate entirely rather than hiding it (unused field, net/gross tracked from APIs)"
  - "Merge Priorities+Channels into single Channels tab with inline controls"

patterns-established:
  - "Timezone-safe Jakarta day-of-week: always use Intl.DateTimeFormat with timeZone:'Asia/Jakarta' instead of Date.getDay()"

# Metrics
duration: 7min
completed: 2026-02-17
---

# Phase 17 Plan 06: UAT Gap Closure Summary

**7 UAT fixes: timezone-safe week nav, capacity tooltip visibility, Direct Sales manual planning, packaging product filter, simulate inventory toast, commission removal, 3-tab settings merge**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-17T04:49:52Z
- **Completed:** 2026-02-17T04:56:59Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- Fixed timezone bug in week navigation that could show wrong dates when accessed from non-Jakarta timezone
- Added "Planned (Manual)" outlet in Direct Sales so managers can plan ad-hoc direct sales for future days
- Reduced settings dialog from 4 tabs to 3 by merging Priorities and Channels into a unified view
- Removed unused commissionRate from schema, mutations, and all UI
- Fixed Simulate Inventory button (was causing render-time setState violation)
- Filtered packaging-only products from dispatch planner grid
- Fixed capacity bar tooltip clipping with overflow-visible and z-[100]

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend fixes -- timezone, product filter, Direct Sales editable, remove commission** - `d776e61` (feat)
2. **Task 2: Frontend fixes -- WeekNav timezone, CapacityBar tooltip, merged tabs, simulate, remove commission UI** - `095aebe` (feat)
3. **Task 3: Verify build + type-check + update CHANGELOG** - `bfe1f50` (docs)

## Files Created/Modified
- `convex/k3martCockpit/helpers.ts` - Timezone-safe getWeekDates using Intl.DateTimeFormat
- `convex/schema.ts` - Removed commissionRate from dispatchChannelConfig and dispatchConsignmentOutlets
- `convex/dispatchPlanner/queries.ts` - Packaging product filter, Direct Sales "Planned (Manual)" outlet
- `convex/dispatchPlanner/mutations.ts` - Removed commissionRate from seed, updateChannelConfig, add/update outlet
- `src/components/dispatchPlanner/WeekNav.tsx` - Timezone-safe getCurrentMonday
- `src/components/dispatchPlanner/CapacityBar.tsx` - Tooltip overflow-visible + z-[100]
- `src/components/dispatchPlanner/ChannelSettingsDialog.tsx` - 3-tab layout, merged ChannelList component, removed commission UI
- `src/pages/DispatchPlanner.tsx` - Timezone-safe getCurrentMonday, useEffect for simulation state
- `docs/CHANGELOG.md` - UAT fixes documented

## Decisions Made
- Used `Intl.DateTimeFormat` with `weekday: "short"` and `timeZone: "Asia/Jakarta"` to get day-of-week instead of `Date.getDay()` which returns UTC day on Convex server
- Added "Planned (Manual)" as a synthetic outlet in Direct Sales rather than making order-sourced rows editable (orders are fixed quantities)
- Filtered packaging products at `menuProductMap` construction (single filter point) rather than in each channel assembler
- Removed `commissionRate` entirely from schema rather than just hiding the UI (field was unused; actual commission data comes from GoBiz/K3Mart APIs)
- Merged Priorities + Channels into single "Channels" tab with inline up/down arrows + Switch toggle per row

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 7 UAT gaps closed; dispatch planner is fully functional for manager use
- Phase 17 feature branch ready to merge to main
- Phase 18 (GoFood Integration) can proceed after merge

---
*Phase: 17-unified-dispatch-planner-3rd-outlet*
*Completed: 2026-02-17*
