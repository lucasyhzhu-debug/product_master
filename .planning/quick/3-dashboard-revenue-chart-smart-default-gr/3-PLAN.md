---
phase: quick-3
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - convex/externalData/queries.ts
  - src/components/salesAnalytics/SalesChart.tsx
  - src/hooks/convex/useExternalData.ts
autonomous: true

must_haves:
  truths:
    - "Selecting past24hours/today/yesterday shows hourly data points (e.g. 10am, 2pm)"
    - "Selecting thisWeek/last7days shows daily data points (unchanged)"
    - "Selecting last30days/thisMonth shows weekly data points (unchanged)"
    - "Selecting allTime shows weekly data points (was monthly)"
    - "Hourly option appears in granularity selector badge row"
    - "Build passes with no type errors"
  artifacts:
    - path: "convex/externalData/queries.ts"
      provides: "Hourly bucket key and format label in getRevenueTimeSeries"
      contains: "hourly"
    - path: "src/components/salesAnalytics/SalesChart.tsx"
      provides: "Hourly granularity type, updated defaults, hourly option in selector"
      contains: "hourly"
    - path: "src/hooks/convex/useExternalData.ts"
      provides: "Hourly in granularity union type"
      contains: "hourly"
  key_links:
    - from: "src/components/salesAnalytics/SalesChart.tsx"
      to: "src/hooks/convex/useExternalData.ts"
      via: "Granularity type passed to hook"
      pattern: "useConvexRevenueTimeSeries.*granularity"
    - from: "src/hooks/convex/useExternalData.ts"
      to: "convex/externalData/queries.ts"
      via: "Convex query arg validation"
      pattern: "getRevenueTimeSeries"
---

<objective>
Add hourly granularity to the revenue time-series chart and set smart default granularity per preset range.

Purpose: Day-level views (past24hours, today, yesterday) currently show daily bars which is a single bar -- useless. Hourly granularity shows intra-day revenue trends. AllTime switched from monthly to weekly for better detail.

Output: Three files updated, hourly granularity working end-to-end.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@convex/externalData/queries.ts (lines 1330-1450 -- time-series query)
@src/components/salesAnalytics/SalesChart.tsx (lines 1-160 -- chart component)
@src/hooks/convex/useExternalData.ts (lines 250-270 -- hook)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add hourly granularity to backend query</name>
  <files>convex/externalData/queries.ts</files>
  <action>
In `getRevenueTimeSeries` (line 1373), add `v.literal("hourly")` to the granularity union:
```
granularity: v.union(v.literal("hourly"), v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
```

Add a `utcToWibHourStr` helper near line 1358 (after the existing helpers):
```typescript
/** Get "YYYY-MM-DD HH" from UTC epoch ms, WIB-adjusted */
function utcToWibHourStr(utcMs: number): string {
  const wib = new Date(utcMs + WIB_OFFSET_MS);
  const date = wib.toISOString().split("T")[0];
  const hour = wib.getUTCHours().toString().padStart(2, "0");
  return `${date} ${hour}`;
}
```

Add hourly case to `bucketKey()` (line 1407-1412):
```typescript
case "hourly": return utcToWibHourStr(utcMs);
```

Add hourly case to `formatLabel()` (line 1416-1431):
```typescript
case "hourly": {
  // "2026-02-16 14" -> "2pm"
  const hour = parseInt(key.split(" ")[1], 10);
  const suffix = hour >= 12 ? "pm" : "am";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}${suffix}`;
}
```

Place hourly cases as the first case in each switch for consistency (hourly, daily, weekly, monthly).
  </action>
  <verify>Run `npm run type-check` -- must pass with no errors in queries.ts</verify>
  <done>Backend accepts "hourly" granularity, buckets by WIB hour, formats labels as "10am", "2pm" etc.</done>
</task>

<task type="auto">
  <name>Task 2: Update frontend type, hook, defaults, and selector</name>
  <files>src/components/salesAnalytics/SalesChart.tsx, src/hooks/convex/useExternalData.ts</files>
  <action>
**useExternalData.ts** (line 260): Update granularity type to include "hourly":
```typescript
granularity: "hourly" | "daily" | "weekly" | "monthly",
```

**SalesChart.tsx** -- four changes:

1. Line 24 -- Update Granularity type:
```typescript
type Granularity = "hourly" | "daily" | "weekly" | "monthly";
```

2. Lines 34-48 -- Update `defaultGranularity()` mapping:
```typescript
function defaultGranularity(preset: PeriodPreset): Granularity {
  switch (preset) {
    case "past24hours":
    case "today":
    case "yesterday":
      return "hourly";
    case "thisWeek":
    case "last7days":
      return "daily";
    case "last30days":
    case "thisMonth":
      return "weekly";
    case "allTime":
      return "weekly";
  }
}
```

3. Lines 142-146 -- Add hourly to granularity options (first in list):
```typescript
const granularityOptions: { value: Granularity; label: string }[] = [
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];
```

4. Line 134 -- Keep `useAreaChart` logic as-is (`granularity === "monthly"`). Hourly and daily both render as BarChart which is correct for discrete time points.
  </action>
  <verify>Run `npm run build` -- must pass with zero errors</verify>
  <done>Frontend sends "hourly" to backend, day-level presets default to hourly, allTime defaults to weekly, hourly option visible in granularity selector</done>
</task>

</tasks>

<verification>
1. `npm run type-check` passes
2. `npm run build` succeeds
3. Manual spot-check: selecting "Today" preset shows hourly bars (not a single daily bar)
</verification>

<success_criteria>
- Build passes with no type errors
- Hourly granularity flows end-to-end: frontend type -> hook -> Convex validator -> bucket/label functions
- Default granularity mapping: past24hours/today/yesterday=hourly, thisWeek/last7days=daily, last30days/thisMonth=weekly, allTime=weekly
- Hourly labels display as 12-hour format (e.g. "10am", "2pm", "12pm")
</success_criteria>

<output>
After completion, create `.planning/quick/3-dashboard-revenue-chart-smart-default-gr/3-SUMMARY.md`
</output>
