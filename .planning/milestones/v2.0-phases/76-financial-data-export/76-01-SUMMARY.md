---
phase: 76-financial-data-export
plan: 01
subsystem: financial-export
tags: [refactor, csv-export, p&l, type-export]
requirements: [FIN-04]
dependency_graph:
  requires:
    - "Phase 75 P&L extension (D-07/D-08/D-13/D-16) — buildIncomeStatementRows mirrors the row schema shipped in 75-04"
  provides:
    - "buildIncomeStatementRows: per-period body row builder with firstInRange gate (consumed by plans 02 + 03)"
    - "fetchAndAggregate (exported) with includePrevious opt-out (consumed by plan 02 multi-period loop)"
    - "WeekData + GapAnalysis interfaces (consumed by plan 02 aggregateRangeGap typing, plan 03 helper signatures)"
    - "WIB_OFFSET_MS exported (consumed by plan 02 task 2.2 periodBuckets helper)"
  affects:
    - "convex/reports/incomeStatement.ts: new export surface (3 names) + 5 includePrevious gates inside fetchAndAggregate"
    - "src/lib/csvExport.ts: 145 LOC helper extraction; existing single-period caller (FinancialStatement.tsx) byte-identical output"
tech_stack:
  added: []
  patterns:
    - "Cross-tier type-only import (import type) — server type WeekData consumed by client csvExport without bundling server code"
    - "includePrevious opt-out flag — gate previous-period I/O behind boolean (default true preserves existing behavior)"
    - "firstInRange ternary gating for in-range delta semantics (D-05) — every prev_period_idr / delta_pct cell collapses to empty string"
key_files:
  created:
    - "convex/reports/__tests__/financialExport.test.ts"
    - "src/lib/__tests__/financialExportHelpers.test.ts"
    - ".planning/phases/76-financial-data-export/76-01-SUMMARY.md"
  modified:
    - "convex/lib/periodRange.ts"
    - "convex/reports/incomeStatement.ts"
    - "src/lib/csvExport.ts"
decisions:
  - "Wave 1 task ordering swapped (1.4 before 1.3) to satisfy Task 1.3's import-type dependency on the WeekData export shipped in Task 1.4 — preserves clean type-check between every commit"
  - "computeInRangeDeltas placed inside csvExport.ts (not extracted to financialHelpers.tsx) — only buildIncomeStatementRows consumes it and keeping it co-located makes the byte-identical-preservation contract auditable"
  - "Helper takes WeekData | null for previous (not WeekData) so plan 02 can call it cleanly with previous=null when firstInRange=true"
metrics:
  duration_minutes: 11
  completed_date: "2026-05-08"
  tasks: 4
  files_created: 3
  files_modified: 3
  todo_markers_seeded: 42
  existing_tests_green: 103
---

# Phase 76 Plan 01: Refactor csvExport.ts + re-export helpers Summary

Refactored `src/lib/csvExport.ts` to extract `buildIncomeStatementRows` (deltas computed internally — no `deltas` argument per staffreview Critical 2), exported `fetchAndAggregate`/`WeekData`/`GapAnalysis`/`WIB_OFFSET_MS` for downstream multi-period plans (02 + 03), and seeded two Wave 0 test stubs (16 + 28 `it.todo` markers) so plans 02 + 03 inherit failing-loud test scaffolding.

## What Changed

### 1. csvExport.ts — extracted body-row builder
- New exported helper `buildIncomeStatementRows(periodStr, current: WeekData, previous: WeekData | null, firstInRange: boolean = false): string[][]` returns body rows only (no header, no footer).
- `firstInRange === true` collapses every `prev_period_idr` and `delta_pct` cell to empty string `""` (D-05 in-range delta semantics — first period of multi-period export has no prior comparison).
- `firstInRange === false` reproduces pre-refactor output byte-for-byte for the existing single-period caller `FinancialStatement.tsx`.
- New private helper `computeInRangeDeltas(current, previous)` reproduces the backend deltas-compute block at `convex/reports/incomeStatement.ts:818-894`, so the helper does not need a `deltas` argument.
- `generateIncomeStatementCSV(data, weekLabel)` rewritten to push 8-column header, delegate body to `buildIncomeStatementRows(weekLabel, data.current, data.previous, false)`, then push the Data Quality Notes footer. Final `escapeCell` join unchanged.
- 50 `firstInRange ?` ternaries gate every prev/delta cell.
- `IncomeStatementData` shape and `data.deltas` field unchanged for non-CSV consumers (UI page still reads them).

### 2. convex/reports/incomeStatement.ts — exports + includePrevious flag
- `WeekData` interface (line 74) now `export interface WeekData` — closes staffreview Critical 3 / Improvement 5 (downstream plans get real type safety, no `any` fallback).
- `GapAnalysis` interface (line 55) now `export interface GapAnalysis` — plan 02's `aggregateRangeGap` will type its parameter against this shape.
- `fetchAndAggregate(ctx, currentStart, currentEnd, previousStart, previousEnd)` now `export async function fetchAndAggregate(...) ` with new optional `includePrevious: boolean = true` parameter. Default `true` preserves identical behavior for existing callers.
- 5 `includePrevious ?` ternary gates inside the function skip previous-period I/O when caller opts out:
  - `previousRevenue` (`externalRevenue` by_period query)
  - `previousConsignments` (`consignmentSettlements` by_period query)
  - `previousJournalLines` (`journalEntryLines` by_entryDate query)
  - `previousOrderDataMap` (`fetchInternalOrderDataMap` call)
  - `previousMissingReversals` (`buildMissingReversals` call)
- When `includePrevious === false`, `aggregateWeek` is called with empty arrays + empty maps, naturally producing a zeroed `WeekData` shell for `previousPeriod`. Plan 02's multi-period exporter ignores those zero deltas anyway.
- `aggregateWeek` stays internal (NOT exported) per plan acceptance criteria.
- Existing callers `getWeeklyIncomeStatement` (line 901+) and `getIncomeStatement` (line 927+) call `fetchAndAggregate(ctx, ...)` with no `includePrevious` arg — picks up default `true` — behavior identical to pre-refactor.

### 3. convex/lib/periodRange.ts — single-line export
- `WIB_OFFSET_MS` (line 218) now `export const WIB_OFFSET_MS` — closes staffreview Critical 1. Plan 02 task 2.2's `periodBuckets` helper imports this for WIB-aware bucket-boundary math.
- All in-file consumers (`utcToWibDateStr`, `isWeekend`, `getIsoWeekNumber`, `utcToWibMonthStr`, `utcToWibHourStr`) unaffected — adding `export` is purely additive.

### 4. Wave 0 test stubs (failing-loud, not auto-skipped)
- `convex/reports/__tests__/financialExport.test.ts` — 16 tests total: 15 `it.todo(...)` markers + 1 sanity test. Covers role gate, range bounds, reversal lines (D-04), debit/credit mutex (D-01), ordering (D-02), empty range, COGS override regression (D-07), preflight stats/large-range (D-12, D-16), and `rangeGap` union (D-08, M1). Uses corrected schema names (`sourceType`, `debitAmount`, `creditAmount`, `journalEntryId`, `accounts`, `reversedByEntryId`) per RESEARCH §"Schema name corrections".
- `src/lib/__tests__/financialExportHelpers.test.ts` — 28 tests total: 27 `it.todo(...)` markers + 1 sanity test. Covers `buildPeriodBuckets` (weekly/monthly/custom + edge cases including year-boundary M3), `buildExportFilenames`, `generateRawTransactionsCSV` (escapeCell D-14, integer rupiah D-15), `generateMultiPeriodPLCSV` (first-period no-delta D-05, footer-once D-08), preset ranges (last-week prior-ISO-week M4 / I9), and `formatWeekLabel`/`formatMonthLabel`. Helper module import is commented out — plan 03 creates `src/lib/financialExportHelpers.ts` and uncomments.

## Verification Results

```
npm run type-check        → exits 0 (clean)
npx vitest run src/lib/__tests__ convex/reports/__tests__/incomeStatement-capex.test.ts
                          → 9 test files, 103 passed + 27 todo (130 total), 0 failed
```

Existing single-period CSV output is byte-identical (csvExport.test.ts 4/4 green). Phase 75 capex/incomeStatement tests still green (incomeStatement-capex.test.ts 6/6 green).

## Deviations from Plan

### Wave 1 task ordering swap (Rule 3 — blocking dependency)

**Found during:** Wave 1 startup planning.

**Issue:** Plan ordered Task 1.3 before Task 1.4. Task 1.3's required `import type { WeekData } from "../../convex/reports/incomeStatement"` would fail TypeScript resolution because `WeekData` is not yet exported until Task 1.4 ships the `export interface WeekData` change. Task 1.3's own acceptance criterion `npm run type-check exits 0` requires the import to resolve, which requires Task 1.4 to land first.

**Fix:** Executed Task 1.4 first (commit `8a5289e7`), then Task 1.3 (commit `3d7466d5`). Final state, behavior, and acceptance criteria are identical to plan-specified ordering. Each commit type-checks cleanly in isolation.

**Files affected:** No code-level deviation — only the order of two commits within the same wave.

### No bug fixes / Rule 2 / Rule 4 deviations

No bugs were discovered in the code being refactored. No missing critical functionality was identified (Rule 2). No architectural changes were needed (Rule 4). The refactor is purely structural — zero observable behavior change to end users.

## Authentication Gates

None encountered. This plan is a pure source-code refactor + test scaffolding; no live API calls, no auth flow, no manual steps required.

## Hand-off Notes for Plans 02 and 03

- **Plan 02 (multi-period backend)** can now:
  - Call `fetchAndAggregate(ctx, periodStart, periodEnd, periodStart, periodEnd, /* includePrevious */ false)` per period to skip wasted previous-period I/O. Returns `currentPeriod: WeekData` typed correctly.
  - Type its `aggregateRangeGap` parameter against the exported `WeekData` / `GapAnalysis` interfaces (no `any` fallback).
  - Import `WIB_OFFSET_MS` from `convex/lib/periodRange` for the new shared `convex/lib/periodBuckets.ts` helper that plan 02 task 2.2 will create.
  - Replace each `it.todo(...)` in `convex/reports/__tests__/financialExport.test.ts` with a real test body.

- **Plan 03 (frontend helpers + multi-period CSV)** can now:
  - Create `src/lib/financialExportHelpers.ts` exporting `buildPeriodBuckets`, `buildExportFilenames`, `generateRawTransactionsCSV`, `generateMultiPeriodPLCSV`, `presetToRange`, `formatWeekLabel`, `formatMonthLabel`.
  - Uncomment the import block in `src/lib/__tests__/financialExportHelpers.test.ts` and replace each `it.todo(...)` with a real test body.
  - Inside `generateMultiPeriodPLCSV`, call `buildIncomeStatementRows(label, period.current, prevPeriod, /* firstInRange */ idx === 0)` per period, push a single shared header at top and a single shared Data Quality footer at bottom (D-08).

## Self-Check: PASSED

Files verified to exist:
- FOUND: convex/reports/__tests__/financialExport.test.ts
- FOUND: src/lib/__tests__/financialExportHelpers.test.ts
- FOUND: src/lib/csvExport.ts (modified)
- FOUND: convex/reports/incomeStatement.ts (modified)
- FOUND: convex/lib/periodRange.ts (modified)

Commits verified to exist (git log --oneline):
- FOUND: a3708818 — test(76-01): seed Wave 0 stub for financialExport backend tests
- FOUND: f9b493a0 — test(76-01): seed Wave 0 stub for financialExportHelpers unit tests
- FOUND: 8a5289e7 — refactor(76-01): export fetchAndAggregate (includePrevious opt-out), WeekData, GapAnalysis, WIB_OFFSET_MS
- FOUND: 3d7466d5 — refactor(76-01): extract buildIncomeStatementRows helper from generateIncomeStatementCSV

Acceptance grep checks (all PASS):
- `export function buildIncomeStatementRows` present in csvExport.ts
- `firstInRange: boolean = false` parameter present (no `deltas` parameter)
- `function computeInRangeDeltas` private helper present
- `import type { WeekData }` from `../../convex/reports/incomeStatement` present
- `export function generateIncomeStatementCSV` still exported
- `export function escapeCell` and `export function downloadCSV` still exported
- 8-column header literals (`"period"`, `"prev_period_idr"`, `"delta_pct"`) all present
- 50 `firstInRange ?` ternaries gate prev/delta cells
- `export const WIB_OFFSET_MS` present in periodRange.ts
- `export interface WeekData` and `export interface GapAnalysis` present in incomeStatement.ts
- `export async function fetchAndAggregate` present
- `includePrevious: boolean = true` parameter present
- 5 `includePrevious ?` ternary gates present (>=3 required)
- `aggregateWeek` NOT exported (stays internal)
- 16 `it.todo(` markers in financialExport.test.ts (>=12 required)
- 28 `it.todo(` markers in financialExportHelpers.test.ts (>=22 required)
- No drifted CONTEXT.md schema names (`entryType`, `reversalOfEntryId`, `glAccounts`) appear as identifiers in test stubs
- `rangeGap` stub present (D-08, M1)
- Year-boundary stub present (M3): `Dec 28`
- Prior-ISO-week stub present (M4 / I9): `prior ISO week`
- `formatWeekLabel` and `formatMonthLabel` stubs present (I6)

`npm run type-check` exits 0. All 103 existing tests pass; 27 todos register as expected.
