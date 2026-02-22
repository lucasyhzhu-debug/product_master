---
phase: 19-gofood-depot-management-and-kitchen-production-targets
plan: "05"
subsystem: ui
tags: [react, gofood, depot, restock, dispatch-planner, read-only]

requires:
  - phase: 19-02
    provides: getRestockSuggestions query (per-outlet restock with breakdown text)
  - phase: 19-01
    provides: getDepotStock query (per-outlet stock with productInventoryQty)
  - phase: 19-03
    provides: useGoFoodDepotOutlets hook and page patterns established

provides:
  - "GoFoodRestockSection component on Dispatch Planner page (/restock-planner)"
  - "Read-only per-outlet GoFood restock table: product, current stock, restock tomorrow, breakdown"
  - "Collapsible section (default expanded) with outlet name headers"

affects: []

tech-stack:
  added: []
  patterns:
    - "GoFoodRestockSection is purely read-only — no mutations, no inputs"
    - "Defensive null render: returns null if no GoBiz outlets exist"
    - "Two parallel queries per outlet (getRestockSuggestions + getDepotStock) joined client-side by menuProductId"

key-files:
  created:
    - src/components/restockPlanner/GoFoodRestockSection.tsx
  modified:
    - src/pages/RestockPlanner.tsx

key-decisions:
  - "Current stock shown from productInventoryQty (outlet's linked storage location), not gofoodDepotStock.quantity (in-transit/physical depot count)"
  - "Breakdown text displayed inline (not tooltip) since Dispatch Planner is a planning view where full detail is helpful"
  - "GoFoodRestockSection placed after Internal Channel section as additive-only addition"

requirements-completed: [GF-04]

duration: 2min
completed: 2026-02-22
---

# Phase 19 Plan 05: GoFood Depot Restock Section on Dispatch Planner Summary

**Read-only GoFood depot restock section added to Dispatch Planner page with per-outlet tables showing current stock, restock suggestion, and calculation breakdown**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-22T07:42:16Z
- **Completed:** 2026-02-22T07:44:07Z
- **Tasks:** 1
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- `GoFoodRestockSection` component queries all GoBiz outlets then renders a collapsible outlet-per-outlet section with a read-only restock table
- Each outlet table shows: product name, current stock (from `productInventoryQty` at the outlet's linked storage location), restock tomorrow (suggestion number), and breakdown text (same calculation detail shown in the depot cockpit tooltip)
- Section placed after Internal Channel section in Dispatch Planner — purely additive, no existing logic changed
- Collapsible with default expanded state

## Task Commits

Each task was committed atomically:

1. **Task 1: GoFood restock section on Dispatch Planner page** - `dbad11b` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/components/restockPlanner/GoFoodRestockSection.tsx` - Read-only GoFood depot restock section component (collapsible, per-outlet tables, 2 queries per outlet joined by menuProductId)
- `src/pages/RestockPlanner.tsx` - Added import and render of GoFoodRestockSection after Internal Channel section

## Decisions Made
- Current stock column uses `productInventoryQty` (stock at outlet's linked storage location) rather than `gofoodDepotStock.quantity` (physical stock at the depot). This matches what the DepotCockpitTable shows as "In Inventory" which is the more actionable number for dispatch planning.
- Breakdown text shown inline (full text in table cell) rather than tooltip, since this is a planning view where the calculation context is valuable without requiring hover interaction.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Self-Check

**Files created:**
- `src/components/restockPlanner/GoFoodRestockSection.tsx` — exists (>40 lines min_lines requirement met: ~155 lines)

**Build:** `npm run build` passes (no type errors)
**Commit:** dbad11b exists

## Self-Check: PASSED

## Next Phase Readiness
- Phase 19 is now complete (all 5 plans executed)
- GoFood Depot restock data visible on Dispatch Planner page
- Numbers match the depot cockpit table (same getRestockSuggestions query)
- Ready to merge phase-19 feature branch to main

---
*Phase: 19-gofood-depot-management-and-kitchen-production-targets*
*Completed: 2026-02-22*
