# Staff Review: Quick Task 31 -- Remove Sales Details Table from Sales Analytics

**Reviewer:** Senior Engineer (staffreview)
**Date:** 2026-03-07
**Branch:** `main` (commits `e769b4f..9275ff4`)
**Scope:** 11 files changed, -742 LOC net (7 deleted, 4 modified)

---

## Summary

Quick Task 31 removed the "Sales Details" card (RevenueTable) from the Sales Analytics OverviewTab, deleted 7 orphaned component files, cleaned dead imports/state from OverviewTab.tsx, removed dead types from overviewUtils.ts, and updated two E2E test files. The execution closely followed the plan with one minor auto-fixed deviation (unused `CardTitle` import caught by the build gate).

**Plan fidelity: HIGH.** Every planned deletion and cleanup was executed. The OverviewTab went from 283 to 179 LOC as targeted. All 7 component files were deleted. The E2E tests were updated per plan: US-7 rewritten, US-8/US-10 trimmed, US-11 deleted entirely.

**Overall assessment: GOOD execution with one meaningful oversight.** The dead code sweep stopped at the component layer and did not follow the dependency chain into the hook layer or backend queries. Three frontend hooks and two backend Convex queries are now orphaned.

---

## Critical Issues

None.

---

## Important Issues

### IMP-1: Three dead frontend hooks remain in `useExternalData.ts`

**Files:** `src/hooks/convex/useExternalData.ts` (lines 65-78, 188-194, 264-270), `src/hooks/convex/index.ts` (lines 226, 231-232)

The deleted components were the sole consumers of three hooks:

| Hook | Sole Consumer (deleted) | Lines |
|------|------------------------|-------|
| `useExternalRevenue` | `OverviewTab.tsx` (RevenueTable card) | 65-78 |
| `useOrderDetailsByOrderNumber` | `InternalOrderDetails.tsx` | 188-194 |
| `useRevenueItems` | `RevenueItemDetails.tsx` | 264-270 |

All three are still defined and exported from the barrel `index.ts`. This is dead code that:
- Inflates the hook surface area (3 exports that compile but have no callers)
- Keeps `useExternalRevenue` alive -- the very Convex subscription the plan justified removing ("eliminates a Convex query that fetches potentially thousands of individual revenue records")
- Could mislead future developers into thinking these hooks are in active use

**Note on `useRevenueItems`:** While the frontend hook is dead, the underlying backend query `getRevenueItems` is still referenced internally by `convex/integrations/gobiz/adapter.ts` (lines 654, 919). The backend query must stay; only the frontend hook wrapper is dead.

**Recommendation:** Delete all three hook functions from `useExternalData.ts` and remove their re-exports from `index.ts`. This completes the cleanup chain that was started.

### IMP-2: Two backend Convex queries are now frontend-orphaned

**File:** `convex/externalData/queries.ts` (lines 158, 595)

| Backend Query | Only Frontend Caller (now dead) |
|---------------|-------------------------------|
| `getRevenue` (line 158) | `useExternalRevenue` |
| `getOrderDetailsByOrderNumber` (line 595) | `useOrderDetailsByOrderNumber` |

Neither query is called from any other backend code (confirmed via codebase grep). They are public `query()` exports exposed via the Convex API surface, which means:
- They add to the deployed function count
- They remain callable via the Convex dashboard or direct API calls
- They consume review attention when auditing the queries file

**Recommendation:** Remove both queries in a follow-up task. Verify with `grep -rn` that no cron, HTTP endpoint, or internal query references them before deleting. The `getRevenueItems` query must NOT be removed -- it is still used by the GoBiz adapter.

---

## Refinements

### REF-1: Four `expect(true).toBe(true)` anti-patterns persist in overview E2E tests

**File:** `tests/e2e/sales-analytics-overview.spec.ts` (lines 96, 127, 151, 187)

The verification report correctly noted these are pre-existing (US-6, US-8, US-9, US-10) and not introduced by this task. However, the plan explicitly cited Phase 39's lesson about this anti-pattern as justification for deleting US-11. The same standard was not applied to the four surviving instances.

Tests US-8 and US-10 have real observable behavior they could assert (chart visibility, tab presence) but fall back to `expect(true).toBe(true)`. US-6 logs diagnostic info but asserts nothing meaningful. US-9 checks for a text string but doesn't assert it.

These are not blockers, but they represent false confidence -- tests that always pass regardless of page state.

**Recommendation:** In a follow-up, convert each test's `expect(true).toBe(true)` to a real assertion based on the observable behavior already being checked (e.g., US-6 could assert `bigNumberCount >= 4`, US-8 could assert `chartVisible`, US-9 could assert `hasUpdatedDescription || titleVisible`).

### REF-2: Em-dash to double-dash normalization was out of scope

The diff shows systematic replacement of `--` (em-dash Unicode) with `--` (ASCII double hyphen) in test comments and describe block names. Examples:

- `"Sales Analytics Overview -- Cofounder Revenue Dashboard"` (was em-dash)
- `"Fewer than 4 prominent metric numbers -- cofounder can't..."` (was em-dash)

This is a cosmetic normalization that touches 8+ lines unrelated to the Sales Details removal. While harmless, it makes the diff noisier and complicates `git blame`. Future tasks should avoid bundling style normalizations with functional changes.

### REF-3: Summary claims "608 LOC removed" but diff shows 762 deletions

The summary states "608 LOC of dead code" removed, while `git diff --stat` shows 762 deletions (net after additions). The 608 figure likely counts only the 7 deleted component files. The actual LOC reduction includes OverviewTab cleanup (~104 LOC), overviewUtils cleanup (~30 LOC), and E2E test cleanup (~121 LOC). The summary should use the net figure or clarify "608 LOC from deleted files, 762 total lines removed."

---

## Nitpicks

### NIT-1: `screenshotElement` import could be reviewed

`tests/e2e/sales-analytics-overview.spec.ts` still imports `screenshotElement` (used once in US-6, line 90). This is correct and not dead, but worth noting since the original US-7 test also used `screenshotElement` for table screenshots. The import survived correctly.

### NIT-2: Plan directory name is truncated

The planning directory `.planning/quick/31-remove-detailed-transactions-table-from-/` has a trailing truncation (ends with `from-/`). This appears to be a filesystem path length issue. Not a code concern, but makes navigation awkward.

---

## Plan-to-Implementation Fidelity Matrix

| Plan Item | Status | Notes |
|-----------|--------|-------|
| Delete 7 component files | DONE | All 7 confirmed absent |
| Remove dead imports from OverviewTab | DONE | Plus auto-fix for CardTitle |
| Remove dateFrom/dateTo state | DONE | |
| Remove revenuePeriodBounds useMemo | DONE | |
| Remove useExternalRevenue call | DONE | But hook definition left alive (IMP-1) |
| Remove useEffect date sync | DONE | |
| Remove useState/useEffect/useMemo from React import | DONE | Only useState remains |
| Remove Revenue Table card JSX | DONE | Lines 220-280 removed |
| Clean overviewUtils.ts dead types | DONE | 4 exports removed |
| Update US-7 test | DONE | Rewritten to assert chart visibility |
| Update US-8 test | DONE | Sales Details check removed |
| Update US-10 test | DONE | Revenue Details bounding box removed |
| Delete US-11 test | DONE | Entirely removed |
| Update period spec | DONE | Simplified assertion |
| Update test header comments | DONE | Revenue table lines removed |
| npm run build passes | DONE | Verified in commit |

**Scope creep:** None detected. All changes are within the planned scope.
**Shortcuts:** The dead hook/query chain (IMP-1, IMP-2) was not in the plan's scope, but the plan's verification step 2 (`grep -rn` for deleted names) would not have caught it since the hooks don't reference the deleted component names -- they reference Convex API paths.

---

## Architectural Risk Assessment

**Risk: LOW.** This is a pure removal task with no new code, no schema changes, no API contract changes. The remaining architectural concern is the orphaned hooks/queries (IMP-1, IMP-2) which are dead code, not broken code.

**Real-time subscription impact:** Positive. Removing `useExternalRevenue` from OverviewTab eliminates a reactive Convex subscription that could fetch thousands of revenue records. However, the hook definition still exists and could be accidentally re-imported. Deleting the hook (IMP-1) would close this vector.

---

## Verdict

**PASS with follow-up.** The task achieved its goals cleanly. The one meaningful gap is the orphaned hook/query chain (IMP-1 + IMP-2) which should be cleaned up in a follow-up quick task to fully realize the stated goal of eliminating the unbounded Convex query.

---

*Reviewed: 2026-03-07*
*Reviewer: Claude (staffreview)*
