# Staff Review: feature/40-retroactive-verification-gap-closure

**Reviewed:** 2026-03-09
**Reviewer:** Staff Engineer (automated)
**Branch:** `feature/40-retroactive-verification-gap-closure`
**Base:** `origin/main` (4ddbcf4)
**Head:** 35fa1aa (12 commits)
**Status:** APPROVED

## Summary

This PR combines two workstreams on a single feature branch: Quick Task 31 (code cleanup -- 6 commits) and Phase 40 (documentation gap closure -- 6 commits). The code changes are confined to Quick Task 31 and are straightforward: delete 7 unused component files (742 LOC), remove 3 dead hooks from the barrel export, clean 4 dead type exports from overviewUtils.ts, and update 2 E2E test files. Phase 40 is documentation-only: 3 new VERIFICATION.md files, 3 SUMMARY frontmatter fixes, and cross-reference updates to REQUIREMENTS.md, ROADMAP.md, STATE.md, and CHANGELOG.md.

**Plan fidelity is high.** The 40-01-PLAN specified 3 tasks; all 3 were executed exactly as written with no deviations reported. The pre-execution staffreview (2026-03-08) raised 4 improvement recommendations: I-01 (CHANGELOG entry), I-02 (checkbox consistency), I-03 (dual LOC recording), and I-04 (process improvement note). The first three were addressed in the implementation. I-04 (process improvement) was not addressed but was rated "Low-Medium" and described as a nice-to-have.

**Documentation accuracy is strong.** All LOC values in the 3 VERIFICATION.md files were independently verified against the current codebase and match exactly. The "no drift" claims are accurate: `orders/queries.ts` = 940, `orderCrud.ts` = 958, `dispatchPlanner/queries.ts` = 313, `externalData/queries.ts` = 1,387, `k3martCockpit/queries.ts` = 760. The one drift case (schema index count 150 vs SUMMARY-reported 151) is correctly explained.

**Quick-31 cleanup is thorough.** All 7 deleted component files are confirmed gone. No orphaned references to `RevenueTable`, `RevenueItemDetails`, `InternalOrderDetails`, `StoreGroupHeader`, `PlatformBadge`, `ConfidenceBadge`, or `MatchStatusBadge` remain in `src/` or `tests/`. The 3 dead hooks (`useExternalRevenue`, `useOrderDetailsByOrderNumber`, `useRevenueItems`) are removed from both the hook file and the barrel. The 4 dead type exports (`RevenueRecord`, `ConfidenceLevel`, `MatchConfidence`, `SOURCE_DISPLAY_NAMES`) are gone. E2E tests have been cleaned of stale `expect(true).toBe(true)` patterns.

## Critical Issues

None.

## Improvements

### I-01: REQUIREMENTS.md still states unmet LOC targets as achieved (Medium)

**Location:** `.planning/REQUIREMENTS.md` lines 21-23

The requirement checkbox descriptions read:
- `BFS-04`: "slimmed to under 800 LOC"
- `BFS-05`: "slimmed to under 700 LOC"

Actual values are 940 LOC and 958 LOC respectively. The checkboxes are `[x]`, implying the requirement was met as stated. The VERIFICATION.md files correctly document these as "SATISFIED (deviation)" with honest LOC numbers, but the REQUIREMENTS.md text creates a contradiction: the check mark suggests "under 800" was achieved when it was not.

The requirement wording was written at planning time and represents an aspirational target. The VERIFICATION approach of marking them SATISFIED with deviation is the right call -- the extraction work was done, the targets were simply too aggressive for ctx-dependent Convex code. But the REQUIREMENTS.md checkbox text should be updated to match reality, e.g., `BFS-04: orders/queries.ts slimmed to 940 LOC (from 1,279) via helper extraction (target was <800, ctx-dependent code limits further reduction)`.

**Impact:** An auditor reading REQUIREMENTS.md alone would conclude the 800 LOC target was met. The VERIFICATION.md tells the truth, but requirements documents should not require cross-referencing to understand their own status.

### I-02: Phase 38 and 39 show "(0/4 plans)" and "(0/3 plans)" in ROADMAP.md (Low-Medium)

**Location:** `.planning/ROADMAP.md` lines 115-117

```
- [x] **Phase 38: Frontend Giant File Splits** (0/4 plans)
- [x] **Phase 39: E2E Test Foundation & Resilience** (0/3 plans)
```

These should be "(4/4 plans)" and "(3/3 plans)" since both phases are complete and checked. This is a pre-existing error from before this branch, but Phase 40's ROADMAP update touched the v1.6 section and could have fixed it. The executor updated Phase 40's entry and the milestone header but did not correct the adjacent stale plan counts.

**Impact:** Minor inconsistency. A phase marked `[x]` with "0/N plans" suggests zero plans were executed, contradicting the completion status.

### I-03: Two workstreams on one feature branch (Low-Medium)

**Location:** Branch structure

Quick Task 31 (code changes: 6 commits) and Phase 40 (docs-only: 6 commits) share a single feature branch. Per the project's branching strategy (`branching_strategy: "phase"` in config), every GSD phase runs on its own branch. Quick Task 31 is not a GSD phase, but it introduces code changes (7 deleted files, modified hooks, modified E2E tests) that are semantically unrelated to Phase 40's documentation gap closure.

If the code changes in Quick Task 31 need to be reverted (e.g., a component deletion causes a regression), the Phase 40 documentation changes would need to be reverted along with them, or the revert cherry-pick would need to be surgical. Separate branches would allow independent revert.

**Impact:** Low in practice -- the Quick Task 31 changes are deletions only (low regression risk), and the PR is already created. This is a process note for future work rather than a blocking issue.

### I-04: ROADMAP still says "59 Convex tables" in Phase 35 description (Nitpick)

**Location:** `.planning/ROADMAP.md` lines 122, 129

The Phase 35 goal description says "audit of all 59 Convex tables" and the approach says "schema.ts (1,600 LOC, 59 tables)". The Phase 35 audit itself found 65 tables (confirmed in MEMORY.md and the SCHEMA_AUDIT report). This is a pre-existing stale number, but since Phase 40 rewrote the ROADMAP file and explicitly updated Phase 40's entry, the adjacent stale data could have been corrected.

**Impact:** Cosmetic. The SCHEMA_AUDIT.md has the correct number.

## Refinements

### R-01: STATE.md has malformed Quick Task rows (Nitpick)

**Location:** `.planning/STATE.md` lines 94-95

```
| Phase 39 P01 | 5min | 2 tasks | 3 files |
| Phase 39 P03 | 3min | 1 tasks | 1 files |
```

These rows use the wrong columns -- duration, task count, and file count are in the Date, Commit, and Status columns. This is a pre-existing issue from Phase 39, not introduced by this PR, but the Phase 40 execution touched STATE.md and could have corrected it.

### R-02: VERIFICATION.md timestamps are identical and synthetic (Nitpick)

All 3 VERIFICATION.md files have `verified: 2026-03-09T10:00:00Z` as their timestamp. Since the execution took ~5 minutes and produced 3 commits at different times, using the same timestamp across all 3 files is a simplification. The timestamps are valid (retroactive verification did happen on 2026-03-09), but real verification times would differ by at least 1-2 minutes. This is a minor fidelity note.

### R-03: SUMMARY claims "All 20 v1.6 requirements now traceable" (Positive)

The 40-01-SUMMARY.md line 66 states: "All 20 v1.6 requirements now traceable via 3-source cross-reference (VERIFICATION + SUMMARY + ROADMAP)." I cross-referenced:

- REQUIREMENTS.md: 20 requirements, all checked `[x]`, all mapped to phases, all "Complete"
- ROADMAP.md: All 6 phases checked `[x]` with requirements listed
- VERIFICATION.md: Phases 35-39 all have VERIFICATION files (Phase 38 and 39 had them pre-existing, Phases 35-37 added by this PR)
- SUMMARY frontmatter: All phase SUMMARYs now have `requirements-completed` fields

The claim is accurate.

### R-04: E2E test quality after Quick Task 31 cleanup (Positive)

The E2E tests were properly updated. The key changes:
- `sales-analytics-overview.spec.ts` US-7: Removed reference to "Revenue table" and replaced with a comment that it was "intentionally removed"
- No `expect(true).toBe(true)` patterns remain in the E2E suite (verified via grep)
- No `.catch(() => false)` swallowing patterns remain in the overview spec
- Real assertions (`expect(chartVisible).toBe(true)`, `expect(visibleCount).toBeGreaterThanOrEqual(1)`) are used throughout

### R-05: Staffreview recommendations addressed (Positive)

Of the 4 recommendations from the pre-execution staffreview (2026-03-08):

| Finding | Priority | Addressed? |
|---------|----------|------------|
| I-01: CHANGELOG entry | Medium | Yes -- full Phase 40 CHANGELOG section added |
| I-02: Checkbox consistency | Medium | Yes -- BFS-04/05/06 checkboxes changed to `[x]` |
| I-03: Dual LOC recording | Medium | Yes -- all 3 VERIFICATION files record both SUMMARY and current values |
| I-04: Process improvement | Low-Medium | No -- no process improvement note in VERIFICATION files |

3 out of 4 addressed. The unaddressed item was the lowest priority and explicitly described as not blocking.

### R-06: Hook barrel export is clean (Positive)

`src/hooks/convex/index.ts` shows no orphaned exports. The 3 removed hooks (`useExternalRevenue`, `useOrderDetailsByOrderNumber`, `useRevenueItems`) are gone from both the source file (`useExternalData.ts`) and the barrel. No other consumers of these hooks exist anywhere in `src/`.

## Verdict

**APPROVED.** The implementation matches the plan with high fidelity. All staffreview findings except the lowest-priority one were addressed. VERIFICATION.md files are accurate and cross-referenced against the codebase. Quick Task 31 cleanup is complete with no orphaned references. The one substantive issue (I-01: REQUIREMENTS.md stating unmet LOC targets as achieved) is a documentation accuracy concern that should be addressed before the milestone is formally closed, but it is not a merge blocker.

---

_Reviewed: 2026-03-09_
_Reviewer: Staff Engineer (automated, Claude Opus 4.6)_
