---
phase: 44
slug: expense-submission
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 44 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.0.18 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run convex/expenses/__tests__/helpers.test.ts` |
| **Full suite command** | `npm run test -- --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run convex/expenses/__tests__/helpers.test.ts`
- **After every plan wave:** Run `npm run test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 44-01-01 | 01 | 1 | EXP-01 | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -t "createDraft"` | ❌ W0 | ⬜ pending |
| 44-01-02 | 01 | 1 | EXP-02 | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -t "submit"` | ❌ W0 | ⬜ pending |
| 44-01-03 | 01 | 1 | EXP-03 | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -t "receipt"` | ❌ W0 | ⬜ pending |
| 44-01-04 | 01 | 1 | EXP-04 | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -t "duplicate hash"` | ❌ W0 | ⬜ pending |
| 44-01-05 | 01 | 1 | EXP-18 | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -t "audit"` | ❌ W0 | ⬜ pending |
| 44-01-06 | 01 | 1 | FRAUD-01 | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -t "soft duplicate"` | ❌ W0 | ⬜ pending |
| 44-01-07 | 01 | 1 | FRAUD-02 | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -t "hash block"` | ❌ W0 | ⬜ pending |
| 44-01-08 | 01 | 1 | FRAUD-03 | unit | `npx vitest run convex/expenses/__tests__/helpers.test.ts -t "late submission"` | ❌ W0 | ⬜ pending |
| 44-02-01 | 02 | 2 | EXP-05 | manual | manual UI verification | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `convex/expenses/__tests__/helpers.test.ts` — stubs for EXP-01 through EXP-04, EXP-18, FRAUD-01 through FRAUD-03
- [ ] `convex/expenses/helpers.ts` — pure functions to be tested (must exist before tests)

*Pure helper functions are the primary testable surface. Mutation logic that requires ctx is validated via type-check + manual testing, consistent with Phase 42 decision.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| listMyExpenses returns only current user's expenses | EXP-05 | Requires ctx.auth for user session | 1. Log in as user A, create expense 2. Log in as user B, verify B cannot see A's expense |
| Receipt image upload and preview | EXP-04 | File upload requires browser interaction | 1. Upload image file 2. Verify preview renders 3. Verify file stored in Convex storage |
| Status filter tabs work correctly | EXP-05 | UI interaction test | 1. Create expenses in different statuses 2. Click each tab 3. Verify correct filtering |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
