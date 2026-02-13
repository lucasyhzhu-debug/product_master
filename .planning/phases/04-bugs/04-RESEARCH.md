# Phase 4: Quick Fixes -- Bugs - Research

**Researched:** 2026-02-13
**Domain:** Bug fixes (shortage dialog UX, TODO resolution, cost invalidation schedulers)
**Confidence:** HIGH

## Summary

This phase has two requirements: BUG-01 (stock shortage override dialog) and BUG-02 (TODO resolution). The codebase is well-understood -- all affected files have been inspected, the root cause of the shortage dialog bug is confirmed, and the cost invalidation pattern is clear from existing Convex scheduler usage in the codebase.

The shortage dialog bug is a **language mismatch**: the backend throws an error message in Indonesian (`Stok kemasan tidak cukup:\n...need X, have Y (short Z)...`) and the frontend catches it correctly, but then filters detail lines with `.filter(line => line.includes('need '))` which actually works because the detail lines ARE in English. The real display issue is that the dialog title, helper text, and buttons are all in Indonesian, and the role restriction is `manager`/`admin` only -- decisions say all order-access roles should override and the dialog needs a reason field with audit trail.

The TODO resolution splits into three strategies: (1) K3MartCockpit TODOs become backlog issues, (2) cost invalidation TODOs get implemented as real Convex schedulers, (3) OrderDetail production query TODO gets implemented as a dedicated query.

**Primary recommendation:** Split into two plans -- BUG-01 for the shortage dialog (backend args + schema + frontend dialog rewrite) and BUG-02 for TODO resolution (cost invalidation implementation + OrderDetail query + backlog conversion).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Shortage Dialog Design
- Show items + impact summary (e.g., "Order cannot be fully packaged. 2 of 5 packaging items have insufficient stock")
- Each short item shows: item name, needed qty, available qty, deficit
- All dialog text in English (replace current Indonesian "Stok kemasan tidak cukup" messaging)
- Fix the bug where shortage details don't display (current filter uses `line.includes('need ')` which doesn't match Indonesian error text)
- Keep amber/caution visual tone (not red/danger) -- current styling is appropriate
- Override requires a reason: manager must type a short reason before override button is enabled

#### Override Behavior
- All order-access roles can override (order_staff, manager, admin) -- expanded from current manager+admin restriction
- Override logged with full audit trail: who overrode, when, reason entered, which items were short
- Log visible in two places: (1) order detail page as an event, (2) indicator on order card/row with tooltip showing override details
- After override, inventory left as-is -- no auto-adjustment, someone must manually restock or adjust later

#### TODO Resolution Strategy
- **K3MartCockpit TODOs (7):** Convert to tracked backlog issues -- these reference unbuilt features (dispatch plans, stock movements, bump approval)
- **Cost invalidation TODOs (2):** Actually implement the background job schedulers for ingredients and materials cost invalidation
- **OrderDetail production query TODO (1):** Actually implement the dedicated query to fetch orderItemProduction records (currently returns [])

### Claude's Discretion
- Exact override reason input UI (text field, textarea, dropdown of common reasons)
- Override indicator design on order cards (badge, icon, subtle marker)
- Cost invalidation scheduler implementation details (frequency, scope)
- Backlog issue tracking location and format

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

No new libraries needed. All work uses existing stack.

### Core
| Library | Version | Purpose | Already Installed |
|---------|---------|---------|-------------------|
| Convex | ^1.31.7 | Backend mutations, queries, scheduler | Yes |
| React | ^19.2.0 | Frontend UI | Yes |
| shadcn/ui | latest | Dialog, Button, Textarea, Badge, Tooltip | Yes |
| Lucide React | latest | Icons (AlertTriangle, ShieldAlert, etc.) | Yes |

### Supporting (already present)
| Library | Purpose | Relevant Usage |
|---------|---------|----------------|
| `convex/values` | `ConvexError` for typed error throwing | Shortage error in inventoryIntegration.ts |
| `framer-motion` | Animations on OrderManager cards | Already used for order cards |
| `sonner` | Toast notifications | Already used throughout |

**No installation needed.**

## Architecture Patterns

### Pattern 1: Shortage Dialog Data Flow (Current - Buggy)

**Current flow:**
1. Frontend calls `updateStatus({ orderId, status: "Confirmed" })`
2. Backend `statusUpdates.ts:updateStatus` calls `reserveStockForOrderInternal()`
3. `inventoryIntegration.ts:reserveStockForOrderInternal()` detects shortages
4. Throws `ConvexError("Stok kemasan tidak cukup:\n${details}\n\nManager dapat override...")`
5. Frontend catches error, checks `error.data.includes('Stok kemasan tidak cukup')`
6. Shows dialog with `stockShortageMessage.split('\n').filter(line => line.includes('need '))`
7. User clicks Override, frontend calls `handleStatusChange('Confirmed', true)` (skipStockCheck=true)
8. Backend succeeds (skips stock check), no audit trail logged

**Problems identified:**
- Dialog title and text in Indonesian
- Role check is `hasRole('manager', 'admin')` -- should include `order_staff`
- No reason input field
- No audit trail when override occurs
- The `skipStockCheck=true` silently bypasses -- no record of WHO overrode or WHY
- Shortage details ARE parsed correctly (the `line.includes('need ')` filter does work because detail lines use English format `ComponentName: need X, have Y (short Z)`)

### Pattern 2: Shortage Dialog Data Flow (Fixed)

**Proposed flow:**
1. Frontend calls `updateStatus({ orderId, status: "Confirmed" })`
2. Same backend path, but error message changed to English
3. Frontend catches error, shows redesigned dialog with structured shortage info
4. User types reason, clicks Override
5. Frontend calls `updateStatus({ orderId, status: "Confirmed", skipStockCheck: true, overrideReason: "...", overrideBy: "..." })`
6. Backend confirms order with `skipStockCheck`, then logs `orderEvent` with type `"stock_override"` containing shortage details and reason
7. Audit trail is queryable from order detail page and visible as indicator on order cards

### Pattern 3: OrderEvent Audit Trail (Existing Pattern)

The codebase already has a robust audit event system:

```typescript
// convex/orders/helpers/statusTransitions.ts
export async function logOrderEvent(
  ctx: MutationCtx,
  orderId: Id<"orders">,
  eventType: string,
  options: LogOrderEventOptions = {}
): Promise<Id<"orderEvents">> {
  return await ctx.db.insert("orderEvents", {
    orderId,
    eventType,
    fromStatus: options.fromStatus,
    toStatus: options.toStatus,
    reason: options.reason,
    category: options.category,
    metadata: options.metadata ? JSON.stringify(options.metadata) : undefined,
    timestamp: Date.now(),
    triggeredBy: options.triggeredBy ?? "system",
  });
}
```

**Key insight:** The `metadata` field accepts `Record<string, unknown>` (serialized to JSON string). This can store shortage details without schema changes. Use `eventType: "stock_override"` to distinguish override events.

### Pattern 4: Convex Scheduler for Cost Invalidation (Existing Pattern)

The codebase already uses `ctx.scheduler.runAfter()` in other places:

```typescript
// crons.ts uses internal functions:
import { internal } from "./_generated/api";
crons.interval("refresh k3mart token", { hours: 12 }, internal.platformCredentials.actions.refreshK3MartTokenCron);

// Pattern for scheduled mutation:
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
// In the calling mutation:
await ctx.scheduler.runAfter(0, internal.cost.invalidateRecipeCosts, { ingredientId: id });
```

### Pattern 5: OrderDetail Production Query (Dedicated Query)

The `getProductionUnits()` helper in OrderDetail.tsx currently returns `[]`. The data lives in `orderItemProduction` table, indexed by `orderItemId`. The kitchen queries (`getKitchenOrders`) already batch-fetch these records -- we need a simpler per-order query.

```typescript
// Pattern from orders/queries.ts:get - extends to include production
const productionRecords = await ctx.db
  .query("orderItemProduction")
  .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
  .collect();
```

### Anti-Patterns to Avoid
- **Parsing error messages for structured data:** The current pattern of throwing a formatted string and parsing it on the frontend is fragile. However, changing the error structure would require a more complex change. For this phase, we keep the ConvexError string approach but make the language consistent (all English) and add the audit trail separately in the backend.
- **Schema changes to orders table for override tracking:** Don't add `stockOverrideReason` to the orders table. Use the existing `orderEvents` table -- that's exactly what it's for.
- **Running cost recalculation synchronously in ingredient update:** Use `scheduler.runAfter(0, ...)` to decouple the cost recalculation from the ingredient save. This prevents the mutation from taking too long.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Audit trail storage | New audit table | Existing `orderEvents` table with `eventType: "stock_override"` | Already has indexes, write helpers, and schema |
| Background job scheduling | Custom job queue | `ctx.scheduler.runAfter(0, internal.module.fn)` | Convex built-in, guaranteed execution |
| Toast notifications | Custom notification system | Existing `sonner` via `toast.success/error` | Already used throughout |
| Tooltip UI | Custom tooltip | `@/components/ui/tooltip` (shadcn Tooltip) | Already installed |

**Key insight:** The existing `orderEvents` table + `logOrderEvent` helper is the right place for override audit data. No new tables needed.

## Common Pitfalls

### Pitfall 1: ConvexError Data Type
**What goes wrong:** `ConvexError` can hold any serializable data, but the current code checks `typeof error.data === 'string'`. If we change the error to throw structured data (object), the existing catch block won't match.
**Why it happens:** The catch block in OrderDetail.tsx line 124 specifically checks for string type.
**How to avoid:** Keep throwing a string from ConvexError for backward compatibility, but change the text to English. The structured shortage data for audit goes through the `overrideReason` + `metadata` path instead.
**Warning signs:** Dialog stops appearing after backend changes.

### Pitfall 2: updateStatus Mutation Has No Auth Token
**What goes wrong:** The `updateStatus` mutation does not accept a `token` arg, so it cannot resolve who is performing the override.
**Why it happens:** Many order mutations were built without token-based auth enforcement.
**How to avoid:** Add optional `overrideBy` arg to the mutation (passed from frontend's `useAuth().user.name`). The frontend already has the user context.
**Warning signs:** Audit events with empty `triggeredBy`.

### Pitfall 3: Cost Invalidation Module Path
**What goes wrong:** The commented-out code references `internal.cost.invalidateRecipeCosts` but no `convex/cost/` module exists.
**Why it happens:** The TODO was written as aspirational code.
**How to avoid:** Create `convex/lib/costInvalidation.ts` with `internalMutation` exports. Reference via `internal.lib.costInvalidation.invalidateRecipeCosts`.
**Warning signs:** TypeScript errors on `internal.cost.*` references.

### Pitfall 4: Cost Recalculation Scope
**What goes wrong:** When ingredient cost changes, ALL recipe versions using that ingredient need cost recalculation. This is a fan-out problem.
**Why it happens:** `componentIngredients` has index `by_ingredient` which maps ingredient -> recipe components -> recipe versions.
**How to avoid:** The invalidation mutation should: (1) query `componentIngredients` by ingredient, (2) get parent `recipeComponents`, (3) get parent `recipeVersions`, (4) recalculate each version's cost. Same for packaging materials.
**Warning signs:** Stale cached costs after ingredient price changes.

### Pitfall 5: OrderDetail getProductionUnits Returns Empty Array
**What goes wrong:** The `getProductionUnits()` function always returns `[]`, making the ProductionProgress component show nothing.
**Why it happens:** The function was deprecated but never replaced with a query.
**How to avoid:** Create a new backend query `getOrderProductionRecords` that joins `orderItems` -> `orderItemProduction` for a single order. Or extend the existing `orders.queries.get` to include production records.
**Warning signs:** ProductionProgress component shows empty state even when production data exists.

### Pitfall 6: K3MartCockpit TODOs Are Placeholders, Not Bugs
**What goes wrong:** Attempting to "fix" K3MartCockpit TODOs by implementing the features.
**Why it happens:** The TODOs reference unbuilt features (dispatch plans, stock movements, bump approval).
**How to avoid:** Per user decision, convert these to tracked backlog issues. Do NOT implement the features.
**Warning signs:** Scope creep into building K3Mart features.

## Code Examples

### Example 1: Enhanced updateStatus Mutation Args (Backend)

```typescript
// convex/orders/mutations/statusUpdates.ts
export const updateStatus = mutation({
  args: {
    orderId: v.id("orders"),
    status: statusValidator,
    locationId: v.optional(v.id("storageLocations")),
    skipStockCheck: v.optional(v.boolean()),
    // NEW: Override audit fields
    overrideReason: v.optional(v.string()),
    overrideBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // ... existing logic ...

    // After successful stock reservation with skipStockCheck:
    if (newStatus === "Confirmed" && args.skipStockCheck) {
      // Get shortage info for audit (re-check without skip)
      const { shortages } = await checkStockAvailability(ctx, args.orderId);

      await logOrderEvent(ctx, args.orderId, "stock_override", {
        fromStatus: oldStatus,
        toStatus: newStatus,
        reason: args.overrideReason ?? "No reason provided",
        metadata: {
          shortages: shortages.map(s => ({
            componentName: s.componentName,
            requested: s.requested,
            available: s.available,
            shortage: s.shortage,
          })),
        },
        triggeredBy: args.overrideBy ?? "system",
      });
    }
  },
});
```

### Example 2: Redesigned Shortage Dialog (Frontend)

```tsx
// Key changes to OrderDetail.tsx shortage dialog
<Dialog open={!!stockShortageMessage} onOpenChange={(open) => !open && setStockShortageMessage(null)}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2 text-amber-600">
        <AlertTriangle className="h-5 w-5" />
        Insufficient Packaging Stock
      </DialogTitle>
      <DialogDescription>
        Order cannot be fully packaged. {shortageCount} of {totalCount} packaging items have insufficient stock.
      </DialogDescription>
    </DialogHeader>
    <div className="space-y-3 py-2">
      {/* Structured shortage items */}
      {shortageItems.map((item, i) => (
        <div key={i} className="flex items-start gap-2 bg-amber-50 rounded-lg px-3 py-2 text-sm">
          <Package className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-medium text-amber-900">{item.name}</span>
            <span className="text-amber-700 ml-2">
              Need {item.requested}, have {item.available} (short {item.shortage})
            </span>
          </div>
        </div>
      ))}
      {/* Override reason (required) */}
      {canOverride && (
        <div className="space-y-2 pt-2">
          <Label htmlFor="override-reason">Reason for override *</Label>
          <Textarea
            id="override-reason"
            placeholder="Why are you proceeding despite insufficient stock?"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            className="min-h-[60px]"
          />
        </div>
      )}
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setStockShortageMessage(null)}>
        Cancel
      </Button>
      {canOverride && (
        <Button
          variant="default"
          className="bg-amber-600 hover:bg-amber-700"
          disabled={overrideReason.trim().length < 5}
          onClick={() => handleOverrideConfirm()}
        >
          Override & Confirm
        </Button>
      )}
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Example 3: Cost Invalidation Internal Mutation

```typescript
// convex/lib/costInvalidation.ts
import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { calculateLineCost } from "./costCalculator";

/**
 * Invalidate and recalculate recipe costs when an ingredient's cost changes.
 * Scheduled via ctx.scheduler.runAfter(0, ...) from ingredients/mutations.ts
 */
export const invalidateRecipeCosts = internalMutation({
  args: { ingredientId: v.id("ingredients") },
  handler: async (ctx, args) => {
    const ingredient = await ctx.db.get(args.ingredientId);
    if (!ingredient) return;

    // Find all componentIngredients using this ingredient
    const usages = await ctx.db
      .query("componentIngredients")
      .withIndex("by_ingredient", (q) => q.eq("ingredientId", args.ingredientId))
      .collect();

    // Get unique recipe version IDs affected
    const affectedComponentIds = new Set(usages.map(u => u.recipeComponentId));

    for (const componentId of affectedComponentIds) {
      const component = await ctx.db.get(componentId);
      if (!component) continue;

      // Recalculate component subtotal
      const ingredients = await ctx.db
        .query("componentIngredients")
        .withIndex("by_component", (q) => q.eq("recipeComponentId", componentId))
        .collect();

      let subtotal = 0;
      for (const ing of ingredients) {
        const ingDoc = await ctx.db.get(ing.ingredientId);
        if (ingDoc?.costPerBaseUnit != null) {
          const lineCost = calculateLineCost(ingDoc.costPerBaseUnit, ingDoc.baseUnit ?? "g", ing.quantity, ing.unit);
          await ctx.db.patch(ing._id, { cachedLineCost: lineCost });
          subtotal += lineCost;
        }
      }

      await ctx.db.patch(componentId, { cachedSubtotalCost: subtotal });

      // Recalculate parent recipe version total
      // ... (sum all components, update cachedTotalCost + cachedCostPerGram)
    }
  },
});
```

### Example 4: Calling Cost Invalidation from Ingredient Update

```typescript
// convex/ingredients/mutations.ts (line 96-97 replacement)
import { internal } from "../_generated/api";

// Replace commented-out code with:
await ctx.scheduler.runAfter(0, internal.lib.costInvalidation.invalidateRecipeCosts, {
  ingredientId: id,
});
```

### Example 5: Order Production Records Query

```typescript
// Add to convex/orders/queries.ts
export const getOrderProductionRecords = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    const records = [];
    for (const item of items) {
      const production = await ctx.db
        .query("orderItemProduction")
        .withIndex("by_order_item", (q) => q.eq("orderItemId", item._id))
        .collect();
      records.push(...production);
    }
    return records;
  },
});
```

## Detailed File Analysis

### BUG-01: Stock Shortage Override Dialog

**Files to modify:**

| File | Change | Confidence |
|------|--------|------------|
| `convex/orders/mutations/inventoryIntegration.ts:284-286` | Change error message from Indonesian to English | HIGH |
| `convex/orders/mutations/statusUpdates.ts:62-67` | Add `overrideReason` and `overrideBy` args | HIGH |
| `convex/orders/mutations/statusUpdates.ts:97-109` | Add audit logging when `skipStockCheck` is used | HIGH |
| `src/pages/OrderDetail.tsx:101` | Add `overrideReason` state | HIGH |
| `src/pages/OrderDetail.tsx:111-128` | Update `handleStatusChange` to pass override data | HIGH |
| `src/pages/OrderDetail.tsx:673-717` | Rewrite shortage dialog (English, reason field, role fix) | HIGH |
| `src/hooks/convex/useOrders.ts:406-420` | Update `useConvexUpdateOrderStatus` type to include new args | HIGH |
| `convex/orders/queries.ts` | Add `getOrderEvents` query (for displaying audit trail) | HIGH |
| `src/pages/OrderDetail.tsx` | Add override event display section | MEDIUM |
| `src/pages/OrderManager.tsx:42-120` | Add override indicator on order cards | MEDIUM |

**Schema considerations:** No schema changes needed. The `orderEvents` table already has all required fields. The `metadata` field (JSON string) can hold shortage details.

### BUG-02: TODO Resolution

**K3MartCockpit TODOs (7 items) -- convert to backlog:**

| Line | TODO | Backlog Item |
|------|------|--------------|
| 396 | `Get actual production target` | K3MART-01: Wire production readiness targets from backend |
| 415 | `Current query doesn't return all fields` | K3MART-02: Enhance outlet stock query with full OutletCardGrid fields |
| 432-433 | `Get from dispatch plans` (x2) | K3MART-03: Implement dispatch plan data for outlet product cards |
| 443 | `Should come from backend query` | K3MART-04: Create backend query for inventory sources/destinations |
| 458 | `Get from stock movements query` | K3MART-05: Create stock movements query for outlet grid |
| 550 | `Implement bump approval` | K3MART-06: Implement production bump approval workflow |

**Cost invalidation TODOs (2 items) -- implement:**

| File:Line | TODO | Implementation |
|-----------|------|----------------|
| `convex/ingredients/mutations.ts:96` | Schedule recipe cost invalidation | Create `convex/lib/costInvalidation.ts` with `invalidateRecipeCosts` internalMutation |
| `convex/materials/mutations.ts:95` | Schedule packaging cost invalidation | Add `invalidatePackagingCosts` internalMutation to same file |

**OrderDetail production query TODO (1 item) -- implement:**

| File:Line | TODO | Implementation |
|-----------|------|----------------|
| `src/pages/OrderDetail.tsx:731` | Create dedicated production query | Add `getOrderProductionRecords` query to `convex/orders/queries.ts`, wire up in OrderDetail |

### Backlog Tracking Location

**Recommendation:** Add K3MartCockpit backlog items to `.planning/REQUIREMENTS.md` under v2 section. This is the existing pattern for deferred work items. Create a new subsection `### K3 Mart Cockpit` under v2.

## Discretion Recommendations

### Override Reason Input UI
**Recommendation: Textarea** (not dropdown, not single-line input).
- Rationale: Reasons for stock shortage overrides are situational and varied ("supplier delayed, restock arriving tomorrow", "customer urgent, will adjust stock later"). A dropdown would be too restrictive. A single-line input may feel cramped for longer reasons.
- Min length: 5 characters (prevent empty/trivial reasons)
- Placeholder: "Why are you proceeding despite insufficient stock?"

### Override Indicator on Order Cards
**Recommendation: Small amber shield icon** (`ShieldAlert` from Lucide) next to the order number, with a Tooltip showing override details.
- Rationale: Must be visible but not alarming. The amber color matches the override dialog's caution tone. A badge would take too much space on the compact card. An icon with tooltip is unobtrusive but discoverable.
- Implementation: Query `orderEvents` for the order with `eventType: "stock_override"`, if exists show icon.

### Cost Invalidation Implementation
**Recommendation: Immediate async invalidation via `scheduler.runAfter(0, ...)`.**
- Rationale: Zero delay means "run immediately after this mutation commits." This gives near-instant cost updates without slowing down the ingredient/material save mutation.
- Scope: Walk from ingredient -> componentIngredients (by_ingredient index) -> recipeComponents -> recipeVersions. Recalculate each affected version's `cachedTotalCost` and `cachedCostPerGram`. Same pattern for materials -> packagingComponentMaterials -> packagingComponents -> packagingVersions.
- NOT a cron job. Triggered on-demand when ingredient/material cost changes.

### Backlog Issue Format
**Recommendation:** Add to `.planning/REQUIREMENTS.md` v2 section as a new `### K3 Mart Cockpit` subsection with items prefixed `K3MART-XX`.

## Open Questions

1. **Override indicator query performance**
   - What we know: `orderEvents` has `by_order` index, querying for stock_override events per order is efficient for OrderDetail. But for the OrderManager list, querying events for every visible order could be an N+1 problem.
   - What's unclear: How many orders are typically visible at once? Is a join or denormalization needed?
   - Recommendation: For v1, only show the override indicator on OrderDetail page (no N+1). If needed on the list, add a denormalized `hasStockOverride: boolean` field to orders table later. This keeps the scope manageable.

2. **Cost invalidation cascade depth**
   - What we know: Recipes can reference other recipe versions as linked components. If Recipe A uses ingredient X, and Recipe B links to Recipe A, changing ingredient X should cascade to both A and B.
   - What's unclear: Does the current codebase handle this cascade in existing recipe save mutations?
   - Recommendation: For v1, invalidate only the direct recipe versions. Cascade to linked consumers is a separate optimization (the linked version's `cachedTotalCost` will be stale but will correct when the parent recipe is next viewed/saved). Document this limitation.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `convex/orders/mutations/inventoryIntegration.ts` lines 220-287 (shortage detection and error throwing)
- Codebase inspection: `src/pages/OrderDetail.tsx` lines 101-128, 673-717 (shortage dialog UI)
- Codebase inspection: `convex/orders/helpers/statusTransitions.ts` lines 55-85 (logOrderEvent pattern)
- Codebase inspection: `convex/schema.ts` lines 671-684 (orderEvents table schema)
- Codebase inspection: `convex/ingredients/mutations.ts` lines 96-97, `convex/materials/mutations.ts` lines 95-96 (commented-out scheduler code)
- Codebase inspection: `src/pages/K3MartCockpit.tsx` lines 396-550 (all 7 TODO locations)
- Codebase inspection: `src/pages/OrderDetail.tsx` lines 726-733 (getProductionUnits deprecated function)
- Context7 `/llmstxt/convex_dev_llms_txt` - Convex scheduler.runAfter pattern, internalMutation pattern

### Secondary (MEDIUM confidence)
- Codebase inspection: `convex/orders/queries.ts` - No existing orderEvents query (confirmed by grep)
- Codebase inspection: `convex/schema.ts` lines 436-450 - orderItemProduction table structure

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries, all existing patterns
- Architecture: HIGH - Extends existing audit trail pattern (orderEvents), existing scheduler pattern
- Pitfalls: HIGH - All pitfalls verified by direct code inspection
- Cost invalidation: MEDIUM - Implementation pattern is clear from existing code, but cascade depth is an open question

**Research date:** 2026-02-13
**Valid until:** 2026-03-13 (stable domain, no external dependency changes expected)
