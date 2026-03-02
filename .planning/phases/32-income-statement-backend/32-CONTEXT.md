# Phase 32: Income Statement Backend - Context

**Gathered:** 2026-03-02 (updated after discussion)
**Status:** Ready for planning
**Source:** Design doc `docs/plans/2026-03-01-income-statement-design.md` (post-staffreview) + user discussion

<domain>
## Phase Boundary

Compute a complete weekly income statement from existing data: revenue per channel, revenue deductions, full BOM COGS (production + packaging), gross profit, confidence classification, and data quality gap identification. Backend-only phase -- no UI, no schema changes. Read-only query.

</domain>

<decisions>
## Implementation Decisions

### Revenue Aggregation
- Reuse `getDashboardSummaryByPeriodInternal` pattern for channel revenue aggregation (gross, net, commission, adBurn, promoBurn)
- Extend to accept arbitrary week date ranges (current query only accepts PeriodPreset)
- Internal order discount correction via existing `fetchInternalOrderDataMap` pattern
- Consignment revenue from `consignmentSettlements` where `periodStart` falls within target week (no proration for multi-week settlements)
- Consignment displayed as single "Consignment" channel (not per-outlet breakdown)
- Include ALL consignment settlements (pending + paid) where periodStart falls in week -- revenue is earned when the settlement period falls in the week, regardless of payment status

### Revenue Deductions
- Customer discounts: `orders.totalAmount - (finalTotal - deliveryFee)` -- discount is applied to product value only, delivery fee is separate and not discounted
- Platform commissions: `externalRevenue.commission` (GoFood, Shopee, TikTok)
- GoFood ad spend: `externalRevenue.adBurn`
- GoFood promo burn: `externalRevenue.promoBurn`
- Consignment rev share: show `totalRevenue` in gross, `revShareAmount` as a deduction line (consistent with how platform commissions are shown)
- Seller shipping fees: NOT synced yet -- omit from deductions until data exists (known gap, not a placeholder row)
- Voucher discounts: already reflected in `orders.finalTotal` -- the discount formula captures them automatically, no separate treatment needed

### Delivery Fee Handling
- Delivery fees are excluded from the P&L -- they are pass-through to shipping, not Frollie product revenue
- Gross revenue = product value only (totalAmount minus delivery portion)
- Platform channels (Shopee, TikTok, GoFood) already exclude delivery in `externalRevenue.revenueGross`

### COGS Resolution
- Full BOM COGS (production + packaging) via `buildProductCOGSMap` helper
- BOM preloading into in-memory maps (follows `getLifetimeTotalsInternal` pattern): parallel preload `menuProductComponents` + `componentTypes`, build per-product COGS map, O(1) lookups
- COGS resolved per revenue item (quantity * product COGS per unit), not aggregated per-product first
- `buildProductCOGSMap` returns production/packaging/total split only (no ingredient-level detail -- that stays in product editor)
- Unmapped items (no `linkedMenuProductId`): revenue counted, COGS = 0, confidence = "missing"
- No estimation from product names -- honest zero COGS with gap analysis flag

### Internal Order COGS
- COGS timing is intentionally mixed: internal orders use snapshot costs, external channels use current BOM costs
- Internal orders: production COGS from `orderItems.unitCost` snapshot + packaging COGS from current BOM
- Use `externalRevenueItems` as the consistent data path for internal orders (same as external channels -- `externalRevenueItems` has `linkedMenuProductId` for BOM resolution)
- COGS resolved per-item (each orderItem gets separate COGS resolution -- different products have different costs)

### Confidence Classification
- `exact`: Direct transaction data (orders, API sync)
- `calculated`: Derived from BOM (ingredient costs -> COGS)
- `inferred`: Estimated (K3Mart stock delta revenue)
- `missing`: Data source unavailable or unmapped product COGS

### Gap Analysis (Inline)
- Combined into single P&L query return (not separate query)
- Lists: unmapped product names + count, zero-cost component types, missing channel warnings
- Depth: both counts AND specific product names (actionable for user)
- Include per-product COGS breakdown within each channel for frontend drill-down capability (Phase 33)

### Query Design
- Single query: `getWeeklyIncomeStatement({ weekStart })` returns P&L + gap analysis
- `weekStart` = epoch ms for Monday of target week (WIB timezone)
- Also fetches previous week for comparison (delta %)
- Week boundaries: Monday 00:00 WIB -> Sunday 23:59 WIB
- File location: `convex/reports/incomeStatement.ts`

### Edge Cases (Confirmed)
- **BOM mid-week changes:** Accept retroactive application of current BOM costs -- BOM changes are rare, not worth over-engineering
- **Cancelled orders:** Follow existing sync logic -- whatever was synced to `externalRevenue` stays; the sync handles cancellation cleanup
- **Week boundary orders:** Use `externalRevenue.periodStart` as the week assignment timestamp -- consistent with `by_period` index
- **Returns:** Handle returns based on `transactionType` field in externalRevenueItems -- Claude verifies existing handling and applies consistently
- **Zero net revenue:** Gross margin shows "N/A" (not NaN/Infinity)
- **Negative net revenue:** Valid when deductions exceed gross -- display as negative number
- **Empty week:** All values = 0, no crash
- **Consignment spanning weeks:** Only attributed to week containing `periodStart` (no proration, documented limitation)

### Claude's Discretion
- Whether to extend `getDashboardSummaryByPeriodInternal` to accept raw date ranges or extract shared aggregation logic into a helper
- Whether to add `by_period` index to `consignmentSettlements` schema (small table, full scan acceptable) or filter in-memory
- Internal helper organization (inline vs. extracted functions)
- Previous week comparison caching strategy (if any)
- Exact returns handling approach (verify existing `transactionType` handling in sync code)
- Whether to flag products with `cogsMissingCount > 0` (incomplete ingredient cost data) in gap analysis

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `calculateMenuProductCOGS(components)` in `convex/lib/costCalculator.ts`: Per-product COGS from component array (production + packaging split). New `buildProductCOGSMap` batches this for all products.
- `getDashboardSummaryByPeriodInternal` in `convex/externalData/queries.ts:495`: Revenue aggregation with discount correction, channel breakdown, commission/adBurn/promoBurn. Only accepts `PeriodPreset` -- needs adaptation for arbitrary week ranges.
- `fetchInternalOrderDataMap` in `convex/externalData/queries.ts:19`: Batch lookup for internal order discount/delivery correction via `Promise.all`.
- `calculatePeriodRange` + `getWibComponents` + `wibMidnightToUtc` in `convex/lib/periodRange.ts`: WIB timezone helpers for day boundaries.
- `sourceToPlatform` in `convex/externalData/queries.ts:1526`: Source -> display name mapping (8 sources).
- `getLifetimeTotalsInternal` in `convex/externalData/queries.ts:1762`: BOM preloading pattern -- parallel scan of `menuProductComponents` + `componentTypes`, build maps, O(1) lookups.

### Established Patterns
- Revenue fetching: `by_period` index on `externalRevenue` table
- BOM preloading: `getLifetimeTotalsInternal` pattern -- collect all BOM data, build in-memory maps, O(1) lookups per item
- Single-pass aggregation: `for...of` loops over records, accumulating totals (not chained `.reduce()`)
- Internal order discount correction: lookup real order for pre-discount totals, fallback to revenue record if order deleted
- `Promise.all` for concurrent independent index lookups

### Integration Points
- `convex/reports/` directory: Contains `dailySales.ts`. New `incomeStatement.ts` goes here.
- `consignmentSettlements` table: Has `by_outlet` index, NO `by_period` index. Small table (~50 records), full scan + filter is acceptable.
- `menuProductComponents` + `componentTypes`: BOM tables (< 200 rows each). Preloaded once per query.
- `externalRevenueItems`: Line-item detail for per-item BOM resolution on ALL channels (internal + external).

</code_context>

<specifics>
## Specific Ideas

- Design doc specifies exact line item structure (Section 4) and UI mockup (Section 6) -- frontend consumes this query response in Phase 33
- "No schema changes" is a design constraint -- read-only feature, safe `git revert` rollback
- Use `/frontend-design` skill for Phase 33 UI design (user request)
- Query response should include per-product COGS data within each channel to enable Phase 33 drill-down capability
- Consignment gross + rev share deduction pattern mirrors platform commission pattern -- keeps the P&L structure consistent

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope. Future items already tracked in design doc Section 7:
- Bank transaction import (OpEx -> EBIT) -- v1.6
- Monthly/quarterly views -- follow-up
- Budget vs. actual -- after OpEx tracking
- Seller shipping fee sync -- external platform work
- Print-friendly P&L -- follow-up
- Per-outlet consignment breakdown -- could be added to P&L if needed

</deferred>

---

*Phase: 32-income-statement-backend*
*Context gathered: 2026-03-02*
