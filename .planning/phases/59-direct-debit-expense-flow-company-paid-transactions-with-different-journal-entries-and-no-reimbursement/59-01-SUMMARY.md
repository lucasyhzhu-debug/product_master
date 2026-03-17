---
phase: 59-direct-debit-expense-flow-company-paid-transactions-with-different-journal-entries-and-no-reimbursement
plan: 01
subsystem: database, api
tags: [convex, schema, expense, payment-method, tdd]

# Dependency graph
requires: []
provides:
  - "Updated expenses table schema with 3 payment method literals (employee_paid, company_paid, payment_request)"
  - "2 new status literals (recorded, paid) for company-paid and payment request flows"
  - "7 new optional fields (transactionReference, flaggedForReview, flaggedBy, flaggedAt, flagReason, paidAt, paidBy)"
  - "Payment-method-aware requiresReceipt helper (backward compatible)"
  - "Updated getTargetStatusAfterApproval for new payment method routing"
  - "Extended VOIDABLE_STATUSES and APPROVED_STATUSES with recorded/paid"
affects: [59-02, 59-03, 59-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Backward-compatible function extension via optional parameter (requiresReceipt)"
    - "Company money = always require receipt regardless of amount"

key-files:
  created: []
  modified:
    - "convex/schema.ts"
    - "convex/expenses/helpers.ts"
    - "convex/expenses/fraudHelpers.ts"
    - "convex/expenses/mutations.ts"
    - "convex/expenses/__tests__/helpers.test.ts"
    - "src/pages/ExpenseSubmit.tsx"
    - "src/pages/ExpenseApproval.tsx"

key-decisions:
  - "Extended requiresReceipt with optional paymentMethod param for backward compatibility (not a breaking change)"
  - "Updated mutations.ts validator and credit code logic inline to prevent type errors (Rule 3 blocking fix)"
  - "Updated frontend payment method labels and test fixtures to align with new schema literals"

patterns-established:
  - "Payment method awareness: company_paid/payment_request always require receipt; employee_paid uses threshold"

requirements-completed: [DEXP-01, DEXP-02, DEXP-03, DEXP-04, DEXP-05]

# Metrics
duration: 8min
completed: 2026-03-17
---

# Phase 59 Plan 01: Schema & Helper Foundation Summary

**Expense schema updated with 3 new payment method literals (employee_paid, company_paid, payment_request), 2 new statuses (recorded, paid), 7 new optional fields, and payment-method-aware pure helpers with full TDD coverage**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-17T00:19:48Z
- **Completed:** 2026-03-17T00:28:16Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Schema has 3 new payment literals replacing old ones (personal_cash/personal_transfer/company_card -> employee_paid/company_paid/payment_request)
- Schema has 2 new status literals (recorded, paid) for company-paid and payment request flows
- Schema has 7 new optional fields (transactionReference, flaggedForReview, flaggedBy, flaggedAt, flagReason, paidAt, paidBy)
- requiresReceipt is payment-method-aware with backward compatibility (company money = always required)
- getTargetStatusAfterApproval correctly routes employee_paid to awaiting_payment, others to approved
- isVoidableStatus and APPROVED_STATUSES include recorded and paid
- All 78 expense tests pass (53 helpers + 25 fraudHelpers)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update schema with new payment methods, statuses, and fields** - `8c730fd` (feat)
2. **Task 2 RED: Add failing tests for new payment method semantics** - `0900844` (test)
3. **Task 2 GREEN: Implement helpers and align codebase** - `9982ed8` (feat)

## Files Created/Modified
- `convex/schema.ts` - Updated expenses table with 3 new payment literals, 2 new statuses, 7 new optional fields
- `convex/expenses/helpers.ts` - Updated requiresReceipt, getTargetStatusAfterApproval, isVoidableStatus
- `convex/expenses/fraudHelpers.ts` - Updated APPROVED_STATUSES to include recorded and paid
- `convex/expenses/mutations.ts` - Updated paymentMethodValidator and credit code logic
- `convex/expenses/__tests__/helpers.test.ts` - Updated tests for new payment methods (53 tests)
- `src/pages/ExpenseSubmit.tsx` - Updated payment method options and default
- `src/pages/ExpenseApproval.tsx` - Updated payment method display map
- `tests/e2e/helpers.ts` - Updated comment for payment method options
- `tests/convex/reimbursementBatch.test.ts` - Updated fixture to use employee_paid
- `tests/convex/expenseAnalytics.test.ts` - Updated fixture to use employee_paid

## Decisions Made
- Extended requiresReceipt with optional paymentMethod param for backward compatibility (not a breaking change)
- Updated mutations.ts validator and credit code logic inline to prevent type errors (Rule 3 blocking fix)
- Updated frontend payment method labels and test fixtures to align with new schema literals

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated mutations.ts validator and credit code logic**
- **Found during:** Task 1 (Schema update)
- **Issue:** mutations.ts had a standalone paymentMethodValidator using old literals (personal_cash, personal_transfer, company_card) and credit code logic referencing company_card. Type check passed but build would fail when inserting into the schema-typed expenses table.
- **Fix:** Updated paymentMethodValidator to use new literals and inverted credit code logic (employee_paid -> 2200, others -> 1100)
- **Files modified:** convex/expenses/mutations.ts
- **Verification:** npm run type-check passes, npm run build succeeds
- **Committed in:** 8c730fd (Task 1 commit)

**2. [Rule 3 - Blocking] Updated frontend files with new payment method literals**
- **Found during:** Task 2 (Build verification)
- **Issue:** ExpenseSubmit.tsx and ExpenseApproval.tsx used old payment method string literals causing TypeScript errors on build
- **Fix:** Updated PAYMENT_METHODS arrays/maps to use employee_paid, company_paid, payment_request
- **Files modified:** src/pages/ExpenseSubmit.tsx, src/pages/ExpenseApproval.tsx
- **Verification:** npm run build succeeds
- **Committed in:** 9982ed8 (Task 2 commit)

**3. [Rule 3 - Blocking] Updated test fixture files with new payment method literals**
- **Found during:** Task 2 (Codebase alignment)
- **Issue:** Test fixtures in reimbursementBatch.test.ts and expenseAnalytics.test.ts used personal_cash literal
- **Fix:** Updated to employee_paid
- **Files modified:** tests/convex/reimbursementBatch.test.ts, tests/convex/expenseAnalytics.test.ts, tests/e2e/helpers.ts
- **Verification:** All tests pass
- **Committed in:** 9982ed8 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 blocking issues)
**Impact on plan:** All auto-fixes necessary for correctness. Schema literal changes naturally cascade to all downstream references. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Schema foundation complete with all new payment literals, statuses, and fields
- Helpers fully updated and tested for new payment method semantics
- Ready for Plan 02 (mutations) to implement the new expense flows (acknowledge, markAsPaid)

---
*Phase: 59-direct-debit-expense-flow-company-paid-transactions-with-different-journal-entries-and-no-reimbursement*
*Plan: 01*
*Completed: 2026-03-17*

## Self-Check: PASSED

All 7 key files verified present. All 3 commits verified in git history.
