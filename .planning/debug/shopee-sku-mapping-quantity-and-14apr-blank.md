---
status: investigating
trigger: "Shopee SKU mapping quantity + 14 Apr blank row — diagnose only"
created: 2026-04-14
updated: 2026-04-14
---

## Current Focus

hypothesis: Q1 — Query-time mapper resolves SKU→menuProductId but may count 1 per row; Q2 — 14 Apr row is from Shopee income (settlement) vs order-item path, SKU never present.
test: Read commit 9c9a2963 and Shopee integration + query-time mapper code path
expecting: Confirm whether quantity multiplier is applied, and identify data source for 14 Apr row
next_action: git show 9c9a2963 + read shopee integration files

## Symptoms

expected:
  - Row with SKU FRO-DubChe-Reg1 qty 4 should contribute 4 units of Dubai - Single (45g)
  - 14 Apr 2026 Shopee row should show SKU + mapped product

actual:
  - 13 Apr rows show SKU "FRO-DubChe-Reg1 × 4" → Dubai - Single (45g)
  - 14 Apr Shopee row shows "--" for both SKU and product; revenue populated

errors: none
reproduction: SalesAnalytics / external revenue list, filter Shopee, compare 13 vs 14 Apr
started: noticed 2026-04-14

## Eliminated

## Evidence

- checked: convex/bigsellerOrders/queries.ts:49-136 (listOrders query-time join)
  found: resolvedSkus includes {sku, skuNum, returnNum, mappedMenuProductId, mappedMenuProductName}. skuNum is passed through to the UI but the join ITSELF does nothing beyond name resolution.
  implication: Q1 — mapping layer knows the quantity per line; question moves to downstream analytics.

- checked: src/components/salesAnalytics/BigSellerOrdersTable.tsx:286-408
  found: UI renders `sku × skuNum` as pure display. resolvedSkus is not used for any analytics aggregation inside this component.
  implication: Q1 — the × 4 is display-only in this table; real quantity usage is elsewhere (lifetimeHelpers, incomeStatement).

- checked: convex/integrations/bigseller/sync.ts:688-716 + helpers.ts:368-406 (mapOrderToRevenue)
  found: BigSeller sync creates ONE externalRevenue record per order (revenueGross = orderAmount, transactionCount = 1). Sync does NOT call saveRevenueItems. No externalRevenueItems are created for Shopee/TikTok orders.
  implication: The Shopee line-item quantity (× 4) lives ONLY in bigsellerOrders.skuVoList[i].skuNum. It is never transferred into the externalRevenueItems table that analytics read.

- checked: convex/externalData/helpers/lifetimeHelpers.ts:46-66 (computeAvgRevenuePerBall) and :77-105 (computeLifetimeTotals)
  found: Iterates externalRevenueItems — `knownBalls += item.quantity * ballsPerProduct`. BOM ball count IS multiplied by item.quantity. But Shopee contributes ZERO items to this table, so the Shopee × 4 never enters knownBalls.
  implication: For Shopee, lifetime totalBalls = round(lifetimeRevenue / avgRevenuePerBall). Ball count is estimated from revenue, not from skuNum. The × 4 display is irrelevant to ball totals; only gross revenue matters.

- checked: convex/externalData/mutations.ts:446-495 (applyRetroactiveProductMapping)
  found: When a Shopee SKU is mapped to a menuProduct, the code patches externalRevenue.linkedMenuProductId (line 487) — a SINGLE id on the parent revenue doc, not per-item with quantity. Also patches externalRevenueItems by source+productName (which for BigSeller-origin rows is the empty set).
  implication: Mapping a Shopee SKU records WHICH product, never HOW MANY. Quantity is discarded at this layer.

- checked: convex/reports/incomeStatement.ts:133-170 (resolveItemsCOGS)
  found: COGS is computed from `externalRevenueItems` only: `productCogs * item.quantity`. Shopee has no items. Shopee revenue lands in the channel bucket by source, but COGS is "missing" unless bigsellerOrders.costFee is configured.
  implication: Confirms Q1 answer — quantity is respected in item-level aggregations, but Shopee bypasses item-level entirely. Per-channel COGS for Shopee relies on bigsellerOrders.costFee (currently 0 for Frollie — pre-existing open blocker per memory).

- checked: convex/externalData/queries.ts:1031-1092 (sell-through product-level)
  found: Only k3mart, gobiz, internal branches exist. No shopee/tiktok branch — Shopee never contributes to product-level sell-through counts.
  implication: Another downstream metric where Shopee skuNum is invisible.

- checked: src/components/salesAnalytics/BigSellerOrdersTable.tsx:302-345 ("Pending SKU" vs "--" display)
  found: "Pending SKU" shows only when `allSkuNum > 0 && resolvedSkus.length === 0`. Bare `--` shows when both are zero. User's 14 Apr row shows `--`, not "Pending SKU" — meaning allSkuNum is also 0.
  implication: BigSeller returned this order WITHOUT any SKU unit count (not a preserve-empty case; never had data to begin with).

- checked: convex/bigsellerOrders/mutations.ts:22-30 + 74-96 (resolveSkuVoListOnUpdate + upsertOrders)
  found: The preserve-non-empty guard only runs on UPDATE. On fresh INSERT, whatever BigSeller sent (including empty skuVoList and allSkuNum=0) is stored as-is.
  implication: First-time pull of a Shopee order can legitimately land with zero SKU data. Subsequent re-syncs will either overwrite with real data or the preserve guard will hold the line.

- checked: convex/crons.ts
  found: Only "sync internal orders revenue" cron (hourly). No BigSeller cron. BigSeller sync is 100% user-manual via BigSellerSyncPanel.
  implication: Whether a day's row appears populated depends entirely on when the user last clicked "Start sync". A 14 Apr row with `--` means a sync was run that covered 14 Apr but BigSeller had no SKU breakdown yet for that order (typical for same-day/in-flight Shopee orders — unpaid, packing, not yet shipped).

- checked: convex/integrations/bigseller/helpers.ts:59 (orderState filter in buildPageListBody)
  found: BigSeller pageList fetches orderState: ["completed", "shipped", "canceled", "other", "new"]. "new" orders are included — these are orders where Shopee has not yet confirmed SKU breakdown.
  implication: A newly-created Shopee order on 14 Apr can be fetched with revenue amount but empty SKU data. The next sync after Shopee marks it shipped/completed should populate skuVoList.

## Resolution

root_cause: See final report — two separate causes for Q1 and Q2.
fix: n/a (diagnose-only)
verification: code inspection; no runtime queries executed
files_changed: []
