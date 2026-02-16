---
phase: 03-tech-debt
plan: 02
subsystem: ui
tags: [order-status, deprecated-status-mapping, ui-cleanup, display-helper]

# Dependency graph
requires: []
provides:
  - "getDisplayStatus() helper for mapping deprecated OrderStatus values to active equivalents"
  - "getStatusColor() helper for status-aware color lookup"
  - "Cleaned STATUS_COLORS and STATUS_CATEGORIES without deprecated entries"
  - "All UI status display routes through centralized mapping"
affects: [order-management, kitchen-view, dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Display status mapping via getDisplayStatus() -- all UI status rendering goes through centralized helper"
    - "Partial<Record> for status config maps that don't need deprecated entries"

key-files:
  created: []
  modified:
    - src/lib/orderConstants.ts
    - src/components/dashboard/ProductionQueueTable.tsx
    - src/components/orders/OrderHeader.tsx
    - src/components/orders/OrderStatusPanel.tsx
    - src/pages/OrderDetail.tsx

key-decisions:
  - "Used Partial<Record> for STATUS_COLORS to remove deprecated entries while keeping type safety"
  - "Updated getStatusCategory() to route through getDisplayStatus() internally so all callers benefit automatically"
  - "Added missing Boxed and Labeled statuses to OrderStatusPanel dropdown"

patterns-established:
  - "getDisplayStatus() pattern: all UI code displaying order statuses must route through this helper"
  - "Backend/filter code keeps raw status values; only display layer maps deprecated values"

# Metrics
duration: 7min
completed: 2026-02-13
---

# Phase 3 Plan 2: Deprecated Status Cleanup Summary

**getDisplayStatus() helper mapping ProductionComplete->Boxed and Packaging->InProduction across 5 UI files, with deprecated entries removed from status color/config maps**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-13T09:35:49Z
- **Completed:** 2026-02-13T09:42:49Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created centralized `getDisplayStatus()` helper that maps deprecated `ProductionComplete` -> `Boxed` and `Packaging` -> `InProduction`
- Removed deprecated status entries from `STATUS_COLORS`, `STATUS_CONFIG`, and `STATUS_CATEGORIES.kitchen`
- Updated all 5 UI display locations (OrderHeader, OrderDetail, ProductionQueueTable, OrderStatusPanel, orderConstants internals) to use the mapping
- Preserved deprecated statuses as selectable options in OrderStatusPanel for old order management
- Backend code completely untouched; `OrderStatus` type unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Create getDisplayStatus helper and update status color/label maps** - `9480d02` (feat)
2. **Task 2: Update OrderStatusPanel filters and OrderDetail status display** - `f86cc92` (feat)

## Files Created/Modified
- `src/lib/orderConstants.ts` - Added getDisplayStatus(), getStatusColor(); cleaned STATUS_COLORS, STATUS_CATEGORIES.kitchen; updated getStatusCategory() to route through display mapping
- `src/components/dashboard/ProductionQueueTable.tsx` - Removed deprecated STATUS_CONFIG entries, uses getDisplayStatus() for lookup
- `src/components/orders/OrderHeader.tsx` - Replaced local STATUS_COLORS with getDisplayStatus() and getStatusColor() imports
- `src/components/orders/OrderStatusPanel.tsx` - Uses getDisplayStatus() for display labels, added missing Boxed/Labeled options
- `src/pages/OrderDetail.tsx` - Badge rendering uses getDisplayStatus() for text and getStatusColor() for color

## Decisions Made
- Changed `STATUS_COLORS` type from `Record<OrderStatus, string>` to `Partial<Record<OrderStatus, string>>` to safely remove deprecated entries without needing all keys
- Updated `getStatusCategory()` internally to route through `getDisplayStatus()` so all callers (OrderManager, etc.) automatically handle deprecated statuses correctly without individual changes
- Added `Boxed` and `Labeled` to OrderStatusPanel's STATUS_OPTIONS -- these were missing from the dropdown despite being active statuses

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] getStatusCategory() would miscategorize deprecated statuses**
- **Found during:** Task 1 (removing Packaging from STATUS_CATEGORIES.kitchen)
- **Issue:** After removing Packaging from kitchen category, getStatusCategory('Packaging') would fall through to default 'completed' instead of 'kitchen'. OrderManager.tsx calls getStatusCategory(order.status) directly without getDisplayStatus()
- **Fix:** Updated getStatusCategory() to internally route through getDisplayStatus() before category lookup
- **Files modified:** src/lib/orderConstants.ts
- **Verification:** Type check passes, getStatusCategory('Packaging') now returns 'kitchen' via InProduction mapping
- **Committed in:** 9480d02 (Task 1 commit)

**2. [Rule 2 - Missing Critical] OrderStatusPanel missing Boxed and Labeled status options**
- **Found during:** Task 2 (updating OrderStatusPanel)
- **Issue:** STATUS_OPTIONS array was missing 'Boxed' and 'Labeled' -- active statuses that users need to transition orders to
- **Fix:** Added both statuses to the STATUS_OPTIONS array
- **Files modified:** src/components/orders/OrderStatusPanel.tsx
- **Verification:** Build passes, both statuses visible in dropdown
- **Committed in:** f86cc92 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical functionality)
**Impact on plan:** Both fixes essential for correct operation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Deprecated status display mapping is complete and centralized
- Future UI code can import getDisplayStatus() for consistent handling
- OrderBox.tsx and OrderStatsCards.tsx still reference 'Packaging' inline but are not in this plan's scope -- can be cleaned up in a follow-up if needed

## Self-Check: PASSED

All 5 modified files exist on disk. Both task commits (9480d02, f86cc92) found in git log. SUMMARY.md created successfully.

---
*Phase: 03-tech-debt*
*Completed: 2026-02-13*
