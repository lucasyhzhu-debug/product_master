---
phase: 73
slug: bank-reconciliation-ui-workflow
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-14
---

# Phase 73 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (backend via convex-test) + Playwright (E2E) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `npm run test -- --run <pattern>` |
| **Full suite command** | `npm run test -- --run && npm run build` |
| **Estimated runtime** | ~45 seconds (unit) + ~90 seconds (E2E smoke) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --run <plan-scoped pattern>`
- **After every plan wave:** Run `npm run test -- --run && npm run type-check`
- **Before `/gsd-verify-work`:** Full suite + `npm run build` must be green
- **Max feedback latency:** 60 seconds (quick); 180 seconds (full)

---

## Per-Task Verification Map

> Filled by planner during PLAN.md generation. Each task must map to an automated verify command OR reference a Wave 0 stub.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 73-01-XX | 01 | 1 | BANK-03 | T-73-01 | requireRole(manager,admin) on all reconciliation mutations | unit | `npm run test -- --run convex/bankStatements/__tests__/reconciliation.test.ts` | ❌ W0 | ⬜ pending |
| 73-02-XX | 02 | 2 | BANK-03 | — | split-view click-to-select refreshes candidate pane | component | `npm run test -- --run src/components/bankReconciliation/__tests__/SplitView.test.tsx` | ❌ W0 | ⬜ pending |
| 73-03-XX | 03 | 3 | BANK-04 | — | revenue gap aggregation by period+channel | unit | `npm run test -- --run convex/bankStatements/__tests__/revenueGap.test.ts` | ❌ W0 | ⬜ pending |
| 73-04-XX | 04 | 4 | BANK-03 | T-73-04 | inline expense create routes through standard submission (submitted, not approved) | integration | `npm run test -- --run convex/expenses/__tests__/inlineFromBank.test.ts` | ❌ W0 | ⬜ pending |
| 73-05-XX | 05 | 5 | BANK-03 | — | Confirm → JE posted; Unmatch → reversal JE created | E2E | `npm run test:e2e -- bankReconciliation.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `convex/bankStatements/__tests__/reconciliation.test.ts` — stubs covering manualMatch, unmatch, confirmLine (JE posted), batchConfirm (DR/CR balance gate), reverseConfirmation (reversal JE created)
- [ ] `convex/bankStatements/__tests__/revenueGap.test.ts` — stubs covering Bank CR vs ExternalRevenue aggregation per channel+period (including `(unallocated)` synthetic row + ∞ case)
- [ ] `convex/bankKeywordRules/__tests__/createFromOverride.test.ts` — stubs covering manager+admin permission widening for `createFromOverride` mutation only (regular CRUD stays admin-only)
- [ ] `convex/expenses/__tests__/inlineFromBank.test.ts` — stubs covering inline expense creation routes through standard submit mutation (status=submitted, receipt required, submittedBy required)
- [ ] `src/components/bankReconciliation/__tests__/SplitView.test.tsx` — stubs covering line selection model + candidate refresh
- [ ] `src/components/bankReconciliation/__tests__/BatchConfirmModal.test.tsx` — stubs covering balanced DR/CR sanity gate (blocks Post when mismatched)
- [ ] `tests/e2e/bankReconciliation.spec.ts` — E2E smoke: upload → review → match → confirm → verify JE exists; then unmatch → verify reversal JE

*Vitest + convex-test + Playwright already installed. No framework setup needed; only test file stubs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Progress bar live-updates across tabs as Confirm posts JEs | BANK-04 | Convex reactivity timing — automated test would assert implementation not UX | With two browser sessions on same statement, Confirm in one, observe count changes in the other within 2 seconds |
| CapEx handoff navigates and pre-fills Asset Register intake | BANK-03 | Cross-route pre-fill via URL params — covered by E2E but handoff UX smoothness is judgment | Click `[Route to Asset Register]` on a CapEx-flagged line, verify pre-fill, save asset, return to bank rec, verify line auto-matched |
| Learn-from-override dialog counterparty extraction pre-fill quality | BANK-03 | Heuristic quality is subjective | Override a category on 3 different line types (transfer, debit card, QRIS); verify pre-filled patterns are usable without heavy editing |
| Revenue gap row drill-down filters split-view correctly | BANK-04 | Cross-tab filter propagation | Click a non-zero gap row; verify Review tab opens with `linkedChannel` + period filter applied |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s (quick) / 180s (full)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
