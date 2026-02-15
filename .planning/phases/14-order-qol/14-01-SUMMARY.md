---
phase: 14-order-qol
plan: 01
subsystem: database, api
tags: [convex, schema-migration, order-status, kanban, typescript]

# Dependency graph
requires:
  - phase: 13-api-audit
    provides: "Stable API layer and integration health monitoring"
provides:
  - "7-status order model (Draft, AwaitingPayment, PaymentReceived, BeingPrepared, AwaitingDelivery, Complete, Cancelled)"
  - "Forward/backward transition maps for Kanban board"
  - "Status migration mutation for existing orders"
  - "Creator attribution (createdByUserId) and expedited flag on orders"
  - "Frontend types, constants, hooks updated for new model"
  - "6 Kanban column categories (awaiting, paid, kitchen, ready, completed, cancelled)"
affects: [14-02, 14-03, 14-04, 14-05, 14-06, 15-kitchen-overhaul]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Linear status model with forward/backward transition maps"
    - "Inventory consolidated: reserve on PaymentReceived, consume ALL on BeingPrepared"
    - "Kitchen visibility: BeingPrepared only"
    - "Status categories for Kanban column grouping"

key-files:
  created:
    - convex/orders/mutations/migrations.ts (migrateToNewStatuses)
  modified:
    - convex/schema.ts
    - convex/orders/validators.ts
    - convex/orders/helpers/statusTransitions.ts
    - convex/orders/mutations/statusUpdates.ts
    - convex/orders/mutations/orderCrud.ts
    - convex/orders/mutations/kitchen.ts
    - convex/orders/mutations/packaging.ts
    - convex/orders/queries.ts
    - convex/orders/kitchenQueries.ts
    - convex/orders/whatsapp.ts
    - convex/orders/whatsappHelpers.ts
    - src/lib/types.ts
    - src/lib/orderConstants.ts
    - src/hooks/convex/useOrders.ts
    - tests/convex/orderLifecycle.test.ts

key-decisions:
  - "Removed getDisplayStatus() -- Phase 14 status names are clean enough for direct display"
  - "STATUS_CATEGORIES uses 6 columns (awaiting, paid, kitchen, ready, completed, cancelled)"
  - "Removed channel from OrderCreateInput, replaced with createdByUserId"
  - "Archived migratePackagingToBoxed migration (old Packaging/Boxed statuses removed from schema)"
  - "All material consumption (production + boxing + sticker) happens on BeingPrepared entry"
  - "Backward transitions: PaymentReceived clears confirmedAt (sales reversal)"

patterns-established:
  - "Status-as-Kanban: each status is a Kanban column, no sub-states"
  - "Inventory consolidation: single consume trigger instead of per-stage"
  - "Kitchen visibility computed from status, not stored flag"

# Metrics
duration: ~45min (across 2 sessions due to context reset)
completed: 2026-02-15
---

# Phase 14 Plan 01: Status Model Migration Summary

**Migrated order schema from 12+ statuses to 7-status Kanban model with forward/backward transitions, consolidated inventory triggers, and full frontend type alignment**

## Performance

- **Duration:** ~45 min (across 2 sessions)
- **Tasks:** 2 completed
- **Files modified:** 40+ (backend, frontend, tests)

## Accomplishments
- Replaced 12+ order statuses with clean 7-status model (Draft, AwaitingPayment, PaymentReceived, BeingPrepared, AwaitingDelivery, Complete, Cancelled)
- Rewrote status transition engine with explicit forward/backward maps
- Consolidated inventory integration: reserve on PaymentReceived, consume ALL materials on BeingPrepared
- Added creator attribution (createdByUserId), expedited flag, kitchenEnteredAt timestamp
- Updated all frontend types, constants, and hooks for new model
- Rewrote orderLifecycle tests from 1199 lines to 816 lines for 7-status model
- Build passes, 543/544 tests pass (1 pre-existing gobiz test failure)

## Task Commits

1. **Task 1: Schema migration + status engine rewrite** - `b9d71da` (feat)
2. **Task 2: Frontend type + constant updates** - `f1ef356` (feat, mixed with Phase 15 docs)

## Files Created/Modified

### Backend (convex/)
- `convex/schema.ts` - 7-status union, createdByUserId, expedited, kitchenEnteredAt fields
- `convex/orders/validators.ts` - Updated statusValidator to 7 values
- `convex/orders/helpers/statusTransitions.ts` - Rewritten with FORWARD_TRANSITIONS and BACKWARD_TRANSITIONS maps
- `convex/orders/mutations/statusUpdates.ts` - Consolidated inventory: PaymentReceived reserves, BeingPrepared consumes all
- `convex/orders/mutations/orderCrud.ts` - Removed transitionedToInProduction, updated create
- `convex/orders/mutations/kitchen.ts` - Removed auto-transitions, BeingPrepared only
- `convex/orders/mutations/packaging.ts` - Updated status references
- `convex/orders/mutations/migrations.ts` - migrateToNewStatuses mutation, archived migratePackagingToBoxed
- `convex/orders/mutations/index.ts` - Removed migratePackagingToBoxed export
- `convex/orders/queries.ts` - Updated status filters
- `convex/orders/kitchenQueries.ts` - BeingPrepared visibility
- `convex/orders/whatsapp.ts` - Updated status references
- `convex/orders/whatsappHelpers.ts` - Updated status label mapping
- `convex/orders/helpers/ballDistribution.ts` - Query BeingPrepared only, removed auto-transitions
- `convex/dashboard/queries.ts` - Updated terminal/non-terminal status lists
- `convex/productionTargets/queries.ts` - Updated demand statuses
- `convex/productionTargets/mutations.ts` - Updated order queries
- `convex/integrations/internal/config.ts` - Updated REVENUE_COUNTABLE_STATUSES

### Frontend (src/)
- `src/lib/types.ts` - OrderStatus 7-value union, OrderStatsPipeline 3 fields
- `src/lib/orderConstants.ts` - Removed getDisplayStatus(), 6 Kanban categories
- `src/hooks/convex/useOrders.ts` - Updated OrderStatusType, removed channel from OrderCreateInput
- `src/hooks/convex/useDashboard.ts` - Updated pipeline mapping
- `src/components/dashboard/OrderStatsCards.tsx` - Updated pipeline bars
- `src/components/dashboard/ProductionQueueTable.tsx` - Direct status display
- `src/components/orders/OrderForm.tsx` - Removed channel property
- `src/components/orders/OrderHeader.tsx` - Direct status display
- `src/components/orders/OrderStatusPanel.tsx` - Updated status options
- `src/pages/OrderDetail.tsx` - Updated STATUS_ORDER, step wizard, removed unused imports
- `src/pages/OrderManager.tsx` - Updated category references
- `src/pages/PackagingView.tsx` - AwaitingDelivery transition

### Tests
- `tests/convex/helpers.ts` - Updated STATUS_PROGRESSION, type union
- `tests/convex/orders.test.ts` - PaymentReceived instead of Confirmed
- `tests/convex/inventory.test.ts` - PaymentReceived status
- `tests/convex/orderLifecycle.test.ts` - Full rewrite for 7-status model
- `convex/orders/__tests__/statusTransitions.test.ts` - New status model
- `convex/orders/__tests__/whatsapp.test.ts` - Updated labels
- `tests/convex/ballDistribution.test.ts` - BeingPrepared only

## Decisions Made
- Removed `getDisplayStatus()` entirely -- Phase 14 status names are human-readable, no mapping needed
- STATUS_CATEGORIES renamed from `paidReady` to `paid` for clarity
- Archived `migratePackagingToBoxed` mutation since old statuses no longer exist in schema
- All inventory consumption consolidated to single BeingPrepared trigger (was split across Boxed/Labeled)
- Backward transition from PaymentReceived clears confirmedAt (sales reversal semantics)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unused orderReceivedBalls variable in ballDistribution.ts**
- **Found during:** Task 2 (build verification)
- **Issue:** After removing auto-transitions, the `orderReceivedBalls` variable was declared but never used
- **Fix:** Removed the variable declaration and assignment
- **Files modified:** convex/orders/helpers/ballDistribution.ts

**2. [Rule 1 - Bug] Archived migratePackagingToBoxed mutation**
- **Found during:** Task 2 (build verification)
- **Issue:** Old migration used "Packaging" and "Boxed" status literals no longer in schema
- **Fix:** Replaced mutation with comment, removed from exports
- **Files modified:** convex/orders/mutations/migrations.ts, convex/orders/mutations/index.ts

**3. [Rule 1 - Bug] Updated test files for new status model**
- **Found during:** Task 2 (test verification)
- **Issue:** orderLifecycle.test.ts, orders.test.ts, inventory.test.ts used old status names (Confirmed, InProduction, etc.)
- **Fix:** Full rewrite of orderLifecycle.test.ts, status references updated in all test files
- **Files modified:** tests/convex/orderLifecycle.test.ts, tests/convex/orders.test.ts, tests/convex/inventory.test.ts, tests/convex/helpers.ts

**4. [Rule 1 - Bug] Removed unused PackageStatusDisplay import and getPackageItems function**
- **Found during:** Task 2 (build verification)
- **Issue:** OrderDetail.tsx had unused imports after status model changes
- **Fix:** Removed unused import and dead function
- **Files modified:** src/pages/OrderDetail.tsx

---

**Total deviations:** 4 auto-fixed (all Rule 1 bugs)
**Impact on plan:** All fixes necessary for build/test correctness. No scope creep.

## Issues Encountered
- Context window reset mid-execution required continuation session. All work was recovered and completed.
- Task 2 frontend changes were committed mixed with Phase 15 planning docs in `f1ef356` instead of as a separate commit.

## User Setup Required
None - no external service configuration required. Run `migrateToNewStatuses` mutation from Convex dashboard after deploying to production.

## Next Phase Readiness
- 7-status model is the foundation for all subsequent Phase 14 plans
- Plan 02 (Kanban Board) can proceed -- STATUS_CATEGORIES defines the 6 columns
- Plan 03 (Order Form) can proceed -- OrderCreateInput updated
- Plans 04-06 depend on the status model established here

---
*Phase: 14-order-qol*
*Completed: 2026-02-15*
