---
phase: 03-tech-debt
plan: 03
subsystem: database
tags: [convex, schema, indexes, tech-debt, QFIX-05]

# Dependency graph
requires: []
provides:
  - "Clean schema with 12 unused indexes removed, audit documented"
affects: [08-schema-cleanup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "QFIX-05 comments document removed indexes inline for audit trail"

key-files:
  created: []
  modified:
    - convex/schema.ts

key-decisions:
  - "Removed 12 indexes total (5 strong + 7 moderate candidates) after confirming zero withIndex references"
  - "Kept inventoryBatches.by_location (1 active reference in storageLocations/mutations.ts)"
  - "Kept productionTargetLogs.by_date (zero references but needed for future audit log display)"
  - "Kept orderItemProduction.by_production_type (non-deprecated field, reasonable for future use)"
  - "Added inline QFIX-05 comments documenting each removal for audit trail"

patterns-established:
  - "Schema index audit: verify with withIndex grep before removal, document removals inline"

# Metrics
duration: 5min
completed: 2026-02-13
---

# Phase 3 Plan 3: Index Audit Summary

**Removed 12 unused schema indexes from convex/schema.ts after grep-verified audit (QFIX-05)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-13T09:35:47Z
- **Completed:** 2026-02-13T09:40:28Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Audited all 14 candidate indexes from research against actual `withIndex()` usage in codebase
- Removed 12 confirmed unused indexes (5 strong + 7 moderate candidates)
- Verified every removal with grep -- zero false positives
- TypeScript type-check passes after changes

## Task Commits

Each task was committed atomically:

1. **Task 1: Verify index usage and remove unused indexes from schema** - `543e60b` (chore)

## Files Created/Modified
- `convex/schema.ts` - Removed 12 unused indexes with inline QFIX-05 audit comments

## Decisions Made
- Removed 12 indexes total after confirming zero `withIndex()` references for each
- Kept `inventoryBatches.by_location` -- has 1 active reference in `storageLocations/mutations.ts`
- Kept `productionTargetLogs.by_date` -- zero references but standard audit log index, likely needed soon
- Kept `orderItemProduction.by_production_type` -- non-deprecated field (`productionUnitTypeId`), reasonable for future queries
- Added inline `// QFIX-05:` comments documenting each removal for traceability

## Removed Indexes (QFIX-05 Audit)

| # | Table | Index | Reason |
|---|-------|-------|--------|
| 1 | ingredients | by_brand | Zero withIndex references |
| 2 | orderItems | by_product_name | Zero withIndex references |
| 3 | orderItems | by_production_type | Deprecated field (productionType), zero references |
| 4 | orderItemProduction | by_remaining | Zero withIndex references |
| 5 | orderItemProduction | by_completion | Zero withIndex references |
| 6 | productionLog | by_menu_product_timestamp | Prefix duplicate of by_menu_product, zero references |
| 7 | productionLog | by_action | Zero withIndex references |
| 8 | productionProductTargets | by_date_product | Prefix subset of by_date_source_product, zero references |
| 9 | productionTargetLogs | by_date_timestamp | Zero references, insert-only table |
| 10 | inventoryBatches | by_status | Zero references, queries use by_fifo/by_component + .filter() |
| 11 | componentTransactions | by_batch | Zero withIndex references on this table |
| 12 | componentTransactions | by_order | Zero withIndex references on this table |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Build (`npm run build`) has pre-existing TS errors on main branch (unrelated to schema changes in `src/components/orders/OrderHeader.tsx` and `convex/orders/mutations/statusUpdates.ts`). TypeScript type-check (`npx tsc --noEmit`) passes cleanly for the schema changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Schema indexes cleaned up, ready for Phase 8 (Schema Cleanup) when its dependencies are met
- No blockers introduced

---
*Phase: 03-tech-debt*
*Completed: 2026-02-13*

## Self-Check: PASSED
- convex/schema.ts: FOUND
- 03-03-SUMMARY.md: FOUND
- commit 543e60b: FOUND
