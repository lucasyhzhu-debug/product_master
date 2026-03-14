---
phase: 47-payroll
plan: 01
subsystem: api
tags: [convex, payroll, journal-engine, double-entry, tdd, validation]

# Dependency graph
requires:
  - phase: 42-journal-engine
    provides: createJournalEntryWithLines, createReversalEntry, buildDebitLine, buildCreditLine
  - phase: 41-schema-seed-counters
    provides: accounts table with by_code index, counters table with getNextNumber
  - phase: 44-expense-crud
    provides: protectedMutation/protectedQuery wrappers, expense validation patterns
provides:
  - payrollEntries schema with payrollNumber, recipientName, required status, by_status index
  - shared validation in convex/lib/validation.ts (eliminates duplication)
  - payroll create mutation with auto-JE (DR 6100, CR 1100)
  - payroll voidEntry mutation with reversing JE
  - payroll list/getById queries with enrichment
  - 18 total tests (11 unit + 7 integration)
affects: [47-02 (payroll frontend), 48 (permissions), 49 (P&L aggregation)]

# Tech tracking
tech-stack:
  added: []
  patterns: [shared-validation-extraction, payroll-je-pattern]

key-files:
  created:
    - convex/lib/validation.ts
    - convex/payroll/helpers.ts
    - convex/payroll/__tests__/helpers.test.ts
    - convex/payroll/mutations.ts
    - convex/payroll/queries.ts
    - tests/convex/payroll.test.ts
  modified:
    - convex/schema.ts
    - convex/expenses/helpers.ts
    - convex/reimbursements/helpers.ts

key-decisions:
  - "Shared validation in convex/lib/validation.ts eliminates duplication across expenses, reimbursements, and payroll"
  - "Insert payroll entry first (to get ID for sourceId), then create JE, then patch with journalEntryId"
  - "Explicit journalEntryId guard (no non-null assertion) in voidEntry for safety"

patterns-established:
  - "Shared validation: extract common validators to convex/lib/validation.ts, re-export from module helpers"
  - "Payroll JE: periodEnd as business date, DR 6100 CR 1100, sourceId = payrollId"

requirements-completed: [PAY-01, PAY-02, PAY-03, PAY-04]

# Metrics
duration: 7min
completed: 2026-03-14
---

# Phase 47 Plan 01: Payroll Backend Summary

**Payroll entry CRUD with shared validation extraction, TDD helpers, auto-generated journal entries (DR 6100 Salaries & Wages, CR 1100 Cash), and convex-test integration tests**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-14T01:46:05Z
- **Completed:** 2026-03-14T01:53:00Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- Shared validation helpers in `convex/lib/validation.ts` eliminating duplication across expenses, reimbursements, and payroll (backward-compatible re-exports)
- Payroll create mutation with auto-JE generation (DR 6100, CR 1100), PAY-MMDD-NNN sequential numbering, and business date = periodEnd
- Payroll void mutation with explicit journalEntryId guard and reversing JE creation
- 18 passing tests: 11 pure validation unit tests + 7 convex-test integration tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema update + shared validation + TDD helpers** - `ee58592` (feat)
2. **Task 2: Payroll mutations and queries** - `766a441` (feat)
3. **Task 3: Integration tests** - `5bdc864` (test)

## Files Created/Modified
- `convex/lib/validation.ts` - Shared validators: validatePositiveIntegerAmount, validateRequiredReason, validatePeriodRange, validateRequiredDescription
- `convex/payroll/helpers.ts` - Thin re-export layer from shared validation
- `convex/payroll/__tests__/helpers.test.ts` - 11 TDD unit tests for validation helpers
- `convex/payroll/mutations.ts` - create, voidEntry, generateUploadUrl mutations
- `convex/payroll/queries.ts` - list (filtered, desc order) and getById (enriched with JE details)
- `tests/convex/payroll.test.ts` - 7 convex-test integration tests
- `convex/schema.ts` - Added payrollNumber, recipientName fields; status now required; by_status index
- `convex/expenses/helpers.ts` - validateExpenseAmount now re-exports from shared validation
- `convex/reimbursements/helpers.ts` - validateVoidReason now re-exports from shared validation

## Decisions Made
- Shared validation extraction to `convex/lib/validation.ts` eliminates duplication -- expenses/reimbursements re-export via backward-compatible aliases
- Insert payroll entry first (for sourceId), then create JE, then patch entry with journalEntryId -- leverages Convex atomic transactions for safety
- Explicit `if (!entry.journalEntryId)` guard in voidEntry instead of non-null assertion -- prevents runtime crash on data integrity edge case

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Backend complete: mutations (create, void, upload) and queries (list, getById) ready for frontend consumption
- Ready for 47-02 (payroll frontend): hooks, page, routes, navigation
- Accounts 6100 and 1100 must be seeded via `accounts:seedDefaults` before first use

---
*Phase: 47-payroll*
*Completed: 2026-03-14*
