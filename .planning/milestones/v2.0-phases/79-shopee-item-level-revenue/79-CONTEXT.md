# Phase 79: Shopee Item-Level Revenue - Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the existing `externalRevenueItems` pipeline to cover BigSeller-sourced Shopee/TikTok orders. At sync time, write one item row per `skuVoList` entry so per-product analytics (ball counts, per-product COGS, sell-through, lifetime totals) work for Shopee/TikTok the same way they already do for GoJek/GoFood — without revenue-extrapolation estimates.

**In scope:** BigSeller sync emits items, retroactive SKU→menuProduct mapping cascades to items, daily 7-day re-sync cron, 24h "Pending SKU" UI, historical backfill button, capture buyer fields onto `bigsellerOrders` when API provides them, Shopee/TikTok branches in sell-through + lifetime + income-statement queries.

**Out of scope:** Creating/linking to `customers` table (capture is transaction-bound only), adding Shopee/TikTok COGS via `bigsellerOrders.costFee` (pre-existing open blocker, unrelated), any new BigSeller endpoints beyond what's already wired for pageList, **finished-goods inventory deduction for Shopee/TikTok sales** (deferred — see Deferred Ideas; requires a cross-channel refactor, not a Phase 79 side-effect).

</domain>

<decisions>
## Implementation Decisions

### Unit Price Derivation
- **D-01:** Per-item `unitPrice` is pro-rated by `menuProduct.price × skuNum` weighting of `orderAmount`. Residual rounding goes to the largest-qty item so `sum(items.totalPrice) === parent.revenueGross` exactly.
- **D-02:** When a SKU has no mapped `menuProduct` at sync time, fall back to flat share: `unitPrice = orderAmount / totalSkuNum`. Flag item as `isAutoMatched: false` so retroactive mapping later re-computes price.
- **D-03:** Build a `priceOracle` helper: aggregate historical single-SKU `bigsellerOrders` (where `skuVoList.length === 1`) into `effectivePrice[sku] = median(orderAmount / skuNum)`. Use oracle price first, `menuProduct.price` second, flat share last. Single-SKU × multi-qty orders are the dominant pattern for Frollie Shopee, so oracle will cover most cases.
- **D-04:** Revenue is NOT double-counted: parent `externalRevenue.revenueGross` remains the source of truth for channel totals. Items exist purely for attribution/analytics. Any query that sums both parent and items is a bug.

### Customer Data Capture
- **D-05:** Capture buyer fields on `bigsellerOrders` ONLY when the BigSeller API surfaces them in the existing pageList response (or a minimal order-detail call the researcher can justify). Add nullable columns: `buyerName`, `buyerPhone`, `buyerAddress` (all optional strings).
- **D-06:** No link to `customers` table this phase. No opt-in UI. Transaction-bound capture only — admin can see buyer info on the order row in Sales Analytics if BigSeller provides it.
- **D-07:** If researcher confirms pageList does NOT expose buyer fields and order-detail endpoint requires N extra API calls (one per order), **defer customer capture entirely** rather than add expensive per-order fetches.

### Retroactive SKU→menuProduct Mapping Cascade
- **D-08:** When admin maps `sku → menuProduct`, update ALL past and future `externalRevenueItems` rows matching that SKU via a single cascade mutation. No "future-only" opt-in.
- **D-09:** Parent `externalRevenue.linkedMenuProductId` for mixed-SKU orders = the **dominant SKU by qty** after cascade (max `skuNum` wins; ties broken by highest `menuProduct.price`). Single-SKU orders trivially set the parent id.
- **D-10:** Do not introduce `isManuallyMapped` flag this phase. Cascade overwrites auto-matched items freely. If manual overrides become needed later, add in a follow-up phase.

### Daily Cron
- **D-11:** Cron runs daily at **03:00 WIB** (off-peak in Indonesia). Re-syncs the trailing 7 days of BigSeller data.
- **D-12:** If `bigsellerSyncState.stage !== "idle"` when the cron fires, **skip this run** and write a `externalSyncLogs` entry with status=`error`, errorMessage=`"skipped: manual sync in progress"`. No retry/queue. User sees the skip in the sync history.
- **D-13:** Cron failures (non-conflict) write an `externalSyncLogs` error row with full message. No email/toast alert this phase.

### "Pending SKU" UI
- **D-14:** Threshold = **24h** from `orderTimeMs`. Rows where `allSkuNum === 0 || skuVoList.length === 0` AND age < 24h display label **"Pending SKU from Shopee"**.
- **D-15:** After 24h with still-empty SKU data, revert to bare `"--"` display. Admin recovery path is the "Re-check empty rows" button (see D-17).
- **D-16:** Label change applies to `BigSellerOrdersTable` and any other Shopee/TikTok row display (Sales Analytics detail views).

### Historical Backfill
- **D-17:** Backfill trigger = **prominent button inside `BigSellerSyncPanel`** (not a hidden Settings/admin page — this is Shopee-specific and belongs next to the sync UI).
- **D-18:** Scope: all `bigsellerOrders` with `skuVoList.length > 0`. Idempotent via existence check (`revenueId + sku` composite). Orders with empty `skuVoList` are skipped — no placeholder items created.
- **D-19:** Separate **"Re-check empty rows"** button in the same panel. Scope: `bigsellerOrders` where `skuVoList.length === 0` OR `allSkuNum === 0`. Action: fetch fresh pageList data for that order's date range, re-run `upsertOrders` (preserve-non-empty guard kicks in), then run backfill for any newly-populated rows.
- **D-20:** Both buttons show progress toast + final count (`"Created 143 items from 89 orders (2 skipped as duplicates)"`). Both are replayable — clicking again after success just creates zero new rows.
- **D-21:** Backfill creates **revenue items only** — no retroactive inventory deduction. Historical stock counts already reflect whatever adjustments admin has made; retroactive deduction would double-subtract. Inventory deduction (go-forward or historical) is explicitly out of scope.

### Inventory Deduction (Deferred but Flagged)
- **D-22:** Shopee/TikTok sales **do not deduct inventory** in this phase. Parallel deduction code (like `processGofoodSales`) is explicitly NOT added. Rationale: user wants a unified, channel-agnostic deduction mutation — see Deferred Ideas. Adding a Shopee-specific `processBigsellerSales` now would entrench the anti-pattern this follow-up is meant to fix.
- **D-23:** Current state documented so the follow-up phase has a clear map: GoFood deducts via `processGofoodSales` (outlet-linked location); GoJek direct orders deduct via order fulfillment flow; K3Mart has its own path; Shopee/TikTok deduct nothing. Consolidation target = one internal mutation, `source` + `menuProductId` + `qty` + `storageLocationId` (resolved from a per-source lookup table).

### Claude's Discretion
- Exact query used to compute `priceOracle` (SQL-shape aggregation, median vs mean, time window)
- Exact toast copy and progress reporting granularity
- Whether to use an internal action vs mutation for the cron (Convex runtime choice)
- Column layout / position for buyer fields in `BigSellerOrdersTable` if captured
- Error message wording for "skipped" cron conflict log

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 79 scope & intent
- `.planning/ROADMAP.md` §"Phase 79: Shopee Item-Level Revenue" — Goal, requirements (DA-05..DA-13), and 9 success criteria
- `.planning/debug/shopee-sku-mapping-quantity-and-14apr-blank.md` — Full diagnosis of every code path where Shopee's `skuNum` is currently discarded (sync, retroactive mapping, income statement, sell-through, lifetime helpers). This is the map of gaps this phase closes.

### BigSeller integration
- `docs/BIGSELLER_PROFIT_API.md` — pageList request schema, response fields (saleAmount, orderAmount, platformIncome, buyerShippingFee, customerPaymentAmount, etc.); researcher must determine whether buyer name/phone/address are exposed here or require order-detail endpoint
- `convex/integrations/bigseller/helpers.ts` §`mapOrderToRevenue`, `mapOrderToStorage`, `normalizePlatformFees` — Current field mapping; item emission must plug in alongside `mapOrderToRevenue` without changing parent revenue math
- `convex/integrations/bigseller/sync.ts` §`fetchOrders` stage — Where `saveRevenueItems` call needs to be added (see commit `9c9a2963` for the preserve-non-empty guard already in place)

### Per-item pipeline (existing pattern to mirror)
- `convex/externalData/mutations.ts` §`saveRevenueItems` (line 587) — Canonical item insert mutation. Shopee branch must reuse this, not a parallel variant.
- `convex/externalData/mutations.ts` §`applyRetroactiveProductMapping` (line 446) — Existing cascade logic; Phase 79 extends the Shopee/TikTok branches to propagate to items + parent dominant-SKU logic.
- `convex/externalData/helpers/lifetimeHelpers.ts` §`computeAvgRevenuePerBall`, `computeLifetimeTotals` — Reads `externalRevenueItems` for `item.quantity × ballsPerProduct`. Shopee will naturally start contributing real ball counts (not revenue-extrapolated) once items exist.
- `convex/reports/incomeStatement.ts` §`resolveItemsCOGS` (lines 133-170) — Per-product COGS aggregation. Shopee will start reporting real COGS once items exist.
- `convex/externalData/queries.ts` §sell-through product-level (lines 1031-1092, 1094+) — Planner must add `shopee` and `tiktok` branches alongside the existing `k3mart`, `gobiz`, `internal` branches (success criterion 3).

### Schema
- `convex/schema.ts` §`externalRevenueItems` (line 1140), §`bigsellerOrders` (line 1556), §`bigsellerSyncState` (line 1593) — Tables this phase writes to. New columns on `bigsellerOrders` for buyer fields are additive + optional.

### Prior-phase context (carried forward)
- `.planning/phases/70-data-accuracy-foundation/70-CONTEXT.md` — `externalRevenueItems` pipeline decisions for GoJek/GoFood; Shopee must maintain parity (no double-count, item quantity × BOM ballsPerProduct, etc.)
- `C:/Users/Irfan/.claude/projects/.../memory/MEMORY.md` §"Key Architecture Decisions" — `menuProductComponents.componentTypeId` is required; BOM is the source of truth for ball counts (criterion 4)

### Commit history
- `9c9a2963` (fix: Shopee SKU preserve, query-time mapping, per-platform fees) — Already-landed preserve-non-empty guard on `resolveSkuVoListOnUpdate` and query-time SKU resolution in `bigsellerOrders/queries.ts`. Phase 79 builds on this.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `internal.externalData.mutations.saveRevenueItems` — canonical item insert with match-confidence scoring; call it from the BigSeller sync's `fetchOrders` stage after each `saveRevenue` call
- `applyRetroactiveProductMapping` (convex/externalData/mutations.ts) — already iterates externalRevenueItems by source+productName; extend to also iterate by source+SKU so Shopee items (which have no productName from pageList) get caught
- `BigSellerSyncPanel` component — already exists; add "Backfill items" and "Re-check empty rows" buttons here with the same UI language as the existing sync controls
- `bigsellerOrders/queries.ts listOrders` — already resolves SKU→menuProduct at query time; this remains useful as a sanity display layer even once items exist
- `lifetimeHelpers.ts` + `incomeStatement.resolveItemsCOGS` + sell-through queries — **no code changes needed for lifetime/COGS** once items are emitted; they auto-pick up Shopee once rows exist. Only sell-through queries need new branches.

### Established Patterns
- **Sync emits parent + items pattern** — GoJek/GoFood do `saveRevenue` → then `saveRevenueItems` per line. Shopee mirror is a direct lift, no new pattern needed.
- **Idempotent upserts via composite key** — existing `saveRevenueItems` already dedupes by `(revenueId, externalItemId ?? productName)`; for Shopee, pass `sku` as `externalItemId`.
- **Admin backfill button + toast + count** — Phase 70 established this pattern for the direct-sales backfill button; replicate visual + wording conventions.
- **Preserve-non-empty guard** — commit `9c9a2963` introduced `resolveSkuVoListOnUpdate` on `bigsellerOrders` mutations; items emission must respect this (don't delete+recreate items on sync re-runs where skuVoList was preserved).

### Integration Points
- `convex/integrations/bigseller/sync.ts fetchOrders` — add `saveRevenueItems` call per order, after `saveRevenue`
- `convex/crons.ts` — add new cron entry for 03:00 WIB Shopee re-sync
- `convex/bigsellerOrders/mutations.ts` — new mutation `rescanEmptyRows` for the "Re-check empty rows" button
- `convex/schema.ts bigsellerOrders` — add optional `buyerName`, `buyerPhone`, `buyerAddress` (conditionally populated based on researcher's API finding)
- `convex/externalData/queries.ts` — add `shopee` + `tiktok` branches to sell-through product-level query
- `convex/externalData/mutations.ts applyRetroactiveProductMapping` — extend Shopee/TikTok branches: cascade to items by SKU, set parent linkedMenuProductId to dominant SKU
- `src/components/bigseller/BigSellerSyncPanel.tsx` (or wherever the panel lives) — add 2 new buttons
- `src/components/salesAnalytics/BigSellerOrdersTable.tsx` — change "--" to "Pending SKU from Shopee" for rows <24h; add buyer field columns if captured

</code_context>

<specifics>
## Specific Ideas

- **"Most Shopee orders are single-SKU × multiple units"** — the dominant real-world pattern. Pricing logic should be trivially correct in this case (oracle median from historical single-SKU orders will cover it). Multi-SKU orders are the edge case where pro-rata weighting matters.
- **"Very clear button inside the bigseller interface"** — backfill is not an admin-console afterthought. It lives in the same panel as the sync controls and looks like a first-class action.
- **"Re-check empty rows"** — user framed this as a distinct, separate action from the initial backfill. Two buttons, not one with a flag.
- **24h threshold, not 48h** — user explicitly tightened the ROADMAP-suggested 48h to 24h because the daily cron cadence makes 24h sufficient.

</specifics>

<deferred>
## Deferred Ideas

### 🚨 URGENT — Unified Cross-Channel Inventory Deduction (needs own phase)
**User-flagged urgent follow-up.** The current pattern is one deduction mutation per channel (`processGofoodSales` outlet-keyed; order-fulfillment flow for direct GoJek; K3Mart has its own path; Shopee/TikTok deduct nothing). User wants a **single, centralised, channel-agnostic** mutation that:
- Accepts `{ source, menuProductId, quantity, externalOrderRef }` and resolves the correct `storageLocationId` from a per-source routing table (configurable per channel — "pull from HQ for Shopee, pull from depot X for this GoFood outlet", etc.)
- Supports admin configuration of "where each channel pulls inventory from" (currently hardcoded as outlet-linked for GoFood, implicit for others)
- Respects Phase 78 substitution logic uniformly
- Negative-stock-allowed behavior preserved (recognition never blocks)
- Replaces `processGofoodSales` and adds Shopee/TikTok coverage as free side-effects
- Once built, **Phase 79's BigSeller sync will call this new mutation post-`saveRevenueItems`**

**Recommended as next phase after 79** — add to roadmap/backlog explicitly. Without this, Shopee inventory drifts from reality every day.

### Other deferred items
- **Linking captured buyer fields to `customers` table** — Not this phase. User explicitly wants transaction-bound capture only. Revisit when we do B2C CRM work.
- **Manual-override protection (`isManuallyMapped` flag)** — Not this phase. Cascade freely overwrites. Add later if admins start hand-editing mappings and want them preserved.
- **Shopee/TikTok `bigsellerOrders.costFee` configuration** — Pre-existing open blocker (per MEMORY.md). Not part of Phase 79 scope.
- **Alerting on cron failures** — Logged only this phase. Toast/email alerting would be a cross-cutting concern (fits better in Phase 77 Data Health Dashboard).
- **Order-detail endpoint integration** — If researcher finds pageList lacks buyer fields, skip the extra endpoint this phase. Revisit if customer analytics becomes a priority.

</deferred>

---

*Phase: 79-shopee-item-level-revenue*
*Context gathered: 2026-04-14*
