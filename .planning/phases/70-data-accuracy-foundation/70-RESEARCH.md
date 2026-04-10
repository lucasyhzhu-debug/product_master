# Phase 70: Data Accuracy Foundation - Research

**Researched:** 2026-04-10 (updated from 2026-04-08 pre-discuss draft)
**Domain:** Revenue pipeline fix, COGS override, employee profile extensions (Convex + React)
**Confidence:** HIGH

## Summary

Phase 70 addresses four data accuracy gaps undermining the financial reporting system. The most critical finding is that the internal order revenue pipeline (`syncInternalOrders`) has **two distinct bugs**: (1) it only includes orders with statuses in `REVENUE_COUNTABLE_STATUSES` = `["PaymentReceived", "BeingPrepared", "AwaitingDelivery", "Complete"]`, but the legacy "Confirmed" status (still present in schema at line 204 and on older orders) is NOT included -- so any order stuck at "Confirmed" is invisible to revenue reporting, and (2) the sync is purely manual (no cron, no automatic trigger on status change), so even qualifying orders only appear in `externalRevenue` when someone manually clicks sync.

A secondary but equally important finding: the internal adapter creates `externalRevenue` parent records but does NOT create `externalRevenueItems` line items. The income statement resolves COGS exclusively through `externalRevenueItems` + `linkedMenuProductId` -> BOM cost map. This means **internal channel COGS is always zero in the P&L**, regardless of whether orders have correct cost data. The fix for DA-01/DA-02 must also generate `externalRevenueItems`.

DA-03 (COGS override) and DA-04 (employee profile) are straightforward schema additions with minimal risk. DA-01 and DA-02 require pipeline surgery.

**Primary recommendation:** Fix the internal revenue pipeline end-to-end (DA-01/DA-02) with hourly cron + manual trigger + externalRevenueItems generation. Then add COGS override (DA-03) and employee fields (DA-04) in parallel.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Internal order sync runs on an **hourly cron job** (`convex/crons.ts`) AND is manually triggerable from Sales Analytics page.
- **D-02:** Revenue-countable statuses remain: `PaymentReceived`, `BeingPrepared`, `AwaitingDelivery`, `Complete`. Do NOT add `Confirmed`.
- **D-03:** Existing `syncInternalOrders` action (`convex/integrations/internal/adapter.ts`) is the mechanism. Debug why Bali order 0330-002 is stuck at "Confirmed" instead of "Complete" -- this is likely a status transition bug from order edits. **Research must investigate**: how many orders are currently in "Confirmed" status, and trace their `orderEvents` logs to determine if status transitions were lost during edits.
- **D-04:** Backfill uses the same `syncInternalOrders` action called with no `sinceTimestamp` (full scan path). No separate backfill action needed.
- **D-05:** Backfilled records are **not tagged differently** from live-synced records. Revenue is revenue regardless of when synced. Dedup by `orderNumber` handles overlap.
- **D-06:** Triggered as a one-time manual action (from Convex dashboard or Sales Analytics button). After backfill, hourly cron handles incremental.
- **D-07:** Override is a **flat total COGS per unit sold** in IDR. Single field: `cogsOverrideIdr` on `menuProducts` table (optional number).
- **D-08:** **Override always wins.** If `cogsOverrideIdr` is set (non-null), BOM calculation is ignored entirely for that product. Manager clears override to revert to BOM.
- **D-09:** Override is set via **inline editing on MenuProductsManager** table -- same pattern as `defaultPrice` inline editing.
- **D-10:** Income Statement uses override: `buildProductCOGSMap` in `convex/lib/costCalculator.ts` checks `cogsOverrideIdr` first, falls back to BOM summation when null.
- **D-11:** Add three fields to `users` table: `hireDate` (optional number, epoch ms), `baseSalaryIdr` (optional number, monthly salary in IDR), `bankAccountHolderName` (optional string).
- **D-12:** Base rate stored as **monthly salary** in IDR. Phase 74 (Staff Attendance) can derive daily/hourly from this.
- **D-13:** `bankAccountHolderName` is a **separate field** from `users.name` -- legal name for bank transfers often differs from display nickname.
- **D-14:** New fields edited in **expanded UsersManager edit dialog** -- add an "Employment" or "Profile" section to existing dialog. Admin-only access already enforced.

### Claude's Discretion
- Field validation rules (date ranges, salary min/max) -- use sensible defaults
- COGS override display format in MenuProductsManager (currency formatting, placeholder text)
- Error handling for sync failures (existing pattern in adapter is sufficient)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DA-01 | Direct sales orders flow into `externalRevenue` bridge so P&L includes all revenue sources | Revenue pipeline traced: `syncInternalOrders` action -> `getRevenueOrders` query -> `saveRevenue` mutation. Root cause: stuck orders at legacy "Confirmed" status not in `REVENUE_COUNTABLE_STATUSES`. Fix: investigate and fix stuck orders + add hourly cron + generate `externalRevenueItems` for COGS resolution. |
| DA-02 | Historical direct sales orders backfilled into revenue bridge for accurate past-period P&L | Existing `syncInternalOrders` supports full-scan when `sinceTimestamp` is null. One-time manual trigger for backfill. Must also generate `externalRevenueItems` for historical orders. |
| DA-03 | Manager can set flat COGS override per menu product that bypasses BOM calculation | Add `cogsOverrideIdr: v.optional(v.number())` to `menuProducts` schema. Modify `buildProductCOGSMap` to accept menu products and check override first. Inline editing on MenuProductsManager. |
| DA-04 | Employee profile includes hire date, base rate, and bank account holder name | Add 3 optional fields to `users` table (`hireDate`, `baseSalaryIdr`, `bankAccountHolderName`). Extend `updateUser` mutation. Add employment section to UsersManager edit dialog. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Branch-per-phase:** Must create `feature/data-accuracy-foundation` branch from main before any changes
- **No direct commits to main**
- **`npm run build` must pass** before merge
- **Planning template required:** Git Workflow, Implementation Waves, Documentation Updates, Success Criteria
- **Convex patterns:** `Id<"tableName">` typed strings, camelCase fields, `requireRole(ctx, args.token, ["admin"])` for protected mutations, all hooks before conditional returns
- **BOM is source of truth:** Ball composition from `menuProductComponents` + `componentTypes`, not deprecated `productionType`/`productionUnits`
- **CHANGELOG always required** after merging to main
- **Schema changes** auto-pushed via `npx convex dev` (dev) or `npx convex deploy` (prod)

## Standard Stack

No new libraries needed. All work uses existing Convex + React stack.

### Core (existing)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| convex | ^1.31.7 | Backend database + real-time | Schema changes, mutations, queries, crons |
| react | ^19.2.0 | Frontend UI | Form fields, dialogs |
| shadcn/ui | latest | UI components | Input, Label, Dialog already in use |

[VERIFIED: package.json in codebase]

### Files Modified (per requirement)

| Requirement | Backend Files | Frontend Files |
|-------------|---------------|----------------|
| DA-01 | `convex/integrations/internal/config.ts`, `convex/integrations/internal/adapter.ts`, `convex/crons.ts` | `src/components/salesAnalytics/SettingsTab.tsx` (manual trigger already exists) |
| DA-02 | `convex/integrations/internal/adapter.ts` (extend to generate items) | None (one-time run from Convex dashboard or Sales Analytics button) |
| DA-03 | `convex/schema.ts`, `convex/menuProducts/mutations.ts`, `convex/lib/costCalculator.ts`, `convex/reports/incomeStatement.ts` | `src/pages/MenuProductsManager.tsx` (inline edit column) |
| DA-04 | `convex/schema.ts`, `convex/auth/mutations.ts` | `src/pages/UsersManager.tsx` (expanded edit dialog) |

## Architecture Patterns

### DA-01: Revenue Pipeline Fix (Critical Path)

**Current architecture (broken):**
```
Order status changes (moveForward mutation)
    |
    v
(no automatic sync triggered, no cron)
    |
    v
Manual sync button -> syncInternalOrders action
    |
    v
getRevenueOrders query (filters by REVENUE_COUNTABLE_STATUSES)
    |-- EXCLUDES "Confirmed" legacy status (orders stuck there are invisible)
    v
saveRevenue mutation (creates externalRevenue records)
    |-- Does NOT create externalRevenueItems
    v
Income Statement reads externalRevenue (gets revenue)
    |-- Reads externalRevenueItems for COGS resolution
    |-- Finds NO items for internal channel
    v
COGS = 0 for all internal orders in P&L
```
[VERIFIED: codebase analysis of adapter.ts, queries.ts, config.ts, incomeStatement.ts]

**Target architecture (fixed, per D-01 decision):**
```
Hourly cron triggers syncInternalOrders action
    |  (also manually triggerable from Sales Analytics Settings)
    v
getRevenueOrders query (existing status filter -- orders should be in correct statuses)
    |-- Stuck "Confirmed" orders fixed via one-time migration
    v
saveRevenue mutation (creates/updates externalRevenue records, dedup by orderNumber)
    |
    v
NEW: Generate externalRevenueItems per order (one per orderItem)
    |-- Each item linked to menuProductId for COGS resolution
    v
Income Statement reads externalRevenue + externalRevenueItems
    |-- resolveItemsCOGS finds items with linkedMenuProductId
    |-- cogsMap lookup works (with cogsOverrideIdr if set)
    v
Accurate revenue AND COGS for internal channel
```

**Key architectural decisions from CONTEXT.md:**

1. **Hourly cron, NOT inline mutation trigger** (D-01): The user explicitly chose hourly cron + manual trigger over inline sync in `moveForward`. This is simpler (one mechanism, not two) and aligns with the existing pattern used for GoFood/BigSeller syncs. The `crons.ts` file is currently empty -- this will be the first registered cron. [VERIFIED: `convex/crons.ts` lines 1-7]

2. **Do NOT add "Confirmed" to REVENUE_COUNTABLE_STATUSES** (D-02): The user decided that `REVENUE_COUNTABLE_STATUSES` stays as-is. Instead, the stuck orders must be investigated and fixed (advanced to correct statuses). This is the right approach -- keeping `Confirmed` out of the revenue filter avoids treating legacy-stuck orders as revenue before they're actually confirmed.

3. **Stuck order investigation is a prerequisite** (D-03): Before the revenue fix is meaningful, we need to:
   - Count orders currently in "Confirmed" status
   - Trace their `orderEvents` logs to determine if status transitions were lost during edits
   - Fix their statuses (advance them to the correct post-payment status)

**Cron registration pattern:**
```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sync internal orders revenue",
  { hours: 1 },
  internal.integrations.internal.adapter.syncInternalOrders,
  { triggeredBy: "cron" }
);

export default crons;
```
[VERIFIED: Convex cron docs -- `crons.interval` accepts name, interval, function reference, and optional args]

### DA-01/DA-02: externalRevenueItems Generation for Internal Orders

**Current gap:** `syncInternalOrders` creates `externalRevenue` but NOT `externalRevenueItems`. The income statement's `resolveItemsCOGS` (lines 133-186 of `incomeStatement.ts`) iterates `externalRevenueItems` to compute per-product COGS. Without items, COGS is always zero. [VERIFIED: adapter.ts lines 72-109 creates externalRevenue only; incomeStatement.ts lines 298-308 iterates items from itemsMap]

**Fix approach:** Extend `syncInternalOrders` action to also generate `externalRevenueItems` after each `saveRevenue` call. For each internal order:
1. After upserting the `externalRevenue` record, get its ID
2. Fetch `orderItems` for that order (filter out cancelled items)
3. Create/refresh `externalRevenueItems` entries with `linkedMenuProductId` from `orderItem.menuProductId`

**Technical constraint:** `syncInternalOrders` is an `action` (not a mutation), so it cannot directly call `ctx.db`. It already uses `ctx.runMutation` for `saveRevenue`. A new internal mutation will be needed to batch-save revenue items, or the existing `saveRevenueItems` internal mutation (line 507 of `externalData/mutations.ts`) can be reused.

**Revenue item creation pattern:**
```typescript
// After saving revenue record for each order batch:
for (const order of batch) {
  // Need order items -- requires a new internal query
  const orderItems = await ctx.runQuery(
    internal.integrations.internal.queries.getOrderItems,
    { orderNumber: order.orderNumber }
  );

  if (orderItems.length > 0) {
    await ctx.runMutation(
      internal.externalData.mutations.saveRevenueItems,
      {
        revenueId: revenueRecordId,
        items: orderItems.map(item => ({
          externalItemId: `${order.orderNumber}-${item._id}`,
          productName: item.productName,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          totalPrice: item.lineTotal,
          linkedMenuProductId: item.menuProductId,
          isAutoMatched: true,
          matchConfidence: item.menuProductId ? "exact" : "none",
        })),
      }
    );
  }
}
```
[VERIFIED: `saveRevenueItems` internal mutation at line 507 of `externalData/mutations.ts` already handles dedup by `externalItemId`]

**New internal query needed:** `getOrderItems` -- fetches order items by orderNumber, used by the action since actions cannot query the DB directly.

**Revenue record ID lookup challenge:** The current `saveRevenue` mutation returns an array of IDs but does not distinguish which is new vs. which is updated. The action needs to know each revenue record's ID to create items. Options:
- Return the IDs from `saveRevenue` (currently does this -- line 118)
- The batch mapping approach needs to correlate order -> revenueId. Since `saveRevenue` processes records in order and returns IDs in order, the correlation is straightforward.

### DA-03: COGS Override Architecture

**Schema change (per D-07):**
```typescript
// In menuProducts table definition (convex/schema.ts line 93)
menuProducts: defineTable({
  // ... existing fields ...
  // Phase 70: Flat COGS override in IDR (covers production + packaging combined)
  // When set, bypasses BOM calculation entirely for this product.
  cogsOverrideIdr: v.optional(v.number()),
})
```
[VERIFIED: Field name `cogsOverrideIdr` from D-07 decision]

**Cost calculator change (per D-10):** Modify `buildProductCOGSMap` in `convex/lib/costCalculator.ts` to accept an additional parameter for menu product overrides:
```typescript
export function buildProductCOGSMap(
  bomComponents: Array<{ menuProductId: string; componentTypeId: string; quantity: number }>,
  componentTypes: Array<{ _id: string; unitCostIdr: number; category: string }>,
  menuProducts?: Array<{ _id: string; cogsOverrideIdr?: number }> // NEW param
): Map<string, { production: number; packaging: number; total: number }> {
  // First: apply overrides for products that have them
  if (menuProducts) {
    for (const mp of menuProducts) {
      if (mp.cogsOverrideIdr != null) {
        result.set(mp._id, {
          production: mp.cogsOverrideIdr, // Override = total flat COGS
          packaging: 0,
          total: mp.cogsOverrideIdr,
        });
      }
    }
  }

  // Then: BOM aggregation for products WITHOUT override
  for (const comp of bomComponents) {
    if (result.has(comp.menuProductId)) continue; // Skip if override already set
    // ... existing BOM aggregation logic ...
  }

  return result;
}
```
[VERIFIED: `buildProductCOGSMap` at line 148 of costCalculator.ts, called at line 661 of incomeStatement.ts]

**Income statement caller change:** The `fetchAndAggregate` function in `incomeStatement.ts` already fetches all BOM components and component types. Add a parallel fetch for `menuProducts` and pass their overrides to `buildProductCOGSMap`:
```typescript
// In fetchAndAggregate, add to parallel fetch:
const menuProductsList = await ctx.db.query("menuProducts").collect();

// Pass to buildProductCOGSMap:
const cogsMap = buildProductCOGSMap(
  bomComponents.map(c => ({ menuProductId: c.menuProductId as string, componentTypeId: c.componentTypeId as string, quantity: c.quantity })),
  activeComponentTypes.map(ct => ({ _id: ct._id as string, unitCostIdr: ct.unitCostIdr, category: ct.category })),
  menuProductsList.map(mp => ({ _id: mp._id as string, cogsOverrideIdr: (mp as any).cogsOverrideIdr }))
);
```

**UI integration (per D-09):** Add a "COGS Override" inline-editable column in `MenuProductsManager.tsx`, following the same pattern as `defaultPrice` inline editing. The field should:
- Display the override value formatted as IDR currency when set
- Show a placeholder like "Auto (BOM)" when not set
- Be clearable to revert to BOM calculation
- Visually distinguish override-active products (e.g., different badge/color)

**MenuProducts mutation change:** Add `cogsOverrideIdr` to the `update` mutation args in `convex/menuProducts/mutations.ts`. Since this is admin-only and already protected by `requireRole`, no additional auth needed.

### DA-04: Employee Profile Extension

**Schema change (per D-11, D-12, D-13):**
```typescript
// Add to users table (convex/schema.ts line 460, after bankName field):
hireDate: v.optional(v.number()),              // Epoch ms of hire date
baseSalaryIdr: v.optional(v.number()),         // Monthly salary in IDR
bankAccountHolderName: v.optional(v.string()),  // Legal name for bank transfers
```
[VERIFIED: users schema at lines 441-462; existing bank fields `bankAccountNumber` and `bankName` already present from Phase 41]

**Mutation change (per D-14):** Extend `updateUser` mutation in `convex/auth/mutations.ts` (line 188):
```typescript
// Add to args:
hireDate: v.optional(v.number()),
baseSalaryIdr: v.optional(v.number()),
bankAccountHolderName: v.optional(v.string()),
```
The handler already uses a generic `Object.fromEntries(Object.entries(updates).filter(...))` pattern that automatically includes any new args, so the handler logic itself needs no changes beyond the args definition. [VERIFIED: updateUser handler at lines 201-213]

**UI change (per D-14):** Add an "Employment" or "Profile" section to the existing edit user dialog in `UsersManager.tsx`:
- Date input for hire date (native `<Input type="date">` -- shadcn/ui wraps standard HTML input)
- Number input for base salary (formatted as IDR currency with `formatCurrency`)
- Text input for bank account holder name

The edit dialog already exists (lines 190-196 in `UsersManager.tsx` show `openEditDialog` function). Adding new form fields follows the same `formName`/`formRole`/`formAvatarUrl` state pattern.

**Validation rules (Claude's discretion):**
- `hireDate`: Optional, no future date restriction (admin might pre-enter a start date)
- `baseSalaryIdr`: Optional, must be >= 0 if provided, no upper limit
- `bankAccountHolderName`: Optional, trimmed, max 100 characters

### Anti-Patterns to Avoid

- **Do NOT add "Confirmed" to REVENUE_COUNTABLE_STATUSES:** D-02 explicitly forbids this. Fix the stuck orders instead.
- **Do NOT create a separate backfill action:** D-04 says use the same `syncInternalOrders` with no `sinceTimestamp`.
- **Do NOT store COGS on `externalRevenueItems`:** COGS is resolved at P&L query time from BOM/override, not stored on items. This allows retroactive cost corrections.
- **Do NOT modify `orderItems.unitCost` snapshotting:** The override only affects P&L (via `buildProductCOGSMap`). Order-level data stays as a historical record of BOM at creation time.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Revenue sync scheduling | Custom timer/polling | Convex `crons.interval` in `crons.ts` | Built-in, reliable, no infrastructure to manage. Already used for other platform syncs. |
| COGS calculation per-item | Custom cost lookup per order item | Extend existing `buildProductCOGSMap` with override parameter | Already handles BOM resolution, production/packaging split, inactive component filtering. |
| Date picker component | Custom date widget | shadcn/ui `Input type="date"` | Project already uses shadcn/ui primitives. Native date input is sufficient for admin-only use. |
| Revenue deduplication | Custom uniqueness check | Existing `saveRevenue` dedup by `(source, externalTransactionId)` index | Already proven pattern used for all revenue sources. |

## Common Pitfalls

### Pitfall 1: Forgetting externalRevenueItems for Internal Channel
**What goes wrong:** Revenue records sync correctly but COGS shows as zero in the income statement.
**Why it happens:** The income statement resolves COGS through `externalRevenueItems` with `linkedMenuProductId`, not through the `costOfGoods` field on `externalRevenue`. The internal adapter currently only creates parent records.
**How to avoid:** Extend `syncInternalOrders` to also create `externalRevenueItems` for each order's line items, with `linkedMenuProductId` set from `orderItem.menuProductId`.
**Warning signs:** Internal channel shows revenue but zero COGS in P&L.
[VERIFIED: adapter.ts lines 72-109 shows no item creation; incomeStatement.ts lines 298-308 uses itemsMap for COGS]

### Pitfall 2: Legacy "Confirmed" Status Orders Are Invisible
**What goes wrong:** Orders with legacy "Confirmed" status (like Bali order 0330-002) never appear in revenue.
**Why it happens:** Phase 14 renamed "Confirmed" to "PaymentReceived" in the status workflow, but some orders were never migrated. `REVENUE_COUNTABLE_STATUSES` correctly excludes "Confirmed" (per D-02).
**How to avoid:** Investigate stuck orders and fix their statuses (advance to correct post-payment status). This is a one-time data fix, not a code change to the status filter.
**Warning signs:** Orders visible in Order Manager but missing from Sales Analytics and Income Statement.
[VERIFIED: Schema line 198 shows "PaymentReceived" replaced "Confirmed"; line 204 shows "Confirmed" still exists as legacy]

### Pitfall 3: Incremental Sync Missing Historical Orders
**What goes wrong:** Running `syncInternalOrders` after the fix only picks up recent orders, not historical ones.
**Why it happens:** Incremental sync uses `sinceTimestamp` (last successful sync time minus 24h buffer). Historical orders created before the first successful sync are never re-scanned.
**How to avoid:** Per D-04/D-06, do a one-time manual run with full scan path (no `sinceTimestamp`). Either clear existing `internal` sync log entries to force full scan, or use the `syncInternalOrders` action directly from Convex dashboard with no args.
**Warning signs:** Recent direct sales appear in P&L but older ones don't.
[VERIFIED: queries.ts lines 19-39 shows the sinceTimestamp logic]

### Pitfall 4: Action Cannot Directly Query DB
**What goes wrong:** Trying to fetch `orderItems` directly in the `syncInternalOrders` action fails.
**Why it happens:** Convex actions cannot use `ctx.db` -- they can only call `ctx.runMutation` and `ctx.runQuery`. The action needs a new internal query to get order items.
**How to avoid:** Create `getOrderItemsByOrderNumbers` internal query in `convex/integrations/internal/queries.ts` that the action can call.
**Warning signs:** Type error at build time ("Property 'db' does not exist").
[VERIFIED: adapter.ts uses `ctx.runQuery` and `ctx.runMutation` throughout, never direct `ctx.db`]

### Pitfall 5: Revenue Item Dedup on Re-sync
**What goes wrong:** Running sync again creates duplicate revenue items.
**Why it happens:** `saveRevenueItems` deduplicates by `externalItemId` within the same `revenueId`, but only on insert (checks first, skips if exists). If the revenue record itself is updated (upserted), its ID stays the same, so items are correctly deduplicated.
**How to avoid:** Use stable `externalItemId` format: `${orderNumber}-${itemId}`. The existing `saveRevenueItems` at line 507 handles dedup correctly.
**Warning signs:** Revenue item count growing on each sync run.
[VERIFIED: saveRevenueItems at lines 535-543 does dedup by revenueId + externalItemId]

### Pitfall 6: COGS Override Applies Retroactively (Feature, Not Bug)
**What goes wrong:** Setting a COGS override changes historical P&L for periods before the override was set.
**Why it happens:** COGS is resolved at query time (not stored). `buildProductCOGSMap` is called fresh on each income statement query.
**How to avoid:** This is actually correct behavior per D-08 ("Override always wins"). The user can clear the override to revert. Document this behavior in the UI so managers understand the override is retroactive.
**Warning signs:** None -- this is by design.

## Code Examples

### Cron Registration
```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sync internal orders revenue",
  { hours: 1 },
  internal.integrations.internal.adapter.syncInternalOrders,
  { triggeredBy: "cron" }
);

export default crons;
```
[VERIFIED: Convex docs at docs.convex.dev/scheduling/cron-jobs confirm `crons.interval` syntax]

### COGS Override in buildProductCOGSMap
```typescript
// convex/lib/costCalculator.ts -- modified function signature
export function buildProductCOGSMap(
  bomComponents: Array<{ menuProductId: string; componentTypeId: string; quantity: number }>,
  componentTypes: Array<{ _id: string; unitCostIdr: number; category: string }>,
  menuProducts?: Array<{ _id: string; cogsOverrideIdr?: number }>
): Map<string, { production: number; packaging: number; total: number }> {
  // Step 0: Build override set
  const overrides = new Map<string, number>();
  if (menuProducts) {
    for (const mp of menuProducts) {
      if (mp.cogsOverrideIdr != null) {
        overrides.set(mp._id, mp.cogsOverrideIdr);
      }
    }
  }

  // Step 1: Build component type lookup map (existing)
  const componentTypeMap = new Map<string, { unitCostIdr: number; category: string }>();
  for (const ct of componentTypes) {
    componentTypeMap.set(ct._id, { unitCostIdr: ct.unitCostIdr, category: ct.category });
  }

  // Step 2: Single-pass aggregation over BOM components (existing)
  const result = new Map<string, { production: number; packaging: number; total: number }>();

  for (const comp of bomComponents) {
    // Skip BOM if this product has an override
    if (overrides.has(comp.menuProductId)) continue;

    const ct = componentTypeMap.get(comp.componentTypeId);
    if (!ct) continue;
    const lineCost = ct.unitCostIdr * comp.quantity;

    let entry = result.get(comp.menuProductId);
    if (!entry) {
      entry = { production: 0, packaging: 0, total: 0 };
      result.set(comp.menuProductId, entry);
    }
    if (ct.category === "production") entry.production += lineCost;
    else entry.packaging += lineCost;
    entry.total = entry.production + entry.packaging;
  }

  // Step 3: Apply overrides (replaces any BOM entry)
  for (const [productId, override] of overrides) {
    result.set(productId, { production: override, packaging: 0, total: override });
  }

  return result;
}
```
[VERIFIED: Based on existing `buildProductCOGSMap` at lines 148-200 of costCalculator.ts]

### Employee Profile Fields in updateUser
```typescript
// convex/auth/mutations.ts -- updateUser args extension
export const updateUser = mutation({
  args: {
    userId: v.id("users"),
    name: v.optional(v.string()),
    role: v.optional(v.union(
      v.literal("kitchen"),
      v.literal("order_staff"),
      v.literal("manager"),
      v.literal("admin")
    )),
    avatarUrl: v.optional(v.string()),
    // Phase 70: Employee profile fields
    hireDate: v.optional(v.number()),
    baseSalaryIdr: v.optional(v.number()),
    bankAccountHolderName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Existing filter-entries pattern handles new fields automatically
    const { userId, ...updates } = args;
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    if (Object.keys(filteredUpdates).length > 0) {
      await ctx.db.patch(userId, filteredUpdates);
    }
    return await ctx.db.get(userId);
  },
});
```
[VERIFIED: Existing updateUser handler at lines 201-213 of auth/mutations.ts]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No automatic revenue sync | Hourly cron + manual trigger | Phase 70 (this phase) | Revenue appears within 1 hour, no manual sync dependency |
| `externalRevenue` only (no items) | `externalRevenue` + `externalRevenueItems` per order | Phase 70 (this phase) | COGS resolution works for internal channel |
| BOM-only COGS | BOM + `cogsOverrideIdr` field | Phase 70 (this phase) | Manager can override when BOM is incomplete or inaccurate |
| No employee financial metadata | `hireDate`, `baseSalaryIdr`, `bankAccountHolderName` on users | Phase 70 (this phase) | Enables staff attendance tracking (Phase 74) and payroll support |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Bali order 0330-002 is stuck at legacy "Confirmed" status | DA-01 Architecture | If it's at a different status, the investigation step will reveal the actual cause. Low risk -- investigation is a required first step anyway. |
| A2 | `saveRevenueItems` internal mutation can be called from the `syncInternalOrders` action without modification | DA-01/DA-02 Pipeline | If the mutation's arg validation rejects the items format, minor adapter adjustments are needed. Low risk. [ASSUMED] |
| A3 | `menuProducts` table has fewer than 100 products | DA-03 Performance | Full table scan is acceptable at any realistic scale for this business. Convex handles efficiently. [ASSUMED] |
| A4 | `updateUser` handler's generic filter pattern will include new fields without handler changes | DA-04 | Handler uses `Object.fromEntries(Object.entries(updates).filter(...))` which passes through any arg. [VERIFIED: auth/mutations.ts lines 201-213] |

## Open Questions

1. **How many orders have legacy "Confirmed" status?**
   - What we know: Schema allows it, the Bali order 0330-002 is reportedly stuck there
   - What's unclear: Exact count of affected orders and whether they're from edits or incomplete migrations
   - Recommendation: Run a count query during implementation (Wave 0 investigation). Can be determined at implementation time.

2. **Should existing `saveRevenueItems` be used or a new mutation created?**
   - What we know: `saveRevenueItems` exists (line 507, `externalData/mutations.ts`) and handles dedup. It requires `revenueId` which the action gets from `saveRevenue` return.
   - What's unclear: Whether the action can efficiently batch items across multiple orders in a single mutation call (current signature takes one `revenueId` + items array)
   - Recommendation: Use existing `saveRevenueItems` with one call per order. The batch size is small (BATCH_SIZE=100 orders at most, each with ~1-5 items).

3. **How to handle the full backfill reliably?**
   - What we know: Running `syncInternalOrders` with no `sinceTimestamp` triggers full scan in `getRevenueOrders`. But existing `externalSyncLogs` with `source="internal"` and `status="success"` will make `getLatestSyncTimestamp` return a timestamp, preventing full scan.
   - What's unclear: Whether to clear sync logs before backfill, or add a `forceFullSync` parameter
   - Recommendation: Add `forceFullSync: v.optional(v.boolean())` arg to `syncInternalOrders`. When true, skip the `getLatestSyncTimestamp` query and pass `undefined` to `getRevenueOrders`. Simple and explicit.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 + convex-test |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test` |
| Full suite command | `npm run test:coverage` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DA-01 | syncInternalOrders generates externalRevenueItems | unit | `npx vitest run convex/integrations/internal/ -x` | Wave 0 |
| DA-01 | Cron registered correctly | manual | Check Convex dashboard Schedules tab | N/A |
| DA-01 | Stuck orders identified and fixed | manual | Run investigation query | N/A |
| DA-02 | Full backfill (forceFullSync) creates revenue + items for all qualifying orders | unit | `npx vitest run convex/integrations/internal/ -x` | Wave 0 |
| DA-03 | cogsOverrideIdr bypasses BOM in buildProductCOGSMap | unit | `npx vitest run convex/lib/costCalculator -x` | Extend existing |
| DA-03 | Income statement uses override when set | unit | `npx vitest run convex/reports/ -x` | Wave 0 |
| DA-04 | updateUser mutation accepts and stores new fields | unit | `npx vitest run convex/auth/ -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test`
- **Per wave merge:** `npm run test:coverage`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Test for `syncInternalOrders` generating `externalRevenueItems` (new test file or extend existing)
- [ ] Test for `buildProductCOGSMap` with `cogsOverrideIdr` parameter (extend `convex/lib/__tests__/costCalculator.test.ts` if exists)
- [ ] Test for `forceFullSync` parameter in `syncInternalOrders`
- [ ] New internal query `getOrderItemsByOrderNumbers` needs test coverage

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Existing PIN auth unchanged |
| V3 Session Management | no | Existing session tokens unchanged |
| V4 Access Control | yes | `requireRole(ctx, args.token, ["admin"])` for COGS override and employee profile edits; `internalMutation` for revenue sync (not callable from client) |
| V5 Input Validation | yes | Convex validators (`v.number()`, `v.string()`, `v.optional()`) on all new fields |
| V6 Cryptography | no | No crypto operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized COGS override | Elevation of Privilege | `requireRole` admin-only on menuProducts.update |
| Salary/bank data exposure | Information Disclosure | `requireRole` admin-only on updateUser; `listUsers` query already returns bank fields to admin |
| Revenue manipulation via direct DB writes | Tampering | `internalMutation` for saveRevenue (not callable from client); sync uses server-side data only |

## Sources

### Primary (HIGH confidence)
- `convex/integrations/internal/config.ts` -- REVENUE_COUNTABLE_STATUSES definition (lines 9-14) [VERIFIED]
- `convex/integrations/internal/adapter.ts` -- syncInternalOrders action, full flow traced (lines 33-154) [VERIFIED]
- `convex/integrations/internal/queries.ts` -- getRevenueOrders filter logic with sinceTimestamp (lines 16-40) [VERIFIED]
- `convex/orders/helpers/statusTransitions.ts` -- ALL_ORDER_STATUSES, FORWARD_TRANSITIONS (lines 15-47) [VERIFIED]
- `convex/schema.ts` -- orders status union with legacy "Confirmed" at line 204, users table at lines 441-462, menuProducts at lines 93-126 [VERIFIED]
- `convex/reports/incomeStatement.ts` -- resolveItemsCOGS at lines 133-186, buildProductCOGSMap call at line 661, fetchAndAggregate parallel fetches [VERIFIED]
- `convex/lib/costCalculator.ts` -- buildProductCOGSMap function at lines 148-200 [VERIFIED]
- `convex/externalData/mutations.ts` -- saveRevenue dedup at lines 85-121, saveRevenueItems at lines 507-564 [VERIFIED]
- `convex/auth/mutations.ts` -- updateUser at lines 188-213, updateBankDetails at line 356 [VERIFIED]
- `convex/crons.ts` -- confirms NO scheduled jobs currently (lines 1-7) [VERIFIED]
- `convex/orders/mutations/statusUpdates.ts` -- moveForward mutation at lines 362-527 [VERIFIED]
- Convex cron docs (https://docs.convex.dev/scheduling/cron-jobs) -- `crons.interval` syntax [CITED]

### Secondary (MEDIUM confidence)
- `src/components/salesAnalytics/SettingsTab.tsx` -- existing manual sync trigger for internal orders (line 115, 181-193) [VERIFIED]
- `src/pages/UsersManager.tsx` -- existing edit dialog structure (lines 190-213) [VERIFIED]
- `src/pages/MenuProductsManager.tsx` -- existing product management UI with drag-and-drop [VERIFIED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all existing Convex patterns [VERIFIED]
- Architecture (DA-01/DA-02): HIGH -- traced full pipeline end-to-end, identified exact bugs, verified fix approach against CONTEXT decisions [VERIFIED]
- Architecture (DA-03): HIGH -- traced COGS resolution through costCalculator and incomeStatement, simple function signature extension [VERIFIED]
- Architecture (DA-04): HIGH -- simple schema + mutation + UI extension, verified handler pattern [VERIFIED]
- Pitfalls: HIGH -- identified from actual codebase analysis [VERIFIED]

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (stable -- no external dependencies, all internal codebase)
