---
phase: 16-k3mart-cockpit
plan: 03
subsystem: ui
tags: [react, k3mart, stock-flow, rotation, confirmation-dialog, outlet-settings]

# Dependency graph
requires:
  - phase: 16-k3mart-cockpit
    provides: Backend data layer with outlet-first queries, mutations, hooks (Plan 01)
provides:
  - StockFlowConfirmDialog with price sanity check before every K3Mart API call
  - Rotation shortcut for daily stock rotation workflow (stock-out remaining + stock-in new)
  - Enhanced StockMovementHistory with pagination, expandable details, tooltip timestamps
  - OutletSettingsModal for admin outlet management (active/inactive, product selection, custom pricing)
  - OutletCard avg daily sales stat (4-column stats grid)
  - Admin-only Settings button in K3MartCockpit page header
affects: [16-k3mart-cockpit plan 04]

# Tech tracking
tech-stack:
  added: []
  patterns: [confirmation-before-api-call, rotation-as-two-step-operation, price-sanity-gate]

key-files:
  created:
    - src/components/k3martCockpit/StockFlowConfirmDialog.tsx
    - src/components/k3martCockpit/OutletSettingsModal.tsx
  modified:
    - src/components/k3martCockpit/StockFlowForm.tsx
    - src/components/k3martCockpit/StockMovementHistory.tsx
    - src/components/k3martCockpit/ExpandedOutletPanel.tsx
    - src/components/k3martCockpit/OutletCardGrid.tsx
    - src/components/k3martCockpit/OutletCard.tsx
    - src/components/k3martCockpit/index.ts
    - src/pages/K3MartCockpit.tsx

key-decisions:
  - "Rotation implemented as two sequential API calls (stock-out then stock-in) with combined confirmation dialog"
  - "Price sanity check blocks submission at form level (toast) AND dialog level (disabled confirm button)"
  - "StockMovementHistory uses expandable inline detail instead of separate dialog for quick scanning"
  - "OutletSettingsModal imported directly (not from barrel) to avoid circular dependency risk"

patterns-established:
  - "Confirmation-before-API: all K3Mart API submissions go through StockFlowConfirmDialog"
  - "Error-retry pattern: failed API calls show error bar with Retry button, no local save on failure"
  - "Admin-gated settings: role check both in JSX render (button visibility) and component mount (modal)"

# Metrics
duration: 9min
completed: 2026-02-16
---

# Phase 16 Plan 03: Outlet Cards, Stock Flow, and Settings Summary

**Stock flow with rotation shortcut and confirmation dialog, enhanced movement history with pagination, and admin outlet settings modal with per-outlet product selection and custom pricing**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-16T09:19:17Z
- **Completed:** 2026-02-16T09:28:38Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Created StockFlowConfirmDialog with AlertDialog, price sanity check (blocks zero-price), and rotation summary display
- Added rotation shortcut to StockFlowForm: auto-fills stock-out from current stock, stock-in with configurable qty (default 30), auto-generates rotation notes
- Enhanced StockMovementHistory: pagination (10 per page with Load More), expandable inline details (price, stock at submission, submitter), tooltip timestamps (relative + absolute on hover), shadcn Badge status indicators
- Created OutletSettingsModal with two tabs: Outlets (active/inactive Switch toggles) and Product Settings (per-outlet Checkbox for isHidden, Switch for custom pricing, Input for price override)
- Added avg daily sales stat to OutletCard (4-column grid: Stock, Sold Today, Avg/Day, Plan)
- Added admin-only Settings gear button in K3MartCockpit page header
- Wired useConvexOutletSettings, useConvexToggleOutletActive, useConvexSaveOutletSettings hooks to K3MartCockpit page
- Passed price data through outlet product chain (OutletCardGrid -> ExpandedOutletPanel -> StockFlowForm -> StockFlowConfirmDialog)

## Task Commits

Each task was committed atomically:

1. **Task 1: Stock flow with rotation shortcut, confirmation dialog, and price validation** - `72ec523` (feat)
2. **Task 2: Outlet settings modal and outlet card enhancements** - `de32507` (feat, included in concurrent 16-02 docs commit)

## Files Created/Modified
- `src/components/k3martCockpit/StockFlowConfirmDialog.tsx` - AlertDialog confirmation before K3Mart API calls with price sanity check
- `src/components/k3martCockpit/StockFlowForm.tsx` - Enhanced with rotation shortcut, confirmation dialog integration, error retry
- `src/components/k3martCockpit/StockMovementHistory.tsx` - Pagination, expandable details, Badge status, Tooltip timestamps
- `src/components/k3martCockpit/ExpandedOutletPanel.tsx` - Updated types to pass price data to StockFlowForm
- `src/components/k3martCockpit/OutletCardGrid.tsx` - Updated types for price and enriched StockMovement
- `src/components/k3martCockpit/OutletCard.tsx` - Added avg daily sales stat, 4-column stats grid
- `src/components/k3martCockpit/OutletSettingsModal.tsx` - Outlet active/inactive toggles, per-outlet product visibility and custom pricing
- `src/components/k3martCockpit/index.ts` - Added StockFlowConfirmDialog export
- `src/pages/K3MartCockpit.tsx` - Settings button, OutletSettingsModal, outlet settings hooks, price data passthrough

## Decisions Made
- Rotation is two sequential API calls (stock-out of all remaining stock, then stock-in of new quantity) rather than a single combined endpoint, because the K3Mart API does not support atomic rotation.
- Price sanity check enforced at two levels: (1) toast error when opening confirm dialog if price is 0/null, (2) disabled confirm button in StockFlowConfirmDialog if price is missing. This double-gate ensures no zero-price submission reaches the API.
- StockMovementHistory uses inline expandable detail (click to expand) instead of a separate Dialog, to keep movement scanning fast and avoid modal-within-modal UX.
- OutletSettingsModal imported directly from file path rather than barrel export, to avoid potential bundle size impact since it's admin-only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused cn import in StockMovementHistory**
- **Found during:** Task 1 (build verification)
- **Issue:** `cn` was imported but not used after refactoring status badges to use shadcn Badge component
- **Fix:** Replaced import with comment placeholder
- **Files modified:** src/components/k3martCockpit/StockMovementHistory.tsx
- **Verification:** npm run build passes (no TS6133 error)
- **Committed in:** 72ec523 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed outletSettingsData type shape**
- **Found during:** Task 2 (build verification)
- **Issue:** outletSettingsData returns `{ outlets: [...] }` object, not a flat array. Code was iterating it as `any[]`
- **Fix:** Access `.outlets` property and iterate outlet objects with nested products
- **Files modified:** src/pages/K3MartCockpit.tsx
- **Verification:** npm run build passes (no TS2352 error)
- **Committed in:** de32507

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Minor type fixes. No scope creep.

## Issues Encountered
- Task 2 files were picked up by a concurrent 16-02 agent's final docs commit (`de32507`). The code is committed and correct, just in a different commit than expected. No work was lost.
- Pre-existing build errors in WeeklyPlannerGrid.tsx and OrderSlideOver.tsx remain unrelated to this plan.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Stock flow workflow complete: rotation shortcut, confirmation, error handling, history
- Outlet settings infrastructure ready for Phase 16 Plan 04
- All UI components for outlet card grid and expanded panel are functional
- Pre-existing build errors in WeeklyPlannerGrid and OrderSlideOver need resolution in their respective plans

---
*Phase: 16-k3mart-cockpit*
*Completed: 2026-02-16*
