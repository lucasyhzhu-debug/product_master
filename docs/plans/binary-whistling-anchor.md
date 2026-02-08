# K3Mart Consignment API Integration Plan

## CTO Executive Summary

**Objective:** Integrate K3Mart's consignment stock API into Frollie Recipe Master to provide real-time stock monitoring, sales inference, and multi-channel price tracking — displayed on both the Dashboard and a new dedicated Sales Analytics page.

**Why K3Mart first:** K3Mart has a working, authenticated API (`consapi.k3mart.id`) that returns stock data with prices across channels (K3Mart, GrabFood/GoFood, GrabMart, Shopee). GrabFood/GoFood public APIs lack historical sales endpoints — their webhook capture is planned as Phase 2.

**Key technical insight:** Sales are *inferred* from stock quantity deltas between snapshots (stock decrease = units sold). This is an approximation — restocking events and shrinkage create noise. The UI must clearly communicate this.

---

## Branch Setup

```bash
# Create feature branch in this worktree
git switch -c feature/k3mart-sales-integration
```

---

## Wave 1: Schema & Backend Foundation

### 1a. Schema Changes (`convex/schema.ts`)

Add 3 new tables + 1 mapping table:

**`externalOutlets`** — External retail outlet/store locations
```typescript
externalOutlets: defineTable({
  source: v.union(v.literal("k3mart")),  // Type-safe, extensible later
  externalId: v.string(),       // "48" (K3Mart outlet ID)
  name: v.string(),             // "K3Mart Outlet 48"
  address: v.optional(v.string()),
  isActive: v.boolean(),
  lastSyncAt: v.optional(v.number()),
  lastSyncStatus: v.optional(v.union(
    v.literal("success"), v.literal("error"), v.literal("partial")
  )),
  lastSyncError: v.optional(v.string()),
  createdBy: v.string(),
  createdAt: v.number(),
})
  .index("by_source", ["source"])
  .index("by_source_external_id", ["source", "externalId"])
  .index("by_active", ["isActive"]),
```

**`externalStockSnapshots`** — Point-in-time stock data per product per outlet
```typescript
externalStockSnapshots: defineTable({
  outletId: v.id("externalOutlets"),
  snapshotBatchId: v.string(),      // UUID grouping one sync run
  snapshotAt: v.number(),           // Timestamp of fetch
  externalProductId: v.string(),    // K3Mart product_id
  externalProductCode: v.string(),  // K3Mart product_code
  productName: v.string(),
  quantity: v.number(),
  price: v.number(),                // K3Mart retail price (IDR)
  priceGrabfoodGofood: v.optional(v.number()),
  priceGrabmart: v.optional(v.number()),
  priceShopee: v.optional(v.number()),
  capital: v.optional(v.number()),  // COGS from K3Mart
})
  .index("by_outlet", ["outletId"])
  .index("by_batch", ["snapshotBatchId"])
  .index("by_outlet_product", ["outletId", "externalProductId"])
  .index("by_outlet_snapshot", ["outletId", "snapshotAt"]),
```

**`externalSyncLogs`** — Audit trail for sync operations
```typescript
externalSyncLogs: defineTable({
  source: v.union(v.literal("k3mart")),
  outletId: v.optional(v.id("externalOutlets")),
  snapshotBatchId: v.optional(v.string()),
  syncType: v.union(v.literal("scheduled"), v.literal("manual")),
  status: v.union(
    v.literal("started"), v.literal("success"), v.literal("error")
  ),
  productsCount: v.optional(v.number()),
  errorMessage: v.optional(v.string()),
  durationMs: v.optional(v.number()),
  triggeredBy: v.optional(v.string()),
  timestamp: v.number(),
})
  .index("by_source", ["source"])
  .index("by_timestamp", ["timestamp"])
  .index("by_outlet", ["outletId"]),
```

**`externalProductMappings`** — Links K3Mart products to internal menu products (Important for cross-referencing)
```typescript
externalProductMappings: defineTable({
  source: v.union(v.literal("k3mart")),
  externalProductCode: v.string(),
  externalProductName: v.string(),
  menuProductId: v.optional(v.id("menuProducts")),  // null = unmapped
  isAutoMapped: v.boolean(),    // true if matched by code
  createdAt: v.number(),
})
  .index("by_source_code", ["source", "externalProductCode"])
  .index("by_menu_product", ["menuProductId"]),
```

### 1b. Backend Module (`convex/k3mart/`)

**`convex/k3mart/actions.ts`** — External API calls (`"use node"` directive)

- `fetchOutletStock` (internalAction): Calls K3Mart API with pagination, returns all products for one outlet
  - Headers: `Authorization: JWT {token}`, `Accept: application/json`, `Origin: https://umkm.k3mart.id`, `Referer: https://umkm.k3mart.id/`
  - Pagination: Loop pages with 500ms delay between requests
  - Error handling: Catch 401 (token expired), 429 (rate limit), 5xx (server error), network timeout
  - Returns: `{ products: Product[], totalCount: number }`

- `syncOutlet` (internalAction): Orchestrates one outlet sync
  - Generate snapshotBatchId (UUID)
  - Call fetchOutletStock
  - Call internalMutation to save snapshots (batch writes of 200 docs max per mutation call)
  - Call internalMutation to log sync result
  - Update outlet lastSyncAt/lastSyncStatus

- `syncAllOutlets` (internalAction): Called by cron
  - Query active outlets via internalQuery
  - Sequentially sync each outlet with 2s delay between outlets
  - Log individual failures, continue to next outlet

- `manualSync` (action): Public action callable from frontend
  - Takes optional `outletId` (sync one) or syncs all active
  - Auth check via token arg + requireRole(["admin", "manager"])
  - Returns summary: `{ synced: number, failed: number, errors: string[] }`

- `discoverOutlets` (action): One-time admin action
  - Scans outlet IDs 1-100 with 300ms delay
  - Returns list of outlets with stock data
  - Admin-only auth check

**`convex/k3mart/mutations.ts`** — Data storage

- `saveStockSnapshot` (internalMutation): Batch-insert snapshot rows (max 200 per call)
- `logSync` (internalMutation): Insert sync log entry
- `createOutlet` (mutation): Admin creates outlet record
- `updateOutlet` (mutation): Toggle active, update name
- `upsertProductMapping` (mutation): Link K3Mart product to menu product

**`convex/k3mart/queries.ts`** — Frontend reads

- `listOutlets`: All outlets with sync status
- `getLatestStock(outletId)`: Most recent snapshot batch for an outlet
- `getStockHistory(outletId, externalProductId, fromTs?, toTs?)`: Time-series for one product
- `getLatestSummary`: Aggregated view across all active outlets
- `inferSales(outletId?)`: Compare latest 2 snapshots, compute quantity deltas
- `getSyncLogs(limit?)`: Recent sync audit entries
- `getDashboardSummary`: Pre-aggregated widget data (total stock, out-of-stock count, top movers, last sync time)
- `getProductMappings`: List product mappings with menu product names

**`convex/k3mart/internalQueries.ts`** — For actions to call

- `getActiveOutlets`: Used by syncAllOutlets cron
- `getLatestBatchId(outletId)`: Most recent snapshotBatchId

### 1c. Cron Job (`convex/crons.ts` — new file)

```typescript
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("k3mart-stock-sync", { minutes: 30 },
  internal.k3mart.actions.syncAllOutlets, {}
);

export default crons;
```

### 1d. Environment Variable

```bash
npx convex env set K3MART_API_TOKEN "eyJhbGci..." --prod  # For production
npx convex env set K3MART_API_TOKEN "eyJhbGci..."          # For dev
```

### 1e. Wave 1 Verification
- Deploy schema to dev: `npx convex dev`
- Manually run `syncOutlet` from Convex dashboard for outlet 48
- Verify `externalStockSnapshots` table populates
- Verify `externalSyncLogs` shows success entry
- Run sync again after 5 min, verify new batch created
- Check `inferSales` query returns meaningful deltas

---

## Wave 2: Permissions & Cron Activation

### 2a. Permission System (`src/lib/types.ts`)

Add `canAccessSalesAnalytics: boolean` to `ROLE_PERMISSIONS`:

| Role | canAccessSalesAnalytics |
|------|------------------------|
| kitchen | false |
| order_staff | false |
| manager | true |
| admin | true |

### 2b. Cron Verification
- Deploy crons.ts to dev
- Wait for 30-min interval to trigger
- Verify `externalSyncLogs` shows `syncType: "scheduled"` entry

### 2c. Seed Test Outlet
- Create outlet via Convex dashboard: `createOutlet({ source: "k3mart", externalId: "48", name: "K3Mart Outlet 48", isActive: true, createdBy: "admin", createdAt: Date.now() })`

---

## Wave 3: Frontend Hooks & Dashboard Widget

### 3a. Hook (`src/hooks/convex/useK3mart.ts`)

Following existing project patterns (camelCase from Convex, transform to frontend types):

```typescript
export function useConvexK3martOutlets()
export function useConvexK3martLatestStock(outletId)
export function useConvexK3martStockHistory(outletId, productId, from?, to?)
export function useConvexK3martLatestSummary()
export function useConvexK3martInferredSales(outletId?)
export function useConvexK3martSyncLogs()
export function useConvexK3martDashboardSummary()
export function useConvexK3martManualSync()
export function useConvexK3martProductMappings()
```

Update `src/hooks/convex/index.ts` barrel export.

### 3b. Dashboard Widget (`src/components/dashboard/K3martStockWidget.tsx`)

Compact card component:
- Header: "K3Mart Sales" with Store icon + last sync timestamp
- Stats row: Total SKUs | Total Stock Units | Out of Stock count
- Mini table: Top 5 products by inferred sales (product name, units sold estimate, current qty)
- Footer: "View Analytics" link to `/analytics/sales` + "Sync Now" button
- Loading skeleton + error states
- Gated behind `hasPermission('canAccessSalesAnalytics')`

Update `src/components/dashboard/index.ts` barrel export.

### 3c. Dashboard Integration (`src/pages/Dashboard.tsx`)

Insert `<K3martStockWidget />` after `<LowStockAlert />` (around line 165), wrapped in permission check.

### 3d. Wave 3 Verification
- Dashboard shows K3Mart widget for admin/manager
- Widget hidden for kitchen/order_staff
- "Sync Now" button triggers manual sync, updates data
- Widget shows loading skeleton while data loads

---

## Wave 4: Sales Analytics Page

### 4a. Page (`src/pages/SalesAnalytics.tsx`)

Tab-based layout with 4 tabs (reduced from 5 — merged Outlets + Sync Status):

1. **Stock Levels** — Table of all products per outlet with qty, prices, stock status color coding
2. **Sales Trends** — Inferred sales from snapshot deltas with period selector (24h, 7d, 30d)
3. **Price Comparison** — Cross-channel price table (K3Mart retail, GrabFood/GoFood, GrabMart, Shopee) with variance highlighting
4. **Settings** — Outlet management (add/edit/deactivate), product mapping to menu products, sync logs, manual sync, outlet discovery (admin only)

### 4b. Tab Components (`src/components/salesAnalytics/`)

- `StockLevelsTab.tsx` — Outlet selector + product table with color-coded stock levels
- `SalesTrendsTab.tsx` — Period selector + inferred sales table with disclaimers about inference accuracy
- `PriceComparisonTab.tsx` — Multi-channel price grid
- `SettingsTab.tsx` — Outlet CRUD + product mapping + sync logs + discover outlets
- `index.ts` — Barrel export

### 4c. Routing (`src/App.tsx`)

```tsx
<Route path="analytics/sales" element={
  <ProtectedRoute requiredPermission="canAccessSalesAnalytics">
    <SalesAnalytics />
  </ProtectedRoute>
} />
```

### 4d. Navigation (`src/components/layout/Header.tsx`)

Add to `allNavItems`:
```typescript
{ path: '/analytics/sales', label: 'Sales', icon: BarChart3, permission: 'canAccessSalesAnalytics' as const },
```

### 4e. Page Export (`src/pages/index.ts`)

Add `SalesAnalytics` export.

### 4f. Wave 4 Verification
- Navigate to `/analytics/sales` as admin
- All 4 tabs render with real data
- Outlet selector filters data
- Sales inference shows stock deltas with clear disclaimers
- Price comparison highlights cross-channel discrepancies
- Settings tab: can add outlet, map products, view sync logs
- Responsive at 280px, 375px, 768px, 1024px

---

## Wave 5: Polish, Testing & Documentation

### 5a. Testing Checklist
- [ ] Backend: syncOutlet succeeds for outlet 48
- [ ] Backend: syncAllOutlets handles outlet failures gracefully
- [ ] Backend: manualSync requires auth (manager/admin)
- [ ] Backend: Snapshot batch writes work with 500+ products (batched 200/mutation)
- [ ] Frontend: Dashboard widget shows/hides based on role
- [ ] Frontend: All tabs render with loading skeletons
- [ ] Frontend: Empty states when no data
- [ ] Frontend: Error states when sync fails
- [ ] Responsive: 280px through 1024px on all views
- [ ] Build: `npm run build` passes
- [ ] Build: `npm run type-check` passes
- [ ] Build: `npm run lint` passes

### 5b. Documentation Updates
- `docs/SCHEMA.md` — Add 4 new tables
- `docs/API_REFERENCE.md` — Add K3Mart queries/mutations/actions
- `docs/CHANGELOG.md` — Feature entry
- `CLAUDE.md` — Update Quick File Finder with K3Mart entries

---

## Complete File List

### New Files (16)
| File | Purpose |
|------|---------|
| `convex/crons.ts` | Cron job definitions |
| `convex/k3mart/actions.ts` | External API calls |
| `convex/k3mart/mutations.ts` | Data storage mutations |
| `convex/k3mart/queries.ts` | Public queries |
| `convex/k3mart/internalQueries.ts` | Internal queries for actions |
| `src/hooks/convex/useK3mart.ts` | Frontend hook wrappers |
| `src/pages/SalesAnalytics.tsx` | Sales Analytics page |
| `src/components/dashboard/K3martStockWidget.tsx` | Dashboard widget |
| `src/components/salesAnalytics/StockLevelsTab.tsx` | Stock levels tab |
| `src/components/salesAnalytics/SalesTrendsTab.tsx` | Sales trends tab |
| `src/components/salesAnalytics/PriceComparisonTab.tsx` | Price comparison tab |
| `src/components/salesAnalytics/SettingsTab.tsx` | Settings/outlets/sync tab |
| `src/components/salesAnalytics/index.ts` | Barrel export |

### Existing Files to Modify (9)
| File | Change |
|------|--------|
| `convex/schema.ts` | Add 4 new tables |
| `src/lib/types.ts` | Add `canAccessSalesAnalytics` permission |
| `src/App.tsx` | Add `/analytics/sales` route |
| `src/pages/index.ts` | Add `SalesAnalytics` export |
| `src/pages/Dashboard.tsx` | Add `K3martStockWidget` |
| `src/components/dashboard/index.ts` | Add widget export |
| `src/components/layout/Header.tsx` | Add Sales nav item |
| `src/hooks/convex/index.ts` | Add K3Mart hook exports |
| `docs/CHANGELOG.md` | Feature changelog entry |

---

## Specialist Review Findings (Incorporated)

### API Integration Specialist
- **Batch writes required:** Convex limits mutations to ~1000 document writes per transaction. With 500+ products per outlet, we batch snapshot inserts at 200 docs per mutation call. The action loops and makes multiple mutation calls.
- **CORS not an issue:** Server-side Node.js actions don't face browser CORS restrictions. The Origin/Referer headers from the Python script should still be sent to satisfy the K3Mart API's expectations.
- **Token rotation:** Monitor for 401 responses. Log token-expiration errors prominently in externalSyncLogs. No auto-rotation possible — admin must manually update the env var.
- **Retry logic:** Actions should retry failed fetches once with exponential backoff (2s wait), then log error and continue to next outlet.

### Schema Architect
- **Use `v.union(v.literal(...))` for `source`:** Type-safe over plain `v.string()`. Start with just `v.literal("k3mart")`, add literals as new channels integrate.
- **Product mapping table added:** Links external product codes to internal `menuProducts` for future cross-referencing in analytics and potentially automated order creation.
- **Snapshot retention:** Plan a cleanup cron (phase 2) to delete snapshots older than 90 days. Not needed in MVP but schema supports it via `snapshotAt` index.
- **Index optimization:** Removed the redundant `by_product_time` compound index. The `by_outlet_snapshot` index covers the primary query pattern (latest snapshots per outlet).

### Staff Review
- **Sales inference disclaimers are mandatory:** UI must clearly state "Estimated sales based on stock changes. Restocking, returns, and breakage may affect accuracy."
- **4 tabs not 5:** Merged Outlets + Sync Status into a single Settings tab to reduce complexity.
- **Cron failure handling:** Convex crons do not auto-retry on failure. Each sync logs its own errors. The dashboard widget should show "Last sync failed" warning state.
- **No impact on existing functionality:** All new tables/modules are isolated. No modifications to existing mutations or queries.

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| K3Mart API rate limiting | Sync failures | Conservative 500ms between pages, 2s between outlets, 30-min cron interval |
| JWT token expiration | All syncs fail | Monitor 401 errors in sync logs, prominent UI warning, admin manual rotation |
| Snapshot storage growth | Convex costs | ~24K rows/day. Plan 90-day retention cleanup cron in Phase 2 |
| Sales inference inaccuracy | User confusion | Clear disclaimers on all inference data, tooltip explanations |
| Convex mutation size limits | Partial sync data | Batch writes at 200 docs per mutation call |

---

## Phase 2 (Future — Not in this PR)

- GrabFood/GoFood webhook capture integration
- Snapshot retention/cleanup cron (90-day TTL)
- Automated product mapping (match K3Mart product_code to menuProducts.code)
- Sales forecasting from historical trend data
- Export to CSV/Excel
