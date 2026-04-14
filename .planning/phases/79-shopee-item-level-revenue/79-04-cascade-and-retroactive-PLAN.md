---
phase: 79
plan: 04
type: execute
wave: 2
depends_on: [79-01, 79-02]
files_modified:
  - convex/externalData/mutations.ts
  - convex/integrations/bigseller/helpers.ts
autonomous: true
requirements: [DA-06]
tags: [bigseller, shopee, retroactive-mapping, cascade]
must_haves:
  truths:
    - "When admin maps SKU→menuProduct, ALL existing externalRevenueItems with externalItemId === SKU have linkedMenuProductId updated in one atomic cascade"
    - "Parent externalRevenue.linkedMenuProductId = dominant SKU's menuProduct (D-09: max qty, ties → max price)"
    - "Mapping a non-dominant SKU leaves parent's linkedMenuProductId untouched (dominant SKU still holds)"
    - "Cascade is idempotent — running twice produces identical DB state"
    - "No isManuallyMapped flag introduced (D-10)"
  artifacts:
    - path: convex/externalData/mutations.ts
      provides: Extended applyRetroactiveProductMapping with Shopee/TikTok item+parent cascade using dominantSku helper
      contains: "applyRetroactiveProductMapping"
  key_links:
    - from: convex/externalData/mutations.ts applyRetroactiveProductMapping
      to: convex/integrations/bigseller/helpers.ts dominantSku
      via: "import { dominantSku } from ..."
      pattern: "dominantSku"
---

<objective>
Extend `applyRetroactiveProductMapping` Shopee/TikTok branch (currently parent-only) to cascade SKU→menuProduct mapping into all child `externalRevenueItems` AND set the parent `externalRevenue.linkedMenuProductId` using the dominant-SKU rule (D-09).

Purpose: DA-06. Retroactive mapping of Shopee/TikTok SKUs now produces accurate per-product attribution across the full history, not just new orders.

Output: retroactive-mapping-shopee test green. Admin-triggered mapping updates items + parent in one atomic mutation.
</objective>

<execution_context>
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/workflows/execute-plan.md
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/79-shopee-item-level-revenue/79-CONTEXT.md
@.planning/phases/79-shopee-item-level-revenue/79-RESEARCH.md §Pattern 3
@convex/externalData/mutations.ts (applyRetroactiveProductMapping line 446-495)
@convex/integrations/bigseller/helpers.ts (dominantSku from Plan 02)
@convex/externalData/__tests__/retroactive-mapping-shopee.test.ts
@convex/schema.ts §externalRevenue, §externalRevenueItems, §bigsellerOrders
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extend Shopee/TikTok branch of applyRetroactiveProductMapping</name>
  <read_first>
    - convex/externalData/mutations.ts lines 446-495 (current Shopee/TikTok branch — parent-only)
    - convex/externalData/mutations.ts lines 455-468 (by-name item loop — already partially works because Shopee productName = SKU)
    - convex/integrations/bigseller/helpers.ts dominantSku signature
    - convex/schema.ts §externalRevenue `linkedMenuProductId` optional field
    - convex/schema.ts §bigsellerOrders `skuVoList` array structure
  </read_first>
  <action>
Modify the Shopee/TikTok branch inside `applyRetroactiveProductMapping` (mutation signature unchanged: `{ token, source, externalProductCode, externalProductName, menuProductId }`).

**Step 1 — Cascade items by externalItemId (SKU):**

Current by-name loop (lines 455-468) already catches Shopee items because `productName` defaults to SKU code on sync. Keep that loop but ALSO add an explicit by-`externalItemId` loop for robustness (since Plan 03's item emit sets productName = menuProduct.name WHEN mapped, SKU WHEN unmapped — so after mapping, the productName changes and the by-name lookup misses stragglers):

```typescript
// After existing by-name item patching:
const itemsBySku = await ctx.db
  .query("externalRevenueItems")
  .withIndex("by_source_external_item", q => q.eq("source", args.source).eq("externalItemId", args.externalProductCode))
  .collect();
// If no such index exists, use filter over by_source with externalItemId predicate.
// VERIFY index presence; add new index `by_source_external_item` to schema.ts if missing
// (rename-safe: additive index, no data migration).
for (const item of itemsBySku) {
  await ctx.db.patch(item._id, {
    linkedMenuProductId: args.menuProductId,
    isAutoMatched: true,
    matchConfidence: "exact",
    productName: /* menuProduct.name for consistency */,
  });
}
```

**Step 2 — Dominant-SKU parent update (D-09):**

For each bigsellerOrder whose `skuVoList` contains the targetSku:
1. Fetch the associated `externalRevenue` (via existing `linkRevenueToOrders` / `bigsellerOrders.revenueId` pointer).
2. Build a `mappingBySku` Map: for every SKU in this order's skuVoList, look up `externalProductMappings` to get current menuProductId + menuProduct.price.
3. Call `dominantSku(order.skuVoList, mappingBySku)` → `{sku, menuProductId}`.
4. If `dominant.sku === args.externalProductCode`, patch parent `externalRevenue.linkedMenuProductId = args.menuProductId`.
5. If `dominant.sku !== args.externalProductCode`, leave parent alone (some OTHER mapped SKU holds dominance — don't overwrite).

**Step 3 — Idempotency:**

The patch operation is naturally idempotent (setting the same fields to the same values produces the same state). Document in code comment: `// Idempotent: rerunning with same args produces zero observable change`.

**Step 4 — Schema index (if missing):**

Check `convex/schema.ts` for `externalRevenueItems` index containing `["source", "externalItemId"]`. If missing, add:
```typescript
.index("by_source_external_item", ["source", "externalItemId"])
```
This is additive; does NOT require data migration.

**Do NOT:**
- Add `isManuallyMapped` flag (D-10).
- Touch GoFood/GoBiz/internal branches — they remain as-is.
- Introduce locks or queueing (Pitfall 4 is self-healing — next sync / next mapping picks up stragglers).
  </action>
  <verify>
    <automated>npm run test -- --run convex/externalData/__tests__/retroactive-mapping-shopee.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "dominantSku" convex/externalData/mutations.ts` returns match (imported + called)
    - `grep -n "by_source_external_item" convex/schema.ts convex/externalData/mutations.ts` returns matches
    - retroactive-mapping-shopee test GREEN (all 4 cases)
    - No `isManuallyMapped` symbol introduced (`grep -r "isManuallyMapped" convex/ src/` returns no match)
    - GoFood/GoBiz/internal branches in applyRetroactiveProductMapping unchanged (diff shows only Shopee/TikTok branch additions + dominantSku import)
    - `npm run type-check` + `npm run build` pass
  </acceptance_criteria>
  <done>Cascade works for items + parent; test green; no flag pollution.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| Admin UI → applyRetroactiveProductMapping | Authenticated, admin-gated |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-79-05 | Elevation of Privilege | applyRetroactiveProductMapping | mitigate | Existing `requireRole(ctx, args.token, ["admin", "manager"])` preserved |
| T-79-06 | Tampering | Cross-source leakage if wrong source branch runs | mitigate | Explicit source === "shopee"/"tiktok" guard on the new item+parent logic; other branches untouched |
| T-79-07 | Tampering | Wrong parent linkedMenuProductId after mapping non-dominant SKU | mitigate | dominantSku rule; unit-tested with mixed-qty test case |
</threat_model>

<verification>
Test file retroactive-mapping-shopee.test.ts green; full suite still green.
</verification>

<success_criteria>
- [ ] retroactive-mapping-shopee test green
- [ ] by_source_external_item index exists
- [ ] `npm run build` passes
- [ ] GoFood/GoBiz/internal branches unchanged (reviewer-verifiable diff)
</success_criteria>

## Git Workflow
**Branch:** `feature/79-shopee-item-level-revenue`

## Implementation Waves
### Wave 2: Retroactive cascade [PARALLEL with Plan 03 — different file]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Extend applyRetroactiveProductMapping | convex/externalData/mutations.ts + schema.ts (index) |

## Documentation Updates
- [ ] SCHEMA.md (new index `by_source_external_item` on externalRevenueItems) — batched at phase end
- [ ] Code comment: cite D-08, D-09, D-10

## Success Criteria (this plan)
- [ ] Cascade test green
- [ ] Index added (if not already present)
- [ ] Build + type-check pass

<output>
Create `.planning/phases/79-shopee-item-level-revenue/79-04-SUMMARY.md`
</output>
