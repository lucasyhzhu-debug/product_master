# Feature Research

**Domain:** Multi-channel Sales Integration — GrabFood POS API + BigSeller Marketplace Analytics + Consignment Upload + Unified Analytics (Indonesian FMCG Snack Producer)
**Milestone:** v1.4 — Sales & Channel Integration
**Researched:** 2026-02-25
**Confidence:** HIGH — API docs are first-party official references; consignment patterns are well-documented; existing system architecture is deeply understood.

---

## Scope

This document covers four feature clusters for milestone v1.4 only:

- **GrabFood POS** — OAuth2 client credentials auth, order history pull (read-only), menu item availability toggles, outlet pause/unpause, store status monitoring
- **BigSeller** — Shopee + Tokopedia profit data sync (async two-phase), daily aggregates + per-order rows, SKU-to-menuProduct mapping
- **Consignment upload** — Manual Excel upload for consignment POS data (bulk summary + transaction detail formats), pre-formatted template download
- **Analytics revamp** — Unified multi-channel Sales Analytics with all channels (GoFood × 3, K3Mart, Direct, GrabFood, BigSeller/Shopee, BigSeller/Tokopedia, Consignment) in one view

**Already built (do not re-research or re-architect):**
- GoFood transaction sync via GoBiz API (3 outlets: Crystal, Goldfinch, Tamtem) — `externalRevenue` table, `platformCredentials`, cron refresh
- K3Mart cockpit, per-outlet product mappings, stock alerts, restock suggestions
- Unified dispatch planner, finished goods inventory, kitchen production targets
- Sales Analytics (Recharts stacked charts, PlatformFilter pattern, period presets)
- `externalRevenue` table with `dataOrigin` field — the existing landing table for external revenue
- `productMappings` table for cross-channel product name normalization

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing any of these = the feature is not shippable.

#### GrabFood POS Integration

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| OAuth2 client credentials token fetch + caching | GrabFood API requires Bearer token per call; without caching, every call is 2x slower and violates API rules | LOW | Store token + expiry in `platformCredentials` table; existing cron pattern fits. Token TTL is 3600s; only refresh after expiry. |
| Pull GrabFood order history (`GET /partner/v1/orders`) | Managers need order data without opening GrabFood Merchant portal | MEDIUM | Paginated API (`more: true` = fetch next page). Store in new `grabfoodOrders` table. Merchant ID per outlet needed. |
| GrabFood revenue visible in Sales Analytics | The whole point of integration is unified revenue visibility; hiding it in a separate page defeats the purpose | MEDIUM | Map `OrderPrice.eaterPayment` (or `subtotal`) → `externalRevenue` rows, one per outlet |
| Outlet pause/unpause (`PUT /partner/v1/merchant/pause`) | When kitchen runs out of stock, manager needs to stop new orders arriving — currently requires opening GrabFood Merchant app | LOW | Button + duration selector (30, 60, 120 min) + unpause (duration=0). Per-outlet. |
| Store status display (`GET /partner/v1/merchants/{id}/store/status`) | Manager needs to know at a glance whether each outlet is OPEN/CLOSED/PAUSED without logging into GrabFood | LOW | Show status badge per outlet; surface `pauseUntil` countdown when PAUSED |
| Menu item availability toggle (batch, `PUT /partner/v1/batch/menu`) | When an item runs out mid-day, manager needs to mark it unavailable on GrabFood to prevent more orders | MEDIUM | Per-item AVAILABLE/UNAVAILABLE toggle synced to GrabFood; requires mapping internal `menuProducts` to GrabFood item IDs |
| Credential storage for GrabFood client_id / client_secret | Integration cannot function without storing partner credentials securely per outlet | LOW | Extend existing `platformCredentials` table; add `grabfoodClientId` + `grabfoodClientSecret` fields |

#### BigSeller Profit Analytics

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Trigger sync + poll for completion | BigSeller API is async — data is only available after sync task completes (~1–10 min). Users cannot see data without this step. | MEDIUM | `POST sync/task/create.json` then poll `GET sync/task/detail/new/get.json` every 60s until `taskStatus = "complete"`. One sync at a time (API enforces). |
| Daily aggregated profit data (`listStatsData`) | Managers want to see "how much did Shopee/Tokopedia make this week" as a chart — this is the primary BigSeller value | MEDIUM | Store as daily aggregates in new `bigsellerDailyStats` table. Map `platformIncome` → revenue for analytics. |
| Per-order row data (`pageList`) with SKU breakdown | Managers want to verify individual orders and see which products sold | MEDIUM | Store in `bigsellerOrders` table. `skuVoList` provides SKU codes mapping to `menuProducts`. Paginate through all pages. |
| Shop-level breakdown (Frollie-S vs Frollie-T) | Shopee and Tokopedia are separate shops with separate performance; managers track them independently | LOW | `shopId` field on each row differentiates shops. Filter UI by shop. |
| Sync status visibility | Users need to know if a sync is running, when it last ran, and whether it succeeded | LOW | Store last sync metadata (start/end date, status, timestamp) in `platformCredentials` or a config table |
| muc_token session cookie storage | BigSeller uses JWT session cookie (30-day TTL); without storing this, every session requires manual re-auth | LOW | Store in `platformCredentials` table; surface expiry warning when < 7 days remaining |

#### Consignment Upload

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Excel file upload (browse + drag-drop) | Outlets send Excel files; any other format creates friction for non-technical outlet staff | LOW | Accept .xlsx; ExcelJS for parsing (browser-side) |
| Outlet selector before upload | Multiple consignment outlets; data must be tagged correctly | LOW | Dropdown of known consignment outlet names |
| Row preview table before committing | Upload without preview causes silent bad data ingestion; industry-standard pattern | MEDIUM | Show first 20 rows parsed, highlight detected columns, surface errors per cell |
| Per-row validation errors with row numbers | "Import failed" with no specifics is unusable | MEDIUM | Show row N + column name + error type (missing, wrong type, implausible value) |
| Duplicate upload detection with warning | Re-uploading the same period doubles data silently | MEDIUM | Match on (outlet + period start + period end); warn before allowing override |
| Upload history / audit log | Admin must know what was uploaded when and by whom | LOW | Table: timestamp, outlet, format, row count, uploader |
| Delete upload with confirmation | Mistakes happen; admin must be able to remove bad uploads and re-upload | LOW | Soft-delete or hard-delete with cascade |
| Downloadable pre-formatted Excel template | Blank Excel → wrong column names every time; template eliminates the problem at the root | LOW | .xlsx with headers, data types, example row — generated client-side with ExcelJS |
| Consignment visible in Sales Analytics charts | Uploading without seeing the data in context provides no value | MEDIUM | Additive change to existing analytics charts; new "consignment" channel |

#### Unified Sales Analytics

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| All channels in one view | Managers split time between GoFood portal, GrabFood portal, BigSeller dashboard, and internal system — unified view is the core value proposition | HIGH | Merge GoFood × 3, GrabFood (new), BigSeller Shopee + Tokopedia (new), K3Mart, Direct, Consignment into single Recharts view |
| Per-channel revenue breakdown (stacked bar) | Managers want to know which platform generates the most revenue | MEDIUM | Existing `SalesChart.tsx` stacked bar pattern; add new data keys for GrabFood + BigSeller channels |
| Period presets (today, this week, this month, custom range) | Already in the system; must work with new channel data | LOW | Extend existing query to include new tables |
| Channel filter (show/hide platforms) | Existing `PlatformFilter` pattern; must extend to new platforms | LOW | Add `"grabfood"`, `"shopee"`, `"tokopedia"`, `"consignment"` to existing filter type |
| Lifetime totals — headline units counter | Managers frequently ask "how many units have we sold ever?" | LOW | Single stat card; cross-table aggregation |
| Lifetime per-product breakdown table | Counter alone is not actionable; product-level breakdown shows product mix | LOW | Table: product, GoFood, GrabFood, Shopee, Tokopedia, K3Mart, Direct, Consignment, Total |

---

### Differentiators (Competitive Advantage)

Features that set this system apart from managers using multiple separate portals.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| One-click GrabFood outlet pause from internal system | Eliminates context-switching to GrabFood Merchant app during kitchen emergencies | LOW | Direct API call; saves critical minutes when kitchen runs out of product |
| GrabFood menu sync status tracking (`Trace Menu Sync`) | Managers know whether an availability change propagated to the GrabFood app — prevents selling unavailable items | LOW | Poll `GET /partner/v1/merchant/menu/trace` after each batch update; surface SUCCESS/FAILED status |
| BigSeller period-over-period comparison (built-in) | `orderProfitCycleComparisonMap` in API response provides prior-period comparison with no extra work | LOW | Surface `growthRatio` from API directly in analytics UI; "--" means no prior data |
| Net revenue vs gross revenue clarity | BigSeller distinguishes `platformIncome` (net after platform fees) from `saleAmount` (gross); showing both prevents confusion about actual earnings | LOW | Display both in tooltip/detail; primary metric is `platformIncome` |
| SKU-to-menuProduct auto-mapping | BigSeller `skuVoList` uses SKU codes (e.g., `FRO-DubChe-Reg1`) that can be matched to `menuProducts` for unified reporting | MEDIUM | Extend `productMappings` table with a `bigseller` platform value; admin can confirm/correct matches |
| Consignment net units auto-calculated on upload | Returns are a real consignment reality; `qtyNet = qtySold - qtyReturned` computed at parse time | LOW | Derived field; display net in analytics |
| Sync health dashboard (all channels) | Existing sync health for GoFood + K3Mart extended to include GrabFood and BigSeller; one place to see all integration status | LOW | Extend existing dashboard sync health alerts |
| Lifetime sales by channel — channel strategy tool | "GoFood is 60% of lifetime revenue" is a strategic insight managers don't currently have | LOW | Pure aggregation from existing data; no new collection needed |

---

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time GrabFood order acceptance (webhook + auto-accept) | POS integration promise — accept orders without touching GrabFood app | Requires Grab Facilitator Model partnership + webhook HTTPS endpoint + sub-second response time; explicit out-of-scope in PROJECT.md: "Full GoFood POS integration (accept orders) — Requires GoFood Facilitator Model partnership; massive scope" | Pull order history via `GET /partner/v1/orders` for historical data only |
| GrabFood order management UI (accept/reject/cancel) | Seems natural to manage GrabFood orders from internal system | Requires live webhook infra, real-time latency guarantees, and Facilitator Model; creates support risk if orders auto-rejected | Use GrabFood Merchant app for live order management; system is for analytics and store control only |
| BigSeller inventory sync (stock push to Shopee/Tokopedia) | Obvious extension of the analytics integration | BigSeller inventory API scope is separate; `costFee` is currently 0 for all Frollie SKUs (COGS not entered in BigSeller); premature | Set up COGS in BigSeller first; inventory sync is v1.5+ when costFee has real data |
| Automated settlement reconciliation (match BigSeller revenue to bank statements) | Finance team wants automated reconciliation | Out of scope per PROJECT.md decision; requires bank API or statement upload; BigSeller `platformIncome` is sufficient for revenue tracking | Show `platformIncome` + fee breakdown; accountant reconciles to bank statement manually |
| GrabFood campaign management UI | Campaign CRUD via API looks easy | Campaigns require GrabFood merchant manager approval; API returns 403 without the correct scope; managing campaigns without understanding GrabFood's approval rules creates failed syncs | View campaigns (read-only) if needed; creation stays in GrabFood Merchant portal |
| GrabFood dine-in voucher system | API exposes voucher read/redeem | Frollie outlets are delivery-only; no dine-in service | Exclude voucher/dine-in endpoints entirely |
| BigSeller daily cron auto-sync (no user trigger) | "Just sync automatically every day" | BigSeller sync takes ~8 minutes for 19 orders; a daily cron at 23:00 risks running into manual syncs; one-sync-at-a-time constraint means blocking | Provide a "Sync Now" button + last-synced-at display; run cron only during a known quiet window (e.g., 02:00 WIB) with conflict detection |
| Per-unit consignment serialization | Traceability sounds good | Batch tracking is sufficient for Rp 40–120k snack product per PROJECT.md; serial tracking adds no real value at this scale | Track at qty-per-upload-row level |
| Full double-entry accounting for any channel | Finance requests accounting integration | Production system, not accounting system; massive scope | Export revenue summaries for accountant; system tracks units and gross revenue |
| GrabFood operating hours management | API supports it | Frollie operates standard hours from GrabFood portal; hour overrides are rare enough that direct portal access is faster than building UI | Defer to v1.5 if requested; use GrabFood portal in the meantime |
| Consignment inventory deduction from productInventory | Consignment sales "use up" inventory | Consignment is a separate domain; productInventory tracks finished-goods stock for internal/GoFood channels; mixing channels corrupts FIFO | Track consignment sales units and revenue only; do not touch productInventory table |

---

## Feature Dependencies

```
GrabFood auth (client_credentials token)
    └──required by──> GrabFood order pull
    └──required by──> GrabFood store status/pause
    └──required by──> GrabFood menu availability toggle

GrabFood order pull
    └──required by──> GrabFood revenue in Sales Analytics
    └──enhances──> Unified Analytics (adds GrabFood channel)

GrabFood menu availability toggle
    └──requires──> GrabFood item ID mapping (internal menuProducts → grabItemID)
    └──enhances──> Finished goods inventory (toggle when stock hits zero)

BigSeller muc_token storage
    └──required by──> BigSeller sync trigger
    └──required by──> BigSeller poll + data query

BigSeller sync trigger + poll
    └──required by──> BigSeller daily stats data
    └──required by──> BigSeller per-order data

BigSeller daily stats
    └──required by──> BigSeller channels in Sales Analytics charts

BigSeller per-order data (skuVoList)
    └──required by──> SKU-to-menuProduct mapping (Shopee + Tokopedia)
    └──enhances──> Lifetime sales per product table

Consignment schema (consignmentUploads + consignmentSales tables)
    └──required by──> Consignment upload UI
    └──required by──> Consignment channel in Sales Analytics

productMappings table (already exists)
    └──required by──> BigSeller SKU mapping
    └──required by──> Consignment product name normalization
    └──required by──> Lifetime totals per product (correct attribution)

All channel data (GoFood existing + GrabFood new + BigSeller new + Consignment new)
    └──required by──> Unified Sales Analytics view
    └──required by──> Lifetime totals cross-channel aggregation
```

### Dependency Notes

- **GrabFood auth requires merchant-scoped credentials per outlet:** Each outlet (Crystal, Goldfinch, Tamtem) may have separate GrabFood merchant IDs. Credential storage must be per-outlet. Verify whether all 3 outlets share one client_id/client_secret or each needs separate credentials.
- **BigSeller sync blocks analytics queries:** The API returns `code: -1` for data queries while a sync is running. UI must gate analytics display on `taskStatus = "complete"`. Show loading state during sync (~8 min observed).
- **BigSeller 31-day max range blocks historical backfill:** Any initial data load covering > 31 days requires multiple sequential sync tasks. Implement incremental sync from last stored `endDate`.
- **GrabFood menu toggle requires grabItemID:** The `PUT /partner/v1/batch/menu` endpoint requires GrabFood's internal item IDs, not the merchant's external IDs (unless `isExternalItemID: true`). First-time setup requires pulling the menu from GrabFood or using external IDs from the platform portal.
- **Consignment normalization depends on productMappings:** Raw Excel product names from outlets (e.g., "Donat Keju Reguler") must be mapped to `menuProductId` via `productMappings`. If productMappings has no "consignment" platform entries, lifetime table shows unmapped products as a catch-all bucket.

---

## Data Model — New Tables Needed

### `grabfoodOrders`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| grabOrderId | string | yes | GrabFood's native order ID — deduplication key |
| shortOrderNumber | string | yes | Short daily-unique number per merchant |
| merchantId | string | yes | GrabFood merchant ID (ties to outlet) |
| outletId | Id<"gofoodDepots"> | no | Link to internal outlet record if mapped |
| orderTime | number | yes | Epoch ms from ISO 8601 `orderTime` |
| orderState | string | yes | Current order state from API |
| subtotal | number | yes | `OrderPrice.subtotal` in IDR (minor unit = IDR, no conversion needed) |
| eaterPayment | number | no | Total paid by customer |
| merchantFundPromo | number | no | Merchant-funded promo deduction |
| paymentType | string | yes | Payment method |
| syncedAt | number | yes | When this row was pulled from API |

### `grabfoodMenuMappings`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| merchantId | string | yes | GrabFood merchant ID |
| menuProductId | Id<"menuProducts"> | yes | Internal product |
| grabItemId | string | yes | GrabFood's item ID — used in batch/menu calls |
| externalItemId | string | no | Merchant's own item ID in GrabFood system |
| availableStatus | string | yes | Last known status: "AVAILABLE" or "UNAVAILABLE" |
| lastSyncedAt | number | yes | When this status was last pushed to GrabFood |

### `bigsellerOrders`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| platformOrderId | string | yes | Native platform order ID — deduplication key |
| shopId | number | yes | BigSeller shop ID (5090946=Shopee, 5092855=Tokopedia) |
| shopName | string | yes | Human-readable shop name |
| platform | string | yes | "shopee", "tokopedia" |
| orderState | string | yes | "new", "shipped", "completed", "canceled" |
| orderTimeMs | number | yes | Unix ms |
| saleAmount | number | yes | Gross product price (IDR) |
| platformIncome | number | yes | Net received from platform (IDR) |
| commissionFee | number | yes | Platform commission — negative value = cost |
| sellerShippingFee | number | yes | Seller shipping subsidy — negative = cost |
| otherFee | number | yes | Misc platform fees — negative = cost |
| profit | number | yes | platformIncome - costFee + sellerShippingFee |
| syncedAt | number | yes | When this row was pulled from API |
| skuList | string | yes | JSON stringified skuVoList for SKU breakdown |

### `bigsellerDailyStats`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| statDate | string | yes | YYYY-MM-DD |
| saleAmount | number | yes | Daily gross revenue |
| platformIncome | number | yes | Daily net revenue |
| profit | number | yes | Daily profit (costFee currently 0) |
| profitMargin | number | yes | As ratio (0.9919 = 99.19%) |
| discountFee | number | yes | Daily discounts applied |
| syncRangeStart | string | yes | Sync task startTime for traceability |
| syncRangeEnd | string | yes | Sync task endTime for traceability |

### `consignmentUploads` (audit log)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| outletName | string | yes | "Legato Goldfinch", etc. |
| uploadFormat | string | yes | "bulk_summary" or "transaction_detail" |
| uploadedAt | number | yes | Epoch ms |
| uploadedBy | string | yes | User display name from session token |
| rowCount | number | yes | Successfully imported rows |
| periodStart | string | yes | YYYY-MM-DD — earliest sale date in upload |
| periodEnd | string | yes | YYYY-MM-DD — latest sale date in upload |
| notes | string | no | Admin free-text note |
| isDeleted | boolean | no | Soft-delete flag |

### `consignmentSales` (line items)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| uploadId | Id<"consignmentUploads"> | yes | Parent upload |
| outletName | string | yes | Denormalized for query performance |
| productName | string | yes | Raw name from Excel |
| menuProductId | Id<"menuProducts"> | no | Resolved via productMappings; null if unmapped |
| saleDate | string | yes | YYYY-MM-DD |
| qtySold | number | yes | Units sold |
| qtyReturned | number | yes | Units returned (default 0) |
| qtyNet | number | yes | qtySold − qtyReturned (computed on insert) |
| revenueGross | number | yes | Total gross revenue IDR |
| transactionId | string | no | Detail format only; null for bulk summary |

---

## MVP Definition

### Launch With (v1.4 target)

- [x] GrabFood OAuth2 token management (fetch + cache per outlet)
- [x] GrabFood order history pull + storage (read-only, no order management)
- [x] GrabFood outlet store status display (OPEN/CLOSED/PAUSED per outlet)
- [x] GrabFood outlet pause/unpause control
- [x] GrabFood menu item availability toggle (batch, by grabItemID)
- [x] BigSeller muc_token storage + expiry warning
- [x] BigSeller sync trigger + poll until complete
- [x] BigSeller daily stats storage (`listStatsData`) and revenue in analytics
- [x] BigSeller per-order data storage (`pageList`) with SKU breakdown
- [x] Consignment Excel upload (bulk summary + transaction detail formats)
- [x] Consignment template download
- [x] Consignment upload history + delete
- [x] Unified Sales Analytics: all channels in one view (GrabFood + Shopee + Tokopedia + Consignment added to existing)
- [x] Lifetime units sold counter + per-product breakdown

### Add After Validation (v1.4.x)

- [ ] GrabFood menu sync status tracking (trace job result) — add after item toggle works
- [ ] BigSeller per-shop breakdown in analytics (filter by Shopee vs Tokopedia) — add after base chart works
- [ ] Consignment period gap indicator per outlet — add after upload history is stable
- [ ] BigSeller SKU-to-menuProduct mapping admin UI — add after SKU data flows correctly

### Future Consideration (v1.5+)

- [ ] GrabFood operating hours management — defer; use GrabFood portal
- [ ] BigSeller inventory sync (stock push to Shopee/Tokopedia) — defer until COGS is configured in BigSeller
- [ ] GrabFood campaign read-only view — defer; low operational value
- [ ] Automated daily BigSeller cron (currently manual trigger) — defer; 8-min sync + one-at-a-time constraint requires careful scheduling

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| GrabFood store status + pause/unpause | HIGH — emergency kitchen control | LOW — 2 API calls | P1 |
| GrabFood order pull for analytics | HIGH — revenue data in unified view | MEDIUM — paginated pull + storage | P1 |
| BigSeller sync + daily stats | HIGH — Shopee/Tokopedia revenue in analytics | MEDIUM — async two-phase API | P1 |
| Unified Sales Analytics (all channels) | HIGH — replaces 4 separate portals | MEDIUM — extend existing charts | P1 |
| Consignment upload + template | HIGH — unblocks consignment revenue tracking | MEDIUM — ExcelJS + validation UX | P1 |
| GrabFood menu availability toggle | HIGH — prevents overselling OOS items | MEDIUM — requires grabItemID mapping setup | P1 |
| Lifetime totals dashboard | MEDIUM — strategic insight | LOW — aggregation query | P2 |
| GrabFood token management (auto-refresh) | HIGH — without it nothing works | LOW — extend existing cron pattern | P1 |
| BigSeller per-order data (pageList) | MEDIUM — order-level detail | MEDIUM — pagination required | P2 |
| BigSeller muc_token storage + expiry | HIGH — prerequisite for all BigSeller | LOW | P1 |
| Consignment upload history + delete | MEDIUM — admin housekeeping | LOW | P2 |
| BigSeller period-over-period comparison | LOW — nice analytical feature | LOW — API provides it free | P3 |
| GrabFood menu sync trace | LOW — operational detail | LOW | P3 |

---

## Competitor Feature Analysis

This is an internal operational tool, not a product competing in a market. The "competitors" are the separate portals this system replaces.

| Feature | GrabFood Merchant Portal | BigSeller Dashboard | Our Internal System |
|---------|-------------------------|--------------------|--------------------|
| Store pause/unpause | Yes — but requires opening separate app | N/A | Yes — one click from ops system |
| Menu availability toggle | Yes — manual per-item | N/A | Yes — batch from internal product list |
| Revenue analytics | GoFood only | Shopee + Tokopedia only | All channels unified |
| Historical order data | 90-day limit, no export | 31-day sync, export available | Stored permanently in Convex |
| Product-level sales breakdown | Limited | SKU-level | Mapped to internal menuProducts |
| Cross-channel comparison | No | No | Yes — core value |
| Kitchen integration | No | No | Yes — feeds production targets |

---

## Implementation Notes by Feature Cluster

### GrabFood POS Integration

**Auth pattern:** Use existing `platformCredentials` table. Add `grabfoodClientId`, `grabfoodClientSecret`, `grabfoodAccessToken`, `grabfoodTokenExpiresAt` fields. A Convex action fetches a new token when `expiresAt < now`. GrabFood token TTL is 3600s (1 hour) — shorter than GoFood's refresh cycle, so a more frequent check is needed. Existing 30-min cron can handle this.

**Order pull strategy:** Pull last 7 days on first sync; then incremental from last stored `orderTime`. The `GET /partner/v1/orders` endpoint is paginated (`more: true` = next page). All 3 outlets (Crystal, Goldfinch, Tamtem) have their own `merchantID` — pull is per-outlet.

**Menu availability:** `PUT /partner/v1/batch/menu` with `field: "AVAILABILITY"` is the right endpoint — more efficient than per-item calls. Requires GrabFood `grabItemID` values. Initial setup: import `grabItemID` values manually from GrabFood portal or via API item listing if available. Store in `grabfoodMenuMappings` table.

**Critical timing:** After calling batch/menu, must call `POST /partner/v1/merchant/menu/notification` to trigger GrabFood re-sync. Poll `GET /partner/v1/merchant/menu/trace` with the returned job-ID to confirm. Show sync status in UI.

### BigSeller Profit Analytics

**Auth pattern:** BigSeller uses JWT session cookie (`muc_token`) — not a proper API key. Token is 30-day TTL, refreshed on each API call. Store in `platformCredentials`. Surface expiry warning in UI when < 7 days remain. User must manually re-authenticate by pasting a new cookie.

**Sync strategy:** Never trigger a sync if one is already running (`code: -1` error). Before triggering, poll `sync/task/detail/new/get.json` to check if `taskStatus = "progress"`. Use incremental ranges: store last synced `endTime` in config; next sync covers `(lastEndTime + 1 day)` to today. Max 31-day range enforced by API.

**Data storage:** `listStatsData` provides daily aggregates — store as `bigsellerDailyStats`. `pageList` provides per-order rows — store as `bigsellerOrders`. Both must be upserted by `platformOrderId` (orders) and `(shopId, statDate)` (daily stats) for idempotency.

**Important:** `costFee = 0` for all Frollie orders because COGS is not entered in BigSeller. `profit` therefore equals `platformIncome`. Gross profit margin is meaningless until COGS is configured. Show `platformIncome` as revenue in analytics; flag that COGS is not configured.

### Consignment Upload

**ExcelJS for both parse and template generation.** Browser-side parsing keeps Convex mutations simple (receive validated JSON rows, not raw bytes). Template generation: generate in-browser with ExcelJS + `URL.createObjectURL(blob)` + `<a>` click — no backend needed.

**Upload UX flow:**
1. Select outlet (dropdown)
2. Drag-drop or browse .xlsx
3. Auto-detect format (bulk vs detail — presence of `transactionId` column)
4. Preview table (first 20 rows; errors highlighted per cell)
5. Validation summary ("18 rows OK, 2 rows have errors")
6. Duplicate warning if (outlet + period start + period end) matches existing
7. Confirm → Convex mutation → success toast + row count
8. Upload appears in history

**Format detection:** Check for presence of a `transactionId` or `Transaction ID` column header. If present → transaction detail format. If absent → bulk summary format. Fall back to manual selection if ambiguous.

### Unified Sales Analytics

**Channel mapping for analytics:**

| Channel | Data Source | Table | Platform Key |
|---------|-------------|-------|-------------|
| GoFood (Crystal) | GoBiz API (existing) | externalRevenue | "gobiz_crystal" |
| GoFood (Goldfinch) | GoBiz API (existing) | externalRevenue | "gobiz_goldfinch" |
| GoFood (Tamtem) | GoBiz API (existing) | externalRevenue | "gobiz_tamtem" |
| GrabFood | GrabFood POS API (new) | grabfoodOrders | "grabfood" |
| Shopee | BigSeller (new) | bigsellerDailyStats | "shopee" |
| Tokopedia | BigSeller (new) | bigsellerDailyStats | "tokopedia" |
| K3Mart | K3Mart cockpit (existing) | externalRevenue | "k3mart" |
| Direct | Internal orders (existing) | orders + orderItems | "direct" |
| Consignment | Excel upload (new) | consignmentSales | "consignment" |

**PlatformFilter extension:** Existing type `"all" | "k3mart" | "gobiz" | "internal"` becomes `"all" | "gobiz" | "grabfood" | "shopee" | "tokopedia" | "k3mart" | "direct" | "consignment"`. The UI filter UI must accommodate 8+ platform options — consider a checkbox multi-select rather than radio buttons.

**Recharts color assignments:** Existing teal/blue/green used by GoFood channels. Assign distinct colors for new channels: GrabFood (green-600), Shopee (orange-500), Tokopedia (red-500), Consignment (purple-500).

---

## Sources

- `docs/GRABFOOD_API.md` — GrabFood Partner API reference (official OpenAPI v1.1.3 SDK, HIGH confidence)
- `docs/BIGSELLER_PROFIT_API.md` — BigSeller profit analytics API (reverse-engineered from browser traffic, MEDIUM confidence — no official API docs; behavior verified against live data 2026-02-25)
- `.planning/PROJECT.md` — Project decisions, out-of-scope declarations, existing architecture decisions
- `CLAUDE.md` — Existing codebase architecture, table names, file paths, tech stack
- Previous `FEATURES.md` (v1.3, 2026-02-22) — Consignment upload patterns, ExcelJS recommendation, upload UX flow (patterns carried forward)
- GrabFood integration checklist in `docs/GRABFOOD_API.md` — Phase ordering for POS integration
- BigSeller integration notes section in `docs/BIGSELLER_PROFIT_API.md` — Recommended sync strategy

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| GrabFood POS API capabilities | HIGH | First-party official API reference with OpenAPI spec; SDK available |
| GrabFood token management | HIGH | Standard OAuth2 client credentials; matches existing GoFood cron pattern |
| GrabFood order pull (read-only) | HIGH | `GET /partner/v1/orders` is straightforward paginated REST |
| GrabFood menu toggle | HIGH | `PUT /partner/v1/batch/menu` documented with exact field semantics |
| GrabFood webhook / real-time orders | N/A — EXCLUDED | Out of scope per PROJECT.md; requires Facilitator Model partnership |
| BigSeller sync workflow | HIGH | Live data confirmed (19 orders, 2 shops, ~8 min sync); API behavior verified |
| BigSeller data fields | HIGH | Live response data documented; field semantics verified with real values |
| BigSeller costFee=0 limitation | HIGH | Observed in live data; COGS not configured in BigSeller |
| Consignment upload UX | HIGH | Industry-standard pattern; previous research carried forward |
| ExcelJS for parse + template | MEDIUM | Library proven; browser bundle size impact (~500KB) needs verification |
| Unified analytics extension | MEDIUM | Additive to proven pattern; color/filter UI complexity at 8+ channels needs design care |
| Lifetime totals cross-table query | MEDIUM | Cross-table aggregation is straightforward; productMappings normalization may have gaps for new channels |

---

*Feature research for: Frollie Recipe Master v1.4 — Sales & Channel Integration*
*Researched: 2026-02-25*
*Previous v1.3 research (consignment + analytics, 2026-02-22) — patterns carried forward for consignment upload section.*
