---
phase: quick-31
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/salesAnalytics/OverviewTab.tsx
  - src/components/salesAnalytics/overviewUtils.ts
  - tests/e2e/sales-analytics-overview.spec.ts
  - tests/e2e/sales-analytics-period.spec.ts
autonomous: true
requirements: [QT-31]
must_haves:
  truths:
    - "Sales Analytics Overview page loads without the Sales Details card"
    - "No dead imports or unused state remain in OverviewTab.tsx"
    - "All 7 deleted component files are gone from disk"
    - "E2E tests no longer reference Sales Details or revenue table"
    - "npm run build passes cleanly"
  artifacts:
    - path: "src/components/salesAnalytics/OverviewTab.tsx"
      provides: "Cleaned OverviewTab without RevenueTable card"
    - path: "src/components/salesAnalytics/overviewUtils.ts"
      provides: "Cleaned utils without RevenueRecord, ConfidenceLevel, MatchConfidence, SOURCE_DISPLAY_NAMES"
  key_links:
    - from: "src/components/salesAnalytics/OverviewTab.tsx"
      to: "HeroCards, ChannelSummary, SalesChart, PlatformHierarchy"
      via: "remaining component imports"
      pattern: "import.*from.*\\./"
---

<objective>
Remove the "Sales Details" card (RevenueTable) from the Sales Analytics OverviewTab, delete all 7 orphaned component files that only served that table, clean up dead imports/state in OverviewTab.tsx, remove dead types from overviewUtils.ts, and update E2E tests that reference the removed section.

Purpose: The detailed transactions table adds clutter to the overview page without providing value -- the chart, hero cards, channel summary, and platform hierarchy already cover the analytics needs. Removing it simplifies the page and eliminates a Convex query (useExternalRevenue) that fetches potentially thousands of individual revenue records.

Output: Leaner OverviewTab.tsx (~160 LOC, down from 283), 7 deleted files, updated E2E tests.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/salesAnalytics/OverviewTab.tsx
@src/components/salesAnalytics/overviewUtils.ts
@src/components/salesAnalytics/index.ts
@tests/e2e/sales-analytics-overview.spec.ts
@tests/e2e/sales-analytics-period.spec.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Delete orphaned components and clean OverviewTab + overviewUtils</name>
  <files>
    src/components/salesAnalytics/OverviewTab.tsx,
    src/components/salesAnalytics/overviewUtils.ts,
    src/components/salesAnalytics/RevenueTable.tsx (DELETE),
    src/components/salesAnalytics/RevenueItemDetails.tsx (DELETE),
    src/components/salesAnalytics/InternalOrderDetails.tsx (DELETE),
    src/components/salesAnalytics/StoreGroupHeader.tsx (DELETE),
    src/components/salesAnalytics/PlatformBadge.tsx (DELETE),
    src/components/salesAnalytics/ConfidenceBadge.tsx (DELETE),
    src/components/salesAnalytics/MatchStatusBadge.tsx (DELETE)
  </files>
  <action>
**Delete 7 files** (only consumed by RevenueTable or each other, confirmed zero external imports):
- `src/components/salesAnalytics/RevenueTable.tsx`
- `src/components/salesAnalytics/RevenueItemDetails.tsx`
- `src/components/salesAnalytics/InternalOrderDetails.tsx`
- `src/components/salesAnalytics/StoreGroupHeader.tsx`
- `src/components/salesAnalytics/PlatformBadge.tsx`
- `src/components/salesAnalytics/ConfidenceBadge.tsx`
- `src/components/salesAnalytics/MatchStatusBadge.tsx`

**Edit `src/components/salesAnalytics/OverviewTab.tsx`:**

1. Remove these imports (no longer needed):
   - Line 6: `Input` from `@/components/ui/input`
   - Lines 8-9: `ShoppingCart`, `ArrowRight` from lucide-react (keep `RefreshCw`, `AlertTriangle`)
   - Line 14: `utcToWibDateStr` from `@/lib/dateUtils`
   - Line 16: `useNavigate` from react-router-dom (keep `useSearchParams`)
   - Line 19: `useExternalRevenue` from `@/hooks/convex`
   - Line 32: `RevenueTable` from `./RevenueTable`

2. Remove `useNavigate` call (line 41): `const navigate = useNavigate();`

3. Remove `dateFrom`/`dateTo` state (lines 38-39): `const [dateFrom, setDateFrom] = useState(""); const [dateTo, setDateTo] = useState("");`

4. Remove `revenuePeriodBounds` useMemo (lines 68-81) -- entirely for useExternalRevenue.

5. Remove `useExternalRevenue` call (lines 83-88): the `revenueRecords` / `loadingRevenue` destructure.

6. Remove the `useEffect` that syncs date range (lines 91-96) -- only used to feed dateFrom/dateTo into the Sales Details date filters.

7. In the `useState` import (line 1), `useEffect` and `useMemo` are no longer needed. Keep only `useState` (for `refreshing` state).
   - `useMemo` -- no longer used after removing `revenuePeriodBounds`. Remove it.
   - `useEffect` -- no longer used after removing the date sync effect. Remove it.
   - Keep `useState` for `refreshing`.

8. Remove the entire Revenue Table card (lines 220-280): the `<Card>` containing "Sales Details", date inputs, loading skeleton, empty state, and `<RevenueTable>`.

**Edit `src/components/salesAnalytics/overviewUtils.ts`:**

1. Remove `ConfidenceLevel` type (line 6) -- only used by deleted ConfidenceBadge and deleted RevenueRecord.
2. Remove `MatchConfidence` type (line 7) -- only used by deleted MatchStatusBadge.
3. Remove `SOURCE_DISPLAY_NAMES` constant (lines 23-32) -- only used by deleted PlatformBadge.
4. Remove `RevenueRecord` type (lines 34-48) -- only used by deleted RevenueTable and StoreGroupHeader.

Keep: `PERIOD_PRESETS`, `DEFAULT_PERIOD`, `PERIOD_STORAGE_KEY`, `PeriodData` (all still used by OverviewTab and its remaining sub-components).
  </action>
  <verify>
    <automated>cd "D:/Claude/Product Manager/product_master" && npm run build</automated>
  </verify>
  <done>
    - 7 component files deleted from salesAnalytics/
    - OverviewTab.tsx has zero references to RevenueTable, dateFrom/dateTo, useExternalRevenue, useNavigate, Input, ShoppingCart, ArrowRight
    - overviewUtils.ts has zero references to RevenueRecord, ConfidenceLevel, MatchConfidence, SOURCE_DISPLAY_NAMES
    - `npm run build` passes with no errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Update E2E tests to remove Sales Details references</name>
  <files>
    tests/e2e/sales-analytics-overview.spec.ts,
    tests/e2e/sales-analytics-period.spec.ts
  </files>
  <action>
**Edit `tests/e2e/sales-analytics-overview.spec.ts`:**

1. **Test file header** (line 17): Remove `Revenue table filterable by platform` and `Confidence indicators (is this data exact or estimated?)` from the user story comment — these features are deleted.

2. **Test "US-7"** (lines 101-156): This test is entirely about the revenue table ("Revenue table shows data with clear platform attribution"). Replace the test body with a simple assertion that the overview page loads and shows the chart and channel summary:
   ```typescript
   test("US-7: Overview shows chart and channel analytics (revenue table removed)", async ({ page }) => {
     await navigateTo(page, "/sales");
     await waitForDataLoad(page);

     // Revenue table was intentionally removed -- verify overview still loads with key sections
     const chartSection = page.locator('[class*="recharts"]').first();
     const chartVisible = await chartSection.isVisible().catch(() => false);
     console.log(`Chart section visible: ${chartVisible}`);

     await screenshot(page, "13-overview-no-revenue-table");
     expect(chartVisible).toBe(true);
   });
   ```

3. **Test "US-8"** (lines 158-176): Remove the "Sales Details" visibility check (lines 170-173). Keep the chart legend check. Remove the `salesDetails` / `detailsVisible` variables and console.log.

4. **Test "US-10"** (lines 203-251): Remove the "Revenue Details" check block (lines 227-239) that locates `text=Revenue Details` and checks boundingBox. Keep the page height measurement, tab navigation check, and screenshot.

5. **Test "US-11"** (lines 253-279): DELETE this test entirely — it's exclusively about confidence badges in the revenue table (`table >> text="Exact"`, etc.). With the table gone, this test would always pass via `expect(true).toBe(true)` anti-pattern.

**Edit `tests/e2e/sales-analytics-period.spec.ts`:**

1. Lines 122-147: Remove the entire block that checks for "Sales Details" section visibility, table column headers, and empty states. Keep the `screenshot` call above it (line 120) and the final `expect` assertion below.

2. Update the final assertion to remove `detailsVisible` from the condition:
   - Was: `expect(breakdownVisible || detailsVisible || hasEmptyState || hasNoRecords).toBe(true);`
   - Change to: `expect(breakdownVisible).toBe(true);`
   - Since `hasEmptyState` and `hasNoRecords` also referenced the deleted revenue table, remove those variables entirely.
  </action>
  <verify>
    <automated>cd "D:/Claude/Product Manager/product_master" && npx tsc --noEmit --project tsconfig.json 2>&1 | head -20 && echo "--- Checking for stale references ---" && (grep -rn "Sales Details\|Revenue Details\|revenue-table\|RevenueTable\|ConfidenceBadge\|MatchStatusBadge" tests/e2e/ && echo "FAIL: stale references found" && exit 1 || echo "OK: no stale references")</automated>
  </verify>
  <done>
    - No E2E test references "Sales Details", "Revenue Details", "revenue-table", RevenueTable, ConfidenceBadge, or MatchStatusBadge
    - US-7 test now verifies chart presence instead of deleted table
    - US-8 test no longer checks for Sales Details visibility
    - US-10 no longer checks "Revenue Details" bounding box
    - US-11 deleted entirely (was testing confidence badges in deleted table)
    - Test file header comment updated (no more "Revenue table filterable by platform")
    - sales-analytics-period.spec.ts no longer checks revenue table columns
    - All test files pass TypeScript compilation
  </done>
</task>

</tasks>

<verification>
1. `npm run build` passes (no dead imports, no missing modules)
2. `grep -rn "RevenueTable\|Sales Details\|RevenueItemDetails\|InternalOrderDetails\|StoreGroupHeader\|PlatformBadge\|ConfidenceBadge\|MatchStatusBadge" src/ tests/` returns zero matches
3. `ls src/components/salesAnalytics/RevenueTable.tsx` returns "No such file"
4. `grep -n "useExternalRevenue\|dateFrom\|dateTo\|useNavigate\|ShoppingCart\|ArrowRight" src/components/salesAnalytics/OverviewTab.tsx` returns zero matches
</verification>

<success_criteria>
- `npm run build` passes cleanly
- 7 component files deleted (RevenueTable, RevenueItemDetails, InternalOrderDetails, StoreGroupHeader, PlatformBadge, ConfidenceBadge, MatchStatusBadge)
- OverviewTab.tsx reduced from 283 LOC to ~160 LOC
- Zero dead imports or unused state in OverviewTab.tsx
- E2E tests updated: no references to deleted Sales Details card
- overviewUtils.ts cleaned of 4 dead exports (RevenueRecord, ConfidenceLevel, MatchConfidence, SOURCE_DISPLAY_NAMES)
</success_criteria>

<output>
After completion, create `.planning/quick/31-remove-detailed-transactions-table-from-/31-SUMMARY.md`
</output>
