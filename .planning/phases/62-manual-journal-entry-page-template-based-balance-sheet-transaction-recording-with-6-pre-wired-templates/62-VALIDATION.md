---
phase: 62
slug: manual-journal-entry-page-template-based-balance-sheet-transaction-recording-with-6-pre-wired-templates
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 62 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.0.18 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test && npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 62-01-01 | 01 | 1 | MJE-01 | unit | `npx vitest run convex/manualJournal/__tests__/mutations.test.ts -t "template" -x` | ❌ W0 | ⬜ pending |
| 62-01-02 | 01 | 1 | MJE-02 | unit | `npx vitest run convex/manualJournal/__tests__/mutations.test.ts -t "amount" -x` | ❌ W0 | ⬜ pending |
| 62-01-03 | 01 | 1 | MJE-03 | unit | `npx vitest run convex/manualJournal/__tests__/mutations.test.ts -t "account" -x` | ❌ W0 | ⬜ pending |
| 62-01-04 | 01 | 1 | MJE-04 | unit | `npx vitest run convex/manualJournal/__tests__/queries.test.ts -x` | ❌ W0 | ⬜ pending |
| 62-01-05 | 01 | 1 | MJE-05 | unit | Covered by existing `convex/lib/__tests__/journalEngine.test.ts` | ✅ | ⬜ pending |
| 62-02-01 | 02 | 2 | MJE-06 | manual | Visual verification — hub card split | N/A | ⬜ pending |
| 62-02-02 | 02 | 2 | MJE-07 | build | `npm run build` (catches import errors) | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `convex/manualJournal/__tests__/mutations.test.ts` — stubs for MJE-01, MJE-02, MJE-03
- [ ] `convex/manualJournal/__tests__/queries.test.ts` — stubs for MJE-04

*Note: Backend tests for mutations with ctx dependency may be limited to pure validation function tests. The `protectedMutation` pattern makes full integration tests require `convex-test` runtime.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Hub card split (Financials + Accounting) | MJE-06 | Visual layout, no testable API | Verify hub shows two separate sections with correct links |
| Route registration and lazy loading | MJE-07 | Build-time check, not unit testable | `npm run build` succeeds, `/journal` route loads |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
