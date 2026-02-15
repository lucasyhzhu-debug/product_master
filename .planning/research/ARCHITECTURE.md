# Architecture Research: v1.1 Integration & Feature Architecture

**Domain:** External API integrations, kitchen overhaul, K3Mart planning, GoFood multi-outlet, sales reporting
**Researched:** 2026-02-15
**Confidence:** HIGH (based on direct codebase analysis of existing patterns + Convex documentation)

---

## System Overview: How New Features Integrate

```
┌─────────────────────────────────────────────────────────────────────┐
│                     EXTERNAL APIS                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  K3Mart API  │  │  GoBiz API   │  │ GoBiz Token  │              │
│  │  (consapi)   │  │  (journals,  │  │   (goid/     │              │
│  │              │  │   orders)    │  │    token)    │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                 │                 │                       │
├─────────┴─────────────────┴─────────────────┴───────────────────────┤
│                   CONVEX ACTIONS ("use node")                       │
│  ┌──────────────────────────────────┐  ┌─────────────────────────┐  │
│  │  convex/integrations/k3mart/    │  │ convex/integrations/    │  │
│  │    adapter.ts (existing)        │  │   gobiz/adapter.ts      │  │
│  │    + weekly planning helpers    │  │   (existing + token     │  │
│  │                                  │  │    grant endpoint)      │  │
│  └──────────────┬───────────────────┘  └────────────┬────────────┘  │
│                 │                                    │               │
│    ┌────────────┴────────────────────────────────────┴────────────┐  │
│    │              platformCredentials (token storage)             │  │
│    │  platformId: "k3mart" | "gobiz"                             │  │
│    │  currentToken, refreshToken, tokenExpiresAt                 │  │
│    └─────────────────────────┬───────────────────────────────────┘  │
│                              │                                      │
├──────────────────────────────┴──────────────────────────────────────┤
│                     CONVEX MUTATIONS (db writes)                    │
│  ┌──────────────────┐  ┌───────────────────┐  ┌─────────────────┐  │
│  │ externalData/    │  │ k3martCockpit/    │  │ gofoodDepot/    │  │
│  │   mutations.ts   │  │   mutations.ts    │  │   mutations.ts  │  │
│  └────────┬─────────┘  └────────┬──────────┘  └────────┬────────┘  │
│           │                     │                      │            │
├───────────┴─────────────────────┴──────────────────────┴────────────┤
│                     CONVEX SCHEMA (37+ tables)                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │
│  │ externalRevenue  │  │ k3martDispatch  │  │ externalOutlets    │ │
│  │ externalRevenue  │  │   Plans         │  │   (source-scoped   │ │
│  │   Items          │  │ k3martStock     │  │    per platform)   │ │
│  │ externalSync     │  │   Movements     │  │ gofoodDepotStock   │ │
│  │   Logs           │  │ restockTargets  │  │ gofoodDepotShip    │ │
│  └─────────────────┘  └─────────────────┘  │   ments            │ │
│                                             └─────────────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│                     CONVEX QUERIES (reactive)                       │
│  ┌──────────────────┐  ┌───────────────────┐  ┌─────────────────┐  │
│  │ orders/queries   │  │ k3martCockpit/    │  │ reports/        │  │
│  │ (kitchen sort    │  │   queries.ts      │  │   dailySales    │  │
│  │  by dueDate)     │  │   (weekly plans)  │  │   (aggregation) │  │
│  └──────────────────┘  └───────────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│                     CONVEX CRONS                                    │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ "refresh k3mart token"     every 12h                        │   │
│  │ "sync gobiz revenue"       7x/day (WIB business hours)     │   │
│  │ "weekly integrity check"   Sundays 10:00 WIB               │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **platformCredentials** | Store/retrieve API tokens for all platforms | Actions (token resolution), Mutations (token update), Crons (scheduled refresh) |
| **integrations/gobiz/adapter.ts** | GoBiz API calls: journal sync, order detail fetch, token refresh cascade | platformCredentials, externalData/mutations (storage), gofoodDepot/mutations (sticker deduction) |
| **integrations/k3mart/adapter.ts** | K3Mart API calls: stock sync, sales sync, stock flow submission | platformCredentials, externalData/mutations (storage), k3martCockpit/mutations (movements) |
| **externalData/** | Shared CRUD for multi-platform revenue, outlets, sync logs, product mappings | All adapters write here; cockpit/reports queries read from here |
| **k3martCockpit/** | Weekly dispatch planning, outlet stock summary, production readiness | Reads externalOutlets + externalRevenue + restockTargets; writes k3martDispatchPlans |
| **orders/queries.ts (kitchen)** | Kitchen order view with due-date ranking | Reads orders (by_kitchen_visible index), orderItems, orderItemProduction |
| **reports/dailySales.ts** | Cross-channel daily sales aggregation | Reads orders + orderItems (full table scan currently) |
| **convex/crons.ts** | Scheduled token refresh + revenue sync | Calls internal actions |

---

## Detailed Integration Architecture: Six Questions Answered

### Q1: External API Calls from Convex (GoBiz REST API with OAuth)

**Current Pattern (ESTABLISHED):** All external HTTP calls run in Convex `action` functions with `"use node"` directive. Actions can use `fetch()` and the Node.js runtime. Mutations and queries CANNOT make external HTTP calls.

**Existing Flow (GoBiz):**
```
action (syncGoBizRevenue)
  -> resolveGoBizToken(ctx)           # Read token from DB
  -> fetchWithAuth(ctx, url, body)    # fetch() with Bearer token
     -> on 401: attemptTokenRefresh() # 3-method cascade
        -> cookie refresh
        -> token rotate
        -> API refresh endpoint
     -> retry once with new token
  -> ctx.runMutation(saveRevenue)     # Store results
```

**New Capability Needed: GoBiz Token Grant (`/goid/token`)**

The reference doc (`docs/apiS/gojek search transactions documentation.txt`) reveals a direct token endpoint:
```
POST https://api.gobiz.co.id/goid/token
Body: {
  "client_id": "go-biz-web-new",
  "grant_type": "password",
  "data": { "email": "...", "password": "..." }
}
Response: { access_token: "...", refresh_token: "...", dbl_enabled: true }
```

**Architecture Decision:** Add this as a fourth (primary) method in the token refresh cascade. Store email/password in `platformCredentials` (same pattern as K3Mart). The `performGoBizRefresh` function should try in order:

1. Password grant (`/goid/token`) -- most reliable, returns fresh access + refresh tokens
2. Cookie refresh (existing method 1)
3. Token rotate (existing method 2)
4. API refresh (existing method 3)

**New Files:**
- MODIFY `convex/integrations/gobiz/adapter.ts` -- add password grant to refresh cascade
- MODIFY `convex/integrations/gobiz/config.ts` -- add token grant URL
- MODIFY `convex/platformCredentials/actions.ts` -- add `refreshGoBizToken` (cron + manual)

**Integration Points (existing, reuse):**
- `platformCredentials` table -- already has `email`, `password`, `currentToken`, `refreshToken`, `tokenExpiresAt` fields
- `convex/crons.ts` -- add GoBiz token refresh cron (separate from revenue sync)
- Settings UI -- already has GoBiz configure dialog, extend to accept email/password

### Q2: Scheduled Token Refresh in Serverless Environment

**Current Pattern (K3Mart, working in production):**
```typescript
// convex/crons.ts
crons.interval("refresh k3mart token", { hours: 12 },
  internal.platformCredentials.actions.refreshK3MartTokenCron
);
```

**How it works:**
1. Convex cron triggers `internalAction` on schedule
2. Action reads credentials from `platformCredentials` table
3. Action calls external API (`fetch()`)
4. Action writes new token back via `ctx.runMutation(updateToken)`
5. Sync logs record success/failure with timestamps

**Architecture for GoBiz Token Refresh:**

GoBiz tokens expire faster (~1h access token). Two strategies:

**Strategy A: Scheduled refresh cron (like K3Mart)** -- Add `crons.interval("refresh gobiz token", { minutes: 50 })`. Pro: token always fresh. Con: 28 API calls/day, wastes calls on non-business hours.

**Strategy B: On-demand refresh with cron backup** -- Revenue sync cron (7x/day) already handles 401 retry. Add a separate lower-frequency cron (every 4h) as safety net. Pro: fewer API calls. Con: first sync after long idle may be slow (retry needed).

**Recommendation: Strategy B.** The existing `fetchWithAuth` already handles 401 with automatic refresh. A 4-hour cron keeps the token alive during business hours. The password grant endpoint (`/goid/token`) makes refresh reliable (no cascading fallbacks needed).

```typescript
// convex/crons.ts (proposed)
crons.interval("refresh gobiz token", { hours: 4 },
  internal.platformCredentials.actions.refreshGoBizTokenCron
);
```

**No new tables needed.** `platformCredentials` already tracks everything.

### Q3: Transaction Data Storage and Aggregation for Sales Reporting

**Current State:**

Revenue data is already stored in `externalRevenue` (per-transaction) and `externalRevenueItems` (per-item, auto-matched to `menuProducts`). The existing schema handles multi-source data:

```
externalRevenue
  ├── source: "k3mart" | "gobiz" | "internal"
  ├── outletId: Id<"externalOutlets"> (per-outlet)
  ├── periodStart/periodEnd (timestamp range)
  ├── revenueGross, revenueNet, commission
  ├── externalTransactionId (dedup key)
  ├── gobizOrderNumber
  └── index: by_source_period, by_source_txn (dedup)

externalRevenueItems
  ├── revenueId -> externalRevenue
  ├── productName, unitPrice, quantity, totalPrice
  ├── linkedMenuProductId -> menuProducts (auto-matched)
  └── matchConfidence: "exact" | "price_only" | "name_only" | "none"
```

**Gap: Internal Order Revenue Not in externalRevenue**

Internal orders (WhatsApp, Instagram, etc.) exist in the `orders` table but are NOT synced to `externalRevenue`. The `reports/dailySales.ts` query aggregates from `orders` + `orderItems` directly (full table scan).

**Architecture Decision for Unified Sales Reporting:**

Two approaches:

**Approach A: Sync internal orders into `externalRevenue`** -- Run a "virtual sync" that copies confirmed internal orders into `externalRevenue` with `source: "internal"`. Pro: single reporting source. Con: data duplication, sync lag, extra write volume.

**Approach B: Query-time union across tables** -- Sales report queries join `externalRevenue` (for k3mart/gobiz) with `orders` (for internal) at read time. Pro: no duplication, always fresh. Con: complex query logic, heavier reads.

**Recommendation: Approach A (with cron).** The `externalRevenue` table already has `source: "internal"` in its union type. The existing `integrations/internal/adapter.ts` file exists (stub). Implement a lightweight internal adapter that:

1. Queries confirmed orders with `confirmedAt` in the sync window
2. Creates `externalRevenue` records with `source: "internal"`, `dataOrigin: "db_query"`, `confidence: "exact"`
3. Uses `externalTransactionId` = `internal|{orderId}` for dedup
4. Creates `externalRevenueItems` linking to `menuProducts` (already linked via `orderItems.menuProductId`)

This keeps the reporting layer simple: always query `externalRevenue` + `externalRevenueItems`.

**Files to create/modify:**
- MODIFY `convex/integrations/internal/adapter.ts` -- implement internal order sync
- ADD to `convex/crons.ts` -- schedule internal revenue sync (daily or hourly)
- CREATE `convex/reports/salesAnalytics.ts` -- unified cross-channel report queries

### Q4: Kitchen Query Optimization for Due-Date Ranking

**Current State:**

The kitchen view uses `orders.by_kitchen_visible` index:
```typescript
// convex/orders/queries.ts::getKitchenOrders()
const activeOrders = await ctx.db.query("orders")
  .withIndex("by_kitchen_visible", (q) => q.eq("isKitchenVisible", true))
  .collect();
```

Post-fetch sort by due date:
```typescript
allOrders.sort((a, b) => {
  if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  return a.orderDate - b.orderDate;
});
```

**Problem:** Sort happens in-memory after fetching all kitchen-visible orders. The `by_kitchen_visible` index is `["isKitchenVisible", "dueDate"]` -- Convex already supports range queries on this compound index.

**Optimization:** Use the compound index for ordered retrieval:
```typescript
const activeOrders = await ctx.db.query("orders")
  .withIndex("by_kitchen_visible", (q) => q.eq("isKitchenVisible", true))
  .order("asc") // Orders by dueDate (second field in compound index)
  .collect();
```

**Caveat:** Convex compound index ordering only works when the second field is used for range/order. The current index `["isKitchenVisible", "dueDate"]` supports this. Orders without `dueDate` (null/undefined) sort to the end in Convex.

**Additional UI Enhancement (Day Name Display):**

The milestone draft requests "show day names and dates" in kitchen. This is a frontend-only change:
```typescript
// Format: "Saturday, Feb 15" or "Tomorrow" / "Today" / "Overdue"
function formatKitchenDueDate(dueDate: number | undefined): string {
  if (!dueDate) return "No due date";
  const now = new Date();
  const due = new Date(dueDate);
  // ... relative date logic
}
```

**Files to modify:**
- MODIFY `convex/orders/queries.ts` -- use compound index ordering
- MODIFY `src/components/kitchen/` -- add due date display with day names
- MODIFY `src/pages/KitchenViewV2.tsx` -- integrate due date ranking UI

### Q5: K3Mart Weekly Planning Data Model (Holidays, Weekends)

**Current State:**

`k3martDispatchPlans` already has `weekNumber` (ISO week, e.g., "2026-W07") and `date` (YYYY-MM-DD). The `restockTargets` table has `weekdayTarget` and `weekendTarget` fields, so weekend distinction exists.

**Gap: No holiday awareness.** The system treats all weekdays as weekday-target and all Sat/Sun as weekend-target. Indonesian public holidays (national holidays, local holidays) are not modeled.

**Architecture Decision: Holiday Calendar Table**

Add a lightweight `holidays` table:

```typescript
// convex/schema.ts (proposed addition)
holidays: defineTable({
  date: v.string(), // YYYY-MM-DD
  name: v.string(), // "Isra Mi'raj", "Chinese New Year"
  type: v.union(
    v.literal("national"),   // National holiday
    v.literal("local"),      // Local/regional
    v.literal("custom")      // Company-specific (e.g., team day off)
  ),
  affectsTarget: v.union(
    v.literal("weekend"),    // Use weekend target
    v.literal("closed"),     // Zero target (outlet closed)
    v.literal("normal")      // No effect (for awareness only)
  ),
  createdBy: v.string(),
  createdAt: v.number(),
})
  .index("by_date", ["date"]),
```

**Integration with Weekly Planning:**

The `calculateSuggestedQty` function in `k3martCockpit/helpers.ts` currently uses weekday vs weekend targets. Enhance to check holidays:

```typescript
function getEffectiveTarget(
  date: string,
  weekdayTarget: number,
  weekendTarget: number,
  holiday?: { affectsTarget: "weekend" | "closed" | "normal" }
): number {
  if (holiday?.affectsTarget === "closed") return 0;
  if (holiday?.affectsTarget === "weekend") return weekendTarget;
  const dayOfWeek = new Date(date + "T00:00:00+07:00").getDay();
  return (dayOfWeek === 0 || dayOfWeek === 6) ? weekendTarget : weekdayTarget;
}
```

**UI Enhancement:** Highlight holidays and weekends in the weekly planning grid with color coding and tooltips.

**Files:**
- MODIFY `convex/schema.ts` -- add `holidays` table
- CREATE `convex/holidays/queries.ts` + `mutations.ts` -- CRUD for holidays
- MODIFY `convex/k3martCockpit/queries.ts` -- incorporate holiday targets
- MODIFY `convex/k3martCockpit/helpers.ts` -- holiday-aware target calculation
- MODIFY K3Mart cockpit frontend -- holiday highlighting

### Q6: Multi-Outlet GoFood Data Separation

**Current State:**

The system has ONE GoBiz merchant configured: `G293156297` (Goldfinch). The reference docs reveal a second merchant: `G347061572` (Crystal). The existing GoBiz adapter queries by `merchant_id` in the journal search body.

**Current data model already supports multi-outlet:**
- `externalOutlets` has `source: "gobiz"` and `externalId` (merchant ID)
- `externalRevenue` has `outletId: v.optional(v.id("externalOutlets"))`
- `externalRevenueItems` has `source: "gobiz"`

**Gap:** The `GOBIZ_CONFIG.merchantId` is hardcoded to `"G293156297"`. The journal search query filters by a single merchant.

**Architecture Decision: Multi-Merchant Config**

```typescript
// convex/integrations/gobiz/config.ts (proposed change)
export const GOBIZ_CONFIG = {
  merchants: [
    { id: "G293156297", name: "Legato Gf", outletLabel: "GoFood Legato Gf" },
    { id: "G347061572", name: "GoFood Crystal", outletLabel: "GoFood Crystal" },
  ],
  // ... rest of config
};
```

**Sync Architecture:**

Option A: Query ALL merchants in a single journal search (GoBiz API supports `merchant_id IN [...]`). Then separate by merchant when storing to `externalRevenue`. The existing journal search body already uses `"op": "in"` for merchant_id.

Option B: Query each merchant separately for cleaner per-outlet accounting.

**Recommendation: Option A.** The existing search body supports array values for merchant_id (the reference doc shows `"value":["G293156297","G347061572"]`). This means one API call covers both outlets. Parse the `merchant_id` from each journal hit to determine which outlet it belongs to.

**Data Flow:**
```
GoBiz journals/search (both merchants in one query)
  -> parse merchant_id from each hit
  -> resolve to externalOutlets doc by source="gobiz", externalId=merchant_id
  -> create externalRevenue with correct outletId
  -> fetch order details per order (same API, no merchant filter needed)
  -> auto-match items to menuProducts
```

**Files to modify:**
- MODIFY `convex/integrations/gobiz/config.ts` -- multi-merchant config
- MODIFY `convex/integrations/gobiz/adapter.ts` -- handle multi-merchant in journal sync
- MODIFY `convex/integrations/gobiz/helpers.ts` -- extract merchant_id from journal hits
- CREATE or MODIFY migration to auto-create second GoBiz outlet in `externalOutlets`

---

## Data Flow: New vs Modified Components

### New Tables

| Table | Purpose | Indexes |
|-------|---------|---------|
| `holidays` | Public/custom holiday calendar for K3Mart planning | `by_date` |

### Modified Tables

| Table | Modification | Why |
|-------|-------------|-----|
| `platformCredentials` | No schema change; store GoBiz email/password (fields exist) | Enable password grant token refresh |
| `externalOutlets` | No schema change; add second GoBiz outlet doc | Multi-merchant GoFood |
| `externalRevenue` | No schema change; populate `outletId` for GoBiz records | Per-outlet revenue separation |

### No Schema Changes Needed

The existing schema is remarkably well-designed for these new features. The `externalOutlets`, `externalRevenue`, `externalRevenueItems`, `externalSyncLogs`, and `externalProductMappings` tables already support multi-source, multi-outlet data with dedup keys. Only the `holidays` table is genuinely new.

---

## Patterns to Follow

### Pattern 1: Action-Mutation Separation (Existing, Proven)

**What:** External API calls happen in `action` functions (`"use node"`). Data persistence happens in `mutation` functions (called from actions via `ctx.runMutation`). Queries are pure reads.

**When:** Always when integrating with external APIs.

**Example (from existing codebase):**
```typescript
// convex/integrations/gobiz/adapter.ts
"use node";

export const syncGoBizRevenue = action({
  args: { daysBack: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // 1. Resolve token (query -> reads from DB)
    const { accessToken } = await resolveGoBizToken(ctx);

    // 2. Fetch from external API (action can use fetch)
    const data = await fetchWithAuth(ctx, url, body, accessToken);

    // 3. Store results (mutation -> writes to DB)
    await ctx.runMutation(internal.externalData.mutations.saveRevenue, { records });
  },
});
```

**Trade-offs:** Actions run outside the transaction boundary. If the mutation fails after a successful API call, the API call cannot be rolled back. Use sync logs and dedup keys to make operations idempotent.

### Pattern 2: Token Resolution Cascade (Existing, Proven)

**What:** Try DB token first, fall back to env var, then attempt refresh if 401.

**Example:**
```typescript
async function resolveGoBizToken(ctx: ActionCtx) {
  const dbCred = await ctx.runQuery(
    internal.platformCredentials.queries.getTokenInternal,
    { platformId: "gobiz" }
  );
  return {
    accessToken: dbCred?.currentToken ?? process.env.GOBIZ_API_TOKEN ?? null,
    refreshToken: dbCred?.refreshToken ?? null,
  };
}
```

### Pattern 3: Dedup Key for Idempotent Sync (Existing, Proven)

**What:** Every external record gets a deterministic dedup key. `saveRevenue` checks `by_source_txn` index before inserting. Duplicate syncs are safe.

**Example:**
```typescript
// K3Mart dedup: date|outlet|product|qty|total
const dedupKey = buildDedupKey(txn.transDate, txn.outletName, txn.productCode, txn.qty, txn.total);

// GoBiz dedup: orderNumber|txnTimeMs
const dedupKey = `${orderNumber}|${txnTimeMs}`;

// Internal dedup: internal|orderId
const dedupKey = `internal|${orderId}`;
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Storing Credentials in Config Files

**What people do:** Hardcode API credentials in `config.ts` or commit to git.
**Why it's wrong:** Reference doc already warns: "DO NOT UPLOAD TO GIT." Credentials in `config.ts` are deployed to Convex cloud.
**Do this instead:** Store in `platformCredentials` table (encrypted at rest by Convex) or as Convex environment variables. Never in source code.

### Anti-Pattern 2: Synchronous Multi-Outlet API Calls

**What people do:** Loop over outlets/merchants, calling API sequentially with `await` in each iteration.
**Why it's wrong:** In a serverless action, sequential calls waste time. Convex actions have a 10-minute timeout.
**Do this instead:** Use `Promise.all()` for independent API calls. Add rate limiting only where the external API requires it (K3Mart stock-in needs sequential per-outlet to avoid conflicts).

### Anti-Pattern 3: Full Table Scan for Reporting

**What people do:** `ctx.db.query("orders").collect()` then filter in memory (current `dailySales.ts` pattern).
**Why it's wrong:** Reads every order ever created. Gets slower as data grows.
**Do this instead:** Use indexed queries with date range filters. For cross-channel reports, query `externalRevenue` with `by_source_period` index.

### Anti-Pattern 4: Mixing Action and Mutation Logic

**What people do:** Put database reads and external API calls in the same function.
**Why it's wrong:** Actions are not transactional. Complex reads-then-writes in an action can race with mutations.
**Do this instead:** Keep external API calls in actions. Keep DB logic in mutations called via `ctx.runMutation()`. Use internal queries via `ctx.runQuery()` for reads within actions.

---

## Suggested Build Order (Dependency-Driven)

```
Phase 2: API Audit & Auth Architecture
  ├── Document all API endpoints and auth flows
  ├── Design GoBiz password grant integration
  └── Map internal order -> externalRevenue sync
        │
        v
Phase 3: QoL Fixes (independent, parallel-safe)
  ├── Order page layout changes
  ├── Due date display improvements
  └── Kitchen inventory overrides
        │
        v
Phase 4: Kitchen Overhaul
  ├── Due date ranking (compound index optimization)
  ├── Day name display in kitchen
  └── Target visualization linked to orders
        │
        v
Phase 5: K3Mart Cockpit Enhancements
  ├── Holiday calendar table + CRUD
  ├── Weekly planning with holiday awareness
  └── Manual stock in/out during day
        │
        v
Phase 6: API Integrations (depends on Phase 2)
  ├── GoBiz password grant token refresh
  ├── Multi-merchant GoFood (Crystal outlet)
  ├── Internal order -> externalRevenue sync
  └── Unified sales reporting queries
```

**Key Ordering Rationale:**
1. Phase 2 (API audit) must precede Phase 6 (implementation) -- design before build
2. Phase 4 (kitchen) and Phase 5 (K3Mart) are independent -- can parallelize
3. Phase 6 (API integrations) comes last because it builds on architectural decisions from Phase 2
4. Phase 3 (QoL) has no integration dependencies -- can run anytime

---

## Sources

- Direct codebase analysis: `convex/integrations/gobiz/adapter.ts`, `convex/integrations/k3mart/adapter.ts`, `convex/platformCredentials/actions.ts`, `convex/crons.ts`, `convex/schema.ts`
- Reference doc: `docs/apiS/gojek search transactions documentation.txt` -- GoBiz API endpoints, token grant, merchant IDs
- Milestone draft: `.planning/NEXT-MILESTONE-DRAFT.md` -- Phase definitions and dependencies
- Convex documentation: Actions, crons, compound indexes, "use node" runtime

---
*Architecture research for: v1.1 Stabilization & QoL*
*Researched: 2026-02-15*
