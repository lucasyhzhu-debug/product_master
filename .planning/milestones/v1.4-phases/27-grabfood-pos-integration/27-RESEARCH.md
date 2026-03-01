# Phase 27: GrabFood POS Integration - Research

**Researched:** 2026-02-25
**Domain:** GrabFood Partner API integration (order sync, store control, menu toggle)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- New page: `GrabFoodManager.tsx` at route `/grabfood`
- 3 tabs: **Orders** | **Store Status** | **Menu**
- Page-level outlet selector (dropdown) at top — all tabs show data for the selected outlet
- Access: Manager + Admin (both roles see the page; admin can trigger order sync, manager can do store control + menu toggle)
- **Auto-resume from last sync:** Store `lastSyncedAt` per outlet in `externalSyncLogs` — default sync pulls from last timestamp to now
- **Custom date override:** Expandable date picker for manual backfill (initial setup or gap fill)
- **Sync feedback:** Button shows spinner while syncing, toast shows "Synced N orders" on success or error message on failure
- **Revenue-focused table columns:** Order ID, date/time, items summary, subtotal, promo discount, net revenue, payment method
- **Raw JSON storage:** `rawJson` field on `grabfoodOrders` stores full API response per order
- **IDR handling:** `currency.exponent = 0` for IDR — store price as-is, no division by 100
- **Dedup:** Upsert on `orderID` field — no duplicate orders from re-syncing overlapping ranges
- **Status cards per outlet:** Each outlet gets a card showing outlet name, status badge (OPEN/PAUSED/CLOSED), and action buttons
- **Pause durations:** 30 / 60 / 120 minutes — presented as button group or dropdown
- **Countdown timer:** When store is paused, card shows "Paused — resumes in Xm" with live countdown
- **Manual refresh:** "Refresh Status" button (no auto-polling) with "Last checked: X min ago" timestamp
- **Unpause:** One-click unpause button on paused cards
- **Menu item display:** Simple list of menu items with current inventory level + on/off toggle per item
- **grabItemID mapping:** Fully manual — admin sees GrabFood items and assigns each to a menuProduct via dropdown
- **Toggle scope:** Individual toggles only (no bulk actions in v1)
- **Publish flow:** Toggles accumulate locally. User clicks "Publish Changes" button to send all changes via batch menu update API + `notifyMenuUpdate` call
- **Webhook scaffold only:** Build HTTP endpoint at `/api/grabfood/order` with HMAC-SHA256 validation, but do NOT register with GrabFood
- **Pattern:** Return HTTP 200 immediately, schedule async upsert via `ctx.scheduler.runAfter(0, ...)`
- **API discovery plan (Plan 27-01):** Mandatory first plan — hit GrabFood endpoints with current credentials, validate access, map fields, document gotchas. Gate: if API access fails, entire phase deferred.

### Claude's Discretion
- Exact table pagination/sorting implementation
- Loading skeleton design for status cards
- Error state handling and retry UX
- Webhook HMAC validation implementation details
- `grabfoodOrders` schema field selection (guided by API discovery findings)

### Deferred Ideas (OUT OF SCOPE)
- Auto-polling store status (could add as config toggle in future)
- Bulk menu toggle ("mark all unavailable" for closing time)
- Auto-match grabItemID by name (could enhance manual mapping later)
- Webhook registration with GrabFood (activate after manual sync proven)
- Real-time order push via webhook (build on scaffold after validation)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GF-06 | Admin can manually trigger GrabFood order history sync (button pull, not cron) that fetches paginated orders via GET /partner/v1/orders per outlet, stores in grabfoodOrders table, and bridges to externalRevenue for analytics | Existing `grabfoodOrders` schema deployed (Phase 26), adapter.ts has `resolveToken()` + `grabRequest()` helpers, `externalRevenue` bridge pattern proven by GoBiz/K3Mart. API pagination uses `more: true` + `page` increment. |
| GF-07 | Manager can view GrabFood store status (OPEN/CLOSED/PAUSED) per outlet, and one-click pause (30/60/120 min) or unpause any outlet | Existing `getStoreStatus` and `pauseStore` actions already scaffolded in adapter.ts. Store status API returns `{ status, pauseUntil }`. Pause API uses `pauseDuration: 0` for unpause. |
| GF-08 | Manager can toggle GrabFood menu item availability (AVAILABLE/UNAVAILABLE) via batch API; requires initial grabItemID mapping setup per outlet | Batch menu API at `PUT /partner/v1/batch/menu` with `field: "AVAILABILITY"`. Must call `notifyMenuUpdate()` after batch update or changes don't go live. Manual grabItemID-to-menuProduct mapping table needed. |
</phase_requirements>

## Summary

Phase 27 builds the GrabFood POS integration page on top of infrastructure already scaffolded in Phase 26. The `grabfoodOrders` table exists in schema, the GrabFood adapter (`convex/integrations/grabfood/adapter.ts`) already has `resolveToken()`, `getStoreStatus`, `pauseStore`, `notifyMenuUpdate`, and `grabRequest()` helpers. Webhook handlers are scaffolded in `webhooks.ts` but not registered in `http.ts`.

The work is primarily: (1) a new `syncOrders` action that paginate-fetches `GET /partner/v1/orders` and upserts into `grabfoodOrders` + bridges to `externalRevenue`, (2) a new `GrabFoodManager.tsx` page with 3 tabs, and (3) a new `grabfoodMenuMappings` table for manual grabItemID-to-menuProduct mappings + a `batchUpdateMenuAvailability` action that calls the batch menu API then `notifyMenuUpdate`. The critical gating step is Plan 27-01: API discovery to validate that credentials work against live endpoints before building UI.

**Primary recommendation:** Start with API discovery (Plan 27-01) as a mandatory gate. Then build backend mutations/queries for order sync (Plan 27-02), then the UI page with all 3 tabs (Plan 27-03). Webhook HMAC enhancement is a small Plan 27-04 or can be folded into 27-02.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Backend: actions for API calls, mutations for DB writes, queries for UI reads | Already in use; actions required for HTTP fetch to external APIs |
| React 19 | ^19.2.0 | Frontend UI | Already in use |
| shadcn/ui | latest | UI components (Tabs, Badge, Button, Select, Switch, Table) | Already in use across all pages |
| Sonner | latest | Toast notifications for sync feedback | Already in use for all user feedback |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Lucide React | latest | Icons (RefreshCw, Store, Utensils, Pause, Play) | Status badges, action buttons |
| Framer Motion | latest | Optional animation for status transitions | Only if needed for countdown timer |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Convex action for API calls | Separate API service | Unnecessary complexity — Convex "use node" actions can call external APIs directly |
| New `grabfoodMenuMappings` table | Reuse `externalProductMappings` | externalProductMappings uses `externalProductCode` field; GrabFood uses `grabItemID` which is conceptually different. However, the table structure is similar enough to reuse with `externalProductCode` storing the `grabItemID`. Recommend reusing `externalProductMappings` to avoid schema proliferation. |

**Installation:** No new packages needed. All dependencies already present.

## Architecture Patterns

### Recommended Project Structure
```
convex/
├── grabfoodOrders/
│   ├── mutations.ts          # upsertOrder (internal), bridgeToRevenue (internal)
│   └── queries.ts            # listOrders, getOrdersByOutlet
├── integrations/grabfood/
│   ├── adapter.ts            # EXISTING: resolveToken, getStoreStatus, pauseStore, notifyMenuUpdate
│   ├── config.ts             # EXISTING: endpoints, types
│   └── webhooks.ts           # EXISTING: handleOrderWebhook (enhance with HMAC)
src/
├── pages/
│   └── GrabFoodManager.tsx   # NEW: 3-tab page (Orders, Store Status, Menu)
├── hooks/convex/
│   └── useGrabFoodOrders.ts  # NEW: hooks for grabfood queries + actions
```

### Pattern 1: Order Sync Action (paginated fetch + upsert)
**What:** Convex action that calls GrabFood List Orders API with pagination, then schedules internal mutations to upsert each order.
**When to use:** Manual order sync trigger from UI.
**Example:**
```typescript
// convex/integrations/grabfood/adapter.ts (new action)
export const syncOrders = action({
  args: {
    token: v.string(),
    merchantID: v.string(),
    fromDate: v.optional(v.string()),
    toDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const accessToken = await resolveToken(ctx);
    if (!accessToken) return { success: false, error: "No token" };

    // Create sync log
    const syncLogId = await ctx.runMutation(
      internal.externalData.mutations.createSyncLog,
      { source: "grabfood", syncType: "manual", status: "started", timestamp: Date.now() }
    );

    let page = 1;
    let totalOrders = 0;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({ merchantID: args.merchantID, page: String(page) });
      if (args.fromDate) params.set("fromDate", args.fromDate);
      if (args.toDate) params.set("toDate", args.toDate);

      const { ok, data } = await grabRequest(accessToken, "GET", `${GRABFOOD_CONFIG.endpoints.ordersList}?${params}`);
      if (!ok) break;

      for (const order of data.orders ?? []) {
        await ctx.runMutation(internal.grabfoodOrders.mutations.upsertOrder, {
          order,
          syncLogId,
        });
        totalOrders++;
      }

      hasMore = data.more === true;
      page++;
    }

    // Update sync log with success
    await ctx.runMutation(internal.externalData.mutations.updateSyncLog, {
      logId: syncLogId,
      status: "success",
      productsCount: totalOrders,
      durationMs: Date.now() - startTime,
    });

    return { success: true, ordersCount: totalOrders };
  },
});
```

### Pattern 2: Order Upsert with Revenue Bridge
**What:** Internal mutation that upserts a grabfoodOrder (dedup on orderID) and creates/links an externalRevenue record.
**When to use:** Called by syncOrders action for each fetched order.
**Example:**
```typescript
// convex/grabfoodOrders/mutations.ts
export const upsertOrder = internalMutation({
  args: { order: v.any(), syncLogId: v.id("externalSyncLogs") },
  handler: async (ctx, args) => {
    const { order, syncLogId } = args;
    const orderTimeMs = new Date(order.orderTime).getTime();

    // Check if already exists (dedup)
    const existing = await ctx.db
      .query("grabfoodOrders")
      .withIndex("by_order_id", (q) => q.eq("orderID", order.orderID))
      .unique();

    if (existing) {
      // Update state if changed
      if (existing.orderState !== order.orderState) {
        await ctx.db.patch(existing._id, { orderState: order.orderState });
      }
      return existing._id;
    }

    // Insert new order
    const orderId = await ctx.db.insert("grabfoodOrders", {
      orderID: order.orderID,
      merchantID: order.merchantID,
      shortOrderNumber: order.shortOrderNumber,
      orderState: order.orderState,
      orderTime: order.orderTime,
      orderTimeMs,
      currency: order.currency?.code ?? "IDR",
      items: order.items ?? [],
      price: order.price ?? {},
      rawJson: JSON.stringify(order),
      syncLogId,
      createdAt: Date.now(),
    });

    // Bridge to externalRevenue
    const subtotal = order.price?.subtotal ?? 0;
    const promoDiscount = (order.price?.grabFundPromo ?? 0) + (order.price?.merchantFundPromo ?? 0) + (order.price?.basketPromo ?? 0);
    const netRevenue = subtotal - promoDiscount;

    const revenueId = await ctx.db.insert("externalRevenue", {
      source: "grabfood",
      revenueGross: subtotal,
      revenueNet: netRevenue,
      periodStart: orderTimeMs,
      periodEnd: orderTimeMs,
      dataOrigin: "api_revenue",
      confidence: "exact",
      externalTransactionId: order.orderID,
      transactionDate: orderTimeMs,
      transactionType: "sales",
      syncLogId,
    });

    // Link revenue back to order
    await ctx.db.patch(orderId, { linkedRevenueId: revenueId });
    return orderId;
  },
});
```

### Pattern 3: Menu Availability Batch Toggle
**What:** Action that sends batch availability updates to GrabFood, then calls notifyMenuUpdate.
**When to use:** "Publish Changes" button on Menu tab.
**Example:**
```typescript
export const batchUpdateAvailability = action({
  args: {
    token: v.string(),
    merchantID: v.string(),
    items: v.array(v.object({
      id: v.string(), // grabItemID
      availableStatus: v.union(v.literal("AVAILABLE"), v.literal("UNAVAILABLE")),
    })),
  },
  handler: async (ctx, args) => {
    const accessToken = await resolveToken(ctx);
    if (!accessToken) return { success: false, error: "No token" };

    // Step 1: Batch update
    const menuEntities = args.items.map((item) => ({
      id: item.id,
      availableStatus: item.availableStatus,
      ...(item.availableStatus === "UNAVAILABLE" ? { maxStock: 0 } : {}),
    }));

    const { ok, data } = await grabRequest(accessToken, "PUT", GRABFOOD_CONFIG.endpoints.menuBatch, {
      merchantID: args.merchantID,
      field: "AVAILABILITY",
      menuEntities,
    });
    if (!ok) return { success: false, error: `Batch update failed: ${data?.message}` };

    // Step 2: MUST call notifyMenuUpdate or changes don't go live
    const notifyResult = await grabRequest(accessToken, "POST", GRABFOOD_CONFIG.endpoints.menuNotify, {
      merchantID: args.merchantID,
    });

    return { success: true, itemsUpdated: args.items.length };
  },
});
```

### Anti-Patterns to Avoid
- **Calling API without resolveToken():** Always go through `resolveToken()` — it handles caching, refresh, and error logging.
- **Forgetting notifyMenuUpdate after batch menu update:** Changes to menu availability are NOT live until `notifyMenuUpdate` is called. This is a two-step process, not one.
- **Dividing IDR prices by 100:** IDR has `currency.exponent = 0` — prices are stored as-is. `25000` means Rp 25,000, not Rp 250.00.
- **Using `useQuery` for action calls:** Actions that call external APIs must use `useAction` + manual state management, not `useQuery` (which is for reactive Convex queries only).
- **Blocking webhook response on processing:** Webhook handlers MUST return HTTP 200 immediately, then schedule async work via `ctx.scheduler.runAfter(0, ...)`.
- **Hardcoded source validator in externalData/mutations.ts:** The `sourceValidator` in `convex/externalData/mutations.ts` is hardcoded to `k3mart | gobiz | internal`. It does NOT include `grabfood`. New grabfoodOrders mutations should either: (a) use their own module (`convex/grabfoodOrders/mutations.ts`) that calls `externalRevenue` insert directly, or (b) update the shared `sourceValidator` to use the `externalSource` from `schema.ts`. Option (a) is cleaner to avoid breaking existing code.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth2 token management | Custom token fetch logic | `resolveToken()` from adapter.ts | Already handles caching, refresh, error logging, DB persistence |
| Order dedup | Manual timestamp-based dedup | Convex `.withIndex("by_order_id")` + `.unique()` check | Reliable, idempotent, index-backed |
| Revenue bridging | Custom revenue aggregation | `externalRevenue` table + existing analytics queries | Phase 30 analytics will aggregate all sources uniformly |
| HTTP endpoint routing | Manual Express/Hono router | `httpRouter()` from Convex | Native to Convex, handles routing + CORS |
| Sync log tracking | Custom progress tracking | `externalSyncLogs` table + `createSyncLog`/`updateSyncLog` mutations | Already proven pattern from K3Mart/GoBiz syncs |

**Key insight:** Phase 26 deployed all foundation tables and the adapter already has 80% of the needed API helpers. This phase is mostly wiring existing pieces together + building UI.

## Common Pitfalls

### Pitfall 1: externalData/mutations.ts Source Validator
**What goes wrong:** Attempting to save grabfood revenue via `externalData.mutations.saveRevenue` will fail because its internal `sourceValidator` is `v.union(v.literal("k3mart"), v.literal("gobiz"), v.literal("internal"))` — missing `"grabfood"`.
**Why it happens:** The shared mutations were written before Phase 26 added grabfood/bigseller/consignment to the `externalSource` union in schema.ts.
**How to avoid:** Create `convex/grabfoodOrders/mutations.ts` with its own `upsertOrder` internal mutation that inserts directly into `externalRevenue` (bypassing the shared `saveRevenue`). Alternatively, update the `sourceValidator` in `externalData/mutations.ts` to use the shared `externalSource` from `schema.ts`.
**Warning signs:** Runtime error: `Validator error: Could not match union value` when trying to insert with `source: "grabfood"`.

### Pitfall 2: IDR Minor Unit Mishandling
**What goes wrong:** Dividing GrabFood prices by 100, resulting in incorrect values (e.g., `250` instead of `25000`).
**Why it happens:** Habit from currencies with 2-decimal exponents (SGD, USD). IDR has `exponent: 0`.
**How to avoid:** Store prices as-is from API. Add comment in code: `// IDR exponent=0: price is in whole rupiah, no division needed`.
**Warning signs:** Revenue figures 100x smaller than expected.

### Pitfall 3: Missing notifyMenuUpdate After Batch Update
**What goes wrong:** Menu item availability changes don't appear on the GrabFood customer app.
**Why it happens:** GrabFood requires a two-step process: (1) batch update, (2) notify. Without step 2, changes are staged but not published.
**How to avoid:** Always chain `notifyMenuUpdate()` after any menu modification. The UI "Publish Changes" button must call both in sequence.
**Warning signs:** Toggle changes appear to succeed (API returns 200) but items don't change on GrabFood.

### Pitfall 4: Webhook HTTP Routes Not Registered
**What goes wrong:** Webhook handlers exist in `webhooks.ts` but `http.ts` has no routes pointing to them.
**Why it happens:** Phase 26 created the handlers but deferred registration. The `http.ts` file currently only has `/api/daily-sales` and `/api/daily-sales-csv` routes.
**How to avoid:** Register webhook routes in `http.ts` as part of this phase (scaffold only — don't register URL with GrabFood yet). Import from `webhooks.ts` and add `http.route()` entries.
**Warning signs:** 404 on webhook endpoint when testing.

### Pitfall 5: Convex Action Mutation Limits
**What goes wrong:** A single Convex action has limits on the number of mutations it can schedule. Syncing thousands of orders in one action call may hit limits.
**Why it happens:** Large date ranges can return many pages of orders.
**How to avoid:** Batch upserts — instead of one `runMutation` per order, batch 50-100 orders per mutation call. Or implement a self-chaining pattern where the action processes one page, then schedules itself for the next page.
**Warning signs:** Action timeout or "too many mutations" error during large backfill syncs.

### Pitfall 6: "use node" Requirement for Actions
**What goes wrong:** Convex actions that call `fetch()` must be in files marked `"use node"` at the top.
**Why it happens:** Convex's default runtime doesn't support `fetch()`. The Node.js runtime is needed for external HTTP calls.
**How to avoid:** Any file with actions that call external APIs must have `"use node"` as the first line. The existing `adapter.ts` already has this. New action files must follow suit.
**Warning signs:** Runtime error about `fetch` not being defined.

## Code Examples

### Outlet Setup for GrabFood
```typescript
// Seed GrabFood outlets in externalOutlets table
// Run once during setup — creates outlet records with merchantID as externalId
await ctx.runMutation(internal.externalData.mutations.internalUpsertOutlet, {
  source: "grabfood",
  externalId: "MERCHANT-ID-FROM-GRAB", // The merchantID from GrabFood
  name: "Frollie Crystal",
  isActive: true,
});
```

### HMAC-SHA256 Webhook Validation
```typescript
import { createHmac } from "crypto";

function validateGrabSignature(body: string, signature: string, secret: string): boolean {
  const computed = createHmac("sha256", secret).update(body).digest("hex");
  return computed === signature;
}

// In webhook handler:
const signature = request.headers.get("X-Grab-Signature") ?? "";
const hmacSecret = process.env.GRAB_HMAC_SECRET ?? "";
if (hmacSecret && !validateGrabSignature(body, signature, hmacSecret)) {
  console.log("GrabFood webhook: HMAC validation failed");
  return new Response("OK", { status: 200 }); // Still return 200 per GrabFood spec
}
```

### Revenue Bridge Pattern (from GoBiz adapter for reference)
```typescript
// externalRevenue record for a GrabFood order
{
  source: "grabfood",
  outletId: outletDocId,           // from externalOutlets
  revenueGross: order.price.subtotal,
  revenueNet: subtotal - promoDiscount,
  periodStart: orderTimeMs,
  periodEnd: orderTimeMs,
  dataOrigin: "api_revenue",
  confidence: "exact",
  externalTransactionId: order.orderID,  // dedup key
  transactionDate: orderTimeMs,
  transactionType: "sales",
  syncLogId,
}
```

### Countdown Timer for Paused Store
```typescript
function PauseCountdown({ pauseUntil }: { pauseUntil: string }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const target = new Date(pauseUntil).getTime();
    const interval = setInterval(() => {
      const diff = target - Date.now();
      if (diff <= 0) {
        setRemaining("Resuming...");
        clearInterval(interval);
        return;
      }
      const minutes = Math.ceil(diff / 60000);
      setRemaining(`Resumes in ${minutes}m`);
    }, 30000); // Update every 30s

    return () => clearInterval(interval);
  }, [pauseUntil]);

  return <span className="text-sm text-muted-foreground">{remaining}</span>;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-platform source validator in mutations | Shared `externalSource` union in schema.ts | Phase 26 | New integrations should use shared validator |
| Separate webhook file per platform | Single `webhooks.ts` per platform adapter | Phase 26 | httpAction cannot be in "use node" files — must be in separate file |
| Custom token management per platform | Shared `resolveToken()` pattern | Phase 26 | All platforms follow same token resolution pattern |

**Deprecated/outdated:**
- `externalData/mutations.ts` `sourceValidator` — still uses 3-literal union, not the shared `externalSource` from schema.ts

## Open Questions

1. **GrabFood Merchant ID per outlet: shared or separate credentials?**
   - What we know: STATE.md flags this as a blocker — "Confirm whether Crystal/Goldfinch/Tamtem GrabFood outlets share one credential or need separate client_id/client_secret per outlet"
   - What's unclear: Whether each outlet has its own `client_id`/`client_secret` or they share a single credential with different `merchantID` values
   - Recommendation: Plan 27-01 (API discovery) must test this. If shared credential with different merchantIDs, the current single `platformCredentials` row for "grabfood" works. If separate credentials per outlet, we need to refactor credentials storage (unlikely — GrabFood Partner API typically uses one set of credentials per partner, with merchantID differentiating outlets).

2. **GrabFood outlet merchantIDs**
   - What we know: The API requires `merchantID` per call. Frollie has outlets (Crystal, Goldfinch, Tamtem).
   - What's unclear: The actual merchantID values for each outlet.
   - Recommendation: Plan 27-01 must discover these by calling the API. Store them as `externalId` on `externalOutlets` records.

3. **Webhook HMAC secret location**
   - What we know: HMAC-SHA256 validation uses `X-Grab-Signature` header. Secret comes from GrabFood developer portal.
   - What's unclear: Whether the secret is already stored somewhere in platformCredentials or needs to be added as an env var.
   - Recommendation: Store as `GRAB_HMAC_SECRET` Convex environment variable. Reference it in webhook handler via `process.env`.

## Sources

### Primary (HIGH confidence)
- `docs/GRABFOOD_API.md` — Local copy of GrabFood Partner API v1.1.3 reference, covering all endpoints used in this phase
- `convex/integrations/grabfood/adapter.ts` — Existing adapter with resolveToken(), getStoreStatus, pauseStore, notifyMenuUpdate, grabRequest()
- `convex/integrations/grabfood/config.ts` — Endpoint URLs, types (GrabIncomingOrder, GrabOrderPrice, etc.)
- `convex/integrations/grabfood/webhooks.ts` — Existing webhook handler scaffolds
- `convex/schema.ts` — grabfoodOrders table definition (deployed Phase 26)
- `convex/externalData/mutations.ts` — Revenue bridge pattern (K3Mart/GoBiz proven)

### Secondary (MEDIUM confidence)
- `convex/integrations/registry.ts` — Platform metadata (GrabFood health check is "always_green" with client_credentials auth)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, no new dependencies needed
- Architecture: HIGH — patterns proven by K3Mart/GoBiz integrations, adapter already scaffolded
- Pitfalls: HIGH — identified from direct codebase analysis (source validator gap, "use node" requirement, IDR handling documented in API reference)

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (stable — GrabFood API is versioned, codebase patterns are established)
