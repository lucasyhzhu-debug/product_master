# Decision: BOM as Sole Source of Truth for Product Composition

**Date:** 2026-02-10
**Branch:** `feature/kitchen-redesign-v3`
**Status:** Adopted

## Context

The codebase had two competing sources for determining ball type and count per menu product:

1. **Deprecated fields** on `menuProducts` table: `productionType` ("original" / "bite_sized") and `productionUnits` (number)
2. **BOM (Bill of Materials)**: `menuProductComponents` table linked to `componentTypes` table (codes: `BIG_BALL`, `MID_BALL`)

This caused persistent confusion because:
- `productionType="original"` maps to `BIG_BALL` (80g/Jumbo) — counterintuitive since the product called "Original Single" actually uses `MID_BALL` (45g)
- The deprecated fields on `orderItems` are snapshots stamped at order creation, which may drift from current BOM
- Multiple places computed ball totals differently (some from BOM, some from deprecated fields)

## Decision

**All new code MUST derive ball composition from BOM only.**

### Source of truth
- `menuProductComponents` table: links each `menuProduct` to its `componentType` entries
- `componentTypes` table: has `category="production"` and `code` field (`BIG_BALL` = 80g/Jumbo, `MID_BALL` = 45g/Original)

### Query pattern
```typescript
// 1. Fetch all components for a menu product
const components = await ctx.db
  .query("menuProductComponents")
  .withIndex("by_menu_product", (q) => q.eq("menuProductId", menuProductId))
  .collect();

// 2. For each component, look up the componentType
for (const comp of components) {
  const ct = await ctx.db.get(comp.componentTypeId);
  if (ct?.category === "production") {
    // ct.code is "BIG_BALL" or "MID_BALL"
    // comp.quantity is the number of balls
  }
}
```

### Deprecated fields (DO NOT USE in new code)
- `menuProducts.productionType` — kept for legacy data only
- `menuProducts.productionUnits` — kept for legacy data only
- `orderItems.productionType` — stamped at order creation, kept for historical orders
- `orderItems.productionUnits` — stamped at order creation, kept for historical orders

### What still uses deprecated fields (legacy, to be migrated later)
- `convex/orders/queries.ts` — kitchen stats ball computation (getKitchenStats, getKitchenStatsExpanded)
- `convex/orders/mutations/orderCrud.ts` — stamps productionType/Units on new orderItems
- `convex/orders/mutations/itemCrud.ts` — stamps productionType/Units on new orderItems
- `convex/orders/mutations/packaging.ts` — reads productionUnits for ball-per-package calculations
- `convex/orders/whatsapp.ts` — uses productionUnits for gram descriptions
- Various frontend components that display order item details

### Already migrated to BOM
- `convex/productionCounts/queries.ts` — derives ballType/ballCount from BOM
- `convex/orders/mutations/kitchen.ts` — `boxProducts` uses BOM for ball deduction
- `src/components/kitchen/ProductionLogPanel.tsx` — reads BOM-derived data from backend

## Consequences

- Ball totals in kitchen dashboard now correctly compute from actual product composition
- No more confusion between "original" (the product name) and "original" (the deprecated productionType value)
- Legacy order data still works via the stamped fields on orderItems
- Future migration can clean up the deprecated fields from orderItems once all historical queries are updated
