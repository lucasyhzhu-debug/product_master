---
phase: 45
slug: expense-approval-void
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 45 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run convex/expenses` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run convex/expenses`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 45-01-01 | 01 | 1 | EXP-08 | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts` | ✅ extend | ⬜ pending |
| 45-01-02 | 01 | 1 | EXP-09 | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts` | ✅ extend | ⬜ pending |
| 45-01-03 | 01 | 1 | EXP-10 | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts` | ✅ extend | ⬜ pending |
| 45-01-04 | 01 | 1 | EXP-11 | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts` | ✅ extend | ⬜ pending |
| 45-01-05 | 01 | 1 | EXP-14 | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts` | ✅ extend | ⬜ pending |
| 45-01-06 | 01 | 1 | EXP-15 | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts` | ✅ extend | ⬜ pending |
| 45-01-07 | 01 | 1 | EXP-17 | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts` | ✅ extend | ⬜ pending |
| 45-01-08 | 01 | 1 | FRAUD-05 | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts` | ✅ extend | ⬜ pending |
| 45-02-01 | 02 | 1 | EXP-07 | manual-only | N/A | N/A | ⬜ pending |
| 45-02-02 | 02 | 1 | EXP-12 | manual-only | N/A | N/A | ⬜ pending |
| 45-02-03 | 02 | 1 | EXP-13 | manual-only | N/A | N/A | ⬜ pending |
| 45-02-04 | 02 | 1 | EXP-16 | manual-only | N/A | N/A | ⬜ pending |
| 45-02-05 | 02 | 1 | FRAUD-01 | display | N/A | N/A | ⬜ pending |
| 45-02-06 | 02 | 1 | FRAUD-03 | display | N/A | N/A | ⬜ pending |
| 45-02-07 | 02 | 1 | FRAUD-04 | manual-only | N/A | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. The `convex/expenses/__tests__/helpers.test.ts` file exists and will be extended with DoA helper tests. No new test files or framework config needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| JE auto-generated on approval | EXP-12 | Requires full Convex runtime (`ctx.db` operations, journal engine) | 1. Create and submit expense, 2. Approve as manager/admin, 3. Verify JE created with correct DR/CR accounts |
| Approval queue broadcast routing | EXP-07 | Requires multiple user sessions and real-time query updates | 1. Submit expense as user A, 2. Verify it appears in manager B and admin C queues, 3. Approve as B, 4. Verify removed from C's queue |
| Rejection + resubmission chain | EXP-13 | End-to-end flow across multiple mutations | 1. Submit, 2. Reject with reason, 3. Verify reason visible to submitter, 4. Resubmit with previousExpenseId, 5. Verify chain visible to next approver |
| Admin void with reversing JE | EXP-16 | Requires journal engine reversal in Convex runtime | 1. Approve expense, 2. Void as admin, 3. Verify reversing JE created, 4. Verify original JE marked isReversed |
| Rejection chain display | FRAUD-04 | UI-level display of chain query results | 1. Create rejection chain (submit->reject->resubmit), 2. Verify count badge and reasons shown to approver |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
