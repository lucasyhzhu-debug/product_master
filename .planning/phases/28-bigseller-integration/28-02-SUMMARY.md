---
phase: 28-bigseller-integration
plan: 02
subsystem: ui
tags: [bigseller, sync-ui, orders-table, sku-mapping, shopee, tiktok, react, sales-analytics]

# Dependency graph
requires:
  - phase: 28-bigseller-integration-01
    provides: "BigSeller sync backend (scheduler-chain, bigsellerOrders, bigsellerSyncState, queries)"
provides:
  - "BigSellerSyncPanel: expandable sync progress with step-by-step checkmarks and summary card"
  - "BigSellerOrdersTable: filterable table of synced orders with full fee breakdown"
  - "useBigSeller hook: 5 exports for sync state, orders, unmapped SKUs, stats, trigger"
  - "Shopee and TikTok sub-tabs in ProductMappingTab for BigSeller SKU mapping"
  - "Retroactive mapping: updates externalRevenue via bigsellerOrders.linkedRevenueId"
affects: [30-unified-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS variable tokens for status colors in data tables (--color-status-error, --color-status-success)"
    - "Union type narrowing for Convex query return types (DB document vs default state)"
    - "actionToast for button-triggered completions, toast.info for background completions"

key-files:
  created:
    - src/hooks/convex/useBigSeller.ts
    - src/components/salesAnalytics/BigSellerSyncPanel.tsx
    - src/components/salesAnalytics/BigSellerOrdersTable.tsx
  modified:
    - src/hooks/convex/index.ts
    - src/components/salesAnalytics/SettingsTab.tsx
    - src/components/salesAnalytics/ProductMappingTab.tsx
    - convex/externalData/mutations.ts
    - convex/_generated/api.d.ts
    - docs/CHANGELOG.md

key-decisions:
  - "api.d.ts manually updated to include bigsellerOrders and bigseller sync/queries modules (no npx convex dev available)"
  - "Retroactive BigSeller mapping added to existing updateProductMapping mutation (inline, not separate action call)"
  - "CSS variable tokens with fallback values for status colors (not raw Tailwind dark: variants)"
  - "Union type narrowing via 'in' operator for syncState properties that only exist on DB document"

patterns-established:
  - "BigSeller expanded section pattern: IntegrationHealthCard + expand toggle + sync panel + orders table"
  - "Per-platform sub-tabs in ProductMappingTab: gobiz, k3mart, shopee, tiktok"

requirements-completed: [BS-01, BS-02, BS-03]

# Metrics
duration: 8min
completed: 2026-02-27
---

# Phase 28 Plan 02: BigSeller Frontend Summary

**BigSeller sync UI with step-by-step progress panel, filterable orders table with fee breakdown, and Shopee/TikTok SKU mapping sub-tabs in Product Mapping**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-27T13:49:48Z
- **Completed:** 2026-02-27T13:58:00Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- useBigSeller hook with 5 exports: syncState, orders, unmappedSkus, orderStats, startSync
- BigSellerSyncPanel: step-by-step progress with checkmarks, summary card, COGS caveat banner, JWT expiry warning
- BigSellerOrdersTable: filterable by platform/date, 20/page pagination, full fee breakdown with CSS variable tokens
- SettingsTab: expandable BigSeller section with unmapped SKU badge, sync panel, and orders table
- ProductMappingTab: Shopee and TikTok sub-tabs with unmapped sort-to-top
- Retroactive mapping wired into updateProductMapping for shopee/tiktok sources via bigsellerOrders.linkedRevenueId

## Task Commits

1. **Task 1: useBigSeller hook + BigSellerSyncPanel** - `8629b88` (feat)
2. **Task 2: BigSellerOrdersTable + SettingsTab integration** - `6a2d0c0` (feat)
3. **Task 3: SKU mapping wiring + build verification + CHANGELOG** - `9e46400` (feat)

## Files Created/Modified
- `src/hooks/convex/useBigSeller.ts` - Hook wrapping sync state, orders, unmapped SKUs, stats, and sync trigger
- `src/hooks/convex/index.ts` - Added BigSeller hook exports
- `src/components/salesAnalytics/BigSellerSyncPanel.tsx` - Expandable sync progress with step-by-step checkmarks and summary
- `src/components/salesAnalytics/BigSellerOrdersTable.tsx` - Filterable orders table with fee breakdown
- `src/components/salesAnalytics/SettingsTab.tsx` - BigSeller expand toggle, unmapped badge, sync panel integration
- `src/components/salesAnalytics/ProductMappingTab.tsx` - Shopee and TikTok sub-tabs for SKU mapping
- `convex/externalData/mutations.ts` - Retroactive BigSeller mapping in updateProductMapping
- `convex/_generated/api.d.ts` - Added bigsellerOrders and bigseller sync/queries modules
- `docs/CHANGELOG.md` - Phase 28 entry

## Decisions Made
- Manually updated api.d.ts to include bigsellerOrders and bigseller sync/queries modules since npx convex dev is not available in this environment. These will be regenerated on next `npx convex dev` run.
- Added retroactive BigSeller mapping logic inline in the existing `updateProductMapping` mutation rather than calling the separate `applyRetroactiveMapping` internalMutation, because mutations cannot call other mutations directly -- inlining avoids the need for an action wrapper.
- Used CSS variable tokens with fallback values (`var(--color-status-error, #ef4444)`) for status colors in the orders table, ensuring dark mode compatibility without raw Tailwind dark: variants.
- Used `'in' operator` type narrowing for syncState properties that only exist on the DB document (errorMessage, summary) but not on the default idle state object.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated api.d.ts with missing module entries**
- **Found during:** Task 1 (useBigSeller hook creation)
- **Issue:** api.d.ts was missing bigsellerOrders/mutations, bigsellerOrders/queries, integrations/bigseller/queries, and integrations/bigseller/sync entries from Plan 01
- **Fix:** Added import statements and fullApi entries for all 4 missing modules
- **Files modified:** convex/_generated/api.d.ts
- **Verification:** TypeScript type-check passes, frontend can import from these API paths
- **Committed in:** 8629b88 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed union type narrowing for getSyncState return type**
- **Found during:** Task 3 (build verification)
- **Issue:** getSyncState returns a union of DB document (with errorMessage/summary) or default idle object (without). Direct property access caused TS2339 errors.
- **Fix:** Used 'in' operator to safely access errorMessage and summary from the union type
- **Files modified:** src/components/salesAnalytics/BigSellerSyncPanel.tsx
- **Verification:** npm run build passes
- **Committed in:** 9e46400 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both essential for type-safety and build passing. No scope creep.

## Issues Encountered
- Pre-existing test failures in 13 test files (e2e tests, gobiz adapter, k3mart cockpit, products) unrelated to Phase 28 changes. BigSeller-specific tests: 25/25 passing.

## User Setup Required
None - BigSeller token must already be configured in platformCredentials (done in Phase 26).

## Next Phase Readiness
- Phase 28 BigSeller integration complete end-to-end (backend + frontend)
- Admin can trigger sync, watch progress, browse orders, and map SKUs
- Ready for Phase 30 unified analytics which will aggregate BigSeller data alongside other platforms

---
*Phase: 28-bigseller-integration*
*Completed: 2026-02-27*

## Self-Check: PASSED
- All 3 created files verified on disk
- All 3 commits verified in git log (8629b88, 6a2d0c0, 9e46400)
- npm run build passes
- BigSeller tests: 25/25 passing
- No toast.success() in new components
- CSS variable tokens used for status colors (no raw Tailwind dark: variants)
