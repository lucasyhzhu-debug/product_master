---
status: partial
phase: 80-unit-economics-analytics-dashboard
source: [80-VERIFICATION.md]
started: 2026-04-15T00:00:00Z
updated: 2026-04-15T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. /analytics page renders all 13 widgets with live data
expected: Manager/admin opens `/analytics` in browser. 6 KPI tiles (Revenue net, Units, AOV, Rev/Unit, Orders, Units/Txn) show values with WoW deltas. 7 remaining widgets (Weekday dual-axis, Day×Hour heatmap, Rev/Unit, Take-rate, Units-by-type, Units-per-txn, AOV, Type mix, SKU Pareto, SKU×channel heatmap, Channel sparklines, Rolling trend) all render with data for a meaningful date range.
result: [pending]

### 2. Filter latency under 500ms (SC #3)
expected: Changing date-range preset, toggling a channel, or toggling a product in the new multi-select reflects in every widget within 500ms in dev env. Reactive Convex queries should not stall the UI.
result: [pending]

### 3. URL round-trip (SC #4)
expected: Apply filters (custom date range + at least one channel + one product). Copy URL. Paste into a new tab. View restores with identical filter state and same chart values.
result: [pending]

### 4. WR-02 rolling-trend continuity — visual check
expected: On Rolling Trend chart, x-axis is continuous across zero-revenue days (no missing gaps, no distorted averaging). Rolling7 and rolling28 lines dip through quiet periods instead of jumping.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
