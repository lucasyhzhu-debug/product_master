---
phase: 42-journal-engine
plan: 01
subsystem: accounting
tags: [double-entry, journal-engine, validation, convex, typescript]

# Dependency graph
requires:
  - phase: 41-schema-seed-counters
    provides: "journalEntries/journalEntryLines schema tables, getNextNumber counter helper, accounts table with 39 PSAK accounts"
provides:
  - "createJournalEntryWithLines -- single entry point for all journal creation (JE-06)"
  - "createReversalEntry -- void workflow with original-date reversal (JE-03)"
  - "validateJournalLines -- pure validation for double-entry integrity (JE-01)"
  - "validateVoidPairing -- pure sourceType pairing validation"
  - "buildDebitLine, buildCreditLine, buildReversedLines -- convenience builders"
  - "JournalLine, JournalSourceType, CreateJournalEntryParams -- type exports"
affects: [43-chart-of-accounts-management, 44-expense-crud, 45-reimbursement-crud, 46-payroll-crud, 47-journal-viewer]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Pure function extraction for ctx-dependent module testing", "Single-helper journal creation pattern (JE-06)", "Negative-before-integer validation ordering"]

key-files:
  created:
    - convex/lib/journalEngine.ts
    - convex/lib/__tests__/journalEngine.test.ts
  modified: []

key-decisions:
  - "Negative check fires before integer check -- fractional negative like -50000.5 throws 'non-negative', not 'whole numbers'"
  - "NON_REVERSIBLE_TYPES explicit guard prevents accidental double-voids and documents manual entry correction policy"
  - "createReversalEntry passes original.sourceId through to reversal for by_source index queryability"
  - "Integration tests for ctx-dependent functions deferred -- pure function extraction covers critical validation logic"

patterns-established:
  - "Journal engine pattern: all journal inserts go through createJournalEntryWithLines, no direct ctx.db.insert allowed"
  - "Void pairing pattern: explicit NON_REVERSIBLE_TYPES guard before pairing map lookup"
  - "Reversal date pattern: always use original.date, never Date.now() for reversal business date (JE-03)"

requirements-completed: [JE-01, JE-02, JE-03, JE-06]

# Metrics
duration: 5min
completed: 2026-03-13
---

# Phase 42 Plan 01: Journal Engine Summary

**Double-entry journal engine with balance validation, IDR integer enforcement, sequential JE-MMDD-NNN numbering, and reversal workflow using original entry dates**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-13T05:59:30Z
- **Completed:** 2026-03-13T06:05:10Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Journal engine with createJournalEntryWithLines enforcing double-entry balance validation, IDR integer-only amounts, and denormalized entryDate on lines
- createReversalEntry with void pairing validation, original-date reversal, sourceId passthrough, and immutability enforcement
- 27 unit tests covering all pure validation functions, convenience builders, and void pairing logic
- All 736 tests pass (27 new + 709 existing), type-check and build green

## Task Commits

Each task was committed atomically:

1. **Task 1: TDD validation tests + pure functions + type interfaces** - `6e831ab` (test)
2. **Task 2: Implement createJournalEntryWithLines and createReversalEntry** - `c8ed561` (feat)

## Files Created/Modified
- `convex/lib/journalEngine.ts` - Double-entry journal engine: validation, builders, createJournalEntryWithLines, createReversalEntry
- `convex/lib/__tests__/journalEngine.test.ts` - 27 unit tests covering validateJournalLines, validateVoidPairing, buildDebitLine, buildCreditLine, buildReversedLines

## Decisions Made
- Negative check fires before integer check in validateJournalLines -- a fractional negative like -50000.5 throws "non-negative", not "whole numbers", matching the must_haves truth
- NON_REVERSIBLE_TYPES explicit array guard (not implicit undefined from map lookup) prevents accidental double-voids and documents that manual entries require manual correction
- createReversalEntry passes original.sourceId through to the reversal entry to maintain by_source index queryability for downstream queries
- Integration tests for ctx-dependent functions (createJournalEntryWithLines, createReversalEntry) deferred -- pure function extraction covers the critical validation logic; full integration coverage should be added before Phase 44

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Journal engine ready for downstream consumers (Phases 44-47)
- All 7 exports available: createJournalEntryWithLines, createReversalEntry, validateJournalLines, validateVoidPairing, buildDebitLine, buildCreditLine, buildReversedLines
- Type exports available: JournalLine, JournalSourceType, CreateJournalEntryParams
- Grep audit confirms no journal insert leaks outside journalEngine.ts

---
*Phase: 42-journal-engine*
*Completed: 2026-03-13*
