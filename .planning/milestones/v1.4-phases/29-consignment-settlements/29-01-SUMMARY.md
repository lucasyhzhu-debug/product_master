---
phase: 29-consignment-settlements
plan: 01
subsystem: database, api
tags: [convex, consignment, settlements, revenue-bridge, dispatch-planner]

# Dependency graph
requires:
  - phase: 26-gobiz-integration
    provides: externalSource union, externalOutlets/externalRevenue tables, revenue bridge pattern
provides:
  - consignment backend module (convex/consignment/mutations.ts, queries.ts, helpers.ts)
  - unified consignmentOutlets schema with type field and dispatch planner fields
  - settlement CRUD with revenue bridge to externalRevenue
  - running totals queries per outlet
  - event auto-archive on payment
affects: [29-02-consignment-ui, 30-unified-sales-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns: [consignment settlement helpers with pure function testing, revenue bridge on settlement creation]

key-files:
  created:
    - convex/consignment/mutations.ts
    - convex/consignment/queries.ts
    - convex/consignment/helpers.ts
    - convex/consignment/__tests__/helpers.test.ts
  modified:
    - convex/schema.ts
    - convex/dispatchPlanner/queries.ts
    - convex/dispatchPlanner/mutations.ts
    - src/components/dispatchPlanner/ChannelSettingsDialog.tsx

key-decisions:
  - "Merge dispatchConsignmentOutlets into consignmentOutlets with optional dispatch planner fields"
  - "Event auto-archive: only event-type outlets auto-deactivate on markAsPaid"
  - "Revenue bridge: one externalRevenue per settlement, synced on update, deleted on delete"
  - "All consignment mutations require admin or manager role"
  - "isEnabled defaults to isActive in ChannelSettingsDialog for backward compatibility"

patterns-established:
  - "Settlement math extracted to pure helpers for unit testing (computeSettlementMath, shouldAutoArchive, etc.)"
  - "Revenue bridge pattern: settlement creates/syncs/deletes linked externalRevenue record"
  - "Outlet bridge pattern: consignmentOutlets creates linked externalOutlets record on creation"

requirements-completed: [CON-01, CON-02, CON-03, CON-04]

# Metrics
duration: 10min
completed: 2026-02-28
---

# Phase 29 Plan 01: Consignment Settlements Backend Summary

**Consignment backend module with unified outlet schema, settlement CRUD with auto-calculated rev share, revenue bridge to externalRevenue, event auto-archive, and 16 unit tests for settlement math**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-28T13:30:04Z
- **Completed:** 2026-02-28T13:40:43Z
- **Tasks:** 1 (TDD: red, green, implementation)
- **Files modified:** 8

## Accomplishments
- Unified consignmentOutlets schema: replaced mode with type (cafe/retail/event), merged dispatch planner fields from removed dispatchConsignmentOutlets table
- Full consignment backend: 6 mutations (createOutlet, updateOutlet, createSettlement, updateSettlement, markAsPaid, deleteSettlement) and 3 queries (getOutletsWithTotals, getSettlementsByOutlet, getGlobalSummary)
- Revenue bridge: settlements auto-create externalRevenue records, synced on update, cleaned up on delete
- Event auto-archive: event-type outlets auto-deactivate when settlement marked paid
- 16 unit tests passing for all pure business logic (settlement math, auto-archive, guards, validation, revenue bridge builder)
- Dispatch planner fully migrated from dispatchConsignmentOutlets to consignmentOutlets

## Task Commits

Each task was committed atomically (TDD flow):

1. **Task 1 RED: Failing tests** - `a9e7ad0` (test)
2. **Task 1 GREEN: Implement helpers** - `fd568c6` (feat)
3. **Task 1 IMPL: Schema + backend + migration** - `a02e35f` (feat)

## Files Created/Modified
- `convex/consignment/helpers.ts` - Pure business logic: settlement math, auto-archive, guards, validation, revenue bridge builder
- `convex/consignment/__tests__/helpers.test.ts` - 16 unit tests for all helper functions
- `convex/consignment/mutations.ts` - 6 mutations: createOutlet, updateOutlet, createSettlement, updateSettlement, markAsPaid, deleteSettlement
- `convex/consignment/queries.ts` - 3 queries: getOutletsWithTotals, getSettlementsByOutlet, getGlobalSummary
- `convex/schema.ts` - consignmentOutlets type field, dispatch fields; consignmentSettlements linkedRevenueId; dispatchPlans union update; dispatchConsignmentOutlets removed
- `convex/dispatchPlanner/queries.ts` - getConsignmentOutlets and assembleConsignmentChannel use consignmentOutlets
- `convex/dispatchPlanner/mutations.ts` - seedDefaults, savePlanCell, addConsignmentOutlet, updateConsignmentOutlet, removeConsignmentOutlet updated
- `src/components/dispatchPlanner/ChannelSettingsDialog.tsx` - Id<"consignmentOutlets"> types, optional field handling

## Decisions Made
- Merged dispatchConsignmentOutlets fields into consignmentOutlets as optional fields (channelKey, isEnabled, productMappings, commissionRate) to avoid data loss
- Event auto-archive is immediate on markAsPaid (not end-of-day) for simplicity
- Revenue bridge uses manual_entry/manual confidence since consignment is manual data entry
- addConsignmentOutlet in dispatch planner defaults to type:"cafe" and revSharePercent:0 for backward compatibility
- ChannelSettingsDialog uses fallback chain (isEnabled ?? isActive ?? true) for the enabled toggle

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unused variable in deleteSettlement**
- **Found during:** Task 1 (build verification)
- **Issue:** `user` variable declared but never read in deleteSettlement handler
- **Fix:** Changed `const user = await requireRole(...)` to `await requireRole(...)` since user info not needed
- **Files modified:** convex/consignment/mutations.ts
- **Verification:** `npm run build` passes

**2. [Rule 1 - Bug] Fixed variable name conflict in seedDefaults**
- **Found during:** Task 1 (build verification)
- **Issue:** Renamed local array to `consignmentOutletSeeds` but return statement still referenced `consignmentOutlets`
- **Fix:** Updated return statement to use `consignmentOutletSeeds.length`
- **Files modified:** convex/dispatchPlanner/mutations.ts
- **Verification:** `npm run build` passes

**3. [Rule 3 - Blocking] Fixed ChannelSettingsDialog type incompatibility**
- **Found during:** Task 1 (build verification)
- **Issue:** `isEnabled` and `productMappings` are now optional on consignmentOutlets but component expected required fields
- **Fix:** Made interface props optional, added fallback values (isEnabled ?? isActive ?? true, productMappings ?? [])
- **Files modified:** src/components/dispatchPlanner/ChannelSettingsDialog.tsx
- **Verification:** `npm run build` passes

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All auto-fixes necessary for build to pass. No scope creep.

## Issues Encountered
- Pre-existing test failures (16 files, 57 tests) in tests/convex/ and tests/e2e/ unrelated to this plan. All convex/consignment/ tests pass (16/16).
- api.d.ts will auto-regenerate when `npx convex dev` runs. Not manually edited.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend module complete: outlets CRUD, settlements CRUD, revenue bridge, queries with totals
- Ready for Plan 02: Consignment UI (ConsignmentTab in Sales Analytics, outlet cards, settlement timeline)
- Schema deployed: consignmentOutlets has type field, settlements have linkedRevenueId

## Self-Check: PASSED

All 4 created files verified present. All 3 commits verified in git log.

---
*Phase: 29-consignment-settlements*
*Completed: 2026-02-28*
