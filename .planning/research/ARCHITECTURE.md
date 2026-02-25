# Architecture Research

**Domain:** Multi-channel sales integration — GrabFood POS API, BigSeller (Shopee/TikTok), Consignment Excel upload, Unified Analytics
**Researched:** 2026-02-25
**Confidence:** HIGH — based on direct inspection of existing codebase, existing API docs, and confirmed integration patterns

---

## Standard Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                          React 19 Frontend                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────┐  ┌──────────┐  │
│  │ GrabFood       │  │ BigSeller      │  │Consignment │  │ Sales    │  │
│  │ Manager (NEW)  │  │ Sync Panel     │  │ Upload     │  │ Analytics│  │
│  │                │  │ (new tab)      │  │ (NEW page) │  │(extended)│  │
│  └───────┬────────┘  └──────┬─────────┘  └────┬───────┘  └────┬─────┘  │
│          └─────────────────┴──────────────────┴──────────────┘         │
│               Convex hooks: useQuery / useMutation / useAction          │
└──────────────────────────────────────────────────────────────────────--┘
                               │ Convex WebSocket
┌──────────────────────────────▼─────────────────────────────────────────┐
│                        Convex Serverless Backend                         │
├──────────────────────────────────────────────────────────────────────── ┤
│  integrations/grabfood/adapter.ts  (EXISTS — extend webhook + history)  │
│  integrations/bigseller/adapter.ts (NEW — sync-poll-query scheduler)    │
│  consignment/mutations.ts          (NEW — xlsx parse + upsert)          │
│  externalData/ mutations + queries (EXTEND — new source literals)       │
├────────────────────────────────────────────────────────────────────────┤
│  http.ts  (EXTEND — register GrabFood webhook routes)                   │
│  crons.ts (EXTEND — GrabFood token refresh, BigSeller daily sync)       │
├────────────────────────────────────────────────────────────────────────┤
│  schema.ts: ~65 tables (4 new: grabfoodOrders, bigsellerOrders,         │
│             bigsellerDailyStats, consignmentUploads)                     │
│  externalRevenue.source union: add "grabfood" | "bigseller"             │
└────────────────────────────────────────────────────────────────────────┘
         │                   │                    │
┌────────▼────────┐  ┌───────▼──────────┐  ┌─────▼────────────────────┐
│ partner-api     │  │ www.bigseller.com │  │ Client-side xlsx parse   │
│ .grab.com       │  │ /api/v1/statis/  │  │ (no external service)    │
│ (OAuth2)        │  │ profit/          │  │                          │
└─────────────────┘  └──────────────────┘  └──────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `integrations/grabfood/adapter.ts` | GrabFood OAuth2 token lifecycle, order management actions, store control, webhook handlers | EXISTS — complete webhook handler + order history sync needed |
| `integrations/bigseller/adapter.ts` | BigSeller sync-poll-query workflow, JWT cookie auth, daily cron trigger | NEW |
| `consignment/mutations.ts` | Upsert parsed consignment rows into `externalRevenue` with dedup | NEW |
| `consignment/actions.ts` | Client-side xlsx parse + column mapping, calls mutation | NEW (if server-side parse chosen) |
| `externalData/mutations.ts` | `saveRevenue` upsert, `saveRevenueItems`, outlet CRUD | EXISTS — extend `sourceValidator` union |
| `externalData/queries.ts` | Revenue aggregation, outlet lookup, sync log queries | EXISTS — extend for new sources |
| `http.ts` | HTTP routes including GrabFood webhooks | EXISTS — add 2 new routes |
| `crons.ts` | Scheduled jobs | EXISTS — add GrabFood token refresh + BigSeller daily cron |
| `SalesAnalytics.tsx` + tabs | Unified multi-channel analytics view | EXISTS — extend with new channels and BigSeller panel |
| `GrabFoodManager.tsx` | Store status, pause/unpause, order history per merchant | NEW page |
| `ConsignmentUpload.tsx` | Excel drag-drop, column mapping, preview, submit | NEW page |

---

## Integration Architecture by Feature

### Feature 1: GrabFood POS API

**What already exists (`convex/integrations/grabfood/adapter.ts`):**
- `fetchFreshToken()` — OAuth2 client credentials flow, 1h token with expiry buffer
- `resolveToken(ctx)` — DB-first token cache, falls back to env vars, auto-fetches if expired
- `grabRequest()` — generic GET/POST/PUT/DELETE with Authorization header
- `testConnection`, `respondToOrder`, `markOrderReady`, `getStoreStatus`, `pauseStore`, `notifyMenuUpdate` — all public actions (callable from frontend)
- `handleOrderWebhook` — HTTP handler: returns 200 immediately, logs payload, but does NOT persist to DB
- `handleMenuSyncWebhook` — HTTP handler: returns 200, logs sync status
- `autoRefreshToken` — internal action for cron (not yet wired to cron)

**What is missing:**

1. **Webhook handlers must persist data.** `handleOrderWebhook` currently only logs. It needs to schedule an internal mutation via `ctx.scheduler.runAfter(0, ...)` to store the order. Correct Convex pattern: HTTP action returns 200 immediately, async processing via scheduler.

2. **`grabfoodOrders` schema table.** New table to store raw incoming GrabFood orders. Fields: `orderID` (string, dedup key), `merchantID`, `shortOrderNumber`, `orderTime` (ISO string), `orderTimeMs` (number for index), `orderState`, `subtotal`, `currency`, `items` (array), `syncedAt`. Index: `by_order_id` on `orderID`.

3. **`syncOrderHistory` action.** Pull-based sync: calls `GET /partner/v1/orders?merchantID=...&fromDate=...&page=N`, paginates while `more: true`, upserts into `grabfoodOrders`. Each synced order also creates an `externalRevenue` record with `source: "grabfood"` to feed unified analytics.

4. **HTTP route registration in `http.ts`.** The webhook handler functions exist in the adapter but are not yet registered as routes. Must add:
   ```
   /api/grabfood/order       → handleOrderWebhook
   /api/grabfood/menu-sync   → handleMenuSyncWebhook
   ```

5. **Cron wiring in `crons.ts`.** Currently `crons.ts` has no active jobs. Must add `autoRefreshToken` every 45 minutes.

6. **Revenue bridge.** GrabFood orders must feed `externalRevenue` for unified analytics. Pattern mirrors GoBiz exactly: `source: "grabfood"`, `externalTransactionId: orderID` (dedup key). This requires adding `v.literal("grabfood")` to the `source` union.

**Data flow:**
```
[Webhook path — real-time]
GrabFood customer places order
    → POST /api/grabfood/order to convex.site
    → handleOrderWebhook: return 200 immediately
    → ctx.scheduler.runAfter(0, internal.grabfoodOrders.upsertOrder, order)
    → grabfoodOrders row upserted + externalRevenue record created
    → SalesAnalytics useQuery auto-updates (Convex reactive)

[Pull path — manual / cron]
    → syncOrderHistory action (admin triggers or daily cron)
    → GET /partner/v1/orders with date range, paginate while more=true
    → upsert grabfoodOrders + externalRevenue rows
```

---

### Feature 2: BigSeller Profit Sync

**What already exists:** Nothing. The `convex/integrations/` folder does not contain `bigseller/`. Build from scratch following the established adapter module pattern.

**Auth constraint:** BigSeller uses a JWT session cookie (`muc_token`) obtained from browser login. 30-day expiry, auto-extends on each use. This is the same pattern as GoBiz — manual paste into `platformCredentials` table. Store as: `platformId: "bigseller"`, `currentToken: jwtValue`. No programmatic login available.

**3-phase async sync flow:**

BigSeller's API does not return data immediately. It triggers a background job, requires polling for completion, then queries the results. A Convex action cannot block for 8+ minutes. The correct pattern is scheduler-based polling:

```
Phase 1: POST /sync/task/create.json
    → triggers BigSeller background job
    → record sync start in externalSyncLogs

Phase 2: Poll GET /sync/task/detail/new/get.json every 60s
    → use ctx.scheduler.runAfter(60_000, internalFn, args)
    → each scheduled call is independent, not a sleep loop
    → check progressInfo.taskStatus: "progress" → reschedule, "complete" → proceed

Phase 3a: POST /listStatsData.json
    → daily aggregated stats → upsert bigsellerDailyStats

Phase 3b: POST /pageList.json (paginate totalPage)
    → per-order rows → upsert bigsellerOrders
    → for each order: create externalRevenue record (source="bigseller")
```

**New schema tables:**

`bigsellerOrders`:
```typescript
platformOrderId: v.string()   // dedup key, from BigSeller response
shopId: v.number()
shopName: v.string()
platform: v.string()           // "shopee" | "tiktok" | "tokopedia"
orderState: v.string()
orderTimeMs: v.number()
saleAmount: v.number()
platformIncome: v.number()
costFee: v.number()
profit: v.number()
profitMarginDouble: v.number()
commissionFee: v.number()
sellerShippingFee: v.number()
buyerShippingFee: v.number()
skuList: v.array(v.object({ sku: v.string(), skuNum: v.number(), returnNum: v.number() }))
syncedAt: v.number()
// .index("by_order_id", ["platformOrderId"])
// .index("by_shop_date", ["shopId", "orderTimeMs"])
```

`bigsellerDailyStats`:
```typescript
statDate: v.string()           // YYYY-MM-DD — dedup key
saleAmount: v.number()
platformIncome: v.number()
costFee: v.number()
profit: v.number()
discountFee: v.number()
profitMarginDouble: v.number()
syncedAt: v.number()
// .index("by_date", ["statDate"])
```

**31-day window constraint:** BigSeller enforces max 31 days per sync. Daily cron approach: trigger sync for yesterday→today each day. Initial backfill requires user-triggered sequential syncs (not automated — too many sequential 8-minute jobs). Expose a "Sync Range" UI in the BigSeller settings panel.

**Only one sync at a time:** BigSeller returns `code: -1` if a sync is already running. Before triggering, poll `sync/task/detail/new/get.json` to check current status. If `taskStatus: "progress"`, show "Sync in progress" UI and do not trigger again.

**Revenue bridge:** BigSeller orders feed `externalRevenue` with `source: "bigseller"`, `externalTransactionId: platformOrderId`. SKU codes in `skuVoList` map to `menuProducts` via the existing `externalProductMappings` table with `source: "bigseller"`.

---

### Feature 3: Consignment Sales Excel Upload

**Architecture decision: client-side parse, server-side storage.**

The existing ARCHITECTURE.md (Feb 22) specified server-side parsing via a Convex HTTP action + SheetJS in the action. That approach is valid but adds complexity. Given the CLAUDE.md warning about static imports and the Convex action size limits, the cleaner approach for v1.4 is **client-side parsing** with clean JSON submission to a mutation:

```
Browser:
  1. User drops Excel file
  2. xlsx.read(arrayBuffer) — runs in browser, zero server interaction
  3. Transform rows to typed ConsignmentSaleRow[]
  4. Show column mapping UI (map detected headers to expected fields)
  5. Preview table with validation errors highlighted
  6. User clicks "Submit N rows"
  7. useMutation(api.consignment.mutations.upsertSales, { rows, outletId, fileName })

Convex mutation:
  1. requireRole — manager/admin only
  2. Idempotent upsert externalOutlets row for this consignment outlet
  3. Insert consignmentUploads audit row (rowCount, fileName, uploadedBy)
  4. For each row: dedup check → insert externalRevenue (source="consignment")
  5. Return { uploadId, rowCount, skipped }
```

**Why client-side over server-side:**
- Avoids SheetJS as a Convex action dependency (SheetJS is ~600KB, adds to bundle)
- Column mapping UI is in the browser anyway — parsing there gives immediate row preview
- Client-side parse is simpler to test and debug
- `xlsx` as a frontend dep is already the standard React Excel pattern
- Mutation receives clean typed JSON — no file bytes travel to the server

**`consignmentUploads` table** (carried forward from Feb 22 research, no change):
```typescript
consignmentUploads: defineTable({
  outletId: v.id("externalOutlets"),
  uploadedBy: v.string(),
  uploadedAt: v.number(),
  fileName: v.string(),
  format: v.union(v.literal("bulk_summary"), v.literal("detail")),
  periodStart: v.number(),
  periodEnd: v.number(),
  rowCount: v.number(),
  status: v.union(v.literal("complete"), v.literal("error"), v.literal("deleted")),
  errorMessage: v.optional(v.string()),
})
  .index("by_outlet", ["outletId"])
  .index("by_uploaded_at", ["uploadedAt"]),
```

Revenue rows link back via `consignmentUploadId: v.optional(v.id("consignmentUploads"))` on `externalRevenue`. This enables batch delete (undo an upload).

**Column mapping step is required.** Consignment POS Excel files vary by outlet. The upload page must detect column headers and let the user assign them to: Date, Product Name, Quantity, Unit Price, Total Revenue, Reference (optional). Pre-fill obvious matches by fuzzy name (e.g. "Tanggal" → Date, "Nama Produk" → Product Name, "Qty" → Quantity).

---

### Feature 4: Unified SalesAnalytics Revamp

**What already exists:** `src/pages/SalesAnalytics.tsx` with OverviewTab, ProductMappingTab, SettingsTab. Currently covers K3Mart, GoBiz, Internal channels. Uses `externalRevenue` as the single data source. This is the correct architecture — just extend it.

**Changes required:**

1. **Schema `source` union extension** — Add `"grabfood"`, `"bigseller"`, `"consignment"` to `externalRevenue.source`, `externalRevenueItems.source`, `externalSyncLogs.source`, and the `sourceValidator` const in `externalData/queries.ts`.

2. **OverviewTab chart extension** — The Recharts stacked bar chart already in use gets 3 new data series. Each series needs a distinct color and legend label. The existing `sourceToPlatform()` mapping function in the analytics queries must include new source labels.

3. **BigSeller settings panel** — New section in SettingsTab: paste `muc_token` JWT, trigger manual sync, show sync progress (polling `externalSyncLogs` for bigseller status), show last sync date and order count.

4. **GrabFood connection status** — New row in SettingsTab: shows whether client credentials are configured, last token refresh, outlet list.

5. **Consignment upload link** — SettingsTab links to `/consignment` page.

6. **`getRevenueByChannel` query extension** — Add `"grabfood"`, `"bigseller"`, `"consignment"` to the `platforms` array in `getRevenueTimeSeries` and `getDashboardSummaryByPeriod`. These are purely additive — existing channel totals are unaffected.

7. **BigSeller-specific analytics view** — BigSeller provides richer data (commission fees, shipping fees, per-order profit margin) that `externalRevenue` doesn't capture fully. For the basic v1.4 integration, store `platformIncome` as `revenueNet` and `saleAmount` as `revenueGross` in `externalRevenue`. The raw `bigsellerOrders` table retains all fee detail for a future drill-down view.

---

## Recommended File Structure (New + Modified Files)

```
convex/
├── integrations/
│   ├── bigseller/
│   │   ├── adapter.ts       # triggerSync, pollSync, fetchSyncData ("use node")
│   │   ├── config.ts        # BASE_URL, endpoints, header builder with muc_token cookie
│   │   ├── helpers.ts       # response parsers, dedup key builders
│   │   └── mutations.ts     # markSyncComplete, recordSyncError (internalMutation)
│   ├── grabfood/
│   │   └── adapter.ts       # EXTEND: complete webhook persistence, add syncOrderHistory
│   └── registry.ts          # EXTEND: add "grabfood" | "bigseller" | "consignment" to PlatformId
├── grabfoodOrders/
│   ├── mutations.ts          # upsertOrder (internal + bridge to externalRevenue)
│   └── queries.ts            # listOrders, getOrdersByMerchant (public)
├── bigsellerOrders/
│   ├── mutations.ts          # upsertOrder, upsertDailyStats (internal)
│   └── queries.ts            # listOrders, getDailyStats (public)
├── consignment/
│   ├── mutations.ts          # upsertSales (public, requireRole), deleteBatch
│   └── queries.ts            # listUploads, getUploadById
├── externalData/
│   └── mutations.ts          # EXTEND: sourceValidator adds grabfood/bigseller/consignment
├── schema.ts                 # EXTEND: 4 new tables, 3 new source literals, consignmentUploadId on externalRevenue
├── http.ts                   # EXTEND: register /api/grabfood/order, /api/grabfood/menu-sync
└── crons.ts                  # EXTEND: grabfood token refresh (45 min), bigseller daily sync

src/
├── pages/
│   ├── GrabFoodManager.tsx   # NEW: store status, pause/unpause, order history
│   ├── ConsignmentUpload.tsx # NEW: Excel dropzone, column mapper, preview, submit
│   └── SalesAnalytics.tsx    # EXTEND: BigSeller panel, consignment channel
├── components/
│   ├── salesAnalytics/
│   │   ├── OverviewTab.tsx        # EXTEND: new channels in stacked chart
│   │   ├── BigSellerPanel.tsx     # NEW: sync status, trigger, profit overview
│   │   └── SettingsTab.tsx        # EXTEND: BigSeller JWT + GrabFood connection
│   ├── grabfood/
│   │   ├── StoreStatusCard.tsx    # NEW
│   │   └── OrderHistoryTable.tsx  # NEW
│   └── consignment/
│       ├── ExcelDropzone.tsx      # NEW
│       ├── ColumnMapper.tsx       # NEW (map detected headers to expected fields)
│       └── SalePreviewTable.tsx   # NEW
├── hooks/convex/
│   ├── useGrabFoodOrders.ts  # NEW
│   ├── useBigSeller.ts       # NEW
│   └── useConsignment.ts     # NEW
└── App.tsx                   # EXTEND: add routes /grabfood, /consignment
```

---

## Architectural Patterns

### Pattern 1: Platform Adapter Module

**What:** Each external platform lives in `convex/integrations/{platform}/`. The adapter exports public `action`s (callable from frontend hooks) and `internalAction`s (callable from cron/scheduler). A `config.ts` holds all URLs and credentials resolution. A `mutations.ts` holds `internalMutation`s that the adapter calls via `ctx.runMutation`.

**When to use:** Every new external API integration. GrabFood, BigSeller, K3Mart, GoBiz all follow this pattern.

**Trade-offs:** Some boilerplate per platform, but clear separation. Adapter files must use `"use node"` directive for `fetch()`. Mutation files must NOT use `"use node"` — Convex DB access is unavailable in the Node runtime context.

**Example — BigSeller adapter skeleton:**
```typescript
// convex/integrations/bigseller/adapter.ts
"use node";
import { action, internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";
import { BIGSELLER_CONFIG, buildBigSellerHeaders } from "./config";

export const triggerSync = action({
  args: { token: v.string(), startTime: v.string(), endTime: v.string() },
  handler: async (ctx, args) => {
    // validate admin, call sync/task/create.json, schedule first poll
    await ctx.scheduler.runAfter(60_000, internal.integrations.bigseller.adapter.pollSync, {});
    return { success: true };
  },
});

export const pollSync = internalAction({
  args: {},
  handler: async (ctx) => {
    const status = await fetchBigSellerSyncStatus(ctx);
    if (status.taskStatus === "complete") {
      await ctx.scheduler.runAfter(0, internal.integrations.bigseller.adapter.fetchSyncData, {});
    } else if (status.taskStatus === "progress") {
      await ctx.scheduler.runAfter(60_000, internal.integrations.bigseller.adapter.pollSync, {});
    } else {
      await ctx.runMutation(internal.integrations.bigseller.mutations.recordSyncError, { error: status.errorMsg ?? "unknown" });
    }
  },
});
```

### Pattern 2: Scheduler-Based Async Poll

**What:** When an external API has multi-minute async jobs (BigSeller sync takes ~8 minutes), Convex actions cannot block. Instead, use `ctx.scheduler.runAfter(delayMs, internalFn, args)` to schedule follow-up polls. Each invocation is a fresh function call; state between calls lives in the DB.

**When to use:** Any integration where external processing exceeds ~30 seconds. BigSeller is the only current case. GoBiz journals are synchronous per request (no polling needed).

**Trade-offs:** Each scheduler invocation is independently logged and retried by Convex on failure. No in-memory state needed. However, if the Convex deployment is cold-started between polls, the scheduler still fires (scheduler is persistent, not in-process).

**Polling termination:** Always have a max-retry guard. Store poll count in a `bigsellerSyncState` table row. If count exceeds 20 (20 × 60s = 20 minutes), mark sync as failed and stop scheduling.

### Pattern 3: Webhook 200-Immediate with Async Processing

**What:** GrabFood requires HTTP 200 within a tight timeout. The `handleOrderWebhook` HTTP action must return 200 before doing any work. Process the order asynchronously via `ctx.scheduler.runAfter(0, internalFn, parsedOrder)`.

**When to use:** Any incoming webhook where the sender has a response timeout (GrabFood, any push-notification API).

**Trade-offs:** The webhook handler cannot report processing failures to GrabFood — it already returned 200. Failures must be handled internally (logging, retry logic in the scheduled function). Use `requestID` from GrabFood to deduplicate retransmissions.

**Example:**
```typescript
export const handleOrderWebhook = httpAction(async (ctx, request) => {
  const body = await request.text();
  let order: any;
  try { order = JSON.parse(body); } catch { return new Response("OK", { status: 200 }); }

  // Return 200 immediately — critical to avoid Grab auto-cancellation
  ctx.scheduler.runAfter(0, internal.grabfoodOrders.mutations.upsertOrder, { order });

  return new Response("OK", { status: 200 });
});
```

### Pattern 4: Client-Side Excel Parse + Typed Mutation Submit

**What:** Parse Excel files in the browser using `xlsx`. Transform to a validated TypeScript array. Show a column mapping UI for field assignment. Submit only clean typed JSON to a Convex mutation.

**When to use:** Any file upload where the file format is user-controlled (consignment POS Excel varies by outlet).

**Trade-offs:** Shifts complexity to the browser (acceptable), requires `xlsx` as a client dependency. Mutation receives only valid typed data — all parsing errors are caught in the browser before submission.

**Example:**
```typescript
// ConsignmentUpload.tsx
import * as XLSX from "xlsx";

const onDrop = (files: File[]) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const wb = XLSX.read(e.target?.result, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    setHeaders(rows[0] as string[]);
    setDataRows(rows.slice(1));
  };
  reader.readAsArrayBuffer(files[0]);
};
```

### Pattern 5: Source Union Extension (Revenue Unification)

**What:** All sales events from all channels flow into `externalRevenue` with a `source` field. Raw platform data (`grabfoodOrders`, `bigsellerOrders`) is stored separately for drill-down, but analytics queries read only from `externalRevenue`. This is the existing GoBiz/K3Mart pattern — extend it, never deviate.

**When to use:** Every new sales channel.

**Checklist when adding a new source (e.g. "bigseller"):**
- Add `v.literal("bigseller")` to `externalRevenue.source` union in schema.ts
- Add same literal to `externalRevenueItems.source`
- Add same literal to `externalSyncLogs.source`
- Update `sourceValidator` const in `externalData/queries.ts`
- Update `sourceToPlatform()` display name mapping
- Update `platforms` arrays in `getRevenueTimeSeries` and `getDashboardSummaryByPeriod`
- Add color entry to the OverviewTab chart color map

---

## Data Flow

### GrabFood Order Webhook Flow

```
[Customer places GrabFood order]
    ↓
[GrabFood POSTs to https://<deployment>.convex.site/api/grabfood/order]
    ↓
[handleOrderWebhook: parse body → return 200 immediately]
    ↓ (ctx.scheduler.runAfter 0ms)
[internal: grabfoodOrders.mutations.upsertOrder]
    ├── grabfoodOrders row upserted (dedup on orderID)
    └── externalRevenue record created (source="grabfood")
    ↓
[SalesAnalytics useQuery auto-updates via Convex reactive]
```

### BigSeller Daily Sync Flow

```
[Daily cron at 03:00 WIB — or manual trigger from Settings]
    ↓
[bigseller/adapter.triggerSync (action)]
    ↓
[POST /sync/task/create.json with muc_token cookie]
    ↓
[ctx.scheduler.runAfter(60_000, pollSync)]
    ↓
[pollSync (internalAction) — repeats every 60s until complete]
    ↓ (progressInfo.taskStatus = "complete")
[fetchSyncData (internalAction)]
    ├── POST /listStatsData.json → bigsellerDailyStats upserted
    └── POST /pageList.json (paginate) → bigsellerOrders upserted
              ↓
    [externalRevenue records created per order (source="bigseller")]
              ↓
    [SalesAnalytics auto-updates]
```

### Consignment Upload Flow

```
[Admin opens ConsignmentUpload page]
    ↓
[Drag-drop Excel file → FileReader.readAsArrayBuffer]
    ↓ (browser: ~instant)
[xlsx.read → sheet_to_json → setHeaders + setDataRows]
    ↓
[ColumnMapper: map detected headers to Date/Product/Qty/Price/Ref]
    ↓
[SalePreviewTable: validated rows, flag missing/invalid cells]
    ↓
[User clicks "Submit N rows"]
    ↓
[useMutation(api.consignment.mutations.upsertSales)]
    ↓
[Convex: idempotent outlet upsert + consignmentUploads insert + externalRevenue rows]
    ↓
[SalesAnalytics auto-updates; upload history list refreshes]
```

### Unified Analytics Query Flow

```
[SalesAnalytics OverviewTab mounts / period changes]
    ↓
[useQuery(api.externalData.queries.getRevenueTimeSeries, { period, sources })]
    ↓ (Convex reactive query)
[Query aggregates externalRevenue by source + day]
    ├── source="gobiz"        → GoBiz / GoFood (existing)
    ├── source="grabfood"     → GrabFood POS (NEW)
    ├── source="k3mart"       → K3Mart (existing)
    ├── source="bigseller"    → Shopee / TikTok (NEW)
    ├── source="consignment"  → Consignment outlets (NEW)
    └── source="internal"     → Direct orders (existing)
    ↓
[Recharts stacked bar chart — one color per source]
```

---

## Integration Points

### Existing Modules That Change

| Module | Change | Risk |
|--------|--------|------|
| `convex/schema.ts` | 4 new tables, 3 new `source` literals in union types, `consignmentUploadId` field on `externalRevenue` | LOW — additive, no migration |
| `convex/http.ts` | Register 2 GrabFood webhook routes | LOW — additive |
| `convex/crons.ts` | Add GrabFood token refresh (45 min), BigSeller daily sync cron | LOW — additive |
| `convex/integrations/registry.ts` | Add `"grabfood"` \| `"bigseller"` \| `"consignment"` to `PlatformId` | LOW — additive |
| `convex/externalData/mutations.ts` | Extend `sourceValidator` with 3 new literals | LOW — additive |
| `convex/externalData/queries.ts` | Extend aggregation queries for new sources, add `sourceToPlatform()` entries | MEDIUM — must audit all source arrays |
| `convex/integrations/grabfood/adapter.ts` | Complete `handleOrderWebhook` persistence, add `syncOrderHistory` action | MEDIUM — webhook handler currently stubs |
| `src/pages/SalesAnalytics.tsx` | Add BigSeller panel, consignment channel, update page description | LOW — additive tabs |
| `src/components/salesAnalytics/OverviewTab.tsx` | New data series in stacked chart | LOW — additive dataKeys |
| `src/components/salesAnalytics/SettingsTab.tsx` | BigSeller JWT input, sync trigger, GrabFood connection row | MEDIUM — new credential management UI |
| `src/App.tsx` | Add routes `/grabfood`, `/consignment` | LOW — additive |

### New Modules (No Existing Dependencies to Break)

| Module | Depends On | Notes |
|--------|-----------|-------|
| `convex/integrations/bigseller/` | `platformCredentials`, `externalData`, `scheduler` | Fully new, no existing code touched |
| `convex/grabfoodOrders/` | Schema (new table), GrabFood adapter | Feeds `externalRevenue` |
| `convex/bigsellerOrders/` | Schema (new tables), BigSeller adapter | Feeds `externalRevenue` |
| `convex/consignment/` | Schema (new table), `externalRevenue`, `dispatchConsignmentOutlets` | Feeds `externalRevenue` |
| `src/pages/GrabFoodManager.tsx` | `useGrabFoodOrders`, grabfood adapter actions | New page |
| `src/pages/ConsignmentUpload.tsx` | `useConsignment`, `xlsx` package | New page, requires `npm install xlsx` |

### External Service Contracts

| Service | Auth Method | Token Lifecycle | Convex Storage |
|---------|-------------|-----------------|----------------|
| GrabFood Partner API | OAuth2 Client Credentials | 1h access token, cron-refreshed every 45min | `platformCredentials` (platformId="grabfood"), `email`=clientId, `password`=clientSecret |
| BigSeller API | JWT session cookie (`muc_token`) | 30-day JWT, auto-extends on use | `platformCredentials` (platformId="bigseller"), `currentToken`=jwtValue |
| Excel files | None | N/A | No server storage — parse in browser |

### Schema Source Union — Complete Extension Required

```typescript
// convex/schema.ts — add to ALL source unions
const sourceUnion = v.union(
  v.literal("k3mart"),
  v.literal("gobiz"),
  v.literal("grabfood"),    // NEW
  v.literal("bigseller"),   // NEW
  v.literal("consignment"), // NEW
  v.literal("internal")
);
```

Tables affected: `externalRevenue`, `externalRevenueItems`, `externalSyncLogs`, `externalOutlets`.
This is a schema change requiring a `npx convex deploy`. No data migration needed (additive only).

---

## Build Order (Dependency-Aware)

```
Phase 1 — Schema Foundation (blocks everything)
  ├── Extend source unions in schema.ts
  ├── Add grabfoodOrders, bigsellerOrders, bigsellerDailyStats, consignmentUploads tables
  ├── Add consignmentUploadId optional field to externalRevenue
  ├── Extend registry.ts PlatformId union
  └── Deploy: npx convex deploy

Phase 2 — GrabFood (uses existing adapter, lowest friction)
  ├── Complete handleOrderWebhook → persist via scheduler
  ├── Register webhook HTTP routes in http.ts
  ├── Wire autoRefreshToken cron in crons.ts
  ├── Add syncOrderHistory pull action
  └── Build GrabFoodManager.tsx page

Phase 3 — BigSeller (highest complexity, async poll pattern)
  ├── Build integrations/bigseller/ module (config, helpers, adapter, mutations)
  ├── Implement triggerSync → pollSync → fetchSyncData scheduler chain
  ├── Add daily cron in crons.ts
  ├── Add BigSeller settings panel to SalesAnalytics SettingsTab
  └── Add sync progress indicator (poll externalSyncLogs)

Phase 4 — Consignment Upload (independent, no API complexity)
  ├── npm install xlsx (frontend dep)
  ├── Build consignment/ Convex module (mutations, queries)
  ├── Build ConsignmentUpload.tsx page (dropzone, column mapper, preview)
  └── Register /consignment route in App.tsx

Phase 5 — Unified Analytics Revamp (reads Phase 1-4 data)
  ├── Extend getRevenueTimeSeries for all new sources
  ├── Extend OverviewTab Recharts with new data series + colors
  ├── Update SalesAnalytics page description and tab structure
  └── Add lifetime totals query (getLifetimeTotals on externalRevenue)
```

Phases 2, 3, 4 are independent of each other and can be built by separate agents in parallel after Phase 1. Phase 5 depends on all prior phases having schema + data in place, but the chart extensions show zero values gracefully before data exists.

---

## Anti-Patterns

### Anti-Pattern 1: Blocking Poll Loops in Convex Actions

**What people do:** Write `while (status !== "complete") { await new Promise(r => setTimeout(r, 60000)); }` inside a Convex action.

**Why it's wrong:** Convex actions time out. BigSeller syncs take 8+ minutes. The action will be terminated mid-wait, leaving `pollSync` state orphaned with no recovery mechanism.

**Do this instead:** Use `ctx.scheduler.runAfter(60_000, internal.pollFn, {})` at the end of each poll invocation. Each call is independent, retried by Convex on failure, and has a fresh execution context. Store poll state in the DB between calls.

### Anti-Pattern 2: Parsing Excel in a Convex Mutation

**What people do:** Pass file bytes to a mutation and call `xlsx.read()` inside it.

**Why it's wrong:** Convex mutations run in V8 isolate environment — Node.js modules do not work there. xlsx will fail silently in production (documented CLAUDE.md pitfall #8: "No dynamic imports in Convex").

**Do this instead:** Parse in the browser (client-side xlsx) or in a Convex action (Node.js runtime). Call the mutation only for the DB write step.

### Anti-Pattern 3: Separate Analytics Tables Per Platform

**What people do:** Create `gobizAnalytics`, `grabfoodAnalytics`, `bigsellerAnalytics` as separate tables with separate query shapes.

**Why it's wrong:** The unified analytics view requires a single time series across all channels. Joining three tables at query time in Convex is awkward and slow. Recharts stacked charts need a single normalized dataset.

**Do this instead:** All sales events flow into `externalRevenue` with `source` as the discriminator. Raw platform tables (`bigsellerOrders`, `grabfoodOrders`) exist for drill-down only. Analytics layer reads exclusively from `externalRevenue`.

### Anti-Pattern 4: Storing BigSeller JWT in Environment Variables

**What people do:** Add `BIGSELLER_TOKEN=...` to Convex environment variables.

**Why it's wrong:** The JWT expires in 30 days. Updating a Convex env var requires a redeploy. Ops burden is unacceptable for a token that needs periodic refresh.

**Do this instead:** Store in `platformCredentials` table with `platformId: "bigseller"`. The Settings UI already has credential management patterns from GoBiz. Users paste the new JWT, it is stored immediately without a deploy.

### Anti-Pattern 5: Duplicating Action Logic Between Public Action and Internal Cron

**What to avoid repeating:** The GoBiz adapter has ~200 lines duplicated between `syncGoBizRevenue` (public action) and `autoSyncGoBizRevenue` (internal action). This is acknowledged tech debt.

**Do this instead for BigSeller:** Extract shared sync logic into a `runSync(ctx, { triggeredBy })` function at the top of `adapter.ts`. Both the public `triggerSync` action and the internal `triggerDailySync` cron action call `runSync(ctx, ...)`. Zero duplication.

---

## Scaling Considerations

This is an internal operations tool for a single company. Scale is a non-issue. The following notes are correctness concerns, not performance optimization:

| Concern | Mitigation |
|---------|------------|
| GrabFood webhook dedup | Use `requestID` from webhook payload. Check `grabfoodOrders` for existing row before insert. Grab retries failed webhooks — dedup prevents double-counting revenue. |
| BigSeller 31-day limit | Daily cron stays within limit. Initial backfill: manual sequential sync triggers via UI. |
| BigSeller one-sync-at-a-time | Before triggering, check `progressInfo.taskStatus`. If "progress", return error to UI ("Sync already running"). |
| BigSeller poll runaway | Guard: if poll count exceeds 20 (20 min), mark sync as failed and stop scheduling. Store poll count in a config table row. |
| GrabFood token expiry | 1h token, cron-refreshed every 45min. No action needed during normal operation. |
| BigSeller JWT expiry | 30-day JWT. Show warning badge in Settings if last successful sync was >25 days ago. |
| `externalRevenue` full scan | `getLifetimeTotals` does a full collect. Acceptable at < 50K rows. Add pre-aggregated cache table if it becomes slow (v1.5+). |

---

## Sources

- Direct inspection: `convex/integrations/gobiz/adapter.ts` — canonical multi-phase sync pattern (HIGH confidence)
- Direct inspection: `convex/integrations/grabfood/adapter.ts` — existing GrabFood module skeleton (HIGH confidence)
- Direct inspection: `convex/integrations/grabfood/config.ts` — GrabFood endpoint constants (HIGH confidence)
- Direct inspection: `convex/schema.ts` — current table structure and union validators (HIGH confidence)
- Direct inspection: `convex/integrations/registry.ts` — platform registry pattern (HIGH confidence)
- Direct inspection: `convex/http.ts`, `convex/crons.ts` — current HTTP routing and cron state (HIGH confidence)
- Direct inspection: `src/pages/SalesAnalytics.tsx` — existing analytics page structure (HIGH confidence)
- `docs/GRABFOOD_API.md` — official GrabFood Partner API v1.1.3 OpenAPI reference (HIGH confidence)
- `docs/BIGSELLER_PROFIT_API.md` — BigSeller API from browser network traffic, verified against Frollie's actual data (MEDIUM confidence — unofficial reverse-engineered API)
- CLAUDE.md pitfall #8: "No dynamic imports in Convex — fails silently in production" (HIGH confidence)
- Convex `ctx.scheduler.runAfter` — official pattern for long-running async jobs (HIGH confidence)

---

*Architecture research for: Frollie Recipe Master v1.4 — GrabFood POS API + BigSeller + Consignment + Unified Analytics*
*Researched: 2026-02-25*
