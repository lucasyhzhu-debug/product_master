---
phase: 73
slug: bank-reconciliation-ui-workflow
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-15
---

# Phase 73 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x + convex-test (backend) / Playwright (E2E) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `npm run test -- --run <pattern>` |
| **Full suite command** | `npm run test && npm run build` |
| **Estimated runtime** | ~60s unit, ~120s build, ~240s Playwright |

---

## Sampling Rate

- **After every task commit:** Run `npm run type-check`
- **After every plan wave:** Run `npm run test -- --run <wave-pattern>` then `npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green (tests + build)
- **Max feedback latency:** 60 seconds (type-check) / 180 seconds (full suite)

---

## Per-Task Verification Map

Populated by planner from task IDs. Each task must have either:
- An `<automated>` verify command (unit/integration/build), OR
- A Wave 0 stub file listed under "Wave 0 Requirements" below, OR
- An entry in "Manual-Only Verifications" with justification.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD     | TBD  | TBD  | BANK-03/04  | TBD        | TBD             | TBD       | TBD               | ❌ W0      | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Backend test stubs required before implementation:

- [ ] `convex/bankStatements/__tests__/manualMatch.test.ts` — stubs for BANK-03 (manual match + unmatch)
- [ ] `convex/bankStatements/__tests__/statementProgress.test.ts` — stubs for BANK-04 (progress aggregation)
- [ ] `convex/bankStatements/__tests__/reconciliationReversal.test.ts` — stubs for bank_statement_reversal sourceType (unmatch-reverses-JE flow)
- [ ] `tests/e2e/bank-reconciliation-workflow.spec.ts` — Playwright stubs for split-view match/unmatch and progress indicator

*Extend as planner decomposes tasks. Use existing `convex-test` patterns from `convex/bankStatements/__tests__/*.test.ts` (Phase 72).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual split-screen layout matches UI-SPEC | BANK-03 | Layout/spacing subjective; automated DOM checks brittle | Run `npm run dev`, open `/bank-reconciliation`, compare against UI-SPEC.md screenshots |
| Indonesian Rupiah formatting in amounts | BANK-03/04 | Locale rendering cannot be verified reliably in jsdom | Manual check: amounts display as `Rp 1.234.567` (dot thousand separator) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (always `--run` for CI-safe commands)
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
