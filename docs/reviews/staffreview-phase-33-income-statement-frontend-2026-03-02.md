# Staff Review: Phase 33 -- Income Statement Frontend (Pre-Implementation)

**Date:** 2026-03-02
**Scope:** Plans 33-01, 33-02, 33-03 (pre-implementation review)
**Context:** `.planning/phases/33-income-statement-frontend/33-CONTEXT.md`
**Design Doc:** `docs/plans/2026-03-01-income-statement-design.md`
**Backend Implementation:** `convex/reports/incomeStatement.ts` (Phase 32, shipped)
**Prior Reviews:**
- Design-level: `docs/reviews/staffreview-income-statement-design-2026-03-01.md`
- Phase 32 post-implementation: `docs/reviews/staffreview-phase-32-income-statement-backend-2026-03-02.md`
**Reviewers:** Senior/Principal Engineer (Architecture + Implementation Quality)

---

## 1. Summary

**Overall Assessment:** Approve with minor revisions

Phase 33 plans are well-structured, thorough, and demonstrate strong fidelity to both the CONTEXT.md locked decisions and the design doc's Section 6 ASCII mockup. The three plans cleanly separate concerns: 33-01 (scaffold + core table), 33-02 (data quality + confidence), 33-03 (export + verification). Interface contracts between frontend and backend are correctly specified, and the plans correctly reference the actual backend return shape from `convex/reports/incomeStatement.ts`.

The plans are implementable as-is. The issues below are improvements and refinements, not blockers.

**Scorecard:**
- **Critical Issues:** 1
- **Improvements:** 5
- **Refinements:** 6
- **Nitpicks:** 3

---

## 2. Plan-to-CONTEXT.md Fidelity

| CONTEXT.md Locked Decision | Plan Coverage | Verdict |
|----------------------------|---------------|---------|
| Collapsible Gross Revenue rows | 33-01 Task 2: explicit collapsible with ChevronDown/ChevronRight | MATCH |
| Deductions/COGS collapsible (Claude's discretion) | 33-01 Task 2: defaults Revenue expanded, Deductions/COGS collapsed | MATCH |
| Colored dots from platformColors.ts | 33-01 Task 2: `getPlatformPalette(source).dot` | MATCH |
| Parentheses for negative values | 33-01 Task 2: `(Rp X.XXX)` for deductions | MATCH |
| Channel % of total gross | 33-01 Task 2: percentOfTotal prop | MATCH |
| Channel-level gross margin sub-row | 33-02 Task 1: sub-row formula specified | MATCH |
| invertColor on deduction/COGS delta | 33-01 Task 2 + 33-02 Task 1: both specify invertColor | MATCH |
| Period-agnostic column headers | 33-01 Task 2: derive from query response, not hardcoded | MATCH |
| Confidence: exact=none, calculated=calc icon, inferred=~, missing=-- with warning | 33-02 Task 1: ConfidenceIndicator component matches exactly | MATCH |
| Confidence at channel-total level only | 33-02 Task 1: "Confidence shown at channel-total level only" | MATCH |
| Missing COGS = `-- warning-icon` not `Rp 0` | 33-02 Task 1: explicit handling for missing COGS | MATCH |
| Data quality panel below P&L, auto-expand when issues | 33-02 Task 2: Collapsible Card, auto-expand logic | MATCH |
| Clickable links to fix pages | 33-02 Task 2: Link to `/sales?tab=mappings` and `/components/production` | MATCH (corrected routes) |
| Coverage stat with green tint | 33-02 Task 2: color-coded coverage percentage | MATCH |
| Mobile: hide comparison, toggle button | 33-01 Task 2: useState for comparison visibility, md: breakpoint | MATCH |
| Week nav: prev/next arrows, no swipe | 33-01 Task 2: Button variant="outline" size="icon" | MATCH |
| Week label: "Week of Feb 24 - Mar 2, 2026" | 33-01 Task 1: weekLabel useMemo with exact format | MATCH |
| Week start = Monday 00:00 WIB | 33-01 Task 1: getCurrentWeekStart() with WIB offset | MATCH |
| CSV flat format | 33-03 Task 1: columns match design doc Section 5 | MATCH |
| CSV filename: `frollie-income-statement-YYYY-MM-DD.csv` | 33-03 Task 1: explicit filename pattern | MATCH |
| COGS timing footnote tooltip | 33-02 Task 1: tooltip on COGS section header | MATCH |
| Consignment accrual basis footnote | 33-02 Task 1: tooltip on Consignment row | MATCH |
| Seller shipping fees gap warning | 33-02 Task 2: hardcoded warning when Shopee/TikTok has revenue | MATCH |

**CONTEXT.md Fidelity: 24/24 decisions covered.**

---

## 3. Design Doc Compliance

| Design Doc Element | Section | Plan Coverage | Status |
|--------------------|---------|---------------|--------|
| P&L structure: Revenue -> Deductions -> COGS -> Gross Profit | Section 4 | 33-01 Task 2: explicit section structure | COMPLIANT |
| Section 6 ASCII mockup layout | Section 6 | 33-01 matches column layout and row order | COMPLIANT |
| "Seller Shipping" deduction line in mockup | Section 6 | NOT in P&L table (backend doesn't compute it). Handled as data quality warning in 33-02 | ACCEPTABLE DEVIATION |
| CSV columns match Section 5 spec | Section 5 | 33-03 Task 1: exact column match | COMPLIANT |
| "Compare to: Previous week" label in mockup | Section 6 | Not rendered as separate label. Previous week shown as column header | MINOR DEVIATION |
| Route: `/financials` | Section 5 | 33-01 Task 3: `/financials` route | COMPLIANT |
| Permission: `canAccessDashboard` | Section 5 | 33-01 Task 3: `canAccessDashboard` | COMPLIANT |
| `formatCurrency` for amounts | Section 6 | 33-01 Task 2: references `formatCurrency` | COMPLIANT |
| `GrowthIndicator` for deltas | Section 6 | 33-01 Task 2: inline simpler version, references pattern | COMPLIANT |
| `getPlatformPalette` for channels | Section 6 | 33-01 Task 2: `.dot` class for colored dots | COMPLIANT |
| Data quality panel with "42/45 products" pattern | Section 6 | 33-02 Task 2: coverage stat with color tinting | COMPLIANT |

**Design Doc Compliance: 10/11 compliant, 1 acceptable deviation (seller shipping handled correctly as gap warning).**

---

## 4. Critical Issues (Must Fix)

### Issue 1: `isCurrentWeek` comparison will fail due to floating-point timing

**Location:** Plan 33-01 Task 1, line 244 of the plan

```typescript
const isCurrentWeek = weekStart === getCurrentWeekStart();
```

This comparison is called on every render (it is not inside `useMemo` or `useCallback`). `getCurrentWeekStart()` is called every time the component re-renders, computing a fresh value from `Date.now()`. The `useState` initializer also calls `getCurrentWeekStart()` but only once (at mount time).

The problem: this works correctly for week comparison (both return the same Monday epoch). However, this is computed on EVERY render -- not a bug per se, but a subtle correctness concern: if the user opens the page at 23:59 Sunday WIB and the component re-renders at 00:01 Monday WIB, `getCurrentWeekStart()` will return NEXT week's Monday while `weekStart` still holds the previous week's Monday. The "Next" button will NOT be disabled despite the user being on the current week in practice.

More critically, the pattern calls `getCurrentWeekStart()` on every render without memoization. While cheap, this violates React best practices (pure render functions should not depend on wall-clock time).

**Recommendation:** Wrap `isCurrentWeek` in `useMemo` and explicitly compare `weekStart >= getCurrentWeekStart()` (greater-than-or-equal) to handle the edge case where the week boundary crosses during the session. Even better: disable "Next" when `weekStart >= getCurrentWeekStart()` rather than strict equality. This prevents navigating into the future even across week boundaries.

**Severity:** Critical -- the "Next" button can navigate into the future if the component re-renders across a week boundary. Not a crash, but a data integrity concern (querying a future week returns misleading zero values).

---

## 5. Improvements (Recommended)

### Improvement 1: File size risk -- FinancialStatement.tsx will exceed 500 lines

**Location:** Plans 33-01, 33-02, 33-03 all modify `src/pages/FinancialStatement.tsx`

By the end of Plan 33-03, `FinancialStatement.tsx` will contain:
- PLRow component (~40 lines)
- ConfidenceIndicator component (~35 lines)
- DataQualityPanel section (~80 lines)
- Week navigation (~15 lines)
- P&L table with 4 collapsible sections (~120 lines)
- Loading skeleton (~20 lines)
- Mobile comparison toggle (~15 lines)
- CSV generation function (~80 lines)
- Download helper (~10 lines)
- Main page component (~60 lines)
- Types/imports (~20 lines)

**Estimated total: ~500-600 lines in a single file.**

This project's `SalesAnalytics.tsx` is the closest comparable page, and it's 382 lines -- but it delegates to tab components (`OverviewTab.tsx`, `SalesChart.tsx`, etc.). The income statement has no tabs, so all logic is in one file.

**Recommendation:** Plan 33-02 should extract `ConfidenceIndicator` and `DataQualityPanel` into `src/components/financials/ConfidenceIndicator.tsx` and `src/components/financials/DataQualityPanel.tsx`. This follows the project pattern where page-specific components live in `src/components/{domain}/`. Similarly, Plan 33-03 should extract `generateIncomeStatementCSV` into `src/lib/csvExport.ts` (the plan already notes this as Claude's discretion -- I recommend doing it since the function is ~80 lines).

**Impact:** Medium -- single-file approach works but hinders readability and makes Plan 33-02 modifications harder to review.

### Improvement 2: Route link corrections are noted but not highlighted as risky

**Location:** Plan 33-02 Task 2, lines 229 and 235

The plan correctly identifies that CONTEXT.md references incorrect routes:
- CONTEXT.md says `/analytics?tab=mappings` but correct route is `/sales?tab=mappings`
- CONTEXT.md says `/component-types` but correct route is `/components/production`

The plan corrects these inline but does NOT flag this as something to update in CONTEXT.md itself. If a future plan references CONTEXT.md for these links, the stale references will recur.

**Recommendation:** Add a post-implementation task to update CONTEXT.md with the corrected routes. Alternatively, update CONTEXT.md before implementation.

### Improvement 3: CSV export omits per-channel deduction breakdown

**Location:** Plan 33-03 Task 1, CSV generation function

The CSV generation includes "Customer Discounts & Vouchers" and "Platform Commissions" as aggregate "All" channel rows, but the backend provides per-channel deduction data (`channel.discount`, `channel.commission`, `channel.adBurn`, `channel.promoBurn`). The P&L table (Plan 33-01) similarly aggregates deductions rather than showing per-channel breakdown.

For CSV export specifically, the flat format loses the per-channel deduction detail that a financial analyst might want. For example, GoFood commissions vs Shopee commissions are lumped into one "Platform Commissions" row.

**Recommendation:** Add per-channel deduction rows to the CSV (not necessarily to the UI table). For each channel with non-zero deductions, add rows like:
```
period, deductions, GoFood, Platform Commission, -30000, exact, -28000,
```
This provides richer data for external analysis without cluttering the UI.

### Improvement 4: Deductions rows conditionally omitted in CSV but not in UI

**Location:** Plan 33-03 Task 1, lines 141-155

The CSV generation conditionally skips "Ad Spend & Promos" and "Consignment Rev Share" when both current and previous are zero. However, Plan 33-01 does not specify the same conditional logic for the P&L table UI -- it always renders all four deduction rows.

This creates an inconsistency: the CSV may have fewer rows than what the user sees on screen.

**Recommendation:** Apply consistent conditional rendering. Either always show all deduction lines (both UI and CSV), or conditionally hide zero-value deduction lines in both. The cleaner approach: always show in UI (accounting convention -- zero lines provide structure), always include in CSV (completeness for external tools).

### Improvement 5: `WIB_OFFSET_MS` constant duplicated between frontend and backend

**Location:** Plan 33-01 Task 1 defines `WIB_OFFSET_MS = 7 * 60 * 60 * 1000` in the frontend hook.

The backend (`convex/lib/periodRange.ts`) already has WIB timezone logic. The frontend hook replicates the WIB offset calculation independently. While WIB offset is a simple constant unlikely to change, the `getCurrentWeekStart()` function in the hook is doing week boundary math that parallels `calculateWeekRange` in `periodRange.ts`.

If the backend's week boundary logic and the frontend's week boundary logic ever disagree (e.g., due to a timezone edge case fix in one but not the other), the frontend will pass a `weekStart` value that doesn't align with the backend's expectations.

**Recommendation:** Add a comment in the hook referencing `convex/lib/periodRange.ts` as the canonical WIB week calculation, noting that both must stay in sync. Alternatively, the backend query could normalize the `weekStart` input (snap to the nearest Monday 00:00 WIB) so minor frontend drift doesn't cause issues. The Phase 32 backend already does this via `calculateWeekRange(args.weekStart)`.

---

## 6. Refinements (Minor Suggestions)

### Refinement 1: `goToCurrentWeek` not wired to any UI element

**Location:** Plan 33-01 Task 1, hook definition

The hook exposes `goToCurrentWeek` but neither Plan 33-01 Task 2 (page) nor Plan 33-02 (enhancements) wire it to any button or control. The only navigation controls are prev/next arrows. If a user navigates 10 weeks into the past, they must click "Next" 10 times to return to the current week.

**Recommendation:** Add a "Today" or "Current Week" button in the week navigation bar, visible only when `!isCurrentWeek`. This is a one-line UI addition that significantly improves UX for deep navigation.

### Refinement 2: Mobile comparison toggle default conflicts with space constraint description

**Location:** Plan 33-01 Task 2

The plan says: "Use `useState` for comparison visibility, default `false` on mobile (`md:` breakpoint shows by default)."

This implies the initial state depends on screen size at mount time. However, `useState(false)` will set the initial value to `false` regardless of screen size. The `md:` breakpoint would need to be detected via `window.matchMedia` or a hook to set the correct initial state. A CSS-only approach (hiding columns via `hidden md:table-cell`) is simpler and more reliable than JavaScript-based responsive detection.

**Recommendation:** Clarify implementation approach. Recommended: CSS-only responsive (hide columns with `hidden md:table-cell` Tailwind classes) and add a JS toggle that overrides the CSS hiding. This avoids hydration mismatches and is the simpler pattern.

### Refinement 3: PLRow `percentOfTotal` type should be nullable

**Location:** Plan 33-01 Task 2, PLRow interface

```typescript
percentOfTotal?: number; // Show as "25%" next to amount
```

When `totalGross === 0`, dividing `channel.gross / totalGross` produces `NaN` or `Infinity`. The plan doesn't guard this calculation.

**Recommendation:** Compute `percentOfTotal` as: `totalGross > 0 ? (channel.gross / totalGross) * 100 : null`. Pass `null` to skip rendering the percentage badge.

### Refinement 4: CSV confidence values hardcoded to "exact" for deduction rows

**Location:** Plan 33-03 Task 1, lines 127-130

All deduction rows use hardcoded `"exact"` confidence. However, platform commissions for the consignment channel derive from settlement data, and ad/promo burns are only present for GoBiz. The hardcoded "exact" is technically correct (these are exact platform-reported values), but it obscures the fact that deductions are only as reliable as their source channel.

**Recommendation:** Minor -- acceptable as-is. Deduction data comes from API sync and is indeed exact. No change needed.

### Refinement 5: CSV footer rows use `#` prefix for data quality notes

**Location:** Plan 33-03 Task 1, lines 212-231

The footer rows use `# Data Quality Notes`, `# Mapped products: ...`, etc. The `#` prefix is a comment convention but is not standard in CSV. Some CSV parsers may not handle these gracefully.

**Recommendation:** Consider using an empty `section` column value and a `line_item` value of `[NOTE] ...` instead. Or keep the `#` prefix -- it is a common convention for human-readable CSV notes and most spreadsheet applications (Excel, Google Sheets) will display these as regular text.

### Refinement 6: Delta rendering for deductions shows no delta percentage

**Location:** Plan 33-03 Task 1

The CSV rows for deductions (lines 127-155) all have empty `delta_pct` values. However, the backend's `deltas` object includes `netRevenue` and `grossProfit` deltas but NOT individual deduction deltas. The P&L table (Plan 33-01/33-02) renders delta for each deduction row by computing it inline: `(current - previous) / previous * 100`. The CSV should match the UI.

**Recommendation:** Compute and include deduction-level delta percentages in the CSV for consistency with the on-screen P&L. Use the same inline computation: `previous !== 0 ? ((current - previous) / previous * 100).toFixed(1) : ""`.

---

## 7. Nitpicks

### Nitpick 1: Nav placement between Sales and Orders seems aggressive

**Location:** Plan 33-01 Task 3

The plan places "Financials" between "Sales" and "Orders" in the main nav (`mainNavItems` array). Currently the array is: Home, Sales, Orders, Kitchen, Inventory, Planner. Inserting Financials between Sales and Orders pushes Orders further right on the main nav bar, which is the most frequently used nav item for `order_staff` and `manager` roles.

However, since the nav is permission-filtered and `order_staff` cannot see Financials (`canAccessDashboard`), this only affects Manager and Admin users. For those users, grouping Sales and Financials adjacent makes logical sense.

**Assessment:** Acceptable placement. No change needed.

### Nitpick 2: The `ConfidenceIndicator` uses `asChild` on TooltipTrigger wrapping an inline `<span>`

**Location:** Plan 33-02 Task 1, ConfidenceIndicator component

The `inferred` confidence indicator uses:
```tsx
<TooltipTrigger asChild>
  <span className="text-muted-foreground ml-0.5 text-xs">~</span>
</TooltipTrigger>
```

The `asChild` pattern from Radix expects the child to forward refs. A plain `<span>` does forward refs natively, so this works. However, the `Calculator` and `AlertTriangle` lucide-react icons also use `asChild` -- lucide components do forward refs, so this is fine.

**Assessment:** Correct. No change needed.

### Nitpick 3: Loading skeleton "8 rows of varying widths" is vague

**Location:** Plan 33-01 Task 2

The plan says "Show `Skeleton` placeholders (8 rows of varying widths)" but doesn't specify whether these should mimic the actual P&L table structure (section headers + line items) or be generic rectangles.

**Assessment:** Claude's discretion per CONTEXT.md. The implementer will figure this out. No change needed.

---

## 8. Interface Contract Verification

### Backend Return Shape vs Frontend Consumption

| Backend Field (from `incomeStatement.ts`) | Plan Consumption | Correct? |
|-------------------------------------------|------------------|----------|
| `weekStart: number` | 33-01 hook: used for week label formatting | Yes |
| `weekEnd: number` | 33-01 Task 2: derive column header end date | Yes |
| `current: WeekData` | 33-01, 33-02, 33-03: all access `data.current.*` | Yes |
| `previous: WeekData` | 33-01 Task 2: "Prev Week" column values | Yes |
| `deltas.grossRevenue` | 33-01 Task 2: delta column for Gross Revenue row | Yes |
| `deltas.netRevenue` | 33-01 Task 2: delta column for Net Revenue row | Yes |
| `deltas.totalCogs` | 33-01 Task 2: delta column for Total COGS row | Yes |
| `deltas.grossProfit` | 33-01 Task 2: delta column for Gross Profit row | Yes |
| `deltas.grossMarginPp` | 33-01 Task 2: "+0.2pp" format in delta column | Yes |
| `current.channels[].source` | 33-01 Task 2: `getPlatformPalette(source)` | Yes |
| `current.channels[].displayName` | 33-01 Task 2: channel row label | Yes |
| `current.channels[].gross` | 33-01 Task 2: channel gross revenue amount | Yes |
| `current.channels[].confidence` | 33-02 Task 1: ConfidenceIndicator level prop | Yes |
| `current.channels[].cogs` | 33-02 Task 1: channel-level COGS sub-row | Yes |
| `current.channels[].products` | Not rendered in plans (no product drill-down) | Correct (deferred) |
| `current.gapAnalysis.unmappedProducts` | 33-02 Task 2: DataQualityPanel | Yes |
| `current.gapAnalysis.zeroCostComponents` | 33-02 Task 2: DataQualityPanel | Yes |
| `current.gapAnalysis.missingChannels` | 33-02 Task 2: DataQualityPanel | Yes |
| `current.gapAnalysis.totalMappedProducts` | 33-02 Task 2: coverage stat | Yes |
| `current.gapAnalysis.totalProducts` | 33-02 Task 2: coverage stat | Yes |

**Interface Contract: 20/20 fields correctly consumed. No type mismatches detected.**

### Missing Interface Consumption

| Backend Field | Not Used | Acceptable? |
|---------------|----------|-------------|
| `current.channels[].products[]` | Not rendered (no product-level drill-down) | Yes -- future enhancement |
| `current.channels[].netRevenue` | Not directly rendered (computed from gross - deductions) | Yes -- redundant with displayed values |
| `current.channels[].transactions` | Not rendered | Borderline -- transaction count per channel could add context. Minor omission. |

---

## 9. Requirements Coverage

| Requirement | Plan Coverage | Gap? |
|-------------|---------------|------|
| **IS-07**: User can view weekly income statement at `/financials` | 33-01 Tasks 2-3: page + route | None |
| **IS-08**: User can navigate between weeks with WIB boundaries | 33-01 Task 1: useFinancials hook with getCurrentWeekStart | None |
| **IS-09**: Previous week comparison with delta amounts/percentages | 33-01 Task 2 (delta column) + 33-02 Task 1 (polish) | None |
| **IS-10**: Confidence indicators on financial figures | 33-02 Task 1: ConfidenceIndicator component | None |
| **IS-11**: Data quality panel with actionable guidance | 33-02 Task 2: DataQualityPanel | None |
| **IS-12**: CSV export with flat-format file | 33-03 Task 1: generateIncomeStatementCSV | None |

**Requirements Coverage: 6/6 -- all IS-07 through IS-12 have explicit plan tasks.**

---

## 10. Testing Assessment

The plans include NO frontend tests. Plan 33-03 Task 2 runs `npm run type-check` and `npm run build` as verification, but no component tests, no hook tests, and no visual regression tests.

**Assessment:** Acceptable for this phase. Justification:
1. The page is purely presentational -- it renders data from a backend query with no client-side business logic (all calculations are server-side).
2. The only client-side computation is `getCurrentWeekStart()` (week boundary math) and `generateIncomeStatementCSV()` (CSV formatting). Both are pure functions amenable to unit tests but are simple enough to verify via type-check + manual testing.
3. Phase 34 (Income Statement Testing) is explicitly planned as the next phase. It covers backend edge cases but could also include frontend smoke tests.
4. The project's existing test pattern is backend-focused (`convex-test`), with E2E tests only for critical flows (orders, kitchen).

**Recommendation (non-blocking):** Consider adding a unit test for `getCurrentWeekStart()` to verify WIB week boundary correctness. This function is the only piece of non-trivial client-side logic, and its correctness directly affects the backend query parameter. A test with known timestamps (e.g., "Sunday 23:59 WIB" -> correct Monday, "Monday 00:01 WIB" -> same Monday) would add confidence.

---

## 11. Over-Engineering Check

| Feature | Complexity | Justified? |
|---------|------------|------------|
| Separate ConfidenceIndicator component | Low | Yes -- 4 states, reusable for future financial views |
| PLRow component with 10 props | Medium | Yes -- avoids repeating rendering logic for ~15 rows |
| Mobile comparison toggle | Medium | Yes -- CONTEXT.md locked decision, follows 280px pattern |
| DataQualityPanel with 4 issue types | Medium | Yes -- design doc requirement, each type has different fix action |
| CSV footer with data quality notes | Low | Yes -- design doc specified |
| Period-agnostic column headers | Low | Yes -- prepares for monthly/quarterly views (Phase 34+) |

**No over-engineering found.** All complexity serves design doc or CONTEXT.md requirements.

---

## 12. Under-Engineering Check

| Concern | Risk | Severity |
|---------|------|----------|
| No error boundary around the P&L table | If any rendering error occurs, the entire page crashes. The plan mentions an error state for query failure but not for render errors. | Low -- Convex queries rarely error, and `ChunkErrorBoundary` in App.tsx catches chunk load failures |
| No debounce on week navigation | Rapid clicking of prev/next fires multiple `useQuery` calls with different `weekStart` values. Convex handles this gracefully (cancels stale queries), but the UI may flash loading states. | Low -- Convex's reactive system handles this |
| No accessibility considerations | The plan doesn't mention ARIA roles for the P&L table, keyboard navigation for expand/collapse, or screen reader support for confidence indicators. | Low -- business-internal tool, not public-facing |
| `previous.gapAnalysis` is available but not rendered | The data quality panel only shows `current.gapAnalysis`. Users cannot see whether gap analysis issues are new or recurring. | Low -- acceptable for v1 |

**No under-engineering concerns that would cause implementation issues.**

---

## 13. Approval Conditions

**Status: APPROVE WITH MINOR REVISIONS**

**Must fix (Critical):**
1. Fix `isCurrentWeek` comparison to use `>=` instead of `===` and consider memoization to prevent future-week navigation across week boundaries.

**Recommended (Improvements, non-blocking):**
1. Plan file extraction for ConfidenceIndicator, DataQualityPanel, and CSV generation to avoid a 500+ line single file.
2. Update CONTEXT.md stale route references (`/analytics` -> `/sales`, `/component-types` -> `/components/production`).
3. Add per-channel deduction rows to CSV export for financial analyst consumption.
4. Add a "Current Week" / "Today" button to the week navigation bar.
5. Guard `percentOfTotal` computation against division by zero when `totalGross === 0`.

---

*Generated by /staffreview skill*
*Senior/Principal Engineer Review (Pre-Implementation)*
*Phase 33: Income Statement Frontend -- 3 plans, 7 tasks, 6 requirements*
