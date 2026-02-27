---
status: resolved
trigger: "Planner header shows hardcoded Capacity: 200/day even when kitchen target is 120. User wants header notes removed entirely."
created: 2026-02-26T12:00:00+07:00
updated: 2026-02-26T12:00:00+07:00
---

## Current Focus

hypothesis: Header subtitle uses stale settingsData.dailyCapacity (hardcoded 200 default) instead of kitchenConfig.maxProductionTarget (120)
test: Remove subtitle entirely per user request
expecting: No more "Capacity: X/day" in header
next_action: Remove subtitle from DispatchPlanner.tsx, remove unused capacity/settingsData references

## Symptoms

expected: No "Capacity: X/day" header text at all
actual: Header shows "4 channels active | Capacity: 200/day" with wrong value
errors: None - display/data-linking bug
reproduction: Open Dispatch Planner page with kitchen target set to 120
started: Likely since planner was built - header always used wrong data source

## Eliminated

- hypothesis: Grid day columns show wrong capacity
  evidence: Grid uses dailyCapacity from getUnifiedWeeklyPlan which correctly reads kitchenConfig.maxProductionTarget (line 138 of queries.ts)
  timestamp: 2026-02-26T12:00:00+07:00

## Evidence

- timestamp: 2026-02-26T12:00:00+07:00
  checked: DispatchPlanner.tsx line 195
  found: `const capacity = settingsData?.dailyCapacity ?? 200` uses getPlannerSettings (hardcoded 200 default)
  implication: Header subtitle always shows 200, not kitchen target

- timestamp: 2026-02-26T12:00:00+07:00
  checked: convex/dispatchPlanner/queries.ts line 138
  found: getUnifiedWeeklyPlan correctly reads kitchenConfig.maxProductionTarget for grid capacity
  implication: Grid capacity bars are correct; only the header subtitle is wrong

- timestamp: 2026-02-26T12:00:00+07:00
  checked: convex/dispatchPlanner/queries.ts line 45
  found: getPlannerSettings returns { dailyCapacity: 200 } as default when no settings record exists
  implication: This is a separate data path from the grid's kitchen-config-based capacity

## Resolution

root_cause: Header subtitle uses `settingsData?.dailyCapacity` from `getPlannerSettings()` (hardcoded 200 default) instead of the kitchen-config-based capacity used by the grid. Two different data sources for "capacity".
fix: Remove the entire subtitle/description from PageHeader per user request. Also remove unused settingsData hook and capacity variable.
verification: npm run build passes. Subtitle removed from PageHeader. Grid capacity bars still use correct kitchenConfig.maxProductionTarget via getUnifiedWeeklyPlan.
files_changed: [src/pages/DispatchPlanner.tsx]
