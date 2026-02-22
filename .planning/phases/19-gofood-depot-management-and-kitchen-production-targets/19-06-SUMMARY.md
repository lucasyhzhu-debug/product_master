---
phase: 19-gofood-depot-management-and-kitchen-production-targets
plan: "06"
subsystem: ui
tags: [react, typescript, gofood, depot, stock-transfer]

requires:
  - phase: 19-01
    provides: transferStock mutation and gofoodDepotStock schema with outletId

provides:
  - Build-passing GoFoodDepotManager with correct any[] cast on depotStock prop
  - destinationLocationId wired from selectedOutlet.linkedStorageLocationId through DepotCockpitTable to DepotStockTransferDialog
  - Transfer dialog that functions correctly for all outlets with linked storage locations

affects:
  - phase 19 UAT verification of GF-02 and GF-03
  - GoFood depot stock transfer functionality

tech-stack:
  added: []
  patterns:
    - "any[] cast pattern for union Id type incompatibility on Convex query returns"
    - "destinationLocationId prop threading: parent page -> table component -> dialog"

key-files:
  created: []
  modified:
    - src/pages/GoFoodDepotManager.tsx
    - src/components/gofoodDepot/DepotCockpitTable.tsx

key-decisions:
  - "Task 1 (depotStock cast) was already committed in a prior session (9a156e3) - only Task 2 wiring remained"
  - "DepotStockTransferDialog already accepted destinationLocationId prop - no changes needed to dialog itself"
  - "destinationLocationId flows: selectedOutlet?.linkedStorageLocationId -> DepotCockpitTable prop -> transferDialogProduct state -> DepotStockTransferDialog prop"

patterns-established:
  - "Union Id type incompatibility from Convex queries: use (data ?? []) as any[] cast pattern"

requirements-completed:
  - GF-02
  - GF-03

duration: 10min
completed: 2026-02-22
---

# Phase 19 Plan 06: Fix Depot Transfer Type Mismatch and Wire destinationLocationId Summary

**Fixed TypeScript union Id type mismatch on depotStock prop and wired selectedOutlet.linkedStorageLocationId through DepotCockpitTable to DepotStockTransferDialog so stock transfers work for all linked outlets**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-02-22T00:00:00Z
- **Completed:** 2026-02-22
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Resolved TypeScript build error: `depotStock` prop now cast as `any[]` matching pattern used by `stockGrouped` and `storageLocations`
- Wired `destinationLocationId` from `selectedOutlet?.linkedStorageLocationId` (GoFoodDepotManager) through `DepotCockpitTableProps` into `transferDialogProduct` state and on to `DepotStockTransferDialog`
- Transfer dialog no longer shows amber "no linked storage location" warning for outlets that have `linkedStorageLocationId` set in DB
- Build passes with no TypeScript errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix build type mismatch — cast depotStock as any[]** - `9a156e3` (fix) — committed in prior session
2. **Task 2: Wire destinationLocationId through depot transfer chain** - `162d5e5` (feat)

## Files Created/Modified
- `src/pages/GoFoodDepotManager.tsx` - Added `destinationLocationId={selectedOutlet?.linkedStorageLocationId}` prop to `DepotCockpitTable` call; depotStock cast as any[]
- `src/components/gofoodDepot/DepotCockpitTable.tsx` - Added `destinationLocationId` to `DepotCockpitTableProps` interface, destructured in component, included in `setTransferDialogProduct` and passed to `DepotStockTransferDialog`

## Decisions Made
- Task 1 (`depotStock` cast) was already committed in a prior debug/gap session (`9a156e3`). Only Task 2 remained uncommitted.
- `DepotStockTransferDialog.tsx` required no changes — it already accepted the `destinationLocationId` prop and conditionally displayed the amber warning when it was absent.

## Deviations from Plan

None - plan executed exactly as written. Task 1 was pre-committed, Task 2 completed the wiring as specified.

## Issues Encountered
- Task 1 was found to be already committed (`9a156e3`) from a prior session. Verified via `git diff HEAD` before proceeding to avoid double-committing.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 19-06 complete: build passes, depot transfer dialog functional for all linked outlets
- Amber warning only appears for truly unlinked outlets (correct behavior)
- Ready to proceed with remaining phase 19 gap plans (19-07, 19-08, 19-09)

---
*Phase: 19-gofood-depot-management-and-kitchen-production-targets*
*Completed: 2026-02-22*
