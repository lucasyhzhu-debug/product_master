# External API Integration Reference

> Single reference document for all external API integrations in Frollie Pro.
> Covers endpoints, authentication, sync flows, cron schedules, and troubleshooting SOPs.
>
> Last updated: 2026-03-15

---

## 1. Overview

| Platform | Data Types | Automation Status | Token Lifespan | Cron Schedule | Auth Method |
|----------|-----------|-------------------|----------------|---------------|-------------|
| **K3 Mart** | Stock, Revenue (sales) | Sales synced nightly; token re-logs in lazily on 401 | ~24h JWT (auto re-login on 401 in `syncK3MartSales`) | None — synced inside the daily sales summary | Email/password login -> JWT |
| **GoBiz (GoFood)** | Revenue (5-metric) | Synced nightly; token refreshed lazily on 401 | ~1h access token, days/weeks refresh token | None — synced inside the daily sales summary | Browser cookie paste (access_token + refresh_token) |
| **Internal Orders** | Revenue | Hourly cron + manual trigger from Settings page | N/A (own database) | `sync internal orders revenue` every 1h | N/A |

**Source files:**
- Registry: `convex/integrations/registry.ts`
- Platform adapters: `convex/integrations/{platform}/adapter.ts`
- Platform configs: `convex/integrations/{platform}/config.ts`
- Cron definitions: `convex/crons.ts`
- Credential management: `convex/platformCredentials/`

---

## 2. K3 Mart Integration

### 2.1 Connection Details

| Property | Value |
|----------|-------|
| **Base URL** | `https://consapi.k3mart.id/api/v1` |
| **Auth type** | JWT Bearer token (`Authorization: JWT {token}`) |
| **Portal URL** | `https://umkm.k3mart.id` |
| **Token source** | Auto-login via `/vendor/login` with stored email/password |
| **Token lifespan** | ~24 hours (no scheduled refresh; `syncK3MartSales` re-logs in on 401 — see § 6) |
| **Required headers** | `Origin: https://umkm.k3mart.id`, `Referer: https://umkm.k3mart.id/` |

### 2.2 Endpoints

| Endpoint | Method | Purpose | Used By |
|----------|--------|---------|---------|
| `/vendor/login` | POST | Authenticate with email/password, returns JWT | `platformCredentials/actions.ts` |
| `/vendor-profile/get-outlet` | GET | List all consignment outlets for vendor | `refreshOutlets` action |
| `/vendor-stock/detail/{productId}` | GET | Get stock levels across ALL outlets for a product (single call per product) | `discoverK3MartOutlets`, `syncK3MartStock` |
| `/vendor-stock/get-dashboard?outletId={id}` | GET | Get current stock and prices for an outlet | `fetchOutletDashboard`, `submitStockFlow` |
| `/vendor-sales/get-all?from={date}&to={date}` | GET | Fetch all sales transactions in date range | `syncK3MartSales` |
| `/vendor-stock-flow/add` | POST | Submit stock-in (requestType=1) or stock-out (requestType=0) | `submitStockFlow`, `submitBulkStockIns` |
| `/vendor-stock-flow/get-list?outletId={id}` | GET | List stock flow history for an outlet | `fetchStockFlowHistory`, `verifySubmissionStatuses` |
| `/vendor-stock-flow/get-list-by-id?requestId={id}` | GET | Get detail of a specific stock flow request | `fetchStockFlowDetail` |
| `/vendor-stock-flow/cancel/{id}` | PUT | Cancel a pending stock flow request | `cancelStockFlow` |

### 2.3 Authentication Flow

```
1. Credentials stored in `platformCredentials` table (email + password)
2. POST /vendor/login with {email, password}
3. Response contains JWT token (in .token, .access_token, or .data.token field)
4. JWT decoded to extract expiry (payload.exp)
5. Token validated with test API call to /vendor-stock/detail/{productId}
6. Valid token stored in `platformCredentials.currentToken`
7. Steps 2-6 re-run automatically when `syncK3MartSales` gets a 401 (retried once),
   or on demand via the admin "Refresh Token" button. There is no scheduled refresh.
```

**Token resolution order** (in `getK3MartToken()`):
1. Database: `platformCredentials` table (platformId: "k3mart") -> `currentToken`
2. Environment variable: `K3MART_API_TOKEN`
3. If neither exists: throws error

### 2.4 Sync Flows

**Outlet Discovery** (`discoverK3MartOutlets`):
1. Fetch `/vendor-stock/detail/{productId}` for each configured product ID (currently 2 products)
2. Each response contains ALL outlets carrying that product
3. Upsert outlets in `externalOutlets` table
4. Save stock snapshots in `externalStockSnapshots` table
5. Save product mappings in `externalProductMappings` table

**Stock Refresh** (`syncK3MartStock`):
1. Load active outlets from DB
2. Fetch `/vendor-stock/detail/{productId}` for each configured product
3. Match entries to known outlets
4. Save snapshots per outlet (batched, 200 per mutation)
5. Total API calls = number of product IDs (currently 2)

**Sales Sync** (`syncK3MartSales`):
1. Determine date range (incremental from last sync, with 1-day overlap)
2. Single API call to `/vendor-sales/get-all?from={date}&to={date}`
3. Parse transactions, build dedup keys (`transDate|outletName|productCode|qty|total`)
4. Batch save as `externalRevenue` records (100 per mutation)
5. Revenue data has `confidence: "exact"` (real transaction data)

**Stock Flow Submission** (`submitStockFlow`):
1. Fetch fresh dashboard for the outlet (current stock/prices)
2. Build payload with `currentStock` and `currentPrice` from dashboard
3. Submit to `/vendor-stock-flow/add` with 1 retry on 5xx errors
4. Record movement in `k3martStockMovements` table
5. Rate limit: 2s delay between retries

### 2.5 Configured Products

| K3Mart Product ID | Code | Name | Price (IDR) |
|-------------------|------|------|-------------|
| 47068 | F03131-P00001 | Churi Cookie Jumbo | 80,000 |
| 47069 | F03131-P00002 | Dubai Chewy Cookie | 45,000 |

### 2.6 Known Outlets

| External ID | Name |
|-------------|------|
| 44 | JKT-SCBD |
| 45 | JKT-GADING SERPONG |
| 47 | JKT-BINTARO |
| 48 | JKT-KOTA KASABLANKA |
| 53 | JKT-OLD SHANGHAI |
| 57 | JKT-LIPPO PURI |
| 78 | JKT-LM NUSANTARA |
| 81 | JKT-TAMTEM |

### 2.7 SOP: Initial Setup

1. Credentials are pre-configured (auto-seeded on first token refresh)
2. Go to Settings page -> K3 Mart section
3. Click "Refresh Stores" to discover outlets
4. Click "Sync Now" to pull stock data
5. The sales sync re-logs in by itself when the token expires. A `TOKEN_EXPIRED` error means
   the re-login *also* failed — check the stored credentials, then click "Refresh Token"
6. To use different credentials: click "Configure" and enter new email/password
   (the sync reads credentials from the DB row, not env — changing the env var alone does nothing)

### 2.8 SOP: Token Failure Recovery

1. Token refresh is fully automatic -- check cron logs first
2. If cron reports errors: go to Settings -> K3 Mart -> click "Refresh Token"
3. If login fails: verify credentials are correct (email/password in platformCredentials)
4. If API returns non-JSON (Cloudflare challenge): wait 5-10 minutes, retry
5. Check `externalSyncLogs` (source: "k3mart") for error details

---

## 3. GoBiz (GoFood) Integration

### 3.1 Connection Details

| Property | Value |
|----------|-------|
| **Base URL** | `https://api.gobiz.co.id/` |
| **Portal URL** | `https://portal.gofoodmerchant.co.id` |
| **Auth type** | Bearer token from browser cookies |
| **Token source** | Manual paste from browser DevTools |
| **Access token lifespan** | ~1 hour |
| **Refresh token lifespan** | Days to weeks |
| **Default merchant ID** | `G293156297` (Legato / Goldfinch) |
| **Required auth header** | `Authentication-Type: go-id` |

### 3.2 Endpoints

| Endpoint | Method | Purpose | Used By |
|----------|--------|---------|---------|
| `https://api.gobiz.co.id/journals/search` | POST | Transaction-level revenue data (paginated) | `syncGoBizRevenue` (Phase A) |
| `https://api.gobiz.co.id/cosmo/v1/orders/search` | POST | Item-level order details | `syncGoBizRevenue` (Phase B) |
| `https://portal.gofoodmerchant.co.id/micro-app/auth` | GET | Token refresh method 1: Cookie refresh | `attemptTokenRefresh` |
| `https://portal.gofoodmerchant.co.id/analytics-backend/api/auth/token/rotate` | POST | Token refresh method 2: Token rotate | `attemptTokenRefresh` |
| `https://api.gobiz.co.id/auth/token/refresh` | POST | Token refresh method 3: API refresh | `attemptTokenRefresh` |

**Dashboard API** (documented but secondary):
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `https://portal.gofoodmerchant.co.id/api/ds/proxy/63` | POST | `_msearch` for 5-metric daily aggregates (dashboard analytics) |

### 3.3 Request Headers

**Journal/Order APIs** (from `buildGoBizApiHeaders()`):
```
Accept: application/json, text/plain, *, application/vnd.journal.v1+json
Accept-Language: en-US,en;q=0.9
Authentication-Type: go-id
Authorization: Bearer {access_token}
Content-Type: application/json
Origin: https://portal.gofoodmerchant.co.id
Referer: https://portal.gofoodmerchant.co.id/
```

**Additional headers used in POC script** (from `scripts/gobiz_poc.mjs`):
```
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...
X-AppVersion: platform-v3.98.1-bf97ae9c
X-PhoneMake: Windows 10 64-bit
X-PhoneModel: Chrome 144.0.0.0 on Windows 10 64-bit
X-Platform: Web
X-User-Locale: en-US
X-User-Type: merchant
Gojek-Country-Code: ID
Gojek-Timezone: Asia/Jakarta
x-DeviceOS: Web
x-appId: go-biz-web-dashboard
x-uniqueid: {uuid}
```

**Dashboard API headers** (from `buildDashboardHeaders()`):
```
Authentication-Type: go-id
Authorization: Bearer {access_token}
Content-Type: application/json, application/x-ndjson
X-Dashboard-ID: 107
X-Panel-ID: 22
X-Range-From: {epoch_ms}
X-Range-To: {epoch_ms}
X-Ref-IDs: total_gmv_bottomline_amount;total_gmv_topline_amount;total_commission_amount;total_ad_burn_amount;total_promo_burn_amount
X-Custom-Interval: 1d
X-Setting-Interval: 1d
X-Grafana-Org-ID: 1
```

### 3.4 Token Refresh Cascade (3 Methods)

When a 401 is received, the system attempts refresh using three methods in order. Each subsequent method is a fallback in case the previous one fails.

```
On 401 Unauthorized:
  |
  v
METHOD 1: Cookie Refresh
  URL: https://portal.gofoodmerchant.co.id/micro-app/auth
  Method: GET with redirect: "manual"
  Auth: Cookie header with refresh_token + access_token + auth_method=goid
  Success: New access_token (and optionally refresh_token) in Set-Cookie header
  |
  | (on failure)
  v
METHOD 2: Token Rotate
  URL: https://portal.gofoodmerchant.co.id/analytics-backend/api/auth/token/rotate
  Method: POST
  Auth: Cookie header with refresh_token + access_token
  Headers: Origin + Referer (portal analytics page)
  Success: New access_token in Set-Cookie header
  |
  | (on failure)
  v
METHOD 3: API Refresh
  URL: https://api.gobiz.co.id/auth/token/refresh
  Method: POST
  Body: { "refresh_token": "{refresh_token}" }
  Headers: Content-Type + Origin + User-Agent
  Success: JSON response with access_token (and optionally refresh_token)
  |
  | (on failure)
  v
ALL METHODS FAILED
  -> Log error to platformCredentials (lastRefreshStatus: "error")
  -> Manual re-paste of tokens required
```

**Why three methods?**
- GoBiz does not provide a standard OAuth refresh flow
- Method 1 (Cookie) is the most reliable; simulates browser session continuation
- Method 2 (Rotate) works via the analytics backend which has its own token rotation
- Method 3 (API) is the standard REST approach but least reliable for GoBiz
- Having all three maximizes the window before manual intervention is needed

### 3.5 Sync Flow (3 Phases)

**Revenue sync** (`syncGoBizRevenue`) uses a 3-phase approach:

**Phase A: Journal Sync** (transaction-level)
1. Generate WIB date range (default: 7 days back)
2. For each day, fetch paginated journals via `journals/search`
3. Extract metrics per transaction: gross, net, commission, order number
4. Save as `externalRevenue` records with dedup key (`orderNumber|txnTimeMs`)
5. Journal amounts are in centesimal IDR (divided by 100)

**Phase B: Order Details** (item-level, for new records only)
1. For each newly created revenue record from Phase A
2. Fetch order details via `cosmo/v1/orders/search` by order number
3. Parse individual items (name, price, quantity, variants)
4. Auto-match items to `menuProducts` by name and price
5. Save as `externalRevenueItems` with match confidence
6. Rate limited: 200ms between order API calls

**Phase C: Sticker Deduction** (inventory integration)
1. Collect all new GoFood sale items with linked menu products
2. Aggregate quantities by menu product
3. Deduct sticker inventory via `gofoodDepot.mutations.processSyncSales`
4. Phase C failure does NOT fail the overall sync

### 3.6 Multi-Outlet Support

| Merchant ID | Outlet Name | Notes |
|-------------|-------------|-------|
| `G293156297` | Legato / Goldfinch | Primary outlet, used as default `merchantId` in config |
| `G347061572` | Crystal (GoFood) | Used in POC script multi-merchant filter |

The POC script (`scripts/gobiz_poc.mjs`) demonstrates filtering by both merchants using `op: "in"` with an array of merchant IDs. The production adapter currently uses a single `merchantId` (`G293156297`) in `buildJournalSearchBody()` with `op: "equal"`.

### 3.7 Dashboard API (proxy/63)

The dashboard API uses Grafana-style `_msearch` queries against an Elasticsearch proxy. It provides 5 daily aggregate metrics:

| Ref ID (index) | Metric | Description |
|----------------|--------|-------------|
| 0: `total_gmv_bottomline_amount` | Net sales | Revenue after all deductions |
| 1: `total_gmv_topline_amount` | Gross sales | Total order value before deductions |
| 2: `total_commission_amount` | Commission | GoFood platform commission |
| 3: `total_ad_burn_amount` | Ad spend | Advertising cost on GoFood |
| 4: `total_promo_burn_amount` | Promo spend | Promotional discount cost |

Response values are in `responses[i].aggregations["2"].buckets[0]["1"].value`.

### 3.8 Journal API Request/Response

**Request body** (from `buildJournalSearchBody()`):
```json
{
  "from": 0,
  "size": 50,
  "sort": { "time": { "order": "desc" } },
  "included_categories": {
    "incoming": ["transaction_share", "action"]
  },
  "query": [{
    "op": "and",
    "clauses": [
      { "op": "not", "clauses": [/* exclude GoSave/GoDeals */] },
      { "field": "metadata.transaction.status", "op": "in",
        "value": ["settlement", "capture", "refund", "partial_refund"] },
      { "op": "or", "clauses": [/* payment types: qris, gopay, credit_card, etc. */] },
      { "field": "metadata.transaction.transaction_time", "op": "gte", "value": "{ISO UTC}" },
      { "field": "metadata.transaction.transaction_time", "op": "lte", "value": "{ISO UTC}" },
      { "field": "metadata.transaction.merchant_id", "op": "equal", "value": "{merchantId}" }
    ]
  }]
}
```

**Response metric extraction** (from `extractJournalMetrics()`):
- `gross` = `hit.amount / 100` (centesimal IDR)
- `net` = `hit.transaction_share[0].amount / 100`
- `commission` = `hit.transaction_share[0].metadata.variables.commission / 100`
- `orderNumber` = `hit.metadata.transaction.order_id`
- `transactionTime` = `hit.time`
- `status` = `hit.metadata.transaction.status`
- `paymentType` = `hit.metadata.transaction.payment_type`

**Promo Discount Structure (HAR-verified 2026-03-15, 13 orders across 2 outlets):**

The `variables.commission` field contains ONLY the GoFood delivery service fee — it does NOT include platform promo discounts. Promo discounts are in `variables.voucher_amount` (centesimal IDR).

```
Formula (verified 100% across 13 orders):
  net = gross - commission - voucher_amount

Example (Legato Gelato order F-3159434616, gross 140,000 IDR):
  gross          = hit.amount / 100                         = 140,000
  commission     = variables.commission / 100                =  29,526  ← service fee only
  voucher_amount = variables.voucher_amount / 100            =  24,500  ← merchant's promo cost
  net            = transaction_share[0].amount / 100         =  85,974  ← actual take-home
  CHECK: 140,000 - 29,526 - 24,500 = 85,974 ✓
```

**Full `transaction_share[0].metadata.variables` schema:**

| Field | Type | Description | Promo Order | Non-Promo |
|-------|------|-------------|-------------|-----------|
| `commission` | number | GoFood service fee (centesimal, includes VAT) | 2,952,600 | 2,530,800 |
| `voucher_amount` | number | Merchant's share of campaign discount (centesimal) | 2,450,000 | 0 |
| `voucher_commission` | number | Always 0 in observed data | 0 | 0 |
| `gross_amount` | number | Same as `hit.amount` | 14,000,000 | 12,000,000 |
| `merchant_percentage_fee` | number | Base commission rate | 0.19 | 0.19 |
| `vat` | number | VAT rate on commission | 0.11 | 0.11 |
| `value_added_tax` | number | VAT amount on commission (centesimal) | 292,600 | 250,800 |
| `exclude_vat` | number | VAT exclusion flag | 1 | 1 |
| `extra_commission_percentage` | number | Additional commission % | 0 | 0 |
| `extra_commission_amount` | number | Additional commission amount | 0 | 0 |
| `dynamic_commission_amount` | number | Dynamic commission | 0 | 0 |
| `merchant_fixed_fee` | number | Fixed fee | 0 | 0 |
| `service_charge` | number | Service charge | 0 | 0 |
| `restaurant_tax` | number | Restaurant tax | 0 | 0 |
| `withholding_tax` | number | WHT amount | 0 | 0 |
| `withholding_tax_new` | number | New WHT | 0 | 0 |
| `wht` | number | WHT flag | 0 | 0 |
| `tax` | number | General tax | 0 | 0 |
| `sharing_percentage` | number | Revenue share % | 0 | 0 |
| `sku_commission_offset_amount` | number | SKU offset | 0 | 0 |
| `mdr_profile_id` | number | MDR profile | 0 | 0 |
| `withdrawal_fee_discount` | number | Withdrawal fee discount | 0 | 0 |
| `comfee_exclude_mfp` | number | Commission fee exclusion | 0 | 0 |
| `X_PARTNER_FEE_AKAB` | number | Partner fee (= commission) | 2,952,600 | 2,530,800 |

**Other `transaction_share[0].metadata` fields:**

| Field | Description | Promo Order | Non-Promo |
|-------|-------------|-------------|-----------|
| `total_fee` | = commission (does NOT include voucher) | 2,952,600 | 2,530,800 |
| `provider_share` | = commission (does NOT include voucher) | 2,952,600 | 2,530,800 |
| `merchant_share` | = net = `transaction_share[0].amount` | 8,597,400 | 9,469,200 |
| `gross_amount` | = `hit.amount` | 14,000,000 | 12,000,000 |

**Promo-only `metadata.transaction.metadata.transaction_metadata`:**

Only present on promo orders. Absent (undefined) for non-promo.

```javascript
{
  voucher_deduction: {
    voucher_desc: "",
    voucher_commission: 0,
    voucher_amount: 24500            // in IDR (NOT centesimal!) — note different scale from variables
  },
  discounts: [{
    type: "markdown",                // discount type
    id: "596f5dc6-...",              // campaign ID (matches cosmo campaign_id)
    description: "",
    commission: 0,
    amount: 24500                    // in IDR (NOT centesimal!)
  }]
}
```

**Two types of customer discounts (from cosmo `orders/search` cross-reference):**

| Type | Source | Deducted from merchant? | Journal field | Example |
|------|--------|-------------------------|---------------|---------|
| Campaign discount | `goresto.campaign_discounts[]` | YES — `discount_amount × merchant_budget_share_percent / 100` | `variables.voucher_amount` | Rp 35K discount, 70% merchant share = Rp 24.5K |
| Customer voucher | `goresto.voucher_redeemed_value` | NO — GoFood funded | Not in journal | Rp 20K voucher, Rp 0 merchant cost |

An order can have both simultaneously (e.g., F-3159231219: campaign discount 35K + customer voucher 6K).

**IMPORTANT:** The dashboard aggregation (`dashboardHelpers.ts`) currently recalculates `net = gross - commission`, which DROPS the promo discount. It should use the stored `revenueNet` from `externalRevenue` instead. See `.planning/debug/gobiz-invisible-promo-discount.md` for the full bug report.

### 3.9 Order API Request/Response

**Request body** (from `buildOrderSearchBody()`):
```json
{
  "query": {
    "term": {
      "order_number": "{orderNumber}"
    }
  }
}
```

**Response structure** (validated 2026-02-09, expanded 2026-03-15 with campaign discount fields):
```json
{
  "status": "success",
  "data": {
    "hits": [{
      "analytic_temp": {
        "merchant_name": "Frollie Dubai Chewy Cookie, Legato Gelato",
        "acceptance_time": 8,
        "delivery_time": 2245,
        "food_prepare_time": 3683
      },
      "currency": "IDR",
      "gross_amount": 140000,
      "merchant_id": "G293156297",
      "order_number": "F-3159434616",
      "ordered_at": "2026-03-15T10:09:58Z",
      "source": "GORESTO",
      "status": { "goresto": "COMPLETED" },
      "items": [
        {
          "id": "item-uuid",
          "name": "Dubai chewy cookie paket (isi 3)",
          "price": 140000,
          "quantity": 1,
          "variants": []
        }
      ],
      "product_specific": {
        "goresto": {
          "shopping_price": 140000,
          "driver_entered_price": 140000,
          "sub_status": "COMPLETED",
          "auto_acceptance_enabled": true,
          "has_promo": false,
          "campaign_discounts": [
            {
              "campaign_discount_scope": "ShoppingAmount",
              "campaign_id": "596f5dc6-5280-4385-aa19-5711c9c8b54f",
              "discount_amount": 35000,
              "merchant_budget_share_percent": 70,
              "redeemed_amount": 35000,
              "subscription_id": ""
            }
          ],
          "voucher_batch_id": "",
          "voucher_commission": 0,
          "voucher_id": "",
          "voucher_redeemed_value": 0,
          "voucher_title": "",
          "commission_price": 0,
          "convenience_fee": 0,
          "withholding_income_tax": 0
        }
      }
    }],
    "total": 1
  }
}
```

**Campaign discount vs customer voucher (HAR-verified 2026-03-15):**
- `campaign_discounts[]`: Merchant co-funded promo. `merchant_budget_share_percent` determines merchant's cost. Matches `variables.voucher_amount` in journal API.
- `voucher_redeemed_value`: GoFood-funded customer voucher. Does NOT reduce merchant settlement. Does NOT appear in journal API.
- `has_promo`: Always `false` in observed data — do not rely on this field for promo detection.

Note: Order API amounts are in raw IDR (no centesimal conversion needed).

### 3.10 WIB Date Handling

All date ranges are WIB-aware (UTC+7). The system converts WIB dates to UTC ranges:

```
WIB date "2026-02-08":
  WIB range: 2026-02-08 00:00:00 WIB to 2026-02-08 23:59:59.999 WIB
  UTC range: 2026-02-07 17:00:00 UTC to 2026-02-08 16:59:59.999 UTC
```

Functions: `wibDateToUtcRange()` (epoch ms), `wibDateToUtcIsoRange()` (ISO strings).

### 3.11 SOP: Initial Setup

1. Open `https://portal.gofoodmerchant.co.id` and log in with your GoBiz account
2. Open browser DevTools (F12) -> Application tab -> Cookies
3. Copy the `access_token` cookie value
4. Copy the `refresh_token` cookie value
5. Go to Settings page -> GoBiz section -> click "Configure"
6. Paste both tokens in the dialog and click "Save Token"
7. Click "Sync Now" to manually trigger revenue sync
8. Auto-sync runs 7x daily at WIB business hours (8, 10, 12, 14, 16, 18, 20 WIB)

### 3.12 SOP: Token Chain Break Recovery

When all 3 refresh methods fail, the token chain is broken. Symptoms:
- Sync logs show `lastRefreshStatus: "error"` with "All refresh methods failed"
- Revenue data stops updating

**Recovery steps:**
1. Open `https://portal.gofoodmerchant.co.id` and log in
2. Open DevTools (F12) -> Application -> Cookies
3. Copy BOTH `access_token` AND `refresh_token` cookies
4. Go to Settings -> GoBiz -> click "Configure"
5. Paste both tokens and save
6. Click "Sync Now" to verify the new tokens work
7. The auto-refresh cascade will maintain the chain going forward

**Important:** You must paste BOTH tokens. The refresh_token is essential for the cascade to work. An access_token alone will work for ~1 hour then fail.

---

## 4. Internal Orders Sync

### 4.1 Connection Details

| Property | Value |
|----------|-------|
| **Source** | Own Convex database (`orders` table) |
| **Auth** | None (internal database query) |
| **Token** | N/A |
| **Trigger** | Manual from Settings page |
| **Cron** | None |

### 4.2 Sync Flow

The internal sync (`syncInternalOrders`) reads from the local Convex orders database:

1. Create sync log (status: "started")
2. Query all revenue-countable orders via `getRevenueOrders`
3. Revenue-countable statuses: `Confirmed`, `InProduction`, `Boxed`, `Labeled`, `WaitingShipment`, `WaitingPickup`, `CompleteShipped`, `PickedUp`
4. Map each order to a revenue record:
   - `revenueGross` = `order.totalAmount`
   - `revenueNet` = `order.finalTotal` (with discounts) or `order.totalAmount` (no discounts)
   - `costOfGoods` = `order.totalCost`
   - `transactionDate` = `order.confirmedAt` (preferred) or `order.orderDate` (fallback)
5. Batch save with dedup by `orderNumber` (100 orders per mutation)
6. Revenue data has `confidence: "exact"` and `dataOrigin: "db_query"`

### 4.3 Revenue Calculation

| Field | Source | Notes |
|-------|--------|-------|
| Gross revenue | `order.totalAmount` | Total before discounts |
| Net revenue | `order.finalTotal` | Total after voucher/discounts; falls back to totalAmount |
| Cost of goods | `order.totalCost` | Calculated from recipe/packaging costs |
| Item count | `order.itemCount` | Number of items in order |

---

## 5. Schema Reference

### Key Tables

| Table | Purpose | Source(s) |
|-------|---------|-----------|
| `platformCredentials` | Store API tokens, credentials, refresh status per platform | K3Mart, GoBiz |
| `externalOutlets` | Outlet/store master data (name, external ID, active status) | K3Mart |
| `externalRevenue` | Unified revenue records from all sources | K3Mart, GoBiz, Internal |
| `externalRevenueItems` | Line-item detail for revenue records (GoFood items) | GoBiz |
| `externalSyncLogs` | Sync execution history (status, duration, errors) | All |
| `externalProductMappings` | Map external product codes to internal menu products | K3Mart, GoBiz |
| `externalStockSnapshots` | Point-in-time stock levels at outlets | K3Mart |
| `k3martStockMovements` | Stock-in/stock-out records for K3Mart outlets | K3Mart |

### platformCredentials Fields

| Field | Type | Description |
|-------|------|-------------|
| `platformId` | string | `"k3mart"` or `"gobiz"` |
| `currentToken` | string | Active API token |
| `refreshToken` | string? | Refresh token (GoBiz only) |
| `tokenExpiresAt` | number? | Token expiry timestamp (K3Mart JWT) |
| `email` | string? | Login email (K3Mart only) |
| `password` | string? | Login password (K3Mart only) |
| `lastRefreshAt` | number? | Timestamp of last refresh attempt |
| `lastRefreshStatus` | string? | `"success"` or `"error"` |
| `lastRefreshError` | string? | Error message on failure |

---

## 6. Cron Schedule

**None of the three integrations on this page has its own cron.** All four platform crons
(`refresh k3mart token`, `sync gobiz revenue`, `refresh gobiz token`, `weekly integrity check`)
were removed on 2026-02-24 in `5237f0da`. The nightly `refresh-k3mart-token.yml` GitHub Action
was removed on 2026-07-10 in `423f1549` — it had failed on all 100 recorded runs because its
`K3MART_EMAIL` / `K3MART_PASSWORD` secrets were never set.

Integration data is refreshed **inside the daily sales summary** instead:

| Cron Name | Schedule | Action | Purpose |
|-----------|----------|--------|---------|
| `sync internal orders revenue` | Every 1 hour | `integrations.internal.adapter.syncInternalOrders` | Sync internal-order revenue |
| `sales summary daily` | Daily 16:00 UTC (23:00 WIB) | `telegram.salesSummary.sendSalesSummary.sendSalesSummaryResilient` | Best-effort refresh of GoFood / K3Mart / Internal / POS, then post the summary |

Each of those four refreshes is wrapped in `runBestEffortSync`: a non-transient failure surfaces
as a `✗` in the Telegram post and the summary still ships. A transient Convex error rethrows so
the resilient wrapper retries the whole run. See `convex/telegram/salesSummary/sendSalesSummary.ts`.

**Token handling without a cron — both platforms now self-heal:**
- **GoBiz** — refreshes **lazily on a 401** mid-sync (`gobiz/adapter.ts:330`), so a scheduled
  pre-refresh was always redundant.
- **K3Mart** — since 2026-07-10, `syncK3MartSales` does the same: the adapter reads
  `platformCredentials.currentToken` (falling back to `K3MART_API_TOKEN`), and on a 401 calls
  `reloginK3Mart` → `refreshK3MartTokenCron` to re-login with the stored email/password, then
  retries the fetch **exactly once**. If the re-login also fails, the sync ends with
  `TOKEN_EXPIRED` and an admin must fix the credentials and press "Refresh Token".
  K3Mart has no refresh-token grant, so recovery is always a full re-login.

`convex/crons.ts` is the single source of truth for the full 25-entry schedule; see
`docs/API_REFERENCE.md` § Cron Jobs for the complete table.

---

## 7. Troubleshooting

### K3 Mart Issues

| Problem | Cause | Resolution |
|---------|-------|------------|
| "TOKEN_EXPIRED" error | JWT expired **and** the automatic re-login failed (bad stored credentials, or K3Mart login down) | Verify credentials in Settings -> K3 Mart -> "Configure", then "Refresh Token". Check `externalSyncLogs` for the `token_refresh` error. |
| Non-JSON response from login | Cloudflare challenge or API downtime | Wait 5-10 minutes, retry. Check if `consapi.k3mart.id` is reachable. |
| "K3MART_API_TOKEN not set" | No credentials in DB or env | Go to Settings -> K3 Mart -> "Configure" to enter email/password. |
| Missing outlets | Outlets not yet discovered | Run "Refresh Stores" to discover outlets from product detail API. |
| Stock flow "pending" | K3Mart hasn't approved the request yet | Check via "Verify Statuses" -- approval is on K3Mart's side. |
| Sales sync shows 0 new | All transactions already saved (dedup) | This is normal for incremental sync with overlap. |

### GoBiz Issues

| Problem | Cause | Resolution |
|---------|-------|------------|
| "All refresh methods failed" | Token chain broken, refresh_token expired | Re-paste BOTH tokens from DevTools (see SOP 3.12). |
| "GoBiz API token not found" | No token in DB or env | Go to Settings -> GoBiz -> "Configure" to paste tokens. |
| 401 on first sync | Access token expired immediately | Normal -- the cascade will auto-refresh. If it fails, re-paste tokens. |
| Missing revenue for a day | Sync window didn't cover that day | Run manual sync with `daysBack` parameter set to cover the gap. |
| "Phase C failed" message | Sticker deduction error (non-fatal) | Revenue data is still saved. Check sticker inventory separately. |
| Only Crystal data, no Goldfinch | `merchantId` filter in production code uses single merchant | POC script shows multi-merchant support; production adapter filters by `G293156297` only. |

### Internal Orders Issues

| Problem | Cause | Resolution |
|---------|-------|------------|
| Orders not appearing in revenue | Order status not in revenue-countable list | Order must be at least "Confirmed" status. Draft and AwaitingPayment are excluded. |
| Duplicate revenue records | Should not happen -- dedup by orderNumber | Check `externalRevenue` for duplicate `externalTransactionId` values. |
| Missing cost data | `totalCost` not calculated on order | Ensure order items have linked recipes with cost data. |

### General Debugging

1. **Check sync logs:** Query `externalSyncLogs` table, filter by source and recent timestamps
2. **Check token status:** Query `platformCredentials` table, check `lastRefreshStatus` and `lastRefreshError`
3. **Check Convex dashboard:** Open Convex dashboard -> Logs tab for real-time action logs
4. **Check cron status:** Convex dashboard -> Crons tab shows last run time and status
5. **Test API manually:** Use the POC script (`node scripts/gobiz_poc.mjs {token}`) for GoBiz testing
