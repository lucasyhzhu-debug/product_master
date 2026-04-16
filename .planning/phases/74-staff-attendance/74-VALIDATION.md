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
| 74-01-01 | 01 | 1 | ATT-01 | — | Clock-in rejects prior-open-shift | unit | `npm run test -- staffAttendance/mutations` | ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `convex/staffAttendance/__tests__/mutations.test.ts` — stubs for ATT-01, ATT-04
- [ ] `convex/staffAttendance/__tests__/flags.test.ts` — stubs for D-18 auto-flag rules
- [ ] `convex/staffAttendance/__tests__/queries.test.ts` — stubs for ATT-02, ATT-03
- [ ] `tests/e2e/staff-attendance.spec.ts` — gate screen + correction dialog E2E

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Gate screen one-tap feel on real tablet | ATT-01 | Touch target latency measurable only on device | Load `/kitchen/clock` on kitchen tablet, measure tap → kitchen view time |
| Running timer minute-resolution visual | ATT-01 | setInterval drift over 8h shift observable only in session | Clock in, keep tab open 60+ min, verify timer monotonic |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
