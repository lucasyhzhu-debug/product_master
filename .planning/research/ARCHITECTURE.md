# Architecture Research: v1.2 Unified Planning & Revenue

**Domain:** Multi-channel dispatch planning, 3rd GoJek outlet, kitchen simplification, manual sales entry, consignment revenue workflow
**Researched:** 2026-02-16
**Confidence:** HIGH (based on direct analysis of all 59 schema tables, existing integration code, and established patterns)

---

## System Overview: Current Architecture

The system already has a well-layered multi-channel architecture built in v1.1. The v1.2 features extend existing components rather than creating fundamentally new subsystems.

```
                        EXTERNAL APIS
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │  K3Mart API  │  │  GoBiz API   │  │  NEW: 3rd    │
  │  (consapi)   │  │  (journals,  │  │  GoJek outlet│
  │  7 outlets   │  │   orders)    │  │  (Tamtem)    │
  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
         │                 │                 │
┌────────┴─────────────────┴─────────────────┴──────────────┐
│               CONVEX ACTIONS ("use node")                  │
│  integrations/k3mart/adapter.ts                            │
│  integrations/gobiz/adapter.ts  <-- add 3rd merchant ID    │
│  NEW: Manual sales entry mutations (no API needed)         │
└────────────────────────┬──────────────────────────────────┘
                         │
┌────────────────────────┴──────────────────────────────────┐
│               SHARED DATA LAYER (existing)                 │
│  externalOutlets  │ externalRevenue  │ externalSyncLogs    │
│  externalRevenue  │ externalProduct  │ platformCredentials  │
│    Items          │   Mappings       │                      │
│                                                            │
│  NEW: channel on dispatch plans (not just k3mart)          │
│  NEW: consignmentBatches + consignmentSettlements          │
│  MODIFIED: productionProductTargets (multi-source)         │
└────────────────────────┬──────────────────────────────────┘
                         │
┌────────────────────────┴──────────────────────────────────┐
│             FRONTEND PAGES                                 │
│  K3MartCockpit.tsx --> evolves to DispatchPlanner.tsx       │
│  KitchenViewV2.tsx --> simplified aggregate targets         │
│  SalesAnalytics.tsx --> add manual entry + consignment tab  │
│  NEW: ConsignmentManager.tsx (revenue recognition)         │
└───────────────────────────────────────────────────────────┘
```

---

## Q1: Evolving K3Mart Cockpit into Multi-Channel Dispatch Planner

### Current State

The K3Mart cockpit is tightly coupled to K3Mart:
- `k3martDispatchPlans` table has `outletId: v.id("externalOutlets")` but the queries hardcode `source: "k3mart"` filters on `externalOutlets`
- `k3martStockMovements` table is K3Mart-specific (has `k3martRequestId`, `k3martStatus`)
- `k3martCockpit/queries.ts` has 7 queries, all filtering `externalOutlets` by `source: "k3mart"`
- `k3martCockpit/mutations.ts` couples to K3Mart API (submittedAt, k3martRequestId)
- Helper functions (`calculateKitchenDelta`, `calculateAutoSuggest`) are channel-agnostic (good)

### Architecture Decision: Extend, Don't Replace

**Do NOT rename or refactor `k3martDispatchPlans` into a generic dispatch table.** The K3Mart integration has API-specific fields (`k3martRequestId`, `submissionInProgress`, K3Mart-specific status flow). Trying to generalize this table would break the existing K3Mart API submission flow.

**Instead, create a thin abstraction layer above the existing tables:**

1. **New table: `dispatchPlans`** -- Generic multi-channel dispatch planning (for Legato Goldfinch, Tamtem, other non-API channels)
2. **Keep `k3martDispatchPlans`** -- K3Mart retains its API-specific workflow
3. **New query: `getUnifiedWeeklyPlans`** -- Combines k3mart + generic dispatch data for the unified planner UI

```typescript
// NEW TABLE: convex/schema.ts
dispatchPlans: defineTable({
  date: v.string(), // YYYY-MM-DD
  weekNumber: v.string(), // "2026-W07"
  channel: v.string(), // "legato_gf", "legato_tamtem", "bazaar", etc.
  outletId: v.optional(v.id("externalOutlets")), // null for non-outlet channels
  menuProductId: v.id("menuProducts"),
  plannedQty: v.number(),
  suggestedQty: v.number(),
  status: v.union(
    v.literal("draft"),
    v.literal("confirmed")
  ),
  createdBy: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_week", ["weekNumber"])
  .index("by_date_channel", ["date", "channel"])
  .index("by_channel", ["channel"]),
```

### Why This Approach

- K3Mart plans need API submission, approval/rejection, request IDs -- these don't apply to Legato Goldfinch or Tamtem
- Generic channels just need "how many to send" and "confirmed or not"
- The unified planner UI reads from both tables but writes to the appropriate one based on channel
- `confirmDayPlan` mutation already writes to `productionProductTargets` -- the generic version does the same
- No migration needed for existing K3Mart data

### New Query Pattern: Unified View

```typescript
// convex/dispatch/queries.ts
export const getUnifiedWeeklyPlans = query({
  args: { weekNumber: v.string() },
  handler: async (ctx, args) => {
    // 1. K3Mart plans (existing)
    const k3martPlans = await ctx.db.query("k3martDispatchPlans")
      .withIndex("by_week", q => q.eq("weekNumber", args.weekNumber))
      .collect();

    // 2. Generic channel plans (new)
    const genericPlans = await ctx.db.query("dispatchPlans")
      .withIndex("by_week", q => q.eq("weekNumber", args.weekNumber))
      .collect();

    // 3. Normalize into unified shape for frontend
    return {
      k3mart: k3martPlans, // keep separate for API-specific status display
      channels: genericPlans, // simpler draft/confirmed lifecycle
    };
  },
});
```

### Files: New vs Modified

| Action | File | Purpose |
|--------|------|---------|
| NEW | `convex/dispatch/queries.ts` | Unified multi-channel dispatch queries |
| NEW | `convex/dispatch/mutations.ts` | Generic channel dispatch CRUD |
| MODIFY | `convex/k3martCockpit/mutations.ts` | `confirmDayPlan` becomes shared (extract target-push logic) |
| MODIFY | `convex/schema.ts` | Add `dispatchPlans` table |
| MODIFY | `src/pages/K3MartCockpit.tsx` | Evolve into multi-channel planner (or rename to DispatchPlanner) |

---

## Q2: Adding 3rd GoJek Outlet to GoBiz Sync

### Current State

The GoBiz adapter already supports multi-merchant:
- `GOBIZ_CONFIG.merchantIds: ["G293156297", "G347061572"]` (Goldfinch + Crystal)
- Journal search uses `"op": "in"` with merchant ID array -- already fetches both
- `GOBIZ_OUTLET_SEED` auto-creates outlet docs on each sync
- Revenue records already have `outletId` pointing to the correct outlet

### Architecture: Add Tamtem Merchant ID

This is a configuration change, not an architecture change:

```typescript
// convex/integrations/gobiz/config.ts
export const GOBIZ_CONFIG = {
  merchantIds: ["G293156297", "G347061572", "G958262444"] as const,
  merchantNames: {
    "G293156297": "Legato Goldfinch",
    "G347061572": "GoFood Crystal",
    "G958262444": "Legato Tamtem",  // NEW
  } as Record<string, string>,
  // ...
};

export const GOBIZ_OUTLET_SEED = [
  { externalId: "G293156297", name: "Legato Goldfinch", source: "gobiz" as const },
  { externalId: "G347061572", name: "GoFood Crystal", source: "gobiz" as const },
  { externalId: "G958262444", name: "Legato Tamtem", source: "gobiz" as const },  // NEW
] as const;
```

### Verification Needed

The merchant ID `G958262444` needs to be confirmed. The PROJECT.md mentions "Tamtem/Legato G958262444" but this must be verified against actual GoBiz portal data. **Flag: LOW confidence on exact merchant ID.**

### Impact on Existing Code

- `syncGoBizRevenue` action: **No changes needed** -- already iterates all `merchantIds` in journal search
- `autoSyncGoBizRevenue` cron: **No changes needed** -- reuses same sync logic
- `externalOutlets`: New doc auto-created by `GOBIZ_OUTLET_SEED`
- Revenue attribution: Already resolves `outletId` from `merchant_id` in journal hits via `outletMap`
- Product mappings: May need new mappings if Tamtem has different product names/prices
- Phase C (sticker deduction): Works per-revenue-item, outlet-agnostic

### Files to Modify

| Action | File | Change |
|--------|------|--------|
| MODIFY | `convex/integrations/gobiz/config.ts` | Add 3rd merchant ID + seed entry |
| VERIFY | Tamtem merchant ID | Confirm `G958262444` via GoBiz portal |

---

## Q3: Simplifying Kitchen Targets to Aggregate Model

### Current State

Kitchen targets come from 3 sources, stored in 2 tables:

1. **Orders** -- Auto-calculated from `orders` with `dueDate` in today/tomorrow range (`getOrderProductDemand` query)
2. **Consignment (K3Mart)** -- Manual per-product targets in `productionProductTargets` with `source: "consignment"`
3. **GoFood** -- Manual per-product targets in `productionProductTargets` with `source: "gofood"`

Ball-level targets in `productionTargets` table (per `productionUnitTypeId` per date).

The `kitchenConfig` table has `maxProductionTarget`, `bigBallTarget`, `midBallTarget` -- these are static, not daily.

### Architecture Decision: Aggregate Daily Target View

The kitchen simplification does NOT require new tables. It requires a new **aggregate query** that combines all sources into a single dashboard number.

```typescript
// convex/kitchen/queries.ts (NEW)
export const getDailyProductionSummary = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    // 1. Order demand (auto-calculated)
    const orderDemand = await getOrderDemandForDate(ctx, args.date);

    // 2. Consignment demand (from dispatch confirmations)
    const consignmentTargets = await ctx.db.query("productionProductTargets")
      .withIndex("by_date_source", q => q.eq("date", args.date).eq("source", "consignment"))
      .collect();

    // 3. GoFood demand (manual targets)
    const gofoodTargets = await ctx.db.query("productionProductTargets")
      .withIndex("by_date_source", q => q.eq("date", args.date).eq("source", "gofood"))
      .collect();

    // 4. NEW: Generic dispatch demand (from dispatchPlans)
    const dispatchTargets = await ctx.db.query("productionProductTargets")
      .withIndex("by_date", q => q.eq("date", args.date))
      .collect();

    // 5. Config
    const config = await ctx.db.query("kitchenConfig").first();

    // 6. Aggregate per menu product, then convert to ball counts via BOM
    // Return: { totalBalls: { big: N, mid: N }, bySource: {...}, config }
  },
});
```

### Key Simplification: Single "Produce This Many" Number

Instead of showing kitchen staff 3 separate sources, the aggregate query returns:
- **Total balls needed today** (one number per ball type)
- **Total balls produced so far** (from `productionLog` aggregation)
- **Remaining** = needed - produced
- **Over/under indicator** (warning if approaching max target)

The per-source breakdown is available on tap/expand for managers but hidden by default.

### New Source: Generic Dispatch Plans

When generic dispatch plans are confirmed, they should also push to `productionProductTargets` (same pattern as K3Mart's `confirmDayPlan`). Use a new source value:

```typescript
// productionProductTargets.source values:
// "consignment" -- from K3Mart dispatch confirmation (existing)
// "gofood"      -- manual GoFood targets (existing)
// "dispatch"    -- from generic dispatchPlans confirmation (NEW)
```

### Files

| Action | File | Purpose |
|--------|------|---------|
| NEW | `convex/kitchen/queries.ts` | Aggregate daily production summary |
| MODIFY | `src/pages/KitchenViewV2.tsx` | Simplified dashboard showing aggregate target |
| MODIFY | `convex/dispatch/mutations.ts` | `confirmDayPlan` for generic channels pushes to productionProductTargets |

---

## Q4: Manual Sales Entry for Non-API Channels

### Current State

Revenue data flows into `externalRevenue` from 3 sources:
- `source: "k3mart"` -- via K3Mart API sync (stock delta + revenue)
- `source: "gobiz"` -- via GoBiz journal API sync
- `source: "internal"` -- via internal order sync (order completion triggers revenue record)

Non-API channels (Legato Tamtem walk-in, Legato Goldfinch walk-in, Shopee, TikTok Shop) have NO revenue tracking.

### Architecture Decision: Manual Revenue Entry Mutation

Use the existing `externalRevenue` table with `dataOrigin: "manual_entry"` and `confidence: "manual"`. These fields already exist in the schema and are designed for this exact use case.

```typescript
// convex/externalData/mutations.ts (ADD public mutation)
export const addManualRevenue = mutation({
  args: {
    token: v.string(),
    channel: v.string(), // "legato_tamtem", "shopee", "tiktok", etc.
    outletId: v.optional(v.id("externalOutlets")),
    date: v.string(), // YYYY-MM-DD
    items: v.array(v.object({
      menuProductId: v.id("menuProducts"),
      productName: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      totalPrice: v.number(),
    })),
    revenueGross: v.number(),
    revenueNet: v.optional(v.number()), // gross minus commission
    commission: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);

    // Convert date to timestamp range
    const periodStart = new Date(args.date + "T00:00:00+07:00").getTime();
    const periodEnd = periodStart + 24 * 60 * 60 * 1000;

    // Create revenue record
    const revenueId = await ctx.db.insert("externalRevenue", {
      source: mapChannelToSource(args.channel), // map to "k3mart"|"gobiz"|"internal"
      outletId: args.outletId,
      periodStart,
      periodEnd,
      revenueGross: args.revenueGross,
      revenueNet: args.revenueNet ?? args.revenueGross,
      commission: args.commission ?? 0,
      transactionCount: 1,
      dataOrigin: "manual_entry",
      confidence: "manual",
      externalTransactionId: `manual|${args.channel}|${args.date}|${Date.now()}`,
      transactionDate: periodStart,
    });

    // Create revenue items
    for (const item of args.items) {
      await ctx.db.insert("externalRevenueItems", {
        revenueId,
        source: mapChannelToSource(args.channel),
        productName: item.productName,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        totalPrice: item.totalPrice,
        linkedMenuProductId: item.menuProductId,
        isAutoMatched: true,
        matchConfidence: "exact",
        createdAt: Date.now(),
      });
    }
  },
});
```

### Source Field Expansion

The `externalRevenue.source` union currently only allows `"k3mart" | "gobiz" | "internal"`. For non-API channels that aren't in the existing union, two options:

**Option A: Map to existing sources** -- Legato Tamtem/Goldfinch walk-in sales map to `"internal"`. K3Mart manual entries map to `"k3mart"`.

**Option B: Expand the source union** -- Add new literals: `"manual"` or specific channel literals.

**Recommendation: Option A for v1.2.** The existing source union is referenced in ~15 files (validators, queries, registry). Expanding it requires touching every file. The `dataOrigin: "manual_entry"` field already distinguishes manual from API-synced records. Analytics queries can filter by `dataOrigin` to separate manual entries.

For per-channel attribution, the `outletId` field already links to `externalOutlets` which has the outlet name. For non-outlet channels (Shopee, TikTok), create `externalOutlets` docs with `source: "internal"` (already in the union).

### Commission Rate Configuration

The deferred requirement SCH-02 asks for per-outlet commission rates. This is a simple field on `externalOutlets`:

```typescript
// MODIFY externalOutlets (add optional field)
commissionRate: v.optional(v.number()), // 0.10 = 10%, 0.17 = 17%
```

When entering manual sales, the UI pre-fills `revenueNet = revenueGross * (1 - commissionRate)`.

### Files

| Action | File | Purpose |
|--------|------|---------|
| MODIFY | `convex/externalData/mutations.ts` | Add `addManualRevenue` public mutation |
| MODIFY | `convex/schema.ts` | Add `commissionRate` to `externalOutlets` |
| NEW | Frontend component | Manual sales entry form (date picker, product selector, qty/price) |
| MODIFY | `src/pages/SalesAnalytics.tsx` | Add "Manual Entry" button/tab |

---

## Q5: Consignment Revenue Recognition

### Current State

Consignment currently works as:
1. Manager plans dispatch in K3Mart cockpit (weekly planner)
2. Dispatch confirmed -> stock sent to K3Mart outlets
3. K3Mart API syncs daily sales (stock delta -> `externalRevenue`)
4. Revenue recognized immediately on sale at outlet

**Gap:** No tracking of:
- What was dispatched vs. what was sold vs. what's still at outlet
- Cash collection from consignment partners (K3Mart pays periodically, not per-sale)
- Unsold return handling (stock-outs come back)
- Revenue recognition timing (should be on sale, not on dispatch)

### Architecture Decision: Consignment Batch Tracking

Two new tables for the consignment lifecycle:

```typescript
// NEW TABLE: convex/schema.ts
consignmentBatches: defineTable({
  // Identity
  batchNumber: v.string(), // "CS-0216-001" (auto-generated)
  channel: v.string(), // "k3mart", "legato_gf", "legato_tamtem"
  outletId: v.optional(v.id("externalOutlets")),

  // What was dispatched
  dispatchDate: v.string(), // YYYY-MM-DD
  items: v.array(v.object({
    menuProductId: v.id("menuProducts"),
    productName: v.string(),
    quantity: v.number(), // dispatched qty
    unitPrice: v.number(), // consignment price
    unitCost: v.number(), // COGS from menuProducts.unitCost
  })),

  // Totals
  totalDispatched: v.number(), // sum of item quantities
  totalRetailValue: v.number(), // sum of qty * unitPrice
  totalCost: v.number(), // sum of qty * unitCost

  // Sales tracking (updated as sales come in)
  totalSold: v.number(), // cumulative units sold from this batch
  totalRevenueRecognized: v.number(), // cumulative revenue from sold units
  totalReturned: v.number(), // units returned unsold

  // Status
  status: v.union(
    v.literal("dispatched"), // sent to outlet, awaiting sales
    v.literal("active"), // sales coming in
    v.literal("settled"), // fully settled (all sold + returned + paid)
    v.literal("cancelled") // dispatch cancelled before sale
  ),

  // Links
  dispatchPlanIds: v.optional(v.array(v.string())), // k3martDispatchPlan or dispatchPlan IDs

  createdBy: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_channel", ["channel"])
  .index("by_outlet", ["outletId"])
  .index("by_status", ["status"])
  .index("by_dispatch_date", ["dispatchDate"]),

// NEW TABLE: Cash collection tracking
consignmentSettlements: defineTable({
  batchId: v.optional(v.id("consignmentBatches")), // null for lump-sum settlements
  channel: v.string(),
  outletId: v.optional(v.id("externalOutlets")),

  // Settlement details
  settlementDate: v.string(), // YYYY-MM-DD
  amountReceived: v.number(), // cash received
  paymentMethod: v.optional(v.string()), // "bank_transfer", "cash", etc.
  reference: v.optional(v.string()), // transfer reference

  // What this covers
  periodStart: v.optional(v.string()), // YYYY-MM-DD (settlement covers sales from...)
  periodEnd: v.optional(v.string()), // YYYY-MM-DD (...to this date)

  notes: v.optional(v.string()),
  createdBy: v.string(),
  createdAt: v.number(),
})
  .index("by_channel", ["channel"])
  .index("by_batch", ["batchId"])
  .index("by_date", ["settlementDate"]),
```

### Revenue Recognition Flow

```
1. Dispatch Confirmed (cockpit)
   -> Create consignmentBatch (status: "dispatched")
   -> Push to productionProductTargets (existing flow)

2. Sales Detected (K3Mart API sync or manual entry)
   -> Update consignmentBatch.totalSold += quantity
   -> Update consignmentBatch.totalRevenueRecognized += revenue
   -> Revenue already in externalRevenue (existing flow)
   -> consignmentBatch status -> "active"

3. Returns Processed (manual)
   -> Update consignmentBatch.totalReturned += quantity
   -> Optional: re-add to office sticker count via productionLog

4. Cash Collection (manual)
   -> Create consignmentSettlement
   -> Link to batch(es) or date range
   -> Manager can reconcile: expected vs received

5. Batch Settled
   -> When totalSold + totalReturned == totalDispatched
   -> And settlement covers expected amount
   -> Status -> "settled"
```

### Integration with K3Mart Dispatch

When `confirmDayPlan` runs, it should also create a `consignmentBatch`:

```typescript
// MODIFY convex/k3martCockpit/mutations.ts::confirmDayPlan
// After confirming plans and pushing to productionProductTargets:

// Create consignment batch per outlet (aggregate plans for that day+outlet)
for (const [outletId, products] of outletProductMap) {
  await ctx.db.insert("consignmentBatches", {
    batchNumber: generateBatchNumber(args.date),
    channel: "k3mart",
    outletId,
    dispatchDate: args.date,
    items: products,
    totalDispatched: products.reduce((s, p) => s + p.quantity, 0),
    totalRetailValue: products.reduce((s, p) => s + p.quantity * p.unitPrice, 0),
    totalCost: products.reduce((s, p) => s + p.quantity * p.unitCost, 0),
    totalSold: 0,
    totalRevenueRecognized: 0,
    totalReturned: 0,
    status: "dispatched",
    createdBy: user.name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}
```

### Auto-Reconciliation with K3Mart Sales

When K3Mart revenue syncs (via `externalRevenue` records), a post-sync step can update the corresponding `consignmentBatch`:

```
K3Mart sync -> new externalRevenue records
  -> match by outletId + date + product
  -> update consignmentBatch.totalSold and totalRevenueRecognized
```

This is best done as a scheduled job (not inline with sync) to avoid coupling.

### Files

| Action | File | Purpose |
|--------|------|---------|
| MODIFY | `convex/schema.ts` | Add `consignmentBatches`, `consignmentSettlements` |
| NEW | `convex/consignment/queries.ts` | Batch listing, settlement status, reconciliation view |
| NEW | `convex/consignment/mutations.ts` | Create batch, record settlement, process return |
| MODIFY | `convex/k3martCockpit/mutations.ts` | Create consignment batch on dispatch confirm |
| NEW | `src/pages/ConsignmentManager.tsx` | Consignment dashboard: batches, settlements, reconciliation |
| NEW | `src/hooks/convex/useConsignment.ts` | Frontend hooks for consignment queries/mutations |

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **convex/dispatch/** (NEW) | Generic multi-channel dispatch planning | k3martCockpit (K3Mart-specific), productionProductTargets, dispatchPlans table |
| **convex/consignment/** (NEW) | Consignment batch lifecycle and settlements | k3martCockpit (batch creation), externalRevenue (reconciliation), dispatch |
| **convex/kitchen/queries.ts** (NEW) | Aggregate daily production summary | productionProductTargets (all sources), productionLog, kitchenConfig |
| **convex/k3martCockpit/** (EXISTING) | K3Mart-specific dispatch with API submission | dispatch (shared target push), consignment (batch creation) |
| **convex/integrations/gobiz/** (EXISTING) | GoBiz 3-outlet revenue sync | externalData (storage), config (merchant IDs) |
| **convex/externalData/** (EXISTING) | Multi-platform data CRUD | All integration adapters, manual entry, analytics |

---

## Data Flow: New vs Modified Components

### New Tables (3)

| Table | Purpose | Indexes |
|-------|---------|---------|
| `dispatchPlans` | Generic multi-channel dispatch planning (non-K3Mart) | `by_week`, `by_date_channel`, `by_channel` |
| `consignmentBatches` | Track dispatched-to-outlet inventory lifecycle | `by_channel`, `by_outlet`, `by_status`, `by_dispatch_date` |
| `consignmentSettlements` | Cash collection records from consignment partners | `by_channel`, `by_batch`, `by_date` |

### Modified Tables (2)

| Table | Modification | Why |
|-------|-------------|-----|
| `externalOutlets` | Add `commissionRate: v.optional(v.number())` | Per-outlet commission for revenue calculation |
| No others | Existing schema handles all other features | Well-designed multi-source architecture from v1.1 |

### No Schema Changes Needed For

- 3rd GoJek outlet (config change only, `externalOutlets` auto-seeded)
- Manual sales entry (uses existing `externalRevenue` with `dataOrigin: "manual_entry"`)
- Kitchen aggregate targets (query-time aggregation, no new storage)
- Generic dispatch targets (reuses `productionProductTargets` with new `source` values)

---

## Patterns to Follow

### Pattern 1: Channel Abstraction via Source String

The existing architecture uses `source` strings (`"k3mart"`, `"gobiz"`, `"internal"`) throughout. For new channels, follow the same pattern but use `productionProductTargets.source` (which is `v.string()`, not a union) for flexibility:

```typescript
// productionProductTargets.source values (existing + new):
"consignment"  // K3Mart dispatch (existing)
"gofood"       // GoFood targets (existing)
"dispatch_gf"  // Legato Goldfinch dispatch (new)
"dispatch_tt"  // Legato Tamtem dispatch (new)
```

### Pattern 2: Consignment Batch as Audit Trail

Every dispatch creates a `consignmentBatch`. This provides:
- **Traceability**: What was sent where, when
- **Reconciliation**: Expected revenue vs actual
- **Returns tracking**: Unsold stock accounting
- **Settlement**: Cash collection audit

This replaces ad-hoc stock movement tracking with a proper batch lifecycle.

### Pattern 3: Manual Entry as First-Class Revenue

Manual sales entries use the same `externalRevenue` + `externalRevenueItems` tables as API-synced data. The `dataOrigin` field distinguishes them. Analytics queries don't need to special-case manual entries.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Genericizing K3Mart Tables

**Do NOT rename `k3martDispatchPlans` to `dispatchPlans`** or try to make it serve all channels. The K3Mart table has API-specific fields (`k3martRequestId`, `submissionInProgress`, 6-status workflow). Generic channels need only 2 statuses (draft/confirmed). Create a separate simpler table.

### Anti-Pattern 2: Expanding Source Union for Manual Channels

**Do NOT add `"shopee" | "tiktok" | "legato_tamtem"` etc. to `externalRevenue.source` union.** This union is validated in ~15 files. Use existing `"internal"` source with `outletId` pointing to specific outlet docs for attribution. Use `dataOrigin: "manual_entry"` to distinguish.

### Anti-Pattern 3: Inline Consignment Reconciliation During Sync

**Do NOT update consignment batches during K3Mart API sync.** The sync should stay focused on recording revenue. Reconciliation with consignment batches should be a separate query or scheduled job. Coupling them makes the sync fragile.

### Anti-Pattern 4: Kitchen Target Table Explosion

**Do NOT create separate target tables per channel.** The existing `productionProductTargets` table with its `source` string field handles multiple sources cleanly. Adding new sources is just a new string value, no schema change needed.

---

## Suggested Build Order (Dependency-Driven)

```
Phase 1: 3rd GoJek Outlet
  ├── Config change (1-2 lines in gobiz/config.ts)
  ├── Verify merchant ID
  └── Product mapping for Tamtem products
        │  (no deps, quick win)
        v
Phase 2: Manual Sales Entry
  ├── addManualRevenue mutation
  ├── commissionRate on externalOutlets
  └── Frontend entry form
        │  (enables non-API channel data)
        v
Phase 3: Multi-Channel Dispatch Planner
  ├── dispatchPlans table
  ├── dispatch/ queries + mutations
  ├── Evolve K3MartCockpit.tsx -> unified planner
  └── Generic confirmDayPlan -> productionProductTargets
        │  (needs Phase 2 channels to plan for)
        v
Phase 4: Kitchen Simplification
  ├── Aggregate daily production summary query
  ├── Simplified kitchen dashboard
  └── Audio alerts + over/under warnings (frontend)
        │  (benefits from all dispatch sources being online)
        v
Phase 5: Consignment Revenue Workflow
  ├── consignmentBatches + consignmentSettlements tables
  ├── Batch creation on dispatch confirm
  ├── Settlement recording + reconciliation
  └── ConsignmentManager.tsx page
        │  (needs dispatch + sales data from all prior phases)
        v
Phase 6: Cross-Channel Analytics Enhancement
  ├── Update SalesAnalytics with manual entry data
  ├── Consignment P&L view
  └── Per-channel commission tracking
```

### Ordering Rationale

1. **3rd GoJek outlet first** -- minimal change, immediate value, validates sync infrastructure
2. **Manual sales entry second** -- unblocks revenue tracking for non-API channels before dispatch planning needs it
3. **Multi-channel dispatch third** -- builds on existing K3Mart cockpit, needs channels from Phase 2
4. **Kitchen simplification fourth** -- aggregate view benefits from all dispatch sources being online
5. **Consignment last** -- most complex, builds on dispatch + sales data from all other phases
6. **Analytics last** -- summarizes everything built in prior phases

---

## Scalability Considerations

| Concern | At Current Scale (~7 K3Mart outlets + 3 GoJek) | At 20+ Outlets | At 50+ Outlets |
|---------|------------------------------------------------|----------------|----------------|
| Dispatch plan queries | Fine (7 outlets * 7 days * ~8 products = ~400 rows/week) | Index by week + outlet handles it | May need pagination |
| Consignment batches | 1-2 batches/day | 5-10 batches/day, still fine | Consider archival after settlement |
| Revenue table growth | ~200 records/day | ~500/day, indexed queries handle it | Consider time-based partitioning |
| Kitchen aggregate query | Reads ~3 sources, fast | Same | Same (sources don't scale with outlets) |

---

## Sources

- Direct codebase analysis of all files listed in this document
- `convex/schema.ts` -- full 59-table schema (lines 1-1340)
- `convex/k3martCockpit/queries.ts` -- 7 existing cockpit queries
- `convex/k3martCockpit/mutations.ts` -- dispatch planning + target push logic
- `convex/integrations/gobiz/adapter.ts` -- multi-merchant sync flow
- `convex/integrations/gobiz/config.ts` -- current merchant ID configuration
- `convex/externalData/queries.ts` + `mutations.ts` -- multi-source revenue CRUD
- `convex/productionTargets/queries.ts` -- 3-source target architecture
- `.planning/PROJECT.md` -- v1.2 milestone scope
- `.planning/milestones/v1.1-REQUIREMENTS.md` -- deferred SCH-01, SCH-02 requirements

---
*Architecture research for: v1.2 Unified Planning & Revenue*
*Researched: 2026-02-16*
