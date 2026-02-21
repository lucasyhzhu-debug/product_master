# Phase 17: Unified Dispatch Planner & 3rd Outlet - Research

**Researched:** 2026-02-17
**Domain:** Multi-channel production dispatch planning, GoFood integration, Convex real-time grid UI
**Confidence:** HIGH

## Summary

Phase 17 builds a **Unified Dispatch Planner** page that consolidates all sales channels (Direct Sales, GoFood, K3Mart, Other Consignment) into a single rolling 7-day calendar grid. This is architecturally an evolution of the existing K3Mart Weekly Planner pattern (`WeeklyPlannerGrid`, `EditablePlannerCell`, `OutletPlannerRow`) expanded to handle multiple channel types with a 3-level row hierarchy (Channel > Outlet/Order > Product). The second deliverable adds a 3rd GoFood outlet (Tamtem, merchant ID G958262444) by extending the existing `GOBIZ_CONFIG` arrays -- a config-only change since the sync infrastructure already iterates all merchant IDs.

The codebase already has strong foundations: the `k3martDispatchPlans` table with week-based planning, `externalOutlets` with multi-source support, `externalRevenue` for historical sales data across all platforms, and a full BOM system (`menuProductComponents` + `componentTypes`) for inventory simulation. The main engineering challenge is creating a **new `dispatchPlans` table** (or extending `k3martDispatchPlans`) to support multi-channel planning, building the 3-level collapsible grid UI, and implementing the capacity waterfall with auto-redistribution logic.

**Primary recommendation:** Create a new `dispatchPlans` table for the unified planner (separate from `k3martDispatchPlans`) since K3Mart plans have K3Mart-specific fields (API submission, request IDs, approval flow) that don't apply to other channels. The unified planner READS from K3Mart cockpit data but writes to its own table for GoFood, Direct, and Other Consignment channels.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Planner Layout
- Rolling 7-day calendar grid, building on K3Mart Weekly Planner pattern
- Left/right arrow buttons shift the view by 7 days
- **Past days**: Show actual sales data (retrospective, read-only)
- **Future days**: Editable cells -- manager inputs planned dispatch quantities
- **Pre-filled defaults**: Future cells pre-filled based on recent averages (like K3Mart pattern), manager adjusts as needed
- **Row hierarchy**: Channel -> Outlet/Order -> Product (3 levels)
  - Channels: Direct Sales, GoFood, K3Mart, Other Consignment
  - Under Direct Sales: Each order with a due date in the 7-day window is its own row
  - Under GoFood: 3 outlets (Goldfinch, Crystal, Tamtem)
  - Under K3Mart: Active outlets from K3Mart cockpit settings
  - Under Other Consignment: Configurable outlets (currently Legato Tamtem, Legato Goldfinch)
  - Under each outlet/order: Products (Original Single, Original Triple)
- **Collapsible channel groups** with subtotal rows visible when collapsed (default: expanded)
- **Top summary**: Total balls per day with segmented capacity bar (200-ball default, configurable) + mini channel breakdown showing distribution shape
- **Direct order display**: Orders show on BOTH the production-start day (due date minus 2, faded) and the due date column (solid) -- visual range showing production window
- **Empty rows**: Show with placeholder dash ("--") when no data for a day
- **Desktop only** -- no mobile optimization needed
- **Auto-save on blur**: Each cell saves immediately when user clicks away (Convex real-time)

#### Demand Waterfall
- **Integrated into the grid header** -- no separate chart. Column totals at top ARE the waterfall
- **Segmented capacity bar per day**: Each channel gets its own color segment (Direct=blue, GoFood=green, K3Mart=orange, Other=gray). Bar fills toward the configurable capacity threshold
- **Daily capacity is configurable** by manager (default 200 balls), regardless of composition between original and triple
- **Over-capacity handling**: Auto-redistribute using priority-based logic -- lowest-priority channels are reduced first
- **All channels are flexible** during redistribution (including Direct, though Direct is highest priority so last to be cut)
- Manager sees the redistribution suggestion and can override individual cells
- **Historical days show same segmented bar** with actual sales data for comparison

#### Channel Configuration
- **Settings dialog** (gear icon on planner page) for all channel config
- **Channel priority**: Drag-to-reorder list. Top = highest priority. Default: Direct > GoFood > K3Mart > Other Consignment
- **Commission rates**: Per-channel (not per-outlet). Percentage of gross sales
- **Channels are semi-fixed**: Direct, GoFood, K3Mart are built-in. Other Consignment outlets are configurable (add/rename/remove)
- **New consignment outlet requires**: Name, product mapping (internal product -> external name + external price, same pattern as GoFood mapping), and commission rate as % of gross sales
- **Outlet enable/disable**: All channels support enabling/disabling outlets in settings. Disabled outlets don't appear in the planner grid
- **GoFood outlets**: All 3 enabled by default (Goldfinch, Crystal, Tamtem)
- **K3Mart outlets**: Synced with existing K3Mart cockpit settings -- configurable from both places, backed by same data source

#### Inventory Simulation
- **Manual "Simulate" button** -- does NOT auto-run on cell changes
- **Checks all direct packaging BOM items** linked to each product via menuProductComponents, plus food components (sub/ball level)
- **Result display**: Day column gets a colored left border (green=OK, yellow=low, red=out). Hover for details on which items are short and by how much
- **Advisory only** -- does not block planning. Used to inform procurement decisions
- Simulation projects current inventory stock against planned dispatch quantities across the 7-day window

#### Tamtem (3rd GoFood Outlet)
- Merchant ID: G958262444
- Syncs automatically alongside Goldfinch and Crystal on the existing cron schedule
- Enabled by default in the planner

### Claude's Discretion
- Exact grid component library and implementation approach
- Color palette for channel segments (as long as channels are visually distinct)
- How pre-filled defaults are calculated (recent average logic)
- Auto-redistribute algorithm details (priority waterfall math)
- Exact hover tooltip design for simulation results
- How to handle edge cases: weeks with no data, outlets with no products mapped

### Deferred Ideas (OUT OF SCOPE)
- **P&L Financial Reporting** -- P&L statement / financial reporting as a standalone feature (future roadmap item)
- **Ingredients Inventory & Procurement Flow** -- Expand food component tracking to full BOM-level inventory and procurement planning similar to packaging/sticker inventory (future roadmap item)
- **Procurement Planner** -- Procurement planning UI driven by inventory simulation insights (future roadmap item)
</user_constraints>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Backend + real-time queries | Already used, auto-updates on mutation |
| React 19 | ^19.2.0 | UI framework | Already used |
| TypeScript | ~5.9 | Type safety | Already used |
| Tailwind CSS | ^4.1.18 | Styling | Already used, utility-first |
| shadcn/ui | latest | UI primitives (Dialog, Button, Skeleton) | Already used, accessible |
| Lucide React | latest | Icons | Already used |
| Sonner | latest | Toast notifications | Already used |

### Supporting (Already in Project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Framer Motion | latest | Animations | Collapsible channel groups, smooth expand/collapse |

### No New Dependencies Needed

The entire phase can be built with existing libraries. Key justification:
- **Grid/table**: Use custom HTML table with Tailwind (same as K3Mart `WeeklyPlannerGrid`) -- no need for a grid library
- **Drag-to-reorder**: Use native HTML drag-and-drop API (channel priority list is small, 4 items) or a simple array reorder UI with up/down arrows. If drag is desired, `@dnd-kit/core` (already common in React ecosystem) could be added, but up/down arrow buttons are simpler and sufficient
- **Capacity bar**: CSS flexbox with percentage widths (no charting library needed)
- **Tooltips**: Already have shadcn `Tooltip` component

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom HTML table | TanStack Table | Overkill for fixed 7-column layout, adds dependency |
| CSS flexbox bar | Recharts stacked bar | Heavy dependency for simple segmented bar |
| @dnd-kit/core | Up/down arrow buttons | Arrows are simpler; drag is nicer UX but unnecessary for 4 items |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure
```
convex/
├── dispatchPlanner/
│   ├── queries.ts          # Unified planner data assembly
│   ├── mutations.ts        # Save plan cells, channel config, simulate
│   ├── helpers.ts          # Auto-suggest, redistribution, simulation logic
│   └── types.ts            # Shared TypeScript types
src/
├── pages/
│   └── DispatchPlanner.tsx  # Main page component
├── components/
│   └── dispatchPlanner/
│       ├── index.ts
│       ├── PlannerGrid.tsx            # 7-day grid orchestrator
│       ├── ChannelGroup.tsx           # Collapsible channel section
│       ├── OutletRow.tsx              # Outlet or order sub-row
│       ├── ProductRow.tsx             # Product cells within outlet
│       ├── CapacityBar.tsx            # Segmented daily capacity bar
│       ├── DayColumnHeader.tsx        # Day header with capacity bar
│       ├── PlannerCell.tsx            # Editable cell (extend EditablePlannerCell)
│       ├── ChannelSettingsDialog.tsx   # Channel config modal
│       ├── SimulationOverlay.tsx      # Inventory simulation results
│       └── WeekNav.tsx               # Week navigation (reuse pattern)
├── hooks/
│   └── convex/
│       └── useDispatchPlanner.ts      # Query/mutation hooks
```

### Pattern 1: New `dispatchPlans` Table (Multi-Channel)
**What:** A new table that generalizes `k3martDispatchPlans` for all channels
**When to use:** For GoFood, Direct Sales, and Other Consignment planning data
**Why separate from `k3martDispatchPlans`:** K3Mart plans have API-specific fields (`k3martRequestId`, `submittedAt`, `submittedBy`, submission statuses) that pollute a generic table. The unified planner READS K3Mart data but doesn't need to WRITE to K3Mart-specific plans.

```typescript
// convex/schema.ts addition
dispatchPlans: defineTable({
  date: v.string(), // YYYY-MM-DD
  channel: v.string(), // "direct" | "gofood" | "k3mart" | "consignment"
  outletId: v.optional(v.id("externalOutlets")), // For GoFood/K3Mart/Consignment outlets
  orderId: v.optional(v.id("orders")), // For Direct Sales (links to specific order)
  menuProductId: v.id("menuProducts"),
  plannedQty: v.number(),
  actualQty: v.optional(v.number()), // Filled from actual sales data (past days)
  source: v.string(), // "manual" | "auto_suggest" | "redistributed"
  updatedBy: v.string(),
  updatedAt: v.number(),
})
  .index("by_date_channel", ["date", "channel"])
  .index("by_date", ["date"])
  .index("by_order", ["orderId"])
  .index("by_outlet_date", ["outletId", "date"]),

// Channel configuration
dispatchChannelConfig: defineTable({
  channelKey: v.string(), // "direct" | "gofood" | "k3mart" | "consignment"
  displayName: v.string(), // "Direct Sales", "GoFood", etc.
  color: v.string(), // Hex color for capacity bar segment
  priority: v.number(), // Lower = higher priority (1 = highest)
  commissionRate: v.number(), // Percentage (e.g., 19 for 19%)
  isBuiltIn: v.boolean(), // true for Direct/GoFood/K3Mart, false for custom
  isEnabled: v.boolean(),
  updatedBy: v.string(),
  updatedAt: v.number(),
})
  .index("by_channel", ["channelKey"])
  .index("by_priority", ["priority"]),

// Consignment outlet configuration
dispatchConsignmentOutlets: defineTable({
  name: v.string(), // "Legato Tamtem", "Legato Goldfinch"
  channelKey: v.literal("consignment"),
  isEnabled: v.boolean(),
  productMappings: v.array(v.object({
    menuProductId: v.id("menuProducts"),
    externalName: v.string(), // Name at consignment outlet
    externalPrice: v.number(), // Price at consignment outlet
  })),
  commissionRate: v.optional(v.number()), // Override channel-level rate
  createdBy: v.string(),
  createdAt: v.number(),
  updatedBy: v.string(),
  updatedAt: v.number(),
})
  .index("by_enabled", ["isEnabled"]),

// Planner settings (capacity, etc.)
dispatchPlannerSettings: defineTable({
  dailyCapacity: v.number(), // Default 200 balls
  updatedBy: v.string(),
  updatedAt: v.number(),
}),
```

### Pattern 2: Unified Query Assembly (Read from Multiple Sources)
**What:** The main planner query assembles data from multiple tables into a unified grid structure
**When to use:** `getUnifiedWeeklyPlan` query that the frontend consumes

```typescript
// convex/dispatchPlanner/queries.ts
export const getUnifiedWeeklyPlan = query({
  args: { startDate: v.string() }, // YYYY-MM-DD (Monday of the week)
  handler: async (ctx, args) => {
    const dates = generateWeekDates(args.startDate); // 7 dates
    const today = getTodayJakarta();

    // 1. Fetch channel config (priority order)
    const channels = await ctx.db.query("dispatchChannelConfig")
      .withIndex("by_priority")
      .filter(q => q.eq(q.field("isEnabled"), true))
      .collect();

    // 2. For each channel, assemble outlet/order rows:
    //    - Direct: Query orders with dueDate in [startDate, startDate+6]
    //    - GoFood: Query externalOutlets source="gobiz" + externalRevenue
    //    - K3Mart: READ from k3martDispatchPlans (existing data)
    //    - Consignment: Query dispatchConsignmentOutlets

    // 3. For past days: Pull actual sales from externalRevenue
    // 4. For future days: Pull planned qty from dispatchPlans
    // 5. Compute daily totals per channel for capacity bars

    return { channels: [...], dates, dailyCapacity, todayIndex };
  }
});
```

### Pattern 3: Direct Order Integration
**What:** Orders with `dueDate` in the 7-day window automatically appear in the Direct Sales channel
**When to use:** Direct Sales rows in the planner

```typescript
// Query active orders with dueDate in the planning window
const activeOrders = await ctx.db.query("orders")
  .withIndex("by_status_due_date", q => q.eq("status", "PaymentReceived"))
  .collect();
// Also include BeingPrepared, AwaitingDelivery orders
// Filter: dueDate >= windowStart && dueDate <= windowEnd
// Display: Show on due date column (solid) AND due date minus 2 column (faded)

// Order items -> product quantities via orderItems table
// Each order becomes a row under "Direct Sales" channel
// Products under each order show the orderItem quantities
```

### Pattern 4: Auto-Save on Blur (Existing Pattern)
**What:** Reuse the `EditablePlannerCell` pattern from K3Mart cockpit
**When to use:** All editable cells in the grid

The existing `EditablePlannerCell` component handles:
- 300ms debounced save on blur
- Keyboard navigation (arrow keys, Enter, Tab, Escape)
- Status-based background colors
- Past-day greying
- Suggested quantity placeholder

This can be reused directly or with minimal extension for the unified planner.

### Pattern 5: Capacity Waterfall Auto-Redistribution
**What:** When total planned quantity exceeds daily capacity, redistribute by cutting lowest-priority channels first
**When to use:** Triggered by "Simulate" or when user modifies a cell that causes over-capacity

```typescript
// Pure function, no ctx dependency
export function redistributeOverCapacity(
  dailyTotals: Map<string, number>, // channelKey -> total for the day
  channelPriorities: { channelKey: string; priority: number }[],
  capacity: number
): Map<string, number> {
  const total = Array.from(dailyTotals.values()).reduce((a, b) => a + b, 0);
  if (total <= capacity) return dailyTotals; // No redistribution needed

  const excess = total - capacity;
  const sorted = [...channelPriorities].sort((a, b) => b.priority - a.priority); // Lowest priority first

  let remaining = excess;
  const result = new Map(dailyTotals);

  for (const channel of sorted) {
    if (remaining <= 0) break;
    const current = result.get(channel.channelKey) ?? 0;
    const reduction = Math.min(current, remaining);
    result.set(channel.channelKey, current - reduction);
    remaining -= reduction;
  }

  return result;
}
```

### Pattern 6: Inventory Simulation (BOM Walk)
**What:** Project current inventory against planned dispatch to check sufficiency
**When to use:** Manual "Simulate" button click

```typescript
// For each day in the 7-day window:
//   For each planned product:
//     Look up menuProductComponents (BOM)
//     For each component with trackInventory=true:
//       Accumulate required quantity (planned * component.quantity)
//     For production components (balls):
//       Accumulate ball count from BOM
//   Compare cumulative required vs current componentStock
//   Return: { date, componentTypeId, required, available, status: "ok"|"low"|"out" }
```

### Anti-Patterns to Avoid
- **Don't modify `k3martDispatchPlans` directly from the unified planner:** K3Mart plans have their own lifecycle (draft -> confirmed -> submitted -> approved). The unified planner should READ K3Mart data for display but not write to it.
- **Don't create a single mega-query:** Split into focused queries (channel config, weekly plans, active orders, actual sales) and compose on the frontend. Convex reactive queries will auto-update each independently.
- **Don't mix actual and planned data in the same table field:** Use `plannedQty` for future and `actualQty` for past. Past days are read-only and sourced from `externalRevenue`.
- **Don't compute BOM walk on every cell change:** Inventory simulation is explicitly manual ("Simulate" button). Keep it performant by batching the BOM lookup.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date arithmetic | Manual date math with `new Date()` | Existing `getWeekDates()`, `getWeekNumber()`, `getDayTypeForDate()` from `convex/k3martCockpit/helpers.ts` | Already battle-tested, handles Jakarta timezone correctly |
| Editable grid cells | Custom input handling | Extend existing `EditablePlannerCell` component | Already handles debounce, keyboard nav, status colors |
| Week navigation | Custom week offset logic | Reuse `WeekNavigator` component pattern from K3Mart cockpit | Already handles prev/next/today with week offset state |
| GoFood outlet sync | Custom API integration | Add merchant ID to `GOBIZ_CONFIG.merchantIds` array | Existing sync infrastructure iterates all IDs automatically |
| FIFO inventory check | Custom batch walk | Use `componentStock` cache table | Already aggregated, just read `totalStock - totalReserved` |
| Auth guards | Custom role check | Use `requireRole(ctx, args.token, ["manager", "admin"])` | Existing pattern, consistent |
| Toast notifications | Custom notification system | Use `toast()` from sonner | Already configured in the app |

**Key insight:** The K3Mart cockpit already solved 70% of the planner problems. The unified planner should compose from existing K3Mart patterns rather than reinventing them.

## Common Pitfalls

### Pitfall 1: K3Mart Data Ownership Conflict
**What goes wrong:** Unified planner tries to write to `k3martDispatchPlans`, conflicting with K3Mart cockpit's own lifecycle (draft -> confirmed -> submitted via K3Mart API).
**Why it happens:** Natural instinct to use one table for all plans.
**How to avoid:** Unified planner READS K3Mart data but writes to its own `dispatchPlans` table. K3Mart channel rows in the planner are read-only mirrors of K3Mart cockpit data. Editing K3Mart plans still happens in the K3Mart cockpit.
**Warning signs:** If you find yourself adding non-K3Mart fields to `k3martDispatchPlans`.

### Pitfall 2: Direct Order Double-Counting
**What goes wrong:** An order appears in both the "production start" column (due date - 2) and the "due date" column, and the capacity bar counts it twice.
**Why it happens:** The user wants to SEE the order in two columns, but the daily TOTAL should only count it once.
**How to avoid:** Count the order's product quantities only in the due date column for capacity calculation. The "due date - 2" column shows a faded visual indicator only (not added to totals).
**Warning signs:** Daily totals exceed expected values when orders span 2 columns.

### Pitfall 3: Convex Query Size Explosion
**What goes wrong:** A single query tries to fetch all channels, all outlets, all products, all plans, and all historical sales for 7 days. Query exceeds Convex's 8MB response limit or takes too long.
**Why it happens:** Assembling the full grid in one query.
**How to avoid:** Split into multiple focused queries: (1) channel config, (2) weekly dispatch plans, (3) active orders with due dates, (4) actual sales summary per day. Frontend composes them. Each query stays small and reactive.
**Warning signs:** Query handler exceeds 50 lines, or single query returns nested data 3+ levels deep.

### Pitfall 4: Stale GoFood Outlet Data for Tamtem
**What goes wrong:** Tamtem added to `GOBIZ_CONFIG.merchantIds` but `externalOutlets` table lacks the seed record. Sync runs, finds no matching outlet, silently skips Tamtem data.
**Why it happens:** `GOBIZ_OUTLET_SEED` and `merchantIds` must be updated together, AND the seed mutation must run.
**How to avoid:** (1) Add to `GOBIZ_OUTLET_SEED` first. (2) Run seed mutation from dashboard. (3) Then add to `merchantIds` and deploy. OR add both simultaneously since the adapter's auto-seeder handles it.
**Warning signs:** GoBiz sync succeeds but Tamtem revenue doesn't appear in `externalRevenue`.

### Pitfall 5: dueDate Is a Timestamp, Not a Date String
**What goes wrong:** Comparing `order.dueDate` (epoch milliseconds) against date strings in the planner grid.
**Why it happens:** Orders store `dueDate` as `v.number()` (Unix timestamp), but the planner grid uses `YYYY-MM-DD` strings.
**How to avoid:** Convert `dueDate` to Jakarta timezone date string before comparing: `new Date(order.dueDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })`.
**Warning signs:** Orders appearing on wrong days, especially near midnight Jakarta time.

### Pitfall 6: BOM Walk for Inventory Simulation Missing Production Components
**What goes wrong:** Simulation only checks packaging components (`trackInventory=true`) but not production components (balls), missing food-level capacity constraints.
**Why it happens:** Production components in `componentTypes` have `trackInventory=false`.
**How to avoid:** The simulation has TWO modes: (1) packaging inventory check (from `componentStock`), and (2) ball capacity check (from production BOM). Both must run. Ball count is derived from `menuProductComponents` where `componentType.category="production"`.
**Warning signs:** Simulation shows green but kitchen can't produce enough balls.

## Code Examples

### Adding Tamtem to GoBiz Config
```typescript
// convex/integrations/gobiz/config.ts
export const GOBIZ_CONFIG = {
  merchantIds: ["G293156297", "G347061572", "G958262444"] as const, // Add Tamtem
  merchantNames: {
    "G293156297": "Legato Goldfinch",
    "G347061572": "GoFood Crystal",
    "G958262444": "Legato Tamtem", // NEW
  } as Record<string, string>,
  // ... rest unchanged
};

export const GOBIZ_OUTLET_SEED = [
  { externalId: "G293156297", name: "Legato Goldfinch", source: "gobiz" as const },
  { externalId: "G347061572", name: "GoFood Crystal", source: "gobiz" as const },
  { externalId: "G958262444", name: "Legato Tamtem", source: "gobiz" as const }, // NEW
] as const;
```

### Pre-Fill Default Calculation (Claude's Discretion)
```typescript
// convex/dispatchPlanner/helpers.ts
/**
 * Calculate default pre-fill for a future day based on recent averages.
 * Uses last 14 days of actual sales data, split by day type.
 */
export function calculatePreFill(
  recentSales: { date: string; quantity: number }[],
  targetDate: string,
  dayType: "weekday" | "weekend" | "holiday" | "sales_date"
): number {
  // Split sales by weekday vs weekend+holiday
  const weekdaySales = recentSales.filter(s => {
    const dt = getDayTypeForDate(s.date);
    return dt === "weekday";
  });
  const weekendSales = recentSales.filter(s => {
    const dt = getDayTypeForDate(s.date);
    return dt !== "weekday";
  });

  if (dayType === "weekday") {
    const total = weekdaySales.reduce((sum, s) => sum + s.quantity, 0);
    const days = new Set(weekdaySales.map(s => s.date)).size || 1;
    return Math.round(total / days);
  } else {
    const total = weekendSales.reduce((sum, s) => sum + s.quantity, 0);
    const days = new Set(weekendSales.map(s => s.date)).size || 1;
    return Math.round(total / days);
  }
}
```

### Channel Color Palette (Claude's Discretion)
```typescript
// Recommended colors for channel segments in capacity bar
export const CHANNEL_COLORS = {
  direct: "#3B82F6",      // Blue-500 (Direct Sales)
  gofood: "#22C55E",      // Green-500 (GoFood)
  k3mart: "#F97316",      // Orange-500 (K3Mart)
  consignment: "#6B7280", // Gray-500 (Other Consignment)
} as const;
```

### Segmented Capacity Bar (CSS Flexbox)
```tsx
// src/components/dispatchPlanner/CapacityBar.tsx
interface CapacityBarProps {
  segments: { channelKey: string; quantity: number; color: string }[];
  capacity: number;
}

function CapacityBar({ segments, capacity }: CapacityBarProps) {
  const total = segments.reduce((sum, s) => sum + s.quantity, 0);
  const isOverCapacity = total > capacity;

  return (
    <div className="relative h-4 w-full bg-muted rounded-sm overflow-hidden">
      <div className="flex h-full" style={{ width: `${Math.min(100, (total / capacity) * 100)}%` }}>
        {segments.map((seg) => (
          <div
            key={seg.channelKey}
            className="h-full transition-all"
            style={{
              width: total > 0 ? `${(seg.quantity / total) * 100}%` : '0%',
              backgroundColor: seg.color,
            }}
          />
        ))}
      </div>
      {/* Capacity line */}
      <div className="absolute top-0 right-0 h-full w-px bg-foreground/30" />
      {isOverCapacity && (
        <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-destructive" />
      )}
    </div>
  );
}
```

### Inventory Simulation Query
```typescript
// convex/dispatchPlanner/queries.ts
export const simulateInventory = query({
  args: {
    startDate: v.string(), // YYYY-MM-DD
    plans: v.array(v.object({
      date: v.string(),
      menuProductId: v.id("menuProducts"),
      quantity: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    // 1. Get all unique menuProductIds from plans
    const mpIds = [...new Set(args.plans.map(p => p.menuProductId))];

    // 2. For each product, fetch BOM (menuProductComponents + componentTypes)
    const bomMap = new Map(); // menuProductId -> [{ componentTypeId, quantity, category }]
    for (const mpId of mpIds) {
      const components = await ctx.db.query("menuProductComponents")
        .withIndex("by_menu_product", q => q.eq("menuProductId", mpId))
        .collect();
      const enriched = await Promise.all(components.map(async c => {
        const ct = await ctx.db.get(c.componentTypeId);
        return { ...c, componentType: ct };
      }));
      bomMap.set(mpId, enriched);
    }

    // 3. Get current stock for all relevant components
    const defaultLocation = await ctx.db.query("storageLocations")
      .withIndex("by_default", q => q.eq("isDefault", true))
      .first();

    // 4. Walk each day, accumulate required vs available
    // Return per-day sufficiency status
  },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| K3Mart-only dispatch planning | Unified multi-channel planning | Phase 17 (now) | Single page for all channels |
| 2 GoFood outlets (Goldfinch, Crystal) | 3 GoFood outlets (+ Tamtem) | Phase 17 (now) | Config change only, sync auto-handles |
| No capacity visualization | Segmented capacity bar per day | Phase 17 (now) | Visual distribution shape |
| Manual inventory check | BOM-based inventory simulation | Phase 17 (now) | Advisory stock sufficiency |

**Deprecated/outdated:**
- `productionType`/`productionUnits` fields on `menuProducts` and `orderItems`: Use BOM (`menuProductComponents` + `componentTypes`) instead. See CLAUDE.md pitfall #11.

## Open Questions

1. **K3Mart Read-Only or Editable in Unified Planner?**
   - What we know: Context says "Does NOT replace the K3Mart cockpit -- reads from it"
   - What's unclear: Can the manager edit K3Mart planned quantities from the unified planner, or must they switch to K3Mart cockpit?
   - Recommendation: K3Mart channel rows are **read-only** in the unified planner. Display existing `k3martDispatchPlans` data but require K3Mart cockpit for edits. This avoids the API submission lifecycle conflict.

2. **GoFood Outlet Actual Sales Data Source**
   - What we know: GoFood revenue syncs via `externalRevenue` with `source="gobiz"`. Each revenue record has `outletId`.
   - What's unclear: GoFood revenue is aggregated at the day level (5-metric dashboard API), not per-product per-outlet. How to show per-product actual sales for past days under each GoFood outlet?
   - Recommendation: Use `externalRevenueItems` table which has per-product breakdowns from GoBiz journal sync. Filter by `source="gobiz"` and group by `linkedMenuProductId`. If outlet-level breakdown is needed, join through `externalRevenue.outletId`.

3. **Direct Orders Without Due Date**
   - What we know: `orders.dueDate` is `v.optional(v.number())` -- some orders may lack a due date.
   - What's unclear: Should orders without due dates appear in the planner?
   - Recommendation: Only show orders with `dueDate` set. Orders without due dates are not schedulable and should be excluded from the planner grid.

4. **How "Other Consignment" Outlets Store Data**
   - What we know: They need product mapping like GoFood. They need revenue tracking.
   - What's unclear: These don't have API sync -- how are actual sales recorded?
   - Recommendation: Past-day cells for consignment outlets pull from `externalRevenue` with `source="internal"` matched by outlet. If no revenue data exists, show "--" (empty). Actual data entry for consignment is out of scope (deferred to Sales Channel Consolidation).

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `convex/schema.ts` (59 tables, full schema understanding)
- Codebase analysis: `convex/k3martCockpit/` (queries, mutations, helpers -- existing weekly planner pattern)
- Codebase analysis: `convex/integrations/gobiz/config.ts` (merchant IDs, sync architecture)
- Codebase analysis: `src/components/k3martCockpit/` (18 components, reusable patterns)
- Codebase analysis: `convex/orders/queries.ts` (order list with dueDate filtering)
- Codebase analysis: `convex/menuProductComponents/queries.ts` (BOM lookups)
- Codebase analysis: `convex/inventory/queries.ts` (stock alerts, componentStock)
- Codebase analysis: `convex/externalData/queries.ts` (multi-source revenue, outlet data)

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` - Prior research on dispatch planner architecture
- `.planning/research/STACK.md` - Prior research on Tamtem integration approach
- `.planning/research/PITFALLS.md` - Prior research on common pitfalls

### Tertiary (LOW confidence)
- Tamtem merchant ID `G958262444` - Documented in PROJECT.md and CONTEXT.md, but must be verified against actual GoBiz portal before deployment

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies, all existing libraries
- Architecture: HIGH - Direct extension of proven K3Mart cockpit patterns
- Pitfalls: HIGH - Based on deep codebase analysis of actual data flows
- Tamtem merchant ID: LOW - Documented but unverified against live GoBiz portal

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (stable codebase, no external dependency risk)
