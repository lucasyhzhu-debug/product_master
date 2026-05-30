---
phase: 65
plan: 1
status: complete
---

# Summary: Plan 65-01 — Backend: Price in stock flow args + outlet deactivation + history cleanup

## What was built

### Task 1: Add `price` field to `submitStockFlow` items
- Added `price: v.number()` to the items validator in `submitStockFlow`
- Changed `detail` mapping to use `item.price > 0 ? item.price : (dashItem?.price ?? 0)` for both `price` and `currentPrice`
- Updated `priceAtSubmission` in `recordStockMovement` call to use same logic

### Task 2: Fix `submitBulkStockIns` pricing
- Added `K3MART_CONFIG.productMap` price as fallback when dashboard API returns `price=0`
- Ensures bulk submissions also get correct pricing for new outlets

### Task 3: Remove `fetchStockFlowHistory` and `fetchStockFlowDetail`
- Deleted both exported actions from `convex/integrations/k3mart/adapter.ts`
- Cleaned up unused `K3MartStockFlowDetailResponse` import
- Verified `verifySubmissionStatuses` (which uses the same endpoint directly) is unaffected

### Task 4: Remove `getStockMovementHistory` query
- Deleted the entire query from `convex/k3martCockpit/queries.ts`

### Task 5: Add `deactivateStaleOutlets` mutation
- Added admin-protected mutation targeting outlet IDs 45, 48, 78, 81
- Uses soft-delete (sets `isActive: false`) to preserve historical data

## Verification
- `npm run type-check` passes with 0 errors
- All expected exports present, removed exports absent

## Key files
- `convex/integrations/k3mart/adapter.ts` (modified)
- `convex/k3martCockpit/queries.ts` (modified)
- `convex/k3martCockpit/mutations.ts` (modified)
