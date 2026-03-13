---
phase: 46
slug: reimbursement
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 46 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run convex/reimbursements` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run type-check`
- **After every plan wave:** Run `npm run test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 46-01-01 | 01 | 1 | RMB-07 | unit (ctx-dependent) | `npx vitest run convex/bankAccounts` | ❌ W0 | ⬜ pending |
| 46-01-02 | 01 | 1 | RMB-08 | unit (ctx-dependent) | `npx vitest run convex/auth` | ❌ W0 | ⬜ pending |
| 46-01-03 | 01 | 1 | RMB-02 | unit (ctx-dependent) | `npx vitest run convex/reimbursements` | ❌ W0 | ⬜ pending |
| 46-01-04 | 01 | 1 | RMB-01 | unit (ctx-dependent) | `npx vitest run convex/reimbursements` | ❌ W0 | ⬜ pending |
| 46-01-05 | 01 | 1 | RMB-03, RMB-04 | unit (ctx-dependent) | `npx vitest run convex/reimbursements` | ❌ W0 | ⬜ pending |
| 46-01-06 | 01 | 1 | RMB-05 | unit (ctx-dependent) | `npx vitest run convex/reimbursements` | ❌ W0 | ⬜ pending |
| 46-01-07 | 01 | 1 | RMB-06 | unit (ctx-dependent) | `npx vitest run convex/reimbursements` | ❌ W0 | ⬜ pending |
| 46-02-01 | 02 | 2 | RMB-01 | manual | N/A | N/A | ⬜ pending |
| 46-02-02 | 02 | 2 | RMB-02, RMB-03 | manual | N/A | N/A | ⬜ pending |
| 46-02-03 | 02 | 2 | RMB-05 | manual | N/A | N/A | ⬜ pending |
| 46-02-04 | 02 | 2 | RMB-06 | manual | N/A | N/A | ⬜ pending |
| 46-02-05 | 02 | 2 | RMB-07 | manual | N/A | N/A | ⬜ pending |
| 46-02-06 | 02 | 2 | RMB-08 | manual | N/A | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `convex/reimbursements/__tests__/helpers.test.ts` — stubs for pure validation (if any emerge)
- [ ] `convex/bankAccounts/__tests__/helpers.test.ts` — stubs for pure validation (if any emerge)

*Most logic is ctx-dependent (batch + expense + JE operations). Pure function extraction limited but should be attempted for validation that doesn't need database access (e.g., validateBankReference, validateTransferDate).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Grouped expense view with employee bank details | RMB-01 | UI layout + grouping logic in component | Open ReimbursementManager, verify expenses grouped by employee with running totals |
| Batch creation flow with expense selection | RMB-02 | Multi-step UI wizard | Select expenses per employee, create batch, verify RMB code generated |
| Batch confirmation with bank details form | RMB-03 | Form UI + bank account selection | Enter BCA reference, transfer date, select source bank, confirm |
| Void batch and verify expense reversion | RMB-05 | Multi-record state change visual | Void a confirmed batch, verify linked expenses return to AwaitingPayment |
| Batch search by RMB code or BCA reference | RMB-06 | Search UI interaction | Search for batch by partial RMB code and BCA reference |
| Bank accounts manager CRUD | RMB-07 | EntityManager UI pattern | Add/edit/deactivate company bank accounts |
| User bank details self-service | RMB-08 | Profile section interaction | Update own bank details, verify displayed on reimbursement view |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
