---
phase: 44-expense-submission
plan: 01
subsystem: api
tags: [convex, expenses, fraud-detection, tdd, audit-trail]

# Dependency graph
requires:
  - phase: 42-journal-engine
    provides: counter helper (getNextNumber for EXP numbers), protectedMutation/protectedQuery wrappers
  - phase: 43-chart-of-accounts-management
    provides: accounts table with GL categories for expense accountId
provides:
  - Expense CRUD mutations (createDraft, updateDraft, submitExpense, generateUploadUrl)
  - Expense queries (listMyExpenses, getById, getStatusHistory)
  - Pure helper functions for expense validation and fraud detection
  - Audit trail via expenseStatusHistory table
affects: [44-02 (frontend hooks and pages), 45-expense-approval, 46-reimbursement]

# Tech tracking
tech-stack:
  added: []
  patterns: [expense-helpers-pure-functions, fraud-detection-soft-hard-controls, expense-audit-trail]

key-files:
  created:
    - convex/expenses/helpers.ts
    - convex/expenses/__tests__/helpers.test.ts
    - convex/expenses/mutations.ts
    - convex/expenses/queries.ts
  modified: []

key-decisions:
  - "ALL_ROLES constant for all-user access instead of new auth wrapper"
  - "recordStatusChange internal helper (not exported) keeps audit trail coupling tight"
  - "updateDraft excludes self from duplicate check to prevent false positives"

patterns-established:
  - "Expense fraud detection pattern: pure helpers for testable logic, ctx-dependent code in mutations"
  - "ALL_ROLES const for any-authenticated-user endpoints"

requirements-completed: [EXP-01, EXP-02, EXP-03, EXP-04, EXP-18]

# Metrics
duration: 6min
completed: 2026-03-13
---

# Phase 44 Plan 01: Expense Submission Backend Summary

**Expense backend with draft/submit lifecycle, 3-layer fraud detection (duplicate warning, receipt hash dedup, late submission flag), and immutable audit trail**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-13T08:02:15Z
- **Completed:** 2026-03-13T08:08:22Z
- **Tasks:** 2
- **Files created:** 4

## Accomplishments
- Pure helper functions with 22 unit tests covering receipt threshold, amount validation, late submission detection, and duplicate expense warning
- 4 mutations: createDraft (with EXP number generation), updateDraft (owner-only draft editing), submitExpense (with all 3 fraud controls), generateUploadUrl
- 3 queries: listMyExpenses (status-filtered, by_submitter_status index), getById (owner-only), getStatusHistory (chronological audit trail)
- Full test suite green: 758 tests, 0 failures, 0 regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create expense pure helpers with tests (TDD)** - `54f986b` (feat)
2. **Task 2: Create expense mutations and queries** - `3a686c3` (feat)

_Note: Task 1 used TDD flow (RED -> GREEN). The helpers module did not exist during RED phase, confirming test-first approach._

## Files Created/Modified
- `convex/expenses/helpers.ts` - Pure functions: requiresReceipt, validateExpenseAmount, isLateSubmission, checkDuplicateExpense
- `convex/expenses/__tests__/helpers.test.ts` - 22 unit tests covering all helper behaviors and edge cases
- `convex/expenses/mutations.ts` - createDraft, updateDraft, submitExpense, generateUploadUrl with protectedMutation
- `convex/expenses/queries.ts` - listMyExpenses, getById, getStatusHistory with protectedQuery

## Decisions Made
- Used `ALL_ROLES` constant (`["kitchen", "order_staff", "manager", "admin"]`) rather than creating a new auth wrapper -- follows the established protectedMutation pattern
- `recordStatusChange` is an internal (non-exported) helper in mutations.ts -- keeps audit trail coupling tight to the module that transitions status
- `updateDraft` excludes the current expense from duplicate checking to prevent false self-match when amount/date unchanged
- `MutationCtx["db"]` type narrowing for recordStatusChange parameter instead of full MutationCtx -- follows the plan spec for type safety

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend API complete for Plan 02 (frontend hooks and pages)
- Mutations ready: createDraft, updateDraft, submitExpense, generateUploadUrl
- Queries ready: listMyExpenses, getById, getStatusHistory
- Frontend can use createMutationHook factory for all mutations
- GL category dropdown can use accounts:list(activeOnly: true) from Phase 43

## Self-Check: PASSED

All 4 created files verified on disk. Both task commits (54f986b, 3a686c3) verified in git log.

---
*Phase: 44-expense-submission*
*Completed: 2026-03-13*
