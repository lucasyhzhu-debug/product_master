# Phase 70: Data Accuracy Foundation - Research

**Researched:** 2026-04-08
**Domain:** Revenue pipeline fix, COGS override, employee profile extensions (Convex + React)
**Confidence:** HIGH

## Summary

Phase 70 addresses four data accuracy gaps that undermine the financial reporting system. The most critical finding is that the internal order revenue pipeline (`syncInternalOrders`) has **two distinct bugs**: (1) it only includes orders with statuses in `REVENUE_COUNTABLE_STATUSES` = `["PaymentReceived", "BeingPrepared", "AwaitingDelivery", "Complete"]`, but the legacy "Confirmed" status (still present in schema and on older orders) is NOT included -- so any order stuck at "Confirmed" is invisible to revenue reporting, and (2) the sync is purely manual (no cron, no automatic trigger on status change), so even qualifying orders only appear in the `externalRevenue` bridge when someone manually clicks sync.

A secondary but equally important finding: the internal adapter creates `externalRevenue` parent records but does NOT create `externalRevenueItems` line items. The income statement resolves COGS exclusively through `externalRevenueItems` + `linkedMenuProductId` -> BOM cost map. This means **internal channel COGS is always zero in the P&L**, regardless of whether orders have correct cost data. The COGS override (DA-03) must fix this pipeline gap in addition to adding the override field.

DA-03 (COGS override) and DA-04 (employee profile) are straightforward schema additions with minimal risk. DA-01 and DA-02 require careful pipeline surgery.

**Primary recommendation:** Fix the internal revenue pipeline end-to-end (DA-01/DA-02) first, including `externalRevenueItems` generation and legacy status handling. Then add COGS override (DA-03) and employee fields (DA-04) in parallel.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DA-01 | Direct sales orders flow into `externalRevenue` bridge so P&L includes all revenue sources | Revenue pipeline traced: `syncInternalOrders` action -> `getRevenueOrders` query -> `saveRevenue` mutation. Bug: legacy "Confirmed" status excluded from `REVENUE_COUNTABLE_STATUSES`. Bug: no `externalRevenueItems` created, so COGS = 0 for internal channel. Fix: add "Confirmed" + legacy terminal statuses to revenue filter, generate line items, trigger sync on status change. |
| DA-02 | Historical direct sales orders backfilled into revenue bridge for accurate past-period P&L | The existing `syncInternalOrders` supports full-scan when `sinceTimestamp` is null (first sync). A one-time backfill run with no `sinceTimestamp` will pick up all historical orders. Must also generate `externalRevenueItems` for historical orders to get COGS. |
| DA-03 | Manager can set flat COGS override per menu product that bypasses BOM calculation | Add `cogsOverride: v.optional(v.number())` to `menuProducts` schema. Modify `buildProductCOGSMap` in `costCalculator.ts` to check override first. Also needed: pass override through to `externalRevenueItems` generation for internal orders. |
| DA-04 | Employee profile includes hire date, base rate, and bank account holder name | Add 3 optional fields to `users` table. Extend `updateUser` mutation args. Add form fields to `UsersManager.tsx` edit dialog. |
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
| convex | ^1.31.7 | Backend database + real-time | Schema changes, mutations, queries |
| react | ^19.2.0 | Frontend UI | Form fields, dialogs |
| shadcn/ui | latest | UI components | Input, Label, Dialog already in use |

### Files Modified (per requirement)

| Requirement | Backend Files | Frontend Files |
|-------------|---------------|----------------|
| DA-01 | `convex/integrations/internal/config.ts`, `convex/integrations/internal/adapter.ts`, `convex/integrations/internal/queries.ts`, `convex/orders/mutations/statusUpdates.ts` | None (backend-only pipeline fix) |
| DA-02 | `convex/integrations/internal/adapter.ts` (backfill mode), `convex/externalData/mutations.ts` | None (one-time migration) |
| DA-03 | `convex/schema.ts`, `convex/menuProducts/mutations.ts`, `convex/lib/costCalculator.ts`, `convex/reports/incomeStatement.ts` | `src/components/menuProducts/ProductForm.tsx`, `src/pages/MenuProductsManager.tsx` |
| DA-04 | `convex/schema.ts`, `convex/auth/mutations.ts` | `src/pages/UsersManager.tsx` |

## Architecture Patterns

### DA-01: Revenue Pipeline Fix (Critical Path)

**Current architecture (broken):**
```
Order status changes (moveForward mutation)
    |
    v
(no automatic sync triggered)
    |
    v
Manual sync button -> syncInternalOrders action
    |
    v
getRevenueOrders query (filters by REVENUE_COUNTABLE_STATUSES)
    |-- EXCLUDES "Confirmed" legacy status
    |-- EXCLUDES legacy terminal: "CompleteShipped", "PickedUp"
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

**Target architecture (fixed):**
```
Order reaches PaymentReceived (or legacy Confirmed) status
    |
    v
moveForward mutation triggers inline revenue sync
    |-- Creates externalRevenue record
    |-- Creates externalRevenueItems (one per orderItem)
    |-- Links each item to menuProductId
    v
Income Statement reads externalRevenue + externalRevenueItems
    |-- resolveItemsCOGS finds items with linkedMenuProductId
    |-- cogsMap lookup works (or cogsOverride if set)
    v
Accurate revenue AND COGS for internal channel
```

**Key design decision: Inline sync vs. scheduled action** [VERIFIED: codebase analysis]

The current `syncInternalOrders` is an action (runs outside transaction). For real-time accuracy, the fix should create revenue records **inline within the `moveForward` mutation** when an order reaches `PaymentReceived`. This eliminates the sync gap entirely. The action can be kept as a safety net for backfill/re-sync.

**REVENUE_COUNTABLE_STATUSES must include legacy statuses:**
```typescript
// convex/integrations/internal/config.ts
export const REVENUE_COUNTABLE_STATUSES = [
  "PaymentReceived",
  "BeingPrepared",
  "AwaitingDelivery",
  "Complete",
  // Legacy statuses (unmigrated orders that have completed payment)
  "Confirmed",
  "InProduction",
  "Boxed",
  "Labeled",
  "Packaging",
  "WaitingShipment",
  "WaitingPickup",
  "CompleteShipped",
  "PickedUp",
] as const;
```
[VERIFIED: Schema at line 204 shows "Confirmed" is still a valid status literal. `getRevenueOrders` at line 37 filters by this array.]

### DA-01/DA-02: externalRevenueItems Generation for Internal Orders

**Current gap:** `syncInternalOrders` creates `externalRevenue` but NOT `externalRevenueItems`. The income statement's `resolveItemsCOGS` (line 133-186 of `incomeStatement.ts`) iterates `externalRevenueItems` to compute per-product COGS. Without items, COGS is always zero.

**Fix pattern:**
```typescript
// After creating/upserting the externalRevenue record for an internal order,
// fetch orderItems and create externalRevenueItems:
const orderItems = await ctx.db
  .query("orderItems")
  .withIndex("by_order", (q) => q.eq("orderId", orderId))
  .filter((q) => q.neq(q.field("isCancelled"), true))
  .collect();

for (const item of orderItems) {
  await ctx.db.insert("externalRevenueItems", {
    revenueId: revenueRecordId,
    source: "internal",
    externalItemId: `${orderNumber}-${item._id}`,
    productName: item.productName,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    totalPrice: item.lineTotal,
    linkedMenuProductId: item.menuProductId,
    isAutoMatched: true,
    matchConfidence: item.menuProductId ? "exact" : "none",
    createdAt: Date.now(),
  });
}
```
[VERIFIED: `externalRevenueItems` schema at line 1128-1149. `saveRevenueItems` mutation at line 507.]

### DA-03: COGS Override Architecture

**Schema change:**
```typescript
// In menuProducts table definition (convex/schema.ts line 93)
menuProducts: defineTable({
  // ... existing fields ...
  cogsOverride: v.optional(v.number()), // Flat COGS override in IDR, bypasses BOM
})
```

**Cost calculator change** in `buildProductCOGSMap` (`convex/lib/costCalculator.ts` line 148):
```typescript
export function buildProductCOGSMap(
  bomComponents: Array<{ menuProductId: string; componentTypeId: string; quantity: number }>,
  componentTypes: Array<{ _id: string; unitCostIdr: number; category: string }>,
  menuProducts?: Array<{ _id: string; cogsOverride?: number }> // NEW param
): Map<string, { production: number; packaging: number; total: number }> {
  // Build override lookup
  const overrideMap = new Map<string, number>();
  if (menuProducts) {
    for (const mp of menuProducts) {
      if (mp.cogsOverride !== undefined && mp.cogsOverride !== null) {
        overrideMap.set(mp._id, mp.cogsOverride);
      }
    }
  }

  // ... existing BOM aggregation ...
  // After building result map, apply overrides:
  for (const [productId, override] of overrideMap) {
    result.set(productId, {
      production: override, // Override replaces entire COGS
      packaging: 0,
      total: override,
    });
  }

  return result;
}
```
[VERIFIED: `buildProductCOGSMap` at line 148, called at line 661 of `incomeStatement.ts`]

**Income statement caller change** (`convex/reports/incomeStatement.ts` line 661):
```typescript
// Existing: allComponentTypes is already fetched. Add menuProducts fetch.
const menuProductsList = await ctx.db.query("menuProducts").collect();

const cogsMap = buildProductCOGSMap(
  bomComponents.map(c => ({ ... })),
  activeComponentTypes.map(ct => ({ ... })),
  menuProductsList.map(mp => ({
    _id: mp._id as string,
    cogsOverride: mp.cogsOverride,
  }))
);
```

**UI integration:** Add a "COGS Override" input field in `ProductForm.tsx`. When set, display it prominently in the `MenuProductsManager.tsx` product card alongside the BOM-calculated COGS, with a badge indicating "Override active". The field should be clearable (set to undefined) to revert to BOM calculation.

### DA-04: Employee Profile Extension

**Schema change** (add to `users` table, `convex/schema.ts` line 460):
```typescript
// After bankName field:
hireDate: v.optional(v.number()),           // Timestamp of hire date
baseRate: v.optional(v.number()),           // Monthly base rate in IDR
bankAccountHolderName: v.optional(v.string()), // Bank account holder name
```

**Mutation change** (`convex/auth/mutations.ts` line 188, `updateUser`):
```typescript
// Add to args:
hireDate: v.optional(v.number()),
baseRate: v.optional(v.number()),
bankAccountHolderName: v.optional(v.string()),
```

**UI change:** Add three fields to the edit user dialog in `UsersManager.tsx`:
- Date picker for hire date
- Number input for base rate (formatted as currency)
- Text input for bank account holder name

Pattern matches existing bank detail fields (`bankAccountNumber`, `bankName`) which are already on the schema but not in the UsersManager edit dialog -- they use a separate self-service `updateBankDetails` mutation. The new fields should be admin-editable through `updateUser`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Revenue sync scheduling | Custom cron/polling system | Inline mutation trigger in `moveForward` | Revenue accuracy must be real-time, not batched. The existing action is a safety net, not the primary path. |
| COGS calculation per-item | Custom cost lookup per order item | Extend existing `buildProductCOGSMap` with override parameter | Already handles BOM resolution, production/packaging split, and inactive component filtering. |
| Date picker component | Custom date input | shadcn/ui `Input type="date"` or existing Popover+Calendar | Project already uses shadcn/ui primitives. |

## Common Pitfalls

### Pitfall 1: Forgetting externalRevenueItems for Internal Channel
**What goes wrong:** Revenue records sync correctly but COGS shows as zero in the income statement.
**Why it happens:** The income statement resolves COGS through `externalRevenueItems` with `linkedMenuProductId`, not through the `costOfGoods` field on `externalRevenue`. The internal adapter only creates parent records.
**How to avoid:** Always create `externalRevenueItems` alongside `externalRevenue` for internal orders. Each `orderItem` becomes one `externalRevenueItem` with `linkedMenuProductId` set.
**Warning signs:** Internal channel shows revenue but zero COGS in P&L.

### Pitfall 2: Legacy "Confirmed" Status Not in Revenue Filter
**What goes wrong:** Orders with legacy "Confirmed" status (like Bali order 0330-002) never appear in revenue.
**Why it happens:** Phase 14 renamed "Confirmed" to "PaymentReceived" but some orders were never migrated. `REVENUE_COUNTABLE_STATUSES` only includes new status names.
**How to avoid:** Add all legacy post-payment statuses to `REVENUE_COUNTABLE_STATUSES`.
**Warning signs:** Orders visible in Order Manager but missing from Sales Analytics and Income Statement.

### Pitfall 3: Incremental Sync Missing Historical Orders
**What goes wrong:** Running `syncInternalOrders` after the fix only picks up recent orders, not historical ones.
**Why it happens:** Incremental sync uses `sinceTimestamp` (last successful sync time minus 24h buffer). Historical orders created before the first successful sync are never re-scanned.
**How to avoid:** DA-02 requires a one-time full backfill. Either (a) delete the existing `internal` sync log entries to force a full scan, or (b) add a `forceFullSync` parameter to `syncInternalOrders`.
**Warning signs:** Recent direct sales appear in P&L but older ones don't.

### Pitfall 4: COGS Override Not Propagated to Revenue Items
**What goes wrong:** Setting a COGS override on a menu product doesn't affect existing `externalRevenueItems` that were created before the override.
**Why it happens:** COGS is resolved at P&L query time from BOM (or override), not stored on revenue items. This is actually correct -- the override applies retroactively because `buildProductCOGSMap` is called fresh on each income statement query.
**How to avoid:** No action needed -- the current architecture is correct for this. Just ensure `buildProductCOGSMap` checks overrides.
**Warning signs:** None -- this works correctly by design.

### Pitfall 5: Duplicate Revenue on Re-sync
**What goes wrong:** Running sync again creates duplicate revenue entries.
**Why it happens:** Missing dedup logic.
**How to avoid:** The existing `saveRevenue` mutation already deduplicates by `(source, externalTransactionId)` using the `by_source_txn` index. For inline sync, use the same dedup: check if `externalRevenue` with `source="internal"` and `externalTransactionId=orderNumber` already exists before inserting.
**Warning signs:** Revenue doubling after manual sync.

### Pitfall 6: Schema Field Addition on Large Table
**What goes wrong:** Adding fields to `menuProducts` or `users` fails or causes issues.
**Why it happens:** N/A -- Convex handles optional field additions gracefully. Existing documents simply don't have the field (reads as undefined).
**How to avoid:** Always use `v.optional()` for new fields. No migration needed.
**Warning signs:** None.

## Code Examples

### Inline Revenue Sync on Status Change
```typescript
// convex/orders/mutations/statusUpdates.ts - inside moveForward handler
// After setting confirmedAt and before audit trail:
if (nextStatus === "PaymentReceived" || autoExpedited) {
  // Sync to externalRevenue bridge inline
  await syncOrderToRevenueBridge(ctx, args.orderId, order);
}

// New helper function:
async function syncOrderToRevenueBridge(
  ctx: MutationCtx,
  orderId: Id<"orders">,
  order: Doc<"orders">
) {
  const revenueDate = order.confirmedAt ?? order.orderDate;

  // Check for existing revenue record (dedup)
  const existing = await ctx.db
    .query("externalRevenue")
    .withIndex("by_source_txn", (q) =>
      q.eq("source", "internal").eq("externalTransactionId", order.orderNumber)
    )
    .unique();

  let revenueId: Id<"externalRevenue">;
  if (existing) {
    // Update existing
    await ctx.db.patch(existing._id, {
      revenueGross: order.totalAmount,
      revenueNet: order.finalTotal ?? order.totalAmount,
      costOfGoods: order.totalCost,
      periodStart: revenueDate,
      periodEnd: revenueDate,
      transactionDate: revenueDate,
    });
    revenueId = existing._id;
  } else {
    // Insert new
    revenueId = await ctx.db.insert("externalRevenue", {
      source: "internal",
      productName: `Order ${order.orderNumber}`,
      quantitySold: 0, // Will be set from items
      transactionCount: 1,
      revenueGross: order.totalAmount,
      revenueNet: order.finalTotal ?? order.totalAmount,
      costOfGoods: order.totalCost,
      periodStart: revenueDate,
      periodEnd: revenueDate,
      transactionDate: revenueDate,
      transactionType: "sales",
      externalTransactionId: order.orderNumber,
      dataOrigin: "db_query",
      confidence: "exact",
    });
  }

  // Create/refresh revenue items from order items
  const orderItems = await ctx.db
    .query("orderItems")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .filter((q) => q.neq(q.field("isCancelled"), true))
    .collect();

  // Delete existing items for this revenue record (idempotent refresh)
  const existingItems = await ctx.db
    .query("externalRevenueItems")
    .withIndex("by_revenue", (q) => q.eq("revenueId", revenueId))
    .collect();
  for (const item of existingItems) {
    await ctx.db.delete(item._id);
  }

  let totalQuantity = 0;
  for (const item of orderItems) {
    totalQuantity += item.quantity;
    await ctx.db.insert("externalRevenueItems", {
      revenueId,
      source: "internal",
      externalItemId: `${order.orderNumber}-${item._id}`,
      productName: item.productName,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      totalPrice: item.lineTotal,
      linkedMenuProductId: item.menuProductId,
      isAutoMatched: true,
      matchConfidence: item.menuProductId ? "exact" : "none",
      createdAt: Date.now(),
    });
  }

  // Update quantity on parent record
  await ctx.db.patch(revenueId, { quantitySold: totalQuantity });
}
```
[VERIFIED: Based on existing `saveRevenue` pattern at line 85 of `externalData/mutations.ts` and `externalRevenueItems` schema at line 1128]

### COGS Override on MenuProducts
```typescript
// convex/menuProducts/mutations.ts - update mutation args addition:
cogsOverride: v.optional(v.number()), // IDR per unit, or undefined to use BOM

// In handler, add to patchData:
if (args.cogsOverride !== undefined) {
  patchData.cogsOverride = args.cogsOverride || undefined; // 0 clears it
}
```

### Employee Profile Fields
```typescript
// convex/auth/mutations.ts - updateUser args addition:
hireDate: v.optional(v.number()),
baseRate: v.optional(v.number()),
bankAccountHolderName: v.optional(v.string()),

// In handler, add to filteredUpdates processing.
// Follows same pattern as existing name/role/avatarUrl.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual `syncInternalOrders` action | Inline revenue sync on status transition | Phase 70 (this phase) | Revenue appears in real-time, no manual sync needed |
| `externalRevenue.costOfGoods` for COGS | `externalRevenueItems` with `linkedMenuProductId` -> BOM lookup | Phase 20 (existing) | Per-product COGS resolution with confidence classification |
| BOM-only COGS | BOM + `cogsOverride` field | Phase 70 (this phase) | Allows manual correction when BOM is incomplete |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Bali order 0330-002 is stuck at legacy "Confirmed" status (not new "PaymentReceived") | DA-01 Architecture | If it's actually at "PaymentReceived" and still missing, the bug is in the sync action trigger, not the status filter. Both fixes are needed anyway. |
| A2 | No orders exist with legacy terminal statuses ("CompleteShipped", "PickedUp") that have never been synced | DA-02 Backfill | If such orders exist, adding these statuses to the filter ensures they are captured. Low risk -- the fix includes them. |
| A3 | `menuProducts` table has fewer than 100 products | DA-03 Performance | If much larger, the full table scan in `buildProductCOGSMap` is still acceptable since Convex handles it efficiently and it's already done for all component types. |

## Open Questions

1. **How many orders have legacy "Confirmed" status?**
   - What we know: Schema allows it, the Bali order 0330-002 is reportedly stuck there
   - What's unclear: Exact count of affected orders
   - Recommendation: Run a count query during implementation. If many, may need batch backfill. Can be determined at implementation time -- does not block planning.

2. **Should the manual `syncInternalOrders` action be removed or kept?**
   - What we know: With inline sync, the action becomes redundant for new orders
   - What's unclear: Whether there's value in keeping it as a re-sync/repair tool
   - Recommendation: Keep it but refactor to also generate `externalRevenueItems`. Useful as a "repair" tool and for DA-02 backfill.

3. **Should `cogsOverride` apply to `orderItems.unitCost` snapshot?**
   - What we know: `orderItems.unitCost` is a snapshot at creation time from `menuProducts.unitCost` (BOM). The income statement uses BOM lookup, not this snapshot.
   - What's unclear: Whether order-level cost display should also use the override
   - Recommendation: Do NOT change `orderItems.unitCost` snapshotting. The override only affects P&L (via `buildProductCOGSMap`). This keeps order-level data as a historical record of what the BOM said at creation time.

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
| DA-01 | Internal orders create externalRevenue + items on status change | unit | `npx vitest run convex/integrations/internal/ -x` | Wave 0 |
| DA-01 | Legacy "Confirmed" status included in revenue filter | unit | `npx vitest run convex/integrations/internal/ -x` | Wave 0 |
| DA-02 | Full backfill creates revenue records for all qualifying historical orders | unit | `npx vitest run convex/integrations/internal/ -x` | Wave 0 |
| DA-03 | COGS override bypasses BOM in buildProductCOGSMap | unit | `npx vitest run convex/lib/costCalculator -x` | Existing (extend) |
| DA-03 | Income statement uses override when set | unit | `npx vitest run convex/reports/ -x` | Wave 0 |
| DA-04 | updateUser mutation accepts new fields | unit | `npx vitest run convex/auth/ -x` | Wave 0 |

### Wave 0 Gaps
- [ ] `convex/integrations/internal/__tests__/adapter.test.ts` -- covers DA-01, DA-02 revenue sync
- [ ] `convex/lib/__tests__/costCalculator.test.ts` -- extend existing tests for DA-03 override
- [ ] Test for `syncOrderToRevenueBridge` helper (inline sync function)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Existing PIN auth unchanged |
| V3 Session Management | no | Existing session tokens unchanged |
| V4 Access Control | yes | `requireRole(ctx, args.token, ["admin"])` for COGS override and employee profile edits |
| V5 Input Validation | yes | Convex validators (`v.number()`, `v.string()`, `v.optional()`) on all new fields |
| V6 Cryptography | no | No crypto operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized COGS override | Elevation of Privilege | `requireRole` admin-only on menuProducts.update |
| Salary/bank data exposure | Information Disclosure | `requireRole` admin-only on updateUser; existing `listUsers` query already returns bank fields to admin |
| Revenue manipulation via direct DB writes | Tampering | `internalMutation` for saveRevenue (not callable from client); inline sync uses server-side data only |

## Sources

### Primary (HIGH confidence)
- `convex/integrations/internal/config.ts` -- REVENUE_COUNTABLE_STATUSES definition (line 9-14)
- `convex/integrations/internal/adapter.ts` -- syncInternalOrders action (line 33-154)
- `convex/integrations/internal/queries.ts` -- getRevenueOrders filter logic (line 16-40)
- `convex/orders/helpers/statusTransitions.ts` -- ALL_ORDER_STATUSES, FORWARD_TRANSITIONS (line 15-47)
- `convex/schema.ts` -- orders status union with legacy "Confirmed" at line 204
- `convex/reports/incomeStatement.ts` -- resolveItemsCOGS at line 133, aggregateWeek at line 197, COGS resolution at line 298-308
- `convex/lib/costCalculator.ts` -- buildProductCOGSMap at line 148
- `convex/externalData/mutations.ts` -- saveRevenue dedup at line 85, saveRevenueItems at line 507
- `convex/menuProducts/mutations.ts` -- update mutation at line 218
- `convex/auth/mutations.ts` -- updateUser at line 188, updateBankDetails at line 356
- `convex/crons.ts` -- confirms NO scheduled jobs (empty)

### Secondary (MEDIUM confidence)
- `.planning/research/FEATURES.md` -- feature research with complexity estimates and architecture analysis

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all existing Convex patterns
- Architecture (DA-01/DA-02): HIGH -- traced full pipeline end-to-end, identified exact bug locations
- Architecture (DA-03): HIGH -- traced COGS resolution through costCalculator and incomeStatement
- Architecture (DA-04): HIGH -- simple schema + mutation + UI extension
- Pitfalls: HIGH -- identified from actual codebase analysis, not assumptions

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable -- no external dependencies, all internal codebase)
