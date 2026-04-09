---
phase: 70
slug: data-accuracy-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 70 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + convex-test |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test -- --coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test -- --coverage`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 70-01-01 | 01 | 1 | DA-01 | — | N/A | integration | `npm run test` | ❌ W0 | ⬜ pending |
| 70-01-02 | 01 | 1 | DA-02 | — | N/A | integration | `npm run test` | ❌ W0 | ⬜ pending |
| 70-01-03 | 01 | 1 | DA-03 | — | N/A | unit | `npm run test` | ❌ W0 | ⬜ pending |
| 70-01-04 | 01 | 1 | DA-04 | — | N/A | integration | `npm run test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stubs for revenue sync pipeline (DA-01/DA-02)
- [ ] Test stubs for COGS override logic (DA-03)
- [ ] Test stubs for employee profile mutations (DA-04)

*Existing infrastructure covers test framework — only test files needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Direct sales appear in Sales Analytics UI | DA-01 | Visual verification of chart data | Run dev, create order, sync, check Sales Analytics page |
| COGS override inline editing works | DA-03 | UI interaction test | Edit cogsOverride on MenuProductsManager, verify Income Statement uses it |
| Employee edit dialog shows new fields | DA-04 | Visual verification | Open UsersManager, edit user, verify hireDate/baseRate/bankAccountHolderName fields |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
