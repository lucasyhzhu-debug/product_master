---
phase: 19-gofood-depot-management-and-kitchen-production-targets
plan: "03"
subsystem: ui
tags: [react, gofood, depot, cockpit, product-mapping, stock-transfer, wib-timezone]

requires:
  - phase: 19-01
    provides: gofoodDepotStock.outletId, transferStock mutation, isSeedRequired query, getDepotStock per-outlet query
  - phase: 19-02
    provides: getRestockSuggestions, getOutletProductMappings, saveOutletProductMappings, initOutletMappingsFromPrevious

provides:
  - "GoFoodDepotManager page at /gofood-depot (canAccessDashboard)"
  - "SeedWarningBlocker full-page blocker when GoBiz outlets lack linkedStorageLocationId"
  - "Outlet selector (horizontal button tabs) for 3 GoBiz depots"
  - "Low-stock alert banner when any product < 5 remaining"
  - "DepotCockpitTable with 6 columns: product, remaining (inline editable), in inventory, restock tomorrow (tooltip), available elsewhere, actions"
  - "DepotMappingSection with unmapped product flagging, dropdown selects, and explicit Save button"
  - "DepotStockTransferDialog validating source stock before transfer"
  - "useGoFoodDepot.ts hook with 8 query hooks + 4 mutation hooks"

affects: [phase-19-04, phase-19-05]

tech-stack:
  added: []
  patterns:
    - "All hooks called at component top (before conditional returns) per React hooks rules"
    - "as any[] casts at prop boundaries where Convex returns string IDs vs typed Id<T>"
    - "Inline editing pattern: click-to-edit with Enter/Escape/blur handlers"
    - "Explicit-save mapping pattern (no auto-save) using local useState + explicit Save button"

key-files:
  created:
    - src/hooks/convex/useGoFoodDepot.ts
    - src/pages/GoFoodDepotManager.tsx
    - src/components/gofoodDepot/SeedWarningBlocker.tsx
    - src/components/gofoodDepot/DepotCockpitTable.tsx
    - src/components/gofoodDepot/DepotMappingSection.tsx
    - src/components/gofoodDepot/DepotStockTransferDialog.tsx
  modified:
    - src/hooks/convex/index.ts
    - src/pages/index.ts
    - src/App.tsx

key-decisions:
  - "Tasks 1 and 2 implemented in single commit (b7a343a) since all components needed to coexist for TypeScript to compile"
  - "description prop on PageHeader accepts only string — last-synced timestamp placed in action slot instead"
  - "StockGrouped and StorageLocation types from Convex queries use string IDs at runtime — used as any[] at prop boundaries rather than redefining types"
  - "transferStock mutation has no reason field — removed from dialog call"

requirements-completed: [GF-02, GF-03, GF-04, GF-05]

duration: 9min
completed: 2026-02-22
---

# Phase 19 Plan 03: GoFood Depot Management Frontend Summary

**GoFood depot page with outlet selector, seed warning blocker, inline-editable cockpit table with restock tooltip, explicit-save product mapping section, and stock transfer dialog**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-02-22T07:30:36Z
- **Completed:** 2026-02-22T07:39:30Z
- **Tasks:** 2 (implemented together in 1 commit)
- **Files modified:** 9 (6 created, 3 modified)

## Accomplishments
- Full GoFood Depot Management page at `/gofood-depot` following K3MartCockpit layout pattern
- `useGoFoodDepot.ts` hook file with 8 query hooks + 4 mutation hooks covering all depot data needs
- `DepotCockpitTable` with inline stock adjustment (click-to-edit with Enter/Escape), restock suggestion tooltip with breakdown text, low-stock row highlighting (< 5 units = red)
- `DepotMappingSection` with unmapped product detection, dropdown menu product selects, and explicit Save button (no auto-save per design spec)
- `DepotStockTransferDialog` with source location dropdown, live available-stock display, and over-available validation blocking
- `SeedWarningBlocker` full-page blocker listing unlinked outlet names with Convex dashboard instructions

## Task Commits

1. **Tasks 1 + 2: Full GoFood Depot frontend** - `b7a343a` (feat)

## Files Created/Modified
- `src/hooks/convex/useGoFoodDepot.ts` - 8 query hooks + 4 mutation hooks (seedCheck, outlets, depotStock, restockSuggestions, outletMappings, menuProducts, stockGrouped, storageLocations; save/init mappings, adjustDepotStock, transferStock)
- `src/pages/GoFoodDepotManager.tsx` - Main page with outlet tabs, low-stock banner, cockpit table, mapping section; all hooks before conditionals
- `src/components/gofoodDepot/SeedWarningBlocker.tsx` - Full-page amber warning card, no dismiss
- `src/components/gofoodDepot/DepotCockpitTable.tsx` - 6-column table with InlineEditCell, restock tooltip, transfer dialog trigger
- `src/components/gofoodDepot/DepotMappingSection.tsx` - Editable mapping table with active toggle and Save button; auto-init on first load
- `src/components/gofoodDepot/DepotStockTransferDialog.tsx` - Source/qty form with available stock validation
- `src/hooks/convex/index.ts` - Added GoFood depot hooks export block
- `src/pages/index.ts` - Added GoFoodDepotManager export
- `src/App.tsx` - Added /gofood-depot route with canAccessDashboard permission

## Decisions Made
- Tasks 1 and 2 were implemented in a single commit because all components reference each other and TypeScript requires them all to be present simultaneously for compilation
- PageHeader `description` prop accepts only `string`, so the last-synced timestamp was placed in the `action` slot
- Convex-returned types use string IDs at the TypeScript level while the plan's component interfaces used typed `Id<T>` — resolved with `as any[]` casts at the prop boundary in the page component
- `transferStock` mutation has no `reason` field — removed from the dialog call (no backend equivalent)

## Deviations from Plan

None - plan executed as written. The two tasks were committed together rather than separately due to TypeScript requiring all components present for compilation; this is not a behavioral deviation.

## Issues Encountered
- Pre-existing uncommitted modification to `src/components/orders/OrderSlideOver.tsx` from Plan 19-04 work. Confirmed it was pre-existing (not caused by this plan) — out of scope per deviation rules.

## Self-Check

**Files created:**
- `src/hooks/convex/useGoFoodDepot.ts` — exists
- `src/pages/GoFoodDepotManager.tsx` — exists (min_lines: 100 requirement met: ~220 lines)
- `src/components/gofoodDepot/SeedWarningBlocker.tsx` — exists (min_lines: 20 met: ~65 lines)
- `src/components/gofoodDepot/DepotCockpitTable.tsx` — exists (min_lines: 80 met: ~250 lines)
- `src/components/gofoodDepot/DepotMappingSection.tsx` — exists (min_lines: 60 met: ~200 lines)
- `src/components/gofoodDepot/DepotStockTransferDialog.tsx` — exists

**Build:** `npm run build` passes (no type errors)
**Commit:** b7a343a exists

## Self-Check: PASSED

## Next Phase Readiness
- GoFood Depot Management page is complete and accessible at /gofood-depot
- Plans 19-04 and 19-05 have already been executed (SUMMARY files exist)
- This plan completes requirements GF-02, GF-03, GF-04, GF-05

---
*Phase: 19-gofood-depot-management-and-kitchen-production-targets*
*Completed: 2026-02-22*
