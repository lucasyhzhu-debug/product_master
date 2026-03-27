---
phase: 45-expense-approval-void
plan: 01
subsystem: api
tags: [convex, expenses, approval, journal-engine, doa, tdd]

# Dependency graph
requires:
  - phase: 44-expense-submission
    provides: "Expense CRUD mutations, helpers, schema, constants"
  - phase: 42-journal-engine
    provides: "createJournalEntryWithLines, createReversalEntry, buildDebitLine, buildCreditLine"
provides:
  - "approveExpense mutation with DoA enforcement and JE creation"
  - "rejectExpense mutation with reason requirement"
  - "voidExpense mutation (admin-only) with reversing JE"
  - "listPendingForApproval query (DoA-filtered approval queue)"
  - "getRejectionChain query (rejection history via previousExpenseId)"
  - "canApproveExpense, requiresApproverComment, getTargetStatusAfterApproval, isVoidableStatus helpers"
  - "DOA_ADMIN_ONLY_THRESHOLD, COMMENT_REQUIRED_THRESHOLD constants"
  - "Relaxed getById/getStatusHistory for manager/admin access"
affects: [46-expense-reimbursement, 45-02-expense-approval-frontend]

# Tech tracking
tech-stack:
  added: []
  patterns: [doa-pure-helpers, approval-journal-entry-pattern, reversal-on-void]

key-files:
  created: []
  modified:
    - convex/expenses/helpers.ts
    - convex/expenses/constants.ts
    - convex/expenses/mutations.ts
    - convex/expenses/queries.ts
    - convex/expenses/__tests__/helpers.test.ts

key-decisions:
  - "DoA helpers are pure functions (no ctx) for TDD testability"
  - "canApproveExpense checks self-approval BEFORE role check (fail-fast on most common error)"
  - "VOIDABLE_STATUSES as module-level readonly array instead of export (internal detail)"
  - "getRejectionChain uses explicit Doc<'expenses'> type to break circular type inference"

patterns-established:
  - "Approval DoA pattern: pure helper validates, mutation enforces"
  - "Credit account lookup by code at runtime (never hardcode account IDs)"
  - "Reversing JE on void only when journalEntryId exists"

requirements-completed: [EXP-07, EXP-08, EXP-09, EXP-10, EXP-11, EXP-12, EXP-13, EXP-14, EXP-15, EXP-16, EXP-17, FRAUD-01, FRAUD-02, FRAUD-03, FRAUD-04, FRAUD-05]

# Metrics
duration: 7min
completed: 2026-03-13
---

# Phase 45 Plan 01: Expense Approval & Void Backend Summary

**DoA-enforced expense approval/reject/void mutations with TDD-tested pure helpers, automatic journal entry generation, and approval queue queries**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-13T13:50:34Z
- **Completed:** 2026-03-13T13:58:24Z
- **Tasks:** 2 (Task 1 was TDD with RED+GREEN commits)
- **Files modified:** 5

## Accomplishments
- 4 pure DoA helper functions with 24 unit tests (TDD RED/GREEN)
- 3 new mutations: approveExpense (DoA + JE), rejectExpense, voidExpense (reversing JE)
- 2 new queries: listPendingForApproval (DoA-filtered queue), getRejectionChain
- Relaxed getById and getStatusHistory for manager/admin access
- Full test suite: 782 tests, zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Add failing tests for DoA helpers** - `b08613a` (test)
2. **Task 1 GREEN: Implement DoA helpers and constants** - `368e9b4` (feat)
3. **Task 2: Add mutations and queries** - `f760fc1` (feat)

## Files Created/Modified
- `convex/expenses/helpers.ts` - Added canApproveExpense, requiresApproverComment, getTargetStatusAfterApproval, isVoidableStatus, DOA/COMMENT thresholds
- `convex/expenses/constants.ts` - Added APPROVER_ROLES constant
- `convex/expenses/mutations.ts` - Added approveExpense, rejectExpense, voidExpense mutations with JE integration
- `convex/expenses/queries.ts` - Added listPendingForApproval, getRejectionChain; relaxed getById/getStatusHistory access
- `convex/expenses/__tests__/helpers.test.ts` - 24 new DoA helper tests (46 total)

## Decisions Made
- DoA helpers are pure functions (no ctx dependency) for easy TDD and reusability
- canApproveExpense checks self-approval first (fail-fast), then role, then DoA threshold
- VOIDABLE_STATUSES kept as module-level constant (not exported) since mutations use isVoidableStatus()
- getRejectionChain explicitly annotated with Doc<"expenses"> to resolve circular type inference in Convex typed DB

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed circular type inference in getRejectionChain**
- **Found during:** Task 2 (queries implementation)
- **Issue:** `ctx.db.get(currentId as any)` caused TypeScript TS7022 (implicit 'any' from self-referencing initializer) and TS2339 (union type lacks previousExpenseId)
- **Fix:** Used proper `Id<"expenses">` typing for currentId and explicit `Doc<"expenses">` annotation for the expense variable to break the inference cycle
- **Files modified:** convex/expenses/queries.ts
- **Verification:** `npm run build` passes with zero errors
- **Committed in:** f760fc1 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal -- type annotation fix required by Convex's typed DB system. No scope creep.

## Issues Encountered
- Vitest `-x` flag (plan's verify command) doesn't exist in vitest v4.0.18. Used `--bail 1` equivalent for RED phase verification. Not a blocking issue since GREEN phase used default run mode.

## User Setup Required
None - no external service configuration required. Accounts "1100" and "2200" must exist via accounts:seedDefaults (seeded in Phase 41).

## Next Phase Readiness
- Backend approval workflow complete, ready for Phase 45-02 frontend
- All 3 mutations and 2 queries exported and type-safe
- 782 tests passing, build clean

---
*Phase: 45-expense-approval-void*
*Completed: 2026-03-13*
