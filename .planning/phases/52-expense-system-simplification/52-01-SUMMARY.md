---
phase: 52-expense-system-simplification
plan: 01
subsystem: api
tags: [convex, refactor, parallel-queries, validation, expense]

# Dependency graph
requires:
  - phase: 50-expense-analytics
    provides: getFraudFlags query, expense analytics queries
  - phase: 47-payroll
    provides: payroll mutations and queries
  - phase: 46-reimbursement
    provides: reimbursement batch mutations and queries
provides:
  - Consolidated getFraudFlags with 4 DB queries (down from 10)
  - toExpenseForFraud helper replacing 3 duplicate .map blocks
  - Parameterized validateRequiredReason with optional label
  - EXPENSE_HIGH_VALUE_THRESHOLD as single source of truth with aliases
  - Parallel DB reads across 6 call sites
affects: [52-02, 52-03, expense-analytics, payroll, reimbursements]

# Tech tracking
tech-stack:
  added: []
  patterns: [Promise.all parallel reads with sequential writes, parameterized validation with backward-compatible defaults, constant aliasing for single source of truth]

key-files:
  created:
    - convex/lib/__tests__/validation.test.ts
  modified:
    - convex/expenses/analyticsQueries.ts
    - convex/expenses/mutations.ts
    - convex/expenses/helpers.ts
    - convex/lib/validation.ts
    - convex/bankAccounts/mutations.ts
    - convex/payroll/queries.ts
    - convex/payroll/mutations.ts
    - convex/reimbursements/queries.ts
    - convex/reimbursements/mutations.ts

key-decisions:
  - "toExpenseForFraud uses inline type annotation (not Doc<'expenses'>) to avoid importing Convex generated types into a pure helper"
  - "validateRequiredReason default label is 'Void reason' for backward compatibility with existing callers"
  - "EXPENSE_HIGH_VALUE_THRESHOLD exported alongside aliases to preserve all existing import paths"

patterns-established:
  - "Promise.all for parallel reads, sequential loop for writes: fetch all entities first, then validate/write one-by-one"
  - "Parameterized validation with backward-compatible default: add optional param with sensible default"
  - "Constant aliasing: EXPENSE_HIGH_VALUE_THRESHOLD as single source, DOA/COMMENT as aliases"

requirements-completed: [F1, F2, F3, F4, F5]

# Metrics
duration: 5min
completed: 2026-03-15
---

# Phase 52 Plan 01: Backend Consolidation Summary

**Parallelized 10 sequential DB queries down to 4 in getFraudFlags, eliminated 6 sequential fetch loops via Promise.all, unified threshold constants, and parameterized shared validation**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-15T04:09:52Z
- **Completed:** 2026-03-15T04:15:28Z
- **Tasks:** 2
- **Files modified:** 9 (+ 1 created)

## Accomplishments
- getFraudFlags consolidated from 3 Promise.all blocks (10 queries) to 1 Promise.all (4 queries) with in-memory slicing for 7d/30d subsets
- All 6 sequential for...of + await ctx.db.get() loops replaced with Promise.all parallel fetches across payroll, reimbursement, and bankAccounts modules
- validateRequiredReason parameterized with optional label, used by rejectExpense ("Rejection reason") and voidExpense (default "Void reason")
- EXPENSE_HIGH_VALUE_THRESHOLD = 500,000 as single source of truth with DOA_ADMIN_ONLY_THRESHOLD and COMMENT_REQUIRED_THRESHOLD as aliases
- New test file for convex/lib/validation.ts covering custom label, default label, and all shared validators (11 tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Consolidate fraud flag queries and parallelize backend DB reads (F1, F2, F5)** - `e6a8c13` (refactor)
2. **Task 2: Shared validation, threshold unification, and label parameter test (F3, F4-backend, I2)** - `148c080` (refactor)

## Files Created/Modified
- `convex/expenses/analyticsQueries.ts` - getFraudFlags consolidated to 4 queries + toExpenseForFraud helper
- `convex/expenses/mutations.ts` - rejectExpense/voidExpense use shared validateRequiredReason
- `convex/expenses/helpers.ts` - EXPENSE_HIGH_VALUE_THRESHOLD with DOA/COMMENT aliases
- `convex/lib/validation.ts` - validateRequiredReason with optional label parameter
- `convex/lib/__tests__/validation.test.ts` - New test file (11 tests for shared validators)
- `convex/payroll/queries.ts` - list handler parallel user resolution
- `convex/payroll/mutations.ts` - create handler parallel account lookups
- `convex/reimbursements/queries.ts` - listAwaitingPayment parallel user fetch
- `convex/reimbursements/mutations.ts` - createBatch/confirmBatch/voidBatch parallel expense reads
- `convex/bankAccounts/mutations.ts` - remove handler parallel batch queries

## Decisions Made
- toExpenseForFraud uses inline type annotation rather than importing Doc<"expenses"> to keep it a pure module-level function without Convex generated type dependency
- validateRequiredReason default label is "Void reason" (backward-compatible with existing payroll and reimbursement callers)
- EXPENSE_HIGH_VALUE_THRESHOLD exported alongside aliases to preserve all existing import paths unchanged

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend consolidation complete, ready for Plan 02 (frontend simplification)
- All 947 tests pass, type-check clean
- Zero behavior changes confirmed

## Self-Check: PASSED

All 11 files verified present. Both task commits (e6a8c13, 148c080) confirmed in git log.

---
*Phase: 52-expense-system-simplification*
*Completed: 2026-03-15*
