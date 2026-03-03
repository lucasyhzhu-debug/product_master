# Staff Review: Phase 33 -- Income Statement Frontend (Triple Review)

**Date:** 2026-03-02
**Scope:** Post-implementation review of Plans 33-01, 33-02, 33-03
**Branch:** `gsd/phase-33-income-statement-frontend`
**Base:** `13badf00` | **Head:** `8125a6cf`
**Changed files:** 9 files, +1,759 lines
**Reviewers:** Senior/Principal Engineer (Architecture + Implementation Quality + Requirements)
**Prior Reviews:**
- Pre-implementation plan review: `docs/reviews/staffreview-phase-33-income-statement-frontend-2026-03-02.md`
- Design doc review: `docs/reviews/staffreview-income-statement-design-2026-03-01.md`
- Phase 32 backend review: `docs/reviews/staffreview-phase-32-income-statement-backend-2026-03-02.md`

---

## Summary

Phase 33 delivers a well-structured weekly income statement frontend at `/financials`. The implementation faithfully follows the three plans (33-01 scaffold + P&L table, 33-02 confidence indicators + data quality panel, 33-03 CSV export) and adheres to the design doc's architecture decisions. The code is clean, well-organized, and the component decomposition is reasonable -- `ConfidenceIndicator`, `DataQualityPanel`, and `csvExport` are correctly extracted into separate files as recommended in the pre-implementation review. The interface contract between the Phase 32 backend query and the frontend consumption is correct across all 20+ fields.

The implementation addressed every critical and recommended issue from the pre-implementation review: `isCurrentWeek` uses `>=` with `useMemo` (Critical Issue 1), components are extracted to separate files (Improvement 1), stale CONTEXT.md routes are noted for correction (Improvement 2), CSV includes per-channel deduction breakdown (Improvement 3), all deduction rows are always included in CSV (Improvement 4), and a "Today" button is wired to `goToCurrentWeek` (Refinement 1). The WIB sync comment references `convex/lib/periodRange.ts` as canonical (Improvement 5).

However, the implementation has a few style guide deviations, one functional concern in the collapsed section chevron direction, and the main page file sits at 951 lines -- above the 500-line target discussed in the pre-implementation review. None of these are critical, but several should be addressed before merge.

---

## Verdict

**APPROVE WITH CHANGES**

Two important items should be fixed before merge; the rest are recommended improvements.

---

## Critical Issues

None. The implementation is functionally correct and type-safe.

---

## Important Improvements

### 1. SectionHeaderRow uses `ChevronUp` when collapsed -- should be `ChevronRight`

**File:** `src/pages/FinancialStatement.tsx`, lines 272-275

```tsx
{isExpanded ? (
  <ChevronDown className="h-3.5 w-3.5" />
) : (
  <ChevronUp className="h-3.5 w-3.5" />    // <-- This is wrong
)}
```

When a section is collapsed, showing `ChevronUp` is semantically confusing -- it implies the section can be expanded *upward*. The standard UX convention (and the convention used in `ChannelRow` at line 370) is:
- **Collapsed:** `ChevronRight` (pointing right, indicating "expand to reveal content")
- **Expanded:** `ChevronDown` (pointing down, indicating "content is shown below")

The `ChannelRow` component on line 370 correctly uses `ChevronRight` for the collapsed state. The `SectionHeaderRow` should match this pattern for internal consistency.

**Fix:** Replace `ChevronUp` with `ChevronRight` in the collapsed branch of `SectionHeaderRow`. The `ChevronUp` import can then be removed from the imports.

### 2. Dark mode uses raw Tailwind `dark:` overrides instead of CSS variable tokens

**Files:** `src/pages/FinancialStatement.tsx` (3 locations), `src/components/financials/DataQualityPanel.tsx` (3 locations)

The project's CODE_STYLE.md explicitly states: *"Use CSS variable tokens, not raw Tailwind colors"* for dark mode, and provides semantic tokens like `--color-status-success`, `--color-status-warning`, etc.

Current code uses raw `dark:` overrides:
```tsx
// FinancialStatement.tsx (lines 126-127, 458-459, 921-922)
"text-green-600 dark:text-green-400"
"text-red-600 dark:text-red-400"

// DataQualityPanel.tsx (lines 48-50)
"bg-green-50 dark:bg-green-950/30"
"bg-amber-50 dark:bg-amber-950/30"
"bg-red-50 dark:bg-red-950/30"
```

These should use the semantic tokens:
- Green (success): `text-[var(--color-status-success)]` / `bg-[var(--color-status-success-bg)]`
- Red (error): `text-[var(--color-status-error)]`
- Amber (warning): `bg-[var(--color-status-warning-bg)]`

This is a style guide deviation, not a functional bug. However, it creates maintenance burden -- if the dark theme palette changes, these manual overrides won't update automatically.

**Impact:** Medium. Six locations across two files. The `DeltaIndicator` and inline gross margin delta rendering duplicate the same color pattern three times, so a helper function would reduce both the token violation count and the duplication.

---

## Minor Refinements

### 3. FinancialStatement.tsx at 951 lines exceeds the 500-line guidance

The pre-implementation review flagged this risk (Improvement 1), estimating 500-600 lines. The actual implementation landed at 951 lines -- nearly double the estimate. While `ConfidenceIndicator`, `DataQualityPanel`, and `csvExport` were correctly extracted, the main page file still contains:

- `formatWeekRange` helper (12 lines)
- `formatNegative` helper (4 lines)
- `formatWithConfidence` helper (22 lines)
- `DeltaIndicator` component (48 lines)
- `PLRow` component (89 lines)
- `SectionHeaderRow` component (45 lines)
- `ChannelRow` component (131 lines)
- `PLTableSkeleton` component (13 lines)
- `ErrorCard` component (16 lines)
- Main `FinancialStatement` component (420 lines)

The `ChannelRow` component (131 lines) and `PLRow` component (89 lines) are the most natural extraction candidates. They could move to `src/components/financials/PLRow.tsx` and `src/components/financials/ChannelRow.tsx`. This would bring the main page down to approximately 600 lines.

**Impact:** Low. Single-file works fine for now. Recommend extracting if the page grows further (e.g., monthly views, print mode).

### 4. `computeDelta` function duplicated between `useFinancials` hook (inline in `FinancialStatement.tsx`) and `csvExport.ts`

Both `FinancialStatement.tsx` (line 577) and `csvExport.ts` (line 87) define a `computeDelta` helper with identical logic:
```typescript
function computeDelta(curr: number, prev: number) {
  const amount = curr - prev;
  const percent = prev !== 0 ? ((curr - prev) / prev) * 100 : null;
  return { amount, percent };
}
```

The CSV version returns a string, but the logic is the same. This is a minor DRY violation. If the delta computation logic ever needs adjustment (e.g., handling negative base values differently), both would need updating independently.

**Impact:** Low. The functions are simple and unlikely to diverge.

### 5. CSV deduction amounts are negated, but CSV `delta_pct` is computed from raw (positive) values

**File:** `src/lib/csvExport.ts`, lines 152-202

Deduction `amount_idr` values are correctly negated (e.g., `String(-data.current.totalDiscounts)`), consistent with accounting sign convention. However, `computeDelta` is called with the *positive* values (`data.current.totalDiscounts`, `data.previous.totalDiscounts`), which means `delta_pct` shows the percentage change in deduction magnitude without the negation context.

This is actually correct behavior for a CSV consumer (delta % should show "deductions grew by 10%"), but it creates a subtle asymmetry: the `amount_idr` column shows negative values while `delta_pct` shows the unsigned magnitude change. A CSV analyst might expect delta to also be signed negatively when amounts are negative.

**Impact:** Low. Current behavior is defensible. Consider adding a CSV column header comment or a note in the footer explaining sign conventions.

### 6. `ChannelRow` inline delta computation could produce misleading results for channels that appear only in previous week

**File:** `src/pages/FinancialStatement.tsx`, lines 329-337

The channel iteration only loops over `data.current.channels`, matching previous channels via `previousChannelMap.get(channel.source)`. If a channel existed in the previous week but has zero revenue in the current week, it won't appear in `data.current.channels` at all, and the user won't see the "disappeared" channel or its delta. This is a backend design decision (channels with zero current revenue are excluded), but it means the delta column can never show a "100% decline" for a channel that dropped off entirely.

**Impact:** Low. The gap analysis panel would flag this via `missingChannels` if it's a known source. For organic channel disappearance (e.g., no TikTok orders this week), the user simply doesn't see TikTok in the current week's P&L. This matches the design doc's approach of showing only channels with activity.

### 7. `isCurrentWeek` memoization has a subtle dependency gap

**File:** `src/hooks/convex/useFinancials.ts`, line 68

```typescript
const isCurrentWeek = useMemo(() => weekStart >= getCurrentWeekStart(), [weekStart]);
```

The `useMemo` depends only on `weekStart`, but `getCurrentWeekStart()` depends on `Date.now()`. If the user keeps the tab open for a full week without interacting, `weekStart` won't change (it's in state), so `isCurrentWeek` won't recompute, and the "Next" button will remain disabled even though the user is now viewing a past week. However, this is an extreme edge case (tab open for 7+ days without any interaction), and any user interaction that triggers a re-render would cause `weekStart` to be re-evaluated since `getCurrentWeekStart()` is called inside `useMemo`.

Actually, upon closer inspection, `useMemo` with `[weekStart]` means it only recomputes when `weekStart` changes. If `weekStart` doesn't change but the real week boundary crosses (user leaves tab open Monday->Monday), `isCurrentWeek` will still be `true` (since `weekStart` was set to the previous Monday). The "Next" button would remain disabled, which is correct: the user IS viewing what was the current week when they opened the page. When they click "Today", `goToCurrentWeek` calls `getCurrentWeekStart()` fresh and updates `weekStart`, which triggers recomputation.

**Impact:** Non-issue on closer analysis. The design handles this correctly.

### 8. `WIB_OFFSET_MS` and `WEEK_MS` constants duplicated between `useFinancials.ts` and `FinancialStatement.tsx`

Both files define the same constants:
```typescript
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
```

These could be extracted to a shared constant file (e.g., `src/lib/constants.ts` or `src/lib/wibHelpers.ts`). The hook already has a sync comment referencing `convex/lib/periodRange.ts`, so having a single frontend source would reinforce that discipline.

**Impact:** Low. Simple constants unlikely to diverge.

---

## Architecture Notes

### Component Decomposition

The decomposition follows the project's established pattern:
- **Domain components** in `src/components/financials/` (ConfidenceIndicator, DataQualityPanel)
- **Utility extraction** in `src/lib/csvExport.ts`
- **Hook** in `src/hooks/convex/useFinancials.ts`
- **Page** in `src/pages/FinancialStatement.tsx`

The page file is large (951 lines) but not unmanageably so. The internal components (`PLRow`, `ChannelRow`, `SectionHeaderRow`, `DeltaIndicator`) are used only by this page and wouldn't benefit from being in separate files unless the page grows further or other pages need the same row rendering.

### Data Flow

The data flow is clean and unidirectional:
```
useFinancials() hook
  -> useQuery(api.reports.incomeStatement.getWeeklyIncomeStatement)
  -> Returns { data, isLoading, weekStart, weekLabel, isCurrentWeek, nav callbacks }

FinancialStatement page
  -> Destructures hook return
  -> Passes data to PLRow, ChannelRow, DataQualityPanel
  -> CSV export reads data + weekLabel directly

No prop drilling issues.
No context needed (single consumer page).
```

### Real-Time Subscription Load

The page subscribes to a single Convex query (`getWeeklyIncomeStatement`) with a `weekStart` parameter. Convex's reactive system will re-run this query when underlying data changes. Since the query scans `externalRevenue`, `consignmentSettlements`, `orders`, `menuProductComponents`, and `componentTypes`, any write to these tables will trigger a re-evaluation.

At SME scale (~100-500 transactions/week), this is acceptable. The query aggregates data from 5-6 tables but returns a fixed-size response regardless of transaction count. The only scaling concern would be if the component/BOM tables grow significantly, but they're currently <200 rows.

### Interface Contract

The frontend's `IncomeStatementData` type in `csvExport.ts` (lines 64-76) correctly mirrors the backend's return shape from `convex/reports/incomeStatement.ts`. The type is intentionally duplicated (not imported from Convex server code) -- this is the correct pattern since the CSV module runs on the client.

All 20+ backend fields are correctly consumed. The `products[]` field on each channel is available but intentionally not rendered (deferred to future product drill-down).

### CSS-First Responsive Strategy

The mobile comparison toggle uses a CSS-first approach (`hidden md:table-cell` with JS override), which correctly avoids hydration mismatches. This was a recommendation from the pre-implementation review (Refinement 2) and was implemented correctly.

---

## What Went Well

1. **Pre-implementation review feedback fully addressed.** Every critical and recommended item from the prior staffreview was implemented: `isCurrentWeek >= useMemo`, component extraction, CSV per-channel deductions, "Today" button, WIB sync comment, division-by-zero guard on `percentOfTotal`.

2. **Clean component extraction.** `ConfidenceIndicator` (60 lines), `DataQualityPanel` (235 lines), and `csvExport` (406 lines) are correctly extracted into standalone files. The `Confidence` type is exported from `ConfidenceIndicator.tsx` and reused across files.

3. **Accounting conventions correctly applied.** Parentheses for negative values, `invertColor` for cost delta coloring, "N/A" for null margins, "--" with warning for missing COGS, "~" prefix for inferred values, "New" for zero-base deltas.

4. **Data quality panel is well-designed.** Auto-expands when issues exist, links to correct fix pages (`/sales?tab=mappings`, `/components/production`), coverage stat with color-coded tint, marketplace shipping gap warning. The issue count correctly includes the shipping gap as a separate issue.

5. **CSV export is comprehensive.** Flat-format with all P&L line items, per-channel deduction breakdown, confidence flags, data quality footer notes, and proper CSV escaping. The `downloadCSV` helper correctly creates and revokes a blob URL.

6. **Period-agnostic column headers.** Column headers derive from the query response data, not hardcoded labels. This prepares for future monthly/quarterly views.

7. **CHANGELOG entry is thorough.** Covers all key features: P&L structure, channel breakdown, week navigation, comparison, confidence, data quality, coverage, CSV, mobile responsive, route/permission.

8. **Collapsible UI component added.** `src/components/ui/collapsible.tsx` wraps Radix `@radix-ui/react-collapsible` as a proper shadcn-style component, available for future reuse.

9. **Hook design is minimal and focused.** `useFinancials` (80 lines) exposes exactly what the page needs: data, loading state, navigation callbacks, and derived state. No over-abstraction.

10. **Backend contract fidelity.** All 20+ fields from the backend query are correctly consumed. The `IncomeStatementData` interface in `csvExport.ts` matches the backend return shape exactly.

---

## Plan Fidelity Matrix

| Plan Item | Status | Notes |
|-----------|--------|-------|
| **33-01: useFinancials hook** | IMPLEMENTED | Week navigation, `getCurrentWeekStart()`, `isCurrentWeek >= useMemo` |
| **33-01: FinancialStatement page** | IMPLEMENTED | P&L table with all sections, 951 lines |
| **33-01: Route at /financials** | IMPLEMENTED | `canAccessDashboard` permission, lazy import |
| **33-01: Nav entry** | IMPLEMENTED | "Financials" with FileText icon, after Sales |
| **33-01: Week label format** | IMPLEMENTED | "Week of Feb 24 - Mar 2, 2026" format |
| **33-01: Collapsible sections** | IMPLEMENTED | Revenue expanded, Deductions/COGS collapsed by default |
| **33-01: Channel colored dots** | IMPLEMENTED | `getPlatformPalette(source).dot` |
| **33-01: Parentheses for negatives** | IMPLEMENTED | `formatNegative()` helper |
| **33-01: Loading skeleton** | IMPLEMENTED | 8 skeleton rows |
| **33-01: Mobile comparison toggle** | IMPLEMENTED | CSS-first with JS override |
| **33-01: "Today" button** | IMPLEMENTED | Visible when `!isCurrentWeek` |
| **33-02: ConfidenceIndicator** | IMPLEMENTED | Extracted to `src/components/financials/ConfidenceIndicator.tsx` |
| **33-02: Confidence rendering** | IMPLEMENTED | exact=none, calculated=calc icon, inferred=~, missing=-- warning |
| **33-02: Channel gross margin sub-row** | IMPLEMENTED | Shows when channel expanded, with prev week comparison |
| **33-02: COGS timing tooltip** | IMPLEMENTED | On "Cost of Goods Sold" section header |
| **33-02: Consignment accrual tooltip** | IMPLEMENTED | On consignment channel row |
| **33-02: DataQualityPanel** | IMPLEMENTED | Extracted to `src/components/financials/DataQualityPanel.tsx` |
| **33-02: Unmapped products link** | IMPLEMENTED | Links to `/sales?tab=mappings` |
| **33-02: Zero-cost components link** | IMPLEMENTED | Links to `/components/production` |
| **33-02: Missing channels** | IMPLEMENTED | Descriptive text, no link |
| **33-02: Shipping gap warning** | IMPLEMENTED | Shopee/TikTok with revenue triggers warning |
| **33-02: Coverage stat** | IMPLEMENTED | X/Y format with green/amber/red tint |
| **33-02: invertColor on deduction/COGS** | IMPLEMENTED | All deduction and COGS rows use `invertColor` |
| **33-03: CSV export** | IMPLEMENTED | Extracted to `src/lib/csvExport.ts` |
| **33-03: CSV columns** | IMPLEMENTED | period, section, channel, line_item, amount_idr, confidence, prev_week_idr, delta_pct |
| **33-03: CSV filename** | IMPLEMENTED | `frollie-income-statement-YYYY-MM-DD.csv` |
| **33-03: CSV footer** | IMPLEMENTED | Data quality notes with `#` prefix |
| **33-03: CSV per-channel deductions** | IMPLEMENTED | Per-channel breakdown after aggregate rows |
| **33-03: Export button in PageHeader** | IMPLEMENTED | Download icon, disabled when loading |
| **33-03: CHANGELOG update** | IMPLEMENTED | Phase 33 entry with all features listed |
| **33-03: npm run type-check** | VERIFIED | Passes (per commit message) |
| **33-03: npm run build** | VERIFIED | Passes (per commit message) |

**Plan fidelity: 32/32 items implemented. No gaps, no scope creep.**

---

## Requirements Coverage

| Requirement | Implementation | Status |
|-------------|---------------|--------|
| **IS-07**: View weekly income statement at `/financials` | Route, page, permission guard | SATISFIED |
| **IS-08**: Navigate between weeks with WIB boundaries | `useFinancials` hook with `getCurrentWeekStart()` | SATISFIED |
| **IS-09**: Previous week comparison with deltas | PLRow + DeltaIndicator + comparison columns | SATISFIED |
| **IS-10**: Confidence indicators on financial figures | ConfidenceIndicator component + formatWithConfidence | SATISFIED |
| **IS-11**: Data quality panel with actionable guidance | DataQualityPanel with links and coverage stat | SATISFIED |
| **IS-12**: CSV export with flat-format file | csvExport.ts with downloadCSV helper | SATISFIED |

**Requirements: 6/6 satisfied.**

---

*Generated by /staffreview skill (triple review)*
*Senior/Principal Engineer Review (Post-Implementation)*
*Phase 33: Income Statement Frontend -- 9 files, +1,759 lines, 3 plans, 6 requirements*
