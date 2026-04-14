---
phase: 79
plan: 06
type: summary
status: complete
completed: 2026-04-14
---

# 79-06 Reports Branches — SUMMARY

## What was built

Added explicit `shopee` + `tiktok` branches to the channel sell-through query in
`convex/externalData/queries.ts`:

1. Extended `getChannelSellThrough` channel union to accept `"shopee"` and `"tiktok"`,
   plus a new branch that aggregates per-product volume from `externalRevenueItems`
   via the `by_revenue` index. Per-product `quantity = Σ item.quantity` (NOT
   `revenueGross / avgPrice`), enforcing D-04 (no double-counting parent revenue).
2. Added a new lightweight `sellThroughQuery` that returns a flat row array (used
   by analytics consumers + Wave 0 invariant tests). Mirrors the gobiz/internal
   shape and projects to `{productKey, name, menuProductId, quantity,
   weekdayQuantity, weekendQuantity, revenue, transactionCount}`.
3. Weekday/weekend split uses `isWeekend(txnDate)` from `convex/lib/periodRange.ts`
   (WIB-aware). Window is 30-day rolling from `Date.now()`.

## DA-08 / DA-09 verification (no code change needed)

- `lifetimeHelpers.ts`: source-agnostic — Shopee/TikTok ball counts flow through
  the existing `resolveLifetimeBalls()` once `externalRevenueItems` exist
  (verified via revenue-invariants test passing without touching lifetimeHelpers).
- `incomeStatement.ts`: source-agnostic — `buildProductCOGSMap` reads
  `cogsOverrideIdr` or BOM components from `menuProducts`. Shopee items
  resolve via `linkedMenuProductId` exactly like gobiz items
  (verified via incomeStatement-shopee.test.ts: 3/3 GREEN).

## Key files

- `convex/externalData/queries.ts` — extended `getChannelSellThrough` + new `sellThroughQuery` (+200 LOC, no other branches modified)
- `convex/externalData/__tests__/sell-through-shopee.test.ts` — schema fix (defaultPrice/code/grams), removed `@ts-expect-error`, switched static `Date.UTC(2026,2,4)` to relative timestamps so dates stay inside the 30-day rolling window
- `convex/reports/__tests__/incomeStatement-shopee.test.ts` — schema fix + assertion rewrite to match production return shape (`stmt.current.channels[].cogs.total`, not the idealised `cogsByChannel.shopee`)

## Verification

- `npm run type-check` → clean
- 10/10 tests GREEN: sell-through-shopee (4), revenue-invariants (3), incomeStatement-shopee (3)
- `lifetimeHelpers.ts` and `incomeStatement.ts` source files unchanged (verified by `git diff --name-only` against base)

## Deviations from plan

1. **Plan asked for branches in existing `getChannelSellThrough`.** Wave 0 tests
   imported `api.externalData.queries.sellThroughQuery` (a function that did not
   exist). Created it as a new lightweight read-only query rather than retrofit
   the richer stock/restock-annotated `getChannelSellThrough` shape into the
   compact row format the tests expect. Both queries now have shopee/tiktok
   branches; consumers can pick the shape they need.
2. **Wave 0 test seeds had stale schema fields** (`price`, `displayOrder`,
   `createdAt`, `cogsOverride`). Updated to current schema (`defaultPrice`,
   `code`, `grams`, `unitCost`, `cogsOverrideIdr`). Tests would have failed
   even with a correct sell-through implementation.
3. **Wave 0 test used static `Date.UTC(2026, 2, 4)` (March 4)** which is now
   outside the query's 30-day rolling window. Switched to `Date.now() - N days`
   pattern matching the income-statement test fix.
4. **getChannelSellThrough also gained a shopee/tiktok branch** even though
   tests target `sellThroughQuery`. Done for symmetry — the existing per-
   product analytics consumers (RestockPlanner, etc.) will see Shopee/TikTok
   data without further changes.

## Self-Check: PASS

All success criteria met. Test suite GREEN.
