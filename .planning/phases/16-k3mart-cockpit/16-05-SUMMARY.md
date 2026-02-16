---
phase: 16-k3mart-cockpit
plan: 05
subsystem: api
tags: [convex, k3mart, bug-fix, product-mapping, kitchen-targets]

# Dependency graph
requires:
  - phase: 16-04
    provides: "confirmDayPlan kitchen integration, productionProductTargets upsert"
provides:
  - "confirmDayPlan handles both initial confirm and re-confirm after editing confirmed plans"
  - "Outlet settings resolves K3Mart product names from externalProductMappings"
  - "Default prices derived from latest stock snapshots"
  - "Weekly grid includes externalProductName for human-readable display"
affects: [16-06, k3mart-cockpit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Re-confirm pattern: query draft first, fall back to confirmed if none found"
    - "Snapshot price enrichment: derive default prices from externalStockSnapshots when mapping table lacks price field"

key-files:
  created: []
  modified:
    - convex/k3martCockpit/mutations.ts
    - convex/k3martCockpit/queries.ts
    - src/pages/K3MartCockpit.tsx

key-decisions:
  - "Re-confirm uses same confirmDayPlan mutation (no new endpoint) with isReconfirm flag"
  - "Default prices sourced from externalStockSnapshots since externalProductMappings has no price field"
  - "externalProductName added to both getOutletSettings and getWeeklyDispatchPlans response shapes"

patterns-established:
  - "Re-confirm pattern: try draft status first, fall back to confirmed, skip status change on re-confirm"

# Metrics
duration: 3min
completed: 2026-02-16
---

# Phase 16 Plan 05: Backend Bug Fixes Summary

**Fixed confirmDayPlan re-confirm after edit, resolved K3Mart product names from externalProductMappings, and derived default prices from stock snapshots**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-16T21:14:04Z
- **Completed:** 2026-02-16T21:17:47Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- confirmDayPlan now handles both initial confirm (draft->confirmed) and re-confirm (confirmed->confirmed with kitchen target update)
- getOutletSettings resolves K3Mart product names ("Dubai Chewy Cookie") from externalProductMappings instead of showing raw product codes ("F03131-P00002")
- Default prices derived from latest externalStockSnapshots (e.g., 45000) instead of showing Rp 0
- getWeeklyDispatchPlans response includes externalProductName alongside POS product name for grid display

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix confirmDayPlan re-confirm + product name resolution** - `65105e7` (fix)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `convex/k3martCockpit/mutations.ts` - confirmDayPlan now queries draft first, falls back to confirmed plans for re-confirm; skips status change on re-confirm; returns isReconfirm flag
- `convex/k3martCockpit/queries.ts` - getOutletSettings builds mappingByCode from externalProductMappings with snapshot price enrichment; getWeeklyDispatchPlans adds externalProductName to outlet products
- `src/pages/K3MartCockpit.tsx` - Maps new defaultPrice and externalProductName fields from outlet settings query

## Decisions Made
- Re-confirm uses same confirmDayPlan mutation with internal isReconfirm detection (no new API endpoint needed)
- Since externalProductMappings schema has no price field, default prices are enriched from latest externalStockSnapshots per outlet
- externalProductName (K3Mart name) added as separate field alongside productName (POS name) to preserve backward compatibility

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing build error in OrderSlideOver.tsx (line 141, "Packaging" type mismatch) -- unrelated to Phase 16, already documented in deferred-items.md

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All backend bugs fixed, ready for Plan 06 (final visual verification or additional features)
- Kitchen targets update correctly on both initial confirm and re-confirm

---
*Phase: 16-k3mart-cockpit*
*Completed: 2026-02-16*
