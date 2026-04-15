---
status: resolved
trigger: "Shopee synced orders show -- in SKUs column for recent orders after user deleted and re-added menu products"
created: 2026-04-13T00:00:00Z
updated: 2026-04-13T03:00:00Z
---

## Current Focus

hypothesis: With corrected user input (user only deleted internal menuProducts, did NOT touch Shopee Seller Center), the user-reported cause is eliminated by code inspection. Symptoms are explained by (1) BigSeller returning transient empty skuVoList on the 13 Apr sync, compounded by (2) upsertOrders unconditionally overwriting skuVoList. Two adjacent issues were investigated and fixed in the same PR.
test: Verified all four deliverables (baseline preserve-non-empty, Frollie Product join, COGS warning clarity, per-platform fee regression).
expecting: All bigseller tests pass (124/125 — 1 pre-existing failure unrelated), type-check clean, build clean, zero regressions.
next_action: Commit + report.

## Symptoms

expected: Recent Shopee-synced orders should display mapped product SKU (e.g. FRO-OubChe-Reg1) in SKUs column.
actual: 13 Apr 2026 Frollie-S Shopee orders showed `--`; older rows still showed `FRO-OubChe-Reg1`. Sync reported "0 new, 61 updated".
errors: None. Pre-existing "Profit = Revenue (COGS not configured)" warning was expected.
reproduction: Sync BigSeller/Shopee for 14/03-13/04, observe recent rows in Synced Orders table.
started: After user deleted some internal Menu Products and re-added them (Shopee Seller Center listings untouched).

## Eliminated

- hypothesis: Delete+re-add of menuProducts caused cascading delete/FK validator to clear skuVoList
  evidence: Grep over convex/ shows no code path mutates bigsellerOrders.skuVoList outside sync upsert and linkRevenueToOrders (patches linkedRevenueId only). menuProducts.remove at convex/menuProducts/mutations.ts:420-447 is a simple ctx.db.delete with no side effects.
  timestamp: 2026-04-13T00:45:00Z

- hypothesis: New menuProduct _id broke a FK on bigsellerOrders or on externalProductMappings
  evidence: convex/schema.ts:1556-1589 — bigsellerOrders has NO menuProductId field. externalProductMappings FK rows survive menuProduct deletion (dangling pointer, but row kept). Screenshot 2 confirmed FRO-DubChe-Reg1 → "Dubai - Single (45g)" mapping survived.
  timestamp: 2026-04-13T00:50:00Z

- hypothesis: Phase 54 "COGS fix" regressed
  evidence: Phase 54 research (.planning/milestones/v1.7-phases/54-fix-bigseller-endpoint-schema/54-RESEARCH.md:33-37) explicitly deferred COGS — "requires manual BigSeller dashboard setup". Phase 54 fixed FEES, never COGS.
  timestamp: 2026-04-13T01:00:00Z

## Evidence

- timestamp: 2026-04-13T00:15:00Z
  checked: src/components/salesAnalytics/BigSellerOrdersTable.tsx:46-51 (pre-fix formatSkus)
  found: "--" triggered only by empty skuVoList. No lookup to mapping tables.
  implication: User's "broken mapping" diagnosis was a misdiagnosis.

- timestamp: 2026-04-13T00:16:00Z
  checked: convex/bigsellerOrders/mutations.ts:46-62 (pre-fix upsertOrders)
  found: Patches ALL fields including skuVoList on every sync. A single empty response from BigSeller permanently destroys previously-known SKU data.
  implication: Baseline fix: preserve-non-empty guard.

- timestamp: 2026-04-13T01:15:00Z
  checked: convex/integrations/bigseller/helpers.ts (BigSellerOrderRow interface + normalizePlatformFees Shopee branch)
  found: Interface MISSING buyerPaidShippingFee field. Shopee branch never maps buyerShippingFee. Per docs/BIGSELLER_PROFIT_API.md line 1456 (HAR-verified field-availability matrix): common buyerShippingFee is MISSING on Shopee endpoint. Line 1472 specifies mapping: buyerShippingFee <- buyerPaidShippingFee. Phase 54 research at line 351 listed buyerPaidShippingFee as required but execution missed it.
  implication: Regression. All Shopee orders showed buyerShippingFee=0 in the synced orders table.

- timestamp: 2026-04-13T01:30:00Z
  checked: src/components/salesAnalytics/BigSellerSyncPanel.tsx:388-395 and OverviewTab.tsx:170-178
  found: COGS warning fires when bigsellerOrders.costFee is 0 for every order. costFee comes from BigSeller per-SKU config — user must enter in BigSeller dashboard. Not a regression, but warning text was not actionable.
  implication: Clarify copy with actionable next step (either configure COGS in BigSeller, or use Frollie Product column to map SKUs for BOM-based margin computation).

## Resolution

root_cause: Primary symptom (13 Apr rows showing `--`) = BigSeller returned transient empty skuVoList, compounded by overwrite-on-update. Unrelated but adjacent issues: (a) buyerShippingFee never populated for Shopee orders because Phase 54 missed the Shopee-specific buyerPaidShippingFee field; (b) COGS warning text was not actionable.

fix:
  D1 baseline (preserve-non-empty on re-sync):
    - convex/bigsellerOrders/mutations.ts — extracted pure helper resolveSkuVoListOnUpdate(incoming, existing); upsertOrders uses it before ctx.db.patch. Returns existing SKUs when incoming is empty AND existing has entries.
    - convex/bigsellerOrders/__tests__/mutations.test.ts — 6 new unit tests (empty-empty, empty-nonempty, nonempty-empty, nonempty-nonempty, partial-refund reduction, defensive immutability).
    - convex/bigsellerOrders/queries.ts — added diagnoseSkuState internalQuery (dashboard diagnostic).

  D2 Option A (query-time SKU→Frollie product join, no schema change):
    - convex/bigsellerOrders/queries.ts — extended listOrders to resolve each SKU against externalProductMappings + menuProducts; returns resolvedSkus[] on each order.
    - convex/externalData/mutations.ts — added setMenuProductForSku mutation (upserts mapping row + runs retroactive revenue link, same logic as updateProductMapping).
    - src/hooks/convex/useExternalData.ts, src/hooks/convex/index.ts — useSetMenuProductForSku hook + barrel export.
    - src/components/salesAnalytics/BigSellerOrdersTable.tsx — replaced single "SKUs" column with two columns: "BigSeller SKU" + "Frollie Product". Unmapped SKUs render an inline Select dropdown populated with menuProducts; selecting writes via setMenuProductForSku. Empty skuVoList with allSkuNum > 0 shows "Pending SKU" tooltip instead of bare "--".

  D3 Option II (clarify COGS warning):
    - src/components/salesAnalytics/BigSellerSyncPanel.tsx — replaced "Profit = Revenue (COGS not configured in BigSeller)" with actionable copy pointing to BigSeller dashboard OR Frollie Product mapping.
    - src/components/salesAnalytics/OverviewTab.tsx — same clarification on overview tab counterpart.

  D4 (per-platform fee regression — Shopee buyerShippingFee):
    - convex/integrations/bigseller/helpers.ts — added buyerPaidShippingFee?: number to BigSellerOrderRow. Added Shopee branch in normalizePlatformFees that maps buyerShippingFee from buyerPaidShippingFee via Math.abs (defensive for negative inputs). TikTok branch unchanged (customerPaidShippingFeeAmount remains the source).
    - convex/integrations/bigseller/__tests__/normalization.test.ts — 6 new tests: undefined, zero-from-common, negative input, neither populated, idempotence, TikTok isolation.

  No schema change. No data backfill required — next BigSeller sync repopulates from live data because Shopee still sends buyerPaidShippingFee.

verification:
  - npm run type-check: clean
  - scoped tests (convex/bigsellerOrders + convex/integrations/bigseller): 124/125 pass; 1 pre-existing failure in integration.test.ts (commission >= 0 assertion) — confirmed present on clean baseline, unrelated to this PR
  - full test suite: 1326 pass, 17 pre-existing failures in 4 unrelated files (gobizAdapter, k3martCockpit, csvImportValidation, bigsellerOrders/integration) — confirmed via stash-check on clean baseline
  - npm run build: clean
  - Human verification deferred to next BigSeller sync + UI inspection of Frollie Product column and Map Manually dropdown.

files_changed:
  - convex/bigsellerOrders/mutations.ts
  - convex/bigsellerOrders/__tests__/mutations.test.ts
  - convex/bigsellerOrders/queries.ts
  - convex/externalData/mutations.ts
  - convex/integrations/bigseller/helpers.ts
  - convex/integrations/bigseller/__tests__/normalization.test.ts
  - src/components/salesAnalytics/BigSellerOrdersTable.tsx
  - src/components/salesAnalytics/BigSellerSyncPanel.tsx
  - src/components/salesAnalytics/OverviewTab.tsx
  - src/hooks/convex/useExternalData.ts
  - src/hooks/convex/index.ts
  - convex/_generated/api.d.ts (auto-regenerated)
