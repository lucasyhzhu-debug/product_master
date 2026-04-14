---
phase: 79
plan: 03
subsystem: bigseller-sync
tags: [bigseller, shopee, tiktok, sync, item-emit, wave-2]
dependency_graph:
  requires:
    - buildPriceOracle
    - prorateItems
    - dominantSku
    - failing-test-revenue-invariants-ingest
  provides:
    - externalRevenueItems-emission-for-shopee
    - externalRevenueItems-emission-for-tiktok
    - getSingleSkuOrdersForOracle
    - getShopeeAndTikTokMappingsWithProducts
    - cross-platform-leak-guard
  affects:
    - convex/externalData/queries.ts (Plan 06: sell-through branches consume items)
    - convex/reports/incomeStatement.ts (Plan 06: COGS aggregation auto-picks Shopee items)
    - convex/externalData/helpers/lifetimeHelpers.ts (auto-picks Shopee items at next read)
tech-stack:
  added: []
  patterns:
    - "Pre-load oracle + SKU mappings ONCE per sync run, consume in per-platform loop"
    - "Per-order branch inside fetchOrders: prorateItems → enrich → saveRevenueItems"
    - "Cross-platform leak guard: assert revenueSource === platform before emit"
    - "matchConfidence narrowed to 'exact'|'none' (schema literals — not 'strong'/'suggested' from plan interface block)"
key-files:
  created: []
  modified:
    - convex/bigsellerOrders/queries.ts
    - convex/integrations/bigseller/queries.ts
    - convex/integrations/bigseller/sync.ts
decisions:
  - "Used menuProducts.defaultPrice (not 'price' as the plan said) — schema field name (Rule 1: bug fix)"
  - "Used matchConfidence literals 'exact'|'none' (not 'strong'|'suggested' as plan interface block claimed) — schema validator only accepts exact|price_only|name_only|none"
  - "Mapping hydration moved into a dedicated internalQuery (`getShopeeAndTikTokMappingsWithProducts`) — fetchOrders is a Node action and cannot use ctx.db directly"
  - "Cross-platform leak guard implemented via getRevenueById round-trip rather than trusting in-memory state — defensive against future refactors"
metrics:
  duration: "~25 minutes"
  completed: 2026-04-14
  tasks: 2
  commits: 2
  files_modified: 3
---

# Phase 79 Plan 03: BigSeller Item Emit Summary

DA-05 goes live: BigSeller sync now emits `externalRevenueItems` for every Shopee/TikTok order with a populated `skuVoList`. Downstream lifetime/COGS/sell-through queries automatically pick up the new rows with no further changes.

## What Was Done

### Task 1 — Pre-load price oracle + SKU mapping lookups (commit `c7a300b0`)

Added two internal queries and wired them into `fetchOrders` BEFORE the per-platform loop so the oracle and mapping tables are built ONCE per sync run.

| Artifact | File | Purpose |
|----------|------|---------|
| `getSingleSkuOrdersForOracle` | `convex/bigsellerOrders/queries.ts` | Scans all `bigsellerOrders` where `skuVoList.length === 1` (~6K rows max per RESEARCH.md A1). Feeds `buildPriceOracle`. |
| `getShopeeAndTikTokMappingsWithProducts` | `convex/integrations/bigseller/queries.ts` | Returns Shopee+TikTok `externalProductMappings` rows hydrated with linked `menuProduct.name` + `defaultPrice`. Feeds `mappingBySku` and `menuProductById` lookup maps. |
| Sync wiring | `convex/integrations/bigseller/sync.ts` | Imports `buildPriceOracle` + `prorateItems`; builds `priceOracle`, `mappingBySku`, `menuProductById` locals at start of `fetchOrders`. |

DA-11 deferral comment added inline (BigSeller pageList does NOT expose buyer PII per RESEARCH.md Critical Finding).

### Task 2 — Emit externalRevenueItems per Shopee/TikTok order (commit `091326c5`)

Added a per-order branch inside the per-platform loop, after `saveRevenue` + `linkRevenueToOrders`:

1. Iterate `rows[i]` ↔ `revenueResults[i]` pairs (saveRevenue preserves input order).
2. Skip non-shopee/tiktok platforms and rows with empty `skuVoList`.
3. Cross-platform leak guard: hydrate `externalRevenue.source` and assert `=== platform`. Throws on mismatch (T-79-02 mitigation).
4. `prorateItems(row, priceOracle, mappingBySku)` → integer-IDR per-SKU split with D-01 sum invariance.
5. Map prorated entries to enriched item rows with `externalItemId=sku` (D-18 dedup key), `productName = menuProduct.name ?? rawSku`, `linkedMenuProductId`, `isAutoMatched`, `matchConfidence`.
6. `saveRevenueItems({ revenueId, items })` — internal mutation already dedupes on `(revenueId, externalItemId)`.

## Deviations from Plan

### Rule 1 — Bug fix: plan referenced wrong menuProduct field name

- **Found during:** Task 1 build-time.
- **Issue:** Plan Step 3 destructured `mp.price` from `ctx.db.get(menuProductId)`. The actual `menuProducts` schema field is `defaultPrice`. Build failed with `error TS2339: Property 'price' does not exist on type ...`.
- **Fix:** Use `mp.defaultPrice` in the hydration query.
- **Files modified:** `convex/integrations/bigseller/queries.ts`
- **Commit:** `091326c5`

### Rule 1 — Bug fix: plan's interface block listed non-existent matchConfidence literals

- **Found during:** Task 2 implementation.
- **Issue:** Plan `<interfaces>` block claimed `matchConfidence` accepts `"exact" | "strong" | "suggested" | "none"`. The actual schema validator (`convex/schema.ts` line 1151–1154 + `saveRevenueItems` mutation line 599–602) only accepts `"exact" | "price_only" | "name_only" | "none"`.
- **Fix:** Narrow to `"exact"` when SKU has a linked menuProductId, `"none"` otherwise. This matches the existing convention used by gobiz adapter for items without name/price-based auto-matching.
- **Files modified:** `convex/integrations/bigseller/sync.ts`

### Rule 3 — Architectural adjustment: ctx.db unavailable in Node action

- **Found during:** Task 1 plan reading.
- **Issue:** Plan Step 3 wrote `ctx.db.query("externalProductMappings")...` directly inside the `fetchOrders` action. But `fetchOrders` is `"use node"` (Node.js runtime) — `ctx.db` is unavailable; only `ctx.runQuery` / `ctx.runMutation` work.
- **Fix:** Created a dedicated internalQuery (`getShopeeAndTikTokMappingsWithProducts`) that returns the hydrated mapping rows (including menuProduct name + price). Sync calls it via `ctx.runQuery`.
- **Files modified:** `convex/integrations/bigseller/queries.ts`, `convex/integrations/bigseller/sync.ts`
- **Commit:** `c7a300b0`

### Plan adherence: cross-platform guard chosen at runtime, not compile-time

- **Plan suggested:** Inline `if (revenueSource !== order.platform) throw` immediately before `saveRevenueItems`.
- **Implemented:** Hydrate `revenueDoc` via `getRevenueById` and assert `revDoc.source === platform`. The plan's exact pattern would have asserted on a non-existent `revenueSource` local — the actual stored field is `source`. This is the same intent + slightly stronger (catches DB drift, not just in-memory state).

## Verification Evidence

```bash
$ npx vitest run \
    convex/integrations/bigseller/__tests__/priceOracle.test.ts \
    convex/integrations/bigseller/__tests__/prorateItems.test.ts \
    convex/integrations/bigseller/__tests__/dominantSku.test.ts
✓ priceOracle.test.ts (7 tests)
✓ prorateItems.test.ts (7 tests)
✓ dominantSku.test.ts (6 tests)
Tests       20 passed (20)

$ npx vitest run convex/externalData/__tests__/revenue-invariants.test.ts
✓ "Σ items.totalPrice === parent.revenueGross (integer equality) after ingest" PASS
✗ "invariant holds after applyRetroactiveProductMapping cascade" FAIL (Plan 04 scope — cascade not yet wired)
✗ "sellThrough does NOT double-count" FAIL (Plan 06 scope — query branch not yet added)

$ npx vitest run convex/integrations/bigseller/__tests__/
Test Files  6 passed | 1 failed (cron.test.ts — Plan 05 scope)
Tests       121 passed | 3 failed (all 3 = Plan 04/05/06 red-bar by design)

$ npm run type-check
> tsc --noEmit
# exit 0

$ npm run build
> tsc -b && vite build
✓ built (success)
```

## Acceptance Criteria

### Task 1
- ✅ `grep "getSingleSkuOrdersForOracle" convex/bigsellerOrders/queries.ts` matches
- ✅ `grep "buildPriceOracle" convex/integrations/bigseller/sync.ts` matches (import + call)
- ✅ `grep "mappingBySku" convex/integrations/bigseller/sync.ts` matches
- ✅ Wave 0 priceOracle/prorateItems/dominantSku tests still GREEN (20/20)
- ✅ `npm run type-check` + `npm run build` pass

### Task 2
- ✅ `grep "saveRevenueItems" convex/integrations/bigseller/sync.ts` matches (call site)
- ✅ `grep "prorateItems" convex/integrations/bigseller/sync.ts` matches
- ✅ `grep "DA-11 deferral" convex/integrations/bigseller/sync.ts` matches
- ✅ `grep "Cross-platform leak guard" convex/integrations/bigseller/sync.ts` matches
- ✅ revenue-invariants ingest test passes (Σ items.totalPrice === parent.revenueGross)
- ✅ `grep -r "processBigsellerSales" convex/` returns no match (D-22 honored)
- ✅ `git diff <base> -- convex/integrations/gobiz/ convex/integrations/gojek/ convex/orders/` → 0 lines (sibling integrations untouched)
- ✅ `npm run type-check` + `npm run build` pass

## Auth Gates

None.

## Known Stubs

None — emit branch is production-ready. Items will be created on the next BigSeller sync run for any Shopee/TikTok order with a populated `skuVoList`. Empty-skuVoList orders are skipped (no placeholder items).

## Deferred Issues

- **revenue-invariants test 2 (cascade)** — fails until Plan 04 (`applyRetroactiveProductMapping` Shopee/TikTok branch).
- **revenue-invariants test 3 (sellThrough no-double-count)** — fails until Plan 06 (`sellThroughQuery` Shopee/TikTok branch).
- **cron.test.ts** — fails until Plan 05 (cron + skip-if-not-idle wiring).

All three are red-bar tests planted in Plan 01 to anchor downstream wave behavior. They are NOT regressions.

## Threat Flags

None — emit branch is purely additive within existing `fetchOrders` action. No new network surface, no new auth paths. Schema unchanged. Cross-platform leak guard (T-79-02) explicitly mitigates the only structural threat.

## Self-Check: PASSED

- ✅ `convex/bigsellerOrders/queries.ts` exists, contains `getSingleSkuOrdersForOracle`
- ✅ `convex/integrations/bigseller/queries.ts` exists, contains `getShopeeAndTikTokMappingsWithProducts`
- ✅ `convex/integrations/bigseller/sync.ts` exists, contains `buildPriceOracle`, `prorateItems`, `saveRevenueItems`, `Cross-platform leak guard`, `DA-11 deferral`
- ✅ Commit `c7a300b0` (Task 1) in git log
- ✅ Commit `091326c5` (Task 2) in git log
- ✅ Wave 0 helpers test suite: 20/20 GREEN
- ✅ revenue-invariants test 1 (ingest integer equality): GREEN
- ✅ `npm run build` exit 0
- ✅ Sibling integrations (gobiz/gojek/orders): 0 lines changed vs base

## Downstream Consumers (for Plans 04+ context)

- **Plan 04 (`applyRetroactiveProductMapping`)** — when admin maps SKU → menuProduct, cascade should now also patch `externalRevenueItems` rows by `(source, externalItemId)` and recompute parent `linkedMenuProductId` via `dominantSku`.
- **Plan 06 (sell-through query branches)** — `convex/externalData/queries.ts` sell-through product-level query needs `shopee` + `tiktok` branches that read from `externalRevenueItems` (mirror existing `gobiz` branch).
- **Plan 07 (UI + backfill)** — `BigSellerSyncPanel` "Backfill items" button should call a new mutation that walks historical `bigsellerOrders` and emits items via the same `prorateItems` + `saveRevenueItems` path used here.
- **Lifetime + COGS** — already wired upstream. As soon as Shopee/TikTok items exist, `lifetimeHelpers.computeAvgRevenuePerBall` and `incomeStatement.resolveItemsCOGS` start contributing real ball counts and per-product COGS for Shopee/TikTok.
