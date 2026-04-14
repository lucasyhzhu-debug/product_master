---
phase: 79
plan: 02
type: execute
wave: 1
depends_on: [79-01]
files_modified:
  - convex/integrations/bigseller/helpers.ts
autonomous: true
requirements: [DA-05]
tags: [bigseller, shopee, helpers, pure-functions]
must_haves:
  truths:
    - "buildPriceOracle returns median(orderAmount/skuNum) per SKU from single-SKU historical orders"
    - "prorateItems guarantees Σ items.totalPrice === orderAmount (integer equality)"
    - "prorateItems residual rounding assigns leftover IDR to the largest-qty item"
    - "dominantSku returns max-qty SKU; ties broken by max menuProduct.price"
    - "Three-tier fallback: oracle → menuProduct.price → flat share"
  artifacts:
    - path: convex/integrations/bigseller/helpers.ts
      provides: Three new exports — buildPriceOracle, prorateItems, dominantSku
      exports: ["buildPriceOracle", "prorateItems", "dominantSku"]
  key_links:
    - from: convex/integrations/bigseller/helpers.ts
      to: convex/integrations/bigseller/sync.ts (Plan 03 consumer)
      via: "import { buildPriceOracle, prorateItems, dominantSku } from './helpers'"
      pattern: "import.*helpers"
---

<objective>
Implement the three pure helper functions that underpin Shopee item emission: `buildPriceOracle`, `prorateItems`, `dominantSku`. All three live in the existing `convex/integrations/bigseller/helpers.ts` file (purely additive; no existing helper is modified).

Purpose: Enforce D-01 (residual rounding), D-03 (three-tier fallback), D-04 (revenue conservation via integer equality), D-09 (dominant-SKU rule) as pure, unit-testable math. Convex sync code can then call these without embedded logic.

Output: helpers.ts gains three exports; all 3 tests from Plan 01 Task 1 flip green.
</objective>

<execution_context>
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/workflows/execute-plan.md
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/79-shopee-item-level-revenue/79-CONTEXT.md
@.planning/phases/79-shopee-item-level-revenue/79-RESEARCH.md
@convex/integrations/bigseller/helpers.ts
@convex/integrations/bigseller/__tests__/priceOracle.test.ts
@convex/integrations/bigseller/__tests__/prorateItems.test.ts
@convex/integrations/bigseller/__tests__/dominantSku.test.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement buildPriceOracle, prorateItems, dominantSku</name>
  <read_first>
    - convex/integrations/bigseller/helpers.ts (existing file; append new exports, do NOT touch `mapOrderToRevenue` etc.)
    - convex/integrations/bigseller/__tests__/priceOracle.test.ts (tests from Plan 01 — target behavior spec)
    - convex/integrations/bigseller/__tests__/prorateItems.test.ts
    - convex/integrations/bigseller/__tests__/dominantSku.test.ts
    - 79-RESEARCH.md §Code Examples (reference implementations — copy as-is)
  </read_first>
  <behavior>
    - buildPriceOracle: filter skuVoList.length===1 and skuNum>0 and (orderAmount ?? saleAmount)>0; group by sku; median (even → avg of two middle); Math.round to integer IDR.
    - prorateItems: Step 1 — tentative per-unit weight via oracle.get(sku) ?? mapping.menuProductPrice ?? (baseAmount / totalQty). Step 2 — weighted pro-rata scaling with Math.floor. Step 3 — residual = baseAmount - Σ floored; assign to largest-qty item (ties → highest-first-seen tentativeUnit). Output unitPrice = Math.round(totalPrice / skuNum).
    - dominantSku: empty → null. Length 1 → trivial. Length >1 → sort by skuNum desc, tiebreak by mapping.menuProductPrice desc; return sorted[0].
  </behavior>
  <action>
Append three new exports to `convex/integrations/bigseller/helpers.ts`. Use the code block from 79-RESEARCH.md §Code Examples verbatim with these exact signatures:

```typescript
export function buildPriceOracle(
  orders: ReadonlyArray<{
    orderAmount?: number;
    saleAmount: number;
    skuVoList: ReadonlyArray<{ sku: string; skuNum: number }>;
  }>
): Map<string, number> { /* median over single-SKU orders per D-03 */ }

export function prorateItems(
  order: {
    orderAmount?: number;
    saleAmount: number;
    skuVoList: Array<{ sku: string; skuNum: number }>;
  },
  oracle: Map<string, number>,
  mappingBySku: Map<string, { menuProductId?: string; menuProductPrice?: number }>
): Array<{ sku: string; skuNum: number; unitPrice: number; totalPrice: number }> {
  /* 3-tier fallback + residual to largest qty per D-01 */
}

export function dominantSku(
  skuVoList: ReadonlyArray<{ sku: string; skuNum: number }>,
  mappingBySku: Map<string, { menuProductId?: string; menuProductPrice?: number }>
): { sku: string | null; menuProductId: string | null } { /* D-09 */ }
```

Implementation notes (from RESEARCH):
- Oracle uses `order.orderAmount ?? order.saleAmount` as numerator (D-01 sum invariance over display accuracy — per assumption A4 in RESEARCH).
- prorateItems `Math.max(1, Math.round(weight))` to avoid zero-weight items.
- Residual assignment: tie-break by sorting `{i, qty}` desc by qty (first item at highest qty wins; this is stable given Array.sort in V8 is stable). Document in code comment.
- dominantSku tie on equal prices: first-listed wins (per assumption A5; matches sort stability).

All three functions are pure — no Convex ctx, no imports beyond types.
  </action>
  <verify>
    <automated>npm run test -- --run convex/integrations/bigseller/__tests__/priceOracle.test.ts convex/integrations/bigseller/__tests__/prorateItems.test.ts convex/integrations/bigseller/__tests__/dominantSku.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "export function buildPriceOracle" convex/integrations/bigseller/helpers.ts` returns match
    - `grep -n "export function prorateItems" convex/integrations/bigseller/helpers.ts` returns match
    - `grep -n "export function dominantSku" convex/integrations/bigseller/helpers.ts` returns match
    - All 3 test files from Plan 01 Task 1 turn GREEN (exit code 0)
    - `npm run type-check` passes
    - No changes to any other exports in helpers.ts (diff shows only additions)
  </acceptance_criteria>
  <done>helpers.ts has three new pure-function exports; 3 Wave-0 tests green.</done>
</task>

</tasks>

<verification>
The 3 pure-helper test files flip from red to green. Build + type-check pass. No runtime behavior change for existing sync path (helpers not yet called by sync — that's Plan 03).
</verification>

<success_criteria>
- [ ] 3 new named exports in helpers.ts
- [ ] 3 test files from Plan 01 Task 1 green
- [ ] `npm run type-check` passes
- [ ] `npm run build` passes
- [ ] No behavior change in BigSeller sync (helpers not yet wired)
</success_criteria>

## Git Workflow
**Branch:** `feature/79-shopee-item-level-revenue`
**Checkpoints:** None.

## Implementation Waves
### Wave 1: Pure helpers [PARALLEL — runs alongside plans 03..06 Wave 1 backend work]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Implement 3 pure helpers | convex/integrations/bigseller/helpers.ts |

## Documentation Updates
- [ ] Code comment citing D-01, D-03, D-09 references
- [ ] No CHANGELOG update yet (batched at end of phase)

## Success Criteria (this plan)
- [ ] 3 Wave-0 pure-helper tests green
- [ ] `npm run type-check` + `npm run build` pass

<output>
Create `.planning/phases/79-shopee-item-level-revenue/79-02-SUMMARY.md`
</output>
