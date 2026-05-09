# Staffreview — Phase 76 Financial Data Export

**Date:** 2026-05-09
**Branch:** feature/76-financial-data-export (HEAD `f27ac83e`)
**Base:** origin/main (`01aeb746`)
**Reviewer:** staff/principal-engineer perspective (triple-review run #1)
**Diff stat:** 34 files, +10,980 / −311 (planning + code + tests)

---

## Summary

Implementation faithfully ships what the 5 plans specified, and the prior staffreview's 3 Critical and most Important findings are demonstrably resolved in code (not just promised). The architecture stays disciplined — single backend file, three queries, one shared period-bucket helper, zero new indexes, zero new dependencies, all role-gated end-to-end. Test coverage is solid: 21 backend convex-test cases, 31 helper unit tests, 6 RTL tests, 6 Playwright E2E. There are no critical issues blocking merge.

That said, two tactical items deserve attention before merge: (1) the `convex/_generated/api.d.ts` was hand-edited because the executor's worktree had no `CONVEX_DEPLOYMENT` env var, and the regen-and-diff cleanup has been deferred to plan 05's TODO list — easy to forget. (2) The `useDebouncedValue` hook is correctly applied to `periodStart` / `periodEnd` (which can change rapidly via date typing) but is also applied to `granularity` (a discrete radio click) — harmless but unnecessary. Several other minor and nitpick items are listed below.

The 76-04 / 76-05 worktree base-drift recoveries via `git checkout fed9fcba -- .` and `git checkout {feature_tip} -- .` left no clobber or duplication artifacts — the diff against origin/main is clean and contains exactly the planned files.

---

## Critical Issues

None.

---

## Important

### I-1. Hand-edited `convex/_generated/api.d.ts` must be regenerated before merge

**Evidence:** `convex/_generated/api.d.ts:237` and `:492` — two lines added by hand in commit `7b6aedf4`. Plan 76-04 SUMMARY explicitly defers `npx convex dev` regen to plan 05 ("Cleanup: Remove the manual `convex/_generated/api.d.ts` edit from this plan by running `npx convex dev` once at plan-05 start"). Plan 05 SUMMARY does not show that regen ran — only the Playwright spec + UAT.md were authored autonomously; CONVEX_DEPLOYMENT is still unset in the worktree.

**Why important:** Codegen is the source of truth. A hand-rolled `api.d.ts` will silently rot the next time someone adds another Convex module, because `npx convex dev` rewrites the entire file. The risk window is small (any code-mod that touches Convex modules will trigger the regen) but the audit trail says "verify byte-equivalent diff" and that verification has not happened.

**Fix:** Before merging, in any environment where `CONVEX_DEPLOYMENT` is set (e.g., the user's own dev shell), run `npx convex dev` once, then `git diff convex/_generated/api.d.ts` — must be empty. If non-empty, the manual entry was wrong and there's a real bug. Recommend running this as part of the merge prep checklist, not deferring to "next executor."

### I-2. `useDebouncedValue` on `granularity` is unnecessary (minor over-engineering)

**Evidence:** `src/pages/FinancialExportPage.tsx:100` — `const debouncedGran = useDebouncedValue(granularity, 300);`

**Why important:** `granularity` is a discrete radio-button selection. It cannot change rapidly the way a typed date input can; clicks are debounced by physical reality. Wrapping it in `useDebouncedValue(..., 300)` adds a 300ms latency to a UI control where instant feedback is the right behavior, and adds nothing because there is no rapid-fire input source. `useDebouncedValue(periodStart, 300)` and `useDebouncedValue(periodEnd, 300)` are correctly applied (the date input fires `onChange` per-keystroke).

**Fix:** Drop the `debouncedGran` wrapper, pass `granularity` directly to the preflight query. Two-line change:

```typescript
// REMOVE:
const debouncedGran = useDebouncedValue(granularity, 300);
// And in the useQuery args, pass `granularity` directly instead of `debouncedGran`.
```

Not blocking — current behavior is functional, just slightly laggy on granularity changes.

### I-3. Granularity selector loses preflight refresh signal when P&L is unchecked

**Evidence:** `src/pages/FinancialExportPage.tsx:103-113` — preflight `useQuery` always includes `granularity` in the args. When the P&L checkbox is unchecked, the granularity radio group disappears (line 331: `{includePL && (...)}`) but the preflight query still uses whatever `granularity` was last set, and `periodCount` in the preflight stat row continues to show monthly/weekly bucket counts. If the user has only Raw selected, "X periods" is meaningless to them but is still displayed.

**Why important:** Minor UX inconsistency — the "X periods" stat is irrelevant when the user only wants raw transactions. Not a bug, but the panel loses contextual meaning.

**Fix (optional):** When `!includePL`, hide the periodCount portion of the preflight stat row (or render it as `Range covers N journal entries, M revenue rows.` without the period count). Not a release blocker.

---

## Minor

### M-1. `formatMonthLabel` `(partial)` detection is duplicated in two files

**Evidence:**
- `convex/reports/financialExport.ts:161-172` — backend version
- `src/lib/financialExportHelpers.ts:163-173` — frontend version

The two implementations are byte-identical, but only the backend version is actually invoked (the labels are computed server-side and shipped via `periods[].label` in `getMultiPeriodPLExport`). The frontend versions in `financialExportHelpers.ts` are exported but never called by `generateMultiPeriodPLCSV` — that function consumes `p.label` from the backend result.

**Why minor:** Dead-code-ish — the frontend `formatWeekLabel` / `formatMonthLabel` / `formatCustomLabel` functions are tested (`financialExportHelpers.test.ts:220-265`) but unused in the page render path. They will silently drift from the backend versions over time.

**Fix:** Either (a) delete the frontend versions and have the page rely on backend-emitted labels (smaller surface, single source of truth), or (b) document them as "kept for symmetry / for future client-side labelling needs". Recommend (a) since deleting unused code is the cleanest move.

### M-2. `aggregateRangeGap` deduplicates `unmappedProducts` by `name` — risks collisions

**Evidence:** `convex/reports/financialExport.ts:204-232` — the unmappedProducts map keys on `u.name` (line 222). If two distinct unmapped products happen to share a display name (unlikely but possible — channel-specific naming, encoding variants), they collide and counts/revenues merge.

**Why minor:** Per the unmappedProducts shape, the only available fields are `{name, count, revenue}` — there is no stable per-product code in the bag, so this is the best the data shape supports. Same caveat applies to `missingChannels.source` (key is fine) and `zeroCostComponents.code` (key is fine). The risk is constrained to `unmappedProducts`.

**Fix:** None required — flag for the future. If `unmappedProducts` ever gains a `code` field, switch the key to `code` for collision-safety.

### M-3. Frontend re-imports `WIB_OFFSET_MS` from `dateUtils.ts`, not from `convex/lib/periodRange.ts`

**Evidence:** `src/lib/financialExportHelpers.ts:23` imports `WIB_OFFSET_MS` from `./dateUtils`. Plan 01 also exported `WIB_OFFSET_MS` from `convex/lib/periodRange.ts` to satisfy plan 02's backend periodBuckets. So now there are TWO exported `WIB_OFFSET_MS` constants: one in `src/lib/dateUtils.ts:12` (existing) and one in `convex/lib/periodRange.ts:218` (added by plan 01).

**Why minor:** They have identical values. They cannot drift in practice because both compute from `WIB_OFFSET_HOURS = 7`. But the prior staffreview's R-equivalent ("WIB_OFFSET_MS currently exists in two places") is now a confirmed reality, not a hypothetical.

**Fix:** None required. Acceptable duplication given the cross-tier import barrier (frontend can't import from `convex/lib/` without paying the path cost; backend can't import from `src/lib/`). Document in CLAUDE.md that this is intentional dual-export, not drift.

### M-4. PII surface — `description` and `created_by` exposed in raw export

**Evidence:** `convex/reports/financialExport.ts:121, 125-127` — `description` and `createdByName` are emitted verbatim in every row. CONTEXT.md D-01 specifies these columns; the role gate (manager+admin) limits exposure. But this is the first time GL `description` text and the user's display name leave the system as a downloadable file.

**Why minor:** This is exactly the accountant-handoff use case — descriptions and audit names are what bookkeepers need. The role gate is the security boundary. Not a flaw, just worth flagging for SECURITY.md awareness.

**Fix:** None required. Recommend adding a one-line note to `docs/SECURITY.md` (during the deferred plan 05 docs sweep) acknowledging that `/financials/export` is a PII export surface gated to manager+admin, so any future role expansion (e.g., adding a "viewer" role) must explicitly re-evaluate this gate.

### M-5. Preflight `useQuery` re-fires on every render of P&L checkbox toggle

**Evidence:** `src/pages/FinancialExportPage.tsx:103-113` — preflight is gated only on `user?.token && hasValidRange`, not on `(includeRaw || includePL)`. When neither type is checked, the preflight still runs (cheap, but wasteful). Also when only Raw is checked, `granularity` is still passed and `periodCount` is computed needlessly.

**Why minor:** Preflight is a cheap query (two indexed `.collect().length` calls), so the cost is small. But the convention elsewhere in the codebase is to skip queries when their result isn't displayed.

**Fix (optional):** Add `(includeRaw || includePL)` to the gate so preflight skips when no export type is selected. Trivial.

### M-6. `RawTransactionRow` type is duplicated frontend ⇄ backend

**Evidence:**
- `convex/reports/financialExport.ts:35-48` — backend type
- `src/lib/financialExportHelpers.ts:193-206` — frontend type (with `journalEntryId: string` instead of `Id<"journalEntries">`)

The two types are structurally compatible but separately declared. The backend one uses `Id<"journalEntries">` for the `journalEntryId` field; the frontend one uses `string`. They're isomorphic across the network because Convex serializes IDs as opaque strings, but a future schema field addition on the backend won't propagate to the frontend type — silent drift hazard.

**Fix:** Either (a) `import type { RawTransactionRow } from "../../convex/reports/financialExport"` in the helper and re-cast `journalEntryId: string` for the frontend, or (b) live with the duplication and rely on `npm run build` to catch shape mismatches at the API boundary. Recommend (a) for consistency with the existing `WeekData` cross-tier type-only import precedent.

---

## Nitpicks

- The annotation comment row in `generateMultiPeriodPLCSV` (line 320-322) starts with `#` but CSV has no comment-character convention. Excel and Google Sheets render this row literally as a single-cell row that breaks column alignment slightly. Minor; consistent with the existing Phase 75 footer pattern.
- `DAY_MS` is redeclared in three places: `convex/lib/periodBuckets.ts:22`, `src/lib/financialExportHelpers.ts:48`, `src/pages/FinancialExportPage.tsx:29`. None drift in practice but a `const DAY_MS = 24 * 60 * 60 * 1000;` could live in `dateUtils.ts` once.
- `humanizeError` in `FinancialExportPage.tsx:35-44` duplicates the same helper from `BankReconciliationPage.tsx:91-96`. A future refactor could lift this to `src/lib/convexErrors.ts`. Not in scope for Phase 76.
- The `# Multi-period export` annotation row in CSV is informational but not a true comment — Excel will treat it as a single-cell row spanning the first column only. Acceptable per CONTEXT.md `<specifics>`.
- `convex/reports/financialExport.ts` re-implements `formatWeekLabel` / `formatMonthLabel` / `formatCustomLabel` and `formatBucketLabel` — these are identical to the frontend versions in `financialExportHelpers.ts`. See M-1.
- `getRawTransactionsExport` silently drops rows where `je` or `account` is null (`continue` at line 111, 113). Audit-friendly behavior would be to log or count these orphans. Acceptable per "data integrity belongs in Phase 77" comment, but worth a Phase 77 backlog note.
- `formatMonthLabel`'s `isFullMonth` check (lines 167-171 in both files) tolerates same-month / same-year false positives only when day-of-month is 1 on both ends — correct, but the comparison `endWib.getUTCMonth() !== startWib.getUTCMonth() || endWib.getUTCFullYear() !== startWib.getUTCFullYear()` is logically equivalent to `endWib > startWib` once day-of-month is locked to 1, which would read more clearly.
- The `_creationTime` field in `RawTransactionRow` (line 47, 128) is sort-only and is not emitted in the CSV. Acceptable, but it bloats the over-the-wire payload by one number per row. For 10k+ rows that's ~80KB extra. Tolerable.

---

## Resolved from prior staffreview (2026-05-08)

| Prior Finding | Status | Evidence |
|---------------|--------|----------|
| **Critical 1** — `WIB_OFFSET_MS` not exported from `convex/lib/periodRange.ts` | **Resolved** | `convex/lib/periodRange.ts:218` — `export const WIB_OFFSET_MS = …` (commit `8a5289e7`); imported by `convex/lib/periodBuckets.ts:17` |
| **Critical 2** — `buildIncomeStatementRows` `deltas` arg contradiction between plans 01 and 03 | **Resolved** | Option A taken: `src/lib/csvExport.ts:153-158` — signature is `(periodStr, current, previous, firstInRange = false)` with NO `deltas` parameter; helper computes deltas internally via private `computeInRangeDeltas` (lines 76-145). Plan 03 calls it with 4 args (`src/lib/financialExportHelpers.ts:331`). |
| **Critical 3** — `aggregateRangeGap` field names unverified placeholders | **Resolved** | `convex/reports/financialExport.ts:193-248` — typed against `Array<{ current: WeekData }>` (line 193); fields walked: `gapAnalysis.totalProducts`, `totalMappedProducts`, `unmappedProducts[]`, `missingChannels[]`, `zeroCostComponents[]` — all real fields per `convex/reports/incomeStatement.ts:55-72` (`GapAnalysis` exported in commit `8a5289e7`). |
| **Improvement 4** — `useDeferredValue` ≠ debounce | **Resolved** | `src/hooks/useDebouncedValue.ts:13-22` — real `setTimeout`-based debounce with `clearTimeout` cleanup. `! grep -E "useDeferredValue"` passes (commit `2bf6bece` reworded the doc comment). |
| **Improvement 5** — `WeekData` should be exported | **Resolved** | `convex/reports/incomeStatement.ts:74` — `export interface WeekData {…}` (commit `8a5289e7`). Imported as `import type { WeekData }` in `src/lib/csvExport.ts:54`, `src/lib/financialExportHelpers.ts:185`, `convex/reports/financialExport.ts:25`. |
| **Improvement 6** — `formatWeekLabel`/`formatMonthLabel` not implemented | **Resolved** | `convex/reports/financialExport.ts:154-179` and `src/lib/financialExportHelpers.ts:151-180` — both implementations present with `(partial)` suffix logic. (See M-1 for the duplication concern.) |
| **Improvement 7** — Empty-Raw with both checked silently downloads only P&L | **Resolved** | `src/pages/FinancialExportPage.tsx:152-194` — per-export status tracking (`rawStatus` / `plStatus` ∈ `"skipped" \| "downloaded" \| "empty"`) drives 5 distinct toast messages including "P&L downloaded; no raw transactions in range." |
| **Improvement 8** — `buildPeriodBuckets` duplicated frontend ⇄ backend | **Resolved** | `convex/lib/periodBuckets.ts` (NEW shared module) — single source. Imported by both backend (`convex/reports/financialExport.ts:26`) and frontend (`src/lib/financialExportHelpers.ts:30-32`). Re-exported from `financialExportHelpers.ts:41`. |
| **Improvement 9** — "Last week" preset semantics ambiguous | **Resolved** | `src/lib/financialExportHelpers.ts:73-81` — locked to **prior ISO week (Mon–Sun)** semantics with explicit comment. Tested in `financialExportHelpers.test.ts:173-194` (3 tests: prior ISO week, from-Monday, from-Sunday). |
| **Improvement 10** — Plan 05 should use `loginAsRole(page, "kitchen")` directly | **Resolved** | `tests/e2e/financial-data-export.spec.ts` — uses `loginAsRole(page, "kitchen")` directly per 76-05-SUMMARY task table; no `test.skip` fallback (verified via plan 05 acceptance grep). |
| R1 — Branch naming asymmetry | **Resolved** | Branch is `feature/76-financial-data-export` per CLAUDE.md convention; matches plan text. |
| R3 — RTL filename test flakiness | **Resolved** | `src/pages/__tests__/FinancialExportPage.test.tsx` uses `vi.setSystemTime(new Date("2026-05-08T00:00:00Z"))` per plan 04 SUMMARY. |
| R4 — Preflight large-range test punted seeding 10k+ lines | **Resolved** | `convex/reports/__tests__/financialExport.test.ts:458-505` — `isLargeRange === true when journalLineCount > 10000` test seeds 10,001 lines + a `<= 10000` regression test. |
| R5 — Generate handler should parallelize queries | **Resolved** | `src/pages/FinancialExportPage.tsx:149` — `await Promise.all([rawPromise, plPromise])`; only the file `downloadCSV` calls are sequenced with the 100ms gap (line 169). |
| R6 — UAT references `/manual-journal` route — verify exists | **Resolved** | UAT.md uses `/journal` (verified at `src/App.tsx:457` per plan 05 SUMMARY); `/manual-journal` not present. |
| G2 — Plans 02/03 should run full `npm run test` | **Partially resolved** | Plan 02 SUMMARY mentions full suite + flagged a pre-existing flaky test in `correctAttendance.test.ts` (deferred to `deferred-items.md`). Plan 03 ran helper tests + cross-validation. The deferred-items entry confirms full-suite was attempted. |
| G3 — Triple-review must run BEFORE docs sweep | **In progress** | This staffreview run #1 is part of the triple-review cycle; docs sweep deferred to plan 05 task 5.4 per SUMMARY. Order honored. |

---

## Architectural Notes

1. **Cross-tier import pattern is now well-established.** The frontend importing `convex/lib/periodBuckets.ts` and `import type { WeekData } from "../../convex/reports/incomeStatement"` is precedent-setting for this codebase. Bundler safety verified by the existing prior art (`UnlinkedProductsBackfill`, `ProductInventorySettings`, `ChannelRoutingManager`). A note in `docs/CODE_STYLE.md` explicitly permitting `convex/lib/*` imports from `src/` (and `import type` of any Convex-side interface) would future-proof this convention. Current state: pattern works, but it's discovered by reading commits, not documented.

2. **`fetchAndAggregate(includePrevious)` is now a public extension point.** The opt-out flag turned a private helper into a re-usable engine. Future P&L analytics (rolling N-period dashboards, period-over-period trend grids) can lean on the same helper without re-deriving math. The `default true` preserves all 80+ existing single-period calls unchanged. Solid extension.

3. **`/financials/export` is the first PII-aware export route.** The role gate (manager+admin, doubled at route + query) keeps the door narrow. As more exports land (Phase 77 Data Health, eventually XLSX), this gate convention should be extracted into a permission constant (e.g., `canAccessFinancials = ["manager","admin"]`) so future routes can't drift to a different role list. Worth a Phase 77 follow-up.

4. **`useDebouncedValue` is now a project-standard hook.** Generic, two-line implementation. Recommended to lift into `src/hooks/` index and use from any future "live preflight" page (Phase 77 Data Health is the obvious next consumer).

5. **The 10K row threshold is hardcoded** in `convex/reports/financialExport.ts:343`. As Frollie's volume grows, this will need re-tuning. Consider lifting to a settings constant (e.g., `EXPORT_LARGE_RANGE_THRESHOLD = 10_000`) in `convex/lib/constants.ts` (if it exists) so the threshold is documented and centrally adjustable.

6. **Worktree base-drift recovery via `git checkout {sha} -- .` worked twice (76-04, 76-05) without artifacts.** This is a defensive pattern documented in MEMORY's `lessons_phase_74_5_2_quad_review.md`. The diff against origin/main is exactly what was planned — no clobber, no duplication. The recovery commits (`5335dfc5`, `b1bf1607`) are clean "import base" commits. Pattern validated for future parallel-worktree executions.

7. **No new Convex indexes required.** Both `journalEntryLines.by_entryDate` (line 1989 of schema) and `externalRevenue.by_period` (line 1160) already exist and are reused. Phase 76 stays at 70 tables / existing index count, matching CONTEXT.md / RESEARCH.md projections.

---

*Generated by /staffreview — 2026-05-09*
*Branch: feature/76-financial-data-export | Base: origin/main (01aeb746) | Head: f27ac83e*
