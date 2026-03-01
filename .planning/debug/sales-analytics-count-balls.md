---
status: awaiting_human_verify
trigger: "Sales Analytics 'units sold' counts product-level quantities instead of BOM ball components"
created: 2026-03-01T00:00:00Z
updated: 2026-03-01T00:00:00Z
---

## Current Focus

hypothesis: The reports query sums orderItem.quantity directly instead of joining with BOM to count balls
test: Read the reports query that powers Sales Analytics
expecting: Will find a straight sum of quantity without BOM lookup
next_action: Read convex/reports/ and SalesAnalytics page to trace the data flow

## Symptoms

expected: "Units sold" should count total Big Balls and Mid Balls produced — derived from BOM (menuProductComponents + componentTypes where category="production"). A hamper with 1 Big Ball + 2 Mid Balls = 3 balls total.
actual: Shows "247 units sold" which is a straight sum of order item quantities. Each order item = 1 unit regardless of how many balls are inside.
errors: None — logic bug, not an error.
reproduction: Open Sales Analytics page, look at "units sold" and the product breakdown table.
started: Always been this way. User now wants it corrected to count balls.

## Eliminated

## Evidence

- timestamp: 2026-03-01T00:05:00Z
  checked: convex/externalData/queries.ts getLifetimeTotalsInternal (line 1755-1821)
  found: totalUnits is computed by summing item.quantity from externalRevenueItems. This is the product-level quantity (e.g., 1 hamper = 1), not the BOM ball count.
  implication: ROOT CAUSE CONFIRMED — need to resolve linkedMenuProductId -> menuProductComponents -> componentTypes (category=production) to get actual ball counts

- timestamp: 2026-03-01T00:06:00Z
  checked: convex/schema.ts menuProductComponents (line 138-152) and componentTypes (line 703+)
  found: menuProductComponents has menuProductId + componentTypeId + quantity. componentTypes has category (production/packaging) and code (BIG_BALL/MID_BALL).
  implication: For each externalRevenueItem with linkedMenuProductId, we need to look up menuProductComponents where category=production and sum their quantities multiplied by the item.quantity

## Resolution

root_cause: getLifetimeTotalsInternal sums externalRevenueItems.quantity directly as "units sold". This counts product-level quantity (1 hamper = 1), not BOM ball components. Need to multiply by ball count from BOM (menuProductComponents where componentType.category=production).
fix: In getLifetimeTotalsInternal, pre-build a map of menuProductId -> ballCount by scanning menuProductComponents + componentTypes. Then multiply item.quantity by ballCount when aggregating totalUnits. Unmapped items (no linkedMenuProductId) fall back to item.quantity as-is.
verification: npm run build passes (clean), all 654 tests pass (646 existing + 8 new), awaiting manual UI check
files_changed:
  - convex/externalData/queries.ts
  - src/hooks/convex/useExternalData.ts
  - src/components/salesAnalytics/OverviewTab.tsx
  - tests/convex/lifetimeBallCount.test.ts (NEW - 8 tests)
