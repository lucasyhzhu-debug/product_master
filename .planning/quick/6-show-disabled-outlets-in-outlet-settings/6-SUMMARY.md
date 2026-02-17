---
phase: quick-6
plan: 01
subsystem: ui
tags: [k3mart, cockpit, outlets, settings]

requires:
  - phase: none
    provides: n/a
provides:
  - "Outlet Settings modal shows all outlets (active + inactive)"
  - "Product Settings dropdown includes disabled outlets"
affects: [k3mart-cockpit]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/pages/K3MartCockpit.tsx

key-decisions:
  - "Use outletSettingsData (getOutletSettings query) instead of outletStockData for settings modal - returns all outlets regardless of active status"

duration: 1min
completed: 2026-02-17
---

# Quick Task 6: Show Disabled Outlets in Outlet Settings Summary

**Fixed disabled outlets disappearing from K3Mart Outlet Settings by switching data source from active-only outletStockData to all-outlets outletSettingsData**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-17T01:14:00Z
- **Completed:** 2026-02-17T01:14:56Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Disabled outlets now remain visible in Outlet Toggle Settings tab
- Product Settings dropdown includes all outlets (active + inactive)
- Correct field mapping from outletSettingsData (outletId/outletName vs _id/name)

## Task Commits

1. **Task 1: Replace outlet data source in settingsModalData** - `97785ef` (fix)

## Files Created/Modified
- `src/pages/K3MartCockpit.tsx` - Changed settingsModalData useMemo to use outletSettingsData.outlets instead of outletStockData.outlets; updated field mappings and dependency array

## Decisions Made
None - followed plan as specified.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

---
*Quick Task: 6*
*Completed: 2026-02-17*
