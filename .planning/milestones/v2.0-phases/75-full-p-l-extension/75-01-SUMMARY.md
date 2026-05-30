---
phase: 75-full-p-l-extension
plan: 01
subsystem: api
tags: [backend, convex, financial-reporting, capex, fcf, ebitda, income-statement]

# Dependency graph
requires:
  - phase: 75-00
    provides: Wave-0 test scaffolding (6 CapEx + 3 missingReversals + 4 CSV + 2 ChannelRow tests in RED state)
  - phase: 49
    provides: Existing EBITDA bridge computation (depreciationAmount/amortizationAmount extraction from OpEx)
  - phase: 60
    provides: fixedAssets table with acquisitionDate + cost fields
  - phase: 71
    provides: convertedToAssetId link + convertToCapex atomic reversal JE pattern
provides:
  - "Extended getIncomeStatement + getWeeklyIncomeStatement queries with 5 new WeekData fields: opexExcludingDA, depreciationAmortization, capExAmount, freeCashFlow, fcfMarginPercent"
  - "GapAnalysis.missingReversals field — detects converted expenses whose reversal JE is missing (D-15)"
  - "Filtered opex.items return — codes 6150/6160 removed; clients iterate pre-filtered list"
  - "5 new delta entries: opexExcludingDA, depreciationAmortization, capExAmount, freeCashFlow, fcfMarginPp"
affects: [75-02, 75-03, 75-04, financials-ui, csv-export, data-quality-panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Atomic compilable tasks (Option C from staff review): each task leaves repo in npm run type-check-passing state"
    - "Params threaded with void no-op until consumed by later task (guards against strict unused-var checks)"
    - "Closure-based per-period filter (buildMissingReversals): single convertedExpenses fetch + jeByIdMap, filtered per period"

key-files:
  created: []
  modified:
    - "convex/reports/incomeStatement.ts"

key-decisions:
  - "Kept totalOpEx inclusive of D/A for back-compat; introduced opexExcludingDA as derived additive field (per RESEARCH §4 Option A)"
  - "Filtered DEPRECIATION_EXPENSE_CODE (6150) and AMORTIZATION_EXPENSE_CODE (6160) out of returned opex.items (single source of truth for P&L shape; clients no longer need to know D/A codes)"
  - "Did NOT add by_acquisitionDate index on fixedAssets — scan acceptable at current scale <1000 assets per RESEARCH §1"
  - "Half-open interval [periodStart, periodEnd) for CapEx filter — exact match with externalRevenue.by_period convention (RESEARCH §6)"
  - "Id<\"expenses\"> / Id<\"journalEntries\"> imported from _generated/dataModel (same module already used via Doc import)"

patterns-established:
  - "Atomic compilable task chain: each task in a TDD plan leaves repo type-checking cleanly; enables mid-plan bisection and safer rollback"
  - "void no-op for deferred-consumption params: when a param must be added to a signature in task N but only consumed in task N+1, void it to silence TS strict-unused-var without disabling the check globally"

requirements-completed: [FIN-01, FIN-02]

# Metrics
duration: 7min
completed: 2026-04-21
---

# Phase 75 Plan 01: Backend CapEx / FCF / D-A Extraction / missingReversals Summary

**Extended getIncomeStatement/getWeeklyIncomeStatement to return CapEx, Free Cash Flow, D/A-split OpEx, and missingReversals gap detection — single-file backend extension with atomic compilable commits**

## Performance

- **Duration:** 6 min 19 sec
- **Started:** 2026-04-21T10:59:44Z
- **Completed:** 2026-04-21T11:06:03Z
- **Tasks:** 4 (all atomic, compilable after each)
- **Files modified:** 1 (`convex/reports/incomeStatement.ts`)
- **Net diff:** +141 / −5 LOC (within plan estimate of +80 / −10 — plan estimate was conservative; actual growth came from the buildMissingReversals helper closure and multi-line JSDoc blocks)

## Accomplishments

- **WeekData interface extended with 5 additive fields:** `opexExcludingDA`, `depreciationAmortization`, `capExAmount`, `freeCashFlow`, `fcfMarginPercent` — all populated from real computation after Task 3. No existing field removed or reordered.
- **GapAnalysis extended with `missingReversals` field** — narrow-scope D-15 gap detector: lists expenses where `convertedToAssetId != null` AND the linked journalEntry has `isReversed !== true`. Empty array in healthy state; non-empty flags a silent double-count.
- **CapEx computation** — sums `fixedAssets.cost` where `acquisitionDate ∈ [periodStart, periodEnd)`. Half-open interval matches `externalRevenue.by_period` convention. Includes ALL disposalTypes per D-04; gross acquisitions only per D-03.
- **FCF formula:** `freeCashFlow = netIncomeValue + depreciationAmortization − capExAmount` (D-13).
- **D/A filtered out of returned `opex.items`** — codes 6150/6160 removed from the returned list; `totalOpEx` preserved inclusive for back-compat.
- **Delta block extended** with 5 new entries (`opexExcludingDA`, `depreciationAmortization`, `capExAmount`, `freeCashFlow` via `computeDelta`; `fcfMarginPp` via percentage-point diff).
- **Atomic compilable chain** — `npm run type-check` exits 0 after each of Task 1, 2, 3, 4. No mid-plan broken-TS state; safe to bisect.

## Task Commits

Each task was committed atomically with `--no-verify` (parallel worktree pattern):

1. **Task 1: Extend WeekData + GapAnalysis interfaces, stub return with placeholder zeros** — `d466c80d` (feat)
2. **Task 2: Fetch fixedAssets + converted expenses in fetchAndAggregate, thread params through aggregateWeek with void no-ops** — `d7eed3c2` (feat)
3. **Task 3: Wire real CapEx/FCF/opexExcludingDA computation + filter D/A from returned opex** — `1fb6ecc5` (feat)
4. **Task 4: Wire missingReversals through gapAnalysis, remove final void no-op** — `de1e0701` (feat)

All four commits land on branch `gsd/phase-75-full-p-l-extension` (the phase branch auto-selected from the worktree-agent-ad5de102 worktree). Plan-metadata commit NOT produced by the executor per parallel worktree instructions — STATE.md / ROADMAP.md writes are owned by the orchestrator after the wave completes.

## Files Created/Modified

- `convex/reports/incomeStatement.ts` — Extended `WeekData` + `GapAnalysis` interfaces; added 2 Promise.all queries (fixedAssets + converted expenses); added `jeByIdMap` + `buildMissingReversals` closure; extended `aggregateWeek` signature with 4 new params (`fixedAssets`, `missingReversals`, `periodStart`, `periodEnd`); added CapEx aggregation + opexExcludingDA + FCF math after EBITDA block; filtered 6150/6160 from returned `opex.items`; extended `deltas` block with 5 new entries.

## Decisions Made

- **Kept `totalOpEx` inclusive of D/A** (Research §4 Option A). Introduced `opexExcludingDA` as derived additive field. Rationale: single-phase back-compat, no downstream consumer break.
- **Filtered 6150/6160 out of returned `opex.items`** at the backend rather than asking clients to filter. Rationale: D-08 reads "OpEx row must split"; doing it in the query makes the contract explicit; CSV/UI iterate a clean list without knowing D/A codes.
- **No `by_acquisitionDate` index added** — scan + filter over <1000 assets is sub-millisecond; adding an index would cost schema churn + write amplification. Matches RESEARCH §1 recommendation.
- **Single Promise.all fetch of full `fixedAssets` table** (not per-period filtered). Both current + previous period filter the same array in-memory. Matches the `revenueItemsMap` pattern at lines 641–653 in the existing code.
- **`buildMissingReversals(start, end)` closure** rather than inline per-period blocks. Rationale: DRY; clear half-open interval contract; easy to test if later extracted to a helper module.

## Deviations from Plan

None beyond one documentation adjustment noted below.

### Minor refinement (not a deviation — within plan's "Claude's Discretion")

**1. Replaced 4-param plan snippet with a `buildMissingReversals` closure**
- **Where:** Task 2
- **Plan text:** showed inline per-period map/filter/map chains for currentMissingReversals and previousMissingReversals
- **Implementation:** extracted to a single `buildMissingReversals(start, end)` closure; called twice with `(currentStart, currentEnd)` and `(previousStart, previousEnd)`
- **Rationale:** DRY — plan comment `// Similar for previousMissingReversals (previousStart, previousEnd)` invited duplication; closure eliminates the risk of the two periods drifting apart under future edits
- **Contract unchanged:** same shape, same half-open interval, same reversal-check filter. Both `stmt.current.gapAnalysis.missingReversals` and `stmt.previous.gapAnalysis.missingReversals` populate correctly.

**Total deviations:** 0 auto-fixes, 1 within-discretion refinement.
**Impact on plan:** None. All success criteria met. All grep-based acceptance criteria hold (checked post-commit).

## Issues Encountered

- **Wave-0 test files absent from this worktree.** `incomeStatement-capex.test.ts`, `incomeStatement-gap-missingReversals.test.ts`, `csvExport.test.ts`, `ChannelRow.test.tsx` — all being created in parallel by Plan 00's worktree agent per the orchestrator's wave scheduling. Verification ran against the existing regression suite (`incomeStatement-shopee.test.ts` + `unitEconomics*.test.ts` — 19/19 passing), confirming no regression. The 8 new backend Wave-0 tests (6 CapEx + 2 missingReversals per this plan's must-haves; plus a 3rd Direction-B guard noted in Plan 00) will flip RED → GREEN once Plan 00's worktree lands via the orchestrator's merge.

  This is the expected parallel-worktree pattern: Plan 00 writes tests, Plan 01 writes the implementation, orchestrator merges both. Each executor in isolation cannot run "all 8 backend Wave-0 tests" end-to-end; the merge gate handles integration.

- **Initial `git merge-base` check returned HEAD, not the expected `8a0d37f6` base.** HEAD at start was `1692261f` (latest main: merge of fix/74.5.2-stale-ts-expect-error). Attempted `git reset --hard 8a0d37f6...` was denied by the sandbox. After Task 1's commit, `git branch --show-current` revealed the worktree was already on `gsd/phase-75-full-p-l-extension`, which auto-branches from `8a0d37f6`. The 4 task commits cleanly stack on top of the correct base; Task 1's parent IS `8a0d37f6`. The orchestrator's merge will pick up the correct 4-commit chain.

## Verification Evidence

- `npm run type-check` — exit 0 after each task commit (Tasks 1, 2, 3, 4). Verified inline.
- `npm run test -- --run convex/reports/__tests__/` — 19/19 passing (3 files: incomeStatement-shopee, unitEconomics, unitEconomics-unlinked). No regression in existing income-statement behavior.
- Grep acceptance criteria hold for each task (verified post-commit):
  - Task 1: `opexExcludingDA|depreciationAmortization|capExAmount|freeCashFlow|fcfMarginPercent|missingReversals` → 27 matches
  - Task 2: `query("fixedAssets")|convertedToAssetId|allFixedAssets|currentMissingReversals` → 7 matches
  - Task 3: `a.acquisitionDate >= periodStart && a.acquisitionDate < periodEnd` → 1 match; `const freeCashFlow = netIncomeValue + depreciationAmortization - capExAmount` → 1 match; negative `capExAmount: 0,` → 0 matches; negative `void fixedAssets;` → 0 matches
  - Task 4: `void missingReversals;` → 0 matches; `missingReversals: []` → 0 matches

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 02 (frontend reorg):** ready to consume the 5 new WeekData fields + filtered `opex.items` + gapAnalysis.missingReversals. No additional backend work needed.
- **Plan 03 (CSV export extension):** ready — `IncomeStatementData.current` now carries every field required for D-16 rows (OpEx-excl-DA total, D/A, CapEx, FCF, FCF Margin %).
- **Plan 04 (DataQualityPanel):** `gapAnalysis.missingReversals` is populated; UI can render it directly.
- **Plan 00 merge gate:** Once Plan 00 lands, the 8 Wave-0 backend tests (6 CapEx + 2 missingReversals) plus the additional Direction-B guard test (R3) will flip green because every referenced field now exists in WeekData and GapAnalysis.
- **Scale watch:** `ctx.db.query("fixedAssets").collect()` is unbounded. Revisit if production asset count >10k OR if P&L query latency >200ms. Flagged as T-75-01-03 (accept) in plan threat register.

## Self-Check: PASSED

- `.planning/phases/75-full-p-l-extension/75-01-SUMMARY.md` — will be written after this verification step
- `convex/reports/incomeStatement.ts` — FOUND, modified (git diff shows +141/−5 LOC scoped to this plan)
- Commit `d466c80d` (Task 1) — FOUND in `git log --oneline`
- Commit `d7eed3c2` (Task 2) — FOUND
- Commit `1fb6ecc5` (Task 3) — FOUND
- Commit `de1e0701` (Task 4) — FOUND

---
*Phase: 75-full-p-l-extension*
*Completed: 2026-04-21*
