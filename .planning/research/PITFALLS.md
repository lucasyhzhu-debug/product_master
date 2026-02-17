# Domain Pitfalls: v1.2 Multi-Channel Expansion

**Domain:** Unified dispatch planning, kitchen simplification, consignment revenue, cross-channel analytics, 3rd GoFood outlet
**Researched:** 2026-02-16
**Confidence:** HIGH (based on deep codebase analysis of 59-table schema, existing integration code, production tracking logic)

---

## Critical Pitfalls

Mistakes that cause data corruption, revenue misreporting, or production disruption requiring emergency fixes.

### Pitfall 1: Kitchen Simplification Destroys Per-Order Traceability

**What goes wrong:**
The current kitchen tracking is deeply per-order: `orderItemProduction` tracks exact `unitsRequired`/`unitsCompleted`/`unitsRemaining` per order item per ball type. `ballDistribution.ts` allocates produced balls to specific orders via `fetchEligibleOrdersWithItems()`. `orderItems` tracks `packageStatus` (empty/filling/filled/packed), `ballsFilled`, and `packedPackageIndices` per individual order item. Moving to aggregate production targets (e.g., "make 200 balls total today") without preserving this per-order linkage means: (a) you cannot determine which orders are fulfilled, (b) the `BeingPrepared -> AwaitingDelivery` status transition loses its trigger (currently driven by all items having `isProductionComplete = true`), and (c) the production log's `orderId`/`orderItemId` fields become meaningless.

**Why it happens:**
The phrase "simplify kitchen" suggests removing complexity. But the complexity exists for a reason: the business needs to know WHICH orders are ready to ship. If kitchen staff just "make 200 balls" without tracking which orders those balls fulfill, the order management system cannot advance orders through the pipeline. The Kanban board stalls at "BeingPrepared" because nothing triggers the transition to "AwaitingDelivery."

**Consequences:**
- Order pipeline freezes: all orders stuck in "BeingPrepared" with no automatic progression
- Customer-facing order status (WhatsApp receipts, order detail) shows permanently "Being Prepared"
- Manager cannot identify which specific orders are ready for dispatch
- Revenue recognition delayed because orders never reach "Complete"
- `productionLog` entries lose order attribution, breaking production-per-order analytics

**Prevention:**
1. **Keep the per-order tracking as the source of truth but simplify the UI.** The kitchen UI can show aggregate targets ("150 Original balls needed today") while the backend still allocates balls to specific orders via `ballDistribution.ts`. Staff enters "I made 20 balls" and the system auto-distributes them to pending orders -- this is exactly what the current `addBallsToTray` mutation does.
2. **Simplification should be in the UI layer only:** Replace the complex per-item checklist with a simpler "add balls" interface that shows aggregate progress. The existing `kitchenInventory` table already tracks aggregate counts per day.
3. **Never remove `orderItemProduction` records.** They are the bridge between "kitchen produced X balls" and "order Y is ready to ship."
4. **Test the transition chain:** After any kitchen UI change, verify: staff adds balls -> balls auto-allocate to orders -> order items mark `isProductionComplete` -> order advances to `AwaitingDelivery`.

**Detection:**
- Orders stuck in "BeingPrepared" for >24 hours with production counts showing sufficient output
- `orderItemProduction.unitsRemaining > 0` for orders where kitchen reports all balls are made
- `kitchenInventory` shows high ball counts but `orderItemProduction` shows nothing completed

---

### Pitfall 2: Consignment Revenue Triple-Counted Across Timing Layers

**What goes wrong:**
Consignment has three distinct revenue timing events: (1) **Production/Dispatch** -- product sent to outlet (cost incurred, no revenue yet), (2) **Sale** -- outlet sells to end customer (revenue recognized, cash not yet received), (3) **Cash Collection** -- outlet pays us (cash received). The existing order system recognizes revenue at `confirmedAt` (payment received for direct orders). If consignment orders use the same `orders` table with the same `confirmedAt` field, the revenue shows up at dispatch time (when order is "confirmed"), again when K3Mart reports a sale via `externalRevenue`, and potentially again when cash is collected. Three entries for the same economic event.

**Why it happens:**
The current `externalRevenue` table already tracks K3Mart sales (source: "k3mart", dataOrigin: "stock_delta"). If consignment orders are also created as regular `orders` with K3Mart as the channel, the same sale appears in both the internal orders revenue and the external K3Mart revenue. The `SalesAnalytics` page aggregates both sources, leading to double (or triple) counting.

**Consequences:**
- Sales reports show 2-3x actual revenue for consignment channels
- Margin analysis is meaningless (COGS correct but revenue inflated)
- Cash flow projections wildly inaccurate
- Tax reporting errors if reports are used for accounting

**Prevention:**
1. **Consignment dispatches are NOT orders.** Do not create entries in the `orders` table when sending product to K3Mart. The dispatch is tracked via `k3martDispatchPlans` (already exists). Revenue is recognized only when `externalRevenue` records arrive from K3Mart stock delta sync.
2. **Add an `orderType` field to distinguish direct vs consignment IF you must use the orders table:** `orderType: v.union(v.literal("direct"), v.literal("consignment"))`. Consignment orders have `paymentStatus: "Unpaid"` until the outlet reports the sale. Revenue recognition happens at sale, not dispatch.
3. **Exclude consignment dispatches from `getDailySalesSummary` and `SalesAnalytics`.** Only count them when the corresponding `externalRevenue` record with `dataOrigin: "stock_delta"` or `"api_revenue"` arrives.
4. **Create a dedicated `consignmentDispatches` table** that tracks: what was sent, to which outlet, when, and links to the corresponding `externalRevenue` records when sales are reported. This is cleaner than overloading the `orders` table.

**Detection:**
- Total revenue in SalesAnalytics exceeds sum of bank deposits + outstanding receivables
- Same product appears in both "Internal Orders" and "K3Mart" revenue for the same date
- K3Mart outlet revenue doubled after consignment flow was enabled

---

### Pitfall 3: Manual Sales Entry Creates Unreconcilable Data with API Sync

**What goes wrong:**
v1.2 adds manual sales entry for non-API platforms (Tamtem, Legato Goldfinch, Shopee, TikTok Shop) alongside existing API-synced data (GoBiz, K3Mart). If someone manually enters "Legato Goldfinch sold 5 Original today" and then the GoBiz sync also records GoFood sales from the Goldfinch outlet, the revenue is double-counted. Worse: if manual entry uses different product names ("Dubai Cookie" vs "Dubai Chewy Cookie - Regular Size" in GoBiz), the product mapping cannot detect the overlap. Over time, the `externalRevenue` table accumulates entries from both manual and API sources for the same outlet with no way to reconcile.

**Why it happens:**
The `externalRevenue` table uses `externalTransactionId` for dedup within the same source (e.g., two GoBiz syncs for the same order). But there is no cross-source dedup: a manual entry for Goldfinch has `source: "internal"` or a new source literal, while GoBiz sync has `source: "gobiz"`. The dedup key `by_source_txn` index only deduplicates within the same source.

**Consequences:**
- Revenue double-counted for outlets that have both manual entry and API sync
- No reliable way to reconcile: manual entries have no external transaction IDs to match against
- Over months, data drift becomes significant and undetectable without manual audit
- Manager loses trust in analytics ("the numbers don't match what K3Mart says")

**Prevention:**
1. **Clear channel ownership:** Each sales channel has exactly ONE data source. GoBiz outlets (Goldfinch, Crystal) get data ONLY from GoBiz sync, never manual entry. K3Mart outlets get data ONLY from K3Mart sync. Manual entry is ONLY for platforms with no API (Tamtem, Shopee, TikTok Shop).
2. **Enforce this in the UI:** The manual entry form should only show channels that are NOT API-synced. Grey out "GoFood Goldfinch" and "K3Mart" with tooltip "Data synced automatically via API."
3. **Add `dataSource` metadata to all revenue entries:** `dataSource: "api_auto" | "manual_entry" | "csv_upload"`. If both API and manual entries exist for the same outlet+date, surface a reconciliation warning.
4. **Implement a daily reconciliation check:** Compare manual entry totals vs API sync totals per outlet. Flag discrepancies >10% for manager review.

**Detection:**
- Same outlet has entries from multiple sources for the same date
- Revenue totals from app exceed outlet-reported totals
- `externalRevenue` entries with `dataOrigin: "manual_entry"` for outlets that also have `dataOrigin: "api_revenue"` or `"stock_delta"`

---

## Moderate Pitfalls

### Pitfall 4: Evolving K3Mart Cockpit to Multi-Channel Breaks Existing URLs, Names, and Queries

**What goes wrong:**
The K3Mart cockpit (K3MartCockpit.tsx, `convex/k3martCockpit/`) is deeply K3Mart-specific: table names (`k3martDispatchPlans`, `k3martStockMovements`), query names (`getOutletStockSummary` hardcodes `source: "k3mart"`), route path (`/k3mart-cockpit`), and component names all have "k3mart" baked in. Expanding to a "multi-channel dispatch planner" means either: (a) renaming everything (breaking existing bookmarks, stored data references, and muscle memory), or (b) keeping K3Mart names for a system that handles GoBiz depots and other outlets (confusing).

**Prevention:**
1. **Do NOT rename existing tables or routes.** The K3Mart cockpit stays as `/k3mart-cockpit` for K3Mart outlets. Create a NEW multi-channel dispatch view at a separate route (e.g., `/dispatch-planner`) that aggregates data from K3Mart cockpit + GoFood depot + any new channels.
2. **If you must generalize:** Add a `channel` parameter to cockpit queries rather than hardcoding `source: "k3mart"`. The `externalOutlets` table already has a `source` field that supports multiple values. But DO NOT change the table names.
3. **Keep backward compatibility:** Existing K3Mart dispatch plans use `k3martDispatchPlans` table. If you add GoFood depot dispatch plans, either use the same table with a `channel` field or create `gofoodDispatchPlans`. The former is cleaner but requires a migration to add the field to existing records.
4. **Route naming convention:** Use the feature name, not the channel name. `/dispatch-planner` not `/multi-channel-cockpit`. The K3Mart cockpit can redirect to the planner with `?channel=k3mart` pre-selected.

**Detection:**
- 404 errors when staff access bookmarked `/k3mart-cockpit` URL
- Queries return empty results because source filter changed
- Existing K3Mart data invisible in new "multi-channel" view

---

### Pitfall 5: Adding 3rd GoFood Outlet (Crystal) Breaks Existing Dual-Outlet Sync

**What goes wrong:**
The GoBiz sync currently handles 2 outlets via `GOBIZ_CONFIG.merchantIds: ["G293156297", "G347061572"]`. Adding a 3rd outlet seems like just appending to this array. But: (a) the `buildJournalSearchBody` passes ALL merchant IDs in a single API request -- if the API has a limit on merchant IDs per request, it silently drops one, (b) the `saveJournalTransactions` matches transactions to outlets via `outletMap` built from `externalOutlets` -- if the 3rd outlet is not seeded in `GOBIZ_OUTLET_SEED`, transactions are logged with warning and revenue is unattributed, (c) the `gofoodDepotStock` table tracks per-product stock at "Goldfinch depot" specifically -- a 3rd outlet needs its own depot stock tracking, (d) Phase C (auto-consume stickers) assumes all GoFood sales deduct from a single depot -- with multiple depots, which depot's stickers get consumed?

**Prevention:**
1. **Seed the outlet before enabling sync.** Add the new merchant to `GOBIZ_OUTLET_SEED` AND deploy before adding to `GOBIZ_CONFIG.merchantIds`. The outlet auto-seeder in `syncGoBizRevenue` runs first, so if both are deployed together it should work -- but test this explicitly.
2. **Verify the GoBiz journal API accepts 3+ merchant IDs.** Test manually with a curl request before coding. If limited to 2, split into parallel requests per merchant.
3. **Extend `gofoodDepotStock` to support multiple depots.** Currently it is a flat table keyed by `menuProductId` only. Add a `depotId` or `outletId` field to track per-depot stock separately. This is a schema migration that must happen BEFORE the 3rd outlet goes live.
4. **Phase C sticker deduction must be depot-aware.** When a GoFood sale happens at Crystal, stickers should be consumed from Crystal's stock, not Goldfinch's. This requires knowing which depot serves which outlet -- currently hardcoded in `gofoodDepot/mutations.ts`.

**Detection:**
- Revenue for new outlet shows `outletId: undefined` in `externalRevenue`
- `gofoodDepotStock` shows negative quantities unexpectedly (stickers consumed from wrong depot)
- Console warnings: "No registered outlet for merchant_id: Gxxxxxxxxx"

---

### Pitfall 6: Cross-Channel Analytics Comparing Apples to Oranges

**What goes wrong:**
Different channels report revenue differently: (a) GoBiz reports `revenueGross` (before commission) and `revenueNet` (after commission, what you receive), (b) K3Mart revenue from stock delta is inferred (`quantity * price`), with no commission tracking, (c) Direct orders have `finalTotal` (what customer pays) and `totalCost` (COGS). Combining these in a single analytics dashboard without normalizing creates misleading comparisons: "GoFood made Rp 5M" (gross) vs "K3Mart made Rp 3M" (net at retail price) vs "Direct made Rp 2M" (after discounts). Are we comparing gross? Net? After commission? The `externalRevenue` table has both `revenueGross` and `revenueNet` fields but they are optional and not consistently populated across sources.

**Prevention:**
1. **Define a standard revenue metric for cross-channel comparison.** Recommendation: "Net Revenue" = what Frollie actually receives after all platform commissions, discounts, and fees. For GoFood: `revenueNet` (merchant_share). For K3Mart: `quantity * price - commission` (need to add commission rate per outlet). For Direct: `finalTotal`.
2. **Per-channel commission rates must be stored in the system.** The deferred requirement SCH-02 mentions "Legato Goldfinch = 10%, Legato Tamtem = 17%". Add a `commissionRate` field to `externalOutlets` or `restockTargets`.
3. **Always show "Gross" and "Net" side by side in analytics.** Never show a single revenue number without indicating which metric it is.
4. **For K3Mart specifically:** The stock delta method infers sales from stock changes. If stock is moved between outlets (not sold), the delta incorrectly registers as a sale. Add a `movementType` filter: only `stock_out` without a corresponding `stock_in` at another outlet counts as a sale.

**Detection:**
- Analytics show one channel dramatically outperforming others when real-world experience says otherwise
- GoFood appears most profitable but after commission is actually least profitable
- Revenue totals from analytics don't match bank account deposits

---

### Pitfall 7: Consignment Commission Rates Silently Default to Zero

**What goes wrong:**
Consignment outlets take a commission (K3Mart, Legato Tamtem at 17%, Legato Goldfinch at 10%). If the commission rate is not configured when the outlet is set up, the system calculates net revenue as `grossRevenue - 0 = grossRevenue`, making consignment appear far more profitable than it is. This is especially dangerous because the `externalRevenue` table's `commission` field is `v.optional(v.number())` -- it defaults to `undefined`, which in calculations becomes `0`.

**Prevention:**
1. **Make commission rate a required field for consignment outlets.** Add `commissionRate: v.number()` to `externalOutlets` (or a new `outletConfig` table). Require it when `source` is not "internal".
2. **Validate on revenue record creation:** If `commission` is undefined or 0 for a non-internal source, log a warning and flag the record for review.
3. **Display "commission not configured" warning in analytics** when outlet has no commission rate rather than silently showing inflated margins.

**Detection:**
- Consignment margin analysis shows 80%+ margins (impossible for consignment)
- `externalRevenue` records for K3Mart with `commission: undefined` or `commission: 0`
- Net revenue equals gross revenue for consignment channels

---

## Minor Pitfalls

### Pitfall 8: Production Target Auto-Calculation Ignores Consignment Demand

**What goes wrong:**
The current `productionTargets` auto-calculation counts balls needed from confirmed orders (`orderItemProduction.unitsRemaining`). K3Mart demand appears as synthetic kitchen orders via `productionProductTargets` with `source: "consignment"`. If new consignment channels are added but their demand is not fed into `productionProductTargets`, kitchen targets underestimate production needs. Staff make enough for orders but not enough for consignment dispatches, leading to stock-outs at outlets.

**Prevention:**
1. **All consignment demand sources must feed into `productionProductTargets`.** When adding a new consignment channel, add a demand aggregation query that feeds the targets table.
2. **The kitchen dashboard summary should show demand breakdown:** "Orders: 80 balls, K3Mart: 50 balls, GoFood depot: 30 balls, TOTAL: 160 balls."
3. **Test with multiple demand sources active simultaneously.** Current system may only handle "consignment" + "gofood" sources. Verify the aggregation sums across all sources.

---

### Pitfall 9: Dispatch Plan Confirmation Timing Mismatch with Kitchen Schedule

**What goes wrong:**
K3Mart dispatch plans are confirmed in the cockpit and push synthetic demand to kitchen. But if the manager confirms a dispatch plan for "tomorrow" at 8 PM, and the kitchen team has already finished their shift at 6 PM, the demand appears in kitchen targets the next morning when it is already too late to produce. Kitchen staff sees "need 50 Original for K3Mart by 10 AM" at 8 AM with no time to produce.

**Prevention:**
1. **Add lead time to dispatch plan confirmation.** Plans for date D must be confirmed by D-1 at a configurable cutoff (e.g., 2 PM WIB). After cutoff, confirmation for D is blocked with message "Too late -- confirm for D+1 instead."
2. **Show unconfirmed demand separately in kitchen:** "Pending demand (not yet confirmed): 50 Original." This gives kitchen a heads-up even before formal confirmation.

---

### Pitfall 10: Schema Migration for New Tables Breaks Existing Convex Deploy

**What goes wrong:**
Adding new tables (`consignmentDispatches`, generalizing `gofoodDepotStock` with new fields) requires schema changes in `convex/schema.ts`. Convex schema changes are validated at deploy time. If a new required field is added to an existing table that already has data (e.g., adding `channel: v.string()` to `k3martDispatchPlans`), the deploy fails because existing rows lack the field. The error is cryptic and blocks all deploys until resolved.

**Prevention:**
1. **Always add new fields as `v.optional()` first.** Deploy. Then backfill via migration mutation. Then optionally make required in a later deploy.
2. **New tables are safe** -- they can have required fields since no existing data conflicts.
3. **Test schema changes against production data** by running `npm run deploy:check` (dry run) before actual deploy.
4. **For table generalizations (e.g., renaming k3mart-specific tables):** Do NOT rename. Create new generalized tables, migrate data, update queries to read from new tables, then mark old tables as deprecated.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Kitchen simplification | Destroying per-order traceability (Pitfall 1) | Simplify UI only, keep `orderItemProduction` as backend source of truth |
| Consignment revenue workflow | Triple-counting across dispatch/sale/cash (Pitfall 2) | Consignment dispatches are NOT orders; revenue recognized only at outlet sale |
| Manual sales entry | Unreconcilable data with API sync (Pitfall 3) | Enforce channel ownership: each outlet has exactly one data source |
| Multi-channel cockpit | Breaking existing K3Mart URLs and queries (Pitfall 4) | Do NOT rename existing tables/routes; create new generalized view |
| 3rd GoFood outlet | Breaking dual-outlet sync assumptions (Pitfall 5) | Seed outlet before enabling sync; extend `gofoodDepotStock` to multi-depot |
| Cross-channel analytics | Comparing gross vs net vs after-discount (Pitfall 6) | Standardize on "Net Revenue" metric; require commission rates per outlet |
| Commission configuration | Silent zero-commission defaults (Pitfall 7) | Make commission rate required for non-internal outlets |
| Production targets | Ignoring consignment demand sources (Pitfall 8) | All demand sources feed into `productionProductTargets` |
| Dispatch planning | Kitchen sees demand too late (Pitfall 9) | Add confirmation cutoff time; show pending demand separately |
| Schema migration | Required fields on existing tables break deploy (Pitfall 10) | Always `v.optional()` first, backfill, then make required |

## Integration Pitfalls Specific to v1.2

| Integration Point | Mistake | Correct Approach |
|-------------------|---------|------------------|
| Consignment + Orders table | Creating orders for consignment dispatches | Use `k3martDispatchPlans` or new `consignmentDispatches` table; orders table is for DIRECT sales only |
| Manual entry + GoBiz sync | Allowing manual entry for GoFood outlets | UI blocks manual entry for API-synced outlets; grey out with explanation |
| Multi-depot sticker tracking | Consuming stickers from single global pool | Track stickers per depot via `gofoodDepotStock` with `outletId` field |
| Kitchen targets + multiple demand sources | Only counting `orders` table for targets | Aggregate from: active orders + K3Mart dispatch + GoFood depot needs + any new consignment channels |
| Analytics + mixed revenue sources | Summing `revenueGross` from some sources and `finalTotal` from others | Normalize all to "Net Revenue" (after commission/fees) before aggregation |
| New outlet + existing product mappings | Assuming same products map identically at new outlet | Each outlet may have different product names/codes in external systems; create per-outlet mappings |

## Existing Technical Debt That Amplifies v1.2 Risks

These pre-existing issues from v1.1 become more dangerous with v1.2 features:

| Debt Item | v1.1 Impact | v1.2 Amplification |
|-----------|-------------|---------------------|
| Duplicate sync logic in `syncGoBizRevenue` vs `autoSyncGoBizRevenue` (200+ lines) | Bugs fixed in one not the other | 3rd outlet requires changes in BOTH copies; high risk of inconsistency |
| Hardcoded merchant IDs in `GOBIZ_CONFIG` | Works for 2 outlets | Adding/removing outlets requires code change + deploy; should be DB-configurable |
| `gofoodDepotStock` has no `outletId` | Implicitly "Goldfinch only" | Cannot track per-depot stock for Crystal or future outlets |
| `productionProductTargets.source` is `v.string()` not union | Any string accepted | New consignment channels could use inconsistent source names |
| No cross-source dedup in `externalRevenue` | Each source dedupes independently | Manual entry + API sync for same outlet creates invisible duplicates |
| WIB timezone implementations scattered across 5+ files | Occasional off-by-one day bugs | More date-dependent features (dispatch planning, analytics date ranges) multiply the bug surface |

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Consignment revenue double-counted | HIGH | Must identify all affected `externalRevenue` entries, determine which are "real" (outlet sale) vs "phantom" (dispatch), delete phantoms, recalculate all analytics for affected period |
| Kitchen traceability destroyed | CRITICAL | If `orderItemProduction` records were deleted or stopped being created, must reconstruct from `productionLog` entries (which have `orderId`). If `productionLog` also lost order linkage, recovery is manual order-by-order |
| Manual+API double entries | MEDIUM | Query for overlapping outlet+date+product across sources. Deduplicate manually. Establish channel ownership rules. Prevent future occurrences. |
| 3rd outlet unattributed revenue | LOW | Run `syncGoBizRevenue` after seeding outlet. Existing dedup keys prevent duplicates; unattributed records get `outletId: undefined` which can be retroactively fixed |
| Commission rates missing | LOW | Backfill `commissionRate` on all outlets. Recalculate net revenue for affected `externalRevenue` records. Fix analytics queries to use commission. |
| Schema migration failure | LOW | Revert `convex/schema.ts` change. Deploy. Fix field to `v.optional()`. Deploy again. |

## Sources

- Codebase analysis: `convex/schema.ts` (59 tables), `convex/orders/helpers/ballDistribution.ts`, `convex/orders/helpers/statusTransitions.ts`, `convex/k3martCockpit/queries.ts`, `convex/integrations/gobiz/adapter.ts`, `convex/integrations/gobiz/config.ts`, `convex/integrations/registry.ts`, `convex/crons.ts`, `convex/reports/dailySales.ts` -- HIGH confidence (direct code review)
- Production tracking data model: `orderItemProduction`, `productionLog`, `productionTargets`, `productionProductTargets`, `productionCounts`, `kitchenInventory` tables -- HIGH confidence (schema analysis)
- External integration model: `externalRevenue`, `externalOutlets`, `externalProductMappings`, `externalSyncLogs`, `gofoodDepotStock` tables -- HIGH confidence (schema analysis)
- K3Mart dispatch model: `k3martDispatchPlans`, `k3martStockMovements`, `restockTargets` tables -- HIGH confidence (schema analysis)
- v1.2 deferred requirements: `.planning/milestones/v1.1-REQUIREMENTS.md` (ORD-D02, SCH-01, SCH-02, KIF-01) -- HIGH confidence (requirements doc)
- GoBiz API configuration: `convex/integrations/gobiz/config.ts` (merchant IDs, API endpoints) -- HIGH confidence (direct code review)

---
*Pitfalls research for: v1.2 Multi-Channel Expansion*
*Researched: 2026-02-16*
