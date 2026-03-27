---
phase: 54-fix-bigseller-platform-specific-endpoint-schema-mismatches
verified: 2026-03-15T15:31:23Z
status: passed
score: 8/8 must-haves verified
---

# Phase 54: Fix BigSeller Platform-Specific Endpoint Schema Mismatches Verification Report

**Phase Goal:** All 6 HAR-confirmed bugs in BigSeller integration are fixed: normalizePlatformFees handles platform-specific schemas correctly, platform is injected from config (not API), and calculatedProfit uses BigSeller's authoritative profit field
**Verified:** 2026-03-15T15:31:23Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Shopee orders have saleAmount populated from originalPrice (not 0) | VERIFIED | `helpers.ts:221-223` -- `shouldOverwrite(order.saleAmount, order.originalPrice ?? 0)` triggers for undefined/null/zero, sets `order.saleAmount = order.originalPrice ?? 0`. 3 tests confirm in normalization.test.ts (lines 48-74) |
| 2 | TikTok orders have saleAmount from revenueAmount, platformIncome from settlementAmount, commissionFee from 6-field sum | VERIFIED | `helpers.ts:253-274` -- TikTok branch maps saleAmount<-revenueAmount, platformIncome<-settlementAmount, commissionFee<-sum of 6 platform-specific fields. Tests at lines 134-189 confirm with HAR values |
| 3 | Normalization triggers for undefined/null fields (not just === 0) | VERIFIED | `shouldOverwrite()` at line 188-190 uses `field == null \|\| (field === 0 && aggregated !== 0)`. BUG-04 tests at lines 223-249 confirm both undefined and null trigger normalization |
| 4 | Shopee fees are negated via -Math.abs() to match negative convention | VERIFIED | `helpers.ts:231` `order.commissionFee = -Math.abs(aggregatedCommission)`, line 237 same for sellerShippingFee, line 243 for otherFee. BUG-05 tests at lines 254-288 confirm with HAR values |
| 5 | Platform is set from BIGSELLER_SHOP_PLATFORM_MAP config, not from API's null value | VERIFIED | `sync.ts:563` -- platform from `BIGSELLER_SHOP_PLATFORM_MAP[shopId]`. Line 649: `normalizePlatformFees(row, platform as ...)`. Line 663: `mapOrderToStorage(row, args.syncLogId, platform)`. Line 672: `mapOrderToRevenue(row, args.syncLogId, platform)`. Line 720: `allPlatforms.add(platform)` uses loop variable. `helpers.ts:392`: `platform: platform.toLowerCase()` (from param, not order.platform) |
| 6 | calculatedProfit uses order.profit (BigSeller authoritative), not double-subtracting formula | VERIFIED | `queries.ts:55` -- `calculatedProfit: order.profit`. Comment at lines 49-52 explains BUG-06 fix. Integration tests at lines 394-423 verify directly |
| 7 | otherfee/otherFee case mismatch handled | VERIFIED | `helpers.ts:215-217` -- case mismatch resolved at top of normalizePlatformFees before any platform branch. `otherfee` field in BigSellerOrderRow interface at line 174. CASE-01 test at lines 293-307 |
| 8 | All existing and new tests pass, npm run build succeeds | VERIFIED | 100/100 tests pass across 5 test files (normalization: 22, helpers: 21, helpers-edge-cases: 39, integration: 14, mutations: 4). Build succeeds: `3523 modules transformed, built in 15.77s` |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `convex/integrations/bigseller/__tests__/normalization.test.ts` | 22 HAR-confirmed unit tests (min 150 lines) | VERIFIED | 356 lines, 22 tests covering BUG-01/03/04/05, CASE-01, ENH-ORDERAMOUNT |
| `convex/integrations/bigseller/helpers.ts` | Extended BigSellerOrderRow + rewritten normalizePlatformFees + shouldOverwrite + mapOrderToStorage/Revenue with platform param | VERIFIED | 416 lines, exports normalizePlatformFees (2-arg), mapOrderToStorage (3-arg), mapOrderToRevenue (3-arg), BigSellerOrderRow with 7 new fields |
| `convex/integrations/bigseller/sync.ts` | Platform variable passed to all 3 helper functions | VERIFIED | Lines 649, 663, 672 pass `platform` from loop. Line 720 uses `platform` variable for SKU collection |
| `convex/bigsellerOrders/queries.ts` | calculatedProfit from order.profit | VERIFIED | Line 55: `calculatedProfit: order.profit` with explanatory comment |
| `convex/schema.ts` | bigsellerOrders includes orderAmount | VERIFIED | `orderAmount: v.optional(v.number())` at line 1476 |
| `src/components/salesAnalytics/BigSellerOrdersTable.tsx` | Gross Revenue column (orderAmount), Buyer Shipping column | VERIFIED | Line 167: "Gross Revenue" header with tooltip. Line 252: `order.orderAmount ?? order.saleAmount`. Line 179: "Buyer Shipping" header. Line 260: `order.buyerShippingFee` |
| `convex/bigsellerOrders/__tests__/integration.test.ts` | Updated profit tests reflecting order.profit | VERIFIED | Lines 394-423: Two tests verify order.profit used directly. Comments explain old formula was broken |
| `convex/integrations/bigseller/__tests__/helpers.test.ts` | Updated tests with 3-param signatures | VERIFIED | All mapOrderToRevenue/mapOrderToStorage calls pass platform as 3rd arg |
| `convex/integrations/bigseller/__tests__/helpers-edge-cases.test.ts` | Updated tests with 3-param signatures and orderAmount semantics | VERIFIED | All function calls have platform param. Line 224: revenueGross uses orderAmount primary path test. Line 370: cross-function consistency uses orderAmount |
| `docs/BIGSELLER_PROFIT_API.md` | Platform-specific schema differences section | VERIFIED | Lines 1556-1612: Field availability matrix, sign conventions, revenue semantics, normalization mappings, HAR-confirmed test values |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `sync.ts` | `helpers.ts` | `normalizePlatformFees(row, platform as ...)` | WIRED | Line 649 passes loop `platform` variable |
| `sync.ts` | `helpers.ts` | `mapOrderToStorage(row, args.syncLogId, platform)` | WIRED | Line 663 passes loop `platform` variable |
| `sync.ts` | `helpers.ts` | `mapOrderToRevenue(row, args.syncLogId, platform)` | WIRED | Line 672 passes loop `platform` variable |
| `queries.ts` | `bigsellerOrders table` | `order.profit` field | WIRED | Line 55: `calculatedProfit: order.profit` |
| `normalization.test.ts` | `helpers.ts` | `import { normalizePlatformFees, type BigSellerOrderRow }` | WIRED | Line 15 imports, 22 tests use 2-arg signature |
| `BigSellerOrdersTable.tsx` | `queries.ts` | `order.orderAmount ?? order.saleAmount` | WIRED | Line 252 displays gross revenue from orderAmount with saleAmount fallback |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| BUG-01 | 54-01 | saleAmount missing -- Revenue shows Rp 0 | SATISFIED | normalizePlatformFees populates from originalPrice (Shopee) / revenueAmount (TikTok) |
| BUG-02 | 54-02 | platform null -- TikTok orders stored as "shopee" | SATISFIED | Explicit platform param wired through sync.ts to all 3 helpers |
| BUG-03 | 54-01 | TikTok ALL common financial fields missing | SATISFIED | 5-field TikTok normalization: saleAmount, platformIncome, buyerShippingFee, commissionFee, otherFee |
| BUG-04 | 54-01 | Normalization condition uses === 0 but fields are undefined | SATISFIED | shouldOverwrite() uses `field == null \|\| (field === 0 && aggregated !== 0)` |
| BUG-05 | 54-01 | Shopee commission fees wrong sign (positive not negative) | SATISFIED | `-Math.abs()` applied to all Shopee fee aggregations |
| BUG-06 | 54-02 | calculatedProfit double-subtracts fees | SATISFIED | `calculatedProfit: order.profit` replaces broken formula |
| CASE-01 | 54-01 | otherfee/otherFee case mismatch | SATISFIED | Resolved at top of normalizePlatformFees before platform branching |
| ENH-ORDERAMOUNT | 54-01 | orderAmount normalization | SATISFIED | Shopee from buyerTotalAmount, TikTok computed saleAmount + buyerShippingFee |
| ENH-ORDERAMOUNT-WIRING | 54-02 | orderAmount in schema/storage/revenue | SATISFIED | Schema `v.optional(v.number())`, mapOrderToStorage includes it, revenueGross uses it |
| ENH-REVENUE-SEMANTICS | 54-02 | Correct revenue semantics (gross=orderAmount, net=platformIncome) | SATISFIED | `revenueGross: order.orderAmount ?? order.saleAmount ?? 0`, `revenueNet: order.platformIncome ?? 0` |
| ENH-SHIPPING-DISPLAY | 54-02 | Surface buyer shipping in BigSellerOrdersTable | SATISFIED | "Buyer Shipping" column at line 179, shows `order.buyerShippingFee` in neutral color |

Note: BUG-01 through BUG-06 and CASE-01 are bug IDs from the debug report, not formal entries in REQUIREMENTS.md (which covers v1.7 Expense & Accounting). The ENH-* IDs are enhancements defined within the phase plans. No orphaned requirements found since REQUIREMENTS.md does not map any IDs to Phase 54.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | -- | -- | -- | No anti-patterns found |

All modified files scanned for TODO/FIXME/PLACEHOLDER/empty implementations. Zero hits on helpers.ts, sync.ts, queries.ts. The `|| 0` usage in helpers.ts lines 405-410 is intentional and correct (non-financial count fields where 0 and falsy are equivalent, per plan spec).

### Human Verification Required

### 1. Revenue Column Shows Non-Zero Values After Sync

**Test:** Trigger a BigSeller sync, then open Sales Analytics > Synced Orders table
**Expected:** Shopee orders show non-zero Gross Revenue (from originalPrice). TikTok orders show non-zero Gross Revenue (from revenueAmount).
**Why human:** Requires live BigSeller API sync with production data

### 2. TikTok Orders Show "TikTok" Platform Badge

**Test:** After sync, check platform badges in Synced Orders table
**Expected:** TikTok orders display pink "TikTok" badge, not orange "Shopee" badge
**Why human:** Requires live data to confirm BUG-02 fix end-to-end

### 3. Profit Values Match BigSeller Dashboard

**Test:** Compare profit column in Synced Orders with BigSeller web dashboard
**Expected:** Values match (both use order.profit). Old formula would show lower values due to double-subtraction.
**Why human:** Requires cross-referencing with external BigSeller dashboard

### 4. Buyer Shipping Column Visible and Styled Correctly

**Test:** Open Sales Analytics > Synced Orders table
**Expected:** "Buyer Shipping" column appears between "Seller Shipping" and "Other". Styled in neutral color (not red like fee deductions).
**Why human:** Visual styling verification

### 5. Gross Revenue Tooltip Shows Explanation

**Test:** Hover over "Gross Revenue" column header
**Expected:** Tooltip shows "Total amount the customer paid (product + shipping)"
**Why human:** UI interaction verification

### Gaps Summary

No gaps found. All 8 observable truths verified. All artifacts exist, are substantive, and are properly wired. All 100 BigSeller tests pass (22 normalization + 21 helpers + 39 edge-cases + 14 integration + 4 mutations). Build succeeds. The 6 HAR-confirmed bugs (BUG-01 through BUG-06) and the case mismatch (CASE-01) are all addressed with correct implementations and comprehensive test coverage. The orderAmount enhancement and revenue semantics correction are fully wired through schema, storage, revenue mapping, and frontend display.

Post-deployment note: Existing corrupted data in bigsellerOrders will remain incorrect until a re-sync is triggered from BigSeller API to re-fetch and re-normalize all stored orders.

---

_Verified: 2026-03-15T15:31:23Z_
_Verifier: Claude (gsd-verifier)_
