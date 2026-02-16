---
phase: 04-bugs
plan: 01
subsystem: orders
tags: [convex, react, dialog, audit-trail, i18n, stock-management]

# Dependency graph
requires: []
provides:
  - English-language stock shortage dialog with structured item display
  - Override reason requirement (min 5 chars) for stock shortage overrides
  - Expanded override role access (order_staff, manager, admin)
  - Audit logging of stock overrides via orderEvents table
  - getOrderEvents query for displaying order audit trail
  - Override event display card on Order Detail page
affects: [orders, inventory, kitchen]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Override audit trail via orderEvents with stock_override eventType"
    - "Structured shortage detail parsing with regex fallback"

key-files:
  created: []
  modified:
    - convex/orders/mutations/inventoryIntegration.ts
    - convex/orders/mutations/statusUpdates.ts
    - convex/orders/queries.ts
    - src/hooks/convex/useOrders.ts
    - src/pages/OrderDetail.tsx

key-decisions:
  - "Override audit stores user-provided reason (not re-fetched shortage details) since reservation already succeeded by the time audit is logged"
  - "Expanded override access to order_staff role in addition to manager/admin per plan spec"
  - "Used regex parsing for shortage line display with raw line fallback for forward compatibility"

patterns-established:
  - "Stock override audit: logOrderEvent with eventType=stock_override, reason, and metadata.overrideBy"
  - "Override events displayed as amber card in Order Detail right column"

# Metrics
duration: 7min
completed: 2026-02-13
---

# Phase 4 Plan 1: Stock Shortage Override Dialog (BUG-01) Summary

**Redesigned stock shortage dialog with English UX, typed reason requirement, expanded role access, and orderEvents audit trail**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-13T15:56:09Z
- **Completed:** 2026-02-13T16:03:12Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Replaced all Indonesian text in the shortage dialog with English equivalents
- Added required reason textarea (min 5 chars) before override button enables
- Expanded override access from manager/admin-only to order_staff/manager/admin
- Backend logs stock_override audit event via logOrderEvent with reason, overrideBy, and status metadata
- Added getOrderEvents query and override history amber card on Order Detail page

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend -- English error, override args, audit logging, events query** - `cb5ed0a` (feat)
2. **Task 2: Frontend -- Redesigned shortage dialog with reason, expanded roles, audit display** - `e41d0de` (feat)

## Files Created/Modified
- `convex/orders/mutations/inventoryIntegration.ts` - Changed error message from Indonesian to English
- `convex/orders/mutations/statusUpdates.ts` - Added overrideReason/overrideBy args, audit logging via logOrderEvent
- `convex/orders/queries.ts` - Added getOrderEvents query for audit trail
- `src/hooks/convex/useOrders.ts` - Extended updateStatus type with overrideReason/overrideBy
- `src/pages/OrderDetail.tsx` - Redesigned shortage dialog, added audit trail card, expanded roles

## Decisions Made
- Override audit stores user-provided reason (not re-fetched shortage details) since reservation already succeeded with skipStockCheck by the time audit is logged
- Expanded override access to order_staff role in addition to manager/admin per plan spec
- Used regex parsing for structured shortage line display with raw line fallback for forward compatibility

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused OrderItem type import**
- **Found during:** Task 2 (Frontend changes)
- **Issue:** `OrderItem` type was imported but not used in OrderDetail.tsx, causing tsc build failure
- **Fix:** Removed unused import from the type import line
- **Files modified:** src/pages/OrderDetail.tsx
- **Verification:** `tsc --noEmit` passes
- **Committed in:** e41d0de (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor import cleanup, no scope change.

## Issues Encountered
- Pre-existing `tsc -b` error in `src/main.tsx` (SessionProvider type mismatch from unrelated working tree changes) prevented full `npm run build` from passing. This is not related to our changes -- `tsc --noEmit` passes cleanly and `vite build` succeeds. The error exists in unstaged changes to src/main.tsx.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 04-01 complete, ready for Plan 04-02 execution
- All success criteria met: English dialog, reason requirement, expanded roles, audit trail

---
*Phase: 04-bugs*
*Completed: 2026-02-13*
