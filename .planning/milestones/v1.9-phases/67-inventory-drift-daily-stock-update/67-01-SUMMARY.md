---
phase: 67
plan: 1
title: "Backend — stock_count transaction type & bulk count mutation"
status: complete
completed_at: "2026-03-28"
---

# Summary: 67-01 Backend — stock_count transaction type & bulk count mutation

## What was done

1. **Schema change**: Added `v.literal("stock_count")` to the `transactionType` union in `productInventoryTransactions` table (convex/schema.ts)
2. **bulkStockCount mutation**: New mutation in `convex/productInventory/mutations.ts` that accepts an array of {menuProductId, actualCount, note?} entries for a location, calculates deltas, patches inventory rows, and logs stock_count transactions
3. **getLastStockCount query**: New query in `convex/productInventory/queries.ts` that returns the most recent stock_count transaction per product at a given location
4. **Frontend hooks**: Added `useBulkStockCount()` and `useLastStockCount()` to `src/hooks/convex/useProductInventory.ts` with barrel exports in `src/hooks/convex/index.ts`
5. **Type cast fix**: Updated the `getTransactions` query type cast to include `"stock_count"` in the union

## Files modified

- `convex/schema.ts` -- Added `stock_count` literal to transactionType union
- `convex/productInventory/mutations.ts` -- Added `bulkStockCount` mutation
- `convex/productInventory/queries.ts` -- Added `getLastStockCount` query + type cast fix
- `src/hooks/convex/useProductInventory.ts` -- Added `useBulkStockCount` and `useLastStockCount` hooks
- `src/hooks/convex/index.ts` -- Added barrel exports

## Verification

- `npm run build` passes
- Schema deployed to dev environment
