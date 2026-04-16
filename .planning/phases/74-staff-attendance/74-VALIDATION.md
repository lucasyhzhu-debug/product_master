---
phase: 74
slug: staff-attendance
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-16
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

> Populated by gsd-planner when plans are written. See `74-RESEARCH.md` §Validation Architecture for test scenarios.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 74-01-01 | 01 | 1 | ATT-01 | — | Clock-in rejects prior-open-shift | unit | `npm run test -- staffAttendance/__tests__/clockIn.test.ts` | ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

> R-5 (staff review 2026-04-16): filenames aligned to actual plan scaffolds. Plans split tests by mutation/query instead of a single monolithic file.

- [ ] `convex/staffAttendance/__tests__/clockIn.test.ts` — stubs for ATT-01 clock-in behaviors (prior-day block, same-day double-click, token-derived userId)
- [ ] `convex/staffAttendance/__tests__/clockOut.test.ts` — stubs for ATT-01 clock-out behaviors (manager override, durationMs)
- [ ] `convex/staffAttendance/__tests__/correctAttendance.test.ts` — stubs for ATT-04 manager correction (edit_timestamps, add_missed, reassign, delete, required note, clockOut >= clockIn guard)
- [ ] `convex/staffAttendance/__tests__/flagEngine.test.ts` — REAL tests for D-18 auto-flag rules (over_16h, missing_clockout, overlapping, before_hire); pure-function, no ctx needed
- [ ] `convex/kitchenShiftRecords/__tests__/summary.test.ts` — stubs for ATT-02/ATT-03 extended getStaffPerformanceSummary (hours, daysAttended, flaggedShiftCount, perDayBreakdown, D-11 no-cross-unit-sum, D-14 adapter, C-5 componentTracking subset)
- [ ] `tests/e2e/staff-attendance.spec.ts` — gate screen happy path + deferred correction/manager flows

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
