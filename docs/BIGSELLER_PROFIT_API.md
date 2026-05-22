# BigSeller API — Complete Integration Reference

> **Source:** Reverse-engineered from browser HAR captures (Feb 2026, refreshed May 2026)
> **Base URL:** `https://www.bigseller.com`
> **Auth:** JWT session cookie (`muc_token`)
> **Last Verified:** 2026-05-22 (Phase 83-03 — token auto-refresh)
>
> **Schema drift history:** Between 2026-02 and 2026-05, BigSeller silently added 6 new required
> fields to the pageList request body (`settleStatus`, `transactionStatus`, `fbsOrder`, `groupType`,
> `orderStatus`, `totalCurrency`). Omitting any causes `code:-1` with no field-name indication.
> See "Shared Request Schema (Profit)" and "Known Limitations" entry 11 for details.

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
   - [Login Flow](#login-flow)
   - [CAPTCHA](#captcha)
   - [Password Encoding](#password-encoding)
   - [Token Acquisition](#token-acquisition)
   - [JWT Structure](#jwt-structure)
   - [Session Cookies](#session-cookies)
   - [Required Request Headers](#required-request-headers)
   - [Automation Assessment](#automation-assessment)
3. [The Sync-First Workflow](#the-sync-first-workflow)
4. [Profit Analytics Endpoints](#profit-analytics-endpoints)
   - [GET sync/task/detail/get.json](#get-synctaskdetailgetjson)
   - [GET sync/task/detail/new/get.json](#get-synctaskdetailnewgetjson)
   - [POST sync/task/create.json](#post-synctaskcreatejson)
   - [POST listStatsData.json (profit)](#post-liststatsdatajson-profit)
   - [POST pageList.json (common)](#post-pagelistjson-common)
   - [POST shopee/pageList.json](#post-shopeepagelistjson)
   - [POST tiktok/pageList.json](#post-tiktokpagelistjson)
5. [Shop & Store APIs](#shop--store-apis)
   - [GET shopsAndPlatforms.json](#get-shopsandplatformsjson)
   - [GET shop/group/page.json](#get-shopgrouppagejson)
   - [GET statis/profit/initInfo.json](#get-statisprofitinitiinfojson)
   - [GET shop/checkShop/auth/invalid.json](#get-shopcheckshopauthinvalidjson)
6. [Order & Sales Analytics APIs](#order--sales-analytics-apis)
   - [POST getOrderTotalData.json](#post-getordertotaldatajson)
   - [POST orderSalesStatistics.json](#post-ordersalesstatisticsjson)
   - [POST lastTwoDaysStatsData.json](#post-lasttwodaysstatsdatajson)
   - [POST listStatsData.json (sales)](#post-liststatsdatajson-sales)
7. [Product/SKU Analytics APIs](#productsku-analytics-apis)
   - [POST items/getItemCountNew.json](#post-itemsgetitemcountnewjson)
   - [POST items/pageList.json](#post-itemspagelistjson)
8. [Account & Utility APIs](#account--utility-apis)
9. [Shared Request Schema (Profit)](#shared-request-schema-profit)
10. [Data Glossary](#data-glossary)
11. [Known Limitations](#known-limitations)
12. [Integration Notes for Frollie](#integration-notes-for-frollie)

---

## Overview

BigSeller is a **multi-marketplace aggregator** that connects to Shopee, TikTok Shop,
Tokopedia, Lazada, and other Southeast Asian e-commerce platforms. It consolidates order
management, inventory, and profit analytics into a single dashboard.

**For Frollie**, BigSeller connects two shops:
- **Frollie - S** (Shopee, ID: `5090946`)
- **Frollie - T** (TikTok Shop, ID: `5092855`)

BigSeller's profit analytics system is a **two-phase async API**:

```
Phase 1 — Sync:   Trigger a background job that pulls order data from
                  connected platforms and calculates profit figures for
                  a given date range.

Phase 2 — Query:  Once sync is complete (taskStatus = "complete"), query
                  the processed data via listStatsData (daily chart) and
                  pageList (order-level table).
```

**Critical:** `listStatsData` and `pageList` both return `code: -1` with
`"Failed, please try again later"` if called while a sync task is still
`"progress"`. They only respond with data when `taskStatus = "complete"`.

---

## Authentication

### Login Flow

BigSeller uses a **single-step login** via one POST endpoint. No OAuth/SSO or
external identity providers are involved.

```
1. User on https://www.bigseller.com/en_US/login.htm (login page)
2. CAPTCHA image displayed — user solves it
3. POST /api_v2/api/v3/auth/loginsub.json with credentials + CAPTCHA
4. Server responds with HTTP 200, JWT in `muctoken` response header
5. Browser stores JWT as `muc_token` cookie (client-side JS)
6. GET /api/v1/isLogin.json → {"code":0,"data":true} (session verification)
7. Redirect to /web/dashboard.htm
8. All subsequent API calls authenticated via cookie (no Authorization header)
```

### CAPTCHA

**Image CAPTCHA is required for login.** BigSeller uses its own server-generated
image CAPTCHA (NOT reCAPTCHA, hCaptcha, or Tencent CAPTCHA).

The login request includes two CAPTCHA-related fields:

| Field | Example | Purpose |
|-------|---------|---------|
| `picVerificationCode` | `"x33J"` | 4-character alphanumeric answer to the CAPTCHA image |
| `accessCode` | `"61oe9c3Y1an7_UBi"` | 16-char server-side session key identifying which CAPTCHA was shown |

The CAPTCHA image is fetched when the login page loads (endpoint not captured in HAR,
likely `/api/v1/auth/captcha` or similar). The `accessCode` is returned with the image
and must be submitted alongside the user's answer.

### Password Encoding

The password is **NOT sent in plaintext**. It arrives as a **101-character hex string**,
which is neither standard SHA-256 (64 chars) nor SHA-512 (128 chars). This is likely:

- Client-side RSA encryption using a public key (variable-length output)
- Or a custom encoding scheme (hash + salt + padding)

The encryption function would need to be reverse-engineered from BigSeller's JavaScript
bundle to replicate programmatically.

### Token Acquisition

**Endpoint:** `POST https://www.bigseller.com/api_v2/api/v3/auth/loginsub.json`

**Request:**

```json
{
  "account": "user@example.com",
  "password": "022eaeb66b110eff...",
  "accessCode": "61oe9c3Y1an7_UBi",
  "picVerificationCode": "x33J",
  "fingerPrint": "028dd38063d451c6ec...",
  "authType": "email",
  "phoneAccountCode": "",
  "bsMetrics": "fp-35ab60f3b021a572"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `account` | string | Email address or sub-account identifier |
| `password` | string | Client-side encrypted (101-char hex) |
| `accessCode` | string | CAPTCHA session key (16 chars) |
| `picVerificationCode` | string | CAPTCHA answer (4 chars) |
| `fingerPrint` | string | Browser fingerprint (165-char hex) — canvas/WebGL |
| `authType` | string | `"email"` for email login |
| `phoneAccountCode` | string | Empty for email login |
| `bsMetrics` | string | Device fingerprint hash, format `"fp-{hex}"` |

**Response:**

- HTTP 200 with **empty body** (body size = 0)
- Token delivered via response headers:
  - `muctoken`: Full JWT token (HS256 signed)
  - `muc_login_account_type`: `EMAIL_ACCOUNT_TYPE`

### JWT Structure

The `muc_token` JWT (HS256) encodes session metadata:

**Header:**
```json
{"typ": "JWT", "alg": "HS256"}
```

**Payload:**
```json
{
  "sub": "user",
  "exp": 1773762167,
  "iat": 1772034167,
  "info": {
    "requestId": "muc_yarqfaruwthuh3blcl",
    "loginTime": 1771948367524,
    "refreshTime": 1771948367524,
    "puid": 1355260,
    "requestIp": "139.194.207.239",
    "requestClient": "Device:Desktop|System:Win10,10.0|Client:Chrome,0",
    "uid": 1356678,
    "randomStr": "91ef7f49-f6e7-47f9-9f82-ba8f1f82871a",
    "phoneAccountLogin": false,
    "deviceId": ""
  }
}
```

| Field | Example | Notes |
|-------|---------|-------|
| `info.uid` | `1356678` | Sub-account user ID |
| `info.puid` | `1355260` | Parent/main account UID |
| `info.requestIp` | `139.194.207.239` | IP at login time |
| `info.loginTime` | `1771948367524` | Unix ms |
| `info.refreshTime` | `1771948367524` | Token refresh ms |
| `exp` | `1773762167` | Expiry (Unix seconds) |
| `iat` | `1772034167` | Issued at (Unix seconds) |

**Token lifetime:** ~20 days (`exp - iat = 1,728,000 seconds`). The `refreshTime`
updates on each authenticated request, potentially extending the session. The previous
estimate of ~30 days was based on `exp` relative to `loginTime`; the actual `iat`-based
lifetime is ~20 days.

### Token auto-refresh (Phase 83-03)

Every successful response from any `bigseller.com` endpoint carries a fresher
`muctoken` JWT in the response headers, with `iat` set to the current request time
and `exp = iat + 20 days`. The BigSeller sync action (`fetchOrders`) captures this
header on every page, accumulates the freshest token across all pages/platforms,
and persists it ONCE at the end of a successful sync via
`platformCredentials.mutations.updateToken` (`lastRefreshStatus:
"auto-refreshed-from-response"`). This slides the 20-day sliding-`exp` TTL forward
indefinitely, so the nightly cron never dies from token decay and staff stop
manually repasting tokens.

Defensive guards (the persist is skipped if any apply): empty header, refreshed
token equals the current token, or any auth error (HTML or JSON `code:401006`)
observed during the sync. The persist is wrapped in try/catch so a write failure
never fails the sync. A 2-state freshness banner on the BigSeller admin card
warns (yellow) when the token expires in under 24h and blocks (red) once expired —
after auto-refresh lands this should rarely fire.

### Session Cookies

After login, the browser stores:

| Cookie | Value | Purpose |
|--------|-------|---------|
| `muc_token` | `<JWT>` | Primary auth credential |
| `muc_login_account_type` | `EMAIL_ACCOUNT_TYPE` | Login method indicator |

All subsequent API calls use these cookies for authentication. No `Authorization`
header is needed — BigSeller is purely cookie-based.

### Required Request Headers

**For authenticated API calls (all endpoints):**

```http
Cookie: muc_token=<JWT>; muc_login_account_type=EMAIL_ACCOUNT_TYPE
Accept: application/json, text/plain, */*
Content-Type: application/json
Referer: https://www.bigseller.com/
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...
X-Requested-With: XMLHttpRequest
clienttype: 1
```

| Header | Required | Notes |
|--------|----------|-------|
| `Cookie` | **Yes** | Must include `muc_token` |
| `Content-Type` | **Yes** for POST | `application/json` for most; some use `application/x-www-form-urlencoded` |
| `clienttype` | **Yes** | Always `1` (web client) |
| `Referer` | Recommended | `https://www.bigseller.com/` |
| `X-Requested-With` | Recommended | `XMLHttpRequest` |
| `User-Agent` | Recommended | Standard browser UA string |

> **Note:** GET endpoints work without `User-Agent`, `Referer`, and `X-Requested-With`.
> POST endpoints may reject requests missing these headers.

### Automation Assessment

| Aspect | Finding | Automation Impact |
|--------|---------|-------------------|
| **CAPTCHA** | Server-generated image CAPTCHA required | **BLOCKER** — cannot automate without OCR |
| **Password** | Client-side encrypted (101-char hex) | Must reverse-engineer JS encryption |
| **Fingerprint** | Device fingerprint required | Must generate or hardcode |
| **Token lifetime** | ~20 days | Once obtained, long-lived |
| **Session mechanism** | Cookie-based | Simple to replay once token obtained |
| **No OAuth/SSO** | Direct auth only | No external provider complications |

**Recommendation:** Use **paste-token** approach. Admin logs into BigSeller in a
browser, extracts `muc_token` cookie, pastes it into Frollie. Token lasts ~20 days.
Headless login is impractical due to image CAPTCHA + encrypted password + fingerprint.

---

## The Sync-First Workflow

```
+-------------------------------------------------------+
|  1. Trigger sync                                       |
|     POST /api/v1/statis/profit/sync/task/create.json   |
|     body: { startTime, endTime, timeType }             |
+---------------------------+---------------------------+
                            |
                            v
+-------------------------------------------------------+
|  2. Poll until complete                                |
|     GET sync/task/detail/new/get.json                  |
|     -> check data.progressInfo.taskStatus              |
|       "progress" -> keep polling                       |
|       "complete" -> proceed                            |
|       "fail"     -> retry or check shop connections    |
+---------------------------+---------------------------+
                            |
              +-------------+-------------+
              v                           v
+-------------------+       +------------------------+
|  3a. Chart data   |       |  3b. Order table data  |
|  listStatsData    |       |  pageList.json          |
|  (daily totals)   |       |  (per-order rows)      |
+-------------------+       +------------------------+
```

**Typical sync duration:** ~1-10 minutes depending on order volume and platform
responsiveness. Frollie's observed sync: ~8 minutes for 19 orders across 2 shops.

**Re-sync requirement:** Data is not persisted indefinitely. To query a new date range,
trigger a new sync task for that range. Only one sync task can run at a time.

---

## Profit Analytics Endpoints

All profit endpoints use base path: `/api/v1/statis/profit/`

---

### GET sync/task/detail/get.json

Returns **overall** progress of the most recent sync task (no per-shop breakdown).

**Request**

```http
GET /api/v1/statis/profit/sync/task/detail/get.json
```

No request body or query parameters required.

**Response**

```json
{
  "code": 0,
  "msg": "Successfully",
  "data": {
    "taskStatus": "complete",
    "startTime": "2026-01-26",
    "endTime": "2026-02-25",
    "successOrderNum": 19,
    "failOrderNum": 0,
    "taskSchedule": "100%"
  }
}
```

| Field | Type | Values |
|-------|------|--------|
| `taskStatus` | string | `"progress"`, `"complete"`, `"fail"` |
| `startTime` | string | `YYYY-MM-DD` |
| `endTime` | string | `YYYY-MM-DD` |
| `successOrderNum` | int | Orders successfully synced |
| `failOrderNum` | int | Orders that failed to sync |
| `taskSchedule` | string | `"0%"` - `"100%"` |

---

### GET sync/task/detail/new/get.json

Returns **per-shop breakdown** of the most recent sync task. More detailed than the
plain `detail/get` endpoint.

**Request**

```http
GET /api/v1/statis/profit/sync/task/detail/new/get.json
```

No request body or query parameters required.

**Response**

```json
{
  "code": 0,
  "msg": "Successfully",
  "data": {
    "progressInfo": {
      "taskStatus": "complete",
      "startTime": "2026-01-26",
      "endTime": "2026-02-25",
      "successOrderNum": 19,
      "failOrderNum": 0,
      "taskSchedule": "100%"
    },
    "detailList": [
      {
        "id": 1338900,
        "shopId": 5090946,
        "shopName": "Frollie - S",
        "taskStatus": "success",
        "successOrderNum": 18,
        "taskSchedule": "100%",
        "timeType": "orderCreatedTime",
        "errorMsg": null
      },
      {
        "id": 1338901,
        "shopId": 5092855,
        "shopName": "Frollie - T",
        "taskStatus": "success",
        "successOrderNum": 1,
        "taskSchedule": "100%",
        "timeType": "orderCreatedTime",
        "errorMsg": null
      }
    ]
  }
}
```

**`detailList` item fields:**

| Field | Type | Notes |
|-------|------|-------|
| `id` | int | Sync task detail ID (per shop) |
| `shopId` | int | BigSeller shop ID |
| `shopName` | string | Human-readable shop name |
| `taskStatus` | string | `"success"`, `"progress"`, `"fail"` |
| `successOrderNum` | int | Orders synced for this shop |
| `taskSchedule` | string | `"0%"` - `"100%"` |
| `timeType` | string | `"orderCreatedTime"` or `"orderPayTime"` |
| `errorMsg` | string\|null | Error detail if `taskStatus = "fail"` |

**Use this endpoint for polling** -- `progressInfo.taskStatus` goes from
`"progress"` -> `"complete"` when all shops finish.

---

### POST sync/task/create.json

Triggers a new profit sync for a given date range and set of shops.

**Request**

```http
POST /api/v1/statis/profit/sync/task/create.json
Content-Type: application/json
```

```json
{
  "startTime": "2026-01-26",
  "endTime": "2026-02-25",
  "timeType": "orderCreatedTime"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `startTime` | string | Yes | `YYYY-MM-DD` format |
| `endTime` | string | Yes | `YYYY-MM-DD` format |
| `timeType` | string | Yes | `"orderCreatedTime"` or `"orderPayTime"` |

**Success Response**

```json
{
  "code": 0,
  "msg": "Successfully",
  "data": null
}
```

**Error: Sync Already Running**

```json
{
  "code": -1,
  "msg": "The sync task is in progress, please try again later",
  "data": null
}
```

**Constraints:**
- Only one sync task can run at a time per account
- Max date range is 31 days (platform limit)
- Syncing all shops simultaneously -- cannot target a single shop

---

### POST listStatsData.json (profit)

Returns **daily aggregated profit stats** across the date range. Powers the
line/bar chart on the BigSeller profit analytics page.

**Request**

```http
POST /api/v1/statis/profit/listStatsData.json
Content-Type: application/json
```

Uses the [Shared Request Schema (Profit)](#shared-request-schema-profit).

**Response**

```json
{
  "code": 0,
  "msg": "Successfully",
  "data": {
    "dataList": [
      {
        "statDate": "2026-01-26",
        "currency": null,
        "shopId": null,
        "saleAmount": 0,
        "platformIncome": 0,
        "costFee": 0,
        "profit": 0,
        "discountFee": 0,
        "profitMargin": 0
      },
      {
        "statDate": "2026-02-23",
        "currency": null,
        "shopId": null,
        "saleAmount": 1785000.00,
        "platformIncome": 1770500.00,
        "costFee": 0.00,
        "profit": 1770500.00,
        "discountFee": 0.00,
        "profitMargin": 0.9919
      }
    ]
  }
}
```

**`dataList` item fields:**

| Field | Type | Notes |
|-------|------|-------|
| `statDate` | string | `YYYY-MM-DD` -- one entry per day in the range |
| `saleAmount` | decimal | Gross order value (inc. shipping paid by buyer) |
| `platformIncome` | decimal | What Frollie actually received from the platform |
| `costFee` | decimal | COGS -- 0 until product costs are entered in BigSeller |
| `profit` | decimal | `platformIncome - costFee` |
| `discountFee` | decimal | Platform/voucher discounts applied |
| `profitMargin` | decimal | `profit / saleAmount` as a ratio (e.g. `0.9919` = 99.19%) |
| `currency` | string\|null | Null when aggregating across shops |
| `shopId` | int\|null | Null when aggregating across shops |

**Sample: Frollie data (2026-01-26 to 2026-02-25)**

| Date | Sale Amount | Platform Income | Profit | Margin |
|------|------------|-----------------|--------|--------|
| 2026-02-07 | 45,000 | 37,900 | 37,900 | 84.22% |
| 2026-02-23 | 1,785,000 | 1,770,500 | 1,770,500 | 99.19% |
| 2026-02-24 | 1,170,000 | 1,170,000 | 1,170,000 | 100.00% |
| 2026-02-25 | 90,000 | 90,000 | 90,000 | 100.00% |

---

### POST pageList.json (common)

Returns **paginated order-level profit transactions** with per-order revenue,
fee, and SKU breakdown. Powers the main table on the profit analytics page.

**Request**

```http
POST /api/v1/statis/profit/pageList.json
Content-Type: application/json
```

Uses the [Shared Request Schema (Profit)](#shared-request-schema-profit) with
`"platformTemplate": "common"`.

> **Important:** All fields in this payload are required. Omitting any required
> field causes the server to return `code: -1` with no indication of which field
> is missing.

**Response**

```json
{
  "code": 0,
  "msg": "Successfully",
  "data": {
    "itemPageVo": {
      "pageNo": 1,
      "pageSize": 50,
      "totalPage": 1,
      "totalSize": 19,
      "rows": [ /* order objects -- see below */ ]
    },
    "totalProfit": 3068400.00,
    "totalPlatformIncome": 3068400.00,
    "totalCostFee": 0.00,
    "totalSaleAmount": 3090000.00,
    "totalProfitMargin": 0.993,
    "totalGrossProfitMargin": "0.00%",
    "totalOrderAmount": 3348163.00,
    "totalSellerTradeFee": 0.00,
    "totalCommissionFee": -5850.00,
    "totalServiceFee": 0.00,
    "totalDiscountFee": 0.00,
    "totalReturnRefund": 0.00,
    "totalOtherFee": -1250.00,
    "totalBuyerShippingFee": 271100.00,
    "totalSellerShippingFee": -14500.00,
    "totalMarketingFee": 0.00,
    "totalPackingFee": 0,
    "totalRent": 0,
    "totalAdvertisingCost": 0,
    "totalOtherCost": 0,
    "totalShopAdjustmentFee": 0,
    "totalPlatformOtherFee": 0,
    "totalAllSkuNum": 61,
    "orderProfitCycleComparisonMap": {
      "saleAmount": {
        "growthRatio": "--",
        "displayType": 4,
        "nowCurrDateTime": "2026-01-26~2026-02-25",
        "lastDatePeriod": "2025-12-26~2026-01-25",
        "currentData": 3090000.00,
        "comparisonData": null
      }
    }
  }
}
```

#### Order Object (`rows[]`)

Each item in `rows` represents one platform order:

```json
{
  "shopId": 5090946,
  "shopName": "Frollie - S",
  "platform": "shopee",
  "platformOrderId": "260224HUDFPPPN",
  "orderState": "shipped",
  "orderStateStr": "Shipped",
  "orderTime": 1771939564000,
  "orderCreatedTimeMulti": "24 Feb 2026 13:25",
  "orderTimeMulti": "24 Feb 2026 13:26",
  "settleTimeMulti": null,
  "completedTimeMulti": null,
  "adjustmentUpdateTimeMulti": null,
  "saleAmount": 180000.00,
  "platformIncome": 180000.00,
  "orderAmount": 185400.00,
  "profit": 180000.00,
  "profitMargin": "100.00%",
  "grossProfitMargin": "98.09%",
  "sortProfitMarginDouble": 1.0,
  "grossProfitMarginDouble": 0.9809,
  "costFee": 0.00,
  "buyerShippingFee": 3500.00,
  "sellerShippingFee": 0.00,
  "sellerTradeFee": 0.00,
  "commissionFee": 0.00,
  "serviceFee": 0.00,
  "discountFee": 0.00,
  "returnRefund": 0.00,
  "otherFee": 0.00,
  "marketingFee": 0.00,
  "invoiceNo": null,
  "allSkuNum": 4,
  "sortAllSkuNum": 4,
  "skuVoList": [
    {
      "sku": "FRO-DubChe-Reg1",
      "skuNum": 4,
      "returnNum": 0,
      "isAddition": 0
    }
  ]
}
```

**Order-level fields:**

| Field | Type | Notes |
|-------|------|-------|
| `shopId` | int | BigSeller shop ID |
| `shopName` | string | Shop display name |
| `platform` | string | `"shopee"`, `"tiktok"`, `"tokopedia"`, etc. |
| `platformOrderId` | string | Native order ID from the platform |
| `orderState` | string | `"new"`, `"shipped"`, `"pickup"`, `"completed"`, `"canceled"` |
| `orderStateStr` | string | Human-readable state label |
| `orderTime` | long | Order time as Unix ms |
| `orderCreatedTimeMulti` | string | Formatted: `"24 Feb 2026 13:25"` |
| `settleTimeMulti` | string\|null | When platform settled payment |
| `completedTimeMulti` | string\|null | When order marked complete |
| `saleAmount` | decimal | Buyer-paid amount (product only, excl. shipping) |
| `orderAmount` | decimal | Total buyer payment including shipping |
| `platformIncome` | decimal | Net received from platform after platform-side fees |
| `profit` | decimal | `platformIncome - costFee + sellerShippingFee` |
| `profitMargin` | string | `profit / platformIncome` as percentage string |
| `grossProfitMargin` | string | `(saleAmount - costFee) / orderAmount` |
| `grossProfitMarginDouble` | decimal | Same as ratio (for sorting) |
| `costFee` | decimal | COGS -- 0 until entered in BigSeller |
| `buyerShippingFee` | decimal | Shipping paid by buyer |
| `sellerShippingFee` | decimal | Seller subsidy -- **negative = seller paid extra** |
| `commissionFee` | decimal | Platform commission -- **negative = deducted** |
| `otherFee` | decimal | Misc platform fees -- **negative = deducted** |
| `serviceFee` | decimal | Platform service fee |
| `discountFee` | decimal | Voucher/promo discounts |
| `returnRefund` | decimal | Refund amount |
| `marketingFee` | decimal | Ads spend |
| `invoiceNo` | string\|null | Tax invoice number |
| `allSkuNum` | int | Total units in order |
| `skuVoList` | array | Per-SKU breakdown (see below) |

**SKU breakdown (`skuVoList` item):**

| Field | Type | Notes |
|-------|------|-------|
| `sku` | string | SKU code (e.g. `"FRO-DubChe-Reg1"`) |
| `skuNum` | int | Quantity ordered |
| `returnNum` | int | Quantity returned |
| `isAddition` | int | `0` = standard, `1` = add-on item |

> **Note:** Most per-SKU financial fields (`costFee`, `saleAmount`, `profit`,
> etc.) are null in the current dataset -- BigSeller only populates them when
> COGS is configured per SKU.

**Pagination fields:**

| Field | Type | Notes |
|-------|------|-------|
| `pageNo` | int | Current page (1-indexed) |
| `pageSize` | int | Items per page (max observed: 50) |
| `totalPage` | int | Total pages |
| `totalSize` | int | Total matching orders |

---

### POST shopee/pageList.json

Returns **Shopee-specific order-level profit data** with 30+ platform-specific fee
fields. Same request schema as the common `pageList.json` but with
`"platformTemplate": "shopee"`.

**Endpoint:** `POST /api/v1/statis/profit/shopee/pageList.json`

**Additional Shopee-specific fields per row (beyond common fields):**

| Field | Type | Notes |
|-------|------|-------|
| `costOfGoodsSold` | decimal | COGS (Shopee-reported) |
| `actualShippingFee` | decimal | Actual shipping cost |
| `buyerPaidShippingFee` | decimal | What buyer paid for shipping |
| `shopeeShippingRebate` | decimal | Shopee shipping subsidy |
| `finalShippingFee` | decimal | Net shipping cost to seller |
| `orderAmsCommissionFee` | decimal | AMS commission |
| `sellerTransactionFee` | decimal | Shopee transaction fee |
| `campaignFee` | decimal | Campaign participation fee |
| `shippingSellerProtectionFeeAmount` | decimal | Shipping protection fee |
| `escrowTax` | decimal | Escrow tax amount |
| `salesTaxOnLvg` | decimal | Sales tax on leveraged items |
| `withholdingTax` | decimal | Withholding tax |
| `voucherFromSeller` | decimal | Seller-funded voucher amount |
| `sellerDiscount` | decimal | Seller discount amount |
| `voucherFromShopee` | decimal | Shopee-funded voucher |
| `shopeeDiscount` | decimal | Shopee platform discount |
| `coins` | decimal | Shopee coins discount |
| `sellerReturnRefund` | decimal | Return/refund amount |
| `originalPrice` | decimal | Original listed price |
| `buyerTotalAmount` | decimal | Total buyer payment |
| `totalAdjustmentAmount` | decimal | Post-settlement adjustments |
| `sellerOrderProcessingFee` | decimal | Order processing fee |

---

### POST tiktok/pageList.json

Returns **TikTok Shop-specific order-level profit data** with 50+ platform-specific
fee fields. Same request schema with `"platformTemplate": "tiktok"`.

**Endpoint:** `POST /api/v1/statis/profit/tiktok/pageList.json`

**Additional TikTok-specific fields per row (beyond common fields):**

| Field | Type | Notes |
|-------|------|-------|
| `settlementAmount` | decimal | Final settlement amount |
| `subtotalBeforeDiscountAmount` | decimal | Pre-discount subtotal |
| `sellerDiscountAmount` | decimal | Seller discount |
| `platformDiscountAmount` | decimal | Platform discount |
| `revenueAmount` | decimal | Revenue amount |
| `shippingCostAmount` | decimal | Shipping cost |
| `platformCommissionAmount` | decimal | Platform commission |
| `transactionFeeAmount` | decimal | Transaction fee |
| `referralFeeAmount` | decimal | Referral fee |
| `affiliateCommissionAmount` | decimal | Affiliate commission |
| `affiliatePartnerCommissionAmount` | decimal | Affiliate partner commission |
| `sfpServiceFeeAmount` | decimal | SFP service fee |
| `codServiceFeeAmount` | decimal | COD service fee |
| `actualShippingFeeAmount` | decimal | Actual shipping fee |
| `shippingFeeDiscountAmount` | decimal | Shipping fee discount |
| `customerPaidShippingFeeAmount` | decimal | Customer-paid shipping |
| `feeTaxAmount` | decimal | Fee tax |
| `dynamicCommissionAmount` | decimal | Dynamic commission |
| `customerPaymentAmount` | decimal | Customer payment amount |
| `extraCostsFee` | decimal | Extra costs |

> Many additional fields exist. These are the most commonly non-zero ones.

---

## Shop & Store APIs

---

### GET shopsAndPlatforms.json

**The most important endpoint for shop discovery.** Returns all connected shops
grouped by platform.

**Request**

```http
GET /api/v1/shopsAndPlatforms.json
```

**Response**

```json
{
  "code": 0,
  "data": {
    "authPlatforms": "shopee,tiktok,",
    "allPlatforms": ["shopee", "lazada", "tokopedia", "tiktok", "bukalapak", "blibli", "jdid", "thisshop"],
    "filterPlatforms": ["jdid", "thisshop", "bukalapak"],
    "shops": {
      "shopee": [
        {
          "id": 5090946,
          "name": "Frollie - S",
          "platform": "shopee",
          "site": "ID",
          "crossBorder": 0,
          "shopMode": 0
        }
      ],
      "tiktok": [
        {
          "id": 5092855,
          "name": "Frollie - T",
          "platform": "tiktok",
          "site": "ID",
          "crossBorder": 0,
          "shopMode": 0
        }
      ]
    }
  }
}
```

| Field | Type | Notes |
|-------|------|-------|
| `authPlatforms` | string | Comma-separated platforms with active auth |
| `allPlatforms` | array | All supported platforms |
| `filterPlatforms` | array | Platforms to hide from UI |
| `shops` | object | Shops grouped by platform key |
| `shops[platform][].id` | int | **BigSeller shop ID** -- used in all other API calls |
| `shops[platform][].name` | string | Human-readable shop name |
| `shops[platform][].site` | string | Country code (`"ID"` = Indonesia) |

---

### GET shop/group/page.json

Returns shop groups (brand groupings) across the BigSeller account.

**Request**

```http
GET /api/v1/shop/group/page.json
```

**Response**

```json
{
  "code": 0,
  "data": [
    {
      "id": 125238,
      "groupName": "Frollie",
      "shopCount": 2,
      "shopName": "Frollie - S,Frollie - T",
      "shopIds": [5090946, 5092855]
    },
    {
      "id": 125241,
      "groupName": "Credotti",
      "shopCount": 3,
      "shopIds": [5091054, 5090949, 5091075]
    }
  ]
}
```

> This endpoint reveals ALL brands in the BigSeller account: Frollie, Credotti,
> Legato, Malo Toys & Home, Sole Galore, Rocket, Malo Slime.

---

### GET statis/profit/initInfo.json

Returns profit module initialization data including shop list.

**Request**

```http
GET /api/v1/statis/profit/initInfo.json
```

**Response**

```json
{
  "code": 0,
  "data": {
    "platforms": ["shopee", "tiktok"],
    "shopList": [
      {
        "id": 5090946,
        "puid": 1355260,
        "name": "Frollie - S",
        "platform": "shopee",
        "site": "ID",
        "shopMode": 0,
        "is3pf": false,
        "crossBorder": 0
      },
      {
        "id": 5092855,
        "puid": 1355260,
        "name": "Frollie - T",
        "platform": "tiktok",
        "site": "ID",
        "shopMode": 0,
        "is3pf": false,
        "crossBorder": 0
      }
    ]
  }
}
```

---

### GET shop/checkShop/auth/invalid.json

Checks if any shop authorizations have expired. Useful for health monitoring.

**Request**

```http
GET /api/v1/shop/checkShop/auth/invalid.json
```

**Response (all OK):**

```json
{"code": 0}
```

---

## Order & Sales Analytics APIs

These are **separate from** the profit analytics endpoints. They provide sales
dashboard data without requiring the sync-first workflow.

---

### POST getOrderTotalData.json

**Dashboard order totals with period-over-period comparison.**

**Request**

```http
POST /api/v1/getOrderTotalData.json
Content-Type: application/json
```

```json
{
  "currency": "IDR",
  "platform": "",
  "queryType": "day",
  "beginDate": "2026-02-18",
  "endDate": "2026-02-24",
  "evalationOrder": "0",
  "shopIds": ""
}
```

| Field | Type | Notes |
|-------|------|-------|
| `currency` | string | `"IDR"` |
| `platform` | string | Empty = all platforms. `"shopee"`, `"tiktok"` for specific |
| `queryType` | string | `"day"`, `"week"`, `"month"` |
| `beginDate` | string | `YYYY-MM-DD` |
| `endDate` | string | `YYYY-MM-DD` |
| `evalationOrder` | string | `"0"` = include all |
| `shopIds` | string | Empty = all shops. Comma-separated IDs for specific |

**Response fields (each with comparison):**

- `productOriginalPrice` -- Original listed price total
- `amount` -- Net sales amount
- `salePerOrder` -- Average sale per order
- `orderCount` -- Total orders
- `refundOrders` -- Refund order count
- `productFinalPrice` -- Final price after discounts
- `grossRevenue` -- Gross revenue
- `sellerSubsidizedPrice` -- Seller subsidy amount

Each field contains `currentData`, `comparisonData`, `growthRatio`, `lastDatePeriod`.

---

### POST orderSalesStatistics.json

**Daily sales chart data (last 30 days).**

**Request**

```http
POST /api/v1/orderSalesStatistics.json
Content-Type: application/x-www-form-urlencoded
```

Body: `platform=` (empty = all platforms)

**Response**

Object keyed by formatted date strings:

```json
{
  "code": 0,
  "data": {
    "25 Feb 2026": {
      "amount": 90000,
      "amount_str": "Rp 90.000",
      "orderCount": 2
    },
    "24 Feb 2026": {
      "amount": 1170000,
      "amount_str": "Rp 1.170.000",
      "orderCount": 11
    }
  }
}
```

---

### POST lastTwoDaysStatsData.json

**Yesterday vs day-before stats comparison.**

**Request**

```http
POST /api/v1/lastTwoDaysStatsData.json
Content-Type: application/x-www-form-urlencoded
```

Body: `currency=IDR&platform=&type=order&evalationOrder=0&shopIds=`

**Response**

```json
{
  "code": 0,
  "data": {
    "yesterday": {
      "amount": 90000,
      "orderCountStr": "2",
      "customerCountStr": "2",
      "refundCountStr": "0",
      "refundAmount": 0,
      "perBuyerAmount": 45000,
      "perOrderAmount": 45000,
      "validCountStr": "2",
      "validAmount": 90000,
      "grossRevenue": 90000,
      "sellerSubsidizedPrice": 0,
      "productFinalPrice": 90000,
      "productOriginalPrice": 90000
    },
    "beforeYesterday": { /* same structure */ }
  }
}
```

---

### POST listStatsData.json (sales)

**Daily stats breakdown for a date range.** Different from the profit `listStatsData` --
this is the sales dashboard version.

**Request**

```http
POST /api/v1/listStatsData.json
Content-Type: application/x-www-form-urlencoded
```

Body: `currency=IDR&platform=&queryType=day&beginDate=2026-02-18&endDate=2026-02-24&evalationOrder=0&shopIds=&type=order`

**Response**

Array of daily records:

```json
{
  "code": 0,
  "data": [
    {
      "date": "2026-02-24",
      "orderCount": 11,
      "packageCount": 11,
      "amount": 1170000,
      "refundAmount": 0,
      "customers": 10,
      "refundOrders": 0,
      "salePerOrder": 106363,
      "voucherAmount": 0,
      "orderValidAmount": 1170000,
      "orderValidCount": 11,
      "grossRevenue": 1170000,
      "sellerSubsidizedPrice": 0,
      "productFinalPrice": 1170000,
      "productOriginalPrice": 1170000
    }
  ]
}
```

---

## Product/SKU Analytics APIs

---

### POST items/getItemCountNew.json

**Product/SKU summary counts with period comparison.**

**Request**

```http
POST /api/v1/items/getItemCountNew.json
Content-Type: application/json
```

```json
{
  "currency": "IDR",
  "platform": "",
  "searchType": "sku",
  "searchContent": "",
  "inquireType": 0,
  "beginDate": "2026-02-18",
  "endDate": "2026-02-24",
  "categoryList": "",
  "warehouseIds": "",
  "evalationOrder": "0",
  "shopIds": ""
}
```

**Response fields (each with comparison):**

- `salesCount` -- Total sales revenue
- `salesOrdersCount` -- Orders with sales
- `productCount` -- Distinct products sold
- `effectiveSalesQuantity` -- Net units sold
- `refundsOrdersCount` -- Refund orders
- `refundsCount` -- Refunded units
- `cancelOrder` -- Cancelled orders
- `cancelAmount` -- Cancelled amount
- `cancelQuantity` -- Cancelled units

---

### POST items/pageList.json

**SKU-level sales breakdown -- paginated list.** Useful for SKU discovery and mapping.

**Request**

```http
POST /api/v1/items/pageList.json
Content-Type: application/x-www-form-urlencoded
```

Body: `currency=IDR&pageSize=50&pageNo=1&platform=&searchType=sku&searchContent=&inquireType=0&beginDate=2026-02-18&endDate=2026-02-24&orderBy=&desc=0&categoryList=&warehouseIds=&evalationOrder=0&groupFields=sku&spuId=&shopIds=`

**Response row fields:**

```json
{
  "shopId": 5090946,
  "skuId": "310532090263FRO-DubChe-Reg1",
  "shopName": "Frollie - S",
  "productName": "FROLLIE - Dubai Chewy Cookie Package...",
  "image": "https://cf.shopee.co.id/file/...",
  "platform": "shopee",
  "sku": "FRO-DubChe-Reg1",
  "varAttr": ["Size:Reguler - 1pcs"],
  "sales": 990000,
  "salesVolume": 22,
  "ordersNum": 8,
  "packageNum": 8,
  "refunds": 0,
  "refundsVolume": 0,
  "cancels": 0,
  "efficients": 990000,
  "efficientsVolume": 22,
  "efficientsOrders": 8,
  "spuId": "29444192522"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `shopId` | int | BigSeller shop ID |
| `skuId` | string | Composite: `{platformProductId}{sku}` |
| `shopName` | string | Shop display name |
| `productName` | string | Full product listing title |
| `image` | string | Product image URL |
| `platform` | string | `"shopee"`, `"tiktok"` |
| `sku` | string | SKU code (e.g. `"FRO-DubChe-Reg1"`) |
| `varAttr` | array | Variant attributes (e.g. `["Size:Reguler - 1pcs"]`) |
| `sales` | decimal | Total sales revenue (IDR) |
| `salesVolume` | int | Total units sold |
| `ordersNum` | int | Number of orders |
| `packageNum` | int | Number of packages |
| `refunds` | decimal | Refund amount |
| `refundsVolume` | int | Refunded units |
| `cancels` | decimal | Cancelled amount |
| `efficients` | decimal | Effective (net) sales |
| `efficientsVolume` | int | Effective units sold |
| `efficientsOrders` | int | Effective order count |
| `spuId` | string | Platform product ID (SPU) |

---

## Account & Utility APIs

**Session & User:**

| Endpoint | Method | Response |
|----------|--------|----------|
| `GET /api/v1/isLogin.json` | GET | `{"code":0,"data":true}` -- session validity |
| `GET /api/v1/index.json` | GET | User info: `uid`, `puid`, `account`, `userSite`, `currency`, `authShopNum`, `masterAccount`, `subAdmin` |
| `GET /api/v3/account/userRights.json` | GET | Granular permission scopes (e.g. `order:process:scanInspect`, `finance:sqlAccCustomerPayment`) |

**Subscription & Quotas:**

| Endpoint | Method | Response |
|----------|--------|----------|
| `GET /api/v1/checkUserOrderDeductionFree.json` | GET | VIP info: `vipLevel` (2), `expireTime`, `expireDays` (4) |
| `GET /api/v1/goods/getPaidGoodsNum.json` | GET | Quotas: `order_count` (30000/29167), `shop_count` (50/21), `account_count` (20/10) |
| `GET /api/v1/goods/quotaDetection.json` | GET | Subscription limit warnings |

**Dashboard Widgets:**

| Endpoint | Method | Response |
|----------|--------|----------|
| `GET /api/v1/dashboard/orderInventoryCount.json` | GET | Quick counts: new orders, expired soon, out of stock, low stock |
| `GET /api/v1/order/getNewOrderMessageRemind.json` | GET | New order notification count |
| `GET /api/v1/newMessages.json` | GET | Notification messages |
| `GET /api/v1/scrollMessages.json` | GET | Scrolling banner announcements |

**Shop Health:**

| Endpoint | Method | Response |
|----------|--------|----------|
| `GET /api/v1/shop/health/notification.json` | GET | Shop health alerts |
| `GET /api/v1/expiredShops.json` | GET | Shops with expired platform auth |

---

## Shared Request Schema (Profit)

Both profit `pageList.json` and `listStatsData.json` accept the same request body.
Full field reference:

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `pageNo` | int | Yes | `1` | Page number (1-indexed) |
| `pageSize` | int | Yes | `50` | Items per page |
| `searchType` | string | **Yes** | -- | Must be `"order"` -- omitting causes -1 error |
| `platformTemplate` | string | **Yes** | -- | `"common"`, `"shopee"`, or `"tiktok"` |
| `startTime` | string | Yes | -- | `YYYY-MM-DD` -- must match the synced range |
| `endTime` | string | Yes | -- | `YYYY-MM-DD` -- must match the synced range |
| `timeType` | string | Yes | -- | `"orderCreatedTime"` or `"orderPayTime"` |
| `currency` | string | **Yes** | -- | ISO currency code e.g. `"IDR"` |
| `orderState` | array | **Yes** | -- | Filter: `["completed","shipped","canceled","other"]` |
| `queryType` | string | Yes | -- | `"sku"` (order+SKU) or `"order"` (order only) |
| `orderType` | string | Yes | -- | Sort field. `"orderNo"` default |
| `orderBy` | string | Yes | `""` | Secondary sort field |
| `desc` | bool | Yes | `false` | Sort descending |
| `inquireType` | int | Yes | `0` | Search mode: `0` = all |
| `platforms` | array | Yes | `[]` | Filter by platform. Empty = all |
| `shopIds` | array | Yes | `[]` | Filter by shop ID. Empty = all |
| `warehouseIds` | array | Yes | `[]` | Filter by warehouse. Empty = all |
| `searchContent` | string\|null | Yes | `null` | Free-text search |
| `adjustmentUpdateTimeStartTime` | string\|null | Yes | `null` | Adjustment time filter |
| `adjustmentUpdateTimeEndTime` | string\|null | Yes | `null` | Adjustment time filter |
| `lableIds` | array\|null | Yes | `null` | Label IDs filter |
| `hasLable` | string | Yes | `""` | Label presence filter |
| `sampleOrder` | bool\|null | Yes | `null` | Sample orders filter |
| `dimension` | string | Yes | `""` | Grouping dimension |
| `evalationOrder` | string | Yes | `""` | Review/rating filter |
| `categoryList` | string | Yes | `""` | Category filter |
| `settleStatus` | int | **Yes** (since 2026-05) | `1` | Settlement filter. `1` = settled orders only. |
| `transactionStatus` | string | **Yes** (since 2026-05) | `""` | Transaction-status filter. Empty = no constraint. |
| `fbsOrder` | string | **Yes** (since 2026-05) | `""` | Fulfilled-by-Shopee filter. Empty = exclude FBS. |
| `groupType` | int OR string | **Yes** (since 2026-05) | `0` (common) / `""` (shopee/tiktok) | Grouping dimension. **Type differs by endpoint** — int on `/pageList.json`, string on `/{shopee\|tiktok}/pageList.json`. |
| `totalCurrency` | string | **Yes** (since 2026-05) | `"IDR"` | Currency for response totals. ISO code. Carries the role `currency` used to serve before the May 2026 drift. |
| `orderStatus` | array | **Yes** on platform endpoints (since 2026-05) | `[]` | Per-row order-status filter. Sent ONLY on `/shopee/pageList.json` and `/tiktok/pageList.json` — omitted on the common `/pageList.json`. |

**Filtering examples:**

```json
// Only Shopee orders
{ "platforms": ["shopee"], "shopIds": [] }

// Only Frollie - S shop
{ "shopIds": [5090946], "platforms": [] }

// Completed orders only
{ "orderState": ["completed"] }

// Search by order ID
{ "searchContent": "260224HUDFPPPN", "inquireType": 0 }

// Sort by profit margin descending
{ "orderBy": "profitMargin", "desc": true }
```

---

## Data Glossary

| Term | Meaning |
|------|---------|
| `saleAmount` | Gross product price paid by buyer (excl. shipping) |
| `orderAmount` | Total buyer payment = `saleAmount + buyerShippingFee` |
| `platformIncome` | Net amount credited to seller by platform after ALL deductions (commissions, fees, taxes). For Shopee orders with no commissions, this equals `saleAmount`. For TikTok, this equals `settlementAmount`. Includes hidden deductions (e.g., `preOrderServiceFeeAmount`, `feeTaxAmount`) not visible in named fee fields. |
| `costFee` | Cost of Goods Sold. Currently 0 for all Frollie SKUs -- requires manual entry in BigSeller. |
| `profit` | `platformIncome - costFee + sellerShippingFee` (sellerShippingFee is negative when seller pays extra) |
| `profitMargin` | `profit / platformIncome` -- net margin as percentage |
| `grossProfitMargin` | `(saleAmount - costFee) / orderAmount` -- includes shipping in denominator |
| `buyerShippingFee` | Shipping paid by the buyer |
| `sellerShippingFee` | **Negative value** = platform clawed back shipping subsidy from seller. Usually 0 for standard Shopee, negative for some orders. |
| `commissionFee` | **Negative value** = platform commission deducted. **Important:** The common `pageList.json` returns 0 for Shopee and TikTok — use platform-specific endpoints (`shopee/pageList.json`, `tiktok/pageList.json`) to get real values. See fee normalization below. |
| `otherFee` | **Negative value** = misc platform deductions (TikTok service charges, etc.) |
| `orderProfitCycleComparisonMap` | Period-over-period comparison vs the same-length prior period. `growthRatio = "--"` when no prior data exists. |

---

## Known Limitations

1. **No COGS data** -- All `costFee` values are `0.00` because Frollie has not entered
   product costs into BigSeller. Profit figures therefore equal revenue. Gross profit
   margin is meaningless until COGS is configured.

2. **31-day max range** -- BigSeller enforces a 31-day maximum for sync tasks. For
   longer analysis, trigger multiple syncs.

3. **One sync at a time** -- Cannot queue a second sync while one is running.

4. **Sync is not persistent** -- The API does not retain historical syncs. To query
   data from a past period, you must re-trigger a sync for that range.

5. **SKU financials are null** -- `skuVoList` items have null financial fields until
   SKU-level COGS is configured in BigSeller.

6. **TikTok fees deducted at platform level** -- Unlike Shopee, TikTok deducts
   `commissionFee` and `otherFee` before remitting `platformIncome`. This means TikTok
   profit margins are lower than Shopee for equivalent sale prices.

7. **`new` order state not in default filter** -- The default payload uses
   `["completed","shipped","canceled","other"]`. Orders with `orderState: "new"` are
   excluded unless you add `"new"` to the filter.

8. **Headless login blocked** -- Image CAPTCHA + encrypted password + browser
   fingerprinting make automated login impractical. Use paste-token approach.

9. **Token lifetime ~20 days** -- Based on `iat`/`exp` analysis, tokens expire in ~20
   days (previously estimated at 30 days). The `refreshTime` field updates on API calls
   but it's unclear whether this extends the JWT `exp`.

10. **Account is multi-brand** -- The BigSeller account contains 7+ brands (Frollie,
    Credotti, Legato, etc.). Always filter by `shopIds` to isolate Frollie data.

11. **Schema drift, May 2026 (Phase 83-01a)** -- BigSeller silently added 6 new required
    fields to the pageList payload between Feb 2026 and May 2026: `settleStatus`,
    `transactionStatus`, `fbsOrder`, `groupType`, `orderStatus` (platform endpoints only),
    `totalCurrency`. Omitting any returns `code:-1` with the generic "Failed, please try
    again later" message and no field-name indication. The `currency` field, formerly
    `"IDR"`, must now be `""` on platform endpoints — the role moved to `totalCurrency`.
    `groupType` is **type-differential**: int `0` on `/pageList.json`, string `""` on
    platform endpoints. Note that schema drifts can recur — re-capture HAR and diff the
    body whenever sync starts returning unexplained `code:-1` after a known-working window.

---

## Integration Notes for Frollie

### Shop IDs

| Shop Name | BigSeller Shop ID | Platform | Brand Group |
|-----------|------------------|----------|-------------|
| Frollie - S | `5090946` | Shopee | Frollie (125238) |
| Frollie - T | `5092855` | TikTok | Frollie (125238) |

### Other Brands in Account (for reference)

| Brand | Shop Count | Notes |
|-------|-----------|-------|
| Credotti | 3 shops | IDs: 5091054, 5090949, 5091075 |
| Legato | multiple | Not captured in detail |
| Malo Toys & Home | multiple | Not captured in detail |
| Sole Galore | multiple | Not captured in detail |
| Rocket | multiple | Not captured in detail |
| Malo Slime | multiple | Not captured in detail |

### Observed SKU Codes

| SKU Code | Description |
|----------|-------------|
| `FRO-DubChe-Reg1` | Regular-1 variant (most common -- 2-9 units per order) |
| `FRO-DubChe-Reg3` | Regular-3 variant (1 unit observed) |

### Recommended Sync Strategy

For a Convex integration:

```
1. Store the last sync endTime in a config table
2. On manual trigger: create sync for (lastEndTime+1) -> today
3. Poll sync/task/detail/new/get.json every 60s via scheduled action
4. On complete: call PLATFORM-SPECIFIC pageList per shop (see below) + listStatsData
5. Normalize platform-specific fee fields into common fields before storage
6. Upsert into Convex externalRevenue by platformOrderId (idempotent)
7. Store listStatsData as daily aggregates (separate table or computed)
8. Record actual platform source per order ("shopee" or "tiktok", NOT "bigseller")
```

### Platform-Specific Endpoints (CRITICAL)

**The common `pageList.json` returns 0 for commission, shipping, and other fees on Shopee and TikTok orders.** You MUST use platform-specific endpoints to get real fee data:

| Platform | Endpoint | `platformTemplate` |
|----------|----------|-------------------|
| Shopee | `shopee/pageList.json` | `"shopee"` |
| TikTok | `tiktok/pageList.json` | `"tiktok"` |
| Other | `pageList.json` | `"common"` |

#### Response Schema Differences (HAR-verified 2026-03-15)

**WARNING:** The platform-specific endpoints do NOT simply add extra fields to the common schema. Many common fields are **completely absent** from the response. The `platform` field is `null` in both. Revenue and fee data use different field names with different sign conventions.

**Field Availability Matrix (per-row data):**

| Common Field | Common Endpoint | Shopee Endpoint | TikTok Endpoint |
|---|---|---|---|
| `saleAmount` | present | **MISSING** | **MISSING** |
| `orderAmount` | present | **MISSING** | **MISSING** |
| `platformIncome` | present | present | **MISSING** |
| `profit` | present | present | present |
| `costFee` | present | present | present |
| `commissionFee` | present (negative) | present but **always 0** | **MISSING** |
| `sellerShippingFee` | present (negative) | **MISSING** | **MISSING** |
| `buyerShippingFee` | present | **MISSING** | **MISSING** |
| `otherFee` | present (negative) | **MISSING** (`otherfee` lowercase exists, always 0) | **MISSING** (`otherfee` lowercase exists, always 0) |
| `platform` | `"shopee"` / `"tiktok"` | **`null`** | **`null`** |
| `shopName` | present | present | present |
| `shopId` | present | present | present |
| `platformOrderId` | present | present | present |
| `orderTime` | present | present | present |
| `skuVoList` | present | present | present |

**Revenue/Income Equivalents:**

| Common Field | Shopee Equivalent | TikTok Equivalent | Verified |
|---|---|---|---|
| `saleAmount` (gross product price) | `originalPrice` | `revenueAmount` | 73 Shopee + 15 TikTok orders ✓ |
| `orderAmount` (total buyer payment) | `buyerTotalAmount` | not available | ✓ |
| `platformIncome` (net to seller) | `platformIncome` (present) | `settlementAmount` | ✓ |
| `buyerShippingFee` | `buyerPaidShippingFee` | `customerPaidShippingFeeAmount` | ✓ |

#### Fee Normalization

Platform-specific endpoints return fees in platform-specific fields that must be aggregated into the common `commissionFee`, `sellerShippingFee`, and `otherFee` fields.

**CRITICAL — Sign Conventions Differ by Platform:**
- **Shopee fees are POSITIVE** (e.g., `orderAmsCommissionFee: 29970`) — must NEGATE to match common convention
- **TikTok fees are already NEGATIVE** (e.g., `platformCommissionAmount: -53000`) — use as-is
- **Common endpoint fees are NEGATIVE** (e.g., `commissionFee: -29970`)

**Shopee fee mapping (NEGATE all aggregated values):**
| Common Field | Shopee-Specific Fields | Sign |
|---|---|---|
| `commissionFee` | `sellerTransactionFee` + `orderAmsCommissionFee` + `campaignFee` + `sellerOrderProcessingFee` | negate sum |
| `sellerShippingFee` | `finalShippingFee` + `shippingSellerProtectionFeeAmount` | negate sum |
| `otherFee` | `serviceFee` | negate |

**TikTok fee mapping (already negative, use as-is):**
| Common Field | TikTok-Specific Fields | Sign |
|---|---|---|
| `commissionFee` | `platformCommissionAmount` + `transactionFeeAmount` + `referralFeeAmount` + `affiliateCommissionAmount` + `affiliatePartnerCommissionAmount` + `dynamicCommissionAmount` | as-is |
| `sellerShippingFee` | 0 (see note below) | N/A |
| `otherFee` | `extraCostsFee` | as-is |

> **TikTok shipping note:** `actualShippingFeeAmount` appears negative in TikTok responses but is NOT reflected in the common endpoint's `sellerShippingFee` (always 0). It appears to be informational — the actual deduction is embedded in `settlementAmount`. Do NOT include it in `sellerShippingFee`.

> **TikTok hidden deductions:** `feeTaxAmount` (tax on fees) and `preOrderServiceFeeAmount` are deducted from settlement but NOT categorized in any common fee field. They explain the gap between `revenueAmount - visible fees` and `settlementAmount`. Using `settlementAmount` for `platformIncome` captures these automatically.

> **TikTok otherFee note:** Previous mapping included `sfpServiceFeeAmount + codServiceFeeAmount + feeTaxAmount + extraCostsFee`. HAR verification (2026-03-15) shows only `extraCostsFee` maps to common `otherFee`. `feeTaxAmount` is tax metadata already embedded in settlement, not a separate seller deduction.

**Implementation:** See `convex/integrations/bigseller/helpers.ts` → `normalizePlatformFees()`

**Normalization Pitfall:** Missing fields are `undefined`, not `0`. Check with `!field` or `field == null`, NOT `field === 0`.

### Field Mapping to Frollie Concepts

> **NOTE:** Platform-specific endpoints use different field names. The "Source" column shows which API field to read per endpoint type.

| Frollie Concept | Common Endpoint | Shopee Endpoint | TikTok Endpoint |
|---|---|---|---|
| Revenue (gross) | `saleAmount` | `originalPrice` | `revenueAmount` |
| Revenue (net) | `platformIncome` | `platformIncome` | `settlementAmount` |
| Platform | `platform` | **null** (use shop config) | **null** (use shop config) |
| Commission (negative) | `commissionFee` | negate(`ams` + `txn` + `campaign` + `proc`) | `platComm` + `dynComm` + `txnFee` + `refFee` + `affComm` + `affPartner` |
| Shipping cost (negative) | `sellerShippingFee` | negate(`finalShipping` + `shippingProt`) | 0 (informational only) |
| Buyer shipping | `buyerShippingFee` | `buyerPaidShippingFee` | `customerPaidShippingFeeAmount` |
| Other fees (negative) | `otherFee` | negate(`serviceFee`) | `extraCostsFee` |
| COGS | `costFee` (always 0) | `costFee` (always 0) | `costFee` (always 0) |
| Profit | `profit` | `profit` | `profit` |
| Order reference | `platformOrderId` | `platformOrderId` | `platformOrderId` |
| Shop | `shopId` + `shopName` | `shopId` + `shopName` | `shopId` + `shopName` |
| SKU list | `skuVoList` | `skuVoList` | `skuVoList` |
| Order time | `orderTime` | `orderTime` | `orderTime` |
| Order status | `orderState` | `orderState` | `orderState` |

**`profit` field usage:** BigSeller's `profit` = `platformIncome - costFee`. Since `costFee` is always 0, `profit` = `platformIncome`. Use `profit` directly for display — do NOT recalculate as `platformIncome + fees` (this double-subtracts fees already embedded in `platformIncome`).

### Currency

All values are in **IDR (Indonesian Rupiah)** -- no conversion needed. The `currency`
field in the request must be `"IDR"` to match Frollie's account configuration.

### API Endpoint Quick Reference

| Purpose | Endpoint | Method | Auth |
|---------|----------|--------|------|
| Login | `/api_v2/api/v3/auth/loginsub.json` | POST | None (returns token) |
| Session check | `/api/v1/isLogin.json` | GET | Cookie |
| List shops | `/api/v1/shopsAndPlatforms.json` | GET | Cookie |
| Shop groups | `/api/v1/shop/group/page.json` | GET | Cookie |
| Trigger sync | `/api/v1/statis/profit/sync/task/create.json` | POST | Cookie |
| Poll sync | `/api/v1/statis/profit/sync/task/detail/new/get.json` | GET | Cookie |
| Profit daily | `/api/v1/statis/profit/listStatsData.json` | POST | Cookie |
| Profit orders (common) | `/api/v1/statis/profit/pageList.json` | POST | Cookie |
| Profit orders (Shopee) | `/api/v1/statis/profit/shopee/pageList.json` | POST | Cookie |
| Profit orders (TikTok) | `/api/v1/statis/profit/tiktok/pageList.json` | POST | Cookie |
| SKU sales | `/api/v1/items/pageList.json` | POST | Cookie |
| Order totals | `/api/v1/getOrderTotalData.json` | POST | Cookie |
| Daily sales | `/api/v1/orderSalesStatistics.json` | POST | Cookie |
| Shop auth health | `/api/v1/shop/checkShop/auth/invalid.json` | GET | Cookie |

---

## Platform-Specific Response Schema Differences (Phase 54)

> **Confirmed:** 2026-03-15 via HAR capture analysis of 73 Shopee + 15 TikTok orders

### Field Availability Matrix

| Field | Common | Shopee | TikTok | Notes |
|-------|--------|--------|--------|-------|
| `saleAmount` | Present | **MISSING** (use `originalPrice`) | **MISSING** (use `revenueAmount`) | BUG-01 |
| `orderAmount` | Present | **MISSING** (use `buyerTotalAmount`) | **MISSING** (compute: `saleAmount + buyerShippingFee`) | Enhancement |
| `platformIncome` | Present | Present | **MISSING** (use `settlementAmount`) | BUG-03 |
| `commissionFee` | Present | 0 (use platform fields) | **MISSING** (sum 6 fields) | BUG-03/04/05 |
| `sellerShippingFee` | Present | 0 (use `finalShippingFee`) | 0 (stays 0) | BUG-04 |
| `buyerShippingFee` | Present | Present | **MISSING** (use `customerPaidShippingFeeAmount`) | BUG-03 |
| `otherFee` | Present | 0 (use `serviceFee`) | **MISSING** (use `extraCostsFee`) | BUG-04 |
| `platform` | Present | **null** | **null** | BUG-02 |
| `profit` | Present | Present | Present | Authoritative |
| `otherfee` (lowercase) | N/A | May appear | May appear | CASE-01 |

### Sign Conventions

| Platform | Commission | Shipping | Other | Source |
|----------|-----------|----------|-------|--------|
| Common | Negative | Negative | Negative | Already correct |
| Shopee | **Positive** (negate via `-Math.abs()`) | **Positive** (negate) | **Positive** (negate) | HAR-confirmed |
| TikTok | Already negative | Already negative | Already negative | HAR-confirmed |

### Revenue Semantics

| Term | Field | Definition |
|------|-------|------------|
| **Gross Revenue** | `orderAmount` | Total amount the customer paid (product price + buyer shipping) |
| **Net Revenue** | `platformIncome` | What Frollie actually receives after all platform deductions |
| **Profit** | `profit` (authoritative) | `platformIncome - costFee` (BigSeller computes this) |

### Normalization Mappings

**Shopee:**
- `saleAmount` <- `originalPrice`
- `orderAmount` <- `buyerTotalAmount`
- `commissionFee` <- `-Math.abs(sellerTransactionFee + orderAmsCommissionFee + campaignFee + sellerOrderProcessingFee)`
- `sellerShippingFee` <- `-Math.abs(finalShippingFee + shippingSellerProtectionFeeAmount)`
- `otherFee` <- `-Math.abs(serviceFee)`

**TikTok:**
- `saleAmount` <- `revenueAmount`
- `platformIncome` <- `settlementAmount`
- `buyerShippingFee` <- `customerPaidShippingFeeAmount`
- `commissionFee` <- `platformCommissionAmount + dynamicCommissionAmount + transactionFeeAmount + referralFeeAmount + affiliateCommissionAmount + affiliatePartnerCommissionAmount`
- `otherFee` <- `extraCostsFee`
- `sellerShippingFee` <- 0 (informational only)
- `orderAmount` <- computed `saleAmount + buyerShippingFee` (after field normalization)

### HAR-Confirmed Test Values

- **Shopee order 260307H1VR6UCW:** `originalPrice=270,000`, `orderAmsCommissionFee=29,970` (positive!), `buyerTotalAmount=285,000`
- **TikTok order 582977241483805780:** `revenueAmount=530,000`, `settlementAmount=433,350`, `platformCommissionAmount=-53,000`, `dynamicCommissionAmount=-26,500`
