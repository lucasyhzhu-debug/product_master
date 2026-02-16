---
phase: 16-k3mart-cockpit
plan: 06
subsystem: ui
tags: [react, k3mart, dark-mode, ux, layout, collapsible]

# Dependency graph
requires:
  - phase: 16-05
    provides: "externalProductName, defaultPrice in outlet settings and weekly dispatch queries"
provides:
  - "Today's Dispatch above Weekly Planner layout"
  - "Collapsible Weekly Planner with toggle"
  - "Past day greying and non-editable cells in weekly grid"
  - "Dark mode support across all K3Mart cockpit grid components"
  - "K3Mart name -> POS name display in outlet settings with real default prices"
affects: [k3mart-cockpit, verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "isPastDay prop pattern: compare date string < todayStr for past-day detection"
    - "Dark mode tokens: bg-card, text-foreground, border-border, bg-muted replacing hardcoded gray classes"
    - "Collapsible section pattern: useState toggle with ChevronDown rotation"

key-files:
  created: []
  modified:
    - src/pages/K3MartCockpit.tsx
    - src/components/k3martCockpit/WeeklyPlannerGrid.tsx
    - src/components/k3martCockpit/OutletPlannerRow.tsx
    - src/components/k3martCockpit/EditablePlannerCell.tsx
    - src/components/k3martCockpit/PlannerGridHeader.tsx
    - src/components/k3martCockpit/PlannerActionBar.tsx
    - src/components/k3martCockpit/OutletSettingsModal.tsx
    - src/components/k3martCockpit/OutletCard.tsx

key-decisions:
  - "Past day detection uses simple string comparison (date < todayStr) for YYYY-MM-DD format"
  - "Past days in header show muted status badges with no action buttons"
  - "Product settings show K3Mart name -> POS name with ArrowRight icon only when names differ"
  - "Price warning shown in amber when defaultPrice is 0 (unmapped)"

patterns-established:
  - "isPastDay prop propagated from WeeklyPlannerGrid through OutletPlannerRow to EditablePlannerCell"
  - "todayStr prop passed to PlannerGridHeader for header-level past-day styling"

# Metrics
duration: 8min
completed: 2026-02-16
---

# Phase 16 Plan 06: Frontend UX Fixes Summary

**Layout reorder (dispatch above planner), collapsible weekly planner, past-day greying, dark mode tokens, and K3Mart name/price display in outlet settings**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-16T14:19:58Z
- **Completed:** 2026-02-16T14:28:09Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Reordered K3MartCockpit layout: Today's Dispatch now renders above Weekly Planner
- Weekly Planner section is collapsible with ChevronDown toggle (default expanded)
- Past days (before today) greyed out in both grid cells and header columns, non-editable
- Replaced all hardcoded light-mode colors (bg-white, bg-gray-*, text-gray-*, border-gray-*) with dark-mode-aware tokens across 6 grid components + OutletCard
- OutletSettingsModal shows "Dubai Chewy Cookie -> Original - Single (45g)" format with real default prices and amber warning for unmapped prices

## Task Commits

Each task was committed atomically:

1. **Task 1: Layout reorder, collapsibility, past day greying, and dark mode fixes** - `ad021c8` (feat)
2. **Task 2: Product name and price display in outlet settings and grid** - `fb4df00` (feat)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `src/pages/K3MartCockpit.tsx` - Reordered Today's Dispatch above Weekly Planner; added collapsible toggle with plannerExpanded state; pass externalProductName through settings data
- `src/components/k3martCockpit/WeeklyPlannerGrid.tsx` - Pass todayStr to PlannerGridHeader and OutletPlannerRow
- `src/components/k3martCockpit/OutletPlannerRow.tsx` - Accept todayStr prop; compute isPastDay per cell; replace all gray-* classes with dark-mode tokens
- `src/components/k3martCockpit/EditablePlannerCell.tsx` - Accept isPastDay prop; bg-muted/50 + text-muted-foreground for past days; dark-mode-aware status colors
- `src/components/k3martCockpit/PlannerGridHeader.tsx` - Accept todayStr prop; past day headers use bg-muted/30 + muted text; no confirm/draft buttons for past days; dark mode tokens for all day type colors
- `src/components/k3martCockpit/PlannerActionBar.tsx` - Replace bg-gray-100/200 with bg-muted; text-gray-* with text-foreground; border-gray-* with border-border
- `src/components/k3martCockpit/OutletSettingsModal.tsx` - Show K3Mart name -> POS name with ArrowRight icon; amber warning for unmapped prices (defaultPrice=0); border-border for dark mode
- `src/components/k3martCockpit/OutletCard.tsx` - bg-white -> bg-card; text-[#1A202C] -> text-foreground; text-gray-500 -> text-muted-foreground
- `src/components/orders/OrderSlideOver.tsx` - Fix pre-existing type error (Packaging not in OrderStatus) with type assertion

## Decisions Made
- Past day detection uses string comparison (`date < todayStr`) since YYYY-MM-DD format sorts lexicographically
- Past day headers show muted status badges but no action buttons (confirm/update kitchen)
- Product names in outlet settings show both K3Mart and POS names with arrow only when they differ (no redundancy)
- Price warning uses amber color (not red) since unmapped price is a configuration gap, not an error

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing OrderSlideOver type error**
- **Found during:** Task 1 (build verification)
- **Issue:** `order.status` includes "Packaging" which is not in `OrderStatus` type, causing tsc to fail
- **Fix:** Added type assertion `as import('@/lib/types').OrderStatus` on `getStatusColor` and `STATUS_LABELS` calls
- **Files modified:** src/components/orders/OrderSlideOver.tsx
- **Verification:** `npm run build` passes
- **Committed in:** ad021c8 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Pre-existing type error unrelated to Phase 16. Type assertion is safe since getStatusColor handles unknown statuses gracefully.

## Issues Encountered
- Pre-existing OrderSlideOver.tsx type error (documented in Plan 05 summary) blocked build -- fixed with type assertion per Rule 3.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 16 (K3Mart Cockpit) is now feature-complete with all 6 plans executed
- Ready for final verification and merge to main
- All UX issues from user feedback addressed

---
*Phase: 16-k3mart-cockpit*
*Completed: 2026-02-16*
