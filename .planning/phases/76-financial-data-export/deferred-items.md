# Phase 76 — Deferred Items

Items discovered during plan execution that are out-of-scope for the current
plan. Documented here for follow-up rather than auto-fixed.

---

## Pre-existing test fragility: `convex/staffAttendance/__tests__/correctAttendance.test.ts`

**Discovered during:** Plan 76-02 Task 2.3 — full `npm run test` suite.

**Symptom:** Two tests fail with `ConvexError: Existing date (2026-05-09) does
not match new clock-in WIB date (2026-05-08). Use add_missed + delete to move a
shift across dates.`

**Root cause:** The tests use `Date.now()` to compute both `date` (today's WIB
date) and `clockIn` / `clockOut` (offsets from now) without mocking the clock.
When the test happens to run within a few hours of WIB midnight, the rollover
between `today = toWibDateString(Date.now())` and the mutation's recomputed WIB
date from `clockIn = Date.now() - 3h` straddles a calendar-day boundary. The
mutation's strict-equality check at `convex/staffAttendance/mutations.ts:255`
then rejects.

**Why deferred:** Outside Plan 76-02 scope (no files in `convex/staffAttendance/`
were touched). This is a pre-existing flaky-test pattern that surfaces only
near WIB midnight. Fix belongs in a separate `staffAttendance` test-hygiene
plan that injects a fixed clock fixture. Verified via `git status` and
`git log --oneline convex/staffAttendance/` that 76-02 introduced zero changes
to this subsystem.

**Reference:** `convex/staffAttendance/__tests__/correctAttendance.test.ts:75-93`
(test 1) and `:349` (test 2).
