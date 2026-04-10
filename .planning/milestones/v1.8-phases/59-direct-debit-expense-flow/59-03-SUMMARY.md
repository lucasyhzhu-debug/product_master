---
phase: 59-direct-debit-expense-flow
plan: 03
subsystem: ui
tags: [react, expense, hooks, status-badge, form, payment-method]

# Dependency graph
requires:
  - phase: 59-direct-debit-expense-flow
    provides: "3 new mutations (acknowledgeExpense, flagExpense, markAsPaid), transactionReference in draft args"
provides:
  - "ExpenseStatus type with recorded and paid"
  - "3 new mutation hooks: useAcknowledgeExpense, useFlagExpense, useMarkAsPaid"
  - "3-option payment method dropdown with inline descriptions"
  - "Conditional transactionReference field for company_paid"
  - "Payment-method-aware receipt requirement logic"
  - "StatusBadge for recorded (sky) and paid (teal) statuses"
  - "MyExpenses tabs for all 10 statuses"
affects: [59-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Conditional form field visibility based on payment method selection"
    - "Payment-method-aware receipt requirement (always required for company_paid/payment_request)"

key-files:
  created: []
  modified:
    - "src/hooks/convex/useExpenses.ts"
    - "src/components/expenses/StatusBadge.tsx"
    - "src/pages/ExpenseSubmit.tsx"
    - "src/pages/MyExpenses.tsx"

key-decisions:
  - "Receipt required for all company_paid and payment_request expenses regardless of amount"
  - "Transaction reference field only shown for company_paid (not payment_request, since payment hasn't happened yet)"
  - "MyExpenses expanded to all 10 status tabs so no status is hidden from users"

patterns-established:
  - "SelectItem with description: nested div with label and text-xs description span"

requirements-completed: [DEXP-10, DEXP-11, DEXP-14]

# Metrics
duration: 4min
completed: 2026-03-17
---

# Phase 59 Plan 03: Frontend Hooks, Form & Badges Summary

**3-option payment method dropdown with descriptions, conditional transactionReference field, recorded/paid status badges, and full-status MyExpenses tabs**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-17T00:42:09Z
- **Completed:** 2026-03-17T00:46:01Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- ExpenseStatus type expanded with recorded and paid, plus 3 new mutation hooks (useAcknowledgeExpense, useFlagExpense, useMarkAsPaid)
- ExpenseSubmit form shows 3 payment methods with inline descriptions, conditional transactionReference for company_paid, and payment-method-aware receipt requirements
- StatusBadge renders recorded (sky blue) and paid (teal) following existing dark mode pattern
- MyExpenses tabs expanded from 5 to 10 covering all statuses including recorded, paid, awaiting_payment, reimbursed, and voided

## Task Commits

Each task was committed atomically:

1. **Task 1: Update useExpenses hook -- type + 3 new mutation hooks** - `35f6686` (feat)
2. **Task 2: Update StatusBadge, ExpenseSubmit form, and MyExpenses filters** - `a2b4f9d` (feat)

## Files Created/Modified
- `src/hooks/convex/useExpenses.ts` - Added recorded/paid to ExpenseStatus, 3 new mutation hooks
- `src/components/expenses/StatusBadge.tsx` - Added recorded (sky) and paid (teal) badge configs
- `src/pages/ExpenseSubmit.tsx` - 3-option dropdown with descriptions, transactionReference field, receipt logic
- `src/pages/MyExpenses.tsx` - Expanded TABS from 5 to 10 covering all statuses

## Decisions Made
- Receipt is required for all company_paid and payment_request expenses regardless of amount threshold
- Transaction reference field only appears for company_paid (payment_request hasn't paid yet)
- All 10 expense statuses exposed as tabs in MyExpenses so no status is hidden from users

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All frontend hooks, form, badges, and filters ready for Plan 04 (approval queue UI)
- useAcknowledgeExpense, useFlagExpense, useMarkAsPaid hooks available for approval queue actions
- StatusBadge handles all statuses including recorded and paid

---
*Phase: 59-direct-debit-expense-flow*
*Plan: 03*
*Completed: 2026-03-17*

## Self-Check: PASSED

All 4 key files verified present. All 2 commits verified in git history.
