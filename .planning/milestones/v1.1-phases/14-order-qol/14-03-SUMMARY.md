---
phase: 14-order-qol
plan: 03
subsystem: api
tags: [convex, kanban, order-lifecycle, audit-trail, mutations]

# Dependency graph
requires:
  - phase: 14-01
    provides: 7-status schema migration, statusTransitions helpers, orderEvents table
provides:
  - listForKanban query with 6-column grouped orders
  - getAuditTrail query with user-enriched events
  - submitOrder mutation (Draft -> AwaitingPayment)
  - moveForward/moveBackward validated transition mutations
  - expediteOrder mutation (rush PaymentReceived -> BeingPrepared)
  - copyFromCancelled mutation (new Draft from cancelled order)
affects: [14-04-kanban-ui, 14-05-order-creation, 14-06-auto-entry]

# Tech tracking
tech-stack:
  added: []
  patterns: [validated-transitions, token-to-userId-audit, forward-backward-pattern]

key-files:
  created: []
  modified:
    - convex/orders/queries.ts
    - convex/orders/mutations/orderCrud.ts
    - convex/orders/mutations/statusUpdates.ts
    - convex/schema.ts

key-decisions:
  - "Customer search already existed in customers/queries.ts -- reused rather than duplicating"
  - "updateStatus retained as escape hatch with deprecation comment; new code uses moveForward/moveBackward"
  - "copyFromCancelled copies non-cancelled items only, excludes vouchers per user decision"
  - "expediteOrder consumes materials on entry (same as moveForward to BeingPrepared)"
  - "moveBackward from BeingPrepared resets package status on order items"

patterns-established:
  - "Token-to-userId resolution: use getSessionUser(ctx, token) in mutations for audit trail userId"
  - "Forward/backward pattern: moveForward uses FORWARD_TRANSITIONS map, moveBackward validates against BACKWARD_TRANSITIONS"
  - "Inventory side effects: reserve on PaymentReceived, consume on BeingPrepared, release on backward/cancel"

# Metrics
duration: 4min
completed: 2026-02-15
---

# Phase 14 Plan 03: Kanban Backend Queries + Order Lifecycle Mutations Summary

**Kanban-optimized queries (6-column grouping, audit trail) and validated order lifecycle mutations (submit, forward/backward, expedite, copy-from-cancelled) with inventory side effects**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-15T14:07:39Z
- **Completed:** 2026-02-15T14:12:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- listForKanban query returns orders grouped into 6 Kanban columns with items and creator names
- getAuditTrail query returns orderEvents enriched with user names, sorted newest first
- Complete order lifecycle: create as Draft, submit, moveForward, moveBackward, expedite, copyFromCancelled
- All mutations validate transitions and log audit events with userId resolved from session token
- Inventory side effects integrated: stock reservation, material consumption, reservation release

## Task Commits

Each task was committed atomically:

1. **Task 1: Kanban queries, audit trail, and customer search** - `fd39a3e` (feat)
2. **Task 2: Order lifecycle mutations** - `a6d573e` (feat)

## Files Created/Modified
- `convex/orders/queries.ts` - Added listForKanban (6-column grouping) and getAuditTrail (enriched events)
- `convex/orders/mutations/orderCrud.ts` - Added submitOrder (Draft->AwaitingPayment) and copyFromCancelled (new Draft from cancelled)
- `convex/orders/mutations/statusUpdates.ts` - Added moveForward, moveBackward, expediteOrder with validation and inventory side effects
- `convex/schema.ts` - Added copiedFromOrderId optional field to orders table

## Decisions Made
- Customer search already existed in `convex/customers/queries.ts` with name + phone text search -- no changes needed
- Retained `updateStatus` as lower-level escape hatch with deprecation comment; new Kanban code should use moveForward/moveBackward
- copyFromCancelled copies only non-cancelled items, removes all vouchers/discounts, sets due date to tomorrow
- expediteOrder applies same material consumption as moveForward to BeingPrepared (consistency)
- moveBackward from BeingPrepared resets packageStatus/ballsFilled on order items (unallocate packages)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed type narrowing for backward transition status**
- **Found during:** Task 2 (moveBackward implementation)
- **Issue:** TypeScript rejected `Partial<{ status: string }>` as incompatible with Convex patch validator (status must be union literal)
- **Fix:** Used `OrderStatusUpdate` interface with type assertion for status field
- **Files modified:** convex/orders/mutations/statusUpdates.ts
- **Verification:** `npm run build` passes
- **Committed in:** a6d573e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Type fix necessary for compilation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend data layer complete for Kanban UI (Plan 04) and Order Creation page (Plan 05)
- listForKanban provides grouped data ready for column rendering
- moveForward/moveBackward provide validated transitions for Kanban action buttons
- getAuditTrail provides data for order details slide-over timeline
- expediteOrder ready for "Expedite Production" button
- copyFromCancelled ready for "Copy to new order" on cancelled cards

---
*Phase: 14-order-qol*
*Completed: 2026-02-15*
