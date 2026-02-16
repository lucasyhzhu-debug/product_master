---
phase: 14-order-qol
plan: 05
subsystem: ui
tags: [react, order-creation, customer-search, date-fns, pos]

# Dependency graph
requires:
  - phase: 14-03
    provides: Kanban backend queries and order lifecycle mutations
provides:
  - Dedicated order creation page at /orders/new
  - CustomerSearch component with debounced autocomplete
  - DueDatePills component with 7-day quick-tap pills
  - QuickAddressButtons for Crystal/Goldfinch pickup locations
affects: [14-06, kitchen-overhaul]

# Tech tracking
tech-stack:
  added: [date-fns ^4.1.0]
  patterns: [customer-first form layout, quick-tap date pills, reuse of existing POS grid components]

key-files:
  created:
    - src/pages/OrderCreate.tsx
    - src/components/orders/CustomerSearch.tsx
    - src/components/orders/DueDatePills.tsx
    - src/components/orders/QuickAddressButtons.tsx
  modified:
    - src/App.tsx
    - src/pages/index.ts
    - package.json

key-decisions:
  - "Reused existing ProductButtons/DeliveryToggle/VoucherInput rather than rebuilding"
  - "Submit creates Draft then transitions to AwaitingPayment in single flow"
  - "date-fns installed for DueDatePills pill generation (isToday, isTomorrow, addDays, format)"

patterns-established:
  - "Customer-first form layout: customer at top, then due date, delivery, items, voucher, notes, submit"
  - "Quick-tap pill pattern: row of Button variants with selected/outline toggle"

# Metrics
duration: 6min
completed: 2026-02-15
---

# Phase 14 Plan 05: Order Creation Page Summary

**Dedicated /orders/new page with customer-first layout, 7-day due date pills, customer autocomplete, Crystal/Goldfinch quick address buttons, and reused POS product grid**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-15T14:15:20Z
- **Completed:** 2026-02-15T14:20:45Z
- **Tasks:** 1
- **Files modified:** 8

## Accomplishments
- Dedicated order creation page separate from Kanban board at /orders/new
- Customer search with debounced autocomplete, inline new customer creation, and selected state display
- DueDatePills with Today/Tomorrow + 5 day-name pills using date-fns, with manual date picker fallback
- QuickAddressButtons for Crystal and Goldfinch self-pickup locations
- Reused existing ProductButtons (POS grid), DeliveryToggle, VoucherInput, ManagerOverrideDialog, LowPriceWarningDialog
- Removed sales channel and payment method fields from creation form
- Submit flow: create Draft order then transition to AwaitingPayment

## Task Commits

Each task was committed atomically:

1. **Task 1: Order creation page with customer-first layout and POS grid** - `177af03` (feat)

## Files Created/Modified
- `src/pages/OrderCreate.tsx` - Dedicated order creation page with customer-first form layout
- `src/components/orders/CustomerSearch.tsx` - Customer search with debounced autocomplete and inline creation
- `src/components/orders/DueDatePills.tsx` - Quick-tap day-name pills for next 7 days + manual date picker
- `src/components/orders/QuickAddressButtons.tsx` - Crystal and Goldfinch quick pickup address buttons
- `src/App.tsx` - Added /orders/new route with canAccessOrders permission
- `src/pages/index.ts` - Added OrderCreate export
- `package.json` - Added date-fns ^4.1.0 dependency

## Decisions Made
- Reused existing ProductButtons, DeliveryToggle, VoucherInput, ManagerOverrideDialog, and LowPriceWarningDialog components rather than rebuilding
- Submit creates Draft then transitions to AwaitingPayment using existing createOrder + updateOrderStatus mutations
- Installed date-fns for DueDatePills since it was planned for v1.1 (noted in STATE.md decisions)
- Used PageHeader component with backTo prop for consistent navigation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed date-fns dependency**
- **Found during:** Task 1 (DueDatePills creation)
- **Issue:** date-fns was planned for v1.1 but not yet installed
- **Fix:** `npm install date-fns@^4.1.0`
- **Files modified:** package.json, package-lock.json
- **Verification:** DueDatePills imports compile, build passes
- **Committed in:** 177af03 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential dependency install. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors in StatusActionButtons.tsx and OrderManager.tsx (from other in-progress plans) do not affect this plan's files

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Order creation page ready for use
- Plan 14-06 (remaining Order QoL items) can proceed
- The WhatsApp payment modal trigger is handled in the Kanban OrderSlideOver when orders transition to AwaitingPayment (per plan design)

## Self-Check: PASSED

- [x] src/pages/OrderCreate.tsx - FOUND
- [x] src/components/orders/CustomerSearch.tsx - FOUND
- [x] src/components/orders/DueDatePills.tsx - FOUND
- [x] src/components/orders/QuickAddressButtons.tsx - FOUND
- [x] Commit 177af03 - FOUND
- [x] Build passes (TypeScript + Vite)

---
*Phase: 14-order-qol*
*Completed: 2026-02-15*
