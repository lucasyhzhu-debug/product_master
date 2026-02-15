---
phase: 13-api-audit-auth
plan: 04
subsystem: ui
tags: [react, convex, dashboard, sales-analytics, product-mapping, sync-health]

# Dependency graph
requires:
  - phase: 13-01
    provides: "getSyncHealthAlert query, externalProductMappings table, externalRevenueItems with by_product_name index"
provides:
  - "SyncHealthBanner component for dashboard sync failure alerts"
  - "ProductMappingTab with per-platform sub-tabs and card pairs"
  - "ProductMappingCard with retroactive mapping edit and confirmation dialog"
  - "countMappingImpact query for previewing mapping change impact"
  - "updateProductMapping mutation with retroactive revenue item updates"
affects: [13-05, sales-analytics, dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: ["reactive sync health monitoring via Convex queries", "retroactive data correction pattern with impact preview"]

key-files:
  created:
    - "src/components/dashboard/SyncHealthBanner.tsx"
    - "src/components/salesAnalytics/ProductMappingCard.tsx"
    - "src/components/salesAnalytics/ProductMappingTab.tsx"
  modified:
    - "src/components/dashboard/index.ts"
    - "src/pages/Dashboard.tsx"
    - "src/components/salesAnalytics/index.ts"
    - "src/pages/SalesAnalytics.tsx"
    - "convex/externalData/queries.ts"
    - "convex/externalData/mutations.ts"
    - "src/hooks/convex/useExternalData.ts"
    - "src/hooks/convex/index.ts"

key-decisions:
  - "SyncHealthBanner gated behind canAccessSalesAnalytics permission (manager/admin only)"
  - "Used raw Convex query in ProductMappingTab to preserve Id types (bypassing legacy transform)"
  - "countMappingImpact loaded lazily only when confirmation dialog opens (skip pattern)"

patterns-established:
  - "Retroactive mapping updates: mutation updates mapping + all linked revenue items in single transaction"
  - "Impact preview pattern: count query shown in confirmation dialog before destructive/bulk operation"

# Metrics
duration: 8min
completed: 2026-02-15
---

# Phase 13 Plan 04: Dashboard Sync Banner & Product Mapping UI Summary

**Persistent sync failure banner on dashboard with 6-hour staleness detection, plus product mapping UI with platform tabs, card pairs, and retroactive update confirmation**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-15
- **Completed:** 2026-02-15
- **Tasks:** 2
- **Files modified:** 11 (3 created, 8 modified)

## Accomplishments
- Dashboard shows persistent red/amber sync failure banner when GoFood or K3 Mart sync is stale 6+ hours
- Product mapping UI with GoFood and K3 Mart platform tabs, unmapped items sorted to top with amber badge
- Admin can edit mappings with retroactive confirmation dialog showing historical impact count
- Backend countMappingImpact query and updateProductMapping mutation with retroactive revenue item correction

## Task Commits

Tasks were not committed individually due to lack of Bash access. All changes are staged and ready for commit.

1. **Task 1: Dashboard sync failure banner** - SyncHealthBanner component + Dashboard integration
2. **Task 2: Product mapping UI with card pairs and platform tabs** - ProductMappingTab, ProductMappingCard, backend mutations/queries, SalesAnalytics Mappings tab

## Files Created/Modified
- `src/components/dashboard/SyncHealthBanner.tsx` - Persistent sync failure banner with red/amber severity, formatDuration helper, and settings link
- `src/components/dashboard/index.ts` - Added SyncHealthBanner export
- `src/pages/Dashboard.tsx` - Added SyncHealthBanner import and render (gated by canAccessSalesAnalytics)
- `src/components/salesAnalytics/ProductMappingCard.tsx` - Card pair showing external product -> internal menuProduct with edit, confidence indicator, and retroactive confirmation dialog
- `src/components/salesAnalytics/ProductMappingTab.tsx` - Platform sub-tabs (GoFood, K3 Mart) with unmapped count badges and sorted card grid
- `src/components/salesAnalytics/index.ts` - Added ProductMappingTab and ProductMappingCard exports
- `src/pages/SalesAnalytics.tsx` - Added Mappings tab (3 tabs: Overview, Mappings, Settings)
- `convex/externalData/queries.ts` - Added countMappingImpact query
- `convex/externalData/mutations.ts` - Added updateProductMapping mutation with retroactive revenue item updates
- `src/hooks/convex/useExternalData.ts` - Added useConvexCountMappingImpact and useConvexUpdateProductMapping hooks
- `src/hooks/convex/index.ts` - Added new hook exports

## Decisions Made
- SyncHealthBanner gated behind `canAccessSalesAnalytics` permission to match SafeSalesWidget pattern (manager/admin only)
- Used raw Convex query (`api.menuProducts.queries.list`) directly in ProductMappingTab instead of `useConvexMenuProducts` hook to preserve native `Id<"menuProducts">` types (the hook's `transformMenuProduct` casts to legacy number IDs)
- countMappingImpact query uses Convex skip pattern -- only fetched when confirmation dialog is visible, avoiding unnecessary queries

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed useConvexMenuProducts type mismatch**
- **Found during:** Task 2 (ProductMappingTab implementation)
- **Issue:** `useConvexMenuProducts` hook transforms data to legacy format with `id: number` instead of `_id: Id<"menuProducts">`, breaking the mapping mutation which needs real Convex IDs
- **Fix:** Used raw `useQuery(api.menuProducts.queries.list)` directly to get native Convex document shapes
- **Files modified:** `src/components/salesAnalytics/ProductMappingTab.tsx`

**2. [Rule 1 - Bug] Fixed duplicate useConvexSyncHealthAlert export**
- **Found during:** Task 1 (SyncHealthBanner implementation)
- **Issue:** `useConvexSyncHealthAlert` already existed in `useSalesAnalytics.ts` (from Plan 13-01). Adding another in `useExternalData.ts` would cause duplicate export
- **Fix:** Used existing hook from `useSalesAnalytics.ts` instead of creating duplicate. Adjusted SyncHealthBanner to use `{ data }` destructuring matching that hook's return shape
- **Files modified:** `src/hooks/convex/useExternalData.ts`, `src/components/dashboard/SyncHealthBanner.tsx`

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes essential for type safety and avoiding duplicate exports. No scope creep.

## Issues Encountered
- No Bash access during execution -- unable to run type-check, build verification, or create per-task git commits. Manual commit needed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 04 UI components complete. Ready for Plan 05 if applicable.
- Convex backend needs `npx convex dev` to regenerate types for new countMappingImpact and updateProductMapping functions.

---
*Phase: 13-api-audit-auth*
*Completed: 2026-02-15*
