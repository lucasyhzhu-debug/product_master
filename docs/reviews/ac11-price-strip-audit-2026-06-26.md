# AC11 Confidential-Price Strip Coverage Audit

**Date:** 2026-06-26  
**Auditor:** Task 14 (verify-only, build nothing)  
**Branch:** `feature/subscription-rule-enforcement`  
**Scope:** Confirm subscription pricing is stripped server-side (D11) from every staff-reachable order query surface.

---

## 1. Strip Helper Field Coverage

File: `convex/orders/helpers/stripSubscriptionPricing.ts`

### Order-level fields nulled (lines 30–33)
```ts
order: {
  ...order,
  totalAmount: undefined,   // line 30
  finalTotal: undefined,    // line 31
  totalMargin: undefined,   // line 32
  totalCost: undefined,     // line 33
},
```

### Item-level fields nulled (lines 36–43)
```ts
items: items.map((it) => ({
  ...it,
  unitPrice: undefined,   // line 37
  lineTotal: undefined,   // line 38
  // CR-E: subscription items carry the CONFIDENTIAL partner price in lineMargin
  // (lineCost is 0). These leaked through the original strip — null them too.
  lineMargin: undefined,  // line 41
  lineCost: undefined,    // line 42
})),
```

**Coverage:** All 8 required fields confirmed nulled. Strip only fires for non-managerial roles (`MANAGERIAL = new Set(["manager", "admin"])`, line 18) on subscription orders (via `isSubscriptionOrder`, line 24).

---

## 2. Per-Site Strip Coverage — 10 Staff-Reachable Order Query Sites

### `convex/orders/queries.ts` (9 sites)

| Query | Export line | Strip call line(s) | Strip applied? |
|-------|------------|-------------------|---------------|
| `list` | 65 | 150 | Y |
| `listPaginated` | 189 | 218 | Y |
| `get` | 255 | 280 | Y |
| `getByOrderNumber` | 294 | 314 | Y |
| `getKitchenOrders` | 333 | 372, 399 (two branches) | Y |
| `getByCustomer` | 446 | 462 | Y |
| `getPackagingOrders` | 669 | 735 | Y |
| `getCompletedToday` | 874 | 934 | Y |
| `listForKanban` | 961 | 1002 | Y |

### `convex/orders/kitchenQueries.ts` (1 site)

| Query | Export line | Strip call | Strip applied? | Rationale |
|-------|------------|-----------|---------------|-----------|
| `getKitchenPackingOrders` | 11 | None | N/A — no money fields in return shape | Handler manually projects to `{orderNumber, customerName, status, deliveryType, dueDate, expedited, creatorName, productItems, packagingMaterials, allProductsPacked, canMarkReady}`. Neither order-level totals nor item-level `unitPrice`/`lineTotal`/`lineMargin`/`lineCost` appear in the returned object. The comment at lines 12–16 explicitly acknowledges this design: *"The returned shape (productItems = name/qty/packStatus, packagingMaterials) carries NO money fields, so no pricing strip is needed here."* |

All 9 `queries.ts` sites apply `stripOrder`. `getKitchenPackingOrders` never emits money fields — a strip call would be vacuous. No gaps.

---

## 3. Test Results

Files verified:
- `convex/orders/helpers/__tests__/stripSubscriptionPricing.test.ts` — 17 tests
- `convex/orders/helpers/__tests__/stripOrders.test.ts` — 3 tests

### Test names (stripSubscriptionPricing.test.ts)
- `strips price fields for a non-manager on a subscription order`
- `keeps prices (incl. lineMargin/lineCost) for a manager`
- `keeps prices for a non-manager on a NON-subscription order`
- (plus 14 characterization tests pinning current strip behavior per AC11 cross-role matrix)

### Test names (stripOrders.test.ts)
- `stripOrder matches stripSubscriptionPricing for kitchen`
- `stripOrder tolerates omitted items`
- `stripOrders strips a batch, preserves enriched non-money fields`

### Run result
```
RUN  v4.0.18

✓ convex/orders/helpers/__tests__/stripOrders.test.ts (3 tests) 4ms
✓ convex/orders/helpers/__tests__/stripSubscriptionPricing.test.ts (17 tests) 7ms

 Test Files  2 passed (2)
      Tests  20 passed (20)
   Start at  04:22:15
   Duration  1.24s
```

**All 20 tests PASS.**

---

## 4. Verdict

**PASS**

All 10 staff-reachable order query sites are covered:
- 9 sites in `queries.ts` each call `stripOrder` before returning data.
- `getKitchenPackingOrders` in `kitchenQueries.ts` projects to a money-field-free shape; no strip required.

The helper nulls all 8 required fields (`totalAmount`, `finalTotal`, `totalMargin`, `totalCost` at order level; `unitPrice`, `lineTotal`, `lineMargin`, `lineCost` at item level). Tests are comprehensive (20 tests, 2 files) and all pass. AC11 (D11: strip, don't hide) is fully satisfied.

No gaps found. No escalation required.
