# Phase 54: Fix BigSeller Platform-Specific Endpoint Schema Mismatches - Research

**Researched:** 2026-03-15
**Domain:** BigSeller API integration bugfix -- platform-specific response schema normalization
**Confidence:** HIGH

## Summary

This phase addresses 6 confirmed bugs in the BigSeller integration caused by switching from the common `pageList.json` endpoint to platform-specific endpoints (`shopee/pageList.json`, `tiktok/pageList.json`). The platform-specific endpoints return fundamentally different response schemas -- many "common" fields are absent, revenue data uses different field names, Shopee fee signs are inverted, and the `platform` field is `null`.

All 6 bugs have been HAR-verified against 73 Shopee orders and 15 TikTok orders from real Frollie production data. The root causes are well-understood with concrete fix paths documented in the debug report and CONTEXT.md. The affected code is in 4 files (3 backend, 1 frontend) with a clear dependency chain: normalize first (helpers.ts), pass platform (sync.ts), fix profit formula (queries.ts), update display (BigSellerOrdersTable.tsx).

**Primary recommendation:** Fix all 6 bugs in a single coordinated effort across helpers.ts, sync.ts, queries.ts, and BigSellerOrdersTable.tsx. Write comprehensive unit tests for `normalizePlatformFees` (currently has ZERO test coverage) before and alongside the fixes. Use HAR-confirmed values as test assertions.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Bug 1 (saleAmount MISSING):** Shopee uses `originalPrice`, TikTok uses `revenueAmount`. Fix in `normalizePlatformFees`. Add `originalPrice`, `revenueAmount` to `BigSellerOrderRow` interface.
- **Bug 2 (platform null):** Pass loop's `platform` variable from `BIGSELLER_SHOP_PLATFORM_MAP` into `mapOrderToStorage` as a parameter. Must NOT rely on API's platform field.
- **Bug 3 (TikTok missing fields):** Use HAR-confirmed field mappings: `revenueAmount` -> saleAmount, `settlementAmount` -> platformIncome, commission = -(6 TikTok fee fields), `customerPaidShippingFeeAmount` -> buyerShippingFee, `extraCostsFee` -> otherFee.
- **Bug 4 (condition uses === 0):** Change to `!order.commissionFee` or `(order.commissionFee === 0 || order.commissionFee == null)`. Apply to all three fee checks.
- **Bug 5 (Shopee wrong sign):** Negate Shopee fees: `order.commissionFee = -Math.abs(aggregatedCommission)`. TikTok fees already negative.
- **Bug 6 (calculatedProfit double-subtraction):** Replace with BigSeller's `profit` field directly (already stored but unused) or `platformIncome - costFee`.
- **Additional:** Handle `otherfee` vs `otherFee` case mismatch between platform-specific and common endpoints.

### Claude's Discretion
- Order of operations for normalization (which fields to check first)
- Whether to add defensive logging for unexpected field shapes
- Test strategy (unit tests for normalization logic vs integration)
- Whether to update summary/totals normalization alongside order normalization

### Deferred Ideas (OUT OF SCOPE)
- Summary totals normalization (top-level `totalSaleAmount`, `totalOriginalPrice` etc.) -- not currently displayed
- `orderAmount` field mapping (Shopee: `buyerTotalAmount`) -- not used in current columns
- Shopee `costOfGoodsSold` field -- NOT actual COGS, just product cost basis
- BigSeller COGS configuration (all Frollie orders show COGS = 0) -- requires manual BigSeller dashboard setup
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Backend mutations/queries | Already used, all BigSeller code runs on Convex |
| Vitest | ^4.0.18 | Unit testing for pure helper functions | Project standard, 690+ existing tests |
| TypeScript | ~5.9 | Type safety for BigSellerOrderRow interface | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React | ^19.2.0 | Frontend BigSellerOrdersTable component | Profit column display fix |

### Alternatives Considered
None -- this is a bugfix phase, not a technology choice phase. All libraries are already in use.

## Architecture Patterns

### Recommended Fix Order (Dependency Chain)

```
1. helpers.ts -- BigSellerOrderRow interface + normalizePlatformFees rewrite
   (All other fixes depend on correct normalization)
2. helpers.ts -- mapOrderToStorage platform param + mapOrderToRevenue saleAmount
   (Must use normalized values)
3. sync.ts -- Pass platform variable to mapOrderToStorage
   (1-line change, depends on mapOrderToStorage signature change)
4. queries.ts -- Replace calculatedProfit formula with order.profit
   (Depends on correct normalized data in storage)
5. BigSellerOrdersTable.tsx -- Use order.profit instead of order.calculatedProfit
   (Frontend display fix, depends on queries.ts change)
```

### Pattern: Platform-Aware Normalization

The `normalizePlatformFees` function must become platform-aware (currently relies on `order.platform` which is null). The fix should:
1. Accept a `platform` parameter (not rely on `order.platform`)
2. Normalize saleAmount and platformIncome (not just fees)
3. Handle missing fields as `undefined` (not just `=== 0`)
4. Apply correct sign conventions per platform

```typescript
// Current (broken): relies on order.platform which is null
export function normalizePlatformFees(order: BigSellerOrderRow): BigSellerOrderRow {
  const platform = order.platform?.toLowerCase() || "";
  // ...
}

// Fixed: accept platform as parameter
export function normalizePlatformFees(
  order: BigSellerOrderRow,
  platform: "shopee" | "tiktok" | "common"
): BigSellerOrderRow {
  // 1. Normalize saleAmount (Bug 1)
  // 2. Normalize platformIncome (Bug 3, TikTok only)
  // 3. Fix condition checks (Bug 4)
  // 4. Normalize commission fees with correct sign (Bug 5)
  // 5. Normalize shipping/other fees
  // 6. Handle otherfee/otherFee case mismatch
  return order;
}
```

### Pattern: Explicit Platform Injection (Bug 2)

```typescript
// sync.ts -- fetchOrders loop
for (const [platform, shopIds] of platformShops) {
  // ... fetch rows ...
  for (const row of rows) {
    normalizePlatformFees(row, platform as "shopee" | "tiktok" | "common");
  }
  // Pass platform explicitly, don't rely on row.platform
  const storageRows = rows.map((row) => mapOrderToStorage(row, args.syncLogId, platform));
}
```

### Anti-Patterns to Avoid
- **Relying on order.platform from API response:** Both platform-specific endpoints return `platform: null`. NEVER use `order.platform` to determine which platform's rules to apply. Always use the loop's `platform` variable from `BIGSELLER_SHOP_PLATFORM_MAP`.
- **Checking `=== 0` for missing fields:** JavaScript returns `undefined` for absent properties, not `0`. Use falsy check or explicit null comparison.
- **Adding negative fees to platformIncome:** `platformIncome` is already NET of fees. Adding negative fees double-subtracts them. Use `profit` field directly.
- **Assuming positive fee values:** Shopee fees are positive, TikTok fees are negative, common fees are negative. The normalization must enforce consistent sign convention (negative = deduction).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Profit calculation | `platformIncome + commissionFee + ...` | `order.profit` from BigSeller API | BigSeller's `profit` field is authoritative. Hand-rolling double-subtracts fees from net income. |
| Missing field detection | `field === 0` checks | `field == null` or `!field && field !== 0` | JS returns `undefined` for absent properties, `=== 0` is false for undefined |

**Key insight:** The `profit` field from BigSeller is already present in the stored data (`bigsellerOrders.profit`) and equals `platformIncome - costFee`. Since `costFee` is always 0 for Frollie, `profit === platformIncome`. This is simpler and more correct than any hand-rolled formula.

## Common Pitfalls

### Pitfall 1: JavaScript case-sensitive property access with `otherfee` vs `otherFee`
**What goes wrong:** Platform-specific endpoints return `otherfee` (lowercase f) while code reads `order.otherFee` (camelCase). Returns `undefined` instead of the value.
**Why it happens:** BigSeller's API is inconsistent between common and platform-specific endpoints.
**How to avoid:** In the `BigSellerOrderRow` interface, add `otherfee?: number` as an optional field. In normalization, check both: `order.otherFee ?? order.otherfee ?? undefined`.
**Warning signs:** `otherFee` always 0 on platform-specific endpoints despite non-zero values in HAR captures.

### Pitfall 2: Falsy check `!field` swallows legitimate 0 values
**What goes wrong:** Using `!order.commissionFee` as the condition will treat a real `0` commission as "missing" and overwrite it.
**Why it happens:** `!0` is `true` in JavaScript.
**How to avoid:** Use `order.commissionFee == null` (checks both undefined and null) rather than `!order.commissionFee`. Or explicitly: `order.commissionFee === undefined || order.commissionFee === null`.
**Warning signs:** Orders with legitimately zero commission get overwritten with aggregated values.

### Pitfall 3: Shopee fee sign inconsistency
**What goes wrong:** Aggregating positive Shopee fees and storing as positive breaks the negative convention used everywhere else.
**Why it happens:** Shopee-specific fields are positive (e.g., `orderAmsCommissionFee: 29970`) unlike common fields which are negative.
**How to avoid:** Always negate: `order.commissionFee = -Math.abs(aggregatedCommission)`. Using `-Math.abs()` is defensive -- works correctly whether input is positive or negative.
**Warning signs:** Profit column shows unusually low or negative values for Shopee orders after fix.

### Pitfall 4: Breaking existing test assertions
**What goes wrong:** Changing `normalizePlatformFees` signature from 1 to 2 parameters breaks existing callers.
**Why it happens:** The function is called in `sync.ts` with just `normalizePlatformFees(row)`.
**How to avoid:** Update the call site in sync.ts simultaneously. The second parameter is required, not optional, to force explicit platform specification.
**Warning signs:** TypeScript compilation errors after changing the function signature.

### Pitfall 5: `mapOrderToRevenue` still uses `order.platform` and `order.saleAmount`
**What goes wrong:** Even after fixing `normalizePlatformFees`, `mapOrderToRevenue` reads `order.platform?.toLowerCase() || "shopee"` (will be null) and `order.saleAmount || 0` (will be 0 if normalization didn't populate it).
**How to avoid:** Add `platform` parameter to `mapOrderToRevenue` the same way as `mapOrderToStorage`. Ensure normalization populates `order.saleAmount` and `order.platformIncome` before `mapOrderToRevenue` is called.
**Warning signs:** `externalRevenue` records still show `revenueGross: 0` and source "shopee" for TikTok orders.

### Pitfall 6: Upsert on re-sync overwrites corrected data only if schema changes
**What goes wrong:** After deploying the fix, existing corrupted data in `bigsellerOrders` table remains corrupt until a re-sync.
**Why it happens:** The fix only changes how NEW syncs normalize data. Old rows with `saleAmount: 0` and `platform: "shopee"` (for TikTok orders) remain.
**How to avoid:** After deploying, trigger a re-sync covering the full date range. The upsert pattern in `mutations.ts` will patch existing orders with corrected data.
**Warning signs:** Old orders still show Rp 0 revenue; only newly synced orders are correct.

## Code Examples

### Example 1: Rewritten normalizePlatformFees (core fix)

```typescript
// Source: HAR analysis + docs/BIGSELLER_PROFIT_API.md field mapping tables
export function normalizePlatformFees(
  order: BigSellerOrderRow,
  platform: "shopee" | "tiktok" | "common"
): BigSellerOrderRow {
  // Handle otherfee/otherFee case mismatch
  const rawOtherFee = order.otherFee ?? (order as any).otherfee ?? undefined;

  if (platform === "shopee") {
    // Bug 1: saleAmount missing -- use originalPrice
    if (order.saleAmount == null) {
      order.saleAmount = order.originalPrice ?? 0;
    }

    // Bug 5: Shopee fees are POSITIVE, must negate
    const aggregatedCommission = (order.sellerTransactionFee ?? 0)
      + (order.orderAmsCommissionFee ?? 0)
      + (order.campaignFee ?? 0)
      + (order.sellerOrderProcessingFee ?? 0);
    if (order.commissionFee == null || (order.commissionFee === 0 && aggregatedCommission !== 0)) {
      order.commissionFee = -Math.abs(aggregatedCommission);
    }

    const aggregatedShipping = (order.finalShippingFee ?? 0)
      + (order.shippingSellerProtectionFeeAmount ?? 0);
    if (order.sellerShippingFee == null || (order.sellerShippingFee === 0 && aggregatedShipping !== 0)) {
      order.sellerShippingFee = -Math.abs(aggregatedShipping);
    }

    const aggregatedOther = order.serviceFee ?? 0;
    if (rawOtherFee == null || (rawOtherFee === 0 && aggregatedOther !== 0)) {
      order.otherFee = -Math.abs(aggregatedOther);
    }

  } else if (platform === "tiktok") {
    // Bug 1 + 3: TikTok missing common fields
    if (order.saleAmount == null) {
      order.saleAmount = order.revenueAmount ?? 0;
    }
    if (order.platformIncome == null || order.platformIncome === 0) {
      order.platformIncome = order.settlementAmount ?? 0;
    }
    if (order.buyerShippingFee == null) {
      order.buyerShippingFee = order.customerPaidShippingFeeAmount ?? 0;
    }

    // TikTok fees already negative -- use as-is
    const aggregatedCommission = (order.platformCommissionAmount ?? 0)
      + (order.dynamicCommissionAmount ?? 0)
      + (order.transactionFeeAmount ?? 0)
      + (order.referralFeeAmount ?? 0)
      + (order.affiliateCommissionAmount ?? 0)
      + (order.affiliatePartnerCommissionAmount ?? 0);
    if (order.commissionFee == null || (order.commissionFee === 0 && aggregatedCommission !== 0)) {
      order.commissionFee = aggregatedCommission; // Already negative
    }

    // TikTok sellerShippingFee: stays 0 (actualShippingFeeAmount is informational)
    if (order.sellerShippingFee == null) {
      order.sellerShippingFee = 0;
    }

    // TikTok otherFee: only extraCostsFee (already negative)
    const extraCosts = order.extraCostsFee ?? 0;
    if (rawOtherFee == null || (rawOtherFee === 0 && extraCosts !== 0)) {
      order.otherFee = extraCosts;
    }
  }

  return order;
}
```

### Example 2: mapOrderToStorage with platform parameter (Bug 2 fix)

```typescript
// Source: debug report Bug 2 -- platform is null from API
export function mapOrderToStorage(
  order: BigSellerOrderRow,
  syncLogId: Id<"externalSyncLogs"> | string,
  platform: string,  // NEW: explicit platform from BIGSELLER_SHOP_PLATFORM_MAP
): {
  // ... return type unchanged ...
} {
  return {
    // ...
    platform: platform.toLowerCase(),  // Use param, not order.platform
    // ...
  };
}
```

### Example 3: Fixed profit column (Bug 6 fix)

```typescript
// Source: queries.ts -- replace calculatedProfit formula
// BEFORE (double-subtracts fees):
const results = paged.map((order) => ({
  ...order,
  calculatedProfit: order.platformIncome + order.commissionFee + order.sellerShippingFee + order.otherFee,
}));

// AFTER (use BigSeller's authoritative profit value):
const results = paged.map((order) => ({
  ...order,
  calculatedProfit: order.profit, // BigSeller's profit = platformIncome - costFee
}));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Common `pageList.json` for all platforms | Platform-specific endpoints per platform | Feb 2026 (bigseller-fees-zero fix) | Broke 6 things due to different response schemas |
| `order.platform` from API | Explicit platform from config map | This phase | Required because platform-specific endpoints return null |

**Deprecated/outdated:**
- `calculatedProfit` formula in `queries.ts`: Double-subtracts fees. Replace with `order.profit` from BigSeller.
- Reliance on `order.platform` field: Both platform-specific endpoints return null. Use `BIGSELLER_SHOP_PLATFORM_MAP` instead.

## Open Questions

1. **Re-sync of existing data after deploy**
   - What we know: The upsert pattern in `mutations.ts` will patch existing orders on re-sync. A re-sync covering the full date range will correct all stored data.
   - What's unclear: Whether admin should manually trigger a full re-sync after deploy, or if it should happen automatically.
   - Recommendation: Document in verification plan that a manual re-sync is required. Do NOT auto-trigger to avoid unexpected API calls.

2. **mapOrderToRevenue also needs platform parameter**
   - What we know: `mapOrderToRevenue` reads `order.platform?.toLowerCase() || "shopee"` and `order.saleAmount || 0`, both of which are broken for the same reasons as `mapOrderToStorage`.
   - What's unclear: Whether normalization already populates these fields before `mapOrderToRevenue` is called (it does, since normalization runs before mapping in sync.ts).
   - Recommendation: Still add explicit `platform` parameter to `mapOrderToRevenue` for consistency, even though normalization should have already set `order.platform`. Belt and suspenders -- the platform field from the API is null, so relying on normalization to have set it is fragile.

3. **TikTok otherFee mapping refinement**
   - What we know: Previous code mapped `sfpServiceFeeAmount + codServiceFeeAmount + feeTaxAmount + extraCostsFee`. HAR verification shows only `extraCostsFee` maps correctly. `feeTaxAmount` is tax metadata already in settlement.
   - What's unclear: Whether `sfpServiceFeeAmount` and `codServiceFeeAmount` are ever non-zero for Frollie orders.
   - Recommendation: Per CONTEXT.md and the updated API docs, map only `extraCostsFee` to `otherFee`. This is HAR-verified.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test -- --run convex/integrations/bigseller/__tests__/` |
| Full suite command | `npm run test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUG-01 | saleAmount normalized from platform-specific fields | unit | `npm run test -- --run convex/integrations/bigseller/__tests__/normalization.test.ts` | No -- Wave 0 |
| BUG-02 | platform set from config, not API response | unit | `npm run test -- --run convex/integrations/bigseller/__tests__/normalization.test.ts` | No -- Wave 0 |
| BUG-03 | TikTok platformIncome, buyerShippingFee, commissionFee normalized | unit | `npm run test -- --run convex/integrations/bigseller/__tests__/normalization.test.ts` | No -- Wave 0 |
| BUG-04 | Normalization triggers for undefined fields (not just === 0) | unit | `npm run test -- --run convex/integrations/bigseller/__tests__/normalization.test.ts` | No -- Wave 0 |
| BUG-05 | Shopee fees negated to match common convention | unit | `npm run test -- --run convex/integrations/bigseller/__tests__/normalization.test.ts` | No -- Wave 0 |
| BUG-06 | calculatedProfit uses order.profit, not formula | unit | `npm run test -- --run convex/integrations/bigseller/__tests__/normalization.test.ts` | No -- Wave 0 |
| CASE | otherfee/otherFee case mismatch handled | unit | `npm run test -- --run convex/integrations/bigseller/__tests__/normalization.test.ts` | No -- Wave 0 |
| REGRESSION | Existing helpers tests still pass | unit | `npm run test -- --run convex/integrations/bigseller/__tests__/` | Yes (helpers.test.ts, helpers-edge-cases.test.ts) |

### Sampling Rate
- **Per task commit:** `npm run test -- --run convex/integrations/bigseller/__tests__/`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green + `npm run build` before verify

### Wave 0 Gaps
- [ ] `convex/integrations/bigseller/__tests__/normalization.test.ts` -- covers BUG-01 through BUG-06 + CASE mismatch, using HAR-confirmed values as assertions
- [ ] Update existing test files (`helpers.test.ts`, `helpers-edge-cases.test.ts`) for new function signatures (2nd parameter for `normalizePlatformFees`, 3rd parameter for `mapOrderToStorage`)

**CRITICAL:** `normalizePlatformFees` currently has ZERO test coverage despite being the core normalization function. This is the most important Wave 0 gap.

## Detailed File Analysis

### File 1: `convex/integrations/bigseller/helpers.ts` (347 lines)

**Changes needed:**
1. **`BigSellerOrderRow` interface (lines 122-166):** Add missing fields: `originalPrice?: number`, `buyerTotalAmount?: number`, `buyerPaidShippingFee?: number`, `revenueAmount?: number`, `customerPaymentAmount?: number`, `settlementAmount?: number`, `customerPaidShippingFeeAmount?: number`, `preOrderServiceFeeAmount?: number`, `otherfee?: number` (lowercase case variant).
2. **`normalizePlatformFees` (lines 178-245):** Complete rewrite. Add `platform` parameter. Fix saleAmount/platformIncome normalization. Fix condition checks (Bug 4). Fix Shopee sign convention (Bug 5). Fix TikTok field mapping (Bug 3). Handle otherfee case mismatch.
3. **`mapOrderToStorage` (lines 292-347):** Add `platform` parameter. Use `platform` param instead of `order.platform?.toLowerCase() || "shopee"`.
4. **`mapOrderToRevenue` (lines 252-286):** Add `platform` parameter. Use `platform` param instead of `order.platform?.toLowerCase() || "shopee"`. Reads `order.saleAmount` (already normalized) for `revenueGross`.

### File 2: `convex/integrations/bigseller/sync.ts` (800 lines)

**Changes needed (minimal):**
1. **Line 648:** Pass `platform` to `normalizePlatformFees`: `normalizePlatformFees(row, platform as "shopee" | "tiktok" | "common")`
2. **Line 662:** Pass `platform` to `mapOrderToStorage`: `mapOrderToStorage(row, args.syncLogId, platform)`
3. **Line 671:** Pass `platform` to `mapOrderToRevenue`: `mapOrderToRevenue(row, args.syncLogId, platform)` (optional but recommended)
4. **Line 718:** `row.platform?.toLowerCase() || "shopee"` should use `platform` instead

### File 3: `convex/bigsellerOrders/queries.ts` (174 lines)

**Changes needed:**
1. **Lines 50-57:** Replace `calculatedProfit` formula with `order.profit`. Single line change.

### File 4: `src/components/salesAnalytics/BigSellerOrdersTable.tsx` (300 lines)

**Changes needed:**
1. **Line 238:** `{formatCurrency(order.saleAmount)}` -- this will auto-fix once saleAmount is correctly normalized.
2. **Lines 249-258:** `order.calculatedProfit` -- this will auto-fix once queries.ts returns `order.profit` as `calculatedProfit`.
3. No structural changes needed to this file if the query still returns `calculatedProfit` as the field name (just backed by `order.profit` now).

### Existing Test Files Impact

1. **`helpers.test.ts`:** `normalizePlatformFees` not tested. `mapOrderToStorage` tests (line 181-224) need signature update (add 3rd param). `mapOrderToRevenue` tests (line 121-176) need signature update if platform param added.
2. **`helpers-edge-cases.test.ts`:** Same signature updates needed. Cross-function consistency tests (line 332-379) need update.

## Sources

### Primary (HIGH confidence)
- HAR capture analysis (2026-03-15) -- 73 Shopee + 15 TikTok orders from Frollie production
- `docs/BIGSELLER_PROFIT_API.md` -- Platform-specific response schema differences section (lines 1441-1528), field availability matrix, fee normalization rules
- `.planning/debug/bigseller-platform-schema-mismatch.md` -- Root cause analysis with HAR evidence for all 6 bugs

### Secondary (MEDIUM confidence)
- Source code analysis of `convex/integrations/bigseller/helpers.ts`, `sync.ts`, `queries.ts` -- confirmed bugs match debug report exactly

### Tertiary (LOW confidence)
- None -- all findings are HAR-verified against production data

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries needed, pure bugfix
- Architecture: HIGH -- fix paths are explicitly documented with HAR-verified values
- Pitfalls: HIGH -- edge cases identified from actual API response analysis
- Test strategy: HIGH -- pure functions are easily unit-testable

**Research date:** 2026-03-15
**Valid until:** Indefinite (BigSeller API schema is externally determined; field mappings are HAR-verified)
