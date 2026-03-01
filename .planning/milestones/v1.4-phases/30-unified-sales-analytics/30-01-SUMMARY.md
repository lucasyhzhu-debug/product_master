---
phase: 30-unified-sales-analytics
plan: 01
subsystem: api
tags: [convex, analytics, revenue, dynamic-channels, time-series]

# Dependency graph
requires:
  - phase: 26-gobiz-revenue-sync
    provides: externalSource validator, externalRevenue/externalRevenueItems tables
  - phase: 28-bigseller-integration
    provides: shopee/tiktok source literals in externalSource
  - phase: 29-consignment-settlements
    provides: consignment source literal, revenue bridge
provides:
  - Dynamic sourceToPlatform mapping for all 8 sources (gobiz, k3mart, internal, grabfood, shopee, tiktok, consignment, bigseller)
  - Dynamic channel discovery in getRevenueTimeSeries (no hardcoded platform lists)
  - Dynamic channels array in getDashboardSummaryByPeriodInternal (Array<{source, displayName, gross, net, transactions}>)
  - Revenue-descending sort in getRevenueByOutletInternal
  - getLifetimeTotalsInternal query for all-time per-product per-source aggregation
  - fetchLifetimeTotals action wrapper for on-demand fetching
affects: [30-02-frontend-analytics-ui, sales-analytics, dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: [dynamic-channel-discovery, zero-channel-filtering, revenue-descending-sort]

key-files:
  created: []
  modified:
    - convex/externalData/queries.ts
    - convex/externalData/actions.ts

key-decisions:
  - "channels return type changed from fixed {k3mart, gobiz, internal} object to dynamic Array<{source, displayName, gross, net, transactions}> -- breaking frontend type change handled in Plan 02"
  - "getSyncHealthStatus intentionally kept with 3-platform hardcoded list (sync health monitoring, not analytics)"
  - "getLifetimeTotalsInternal uses full table scan -- acceptable at current ~1K records scale, pre-aggregation deferred to ANLY-04"
  - "tiktok maps to Tokopedia (correct for Indonesian e-commerce via BigSeller API)"

patterns-established:
  - "Dynamic channel discovery: derive platform lists from data, never hardcode"
  - "Zero-channel filtering: .filter(s => s.data.some(v => v !== 0)) hides empty platforms"
  - "Revenue-descending sort: channels/platforms sorted by gross descending for natural hierarchy"

requirements-completed: [ANLY-01, ANLY-02, ANLY-03]

# Metrics
duration: 7min
completed: 2026-03-01
---

# Phase 30 Plan 01: Backend Analytics Refactor Summary

**Dynamic channel discovery for all 8 revenue sources with sourceToPlatform mapping, lifetime totals query, and zero-channel filtering**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-01T03:56:24Z
- **Completed:** 2026-03-01T04:03:35Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- Extended sourceToPlatform with all 8 source-to-display-name mappings (including bigseller as defensive case)
- Refactored getRevenueTimeSeries from hardcoded 3-platform array to dynamic discovery from data with zero-channel filtering
- Refactored getDashboardSummaryByPeriodInternal from fixed channels object to dynamic array, preserving internal order discount correction
- Replaced hardcoded sort orders with revenue-descending dynamic sort in getRevenueByOutletInternal
- Added getLifetimeTotalsInternal query with per-product per-source breakdown and fetchLifetimeTotals action wrapper

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend sourceToPlatform + refactor getRevenueTimeSeries** - `ae5f29c` (feat)
2. **Task 2: Refactor getDashboardSummaryByPeriodInternal + getRevenueByOutletInternal sort** - `96fd799` (feat)
3. **Task 3: Add getLifetimeTotalsInternal + fetchLifetimeTotals** - `720c099` (feat)

## Files Created/Modified
- `convex/externalData/queries.ts` - Extended sourceToPlatform (8 mappings), dynamic channel discovery in getRevenueTimeSeries, dynamic channels array in getDashboardSummaryByPeriodInternal, revenue-descending sort in getRevenueByOutletInternal, new getLifetimeTotalsInternal query
- `convex/externalData/actions.ts` - New fetchLifetimeTotals action wrapper

## Decisions Made
- **channels type change:** Changed from `{ k3mart: ChannelBreakdown; gobiz: ChannelBreakdown; internal: ChannelBreakdown }` to `Array<{ source, displayName, gross, net, transactions }>`. This is a breaking change that Plan 02 must handle on the frontend.
- **getSyncHealthStatus unchanged:** Intentionally kept with hardcoded 3-platform list since it monitors automated sync infrastructure health, not analytics. GrabFood/BigSeller/Consignment have dedicated UIs.
- **Full table scan for lifetime totals:** Acceptable at ~1K records. Pre-aggregation deferred to ANLY-04 when scale warrants it.
- **tiktok -> Tokopedia mapping:** Correct for Indonesian e-commerce; TikTok Shop = Tokopedia in BigSeller's API.
- **api.d.ts not manually updated:** Will auto-regenerate on next `npx convex dev` run. New getLifetimeTotalsInternal and fetchLifetimeTotals exports will appear automatically.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend analytics queries ready for Plan 02 frontend consumption
- Plan 02 must update OverviewTab PeriodData type to handle dynamic channels array
- Plan 02 must expand PLATFORM_COLORS in SalesChart for new platform keys
- `api.d.ts` will regenerate automatically on next `npx convex dev` run

---
*Phase: 30-unified-sales-analytics*
*Completed: 2026-03-01*
