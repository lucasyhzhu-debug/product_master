---
phase: quick-5
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/salesAnalytics/SalesChart.tsx
autonomous: true
must_haves:
  truths:
    - "User can toggle between stacked and grouped bar chart modes"
    - "User can click legend items to hide/show individual platforms"
    - "Hidden platforms are visually faded in the legend and excluded from tooltip totals"
    - "Stacked/grouped toggle only appears for bar chart (non-monthly granularity)"
  artifacts:
    - path: "src/components/salesAnalytics/SalesChart.tsx"
      provides: "Revenue chart with stacked/grouped toggle and clickable legend"
      contains: "chartMode"
  key_links:
    - from: "chartMode state"
      to: "Bar stackId prop"
      via: "conditional stackId assignment"
      pattern: "chartMode.*stacked.*stackId"
    - from: "hiddenPlatforms state"
      to: "Bar/Area hide prop"
      via: "hide prop based on Set membership"
      pattern: "hiddenPlatforms"
---

<objective>
Add stacked/grouped bar toggle and clickable legend to SalesChart.tsx

Purpose: Let users compare platform revenue side-by-side (grouped) vs cumulative (stacked), and toggle individual platform visibility for focused analysis.
Output: Updated SalesChart.tsx with both features
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/salesAnalytics/SalesChart.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add stacked/grouped toggle and clickable legend with platform hide/show</name>
  <files>src/components/salesAnalytics/SalesChart.tsx</files>
  <action>
    Add two new state variables to the SalesChart component:
    - `chartMode: "stacked" | "grouped"` defaulting to `"stacked"`
    - `hiddenPlatforms: Set<string>` defaulting to empty Set

    **Stacked/Grouped toggle UI:**
    Add a new toggle group in the header, between the metric and granularity badge groups (inside the `isExpanded` conditional). Use the same Badge pattern. Two options: "Stacked" and "Grouped". Only render this toggle when `!useAreaChart` (area charts are always stacked). Import `Layers` and `AlignVerticalSpaceAround` from lucide-react for optional small icons inside badges (or just use text labels to match existing style).

    **Stacked/Grouped chart behavior:**
    In the BarChart section, conditionally apply `stackId="stack"` on each `<Bar>` only when `chartMode === "stacked"`. When grouped, omit `stackId` entirely. When grouped, also set `radius={[2, 2, 0, 0]}` for slightly rounded tops.

    **Clickable legend:**
    Replace both `<Legend />` instances with `<Legend onClick={handleLegendClick} />` where `handleLegendClick` is:
    ```
    const handleLegendClick = (entry: { dataKey?: string; value?: string }) => {
      const platform = entry.dataKey || entry.value;
      if (!platform) return;
      setHiddenPlatforms(prev => {
        const next = new Set(prev);
        if (next.has(platform)) next.delete(platform);
        else next.add(platform);
        return next;
      });
    };
    ```

    Use Recharts' `formatter` prop on `<Legend>` to style hidden items. Pass a custom `formatter` that wraps the platform name in a span with `opacity: 0.3` when hidden:
    ```
    const legendFormatter = (value: string) => (
      <span style={{ opacity: hiddenPlatforms.has(value) ? 0.3 : 1, cursor: "pointer" }}>
        {value}
      </span>
    );
    ```
    Apply: `<Legend onClick={handleLegendClick} formatter={legendFormatter} />`

    **Hide platforms from chart:**
    On each `<Bar>` and `<Area>`, add `hide={hiddenPlatforms.has(platform)}`. This is a native Recharts prop that removes the bar/area from rendering and tooltip.

    **Tooltip filtering:**
    Update TooltipContent to accept `hiddenPlatforms: Set<string>` prop. Filter out hidden platforms from `payload` before rendering: `const visible = payload.filter(p => !hiddenPlatforms.has(p.name));`. Compute total from visible only. Pass `hiddenPlatforms` through the Tooltip content render prop in both BarChart and AreaChart sections.
  </action>
  <verify>
    Run `npm run type-check` to confirm no TypeScript errors.
    Run `npm run build` to confirm successful build.
  </verify>
  <done>
    - Stacked/Grouped badge toggle appears in chart header when bar chart is active (non-monthly)
    - Clicking "Grouped" renders bars side-by-side; clicking "Stacked" returns to stacked layout
    - Clicking any legend entry toggles that platform's visibility; hidden entries appear faded (opacity 0.3)
    - Tooltip excludes hidden platforms from listing and total calculation
    - Area chart (monthly) is unaffected by chart mode toggle (toggle hidden), but legend click works
  </done>
</task>

</tasks>

<verification>
- `npm run type-check` passes
- `npm run build` succeeds
- SalesChart.tsx contains `chartMode` state and `hiddenPlatforms` state
- Bar components conditionally apply `stackId` based on `chartMode`
- Legend has `onClick` handler and `formatter` for visual feedback
- TooltipContent filters hidden platforms
</verification>

<success_criteria>
- TypeScript compiles without errors
- Build succeeds
- Chart supports toggling between stacked and grouped bar modes
- Legend items are clickable to hide/show individual platforms
- Hidden platforms are visually distinct in legend and excluded from tooltip
</success_criteria>

<output>
After completion, create `.planning/quick/5-revenue-chart-add-stacked-grouped-toggle/5-SUMMARY.md`
</output>
