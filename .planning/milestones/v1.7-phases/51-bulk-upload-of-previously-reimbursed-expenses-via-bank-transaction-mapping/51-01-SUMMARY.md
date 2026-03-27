---
phase: 51-bulk-upload-of-previously-reimbursed-expenses-via-bank-transaction-mapping
plan: 01
subsystem: database, api
tags: [convex, journal-engine, schema, metadata, receipt-url]

# Dependency graph
requires:
  - phase: 42-journal-engine
    provides: createJournalEntryWithLines helper and CreateJournalEntryParams interface
provides:
  - journalEntries.metadata optional field with receiptUrl support
  - CreateJournalEntryParams metadata parameter for receipt URL persistence
affects: [51-02-PLAN (import mutation uses metadata for receipt URLs)]

# Tech tracking
tech-stack:
  added: []
  patterns: [conditional spread for optional schema fields in insert calls]

key-files:
  created: []
  modified:
    - convex/schema.ts
    - convex/lib/journalEngine.ts

key-decisions:
  - "Conditional spread pattern for metadata to avoid inserting undefined field"

patterns-established:
  - "Optional metadata on journalEntries: use v.optional(v.object({...})) for extensible metadata without polluting description"

requirements-completed: []

# Metrics
duration: 2min
completed: 2026-03-15
---

# Phase 51 Plan 01: Schema Metadata & Journal Engine Extension Summary

**Optional metadata field on journalEntries schema with conditional spread in journal engine insert for receipt URL persistence**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-15T02:31:55Z
- **Completed:** 2026-03-15T02:33:45Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Added backward-compatible `metadata` optional field to `journalEntries` schema with `receiptUrl` sub-field
- Extended `CreateJournalEntryParams` interface to accept optional metadata parameter
- Added conditional metadata spread in `ctx.db.insert` call (critical -- without this, metadata would be silently dropped)
- Verified all 27 existing journal engine tests pass (zero regressions)
- Type-check clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Add metadata field to journalEntries schema and extend journal engine** - `24020b9` (feat)

## Files Created/Modified
- `convex/schema.ts` - Added `metadata: v.optional(v.object({ receiptUrl: v.optional(v.string()) }))` to journalEntries table
- `convex/lib/journalEngine.ts` - Extended CreateJournalEntryParams interface and ctx.db.insert spread

## Decisions Made
- Used conditional spread `...(params.metadata ? { metadata: params.metadata } : {})` instead of always including metadata, to avoid inserting an undefined field on entries that don't use it

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Journal engine now accepts metadata with receipt URLs, ready for Plan 02 (import mutation)
- Existing callers (expense approval, reimbursement, payroll, void) continue working without changes
- No blockers

## Self-Check: PASSED

- convex/schema.ts: FOUND
- convex/lib/journalEngine.ts: FOUND
- 51-01-SUMMARY.md: FOUND
- Commit 24020b9: FOUND

---
*Phase: 51-bulk-upload-of-previously-reimbursed-expenses-via-bank-transaction-mapping*
*Completed: 2026-03-15*
