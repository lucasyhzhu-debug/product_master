---
phase: 50
slug: expense-analytics
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 50 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.0.18 + convex-test |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test -- --run` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --run`
- **After every plan wave:** Run `npm run test && npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 50-01-01 | 01 | 1 | XANL-01 | unit | `npx vitest run tests/convex/expenseAnalytics.test.ts -t "total opex" -x` | No -- W0 | pending |
| 50-01-02 | 01 | 1 | XANL-02 | unit | `npx vitest run tests/convex/expenseAnalytics.test.ts -t "by category" -x` | No -- W0 | pending |
| 50-01-03 | 01 | 1 | XANL-03 | unit | `npx vitest run tests/convex/expenseAnalytics.test.ts -t "by employee" -x` | No -- W0 | pending |
| 50-01-04 | 01 | 1 | XANL-04 | unit | `npx vitest run tests/convex/expenseAnalytics.test.ts -t "trend" -x` | No -- W0 | pending |
| 50-01-05 | 01 | 1 | XANL-05 | unit | `npx vitest run tests/convex/expenseAnalytics.test.ts -t "metrics" -x` | No -- W0 | pending |
| 50-01-06 | 01 | 1 | FRAUD-06 | unit | `npx vitest run convex/expenses/__tests__/fraudHelpers.test.ts -t "split" -x` | No -- W0 | pending |
| 50-01-07 | 01 | 1 | FRAUD-07 | unit | `npx vitest run convex/expenses/__tests__/fraudHelpers.test.ts -t "concentration" -x` | No -- W0 | pending |
| 50-01-08 | 01 | 1 | FRAUD-08 | unit | `npx vitest run convex/expenses/__tests__/fraudHelpers.test.ts -t "unfamiliar" -x` | No -- W0 | pending |
| 50-01-09 | 01 | 2 | XANL-06 | manual-only | Visual check that fraud flags render in dashboard | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `convex/expenses/__tests__/fraudHelpers.test.ts` — pure function tests for FRAUD-06, FRAUD-07, FRAUD-08
- [ ] `tests/convex/expenseAnalytics.test.ts` — convex-test integration tests for XANL-01 through XANL-05
- [ ] No framework install needed — Vitest + convex-test already configured

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Fraud flags render in dashboard | XANL-06 | Visual rendering of chart components and flag badges | Navigate to /expense-analytics as manager, verify fraud flag section shows split/concentration/vendor alerts |
| Chart responsiveness | N/A | Layout/visual | Resize browser, verify charts reflow correctly |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
