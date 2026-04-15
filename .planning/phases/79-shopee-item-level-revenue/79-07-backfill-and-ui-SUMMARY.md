---
phase: 79
plan: 07
subsystem: [bigseller, sales-analytics, admin-tooling]
tags: [bigseller, shopee, backfill, ui, admin, da-10, da-13, da-11-deferred]
dependency_graph:
  requires: [79-02, 79-03, 79-04]
  provides:
    - bigsellerOrders.mutations.backfillBigsellerItems (admin mutation)
    - bigsellerOrders.actions.rescanEmptyRows (admin action)
    - bigsellerOrders.queries.listEmptyRows (internal)
    - bigsellerOrders.queries.requireAdminByToken (internal)
    - useBackfillBigsellerItems + useRescanEmptyRows hooks
    - "Pending SKU from Shopee" label (24h window) in BigSellerOrdersTable
  affects:
    - src/hooks/convex/index.ts (barrel re-exports)
    - convex/_generated/api.d.ts (registered new actions module)
tech-stack:
  added: []
  patterns:
    - "Actions in a dedicated module (actions.ts) alongside mutations.ts to keep Convex runtime segregation clean"
    - "Internal-query auth wrapper (requireAdminByToken) so actions can enforce admin role without touching ctx.db directly"
    - "UI paginates backfill by looping on hasMore=false (limit=500 per batch)"
key-files:
  created:
    - convex/bigsellerOrders/actions.ts
    - .planning/phases/79-shopee-item-level-revenue/79-07-backfill-and-ui-SUMMARY.md
  modified:
    - convex/bigsellerOrders/mutations.ts
    - convex/bigsellerOrders/queries.ts
    - convex/_generated/api.d.ts
    - src/hooks/convex/useBigSeller.ts
    - src/hooks/convex/index.ts
    - src/components/salesAnalytics/BigSellerSyncPanel.tsx
    - src/components/salesAnalytics/BigSellerOrdersTable.tsx
    - src/components/salesAnalytics/__tests__/BigSellerSyncPanel.test.tsx
    - src/components/salesAnalytics/__tests__/BigSellerOrdersTable.test.tsx
decisions:
  - "rescanEmptyRows triggers startSync (scheduler-chain) and returns immediately; the UI toast instructs the user to click Backfill after sync completes rather than blocking the action on an async scheduled sync."
  - "DA-11 (buyer PII fields) explicitly deferred — BigSeller pageList does not expose buyerName/buyerPhone/buyerAddress (RESEARCH.md §Critical finding). No schema change, no columns added."
  - "saveRevenueItems return shape kept as Id[] (array of created ids) to avoid breaking existing callers in sync.ts and existing tests/convex/externalData.test.ts. Backfill derives (created, skipped) from ids.length vs items.length locally."
  - "rescanEmptyRows + listEmptyRows + requireAdminByToken live in bigsellerOrders/actions.ts + queries.ts (not mutations.ts) because actions run in a distinct runtime; keeping them in separate files prevents Convex module-loading edge cases in tests."
metrics:
  tasks_completed: 3
  tasks_deferred_to_user: 1 (checkpoint:human-verify)
  duration_minutes: ~25
  commits: 4
  new_tests_passing: 12 (backfill ×4, BigSellerSyncPanel ×4, BigSellerOrdersTable ×4)
  pre_existing_test_failures: 1 (integration.test.ts commission >= 0 — out of scope, pre-existing)
  completed_date: 2026-04-14
---

# Phase 79 Plan 07: Backfill + UI — Summary

## One-Liner

Admin-gated backfill mutation + action for historical Shopee/TikTok item rows, two prominent buttons in BigSellerSyncPanel, and a 24h "Pending SKU from Shopee" label in BigSellerOrdersTable — closes the admin tooling loop for Phase 79 item-level revenue.

## What Was Built

### Backend (Task 1)

**`convex/bigsellerOrders/mutations.ts` — `backfillBigsellerItems` mutation**

- Admin-gated via `requireRole(ctx, args.token, ["admin"])`.
- Builds price oracle once per invocation from all single-SKU `bigsellerOrders` (Plan 02 `buildPriceOracle`).
- Builds SKU → menuProduct mapping once from `externalProductMappings` (shopee + tiktok sources).
- Filters candidate orders: `platform ∈ {shopee, tiktok}` AND `skuVoList.length > 0` AND `linkedRevenueId` set.
- Emits items per order via `prorateItems` + `saveRevenueItems` (dedup on `(revenueId, externalItemId)`).
- **D-21**: zero inventory writes. **D-22**: no `processBigsellerSales` invocation (grep confirms only comments reference the name).
- **T-79-12 (DoS)**: `limit` arg capped at 500; returns `hasMore` so UI paginates.
- Returns `{created, skipped, processedOrders, hasMore}`.

**`convex/bigsellerOrders/actions.ts` — `rescanEmptyRows` action (NEW FILE)**

- Admin-gated via `internal.bigsellerOrders.queries.requireAdminByToken` (actions cannot touch `ctx.db` directly).
- Queries `listEmptyRows` internal query, computes YYYY-MM-DD span across all `bigsellerOrders` with empty `skuVoList`.
- Fires `api.integrations.bigseller.sync.startSync` with that date span. The scheduler-chain pattern means the re-sync runs asynchronously; the preserve-non-empty guard in `upsertOrders` ensures known SKUs are not wiped.
- Returns `{success, triggered, emptyOrderCount, startDate, endDate}` so the UI can show a contextual toast instructing the user to click Backfill once sync completes.

**`convex/bigsellerOrders/queries.ts` — new internalQueries**

- `listEmptyRows`: returns `{platformOrderId, orderTimeMs, platform, allSkuNum}` for every row with an empty skuVoList.
- `requireAdminByToken`: wraps `requireRole(ctx, token, ["admin"])` so actions can authenticate without direct db access.

### UI (Tasks 2 + 3)

**`src/hooks/convex/useBigSeller.ts` — new hooks**

- `useBackfillBigsellerItems` → `useMutation(api.bigsellerOrders.mutations.backfillBigsellerItems)`.
- `useRescanEmptyRows` → `useAction(api.bigsellerOrders.actions.rescanEmptyRows)`.
- Re-exported via `src/hooks/convex/index.ts` barrel.

**`src/components/salesAnalytics/BigSellerSyncPanel.tsx`**

- New section "Item-level data" with two outline-variant buttons:
  * **"Backfill historical items"** — loops mutation with `limit=500` until `hasMore=false` (safety cap: 50 iterations). Toast progress: `Created N items from M orders (K skipped as duplicates)`. Disabled during in-flight.
  * **"Re-check empty rows"** — fires rescan action; toast reports rescanned date range. Also disabled while a regular sync is active (`isActive`).
- Exact label strings as required by plan acceptance criteria.

**`src/components/salesAnalytics/BigSellerOrdersTable.tsx`**

- Added module-level `PENDING_SKU_THRESHOLD_MS = 24 * 60 * 60 * 1000`.
- Computed per-row `withinPendingWindow = Date.now() - order.orderTimeMs < PENDING_SKU_THRESHOLD_MS`.
- Replaced the pre-existing "Pending SKU" label with "**Pending SKU from Shopee**" (exact plan string) and gated it on `hasAllSkuNum && withinPendingWindow`.
- After 24h elapses, the cell renders bare `--` (plan D-15).
- Tooltip copy updated to reference the daily 03:00 WIB re-sync.
- No buyer columns added (DA-11 deferral).

### Tests (updated in-place)

- `convex/bigsellerOrders/__tests__/backfill.test.ts` (Wave 0): **4/4 green** — create, idempotency (2nd run = 0 new rows), D-18 empty skuVoList skip, V4 admin-only auth.
- `src/components/salesAnalytics/__tests__/BigSellerSyncPanel.test.tsx`: **4/4 green** — updated mocks to reference the real barrel hook surface (`@/hooks/convex`) and stub `useAuth` + `sonner`.
- `src/components/salesAnalytics/__tests__/BigSellerOrdersTable.test.tsx`: **4/4 green** — uses module-level `currentOrders` fixture driven through mocked `useBigSellerOrders`, covers all 4 branches.

## Deviations from Plan

### [Rule 2 — Missing critical functionality] Updated Wave 0 test mocks

**Found during:** Tasks 2 + 3.

**Issue:** The Wave 0 scaffolding tests were written against a speculative prop-based `BigSellerOrdersTable` / a nonexistent `useBigSellerSync` hook path. When run against the real (hook-based) components, they failed at render time with `useAuth must be used within an AuthProvider` / nonexistent mock paths. Leaving them broken would fail the plan's verify commands.

**Fix:** Rewrote `__tests__/BigSellerSyncPanel.test.tsx` and `__tests__/BigSellerOrdersTable.test.tsx` to mock the real module surface (`@/hooks/convex` barrel, `@/contexts/AuthContext`, `sonner`) and drive the table via a module-level `currentOrders` fixture. Preserved the original test intent (button rendering, 24h label, DA-11 deferral, disabled-while-in-flight) exactly.

**Files modified:** `src/components/salesAnalytics/__tests__/BigSellerSyncPanel.test.tsx`, `src/components/salesAnalytics/__tests__/BigSellerOrdersTable.test.tsx`.

**Commits:** `2a893fee` (panel), `f83857cc` (table).

### [Rule 3 — Blocking issue] Missing api.d.ts entry for new actions module

**Found during:** Task 2 build.

**Issue:** `npm run build` failed because `convex/_generated/api.d.ts` did not include the new `bigsellerOrders/actions` module (`Property 'actions' does not exist on type ...`). The worktree has no `CONVEX_DEPLOYMENT` so `npx convex codegen` cannot be run here.

**Fix:** Manually added the import + typeof entry for `bigsellerOrders_actions` to match the existing convention. Will be regenerated automatically by CI / a developer with `npx convex dev`.

**Files modified:** `convex/_generated/api.d.ts`.

**Commit:** `0cff0d43`.

### Adjusted `rescanEmptyRows` semantics

**Issue:** Plan called for `rescanEmptyRows` to "trigger runBigsellerSync then run backfill for newly-populated rows" in a single action. The real `startSync` uses the scheduler-chain (triggerSync → pollSyncTask → fetchOrders) and returns before the sync actually completes; waiting for it inside an action is not supported by the current sync design.

**Fix:** `rescanEmptyRows` now fires `startSync` and returns immediately with the rescanned date span. The UI toast explicitly instructs the admin to click **"Backfill historical items"** once the sync finishes. This preserves idempotency and avoids adding a new synchronous sync path to BigSeller's already-complex pipeline.

**Threat-model impact:** none. T-79-11 / T-79-13 / T-79-14 all hold unchanged.

## Authentication Gates

None encountered. All work happened in the local worktree.

## DA-11 Deferral Rationale

DA-11 (customer name / phone / address capture) is explicitly deferred this phase. BigSeller's `pageList.json` endpoint returns only financial buyer* fields (`buyerShippingFee`, `buyerTotalAmount`, `buyerPaidShippingFee`) but NOT any customer PII — the shipping-label fulfilment flow bypasses Frollie's view of the data entirely. See `.planning/phases/79-shopee-item-level-revenue/79-RESEARCH.md` §"Critical finding (BigSeller buyer-field availability)". No schema change, no UI column, no mutation surface added for buyer fields. The BigSellerOrdersTable component test asserts `queryByText(/Buyer name|phone|address/i)` is not in the document to prevent accidental future drift.

## Deferred Issues (Out of Scope — Rule: Scope Boundary)

- `convex/bigsellerOrders/__tests__/integration.test.ts > "all orders produce valid revenue records"` fails with `expected -9750 to be greater than or equal to 0` (commission field). Verified pre-existing on the Plan 06 base — unrelated to Plan 07 scope. Left untouched; should be investigated as a follow-up quick task.

## Commits

| Hash       | Message                                                             |
| ---------- | ------------------------------------------------------------------- |
| `287dc533` | feat(79-07): add backfillBigsellerItems mutation + rescanEmptyRows action |
| `2a893fee` | feat(79-07): wire Backfill + Re-check buttons in BigSellerSyncPanel |
| `f83857cc` | feat(79-07): 24h 'Pending SKU from Shopee' label on BigSellerOrdersTable |
| `0cff0d43` | chore(79-07): regenerate api.d.ts for bigsellerOrders/actions       |

## Verification

- `npm run type-check` — **pass**.
- `npm run build` — **pass** (20.3s).
- `npm run test -- --run convex/bigsellerOrders/__tests__/backfill.test.ts` — **4/4 green**.
- `npm run test -- --run src/components/salesAnalytics/__tests__/BigSellerSyncPanel.test.tsx` — **4/4 green**.
- `npm run test -- --run src/components/salesAnalytics/__tests__/BigSellerOrdersTable.test.tsx` — **4/4 green**.
- Phase 79 test sweep: **19/20 test files green, 206/207 individual tests green** (the 1 pre-existing failure is integration.test.ts commission assertion — out of scope).

### Acceptance Criteria

**Task 1 (backend):**
- ✅ `grep "export const backfillBigsellerItems" convex/bigsellerOrders/mutations.ts` → match (line 161)
- ✅ `grep "export const rescanEmptyRows" convex/bigsellerOrders/actions.ts` → match (line 20)
- ✅ `grep 'requireRole.*\["admin"\]' convex/bigsellerOrders/mutations.ts` → match (line 167)
- ✅ `grep -rn "processBigsellerSales" convex/` → only doc comments in Plan 07 files (D-22 honored)
- ✅ backfill.test.ts 4/4 green

**Task 2 (panel):**
- ✅ `grep "Backfill historical items" src/components/salesAnalytics/BigSellerSyncPanel.tsx` → match (line 308)
- ✅ `grep "Re-check empty rows" src/components/salesAnalytics/BigSellerSyncPanel.tsx` → match (line 322)
- ✅ `grep "useBackfillBigsellerItems\|useRescanEmptyRows" src/hooks/convex/useBigSeller.ts` → both matches

**Task 3 (table):**
- ✅ `grep "Pending SKU from Shopee" src/components/salesAnalytics/BigSellerOrdersTable.tsx` → match
- ✅ `grep "PENDING_SKU_THRESHOLD_MS" src/components/salesAnalytics/BigSellerOrdersTable.tsx` → match (line 41, 313)
- ✅ `grep "24 \* 60 \* 60 \* 1000" src/components/salesAnalytics/BigSellerOrdersTable.tsx` → match on threshold constant
- ✅ `grep "buyerName\|buyerPhone\|buyerAddress" src/components/salesAnalytics/BigSellerOrdersTable.tsx` → no match (DA-11)

## Next Step

**Task 4 is a `checkpoint:human-verify` gate.** This plan is `autonomous: false`. The automated tasks (1–3) are complete and committed; Task 4 requires the user to:

1. Run `npm run dev` + `npx convex dev` locally.
2. Navigate to `/sales-analytics` and verify the two buttons render in `BigSellerSyncPanel`.
3. Click **"Backfill historical items"** and confirm the toast + Convex dashboard `externalRevenueItems` rows appear. Click again; toast should report `created: 0, skipped: N` (idempotent).
4. Inspect the orders table for a Shopee row < 24h old with empty SKU breakdown; verify the "Pending SKU from Shopee" label + tooltip. For a row > 24h old, verify bare `--`.
5. Trigger a retroactive SKU mapping from the existing mapping UI and confirm the cascade in `externalRevenueItems.linkedMenuProductId` + parent `externalRevenue.linkedMenuProductId` (Plan 04 behavior, not new here — just a sanity check on the full Phase 79 pipeline).

Once verified, this plan is done and Phase 79 is complete. The orchestrator should handle CHANGELOG / ROADMAP / REQUIREMENTS docs updates per the plan's batched documentation list.

## Self-Check: PASSED

- FOUND: convex/bigsellerOrders/actions.ts
- FOUND: convex/bigsellerOrders/mutations.ts (backfillBigsellerItems)
- FOUND: convex/bigsellerOrders/queries.ts (listEmptyRows, requireAdminByToken)
- FOUND: src/hooks/convex/useBigSeller.ts (useBackfillBigsellerItems, useRescanEmptyRows)
- FOUND: src/components/salesAnalytics/BigSellerSyncPanel.tsx (two buttons, exact labels)
- FOUND: src/components/salesAnalytics/BigSellerOrdersTable.tsx (PENDING_SKU_THRESHOLD_MS, "Pending SKU from Shopee")
- FOUND: commit 287dc533 (backend)
- FOUND: commit 2a893fee (panel)
- FOUND: commit f83857cc (table)
- FOUND: commit 0cff0d43 (api.d.ts regen)
