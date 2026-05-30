# Phase 79: Shopee Item-Level Revenue - Research

**Researched:** 2026-04-14
**Domain:** Convex backend integration (BigSeller sync → `externalRevenueItems`); analytics query branching; React sync-panel UX
**Confidence:** HIGH

## Summary

Phase 79 extends the existing `externalRevenueItems` pipeline (proven for GoFood/GoJek internal in Phase 70) to cover BigSeller-sourced Shopee/TikTok orders. Every piece of backend infrastructure needed already exists — the work is mostly **plumbing a new caller into established patterns**, not building new subsystems. Four small net-new components: (1) a `priceOracle` helper that aggregates median per-SKU prices from historical single-SKU `bigsellerOrders`; (2) a `saveBigsellerRevenueItems` wrapper emitted inside the existing `fetchOrders` stage of BigSeller sync; (3) two new admin buttons + backing mutations in `BigSellerSyncPanel` (backfill, re-check empty rows); (4) a daily 03:00 WIB cron with the "skip if sync not idle" guard. The `applyRetroactiveProductMapping` helper needs its Shopee/TikTok branch extended to cascade SKU → item (not just parent-revenue) and to set the parent's `linkedMenuProductId` to the dominant-SKU winner. Sell-through query gains two branches. Lifetime + COGS + hero-card queries require **zero changes** — they already read `externalRevenueItems` generically and will auto-pick up Shopee once items exist.

**Critical finding:** BigSeller's `pageList` response does NOT expose buyer name / phone / address. The only `buyer*` fields in the API are financial (`buyerShippingFee`, `buyerTotalAmount`, `buyerPaidShippingFee`). No per-order detail endpoint is documented. Per D-07 this **defers customer capture entirely** — no schema changes to `bigsellerOrders` for buyer fields this phase.

**Primary recommendation:** Keep Phase 79 a "mirror existing patterns" phase. The single original-research contribution is the `priceOracle` (median-of-historical-single-SKU prices). Everything else is "apply the GoBiz/internal template to the BigSeller sync path."

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Unit Price Derivation**
- **D-01:** Per-item `unitPrice` is pro-rated by `menuProduct.price × skuNum` weighting of `orderAmount`. Residual rounding goes to the largest-qty item so `sum(items.totalPrice) === parent.revenueGross` exactly.
- **D-02:** When a SKU has no mapped `menuProduct` at sync time, fall back to flat share: `unitPrice = orderAmount / totalSkuNum`. Flag item as `isAutoMatched: false` so retroactive mapping later re-computes price.
- **D-03:** Build a `priceOracle` helper: aggregate historical single-SKU `bigsellerOrders` (where `skuVoList.length === 1`) into `effectivePrice[sku] = median(orderAmount / skuNum)`. Use oracle price first, `menuProduct.price` second, flat share last. Single-SKU × multi-qty orders are the dominant pattern for Frollie Shopee.
- **D-04:** Revenue is NOT double-counted: parent `externalRevenue.revenueGross` remains the source of truth for channel totals. Items exist purely for attribution/analytics. Any query that sums both parent and items is a bug.

**Customer Data Capture**
- **D-05:** Capture buyer fields on `bigsellerOrders` ONLY when BigSeller API surfaces them.
- **D-06:** No link to `customers` table this phase. Transaction-bound capture only.
- **D-07:** If researcher confirms pageList does NOT expose buyer fields and order-detail requires N extra calls, **defer customer capture entirely**.

**Retroactive SKU→menuProduct Mapping Cascade**
- **D-08:** Cascade `sku → menuProduct` to ALL past and future `externalRevenueItems` in a single mutation. No "future-only" opt-in.
- **D-09:** Parent `externalRevenue.linkedMenuProductId` for mixed-SKU orders = dominant SKU by qty (max `skuNum`; ties broken by highest `menuProduct.price`). Single-SKU orders trivially set the parent id.
- **D-10:** No `isManuallyMapped` flag this phase. Cascade overwrites auto-matched items freely.

**Daily Cron**
- **D-11:** Cron runs daily at **03:00 WIB** (= 20:00 UTC prior day). Re-syncs the trailing 7 days.
- **D-12:** If `bigsellerSyncState.stage !== "idle"` when cron fires, **skip** and write `externalSyncLogs` entry with status=`error`, errorMessage=`"skipped: manual sync in progress"`. No retry/queue.
- **D-13:** Cron failures (non-conflict) write `externalSyncLogs` error row. No email/toast alert this phase.

**"Pending SKU" UI**
- **D-14:** Threshold = **24h** from `orderTimeMs`. Rows where `allSkuNum === 0 || skuVoList.length === 0` AND age < 24h display "Pending SKU from Shopee".
- **D-15:** After 24h with still-empty SKU data, revert to bare `"--"`. Recovery path = "Re-check empty rows" button.
- **D-16:** Label change applies to `BigSellerOrdersTable` and Sales Analytics detail views.

**Historical Backfill**
- **D-17:** Backfill trigger = prominent button inside `BigSellerSyncPanel`.
- **D-18:** Scope: all `bigsellerOrders` with `skuVoList.length > 0`. Idempotent via existence check (`revenueId + sku`). Orders with empty `skuVoList` are skipped.
- **D-19:** Separate "Re-check empty rows" button. Scope: `skuVoList.length === 0` OR `allSkuNum === 0`. Action: fetch fresh pageList data for that date range, re-run `upsertOrders` (preserve-non-empty guard applies), then run backfill for newly-populated rows.
- **D-20:** Both buttons show progress toast + final count. Both replayable (idempotent).
- **D-21:** Backfill creates revenue items only — **no retroactive inventory deduction**.

**Inventory Deduction (Deferred but Flagged)**
- **D-22:** Shopee/TikTok sales do NOT deduct inventory in this phase. No `processBigsellerSales` added.
- **D-23:** Deduction consolidation = separate follow-up phase (Phase 999.4 in backlog).

### Claude's Discretion
- Exact query used to compute `priceOracle` (SQL-shape aggregation, median vs mean, time window)
- Exact toast copy and progress reporting granularity
- Whether to use an internal action vs mutation for the cron
- Column layout / position for buyer fields in `BigSellerOrdersTable` if captured
- Error message wording for "skipped" cron conflict log

### Deferred Ideas (OUT OF SCOPE)
- **URGENT follow-up:** Unified cross-channel inventory deduction (Phase 999.4)
- Linking captured buyer fields to `customers` table
- Manual-override protection (`isManuallyMapped` flag)
- Shopee/TikTok `bigsellerOrders.costFee` configuration (pre-existing blocker)
- Alerting on cron failures
- Order-detail endpoint integration
</user_constraints>

<phase_requirements>
## Phase Requirements

Requirements DA-05 through DA-13 in this phase map 1:1 to the 9 ROADMAP.md Success Criteria (source: `.planning/ROADMAP.md` §Phase 79 lines 328-338). The REQUIREMENTS.md `## Traceability` table was not updated with DA-05..DA-13 (it stops at DA-04); the authoritative definitions live in the Success Criteria list.

| ID | Description (from ROADMAP.md Success Criteria) | Research Support |
|----|------------------------------------------------|------------------|
| DA-05 | New BigSeller syncs write one `externalRevenueItems` row per `skuVoList` entry (quantity = `skuNum`, unit price pro-rated from `orderAmount` unless platform-reported), without double-counting vs parent `externalRevenue.revenueGross` | `saveRevenueItems` pipeline + `priceOracle` helper. Parent/child sum invariant enforced by D-01 rounding rule. [VERIFIED in `convex/externalData/mutations.ts:587`] |
| DA-06 | Retroactive SKU→menuProduct mapping updates items' `linkedMenuProductId` alongside parent's | Extend `applyRetroactiveProductMapping` Shopee/TikTok branch from parent-only to item+parent cascade. [VERIFIED gap in `convex/externalData/mutations.ts:471-492`] |
| DA-07 | Sell-through query has `shopee` and `tiktok` branches returning real per-product volume | Add branches alongside existing `gobiz`/`k3mart`/`internal` at `convex/externalData/queries.ts:1093-1131` |
| DA-08 | Lifetime ball counts include Shopee/TikTok via actual `item.quantity × ballsPerProduct` from BOM | Zero code changes needed. `lifetimeHelpers.ts:computeLifetimeTotals` already iterates all items source-agnostically. Shopee items flow in automatically. [VERIFIED] |
| DA-09 | Income statement per-product COGS reflects actual BOM cost × quantity for Shopee/TikTok | Zero code changes needed. `reports/incomeStatement.ts:resolveItemsCOGS` is source-agnostic. Already iterates all items. [VERIFIED at `convex/reports/incomeStatement.ts:133-184`] |
| DA-10 | Backfill migration converts all existing `bigsellerOrders` into `externalRevenueItems` idempotently with no double-counted revenue | New mutation `backfillBigsellerItems`, idempotent via `(revenueId, externalItemId=sku)` dedup in existing `saveRevenueItems`. [VERIFIED dedup logic at lines 614-623] |
| DA-11 | Customer name/phone/address persisted on `bigsellerOrders` when BigSeller provides them | **Research finding: BigSeller pageList does NOT expose these fields.** Per D-07, defer entirely this phase. Requirement is satisfied by "N/A — platform does not provide." |
| DA-12 | Daily cron re-syncs the last 7 days of BigSeller data | New `crons.daily` at 20:00 UTC (03:00 WIB next day), skip-if-not-idle guard. Call chain: cron → `runBigsellerSync` action. |
| DA-13 | UI shows "Pending SKU from Shopee" (not bare `--`) for sub-24h rows with empty `skuVoList` | Edit `BigSellerOrdersTable.tsx:322-345` — compute `ageHours = (Date.now() - orderTimeMs) / 3_600_000` and branch label/render accordingly. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

These are **non-negotiable** directives the plan must comply with. Claims tagged `[CLAUDE.md]`.

- **Branch strategy**: Every phase runs on its own `feature/{slug}` branch. Verify `git branch --show-current` is NOT `main` before starting. Merge to main before starting next phase. `branching_strategy: "phase"` in `.planning/config.json`. [CLAUDE.md]
- **Tests + build gate**: `npm run build` must pass before merge (tsc + vite). `npm run test` (Vitest + convex-test) is the test runner. [CLAUDE.md]
- **CHANGELOG.md** must be updated on every merge to main. SCHEMA.md updated if schema changes (this phase does NOT change schema per the buyer-fields deferral). [CLAUDE.md]
- **Convex typed IDs**: use `Id<"tableName">`, not `string`. Convex returns `undefined` while loading — always check before render. Field names are camelCase. [CLAUDE.md]
- **No dynamic imports in Convex backend** — static imports only. Dynamic `import()` works locally but fails silently in prod (204 No Content). [CLAUDE.md]
- **Typed ctx**: use `QueryCtx` / `MutationCtx` from `_generated/server`, not `{ db: any }`. [CLAUDE.md]
- **Index range bounds** must both be inside `.withIndex()`, not `.filter()`. [CLAUDE.md]
- **BOM is source of truth for ball counts** — `menuProductComponents` joined with `componentTypes` (filter `category="production"`). NEVER use deprecated `productionType` / `productionUnits` fields on `menuProducts` or `orderItems`. [CLAUDE.md + MEMORY.md]
- **Protected mutations** require `token: v.string()` arg and call `requireRole(ctx, args.token, [...])` from `convex/lib/auth.ts`. Extract token before passing args to db. [CLAUDE.md]
- **Required planning sections** (Git Workflow, Implementation Waves, Documentation Updates, Success Criteria) — each plan file must include all four. [CLAUDE.md "Planning Requirements"]
- **Add files to git explicitly** — new files MUST be `git add`-ed; untracked files break CI deploy. [MEMORY.md]
- **Schema count**: 70 tables (not 59 as CLAUDE.md says — use MEMORY.md 2026-04-12 figure). [MEMORY.md]

## Standard Stack

No net-new libraries. Entire phase runs on existing stack.

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Backend runtime, mutations, queries, cron | Existing project backbone [CLAUDE.md] |
| React | ^19.2.0 | Sync panel UI | Existing [CLAUDE.md] |
| TypeScript | ~5.9 | Type safety | Existing [CLAUDE.md] |
| Sonner | current | Progress toasts for backfill / re-check buttons | Already used across `BigSellerSyncPanel.tsx` [VERIFIED: import at line 12] |
| Vitest | ^4.0.18 + convex-test | Unit + backend tests | Existing test infrastructure [CLAUDE.md] |

### Supporting (already in use)
| Library | Purpose | When to Use |
|---------|---------|-------------|
| Lucide React | Button icons for new backfill / re-check buttons | Match existing `BigSellerSyncPanel` iconography (RefreshCw, CheckCircle2, AlertTriangle) [VERIFIED: imports at lines 6-11] |
| shadcn/ui Button + Badge | Action buttons and status chips in panel | Match existing panel style [VERIFIED] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `crons.daily("name", { hourUTC, minuteUTC }, ...)` | `crons.cron("name", "0 20 * * *", ...)` cron-expression form | Both work. `daily` is more readable for a single-time-per-day schedule. Use `daily` unless we need multi-time scheduling. [Convex docs] |
| Median price oracle | Mean / mode / most-recent | Median is robust to outliers (e.g., 80%-off promo orders). Given Frollie's single-SKU-dominant order shape, even mean would work. **Stick with median per D-03.** |

**No `npm install` required.** This is a zero-new-dependency phase.

## Architecture Patterns

### Recommended File Plan
```
convex/
├── integrations/bigseller/
│   ├── sync.ts                          # MODIFY: add saveBigsellerRevenueItems call in fetchOrders stage
│   ├── helpers.ts                       # MODIFY: add pricing helpers (prorateItems, buildPriceOracle)
│   └── __tests__/helpers.test.ts        # MODIFY: add unit tests for prorating + oracle
├── externalData/
│   ├── mutations.ts                     # MODIFY: extend applyRetroactiveProductMapping Shopee/TikTok branch
│   └── queries.ts                       # MODIFY: add shopee/tiktok branches in sell-through query
├── bigsellerOrders/
│   ├── mutations.ts                     # MODIFY: add backfillItems + rescanEmptyRows mutations
│   └── queries.ts                       # MODIFY (optional): dominant-SKU helper if used by UI
└── crons.ts                             # MODIFY: add crons.daily entry for Shopee 7-day re-sync

src/components/salesAnalytics/
├── BigSellerSyncPanel.tsx               # MODIFY: add "Backfill items" and "Re-check empty rows" buttons
└── BigSellerOrdersTable.tsx             # MODIFY: "Pending SKU from Shopee" label (24h threshold)
```

### Pattern 1: Per-item emit alongside parent saveRevenue (MIRROR GoBiz)
**What:** Every adapter that populates `externalRevenueItems` follows the exact same shape: `saveRevenue` (batched) → for each new revenue id, `saveRevenueItems` with `{ revenueId, items: [...] }`.
**When to use:** Inside the `fetchOrders` stage of `convex/integrations/bigseller/sync.ts`, after the existing `saveRevenue` + `linkRevenueToOrders` block.
**Example:**
```typescript
// Source: convex/integrations/gobiz/adapter.ts:470 [VERIFIED]
await ctx.runMutation(internal.externalData.mutations.saveRevenueItems, {
  revenueId,
  items: enrichedItems, // Array with externalItemId, productName, unitPrice, quantity, totalPrice
});
```

For Shopee/TikTok there is **no product name from BigSeller** — `pageList` only returns SKU codes [VERIFIED: `convex/integrations/bigseller/sync.ts:768` comment "BigSeller only provides SKU codes, not names"]. Therefore the Shopee item emit pattern must resolve a fallback `productName`:

```typescript
// Shopee-specific item construction (per-order, inside the platform loop):
const items = order.skuVoList.map(skuEntry => {
  const mapping = mappingBySku.get(skuEntry.sku);   // from externalProductMappings
  const menuProduct = mapping?.menuProductId ? menuProductById.get(mapping.menuProductId) : null;
  const productName = menuProduct?.name ?? skuEntry.sku;  // fallback = raw SKU
  const unitPrice = resolveUnitPrice(skuEntry, order, priceOracle, menuProduct);
  return {
    externalItemId: skuEntry.sku,          // D-18 idempotency key — "sku" is the dedup handle
    productName,                            // Menu product name if mapped, else raw SKU
    unitPrice,
    quantity: skuEntry.skuNum,              // D-01 quantity = skuNum
    totalPrice: unitPrice * skuEntry.skuNum, // Adjusted by residual-rounding rule below
    linkedMenuProductId: menuProduct?._id,
    isAutoMatched: Boolean(menuProduct),
    matchConfidence: menuProduct ? "exact" : "none",
  };
});
// Apply residual rounding: largest-qty item absorbs orderAmount - sum(items.totalPrice)
```

### Pattern 2: Three-tier unit-price resolution (D-01 + D-02 + D-03)
**What:** Cascade through three pricing sources in order of reliability.
**Order:**
1. **`priceOracle.get(sku)`** — median of `orderAmount / skuNum` from historical `bigsellerOrders` where `skuVoList.length === 1`. Most accurate because real observed prices. Covers single-SKU dominant pattern.
2. **`menuProduct.price`** — when SKU is mapped to a menuProduct.
3. **Flat share** — `orderAmount / totalSkuNum` (sum of all `skuNum` in order).

Then **pro-rate**: compute each item's weight as `(tentativeUnitPrice × skuNum) / sum(tentativeUnitPrice × skuNum)`, multiply by `orderAmount`, divide back by `skuNum`. Round to integer IDR. **Residual (orderAmount - sum(adjusted totalPrice)) goes to the largest-qty item** (ties broken by highest unit price). This enforces the D-01 invariant: `sum(items.totalPrice) === order.orderAmount` exactly.

**Where to implement:** Pure functions in `convex/integrations/bigseller/helpers.ts`. Export `buildPriceOracle(orders)` → `Map<sku, number>` and `prorateItems(order, priceOracle, menuProductById)` → `Array<ItemToSave>`. Unit tests mandatory.

### Pattern 3: Cascade on mapping update (extend `applyRetroactiveProductMapping`)
**What:** Single atomic mutation patches parent `externalRevenue` + all matching `externalRevenueItems` when admin maps a SKU.
**Current state** [VERIFIED at `convex/externalData/mutations.ts:471-492`]: the Shopee/TikTok branch only updates parent `externalRevenue.linkedMenuProductId`, not child items. The by-name item loop at lines 455-468 doesn't catch Shopee items because Shopee `productName` is the SKU code (not a human name), so the name-keyed lookup IS already partially correct — but only because `externalProductName` for Shopee mappings is defaulted to `externalProductCode` (SKU) [VERIFIED at `mutations.ts:558`]. The gap is the **dominant-SKU parent logic** (D-09) and handling mixed-SKU orders where multiple distinct SKUs all mapped to different products.

**Required extension:**
```typescript
// For each bigsellerOrder with hasSku:
// 1. Patch all externalRevenueItems with externalItemId === targetSku (existing item cascade adequate)
// 2. Compute dominant SKU for this order: argmax(skuNum) across skuVoList, ties → highest menuProduct.price
// 3. If dominant SKU === targetSku, patch parent revenue.linkedMenuProductId = targetMenuProductId
// 4. If dominant SKU !== targetSku, leave parent's existing mapping alone (another SKU holds dominance)
```

**Batch size concern:** Convex has a 16 MB mutation limit and an 8 MB per-document limit. Worst case: 10,000+ historical `bigsellerOrders` each with small `skuVoList`. Patching all items in one mutation is safe (~200 bytes per patch × 10K = 2 MB). Patching all `bigsellerOrders` parents to update `linkedRevenueId` is also safe. **No pagination needed at expected data volume (~300-500 Shopee orders/month × 12 months ≈ 6K orders).** [VERIFIED by MEMORY.md velocity notes.]

### Pattern 4: Cron skip-when-busy
**What:** Guard cron entry against concurrent manual sync.
**When:** New `crons.daily` entry calls a wrapper action that first checks `bigsellerSyncState.stage`.
**Example:**
```typescript
// convex/crons.ts
crons.daily(
  "bigseller nightly 7d resync",
  { hourUTC: 20, minuteUTC: 0 },  // 03:00 WIB = 20:00 UTC prior day
  internal.integrations.bigseller.cron.nightlySync,
);

// convex/integrations/bigseller/cron.ts (new file)
export const nightlySync = internalAction({
  args: {},
  handler: async (ctx) => {
    const state = await ctx.runQuery(internal.integrations.bigseller.queries.getSyncState, {});
    if (state && state.stage !== "idle") {
      // D-12: write externalSyncLogs error and skip
      await ctx.runMutation(internal.externalData.mutations.logSyncEvent, {
        source: "shopee",
        syncType: "scheduled",
        status: "error",
        errorMessage: "skipped: manual sync in progress",
        timestamp: Date.now(),
      });
      return;
    }
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await ctx.runAction(internal.integrations.bigseller.sync.runBigsellerSync, {
      startDate, endDate, triggeredBy: "cron-daily",
    });
  },
});
```
**Timezone math** [VERIFIED]: Indonesia WIB = UTC+7 (no DST). 03:00 WIB next day = 20:00 UTC today. Convex `crons.daily` uses UTC.

### Anti-Patterns to Avoid
- **Don't** delete and recreate items on re-sync. The preserve-non-empty guard (`resolveSkuVoListOnUpdate` at `convex/bigsellerOrders/mutations.ts:22`) keeps `skuVoList` stable across re-syncs; the `saveRevenueItems` dedup by `(revenueId, externalItemId)` [VERIFIED at lines 616-623] handles replays correctly. **Never DELETE items and reinsert** — breaks idempotency guarantee and risks dropping retroactive mapping state.
- **Don't** sum parent `revenueGross` AND `items.totalPrice` in the same query. D-04 violation — these are the same revenue viewed two ways. Current sell-through/lifetime/COGS queries handle this correctly; Phase 79 must not introduce a regression.
- **Don't** add a parallel `processBigsellerSales` inventory-deduction mutation (D-22). The follow-up phase (999.4) consolidates all channel deduction; adding Shopee-specific deduction now entrenches the anti-pattern.
- **Don't** derive `linkedMenuProductId` for the parent revenue from "first SKU." Must use dominant-SKU rule (D-09) to avoid COGS attribution to the wrong product on mixed-SKU orders.
- **Don't** fetch BigSeller order-detail endpoint per-order for buyer capture. Per research: pageList already lacks buyer fields, and extra per-order HTTP calls are prohibitively expensive. **Defer entirely per D-07.**

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-item revenue write | Custom `ctx.db.insert("externalRevenueItems", ...)` loop | `internal.externalData.mutations.saveRevenueItems` | Already handles source lookup from parent, dedup via `(revenueId, externalItemId)` filter, and confidence field [VERIFIED at `mutations.ts:587-644`] |
| Deduplication on backfill | Custom existence check | `saveRevenueItems` built-in dedup on `(revenueId, externalItemId)` via `by_revenue` index + filter | Already idempotent. Call twice → second call inserts zero. [VERIFIED lines 616-623] |
| Cron wiring | Manual `scheduler.runAfter` chain | `crons.daily({ hourUTC, minuteUTC }, fn)` | Built-in, auto-managed. Used elsewhere in crons.ts [CITED: Convex docs `scheduling/cron-jobs`] |
| Cross-order price weighting | Fresh in-sync aggregation | Pre-compute `priceOracle: Map<sku, medianPrice>` once at start of sync | O(n) aggregation over all historical single-SKU orders, then O(1) lookup per item. Avoids re-scanning inside item loop. |
| Retroactive item cascade | New Shopee-specific mutation | Extend existing `applyRetroactiveProductMapping` | Already handles parent patching. Item cascade already works for GoFood; extend SHopee branch to patch parent dominant-SKU + ensure items are patched via by-name loop (Shopee productName = SKU code). [VERIFIED path at `mutations.ts:446-495`] |
| Dominant-SKU resolution | Inline in callsite | Pure helper `dominantSku(skuVoList, menuProductById): { sku, menuProductId }` | Reusable by retroactive mapping AND by initial sync when deciding parent `linkedMenuProductId`. Unit-testable without Convex. |
| "Pending SKU" timing | Hardcoded 24h constant inline | `PENDING_SKU_THRESHOLD_MS = 24 * 3600_000` export | Consistent naming across frontend/backend; tweakable single place. |

**Key insight:** This phase's engineering content is 90% in choosing the right existing patterns to thread together. The only novel logic is the `priceOracle` (~40 LOC) and the dominant-SKU helper (~15 LOC). Everything else is plumbing.

## Common Pitfalls

### Pitfall 1: Saving items with wrong source
**What goes wrong:** `saveRevenueItems` infers `source` from the parent revenue record [VERIFIED at `mutations.ts:609-611`]. If the Shopee sync ever accidentally passes a TikTok order's items to a Shopee revenue id (or vice versa), items get mis-attributed.
**Why it happens:** BigSeller sync iterates BOTH Shopee + TikTok rows in the same `fetchOrders` stage.
**How to avoid:** Always call `saveRevenueItems` with `revenueId` matching the same iteration's `saveRevenue` output. Map `revenueId → platform` before constructing items. Current sync already does this correctly for parent linking via `linkRevenueToOrders` — mirror the same per-order pattern for items.
**Warning signs:** After sync, run `SELECT source, COUNT(*) FROM externalRevenueItems WHERE revenueId IN (SELECT _id FROM externalRevenue WHERE source='tiktok')` equivalent check — should show only `source='tiktok'` items.

### Pitfall 2: Residual-rounding drift (revenue conservation break)
**What goes wrong:** Floating-point pro-rata sums diverge from `orderAmount` by 1-3 IDR, causing `sum(items.totalPrice) ≠ parent.revenueGross`.
**Why it happens:** Naive `Math.round(item.totalPrice)` without residual redistribution.
**How to avoid:** Compute items with integer `Math.floor`, then distribute residual `orderAmount - sum(flooredTotals)` IDR-by-IDR to largest-qty items (D-01 rule). Property test: for any order, `sum(items.totalPrice) === order.orderAmount` exactly (integer equality).
**Warning signs:** Any `sum(items) - parent` drift at all in production data. Nyquist validation golden samples should catch this.

### Pitfall 3: Double-counting in new analytics
**What goes wrong:** A future analytics query sums both `externalRevenue.revenueGross` AND `externalRevenueItems.totalPrice` for a Shopee channel view, inflating the number by 2×.
**Why it happens:** Developer assumes items are supplementary revenue rather than attribution detail.
**How to avoid:** D-04 invariant is non-negotiable. The sell-through query correctly iterates items for qty/attribution only and gets revenue from parent (see the GoBiz branch at `queries.ts:1102-1130`). Mirror exactly — **never sum both**.
**Warning signs:** Channel revenue totals suddenly double when items start writing.

### Pitfall 4: Retroactive cascade running during active sync
**What goes wrong:** Admin clicks "Map SKU" while the daily cron is mid-fetch. Sync writes new items with `isAutoMatched: false, linkedMenuProductId: null`. Cascade patches existing items but misses items written milliseconds later.
**Why it happens:** No lock between sync and mapping mutation.
**How to avoid:** This is actually self-healing — the *next* time admin maps the same SKU, or the next sync, picks up the stragglers. For Phase 79 it's acceptable. Do NOT add locking (overkill).
**Warning signs:** Reports of "I mapped this yesterday but some orders still show unmapped" — run `applyRetroactiveProductMapping` again, resolves.

### Pitfall 5: Cron skip log flood
**What goes wrong:** Admin runs manual sync at 20:00 UTC daily (happens to overlap with cron). Every day writes a "skipped" error log; sync history gets noisy.
**Why it happens:** User's manual pattern collides with cron time.
**How to avoid:** 03:00 WIB specifically chosen as off-peak (D-11). If an admin complains, adjust cron time. Do NOT silently skip without logging (D-12 requires the log row for observability).
**Warning signs:** >1 skip/week in `externalSyncLogs` → reconsider cron schedule.

### Pitfall 6: `pageList` returns empty `skuVoList` even after 24h
**What goes wrong:** A Shopee order never populates SKU data because BigSeller's upstream platform sync failed. Stays `--` forever.
**Why it happens:** Known BigSeller intermittent behavior (documented in commit `9c9a2963`).
**How to avoid:** D-15 reverts to bare `--` after 24h. Admin has "Re-check empty rows" (D-19) as manual recovery. No data loss — the order still counts for revenue via `orderAmount`; only the per-product attribution is lost. Income-statement impact: missing items show up in `unmappedProductsMap` in `resolveItemsCOGS` as "unknown revenue with zero COGS."
**Warning signs:** A Shopee channel with high `unmappedProducts.revenue / totalRevenue` ratio → re-run "Re-check empty rows."

### Pitfall 7: Schema drift between `externalSource` validator and `EXTERNAL_SOURCES` array
**What goes wrong:** Add a branch for `"shopee"` in a query but `EXTERNAL_SOURCES` at `convex/lib/externalSource.ts:10-19` doesn't list it → type error OR silent miss.
**Why it happens:** Two sources of truth.
**How to avoid:** VERIFIED both already include `"shopee"` and `"tiktok"` [`externalSource.ts:17-18`, `schema.ts` externalSource validator]. No drift to fix for Phase 79 — just use `source === "shopee" || source === "tiktok"` branches safely.
**Warning signs:** `tsc` error about `"shopee"` not assignable to `ExternalSource` → check both files.

### Pitfall 8: Convex 8 MB per-document limit on huge `skuVoList`
**What goes wrong:** A hypothetical mega-order with 10K SKUs would exceed the per-doc limit when patched.
**Why it happens:** `bigsellerOrders.skuVoList` is an inline array.
**How to avoid:** Not a realistic risk for Frollie (orders typically have 1-3 SKUs). Skip defensive coding. **Document in RESEARCH only — no plan task needed.**

## Code Examples

### Canonical per-item write (mirror this exactly for Shopee)
```typescript
// Source: convex/integrations/gobiz/adapter.ts:469-473 [VERIFIED]
await ctx.runMutation(internal.externalData.mutations.saveRevenueItems, {
  revenueId,
  items: enrichedItems, // Array<{externalItemId, productName, unitPrice, quantity, totalPrice, linkedMenuProductId, isAutoMatched, matchConfidence}>
});
```

### Dominant SKU helper (pure function, unit-testable)
```typescript
// Source: NEW — convex/integrations/bigseller/helpers.ts
export function dominantSku(
  skuVoList: ReadonlyArray<{ sku: string; skuNum: number }>,
  mappingBySku: Map<string, { menuProductId?: string; menuProductPrice?: number }>
): { sku: string | null; menuProductId: string | null } {
  if (skuVoList.length === 0) return { sku: null, menuProductId: null };
  if (skuVoList.length === 1) {
    const entry = skuVoList[0];
    return { sku: entry.sku, menuProductId: mappingBySku.get(entry.sku)?.menuProductId ?? null };
  }
  const sorted = [...skuVoList].sort((a, b) => {
    if (b.skuNum !== a.skuNum) return b.skuNum - a.skuNum;       // max qty
    const ap = mappingBySku.get(a.sku)?.menuProductPrice ?? 0;
    const bp = mappingBySku.get(b.sku)?.menuProductPrice ?? 0;
    return bp - ap;                                              // tie → max price
  });
  return {
    sku: sorted[0].sku,
    menuProductId: mappingBySku.get(sorted[0].sku)?.menuProductId ?? null,
  };
}
```

### Price oracle (pure function over historical data)
```typescript
// Source: NEW — convex/integrations/bigseller/helpers.ts
export function buildPriceOracle(
  orders: ReadonlyArray<{ orderAmount?: number; saleAmount: number; skuVoList: ReadonlyArray<{ sku: string; skuNum: number }> }>
): Map<string, number> {
  const samples = new Map<string, number[]>();
  for (const order of orders) {
    if (order.skuVoList.length !== 1) continue;              // single-SKU only
    const entry = order.skuVoList[0];
    if (entry.skuNum <= 0) continue;
    // Prefer orderAmount (total buyer paid incl. shipping) — but D-01 pro-rates against orderAmount,
    // so oracle must use same numerator. When orderAmount absent, fall back to saleAmount.
    const baseAmount = order.orderAmount ?? order.saleAmount;
    if (!baseAmount || baseAmount <= 0) continue;
    const perUnit = baseAmount / entry.skuNum;
    if (!samples.has(entry.sku)) samples.set(entry.sku, []);
    samples.get(entry.sku)!.push(perUnit);
  }
  const oracle = new Map<string, number>();
  for (const [sku, arr] of samples) {
    arr.sort((a, b) => a - b);
    const mid = Math.floor(arr.length / 2);
    const median = arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
    oracle.set(sku, Math.round(median));
  }
  return oracle;
}
```
**NOTE on oracle denominator:** Using `orderAmount` (which includes buyer shipping) inflates the per-unit price by the shipping component. Options: (a) use `saleAmount` (product-only, strict per-unit correctness), or (b) use `orderAmount` (matches the field that items pro-rate against → perfect residual-rounding consistency). **Recommendation: use `orderAmount` to preserve the D-01 sum invariant.** The oracle is a relative weight for multi-SKU orders, not an absolute price for display.

### Residual-rounding pro-rata (pure function)
```typescript
// Source: NEW — convex/integrations/bigseller/helpers.ts
export function prorateItems(
  order: { orderAmount?: number; saleAmount: number; skuVoList: Array<{ sku: string; skuNum: number }> },
  oracle: Map<string, number>,
  mappingBySku: Map<string, { menuProductId?: string; menuProductPrice?: number }>
): Array<{ sku: string; skuNum: number; unitPrice: number; totalPrice: number }> {
  const baseAmount = order.orderAmount ?? order.saleAmount;
  if (order.skuVoList.length === 0 || baseAmount <= 0) return [];

  // Step 1: tentative per-unit weight via 3-tier fallback (D-03)
  const tentative = order.skuVoList.map(e => {
    const mapping = mappingBySku.get(e.sku);
    const weight = oracle.get(e.sku) ?? mapping?.menuProductPrice ?? (baseAmount / order.skuVoList.reduce((s, x) => s + x.skuNum, 0));
    return { ...e, tentativeUnit: Math.max(1, Math.round(weight)) };
  });

  // Step 2: scale to match orderAmount exactly via weighted pro-rata
  const totalWeight = tentative.reduce((s, e) => s + e.tentativeUnit * e.skuNum, 0);
  const scaled = tentative.map(e => {
    const share = (e.tentativeUnit * e.skuNum) / totalWeight;
    const flooredTotal = Math.floor(baseAmount * share);
    return { sku: e.sku, skuNum: e.skuNum, totalPrice: flooredTotal };
  });

  // Step 3: distribute residual to largest-qty item (D-01)
  const residual = baseAmount - scaled.reduce((s, e) => s + e.totalPrice, 0);
  if (residual !== 0) {
    const idx = scaled
      .map((e, i) => ({ i, qty: e.skuNum }))
      .sort((a, b) => b.qty - a.qty)[0].i;
    scaled[idx].totalPrice += residual;
  }

  return scaled.map(e => ({
    sku: e.sku,
    skuNum: e.skuNum,
    unitPrice: Math.round(e.totalPrice / e.skuNum),    // integer IDR display
    totalPrice: e.totalPrice,
  }));
}
```

### Sell-through Shopee/TikTok branch (add to existing switch)
```typescript
// Source: NEW branch in convex/externalData/queries.ts ~line 1093 [mirror gobiz branch]
} else if (args.channel === "shopee" || args.channel === "tiktok") {
  // Phase 79: Shopee/TikTok now have per-item data via externalRevenueItems
  const revenue = await ctx.db
    .query("externalRevenue")
    .withIndex("by_source_period", (q) =>
      q.eq("source", args.channel).gte("periodStart", thirtyDaysAgo)
    )
    .collect();

  for (const r of revenue) {
    const items = await ctx.db
      .query("externalRevenueItems")
      .withIndex("by_revenue", (q) => q.eq("revenueId", r._id))
      .collect();

    const txnDate = r.transactionDate ?? r.periodStart;
    for (const item of items) {
      const entry = getOrCreate(
        item.productName,
        item.productName,
        item.linkedMenuProductId as string | undefined
      );
      if (isWeekend(txnDate)) entry.weekendSalesTotal += item.quantity;
      else entry.weekdaySalesTotal += item.quantity;
      if (txnDate >= sevenDaysAgo) entry.last7dSales += item.quantity;
      else if (txnDate >= fourteenDaysAgo) entry.prev7dSales += item.quantity;
      entry.transactionCount += 1;
    }
  }
}
```

### "Pending SKU" label branching
```typescript
// Source: MODIFY src/components/salesAnalytics/BigSellerOrdersTable.tsx:322-345
const PENDING_SKU_THRESHOLD_MS = 24 * 3600_000;
const ageMs = Date.now() - order.orderTimeMs;
const withinPendingWindow = ageMs < PENDING_SKU_THRESHOLD_MS;
const isEmpty = resolved.length === 0 && ((order.allSkuNum ?? 0) === 0 || (order.skuVoList ?? []).length === 0);

// In render:
{isEmpty ? (
  withinPendingWindow ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help italic text-muted-foreground">
            Pending SKU from Shopee
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs max-w-[280px]">
            BigSeller has not yet returned SKU breakdown. The daily 03:00 WIB re-sync
            should populate this within 24h of order time.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    <span className="text-muted-foreground">--</span>
  )
) : (...)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Shopee/TikTok parent-only `externalRevenue` (no items) | Parent + per-SKU `externalRevenueItems` | Phase 79 | Unlocks BOM-driven ball counts, per-product COGS, sell-through for Shopee/TikTok |
| `productionType`/`productionUnits` on menuProducts | BOM (`menuProductComponents` + `componentTypes`) | Pre-Phase 70 established | Use BOM exclusively for ball counts (CLAUDE.md pitfall 11, MEMORY.md) |
| Revenue-extrapolated ball counts for Shopee (`gross / avgRevenuePerBall`) | Real `item.quantity × ballsPerProduct` | Phase 79 | Precision ↑; no more hidden extrapolation bias |
| Sync-only emit → items go stale for same-day orders | Daily 7-day re-sync cron | Phase 79 | Same-day `--` rows auto-backfill when Shopee finalizes data |
| Bare `--` for empty SKU rows | "Pending SKU from Shopee" (< 24h), then `--` | Phase 79 D-14/D-15 | UX clarity; admins understand it's transient |

**Deprecated / outdated:**
- `productionType="original"`/`"bite"` literals on `menuProducts` and `orderItems` — still present in schema but MUST NOT be read for ball counts. Shopee item emission derives ball counts only by BOM lookup downstream (lifetimeHelpers / incomeStatement). [CLAUDE.md pitfall 11]
- `avgRevenuePerBall` division for Shopee estimation — still used as fallback when no BOM-linked items exist, but after Phase 79 most Shopee revenue will have real BOM-linked items, so the fallback gets exercised only for genuinely unmapped SKUs.

## Runtime State Inventory

> This is NOT a rename/refactor phase. Omitted.

**Status:** N/A — Phase 79 is an additive feature phase (writes new data, adds new UI). No renames, no string replacements, no migrations changing existing data shape.

## Environment Availability

> Phase 79 has no new external dependencies. All tools already in use.

**Status:** SKIPPED — all required infrastructure (Convex deployment, BigSeller API access, existing `externalRevenue*` pipeline, React/Vite build) is already in place and used by Phase 70 + prior BigSeller sync work (commit `9c9a2963`).

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Convex deployment | All backend work | ✓ | `prod:decisive-wombat-7` / `dev:exciting-fennec-671` | — |
| BigSeller API session cookie (`muc_token`) | Daily cron + backfill | ✓ | Existing | — |
| Vitest + convex-test | Validation architecture | ✓ | ^4.0.18 | — |
| `npm run build` | Merge gate | ✓ | Existing | — |

## Validation Architecture

> Required section (nyquist_validation not disabled in config.json).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 + `convex-test` |
| Config file | `vitest.config.ts` (project root) [VERIFIED via CLAUDE.md Commands section] |
| Quick run command | `npm run test -- <pattern>` (e.g., `npm run test -- bigseller`) |
| Full suite command | `npm run test` |
| Phase gate | `npm run type-check && npm run build && npm run test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DA-05 | Sync writes one item per skuVoList entry; `sum(items.totalPrice) === orderAmount` | unit (pure helper) | `npm run test -- bigseller/helpers` | Existing file — add tests for `prorateItems` |
| DA-05 | No double-counting: `sum(parent.revenueGross) === sum(itemTotals) for same records` | integration (convex-test) | `npm run test -- externalData/revenue-invariants` | ❌ Wave 0 |
| DA-06 | Cascade patches items + parent dominant-SKU | integration | `npm run test -- externalData/retroactive-mapping` | ❌ Wave 0 |
| DA-07 | Sell-through `shopee` branch returns real per-product volume | integration | `npm run test -- externalData/sell-through-shopee` | ❌ Wave 0 |
| DA-08 | Lifetime totals include Shopee when items exist | integration (reuse existing `lifetimeHelpers.test.ts` shape) | `npm run test -- lifetimeHelpers` | Extend existing file |
| DA-09 | Income statement Shopee per-product COGS matches BOM cost × qty | integration | `npm run test -- reports/incomeStatement-shopee` | ❌ Wave 0 |
| DA-10 | Backfill is idempotent (second run inserts zero rows) | integration | `npm run test -- bigsellerOrders/backfill` | ❌ Wave 0 |
| DA-11 | Buyer fields: N/A — BigSeller API doesn't provide | manual (doc note) | — | N/A |
| DA-12 | Cron skip-when-busy writes error log and no-ops | integration | `npm run test -- bigseller/cron` | ❌ Wave 0 |
| DA-13 | "Pending SKU" label at < 24h, `--` after 24h | component (frontend) | `npm run test -- BigSellerOrdersTable` | Existing — extend |

### Golden-Sample Invariant Tests (property-based)
These are the Nyquist validation anchors — verify the **same phenomenon from two independent angles**:

1. **Revenue conservation:** For every synced order, `sum(items.totalPrice) === parent.revenueGross` AND `sum(items.totalPrice) === order.orderAmount` (integer equality). Sentinel order fixture: `skuVoList = [{sku:"A", skuNum:2}, {sku:"B", skuNum:3}]`, `orderAmount = 100_001` — tests residual goes to largest-qty item.
2. **Ball-count sanity:** For a Shopee order with mapped menuProduct, `itemsBallCount === skuNum × BOM_ballsPerProduct`. Cross-check against the legacy `avgRevenuePerBall` estimate — new count should be within ±15% of estimate (sanity bound, not exact match).
3. **Cascade idempotency:** After `applyRetroactiveProductMapping(sku=X, product=P)`, every item with `externalItemId === X` has `linkedMenuProductId === P`. Running the same mutation twice produces identical DB state.
4. **Cron skip no-op:** With `bigsellerSyncState.stage = "fetching"`, invoking `nightlySync` produces exactly 1 new `externalSyncLogs` row with status=`error`, errorMessage contains `"skipped"`, and ZERO new `externalRevenue` / `externalRevenueItems` / `bigsellerOrders` rows.
5. **Dominant-SKU correctness:** Mixed-SKU order `[{sku:"A", skuNum:5}, {sku:"B", skuNum:3}]` → parent `linkedMenuProductId = A.menuProductId`. With `[{sku:"A", skuNum:3}, {sku:"B", skuNum:3}]` and `price[A] > price[B]` → parent = A. With prices equal → stable (first-listed wins is acceptable; document in test).
6. **Backfill replay:** Call `backfillBigsellerItems` twice in a row. Second call reports `created: 0, skipped: N`.

### Sampling Rate
- **Per task commit:** `npm run test -- <affected-module>` (e.g., `-- bigseller` after helper changes)
- **Per wave merge:** `npm run test` (full suite)
- **Phase gate:** Full suite green + `npm run build` + `npm run type-check` before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `convex/externalData/__tests__/revenue-invariants.test.ts` — covers DA-05 parent/child sum invariant
- [ ] `convex/externalData/__tests__/retroactive-mapping.test.ts` — covers DA-06 cascade
- [ ] `convex/externalData/__tests__/sell-through-shopee.test.ts` — covers DA-07
- [ ] `convex/reports/__tests__/incomeStatement-shopee.test.ts` — covers DA-09
- [ ] `convex/bigsellerOrders/__tests__/backfill.test.ts` — covers DA-10
- [ ] `convex/integrations/bigseller/__tests__/cron.test.ts` — covers DA-12
- [ ] Extend `convex/integrations/bigseller/__tests__/helpers.test.ts` — add `buildPriceOracle`, `prorateItems`, `dominantSku` pure-function tests
- [ ] Extend `src/components/salesAnalytics/__tests__/BigSellerOrdersTable.test.tsx` — add 24h threshold tests (create file if missing)

## Security Domain

> Required section (security_enforcement not disabled).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `requireRole(ctx, args.token, ["admin", "manager"])` on all new admin-triggered mutations (backfill, rescanEmptyRows). Cron path uses `internalMutation`/`internalAction` — no token needed (caller is Convex scheduler). [VERIFIED pattern at `convex/lib/auth.ts`] |
| V3 Session Management | yes | Session tokens validated via `requireRole`. No new session logic. |
| V4 Access Control | yes | Backfill/re-check buttons visible only to admin/manager via `ProtectedRoute` on the Sales Analytics page that hosts `BigSellerSyncPanel`. Match existing role gates. |
| V5 Input Validation | yes | Convex `v.*` validators on every new mutation arg. No user-supplied SQL — Convex ORM prevents injection. Validate `dateRange.startDate` / `endDate` as ISO strings; reject > 90d spans on backfill to prevent accidental full-table churn. |
| V6 Cryptography | no | No new crypto. BigSeller auth uses existing `muc_token` cookie pattern. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized backfill trigger (admin-only mutation called without token) | Elevation of Privilege | `requireRole(ctx, args.token, ["admin"])` — throws on unauthorized. [CLAUDE.md pattern] |
| Cron runs stale BigSeller token → 401 floods | Denial of Service | Log error and exit; no retry loop. `externalSyncLogs` row reveals the problem. Admin refreshes token via existing `muc_token` dialog. |
| Replay of backfill creates duplicate items | Tampering (inflated revenue) | Built-in dedup in `saveRevenueItems` via `(revenueId, externalItemId=sku)` filter. Already in place. |
| Race between manual sync and cron (double-write) | Tampering (corrupted state) | D-12 skip-if-not-idle guard. Cron exits cleanly; manual sync continues. |
| Large backfill ties up mutation/query capacity | DoS | Batch backfill into pages (e.g., 200 orders per mutation call) with `ctx.scheduler.runAfter` chaining. Current `saveRevenueItems` handles unlimited input but the admin-calling mutation should cap per-call batch. |
| Information disclosure via error messages | Information Disclosure | `externalSyncLogs.errorMessage` should log category + sanitized detail, not raw API response bodies (may contain tokens). |

## Assumptions Log

> Claims tagged `[ASSUMED]` in this research requiring user confirmation.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "Shopee order volume is ~300-500/month × 12 months ≈ 6K orders" (informing batch-size analysis) | Pattern 3 | If actual volume is 10×, backfill must paginate. Mitigation: code defensively with per-call cap of 200 orders regardless. |
| A2 | "03:00 WIB is off-peak for Frollie admins' manual-sync patterns" | D-11 Pattern 4 | Low risk — D-12 explicitly handles conflict by skipping + logging. If false, admins just see periodic skip logs. |
| A3 | "`saveRevenueItems` dedup on `(revenueId, externalItemId)` using `by_revenue` index + filter is efficient enough at 6K-order backfill" | Don't Hand-Roll table | If scan cost per dedup is O(items-per-revenue) and revenues have many items, backfill might be slow. Mitigation: measure in dev; if slow, add composite index `by_revenue_item` on `(revenueId, externalItemId)`. |
| A4 | "Using `orderAmount` as oracle denominator is preferable to `saleAmount` (D-01 sum invariance vs. display accuracy)" | Code Examples §priceOracle | If admins query items' `unitPrice` for display, the shipping-inflated price will look off. Document caveat; consider a `displayUnitPrice` field in follow-up if feedback surfaces. **User should confirm** this tradeoff. |
| A5 | "Residual-rounding goes to largest-qty item; ties broken by highest unit price — secondary tiebreak is first-listed" | D-01 + prorateItems | Behavior stable and deterministic as long as skuVoList order is stable. BigSeller's pageList order appears stable per HAR captures — document. |
| A6 | "Current 14-Apr blank Shopee rows (diagnosed in `.planning/debug/shopee-sku-mapping-quantity-and-14apr-blank.md`) will auto-heal on next cron run once Phase 79 ships, assuming BigSeller eventually populates them" | Pitfall 6 | If BigSeller NEVER populates them, admin must click "Re-check empty rows." Acceptable fallback. |

**Impact:** None of A1-A6 block implementation. A4 is the only one worth flagging for explicit user confirmation during planning.

## Open Questions (RESOLVED)

1. **Oracle denominator: `orderAmount` (matches D-01 exactly) vs `saleAmount` (product-only, stricter per-unit price meaning)?**
   - What we know: D-01 pro-rates against `orderAmount`. Oracle used as relative weight.
   - What's unclear: Whether any UI surfaces unit price for display (where shipping inflation matters).
   - **RESOLVED:** Use `orderAmount` to preserve the D-01 sum invariant (Σ items.totalPrice === parent.revenueGross). The caveat is documented in a code comment inside `buildPriceOracle`. No UI currently surfaces raw unit price, so shipping inflation is not observable to users.

2. **Should the "Re-check empty rows" button re-trigger a full pageList fetch for the affected date range, or a surgical lookup by order ID?**
   - What we know: D-19 says "fetch fresh pageList data for that order's date range."
   - What's unclear: pageList is date-ranged (not per-order-id); surgical lookup would require a different endpoint.
   - **RESOLVED:** Date-range re-fetch per D-19 literal wording. Implementation identifies the minimal date span covering all empty rows and re-syncs that span through existing pageList flow. Efficient for expected backlog sizes (< 100 rows).

3. **Does the cron action need a triggeredBy log for observability beyond `externalSyncLogs`?**
   - What we know: D-13 says log to externalSyncLogs only; no email/toast.
   - What's unclear: Whether admin wants a visible badge in `BigSellerSyncPanel` showing "last cron run at HH:MM."
   - **RESOLVED:** Out of scope for Phase 79. D-13 explicitly says log-only — adding a UI badge would expand scope. `externalSyncLogs` is queryable via the existing sync history UI; that satisfies observability.

4. **Placeholder `externalProductMappings` row cleanup?**
   - What we know: Sync auto-creates a mapping row for every seen SKU (`convex/integrations/bigseller/sync.ts:763`).
   - What's unclear: After Phase 79, newly-retired SKUs still accumulate as "unmapped" rows forever.
   - **RESOLVED:** Out of scope for Phase 79. Deferred to a future data-hygiene phase. Logged as backlog item — not a blocker because accumulated rows are cosmetic, not correctness-impacting.

## Sources

### Primary (HIGH confidence) — verified by codebase grep + Read
- `convex/schema.ts` lines 1140-1160, 1556-1619 — `externalRevenueItems`, `bigsellerOrders`, `bigsellerSyncState` structures [VERIFIED]
- `convex/externalData/mutations.ts` lines 446-495, 587-644 — `applyRetroactiveProductMapping` gap, `saveRevenueItems` dedup pattern [VERIFIED]
- `convex/integrations/gobiz/adapter.ts` lines 450-490 — canonical saveRevenue → saveRevenueItems pattern to mirror [VERIFIED]
- `convex/integrations/bigseller/sync.ts` lines 680-780 — current BigSeller sync flow (where to inject items emit) [VERIFIED]
- `convex/integrations/bigseller/helpers.ts` lines 160-206, 355-470 — `mapOrderToRevenue` structure and skuVoList shape (4 fields only: `sku, skuNum, returnNum, isAddition` — no name, no price) [VERIFIED]
- `convex/bigsellerOrders/mutations.ts` lines 1-100 — `resolveSkuVoListOnUpdate` preserve-non-empty guard [VERIFIED]
- `convex/lib/externalSource.ts` — `"shopee"` and `"tiktok"` already in `EXTERNAL_SOURCES` [VERIFIED]
- `convex/externalData/helpers/lifetimeHelpers.ts` — source-agnostic item iteration; no changes needed post-Phase 79 [VERIFIED]
- `convex/reports/incomeStatement.ts` lines 133-184 — `resolveItemsCOGS` source-agnostic [VERIFIED]
- `convex/externalData/queries.ts` lines 1020-1200 — sell-through branches structure for shopee/tiktok additions [VERIFIED]
- `src/components/salesAnalytics/BigSellerOrdersTable.tsx` lines 280-400 — current SKU rendering + "Pending SKU" tooltip infrastructure [VERIFIED]
- `src/components/salesAnalytics/BigSellerSyncPanel.tsx` lines 1-80 — existing panel shape; site of 2 new buttons [VERIFIED]
- `docs/BIGSELLER_PROFIT_API.md` — full pageList response schema; no buyer name/phone/address field. Only `buyerShippingFee`/`buyerTotalAmount` (financial) [VERIFIED via grep for "buyer|phone|address|receiver|consignee"]

### Secondary (MEDIUM confidence) — citations
- `.planning/phases/70-data-accuracy-foundation/70-RESEARCH.md` lines 158-394 — Convex `crons.interval` / `crons.daily` syntax [CITED: re-verified against Convex official docs at docs.convex.dev/scheduling/cron-jobs]
- Convex docs — `crons.daily("name", { hourUTC, minuteUTC }, fn)` form [CITED: docs.convex.dev/scheduling/cron-jobs]
- Indonesia WIB = UTC+7, no DST [CITED: timeanddate.com/time/zone/indonesia]

### Tertiary (LOW confidence) — marked for validation
- A3 assumption about dedup efficiency without composite index — verify in dev before backfill runs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new libraries, all existing patterns
- Architecture: HIGH — mirror-existing-adapter approach verified against GoBiz pattern
- Pitfalls: HIGH — most derived from existing Phase 70 + commit `9c9a2963` context
- BigSeller API buyer fields: HIGH — verified by exhaustive grep of `BIGSELLER_PROFIT_API.md` (no PII field found; only financial `buyer*` fields)
- Price oracle design: MEDIUM — novel to this phase; unit tests + golden samples required before shipping

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (30 days — BigSeller API schema is stable; Convex platform stable)

---

## RESEARCH COMPLETE
