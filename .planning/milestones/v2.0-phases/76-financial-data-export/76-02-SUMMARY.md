---
phase: 76-financial-data-export
plan: 02
subsystem: financial-export
tags: [backend, convex, financial-export, p&l, raw-transactions]
requirements: [FIN-03, FIN-04]
dependency_graph:
  requires:
    - "Phase 76-01 (fetchAndAggregate / WeekData / GapAnalysis / WIB_OFFSET_MS exports)"
  provides:
    - "getRawTransactionsExport — flat GL line export, manager+admin gated, by_entryDate index range scan, no N+1"
    - "getMultiPeriodPLExport — per-bucket P&L loop reusing fetchAndAggregate(includePrevious=false)"
    - "getExportPreflight — journalLineCount/revenueRowCount/periodCount/isLargeRange stats"
    - "convex/lib/periodBuckets.ts:buildPeriodBuckets (single source of truth — plan 03 frontend imports same helper)"
    - "formatWeekLabel / formatMonthLabel / formatCustomLabel — period label helpers with (partial) suffix"
    - "RawTransactionRow type — 12-field row shape consumed by plan 03 CSV builder"
  affects:
    - "convex/reports/financialExport.ts: NEW backend file, 3 queries + 4 helpers"
    - "convex/lib/periodBuckets.ts: NEW shared helper (closes staffreview Improvement 8)"
    - "convex/reports/__tests__/financialExport.test.ts: 16 → 14 real tests (zero it.todo)"
tech_stack:
  added: []
  patterns:
    - "Set-deduped batch fetch via Promise.all over Map<id, Doc> (no N+1, mirrors getLifetimeTotalsInternal pattern)"
    - "WIB-aware bucket snapping for weekly granularity (Monday 00:00 WIB) and monthly (calendar 1st)"
    - "includePrevious=false delegation to existing fetchAndAggregate (Phase 75) — zero duplicated P&L math"
    - "(partial) suffix on bucket labels when bucketEnd < natural-period-end"
    - "Half-open [bucketStart, bucketEnd) interval invariant carried through aggregateRangeGap union"
key_files:
  created:
    - "convex/lib/periodBuckets.ts"
    - "convex/reports/financialExport.ts"
    - ".planning/phases/76-financial-data-export/76-02-SUMMARY.md"
    - ".planning/phases/76-financial-data-export/deferred-items.md"
  modified:
    - "convex/reports/__tests__/financialExport.test.ts"
decisions:
  - "Task 2.1 committed alone before Task 2.2 — financialExport.ts initially exported only getRawTransactionsExport with `WeekData` import staged for the next commit. Splits the wave into clean per-task atomic commits (mirrors plan 01's similar split)."
  - "Period label helpers (formatWeekLabel/formatMonthLabel/formatCustomLabel) implemented inline in financialExport.ts — plan 03 may import them OR rebuild locally. Bucket-math helper (buildPeriodBuckets) lives in convex/lib/periodBuckets.ts as the single source of truth (closes Improvement 8). No cross-validation test needed because there is no duplication to drift."
  - "aggregateRangeGap reads p.current.gapAnalysis.{unmappedProducts,missingChannels,totalProducts,totalMappedProducts,zeroCostComponents} via the dotted form (no local `gap` alias). Both forms are TypeScript-equivalent; the dotted form satisfies the plan's literal grep contract."
  - "Negative-grep contract drove a JSDoc reword: the comment 'accounts (NOT glAccounts)' tripped the strict acceptance grep that forbids the literal token `glAccounts` in code. Rephrased to 'no legacy gl-prefix' to keep the audit clean without losing guidance."
metrics:
  duration_minutes: 25
  completed_date: "2026-05-09"
  tasks: 3
  commits: 4
  files_created: 4
  files_modified: 1
  tests_passed: 14
  full_suite_passed: 1740
  full_suite_failed: 2
  full_suite_failed_in_scope: 0
---

# Phase 76 Plan 02: Backend Financial Export Queries Summary

Three Convex queries (`getRawTransactionsExport`, `getMultiPeriodPLExport`, `getExportPreflight`) wired through Phase 75's `fetchAndAggregate` aggregator with `includePrevious=false` per bucket, plus a shared `convex/lib/periodBuckets.ts` helper used by both backend and (eventually) plan 03's frontend module — zero duplicated period-bucket math. All 14 Wave 0 stub `it.todo` markers in `convex/reports/__tests__/financialExport.test.ts` are now real convex-test bodies covering D-01..D-04, D-07, D-08, D-12, D-13, D-16 with concrete >10k seeding (R4) and a real rangeGap union assertion (M1, Critical 3 closed).

## What Changed

### 1. NEW `convex/lib/periodBuckets.ts` — single source of truth (Improvement 8)
- `buildPeriodBuckets(periodStart, periodEnd, granularity)` returns `Array<[number, number]>` half-open `[bucketStart, bucketEnd)` intervals.
- Granularity `"weekly"`: snaps to Monday 00:00 WIB via `(dayOfWeek + 6) % 7` math; clamps partial leading/trailing buckets to `[periodStart, periodEnd)`.
- Granularity `"monthly"`: walks WIB calendar months via `wibMidnightToUtc(y, m, 1)`; clamps edge buckets the same way.
- Granularity `"custom"`: returns exactly one bucket spanning the input range.
- Imports `wibMidnightToUtc` and `WIB_OFFSET_MS` from `convex/lib/periodRange.ts` (both exported by plan 01).
- Pure function, no Convex context — frontend can import directly without bundler config (precedent: `src/pages/UnlinkedProductsBackfill.tsx`, `src/pages/ProductInventorySettings.tsx`).
- Plan 03's frontend module will import this SAME file. No `buildPeriodBucketsBackend` duplicate inside `financialExport.ts` (verified by grep).

### 2. NEW `convex/reports/financialExport.ts` — three Convex queries
- **`getRawTransactionsExport`** (FIN-03):
  - Args: `{ periodStart: number, periodEnd: number, token: string }`.
  - First line: `await requireRole(ctx, args.token, ["manager", "admin"])` (D-13 gate).
  - Single `journalEntryLines.by_entryDate` index range scan (`gte(entryDate, periodStart).lt(entryDate, periodEnd)`) — half-open D-03 interval.
  - Set-deduped batch fetches via `Promise.all` over `Map<id, Doc>` for `journalEntries`, `accounts`, `users` — no N+1.
  - Returns 12-field `RawTransactionRow[]`: `entryDate, journalEntryId, entryNumber, sourceType, accountCode, accountName, debitAmount, creditAmount, description, sourceId, createdByName, _creationTime`.
  - `sourceType` emitted verbatim — `_void` / `_reversal` literals naturally identify reversal rows (D-04). Both `expense_approval` and `expense_void` JEs surface in output.
  - `createdByName: user?.name ?? null` — Edge case 10 (deleted user → null fallback).
  - Sort: `entryDate ASC, entryNumber.localeCompare ASC, _creationTime ASC, debit-before-credit tiebreaker` (D-02).
  - Empty range short-circuits to `[]`.

- **`getMultiPeriodPLExport`** (FIN-04):
  - Args: `{ periodStart, periodEnd, granularity: "weekly"|"monthly"|"custom", token }`.
  - Role gate, then `buildPeriodBuckets(...)` then per-bucket `await fetchAndAggregate(ctx, s, e, s, s, /* includePrevious */ false)`. The `false` flag (added by plan 01) skips ~50% per-bucket previous-period I/O — the plan 03 frontend helper computes in-range deltas from `periods[i-1].current` per D-05.
  - Returns `{ periods: Array<{ bucketStart, bucketEnd, label, current: WeekData }>, rangeGap }`.
  - `rangeGap` produced by `aggregateRangeGap(periods)` — typed against `Array<{ current: WeekData }>` (Critical 3 closed), walks `p.current.gapAnalysis.unmappedProducts/missingChannels/totalProducts/totalMappedProducts/zeroCostComponents` and unions/sums across periods.
  - Period label via inline `formatWeekLabel`/`formatMonthLabel`/`formatCustomLabel` — `(partial)` suffix on truncated buckets.

- **`getExportPreflight`** (D-12, D-16):
  - Args mirror `getMultiPeriodPLExport`.
  - Role gate, then parallel index range scans for `journalEntryLines.by_entryDate` and `externalRevenue.by_period` (single-field index — `periodStart` only, gte/lt against `args.periodStart` matches the schema). Plus `buildPeriodBuckets` for `periodCount`.
  - Returns `{ journalLineCount, revenueRowCount, periodCount, isLargeRange }`. `isLargeRange = journalLineCount > 10_000` (D-16 soft warning threshold).

### 3. UPDATED `convex/reports/__tests__/financialExport.test.ts` — 14 real tests
Wave 0's 16 `it.todo` markers replaced with 14 real convex-test bodies (4 role-gate cases consolidated where role-rejection shape is identical). All 14 pass:

| Test | D-anchor | Notes |
|------|----------|-------|
| rejects kitchen role | D-13 | `rejects.toThrow(/Not authorized/)` |
| rejects order_staff role | D-13 | same shape |
| accepts manager role | D-13 | returns `[]` (no JEs seeded) |
| accepts admin role | D-13 | returns `[]` |
| range bounds half-open | D-03 | seeds at PERIOD_START, IN_PERIOD, PERIOD_END (excluded), PERIOD_END+1; expects 2 rows |
| empty range returns `[]` | — | no crash, empty array |
| reversal lines included | D-04 | seeds expense_approval + expense_void; both surface with `sourceType` verbatim |
| debit/credit mutex | D-01 | XOR via `r.debitAmount > 0 !== r.creditAmount > 0` |
| ordering | D-02 | inserts JE-C/JE-A/JE-B out of date order; asserts `["JE-A", "JE-B", "JE-C"]` |
| preflight stats | D-12 | 5 in + 1 out; expects `journalLineCount === 5` |
| isLargeRange === true | D-16, R4 | concrete 10001-line seed; ~600ms |
| isLargeRange === false | D-16 | 5-line seed; expects false |
| COGS override | D-07 | `cogsOverrideIdr=5000` × qty 4 = `totalCogs === 20000` (no duplicated math) |
| rangeGap union | D-08, M1 | Widget A across 2 weekly periods → count=5, revenue=25000; Widget B in period 2 only; grabfood `missingChannels` deduped to 1 entry |

Schema name fidelity verified by grep: `entryType:` / `entryId:` / `debit: ` / `credit: ` / `reversalOfEntryId` all absent from seed payloads.

## Verification Results

```
npm run type-check                                        → exits 0 (clean)
npx vitest run convex/reports/__tests__/financialExport.test.ts  → 14 passed
npx vitest run convex/reports/__tests__/ src/lib/__tests__/      → 139 passed, 27 todo (plan-03 frontend stubs left intact)
npm run test (full suite)                                  → 1740 passed, 2 failed (out of scope — see Deviations)
```

Grep audit:
- `requireRole(ctx, args.token, ["manager", "admin"])` count: 3 (one per query)
- `Array<{ current: WeekData }>` present (Critical 3 closed)
- No `function buildPeriodBucketsBackend` inline (Improvement 8 closed)
- No drift names: `entryType`, `reversalOfEntryId`, `glAccounts`, `unmappedProductCodes`, `zeroCogsCount` absent
- No `line.debit` / `line.credit` (only `line.debitAmount` / `line.creditAmount`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking dependency] Wave 1 task ordering split for clean atomic commits**
- **Found during:** Task 2.1 implementation.
- **Issue:** The plan describes Task 2.1 (raw query) and Task 2.2 (multi-period + preflight + shared helper) as separate atomic commits, but writing them in the order specified would either (a) require Task 2.1 to import from a not-yet-created `convex/lib/periodBuckets.ts` (module-not-found error blocks `npm run type-check`) or (b) duplicate the bucket math across two files temporarily.
- **Fix:** First commit (`8f4fc3a6`) ships only `getRawTransactionsExport` with a `WeekData` import staged for use by Task 2.2's `aggregateRangeGap`. Second commit (`79faab32`) adds `convex/lib/periodBuckets.ts` and extends `financialExport.ts` with the multi-period query, preflight query, label helpers, and `aggregateRangeGap`. Each commit type-checks cleanly in isolation.
- **Files affected:** No code-level deviation — only the commit-split ordering.

**2. [Rule 3 — Blocking dependency] JSDoc reword to satisfy strict negative grep**
- **Found during:** Wave 2 verification grep audit.
- **Issue:** The acceptance criterion `! grep -E "...glAccounts..." convex/reports/financialExport.ts` is strict — even a JSDoc comment containing the literal token `glAccounts` (in the form `accounts (NOT glAccounts)`) trips it. The original guidance comment was useful for readers but contradicted the audit contract.
- **Fix:** Rephrased to `chart-of-accounts table is named accounts (no legacy gl-prefix)` — same guidance, no forbidden token.
- **Commit:** `5f301267`.

**3. [Rule 3 — Blocking environment] Worktree node_modules empty**
- **Found during:** Task 2.3 first vitest run.
- **Issue:** `convex-test` uses `import.meta.glob("../../../convex/**/*.*s")` resolved relative to its install location. With an empty worktree `node_modules/`, vitest fell back to the parent's `node_modules/convex-test`, which globbed the parent tree's `convex/` (no `financialExport.ts`) instead of the worktree's. All 14 tests failed with `Could not find module for: "reports/financialExport"`.
- **Fix:** Ran `npm ci` in the worktree to populate local `node_modules/`. After that, `import.meta.glob` resolved against the worktree's own `convex/` and all 14 tests passed.
- **Files affected:** None tracked (node_modules is gitignored). Pre-existing pattern documented in MEMORY.md "worktree executors don't populate main tree's node_modules" (Phase 72).

### Out of Scope (Deferred)

**4. Pre-existing flaky test in `convex/staffAttendance/__tests__/correctAttendance.test.ts`**
- 2 of the full-suite failures (out of 1742 total) come from `correctAttendance.test.ts` tests that compute `today = toWibDateString(Date.now())` and `clockIn = Date.now() - 3h` without clock mocking — straddling WIB midnight rejects the mutation's strict equality check. NOT caused by 76-02 (`git status convex/staffAttendance/` reports zero changes). Documented in `.planning/phases/76-financial-data-export/deferred-items.md`. Outside scope of plan 76-02 — fix belongs in a `staffAttendance` test-hygiene plan.

### No bug fixes / Rule 2 / Rule 4 deviations
No bugs in the existing code. No missing critical functionality (Rule 2). No architectural changes (Rule 4). The only Rule 3 fixes are the commit-split, the JSDoc reword, and the worktree node_modules install.

## Authentication Gates

None encountered. All three queries are role-gated via `requireRole(ctx, args.token, ["manager", "admin"])`. Test 2.3 seeds users + sessions directly via `t.run(async ctx => ctx.db.insert("sessions", { userId, token, expiresAt, createdAt }))` — no live auth flow required.

## Hand-off Notes for Plan 03 (Frontend Helpers + Multi-Period CSV)

- **Bucket math:** Import `buildPeriodBuckets` from `convex/lib/periodBuckets.ts` (NOT a duplicate). Single source of truth — no cross-validation test needed because there is no duplication to drift.
- **Period labels:** Plan 03 may import `formatWeekLabel` / `formatMonthLabel` / `formatCustomLabel` from `convex/reports/financialExport.ts`, OR rebuild them locally if the cross-tier import becomes inconvenient. The bucket math itself MUST come from `convex/lib/periodBuckets.ts`.
- **Multi-period query payload shape:** `getMultiPeriodPLExport` returns `{ periods: Array<{ bucketStart, bucketEnd, label, current: WeekData }>, rangeGap }`. The `current: WeekData` field is the full Phase 75 P&L for that bucket — pass it directly to `buildIncomeStatementRows(label, period.current, prevPeriod, /* firstInRange */ idx === 0)` in the plan 03 helper. There is no `previousPeriod` or `deltas` field per bucket because plan 02 calls `fetchAndAggregate(..., includePrevious=false)`. Plan 03 computes in-range deltas from `periods[i-1].current` (D-05).
- **Raw export payload shape:** `getRawTransactionsExport` returns `RawTransactionRow[]` (12 fields). Already sorted per D-02. The CSV builder in plan 03 just emits `escapeCell(...)` and joins with commas; no post-processing needed.
- **Preflight payload shape:** `getExportPreflight` returns `{ journalLineCount, revenueRowCount, periodCount, isLargeRange }`. The UI summary panel can render these directly. `isLargeRange === true` triggers the soft warning per D-16; no hard cap.

## Self-Check: PASSED

Files verified to exist:
- FOUND: convex/reports/financialExport.ts
- FOUND: convex/lib/periodBuckets.ts
- FOUND: convex/reports/__tests__/financialExport.test.ts (modified)
- FOUND: .planning/phases/76-financial-data-export/76-02-SUMMARY.md
- FOUND: .planning/phases/76-financial-data-export/deferred-items.md

Commits verified to exist (git log --oneline):
- FOUND: 8f4fc3a6 — feat(76-02): implement getRawTransactionsExport query (FIN-03)
- FOUND: 79faab32 — feat(76-02): add getMultiPeriodPLExport, getExportPreflight + shared periodBuckets
- FOUND: 4335075f — test(76-02): replace it.todo stubs with real convex-test bodies
- FOUND: 5f301267 — docs(76-02): rephrase JSDoc comment to avoid drift-name false positive

Acceptance grep checks (all PASS):
- `getRawTransactionsExport`, `getMultiPeriodPLExport`, `getExportPreflight` all `^export const ... = query` ✓
- `requireRole(ctx, args.token, ["manager", "admin"])` count exactly 3 (one per query) ✓
- `withIndex("by_entryDate", (q) => q.gte("entryDate", ...).lt("entryDate", ...))` present ✓
- `import { buildPeriodBuckets, type Granularity } from "../lib/periodBuckets"` present ✓
- No `function buildPeriodBucketsBackend` inline ✓
- `Array<{ current: WeekData }>` typing on `aggregateRangeGap` parameter ✓
- `gapAnalysis.unmappedProducts`, `gapAnalysis.missingChannels`, `gapAnalysis.totalProducts`, `gapAnalysis.totalMappedProducts` all read via dotted form ✓
- No drift names (`entryType`, `reversalOfEntryId`, `glAccounts`, `unmappedProductCodes`, `zeroCogsCount`) ✓
- No `line.debit` / `line.credit` (only `line.debitAmount` / `line.creditAmount`) ✓
- Zero `it.todo(` in test file; 14 real `it("...` tests ✓
- `(partial)` suffix in label helpers ✓
- `formatWeekLabel`, `formatMonthLabel`, `formatCustomLabel` all `export function` ✓
- `Promise.all` + `new Set` for batch fetch (no N+1) ✓
- `isLargeRange` field returned from preflight ✓
- Concrete >10k seed (R4): `10_001` literal in test file ✓
- rangeGap union test seeds Widget A / Widget B and asserts non-zero counts ✓

`npm run type-check` exits 0. `npx vitest run convex/reports/__tests__/financialExport.test.ts` reports 14 passed. Plan 75 capex/incomeStatement/shopee tests still green. Plan 03 frontend stubs (27 todos) left intact for plan 03 to consume.
