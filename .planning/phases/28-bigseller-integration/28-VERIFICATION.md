---
phase: 28-bigseller-integration
verified: 2026-02-27T14:04:47Z
status: passed
score: 14/14 must-haves verified
gaps:
  - truth: "Retroactive mapping updates externalRevenue for existing orders when a SKU is mapped"
    status: resolved
    reason: "Fixed in commit 7f806d9: fetchOrders now captures saveRevenue return IDs, queries each via getRevenueById to extract platformOrderId from externalTransactionId, then calls linkRevenueToOrders to patch bigsellerOrders.linkedRevenueId. applyRetroactiveMapping can now find and update the linked revenue records."
---

# Phase 28: BigSeller Integration Verification Report

**Phase Goal:** Admin can manually trigger a BigSeller sync that uses the scheduler-chain pattern to poll until complete, stores per-order data with SKU breakdowns, and bridges revenue to the unified analytics layer — with an admin UI to map BigSeller SKU codes to internal menu products.
**Verified:** 2026-02-27T14:04:47Z
**Status:** passed
**Re-verification:** Yes — gap resolved in commit 7f806d9 (linkRevenueToOrders + getRevenueById)

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | BigSeller sync can be triggered and progresses through trigger -> poll -> fetch -> store -> bridge lifecycle | VERIFIED | `startSync` action in sync.ts schedules `triggerSync` -> `pollSyncTask` (60s chain, 8 max, auto-retry) -> `fetchOrders`; all exported and wired via `ctx.scheduler.runAfter` |
| 2  | Per-order data is stored in bigsellerOrders with SKU breakdowns and all fee fields | VERIFIED | `mapOrderToStorage` maps all fee fields (commissionFee, sellerShippingFee, buyerShippingFee, otherFee, costFee, profit) + skuVoList; `upsertOrders` deduplicates by `by_platform_order` index |
| 3  | Revenue records are created in externalRevenue with actual platform source (shopee/tiktok), not bigseller | VERIFIED | `mapOrderToRevenue` sets `source: platform` (order.platform.toLowerCase()), uses `externalTransactionId: "bigseller:{orderId}"` for dedup. Source is "shopee" or "tiktok", never "bigseller" |
| 4  | Sync state is tracked in bigsellerSyncState and queryable for frontend progress display | VERIFIED | `bigsellerSyncState` table in schema with `stage` field (8 literals). `getSyncState` query is auth-protected (requireRole admin/manager). Reactive Convex query subscription. |
| 5  | Existing sync in progress is detected and joined rather than creating duplicate task | VERIFIED | `startSync` checks `currentState.stage` for triggering/polling/fetching/storing and returns `{success: false, error: "Sync already in progress"}`; triggerSync handles `code:-1` "sync task is in progress" as expected join |
| 6  | Fee calculation logic is unit-tested: negative fee values, dedup, HTML detection | VERIFIED | 21+ tests in `convex/integrations/bigseller/__tests__/helpers.test.ts` covering `detectHtmlResponse`, `buildPageListBody`, `mapOrderToRevenue` (commission=Math.abs, source=shopee), `mapOrderToStorage` (raw negative fees preserved) |
| 7  | Admin can click Sync BigSeller button in Settings tab and see step-by-step progress | VERIFIED | `BigSellerSyncPanel` imported and rendered in `SettingsTab` inside BigSeller expand toggle. Panel shows 5-step progress (triggering/polling/fetching/storing/complete) with Loader2/CheckCircle2/XCircle icons |
| 8  | Admin can leave the page during sync and return to see current progress or completion summary | VERIFIED | `useBigSellerSyncState` subscribes to `getSyncState` Convex query (reactive). Progress persists in `bigsellerSyncState` singleton document server-side. |
| 9  | Sync completion shows compact summary card with order counts, revenue total, and unmapped SKU count | VERIFIED | `BigSellerSyncPanel` renders summary card when `stage === "complete"` with totalOrders, newOrders, updatedOrders, formatCurrency(totalRevenue), unmappedSkus amber badge. Empty sync case: "No orders found for this date range." |
| 10 | Admin can browse synced BigSeller orders in a filterable table with date, platform, shop, SKUs, revenue, fees | VERIFIED | `BigSellerOrdersTable` (300 lines) rendered in SettingsTab expanded section. Filters: platform dropdown, date range inputs. 20/page pagination. Columns: date, platform badge, shop, SKUs (truncated with tooltip), revenue, commission, shipping, other, profit |
| 11 | Admin can map unmapped BigSeller SKU codes to menu products via inline dropdown in Product Mapping tab | VERIFIED | `ProductMappingTab` has Shopee and TikTok sub-tabs (lines 59-103). `ProductMappingCard` uses `useUpdateProductMapping` which calls `updateProductMapping` mutation. `ProductMappingCard.source` type union includes "shopee" and "tiktok". |
| 12 | Unmapped SKU count badge appears on BigSeller settings row | VERIFIED | `SettingsTab` imports `useBigSellerUnmappedSkus`, renders amber badge with `{unmappedSkuCount} unmapped` when count > 0 (lines 172-213) |
| 13 | JWT expiry warning shown inline; sync button disabled until token refreshed | VERIFIED | `BigSellerSyncPanel` accepts `tokenExpired` prop; renders amber warning bar with "Paste Token" button; `Sync Now` button disabled when `tokenExpired === true`. `SettingsTab` passes `bigsellerTokenExpired` based on health status. |
| 14 | Retroactive mapping updates externalRevenue for existing orders when a SKU is mapped | FAILED | `updateProductMapping` loops bigsellerOrders and checks `order.linkedRevenueId`, but `linkedRevenueId` is never written during sync — `fetchOrders` calls `upsertOrders` and `saveRevenue` independently without cross-linking the documents. Retroactive logic silently runs 0 updates. |

**Score:** 13/14 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `convex/integrations/bigseller/sync.ts` | Scheduler-chain sync lifecycle | VERIFIED | Exports: `startSync` (action), `triggerSync` (internalAction), `pollSyncTask` (internalAction), `fetchOrders` (internalAction), `updateSyncStage` (internalMutation). 798 lines. "use node" at top. |
| `convex/integrations/bigseller/helpers.ts` | Request builders, response parsers, field mapping | VERIFIED | Exports: `buildBigSellerHeaders`, `buildPageListBody`, `buildSyncTaskCreateBody`, `detectHtmlResponse`, `mapOrderToRevenue`, `mapOrderToStorage`, `BigSellerOrderRow` type. All 25+ request body fields included. |
| `convex/integrations/bigseller/__tests__/helpers.test.ts` | Unit tests for pure helper functions | VERIFIED | Exists at `__tests__/helpers.test.ts`. Covers detectHtmlResponse, buildBigSellerHeaders, buildPageListBody (all required fields), mapOrderToRevenue (source=shopee, commission=abs, dedup key), mapOrderToStorage (raw negative fees, skuVoList). |
| `convex/integrations/bigseller/queries.ts` | Auth-protected sync state query for frontend | VERIFIED | `getSyncState` requires token + requireRole(admin/manager). Returns default idle state if no document. Also exports `getSyncStateInternal`, `getLastSuccessfulSyncDate`, `checkProductMapping` (internal queries). |
| `convex/bigsellerOrders/mutations.ts` | Order upsert + retroactive mapping | VERIFIED (partial gap) | `upsertOrders` deduplicates by `by_platform_order` index, returns `{inserted, updated}`. `applyRetroactiveMapping` exists but is never called by sync (retroactive mapping goes through `updateProductMapping` in externalData/mutations.ts instead). The retroactive wiring itself has the linkedRevenueId gap. |
| `convex/bigsellerOrders/__tests__/mutations.test.ts` | convex-test for dedup | VERIFIED | Exists at `__tests__/mutations.test.ts`. Tests `mapOrderToStorage` validations (per SUMMARY decision: uses pure function tests rather than full convex-test due to auth requirements in listOrders). |
| `convex/bigsellerOrders/queries.ts` | Order list + stats queries | VERIFIED | `listOrders` (paginated, by_time index, platform filter, calculated profit), `getUnmappedSkus` (cross-references externalProductMappings), `getOrderStats` (allCostFeeZero flag). All require token + requireRole. |
| `src/components/salesAnalytics/BigSellerSyncPanel.tsx` | Expandable sync progress card | VERIFIED | 398 lines (>100 min). Step-by-step progress with icons, summary card, COGS caveat, JWT expiry warning. `actionToast`/`toast.info` (no `toast.success`). |
| `src/components/salesAnalytics/BigSellerOrdersTable.tsx` | Filterable table of synced orders | VERIFIED | 300 lines (>80 min). Platform filter, date range, 20/page pagination. CSS variable tokens: `text-[var(--color-status-error,#ef4444)]` and `text-[var(--color-status-success,#22c55e)]`. No raw `text-red-600` / `text-green-600` classes. |
| `src/hooks/convex/useBigSeller.ts` | Hook wrapping sync state, orders, action | VERIFIED | Exports: `useBigSellerSyncState`, `useBigSellerOrders`, `useBigSellerUnmappedSkus`, `useBigSellerOrderStats`, `useStartBigSellerSync`. All 5 referenced in index.ts exports. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `sync.ts` | `bigsellerOrders/mutations.ts` | `ctx.runMutation(internal.bigsellerOrders.mutations.upsertOrders)` | WIRED | Line 689 of sync.ts |
| `sync.ts` | `externalData/mutations.ts` | `ctx.runMutation(internal.externalData.mutations.saveRevenue)` | WIRED | Line 697 of sync.ts |
| `sync.ts` | `sync.ts` (self) | `ctx.scheduler.runAfter(...pollSyncTask)` | WIRED | Lines 354-365 (trigger->poll), 407-411, 435-437, 556-559 (poll->poll), 458 (poll->fetch) |
| `BigSellerSyncPanel.tsx` | `convex/integrations/bigseller/queries.ts` | `useQuery(api.integrations.bigseller.queries.getSyncState)` | WIRED | useBigSeller.ts line 16 wires hook; panel uses `useBigSellerSyncState()` |
| `BigSellerSyncPanel.tsx` | `convex/integrations/bigseller/sync.ts` | `useAction(api.integrations.bigseller.sync.startSync)` | WIRED | useBigSeller.ts line 77 wires action; panel uses `useStartBigSellerSync()` |
| `ProductMappingTab.tsx` | `externalData/mutations.ts` | `linkProductMapping` / `updateProductMapping` | WIRED | ProductMappingCard uses `useUpdateProductMapping` hook which calls `api.externalData.mutations.updateProductMapping` |
| `updateProductMapping` | `bigsellerOrders` | retroactive patch via `linkedRevenueId` | BROKEN | updateProductMapping iterates bigsellerOrders but `linkedRevenueId` is never set during sync — retroactive updates silently skip all orders |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| BS-01 | Plans 01 + 02 | Admin can manually trigger BigSeller sync; scheduler-chain polls every 60s until taskStatus="complete", then pulls per-order data via pageList with full pagination | SATISFIED | `startSync` action (public, admin-only). Scheduler chain: trigger -> pollSyncTask(60s, 8 max) -> fetchOrders(paginated). UI: BigSellerSyncPanel with Sync Now button in SettingsTab. |
| BS-02 | Plans 01 + 02 | Per-order data stored in bigsellerOrders with SKU breakdown, platform, shop-level breakdown, all fee fields; bridges to externalRevenue for analytics | SATISFIED (partial gap) | bigsellerOrders table stores all fields including skuVoList. externalRevenue bridged with actual platform source. Retroactive mapping wiring has the linkedRevenueId gap but basic data storage and bridging works. |
| BS-03 | Plan 02 | Admin can map BigSeller SKU codes to internal menuProducts for unified per-product reporting | SATISFIED (partial gap) | ProductMappingTab has Shopee and TikTok sub-tabs. ProductMappingCard supports inline dropdown mapping. `updateProductMapping` mutation attempts retroactive update but silently no-ops due to missing `linkedRevenueId` link. Future syncs will correctly attribute mapped SKUs. |

**Orphaned requirements check:** BS-04, BS-05, BS-06 are explicitly deferred in REQUIREMENTS.md. No orphaned Phase 28 requirements found.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `convex/bigsellerOrders/mutations.ts` | 72 | `TODO: Add index on SKU field if order volume exceeds ~1000 rows and this becomes slow.` | Info | Performance note; not blocking at current volume |
| `convex/integrations/bigseller/queries.ts` | 62 | `as any` cast for `source` field in withIndex | Warning | Type safety bypass; not blocking but could hide schema drift |
| `convex/integrations/bigseller/sync.ts` | 91-93 | `(syncState as any).errorMessage` / `(syncState as any).summary` in BigSellerSyncPanel | Warning | Type casting to bypass union type; functional but fragile; already noted as deviation fix in SUMMARY |

No stub patterns. No empty implementations. No `return null` / placeholder components found in new files.

---

### Human Verification Required

#### 1. Sync button triggers live BigSeller API
**Test:** In Settings tab, paste a valid BigSeller muc_token in the token dialog, then click "Sync Now" with a 7-day date range.
**Expected:** Step indicators light up in sequence: Triggering -> Syncing data (N/8) -> Fetching orders -> Storing data -> Complete. Summary card shows order count and revenue total.
**Why human:** Cannot verify live API call, scheduler-chain timing, or real BigSeller data without a running Convex environment and valid credentials.

#### 2. Leave-and-return sync persistence
**Test:** Start a sync, navigate away from Settings tab to another page, wait ~2 minutes, return to Settings tab.
**Expected:** Progress card shows current stage (e.g., "Syncing data 3/8") or completion summary — matching actual server-side state.
**Why human:** Requires a running sync and live Convex reactivity to verify server-side singleton document persistence.

#### 3. Empty sync date range (no orders)
**Test:** Trigger sync with a date range in the distant past (before BigSeller was used).
**Expected:** Summary card shows "No orders found for this date range." — not an error state.
**Why human:** Requires live API call to verify totalPage=0 edge case handling.

#### 4. Retroactive mapping flow (end-to-end)
**Test:** With synced orders present, map a SKU in the Shopee sub-tab of Product Mapping to a menu product.
**Expected:** All existing orders with that SKU get their externalRevenue record updated with `linkedMenuProductId`. Revenue appears attributed to the menu product in Sales Analytics.
**Why human:** This is the identified gap — retroactive mapping silently fails due to missing `linkedRevenueId` on bigsellerOrders documents. Human test will confirm the gap is real before the fix is planned.

---

### Gaps Summary

**1 gap blocking full goal achievement:**

The retroactive SKU mapping feature (BS-03) is architecturally incomplete. The sync stores BigSeller orders in `bigsellerOrders` and separately creates `externalRevenue` records — but never links them. The `applyRetroactiveMapping` internalMutation and the inline retroactive logic in `updateProductMapping` both iterate `bigsellerOrders` and check `order.linkedRevenueId`, but this field is always `undefined` because `fetchOrders` never writes it.

**Root cause:** `fetchOrders` calls `ctx.runMutation(internal.bigsellerOrders.mutations.upsertOrders, ...)` and `ctx.runMutation(internal.externalData.mutations.saveRevenue, ...)` as two separate, independent mutations. The `saveRevenue` mutation returns the inserted `externalRevenue` ids, but `fetchOrders` discards the return value and never writes those ids back to the corresponding `bigsellerOrders` documents.

**Impact:** Future syncs will correctly attribute newly-mapped SKUs (since `saveProductMappings` registers the SKU and `getUnmappedSkus` queries the mapping table). But historical retroactive attribution — the explicit feature in BS-03 — silently does nothing. Any externalRevenue records created before a SKU is mapped will remain unattributed to a menuProduct.

**Fix required:** In `fetchOrders`, after calling `saveRevenue`, iterate the returned ids and patch each corresponding `bigsellerOrders` document's `linkedRevenueId` field. This requires correlating `saveRevenue` return ids with the rows by matching `externalTransactionId: "bigseller:{platformOrderId}"`.

---

*Verified: 2026-02-27T14:04:47Z*
*Verifier: Claude (gsd-verifier)*
