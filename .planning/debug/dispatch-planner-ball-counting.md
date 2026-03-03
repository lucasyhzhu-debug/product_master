---
status: awaiting_human_verify
trigger: "dispatch-planner-ball-counting: Channel summary rows and capacity bars show raw product orderQuantity instead of BOM-resolved ball counts"
created: 2026-03-02T00:00:00Z
updated: 2026-03-02T00:05:00Z
---

## Current Focus

hypothesis: CONFIRMED - dailyTotals accumulates raw product qty, not BOM-resolved ball counts
test: Build, type-check, and unit tests all pass after fix
expecting: Channel subtotals and capacity bars now show BOM-resolved ball counts
next_action: Await human verification that the fix works in the running app

## Symptoms

expected: Channel summaries should show BOM-resolved ball counts (e.g., 4 Original-Triple = 12 balls, not 4)
actual: Shows raw product quantities (Tuesday Direct Sales = 34 product units, not ball-resolved count)
errors: No errors — pure logic bug in aggregation
reproduction: Open Dispatch Planner page for Mar 1-7, 2026. Look at channel row totals and capacity bars.
started: Likely since dispatch planner was built

## Eliminated

## Evidence

- timestamp: 2026-03-02T00:01:00Z
  checked: Backend query `convex/dispatchPlanner/queries.ts` - getUnifiedWeeklyPlan
  found: The query returns TWO separate totals structures:
    1. `dailyTotals[date][channelKey]` = raw product quantities (line 358: `dailyTotals[date]["direct"] += qty`)
    2. `dailyBallTotals[date]` = BOM-expanded ball counts (computed at lines 233-246)
  implication: The backend correctly computes BOM-expanded balls in dailyBallTotals, but dailyTotals (which feeds channel subtotals and capacity bars) uses raw product counts

- timestamp: 2026-03-02T00:01:00Z
  checked: Frontend CapacityBar - how segments are built
  found: PlannerGrid.tsx lines 133-151 - capacitySegments reads from `dailyTotals[date][channelKey]`. CapacityBar total = sum of segments (raw product qty). The "{total}/{capacity}" label shows product counts, not balls.
  implication: Capacity bar shows product counts because it reads dailyTotals not dailyBallTotals

- timestamp: 2026-03-02T00:01:00Z
  checked: Frontend ChannelGroup - how subtotals are shown
  found: PlannerGrid.tsx lines 174-184 builds channelDailyTotals from dailyTotals. ChannelGroup.tsx line 113-119 maps these to subtotals displayed in the channel header row.
  implication: Channel subtotal row shows product counts because it reads dailyTotals

- timestamp: 2026-03-02T00:01:00Z
  checked: Frontend "Total Units (balls)" footer row
  found: PlannerGrid.tsx lines 367-389 - there IS a separate "Total Units (balls)" footer row that uses dailyBallTotals correctly. But the CHANNEL subtotals and CAPACITY bars do NOT use this.
  implication: The BOM-expanded data exists but is only used in the footer, not in channel subtotals or capacity bars

- timestamp: 2026-03-02T00:05:00Z
  checked: Build, type-check, and tests after fix
  found: TypeScript compiles clean, npm run build passes, 683/683 tests pass
  implication: Fix is safe and non-breaking

## Resolution

root_cause: The backend `dailyTotals[date][channelKey]` accumulates raw `item.quantity` / `plan.plannedQty` (product units) not BOM-resolved ball counts. The channel subtotal rows and capacity bars both read from this `dailyTotals` structure. Meanwhile, `dailyBallTotals` correctly BOM-expands but is only used for the footer "Total Units (balls)" row and has no per-channel breakdown.

fix: Added `dailyBallTotalsByChannel[date][channelKey]` to the backend query return. Changed internal tracking from `dailyProductQty[date][mpId]` to `dailyChannelProductQty[date][channel][mpId]` so BOM expansion can compute per-channel ball totals. Frontend updated to use `dailyBallTotalsByChannel` for capacity bar segments and channel group subtotals. The redundant "Total Units (balls)" footer row was merged into the main "Total Balls" footer. CapacityBar tooltip now says "balls" instead of "units".

verification: TypeScript type-check passes. npm run build passes. 683/683 unit tests pass.

files_changed:
  - convex/dispatchPlanner/queries.ts
  - src/components/dispatchPlanner/PlannerGrid.tsx
  - src/components/dispatchPlanner/CapacityBar.tsx
