# GrabFood Webhooks Full Integration — Design Document

> **Phase:** 27.0.1
> **Date:** 2026-02-26
> **Status:** Approved
> **Reference:** [GrabFood Webhooks & Partner Config Reference](./2026-02-26-grabfood-webhooks-partner-config.md)

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Full integration (all 6 endpoints) | Need complete coverage for App Simulator test cases |
| HMAC auth | DB-stored in `platformCredentials.hmacSecret` | `process.env` unavailable in Convex `httpAction`; DB approach manageable via Settings tab |
| Order flow | Store as GrabFood order only | Safer for MVP — no auto-creation of production orders |
| Menu source | Only mapped products (`externalProductMappings` source="grabfood") | Explicit control over what appears on GrabFood |
| Architecture | Monolithic `webhooks.ts` | All handlers share HMAC validation pattern; 6 handlers at ~50 lines each |
| Menu grouping | Single category ("Frollie Menu") | Small menu, simple structure; can refine later |
| Driver info | Store in `grabfoodOrders.driverInfo` | Useful for tracking and Orders tab display |
| Menu push handling | Log only | We are the menu source of truth |
| Settings UX | Copyable webhook URLs + HMAC secret field | Easy portal configuration |

---

## Schema Changes

### `platformCredentials` table

Add field:
```
hmacSecret: v.optional(v.string())   // HMAC-SHA256 shared secret for webhook validation
```

### `grabfoodOrders` table

Add fields:
```
orderState: v.optional(v.string())   // Latest state from GrabFood (DRIVER_ALLOCATED, COLLECTED, DELIVERED, etc.)
driverInfo: v.optional(v.object({    // Driver details from order state webhook
  name: v.optional(v.string()),
  phone: v.optional(v.string()),
  photoURL: v.optional(v.string()),
  licensePlate: v.optional(v.string()),
}))
```

---

## HTTP Routes

All routes registered in `convex/http.ts`. All handlers in `convex/integrations/grabfood/webhooks.ts`.

| # | Route | Method | Handler | Status |
|---|-------|--------|---------|--------|
| 1 | `/api/grabfood/menu` | GET | `handleGetMenuWebhook` | **NEW** |
| 2 | `/api/grabfood/order` | POST | `handleOrderWebhook` | **ENHANCE** (fix HMAC sourcing) |
| 3 | `/api/grabfood/order/state` | POST | `handleOrderStateWebhook` | **NEW** |
| 4 | `/api/grabfood/menu-sync` | POST | `handleMenuSyncWebhook` | **ENHANCE** (persist to syncLogs) |
| 5 | `/api/grabfood/integration-status` | POST | `handleIntegrationStatusWebhook` | **NEW** |
| 6 | `/api/grabfood/menu/push` | POST | `handleMenuPushWebhook` | **NEW** |

---

## Handler Designs

### Shared: HMAC Validation

All handlers share this flow:
1. `ctx.runQuery(internal.platformCredentials.queries.getHmacSecret, { platformId: "grabfood" })` → get secret from DB
2. Call existing `validateHmacSignature(body, signatureHeader, hmacSecret)`
3. If invalid AND secret was configured → log warning, return HTTP 200 (per GrabFood spec)
4. If valid OR no secret configured → proceed with processing

### 1. GET /api/grabfood/menu — Serve Menu JSON

**Purpose:** GrabFood fetches our current menu.

**Data flow:**
1. Validate HMAC (on empty body for GET)
2. Extract `merchantID` from query string
3. Query `externalProductMappings` where `source="grabfood"` → get mapped products
4. For each mapping, fetch linked `menuProduct` for name, price, description
5. Build Old Structure (Section Based) JSON:
   ```json
   {
     "merchantID": "<from query>",
     "currency": { "code": "IDR", "symbol": "Rp", "exponent": 0 },
     "sellingTimes": [{ "startTime": "00:00", "endTime": "23:59", "id": "all-day", "name": "All Day" }],
     "sections": [{
       "id": "main",
       "name": "Frollie Menu",
       "sellingTimeID": "all-day",
       "categories": [{
         "id": "snacks",
         "name": "Snacks",
         "items": [{ "id": "<externalProductCode>", "name": "...", "price": ..., "availableStatus": "AVAILABLE" }]
       }]
     }]
   }
   ```
6. Return HTTP 200 with JSON body

**Item ID contract:** `externalProductMappings.externalProductCode` = menu item `id` = what GrabFood sends back in order items.

### 2. POST /api/grabfood/order — Receive New Orders (Enhanced)

**Changes from current:**
- Fix HMAC: read secret from `platformCredentials` via `ctx.runQuery` instead of `process.env`
- No other logic changes — existing upsert flow is correct

### 3. POST /api/grabfood/order/state — Receive Order State Updates

**Purpose:** GrabFood pushes order lifecycle events (driver assigned, picked up, delivered, cancelled).

**Data flow:**
1. Validate HMAC → parse JSON
2. Extract `orderID`, `orderState`, `driverETA`, `driver`
3. Schedule async mutation: find `grabfoodOrders` by `orderID`, update `orderState` and `driverInfo`
4. Return HTTP 200

**New mutation:** `grabfoodOrders.mutations.updateOrderState`
```
args: { orderID: string, orderState: string, driverInfo?: object }
```
Finds order by `orderID` field, patches `orderState` and optionally `driverInfo`.

### 4. POST /api/grabfood/menu-sync — Menu Sync Result (Enhanced)

**Changes from current:**
- Fix HMAC sourcing (same as order webhook)
- Persist sync result to `syncLogs` table via `internal.externalData.mutations.createSyncLog`
- On PARTIAL_FAILURE or FAILED: store error details in sync log `errorMessage`
- Dedup on `requestID` — check if sync log with matching requestID exists, skip if so

### 5. POST /api/grabfood/integration-status — Integration Status

**Data flow:**
1. Validate HMAC → parse JSON
2. Extract `grabMerchantID`, `integrationStatus`
3. Find matching `externalOutlets` record by merchantID
4. Update outlet with integration status (may add `integrationStatus` field to `externalOutlets`)
5. Log to syncLogs
6. Return HTTP 200

### 6. POST /api/grabfood/menu/push — Menu Push (Log Only)

**Data flow:**
1. Validate HMAC → parse JSON
2. Log the full payload to console
3. Create sync log entry with `syncType: "webhook"`, payload summary in metadata
4. Return HTTP 200

We do NOT apply menu changes — we are the source of truth.

---

## Frontend Changes

### GrabFoodManager Settings Tab

**Add to Settings tab:**

1. **HMAC Secret field** — password input with show/hide toggle
   - Saves to `platformCredentials.hmacSecret` via existing credential update mutation
   - Label: "Webhook HMAC Secret"
   - Help text: "From GrabFood Developer Portal when registering webhook URLs"

2. **Webhook URLs section** — read-only list with copy buttons
   - Title: "Webhook Endpoints (paste into GrabFood Developer Portal)"
   - Display each endpoint URL based on Convex deployment URL:
     ```
     Get menu endpoint:        https://{deployment}.convex.site/api/grabfood/menu
     Submit order endpoint:    https://{deployment}.convex.site/api/grabfood/order
     Push order state endpoint: https://{deployment}.convex.site/api/grabfood/order/state
     Menu Sync Webhook:        https://{deployment}.convex.site/api/grabfood/menu-sync
     Integration status:       https://{deployment}.convex.site/api/grabfood/integration-status
     Push Grab menu endpoint:  https://{deployment}.convex.site/api/grabfood/menu/push
     ```
   - Each with a copy-to-clipboard button (Lucide `Copy` icon)
   - Deployment URL: derive from `window.location.origin` or hardcode from env

### Orders Tab Enhancement (Optional)

Display `orderState` and `driverInfo` in the orders table if present:
- New column: "Status" showing the GrabFood order state badge
- Expandable row: show driver name + phone + license plate when available

---

## Files Modified

| File | Change |
|------|--------|
| `convex/schema.ts` | Add `hmacSecret` to platformCredentials, add `orderState`/`driverInfo` to grabfoodOrders |
| `convex/integrations/grabfood/webhooks.ts` | Add 4 new handlers, enhance 2 existing |
| `convex/http.ts` | Register 4 new routes |
| `convex/grabfoodOrders/mutations.ts` | Add `updateOrderState` internal mutation |
| `convex/platformCredentials/queries.ts` | Add `getHmacSecret` internal query |
| `convex/platformCredentials/mutations.ts` | Update to handle `hmacSecret` field |
| `convex/externalData/queries.ts` | May need `listProductMappingsInternal` enhancement |
| `src/pages/GrabFoodManager.tsx` | Settings tab: HMAC field + webhook URLs |

---

## Success Criteria

- [ ] All 6 webhook endpoints return HTTP 200
- [ ] HMAC validation works when secret is configured
- [ ] GET /api/grabfood/menu returns valid Section-based menu JSON with mapped products
- [ ] POST /api/grabfood/order processes incoming orders into grabfoodOrders table
- [ ] POST /api/grabfood/order/state updates order state and driver info
- [ ] Settings tab shows HMAC secret field and copyable webhook URLs
- [ ] `npm run build` passes
- [ ] App Simulator test cases #1-7 can be attempted (menu + order flows)
