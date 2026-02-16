# Phase 7: Query Optimization - Research

**Researched:** 2026-02-14
**Domain:** Convex query performance, pagination, COGS caching, kitchen denormalization
**Confidence:** HIGH

## Summary

Phase 7 addresses four distinct performance optimization areas within the existing Convex + React stack: (1) eliminating N+1 query patterns in order list and dashboard queries, (2) paginating large data collections, (3) optimizing kitchen queries via denormalized `isKitchenVisible` boolean, and (4) caching recipe-only COGS on `menuProducts.unitCost` with eager recalculation on component price changes.

The codebase already uses Convex's built-in `Promise.all` + index batching pattern in several places (e.g., `batchFetching.ts`, `getKitchenStats`), so the patterns are established. Convex natively supports cursor-based pagination via `paginate()` + `usePaginatedQuery`, which maps directly to the "Load More" UX decision. The COGS caching can leverage the existing `ctx.scheduler.runAfter()` pattern already used for recipe/packaging cost invalidation.

No new libraries are needed. All optimizations use existing Convex APIs, existing indexes, and existing project patterns.

**Primary recommendation:** Execute in 4 parallel work streams (N+1 fix, pagination, kitchen denormalization, COGS cache), each independently testable, followed by a verification wave.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### COGS caching strategy
- Cache recipe-only COGS (food cost) as `unitCost` on menuProducts -- packaging costs excluded
- Recalculate automatically on ingredient price change (eager, not lazy)
- Depth-1 cascade only -- directly affected products recalculated, deeper chains self-correct on next view
- Display cached unitCost in both product listings AND detail pages
- Admin "Recalculate All Costs" button in MenuProductsManager as safety net
- Recalculate-all shows before/after cost diff summary (product name, old cost, new cost, delta)
- Show visual indicator (badge/icon) on products with stale/pending COGS recalculation

#### Kitchen query approach
- Add denormalized `isKitchenVisible` boolean to orders -- set on status change, indexed for fast kitchen queries
- Flat list sorted by earliest due date+time (most urgent first) -- not grouped by status
- Completed orders move to bottom of list, only cleared at end of day
- Orders grouped by order (one card per order with all items, not individual item rows)
- Kitchen order card shows: detailed items, customer details, due date (including day name), and any specific order notes
- Per-item tracking within orders (kitchen marks individual items as done)

#### Pagination design
- "Load More" button pattern (not infinite scroll, not page numbers)
- 25 items per batch
- Paginate all large lists (orders, inventory transactions, production logs) -- not just orders
- Show remaining item count on Load More button (e.g., "Load 25 more (150 remaining)")

#### Order query restructuring
- Use parallel indexed lookups (Promise.all with by_order index) for N+1 fix -- not denormalized snapshots
- Pre-fetch item count and total price summaries in order list query (not lazy-loaded on expand)
- Include dashboard aggregation queries in optimization scope (same N+1 patterns)
- Dashboard metrics computed live (not cached) -- rely on Convex real-time for freshness

### Claude's Discretion
- Cost change history tracking (whether to log old/new cost changes or just overwrite) -- Claude decides based on complexity vs business value
- Exact stale cost indicator design (badge style, color, placement)
- Loading skeleton and empty state designs for paginated lists
- Specific index design choices for kitchen visibility and order sorting
- Dashboard query restructuring approach

### Deferred Ideas (OUT OF SCOPE)
- **Revert completed order to packing status** -- new status transition capability, belongs in its own phase (kitchen workflow improvements)
- **Audio/visual alert for new kitchen orders** -- new feature for kitchen UX, separate from query optimization
- Kitchen UI redesign (card layout, mobile optimization) -- separate phase if needed
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Backend + real-time DB | Already in stack, provides paginate(), indexes, schedulers |
| React | ^19.2.0 | Frontend framework | Already in stack |
| convex/react | (bundled) | `usePaginatedQuery` hook | Built-in Convex pagination support |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| convex/server | (bundled) | `paginationOptsValidator` | Backend paginated query definitions |
| sonner | (existing) | Toast notifications | COGS recalculation status feedback |
| lucide-react | (existing) | Icons | Stale cost indicator badge/icon |

### Alternatives Considered
None. All optimizations use existing stack capabilities. No new dependencies needed.

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure
No new directories needed. Changes are to existing files:
```
convex/
  schema.ts               # Add isKitchenVisible to orders, unitCostStaleAt to menuProducts
  orders/
    queries.ts             # Optimize list(), getKitchenOrders(), getKitchenStats(), getCompletedToday()
    kitchenQueries.ts      # Optimize getKitchenPackingOrders()
    helpers/
      batchFetching.ts     # Enhance with indexed batch fetching (replace full table scans)
      statusTransitions.ts # Set isKitchenVisible on status change
  dashboard/
    queries.ts             # Optimize getSummary(), getRecentOrders(), getUpcomingDue()
  menuProducts/
    mutations.ts           # Add recalculateAllCosts mutation
  lib/
    costInvalidation.ts    # Add invalidateMenuProductCosts (new cascade)
  externalData/
    queries.ts             # Paginate getRevenue(), getRestockOverview(), getChannelSellThrough()
  productionLog/
    queries.ts             # Paginate getRecent()
  inventory/
    queries.ts             # Paginate getLocationTransactions()
src/
  pages/
    MenuProductsManager.tsx # Add Recalculate All button + stale badge
    OrderManager.tsx        # Convert to usePaginatedQuery + Load More
  hooks/convex/
    useOrders.ts            # Update for pagination
```

### Pattern 1: Convex Cursor-Based Pagination
**What:** Use Convex's built-in `paginate()` method + `usePaginatedQuery` React hook for Load More pattern.
**When to use:** Any list that can grow unbounded (orders, transactions, logs).
**Example:**
```typescript
// Backend: convex/orders/queries.ts
import { paginationOptsValidator } from "convex/server";

export const listPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("orders").order("desc");
    if (args.status) {
      q = ctx.db.query("orders")
        .withIndex("by_status", (idx) => idx.eq("status", args.status as any))
        .order("desc");
    }
    return await q.paginate(args.paginationOpts);
  },
});

// Frontend: src/hooks/convex/useOrders.ts
import { usePaginatedQuery } from "convex/react";

export function useConvexOrdersPaginated(filters?: OrderFilters) {
  const { results, status, loadMore, isLoading } = usePaginatedQuery(
    api.orders.queries.listPaginated,
    filters ?? {},
    { initialNumItems: 25 }
  );
  return { results, status, loadMore, isLoading };
}
```
**Source:** Context7 - Convex pagination docs (HIGH confidence)

### Pattern 2: Denormalized Boolean + Index for Kitchen Visibility
**What:** Add `isKitchenVisible: boolean` to orders table, set on every status change, and index it.
**When to use:** When a query needs to filter by a computed condition derived from multiple status values.
**Example:**
```typescript
// Schema addition
orders: defineTable({
  // ... existing fields
  isKitchenVisible: v.optional(v.boolean()),
})
  // ... existing indexes
  .index("by_kitchen_visible", ["isKitchenVisible", "dueDate"]),

// In status transition helpers, when status changes:
const KITCHEN_VISIBLE_STATUSES = new Set([
  "Draft", "Confirmed", "InProduction", "Packaging",
  "Boxed", "Labeled", "WaitingShipment", "WaitingPickup"
]);

await ctx.db.patch(orderId, {
  status: newStatus,
  isKitchenVisible: KITCHEN_VISIBLE_STATUSES.has(newStatus),
});

// Kitchen query becomes a single indexed query:
const orders = await ctx.db
  .query("orders")
  .withIndex("by_kitchen_visible", (q) => q.eq("isKitchenVisible", true))
  .collect();
```

### Pattern 3: Eager COGS Recalculation via Scheduled Function
**What:** When a componentType's `unitCostIdr` changes, schedule a function that finds all menuProducts using that component and recalculates their `unitCost`.
**When to use:** COGS caching with automatic invalidation.
**Example:**
```typescript
// In componentTypes/mutations.ts update handler:
if (updates.unitCostIdr !== undefined && updates.unitCostIdr !== component.unitCostIdr) {
  await ctx.db.patch(args.id, { ...updates });
  // Mark affected products as stale, then recalculate
  await ctx.scheduler.runAfter(0, internal.lib.costInvalidation.invalidateMenuProductCosts, {
    componentTypeId: args.id,
  });
}

// In lib/costInvalidation.ts:
export const invalidateMenuProductCosts = internalMutation({
  args: { componentTypeId: v.id("componentTypes") },
  handler: async (ctx, args) => {
    // Find all menuProductComponents using this componentType
    const usages = await ctx.db
      .query("menuProductComponents")
      .withIndex("by_component_type", (q) => q.eq("componentTypeId", args.componentTypeId))
      .collect();

    const affectedProductIds = new Set(usages.map(u => u.menuProductId));

    for (const menuProductId of affectedProductIds) {
      // Get all components for this product
      const components = await ctx.db
        .query("menuProductComponents")
        .withIndex("by_menu_product", (q) => q.eq("menuProductId", menuProductId))
        .collect();

      // Fetch component types and calculate
      const enriched = await Promise.all(components.map(async (comp) => {
        const ct = await ctx.db.get(comp.componentTypeId);
        return { unitCostIdr: ct?.unitCostIdr ?? 0, category: ct?.category ?? "packaging", quantity: comp.quantity };
      }));

      // Only production costs go into unitCost (user decision)
      const productionCost = enriched
        .filter(c => c.category === "production")
        .reduce((sum, c) => sum + c.unitCostIdr * c.quantity, 0);

      await ctx.db.patch(menuProductId, {
        unitCost: productionCost,
        // Clear stale marker
      });
    }
  },
});
```

### Pattern 4: Parallel Indexed Lookups (N+1 Fix)
**What:** Replace individual `ctx.db.get(order.customerId)` calls with a `Promise.all` batch, and replace per-order `orderItems` queries with parallel indexed lookups.
**When to use:** Any query that fetches related data for each item in a list.
**Example:**
```typescript
// CURRENT (N+1 pattern in orders/queries.ts::list):
const result = await Promise.all(
  filtered.map(async (order) => {
    const items = await ctx.db.query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();
    const customer = await ctx.db.get(order.customerId);
    return { ...order, items, customer };
  })
);

// This IS already parallelized via Promise.all, so it's NOT an N+1 problem
// per se -- the orders + items are fetched in parallel. The key optimization
// opportunities are:
// 1. Avoid full table scans in getKitchenStats/getCompletedToday (which scan ALL orderItems)
// 2. Pre-fetch item counts/totals so frontend doesn't need full items for list view
// 3. Use denormalized fields (orders already has itemCount, totalAmount, customerName)
```

### Anti-Patterns to Avoid
- **Full table `.collect()` on growing tables:** `orderItems`, `orderItemProduction`, `componentTransactions`, and `orders` are scanned in full by `getKitchenStats()` and `getCompletedToday()`. These grow unboundedly. Replace with indexed queries that only fetch relevant records.
- **Scanning entire tables to compute aggregates:** Dashboard `getSummary()` does `ctx.db.query("orders").collect()` to count entities. For small counts, `.collect()` is fine. But orders table is the concern -- it grows with business activity.
- **Pagination without total count:** The user wants "Load 25 more (150 remaining)". Convex's `paginate()` returns `isDone` but NOT a total count. Computing total count requires a separate query or maintaining a counter.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cursor pagination | Manual offset tracking | Convex `paginate()` + `usePaginatedQuery` | Convex's cursor system handles reactive updates, page adjacency, and cursor invalidation automatically |
| Scheduled recalculation | setTimeout or manual queue | `ctx.scheduler.runAfter()` | Already used by costInvalidation.ts; handles retries, persistence, and Convex transactions |
| Index optimization | In-memory filtering of large sets | Convex `.withIndex()` compound indexes | Convex indexes are B-tree based; filter expressions after index still scan the index range |

**Key insight:** Convex's reactive system means pagination state is automatically maintained across real-time updates. Hand-rolling pagination would break reactive guarantees.

## Common Pitfalls

### Pitfall 1: `paginate()` Cannot Be Used After `.filter()`
**What goes wrong:** Convex's `.paginate()` cannot be chained after `.filter()`. It can only follow `.withIndex()` and `.order()`.
**Why it happens:** Pagination relies on cursor positions within the index, and `.filter()` operates post-index, making cursor positions unreliable.
**How to avoid:** All filtering for paginated queries must be done via index range expressions in `.withIndex()`, or as post-pagination in-memory filtering of the returned page.
**Warning signs:** TypeScript error "Property 'paginate' does not exist on type 'FilteredQuery'".

### Pitfall 2: `usePaginatedQuery` Status Values
**What goes wrong:** Developers check `isLoading` when they should check `status` for "LoadingMore" vs "CanLoadMore" vs "Exhausted".
**Why it happens:** Confusing `isLoading` (initial load) with pagination state.
**How to avoid:** Use `status === "CanLoadMore"` to show Load More button, `status === "LoadingMore"` for loading indicator, `status === "Exhausted"` to hide button.
**Warning signs:** Load More button visible when no more items exist, or missing during initial load.

### Pitfall 3: Total Count Not Available From paginate()
**What goes wrong:** The user decision says "Load 25 more (150 remaining)" but `paginate()` only returns `isDone`, not total count.
**Why it happens:** Cursor-based pagination doesn't inherently know total count without a separate query.
**How to avoid:** Either (a) maintain a denormalized count on a summary doc, (b) run a separate count query, or (c) simplify to "Load more" without count. Given this is a small business app, a separate `.collect().length` query is acceptable for order counts. For transactions/logs, show "Load more" without exact count, or use an approximate like "25+" when not exhausted.
**Warning signs:** Extra query for every page load just to get counts.

### Pitfall 4: isKitchenVisible Must Be Set on ALL Status Transitions
**What goes wrong:** Kitchen shows stale orders or misses new ones because a status transition path didn't update `isKitchenVisible`.
**Why it happens:** Status changes happen in multiple places: `updateStatus`, `cancel`, auto-transitions in `statusTransitions.ts`, ball distribution, etc.
**How to avoid:** Create a single helper function `computeIsKitchenVisible(status)` and call it in EVERY place that patches `orders.status`. Grep for `status:` patches on orders table to find all locations.
**Warning signs:** Order disappears from kitchen view or remains visible after completion.

### Pitfall 5: COGS Recalculation Cascade Scope
**What goes wrong:** Changing a componentType's cost doesn't update menuProducts, or cascades too deeply causing performance issues.
**Why it happens:** The user decision says "depth-1 cascade only" -- recalculate directly affected products only.
**How to avoid:** The cascade path is: `componentTypes.unitCostIdr` change -> find `menuProductComponents` with that `componentTypeId` -> recalculate `menuProducts.unitCost` for each affected product. Do NOT cascade further (e.g., don't recalculate order items that snapshot these costs).
**Warning signs:** Stale COGS on products that use a component whose cost was updated.

### Pitfall 6: Existing unitCost Already Includes Packaging
**What goes wrong:** The user decision says "cache recipe-only COGS (food cost) as unitCost -- packaging costs excluded", but the CURRENT `calculateUnitCostFromComponentTypes()` in `menuProducts/mutations.ts` includes ALL components (production + packaging) in `unitCost`.
**Why it happens:** The current code uses `calculateMenuProductCOGS()` which returns `{ production, packaging, total }` and stores `total` as `unitCost`. The user wants ONLY `production` cost cached.
**How to avoid:** When implementing COGS caching, use `cogsBreakdown.production` (not `cogsBreakdown.total`) for the cached `unitCost` field. This is a CHANGE from current behavior. Clarify: should the `menuProducts.update` mutation ALSO be changed to only store production cost in `unitCost`? The user decision implies yes.
**Warning signs:** `unitCost` values that seem too high because they include packaging.

### Pitfall 7: Full Table Scans in Batch Fetching
**What goes wrong:** `batchFetching.ts` currently does `ctx.db.query("orderItems").collect()` and `ctx.db.query("orderItemProduction").collect()` -- these are full table scans.
**Why it happens:** This was "optimized" to avoid N+1 individual lookups, but replaced them with full table scans that scale with total historical data.
**How to avoid:** For kitchen queries, use the new `isKitchenVisible` index to limit orders first, then batch-fetch items only for those orders using `Promise.all` with `by_order` index per order. For the order list query (already paginated), the existing pattern is fine since it only processes 25-100 orders at a time.
**Warning signs:** Kitchen queries getting slower as order history grows.

## Code Examples

### Example 1: Paginated Order List Query
```typescript
// convex/orders/queries.ts
import { paginationOptsValidator } from "convex/server";

export const listPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(v.union(/* status literals */)),
  },
  handler: async (ctx, args) => {
    let q;
    if (args.status && !Array.isArray(args.status)) {
      q = ctx.db.query("orders")
        .withIndex("by_status", (idx) => idx.eq("status", args.status as any))
        .order("desc");
    } else {
      q = ctx.db.query("orders").order("desc");
    }

    const paginatedOrders = await q.paginate(args.paginationOpts);

    // Enrich each page's orders with items + customer (parallel)
    const enrichedPage = await Promise.all(
      paginatedOrders.page.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        // Customer data already denormalized on order (customerName, customerPhone)
        return { ...order, items, customer: null };
      })
    );

    return {
      ...paginatedOrders,
      page: enrichedPage,
    };
  },
});
```

### Example 2: Frontend Load More Button
```typescript
// src/components/orders/OrderListPaginated.tsx
import { usePaginatedQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

function OrderListPaginated({ filters }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.orders.queries.listPaginated,
    filters ?? {},
    { initialNumItems: 25 }
  );

  return (
    <>
      {results.map(order => <OrderCard key={order._id} order={order} />)}

      {status === "CanLoadMore" && (
        <Button onClick={() => loadMore(25)} variant="outline">
          Load 25 more
        </Button>
      )}
      {status === "LoadingMore" && <LoadingSpinner />}
      {status === "Exhausted" && results.length > 0 && (
        <p className="text-muted-foreground text-center">All orders loaded</p>
      )}
    </>
  );
}
```

### Example 3: Optimized Kitchen Query with isKitchenVisible
```typescript
// convex/orders/queries.ts
export const getKitchenOrders = query({
  args: {},
  handler: async (ctx) => {
    // Single indexed query replaces 8 separate status queries
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_kitchen_visible", (q) => q.eq("isKitchenVisible", true))
      .collect();

    // Batch fetch items for these orders using parallel indexed lookups
    const enrichedOrders = await Promise.all(
      orders.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        // ... production records per item
        return { ...order, items };
      })
    );

    // Sort by due date ascending (most urgent first)
    return enrichedOrders.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate - b.dueDate;
    });
  },
});
```

### Example 4: COGS Recalculate All Mutation
```typescript
// convex/menuProducts/mutations.ts
export const recalculateAllCosts = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);

    const allProducts = await ctx.db.query("menuProducts").collect();
    const results: Array<{
      productId: Id<"menuProducts">;
      name: string;
      oldCost: number | undefined;
      newCost: number;
      delta: number;
    }> = [];

    for (const product of allProducts) {
      const components = await ctx.db
        .query("menuProductComponents")
        .withIndex("by_menu_product", (q) => q.eq("menuProductId", product._id))
        .collect();

      if (components.length === 0) continue;

      const enriched = await Promise.all(
        components.map(async (comp) => {
          const ct = await ctx.db.get(comp.componentTypeId);
          return {
            unitCostIdr: ct?.unitCostIdr ?? 0,
            category: ct?.category ?? "packaging",
            quantity: comp.quantity,
          };
        })
      );

      // Recipe-only COGS (production components only, per user decision)
      const newCost = enriched
        .filter(c => c.category === "production")
        .reduce((sum, c) => sum + c.unitCostIdr * c.quantity, 0);

      const oldCost = product.unitCost;
      const delta = newCost - (oldCost ?? 0);

      if (delta !== 0 || oldCost === undefined) {
        await ctx.db.patch(product._id, { unitCost: newCost });
        results.push({
          productId: product._id,
          name: product.name,
          oldCost,
          newCost,
          delta,
        });
      }
    }

    return results;
  },
});
```

## Detailed Codebase Analysis

### Current N+1 Patterns Found

#### 1. `orders/queries.ts::list()` (Line 127-148)
**Current behavior:** Uses `Promise.all` to fetch items + customer per order. This is already parallelized, but each order triggers 2 queries (items via index, customer via get). For 100 orders = 200 queries.
**Optimization:** Orders already have `customerName` and `customerPhone` denormalized. The `customer` field from `ctx.db.get()` is redundant for list display. Remove the customer fetch for list queries. For items, the parallel indexed lookup is actually the correct pattern per user decision.
**Impact:** Cuts queries roughly in half for list view.

#### 2. `orders/queries.ts::getKitchenStats()` (Line 534-727)
**Current behavior:** Does `ctx.db.query("orders").collect()`, `ctx.db.query("orderItems").collect()`, `ctx.db.query("orderItemProduction").collect()` -- THREE full table scans of growing tables.
**Optimization:** Use indexed queries: fetch orders by specific statuses (already has `by_status` index), then batch-fetch items only for those orders using `by_order` index.
**Impact:** Major reduction from 3 full table scans to N status queries + M item queries (where M = relevant orders only).

#### 3. `orders/queries.ts::getCompletedToday()` (Line 936-1038)
**Current behavior:** Same pattern -- `ctx.db.query("orders").collect()`, `ctx.db.query("orderItems").collect()`, `ctx.db.query("orderItemProduction").collect()`.
**Optimization:** Filter orders first (only completed statuses since midnight), then batch-fetch items for those specific orders.
**Impact:** Same as above -- eliminates full table scans.

#### 4. `dashboard/queries.ts::getSummary()` (Line 7-99)
**Current behavior:** `ctx.db.query("orders").collect()` plus 6 more `.collect()` calls for entity counts. Total: 7 full table scans.
**Optimization:** Use `by_status` index for order counts. Entity counts (recipes, packaging, etc.) are small tables -- `.collect()` is fine for those.
**Impact:** Orders table scan is the bottleneck; others are fine.

#### 5. `dashboard/queries.ts::getUpcomingDue()` (Line 124-144)
**Current behavior:** `ctx.db.query("orders").collect()` then filters to upcoming due dates.
**Optimization:** Use `by_status_due_date` compound index to fetch non-terminal orders with upcoming due dates.
**Impact:** Eliminates full order table scan.

#### 6. `orders/queries.ts::getProductSuggestions()` (Line 448-488)
**Current behavior:** `ctx.db.query("orderItems").order("desc").collect()` -- scans ALL order items.
**Optimization:** Use `.take(500)` or similar limit since we only need unique recent products.
**Impact:** Bounded scan instead of unbounded.

#### 7. `orders/queries.ts::getSellerSuggestions()` and `getChannelSuggestions()` (Line 493-527)
**Current behavior:** `ctx.db.query("orders").collect()` -- scans all orders for unique values.
**Optimization:** These return small sets of unique strings. Could use channelUsage/shippingAgencyUsage tables that already exist. Or maintain separate lookup tables.
**Impact:** Low priority -- data is small and these queries are infrequent.

### Tables Requiring Pagination

| Table | Current Query | Growth Rate | Pagination Priority |
|-------|--------------|-------------|-------------------|
| `orders` | `list()` loads 100 max | ~5-20/day | HIGH -- primary list view |
| `componentTransactions` | `getLocationTransactions()` takes 100 | Grows with inventory ops | MEDIUM -- audit log |
| `productionLog` | `getRecent()` takes limit | Grows with kitchen activity | MEDIUM -- kitchen history |
| `externalRevenue` | `getRevenue()` collects all | Grows with platform syncs | HIGH -- can be large |
| `orderEvents` | `getOrderEvents()` collects all per order | ~5-15 per order | LOW -- bounded per order |
| `externalStockSnapshots` | Various queries | Grows with syncs | LOW -- batch-scoped |

### Kitchen Query Current Flow
Currently, `getKitchenOrders()` calls `fetchOrdersByStatuses()` which makes 8 separate indexed queries (one per status), then `fetchOrdersWithItemsAndProduction()` which does 2 FULL TABLE SCANS (`orderItems.collect()` and `orderItemProduction.collect()`).

With `isKitchenVisible`:
1. Single indexed query: `orders.withIndex("by_kitchen_visible", q => q.eq("isKitchenVisible", true))`
2. Parallel indexed lookups for items per order (bounded to ~5-30 kitchen-visible orders)
3. Parallel indexed lookups for production records per item

### COGS Cache Current State
- `menuProducts.unitCost` field already exists in schema (optional number)
- Current `menuProducts/mutations.ts::create()` and `update()` calculate unitCost from components using `calculateUnitCostFromComponentTypes()`, which includes ALL components (production + packaging)
- User decision: cache ONLY production cost (recipe/food cost), exclude packaging
- Existing cascade pattern: `ingredients/mutations.ts::update()` -> `ctx.scheduler.runAfter(0, internal.lib.costInvalidation.invalidateRecipeCosts)` -- this pattern should be replicated for componentType cost changes -> menuProduct COGS

### COGS Cascade Trigger Points
When should `menuProducts.unitCost` be recalculated?
1. `componentTypes/mutations.ts::update()` -- when `unitCostIdr` changes (primary trigger)
2. `menuProducts/mutations.ts::create()` / `update()` -- when components are modified (already handled)
3. Manual "Recalculate All" button (safety net)

The user decided on "eager recalculation" -- the cached value is updated immediately when the source data changes, not lazily when viewed.

### Stale Cost Indicator Design (Claude's Discretion)

**Recommendation:** Add `unitCostStaleAt: v.optional(v.number())` field to `menuProducts`. When a componentType's cost changes, immediately set `unitCostStaleAt = Date.now()` on affected products (fast), then schedule async recalculation. When recalculation completes, clear `unitCostStaleAt`. Frontend shows a small amber/orange refresh icon next to unitCost when `unitCostStaleAt` is set. This provides instant feedback that costs are updating, even if the scheduled function hasn't run yet.

### Cost Change History (Claude's Discretion)

**Recommendation:** Skip dedicated history tracking. Rationale:
- The "Recalculate All" button already shows before/after diffs
- Adding a history table adds schema complexity for minimal business value
- If needed later, it's easy to add a `costChangeLog` table
- The existing `orderEvents` audit pattern could be replicated, but cost changes are infrequent enough that logging is overkill

### Dashboard Query Restructuring (Claude's Discretion)

**Recommendation:** Keep dashboard metrics computed live (per user decision), but optimize the queries:
1. `getSummary()`: Replace `orders.collect()` with per-status indexed counts. Use `orders.withIndex("by_status").collect()` for each needed status, which is fast because the index is already there. For entity counts, `.collect().length` is fine for small tables.
2. `getRecentOrders()`: Already efficient (takes 10, enriches 10 customers). No change needed.
3. `getUpcomingDue()`: Use `by_status_due_date` compound index instead of full scan + filter.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Full table `.collect()` for batch fetching | Per-order indexed lookups via `Promise.all` | This phase | Scales with active orders, not total history |
| N separate status queries for kitchen | Single `isKitchenVisible` indexed query | This phase | 1 query instead of 8 |
| No pagination on order list | Convex `paginate()` with Load More | This phase | Bounded data transfer |
| Computed COGS on every view | Cached `unitCost` with eager recalculation | This phase | Instant COGS display |

**Deprecated/outdated:**
- `batchFetching.ts::fetchOrdersWithItemsAndProduction()` full table scan pattern will be replaced with targeted indexed lookups
- `getKitchenStats()` full table scan approach will be replaced with indexed status-filtered queries

## Open Questions

1. **"Load 25 more (150 remaining)" -- how to get remaining count?**
   - What we know: Convex `paginate()` returns `isDone` but not total count. Getting total count requires a separate query.
   - What's unclear: Whether a separate count query is acceptable performance-wise for each paginated view.
   - Recommendation: For orders (main use case), add a lightweight `countOrders` query that uses the same index. For transactions/logs, show "Load more" without exact remaining count (use "25+" instead). This avoids extra queries on high-volume tables.

2. **Should `menuProducts.update()` change to store production-only cost in unitCost?**
   - What we know: Current code stores total (production + packaging) in unitCost. User decision says cache recipe-only (production) cost.
   - What's unclear: Whether existing unitCost values should be migrated, and whether any UI currently depends on unitCost including packaging.
   - Recommendation: Yes, change `update()` to store production-only. Run recalculate-all as a migration step. Frontend currently shows unitCost in POS and product listings -- verify no UI assumes it includes packaging.

3. **Completed orders "move to bottom, cleared at end of day" -- implementation?**
   - What we know: User wants completed orders visible at bottom of kitchen list until day ends.
   - What's unclear: Does "end of day" mean midnight? Manual reset? Does `isKitchenVisible` need to be time-aware?
   - Recommendation: Use a `completedAt` timestamp. Kitchen query fetches `isKitchenVisible=true` orders PLUS orders completed today (where `status` is terminal AND `completedAt >= midnight`). The `isKitchenVisible` is `false` for completed orders, but the kitchen query adds a second condition for today's completions. This avoids needing a cron job.

4. **Pagination for array-filtered status queries?**
   - What we know: `orders/queries.ts::list()` supports filtering by array of statuses. `paginate()` cannot chain after `.filter()`.
   - What's unclear: How to paginate when filtering by multiple statuses simultaneously.
   - Recommendation: For multi-status filtering, use multiple paginated queries (one per status) and merge client-side, OR denormalize a status category field. Given the "Load More" pattern, simplest approach is: for single-status filter, use `paginate()` directly; for multi-status (category views), fetch from each status paginated and merge. Alternatively, add a `statusCategory` field (e.g., "active", "completed", "cancelled") and index that.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `convex/orders/queries.ts`, `convex/dashboard/queries.ts`, `convex/orders/helpers/batchFetching.ts`, `convex/lib/costInvalidation.ts`, `convex/menuProducts/mutations.ts`, `convex/schema.ts`
- Context7 `/llmstxt/convex_dev_llms_txt` - Convex pagination (`paginationOptsValidator`, `paginate()`, `usePaginatedQuery`), compound indexes, query performance

### Secondary (MEDIUM confidence)
- Convex docs on index performance and query optimization (verified via Context7)
- Existing project patterns (costInvalidation.ts scheduler pattern, batchFetching.ts batching approach)

### Tertiary (LOW confidence)
- None. All findings are from codebase analysis and official Convex documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries, all existing Convex APIs
- Architecture: HIGH - Patterns verified in codebase and Convex docs
- Pitfalls: HIGH - Identified from actual code analysis, not hypothetical
- COGS caching: HIGH - Existing `costInvalidation.ts` provides the exact pattern to replicate

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (stable -- all APIs are existing Convex features)
