---
phase: 79
plan: 04
subsystem: retroactive-mapping-cascade
tags: [bigseller, shopee, tiktok, retroactive-mapping, cascade, wave-2]
dependency_graph:
  requires:
    - dominantSku
    - failing-tests-for-retroactive-mapping-cascade
  provides:
    - retroactive-cascade-to-externalRevenueItems-by-externalItemId
    - parent-linkedMenuProductId-via-dominantSku
    - applyRetroactiveProductMapping-public-mutation
    - by_source_external_item-index
  affects:
    - convex/externalData/mutations.ts (updateProductMapping + setMenuProductForSku now inherit cascade)
    - convex/schema.ts (additive index)
tech-stack:
  added: []
  patterns:
    - "Parent dominance derived from persisted externalRevenueItems (not bigsellerOrders.skuVoList) — correct whether or not a bigsellerOrders row exists"
    - "Mapping snapshot built once per cascade run, overlaid with just-applied mapping to handle pre-mapping-row callers"
    - "Additive schema index — no data migration required"
key-files:
  created: []
  modified:
    - convex/externalData/mutations.ts
    - convex/schema.ts
    - convex/externalData/__tests__/retroactive-mapping-shopee.test.ts
    - convex/externalData/__tests__/revenue-invariants.test.ts
decisions:
  - "Derived parent dominance from externalRevenueItems rather than bigsellerOrders.skuVoList. The plan suggested walking bigsellerOrders, but tests + legacy data may have revenue rows without a paired bigsellerOrders row, making the items-derived approach strictly more robust. Still uses dominantSku() helper for the decision logic."
  - "Exposed applyRetroactiveProductMapping as a public mutation (not just an internal helper). The Wave 0 cascade test invokes it directly; production callers (updateProductMapping, setMenuProductForSku) now route through a renamed internal helper (applyRetroactiveProductMappingImpl) that shares the same body."
  - "Fixed pre-existing test seed drift: retroactive-mapping-shopee and revenue-invariants seeded menuProducts with the pre-refactor field shape (name/price/displayOrder). Test schema validation was failing at INSERT, masking the actual mutation failure. Applied Rule 1 (bug fix): updated to current schema (code/grams/defaultPrice/unitCost/cachedProductionSummary)."
metrics:
  duration: "~40 minutes"
  completed: 2026-04-14
  tasks: 1
  commits: 1
  files_modified: 4
---

# Phase 79 Plan 04: Cascade & Retroactive Mapping Summary

Retroactive SKU->menuProduct mapping now propagates correctly for Shopee/TikTok: every child `externalRevenueItems` row with a matching `externalItemId` gets the new `linkedMenuProductId`, and each parent `externalRevenue.linkedMenuProductId` is recomputed via the dominant-SKU rule (D-09). Idempotent; no `isManuallyMapped` flag introduced.

## What Was Done

### Task 1 — Extend applyRetroactiveProductMapping Shopee/TikTok branch (commit `b38bc306`)

Modified `convex/externalData/mutations.ts`:

1. **Renamed** the existing module-private helper `applyRetroactiveProductMapping` -> `applyRetroactiveProductMappingImpl` so a new public mutation can reuse the name without collision.
2. **Added `export const applyRetroactiveProductMapping = mutation(...)`** — admin/manager-gated, thin wrapper that looks up the mapping's `externalProductName` from `externalProductMappings` (falls back to SKU code) and delegates to the impl. Enables retroactive cascades from admin tooling and tests without requiring updateProductMapping's mappingId round-trip.
3. **Extended the impl** for Shopee/TikTok:
   - **2a) by-SKU cascade**: queries `externalRevenueItems.by_source_external_item(source, externalItemId)`, patches every matching row with `linkedMenuProductId`, `isAutoMatched=true`, `matchConfidence="exact"`, `productName=externalProductName`. Dedupes against the by-name patched set so an item isn't double-written.
   - **2b) dominant-SKU parent update (D-09)**: walks the distinct parent `revenueId`s touched by (2a), fetches all siblings, reconstructs a `skuVoList`-shape input from `{externalItemId, quantity}`, calls `dominantSku(list, mappingBySku)`, and patches `externalRevenue.linkedMenuProductId` only when the mapped SKU wins. Leaves parent alone otherwise.
   - **Batch guard**: throws if `itemsBySku.length > 4000` (staff-review Improvement 2 — fail-fast at Convex mutation transaction ceiling).
4. **Added schema index** `externalRevenueItems.by_source_external_item(source, externalItemId)`. Additive — no data migration.
5. **Imported `dominantSku`** from `../integrations/bigseller/helpers` (provided by Plan 02).

### Deviations

**Plan suggested walking bigsellerOrders for parent update. Implemented via externalRevenueItems instead.**

- **Rule:** Rule 1 (bug fix / correctness)
- **Found during:** Task 1 test execution.
- **Issue:** The plan instructed to iterate `bigsellerOrders` whose `skuVoList` contains the mapped SKU and update their `linkedRevenueId`. But the Wave 0 cascade tests seed revenue + items directly WITHOUT a paired `bigsellerOrders` row — so the bigsellerOrders-driven parent update was a no-op for the tests. Even in production, legacy Shopee data from pre-Phase-54 may have revenue rows without bigsellerOrders pairs.
- **Fix:** Derived parent dominance from the persisted `externalRevenueItems` themselves (collect distinct `revenueId`s from the cascaded items, fetch siblings, reconstruct `skuVoList` from `{externalItemId, quantity}`). Still uses the `dominantSku()` helper for the decision — D-09 invariant preserved.
- **Commit:** `b38bc306`
- **Upside:** Strictly more robust — works for any Shopee/TikTok revenue row that has items, regardless of bigsellerOrders presence. Does NOT depend on the Plan 03 emit path writing skuVoList correctly.

**Rule 1 (bug fix): pre-existing test seed drift in retroactive-mapping-shopee + revenue-invariants**

- **Found during:** Task 1 first test run.
- **Issue:** Both Wave-0 test files seeded `menuProducts` with fields (`name`, `price`, `isActive`, `displayOrder`, `createdAt`) that no longer match the current schema (`code`, `name`, `grams`, `defaultPrice`, `isActive`, `unitCost`, `cachedProductionSummary`). The convex-test schema validator rejected the insert, which masked the real mutation-under-test failure.
- **Fix:** Updated `seedMenuProduct` helpers in both test files to use the current schema field shape.
- **Files modified:** `convex/externalData/__tests__/retroactive-mapping-shopee.test.ts`, `convex/externalData/__tests__/revenue-invariants.test.ts`
- **Commit:** `b38bc306` (bundled with the cascade work since the tests are the verification vehicle for this plan)

## Verification Evidence

```bash
# Target test suite — this plan's primary acceptance
$ npx vitest run convex/externalData/__tests__/retroactive-mapping-shopee.test.ts
✓ cascades to all items with matching externalItemId + updates parent when dominant
✓ when two mappings are applied in order, parent ends at the dominant one
✓ mapping a minor SKU leaves parent unchanged
✓ is idempotent — running same mapping twice produces the same DB state
Test Files  1 passed (1)
Tests       4 passed (4)

# Revenue invariants — cascade test flips from red to green
$ npx vitest run convex/externalData/__tests__/revenue-invariants.test.ts
✓ Σ items.totalPrice === parent.revenueGross (integer equality) after ingest
✓ invariant holds after applyRetroactiveProductMapping cascade   ← NEWLY GREEN
✗ sellThrough does NOT double-count ...                          ← Plan 06 scope
Test Files  1 failed (1)   ← expected; Plan 06 not yet shipped
Tests       1 failed | 2 passed (3)

# Wave 0 helper tests — still GREEN (Plan 02 contract intact)
$ npx vitest run convex/integrations/bigseller/__tests__/
Tests       121 passed | 3 failed (all 3 = Plan 05/06 deferred)

$ npm run type-check  → exit 0
$ npm run build       → ✓ built in 20.44s
```

## Acceptance Criteria

- ✅ `grep -n "dominantSku" convex/externalData/mutations.ts` → 3 matches (import + 1 call + 1 doc reference)
- ✅ `grep -n "by_source_external_item" convex/schema.ts convex/externalData/mutations.ts` → 2 matches (index def + withIndex call)
- ✅ retroactive-mapping-shopee test: 4/4 GREEN
- ✅ `grep -n "itemCount > 4000\|Cascade batch size" convex/externalData/mutations.ts` → 1 match (batch guard present)
- ✅ No `isManuallyMapped` symbol introduced (only appears in doc comment as negative assertion)
- ✅ GoFood/GoBiz/internal branches unchanged — diff only touches the Shopee/TikTok branch + a new public mutation + index
- ✅ `npm run type-check` + `npm run build` pass

## Auth Gates

None. Both the renamed internal helper and the new public mutation preserve the existing `requireRole(ctx, args.token, ["admin", "manager"])` gate (T-79-05).

## Known Stubs

None — cascade is production-ready. Works out of the box on the next admin-triggered mapping, whether invoked via `updateProductMapping`, `setMenuProductForSku`, or the new public `applyRetroactiveProductMapping` mutation.

## Deferred Issues

- `sellThrough does NOT double-count` test in revenue-invariants.test.ts remains red — Plan 06 scope (sell-through query branches for Shopee/TikTok).
- 3 cron.test.ts tests remain red — Plan 05 scope (nightly sync + skip-if-not-idle).
- 4 sell-through-shopee.test.ts tests remain red — Plan 06 scope.

All deferred items are Wave 0 red-bar tests planted in Plan 01 to anchor downstream wave behavior. Not regressions.

## Threat Flags

None — changes are additive within an already-admin-gated mutation. Cross-source leakage mitigated by explicit `source === "shopee" || source === "tiktok"` guard (T-79-06); wrong-parent mitigated by dominant-SKU rule (T-79-07). No new network surface, no new auth paths.

## Self-Check: PASSED

- ✅ `convex/externalData/mutations.ts` contains `export const applyRetroactiveProductMapping = mutation`
- ✅ `convex/externalData/mutations.ts` contains `dominantSku` import
- ✅ `convex/externalData/mutations.ts` contains `by_source_external_item` withIndex call
- ✅ `convex/externalData/mutations.ts` contains `Cascade batch size` guard
- ✅ `convex/schema.ts` contains `.index("by_source_external_item", ["source", "externalItemId"])`
- ✅ `convex/externalData/__tests__/retroactive-mapping-shopee.test.ts` schema-valid menuProducts seed
- ✅ `convex/externalData/__tests__/revenue-invariants.test.ts` schema-valid menuProducts seed
- ✅ retroactive-mapping-shopee.test.ts: 4/4 GREEN
- ✅ revenue-invariants.test.ts cascade sub-test: GREEN
- ✅ `npm run type-check` passes (exit 0)
- ✅ `npm run build` passes (exit 0, built in 20.44s)
- ✅ Commit `b38bc306` in git log: `feat(79-04): cascade retroactive mapping to items + dominant-SKU parent`

## Downstream Consumers (for Plans 05–07 context)

- **Plan 06 (sell-through Shopee/TikTok branches)** — will read `externalRevenueItems.linkedMenuProductId` (now kept in sync via this cascade) to aggregate per-product quantity without double-counting parent.revenueGross.
- **Plan 07 (BigSellerSyncPanel "Map manually" affordance)** — any admin-triggered mapping via the existing `setMenuProductForSku` mutation automatically benefits from the cascade (same impl path).
- **Lifetime + COGS helpers** — already consume `externalRevenueItems.linkedMenuProductId`; retroactive mappings now update historical rows, improving ball-count accuracy for back-dated lifetime queries.
