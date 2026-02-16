---
phase: quick-2
plan: 01
subsystem: orders
tags: [admin, force-complete, audit-trail, convex-mutation]

requires:
  - phase: 14-order-qol
    provides: "7-status Kanban workflow, statusTransitions helpers, OrderDetail page"
provides:
  - "Admin-only forceComplete mutation for stuck orders"
  - "Force Complete button on OrderDetail page with confirm dialog"
affects: [orders, kitchen, audit-trail]

tech-stack:
  added: []
  patterns:
    - "Admin escape hatch pattern: requireRole + audit logging + no side effects"

key-files:
  created: []
  modified:
    - convex/orders/mutations/statusUpdates.ts
    - convex/orders/mutations/index.ts
    - src/pages/OrderDetail.tsx

key-decisions:
  - "Used api.orders.mutations.statusUpdates.forceComplete path (direct module) instead of barrel index path for type safety"
  - "No inventory side effects by design -- forceComplete only patches status and payment fields"

patterns-established:
  - "Admin data-fix pattern: requireRole admin gate + logOrderEvent with data_fix category + logStatusTransition for timeline"

duration: 5min
completed: 2026-02-16
---

# Quick Task 2: Admin Force Complete Summary

**Admin-only forceComplete mutation and UI button to mark stuck orders as Complete+Paid without inventory side effects**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-16T07:42:22Z
- **Completed:** 2026-02-16T07:47:25Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Admin-gated forceComplete mutation that bypasses all inventory integration (no stock reservation, no material consumption)
- Audit trail with admin_force_complete event type and data_fix category
- Force Complete button on OrderDetail visible only to admin users on non-terminal orders
- ConfirmDialog with optional reason textarea for accountability

## Task Commits

Each task was committed atomically:

1. **Task 1: Add forceComplete mutation and export** - `1dd65f2` (feat)
2. **Task 2: Add Force Complete button to OrderDetail page** - `5bf0597` (feat)

## Files Created/Modified
- `convex/orders/mutations/statusUpdates.ts` - Added forceComplete mutation with admin gate, status patch, and audit logging
- `convex/orders/mutations/index.ts` - Added forceComplete to Status Updates barrel export
- `src/pages/OrderDetail.tsx` - Added admin-only Force Complete button with ConfirmDialog, reason textarea, and toast feedback

## Decisions Made
- Used `api.orders.mutations.statusUpdates.forceComplete` direct module path instead of barrel `api.orders.mutations.forceComplete` for reliable type resolution without regenerating Convex types
- ConfirmDialog children slot used for reason textarea (verified ConfirmDialog accepts children prop)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Changed API path from barrel to direct module**
- **Found during:** Task 2 (UI button implementation)
- **Issue:** Plan specified `api.orders.mutations.forceComplete` (via barrel index.ts), but generated Convex types resolve barrel as `api.orders.mutations.index.forceComplete`. The direct module path `api.orders.mutations.statusUpdates.forceComplete` is already in generated types.
- **Fix:** Changed useMutation call to use direct statusUpdates module path
- **Files modified:** src/pages/OrderDetail.tsx
- **Verification:** `tsc --noEmit` passes cleanly
- **Committed in:** 5bf0597 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** API path change necessary for type resolution. No scope creep.

## Issues Encountered
- Pre-existing `tsc -b` build error in `src/components/orders/OrderSlideOver.tsx` (line 141) unrelated to this task. `tsc --noEmit` passes clean. Logged as out-of-scope.

## User Setup Required
None - no external service configuration required.

## Verification
- `npm run type-check` passes (no errors)
- forceComplete mutation is admin-gated via requireRole
- No inventory functions called in forceComplete (verified via grep)
- Button visibility gated on `isAdmin && !['Complete', 'Cancelled'].includes(order.status)`
- Audit trail logs both orderEvent (admin_force_complete/data_fix) and statusTransition

## Next Phase Readiness
- Feature ready for deployment via `npx convex dev` (regenerates types) then `npx convex deploy`
- Pre-existing OrderSlideOver.tsx type error should be fixed separately

---
*Quick Task: 2*
*Completed: 2026-02-16*
