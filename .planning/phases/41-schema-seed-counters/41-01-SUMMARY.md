---
phase: 41-schema-seed-counters
plan: 01
subsystem: database
tags: [convex, schema, seed, accounting, psak, chart-of-accounts]

# Dependency graph
requires: []
provides:
  - "10 new accounting tables in Convex schema (accounts, expenses, expenseStatusHistory, reimbursementBatches, reimbursementBatchItems, journalEntries, journalEntryLines, bankAccounts, payrollEntries, counters)"
  - "Users table bank detail fields (bankAccountNumber, bankName)"
  - "Chart of Accounts seed function with 39 PSAK-aligned default accounts"
  - "DEFAULT_ACCOUNTS exported array for downstream test/reference"
affects: [42-expense-submission, 43-expense-approval, 44-expense-resubmission, 45-reimbursement, 46-journal-entries, 47-payroll, 48-accounting-ui, 49-pnl-report, 50-analytics-fraud]

# Tech tracking
tech-stack:
  added: []
  patterns: [upsert-seed-pattern, psak-account-coding, denormalized-entryDate-for-cross-table-index]

key-files:
  created:
    - convex/accounts/mutations.ts
    - convex/accounts/__tests__/seed.test.ts
  modified:
    - convex/schema.ts

key-decisions:
  - "39 accounts instead of 36: plan enumeration yields 7+4+11+3+6+5+3=39, not the stated 36"
  - "Upsert seed pattern (patch on re-run) matching productionUnitTypes:seedDefaults"
  - "journalEntryLines.entryDate denormalized from parent for cross-table index queries"
  - "by_entryDate index added per prior staff review (PNL-04) for P&L period queries"

patterns-established:
  - "Accounting seed pattern: exported DEFAULT_ACCOUNTS + upsert seedDefaults mutation"
  - "PSAK account code ranges: 1xxx Assets, 2xxx Liabilities, 3xxx Equity, 4xxx Revenue, 5xxx COGS, 6xxx OpEx, 7xxx Other"

requirements-completed: [COA-04, COA-05, JE-04]

# Metrics
duration: 7min
completed: 2026-03-13
---

# Phase 41 Plan 01: Schema, Seed & Counters Summary

**10 accounting tables added to Convex schema (64->74 tables) with 39 PSAK-aligned Chart of Accounts seed function and users bank fields**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-13T05:10:13Z
- **Completed:** 2026-03-13T05:17:07Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added 10 new accounting tables to schema: accounts, expenses, expenseStatusHistory, reimbursementBatches, reimbursementBatchItems, journalEntries, journalEntryLines, bankAccounts, payrollEntries, counters
- Modified users table with bankAccountNumber and bankName optional fields for reimbursement payments
- Created seedDefaults mutation with 39 PSAK-aligned accounts using upsert pattern (idempotent)
- Added 7 pure data validation tests covering array size, isSystem/isActive flags, code uniqueness, PSAK ranges, type counts, key codes, and field types

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 10 accounting tables to schema and modify users** - `8c792ad` (feat)
2. **Task 2: Create Chart of Accounts seed function with tests** - `1372d70` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified
- `convex/schema.ts` - Added 10 new table definitions (accounts, expenses, expenseStatusHistory, reimbursementBatches, reimbursementBatchItems, journalEntries, journalEntryLines, bankAccounts, payrollEntries, counters) + users bank fields
- `convex/accounts/mutations.ts` - seedDefaults mutation with 39 PSAK-aligned default accounts, exported DEFAULT_ACCOUNTS array
- `convex/accounts/__tests__/seed.test.ts` - 7 pure data validation tests for seed array integrity

## Decisions Made
- **39 accounts not 36:** The plan header said "36 accounts" but the detailed enumeration lists 7+4+11+3+6+5+3=39. The detailed list is authoritative; test updated to match.
- **Upsert pattern:** Following productionUnitTypes:seedDefaults -- patch existing records on re-run rather than skip-if-exists.
- **entryDate denormalization:** journalEntryLines.entryDate copied from parent journalEntries.date because Convex indexes cannot span tables.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed account count from 36 to 39**
- **Found during:** Task 2 (TDD GREEN phase)
- **Issue:** Plan header and multiple references said "36 accounts" but the detailed enumeration (7 Revenue + 4 COGS + 11 OpEx + 3 Other + 6 Assets + 5 Liabilities + 3 Equity) totals 39
- **Fix:** Updated test assertion from 36 to 39, all 39 accounts implemented exactly as enumerated in the plan
- **Files modified:** convex/accounts/__tests__/seed.test.ts
- **Verification:** All 7 tests pass with correct count
- **Committed in:** 1372d70 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug in plan arithmetic)
**Impact on plan:** Arithmetic correction only. All accounts from the detailed enumeration are present. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Schema foundation complete for all downstream expense/accounting phases (42-50)
- seedDefaults can be run from Convex Dashboard Functions tab to create default accounts
- Counter table ready for EXP/RMB/JE number generation in Plan 02

## Self-Check: PASSED

All files verified present:
- convex/schema.ts
- convex/accounts/mutations.ts
- convex/accounts/__tests__/seed.test.ts
- .planning/phases/41-schema-seed-counters/41-01-SUMMARY.md

All commits verified:
- 8c792ad (Task 1: schema changes)
- 1372d70 (Task 2: seed function + tests)

---
*Phase: 41-schema-seed-counters*
*Completed: 2026-03-13*
