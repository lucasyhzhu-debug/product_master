# Phase 54: Fix BigSeller Platform-Specific Endpoint Schema Mismatches - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning
**Source:** PRD Express Path (.planning/debug/bigseller-platform-schema-mismatch.md)

<domain>
## Phase Boundary

Fix 6 confirmed bugs in the BigSeller integration caused by switching from the common `pageList.json` endpoint to platform-specific endpoints (`shopee/pageList.json`, `tiktok/pageList.json`). The platform-specific endpoints have fundamentally different response schemas — many "common" fields are absent, revenue data is in different fields, Shopee fee signs are inverted, and the `platform` field is null.

Additionally, add `orderAmount` field mapping and correct the revenue semantics:
- **Gross revenue** = total amount the customer paid (product price + buyer shipping) — maps to `orderAmount` (common), `buyerTotalAmount` (Shopee), or computed `saleAmount + buyerShippingFee` (TikTok)
- **Net revenue** = what Frollie actually receives after commission and shipping deductions — maps to `platformIncome`
- Surface buyer shipping cost in the BigSeller orders table

HAR capture analysis (2026-03-15) confirmed ALL findings against real Frollie production data across 73 Shopee orders and 15 TikTok orders.

</domain>

<decisions>
## Implementation Decisions

### Bug 1: saleAmount MISSING — Revenue column shows Rp 0
- Shopee: Use `originalPrice` as saleAmount equivalent
- TikTok: Use `revenueAmount` as saleAmount equivalent
- Fix in `normalizePlatformFees` — populate saleAmount from platform-specific fields
- Add `originalPrice`, `revenueAmount` to `BigSellerOrderRow` interface

### Bug 2: platform field is null — TikTok orders stored as "shopee"
- Both platform-specific endpoints return `platform: null`
- Pass the loop's `platform` variable (from `BIGSELLER_SHOP_PLATFORM_MAP`) into `mapOrderToStorage` as a parameter
- Must NOT rely on the API's platform field

### Bug 3: TikTok ALL common financial fields MISSING
- TikTok field mappings (HAR-confirmed):
  - `saleAmount` → `revenueAmount`
  - `platformIncome` → `settlementAmount`
  - `commissionFee` → `-(platformCommissionAmount + dynamicCommissionAmount + transactionFeeAmount + referralFeeAmount + affiliateCommissionAmount + affiliatePartnerCommissionAmount)`
  - `sellerShippingFee` → stays 0 (actualShippingFeeAmount is informational)
  - `buyerShippingFee` → `customerPaidShippingFeeAmount`
  - `otherFee` → `-(extraCostsFee)`
- Add all TikTok-specific fields to `BigSellerOrderRow` interface
- `preOrderServiceFeeAmount` and `feeTaxAmount` are captured by using `settlementAmount` directly

### Bug 4: Normalization condition uses `=== 0` but missing fields are `undefined`
- Change condition to `!order.commissionFee` or `(order.commissionFee === 0 || order.commissionFee == null)`
- Apply same fix to `sellerShippingFee` and `otherFee` checks

### Bug 5: Shopee commission fees have WRONG SIGN
- Shopee-specific fee fields are positive values (e.g., `orderAmsCommissionFee: 29,970`)
- Common endpoint stores them negative (`commissionFee: -29,970`)
- Negate Shopee fees: `order.commissionFee = -Math.abs(aggregatedCommission)`
- TikTok fee fields are already negative — no sign fix needed

### Bug 6: calculatedProfit formula will BREAK after fees are fixed
- Current formula `platformIncome + commissionFee + sellerShippingFee + otherFee` double-subtracts fees
- Replace with BigSeller's `profit` field directly (already stored in `bigsellerOrders.profit` but unused)
- Alternative: Use `platformIncome - costFee`

### Additional: otherfee vs otherFee case mismatch
- Platform-specific endpoints return `otherfee` (lowercase f) vs common `otherFee` (camelCase)
- JavaScript property access is case-sensitive — must handle both

### Enhancement: orderAmount mapping + revised revenue semantics
- `orderAmount` = `saleAmount + buyerShippingFee` (total buyer paid including shipping)
- Platform-specific endpoints don't return `orderAmount`. Shopee returns `buyerTotalAmount`. TikTok has no direct equivalent — compute as `saleAmount + buyerShippingFee` after normalization.
- Add `orderAmount` and `buyerTotalAmount` to `BigSellerOrderRow` interface
- In `normalizePlatformFees`: populate `orderAmount` from `buyerTotalAmount` (Shopee) or compute from normalized fields (TikTok)
- **Gross revenue redefinition**: `revenueGross` in `mapOrderToRevenue` should use `orderAmount` (total buyer paid) instead of `saleAmount` (product price only). This means gross revenue = what the customer actually paid.
- **Net revenue stays**: `revenueNet` = `platformIncome` (what Frollie receives net of all deductions) — unchanged.
- Add `orderAmount` to `bigsellerOrders` schema and `mapOrderToStorage` output
- Surface `buyerShippingFee` column in BigSellerOrdersTable (already has "Shipping" column for `sellerShippingFee` — add buyer shipping too, or rename column to clarify)

### Claude's Discretion
- Order of operations for normalization (which fields to check first)
- Whether to add defensive logging for unexpected field shapes
- Test strategy (unit tests for normalization logic vs integration)
- Whether to update summary/totals normalization alongside order normalization
- How to label the shipping columns in BigSellerOrdersTable (one column showing both, or separate buyer/seller columns)

</decisions>

<specifics>
## Specific Ideas

### Files to Change (from debug report)
**Backend:**
- `convex/integrations/bigseller/helpers.ts` — Rewrite `normalizePlatformFees`, extend `BigSellerOrderRow`, add platform param to `mapOrderToStorage`
- `convex/integrations/bigseller/sync.ts` — Pass loop `platform` variable to `mapOrderToStorage`
- `convex/bigsellerOrders/queries.ts` — Replace `calculatedProfit` with `order.profit` or `platformIncome - costFee`

**Frontend:**
- `src/components/salesAnalytics/BigSellerOrdersTable.tsx` — Use `order.profit` instead of `order.calculatedProfit`. Change Revenue column to show `orderAmount` (gross incl. shipping). Add buyer shipping column or clarify existing shipping column.

**Documentation:**
- `docs/BIGSELLER_PROFIT_API.md` — Add platform-specific schema differences section

### HAR-Confirmed Values for Verification
- Shopee order 260307H1VR6UCW: `originalPrice = 270,000`, `commissionFee` should be `-29,970`
- TikTok order 582977241483805780: `revenueAmount = 530,000`, `settlementAmount = 433,350`

</specifics>

<deferred>
## Deferred Ideas

- Summary totals normalization (top-level `totalSaleAmount`, `totalOriginalPrice` etc.) — different fields per endpoint but not currently displayed
- Shopee `costOfGoodsSold` field — NOT actual COGS, just product cost basis
- BigSeller COGS configuration (all Frollie orders show COGS = 0) — requires manual BigSeller dashboard setup, not a code fix

</deferred>

---

*Phase: 54-fix-bigseller-platform-specific-endpoint-schema-mismatches*
*Context gathered: 2026-03-15 via PRD Express Path (debug report)*
