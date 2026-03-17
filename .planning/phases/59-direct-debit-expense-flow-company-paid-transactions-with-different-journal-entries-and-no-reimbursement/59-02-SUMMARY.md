---
phase: 59-direct-debit-expense-flow-company-paid-transactions-with-different-journal-entries-and-no-reimbursement
plan: 02
subsystem: api, database
tags: [convex, expense, mutations, journal-entry, approval-queue, analytics]

# Dependency graph
requires:
  - phase: 59-direct-debit-expense-flow
    provides: "Schema with 3 payment method literals, 2 new statuses, 7 new optional fields, payment-method-aware helpers"
provides:
  - "3 new mutations: acknowledgeExpense, flagExpense, markAsPaid"
  - "submitExpense company_paid auto-JE with recorded status transition"
  - "approveExpense company_paid guard, payment_request JE skip, employee_paid defensive assertion"
  - "Expanded approval queue covering submitted + recorded + approved-payment_request"
  - "Analytics queries covering recorded and paid statuses"
  - "transactionReference in createDraft/updateDraft args"
affects: [59-03, 59-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Payment-method-aware mutation branching with distinct JE timing per flow"
    - "Defensive assertion pattern for payment method exhaustiveness in JE blocks"
    - "Unified approval queue with selective self-exclusion and DoA filtering"

key-files:
  created: []
  modified:
    - "convex/expenses/mutations.ts"
    - "convex/expenses/queries.ts"
    - "convex/expenses/analyticsQueries.ts"

key-decisions:
  - "company_paid guard placed BEFORE status check in approveExpense for helpful error messages"
  - "DoA does NOT apply to acknowledge (money already left bank -- review, not authorization)"
  - "Self-exclusion applies ONLY to submitted items; recorded and approved-payment_request are administrative"
  - "Defensive assertion blocks unexpected payment methods from reaching JE creation block"

patterns-established:
  - "Acknowledge flow: recorded -> approved (no JE, no DoA, any manager/admin)"
  - "Flag pattern: metadata update without status change"
  - "Mark-as-paid flow: approved -> paid with JE at bank transfer time"

requirements-completed: [DEXP-06, DEXP-07, DEXP-08, DEXP-09]

# Metrics
duration: 5min
completed: 2026-03-17
---

# Phase 59 Plan 02: Mutations & Queries Summary

**3 new mutations (acknowledge, flag, markAsPaid), payment-method-branched submitExpense/approveExpense with JE timing per flow, expanded unified approval queue, and analytics covering recorded/paid statuses**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-17T00:32:35Z
- **Completed:** 2026-03-17T00:38:32Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- submitExpense branches on company_paid to auto-create JE (DR expense GL, CR 1100 Cash) and transition to recorded
- approveExpense has company_paid guard BEFORE status check, skips JE for payment_request, has defensive assertion for unexpected methods
- acknowledgeExpense: recorded -> approved for company_paid (no JE, no DoA -- administrative review)
- flagExpense: sets flag metadata on recorded expenses without status change
- markAsPaid: approved -> paid for payment_request with JE creation and mandatory transactionReference
- Approval queue fetches submitted + recorded + approved-payment_request with correct filtering
- Analytics queries include recorded and paid in all aggregations and fraud detection

## Task Commits

Each task was committed atomically:

1. **Task 1: Update mutations -- submitExpense branching, approveExpense guards, 3 new mutations** - `9bf47d8` (feat)
2. **Task 2: Update queries and analyticsQueries for new statuses and expanded approval queue** - `b150f24` (feat)

## Files Created/Modified
- `convex/expenses/mutations.ts` - Updated submitExpense/approveExpense branching, added acknowledgeExpense/flagExpense/markAsPaid, transactionReference in draft args
- `convex/expenses/queries.ts` - expenseStatusValidator with recorded/paid, expanded listPendingForApproval with unified queue
- `convex/expenses/analyticsQueries.ts` - getExpenseMetrics and getFraudFlags include recorded and paid statuses

## Decisions Made
- company_paid guard placed BEFORE status check in approveExpense so recorded expenses get helpful redirect error instead of generic status error
- DoA does NOT apply to acknowledge flow -- acknowledgment is review confirmation, not spend authorization
- Self-exclusion applies ONLY to submitted items -- admin who submitted company_paid should see their own expense for acknowledgment
- Defensive assertion pattern ensures any future 4th payment method gets explicit handling rather than silent incorrect JE

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 3 expense payment flows fully implemented in backend mutations
- Approval queue unified for all 3 types with correct filtering
- Analytics cover all non-draft statuses
- Ready for Plan 03 (frontend) to build UI for acknowledge, flag, and markAsPaid actions

---
*Phase: 59-direct-debit-expense-flow-company-paid-transactions-with-different-journal-entries-and-no-reimbursement*
*Plan: 02*
*Completed: 2026-03-17*

## Self-Check: PASSED

All 3 key files verified present. All 2 commits verified in git history.
