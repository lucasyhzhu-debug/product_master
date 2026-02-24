# Deferred Items — Phase 19

## Pre-existing build errors (out of scope for plan 19-04)

These errors exist in files from plan 19-03 and are not caused by plan 19-04 changes.
`npm run type-check` (tsc --noEmit) passes; only `npm run build` (which uses tsc -b) fails.

### Files with pre-existing type errors:
- `src/App.tsx(28,3)`: GoFoodDepotManager declared but never read
- `src/components/gofoodDepot/DepotStockTransferDialog.tsx(130,9)`: `reason` field not in transferStock args
- `src/components/orders/OrderSlideOver.tsx(346,17)`: OrderItem type mismatch
- `src/hooks/convex/useGoFoodDepot.ts(76,16)` and `(92,16)`: Expected 2 args but got 1
- `src/pages/GoFoodDepotManager.tsx(136,9)`: Element not assignable to string
- `src/pages/GoFoodDepotManager.tsx(200,13)`: StockGrouped type incompatibility (string vs Id)
- `src/pages/GoFoodDepotManager.tsx(201,13)`: StorageLocation.isDefault boolean vs boolean | undefined

These should be resolved in the plan 19-03 fix or cleanup pass.
