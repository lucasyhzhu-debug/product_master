# Phase 83 — Research artifacts

## Source HAR

- **File:** `C:\Users\Irfan\Downloads\20260315 bigseller specific orders profit tracking.har`
- **Size:** 64 MB
- **Captured:** 2026-05-19
- **Entries:** 446 total, 269 against `bigseller.com`, 20 against `/api/v1/statis/profit/*`

## Working endpoints (HAR-verified, status=200)

| Endpoint | Calls | Sample req size | Sample resp size |
|---|---:|---:|---:|
| `POST /api/v1/statis/profit/pageList.json` | 6 | ~900 B | ~73 kB |
| `POST /api/v1/statis/profit/shopee/pageList.json` | 1 | 623 B | 128 kB |
| `POST /api/v1/statis/profit/tiktok/pageList.json` | 1 | 623 B | 42 kB |
| `GET /api/v1/statis/profit/getTemplateFields.json` | 4 | 0 | ~3 kB |
| `POST /api/v1/statis/profit/customColumn/list.json` | 4 | <100 B | 70 B |
| `GET /api/v1/statis/profit/initInfo.json` | 2 | 0 | ~2 kB |
| `GET /api/v1/statis/profit/sync/task/detail/new/get.json` | 2 | 0 | ~600 B |

## MUC token decoded JWT

```json
// JWT header
{ "typ": "JWT", "alg": "HS256" }

// JWT payload (partial, real values from HAR)
{
  "sub": "user",
  "exp": 1780911842,       // ~2026-06-08 — exactly iat + 20 days
  "iat": 1779183842,       // 2026-05-19
  "info": "{\"requestId\":\"muc_oafk890bytktd2zge3\",\"loginTime\":1776858615798,\"refreshTime\":1779183842149,\"puid\":1355260,\"requestIp\":\"139.195.82.205\",\"requestClient\":\"Device:Desktop|System:Win10,10.0|Client:Chrome,0\",\"uid\":1356692}"
}
```

The token is HS256-signed but we never need to verify the signature — we just
pass it back as-is in `cookie: muc_token=<jwt>`. The server validates.

**Refresh mechanism:** Every successful response from any `bigseller.com` endpoint
carries a fresh `muctoken` value in the response headers, with `iat` set to the
current request time and `exp` set to `iat + 20 days`. The browser plays this
back as the request cookie on the next call. We currently don't reuse it (Phase
83.02 O5 documents the fix).

## Authentication observations

- `clientType: 1` header is required (some endpoints reject without it; mixed
  case in HAR — both `clientType` and `clienttype` appear and both work)
- `referer: https://www.bigseller.com/web/statis/profit.htm` is checked for the
  profit endpoints — must be a `bigseller.com` page URL
- `origin: https://www.bigseller.com` is checked for CORS
- No CSRF token used — pure cookie auth
- No `Authorization` header — the JWT lives only in the cookie

## Field-by-field diff: current code vs HAR (2026-05-19)

Common `/pageList.json` body:

```diff
{
  "pageNo": 1, "pageSize": 50, "searchType": "order",
  "platformTemplate": "common",
  "startTime": "2026-04-19", "endTime": "2026-05-19",
  "adjustmentUpdateTimeStartTime": null, "adjustmentUpdateTimeEndTime": null,
  "searchContent": null,
  "inquireType": 0, "queryType": "sku",
  "platforms": [],
- "orderState": ["completed", "shipped", "canceled", "other", "new"],
+ "orderState": ["completed", "shipped", "other"],
  "warehouseIds": [],
  "lableIds": null, "hasLable": "",
- "currency": "IDR",
+ "currency": "",
  "orderBy": "", "desc": false,
  "timeType": "orderCreatedTime", "orderType": "orderNo",
  "sampleOrder": null, "dimension": "", "evalationOrder": "",
+ "settleStatus": 1,
+ "transactionStatus": "",
+ "fbsOrder": "",
+ "groupType": 0,
  "categoryList": "",
+ "totalCurrency": "IDR",
  "shopIds": []
}
```

Shopee/TikTok `/shopee/pageList.json` body adds `orderStatus` and uses string
`groupType`:

```diff
{
  ... same as common ...
- "groupType": 0,
+ "groupType": "",
+ "orderStatus": [],
- "searchContent": null,
+ "searchContent": "",
}
```

## Response schema (verified)

```ts
type PageListResponse = {
  code: number;           // 0 = success, -1 = client error, 401006 = auth fail
  errorType: number;
  msg: string;            // "Successfully" or error text
  msgObjStr: string;      // usually ""
  data: {
    itemPageVo: {
      pageNo: number;
      pageToken: null;    // unused
      pageSize: number;
      totalPage: number;
      totalSize: number;
      rows: BigSellerOrderRow[];
    };
    // Aggregates (sum across the entire query, not just this page)
    totalProfit: number;
    totalPlatformIncome: number;
    totalCostFee: number;
    totalSaleAmount: number;
    totalProfitMargin: number;
    totalGrossProfitMargin: string; // formatted "%"
    totalOrderAmount: number;
    totalSellerTradeFee: number;
    totalCommissionFee: number;
    totalServiceFee: number;
    totalDiscountFee: number;
    totalReturnRefund: number;
    totalOtherFee: number;
    totalBuyerShippingFee: number;
    totalSellerShippingFee: number;
    totalMarketingFee: number;
    totalPackingFee: number;
    totalRent: number;
    totalAdvertisingCost: number;
    totalOtherCost: number;
    totalShopAdjustmentFee: number;
    totalPlatformOtherFee: number;
    totalAllSkuNum: number;
    orderProfitCycleComparisonMap: Record<string, {
      growthRatio: string;          // "--" if no prior data
      displayType: number;
      nowCurrDateTime: string;       // "2026-01-26~2026-02-25"
      lastDatePeriod: string | null; // "2025-12-26~2026-01-25"
      currentData: number | null;
      comparisonData: number | null;
    }>;
  };
};
```

The `BigSellerOrderRow` shape is already documented in
`convex/integrations/bigseller/helpers.ts:152-200` and matches what we capture
in the `bigsellerOrders` schema.

## Analysis scripts produced

All under `tmp/har-analysis/`:
- `analyze_har.py` — Pass-1 endpoint enumeration
- `extract_profit.py` — Per-endpoint headers + bodies + response schemas
- `extract_cookies.py` — Cookie discovery
- `find_muctoken4.py` — Muctoken location resolution

Outputs (also under `tmp/har-analysis/`):
- `endpoints.txt` — full endpoint inventory
- `profit/*.md` — per-endpoint request/response detail
- `profit/*.response.json` — full sample response bodies (~250kB combined)

Per staffreview R6: **promote the request-body JSON blobs as test fixtures**
before deleting the analysis dir. The Python scripts can be deleted; the JSON
must move to `convex/integrations/bigseller/__tests__/fixtures/` so 83-01a's
HAR-fixture body-shape lock test (staffreview I1) has data to assert against.

## Related docs

- `docs/BIGSELLER_PROFIT_API.md` — current reference (Feb 2026 — will be updated by 83.01)
- `.planning/debug/bigseller-latest-dates-no-orders.md` — 2026-05-08 observability fix
- Memory `MEMORY.md` — "BigSeller COGS = 0 for all Frollie orders" open blocker (unaffected by this fix)
