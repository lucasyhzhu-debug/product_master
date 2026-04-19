---
status: verified-locally
trigger: "Unit Economics SKU Pareto / SKU Channel Matrix reports show large '(Unlinked)' bucket for K3Mart and Direct channels, but user has set up K3Mart SKU mappings in admin UI and Direct orders are created via menu-product picker (no free-form names)."
created: 2026-04-17T20:10:00Z
updated: 2026-04-19T00:00:00Z
---

## Current Focus

hypothesis: Two independent bugs funnel through the same loader-synthesis branch in unitEconomics.ts and produce the "(Unlinked)" bucket. Bug 1 — K3Mart mapping cascade does not run for `source === "k3mart"`. Bug 2 — `syncInternalOrders` skips child-item creation for historical orders via `if (!isNew) continue;`, so 219 of 262 Direct parents have no `externalRevenueItems` and fall through to the loader's synthesis path.
test: Confirmed via direct DB query against prod (`npx convex data externalRevenue --prod`, `externalRevenueItems --prod`). Counts match the theory: 737/737 K3Mart parents unlinked; 219/262 Direct parents without children; 47/47 Direct child rows all correctly linked and all created after 2026-04-10.
expecting: Root cause is CONFIRMED by evidence. Proceeding straight to Fix Plan — no further hypotheses to test. Next action: write PLAN.md, run `/staffreview`, iterate, implement.
next_action: Write PLAN.md for the fix (4 sub-fixes: K3Mart cascade extension, K3Mart sync-time linking, Direct child-item backfill mutation, syncInternalOrders continue-guard fix). Then run `/staffreview` on the plan per user directive.
reasoning_checkpoint: null
tdd_checkpoint: null

## Symptoms

expected: K3Mart and Direct should appear in SKU Pareto / SKU Channel Matrix fully attributed to their menu products. Only Consignment (per user) is expected to have an unlinked bucket, since consignment settlement UI doesn't always link items.
actual: Both K3Mart and Direct show large "(Unlinked)" buckets. K3Mart shows the full channel revenue under "(Unlinked)". Direct shows a large slice of historical revenue (pre-Apr-10) under "(Unlinked)".
errors: None — silent data defect. Reports render fine; just misattributed.
reproduction: Navigate to Unit Economics → SKU Pareto or SKU Channel Matrix with any date range covering pre-Apr-10 (Direct) or any K3Mart-active period (K3Mart). The "(Unlinked)" bucket will appear with non-zero revenue.
started: K3Mart: always (since k3mart sync was implemented, no mapping cascade was ever wired for this source). Direct: historical orders pre-2026-04-10 (the date `saveRevenueItems` generation was added to `syncInternalOrders`). Any order synced before that date has only a parent row.

## Eliminated

- hypothesis: Direct orders may have orderItems with null `menuProductId` (free-form custom names)
  evidence: Live DB query — 47/47 `externalRevenueItems` with `source="internal"` have non-null `linkedMenuProductId`. User confirmed UI does not allow free-form product names. The unlinked appearance is instead due to MISSING child rows (not unlinked child rows).
  timestamp: 2026-04-17T20:05:00Z

- hypothesis: K3Mart mappings exist in `externalProductMappings` but sync path ignores them
  evidence: Partially true (sync path does ignore them — `k3mart/adapter.ts:557-576`), but the deeper bug is that the retroactive cascade (`applyRetroactiveProductMappingImpl`) also skips K3Mart — so even the "set the mapping in admin UI and let retroactive do its job" path fails. Cannot be fixed by sync-only changes.
  timestamp: 2026-04-17T20:07:00Z

## Evidence

- timestamp: 2026-04-17T19:30:00Z
  checked: `convex/reports/unitEconomics.ts:178-209` and the "(Unlinked)" key assignment at line 759
  found: Loader has two branches. When parent has child rows, iterate children and use `it.linkedMenuProductId`. When parent has NO child rows, synthesize a lump-sum item from parent using `parent.linkedMenuProductId`. If that is null AND order.source is "external" (which all externalRevenue synthetic orders are), item goes to UNLINKED_KEY bucket.
  implication: Both bugs funnel through the "no-children synthesis" path. Fix must either (a) backfill children, (b) set parent.linkedMenuProductId, or (c) change loader behavior.

- timestamp: 2026-04-17T19:40:00Z
  checked: `convex/externalData/mutations.ts:458-596` — `applyRetroactiveProductMappingImpl`
  found: Step 1 (lines 469-486) cascades by `productName` match on child `externalRevenueItems`. Step 2 (lines 491-593) cascades by `externalItemId` (SKU) and updates parent via dominantSku rule — GATED to `shopee | tiktok` only at line 492.
  implication: K3Mart source is excluded from both cascade steps. Mapping a K3Mart SKU in the admin UI patches the mapping row but never touches any `externalRevenue` row. Fix 1a must add a K3Mart branch.

- timestamp: 2026-04-17T19:45:00Z
  checked: `convex/integrations/k3mart/adapter.ts:440-632` — `syncK3MartSales`
  found: Lines 557-576 build records with source/externalProductCode/productName/quantitySold but never set `linkedMenuProductId`. The sync action has `ctx.runQuery` available (it's an action), so it could pre-fetch the mappings table.
  implication: New K3Mart records will always be inserted unlinked. Fix 1b must pre-fetch mappings once per sync and set `linkedMenuProductId` in the record map step.

- timestamp: 2026-04-17T19:50:00Z
  checked: `npx convex data externalRevenue --prod --limit 5000` — parent rows analysis
  found: 737 k3mart parents (100% unlinked, `linkedMenuProductId = undefined`). 262 internal parents (100% with empty `linkedMenuProductId` at parent level — expected because parent represents whole order, not a product).
  implication: K3Mart fix must patch parent-level link. Direct fix must work at child-item level (parent is deliberately unlinked for order-level rows).

- timestamp: 2026-04-17T19:55:00Z
  checked: `npx convex data externalRevenueItems --prod --limit 10000` — child rows analysis
  found: Full table is 1411 rows. Breakdown: gobiz 1212/0 unlinked, internal 47/0 unlinked, shopee 109/1 unlinked, tiktok 43/1 unlinked. Zero K3Mart child rows (confirms K3Mart is parent-only).
  implication: The 47 internal child rows are all linked. The 1 shopee + 1 tiktok unlinked child are unrelated (pre-existing, not part of this debug).

- timestamp: 2026-04-17T20:00:00Z
  checked: Parent-child mismatch for internal source — used comm/awk to compare distinct parent IDs to child revenueIds
  found: 262 internal parents, but only 43 distinct parent IDs have matching children. 219 internal parents have NO children at all.
  implication: 219 of 262 Direct parents fall through to the "no-children synthesis" loader branch and show up as "(Unlinked)" lump-sum lines in reports (one per order, named "Order XXXX-NNN").

- timestamp: 2026-04-17T20:03:00Z
  checked: createdAt timestamps on internal child rows vs parent transactionDates
  found: Child rows: earliest 2026-04-10, latest 2026-04-17. Parent rows: earliest 2026-01-29, latest 2026-04-17. All 219 orphan parents are from the 2026-01-29 to 2026-04-09 window.
  implication: `saveRevenueItems` generation was added to syncInternalOrders around 2026-04-10. Historical orders synced before that date were inserted as parent-only rows. Re-sync cannot heal them because `if (!isNew) continue;` at line 126 skips the child-creation block for any parent that already exists.

- timestamp: 2026-04-17T20:06:00Z
  checked: `convex/integrations/internal/adapter.ts:123-152`
  found: Inside the batch loop, line 126 is `if (!isNew) continue;` — placed BEFORE the `saveRevenueItems` call. This means any historical parent that returns `isNew: false` from `saveRevenue` is skipped entirely, even if it has zero children and would benefit from backfill.
  implication: Two-part fix. (1) One-shot backfill mutation for the 219 existing orphan parents. (2) Change the guard so future re-syncs heal missing children — check child existence directly instead of relying on parent-isNew.

## Resolution

root_cause: |
  Two independent bugs producing the same symptom via the same loader code path:

  1. K3Mart mapping cascade bug — `applyRetroactiveProductMappingImpl` at `convex/externalData/mutations.ts:458-596` has no branch for `source === "k3mart"`. Step 1 cascades by child productName (K3Mart has no children, so no-op). Step 2 is gated to `shopee | tiktok` only (line 492). Result: mapping K3Mart SKUs in the admin UI saves the mapping row but never patches any `externalRevenue` parent. Compounded by `syncK3MartSales` at `convex/integrations/k3mart/adapter.ts:557-576` not setting `linkedMenuProductId` at sync time either.

  2. Direct historical child-items bug — `syncInternalOrders` at `convex/integrations/internal/adapter.ts:126` has unconditional `if (!isNew) continue;` before the `saveRevenueItems` call. `saveRevenueItems` generation was added to this flow on ~2026-04-10. All parents synced before that date are permanently orphaned (no children), and the re-sync guard prevents backfill. 219 of 262 Direct parents are affected.

  Both funnel through `convex/reports/unitEconomics.ts:178-209` — the "no item-level detail" branch — which synthesizes a single unlinked item per parent, landing in UNLINKED_KEY at line 759.
fix: |
  Phase 80.2 (gap-closure) — 4 waves, 4 sub-fixes:

  **Wave 1 — Schema + K3Mart fixes** (`6e9b2b08`, `d3664566`):
  1a. Added `by_source_productCode` index on `externalRevenue` for efficient K3Mart cascade lookup.
  1b. Added optional `summary: v.string()` field on `externalSyncLogs` for backfill audit counter JSON.
  1c. Extended `applyRetroactiveProductMappingImpl` with a K3Mart branch (after Shopee/TikTok) — scans parents by `[source, externalProductCode]`, patches `linkedMenuProductId` with idempotency guard + 4000-row cap. Return type widened additively with new `externalRevenueUpdated: number` field.
  1d. `syncK3MartSales` pre-fetches SKU→menuProduct map once per sync via `getK3MartMappingBySku(ctx)` helper and attaches `linkedMenuProductId` per record in the batch.map via `attachLinkedMenuProductId` pure helper. No more "new unlinked rows every sync."

  **Wave 2 — Direct backfill + self-heal** (`9bc119d6`, `1c3b5967`, `98bb4966`):
  2a. New `hasExternalRevenueItems(ctx, revenueId)` helper + `hasExternalRevenueItemsQuery` internalQuery wrapper.
  2b. Extracted `saveRevenueItemsImpl` from the `saveRevenueItems` internalMutation body (preserves `Id[]` wire contract at all 5 call sites including `bigsellerOrders/mutations.ts:292`).
  2c. New admin-only paginated-WRITE mutation `backfillInternalRevenueItems` — scans orphan Direct parents, rebuilds children from native `orders` + `orderItems`. Idempotent via `(revenueId, externalItemId)` dedup. Writes one audit row per invocation to `externalSyncLogs.summary`.
  2d. Replaced unconditional `if (!isNew) continue;` at `internal/adapter.ts:126` with conditional `hasExternalRevenueItemsQuery` check + halt-loud failure mode. Re-syncs now self-heal orphan parents without duplicating existing children.

  **Wave 3 — Tests** (`fed5393d`, `b317da46`, `5480dad0`, `8a598d23`, `6bd59b55`):
  19 new tests across 5 files covering all 4 sub-fixes. First `t.action(...)` invocation in the codebase (novel pattern, no fetch stub needed since `syncInternalOrders` only uses `runQuery`/`runMutation`).

  **Wave 4 — Verification + docs** (this session):
  4.1 local gates: `npm run type-check` clean, `npm run lint` 0 new errors (project has 505 pre-existing unrelated), `npm run build` fails on pre-existing Phase 80.1 `WeekdayDualAxisChart.tsx` unused-`mode` prop (documented in deferred-items.md as out-of-scope), `npm run test` 1618/1620 (2 pre-existing Phase 74 staffAttendance failures, all 19 new 80.2 tests green).
  4.10 docs: CHANGELOG.md + SCHEMA.md + API_REFERENCE.md + MEMORY.md updated.

  **Pending human verification** (4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.11, 4.12): prod data pre-flight, dev smoke test, user checkpoint, Convex export, prod backfill, prod cascade, UI visual verification on `/analytics`, prod log scan, PR/merge, DEBUG.md archive. All require live prod/dev Convex access and/or user authority — cannot be automated by executor agent.
verification: |
  ## Local Verification (Wave 4.1) — 2026-04-19

  - `npm run type-check`: PASSED (0 errors)
  - `npm run lint`: 505 pre-existing errors across codebase — ZERO introduced by Phase 80.2 (verified via file-by-file before/after comparison against main: k3mart/adapter.ts 22→22, externalData/mutations.ts+queries.ts 4→4, all other 80.2 files 0→0)
  - `npm run build`: fails on pre-existing `src/components/analytics/WeekdayDualAxisChart.tsx(34,3): error TS6133: 'mode' is declared but its value is never read` — introduced by Phase 80.1 merge, present on main, out of scope per executor scope boundary. Logged to `.planning/phases/80.2-unlinked-products-fix/deferred-items.md`.
  - `npm run test`: 1618/1620 passed. 2 failures are pre-existing Phase 74 `staffAttendance/__tests__/correctAttendance.test.ts` documented in deferred-items.md. All 19 new Phase 80.2 tests pass:
    - `convex/integrations/k3mart/__tests__/cascade.test.ts` — 4/4
    - `convex/integrations/k3mart/__tests__/helpers-attach-linking.test.ts` — 5/5
    - `convex/externalData/__tests__/backfillInternalRevenue.test.ts` — 6/6
    - `convex/integrations/internal/__tests__/adapter.test.ts` — 2/2
    - `convex/reports/__tests__/unitEconomics-unlinked.test.ts` — 2/2

  ## Pending Human Verification

  - **Task 4.2 Prod data pre-flight:** needs `npx convex data externalRevenue --prod` to confirm zero K3Mart parents with null/empty `externalProductCode` before cascade.
  - **Task 4.3 Dev smoke test:** needs running `npx convex dev` + `npm run dev` + admin UI interaction for 4 smoke tests.
  - **Task 4.4 User checkpoint (AskUserQuestion):** requires user response before any prod data mutation.
  - **Task 4.5 Convex export:** needs `npx convex export --prod` — point-in-time rollback insurance.
  - **Task 4.6 Prod backfill:** `npx convex run externalData:mutations:backfillInternalRevenueItems --prod` with admin token — expected ~219 parentsBackfilled, ~438+ itemsInserted.
  - **Task 4.7 Prod K3Mart cascade:** iterate over K3Mart mappings snapshot, run `applyRetroactiveProductMapping --prod` per mapping — expected sum ~737.
  - **Task 4.8 Visual UI verification:** open prod `/analytics` → SKU Pareto + SKU Channel Matrix → confirm (Unlinked) bucket collapsed for K3Mart + Direct.
  - **Task 4.9 Convex logs review:** `npx convex logs --prod --since 30m` after prod run.
  - **Task 4.11 Open PR + merge:** user authority on merge timing; code currently lives only on `gsd/phase-80.2-unlinked-products-fix`.
  - **Task 4.12 Archive DEBUG.md:** post-merge `git mv` to `.planning/debug/resolved/`.

  After full human verification completes, status will advance from `verified-locally` to `resolved`.
files_changed:
  - convex/schema.ts (Wave 1.1 — added by_source_productCode index on externalRevenue + summary field on externalSyncLogs)
  - convex/integrations/k3mart/queries.ts (new — getK3MartMappingBySkuQuery internalQuery wrapper, Map↔Record serializer)
  - convex/integrations/k3mart/helpers.ts (appended getK3MartMappingBySku ctx-dependent + attachLinkedMenuProductId pure helper)
  - convex/integrations/k3mart/adapter.ts (pre-fetch mapping, attach linkedMenuProductId per record in batch.map before saveRevenue)
  - convex/externalData/mutations.ts (K3Mart cascade branch in applyRetroactiveProductMappingImpl + saveRevenueItemsImpl extraction + backfillInternalRevenueItemsPageImpl helper + backfillInternalRevenueItems public admin mutation)
  - convex/externalData/helpers/revenueItemsHelpers.ts (new — hasExternalRevenueItems ctx-dependent helper)
  - convex/externalData/queries.ts (hasExternalRevenueItemsQuery internalQuery wrapper)
  - convex/integrations/internal/adapter.ts (guard swap at :126 from unconditional skip-if-not-new to existence-based skip via hasExternalRevenueItemsQuery)
  - convex/_generated/api.d.ts (codegen refresh for new exports)
  - convex/integrations/k3mart/__tests__/cascade.test.ts (new — 4 tests)
  - convex/integrations/k3mart/__tests__/helpers-attach-linking.test.ts (new — 5 tests, pure helper)
  - convex/externalData/__tests__/backfillInternalRevenue.test.ts (new — 6 tests, all counter semantics)
  - convex/integrations/internal/__tests__/adapter.test.ts (new directory — 2 tests, novel t.action pattern)
  - convex/reports/__tests__/unitEconomics-unlinked.test.ts (new — 2 tests, post-fix attribution regression)
  - docs/CHANGELOG.md (dated Phase 80.2 entry under v2.0)
  - docs/SCHEMA.md (by_source_productCode index + externalSyncLogs.summary documented)
  - docs/API_REFERENCE.md (backfillInternalRevenueItems admin mutation documented + applyRetroactiveProductMapping additive-return note)
  - .planning/phases/80.2-unlinked-products-fix/ (4 PLANs + 3 SUMMARYs — Plan 04 SUMMARY to be created this session)
  - .planning/phases/80.2-unlinked-products-fix/deferred-items.md (pre-existing lint/build/test failures logged)
  - C:\Users\Irfan\.claude\projects\D--Claude-Product-Manager-product-master\memory\MEMORY.md (2 new Critical Convex Lessons)
