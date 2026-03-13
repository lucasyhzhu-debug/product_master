---
phase: 47
slug: payroll
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 47 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.0.18 + convex-test |
| **Config file** | `vitest.config.ts` (project root) |
| **Quick run command** | `npx vitest run convex/payroll/__tests__/helpers.test.ts` |
| **Full suite command** | `npm run test -- --run` |
| **Estimated runtime** | ~15 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run convex/payroll/__tests__/helpers.test.ts`
- **After every plan wave:** Run `npm run test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 47-01-01 | 01 | 1 | PAY-01 | unit | `npx vitest run convex/payroll/__tests__/helpers.test.ts` | ❌ W0 | ⬜ pending |
| 47-01-02 | 01 | 1 | PAY-02 | unit | `npm run type-check` | ✅ existing | ⬜ pending |
| 47-01-02 | 01 | 1 | PAY-03 | unit | `npx vitest run convex/payroll/__tests__/helpers.test.ts` | ❌ W0 | ⬜ pending |
| 47-01-02 | 01 | 1 | PAY-04 | type-check | `npm run type-check` | ✅ existing | ⬜ pending |
| 47-02-01 | 02 | 2 | PAY-01 | build | `npm run build` | ✅ existing | ⬜ pending |
| 47-02-01 | 02 | 2 | PAY-04 | build | `npm run build` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `convex/payroll/__tests__/helpers.test.ts` — stubs for PAY-01 (amount validation), PAY-03 (void status check, void reason validation)
- [ ] `convex/payroll/helpers.ts` — pure functions for TDD

*Existing infrastructure covers JE creation/reversal testing (convex/lib/__tests__/journalEngine.test.ts)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Payroll page renders with create form | PAY-01 | UI rendering | Navigate to /payroll as admin, verify form fields visible |
| Period filtering works | PAY-04 | UI interaction | Create entries in different periods, verify filter works |
| Void dialog with reason | PAY-03 | UI interaction | Click void on active entry, verify reason dialog appears |
| Admin-only nav visibility | PAY-01 | UI access control | Non-admin users should not see /payroll nav link |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
