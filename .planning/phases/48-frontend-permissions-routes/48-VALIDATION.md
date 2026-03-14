---
phase: 48
slug: frontend-permissions-routes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 48 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + convex-test (backend), TypeScript compiler (frontend) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx tsc --noEmit` |
| **Full suite command** | `npm run build && npm run test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit`
- **After every plan wave:** Run `npm run build && npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 48-01-01 | 01 | 1 | PERM-01 | type-check | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 48-01-02 | 01 | 1 | PERM-01,02,03,04 | type-check | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 48-01-03 | 01 | 2 | PERM-01,02,03,04 | build | `npm run build` | ✅ | ⬜ pending |
| 48-01-04 | 01 | 2 | PERM-01,03 | type-check | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 48-01-05 | 01 | 3 | ALL | build | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. This phase modifies TypeScript types and routes — the TypeScript compiler and build system are the primary validation tools.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Kitchen role sees Expenses nav link | PERM-01 | UI navigation rendering | Log in as kitchen role, verify /expenses link visible |
| Manager sees Approval tab on Expenses | PERM-02 | Role-conditional UI tabs | Log in as manager, navigate to /expenses, verify Approvals tab |
| Non-admin blocked from /reimbursements | PERM-03 | ProtectedRoute redirect | Log in as manager, navigate to /reimbursements, verify redirect |
| Manager sees Expense Analytics link | PERM-04 | Navigation visibility | Log in as manager, verify /expense-analytics link visible |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
