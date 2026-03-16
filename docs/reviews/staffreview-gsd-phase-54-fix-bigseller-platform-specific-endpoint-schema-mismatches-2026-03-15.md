# Staff Review: Phase 54 — Fix BigSeller Platform-Specific Endpoint Schema Mismatches

**Branch:** `gsd/phase-54-fix-bigseller-platform-specific-endpoint-schema-mismatches`
**Base:** `origin/main` (e0551c2)
**Head:** `768f53a`
**Reviewer:** Triple Review (requirements + code quality + staff/principal)
**Date:** 2026-03-15

---

## Summary

Phase 54 fixes 6 confirmed bugs in the BigSeller integration caused by switching from common to platform-specific API endpoints. The implementation is well-structured with strong TDD discipline (22 HAR-confirmed normalization tests), clean separation of concerns, and thorough documentation updates.

**Key accomplishments:**
- `normalizePlatformFees` rewritten with explicit platform parameter and `shouldOverwrite()` helper
- Platform parameter wired through full sync pipeline (fixes BUG-02)
- Revenue semantics corrected: gross = total buyer paid, net = platform income
- Profit formula fixed from double-subtraction formula to BigSeller authoritative `order.profit`
- Financial field fallbacks hardened from `|| 0` to `?? 0`
- BigSellerOrdersTable updated with Gross Revenue, Buyer Shipping columns

**One critical issue found** that will cause runtime failures in production.

---

## Critical Issues

### C1. `upsertOrders` mutation missing `orderAmount` in arg validator

**Severity:** CRITICAL (runtime failure in production)
**Flagged by:** code-quality-reviewer, staffreview

`mapOrderToStorage()` now returns `orderAmount: number` in its output object. However, `convex/bigsellerOrders/mutations.ts` `upsertOrders` was NOT updated -- its `v.object()` arg validator does not include `orderAmount`. When `fetchOrders` in `sync.ts` calls `upsertOrders` with the storage rows, Convex will throw a validation error because the object has an unexpected property.

**File:** `convex/bigsellerOrders/mutations.ts` (line 11-39)
**Impact:** Every BigSeller sync will fail at the storage step. All orders will be lost.
**Fix:** Add `orderAmount: v.optional(v.number()),` to the `upsertOrders` args validator, after `saleAmount: v.number()`. Use `v.optional()` to match the schema definition and handle pre-normalization data gracefully.

---

## Important Issues

### I1. Test mock orders lack `orderAmount` -- revenueGross fallback path tested but not primary path

**Severity:** Important
**Flagged by:** requirements-reviewer

The `helpers.test.ts` and `helpers-edge-cases.test.ts` mock orders do NOT include `orderAmount`, so all `revenueGross` assertions test the fallback path (`?? saleAmount`). No test verifies the primary path where `orderAmount` is present and differs from `saleAmount`. This means the core revenue mapping change (gross = orderAmount) has no dedicated positive test.

**Fix:** Add test case with mock order where `orderAmount = 115000` (e.g., saleAmount 100000 + buyerShipping 15000) and verify `revenueGross === 115000` (not `100000`).

### I2. `shouldOverwrite` silently accepts `aggregated = 0` but might mask bugs

**Severity:** Important
**Flagged by:** code-quality-reviewer

When `shouldOverwrite(field, aggregated)` is called with `aggregated = 0` (e.g., `shouldOverwrite(order.saleAmount, order.originalPrice ?? 0)` where `originalPrice` is undefined), the function returns `true` only when `field == null`. The `(field === 0 && aggregated !== 0)` branch never triggers because `aggregated` is 0. This means for Shopee orders where `originalPrice` is also missing, `saleAmount` gets overwritten with 0 -- which is correct behavior, but the function name "shouldOverwrite" returning true to set a field to 0 is semantically confusing and could mask bugs where a platform-specific field is genuinely missing. Consider adding a guard: if `aggregated === 0`, do not overwrite (return false), to preserve whatever the common endpoint provided.

---

## Minor Issues

### M1. `normalizePlatformFees` mutates input in place despite returning the object

**Severity:** Minor
**Flagged by:** code-quality-reviewer, staffreview

The function mutates `order` in place AND returns it. The JSDoc says "Mutates the order row in place for efficiency." This is documented and intentional, but it's a foot-gun pattern -- callers may assume the return value is a new object. Since this is called in a for-loop over API response rows (not reused elsewhere), the practical risk is low.

### M2. Integration test profit assertions test pure JavaScript, not actual query behavior

**Severity:** Minor
**Flagged by:** requirements-reviewer

The updated "profit calculation formula" tests in `integration.test.ts` (lines 394-430) just assign `order.profit` to a local variable and check the value. They don't actually test the `queries.ts` `listOrders` handler. This is a pre-existing pattern (testing pure math, not Convex queries), but the test names suggest they verify the query behavior.

### M3. `BigSellerOrdersTable` Gross Revenue tooltip is not visible on mobile

**Severity:** Minor
**Flagged by:** staffreview

The `TooltipProvider` > `Tooltip` > `TooltipTrigger` on the "Gross Revenue" column header uses hover-based tooltips. On mobile (touch devices), these don't fire. Consider using the existing pattern of a small `(i)` icon that triggers a popover, or rely on the column header text being self-explanatory.

### M4. Cross-function consistency test uses `||` for orderAmount fallback instead of `??`

**Severity:** Minor
**Flagged by:** code-quality-reviewer

In `helpers-edge-cases.test.ts`, the updated test "revenue uses orderAmount as gross (falls back to saleAmount when absent)" uses:
```typescript
expect(revenue.revenueGross).toBe(storage.orderAmount || storage.saleAmount);
```

This should use `??` instead of `||` to match the production code semantics. If `orderAmount` is `0`, `||` would incorrectly fall back to `saleAmount`, while `??` would correctly use `0`.

---

## Nitpick

### N1. `docs/BIGSELLER_PROFIT_API.md` update is large but not linked from main docs index

**Severity:** Nitpick
**Flagged by:** staffreview

The BIGSELLER_PROFIT_API.md updates are comprehensive and well-structured, but this file is not referenced in `docs/API_REFERENCE.md` or the main docs index. Consider adding a cross-reference.

### N2. Schema comment could reference bug number

**Severity:** Nitpick
**Flagged by:** code-quality-reviewer

The schema addition:
```typescript
orderAmount: v.optional(v.number()), // Total buyer paid (product + shipping). Optional for backwards compat with pre-Phase 54 data.
```
Could reference the enhancement ID (ENH-ORDERAMOUNT) for traceability.

---

## Consensus Issues (2+ reviewers)

| Finding | Reviewers | Tier |
|---------|-----------|------|
| C1: `upsertOrders` missing `orderAmount` in arg validator | code-quality, staffreview | Critical |
| M1: In-place mutation of input + return value pattern | code-quality, staffreview | Minor |

---

## Plan Fidelity Assessment

| Requirement | Plan | Implementation | Status |
|-------------|------|----------------|--------|
| BUG-01: saleAmount missing | Plan 01 | normalizePlatformFees Shopee/TikTok branches | Complete |
| BUG-02: platform field null | Plan 02 | Explicit platform param in sync.ts | Complete |
| BUG-03: TikTok fields missing | Plan 01 | 5 field mappings in TikTok branch | Complete |
| BUG-04: Condition uses === 0 | Plan 01 | shouldOverwrite() helper | Complete |
| BUG-05: Shopee fee sign wrong | Plan 01 | -Math.abs() negation | Complete |
| BUG-06: Profit double-subtraction | Plan 02 | order.profit in queries.ts | Complete |
| CASE-01: otherfee case mismatch | Plan 01 | Top-of-function resolution | Complete |
| ENH-ORDERAMOUNT: schema + storage | Plan 02 | schema.ts + mapOrderToStorage | **Incomplete** (mutations.ts validator missing) |
| ENH-REVENUE-SEMANTICS: gross/net | Plan 02 | revenueGross = orderAmount ?? saleAmount | Complete |
| ENH-SHIPPING-DISPLAY: buyer shipping column | Plan 02 | BigSellerOrdersTable updated | Complete |
| ?? 0 fallbacks | Plan 02 | All financial fields updated | Complete |

**Overall plan compliance:** 10/11 requirements complete. The `orderAmount` storage path has a gap at the Convex mutation validator level.

---

## Architectural Assessment

**Positive patterns:**
- TDD discipline (RED then GREEN) with HAR-confirmed values
- `shouldOverwrite()` helper centralizes a tricky null/zero/overwrite decision
- Explicit platform parameter eliminates reliance on unreliable API field
- `?? 0` over `|| 0` for financial fields is semantically correct
- Schema uses `v.optional()` for backwards compatibility

**Risks:**
- None beyond the critical C1 issue

---

*Review completed: 2026-03-15*
*Reviewers: requirements-reviewer, code-quality-reviewer, staffreview*
