---
status: partial
phase: 74-staff-attendance
source: [74-VERIFICATION.md]
started: 2026-04-17T06:15:00Z
updated: 2026-04-17T06:15:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Kitchen clock-in flow
expected: Login as kitchen user → gate screen renders at /kitchen/clock with Clock-In button → tap → success toast → redirect to /kitchen with AttendanceStrip running timer
result: [pending]

### 2. D-08 self-submission nudge
expected: Submit shift for self → ClockOutNudgeDialog opens. Submit shift for another chef → no dialog (T-74-17).
result: [pending]

### 3. Manager correction flow
expected: Manager navigates /staff-performance → sees flagged shifts banner → clicks Fix → AttendanceCorrectionDialog opens with review diff step.
result: [pending]

### 4. /my-performance self-scoped
expected: Kitchen user at /my-performance sees only own attendance and production data. No other staff data visible (T-74-03).
result: [pending]

### 5. D-04 prior-day block
expected: Kitchen user with open shift from yesterday sees gate screen with error message directing them to ask manager. Cannot clock in.
result: [pending]

### 6. Browser refresh mid-shift
expected: After browser refresh during an open shift, RunningTimer resumes displaying correct elapsed time (not reset to 0).
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
