---
phase: 54-fix-bigseller-platform-specific-endpoint-schema-mismatches
plan: 02
subsystem: api
tags: [bigseller, bigsellerOrders, revenue, profit, platform-normalization, convex]

requires:
  - phase: 54-01
    provides: normalizePlatformFees with explicit platform param, extended BigSellerOrderRow interface, orderAmount normalization

provides:
  - Platform parameter wired through sync pipeline (normalizePlatformFees, mapOrderToStorage, mapOrderToRevenue)
  - orderAmount field in bigsellerOrders schema and storage
  - Corrected revenue semantics (gross = orderAmount, net = platformIncome)
  - Fixed profit formula using BigSeller authoritative order.profit
  - Financial field fallbacks changed from || 0 to ?? 0
  - BigSellerOrdersTable shows Gross Revenue and Buyer Shipping columns
  - Platform-specific schema differences documented in BIGSELLER_PROFIT_API.md

affects: [bigsellerOrders, externalRevenue, salesAnalytics, BigSellerOrdersTable]

tech-stack:
  added: []
  patterns:
    - "Explicit platform parameter pattern for platform-specific API endpoints"
    - "?? 0 fallback for financial fields (preserves real zero values)"
    - "BigSeller order.profit as authoritative (not hand-rolled formula)"

key-files:
  created: []
  modified:
    - convex/schema.ts
    - convex/integrations/bigseller/helpers.ts
    - convex/integrations/bigseller/sync.ts
    - convex/bigsellerOrders/queries.ts
    - convex/bigsellerOrders/__tests__/integration.test.ts
    - src/components/salesAnalytics/BigSellerOrdersTable.tsx
    - docs/BIGSELLER_PROFIT_API.md

key-decisions:
  - "orderAmount as v.optional(v.number()) for backwards compat with pre-Phase 54 data"
  - "revenueGross uses orderAmount ?? saleAmount fallback chain (orderAmount = total buyer paid)"
  - "calculatedProfit = order.profit (BigSeller authoritative, not platformIncome + fees formula)"
  - "Financial fields use ?? 0 (not || 0) to preserve semantic zero values"
  - "Buyer Shipping shown as neutral color (not red like deductions)"

patterns-established:
  - "Explicit platform parameter: all BigSeller helpers accept platform from BIGSELLER_SHOP_PLATFORM_MAP, not order.platform"
  - "Nullish coalescing for financial fields: ?? 0 preserves real 0 values, || 0 only for non-financial counts"

requirements-completed: [BUG-02, BUG-06, ENH-ORDERAMOUNT-WIRING, ENH-REVENUE-SEMANTICS, ENH-SHIPPING-DISPLAY]

duration: 15min
completed: 2026-03-15
---

# Phase 54 Plan 02: Sync Pipeline Wiring + Profit Fix + Revenue Display Summary

**Platform parameter wired through sync pipeline, orderAmount schema/storage/revenue mapping, profit formula fixed to use BigSeller authoritative order.profit, BigSellerOrdersTable shows gross revenue (incl. shipping) and buyer shipping column**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-15T14:52:35Z
- **Completed:** 2026-03-15T15:08:03Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Wired explicit platform parameter through sync.ts to normalizePlatformFees, mapOrderToStorage, mapOrderToRevenue (fixes BUG-02: TikTok orders stored as "shopee")
- Added orderAmount to bigsellerOrders schema (v.optional for backwards compat) and mapOrderToStorage output
- Changed revenueGross from saleAmount (product price only) to orderAmount (total buyer paid incl. shipping)
- Fixed calculatedProfit from broken formula (platformIncome + fees = double subtraction) to order.profit (BigSeller authoritative)
- Changed financial field fallbacks from || 0 to ?? 0 across mapOrderToStorage and mapOrderToRevenue
- Updated BigSellerOrdersTable: Revenue -> Gross Revenue (with tooltip), added Buyer Shipping column, renamed Shipping -> Seller Shipping
- All 980 tests pass, npm run build succeeds

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema + storage + revenue wiring** - `f1c0251` (feat)
2. **Task 2: Profit formula + revenue display + tests** - `b5ea933` (fix)

## Files Created/Modified
- `convex/schema.ts` - Added orderAmount: v.optional(v.number()) to bigsellerOrders table
- `convex/integrations/bigseller/helpers.ts` - mapOrderToStorage/mapOrderToRevenue: platform param, orderAmount, ?? 0 fallbacks
- `convex/integrations/bigseller/sync.ts` - Pass loop platform to normalizePlatformFees/mapOrderToStorage/mapOrderToRevenue, SKU collection uses platform variable
- `convex/bigsellerOrders/queries.ts` - calculatedProfit = order.profit (not hand-rolled formula)
- `convex/bigsellerOrders/__tests__/integration.test.ts` - Updated profit tests, 3-param function signatures
- `src/components/salesAnalytics/BigSellerOrdersTable.tsx` - Gross Revenue column (orderAmount), Buyer Shipping column, colSpan updated
- `docs/BIGSELLER_PROFIT_API.md` - Platform-Specific Response Schema Differences section with field matrix, sign conventions, revenue semantics

## Decisions Made
- orderAmount as v.optional(v.number()) -- existing bigsellerOrders documents lack this field, optional avoids breaking reads of old data. Requires re-sync to populate.
- revenueGross uses `order.orderAmount ?? order.saleAmount ?? 0` fallback chain -- orderAmount is total buyer paid (product + shipping), falls back to saleAmount for old data without orderAmount.
- calculatedProfit = order.profit directly -- BigSeller computes profit = platformIncome - costFee. The old formula (platformIncome + commissionFee + sellerShippingFee + otherFee) double-subtracted fees already deducted in platformIncome.
- Buyer Shipping column styled in neutral color (not red) since it's informational, not a deduction from seller revenue.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated mutations.test.ts for 3-param mapOrderToStorage**
- **Found during:** Task 2 (test updates)
- **Issue:** convex/bigsellerOrders/__tests__/mutations.test.ts also calls mapOrderToStorage but was not listed in plan files
- **Fix:** Updated all mapOrderToStorage calls to include platform parameter
- **Files modified:** convex/bigsellerOrders/__tests__/mutations.test.ts (already committed in previous session)
- **Verification:** All 4 mutations tests pass
- **Committed in:** Previously committed (detected during test run)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix for test compatibility. No scope creep.

## Issues Encountered
- Plan 01 (dependency) had been partially executed in a previous session but not fully committed. The GREEN phase (normalizePlatformFees rewrite) was on disk but uncommitted. Committed it before proceeding with Plan 02 (commit f45e5ae).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 6 BigSeller bugs fixed and tested
- Post-deployment: trigger a manual re-sync from BigSeller to populate orderAmount on existing orders and correct corrupted platform/fee data
- BigSeller COGS = 0 blocker remains (requires manual BigSeller dashboard configuration, not a code fix)

## Self-Check: PASSED

All 7 modified files exist. Both commit hashes (f1c0251, b5ea933) verified. 980/980 tests pass. Build succeeds.

---
*Phase: 54-fix-bigseller-platform-specific-endpoint-schema-mismatches*
*Completed: 2026-03-15*
