---
phase: 15-kitchen-overhaul
plan: 03
subsystem: ui
tags: [react, kitchen, due-date-grouping, order-cards, k3mart, checklist]

# Dependency graph
requires:
  - phase: 15-kitchen-overhaul
    plan: 01
    provides: "getKitchenPackingOrders with expedited flag, sendBackToOrderDesk mutation"
provides:
  - "groupByDueDate generic utility (WIB timezone, OVERDUE/today/tomorrow/future/no-date sorting)"
  - "DueDateGroupHeader with red OVERDUE styling"
  - "KitchenOrderCard with EXPEDITED badge, Complete Order, Send Back buttons"
  - "KitchenOrderChecklist with per-item checkboxes and tooltip for unavailable"
  - "K3MartSyntheticCard with purple dashed border, outlet breakdown, inline-editable quantity"
  - "DueDateOrderList container composing all above with K3Mart placement logic"
affects: [15-kitchen-overhaul]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Generic DueDateGroup<T> interface preserving order types through grouping"
    - "Visual-only local state checkmarks for K3Mart items (no backend mutation)"
    - "Inline-editable number pattern with tap-to-edit and blur/enter-to-save"

key-files:
  created:
    - "src/lib/dueDateGrouping.ts"
    - "src/components/kitchen/DueDateGroupHeader.tsx"
    - "src/components/kitchen/KitchenOrderChecklist.tsx"
    - "src/components/kitchen/KitchenOrderCard.tsx"
    - "src/components/kitchen/K3MartSyntheticCard.tsx"
    - "src/components/kitchen/DueDateOrderList.tsx"
  modified:
    - "src/components/kitchen/index.ts"

key-decisions:
  - "DueDateGroup made generic to preserve PackingOrder type through groupByDueDate"
  - "K3Mart checkmarks are visual-only local state (no mutation until Phase 16 dispatch plans)"
  - "K3Mart card placed at top of Due Today group, or as standalone section if no today orders"

patterns-established:
  - "Generic grouping utility: DueDateGroup<T> preserves input type through sort/group"
  - "Inline-edit pattern: tap number -> input appears -> blur/enter saves -> escape cancels"

# Metrics
duration: 6min
completed: 2026-02-16
---

# Phase 15 Plan 03: Due-Date Order List Summary

**Due-date grouped order cards with per-item checklists, EXPEDITED badges, Complete/SendBack actions, and K3Mart synthetic card with outlet breakdown**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-16T05:08:35Z
- **Completed:** 2026-02-16T05:14:18Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- groupByDueDate utility groups orders by WIB due date with OVERDUE pinned at top and EXPEDITED orders pinned to top of each group
- KitchenOrderCard with EXPEDITED amber badge, Complete Order (green, enabled when all packed), Send Back (destructive with ConfirmDialog)
- KitchenOrderChecklist with per-item checkboxes, green checkmark for packed, tooltip for unavailable items
- K3MartSyntheticCard with purple dashed border, outlet breakdown, inline-editable consignment target, visual-only checkmarks
- DueDateOrderList container composing grouped headers, order cards, and K3Mart card placement

## Task Commits

Each task was committed atomically:

1. **Task 1: date-fns install + dueDateGrouping utility + DueDateGroupHeader** - `33428cf` (feat)
2. **Task 2: KitchenOrderCard, KitchenOrderChecklist, K3MartSyntheticCard, DueDateOrderList** - `c6070a8` (feat)

## Files Created/Modified
- `src/lib/dueDateGrouping.ts` - Generic groupByDueDate utility with WIB timezone and OVERDUE/today/tomorrow/future sorting
- `src/components/kitchen/DueDateGroupHeader.tsx` - Sticky section header with red styling for OVERDUE
- `src/components/kitchen/KitchenOrderChecklist.tsx` - Per-item checkbox list with tooltip for unavailable items
- `src/components/kitchen/KitchenOrderCard.tsx` - Order card with header, checklist, Complete Order and Send Back buttons
- `src/components/kitchen/K3MartSyntheticCard.tsx` - K3Mart synthetic card with purple dashed border, outlet breakdown, inline-editable quantity
- `src/components/kitchen/DueDateOrderList.tsx` - Container grouping orders by due date and rendering K3Mart card in Due Today
- `src/components/kitchen/index.ts` - Added exports for all 5 new components

## Decisions Made
- Made DueDateGroup generic (`DueDateGroup<T>`) so groupByDueDate preserves the input PackingOrder type -- avoids unsafe type casts in consuming components
- K3Mart checkmarks use local React state (visual-only tracking) since K3Mart items are not real orderItems -- no backend mutation until Phase 16 provides dispatch plans
- K3Mart card placed at top of "Due Today" group; when no today-group exists, renders as standalone section with "Due Today (0)" header

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Made DueDateGroup interface generic**
- **Found during:** Task 2 (DueDateOrderList)
- **Issue:** DueDateGroup.orders was typed as generic base type `{ _id: string; ... }`, losing PackingOrder properties when passed to KitchenOrderCard
- **Fix:** Changed `DueDateGroup` to `DueDateGroup<T>` with default type parameter, updated groupByDueDate return type to `DueDateGroup<T>[]`
- **Files modified:** src/lib/dueDateGrouping.ts
- **Verification:** `npm run build` passes without type cast
- **Committed in:** c6070a8 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor type improvement for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 order list components ready for integration into KitchenViewV3 page (Plan 04 or later)
- Components accept callback props (onTogglePack, onMarkReady, onSendBack) compatible with existing kitchen mutations
- K3MartSyntheticCard ready for dispatch plan integration in Phase 16

---
*Phase: 15-kitchen-overhaul*
*Completed: 2026-02-16*
