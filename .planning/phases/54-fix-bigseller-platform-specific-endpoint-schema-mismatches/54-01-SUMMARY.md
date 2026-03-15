---
phase: 54-fix-bigseller-platform-specific-endpoint-schema-mismatches
plan: 01
subsystem: api
tags: [bigseller, normalization, tdd, shopee, tiktok, platform-fees]

# Dependency graph
requires: []
provides:
  - "normalizePlatformFees with explicit platform parameter (2-arg signature)"
  - "BigSellerOrderRow extended interface with 7 new platform-specific fields"
  - "shouldOverwrite() helper for consistent null/undefined/zero-from-common checks"
  - "22 HAR-confirmed unit tests for normalization (BUG-01, BUG-03, BUG-04, BUG-05, CASE-01, ENH-ORDERAMOUNT)"
affects: [54-02-PLAN, bigseller-sync, bigseller-queries, sales-analytics]

# Tech tracking
tech-stack:
  added: []
  patterns: ["shouldOverwrite(field, aggregated) for platform-specific field overwrite decisions", "TDD RED-GREEN for normalization rewrite"]

key-files:
  created:
    - "convex/integrations/bigseller/__tests__/normalization.test.ts"
  modified:
    - "convex/integrations/bigseller/helpers.ts"
    - "convex/integrations/bigseller/__tests__/helpers.test.ts"
    - "convex/integrations/bigseller/__tests__/helpers-edge-cases.test.ts"
    - "convex/bigsellerOrders/__tests__/mutations.test.ts"

key-decisions:
  - "shouldOverwrite() uses (field == null || (field === 0 && aggregated !== 0)) for all overwrite checks"
  - "Shopee fees negated via -Math.abs() (defensive for both positive and negative inputs)"
  - "TikTok commissionFee summed from 6 fields (already negative, no abs needed)"
  - "TikTok otherFee maps only to extraCostsFee (HAR-confirmed, not 4-field sum)"
  - "TikTok orderAmount computed AFTER saleAmount and buyerShippingFee normalization"
  - "otherfee/otherFee case mismatch resolved at top of normalizePlatformFees"

patterns-established:
  - "shouldOverwrite(field, aggregated): Standard null-check pattern for platform-specific field normalization"
  - "normalizePlatformFees(order, platform): Platform must come from BIGSELLER_SHOP_PLATFORM_MAP, never from order.platform"

requirements-completed: [BUG-01, BUG-03, BUG-04, BUG-05, CASE-01, ENH-ORDERAMOUNT]

# Metrics
duration: 12min
completed: 2026-03-15
---

# Phase 54 Plan 01: normalizePlatformFees TDD Rewrite Summary

**TDD normalization rewrite: 22 HAR-confirmed tests + shouldOverwrite() helper fixing Shopee saleAmount/sign, TikTok 5-field mapping, otherfee case mismatch, and orderAmount computation**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-15T14:52:18Z
- **Completed:** 2026-03-15T15:04:30Z
- **Tasks:** 1 (TDD: RED + GREEN + test compatibility)
- **Files modified:** 5

## Accomplishments
- 22 unit tests covering all 6 bug scenarios with HAR-confirmed production values (Shopee 260307H1VR6UCW, TikTok 582977241483805780)
- normalizePlatformFees rewritten with explicit platform parameter and shouldOverwrite() pattern
- BigSellerOrderRow extended with 7 new fields: originalPrice, revenueAmount, settlementAmount, customerPaidShippingFeeAmount, otherfee, orderAmount, buyerTotalAmount
- All 980 tests pass across 57 test files (zero regressions)

## Task Commits

Each task was committed atomically:

1. **TDD RED: failing normalization tests** - `574a439` (test)
2. **TDD GREEN: normalizePlatformFees rewrite** - `f45e5ae` (feat, pre-existing)
3. **GREEN: update existing tests for signature compatibility** - `104df92` (feat)
4. **Edge case test assertions update** - `bb8fcbb` (test)
5. **Fix mutations.test.ts for platform param** - `e45b27e` (fix)

_Note: f45e5ae and f1c0251 were pre-existing commits on the feature branch containing the helpers.ts rewrite and Plan 02 wiring._

## Files Created/Modified
- `convex/integrations/bigseller/__tests__/normalization.test.ts` - 22 TDD test cases for normalizePlatformFees (356 lines)
- `convex/integrations/bigseller/helpers.ts` - Extended BigSellerOrderRow, rewritten normalizePlatformFees, shouldOverwrite() helper
- `convex/integrations/bigseller/__tests__/helpers.test.ts` - Updated mapOrderToRevenue/mapOrderToStorage calls with platform param
- `convex/integrations/bigseller/__tests__/helpers-edge-cases.test.ts` - Updated for new signatures and orderAmount/profit semantics
- `convex/bigsellerOrders/__tests__/mutations.test.ts` - Updated mapOrderToStorage calls with platform param

## Decisions Made
- shouldOverwrite() uses `(field == null || (field === 0 && aggregated !== 0))` -- catches both undefined fields AND 0-from-common-endpoint cases where platform-specific data has real values
- Shopee fees negated via `-Math.abs()` (defensive -- works correctly regardless of input sign)
- TikTok commissionFee is direct sum of 6 fields (already negative, no abs/negation needed)
- TikTok otherFee maps ONLY to extraCostsFee (not the old 4-field sum) per HAR verification
- TikTok orderAmount computed as `saleAmount + buyerShippingFee` AFTER those fields are normalized
- otherfee/otherFee case mismatch resolved at top of function (before any platform branch)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pre-existing mapOrderToStorage/mapOrderToRevenue signature changes broke existing tests**
- **Found during:** GREEN phase (test compatibility verification)
- **Issue:** helpers.ts already contained Plan 02 scope changes (mapOrderToStorage with 3rd platform param, mapOrderToRevenue with 3rd platform param) from pre-existing commits on the feature branch. Existing tests called these functions with 2 args.
- **Fix:** Updated 3 test files (helpers.test.ts, helpers-edge-cases.test.ts, mutations.test.ts) to pass explicit platform parameter
- **Files modified:** convex/integrations/bigseller/__tests__/helpers.test.ts, helpers-edge-cases.test.ts, convex/bigsellerOrders/__tests__/mutations.test.ts
- **Verification:** All 980 tests pass (57 files)
- **Committed in:** 104df92, bb8fcbb, e45b27e

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking)
**Impact on plan:** Auto-fix necessary to achieve zero regression. No scope creep.

## Issues Encountered
- Feature branch had pre-existing commits (f45e5ae, f1c0251) from a prior execution attempt. The helpers.ts rewrite and Plan 02 wiring were already committed. This plan's contribution was the comprehensive test suite and test compatibility updates.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 01 complete: normalizePlatformFees rewritten with full test coverage
- Plan 02 can proceed: sync.ts wiring, schema update, queries/frontend fixes
- Build currently fails on sync.ts (expected: `normalizePlatformFees(row)` needs 2nd arg) -- Plan 02 scope

## Self-Check: PASSED

All 5 created/modified files exist. All 5 commit hashes verified.

---
*Phase: 54-fix-bigseller-platform-specific-endpoint-schema-mismatches*
*Completed: 2026-03-15*
