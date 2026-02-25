# Phase 28: BigSeller Integration - Research

**Researched:** 2026-02-25
**Domain:** BigSeller reverse-engineered API integration (Shopee + TikTok via aggregator)
**Confidence:** MEDIUM — reverse-engineered API with known constraints

## Summary

Phase 28 integrates BigSeller's profit analytics API into Frollie's existing multi-platform revenue tracking system. The integration follows a **two-phase async pattern**: trigger a sync task on BigSeller's server, poll until complete, then fetch paginated per-order data via `pageList.json`. This is fundamentally different from GoBiz (direct journal fetch) — it requires a **scheduler-chain pattern** where a Convex action triggers the sync, then schedules itself to poll every 60s until BigSeller finishes processing.

The codebase already has extensive integration infrastructure from Phase 26 (platform credentials, health dashboard, token management) and GoBiz (sync logs, revenue bridge, product mappings, SKU mapping UI). Phase 28 reuses all of these — the primary new work is the BigSeller adapter action (sync trigger + scheduler-chain polling + pageList fetcher), the bigsellerOrders table population, the externalRevenue bridge, and the sync progress UI in the Settings tab.

**Primary recommendation:** Build a single `convex/integrations/bigseller/sync.ts` action module that implements the full sync lifecycle (trigger -> poll -> fetch -> store -> bridge), using `ctx.scheduler.runAfter(60000, ...)` for the polling chain, and surface progress via a `bigsellerSyncState` document that the frontend can reactively query.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Sync trigger lives in the **existing Settings tab within Sales Analytics** — expand the BigSeller row with sync controls, progress, and logs
- **Step-by-step progress card** showing each phase: trigger -> polling (attempt N/8) -> fetching data -> storing -> complete, with checkmarks
- **Background sync** — admin can leave the page, come back later, see result. Scheduler-chain runs server-side. Toast notification on completion
- **Incremental sync** — track last sync date internally, only fetch new transactions since then. Same pattern as GrabFood. Admin can override with manual date range for backfill
- If sync already running on BigSeller side: **join existing sync** — detect running task, show "Sync already in progress", start polling that task instead of creating a new one
- **Inline dropdown per SKU** — same pattern as all other platform integrations (GrabFood, GoFood). Each unmapped SKU shows a dropdown to select a menu product
- **Warning badge + reconciliation section** — yellow badge on BigSeller settings row showing count of unmapped SKUs. Expanding shows the unmapped list with inline mapping dropdowns
- **Revenue only counts after mapping** — unmapped SKU orders are stored but excluded from revenue totals until SKU is mapped. Incentivizes prompt mapping, keeps per-product data clean
- **Retroactive mapping** — when admin maps a SKU, it auto-applies to ALL existing orders with that SKU code. One-time mapping fixes all history
- **8 retries max** (not 20 from original spec) — poll every 60s, 8 attempts (~8 min). If still not complete, mark failed with Retry button
- **Auto-retry once** after failure — if first attempt (8 polls) fails, auto-retry one more time. If second attempt also fails, mark failed, show manual Retry button
- **JWT expiry warning** — inline warning in Settings tab: "Token expired — paste new token" with text input. Sync button disabled until refreshed. No page-level banner
- **Full API response logging** — store ALL raw API responses in a syncLogs table (request params, response body, timestamps, status). Essential for debugging a reverse-engineered API
- HTML response detection: if HTML received instead of JSON, treat as auth failure, set `lastRefreshStatus: "error"`, surface "Re-login required"
- **Compact summary card** after sync: "Synced 47 orders (12 new, 35 updated). Revenue: Rp 2.4M. 3 unmapped SKUs." Expandable for details
- **Simple order list table** for browsing synced orders: date, platform, shop, SKUs, revenue, fees. Filterable by date/platform. Essential for test-and-learn verification
- **Write to externalRevenue on sync** — each synced order creates/updates an externalRevenue record. Phase 30 analytics picks it up automatically
- **Actual platform as source, NOT "bigseller"** — BigSeller is the aggregator/pipe, not the revenue source. Records should use actual platform: "shopee", "tokopedia", "tiktok" etc. with shop name for specificity
- **Full fee breakdown displayed** — revenue, commission fee, shipping fee, other fees, and calculated profit. Transparent view of where money goes
- BigSeller COGS caveat: when all `costFee` values are 0, show "Profit = Revenue (COGS not configured in BigSeller)" banner
- 31-day API limit: sync window must not exceed 31 days; initial backfill requires sequential admin triggers

### Claude's Discretion
- Exact progress card layout and animations within the Settings tab expansion
- syncLogs table schema details (retention policy, index design)
- Pagination strategy for the order list table
- Exact retry timing and backoff strategy
- How to handle partial sync failures (some pages fetched, some not)

### Deferred Ideas (OUT OF SCOPE)
- Automated daily BigSeller cron sync — deferred to BS-04 (v1.5+). Manual trigger sufficient for now
- BigSeller inventory sync to Shopee/Tokopedia — deferred to BS-05 (v1.5+)
- Period-over-period comparison using BigSeller growthRatio — deferred to BS-06 (v1.5+)
- Expanding sales revenue filters for all sources — Phase 30 (Unified Sales Analytics)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BS-01 | Admin can manually trigger BigSeller sync; system calls sync/task/create.json, scheduler-chain polls every 60s until taskStatus="complete", then pulls per-order data via pageList with full pagination | Scheduler-chain pattern via `ctx.scheduler.runAfter(60000, internal.integrations.bigseller.sync.pollSyncTask, {...})`. BigSeller API endpoints fully documented in `docs/BIGSELLER_PROFIT_API.md`. Poll endpoint: `GET sync/task/detail/new/get.json`. Data endpoint: `POST pageList.json` with shared request schema. |
| BS-02 | Per-order data stored in bigsellerOrders table with SKU breakdown (skuVoList), platform (shopee/tokopedia), shop-level breakdown, and all fee fields; bridges to externalRevenue for analytics | Schema already exists in `convex/schema.ts` (lines 1459-1489) with all required fields. Bridge writes to `externalRevenue` via existing `saveRevenue` internalMutation with source set to actual platform ("shopee"/"tiktok"), NOT "bigseller". |
| BS-03 | Admin can map BigSeller SKU codes to internal menuProducts for unified per-product reporting across channels | Existing `externalProductMappings` table + `saveProductMappings` / `updateProductMapping` / `linkProductMapping` mutations already handle this. SKU mapping UI follows same pattern as GoBiz — `ProductMappingTab.tsx` + `ProductMappingCard.tsx` already exist. Need to populate mappings with BigSeller SKU codes during sync. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Backend: scheduler-chain, mutations, queries | Already in use; `ctx.scheduler.runAfter()` provides the polling chain mechanism |
| React 19 | ^19.2.0 | Frontend: reactive UI for sync progress | Already in use; `useQuery` provides real-time sync state updates |
| TypeScript | ~5.9 | Type safety | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sonner | (existing) | Toast notifications | Sync complete/error notifications |
| lucide-react | (existing) | Icons for sync states | Progress indicators, checkmarks |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Scheduler-chain polling | Convex cron job polling | Cron requires fixed schedule; scheduler-chain is on-demand and self-terminating |
| Storing raw responses in syncLogs | Separate bigsellerApiLogs table | Using existing `externalSyncLogs` + new fields is simpler; avoid table proliferation |

**Installation:** No new packages required. All dependencies already in project.

## Architecture Patterns

### Recommended Project Structure
```
convex/integrations/bigseller/
  adapter.ts          # Existing: token preview + save (Phase 26)
  config.ts           # Existing: constants (BIGSELLER_PLATFORM_ID, MAX_SYNC_DAYS)
  sync.ts             # NEW: Main sync action + scheduler-chain + pageList fetcher
  helpers.ts          # NEW: Request builders, response parsers, field mapping
  queries.ts          # NEW: getSyncState, getOrders (paginated), getUnmappedSkus

src/components/salesAnalytics/
  BigSellerSyncPanel.tsx   # NEW: Expandable sync progress + controls within IntegrationHealthCard
  BigSellerOrdersTable.tsx # NEW: Browsable synced orders table
  BigSellerTokenDialog.tsx # Existing: token paste dialog
```

### Pattern 1: Scheduler-Chain Polling (Core Pattern for BS-01)
**What:** A Convex action triggers an external API call, then schedules itself (or a companion function) to run again after a delay. Each invocation checks whether the job is done; if not, it reschedules. This creates a self-terminating polling loop.
**When to use:** When an external API has an async processing model (trigger -> poll -> retrieve).
**Confidence:** HIGH — Convex docs explicitly support `ctx.scheduler.runAfter()` from both mutations and actions.

```typescript
// convex/integrations/bigseller/sync.ts
"use node";

import { internalAction, internalMutation } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";

// Step 1: Trigger sync on BigSeller API
export const triggerSync = internalAction({
  args: { startDate: v.string(), endDate: v.string(), attempt: v.number() },
  handler: async (ctx, args) => {
    const token = await resolveToken(ctx);

    // Call sync/task/create.json
    const resp = await fetch(
      "https://www.bigseller.com/api/v1/statis/profit/sync/task/create.json",
      { method: "POST", headers: buildHeaders(token), body: JSON.stringify({
        startTime: args.startDate,
        endTime: args.endDate,
        timeType: "orderCreatedTime",
      })}
    );

    const data = await resp.json();

    if (data.code === -1 && data.msg?.includes("sync task is in progress")) {
      // Join existing sync — start polling directly
      await ctx.runMutation(internal.integrations.bigseller.sync.updateSyncState, {
        phase: "polling", pollAttempt: 1, attempt: args.attempt,
      });
    } else if (data.code === 0) {
      await ctx.runMutation(internal.integrations.bigseller.sync.updateSyncState, {
        phase: "polling", pollAttempt: 1, attempt: args.attempt,
      });
    }

    // Schedule first poll in 60s
    await ctx.scheduler.runAfter(60000, internal.integrations.bigseller.sync.pollSyncTask, {
      startDate: args.startDate, endDate: args.endDate,
      pollAttempt: 1, maxPolls: 8, attempt: args.attempt,
    });
  },
});

// Step 2: Poll until complete (scheduler-chain)
export const pollSyncTask = internalAction({
  args: {
    startDate: v.string(), endDate: v.string(),
    pollAttempt: v.number(), maxPolls: v.number(), attempt: v.number(),
  },
  handler: async (ctx, args) => {
    const token = await resolveToken(ctx);

    const resp = await fetch(
      "https://www.bigseller.com/api/v1/statis/profit/sync/task/detail/new/get.json",
      { method: "GET", headers: buildHeaders(token) }
    );
    const data = await resp.json();
    const taskStatus = data?.data?.progressInfo?.taskStatus;

    if (taskStatus === "complete") {
      // Sync done — fetch order data
      await ctx.runMutation(internal.integrations.bigseller.sync.updateSyncState, {
        phase: "fetching", pollAttempt: args.pollAttempt, attempt: args.attempt,
      });
      await ctx.scheduler.runAfter(0, internal.integrations.bigseller.sync.fetchOrders, {
        startDate: args.startDate, endDate: args.endDate, attempt: args.attempt,
      });
    } else if (args.pollAttempt >= args.maxPolls) {
      // Max polls exceeded
      if (args.attempt === 1) {
        // Auto-retry once
        await ctx.runMutation(internal.integrations.bigseller.sync.updateSyncState, {
          phase: "retrying", pollAttempt: 0, attempt: 2,
        });
        await ctx.scheduler.runAfter(5000, internal.integrations.bigseller.sync.triggerSync, {
          startDate: args.startDate, endDate: args.endDate, attempt: 2,
        });
      } else {
        // Final failure
        await ctx.runMutation(internal.integrations.bigseller.sync.updateSyncState, {
          phase: "failed", pollAttempt: args.pollAttempt, attempt: args.attempt,
        });
      }
    } else {
      // Not done yet — schedule next poll
      await ctx.runMutation(internal.integrations.bigseller.sync.updateSyncState, {
        phase: "polling", pollAttempt: args.pollAttempt + 1, attempt: args.attempt,
      });
      await ctx.scheduler.runAfter(60000, internal.integrations.bigseller.sync.pollSyncTask, {
        ...args, pollAttempt: args.pollAttempt + 1,
      });
    }
  },
});
```

### Pattern 2: Reactive Sync State Document
**What:** A single `bigsellerSyncState` document in the DB tracks the current sync lifecycle. The frontend subscribes to it via `useQuery` and gets real-time updates as the scheduler-chain progresses — no WebSocket custom plumbing needed.
**When to use:** Whenever the backend has a multi-step async process that the UI must track.

```typescript
// Sync state stored as a singleton document
// Updated by mutations called from the scheduler-chain actions
interface BigSellerSyncState {
  phase: "idle" | "triggering" | "polling" | "fetching" | "storing" | "complete" | "failed" | "retrying";
  pollAttempt: number;       // Current poll attempt (1-8)
  maxPolls: number;          // Max polls (8)
  attempt: number;           // Overall attempt (1 or 2)
  startDate: string;         // Sync date range
  endDate: string;
  startedAt: number;         // Unix ms
  completedAt?: number;
  errorMessage?: string;
  summary?: {                // Populated after fetch
    totalOrders: number;
    newOrders: number;
    updatedOrders: number;
    totalRevenue: number;
    unmappedSkus: number;
  };
}
```

### Pattern 3: Revenue Bridge with Actual Platform Source
**What:** Each bigsellerOrders row maps to one externalRevenue record, but with `source` set to the actual platform ("shopee"/"tiktok") NOT "bigseller". The `bigsellerOrders.linkedRevenueId` links them back.
**When to use:** Always — this is a locked user decision.
**Important nuance:** The `externalSource` union in schema.ts currently includes `"bigseller"` but does NOT include `"shopee"` or `"tiktok"` as separate literals. This needs a schema migration to add `v.literal("shopee")` and `v.literal("tiktok")` to the union, OR we store the platform string in a different field (e.g., `platformName`) while keeping `source: "bigseller"` in externalRevenue.

**CRITICAL DECISION NEEDED:** The `externalSource` validator is:
```typescript
export const externalSource = v.union(
  v.literal("k3mart"),
  v.literal("gobiz"),
  v.literal("internal"),
  v.literal("grabfood"),
  v.literal("bigseller"),
  v.literal("consignment"),
);
```
Adding `"shopee"` and `"tiktok"` to this union would be the cleanest approach for per-platform revenue tracking, but it changes a shared validator used across 6+ tables. The alternative is to use `source: "bigseller"` in externalRevenue and add a `platformName` field for display.

**Recommendation:** Add `"shopee"` and `"tiktok"` (and `"tokopedia"` for future-proofing) to the `externalSource` union. This aligns with the locked decision "actual platform as source, NOT bigseller" and enables Phase 30 analytics to filter by true platform. The `PlatformId` type in `registry.ts` would also need updating.

### Pattern 4: BigSeller API Request Headers
**What:** All BigSeller API calls require a specific cookie-based auth pattern with the muc_token.
**When to use:** Every API call in the sync action.

```typescript
function buildBigSellerHeaders(mucToken: string): Record<string, string> {
  return {
    "accept": "application/json, text/plain, */*",
    "content-type": "application/json",
    "cookie": `muc_token=${mucToken}`,
    "origin": "https://www.bigseller.com",
    "referer": "https://www.bigseller.com/web/profitStats/stats.htm",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };
}
```

### Anti-Patterns to Avoid
- **Using `"bigseller"` as source in externalRevenue** — User decision says actual platform. "bigseller" is the pipe, "shopee"/"tiktok" are the sources.
- **Client-side polling** — Sync runs server-side via scheduler-chain. The frontend only reads a reactive state document.
- **Storing sync state in memory** — Must persist in DB so admin can leave and return.
- **Single large action** — Split into trigger/poll/fetch/store phases. Convex actions have execution time limits.
- **Calling pageList before sync is complete** — Returns `code: -1`. Must poll `taskStatus === "complete"` first.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token management | Custom token storage | Existing `platformCredentials` table + `saveDirectToken` | Already handles BigSeller muc_token (Phase 26) |
| Sync logging | Custom log table | Existing `externalSyncLogs` + `createSyncLog`/`updateSyncLog` | Consistent with GoBiz pattern |
| Product mapping | Custom mapping table | Existing `externalProductMappings` + `saveProductMappings` | Same pattern as GoBiz, table already indexed |
| Revenue storage | Custom revenue table | Existing `externalRevenue` + `saveRevenue` (with dedup) | Dedup by `externalTransactionId`, consistent analytics |
| Revenue items | Custom items table | Existing `externalRevenueItems` + `saveRevenueItems` | Per-SKU items with auto-match |
| Mapping UI | Custom SKU mapper | Existing `ProductMappingTab` + `ProductMappingCard` | Already renders inline dropdowns per source |
| Health dashboard | Custom status UI | Existing `IntegrationHealthCard` + `getHealthStatusAll` | Registry-driven, already shows BigSeller row |

**Key insight:** 80% of the infrastructure exists from Phase 26 + GoBiz integration. The new work is primarily the sync action (scheduler-chain) and the sync progress UI expansion in the Settings tab.

## Common Pitfalls

### Pitfall 1: Calling Data Endpoints Before Sync Completes
**What goes wrong:** `pageList.json` returns `{"code": -1, "msg": "Failed, please try again later"}` if called while sync is still `"progress"`.
**Why it happens:** BigSeller requires sync to finish before data is queryable.
**How to avoid:** Strictly gate data fetch behind `taskStatus === "complete"` check in the poll handler.
**Warning signs:** `code: -1` responses in sync logs.

### Pitfall 2: Exceeding 31-Day Sync Window
**What goes wrong:** BigSeller API rejects sync requests with date ranges > 31 days.
**Why it happens:** Platform-enforced limit.
**How to avoid:** Validate date range before calling `sync/task/create.json`. Incremental sync naturally stays within this limit (sync from last sync date to today). For backfill, UI must clearly communicate the 31-day constraint.
**Warning signs:** Error response on sync trigger.

### Pitfall 3: Multi-Brand Account Data Leakage
**What goes wrong:** Fetching orders for non-Frollie brands (Credotti, Legato, etc.) because the BigSeller account has 7+ brands.
**Why it happens:** `pageList.json` returns ALL shops unless filtered by `shopIds`.
**How to avoid:** ALWAYS pass `shopIds: [5090946, 5092855]` (Frollie - S, Frollie - T) in every pageList request. Store shop IDs in config, not hardcoded.
**Warning signs:** Orders from unexpected shop names in the orders table.

### Pitfall 4: HTML Response = Auth Failure
**What goes wrong:** BigSeller returns HTML (login page) instead of JSON when the token is expired.
**Why it happens:** Token expired or invalidated server-side.
**How to avoid:** Check `content-type` header of response. If HTML detected, immediately mark token as expired and abort sync with clear error message.
**Warning signs:** JSON parse errors in sync logs.

### Pitfall 5: Negative Fee Values
**What goes wrong:** Displaying commission/shipping/other fees as positive numbers, making revenue calculations wrong.
**Why it happens:** BigSeller returns fees as negative values (e.g., `commissionFee: -5850`). They represent deductions.
**How to avoid:** Store raw values as-is (negative). Display with clear labels ("Commission: -Rp 5,850" or "Commission: Rp 5,850 deducted"). Don't abs() them in storage.
**Warning signs:** Profit calculations that don't match BigSeller dashboard.

### Pitfall 6: Convex Action Timeout on Large Data Fetches
**What goes wrong:** A single action tries to fetch all pages and times out.
**Why it happens:** Convex actions have execution limits; fetching many pages of orders could exceed them.
**How to avoid:** Fetch one page at a time, storing results in the DB between pages. Use scheduler-chain for multi-page fetch if needed. With Frollie's current volume (~19 orders/month), a single action should suffice, but build for scalability.
**Warning signs:** Action timeout errors in Convex dashboard.

### Pitfall 7: externalSource Union Mismatch
**What goes wrong:** Trying to store `source: "shopee"` in externalRevenue fails Convex validation because the `externalSource` union only has `"bigseller"`.
**Why it happens:** The shared validator was defined in Phase 26 with 6 platform literals.
**How to avoid:** Extend `externalSource` in `schema.ts` to include `"shopee"`, `"tiktok"`, and optionally `"tokopedia"` BEFORE any sync code runs. Update `PlatformId` type in `registry.ts` too.
**Warning signs:** Runtime validation errors on saveRevenue calls.

### Pitfall 8: Required Fields in pageList Request
**What goes wrong:** Omitting any field from the shared request schema causes `code: -1` with no indication of which field is missing.
**Why it happens:** BigSeller's API requires ALL fields in the request body, even filter fields with empty defaults.
**How to avoid:** Build a complete request body with all 20+ fields. Use a builder function that fills in all defaults. See "Shared Request Schema" section in BIGSELLER_PROFIT_API.md.
**Warning signs:** Mysterious `code: -1` responses with "Failed, please try again later".

## Code Examples

### BigSeller pageList Request Body Builder
```typescript
// Source: docs/BIGSELLER_PROFIT_API.md - Shared Request Schema (Profit)
function buildPageListBody(
  startDate: string,
  endDate: string,
  pageNo: number = 1,
  shopIds: number[] = [5090946, 5092855], // Frollie shops
): Record<string, unknown> {
  return {
    pageNo,
    pageSize: 50,
    searchType: "order",           // REQUIRED — omitting causes -1 error
    platformTemplate: "common",     // common endpoint — no platform-specific fields
    startTime: startDate,
    endTime: endDate,
    timeType: "orderCreatedTime",
    currency: "IDR",                // REQUIRED — must match account
    orderState: ["completed", "shipped", "canceled", "other", "new"],
    queryType: "sku",               // Include SKU breakdown
    orderType: "orderNo",
    orderBy: "",
    desc: false,
    inquireType: 0,
    platforms: [],                  // Empty = all platforms
    shopIds,                        // ALWAYS filter to Frollie shops
    warehouseIds: [],
    searchContent: null,
    adjustmentUpdateTimeStartTime: null,
    adjustmentUpdateTimeEndTime: null,
    lableIds: null,
    hasLable: "",
    sampleOrder: null,
    dimension: "",
    evalationOrder: "",
    categoryList: "",
  };
}
```

### BigSeller Order -> externalRevenue Bridge
```typescript
// Map a BigSeller pageList row to saveRevenue args
function mapOrderToRevenue(
  order: BigSellerOrder,
  syncLogId: Id<"externalSyncLogs">,
  outletId?: Id<"externalOutlets">,
) {
  return {
    source: order.platform as "shopee" | "tiktok", // Actual platform, NOT "bigseller"
    outletId,
    revenueGross: order.saleAmount,
    revenueNet: order.platformIncome,
    costOfGoods: order.costFee || undefined,
    commission: Math.abs(order.commissionFee),  // Store as positive for consistency
    periodStart: order.orderTime,
    periodEnd: order.orderTime,
    dataOrigin: "api_revenue" as const,
    confidence: "exact" as const,
    externalTransactionId: `bigseller:${order.platformOrderId}`,  // Dedup key
    transactionDate: order.orderTime,
    transactionCount: 1,
    syncLogId,
  };
}
```

### Sync State Query (Frontend)
```typescript
// Frontend: Subscribe to sync state for reactive progress UI
const syncState = useQuery(
  api.integrations.bigseller.queries.getSyncState,
  isAdmin ? {} : "skip"
);

// syncState updates in real-time as scheduler-chain progresses:
// { phase: "polling", pollAttempt: 3, maxPolls: 8, attempt: 1 }
// { phase: "fetching", ... }
// { phase: "complete", summary: { totalOrders: 19, newOrders: 12, ... } }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Token estimated at 30-day expiry | Actual JWT exp (~20 days) decoded from muc_token | Phase 26 | BigSeller health card shows accurate countdown |
| Manual token paste every login | Paste-once, auto-refreshes on API use | Phase 26 (AUTH-02) | Admin pastes token once, BigSeller extends it on use |
| Separate revenue tables per platform | Unified `externalRevenue` with source field | Pre-existing | All platforms write to same table |

**Deprecated/outdated:**
- `bigsellerDailyStats` table concept: Decision from v1.4 arch says derive aggregates from per-order data, no separate daily stats table.
- Platform-specific `pageList.json` endpoints (shopee/ and tiktok/ variants): Common `pageList.json` with `platformTemplate: "common"` provides all needed fields. Platform-specific endpoints add 30-50 extra fee fields not needed for v1.

## Open Questions

1. **externalSource union expansion**
   - What we know: User decision says "actual platform as source, NOT bigseller". Current union has `"bigseller"` but not `"shopee"` / `"tiktok"`.
   - What's unclear: Adding to the union is a schema change affecting all 6 tables using it. Alternatively, we could keep `source: "bigseller"` in externalRevenue and add a `platformDetail` field.
   - Recommendation: Add `"shopee"` and `"tiktok"` to `externalSource`. This is the cleaner approach for Phase 30 analytics filtering. The schema change is backward-compatible (adding to a union doesn't break existing docs). Also add them to `PlatformId` type in registry.ts and create registry entries (they're sub-platforms of bigseller, not standalone).

2. **Sync state storage mechanism**
   - What we know: Need a document the frontend can reactively query for sync progress.
   - What's unclear: Use a new `bigsellerSyncState` table (singleton) or a field on the `platformCredentials` document for bigseller?
   - Recommendation: New `bigsellerSyncState` table with a single document. Cleaner separation of concerns — credentials vs sync lifecycle. Small table with just one row.

3. **Raw API response logging**
   - What we know: User wants ALL raw API responses stored. The existing `externalSyncLogs` table has limited fields.
   - What's unclear: Whether to add a `rawResponse` field to `externalSyncLogs` or create a separate `bigsellerApiLogs` table.
   - Recommendation: Add an optional `metadata` field (`v.optional(v.any())`) to `externalSyncLogs` for raw response snippets, OR create a lightweight `bigsellerApiLogs` table. For a reverse-engineered API, a dedicated log table is safer — logs can be large and frequent. Recommend: new `bigsellerApiLogs` table with TTL-style cleanup (keep 30 days).

4. **Token auto-refresh on API use**
   - What we know: BigSeller's `refreshTime` field updates on API calls, but it's unclear if this extends JWT `exp`.
   - What's unclear: Whether calling any API endpoint automatically extends the token lifetime.
   - Recommendation: Don't assume auto-refresh. Track actual JWT `exp` and warn admin when approaching expiry. If empirical testing shows API calls extend the token, update the token's `tokenExpiresAt` in platformCredentials after each successful API call.

## Sources

### Primary (HIGH confidence)
- `docs/BIGSELLER_PROFIT_API.md` — Comprehensive reverse-engineered API reference from HAR captures (Feb 2026). Verified against live Frollie account data.
- `convex/schema.ts` — Existing `bigsellerOrders` table schema (deployed in Phase 26).
- `convex/integrations/bigseller/adapter.ts` — Existing token management code.
- `convex/integrations/bigseller/config.ts` — Existing constants.
- `convex/integrations/registry.ts` — Platform registry with BigSeller metadata.
- Convex docs (Context7 `/llmstxt/convex_dev_llms_txt`) — `ctx.scheduler.runAfter()` for chained scheduled functions.

### Secondary (MEDIUM confidence)
- `convex/integrations/gobiz/adapter.ts` — GoBiz sync pattern (used as reference for BigSeller adapter structure). Different API model but same infrastructure reuse pattern.
- `convex/externalData/mutations.ts` — Revenue bridge mutations (saveRevenue, createSyncLog, saveProductMappings). Verified these accept the fields BigSeller will provide.

### Tertiary (LOW confidence)
- BigSeller token lifetime (~20 days) — based on single JWT analysis. May vary by account type or usage patterns. Needs empirical validation.
- `refreshTime` auto-extend behavior — documented as "unclear" in API reference. Needs testing.
- Action timeout limits for large data fetches — Convex doesn't publish exact limits. With Frollie's current volume (~19 orders/month), this is unlikely to be hit.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All libraries already in project, no new dependencies
- Architecture: MEDIUM — Scheduler-chain pattern is well-supported by Convex but the BigSeller API is reverse-engineered and may have undocumented behaviors
- Pitfalls: HIGH — Documented from comprehensive API analysis and existing codebase patterns

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (30 days — stable architecture, but API behaviors may shift)
