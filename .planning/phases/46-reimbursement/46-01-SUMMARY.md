---
phase: 46-reimbursement
plan: 01
subsystem: api
tags: [convex, reimbursement, journal-engine, audit-trail, bank-accounts, tdd]

# Dependency graph
requires:
  - phase: 44-expense-submission
    provides: expense mutations, expenseStatusHistory table, recordStatusChange helper
  - phase: 45-expense-approval-void
    provides: approval/void mutations, awaiting_payment status, journalEngine
  - phase: 42-journal-engine
    provides: createJournalEntryWithLines, createReversalEntry, buildDebitLine/buildCreditLine
  - phase: 41-schema-seed-counters
    provides: accounts table with by_code index, counters table with getNextNumber
provides:
  - Shared recordStatusChange helper in convex/expenses/auditTrail.ts
  - Bank accounts CRUD (convex/bankAccounts/) with referential integrity
  - User self-service bank details mutation (updateBankDetails)
  - Reimbursement batch mutations (createBatch, confirmBatch, voidBatch)
  - Reimbursement queries (listAwaitingPayment, listBatches, getBatchById, getBatchItems)
  - Pure validation helpers (validateBankReference, validateTransferDate, validateVoidReason)
  - 22 new tests (11 unit + 11 integration)
affects: [46-02-reimbursement-frontend, 49-profit-loss, 50-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns: [shared-audit-trail-helper, double-batching-guard, take-limit-on-list-queries]

key-files:
  created:
    - convex/expenses/auditTrail.ts
    - convex/bankAccounts/queries.ts
    - convex/bankAccounts/mutations.ts
    - convex/reimbursements/helpers.ts
    - convex/reimbursements/mutations.ts
    - convex/reimbursements/queries.ts
    - convex/reimbursements/__tests__/helpers.test.ts
    - tests/convex/reimbursementBatch.test.ts
  modified:
    - convex/expenses/mutations.ts
    - convex/auth/mutations.ts

key-decisions:
  - "recordStatusChange extracted to shared auditTrail.ts (reusable by both expenses and reimbursements)"
  - "listBatches uses .take(100) cap instead of .collect() (I3 fix for unbounded growth)"
  - "confirmBatch uses args.transferDate as JE business date, not Date.now() (C1 staff review)"
  - "Double-batching guard checks by_expense index on reimbursementBatchItems for pending batches"
  - "Bank account delete has referential integrity check against non-voided batches"

patterns-established:
  - "Shared audit trail: Extract status change tracking to shared module when multiple mutation files need it"
  - "Double-batching guard: Check link table for existing pending references before creating new batch"
  - "Take-limit queries: Use .take(N) instead of .collect() on list queries for low-volume tables"

requirements-completed: [RMB-01, RMB-02, RMB-03, RMB-04, RMB-05, RMB-06, RMB-07, RMB-08]

# Metrics
duration: 11min
completed: 2026-03-14
---

# Phase 46 Plan 01: Reimbursement Backend Summary

**Reimbursement batch API with atomic JE creation (DR 2200/CR 1100), expense status lifecycle, double-batching guard, bank accounts CRUD, and 22 new tests (TDD + integration)**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-13T21:26:49Z
- **Completed:** 2026-03-13T21:38:00Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- Extracted recordStatusChange to shared auditTrail.ts for reuse by expenses and reimbursements
- Full bank accounts CRUD with referential integrity on delete (checks non-voided batches)
- User self-service updateBankDetails mutation for any authenticated user
- Three reimbursement mutations (createBatch, confirmBatch, voidBatch) with atomic JE and audit trail
- Four queries (listAwaitingPayment grouped by employee, listBatches with search/filter, getBatchById, getBatchItems)
- TDD-driven pure validation helpers with 11 unit tests
- 11 convex-test integration tests covering full batch lifecycle including error cases

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract recordStatusChange, bank accounts CRUD, user bank details** - `2693d9b` (feat)
2. **Task 2: TDD helpers** - `40ec317` (test) + **mutations and queries** - `9b6a4ac` (feat)
3. **Task 3: Integration tests for batch lifecycle** - `ef06f69` (test)

## Files Created/Modified
- `convex/expenses/auditTrail.ts` - Shared recordStatusChange helper extracted from mutations
- `convex/expenses/mutations.ts` - Removed internal recordStatusChange, imports from auditTrail
- `convex/bankAccounts/queries.ts` - list (with activeOnly filter) and getById queries
- `convex/bankAccounts/mutations.ts` - create, update, remove with referential integrity
- `convex/auth/mutations.ts` - Added updateBankDetails self-service mutation
- `convex/reimbursements/helpers.ts` - Pure validation functions (TDD)
- `convex/reimbursements/mutations.ts` - createBatch, confirmBatch, voidBatch
- `convex/reimbursements/queries.ts` - listAwaitingPayment, listBatches, getBatchById, getBatchItems
- `convex/reimbursements/__tests__/helpers.test.ts` - 11 unit tests for validation helpers
- `tests/convex/reimbursementBatch.test.ts` - 11 integration tests for batch lifecycle

## Decisions Made
- recordStatusChange extracted to shared module (needed by both expenses and reimbursements mutations)
- listBatches capped at .take(100) per I3 staff review recommendation (prevents unbounded scans)
- confirmBatch uses transferDate as JE business date per C1 staff review (not Date.now())
- Double-batching guard queries by_expense index to prevent same expense in multiple pending batches
- Bank account referential integrity: only blocks delete when non-voided batches reference it

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed unused imports in expenses/mutations.ts**
- **Found during:** Task 3 (build verification)
- **Issue:** Extracting recordStatusChange left unused `Id` and `MutationCtx` type imports, causing build failure
- **Fix:** Removed the two unused import lines
- **Files modified:** convex/expenses/mutations.ts
- **Verification:** `npm run build` succeeds
- **Committed in:** ef06f69 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Trivial cleanup after extraction. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full reimbursement backend API ready for Plan 02 (frontend)
- All mutations and queries exported and type-safe
- 804 tests passing (782 existing + 22 new), zero regressions

## Self-Check: PASSED

All 8 created files verified present. All 4 task commits verified in git log.

---
*Phase: 46-reimbursement*
*Completed: 2026-03-14*
