---
phase: 71
slug: bulk-expense-upload-asset-reclassification
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 71 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + convex-test |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 71-01-01 | 01 | 1 | EXP-01 | — | CSV parsing validates headers, rejects malformed rows | unit | `npx vitest run tests/convex/bulkExpense.test.ts` | ❌ W0 | ⬜ pending |
| 71-01-02 | 01 | 1 | EXP-02 | — | Trusted batch creates expenses in Recorded status with JE | integration | `npx vitest run tests/convex/bulkExpense.test.ts` | ❌ W0 | ⬜ pending |
| 71-01-03 | 01 | 1 | EXP-03 | — | Untrusted batch creates expenses in Submitted status for DoA | integration | `npx vitest run tests/convex/bulkExpense.test.ts` | ❌ W0 | ⬜ pending |
| 71-01-04 | 01 | 1 | EXP-04 | — | Asset reclassification reverses capitalization, books NBV as OpEx | integration | `npx vitest run tests/convex/assetReclassification.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/convex/bulkExpense.test.ts` — stubs for EXP-01, EXP-02, EXP-03
- [ ] `tests/convex/assetReclassification.test.ts` — stubs for EXP-04

*Existing infrastructure (vitest + convex-test) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CSV file upload triggers browser file picker | EXP-01 | Browser interaction | Click "Import CSV" button, select valid CSV, verify preview table renders |
| Editable preview table allows inline cell editing | EXP-01 | UI interaction | Click cell in preview table, verify input appears, edit value, verify change persists |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
