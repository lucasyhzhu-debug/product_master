---
phase: 75-full-p-l-extension
plan: 03
subsystem: frontend
tags: [frontend, csv-export, financial-reporting, income-statement, phase-75, fin-01, fin-02]

# Dependency graph
requires:
  - phase: 75-00
    provides: Wave-0 RED tests for CSV export (4 tests in src/lib/__tests__/csvExport.test.ts)
  - phase: 75-01
    provides: Backend WeekData extended with opexExcludingDA, depreciationAmortization, capExAmount, freeCashFlow, fcfMarginPercent, missingReversals + 5 new delta entries
provides:
  - "generateIncomeStatementCSV emits canonical EBITDA-first rows (D-07, D-08, D-13, D-16)"
  - "Client-side WeekData + GapAnalysis + deltas types kept in sync with convex/reports/incomeStatement.ts"
  - "Gross Profit row renamed to 'Gross Profit / Contribution Margin' (D-10)"
  - "'Total Operating Expenses' renamed to 'Total Operating Expenses (excl. D/A)' and now uses opexExcludingDA"
  - "EBITDA block moved above EBIT; Depreciation & Amortization inserted between"
  - "CapEx + Free Cash Flow + FCF Margin % rows emitted after Net Margin %"
  - "Missing reversal JEs surfaced in Data Quality footer when non-empty (D-15)"
affects: [75-02, 75-04, /financials CSV download, accountant handoff]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client-side type mirror: csvExport.ts WeekData intentionally duplicated from server shape"
    - "Row-order invariant locked by Wave-0 test Line 156 — protected in CI"
    - "channel='All' invariant for all rows below Contribution Margin (D-11)"
    - "Formula-injection sanitizer covers new rows automatically (reuses rows.push([...]) pipeline)"

key-files:
  created: []
  modified:
    - "src/lib/csvExport.ts"
    - "src/lib/__tests__/csvExport.test.ts"

key-decisions:
  - "Label choice: 'Gross Profit / Contribution Margin' (both terms, not just 'Contribution Margin'). The Wave-0 test accepts either variant via OR condition — the dual label keeps the CSV readable for accountants still using 'Gross Profit' while surfacing the contribution-margin interpretation that Plan 02 uses in the UI. Matches Plan 03 plan text explicitly."
  - "CapEx emitted as negative cash outflow (String(-data.current.capExAmount)) — matches existing sign convention for COGS/Deductions/OpEx in the CSV. D/A also negative for consistency."
  - "FCF Margin uses gross revenue as denominator (Plan 01 backend choice): stable compound base for period-over-period comparison; matches EBITDA/Net Margin % denominator convention."
  - "Test fixture zeroDeltas fix applied in Plan 03 (deviation Rule 3). Plan 00 Task 3 fixture was authored before Plan 01's deltas block extension; without the 5 new delta entries the runtime crashed on undefined.toFixed(). Fix adds them to the fixture block; no test assertions changed."

patterns-established:
  - "EBITDA-first canonical P&L order: OpEx-excl-DA → EBITDA → D/A → EBIT → NET INCOME → CapEx → FCF. Applied to CSV; FinancialStatement.tsx already uses same order per D-07."
  - "Label-guard acceptance pattern: test uses `r.line_item === A || r.line_item === B` to accept either of two interchangeable labels, allowing Plan 02 and Plan 03 to pick slightly different wording without one blocking the other."

requirements-completed: [FIN-01, FIN-02]

# Metrics
duration: 9min
completed: 2026-04-21
---

# Phase 75 Plan 03: CSV Export Canonical P&L Layout Summary

**Extended `generateIncomeStatementCSV` to emit Phase 75 canonical EBITDA-first P&L rows — Gross Profit renamed to Contribution Margin, D/A split from OpEx, CapEx and Free Cash Flow added, and missingReversals footer surfaced. All 4 Wave-0 CSV tests flip RED → GREEN.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-04-21T18:28:00Z
- **Completed:** 2026-04-21T18:37:00Z
- **Tasks:** 2 (both atomic, compilable after each)
- **Files modified:** 2 (`src/lib/csvExport.ts`, `src/lib/__tests__/csvExport.test.ts`)

## Accomplishments

- **5 new WeekData fields** (mirroring Plan 01 backend shape): `opexExcludingDA`, `depreciationAmortization`, `capExAmount`, `freeCashFlow`, `fcfMarginPercent`
- **GapAnalysis extended** with `missingReversals` array (mirroring Plan 01 Task 4)
- **5 new delta entries** in IncomeStatementData typing: `opexExcludingDA`, `depreciationAmortization`, `capExAmount`, `freeCashFlow`, `fcfMarginPp`
- **Label renamed:** `"Gross Profit"` → `"Gross Profit / Contribution Margin"` (D-10)
- **Label renamed:** `"Total Operating Expenses"` → `"Total Operating Expenses (excl. D/A)"` (D-08)
- **Amount source swap:** Total Operating Expenses row now uses `opexExcludingDA` instead of `totalOpEx` (matches the renamed label; backend pre-filters 6150/6160)
- **EBITDA block moved** to canonical position ABOVE EBIT (D-07)
- **`Depreciation & Amortization` row inserted** between EBITDA Margin % and EBIT (negative cash outflow)
- **`EBIT (Operating Profit)` + EBIT Margin %** moved BELOW D/A (canonical order)
- **3 new rows after Net Margin %:** CapEx (Fixed Asset Acquisitions), Free Cash Flow, FCF Margin %
- **Missing reversal JEs footer** surfaces when `gap.missingReversals.length > 0` with description + ISO date format
- **4/4 Plan 00 Task 3 tests GREEN:** CapEx+FCF presence, canonical row order, Contribution Margin rename, D/A extracted from OpEx

## CSV Row Order (Final)

```
Gross Revenue (+ per-channel)                    channel varies
Customer Discounts & Vouchers                    All
Platform Commissions                             All
Ad Spend & Promos                                All
Consignment Rev Share                            All
  [per-channel deduction breakdowns]             channel varies
Net Revenue                                      All
Production COGS (Balls)                          All
Packaging COGS                                   All
Total COGS                                       All
Gross Profit / Contribution Margin               All            ← RENAMED
Gross Margin %                                   All
[per OpEx account row]                           All
Total Operating Expenses (excl. D/A)             All            ← RENAMED + amount swap
EBITDA                                           All            ← MOVED above EBIT
EBITDA Margin %                                  All
Depreciation & Amortization                      All            ← NEW
EBIT (Operating Profit)                          All            ← MOVED below D/A
EBIT Margin %                                    All
[per Other account row]                          All
Total Other Income / Expense                     All
NET INCOME                                       All
Net Margin %                                     All
CapEx (Fixed Asset Acquisitions)                 All            ← NEW
Free Cash Flow                                   All            ← NEW
FCF Margin %                                     All            ← NEW
# Data Quality Notes footer...
# Missing reversal JEs (P&L may double-count)    [conditional]  ← NEW (D-15)
# COGS timing: ...
```

All rows below Contribution Margin have `channel="All"` — no per-channel OpEx/D/A/EBITDA/EBIT/Net Income/CapEx/FCF breakdowns (D-11).

## Task Commits

Each task committed atomically with `--no-verify` (parallel worktree pattern):

1. **Task 1: Extend WeekData + GapAnalysis + deltas types** — `e8f2f7f8` (feat)
2. **Task 2: Emit canonical EBITDA-first rows + missingReversals footer + fix test fixture** — `f90e37da` (feat)

Both commits land on branch `worktree-agent-ad60bb9c` off base `a4f7e01b`. Plan-metadata commit NOT produced — STATE.md / ROADMAP.md writes owned by orchestrator after wave completes.

## Files Modified

- `src/lib/csvExport.ts` — +105 / −24 LOC. Type extensions (19 lines added), label rename, row emission reorganization (3 blocks rewritten in canonical order), 3 new rows for CapEx/FCF/FCF Margin %, 1 new footer branch for missingReversals.
- `src/lib/__tests__/csvExport.test.ts` — +6 / 0 LOC. Added 5 missing delta entries to `zeroDeltas` object (deviation Rule 3 — see below).

## Decisions Made

- **Label choice: `"Gross Profit / Contribution Margin"`** (both terms). The Wave-0 test accepts either `"Contribution Margin"` or `"Gross Profit / Contribution Margin"` via OR condition — the dual label keeps the CSV legible for accountants still using "Gross Profit" as a familiar term while surfacing the contribution-margin interpretation that Plan 02 uses in the UI. Matches Plan 03 plan text explicitly (`"Gross Profit / Contribution Margin"`).
- **CapEx and D/A as negative numbers** — matches the existing sign convention in the CSV where cash outflows (COGS, Deductions, OpEx) are emitted with `String(-amount)`. Free Cash Flow emitted as-is (signed value from backend, can be negative if CapEx > NI+DA).
- **FCF Margin % denominator** — backend uses totalGross (Plan 01); CSV emits the percentage as-is. Consistent with existing EBITDA/EBIT/Net Margin % which all use gross revenue as denominator.
- **missingReversals footer format** — ISO date (YYYY-MM-DD) slice to keep line compact; semicolon-separated to survive CSV's comma escape (footer is a single-cell row so comma escape would otherwise wrap the entire line). Existing formula-injection sanitizer (`=`/`+`/`-`/`@` prefix) automatically applies to all new rows.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Test fixture `zeroDeltas` missing Phase 75 delta fields**
- **Found during:** Task 2 test run
- **Issue:** `src/lib/__tests__/csvExport.test.ts:80-94` defined `zeroDeltas` without the 5 new delta entries that Plan 01 added to the server `deltas` block (`opexExcludingDA`, `depreciationAmortization`, `capExAmount`, `freeCashFlow`, `fcfMarginPp`). When Task 2's row emission tried `data.deltas.fcfMarginPp.toFixed(1)`, the value was `undefined` and the test crashed with `TypeError: Cannot read properties of undefined (reading 'toFixed')`. All 4 tests failed on the same line.
- **Fix:** Added the 5 delta entries (each `{ amount: 0, percent: null }` except `fcfMarginPp: null`) to the `zeroDeltas` block in `buildFixture`. No test assertions changed; fixture now matches the post-Plan-01 shape.
- **Files modified:** `src/lib/__tests__/csvExport.test.ts`
- **Commit:** `f90e37da` (combined with Task 2 row emission — single commit since the test fix is required for Task 2 to be verifiable)
- **Rationale for auto-fix:** Plan 00 Task 3 was authored in parallel with Plan 01 and could not foresee Plan 01's exact delta-block shape. The fix is a pure fixture alignment with no semantic change — it simply supplies the numeric zeros the code path expects. Rule 3 applies (blocking: cannot verify Task 2's row emission without working test fixture).

**Total deviations:** 1 auto-fix (Rule 3 — blocking).
**Impact on plan:** None — all success criteria met, all grep-based acceptance criteria hold, 4/4 Wave-0 tests pass.

## Verification Evidence

- `npm run type-check` — exit 0 after each task commit (Tasks 1, 2). No TypeScript errors.
- `npm run build` — exit 0 (`✓ built in 23.05s`). Vercel bundle cap unchanged; csvExport.ts is pure TS with no new dependencies.
- `npx vitest run src/lib/__tests__/csvExport.test.ts` — 4/4 passing GREEN.
- Grep acceptance criteria hold (checked post-commit):
  - `"Total Operating Expenses (excl. D/A)"` → 1 match (line 438)
  - `"Depreciation & Amortization"` → 1 match (line 485)
  - `"CapEx (Fixed Asset Acquisitions)"` → 1 match (line 614)
  - `"Free Cash Flow"` → 1 match (line 626)
  - `"FCF Margin %"` → 1 match (line 646)
  - `"Gross Profit / Contribution Margin"` → 1 match (line 369)
  - `# Missing reversal JEs` → 1 match (line 689)
  - `-data.current.capExAmount` → 1 match (line 615)
  - `-data.current.depreciationAmortization` → 1 match (line 486)
- Row-order invariant verified via grep line numbers:
  `OpEx-excl-DA (438) < EBITDA (450) < D/A (485) < EBIT (497) < NET INCOME (577) < CapEx (614) < FCF (626)` ✓

## Threat Flags

None — no new trust boundaries or surface introduced. Existing formula-injection sanitizer (lines 629-633) applies to every new row automatically because all `rows.push([...])` go through the same `.map()` pipeline. Per-threat-model analysis in plan matches implementation.

## User Setup Required

None — no external service configuration.

## Next Phase Readiness

- **Plan 04 (DataQualityPanel):** `gap.missingReversals` now rendered in CSV footer; UI parity achievable in Plan 04 by reading the same field.
- **End-to-end flow:** After Plan 00 (tests) + Plan 01 (backend) + Plan 02 (UI) + Plan 03 (CSV) all merge, `/financials` download button produces a CSV matching the on-screen P&L 1:1.

## TDD Gate Compliance

Wave 0 (Plan 00) authored 4 RED tests in `csvExport.test.ts`. Plan 03 Task 2 flips all 4 GREEN. Gate sequence verified in git log:
- `f2408e70 test(75-00): add CSV export D-16 tests for CapEx/FCF/D&A/Contribution Margin` (RED)
- `f90e37da feat(75-03): emit canonical EBITDA-first P&L rows in CSV export` (GREEN)

---

## Self-Check: PASSED

**Files verified on disk:**
- `src/lib/csvExport.ts` — FOUND (+105 / −24 LOC in this plan)
- `src/lib/__tests__/csvExport.test.ts` — FOUND (fixture fix, +6 LOC)
- `.planning/phases/75-full-p-l-extension/75-03-SUMMARY.md` — FOUND (this file)

**Commits verified in git log:**
- `e8f2f7f8` feat(75-03): extend WeekData + GapAnalysis + deltas types — FOUND
- `f90e37da` feat(75-03): emit canonical EBITDA-first P&L rows in CSV export — FOUND

**Tests verified GREEN:**
- `CSV includes CapEx and Free Cash Flow rows` — PASS
- `Row order: OpEx-excl-DA → EBITDA → D/A → EBIT → Net Income → CapEx → Free Cash Flow` — PASS
- `Gross Profit row renamed to Contribution Margin at company level, per-channel columns blank below that` — PASS
- `D/A extracted from OpEx: 6150/6160 lines do NOT appear in OpEx rows; appear once in D/A row` — PASS

**Build gates verified:**
- `npm run type-check` — exit 0
- `npm run build` — exit 0 (23.05s)

---
*Phase: 75-full-p-l-extension*
*Completed: 2026-04-21*
