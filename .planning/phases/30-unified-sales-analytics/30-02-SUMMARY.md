---
phase: 30-unified-sales-analytics
plan: 02
subsystem: ui
tags: [react, recharts, analytics, multi-channel, lifetime-totals, dynamic-channels]

# Dependency graph
requires:
  - phase: 30-unified-sales-analytics
    plan: 01
    provides: Dynamic channels array in getDashboardSummaryByPeriodInternal, fetchLifetimeTotals action, dynamic getRevenueTimeSeries
  - phase: 28-bigseller-integration
    provides: useBigSellerOrderStats hook with allCostFeeZero flag
provides:
  - Dynamic multi-channel Sales Analytics frontend with 7+ channel support
  - LifetimeHero card with all-time units sold and expandable per-product breakdown
  - PLATFORM_COLORS map with 8 entries for chart rendering
  - Dynamic ChannelSummary grid from backend channels array (no hardcoded channels)
  - BigSeller COGS caveat banner for zero-cost orders
  - useLifetimeTotals hook with on-demand action fetch pattern
affects: [sales-analytics, dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: [dynamic-channel-ui, legend-as-filter, lifetime-hero-card, cogs-caveat-banner]

key-files:
  created: []
  modified:
    - src/hooks/convex/useExternalData.ts
    - src/hooks/convex/index.ts
    - src/components/salesAnalytics/SalesChart.tsx
    - src/components/salesAnalytics/OverviewTab.tsx

key-decisions:
  - "ChannelBreakdown type exported with source+displayName fields for dynamic channel rendering"
  - "Revenue Table filter badges removed entirely -- chart legend IS the filter per CONTEXT.md"
  - "Store grouping derived from data (all records k3mart) instead of platformFilter state"
  - "GoFood color changed from red to teal in PlatformHierarchy to match chart PLATFORM_COLORS"
  - "K3 Mart color changed from purple to blue across all three color maps for consistency"

patterns-established:
  - "Color consistency: SalesChart PLATFORM_COLORS, ChannelSummary CHANNEL_COLORS, and PlatformHierarchy platformColors must use matching colors per channel"
  - "Dynamic channel UI: all channel grids and lists derived from backend data arrays, never hardcoded"
  - "Lifetime hero pattern: on-demand action fetch, always shows all-time data independent of period selector"

requirements-completed: [ANLY-01, ANLY-02, ANLY-03]

# Metrics
duration: 5min
completed: 2026-03-01
---

# Phase 30 Plan 02: Frontend Analytics UI Summary

**Dynamic multi-channel Sales Analytics UI with 7-channel chart colors, lifetime hero card, dynamic channel breakdown grid, and BigSeller COGS caveat banner**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-01T04:08:26Z
- **Completed:** 2026-03-01T04:13:46Z
- **Tasks:** 3 (2 auto + 1 checkpoint auto-approved)
- **Files modified:** 4

## Accomplishments
- Updated DashboardSummaryByPeriod type from fixed 3-key channels object to dynamic ChannelBreakdown array
- Added useLifetimeTotals hook with on-demand action fetch pattern for all-time totals
- Expanded PLATFORM_COLORS from 3 to 8 entries with distinct colors per channel
- Refactored ChannelSummary from hardcoded 4-segment grid to fully dynamic channel cards
- Added LifetimeHero card at top of OverviewTab with expandable per-product breakdown table
- Extended PlatformHierarchy colors for all 7 channels with color consistency
- Added BigSeller COGS caveat banner (conditional on allCostFeeZero)
- Removed Revenue Table filter badges (PlatformFilter type eliminated)
- Responsive grid: 2 cols mobile, 3 cols medium, 4 cols large

## Task Commits

Each task was committed atomically:

1. **Task 1: Update DashboardSummaryByPeriod type + add useLifetimeTotals hook** - `37027f4` (feat)
2. **Task 2: Expand PLATFORM_COLORS + refactor ChannelSummary + LifetimeHero + PlatformHierarchy + COGS caveat** - `46abe30` (feat)
3. **Task 3: Visual verification** - auto-approved (checkpoint, no commit)

## Files Created/Modified
- `src/hooks/convex/useExternalData.ts` - ChannelBreakdown type updated (dynamic array), LifetimeTotals type + useLifetimeTotals hook added
- `src/hooks/convex/index.ts` - Barrel export updated with useLifetimeTotals, ChannelBreakdown, LifetimeTotals
- `src/components/salesAnalytics/SalesChart.tsx` - PLATFORM_COLORS expanded to 8 entries, type annotation changed to Record<string, string>
- `src/components/salesAnalytics/OverviewTab.tsx` - ChannelSummary refactored to dynamic, LifetimeHero added, PlatformHierarchy colors extended, COGS caveat banner, filter badges removed, PlatformFilter type removed

## Decisions Made
- **ChannelBreakdown exported:** Made `ChannelBreakdown` and `LifetimeTotals` types public exports for use in OverviewTab and other consumers
- **Revenue Table filter badges removed:** Per CONTEXT.md guidance that "legend IS the filter", removed the 4-badge radio button UI entirely instead of expanding to 8 buttons
- **Store grouping derived from data:** Instead of hardcoded `platformFilter === "k3mart"`, store grouping now activates when all visible records are k3mart source
- **Color consistency:** GoFood (gobiz) changed from red to teal, K3 Mart from purple to blue, across all three color maps to match chart PLATFORM_COLORS
- **SalesAnalytics.tsx unchanged:** Page description was already updated to "Track revenue across all channels" (no change needed)

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None -- no external service configuration required.

## Next Phase Readiness
- Phase 30 (Unified Sales Analytics) is now fully complete (2/2 plans)
- Backend (Plan 01) + Frontend (Plan 02) = unified multi-channel Sales Analytics
- All 7 channels (GoFood, K3 Mart, Direct, GrabFood, Shopee, Tokopedia, Consignment) render in charts and breakdowns
- v1.4 milestone ready for completion after CHANGELOG update and merge to main

---
*Phase: 30-unified-sales-analytics*
*Completed: 2026-03-01*
