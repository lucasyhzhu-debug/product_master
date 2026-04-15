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

Test stubs required before implementation. Paths below match actual plan outputs.

### Backend (Plan 73-01 Wave 1a — Task 2)
- [ ] `convex/bankStatements/__tests__/manualMatch.test.ts` — manualMatch role matrix + cross-link guard
- [ ] `convex/bankStatements/__tests__/unmatch.test.ts` — unmatch reversal JE flow (bank_statement_reversal sourceType)
- [ ] `convex/bankStatements/__tests__/confirmLine.test.ts` — 2-line balanced JE posting
- [ ] `convex/bankStatements/__tests__/batchConfirm.test.ts` — batch confirm atomicity + skipped count

### Backend (Plan 73-02 Wave 0 — Task 0)
- [ ] `convex/bankStatements/__tests__/channelMapping.test.ts` — mapChannelToSource pure-function tests (11 mapping assertions + unknown/null/case-insensitive) (C1 from staff review)

### Backend (Plan 73-02 Wave 1b — Task 1)
- [ ] `convex/bankStatements/__tests__/progress.test.ts` — getStatementProgress aggregate + getStatementProgressBulk (Tests 1–8, including 50-id cap + mixed statuses)
- [ ] `convex/bankStatements/__tests__/listCandidates.test.ts` — ±3 day window + alreadyLinkedToLineId annotations + 4 search* queries + markAssetLinked idempotency (I1 Tests 6/7)
- [ ] `convex/bankStatements/__tests__/revenueGap.test.ts` — revenueGapByPeriod aggregation + (unallocated) row + diff arithmetic + unmapped channels group (C1 Tests 3/5)
- [ ] `convex/bankKeywordRules/__tests__/createFromOverride.test.ts` — manager+admin gate (D-12) + regex + uniqueness

### Frontend component tests (Plan 73-03 Wave 2a — Task 1)
- [ ] `src/components/bankReconciliation/__tests__/StatementHistoryList.test.tsx` — progress column rendering via useStatementProgressBulk
- [ ] `src/components/bankReconciliation/__tests__/StatementProgressHeader.test.tsx` — progress bar + 4 chips via useStatementProgress
- [ ] `src/components/bankReconciliation/__tests__/ReconciliationActionBar.test.tsx` — button states + capex variant swap + inline-create visibility

### Playwright E2E stubs (Plan 73-04 Wave 2b — Task 1)
- [ ] `tests/e2e/bank-reconciliation-inline-expense.spec.ts` — D-17 invariant (Submit for approval only, status="submitted", receipt required, line → suggested)
- [ ] `tests/e2e/bank-reconciliation-batch-confirm.spec.ts` — D-08 balance gate (preview groups, DR/CR totals, Ledger imbalance disables Post)
- [ ] `tests/e2e/bank-reconciliation-capex-roundtrip.spec.ts` — D-21/D-22 (capex flag button swap, AssetRegister prefills, duplicate detection, markAssetLinked + navigate back)

### Playwright E2E completion (Plan 73-06 Wave 3 — Task 1)
- [ ] `tests/e2e/bank-reconciliation-split-view.spec.ts` — select-line → see-candidates → match/unmatch/confirm happy path (Plan 03 surface)
- [ ] `tests/e2e/bank-rules-learn-from-override.spec.ts` — LearnFromOverride dialog → createFromOverride (D-10/D-11/D-12)
- [ ] `tests/e2e/bank-rules-perms.spec.ts` — D-23 role matrix (kitchen/order_staff blocked, manager allowed on /bank-reconciliation but blocked from /bank-rules, admin allowed everywhere)

*All stub files use existing `convex-test` + Testing Library + Playwright patterns from Phase 72 and earlier phases.*

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
