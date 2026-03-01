---
status: awaiting_human_verify
trigger: "Sales Analytics 'units sold' counts product-level quantities instead of BOM ball components"
created: 2026-03-01T00:00:00Z
updated: 2026-03-01T14:15:00Z
---

## Current Focus

hypothesis: CONFIRMED — hero card now uses dynamic avgRevenuePerBall from BOM-linked items
test: Build + 660 tests pass. Awaiting manual UI verification.
expecting: Hero shows "balls sold (est.)" with dynamic rate, no product breakdown table
next_action: User verifies in browser

## Symptoms

expected: "Units sold" should count total Big Balls and Mid Balls produced — derived from BOM (menuProductComponents + componentTypes where category="production"). A hamper with 1 Big Ball + 2 Mid Balls = 3 balls total.
actual: Shows "247 units sold" which is a straight sum of order item quantities. Each order item = 1 unit regardless of how many balls are inside.
errors: None — logic bug, not an error.
reproduction: Open Sales Analytics page, look at "units sold" and the product breakdown table.
started: Always been this way. User now wants it corrected to count balls.

## Eliminated

- hypothesis: Bottom-up BOM counting per product is sufficient
  evidence: Most historical externalRevenueItems lack linkedMenuProductId, so BOM counting underreports
  timestamp: 2026-03-01T01:00:00Z

- hypothesis: Hardcoded ESTIMATED_REVENUE_PER_BALL = 35,000 is accurate enough
  evidence: User requested dynamic calculation from known product mix instead
  timestamp: 2026-03-01T02:00:00Z

- hypothesis: Per-product name-based estimation (estimateBallsFromName) adds value
  evidence: User decided to remove product breakdown entirely and simplify to hero-only
  timestamp: 2026-03-01T03:00:00Z

## Evidence

- timestamp: 2026-03-01T00:05:00Z
  checked: convex/externalData/queries.ts getLifetimeTotalsInternal (line 1755-1821)
  found: totalUnits is computed by summing item.quantity from externalRevenueItems. This is the product-level quantity (e.g., 1 hamper = 1), not the BOM ball count.
  implication: ROOT CAUSE CONFIRMED — need to resolve linkedMenuProductId -> menuProductComponents -> componentTypes (category=production) to get actual ball counts

- timestamp: 2026-03-01T00:06:00Z
  checked: convex/schema.ts menuProductComponents (line 138-152) and componentTypes (line 703+)
  found: menuProductComponents has menuProductId + componentTypeId + quantity. componentTypes has category (production/packaging) and code (BIG_BALL/MID_BALL).
  implication: For each externalRevenueItem with linkedMenuProductId, we need to look up menuProductComponents where category=production and sum their quantities multiplied by the item.quantity

- timestamp: 2026-03-01T14:15:00Z
  checked: Full simplification — removed product breakdown, estimateBallsFromName, ESTIMATED_REVENUE_PER_BALL
  found: Dynamic avgRevenuePerBall from BOM-linked items replaces hardcoded constant. Simpler return type. Simpler UI.
  implication: Self-calibrating estimate that improves as more products are mapped

## Resolution

root_cause: getLifetimeTotalsInternal summed externalRevenueItems.quantity directly as "units sold" — counting product-level quantity (1 hamper = 1) not BOM ball components.
fix: |
  Complete simplification of lifetime hero card:
  1. Backend: Dynamic avgRevenuePerBall calculated from BOM-linked items (knownRevenue / knownBalls). Falls back to 35K when no known items exist. Removed product breakdown, estimateBallsFromName, ESTIMATED_REVENUE_PER_BALL.
  2. Hook: Simplified LifetimeTotals type to {totalBalls, lifetimeRevenue, lifetimeTransactions, avgRevenuePerBall}. Removed LifetimeProduct type.
  3. Frontend: Simple stat card with big number, subtitle, and explanation text showing the avg rate. Removed expandable product table.
  4. Tests: 14 tests covering dynamic avg, fallback, edge cases. Replaced 31 previous tests.
verification: npm run build passes (clean), 660 tests pass (37 files), awaiting manual UI check
files_changed:
  - convex/externalData/queries.ts (simplified getLifetimeTotalsInternal, removed exports)
  - src/hooks/convex/useExternalData.ts (simplified LifetimeTotals type)
  - src/components/salesAnalytics/OverviewTab.tsx (simplified LifetimeHero component)
  - tests/convex/lifetimeBallCount.test.ts (rewritten — 14 tests)
  - tests/convex/helpers.ts (added transactionCount to createExternalRevenue)
  - CLAUDE.md (updated business rules 13 and pitfall 13)
