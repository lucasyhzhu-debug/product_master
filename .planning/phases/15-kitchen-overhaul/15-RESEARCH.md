# Phase 15: Kitchen Overhaul - Research

**Researched:** 2026-02-15
**Domain:** Kitchen dashboard UI, production targets, due-date order management, K3Mart synthetic orders
**Confidence:** HIGH

## Summary

Phase 15 adds a new dashboard summary header above the existing swipeable batch production panels in `KitchenViewV2.tsx`, replaces the current order packing flow with due-date-grouped order cards featuring per-item checklists, and introduces K3Mart synthetic order cards. The existing 4-panel swipeable layout (Production Log, Boxing, Stickering, Packing) is preserved unchanged -- the new features layer on top.

The codebase already has most of the backend infrastructure needed. Kitchen stats (`getKitchenStats`), production targets (`getProductionSummary`), order-level production tracking (`orderItemProduction`), and K3Mart kitchen summaries (`getK3MartKitchenSummary`) are all live. The primary work is: (1) a new sticky dashboard header component, (2) a new kitchen order list query with due-date grouping, (3) per-item checklist UI replacing the current packing panel's order cards, (4) "Complete Order" and "Send back to order desk" mutations, (5) K3Mart synthetic order card component, and (6) a configurable max production target system.

**Primary recommendation:** Build atop existing `useKitchenProduction` hook and `getKitchenStats` query. Add a new `kitchenConfig` document (single row, date-keyed or global) for max production target configuration. The new due-date-grouped order list should be a new query (`getKitchenOrdersByDueDate`) separate from the existing `getKitchenOrders` to avoid breaking the batch panels.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Dashboard header layout
- Sticky bar at top -- always visible while scrolling through orders, never collapsible
- 4 compact stat cards in a row (2x2 grid on mobile)
- Metrics shown: min target today, max production target, remaining balls needed, orders left to complete
- Remaining balls uses color-coded urgency: green (on track), amber (behind), red (overdue orders exist)
- Combined ball total by default; tap to see Big Ball / Mid Ball breakdown
- Gear icon in header opens popover/bottom sheet for target configuration (manager only)

#### Due-date order grouping
- Orders grouped under due-date headers: "OVERDUE", "Due Today", "Due Tomorrow", "Due Saturday", etc.
- OVERDUE section pinned at top with red styling -- impossible to miss
- EXPEDITED orders (pushed in early via Phase 14) get an orange/yellow EXPEDITED badge, pinned to top of their due-date group
- Per-item production checklist: one checkbox per menu product line (e.g., "2x Original Box" = one tick)
- Single "done" tick per product line -- no sub-steps for boxed/stickered/etc.
- Kitchen clicks "Complete Order" when all items ticked -> order moves to Awaiting Delivery (Phase 14 handles the status transition)
- "Send back to order desk" button: unclicks all packages, returns order to Payment Received in Phase 14 Kanban; won't auto-re-enter kitchen unless manually expedited again (if <=2 days to due date, the crossing event already happened)

#### K3Mart synthetic orders
- Visually distinct card style (different border/layout) -- not the same as regular order cards
- One combined K3Mart order per day (not per outlet) with outlet breakdown inside the card
- Manager can inline-edit quantity directly on the card -- tap the number to adjust
- Same checklist/tick-off flow as real orders -- kitchen marks items complete just like any order
- Auto-generated from confirmed K3Mart dispatch plans (Phase 16 creates these)

#### Target configuration
- Max production target: default 200 balls, manager-configurable via gear icon in header
- Composition set as absolute numbers (e.g., "150 Big Balls, 50 Mid Balls"), not percentages
- Min target auto-calculated from confirmed orders due today; displayed as "Min: 85 (4 orders)" -- number + order count for context
- Manager override for unavailable inventory: inline "Override" button appears next to unavailable items, manager enters reason and marks available (manager role required)

### Claude's Discretion
- Exact card styling and color scheme for K3Mart synthetic orders
- Loading skeleton design for the dashboard header
- Error state handling when target calculation fails
- Animation/transition when orders move between due-date groups
- Exact urgency thresholds for green/amber/red on remaining balls
- Gear icon popover vs bottom sheet decision based on screen size

### Deferred Ideas (OUT OF SCOPE)
- Batch production panel changes -- existing panels stay as-is, not in scope
- Historical production analytics / trends -- future phase
- Push notifications when new orders enter kitchen queue -- future consideration
</user_constraints>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^19.2.0 | UI framework | Already in use |
| Convex | ^1.31.7 | Real-time backend + DB | Already in use, real-time updates are critical for kitchen |
| Framer Motion | ^11.15.0 | Animations (swipe, transitions) | Already used for SwipeableKitchenLayout |
| Tailwind CSS | ^4.1.18 | Styling | Already in use with kitchen CSS variables |
| Lucide React | -- | Icons | Already in use (Settings/Gear icon available) |
| Sonner | -- | Toast notifications | Already in use for kitchen feedback |

### New Dependencies Required
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | ^4.1.0 | Date arithmetic, "isToday", "isTomorrow", "format" for day names | Due-date grouping headers, "Due Saturday" labels. v1.1 planning already approved this dependency. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| date-fns | Native Date + manual arithmetic | Error-prone timezone handling, more code. date-fns already approved in v1.1 planning. Use date-fns. |

**Installation:**
```bash
npm install date-fns@^4.1.0
```

## Architecture Patterns

### Recommended Component Structure
```
src/components/kitchen/
  # NEW components (Phase 15)
  DashboardHeader.tsx          # Sticky header with 4 stat cards
  StatCard.tsx                 # Individual stat card (reusable)
  TargetConfigPopover.tsx      # Gear icon -> popover/sheet for target config
  DueDateOrderList.tsx         # Grouped order list with due-date headers
  DueDateGroupHeader.tsx       # "OVERDUE", "Due Today", etc.
  KitchenOrderCard.tsx         # Single order card with per-item checklist
  KitchenOrderChecklist.tsx    # Per-item checkbox list
  K3MartSyntheticCard.tsx      # Visually distinct K3Mart synthetic order
  InventoryOverrideButton.tsx  # Manager override button for unavailable items

  # EXISTING components (unchanged)
  SwipeableKitchenLayout.tsx
  ProductionLogPanel.tsx
  BoxingPanel.tsx
  StickeringPanel.tsx
  PackingPanel.tsx
  ... (all other existing components)
```

### Pattern 1: Sticky Dashboard Header Above Existing Layout
**What:** A new `DashboardHeader` component inserted between the existing `<header>` and `<SwipeableKitchenLayout>` in `KitchenViewV2.tsx`. Uses `position: sticky; top: [header-height]` to stay visible while scrolling order list below.
**When to use:** For the always-visible production summary bar.
**Example:**
```typescript
// In KitchenViewV2.tsx, between header and SwipeableKitchenLayout
<header className="... sticky top-0 z-30">
  {/* Existing Kitchen header */}
</header>

<DashboardHeader
  minTarget={kitchenStats?.minTarget}
  maxTarget={maxProductionTarget}
  remainingBalls={remainingBalls}
  ordersLeft={ordersLeft}
  hasOverdueOrders={hasOverdueOrders}
  onOpenConfig={() => setConfigOpen(true)}
  canConfigure={hasPermission('canEditKitchen') && role === 'manager' || role === 'admin'}
/>

{/* Existing batch panels below */}
<SwipeableKitchenLayout ...>
```

### Pattern 2: Due-Date Grouping with date-fns
**What:** Group kitchen-visible orders by due date using date-fns helpers: `isToday()`, `isTomorrow()`, `isPast()`, `format(date, 'EEE, MMM d')`.
**When to use:** For the order list below the dashboard header.
**Example:**
```typescript
import { isToday, isTomorrow, isPast, format, startOfDay } from 'date-fns';

function groupOrdersByDueDate(orders: KitchenOrder[]): DueDateGroup[] {
  const groups = new Map<string, { label: string; orders: KitchenOrder[]; sortKey: number; isOverdue: boolean }>();

  for (const order of orders) {
    const dueDate = order.dueDate ? new Date(order.dueDate) : null;
    let groupKey: string;
    let label: string;
    let sortKey: number;
    let isOverdue = false;

    if (!dueDate) {
      groupKey = 'no-date';
      label = 'No Due Date';
      sortKey = 999;
    } else if (isPast(startOfDay(dueDate)) && !isToday(dueDate)) {
      groupKey = 'overdue';
      label = 'OVERDUE';
      sortKey = -1;
      isOverdue = true;
    } else if (isToday(dueDate)) {
      groupKey = 'today';
      label = 'Due Today';
      sortKey = 0;
    } else if (isTomorrow(dueDate)) {
      groupKey = 'tomorrow';
      label = 'Due Tomorrow';
      sortKey = 1;
    } else {
      groupKey = format(dueDate, 'yyyy-MM-dd');
      label = `Due ${format(dueDate, 'EEE, MMM d')}`;
      sortKey = dueDate.getTime();
    }
    // ... group into map
  }
  // Sort: OVERDUE first, then chronological
}
```

### Pattern 3: Kitchen Config Document (New Schema)
**What:** A single-row configuration document in Convex storing max production target and ball composition. Manager-editable via a popover/sheet opened from the gear icon.
**When to use:** For the max production target and composition (e.g., 150 Big Balls + 50 Mid Balls).
**Schema:**
```typescript
kitchenConfig: defineTable({
  maxProductionTarget: v.number(),        // Default: 200
  bigBallTarget: v.number(),              // Default: 150
  midBallTarget: v.number(),              // Default: 50
  updatedAt: v.number(),
  updatedBy: v.string(),
}),
```
**Note:** Only one row ever exists. Query returns defaults if no row. Mutation requires manager/admin role. This is simpler than the existing `productionTargets` table which is date-keyed and per-unit-type. The existing `productionTargets` table handles auto-calculated targets per day; the new `kitchenConfig` handles the static maximum.

### Pattern 4: Per-Item Checklist with "Complete Order" Flow
**What:** Each order card shows a checkbox per product line item. Ticking a checkbox updates `orderItems.packageStatus` to "packed". When all items are ticked, the "Complete Order" button becomes active. Clicking it calls `markOrderReady` which transitions `BeingPrepared -> AwaitingDelivery`.
**When to use:** For the kitchen order cards.
**Existing implementation:** The current `PackingPanel` already has this exact pattern -- `togglePackOrderLineItem` mutation toggles `packageStatus` between "filled" and "packed", and `markOrderReady` transitions to `AwaitingDelivery`. The Phase 15 simplification is to reduce the checklist to a single tick per product line (matching current behavior, since `togglePackOrderLineItem` already operates per line item).

### Pattern 5: "Send Back to Order Desk" Mutation
**What:** New mutation that: (1) resets all `orderItems.packageStatus` to "empty", (2) transitions `BeingPrepared -> PaymentReceived`, (3) logs audit event with reason.
**When to use:** When kitchen needs to return an order to the order desk.
**Key behavior:** The order's `kitchenEnteredAt` remains set (the threshold was already crossed), so it won't auto-re-enter kitchen. Only manual "Expedite" can push it back.
**Example:**
```typescript
export const sendBackToOrderDesk = mutation({
  args: {
    token: v.string(),
    orderId: v.id("orders"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["kitchen", "manager", "admin"]);
    const order = await ctx.db.get(args.orderId);
    if (!order || order.status !== "BeingPrepared") throw new ConvexError("...");

    // Reset all package statuses
    const items = await ctx.db.query("orderItems")
      .withIndex("by_order", q => q.eq("orderId", args.orderId)).collect();
    for (const item of items) {
      if (item.packageStatus && item.packageStatus !== "empty") {
        await ctx.db.patch(item._id, { packageStatus: "empty" });
      }
    }

    // Transition to PaymentReceived
    await ctx.db.patch(args.orderId, {
      status: "PaymentReceived",
      isKitchenVisible: false, // computeIsKitchenVisible("PaymentReceived") = false
    });

    await logStatusTransition(ctx, args.orderId, "BeingPrepared", "PaymentReceived",
      args.reason ?? "Sent back from kitchen", "kitchen", user._id);
  },
});
```

### Anti-Patterns to Avoid
- **Modifying existing batch panels:** The existing 4-panel swipeable layout (Production Log, Boxing, Stickering, Packing) must NOT be changed. New features layer on top or alongside.
- **Creating a separate kitchen page:** Do not create a new page. All new features are added to `KitchenViewV2.tsx` as new components rendered conditionally or alongside existing panels.
- **Querying all orders in the frontend:** Use a dedicated backend query with `isKitchenVisible` index to get only relevant orders. The existing `by_kitchen_visible` index on the `orders` table is perfect.
- **Using deprecated productionType/productionUnits fields:** All ball composition MUST be derived from BOM (`menuProductComponents` + `componentTypes`), never from deprecated fields.
- **Timezone-naive date comparisons:** Kitchen operates in WIB (UTC+7). Use the existing `wibNow` pattern from `useKitchenProduction` for date calculations. date-fns should receive WIB-adjusted dates.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date arithmetic (isToday, isTomorrow, isPast) | Manual date math with `new Date()` | `date-fns` `isToday`, `isTomorrow`, `isPast`, `format` | Timezone edge cases, DST, locale formatting |
| Day name formatting ("Sat, Feb 17") | `toLocaleDateString()` with options | `date-fns` `format(date, 'EEE, MMM d')` | Consistent formatting, easier testing |
| Sticky positioning with dynamic header heights | JavaScript scroll listeners | CSS `position: sticky; top: Xpx` | Browser-native, no reflow, smooth |
| Ball target calculations | Custom aggregation logic | Extend existing `getKitchenStats` query | Already calculates `bigBallsNeeded`, `midBallsNeeded`, `ordersPending` |
| Order checklist toggling | New toggle mutation | Reuse existing `togglePackOrderLineItem` mutation | Already handles pack/unpack, packageStatus, productionLog |
| Popover/bottom sheet for config | Custom modal system | Existing shadcn/ui `Popover` or `Sheet` components | Accessible, animated, already in the project |

**Key insight:** The existing kitchen backend (`getKitchenStats`, `getKitchenOrders`, `togglePackOrderLineItem`, `markOrderReady`) provides 80% of the needed functionality. Phase 15 is primarily a UI restructuring with two new backend additions: `kitchenConfig` table and `sendBackToOrderDesk` mutation.

## Common Pitfalls

### Pitfall 1: Stacking Sticky Headers
**What goes wrong:** Multiple `position: sticky` elements (page header, station pill bar, dashboard header) fight for the same scroll context.
**Why it happens:** The existing `KitchenViewV2.tsx` already has a sticky header at `top-0 z-30`, and `SwipeableKitchenLayout` has a sticky pill bar at `top-0 z-20`.
**How to avoid:** The new dashboard header should have `top: [existing-header-height]` (not `top: 0`). Use a known fixed height for the existing header (~56px) or measure dynamically with a ref. The pill bar should be adjusted to `top: [header + dashboard]`.
**Warning signs:** Dashboard header disappears behind the page header when scrolling.

### Pitfall 2: Kitchen-Visible Order Scope
**What goes wrong:** Showing orders that shouldn't be in the kitchen view, or missing orders that should be visible.
**Why it happens:** The `isKitchenVisible` derived field is set by `computeIsKitchenVisible()` which currently returns `true` only for `BeingPrepared`. The due-date-grouped order list needs exactly this set.
**How to avoid:** Use the existing `by_kitchen_visible` index. Don't re-query by status array. Trust the derived field.
**Warning signs:** Orders appearing in kitchen that are in `PaymentReceived` or `AwaitingDelivery`.

### Pitfall 3: "Send Back" Not Reverting Pack Production Logs
**What goes wrong:** After sending an order back to order desk, the productionLog still shows packed items, skewing production counts.
**Why it happens:** The "Send back" mutation only resets `orderItems.packageStatus` but doesn't write "unpack" entries to `productionLog`.
**How to avoid:** When implementing `sendBackToOrderDesk`, also write `unpack` log entries for each packed item, matching the pattern in `togglePackOrderLineItem`.
**Warning signs:** Production counts show more packed items than actually packed after a send-back.

### Pitfall 4: K3Mart Synthetic Order Data Source
**What goes wrong:** Trying to create actual `orders` table records for K3Mart synthetic orders.
**Why it happens:** The context says "Same checklist/tick-off flow" which suggests real order records.
**How to avoid:** K3Mart synthetic orders should be rendered from `k3martDispatchPlans` data (Phase 16 dependency), NOT from the `orders` table. The "checklist" can use local state or a lightweight tracking table, since these aren't real orders. Until Phase 16 provides dispatch plans, the K3Mart card can show data from `getK3MartKitchenSummary` (which already exists and aggregates outlet stock, targets, and sales).
**Warning signs:** Creating `orders` records for K3Mart confuses real order metrics.

### Pitfall 5: Remaining Balls Calculation Scope
**What goes wrong:** "Remaining balls needed" counts all orders, not just today's orders.
**Why it happens:** `getKitchenStats` already counts balls for all pending orders (Draft, AwaitingPayment, PaymentReceived, BeingPrepared), which is broader than "remaining for today."
**How to avoid:** The min target (confirmed orders due today) needs a filtered calculation. The "remaining balls" stat should count only kitchen-visible orders (BeingPrepared) since those are what the kitchen is actively working on. Add a separate aggregation or extend `getKitchenStats` with date filtering.
**Warning signs:** Remaining balls count is much higher than expected because it includes future orders.

### Pitfall 6: Race Condition on "Complete Order"
**What goes wrong:** Kitchen taps "Complete Order" on an order that was simultaneously sent back by the order desk.
**Why it happens:** Convex mutations are serialized but the UI may show stale state.
**How to avoid:** The `markOrderReady` mutation already validates `order.status !== "BeingPrepared"` implicitly (it checks all items are packed). Add explicit status check. Convex's real-time subscriptions will auto-update the UI.
**Warning signs:** Error toast after tapping Complete Order.

## Code Examples

### Existing: Kitchen Stats Query (source of min target data)
```typescript
// Source: convex/orders/queries.ts - getKitchenStats
// Already returns: bigBallsNeeded, midBallsNeeded, ordersPending, ordersCompletedToday
// productionByType array with { code, name, color, unitsNeeded, unitsCompleted }
// Extension needed: filter for "due today" orders to get min target
```

### Existing: Kitchen Packing Order Query
```typescript
// Source: convex/orders/kitchenQueries.ts - getKitchenPackingOrders
// Already returns: BeingPrepared orders with product items, packaging materials,
// allProductsPacked, canMarkReady, dueDate
// Extension needed: add expedited flag, due-date grouping done on frontend
```

### Existing: Mark Order Ready (Complete Order equivalent)
```typescript
// Source: convex/orders/mutations/kitchen.ts - markOrderReady
// Already: validates all items packed, consumes "none"-stage packaging,
// transitions BeingPrepared -> AwaitingDelivery, logs audit event
// This is exactly the "Complete Order" button handler
```

### New: Kitchen Config Schema
```typescript
// New table in convex/schema.ts
kitchenConfig: defineTable({
  maxProductionTarget: v.number(),  // Default 200
  bigBallTarget: v.number(),        // Absolute number, e.g., 150
  midBallTarget: v.number(),        // Absolute number, e.g., 50
  updatedAt: v.number(),
  updatedBy: v.string(),
}),
```

### New: Get Kitchen Config Query
```typescript
// New query in convex/kitchenConfig/queries.ts
export const getConfig = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db.query("kitchenConfig").first();
    return config ?? {
      maxProductionTarget: 200,
      bigBallTarget: 150,
      midBallTarget: 50,
    };
  },
});
```

### New: Due-Date Grouping (Frontend)
```typescript
// Using date-fns v4
import { isToday, isTomorrow, isBefore, startOfDay, format } from 'date-fns';

interface DueDateGroup {
  key: string;
  label: string;
  isOverdue: boolean;
  orders: KitchenOrder[];
}

function groupByDueDate(orders: KitchenOrder[]): DueDateGroup[] {
  const now = new Date();
  const todayStart = startOfDay(now);
  const groups = new Map<string, DueDateGroup>();

  for (const order of orders) {
    const due = order.dueDate ? new Date(order.dueDate) : null;
    let key: string, label: string, isOverdue = false;

    if (!due) {
      key = 'no-date'; label = 'No Due Date';
    } else if (isBefore(startOfDay(due), todayStart)) {
      key = 'overdue'; label = 'OVERDUE'; isOverdue = true;
    } else if (isToday(due)) {
      key = 'today'; label = 'Due Today';
    } else if (isTomorrow(due)) {
      key = 'tomorrow'; label = 'Due Tomorrow';
    } else {
      key = format(due, 'yyyy-MM-dd');
      label = `Due ${format(due, 'EEE, MMM d')}`;
    }

    if (!groups.has(key)) {
      groups.set(key, { key, label, isOverdue, orders: [] });
    }
    const group = groups.get(key)!;

    // EXPEDITED orders pinned to top of their group
    if (order.expedited) {
      group.orders.unshift(order);
    } else {
      group.orders.push(order);
    }
  }

  // Sort groups: OVERDUE first, then chronological
  return Array.from(groups.values()).sort((a, b) => {
    if (a.isOverdue) return -1;
    if (b.isOverdue) return 1;
    const aKey = a.key === 'today' ? 0 : a.key === 'tomorrow' ? 1 : 2;
    const bKey = b.key === 'today' ? 0 : b.key === 'tomorrow' ? 1 : 2;
    return aKey - bKey;
  });
}
```

### New: Dashboard Header Component (Skeleton)
```typescript
// src/components/kitchen/DashboardHeader.tsx
interface DashboardHeaderProps {
  minTarget: number;
  minTargetOrderCount: number;
  maxTarget: { total: number; big: number; mid: number };
  remainingBalls: { total: number; big: number; mid: number };
  ordersLeft: number;
  hasOverdueOrders: boolean;
  urgency: 'green' | 'amber' | 'red';
  onOpenConfig: () => void;
  canConfigure: boolean;
}

// 4 stat cards in a 2x2 grid on mobile, row on desktop
// Tap remaining balls to toggle Big/Mid breakdown
// Gear icon visible only when canConfigure=true
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Kitchen sees all active orders by status priority | Kitchen sees only `isKitchenVisible=true` (BeingPrepared) | Phase 14 (current branch) | Kitchen query uses `by_kitchen_visible` index. Phase 15 builds on this. |
| Production counts stored in `productionCounts` table | Production counts derived from `productionLog` aggregation | INFRA-03 (recent) | All production count reads use `aggregateForProduct()` helper. Never write to `productionCounts`. |
| 10+ order statuses with complex transitions | 7 statuses with clean forward/backward transitions | Phase 14 (current branch) | `statusTransitions.ts` has `FORWARD_TRANSITIONS` and `BACKWARD_TRANSITIONS` maps. |
| Ball composition from `productionType`/`productionUnits` | Ball composition from BOM (`menuProductComponents` + `componentTypes`) | BOM refactor (earlier phase) | NEVER use deprecated fields. Always derive from BOM. |

**Deprecated/outdated:**
- `productionCounts` table: Archived, read-only. Source of truth is `productionLog` aggregation.
- `productionType`/`productionUnits` on `menuProducts` and `orderItems`: Deprecated. Use BOM.
- `KitchenView.tsx` (V1): Replaced by `KitchenViewV2.tsx`.

## Open Questions

1. **K3Mart Dispatch Plan Dependency**
   - What we know: Phase 16 (K3Mart Cockpit) creates `k3martDispatchPlans` with status "confirmed". Phase 15 context says K3Mart synthetic orders are "auto-generated from confirmed K3Mart dispatch plans."
   - What's unclear: Phase 16 doesn't exist yet. The `k3martDispatchPlans` table exists in schema but may not have the exact query Phase 15 needs.
   - Recommendation: Use the existing `getK3MartKitchenSummary` query as the data source for K3Mart synthetic cards. This already aggregates outlet stock, consignment targets, and sales data. Add a new query to pull from `k3martDispatchPlans` if/when Phase 16 populates it. The K3Mart card should have a fallback rendering mode for when no dispatch plans exist (show consignment targets from `productionProductTargets` instead).

2. **Dashboard Header Height and Sticky Layering**
   - What we know: Three sticky elements will stack: page header (~56px), dashboard header (new, ~120px on mobile), station pill bar (~48px).
   - What's unclear: Exact pixel heights for proper `top` offsets.
   - Recommendation: Use CSS custom properties for heights and compute `top` offsets. Or use a single sticky container that wraps all three and scrolls the content below. Test on actual phone viewports (375px width).

3. **Urgency Thresholds for Remaining Balls**
   - What we know: Green = on track, amber = behind, red = overdue orders exist.
   - What's unclear: Exact numeric thresholds (e.g., is "behind" when remaining > 50% of target?).
   - Recommendation (Claude's discretion): Green when remaining <= max target and no overdue orders. Amber when remaining > max target OR any orders due today are not complete. Red when any OVERDUE orders exist. This keeps it simple and tied to real urgency.

4. **"Send Back" Interaction with Sales Aggregator**
   - What we know: Phase 14 context says "Payment Received -> Awaiting Payment or Draft: Must reverse sales aggregator mutations." Kitchen's "send back" goes `BeingPrepared -> PaymentReceived`.
   - What's unclear: Does `BeingPrepared -> PaymentReceived` need sales reversal?
   - Recommendation: No. Sales were recognized at `PaymentReceived` transition. Going from `BeingPrepared` back to `PaymentReceived` does not cross the sales recognition boundary. Only going from `PaymentReceived -> AwaitingPayment/Draft` reverses sales. The `sendBackToOrderDesk` mutation should NOT touch `confirmedAt`.

## Sources

### Primary (HIGH confidence)
- Codebase: `convex/schema.ts` -- Full schema with 37+ tables, all indexes verified
- Codebase: `convex/orders/queries.ts` -- `getKitchenOrders`, `getKitchenStats` implementations
- Codebase: `convex/orders/kitchenQueries.ts` -- `getKitchenPackingOrders` implementation
- Codebase: `convex/orders/mutations/kitchen.ts` -- `markOrderReady`, `togglePackOrderLineItem` implementations
- Codebase: `convex/orders/helpers/statusTransitions.ts` -- Status workflow, `computeIsKitchenVisible`
- Codebase: `convex/k3martKitchen/queries.ts` -- `getK3MartKitchenSummary` implementation
- Codebase: `convex/productionTargets/queries.ts` -- Target system (auto, manual, order demand)
- Codebase: `src/pages/KitchenViewV2.tsx` -- Full kitchen page, 588 lines
- Codebase: `src/components/kitchen/` -- 19 existing kitchen components
- Codebase: `src/hooks/convex/useKitchenProduction.ts` -- Combined kitchen data hook
- Codebase: `src/lib/types.ts` -- Role permissions (`canEditKitchen`, `canAccessKitchen`)
- Codebase: `src/lib/ballTypes.ts` -- Ball type configuration and mapping
- Codebase: `src/index.css` -- Kitchen CSS variables (light + dark mode)

### Secondary (MEDIUM confidence)
- Phase 14 CONTEXT.md -- Status transitions, backward flows, sales reversal rules
- v1.1 planning notes -- date-fns approval, phase ordering

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all dependencies are already installed or pre-approved (date-fns)
- Architecture: HIGH -- building on well-understood existing patterns with 19 kitchen components as reference
- Pitfalls: HIGH -- identified from direct codebase inspection of existing kitchen code and Phase 14 interactions

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (30 days -- stable domain, no fast-moving external deps)
