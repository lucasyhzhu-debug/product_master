---
phase: 76
slug: financial-data-export
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-08
---

# Phase 76 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `.planning/phases/76-financial-data-export/76-RESEARCH.md` §Validation Architecture (lines 539–600)

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 + convex-test 0.0.41 |
| **Config file** | `vitest.config.ts` (project root) |
| **Quick run command** | `npm run test -- convex/reports/__tests__/financialExport.test.ts src/lib/__tests__/financialExportHelpers.test.ts` |
| **Full suite command** | `npm run test` |
| **E2E command** | `npx playwright test tests/e2e/financial-data-export.spec.ts` |
| **Build verification** | `npm run build` (tsc + vite) — REQUIRED before merge |
| **Type check only** | `npm run type-check` |
| **Estimated runtime** | ~10s quick / ~60s full / ~30s E2E |

---

## Sampling Rate

- **After every task commit:** Run quick command (~10s)
- **After every plan wave:** Run full suite + `npm run type-check` + `npm run build`
- **Before `/gsd-verify-work`:** Full suite green + Playwright happy-path green + manual UAT signed
- **Max feedback latency:** 10s per-task, 60s per-wave

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 76-01-01 | 01 | 0 | FIN-03/04 | T-76-01 | Test stubs in place | Wave 0 setup | `test -f convex/reports/__tests__/financialExport.test.ts` | ❌ W0 | ⬜ pending |
| 76-01-02 | 01 | 0 | FIN-03/04 | T-76-01 | Helper test stubs | Wave 0 setup | `test -f src/lib/__tests__/financialExportHelpers.test.ts` | ❌ W0 | ⬜ pending |
| 76-01-03 | 01 | 1 | FIN-03 (D-03) | — | Index range scan + batch-fetch | unit (convex-test) | `npm run test -- ... -t "range bounds"` | ❌ W0 | ⬜ pending |
| 76-01-04 | 01 | 1 | FIN-03 (D-13) | T-76-01 (V2/V12) | Reject non-manager/admin token | unit (convex-test) | `npm run test -- ... -t "role gate"` | ❌ W0 | ⬜ pending |
| 76-01-05 | 01 | 1 | FIN-03 (D-13) | T-76-01 (V2/V12) | Accept manager + admin token | unit (convex-test) | `npm run test -- ... -t "role gate accepts"` | ❌ W0 | ⬜ pending |
| 76-01-06 | 01 | 1 | FIN-03 | — | Empty range returns valid CSV header-only | unit (convex-test) | `npm run test -- ... -t "empty range"` | ❌ W0 | ⬜ pending |
| 76-01-07 | 01 | 1 | FIN-03 (D-04) | — | Reversal lines included (original + reversal) | unit (convex-test) | `npm run test -- ... -t "reversal lines included"` | ❌ W0 | ⬜ pending |
| 76-01-08 | 01 | 1 | FIN-03 (D-14) | T-76-02 (V5/V13) | escapeCell applied to user-controlled fields | unit (helper) | `npm run test -- ... -t "escapeCell applied"` | ❌ W0 | ⬜ pending |
| 76-01-09 | 01 | 1 | FIN-03 (D-15) | — | IDR amounts integer-only (no decimals) | unit (helper) | `npm run test -- ... -t "integer rupiah"` | ❌ W0 | ⬜ pending |
| 76-01-10 | 01 | 1 | FIN-03 (D-01) | — | debit/credit mutually exclusive per row | unit (convex-test) | `npm run test -- ... -t "debit credit mutex"` | ❌ W0 | ⬜ pending |
| 76-01-11 | 01 | 1 | FIN-03 (D-02) | — | Order = entryDate ASC, entryNumber ASC, line natural | unit (convex-test) | `npm run test -- ... -t "ordering"` | ❌ W0 | ⬜ pending |
| 76-02-01 | 02 | 1 | FIN-04 (D-05) | — | 13 weekly buckets for quarterly range | unit (helper) | `npm run test -- ... -t "buildPeriodBuckets weekly"` | ❌ W0 | ⬜ pending |
| 76-02-02 | 02 | 1 | FIN-04 (D-05) | — | First period prev_period_idr / delta_pct empty | unit (helper) | `npm run test -- ... -t "first period no delta"` | ❌ W0 | ⬜ pending |
| 76-02-03 | 02 | 1 | FIN-04 (D-06) | — | Granularity=monthly produces N buckets for N-month range | unit (helper) | `npm run test -- ... -t "buildPeriodBuckets monthly"` | ❌ W0 | ⬜ pending |
| 76-02-04 | 02 | 1 | FIN-04 (D-06) | — | Granularity=custom produces single bucket | unit (helper) | `npm run test -- ... -t "buildPeriodBuckets custom"` | ❌ W0 | ⬜ pending |
| 76-02-05 | 02 | 1 | FIN-04 (D-07) | — | COGS override (Phase 70) honored | unit (convex-test) | `npm run test -- ... -t "COGS override"` | ❌ W0 | ⬜ pending |
| 76-02-06 | 02 | 1 | FIN-04 (D-08) | — | Range-wide footer once at bottom | unit (helper) | `npm run test -- ... -t "footer once"` | ❌ W0 | ⬜ pending |
| 76-02-07 | 02 | 1 | FIN-03 (D-12) | — | Preflight returns journalLineCount, revenueRowCount, periodCount | unit (convex-test) | `npm run test -- ... -t "preflight stats"` | ❌ W0 | ⬜ pending |
| 76-02-08 | 02 | 1 | FIN-03 (D-16) | — | Preflight isLargeRange=true at >10k lines | unit (convex-test) | `npm run test -- ... -t "large range warning"` | ❌ W0 | ⬜ pending |
| 76-03-01 | 03 | 2 | UI-SPEC | — | Filename generation for various date ranges | unit (helper) | `npm run test -- ... -t "buildExportFilenames"` | ❌ W0 | ⬜ pending |
| 76-03-02 | 03 | 2 | UI-SPEC | — | Date preset → range conversion (Last week/month/quarter/YTD) | unit (helper) | `npm run test -- ... -t "preset ranges"` | ❌ W0 | ⬜ pending |
| 76-03-03 | 03 | 2 | UI-SPEC | — | Granularity selector hidden when P&L unchecked | unit (RTL) | `npm run test -- src/pages/__tests__/FinancialExportPage.test.tsx -t "granularity hidden"` | ❌ W0 | ⬜ pending |
| 76-03-04 | 03 | 2 | UI-SPEC | — | At-least-one export type validates form submit | unit (RTL) | `npm run test -- ... -t "at least one type"` | ❌ W0 | ⬜ pending |
| 76-04-01 | 04 | 3 | FIN-03/04 | — | Happy-path: navigate → range → Generate → downloads | E2E | `npx playwright test ... -g "happy path"` | ❌ W0 | ⬜ pending |
| 76-04-02 | 04 | 3 | FIN-03 (D-13) | T-76-01 | Role gate redirect for kitchen user | E2E | `npx playwright test ... -g "role gate redirect"` | ❌ W0 | ⬜ pending |
| 76-05-01 | 05 | 3 | FIN-03 (D-14) | T-76-02 | Manual UAT — Excel + Sheets, no formula execution | manual | (UAT.md checklist) | N/A | ⬜ pending |
| 76-05-02 | 05 | 3 | FIN-03 (D-15) | — | Manual UAT — IDR renders as integer | manual | (UAT.md checklist) | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Plan IDs in this map are placeholders.** Final plan numbering is set by the planner in step 8. Re-key Task IDs after PLAN.md files are written.

---

## Wave 0 Requirements

- [ ] `convex/reports/__tests__/financialExport.test.ts` — stubs for FIN-03 D-01..D-04, D-12, D-13, D-14, D-16 + FIN-04 D-05/D-07 regression
- [ ] `src/lib/__tests__/financialExportHelpers.test.ts` — stubs for FIN-04 D-05..D-08 helper logic + FIN-03 D-14/D-15 sanitization
- [ ] `src/pages/__tests__/FinancialExportPage.test.tsx` — stubs for UI interaction states (granularity hidden, form validation, filename preview)
- [ ] `tests/e2e/financial-data-export.spec.ts` — stubs for happy-path + role-gate redirect
- [ ] `.planning/phases/76-financial-data-export/76-UAT.md` — manual checks for Excel/Sheets rendering, IDR formatting, formula-injection visual confirmation

*Existing test infrastructure covers framework needs — Vitest + convex-test + Playwright already installed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CSV opens correctly in Excel and Google Sheets | FIN-03/04 (Roadmap SC #3) | Spreadsheet rendering can't be unit-tested | (1) Generate transactions CSV with a JE whose `description="=SUM(A1:A10)"`. (2) Open in Excel: cell shows literal `=SUM(A1:A10)` (prefix-quoted), no formula execution. (3) Open in Google Sheets: same. (4) Verify column headers match D-01 spec. (5) Verify IDR cells render as integer numbers (no decimals/separators), spreadsheet may auto-format thousand separators on display only. |
| Multi-file browser download permitted | FIN-03/04 (D-11) | Browser pop-up policies vary | Generate with both export types selected. Confirm two files download. If second blocked: grant permission, retry, confirm both download on second attempt. Test on Chrome, Firefox, Safari. |
| Pre-flight stats displayed on date change | FIN-03 (D-12) | UX timing | Set range. Confirm "Range covers N journal entries, M revenue rows, X periods" appears within ~500ms of date change. Confirm `>10k` warning appears for large ranges. |
| Filename WIB date correctness | FIN-03/04 (D-11) | Timezone bugs only show at runtime | Pick `[2026-04-13, 2026-04-19]` in date picker. Generate. Confirm filename = `frollie-transactions-20260413-20260419.csv` (NOT off by one day from UTC interpretation). |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s per-task, < 60s per-wave
- [ ] `nyquist_compliant: true` set in frontmatter (after planner finalizes plan IDs)

**Approval:** pending
