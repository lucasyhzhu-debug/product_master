---
phase: 79
plan: 03
type: execute
wave: 2
depends_on: [79-01, 79-02]
files_modified:
  - convex/integrations/bigseller/sync.ts
  - convex/integrations/bigseller/helpers.ts
autonomous: true
requirements: [DA-05, DA-11]
tags: [bigseller, shopee, sync, item-emit]
must_haves:
  truths:
    - "Every BigSeller sync run that creates/updates an externalRevenue for a Shopee or TikTok order with skuVoList.length > 0 also emits externalRevenueItems (one per skuVoList entry)"
    - "Σ items.totalPrice === externalRevenue.revenueGross (integer equality, enforced by prorateItems)"
    - "Platform (shopee/tiktok) is correctly attributed — no cross-platform leakage"
    - "Buyer fields: DA-11 explicitly deferred — RESEARCH.md confirms BigSeller pageList does NOT expose buyerName/phone/address. Documented in code comment; no schema change."
    - "saveRevenueItems dedup on (revenueId, externalItemId=sku) prevents duplicate inserts on re-sync"
  artifacts:
    - path: convex/integrations/bigseller/sync.ts
      provides: Per-order saveRevenueItems call inside fetchOrders stage, using prorateItems + buildPriceOracle
      contains: "internal.externalData.mutations.saveRevenueItems"
  key_links:
    - from: convex/integrations/bigseller/sync.ts
      to: convex/externalData/mutations.ts saveRevenueItems
      via: "ctx.runMutation(internal.externalData.mutations.saveRevenueItems, ...)"
      pattern: "saveRevenueItems"
    - from: convex/integrations/bigseller/sync.ts
      to: convex/integrations/bigseller/helpers.ts (buildPriceOracle, prorateItems, dominantSku)
      via: direct import
      pattern: "import.*buildPriceOracle.*prorateItems.*dominantSku"
---

<objective>
Wire the three Plan-02 helpers into the BigSeller sync `fetchOrders` stage. After the existing `saveRevenue` + `linkRevenueToOrders` block, iterate each order and emit `externalRevenueItems` rows via `internal.externalData.mutations.saveRevenueItems`.

Purpose: DA-05 goes live — new syncs start populating item-level rows. Downstream queries (lifetime, sell-through, COGS) automatically pick them up with no further changes.

Output: sync.ts emits items per order; revenue-invariants test green; new syncs produce item rows visible in Convex dashboard.
</objective>

<execution_context>
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/workflows/execute-plan.md
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/79-shopee-item-level-revenue/79-CONTEXT.md
@.planning/phases/79-shopee-item-level-revenue/79-RESEARCH.md §Pattern 1 + §Pattern 2
@convex/integrations/bigseller/sync.ts
@convex/integrations/bigseller/helpers.ts
@convex/integrations/gobiz/adapter.ts (canonical pattern — lines 450-490)
@convex/externalData/mutations.ts (saveRevenueItems line 587-644)
@convex/externalData/__tests__/revenue-invariants.test.ts
@convex/integrations/bigseller/__tests__/helpers.test.ts

<interfaces>
From convex/externalData/mutations.ts:
```typescript
export const saveRevenueItems = internalMutation({
  args: { revenueId: v.id("externalRevenue"), items: v.array(v.object({
    externalItemId: v.optional(v.string()),
    productName: v.string(),
    unitPrice: v.number(),
    quantity: v.number(),
    totalPrice: v.number(),
    linkedMenuProductId: v.optional(v.id("menuProducts")),
    isAutoMatched: v.boolean(),
    matchConfidence: v.union(v.literal("exact"), v.literal("strong"), v.literal("suggested"), v.literal("none")),
  })) },
  // Dedup on (revenueId, externalItemId) via by_revenue index
});
```

From convex/integrations/bigseller/helpers.ts (Plan 02):
```typescript
export function buildPriceOracle(orders): Map<string, number>;
export function prorateItems(order, oracle, mappingBySku): Array<{sku, skuNum, unitPrice, totalPrice}>;
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Emit externalRevenueItems per order in BigSeller sync fetchOrders stage</name>
  <read_first>
    - convex/integrations/bigseller/sync.ts (find `fetchOrders` stage; locate where `saveRevenue` is called per batch — note the revenue ID / order mapping)
    - convex/integrations/gobiz/adapter.ts lines 450-490 (canonical mirror pattern)
    - convex/externalData/mutations.ts lines 587-644 (saveRevenueItems signature + dedup)
    - convex/integrations/bigseller/helpers.ts (existing mapOrderToRevenue; DO NOT modify, reuse mappingBySku-style structures)
  </read_first>
  <action>
**Step 1 — Build priceOracle once per sync run (before the order loop):**

In the `fetchOrders` stage (or at the top of the stage that iterates orders), load historical single-SKU bigsellerOrders via a new internal query `getSingleSkuOrdersForOracle` (add to `convex/bigsellerOrders/queries.ts` if a suitable one doesn't exist). Scope: all bigsellerOrders where `skuVoList.length === 1` (use `.collect()` — documented max ~6K rows per assumption A1, safe). Call `buildPriceOracle(orders)` → priceOracle Map.

Alternative (simpler): accept performance cost of building oracle per sync call. If >6K orders become a problem, paginate in a follow-up.

**Step 2 — Build mappingBySku:**

Query all `externalProductMappings` where `source === "shopee" || source === "tiktok"`. Build `Map<sku, {menuProductId, menuProductPrice}>`. For menuProductPrice, fetch associated `menuProducts` row and use `menuProduct.price` field. Cache menuProductById as Map too.

**Step 3 — Emit items per order:**

Inside the per-platform loop (after `saveRevenue` creates/updates the parent revenueId and `linkRevenueToOrders` links it to the bigsellerOrder), branch for Shopee/TikTok platforms:

```typescript
if ((order.platform === "shopee" || order.platform === "tiktok") && order.skuVoList && order.skuVoList.length > 0) {
  const prorated = prorateItems(
    { orderAmount: order.orderAmount, saleAmount: order.saleAmount, skuVoList: order.skuVoList },
    priceOracle,
    mappingBySku,
  );
  const items = prorated.map(p => {
    const mapping = mappingBySku.get(p.sku);
    const menuProductId = mapping?.menuProductId as Id<"menuProducts"> | undefined;
    const menuProduct = menuProductId ? menuProductById.get(menuProductId) : null;
    const productName = menuProduct?.name ?? p.sku;  // fallback: raw SKU code
    return {
      externalItemId: p.sku,                        // D-18 dedup key
      productName,
      unitPrice: p.unitPrice,
      quantity: p.skuNum,
      totalPrice: p.totalPrice,
      linkedMenuProductId: menuProductId,
      isAutoMatched: Boolean(menuProductId),
      matchConfidence: menuProductId ? "exact" as const : "none" as const,
    };
  });
  await ctx.runMutation(internal.externalData.mutations.saveRevenueItems, {
    revenueId,
    items,
  });
}
```

**Step 4 — Document DA-11 deferral in code:**

Add a comment block near the item-emit branch:
```typescript
// DA-11 deferral: BigSeller pageList does NOT expose buyerName/buyerPhone/buyerAddress.
// Only financial buyer* fields (buyerShippingFee, buyerTotalAmount) are returned.
// Per D-07, customer data capture is deferred entirely this phase.
// See: .planning/phases/79-shopee-item-level-revenue/79-RESEARCH.md §Summary + §Critical finding.
```

**Step 5 — Cross-platform guard (avoid Pitfall 1):**

The per-order iteration already knows which platform it belongs to (from the adapter's filter). Add a defensive assertion: `if (revenueSource !== order.platform) throw new Error(...)`. Document this as the guard for cross-platform leakage.

**Do NOT:**
- Delete & recreate items (rely on `saveRevenueItems` dedup).
- Add a parallel `processBigsellerSales` inventory deduction (D-22).
- Fetch per-order BigSeller detail endpoint (D-07).
  </action>
  <verify>
    <automated>npm run test -- --run convex/externalData/__tests__/revenue-invariants.test.ts convex/integrations/bigseller/__tests__/helpers.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "saveRevenueItems" convex/integrations/bigseller/sync.ts` returns at least one match
    - `grep -n "buildPriceOracle\|prorateItems" convex/integrations/bigseller/sync.ts` returns matches (imports + call sites)
    - `grep -n "DA-11 deferral" convex/integrations/bigseller/sync.ts` returns match (code comment present)
    - revenue-invariants test passes: Σ items.totalPrice === parent.revenueGross for new Shopee rows
    - No `processBigsellerSales` symbol introduced (`grep -r "processBigsellerSales" convex/` returns no match — guards D-22)
    - `npm run type-check` passes
    - `npm run build` passes
  </acceptance_criteria>
  <done>BigSeller sync emits items; revenue invariant test green; no inventory-deduction side-effect added.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| BigSeller API → Convex sync | Untrusted external data; must validate types via existing `mapOrderToRevenue` schema |
| Sync caller → saveRevenueItems | Internal mutation; caller is trusted Convex action |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-79-01 | Tampering | sync.ts item emit | mitigate | prorateItems enforces Σ === orderAmount exactly; revenue-invariants test guards regression |
| T-79-02 | Tampering | Cross-platform item leakage (Shopee items attached to TikTok revenueId) | mitigate | Defensive assertion `revenueSource === order.platform` before saveRevenueItems call |
| T-79-03 | Information Disclosure | BigSeller pageList buyer fields | accept | Research confirms no PII returned by pageList — no capture, no leak |
| T-79-04 | DoS | buildPriceOracle scans all historical orders per sync run | accept | ~6K rows max (assumption A1); add composite index in follow-up if volume grows |
</threat_model>

<verification>
New sync runs create item rows. Existing sync rows unchanged (backfill handled in Plan 07). Revenue conservation invariant enforced.
</verification>

<success_criteria>
- [ ] revenue-invariants test green
- [ ] `npm run type-check` + `npm run build` + `npm run test` all pass
- [ ] Manual dev sync shows `externalRevenueItems.source="shopee"` or `"tiktok"` rows after next sync
- [ ] No `processBigsellerSales` added (D-22 honored)
- [ ] DA-11 deferral comment present in sync.ts
</success_criteria>

## Git Workflow
**Branch:** `feature/79-shopee-item-level-revenue`

## Implementation Waves
### Wave 2: Sync emit [SEQUENTIAL after Plan 02]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Wire prorateItems + saveRevenueItems into fetchOrders | convex/integrations/bigseller/sync.ts, helpers.ts (for oracle query if needed) |

## Documentation Updates
- [ ] Code comment: DA-11 deferral rationale + RESEARCH.md link

## Success Criteria (this plan)
- [ ] revenue-invariants.test green
- [ ] helpers test suite green
- [ ] Build + type-check pass

<output>
Create `.planning/phases/79-shopee-item-level-revenue/79-03-SUMMARY.md`
</output>
