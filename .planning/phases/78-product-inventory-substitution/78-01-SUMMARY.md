---
phase: 78-product-inventory-substitution
plan: 01
status: complete
commits:
  - fa64b5b9: "feat(78-01): product inventory substitution backend"
---

## Summary

Backend implementation of product inventory substitution allowing triple products to draw from single product inventory when direct stock is insufficient.

## What Was Built

1. **Schema** (`convex/schema.ts`): Added `fulfillFromProductId` and `fulfillMultiplier` optional fields to menuProducts table
2. **Pure Helper** (`convex/productInventory/substitution.ts`): `resolveSubstitutionPlan()` computes direct vs substitute unit split
3. **Validation** (`convex/menuProducts/mutations.ts`): Update mutation validates no self-reference, no forward/reverse chains, multiplier >= 2, active target
4. **Mutations** (`convex/productInventory/mutations.ts`):
   - `fulfillFromInventory`: Draws direct stock first, then substitute. Stock row cache ensures correct cumulative deductions for multiple items sharing same source
   - `processGofoodSales`: Same substitution logic with negative stock allowed + low-stock alerts for substitute products
5. **Query** (`convex/productInventory/queries.ts`): `getStockForOrder` returns substitution availability details (hasSubstitution, substituteAvailable, substituteNeeded, substituteProductName, substituteMultiplier)
6. **Tests** (`tests/convex/productSubstitution.test.ts`): 12 tests covering pure helper, validation, fulfillment integration, and stock query

## Verification

- `npx tsc --noEmit` passes
- `npm run build` succeeds
