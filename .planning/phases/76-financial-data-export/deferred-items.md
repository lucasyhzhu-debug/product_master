# Phase 76 — Deferred Items

Items discovered during plan execution that are out-of-scope for the current
plan. Documented here for follow-up rather than auto-fixed.

---

## Pre-existing test fragility: `convex/staffAttendance/__tests__/correctAttendance.test.ts`

**Discovered during:** Plan 76-02 Task 2.3 (full `npm run test` suite) and confirmed in plan 76-03 worktree.

**Symptom:** Two tests fail with `ConvexError: Existing date (2026-05-09) does
not match new clock-in WIB date (2026-05-08). Use add_missed + delete to move a
shift across dates.` — affecting:
1. "edit_timestamps appends corrections[] entry with previousClockIn/previousClockOut"
2. "multiple corrections accumulate in corrections[] preserving history"

**Root cause:** The tests use `Date.now()` to compute both `date` (today's WIB
date) and `clockIn` / `clockOut` (offsets from now) without mocking the clock.
When the test runs within a few hours of WIB midnight, the rollover between
`today = toWibDateString(Date.now())` and the mutation's recomputed WIB date
from `clockIn = Date.now() - 3h` straddles a calendar-day boundary. The
mutation's strict-equality check at `convex/staffAttendance/mutations.ts:255`
then rejects.

**Why deferred:** Outside Phase 76 scope. No files in `convex/staffAttendance/`
were touched in plan 76-02 or 76-03 (verified via `git log --oneline`).
This is a pre-existing flaky-test pattern that surfaces only near WIB
midnight. Fix belongs in a separate `staffAttendance` test-hygiene plan that
injects a fixed clock fixture (e.g., `vi.setSystemTime`).

**Reference:** `convex/staffAttendance/__tests__/correctAttendance.test.ts:75-93`
(test 1) and `:349` (test 2).

---

## Orphan-line silent skip in `getRawTransactionsExport` (Phase 77 candidate)

**Discovered during:** Triple-review I7 (2026-05-09).

**Symptom:** `getRawTransactionsExport` enriches each `journalEntryLines` row by
fetching its parent `journalEntries`. Lines whose parent JE has been deleted
are silently `continue`'d — they appear in the preflight `journalLineCount`
but not in the CSV output. Accountant sees a row-count discrepancy with no
explanation.

```typescript
// convex/reports/financialExport.ts ~ line 111-113
if (!je) continue; // orphaned line — silent skip (data integrity belongs in Phase 77)
```

**Why deferred:**
- Frollie's accounting model treats JE lines as immutable; orphans should
  not exist in production. They indicate either a database integrity bug or
  a manual cleanup that bypassed cascading deletes.
- Surfacing them in the CSV (e.g. with `entryNumber="<orphan>"`) requires a
  schema decision the export shouldn't be making in isolation.
- Phase 77 (Data Health Dashboard) is the right home for both detection
  (admin-visible orphan count) and remediation tooling.

**Mitigation in Phase 76:** None for now. The preflight overcounts by the
orphan count — for a clean prod database this is 0.

**Phase 77 backlog notes:**
- Add an admin query that returns orphan JE-line IDs.
- Decide whether to include orphans in the raw export with sentinel markers
  (`<orphan>`) or deduct them from the preflight count for parity.
- Add a `productionRevenueExternal` integrity check to detect the same class.

**Reference:** `convex/reports/financialExport.ts:111-113`.
