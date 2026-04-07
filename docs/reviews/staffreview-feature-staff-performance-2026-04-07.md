# Staff Review: Staff Performance Feature

**Date:** 2026-04-07
**Branch:** `feature/staff-performance`
**Base:** `origin/main` (ccc1db3d)
**Reviewer:** Claude (Staff Engineer)

---

## Summary

A well-scoped, report-only feature that aggregates `kitchenShiftRecords` per staff member for monthly production and payment reporting. The implementation follows existing project conventions (ProtectedRoute, hooks barrel, lazy loading, PageHeader pattern) and the backend aggregation is straightforward. The primary concerns are: (1) a duplicated `getCurrentWibMonth` function that should reuse the canonical `dateUtils.ts` version, (2) `componentWaste` data is silently dropped from the aggregation, and (3) the query does an unbounded `.collect()` on a month of shift records which is fine for current scale but has no safety net if data volume grows.

---

## Critical Issues

None found.

---

## Important Improvements

1. **Duplicated `getCurrentWibMonth` -- must reuse canonical version**

   `StaffPerformance.tsx` (lines 45-48) defines its own `getCurrentWibMonth()`:
   ```typescript
   function getCurrentWibMonth(): { year: number; month: number } {
     const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
     return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
   }
   ```

   The canonical implementation already exists at `src/lib/dateUtils.ts:23` (`getCurrentWibMonth(now?: number)`). The duplicated version lacks the `now` parameter for testability and violates the "single source of truth" pattern documented in CLAUDE.md (`src/lib/dateUtils.ts` is listed as `WIB timezone (frontend)`). **Replace with `import { getCurrentWibMonth } from "@/lib/dateUtils";`.**

2. **`componentWaste` is silently ignored in the aggregation query**

   The `getStaffPerformanceSummary` query (line 436-451) aggregates `record.componentProduced` (grams) but completely skips `record.componentWaste`. The schema supports `componentWaste` entries with grams and reason fields. This means:
   - Component waste grams are not reflected in any total
   - Component waste does not appear in any breakdown
   - The UI shows no component waste data

   This is an incomplete implementation of the requirement "Track waste (with reasons)." The fix should add a `totalComponentWasteGrams` field and `componentWasteBreakdown` array to the aggregation, and surface it in the UI and CSV exports.

3. **CSV `formatBreakdown` uses `toLocaleString()` -- locale-dependent output**

   In `staffPerformanceExport.ts` line 29, `formatBreakdown` calls `value.toLocaleString()`. The `toLocaleString()` output varies by locale (e.g., `1,234` in en-US vs `1.234` in id-ID). When this string is embedded inside a CSV cell that is semicolon-delimited within a comma-separated file, the comma in `1,234` will break CSV parsing even though the outer cell is not individually quoted (the `escapeCell` function only quotes cells containing commas at the top level, but the breakdown values are concatenated with `"; "` before being passed to `escapeCell`, so the comma from `toLocaleString` will trigger quoting -- but this is fragile). **Use plain `String(value)` or `value.toString()` in CSV contexts for predictable output.** The `toLocaleString()` approach is fine for UI display but dangerous in export files.

4. **The `produced` field tracks menu product quantities, not raw ball counts**

   The query labels the total as `totalBallsProduced` (line 459), and the UI displays "Balls Produced" (line 322). However, the `produced` array in `kitchenShiftRecords` contains `{ menuProductId, quantity }` where `quantity` is the number of units of that menu product produced. Per CLAUDE.md Business Rule 10 and Common Pitfall 11, a single menu product may contain multiple balls (BOM resolution). For example, "Original Triple" = 1x Big Ball + 2x Mid Ball = 3 balls, but `quantity: 1` in the shift record.

   **Whether this is correct depends on how kitchen shift records are entered.** If shift records already track per-ball production (i.e., `quantity` = number of balls, not products), then the naming is correct. But if `quantity` = number of product units produced, then the "balls" label is misleading and the count is wrong. This needs verification against how `kitchenShiftRecords` mutations populate the `produced` field. If it truly tracks product units, the aggregation should resolve through BOM to count actual balls, or the label should be changed to "Units Produced."

---

## Refinements

1. **`escapeCell` is duplicated from `csvExport.ts`**

   The `escapeCell` function in `staffPerformanceExport.ts` (lines 14-19) is character-for-character identical to the sanitization logic in `csvExport.ts` (lines 610-619). Consider extracting it as a shared utility from `csvExport.ts` and importing it, rather than maintaining two copies.

2. **Totals row calculated twice -- once in UI, once in CSV export**

   `StaffPerformance.tsx` (lines 191-202) and `staffPerformanceExport.ts` (lines 68-76) both compute the same totals reduction independently. The totals could be included in the backend response (the data is already there) or computed once and passed down. This is minor since both are client-side, but it's unnecessary duplication.

3. **No sorting control in the UI**

   The table is sorted by `totalBallsProduced` descending (server-side, line 485). For a payment report, managers might want to sort by name alphabetically, by shifts, or by days worked. Consider adding clickable column headers for sort, or at minimum documenting that the default sort is by production volume.

4. **Month picker `<input type="month">` has limited mobile support**

   The native `<input type="month">` is not supported on Safari iOS (as of 2026). Since the app has a `MobileBottomNav`, mobile usage is expected. Consider falling back to a custom month picker or using two selects (year + month) for better cross-browser support. Other pages in the codebase (e.g., ExpenseAnalytics) may have already solved this -- worth checking for consistency.

5. **No date validation on the query args**

   The `getStaffPerformanceSummary` query accepts `startDate` and `endDate` as plain `v.string()` with no validation that they are valid `YYYY-MM-DD` format or that `startDate <= endDate`. An inverted range would return no results silently. Consider adding a simple validation check, consistent with how `strictWibDateStrToUtcMs` validates date strings elsewhere in the codebase.

6. **`staffKey` identity strategy has a merge edge case**

   The staff identification logic (line 381): `const staffKey = userId ?? name;` means that if the same person sometimes has a `chefUserId` and sometimes doesn't (e.g., records created before the Phase 21-08 cook tracking feature was added), they would appear as two separate staff entries. This is acceptable for forward-looking reports but could confuse managers reviewing historical data.

7. **Waste breakdown shown in UI but `wasteProductBreakdown` is not surfaced**

   The UI component (lines 158-170) shows `wasteByReason` but not `wasteProductBreakdown`. The CSV export includes both. For consistency, consider showing waste-per-product in the collapsible detail row, or remove `wasteProductBreakdown` from the CSV if it's not useful.

8. **`Collapsible` inside `<TableBody>` -- semantic HTML concern**

   The `StaffDetailRow` component wraps a `<TableRow>` and a `<tr>` inside a `<Collapsible>` (which renders a `<div>` by default). This creates invalid HTML (`<div>` inside `<tbody>`). While React and most browsers handle this gracefully, it can cause hydration warnings and accessibility issues. Consider using `asChild` on the `Collapsible` root to avoid the wrapper div, or restructuring to use a conditional `<tr>` without the Collapsible component.

---

## Architecture Notes

1. **Query scalability is adequate for current use case.** A kitchen with 5-10 staff producing ~5-10 shift records per day yields ~150-300 records per month. The `.collect()` + in-memory aggregation pattern is well within Convex query limits. The product name enrichment via `Promise.all` over unique product IDs (likely < 20 products) is efficient. No pagination or streaming needed at this scale.

2. **Real-time subscription considerations.** This query is registered as a Convex `query`, meaning it will re-run and push updates to all subscribed clients whenever any `kitchenShiftRecords` document in the date range changes. For a monthly report page that managers view occasionally, this is fine. If the page were left open during active kitchen production, it would receive frequent updates. This is not a problem -- Convex is designed for this -- but it's worth noting that the aggregation re-runs from scratch on each update (no incremental computation). If the page becomes a persistent dashboard, consider caching or pre-aggregating.

3. **Clean separation of concerns.** The feature correctly follows the project's layered architecture: backend query does aggregation, hook wraps auth + skip logic, page component handles presentation, and CSV export is a pure function taking the data shape. No business logic leaks into the wrong layer.

4. **Route placement is correct.** The route sits alongside other manager-level analytics pages, uses `canAccessDashboard` permission (matching SalesAnalytics, ExpenseAnalytics, and K3Mart Cockpit), and is placed in the Financial nav group in the Header -- which makes sense since it's for payment reporting.

5. **The nav placement under "Financial" is semantically reasonable** but could also justify being under a "Kitchen" or "Operations" group. The current placement signals that this page is primarily about paying staff, not monitoring kitchen operations in real-time. This aligns with the stated requirement of "monthly payment reporting."

6. **No schema changes required.** The feature is purely read-only, aggregating existing data. This is the ideal approach for a reporting feature -- no migration risk, no backward compatibility concerns.

---

## Files Reviewed

| File | Lines | Verdict |
|------|-------|---------|
| `convex/kitchenShiftRecords/queries.ts` | +181 (new query) | Good -- follows existing patterns. Missing componentWaste aggregation. |
| `src/pages/StaffPerformance.tsx` | 341 (new) | Good UI structure. Duplicated WIB helper. Minor HTML semantics issue. |
| `src/hooks/convex/useStaffPerformance.ts` | 29 (new) | Clean. Follows auth+skip pattern exactly. |
| `src/lib/staffPerformanceExport.ts` | 160 (new) | Functional. Duplicated escapeCell. toLocaleString in CSV concern. |
| `src/App.tsx` | +13 | Correct lazy loading and route setup. |
| `src/components/layout/Header.tsx` | +2 | Correct nav entry placement. |
| `src/components/layout/MobileBottomNav.tsx` | +2 | Correct mobile nav entry. |
| `src/hooks/convex/index.ts` | +7 | Correct barrel export. |
| `convex/schema.ts` | read-only | No changes needed -- confirmed `kitchenShiftRecords` schema supports all aggregated fields. |
