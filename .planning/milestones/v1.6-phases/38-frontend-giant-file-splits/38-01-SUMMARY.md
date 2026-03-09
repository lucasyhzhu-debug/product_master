---
phase: 38-frontend-giant-file-splits
plan: 01
subsystem: ui
tags: [react, refactoring, component-extraction, sales-analytics, wib-timezone]

# Dependency graph
requires:
  - phase: 36-sales-analytics-backend-simplification
    provides: OverviewTab and sales analytics query infrastructure
provides:
  - Shared WIB timezone helpers in src/lib/dateUtils.ts (6 exports)
  - 12 extracted OverviewTab sub-components in src/components/salesAnalytics/
  - overviewUtils.ts with shared types, constants, and period presets
  - Slimmed OverviewTab.tsx at 283 LOC (from 1,273)
affects: [38-02-grabfood-manager-split, 38-03-finished-goods-tab-split, 38-04-vouchers-manager-split]

# Tech tracking
tech-stack:
  added: []
  patterns: [flat-feature-directory-extraction, shared-dateutils-module]

key-files:
  created:
    - src/lib/dateUtils.ts
    - src/components/salesAnalytics/overviewUtils.ts
    - src/components/salesAnalytics/GrowthIndicator.tsx
    - src/components/salesAnalytics/ConfidenceBadge.tsx
    - src/components/salesAnalytics/MatchStatusBadge.tsx
    - src/components/salesAnalytics/PlatformBadge.tsx
    - src/components/salesAnalytics/RevenueItemDetails.tsx
    - src/components/salesAnalytics/InternalOrderDetails.tsx
    - src/components/salesAnalytics/StoreGroupHeader.tsx
    - src/components/salesAnalytics/ChannelSummary.tsx
    - src/components/salesAnalytics/PlatformHierarchy.tsx
    - src/components/salesAnalytics/LifetimeHero.tsx
    - src/components/salesAnalytics/RevenueTable.tsx
    - src/components/salesAnalytics/HeroCards.tsx
  modified:
    - src/components/salesAnalytics/OverviewTab.tsx

key-decisions:
  - "PeriodData type includes all PeriodSummary fields (totalAdBurn, totalPromoBurn) to avoid prop type mismatches"
  - "RevenueTable uses formatDateId and utcToWibTimeStr from dateUtils instead of inline WIB calculations"
  - "Barrel index.ts unchanged -- sub-components are internal to salesAnalytics directory"

patterns-established:
  - "Flat extraction into feature directory: each component gets its own file, utils get *Utils.ts suffix"
  - "Shared WIB helpers in src/lib/dateUtils.ts -- single source of truth for UTC+7 conversions"

requirements-completed: [FFS-01]

# Metrics
duration: 7min
completed: 2026-03-06
---

# Phase 38 Plan 01: OverviewTab Split Summary

**Split OverviewTab.tsx (1,273 LOC) into 14 focused sub-components + shared dateUtils, achieving 283 LOC (78% reduction)**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-06T13:57:51Z
- **Completed:** 2026-03-06T14:04:51Z
- **Tasks:** 1
- **Files modified:** 15 (14 created, 1 modified)

## Accomplishments
- Extracted 6 WIB timezone helpers to shared `src/lib/dateUtils.ts` (reusable by plans 02-04)
- Extracted 7 small helper components (GrowthIndicator, ConfidenceBadge, MatchStatusBadge, PlatformBadge, RevenueItemDetails, InternalOrderDetails, StoreGroupHeader)
- Extracted 3 major section components (ChannelSummary, PlatformHierarchy, LifetimeHero)
- Extracted RevenueTable and HeroCards as standalone components
- Slimmed OverviewTab.tsx from 1,273 to 283 LOC (78% reduction, well under 400 target)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared dateUtils.ts and extract all OverviewTab sub-components** - `a494619` (refactor)

## Files Created/Modified

| File | LOC | Purpose |
|------|-----|---------|
| `src/lib/dateUtils.ts` | 47 | Shared WIB timezone helpers (6 exports) |
| `src/components/salesAnalytics/overviewUtils.ts` | 67 | Types, constants, period presets |
| `src/components/salesAnalytics/GrowthIndicator.tsx` | 39 | Growth percentage indicator with arrows |
| `src/components/salesAnalytics/ConfidenceBadge.tsx` | 23 | Exact/inferred/manual confidence badges |
| `src/components/salesAnalytics/MatchStatusBadge.tsx` | 33 | Product match status badges |
| `src/components/salesAnalytics/PlatformBadge.tsx` | 14 | Platform source badges with colors |
| `src/components/salesAnalytics/RevenueItemDetails.tsx` | 75 | Expandable revenue item detail rows |
| `src/components/salesAnalytics/InternalOrderDetails.tsx` | 102 | Expandable internal order detail rows |
| `src/components/salesAnalytics/StoreGroupHeader.tsx` | 41 | K3 Mart store group header row |
| `src/components/salesAnalytics/ChannelSummary.tsx` | 158 | Channel breakdown tree with growth indicators |
| `src/components/salesAnalytics/PlatformHierarchy.tsx` | 109 | Platform-to-outlet drill-down |
| `src/components/salesAnalytics/LifetimeHero.tsx` | 49 | Lifetime balls sold hero card |
| `src/components/salesAnalytics/RevenueTable.tsx` | 186 | Revenue details table with store grouping |
| `src/components/salesAnalytics/HeroCards.tsx` | 136 | 5-card hero stats grid |
| `src/components/salesAnalytics/OverviewTab.tsx` | 283 | Slim orchestrator (was 1,273) |

## Decisions Made
- PeriodData type includes all PeriodSummary fields (totalAdBurn, totalPromoBurn, platformGross, internalGross) to match the actual hook return type, preventing runtime prop mismatches
- RevenueTable uses `formatDateId` and `utcToWibTimeStr` from dateUtils instead of inline `WIB_OFFSET_MS` calculations and `toLocaleDateString` calls
- Barrel `index.ts` unchanged -- internal sub-components use direct relative imports, only OverviewTab is re-exported publicly

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None -- no external service configuration required.

## Next Phase Readiness
- `src/lib/dateUtils.ts` is ready for plans 02-04 to consume (eliminates WIB helper duplication in GrabFoodManager)
- `overviewUtils.ts` establishes the pattern for domain-scoped utils files (plan 04 will create `voucherUtils.ts`)
- All sub-components are independently readable and testable

## Self-Check: PASSED


- All 15 files verified present on disk
- Commit a494619 verified in git log

---
*Phase: 38-frontend-giant-file-splits*
*Completed: 2026-03-06*
