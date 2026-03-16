---
status: awaiting_human_verify
trigger: "Three related bugs in Sales Analytics dashboard channel breakdown from BigSeller external data: Shopee wrong gross (only latest order), net 10x higher than gross, transactions=0, AOV=0; Consignment 0 transactions/AOV; BigSeller raw data quality issues"
created: 2026-03-16T00:00:00Z
updated: 2026-03-16T02:00:00Z
---

## Current Focus

hypothesis: CONFIRMED and FIXED -- Three root causes identified, fixed, and self-verified
test: All 985 tests pass, build succeeds, type-check clean
expecting: User to verify channel breakdown numbers after deploying + running migration + re-sync
next_action: User verification

## Symptoms

expected:
- Shopee channel card should sum ALL Shopee orders for gross revenue
- Net revenue should be <= gross revenue
- Transaction count should reflect actual number of orders
- AOV should be gross / transactions
- Same for Consignment channel
- BigSeller data fields should have real values, not Rp 0

actual:
- Shopee gross = Rp 196,200 (only latest order, not sum)
- Shopee net = Rp 1,971,500 (1005% of gross - impossible)
- Shopee transactions = 0, AOV = Rp 0
- Consignment: gross = Rp 1,800,000 but transactions = 0, AOV = Rp 0
- TikTok negative commission: -Rp 27,000
- Many Shopee orders show Rp 0 for commission/shipping/profit fields

errors: No error messages - dashboard renders with wrong numbers

reproduction: Open Sales Analytics > Channel Breakdown section

started: Likely introduced or exposed by Phase 54 changes (BigSeller platform-specific endpoint schema mismatches)

## Eliminated

- hypothesis: Frontend display logic is wrong
  evidence: ChannelSummary.tsx correctly renders whatever data the backend provides. AOV formula is correct (gross/transactions). Issue is in backend data.
  timestamp: 2026-03-16T00:30:00Z

- hypothesis: BigSeller sync is not creating externalRevenue records
  evidence: saveRevenue mutation does create records. Dedup skips existing records but does insert new ones. Multiple records exist per platform.
  timestamp: 2026-03-16T00:35:00Z

## Evidence

- timestamp: 2026-03-16T00:20:00Z
  checked: mapOrderToRevenue in convex/integrations/bigseller/helpers.ts
  found: Function never sets transactionCount field. Each BigSeller order = 1 transaction, but transactionCount is undefined in externalRevenue.
  implication: Direct cause of transactions=0 for Shopee/TikTok channels

- timestamp: 2026-03-16T00:22:00Z
  checked: consignment/mutations.ts line 188-198 (createSettlement)
  found: Consignment externalRevenue insert also omits transactionCount
  implication: Direct cause of transactions=0 for Consignment channel

- timestamp: 2026-03-16T00:25:00Z
  checked: dashboardHelpers.ts line 37 aggregatePlatformChannel
  found: Uses `r.transactionCount ?? 0` fallback (defaults to 0 when undefined)
  implication: INCONSISTENT with all other aggregation code which uses ?? 1:
    - lifetimeHelpers.ts:72 uses ?? 1
    - incomeStatement.ts:245,275 uses ?? 1
    - queries.ts:1061,1333 uses ?? 1
    Only dashboardHelpers (channel breakdown) uses ?? 0, causing the bug

- timestamp: 2026-03-16T00:30:00Z
  checked: saveRevenue mutation (externalData/mutations.ts line 84-102)
  found: Dedup logic skips existing records entirely (continue). Does NOT update/upsert.
  implication: Phase 54's improved revenueGross mapping (orderAmount instead of saleAmount) never reached existing records. Old records keep pre-Phase 54 values.

- timestamp: 2026-03-16T00:35:00Z
  checked: Phase 54 git diff for mapOrderToRevenue
  found: Pre-Phase54: revenueGross = order.saleAmount || 0. Post-Phase54: revenueGross = order.orderAmount ?? order.saleAmount ?? 0. Old data in externalRevenue has saleAmount-based gross. bigsellerOrders got updated (upsert), but externalRevenue skipped (dedup).
  implication: Stale externalRevenue records have wrong revenueGross values. Net (platformIncome) includes shipping but gross (saleAmount) doesn't, causing net > gross.

- timestamp: 2026-03-16T00:40:00Z
  checked: Pre-Phase54 source resolution
  found: mapOrderToRevenue used `order.platform?.toLowerCase() || "shopee"`. Platform-specific endpoints set order.platform=null. So ALL BigSeller orders (both Shopee AND TikTok) got source="shopee" in externalRevenue pre-Phase54.
  implication: Old TikTok revenue records are classified as "shopee" in externalRevenue (BUG-02 from Phase 54). New records get correct source. This creates data inconsistency.

- timestamp: 2026-03-16T01:30:00Z
  checked: GrabFood mutations (grabfoodOrders/mutations.ts)
  found: GrabFood also missing transactionCount on externalRevenue inserts (2 locations)
  implication: Fixed alongside BigSeller and consignment for completeness

## Resolution

root_cause: Three interlocking bugs:
1. **transactionCount never set** -- mapOrderToRevenue (BigSeller), createSettlement (consignment), and grabfoodOrders mutations never set transactionCount. Each record = 1 order but field is undefined.
2. **dashboardHelpers uses ?? 0 fallback** -- aggregatePlatformChannel and internalTxns reduce default undefined transactionCount to 0 instead of 1. ALL other query files use ?? 1. dashboardHelpers was the ONLY aggregation using ?? 0.
3. **saveRevenue dedup doesn't update** -- existing externalRevenue records were skipped on re-sync (dedup skip), so Phase 54's improved revenueGross mapping (orderAmount instead of saleAmount) never reached old data. Old records have saleAmount-based gross (product only) while net = platformIncome (incl. shipping), causing net > gross.

fix: Applied 6 changes:
1. dashboardHelpers.ts: `transactionCount ?? 0` -> `?? 1` (2 locations: platform + internal)
2. bigseller/helpers.ts mapOrderToRevenue: added `transactionCount: 1`
3. bigseller/sync.ts: pass transactionCount through to saveRevenue
4. consignment/mutations.ts: added `transactionCount: 1` to externalRevenue insert
5. grabfoodOrders/mutations.ts: added `transactionCount: 1` (2 locations)
6. externalData/mutations.ts saveRevenue: changed skip-on-dedup to upsert (patches revenueGross, revenueNet, commission, transactionCount, period fields)
7. Created migration: migrations/bigsellerRevenueBackfill.ts to fix existing stale records
8. Updated tests: dashboardHelpers test for ?? 1 fallback, bigseller helpers test for transactionCount, externalData test for upsert behavior

verification: 985 tests pass, type-check clean, build succeeds

files_changed:
- convex/externalData/helpers/dashboardHelpers.ts
- convex/externalData/queries.ts
- convex/externalData/mutations.ts
- convex/integrations/bigseller/helpers.ts
- convex/integrations/bigseller/sync.ts
- convex/consignment/mutations.ts
- convex/grabfoodOrders/mutations.ts
- convex/migrations/bigsellerRevenueBackfill.ts (new)
- convex/externalData/__tests__/dashboardHelpers.test.ts
- convex/integrations/bigseller/__tests__/helpers.test.ts
- tests/convex/externalData.test.ts
