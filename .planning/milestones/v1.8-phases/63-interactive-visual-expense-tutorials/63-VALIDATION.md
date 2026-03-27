---
phase: 63
slug: interactive-visual-expense-tutorials
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 63 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 |
| **Config file** | `vitest.config.ts` (project root) |
| **Quick run command** | `npm run test -- --run src/lib/__tests__/helpGuides.test.ts` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run type-check`
- **After every plan wave:** Run `npm run test && npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 63-01-01 | 01 | 1 | Types compile | type | `npm run type-check` | N/A | ⬜ pending |
| 63-01-02 | 01 | 1 | MockElements compile | type | `npm run type-check` | N/A | ⬜ pending |
| 63-01-03 | 01 | 1 | WalkthroughPlayer compile | type | `npm run type-check` | N/A | ⬜ pending |
| 63-01-04 | 01 | 2 | SubmitMocks compile | type | `npm run type-check` | N/A | ⬜ pending |
| 63-01-05 | 01 | 2 | ApproveMocks compile | type | `npm run type-check` | N/A | ⬜ pending |
| 63-01-06 | 01 | 2 | ReimburseMocks compile | type | `npm run type-check` | N/A | ⬜ pending |
| 63-01-07 | 01 | 2 | Barrel export compile | type | `npm run type-check` | N/A | ⬜ pending |
| 63-01-08 | 01 | 3 | Registry sections 8→6 | unit | `npm run test -- --run src/lib/__tests__/helpGuides.test.ts` | Yes (update) | ⬜ pending |
| 63-01-09 | 01 | 3 | Test assertions updated | unit | `npm run test -- --run src/lib/__tests__/helpGuides.test.ts` | Yes (update) | ⬜ pending |
| 63-01-10 | 01 | 3 | ExpenseGuide integration | build | `npm run build` | N/A | ⬜ pending |
| 63-01-11 | 01 | 4 | Full build succeeds | build | `npm run build` | N/A | ⬜ pending |
| 63-01-12 | 01 | 4 | Full test suite green | unit | `npm run test` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — existing test infrastructure covers all phase requirements. The `helpGuides.test.ts` file already exists and needs test updates (not new test files). Type checking and build validation are built-in.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual rendering (light/dark mode) | Mock panels render correctly in both modes | No visual regression testing infrastructure | Navigate to `/help/expenses`, toggle dark mode, verify mock panels use correct theme colors |
| Mobile step pills | Step list becomes horizontal pill bar on <768px | No responsive testing infrastructure | Resize browser to <768px, verify pill bar replaces sidebar |
| Keyboard navigation | ArrowLeft/ArrowRight navigate steps | No keyboard interaction tests | Focus walkthrough area, press arrow keys, verify step changes |
| Cross-fade animation | Mock panels crossfade on step change | Animation testing not supported | Click between steps, verify smooth opacity transition |
| Deep link scroll | `/help/expenses#walkthrough` scrolls to section | No scroll position testing | Navigate to URL, verify scroll position |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
