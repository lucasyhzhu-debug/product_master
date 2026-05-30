---
phase: 74
slug: staff-attendance
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-16
completed: 2026-04-16
---

# Phase 74 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 + convex-test (backend), Playwright (E2E) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `npm run test -- staffAttendance` |
| **Full suite command** | `npm run test && npm run build` |
| **Estimated runtime** | ~45 seconds (unit+integration), ~3 min (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- staffAttendance`
- **After every plan wave:** Run `npm run test && npm run type-check`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Populated by Plan 04 Task 2 (2026-04-16). Compliance flags (nyquist_compliant, wave_0_complete) flip in Plan 04 Task 3 after the full gate passes.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 74-01-01 | 01 | 1 | ATT-01 | T-74-04 | Clock-in rejects prior-day open shift (D-04) | integration | `npx vitest run convex/staffAttendance/__tests__/clockIn.test.ts` | ✅ | ✅ passing |
| 74-01-02 | 01 | 1 | ATT-01 | T-74-01 | clockIn derives userId from session (no arg) | integration | `npx vitest run convex/staffAttendance/__tests__/clockIn.test.ts` | ✅ | ✅ passing |
| 74-01-03 | 01 | 1 | ATT-01 | T-74-04 | clockOut D-04 server enforcement for staff on prior day | integration | `npx vitest run convex/staffAttendance/__tests__/clockOut.test.ts` | ✅ | ✅ passing |
| 74-01-04 | 01 | 1 | ATT-01 | — | clockOut permits manager to close others | integration | `npx vitest run convex/staffAttendance/__tests__/clockOut.test.ts` | ✅ | ✅ passing |
| 74-01-05 | 01 | 1 | ATT-04 | T-74-02 | correctAttendance manager/admin role gate | integration | `npx vitest run convex/staffAttendance/__tests__/correctAttendance.test.ts` | ✅ | ✅ passing |
| 74-01-06 | 01 | 1 | ATT-04 | — | D-19 correctionNote trimmed non-empty | integration | `npx vitest run convex/staffAttendance/__tests__/correctAttendance.test.ts` | ✅ | ✅ passing |
| 74-01-07 | 01 | 1 | ATT-04 | T-74-02 | corrections[] audit trail appended (all 4 actions) | integration | `npx vitest run convex/staffAttendance/__tests__/correctAttendance.test.ts` | ✅ | ✅ passing |
| 74-01-08 | 01 | 1 | ATT-04 | — | I-1 clockOut < clockIn guard | integration | `npx vitest run convex/staffAttendance/__tests__/correctAttendance.test.ts` | ✅ | ✅ passing |
| 74-01-09 | 01 | 1 | ATT-01..04 | — | D-18 flag-engine (4 rules) pure-function | unit | `npx vitest run convex/staffAttendance/__tests__/flagEngine.test.ts` | ✅ | ✅ passing |
| 74-01-10 | 01 | 1 | ATT-02/03 | — | totalHoursWorked sum (D-03 open=0) | integration | `npx vitest run convex/kitchenShiftRecords/__tests__/summary.test.ts` | ✅ | ✅ passing |
| 74-01-11 | 01 | 1 | ATT-03 | — | daysAttended distinct + flaggedShiftCount | integration | `npx vitest run convex/kitchenShiftRecords/__tests__/summary.test.ts` | ✅ | ✅ passing |
| 74-01-12 | 01 | 1 | ATT-02 | — | BOM ball counting preserved | integration | `npx vitest run convex/kitchenShiftRecords/__tests__/summary.test.ts` | ✅ | ✅ passing |
| 74-01-13 | 01 | 1 | ATT-03 | — | D-07 retroactive production (attendance-only staff surface) | integration | `npx vitest run convex/kitchenShiftRecords/__tests__/summary.test.ts` | ✅ | ✅ passing |
| 74-01-14 | 01 | 1 | ATT-03 | — | D-11 componentTotals preserve unit (no cross-unit sum) | integration | `npx vitest run convex/kitchenShiftRecords/__tests__/summary.test.ts` | ✅ | ✅ passing |
| 74-01-15 | 01 | 1 | ATT-04 | — | 4 flag-engine rules surface through summary query | integration | `npx vitest run convex/kitchenShiftRecords/__tests__/summary.test.ts` | ✅ | ✅ passing |
| 74-01-16 | 01 | 1 | ATT-03 | — | D-14 adapter fallback when kitchenConfig lacks componentTracking | integration | `npx vitest run convex/kitchenShiftRecords/__tests__/summary.test.ts` | ✅ | ✅ passing |
| 74-01-17 | 01 | 1 | ATT-03 | — | C-5 componentTracking subset semantics | integration | `npx vitest run convex/kitchenShiftRecords/__tests__/summary.test.ts` | ✅ | ✅ passing |
| 74-02-01 | 02 | 2 | ATT-01 | T-74-16 | RunningTimer renders minute-resolution | unit | `npx vitest run src/components/staffAttendance/__tests__/RunningTimer.test.tsx` | ✅ | ✅ passing |
| 74-04-01 | 04 | 3 | ATT-01 | T-74-14 | E2E scaffold: gate → kitchen → clock-out | e2e (gated) | `PLAYWRIGHT_E2E_FULL=1 npx playwright test tests/e2e/staff-attendance.spec.ts` | ✅ | 🟡 skipped without env flag |

---

## Wave 0 Requirements

> R-5 (staff review 2026-04-16): filenames aligned to actual plan scaffolds. Plans split tests by mutation/query instead of a single monolithic file.
> Plan 04 (2026-04-16): all scaffolds replaced with real convex-test cases — 47 phase-74 tests green; full suite 1555/1555.

- [x] `convex/staffAttendance/__tests__/clockIn.test.ts` — 5 real tests (prior-day block D-04, token-derived userId T-74-01, same-day double-click, open-row insertion, deletedAt ignored)
- [x] `convex/staffAttendance/__tests__/clockOut.test.ts` — 6 real tests (durationMs denormalization, owner-or-manager gate, D-04 server enforcement, already-closed + deleted guards)
- [x] `convex/staffAttendance/__tests__/correctAttendance.test.ts` — 8 real tests (role gate, D-19 trimmed note, 4 actions + I-1 guard + multi-correction history)
- [x] `convex/staffAttendance/__tests__/flagEngine.test.ts` — 18 real pure-function tests (Plan 01 Task 1)
- [x] `convex/kitchenShiftRecords/__tests__/summary.test.ts` — 10 real integration tests (hours sum D-03, daysAttended, BOM balls, flaggedShiftCount, D-07 retroactive, D-11 no-cross-unit-sum, 4-flag-rule integration, D-14 adapter fallback, C-5 componentTracking subset, sort desc)
- [x] `tests/e2e/staff-attendance.spec.ts` — gate → kitchen → clock-out happy path (gated by `PLAYWRIGHT_E2E_FULL=1`) + 2 explicit `test.skip` placeholders deferred to HUMAN-UAT

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Gate screen one-tap feel on real tablet | ATT-01 | Touch target latency measurable only on device | Load `/kitchen/clock` on kitchen tablet, measure tap → kitchen view time |
| Running timer minute-resolution visual | ATT-01 | setInterval drift over 8h shift observable only in session | Clock in, keep tab open 60+ min, verify timer monotonic |
| AttendanceStrip visibility | ATT-01 | Requires being clocked in; verifying null-render in default state | Before clock-in: strip invisible. After clock-in: strip visible at top of `/kitchen`. After clock-out: strip disappears. |
| D-08 self-submission nudge gate (C-6 fix) | ATT-01 | Multi-user kiosk scenario requires two seeded users | User A clocks in → User A submits EndOfShiftForm with "User A" selected → nudge fires. User A submits with "User B" selected → nudge does NOT fire. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** auto — gsd-planner phase 74 plans complete (Plan 04 verification passed: type-check + test + build green; see 74-04-SUMMARY.md for known pre-existing lint debt outside Phase 74 scope).
