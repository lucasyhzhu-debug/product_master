---
phase: 49
slug: pnl-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 49 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + convex-test |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/convex/pnlIntegration.test.ts` |
| **Full suite command** | `npm run test && npm run build` |
| **Estimated runtime** | ~15 seconds (quick), ~60 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/convex/pnlIntegration.test.ts`
- **After every plan wave:** Run `npm run test && npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 49-01-01 | 01 | 1 | PNL-04, PNL-05 | unit | `npx vitest run tests/convex/pnlIntegration.test.ts` | ❌ W0 | ⬜ pending |
| 49-01-02 | 01 | 1 | PNL-01, PNL-02, PNL-03 | unit | `npx vitest run tests/convex/pnlIntegration.test.ts` | ❌ W0 | ⬜ pending |
| 49-01-03 | 01 | 2 | PNL-01 | build | `npm run build` | ✅ | ⬜ pending |
| 49-01-04 | 01 | 2 | PNL-02, PNL-03 | build | `npm run build` | ✅ | ⬜ pending |
| 49-01-05 | 01 | 3 | ALL | integration | `npm run test && npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/convex/pnlIntegration.test.ts` — test stubs for PNL-01 through PNL-05
  - OpEx aggregation from journalEntryLines by entryDate (not _creationTime)
  - Single indexed query pattern (by_entryDate) with in-memory accountId grouping
  - EBIT = Gross Profit - Total OpEx calculation
  - Other Income/Expense (7xxx) aggregation with correct sign convention
  - Net Income = EBIT - totalOther calculation

*Existing test infrastructure (Vitest + convex-test) covers all framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OpEx section renders with correct formatting | PNL-01 | Visual layout verification | Navigate to /financials, verify 6xxx accounts display below Gross Profit in collapsible section |
| EBIT margin % displays correctly | PNL-02 | Visual verification | Verify EBIT margin percentage shows next to EBIT row |
| Net margin % displays correctly | PNL-03 | Verify net margin percentage shows next to Net Income row |
| CSV export includes new sections | PNL-01, PNL-02, PNL-03 | File content verification | Export CSV, verify OpEx/EBIT/Other/Net Income rows present |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
