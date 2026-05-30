---
phase: 70-data-accuracy-foundation
plan: 01
subsystem: api
tags: [convex, cron, revenue, sync, migration, externalRevenue, COGS]

# Dependency graph
requires:
  - phase: 30-external-data-integration
    provides: saveRevenue, saveRevenueItems, externalSyncLogs infrastructure
provides:
  - Internal revenue pipeline generates externalRevenueItems for COGS resolution
  - Hourly cron for automatic internal order sync
  - forceFullSync parameter for full backfill capability
  - Backfill All Orders button in Sales Analytics Settings
  - Migration to fix stuck Confirmed orders
affects: [70-02, income-statement, sales-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns: [cron-driven-sync, revenue-item-generation, migration-with-audit-trail]

key-files:
  created:
    - tests/convex/internalAdapter.test.ts
    - convex/migrations/fixConfirmedOrders.ts
  modified:
    - convex/integrations/internal/adapter.ts
    - convex/integrations/internal/queries.ts
    - convex/crons.ts
    - src/components/salesAnalytics/SettingsTab.tsx

key-decisions:
  - "Used api (public) ref for cron instead of internal -- syncInternalOrders is a public action, not internalAction"
  - "Filter cancelled items via isCancelled boolean, not status field (orderItems has no status field)"
  - "Used by_order_number index (actual name) instead of by_orderNumber (plan had wrong name)"

patterns-established:
  - "Revenue item generation: adapter queries orderItems per batch, maps to saveRevenueItems with externalItemId format ${orderNumber}-${itemId}"
  - "Migration audit trail: status changes log orderEvents with triggeredBy migration identifier"

requirements-completed: [DA-01, DA-02]

# Metrics
duration: 13min
completed: 2026-04-10
---

# Phase 70 Plan 01: Fix Internal Revenue Pipeline Summary

**Internal orders now generate externalRevenueItems with linkedMenuProductId for COGS resolution, with hourly cron sync, manual backfill button, and migration to fix stuck Confirmed orders**

## Performance

- **Duration:** 13 min
- **Started:** 2026-04-10T06:38:09Z
- **Completed:** 2026-04-10T06:51:37Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- syncInternalOrders now creates both externalRevenue AND externalRevenueItems per order, enabling COGS in Income Statement
- Hourly cron registered to automatically sync internal orders revenue
- forceFullSync parameter bypasses incremental timestamp for full historical backfill
- "Backfill All Orders" button added to Sales Analytics Settings internal section
- Migration script investigates and fixes orders stuck at Confirmed status (D-03)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix internal revenue pipeline + cron registration** - `f52af9fa` (feat, TDD)
2. **Task 2: Add backfill button + fix cron ref** - `5f42bce0` (feat)
3. **Task 3: Migration for stuck Confirmed orders** - `18f5f99f` (feat)

## Files Created/Modified
- `convex/integrations/internal/adapter.ts` - Added forceFullSync param, saveRevenueItems generation, totalItems tracking
- `convex/integrations/internal/queries.ts` - Added getOrderItemsByOrderNumbers internal query
- `convex/crons.ts` - Registered hourly cron for syncInternalOrders
- `src/components/salesAnalytics/SettingsTab.tsx` - Added Backfill All Orders button with RefreshCw spinner
- `convex/migrations/fixConfirmedOrders.ts` - One-time migration to advance Confirmed orders to PaymentReceived
- `tests/convex/internalAdapter.test.ts` - 5 tests for query shape, item mapping, and sync behavior

## Decisions Made
- Used `api` (public action ref) for cron instead of `internal` -- syncInternalOrders is exported as `action`, not `internalAction`
- Corrected index name from `by_orderNumber` (plan) to `by_order_number` (actual schema)
- Used `isCancelled` boolean to filter cancelled order items instead of non-existent `status` field on orderItems

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected orderItems cancellation filter**
- **Found during:** Task 1 (getOrderItemsByOrderNumbers implementation)
- **Issue:** Plan used `item.status !== "cancelled"` but orderItems table has no status field -- uses `isCancelled: v.optional(v.boolean())` instead
- **Fix:** Changed filter to `!item.isCancelled`
- **Files modified:** convex/integrations/internal/queries.ts
- **Verification:** Tests pass, type-check clean
- **Committed in:** f52af9fa

**2. [Rule 1 - Bug] Corrected orders index name**
- **Found during:** Task 1 (getOrderItemsByOrderNumbers implementation)
- **Issue:** Plan referenced `by_orderNumber` index but actual schema declares `by_order_number`
- **Fix:** Used correct index name `by_order_number`
- **Files modified:** convex/integrations/internal/queries.ts
- **Verification:** Tests pass with convex-test schema validation
- **Committed in:** f52af9fa

**3. [Rule 1 - Bug] Fixed cron reference from internal to api**
- **Found during:** Task 2 (build verification)
- **Issue:** `internal.integrations.internal.adapter.syncInternalOrders` fails TypeScript because syncInternalOrders is a public `action`, not `internalAction`
- **Fix:** Changed import from `internal` to `api` in crons.ts
- **Files modified:** convex/crons.ts
- **Verification:** Build passes (only pre-existing MyExpenses.tsx error remains)
- **Committed in:** 5f42bce0

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
- Pre-existing build error in `src/pages/MyExpenses.tsx` (missing `submitterName` property) -- not related to this plan's changes, confirmed by stash-build-pop test
- Pre-existing test failures in k3martCockpit.test.ts, bigsellerOrders integration.test.ts, csvImportValidation.test.ts -- all unrelated to this plan

## User Setup Required
None - no external service configuration required. The cron activates automatically on deploy. Migration runs from Convex dashboard Functions tab.

## Next Phase Readiness
- Revenue pipeline complete -- Plan 02 can proceed with menu product inline cost editing and user wage field
- After deploying, run `fixConfirmedOrders` migration from dashboard, then trigger backfill from Settings tab
- Income Statement should now resolve COGS for internal channel orders

## Self-Check: PASSED

All 7 files verified present. All 3 task commits verified in git log.

---
*Phase: 70-data-accuracy-foundation*
*Completed: 2026-04-10*
