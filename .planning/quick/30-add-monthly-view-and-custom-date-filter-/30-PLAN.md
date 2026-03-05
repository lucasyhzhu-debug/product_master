---
phase: 30-add-monthly-view-and-custom-date-filter
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - convex/reports/incomeStatement.ts
  - convex/lib/periodRange.ts
  - src/hooks/convex/useFinancials.ts
  - src/pages/FinancialStatement.tsx
  - src/lib/financialHelpers.tsx
  - src/lib/csvExport.ts
autonomous: true
requirements: [QUICK-30]

must_haves:
  truths:
    - "User can switch between Week, Month, and Custom period modes on the Income Statement page"
    - "Monthly view shows full calendar month with previous month comparison"
    - "Custom view shows date range picker with two native date inputs and previous-period comparison of equal length"
    - "Week view preserves current behavior exactly (Monday-Sunday WIB)"
    - "Column headers update to reflect the selected period range"
    - "CSV export works with any period mode and labels the period appropriately"
    - "User can debug unmapped product 'Dubai Chewy Cookie - Regular Pack Of 3' by navigating to /sales?tab=mappings and checking the GoFood tab"
  artifacts:
    - path: "convex/reports/incomeStatement.ts"
      provides: "New getIncomeStatement query accepting periodStart + periodEnd"
      exports: ["getIncomeStatement"]
    - path: "convex/lib/periodRange.ts"
      provides: "New calculateMonthRange helper"
      exports: ["calculateMonthRange"]
    - path: "src/hooks/convex/useFinancials.ts"
      provides: "Generalized hook with periodMode state (week/month/custom)"
      exports: ["useFinancials"]
    - path: "src/pages/FinancialStatement.tsx"
      provides: "Period mode selector UI, month navigator, custom date inputs"
    - path: "src/lib/financialHelpers.tsx"
      provides: "formatPeriodRange helper for any date range"
      exports: ["formatPeriodRange"]
    - path: "src/lib/csvExport.ts"
      provides: "Updated IncomeStatementData type with periodStart/periodEnd instead of weekStart/weekEnd"
  key_links:
    - from: "src/hooks/convex/useFinancials.ts"
      to: "convex/reports/incomeStatement.ts"
      via: "useQuery(api.reports.incomeStatement.getIncomeStatement, { periodStart, periodEnd })"
      pattern: "api\\.reports\\.incomeStatement\\.getIncomeStatement"
    - from: "src/pages/FinancialStatement.tsx"
      to: "src/hooks/convex/useFinancials.ts"
      via: "useFinancials() hook returns periodMode, periodLabel, navigation functions"
      pattern: "useFinancials"
    - from: "convex/reports/incomeStatement.ts"
      to: "convex/lib/periodRange.ts"
      via: "calculateMonthRange for month mode comparison"
      pattern: "calculateMonthRange"
---

<objective>
Add monthly view and custom date range filter to the Income Statement page, and provide debugging guidance for the unmapped "Dubai Chewy Cookie" product.

Purpose: Currently the income statement only supports weekly view. Business needs monthly P&L for accounting periods and custom date ranges for ad-hoc analysis. The unmapped product debug is a data issue (missing product mapping in /sales?tab=mappings), not a code bug.

Output: Generalized income statement query, period mode selector UI (Week/Month/Custom), month navigation, custom date range picker using native date inputs, and a documentation note about the unmapped product fix.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@convex/reports/incomeStatement.ts
@src/pages/FinancialStatement.tsx
@src/hooks/convex/useFinancials.ts
@src/lib/financialHelpers.tsx
@src/lib/csvExport.ts
@convex/lib/periodRange.ts

<interfaces>
<!-- Key types and contracts the executor needs -->

From convex/reports/incomeStatement.ts:
```typescript
// aggregateWeek() is already period-agnostic — it processes any revenue[] + consignments[] + itemsMap
// The new query just needs to provide the right date-range-filtered data to aggregateWeek()
function aggregateWeek(
  revenue: Doc<"externalRevenue">[],
  consignments: Doc<"consignmentSettlements">[],
  itemsMap: Map<string, Doc<"externalRevenueItems">[]>,
  cogsMap: Map<string, { production: number; packaging: number; total: number }>,
  orderDataMap: Map<string, { totalAmount: number; finalTotal: number; deliveryFee: number }>,
  allComponentTypes: Doc<"componentTypes">[]
): WeekData
```

From convex/lib/periodRange.ts:
```typescript
export function calculateWeekRange(weekStartMs: number): {
  currentStart: number; currentEnd: number; previousStart: number; previousEnd: number;
}
// WIB helpers available: getWibComponents(utcMs), wibMidnightToUtc(year, month, day)
```

From src/hooks/convex/useFinancials.ts:
```typescript
export function useFinancials(): {
  data, isLoading, weekStart, weekLabel, isCurrentWeek,
  goToPreviousWeek, goToNextWeek, goToCurrentWeek
}
```

From src/lib/csvExport.ts:
```typescript
export interface IncomeStatementData {
  weekStart: number; weekEnd: number;
  current: WeekData; previous: WeekData;
  deltas: { grossRevenue, netRevenue, totalCogs, grossProfit, grossMarginPp };
}
export function generateIncomeStatementCSV(data: IncomeStatementData, weekLabel: string): string;
```

From src/components/ui/select.tsx:
```typescript
// Available: Select, SelectTrigger, SelectValue, SelectContent, SelectItem
```
</interfaces>
</context>

## Git Workflow
**Branch:** `feature/income-statement-period-modes`
**Checkpoints:** None (fully autonomous)

## Implementation Waves
### Wave 1: Backend + Frontend [SEQUENTIAL — backend first, then frontend]
| Task | Files |
|------|-------|
| Task 1: Generalized backend query | `convex/reports/incomeStatement.ts`, `convex/lib/periodRange.ts` |
| Task 2: Frontend period mode UI + hook | `src/hooks/convex/useFinancials.ts`, `src/pages/FinancialStatement.tsx`, `src/lib/financialHelpers.tsx`, `src/lib/csvExport.ts` |

### Wave 2: Verification [SEQUENTIAL]
| Task |
|------|
| `npm run type-check` passes |
| `npm run build` succeeds |

## Documentation Updates
- [ ] CHANGELOG.md (new feature: monthly view + custom date filter)

## Success Criteria
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] Week mode behaves identically to current behavior
- [ ] Month mode shows full month with prev month comparison
- [ ] Custom mode accepts two dates and shows comparison of equal length prior period

<tasks>

<task type="auto">
  <name>Task 1: Create generalized getIncomeStatement backend query</name>
  <files>convex/reports/incomeStatement.ts, convex/lib/periodRange.ts</files>
  <action>
**In `convex/lib/periodRange.ts`:**
1. Add `calculateMonthRange(year: number, month: number)` function that returns `{ currentStart, currentEnd, previousStart, previousEnd }` in UTC epoch ms with WIB boundaries. `currentStart` = 1st of month 00:00 WIB, `currentEnd` = 1st of next month 00:00 WIB (exclusive), `previousStart` = 1st of prev month 00:00 WIB, `previousEnd` = currentStart. Use existing `wibMidnightToUtc()` helper (note: it's not currently exported — export it, or inline the logic).
2. Add `calculateCustomRange(periodStart: number, periodEnd: number)` that returns the same shape. `currentStart` = periodStart, `currentEnd` = periodEnd, `previousStart` = periodStart - (periodEnd - periodStart), `previousEnd` = periodStart. This gives an equal-length comparison window immediately before the selected range.

**In `convex/reports/incomeStatement.ts`:**
1. Create a NEW export `getIncomeStatement` query (keep `getWeeklyIncomeStatement` for backward compat). Args: `{ periodStart: v.number(), periodEnd: v.number() }` — both are epoch ms UTC.
2. The handler computes `previousStart = periodStart - (periodEnd - periodStart)` and `previousEnd = periodStart` (equal-length comparison window).
3. Copy the data-fetching logic from `getWeeklyIncomeStatement` but replace `range.currentStart/currentEnd/previousStart/previousEnd` with the new computed values. The aggregation and COGS logic is identical — reuse `aggregateWeek()` as-is.
4. Return shape: `{ periodStart, periodEnd, current: WeekData, previous: WeekData, deltas }` — same as weekly but with `periodStart`/`periodEnd` instead of `weekStart`/`weekEnd`.
5. Factor out the shared data-fetching + aggregation logic into a private async helper `fetchAndAggregate(ctx, currentStart, currentEnd, previousStart, previousEnd)` to avoid duplicating the ~80 lines of fetch + COGS map + aggregateWeek between the two queries. Both `getWeeklyIncomeStatement` and `getIncomeStatement` should call this helper.

**IMPORTANT:** Do NOT rename `aggregateWeek` — it's a pure function that works for any period. The name is a legacy artifact but renaming would be unnecessary churn.
  </action>
  <verify>
    <automated>cd "D:/Claude/Product Manager/product_master" && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>New `getIncomeStatement` query exported and callable with arbitrary periodStart/periodEnd. `getWeeklyIncomeStatement` still works (backward compat). `calculateMonthRange` and `calculateCustomRange` exported from periodRange.ts. No type errors.</done>
</task>

<task type="auto">
  <name>Task 2: Add period mode selector and generalize frontend hook</name>
  <files>src/hooks/convex/useFinancials.ts, src/pages/FinancialStatement.tsx, src/lib/financialHelpers.tsx, src/lib/csvExport.ts</files>
  <action>
**In `src/lib/financialHelpers.tsx`:**
1. Add `PeriodMode` type: `"week" | "month" | "custom"`.
2. Add `formatPeriodRange(startUtcMs: number, endUtcMs: number): string` — format as "Mar 1 - Mar 31" or "Feb 24 - Mar 2" using WIB dates. Reuse `WIB_OFFSET_MS`. This replaces `formatWeekRange` for column headers in non-week modes.
3. Add `formatMonthLabel(year: number, month: number): string` — returns "March 2026" style label for month navigator.
4. Export `MONTH_NAMES` array for month display.

**In `src/hooks/convex/useFinancials.ts`:**
1. Add `periodMode` state (default `"week"`).
2. For week mode: keep existing `weekStart` logic, call `getWeeklyIncomeStatement` (backward compat, avoids breaking existing query reactivity).
3. For month mode: track `monthYear` and `monthIndex` state (0-indexed). Compute `periodStart` = 1st of month 00:00 WIB in UTC, `periodEnd` = 1st of next month 00:00 WIB in UTC. Use `date-fns` or manual WIB math (prefer manual to match existing pattern). Call `getIncomeStatement({ periodStart, periodEnd })`.
4. For custom mode: track `customStart` and `customEnd` state (UTC epoch ms). Call `getIncomeStatement({ periodStart: customStart, periodEnd: customEnd })`. Default to current month range.
5. Navigation: `goToPreviousMonth`, `goToNextMonth`, `goToCurrentMonth` for month mode. No navigation for custom mode (user picks dates).
6. Return: `{ data, isLoading, periodMode, setPeriodMode, periodLabel, isCurrentPeriod, ...navigation functions, customStart, customEnd, setCustomStart, setCustomEnd, monthYear, monthIndex }`.
7. `periodLabel` changes by mode: week = "Week of Feb 24 - Mar 2, 2026", month = "March 2026", custom = "Feb 15 - Mar 10, 2026".
8. Use `useQuery` with `"skip"` pattern: only one of the two queries fires based on periodMode. Example: `useQuery(api.reports.incomeStatement.getWeeklyIncomeStatement, periodMode === "week" ? { weekStart } : "skip")` and `useQuery(api.reports.incomeStatement.getIncomeStatement, periodMode !== "week" ? { periodStart, periodEnd } : "skip")`.
9. Merge the two query results into a single `data` value so the page component doesn't care which query ran.

**In `src/pages/FinancialStatement.tsx`:**
1. Replace the week navigation bar with a period mode selector + navigator section:
   - A `Select` dropdown (from `@/components/ui/select`) with options: "Weekly", "Monthly", "Custom Range". Small, inline with the navigation arrows. Place it LEFT of the navigation arrows.
   - Week mode: ChevronLeft/Right + week label + "Today" button (current behavior, unchanged).
   - Month mode: ChevronLeft/Right + month label (e.g., "March 2026") + "This Month" button.
   - Custom mode: Two native `<input type="date">` fields (start and end) styled with Tailwind to match the app aesthetic. No ChevronLeft/Right. Add a note "(vs prior equal period)" below the inputs to explain the comparison logic.
2. Update `columnHeaders` derivation: for month mode use `formatPeriodRange(periodStart, periodEnd)` for current and format previous month. For custom mode, similarly format the custom range and its comparison range.
3. Update `PageHeader` description: show "Weekly profit and loss" / "Monthly profit and loss" / "Custom period profit and loss" based on mode.
4. CSV export: update the `weekLabel` param to use `periodLabel` from the hook. The CSV already accepts a string label — just pass the right one.
5. CSV filename: use `frollie-income-statement-{mode}-{dateStr}.csv` pattern.

**In `src/lib/csvExport.ts`:**
1. Update `IncomeStatementData` interface: make `weekStart`/`weekEnd` optional, add `periodStart?: number` and `periodEnd?: number`. The `generateIncomeStatementCSV` function already uses `weekLabel` (a string) for the period column, so the actual epoch values don't matter for CSV content. The type change is just for correctness if callers inspect the data shape.
2. Rename the CSV header column from `prev_week_idr` to `prev_period_idr` for accuracy in non-week modes.

**Unmapped product debug (documentation only — no code change):**
The "Dubai Chewy Cookie - Regular Pack Of 3" unmapped product is a DATA issue, not a code bug. The product exists in `externalRevenueItems` (from GoFood/GoBiz sync) but has no `linkedMenuProductId` because no mapping exists in `externalProductMappings` for that product name + source. The fix: navigate to `/sales?tab=mappings`, find the "GoFood" or "GoBiz" tab, locate "Dubai Chewy Cookie - Regular Pack Of 3" in the unmapped list, and map it to the correct menu product. The `updateProductMapping` mutation will retroactively patch all matching `externalRevenueItems`. Add a comment in the SUMMARY noting this for the user.
  </action>
  <verify>
    <automated>cd "D:/Claude/Product Manager/product_master" && npm run build 2>&1 | tail -10</automated>
  </verify>
  <done>
- Period mode selector (Week/Month/Custom) visible on Income Statement page
- Week mode: identical to previous behavior
- Month mode: navigable by month, shows "March 2026" style label, full month range
- Custom mode: two date inputs, comparison against equal-length prior period
- Column headers reflect selected period
- CSV export works for all modes with appropriate label
- `npm run build` passes
- Unmapped product debug documented in SUMMARY
  </done>
</task>

</tasks>

<verification>
1. `npm run type-check` passes with zero errors
2. `npm run build` succeeds
3. Manual spot-check: switching between Week/Month/Custom modes loads data and updates the table
4. Week mode behavior is unchanged from before
</verification>

<success_criteria>
- Income Statement page has a period mode selector with Week, Month, and Custom options
- Monthly view shows full calendar month data with previous month comparison
- Custom view accepts arbitrary date range and compares against equal-length prior window
- All existing weekly functionality preserved
- CSV export produces correct output for all period modes
- `npm run build` passes
</success_criteria>

<output>
After completion, create `.planning/quick/30-add-monthly-view-and-custom-date-filter-/30-SUMMARY.md`

Include in SUMMARY a note for the user:
> **Unmapped Product Fix:** "Dubai Chewy Cookie - Regular Pack Of 3" is a data mapping issue, not a code bug. Navigate to `/sales?tab=mappings`, select the GoFood/GoBiz tab, find the product in the unmapped list, and map it to the correct menu product. The mapping mutation will retroactively update all historical revenue items.
</output>
