# Plan 64-03 Summary: BigSeller Fee Sign Normalization

## Status: COMPLETE

## What Changed

### Problem
BigSeller fee fields (commissionFee, sellerShippingFee, otherFee) were stored with inconsistent sign conventions:
- Shopee: stored as negative via `-Math.abs()` (intentionally negated)
- TikTok: stored as-is (already negative from API)
- Common: stored as-is (could be negative)
- Downstream `mapOrderToRevenue` used `Math.abs()` to compensate

This created confusion and required defensive Math.abs() workarounds everywhere fees were consumed.

### Solution
Normalize ALL fee values to POSITIVE at sync time in `normalizePlatformFees()`, then remove downstream Math.abs() workarounds.

### Files Modified

| File | Change |
|------|--------|
| `convex/integrations/bigseller/helpers.ts` | Shopee: `-Math.abs()` to `Math.abs()`. TikTok: raw assignment to `Math.abs()`. Common: added normalization for negative values. `mapOrderToRevenue`: removed `Math.abs()` wrappers. Updated JSDoc comments. |
| `convex/integrations/bigseller/__tests__/normalization.test.ts` | Updated 8 test expectations from negative to positive values. Renamed test descriptions to reflect positive convention. |
| `convex/integrations/bigseller/__tests__/helpers.test.ts` | Updated mockOrder fee values to positive. Renamed test from "stores raw negative" to "stores normalized positive". |
| `convex/integrations/bigseller/__tests__/helpers-edge-cases.test.ts` | Updated baseOrder fee values to positive in 3 describe blocks. Updated assertion from `Math.abs(storage.commissionFee)` to direct comparison. |
| `convex/migrations/bigsellerFeeSignFix.ts` | **NEW** -- Paginated migration to fix existing negative records (500/batch). |

### TDD Approach
1. **RED**: Updated 8 test expectations to expect positive values -- all 8 failed against old code
2. **GREEN**: Updated production code -- all 95 tests pass

### Verification
- `npm run test -- convex/integrations/bigseller/`: 95/95 tests pass
- `npx tsc --noEmit`: clean (no errors)

### Migration Instructions
1. Deploy code changes first (new sync behavior stores positive values)
2. Run `bigsellerFeeSignFix:fixBigSellerFeeSigns` from Convex dashboard
3. Repeat until `hasMore === false`
4. Run `bigsellerRevenueBackfill:backfillBigSellerRevenue` to update linked revenue records
