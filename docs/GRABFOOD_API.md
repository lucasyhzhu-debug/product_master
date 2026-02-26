# GrabFood Partner API — Integration Reference

> **Source:** Official GrabFood SDK (OpenAPI v1.1.3) — Go, Python, Java SDKs
> **SDK Version:** v1.0.2 | **Last Updated:** 2026-02-24

---

## Table of Contents

1. [Overview](#overview)
2. [Base URLs & Environments](#base-urls--environments)
3. [Authentication](#authentication)
4. [Order Management](#order-management)
   - [Order Object](#order-object)
   - [Accept or Reject Order](#accept-or-reject-order)
   - [Cancel Order](#cancel-order)
   - [Check Order Cancelable](#check-order-cancelable)
   - [Edit Order](#edit-order)
   - [Mark Order Ready](#mark-order-ready)
   - [Update Order Ready Time](#update-order-ready-time)
   - [Update Delivery State](#update-delivery-state)
   - [List Orders](#list-orders)
5. [Store Management](#store-management)
6. [Menu Management](#menu-management)
   - [Menu Structure](#menu-structure)
   - [Update Menu (Single Record)](#update-menu-single-record)
   - [Batch Update Menu](#batch-update-menu)
   - [Notify Menu Update](#notify-menu-update)
   - [Trace Menu Sync](#trace-menu-sync)
7. [Campaign Management](#campaign-management)
8. [Vouchers & Membership](#vouchers--membership)
9. [Self-Serve / Onboarding](#self-serve--onboarding)
10. [Webhooks](#webhooks)
11. [Data Models Reference](#data-models-reference)
12. [Error Handling](#error-handling)
13. [SDK References](#sdk-references)
14. [Integration Checklist](#integration-checklist)

---

## Overview

The GrabFood Partner API (v1.1.3) enables POS systems to integrate with GrabFood for real-time order management, menu synchronisation, store control, and promotions.

**Capabilities:**
- Receive and respond to customer orders in real time
- Sync menu items, prices, and availability from POS to GrabFood
- Control store open/close and operating hours
- Create and manage promotional campaigns
- Process dine-in vouchers and membership events
- Track integration health via webhooks

All APIs use **REST** with **JSON** bodies. Authentication uses **OAuth2 Client Credentials**.

> **Minor unit pricing:** All price/amount fields throughout this API are in the **minor unit** of the local currency (e.g., IDR 25,000 is represented as `25000`; for currencies with 2 decimal places, $19.00 = `1900`).

---

## Base URLs & Environments

| Environment | OAuth2 Base URL | Partner API Base URL |
|---|---|---|
| **Production** | `https://api.grab.com` | `https://partner-api.grab.com/grabfood` |
| **Staging** | `https://api.grab.com` | `https://partner-api.grab.com/grabfood-sandbox` |

All partner API paths below are **relative to the Partner API Base URL**.

---

## Authentication

### Flow: OAuth2 Client Credentials

```
POST https://api.grab.com/grabid/v1/oauth2/token
Content-Type: application/x-www-form-urlencoded
```

**Request Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `client_id` | string | Yes | Your GrabFood partner client ID |
| `client_secret` | string | Yes | Your GrabFood partner client secret |
| `grant_type` | string | Yes | Always `"client_credentials"` |
| `scope` | string | Yes | `"grabfood.partner_api"` |

**Response:**

```json
{
  "access_token": "eyJhbGc...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

**Using the Token:**

```
Authorization: Bearer <access_token>
Content-Type: application/json
```

> **Token caching rule:** Store the token on receipt and reuse it for the full `expires_in` duration. Only request a new token after expiry. Requesting a new token per API call is not permitted.

---

## Order Management

### Endpoints Summary

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/partner/v1/order/prepare` | Accept or reject an incoming order |
| `PUT` | `/partner/v1/order/cancel` | Cancel an order |
| `GET` | `/partner/v1/order/cancelable` | Check if an order can be cancelled |
| `PUT` | `/partner/v1/orders/{orderID}` | Edit order items or quantities |
| `POST` | `/partner/v1/orders/mark` | Mark an order as ready for pickup |
| `PUT` | `/partner/v1/order/readytime` | Update estimated ready time |
| `POST` | `/partner/v1/order/delivery` | Update delivery state |
| `GET` | `/partner/v1/orders` | List orders (paginated) |

---

### Order Object

The full `Order` object is delivered via webhook when a customer places an order, and returned in `GET /partner/v1/orders`.

| Field | Type | Required | Description |
|---|---|---|---|
| `orderID` | string | Yes | The order's ID in GrabFood's system |
| `shortOrderNumber` | string | Yes | Short daily-unique order number per merchant |
| `merchantID` | string | Yes | Merchant's ID in GrabFood's database |
| `partnerMerchantID` | string | No | Merchant's ID in your (partner) database |
| `paymentType` | string | Yes | Payment method used by customer |
| `cutlery` | boolean | Yes | Whether customer requested cutlery |
| `orderTime` | string | Yes | UTC time order was placed (ISO 8601 / RFC 3339) |
| `submitTime` | string | No | Order submit time (ISO 8601) |
| `completeTime` | string | No | Order completion time (ISO 8601) |
| `scheduledTime` | string | No | Scheduled delivery time; empty for on-demand orders |
| `orderState` | string | No | Current state of the order |
| `currency` | Currency | Yes | Currency used for this order |
| `featureFlags` | OrderFeatureFlags | Yes | Feature toggles for this order |
| `items` | OrderItem[] | Yes | Array of ordered items |
| `campaigns` | OrderCampaign[] | No | Campaigns applied to this order |
| `promos` | OrderPromo[] | No | Promo codes applied to this order |
| `price` | OrderPrice | Yes | Full pricing breakdown |
| `dineIn` | DineIn | No | Dine-in metadata (table number, eater count) |
| `receiver` | Receiver | No | Delivery recipient details |
| `orderReadyEstimation` | OrderReadyEstimation | No | Estimated ready time for the order |
| `membershipID` | string | No | Loyalty membership ID (if applicable) |

#### OrderItem

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Item's external ID in your (partner) system |
| `grabItemID` | string | Yes | Item's ID in GrabFood's system — use this for `EditOrder` |
| `quantity` | integer | Yes | Number of this item ordered |
| `price` | integer | Yes | Price for single item + modifiers (minor unit, tax-inclusive) |
| `tax` | integer | No | Tax for single item + modifiers (minor unit). Defaults to `0` if no tax config |
| `specifications` | string | No | Customer's extra note for this item. Empty if no note |
| `outOfStockInstruction` | OutOfStockInstruction | No | Customer's instruction if item is out of stock |
| `modifiers` | OrderItemModifier[] | No | Array of selected modifiers |

#### OutOfStockInstruction

| Field | Type | Description |
|---|---|---|
| `title` | string | Short instruction message |
| `instructionType` | string | `"CONTACT"` (disabled by default — contact your integration manager to enable), `"SPECIFIC_ITEM"`, `"CANCEL_ITEM"`, `"REFUND"` |
| `replacementItemID` | string | Partner system item ID. Only present when `instructionType = "SPECIFIC_ITEM"` |
| `replacementGrabItemID` | string | GrabFood item ID. Only present when `instructionType = "SPECIFIC_ITEM"` |

#### OrderPrice

| Field | Type | Required | Description |
|---|---|---|---|
| `subtotal` | integer | Yes | Total item + modifier price (tax-inclusive, minor unit) |
| `tax` | integer | No | GrabFood's tax portion (minor unit) |
| `merchantChargeFee` | integer | No | Additional merchant fee (tax-inclusive, 100% paid to merchant) |
| `grabFundPromo` | integer | No | Grab's promo fund (minor unit). Present only for `CASH` or `DeliveredByRestaurant` orders |
| `merchantFundPromo` | integer | No | Merchant's promo fund (minor unit), calculated by funded ratio |
| `basketPromo` | integer | No | Total promo applied to basket items only (excludes delivery fees) |
| `deliveryFee` | integer | No | Delivery fee (minor unit). Present only for `CASH` or `DeliveredByRestaurant` orders |
| `smallOrderFee` | integer | No | Fee for orders below minimum value. `CASH` + `DeliveredByRestaurant` only |
| `eaterPayment` | integer | No | Total amount paid by customer (minor unit, excludes additional Grab fees) |

#### OrderCampaign

| Field | Type | Description |
|---|---|---|
| `id` | string | Campaign ID assigned by GrabFood |
| `name` | string | Campaign display name auto-generated by Grab for the customer app |
| `campaignNameForMex` | string | Campaign name as provided by the merchant at creation |
| `level` | string | Campaign level identifier |
| `type` | string | Campaign type classifier |
| `usageCount` | integer | Redemption count of this campaign in this order |
| `mexFundedRatio` | integer | Merchant-funded ratio (percentage) |
| `deductedAmount` | integer | Total discount applied (minor unit), based on usage count |
| `deductedPart` | string | Part of the order the discount applies to |
| `appliedItemIDs` | string[] | Item IDs receiving discount under this campaign |
| `freeItem` | OrderFreeItem | Free item granted by this campaign (if applicable) |

#### OrderPromo

| Field | Type | Description |
|---|---|---|
| `code` | string | Promo code applied |
| `description` | string | Promo description |
| `name` | string | Promotion name |
| `promoAmount` | integer | Promo amount in local currency (rounded to whole number) |
| `mexFundedRatio` | integer | Merchant's funded ratio for this promo (percentage) |
| `mexFundedAmount` | integer | Merchant's promo fund (minor unit), calculated from funded ratio |
| `targetedPrice` | integer | Order basket subtotal (minor unit) |
| `promoAmountInMin` | integer | Promo amount in minor unit |

#### DineIn

| Field | Type | Description |
|---|---|---|
| `tableID` | string | Table number |
| `eaterCount` | integer | Number of diners |

#### Receiver

| Field | Type | Description |
|---|---|---|
| `name` | string | Recipient's name |
| `phones` | string | Recipient's phone number |
| `address` | Address | Delivery address |

---

### Accept or Reject Order

```
POST /partner/v1/order/prepare
```

Called after receiving a new order webhook. Must be called promptly to avoid auto-rejection timeout.

**Request:**

```json
{
  "orderID": "GRAB-ORDER-123",
  "toState": "ACCEPTED"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `orderID` | string | Yes | GrabFood order ID from the webhook |
| `toState` | string | Yes | `"ACCEPTED"` or `"REJECTED"` |

---

### Cancel Order

```
PUT /partner/v1/order/cancel
```

**Request:**

```json
{
  "orderID": "GRAB-ORDER-123",
  "merchantID": "MERCHANT-456",
  "cancelCode": "OUT_OF_STOCK"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `orderID` | string | Yes | The order to cancel |
| `merchantID` | string | Yes | Your GrabFood merchant ID |
| `cancelCode` | string | Yes | Cancellation reason (see CancelCode enum below) |

**CancelCode enum (common values):**

| Code | Description |
|---|---|
| `OUT_OF_STOCK` | One or more items are out of stock |
| `STORE_CLOSED` | Store is closed unexpectedly |
| `KITCHEN_BUSY` | Kitchen cannot fulfil the order |
| `CUSTOMER_REQUEST` | Customer requested cancellation |

---

### Check Order Cancelable

```
GET /partner/v1/order/cancelable?orderID={orderID}
```

**Response:**

```json
{
  "cancelAble": true,
  "cancelReasons": [
    { "code": "OUT_OF_STOCK", "description": "Item out of stock" }
  ],
  "limitType": "COUNT",
  "limitTimes": 2,
  "nonCancellationReason": null
}
```

| Field | Type | Description |
|---|---|---|
| `cancelAble` | boolean | Whether the order can currently be cancelled |
| `cancelReasons` | CancelReason[] | Available cancellation reason codes |
| `limitType` | string | Type of cancellation limit: `"TIME"` or `"COUNT"` |
| `limitTimes` | integer | Remaining allowed cancellations |
| `nonCancellationReason` | string | Explains why cancellation is blocked (only when `cancelAble: false`) |

---

### Edit Order

```
PUT /partner/v1/orders/{orderID}
```

Used to mark specific items as unavailable or adjust quantities after accepting an order.

**Request:**

```json
{
  "orderID": "GRAB-ORDER-123",
  "items": [
    {
      "itemID": "ITEM-789",
      "status": "UNAVAILABLE",
      "quantity": 0,
      "isExternalItemID": false
    }
  ],
  "onlyRecalculate": false
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `orderID` | string | Yes | Order to edit |
| `items` | EditOrderItem[] | Yes | Items to update |
| `onlyRecalculate` | boolean | No | If `true`, calculates the new price without persisting changes (dry-run) |

**EditOrderItem:**

| Field | Type | Required | Description |
|---|---|---|---|
| `itemID` | string | Yes | Item identifier |
| `status` | string | Yes | `"AVAILABLE"` or `"UNAVAILABLE"` |
| `quantity` | integer | No | New quantity. Set to `0` to remove the item |
| `isExternalItemID` | boolean | No | Set `true` if `itemID` is from your system. Set `false` to use `grabItemID` |

> **Tip:** Use `grabItemID` from the `OrderItem` object (not your external ID) for safest matching. Set `isExternalItemID: false`.

---

### Mark Order Ready

```
POST /partner/v1/orders/mark
```

Signals that the order has been prepared and is ready for pickup by the driver or customer.

**Request:**

```json
{
  "orderID": "GRAB-ORDER-123",
  "markStatus": "READY"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `orderID` | string | Yes | The order to mark |
| `markStatus` | string | Yes | `"READY"` |

---

### Update Order Ready Time

```
PUT /partner/v1/order/readytime
```

Adjusts the estimated time the order will be ready (e.g., if kitchen is running behind).

**Request:**

```json
{
  "orderID": "GRAB-ORDER-123",
  "readyTime": "2026-02-24T14:30:00Z"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `orderID` | string | Yes | The order to update |
| `readyTime` | string | Yes | New estimated ready time (ISO 8601 / RFC 3339) |

---

### Update Delivery State

```
POST /partner/v1/order/delivery
```

Used when merchant handles delivery (e.g., `DeliveredByRestaurant` orders).

**Request:**

```json
{
  "orderID": "GRAB-ORDER-123",
  "deliveryState": "PICKED_UP"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `orderID` | string | Yes | The order to update |
| `deliveryState` | string | Yes | New delivery state (e.g., `"PICKED_UP"`, `"DELIVERED"`) |

---

### List Orders

```
GET /partner/v1/orders
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `merchantID` | string | Yes | Filter by GrabFood merchant ID |
| `fromDate` | string | No | Start of date range (ISO 8601) |
| `toDate` | string | No | End of date range (ISO 8601) |
| `orderIDs` | string | No | Comma-separated order IDs to fetch |
| `page` | integer | No | Page number for pagination (starts at 1) |

**Response:**

```json
{
  "orders": [ /* Order[] */ ],
  "more": true
}
```

| Field | Type | Description |
|---|---|---|
| `orders` | Order[] | Array of full order objects |
| `more` | boolean | `true` if additional pages exist — increment `page` to fetch next |

---

## Store Management

### Endpoints Summary

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/partner/v1/merchants/{merchantID}/store/status` | Get current open/closed status |
| `GET` | `/partner/v2/merchants/{merchantID}/store/hours` | Get full operating hours |
| `PUT` | `/partner/v1/merchant/pause` | Temporarily pause the store |
| `PUT` | `/partner/v1/merchants/{merchantID}/store/opening-hours` | Update regular delivery hours |
| `PUT` | `/partner/v1/merchants/{merchantID}/store/dine-in-hours` | Update dine-in hours |
| `PUT` | `/partner/v2/merchants/{merchantID}/store/special-opening-hour` | Set special/holiday hours |

---

### Get Store Status

```
GET /partner/v1/merchants/{merchantID}/store/status
```

**Response:**

```json
{
  "closeReason": "",
  "isInSpecialOpeningHourRange": false,
  "isOpen": true
}
```

| Field | Type | Description |
|---|---|---|
| `closeReason` | string | Reason store is closed. Blank = open. Values: `""`, `"mex_paused"`, `"ops_paused"`, `"out_of_opening_hours"`, `"out_of_special_opening_hours"`, `"inactive"`, `"restricted"`, `"suspended"` |
| `isInSpecialOpeningHourRange` | boolean | Whether store is in a special opening hour range |
| `isOpen` | boolean | Whether the store is currently open |

---

### Get Store Hours

```
GET /partner/v2/merchants/{merchantID}/store/hours
```

Returns the full weekly schedule including delivery and dine-in hours.

---

### Pause Store

```
PUT /partner/v1/merchant/pause
```

Temporarily makes the store invisible/unavailable to customers on GrabFood.

**Request:**

```json
{
  "merchantID": "MERCHANT-456",
  "pauseDuration": 60
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `merchantID` | string | Yes | Your GrabFood merchant ID |
| `pauseDuration` | integer | Yes | Duration in minutes to pause. Set `0` to unpause immediately |

---

### Update Delivery Hours

```
PUT /partner/v1/merchants/{merchantID}/store/opening-hours
```

**Request:**

```json
{
  "merchantID": "MERCHANT-456",
  "periods": [
    { "day": "MONDAY",    "openTime": "09:00", "closeTime": "22:00" },
    { "day": "TUESDAY",   "openTime": "09:00", "closeTime": "22:00" },
    { "day": "SATURDAY",  "openTime": "10:00", "closeTime": "23:00" },
    { "day": "SUNDAY",    "openTime": "10:00", "closeTime": "21:00" }
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `merchantID` | string | Yes | Your GrabFood merchant ID |
| `periods` | ServiceHour[] | Yes | Weekly schedule. Days not included are treated as closed |

**ServiceHour:**

| Field | Type | Description |
|---|---|---|
| `day` | string | `"MONDAY"`, `"TUESDAY"`, `"WEDNESDAY"`, `"THURSDAY"`, `"FRIDAY"`, `"SATURDAY"`, `"SUNDAY"` |
| `openTime` | string | Opening time in `HH:MM` (24h format) |
| `closeTime` | string | Closing time in `HH:MM` (24h format) |

---

### Update Dine-In Hours

```
PUT /partner/v1/merchants/{merchantID}/store/dine-in-hours
```

Same structure as Update Delivery Hours. Used when dine-in schedule differs from delivery.

---

### Update Special Hours

```
PUT /partner/v2/merchants/{merchantID}/store/special-opening-hour
```

Used for public holidays, special events, or one-off schedule overrides.

**Request:**

```json
{
  "merchantID": "MERCHANT-456",
  "specialHours": [
    {
      "date": "2026-08-17",
      "openTime": "10:00",
      "closeTime": "15:00",
      "isClosed": false
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `date` | string | Date in `YYYY-MM-DD` format |
| `openTime` | string | Opening time (`HH:MM`). Ignored if `isClosed: true` |
| `closeTime` | string | Closing time (`HH:MM`). Ignored if `isClosed: true` |
| `isClosed` | boolean | `true` = store is fully closed on this date |

---

## Menu Management

### Menu Structure

A GrabFood menu is hierarchical:

```
Menu
└── MenuSection (optional grouping)
    └── MenuCategory  (max 300 items)
        └── MenuItem
            └── ModifierGroup  (max 30 per item)
                └── MenuModifier  (max 100 per group)
```

---

### Endpoints Summary

| Method | Path | Purpose |
|---|---|---|
| `PUT` | `/partner/v1/menu` | Replace/update a full menu record |
| `PUT` | `/partner/v1/batch/menu` | Update specific fields across multiple items |
| `POST` | `/partner/v1/merchant/menu/notification` | Trigger menu re-sync on Grab's side |
| `GET` | `/partner/v1/merchant/menu/trace` | Poll menu sync job status |

---

### Menu Structure — Full Object

#### MenuCategory

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Category ID in your system (must be unique) |
| `name` | string | Yes | Display name of the category |
| `nameTranslation` | map | No | Translated name. Max 1 language |
| `availableStatus` | string | Yes | `"AVAILABLE"` or `"UNAVAILABLE"` |
| `sellingTimeID` | string | Yes | Selling time window for all items in this category |
| `sequence` | integer | No | Display order of the category within the menu |
| `items` | MenuItem[] | Yes | Max **300 items** per category |

#### MenuItem

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Item ID in your system (must be unique) |
| `name` | string | Yes | Item display name |
| `nameTranslation` | map | No | Translated name. Max 1 language |
| `availableStatus` | string | Yes | `"AVAILABLE"` or `"UNAVAILABLE"`. Set `maxStock: 0` when marking unavailable |
| `description` | string | No | Item description. Max 2000 chars (Vietnam region) |
| `descriptionTranslation` | map | No | Translated description. Max 1 language |
| `price` | integer | Yes | Item price in minor unit (e.g., `25000` = IDR 25,000) |
| `photos` | string[] | No | Image URLs. Only **1 image** currently supported |
| `specialType` | string | No | Classification tag for special item types |
| `taxable` | boolean | No | **Indonesia only** — marks item as taxable |
| `barcode` | string | No | GTIN barcode number (8, 12, 13, or 14 numeric digits) |
| `sellingTimeID` | string | No | Override selling time for this item. Inherits from category if empty |
| `maxStock` | integer | No | Available inventory count. Empty = unlimited. Must be `0` when `availableStatus = "UNAVAILABLE"` |
| `sequence` | integer | No | Display order within the category |
| `advancedPricing` | AdvancedPricing | No | Pricing per service type / order channel |
| `purchasability` | Purchasability | No | Controls which channels can purchase this item |
| `modifierGroups` | ModifierGroup[] | No | Max **30 modifier groups** per item |

#### ModifierGroup

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Modifier group ID in your system (must be unique) |
| `name` | string | Yes | Group display name (e.g., "Choose your sauce") |
| `nameTranslation` | map | No | Translated name. Max 1 language |
| `availableStatus` | string | Yes | `"AVAILABLE"` or `"UNAVAILABLE"`. Mark unavailable when required selections cannot be fulfilled |
| `selectionRangeMin` | integer | No | Minimum number of modifiers customer must select |
| `selectionRangeMax` | integer | Yes | Maximum number of modifiers customer can select |
| `sequence` | integer | No | Display order within the item |
| `modifiers` | MenuModifier[] | No | Max **100 modifiers** per group |

#### MenuModifier

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Modifier ID in your system (must be unique) |
| `name` | string | Yes | Modifier display name (e.g., "Extra Spicy") |
| `nameTranslation` | map | No | Translated name. Max 1 language |
| `availableStatus` | string | Yes | `"AVAILABLE"` or `"UNAVAILABLE"` |
| `price` | integer | No | Modifier price in minor unit. `0` = free |
| `barcode` | string | No | GTIN barcode (8, 12, 13, or 14 numeric digits) |
| `sequence` | integer | No | Display order within the modifier group |
| `advancedPricing` | AdvancedPricing | No | Per-channel pricing override |

#### Purchasability

Controls whether an item can be purchased on each fulfillment channel. All fields are optional booleans. Omitting a field means no change to its current state.

| Field | Channel |
|---|---|
| `deliveryOnDemandGrabApp` | Grab app — on-demand delivery |
| `deliveryScheduledGrabApp` | Grab app — scheduled/future delivery |
| `selfPickUpOnDemandGrabApp` | Grab app — self-pickup |
| `dineInOnDemandGrabApp` | Grab app — dine-in ordering |
| `deliveryOnDemandStoreFront` | Web storefront — on-demand delivery |
| `deliveryScheduledStoreFront` | Web storefront — scheduled delivery |
| `selfPickUpOnDemandStoreFront` | Web storefront — self-pickup |

---

### Update Menu (Single Record)

```
PUT /partner/v1/menu
```

Pushes a full or partial menu structure to GrabFood. Use to set menu for the first time or do full replacements.

**Request fields (UpdateMenuRequest):**

| Field | Type | Required | Description |
|---|---|---|---|
| `merchantID` | string | Yes | GrabFood merchant ID |
| `field` | string | Yes | Record type being updated (e.g., `"ITEM"`, `"CATEGORY"`, `"MODIFIER"`) |
| `id` | string | Yes | ID of the record in your system |
| `price` | integer | No | New price in minor unit |
| `availableStatus` | string | No | `"AVAILABLE"` or `"UNAVAILABLE"` |
| `maxStock` | integer | No | New stock level. Auto-decrements with orders. Set to `0` to mark out of stock |
| `advancedPricings` | UpdateAdvancedPricing[] | No | Per-channel pricing overrides |
| `purchasabilities` | UpdatePurchasability[] | No | Per-channel purchasability overrides |
| `name` | string | No | Required only when `field = "MODIFIER"` |
| `isFree` | boolean | No | Explicitly set a modifier price to zero (requires specific validation rules) |

---

### Batch Update Menu

```
PUT /partner/v1/batch/menu
```

Efficiently updates a single field across many items at once. More efficient than calling Update Menu repeatedly.

**Request:**

```json
{
  "merchantID": "MERCHANT-456",
  "field": "AVAILABILITY",
  "menuEntities": [
    {
      "id": "ITEM-001",
      "availableStatus": "UNAVAILABLE",
      "maxStock": 0
    },
    {
      "id": "ITEM-002",
      "availableStatus": "AVAILABLE"
    }
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `merchantID` | string | Yes | GrabFood merchant ID |
| `field` | string | Yes | Field being updated across all entities: `"PRICE"`, `"AVAILABILITY"`, `"STOCK"`, `"MODIFIER"` |
| `menuEntities` | object[] | Yes | Array of partial update objects matching the field type |

---

### Notify Menu Update

```
POST /partner/v1/merchant/menu/notification
```

Call this **after** completing a menu update to trigger GrabFood to pull and validate the changes. Required for changes to take effect in the app.

**Request:**

```json
{
  "merchantID": "MERCHANT-456"
}
```

**Response header:** Contains a `Job-ID` UUID — save this to track the sync via `Trace Menu Sync`.

---

### Trace Menu Sync

```
GET /partner/v1/merchant/menu/trace?merchantID={merchantID}&jobID={jobID}
```

Polls the status of an ongoing or completed menu sync job.

**Query Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `merchantID` | string | Yes | GrabFood merchant ID |
| `jobID` | string | No | UUID from the `Notify Menu Update` response header |

**Response:**

```json
{
  "status": "SUCCESS",
  "jobID": "abc-123-uuid",
  "updatedAt": "2026-02-24T10:00:00Z"
}
```

| Status Value | Description |
|---|---|
| `PENDING` | Sync job queued, not yet started |
| `IN_PROGRESS` | Sync currently running |
| `SUCCESS` | All items synced successfully |
| `PARTIAL_FAILURE` | Some items failed (check `errors` array) |
| `FAILED` | Sync job failed entirely |

---

## Campaign Management

### Endpoints Summary

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/partner/v1/campaigns` | Create a promotional campaign |
| `GET` | `/partner/v1/campaigns` | List campaigns |
| `PUT` | `/partner/v1/campaigns/{campaign_id}` | Update a campaign |
| `DELETE` | `/partner/v1/campaigns/{campaign_id}` | Delete a campaign |

---

### Create Campaign

```
POST /partner/v1/campaigns
```

**Request:**

```json
{
  "merchantID": "MERCHANT-456",
  "name": "Weekend Flash Sale",
  "conditions": {
    "startTime": "2026-03-01T00:00:00Z",
    "endTime": "2026-03-02T23:59:59Z",
    "eaterType": "ALL",
    "minBasketAmount": 50000,
    "bundleQuantity": 2,
    "workingHour": "ALL_DAY"
  },
  "discount": {
    "type": "PERCENTAGE",
    "scope": {
      "type": "ITEM",
      "objectIDs": ["ITEM-001", "ITEM-002"]
    },
    "value": 20,
    "cap": 30000
  },
  "quotas": {
    "totalRedemptions": 100
  },
  "customTag": "weekend_promo"
}
```

**Top-level fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `merchantID` | string | Yes | Your GrabFood merchant ID |
| `name` | string | Yes | Campaign name for merchant reference |
| `conditions` | CampaignConditions | Yes | Eligibility rules |
| `discount` | CampaignDiscount | Yes | Discount configuration |
| `quotas` | CampaignQuotas | No | Redemption limits |
| `customTag` | string | No | Internal tag for your own tracking |

**CampaignConditions:**

| Field | Type | Required | Description |
|---|---|---|---|
| `startTime` | string | Yes | Campaign start time (ISO 8601) |
| `endTime` | string | Yes | Campaign end time (ISO 8601) |
| `eaterType` | string | Yes | `"ALL"`, `"NEW"`, or `"EXISTING"` customers |
| `minBasketAmount` | integer | No | Minimum order subtotal to qualify (minor unit) |
| `bundleQuantity` | integer | No | Minimum item quantity required for bundle deals |
| `workingHour` | string | No | Restrict campaign to store's working hours only |

**CampaignDiscount:**

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | Yes | `"PERCENTAGE"` or `"FIXED_AMOUNT"` |
| `scope.type` | string | Yes | `"CATEGORY"` (applies to full category) or `"ITEM"` |
| `scope.objectIDs` | string[] | No | IDs of categories or items the discount applies to |
| `value` | number | No | Discount amount: percentage (0–100) or fixed amount (minor unit) |
| `cap` | integer | No | Maximum discount cap in minor unit (for `PERCENTAGE` type only) |

**Response:**

```json
{
  "id": "CAMPAIGN-789"
}
```

---

### List Campaigns

```
GET /partner/v1/campaigns?merchantID={merchantID}
```

**Response:**

```json
{
  "ongoing": [ /* Campaign[] */ ],
  "upcoming": [ /* Campaign[] */ ]
}
```

| Field | Description |
|---|---|
| `ongoing` | Campaigns currently active |
| `upcoming` | Campaigns scheduled but not yet started |

---

### Update Campaign

```
PUT /partner/v1/campaigns/{campaign_id}
```

Uses the same request body structure as Create Campaign.

---

### Delete Campaign

```
DELETE /partner/v1/campaigns/{campaign_id}
```

No request body required. Permanently removes the campaign.

---

## Vouchers & Membership

### Endpoints Summary

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/partner/v1/dinein/voucher` | Retrieve a dine-in voucher |
| `POST` | `/partner/v1/dinein/voucher/redeem` | Redeem a dine-in voucher |
| `POST` | `/partner/v1/membership/notify` | Notify GrabFood of membership webview event |

---

### Get Dine-In Voucher

```
GET /partner/v1/dinein/voucher?merchantID={merchantID}&voucherCode={code}
```

Returns the details and validity of a dine-in voucher for display before redemption.

---

### Redeem Dine-In Voucher

```
POST /partner/v1/dinein/voucher/redeem
```

**Request:**

```json
{
  "merchantID": "MERCHANT-456",
  "voucherCode": "GRAB10OFF",
  "orderID": "GRAB-ORDER-123"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `merchantID` | string | Yes | GrabFood merchant ID |
| `voucherCode` | string | Yes | The voucher code to redeem |
| `orderID` | string | Yes | The order the voucher is applied to |

---

### Notify Membership

```
POST /partner/v1/membership/notify
```

Used to notify GrabFood when a membership-related event occurs (e.g., tier upgrade displayed in webview).

---

## Self-Serve / Onboarding

### Create Self-Serve Journey

```
POST /partner/v1/self-serve/activation
```

Initiates the merchant onboarding activation flow for new merchants.

**Response:**

```json
{
  "activationUrl": "https://merchant.grab.com/onboard/abc123"
}
```

Redirect the merchant's browser to `activationUrl` to complete their GrabFood onboarding.

---

## Webhooks

Grab **pushes** events to your registered HTTPS endpoint via `POST`. Your endpoint must respond with `HTTP 200` within a reasonable timeout to acknowledge receipt. Grab may retry on failure.

### Webhook Event Types

| Event | Payload Model | Trigger |
|---|---|---|
| **New Order** | `Order` | Customer places an order at your merchant |
| **Menu Sync Result** | `MenuSyncWebhookRequest` | Menu sync job completes (success or failure) |
| **Integration Status** | `PushIntegrationStatusWebhookRequest` | POS integration status changes |

---

### New Order Webhook

GrabFood pushes the full `Order` object (documented above) to your webhook endpoint when a customer places an order.

**Recommended handling pattern:**
1. Receive the POST, parse the `Order` body
2. Return `HTTP 200` **immediately** (do not wait for processing)
3. Process the order asynchronously in the background
4. Call `POST /partner/v1/order/prepare` to accept or reject

> **Important:** If you do not acknowledge the order within Grab's timeout window, the order may be auto-cancelled.

---

### Menu Sync Result Webhook

Delivered after calling `POST /partner/v1/merchant/menu/notification`.

**Payload (MenuSyncWebhookRequest):**

| Field | Type | Description |
|---|---|---|
| `requestID` | string | UUID uniquely identifying this webhook request. Treat duplicate IDs as retransmissions (idempotent) |
| `merchantID` | string | GrabFood merchant ID |
| `partnerMerchantID` | string | Your system's merchant ID |
| `jobID` | string | UUID matching the job ID from the Notify Menu Update response header |
| `updatedAt` | string | Timestamp of sync status change (ISO 8601 / RFC 3339) |
| `status` | string | `"SUCCESS"`, `"PARTIAL_FAILURE"`, or `"FAILED"` |
| `errors` | string[] | Error messages. Empty array when `status = "SUCCESS"` |

**Example payload:**

```json
{
  "requestID": "550e8400-e29b-41d4-a716-446655440000",
  "merchantID": "MERCHANT-456",
  "partnerMerchantID": "YOUR-MERCHANT-456",
  "jobID": "abc-123-uuid",
  "updatedAt": "2026-02-24T10:05:00Z",
  "status": "PARTIAL_FAILURE",
  "errors": [
    "Item ITEM-999 not found in GrabFood catalogue"
  ]
}
```

---

### Integration Status Webhook

Notifies your system when the POS integration connection state changes.

**Payload (PushIntegrationStatusWebhookRequest):**

| Field | Type | Required | Description |
|---|---|---|---|
| `partnerMerchantID` | string | Yes | Merchant ID in your system |
| `grabMerchantID` | string | Yes | Merchant ID in GrabFood's system |
| `integrationStatus` | string | Yes | Current integration state |

**IntegrationStatus enum:**

| Value | Description |
|---|---|
| `ACTIVE` | Integration is live and operational |
| `INACTIVE` | Integration has been deactivated |
| `SYNCING` | Integration is currently syncing data |
| `FAILED` | Integration has encountered a failure |

**Example payload:**

```json
{
  "partnerMerchantID": "YOUR-MERCHANT-456",
  "grabMerchantID": "MERCHANT-456",
  "integrationStatus": "ACTIVE"
}
```

---

## Data Models Reference

### Address

| Field | Type | Description |
|---|---|---|
| `address` | string | Street address string |
| `coordinates` | Coordinates | GPS coordinates |
| `coordinates.latitude` | number | Latitude |
| `coordinates.longitude` | number | Longitude |
| `deliveryInstruction` | string | Customer's delivery instructions |
| `poiID` | string | Point of Interest ID |
| `poiSource` | string | Source of the POI |
| `postcode` | string | Postal/ZIP code |
| `unitNumber` | string | Apartment/unit number |

### Currency

| Field | Type | Description |
|---|---|---|
| `code` | string | ISO 4217 currency code (e.g., `"IDR"`, `"SGD"`, `"MYR"`) |
| `symbol` | string | Display symbol (e.g., `"Rp"`, `"S$"`, `"RM"`) |
| `exponent` | integer | Decimal places used by this currency |

### Minor Unit Pricing

All `price`, `amount`, and monetary fields are in **minor units**:

| Currency | Minor Unit | Example |
|---|---|---|
| IDR (Indonesian Rupiah) | No decimal | `25000` = Rp 25,000 |
| SGD (Singapore Dollar) | 2 decimal places | `1900` = S$19.00 |
| MYR (Malaysian Ringgit) | 2 decimal places | `1500` = RM15.00 |

---

## Error Handling

### Error Response Shape

```json
{
  "message": "Order cannot be cancelled at this stage",
  "reason": "INVALID_STATE_TRANSITION",
  "target": "orderID"
}
```

| Field | Type | Description |
|---|---|---|
| `message` | string | Human-readable error description |
| `reason` | string | Machine-readable error code for programmatic handling |
| `target` | string | The specific field or resource that caused the error |

### HTTP Status Codes

| Code | Meaning | Action |
|---|---|---|
| `200` | Success | — |
| `400` | Bad request | Check request body and parameters |
| `401` | Unauthorized | Token is missing, invalid, or expired — re-authenticate |
| `403` | Forbidden | Your credentials lack permission for this operation |
| `404` | Not found | Resource ID is incorrect or does not exist |
| `409` | Conflict | Invalid state transition (e.g., cancelling a completed order) |
| `429` | Rate limited | Back off and retry after the `Retry-After` header duration |
| `500` | Server error | GrabFood-side error — log and retry with exponential backoff |

### Menu Sync Errors (MenuEntityError)

When a menu sync `PARTIAL_FAILURE` occurs, each failed entity contains:

| Field | Type | Description |
|---|---|---|
| `entityID` | string | The ID of the failed item/category/modifier |
| `entityType` | string | `"ITEM"`, `"CATEGORY"`, `"MODIFIER_GROUP"`, `"MODIFIER"` |
| `reason` | string | Machine-readable failure code |
| `description` | string | Human-readable failure explanation |

---

## SDK References

Official Grab-maintained SDKs generated from OpenAPI v1.1.3 spec:

| Language | Repository | Min Version |
|---|---|---|
| **Go** | [grab/grabfood-api-sdk-go](https://github.com/grab/grabfood-api-sdk-go) | Go 1.11+ |
| **Java** | [grab/grabfood-api-sdk-java](https://github.com/grab/grabfood-api-sdk-java) | — |
| **Python** | [grab/grabfood-api-sdk-python](https://github.com/grab/grabfood-api-sdk-python) | Python 3.7+ |

**Install Python SDK:**
```bash
pip install git+https://github.com/grab/grabfood-api-sdk-python.git
```

**Python quick start:**
```python
import grabfood

# Staging environment
configuration = grabfood.Configuration(host=grabfood.STG_ENV)

with grabfood.ApiClient(configuration) as api_client:
    # Authenticate
    auth_api = grabfood.GetOauthGrabApi(api_client)
    token_response = auth_api.get_oauth_grab(
        grabfood.GrabOauthRequest(
            client_id="YOUR_CLIENT_ID",
            client_secret="YOUR_CLIENT_SECRET",
            grant_type="client_credentials",
            scope="grabfood.partner_api"
        )
    )
    access_token = token_response.access_token

    # Accept an order
    order_api = grabfood.AcceptRejectOrderApi(api_client)
    order_api.accept_reject_order(
        grabfood.AcceptOrderRequest(order_id="GRAB-ORDER-123", to_state="ACCEPTED"),
        authorization=f"Bearer {access_token}"
    )
```

All SDKs provide:
- 150+ typed request/response model classes
- Staging and production environment configurations (`STG_ENV`, `PRD_ENV`, `STG_AUTH_ENV`, `PRD_AUTH_ENV`)
- OAuth2 token management helpers
- Utility functions for optional/nullable fields

---

## Integration Checklist

Implement in this order for a complete POS integration:

**Phase 1 — Foundation**
- [ ] Obtain partner credentials (`client_id`, `client_secret`) from GrabFood
- [ ] Implement OAuth2 token fetch with caching (respect `expires_in`)
- [ ] Register webhook HTTPS endpoint with GrabFood

**Phase 2 — Order Flow**
- [ ] Handle new order webhook → parse `Order` object → display in POS
- [ ] Respond `HTTP 200` to webhook immediately (async processing)
- [ ] Implement accept/reject (`POST /partner/v1/order/prepare`)
- [ ] Implement mark ready (`POST /partner/v1/orders/mark`)
- [ ] Implement out-of-stock handling → edit order (`PUT /partner/v1/orders/{orderID}`)

**Phase 3 — Menu Sync**
- [ ] Build menu push (`PUT /partner/v1/menu` or `PUT /partner/v1/batch/menu`)
- [ ] Call notify after every menu update (`POST /partner/v1/merchant/menu/notification`)
- [ ] Poll/handle menu sync webhook for failures
- [ ] Implement real-time availability updates (`availableStatus` + `maxStock`)

**Phase 4 — Store Control**
- [ ] Implement store pause/unpause (`PUT /partner/v1/merchant/pause`)
- [ ] Sync operating hours changes to GrabFood

**Phase 5 — Reliability**
- [ ] Handle `PushIntegrationStatusWebhookRequest` for integration health monitoring
- [ ] Implement exponential backoff for `429` / `500` responses
- [ ] Deduplicate webhook requests using `requestID`

---

*Official developer portal: [developer.grab.com](https://developer.grab.com)*
*SDK source: [github.com/grab/grabfood-api-sdk-go](https://github.com/grab/grabfood-api-sdk-go) | [grabfood-api-sdk-python](https://github.com/grab/grabfood-api-sdk-python) | [grabfood-api-sdk-java](https://github.com/grab/grabfood-api-sdk-java)*
