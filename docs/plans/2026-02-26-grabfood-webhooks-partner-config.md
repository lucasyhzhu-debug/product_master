# GrabFood Webhooks & Partner Configuration Reference

> **Purpose:** Complete reference for implementing GrabFood Partner API inbound webhooks. Use this to plan Phase 27.0.1.
>
> **Date:** 2026-02-26
> **SDK version:** GrabFood Partner API v1.1.3
> **Sources:** [grab/grabfood-api-sdk-go](https://github.com/grab/grabfood-api-sdk-go), [grab/grabfood-api-sdk-python](https://github.com/grab/grabfood-api-sdk-python), [grab/grabfood-api-sdk-node](https://github.com/grab/grabfood-api-sdk-node)

---

## Two-Way Integration Model

GrabFood integration has two directions:

| Direction | What | Status |
|-----------|------|--------|
| **Outbound** (we call GrabFood) | Pause store, update menu, sync orders, accept/reject orders | Phase 27 ✓ Built |
| **Inbound** (GrabFood calls us) | New order notification, menu sync result, integration status | Phase 27.0.1 — this doc |

The **Partner Configuration** page in the GrabFood Developer Portal registers the inbound webhook URLs. Without these, GrabFood cannot push events to our system.

---

## Partner Configuration Fields

These fields appear on the GrabFood Developer Portal under **Partner Configuration > Edit**.

### Webhook Endpoints (we expose, GrabFood calls)

| Portal Field | HTTP Method | Our URL | Purpose | Priority |
|-------------|-------------|---------|---------|----------|
| **Get menu endpoint** | `GET` | `/api/grabfood/menu` | GrabFood fetches our current menu | HIGH — required for App Simulator |
| **Submit order endpoint** | `POST` | `/api/grabfood/order` | GrabFood sends new orders when customer places one | HIGH — core order flow |
| **Push order state endpoint** | `POST` | `/api/grabfood/order/state` | GrabFood pushes order state changes (driver assigned, picked up, etc.) | MEDIUM — status tracking |
| **Menu Sync Webhook** | `POST` | `/api/grabfood/menu-sync` | GrabFood reports menu sync job results (success/failure) | MEDIUM — already scaffolded |
| **Push Grab menu endpoint** | `POST` | `/api/grabfood/menu/push` | GrabFood pushes menu edits made on GrabFood Merchant App back to us | LOW — optional for MVP |
| **Integration status endpoint** | `POST` | `/api/grabfood/integration-status` | GrabFood notifies when integration status changes (ACTIVE/INACTIVE) | LOW — monitoring |
| **OAuth token endpoint** | `POST` | `/api/grabfood/oauth/token` | GrabFood authenticates with OUR system to call our endpoints | LOW — only if we require auth |

### Credentials (already configured)

| Portal Field | Value | Notes |
|-------------|-------|-------|
| **Partner client ID** | Your `GRAB_CLIENT_ID` | Used for outbound OAuth2 token requests |
| **Partner client secret** | Your `GRAB_CLIENT_SECRET` | Used for outbound OAuth2 token requests |
| **OAuth scopes** | `grabfood.partner_api` | Controls what we can do on GrabFood's API |

### Settings

| Portal Field | Current Value | Notes |
|-------------|---------------|-------|
| **Menu Structure** | Old Structure (Section Based Menu) | Determines menu JSON format |
| **Max Submit Order Retry Count** | 0 | How many times GrabFood retries failed order submissions |

---

## Webhook Authentication: HMAC-SHA256

GrabFood authenticates webhook calls using HMAC-SHA256 signatures.

### Flow

1. GrabFood computes `HMAC-SHA256(raw_body_bytes, shared_secret)` → hex string
2. Sends hex in `X-Grab-Signature` request header
3. We compute same HMAC on our end and compare (constant-time)

### Shared Secret

The HMAC secret is provisioned when you register webhook URLs in the GrabFood developer portal. Store it as:
- **Current approach:** `GRAB_HMAC_SECRET` env var (but NOT available in Convex `httpAction` — non-Node runtime)
- **Correct approach:** Store in `platformCredentials` table and fetch via `ctx.runQuery(internal.platformCredentials.queries.getCredentialsInternal)`

### Critical Rule

**Always return HTTP 200**, even on HMAC failure, JSON parse error, or processing error. GrabFood interprets non-200 as delivery failure and retries. Return 200 first, process asynchronously.

---

## Webhook 1: Submit Order (New Order Notification)

**The most important webhook.** GrabFood calls this when a customer places an order.

### Spec

- **Method:** `POST`
- **Portal field:** "Submit order endpoint"
- **Auth:** `X-Grab-Signature` HMAC-SHA256
- **Response:** HTTP 200 always

### Request Body (`SubmitOrderRequest`)

```jsonc
{
  // === REQUIRED ===
  "orderID": "123-CYNKLPCVRN5",           // GrabFood UUID for the order
  "shortOrderNumber": "ABC-123",           // Short display number (unique per merchant per day)
  "merchantID": "M-GRAB-ID",              // GrabFood's internal merchant ID
  "paymentType": "CASHLESS",              // "CASH" | "CASHLESS"
  "cutlery": false,                        // Customer requested cutlery?
  "orderTime": "2026-02-26T10:00:00Z",    // ISO 8601 UTC
  "currency": {
    "code": "IDR",
    "symbol": "Rp",
    "exponent": 0                          // 0 for IDR (no decimals), 2 for SGD/MYR
  },
  "featureFlags": {
    "orderAcceptedType": "AUTO",           // "AUTO" | "MANUAL"
    "orderType": "DELIVERY",               // "DELIVERY" | "SELF_PICKUP" | "DINE_IN"
    "isMexEditOrder": false
  },
  "items": [
    {
      "id": "ITEM-01",                    // Our externalID from menu push
      "grabItemID": "grab-internal-id",    // GrabFood's internal item ID
      "quantity": 2,
      "price": 25000,                      // Per-item price, minor units
      "tax": 0,
      "specifications": "No onions",       // Customer note (optional)
      "outOfStockInstruction": {           // Optional
        "title": "Replace with similar",
        "instructionType": "SPECIFIC_ITEM", // "CONTACT" | "SPECIFIC_ITEM" | "CANCEL_ITEM" | "REFUND"
        "replacementItemID": "ITEM-02",
        "replacementGrabItemID": "grab-id"
      },
      "modifiers": [{                      // Optional
        "id": "MOD-01",
        "price": 5000,
        "tax": 0,
        "quantity": 1
      }]
    }
  ],
  "price": {
    "subtotal": 50000,                     // Items + modifiers, tax-inclusive
    "tax": 0,
    "merchantChargeFee": 0,
    "grabFundPromo": 5000,                 // Grab-funded discount
    "merchantFundPromo": 0,                // Merchant-funded discount
    "basketPromo": 5000,
    "deliveryFee": 10000,
    "smallOrderFee": 0,
    "eaterPayment": 55000                  // What customer actually paid
  },

  // === OPTIONAL ===
  "partnerMerchantID": "PARTNER-001",     // Our internal merchant reference
  "scheduledTime": null,                   // Non-null for scheduled orders
  "orderState": null,                      // Not set on submit (only in list orders)
  "campaigns": [{
    "id": "CAMP-001",
    "name": "50% off",
    "level": "ITEM",                       // "ITEM" | "ORDER"
    "type": "PERCENTAGE_DISCOUNT",
    "mexFundedRatio": 50,
    "deductedAmount": 5000,
    "appliedItemIDs": ["ITEM-01"]
  }],
  "promos": [{
    "code": "PROMO50",
    "promoAmount": 5000,
    "mexFundedRatio": 0,
    "mexFundedAmount": 0
  }],
  "dineIn": {                              // Only for DINE_IN
    "tableID": "T-05",
    "eaterCount": 3
  },
  "receiver": {                            // Only for DELIVERY
    "name": "John Doe",
    "phones": "+62812345678",
    "address": {
      "address": "Jl. Sudirman No. 1",
      "coordinates": { "latitude": -6.2088, "longitude": 106.8456 },
      "deliveryInstruction": "Call on arrival",
      "postcode": "10220"
    }
  },
  "orderReadyEstimation": {
    "readyTime": "2026-02-26T10:20:00Z"
  },
  "membershipID": null
}
```

### Processing Logic

1. Return HTTP 200 immediately
2. Parse JSON, extract `orderID`, `merchantID`
3. Schedule async mutation to upsert into `grabfoodOrders` table
4. If `featureFlags.orderAcceptedType === "MANUAL"` → merchant must call `POST /partner/v1/order/prepare` to accept/reject within timeout
5. If `"AUTO"` → order is auto-accepted, no action needed

### Current Implementation

`convex/integrations/grabfood/webhooks.ts:handleOrderWebhook` — already scaffolded and functional. Uses `ctx.scheduler.runAfter(0, internal.grabfoodOrders.mutations.upsertOrder)` for async processing.

---

## Webhook 2: Get Menu (Menu Fetch)

GrabFood calls this to fetch our current menu. This is NOT a webhook notification — it's a **synchronous GET** where GrabFood expects our menu as the response body.

### Spec

- **Method:** `GET`
- **Portal field:** "Get menu endpoint"
- **Auth:** `X-Grab-Signature` HMAC-SHA256 (on empty body for GET — may use query params)
- **Response:** HTTP 200 with menu JSON body

### Response Body (Old Structure — Section Based)

Since our portal is set to "Old Structure (Section Based Menu)":

```jsonc
{
  "merchantID": "M-GRAB-ID",
  "partnerMerchantID": "PARTNER-001",
  "currency": {
    "code": "IDR",
    "symbol": "Rp",
    "exponent": 0
  },
  "sellingTimes": [{
    "startTime": "08:00",
    "endTime": "22:00",
    "id": "ST-001",
    "name": "All Day"
  }],
  "sections": [{
    "id": "SEC-001",
    "name": "Main Menu",
    "sellingTimeID": "ST-001",
    "categories": [{
      "id": "CAT-001",
      "name": "Snacks",
      "items": [{
        "id": "ITEM-001",                  // Our internal product ID (becomes the externalID)
        "name": "Frollie Original",
        "nameTranslation": { "id": "Frollie Original" },
        "availableStatus": "AVAILABLE",     // "AVAILABLE" | "UNAVAILABLE" | "UNAVAILABLE_TODAY"
        "description": "80g cheese ball",
        "price": 25000,                     // Minor units (IDR = whole rupiah)
        "photos": ["https://..."],
        "taxable": true,
        "maxStock": -1,                     // -1 = unlimited, 0 = out of stock
        "modifierGroups": []
      }]
    }]
  }]
}
```

### Current State

**NOT implemented.** No `/api/grabfood/menu` GET handler exists in `http.ts`. This needs to be built to source from our `menuProducts` + `externalProductMappings` tables.

---

## Webhook 3: Menu Sync Result

GrabFood calls this after a menu sync job completes (triggered by our `POST /partner/v1/merchant/menu/notification` call).

### Spec

- **Method:** `POST`
- **Portal field:** "Menu Sync Webhook"
- **Auth:** `X-Grab-Signature` HMAC-SHA256
- **Response:** HTTP 200 always

### Request Body (`MenuSyncWebhookRequest`)

```jsonc
{
  "requestID": "uuid-dedup-key",          // Deduplicate on this
  "merchantID": "M-GRAB-ID",
  "partnerMerchantID": "PARTNER-001",     // Optional
  "jobID": "uuid-sync-job",
  "updatedAt": "2026-02-26T10:05:00Z",
  "status": "SUCCESS",                     // "PENDING" | "IN_PROGRESS" | "SUCCESS" | "PARTIAL_FAILURE" | "FAILED"
  "errors": []                             // Populated on FAILED / PARTIAL_FAILURE
}
```

### Current State

**Scaffolded** in `convex/integrations/grabfood/webhooks.ts:handleMenuSyncWebhook`. Logs status but does not persist to DB. Route registered in `http.ts` at `/api/grabfood/menu-sync`.

---

## Webhook 4: Push Order State

GrabFood pushes order lifecycle state changes (driver assigned, picked up, completed, cancelled).

### Spec

- **Method:** `POST`
- **Portal field:** "Push order state endpoint"
- **Auth:** `X-Grab-Signature` HMAC-SHA256
- **Response:** HTTP 200 always

### Request Body

```jsonc
{
  "orderID": "123-CYNKLPCVRN5",
  "merchantID": "M-GRAB-ID",
  "orderState": "DRIVER_ALLOCATED",        // See states below
  "driverETA": 15,                         // Minutes until driver arrives (optional)
  "driver": {                              // Optional, only when driver allocated
    "name": "Driver Name",
    "phone": "+62812345678",
    "photoURL": "https://...",
    "licensePlate": "B 1234 ABC"
  }
}
```

**Order States pushed by GrabFood:**
- `DRIVER_ALLOCATED` — driver assigned, ETA available
- `DRIVER_ARRIVED` — driver at restaurant
- `COLLECTED` — driver picked up order
- `DELIVERED` — order delivered to customer
- `CANCELLED` — order cancelled (by customer, driver, or system)
- `FAILED` — order failed

### Current State

**NOT implemented.** No handler or route exists.

---

## Webhook 5: Integration Status

GrabFood notifies when the integration status changes.

### Spec

- **Method:** `POST`
- **Portal field:** "Integration status endpoint"
- **Auth:** `X-Grab-Signature` HMAC-SHA256
- **Response:** HTTP 200 always

### Request Body

```jsonc
{
  "partnerMerchantID": "PARTNER-001",
  "grabMerchantID": "M-GRAB-ID",
  "integrationStatus": "ACTIVE"           // "INACTIVE" | "ACTIVE" | "SYNCING" | "FAILED"
}
```

### Current State

**NOT implemented.** Low priority for MVP.

---

## Webhook 6: Push Grab Menu

GrabFood pushes menu changes made by the merchant through the GrabFood Merchant App back to the partner.

### Spec

- **Method:** `POST`
- **Portal field:** "Push Grab menu endpoint"
- **Response:** HTTP 200 always

### Current State

**NOT implemented.** Low priority — we are the source of truth for our menu.

---

## What Exists Today

| Component | File | Status |
|-----------|------|--------|
| HTTP router | `convex/http.ts` | 2 routes registered (`/api/grabfood/order`, `/api/grabfood/menu-sync`) |
| Webhook handlers | `convex/integrations/grabfood/webhooks.ts` | Order + menu-sync handlers scaffolded |
| HMAC validation | `webhooks.ts:validateHmacSignature()` | Implemented but HMAC secret is hardcoded `undefined` |
| Order upsert | `convex/grabfoodOrders/mutations.ts:upsertOrder` | Functional — used by both sync and webhook |
| Outbound adapter | `convex/integrations/grabfood/adapter.ts` | All outbound actions built (pauseStore, batchUpdateAvailability, syncOrders, etc.) |

---

## What Needs To Be Built (Phase 27.0.1 Scope)

### HIGH Priority (required for App Simulator)

| # | Endpoint | Work |
|---|----------|------|
| 1 | **GET /api/grabfood/menu** | New handler — query `menuProducts` + `externalProductMappings` where source="grabfood", build Section-based menu JSON, return as response body |
| 2 | **POST /api/grabfood/order** | Enhance existing — fix HMAC secret sourcing (read from `platformCredentials` table instead of env var) |
| 3 | **POST /api/grabfood/order/state** | New handler — parse order state update, update `grabfoodOrders` record with new state, log state change |

### MEDIUM Priority (complete integration)

| # | Endpoint | Work |
|---|----------|------|
| 4 | **POST /api/grabfood/menu-sync** | Enhance existing — persist sync status to `syncLogs` table, handle PARTIAL_FAILURE errors |
| 5 | **HMAC secret from DB** | Move HMAC secret from env var to `platformCredentials` table, add to Settings tab UI |

### LOW Priority (can defer)

| # | Endpoint | Work |
|---|----------|------|
| 6 | **POST /api/grabfood/integration-status** | New handler — log status changes, update outlet status in DB |
| 7 | **POST /api/grabfood/menu/push** | New handler — receive menu edits from GrabFood Merchant App |
| 8 | **OAuth token endpoint** | Only if we want GrabFood to auth with us (not needed if we trust HMAC) |

---

## Key Implementation Notes

1. **Convex `httpAction` is NOT `"use node"`** — `process.env` is not available. Use `ctx.runQuery` to fetch secrets from DB.

2. **Always return HTTP 200** — even on errors. GrabFood retries non-200 responses.

3. **Dedup via `requestID`** — Menu sync webhooks include a `requestID` UUID. Store seen IDs and ignore duplicates.

4. **Prices in minor units** — IDR has `exponent: 0`, so `50000` = Rp 50,000. No division needed for IDR.

5. **Order acceptance timeout** — For `MANUAL` acceptance orders, you must call `POST /partner/v1/order/prepare` with `toState: "ACCEPTED"` within the configured timeout (usually 5 minutes) or the order auto-cancels.

6. **Menu item IDs** — The `id` field in menu items becomes the `externalID` that GrabFood sends back in order items. Map these to our `menuProducts` via `externalProductMappings.externalProductCode`.

7. **Staging URL format** — `https://<deployment-name>.convex.site/api/grabfood/<endpoint>`. For our staging: `https://exciting-fennec-671.convex.site/api/grabfood/...`. For production: `https://decisive-wombat-7.convex.site/api/grabfood/...`.

---

## GrabFood Partner API Outbound Endpoints (Already Built)

Reference for completeness — these are endpoints WE call on GrabFood's API.

| Action | Method | GrabFood Endpoint | Our Adapter Function |
|--------|--------|-------------------|---------------------|
| Get OAuth token | POST | `/grabid/v1/oauth2/token` | `resolveToken()` |
| Accept/reject order | POST | `/partner/v1/order/prepare` | `respondToOrder` |
| Mark order ready | POST | `/partner/v1/orders/mark` | `markOrderReady` |
| Get store status | GET | `/partner/v1/merchants/{merchantID}/store/status` | `getStoreStatus` |
| Pause/unpause store | PUT | `/partner/v1/merchant/pause` | `pauseStore` |
| Push menu to GrabFood | PUT | `/partner/v1/menu` | Not yet implemented |
| Batch update menu | PUT | `/partner/v1/batch/menu` | `batchUpdateAvailability` |
| Notify menu change | POST | `/partner/v1/merchant/menu/notification` | `notifyMenuUpdate` |
| List orders | GET | `/partner/v1/orders` | `syncOrders` |

### Pause Store Body Format

```json
{ "merchantID": "M-ID", "isPause": true, "duration": "30m" }
```

`duration` accepts exactly 3 values: `"30m"`, `"1h"`, `"24h"`. Only required when `isPause: true`.

### Batch Menu Update Body Format

```json
{
  "merchantID": "M-ID",
  "field": "AVAILABILITY",
  "menuEntities": [
    { "id": "ITEM-01", "availableStatus": "UNAVAILABLE", "maxStock": 0 }
  ]
}
```

---

## App Simulator Test Cases (from Developer Portal)

These test scenarios must pass before going live:

| # | Test Case | Required Endpoint |
|---|-----------|-------------------|
| 1 | Reorder the menu ranking | Get menu |
| 2 | Set up different menu sections | Get menu |
| 3 | Change menu item details | Get menu |
| 4 | Update a menu item's image | Get menu |
| 5 | Mark an item as out of stock | Get menu + Batch menu update |
| 6 | Place an order with manual acceptance | Submit order + Order prepare (accept) |
| 7 | Place an order with auto acceptance | Submit order |
| 8 | Place an order with your campaign | Submit order + Campaign handling |
| 9 | Place an order and track status on POS | Submit order + Push order state |
| 10 | Place an order for self-collection | Submit order (orderType: SELF_PICKUP) |
| 11 | Place an order delivered by restaurant | Submit order (orderType: DELIVERY, restaurant fulfills) |
| 12 | Place an order for dine-in | Submit order (orderType: DINE_IN) |
| 13 | Mark an order ready | Submit order + Mark order ready (outbound) |
| 14 | Set new order ready time | Submit order + Order ready time (outbound) |

**Minimum for functional testing:** Get menu (#1-5) + Submit order (#6-7) + Push order state (#9).
