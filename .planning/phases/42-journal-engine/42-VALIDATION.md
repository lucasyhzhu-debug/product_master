---
phase: 42
slug: journal-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 42 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.0.18 + convex-test |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run convex/lib/__tests__/journalEngine.test.ts -x` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~5 seconds (quick) / ~30 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run convex/lib/__tests__/journalEngine.test.ts -x`
- **After every plan wave:** Run `npm run test && npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 42-01-01 | 01 | 1 | JE-01 | unit | `npx vitest run convex/lib/__tests__/journalEngine.test.ts -x` | W0 | pending |
| 42-01-02 | 01 | 1 | JE-01 | unit | `npx vitest run convex/lib/__tests__/journalEngine.test.ts -x` | W0 | pending |
| 42-01-03 | 01 | 1 | JE-03 | unit | `npx vitest run convex/lib/__tests__/journalEngine.test.ts -x` | W0 | pending |
| 42-01-04 | 01 | 1 | JE-06 | grep-audit | `grep -r 'insert("journalEntries")' convex/ --include="*.ts"` | manual | pending |
| 42-01-05 | 01 | 1 | JE-02 | grep-audit | `grep -r 'ctx.db.patch.*journalEntries' convex/ --include="*.ts"` | manual | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `convex/lib/__tests__/journalEngine.test.ts` -- stubs for JE-01 (validation), JE-03 (reversal dating)
- [ ] Phase 41 must be complete: `convex/lib/counter.ts` must exist

*Note: Test file created as part of implementation task (TDD pattern).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No update mutation on journalEntries | JE-02 | Absence verification | `grep -r 'ctx.db.patch.*journalEntries' convex/ --include="*.ts"` — only reversal marking allowed |
| No direct insert outside helper | JE-06 | Codebase-wide audit | `grep -r 'insert("journalEntries")' convex/ --include="*.ts"` — only in journalEngine.ts |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
