# Phase 16: K3Mart Cockpit - Research

**Researched:** 2026-02-16
**Domain:** Convex backend enhancement + React UI overhaul (K3Mart dispatch planning and stock management)
**Confidence:** HIGH

## Summary

Phase 16 completes the K3Mart Cockpit by replacing 6 BACKLOG stubs (K3MART-01 through K3MART-06) with real data, restructuring the weekly planner grid from product-tab-first to outlet-first with product sub-rows, adding holiday/commercial date awareness, implementing manual stock movements (stock-in/stock-out/rotation), and pushing confirmed day-plans to kitchen as synthetic orders.

The codebase already has extensive infrastructure: 6 backend queries, 7 mutations, 8 adapter actions, 15 frontend components, 6 query hooks, 8 action hooks, 4 mutation hooks, 2 schema tables (`k3martDispatchPlans`, `k3martStockMovements`), and full K3Mart API integration. The existing staff review (2026-02-11) identified and resolved critical issues: mega-query was split into 4 focused queries, `indonesianHolidays.ts` was created, token retrieval was extracted to shared helper, redundant indexes removed, and retry patterns added. The backend is substantially complete.

**Primary recommendation:** This phase is predominantly a **frontend restructuring** with targeted backend enhancements. The existing backend queries/mutations/actions work; the main gaps are: (1) restructuring `WeeklyPlannerGrid` from product-tabs to outlet-first with product sub-rows, (2) wiring the 6 BACKLOG stubs to real data, (3) adding week navigation + copy-last-week + auto-save-on-blur, (4) adding commercial/sales dates to the holidays system, (5) implementing per-outlet product settings (pricing + visibility), and (6) implementing the rotation shortcut in the stock flow form.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Weekly Planning Grid
- **Grid structure:** Outlet-first with product sub-rows. Primary rows = active outlets (SCBD, Lippo Puri, Bintaro, Old Shanghai, Goldfinch, etc.), sub-rows = K3Mart-mapped products per outlet
- **Cell display:** Single editable number per product-day cell. Tap to edit inline
- **Save behavior:** Auto-save on blur. No batch save button needed
- **Totals:** Row totals (per product across week), column totals (daily production targets -- most important), and weekly grand total. Grand total row at bottom sums all outlets
- **Subtotals:** Per-outlet subtotal row. Hidden when only 1 product is planned for that outlet
- **Product visibility:** Option to hide specific product rows (e.g., hide Triple when sunsetting). Only K3Mart-mapped products appear
- **Copy last week:** "Copy last week's plan" button. Copies all saved values regardless of confirm status
- **Current stock column:** Extra column before day columns showing current K3Mart stock per product per outlet (fetched from K3Mart API)
- **Column headers:** Three-row format: (1) Day name ("Monday"), (2) Date ("17 Feb"), (3) Special event name if applicable (holiday, sales day, Ramadan, etc.)
- **Week navigation:** Default to current week. Big arrow navigation for next/previous week. Prominent date display with color difference between current week and other weeks

#### Confirm & Push to Kitchen
- **Confirm granularity:** Day by day, not whole week at once
- **Draft vs confirmed indicators:** Visual distinction between draft days and confirmed days in the grid
- **Edit after confirm:** Allowed. If a confirmed day is edited, save button changes to "Update Kitchen" to re-push the updated plan
- **Unsaved changes warning:** If manager navigates away with unsaved edits, prompt to save or discard

#### Outlet Management
- **All outlets always expanded** in the grid (no collapse/expand)
- **Active outlets only** shown in the planning grid. Active/inactive toggle on each outlet card
- **Modal for bulk management** of active/inactive outlets
- **Outlets defined by K3Mart cockpit** -- more than 5 exist in K3Mart but only active ones are planned
- **Per-outlet product selection:** Settings to choose which products to plan for each outlet
- **Per-outlet product pricing:** Outlet settings include price per product (admin-only configuration)
- **Default pricing:** Menu product price is the default. "Custom pricing" toggle enables per-outlet overrides
- **Price sanity check:** Before any K3Mart API call (stock-in/stock-out), validate that price is present and non-zero. Never send a request without price

#### Stock Movement Recording
- **Entry point:** Tap outlet info cards (showing current stock, sold today, avg sales/day from last week)
- **Expand behavior:** Tapping outlet card expands to show stock-in/stock-out form + history log
- **Stock-in fields:** Quantity + optional notes. Price auto-included from outlet product pricing
- **Stock-out fields:** Same as stock-in: quantity + optional notes + auto-price
- **Rotation shortcut:** Dedicated "Rotate" button that does stock-out of remaining + stock-in of new quantity in one action. Auto-fills stock-out quantity from current K3Mart stock. Auto-generates comment "rotation stock-out/stock-in"
- **Manual only:** Stock movements are always manual (no auto-creation from confirmed plans). Rotation workflow (stock-out 3-5 remaining + stock-in 30 fresh) is a common pattern
- **Confirmation step:** Always confirm before sending to K3Mart API. Show summary (outlet, product, qty, price)
- **Error handling:** Show K3Mart API error message + retry button. Don't save locally if API fails
- **History log:** Below the stock-in/out form, show API-pulled list of all movements with statuses. Tap a log entry to see full details of that specific stock-in/out

#### Holiday & Weekend Handling
- **Holiday source:** Pre-loaded Indonesian public holidays for 2026. Reminder to load 2027 holidays in January 2027
- **Commercial/sales dates:** Include Valentine's Day, 11/11 (Singles' Day), and all sequential dates (1/1, 2/2, 3/3, ..., 12/12)
- **Ramadan:** Only mark Lebaran (Eid al-Fitr) days, not the full fasting month
- **Visual treatment:** Special color highlight for holidays, weekends, and sales dates in column headers. Holiday/event name shown in third header row
- **Demand patterns for auto-suggest:**
  - Weekday: baseline rate (~20/day if 100/5 days)
  - Weekend: ~2.5x weekday rate (~50/day if 100/2 days)
  - Holiday/sales date: same as weekend rate (~50/day)
- **Auto-suggest quantities:** Pre-fill cells with suggested quantities based on weekday/weekend/holiday patterns. Manager can override

### Claude's Discretion
- Exact color palette for day types (weekday, weekend, holiday, sales date)
- Grid cell interaction animations and feedback
- Loading states and skeleton patterns
- Responsive behavior for different screen sizes
- Exact layout of outlet info cards
- History log pagination and sorting
- Auto-suggest algorithm (simple multiplier vs rolling average)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| Convex | ^1.31.7 | Backend queries/mutations/actions | Existing |
| React | ^19.2.0 | UI framework | Existing |
| TypeScript | ~5.9 | Type safety | Existing |
| Tailwind CSS | ^4.1.18 | Styling | Existing |
| shadcn/ui | latest | Accessible components | Existing |
| Framer Motion | latest | Animations | Existing |
| Lucide React | latest | Icons | Existing |
| Sonner | latest | Toast notifications | Existing |

### Supporting (No New Dependencies)
| Library | Purpose | When to Use |
|---------|---------|-------------|
| `src/lib/indonesianHolidays.ts` | Holiday detection | Column header rendering, auto-suggest |
| `convex/integrations/k3mart/config.ts` | K3Mart API types | All API interactions |
| `convex/k3martCockpit/helpers.ts` | Pure business logic | Kitchen delta, suggestions, week math |
| `convex/integrations/k3mart/helpers.ts` | API parsing helpers | Date parsing, dedup keys |

### Alternatives Considered
None needed -- this phase uses exclusively existing dependencies.

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Existing Code Structure (K3Mart Cockpit)
```
convex/
  k3martCockpit/
    queries.ts              # 6 queries (all working)
    mutations.ts            # 7 mutations (all working)
    helpers.ts              # Pure business logic (getWeekNumber, calculateKitchenDelta, etc.)
  k3martKitchen/
    queries.ts              # Kitchen summary query (working)
  integrations/k3mart/
    adapter.ts              # 8 actions (API calls - all working)
    config.ts               # API config, types, outlet mappings
    helpers.ts              # Pure helper functions
src/
  pages/
    K3MartCockpit.tsx       # Main page (has 6 BACKLOG stubs to resolve)
  components/k3martCockpit/
    WeeklyPlannerGrid.tsx   # NEEDS RESTRUCTURING: product-tab-first -> outlet-first
    PlannerGridHeader.tsx   # NEEDS: 3-row headers, commercial dates, week nav
    OutletPlannerRow.tsx    # NEEDS: product sub-rows, subtotals
    EditablePlannerCell.tsx # NEEDS: auto-save on blur
    PlannerActionBar.tsx    # NEEDS: per-day confirm, "Update Kitchen" for re-push
    OutletCardGrid.tsx      # NEEDS: wire real movement data (K3MART-05)
    OutletCard.tsx          # NEEDS: wire real planned data (K3MART-03)
    ExpandedOutletPanel.tsx # NEEDS: rotation shortcut, confirmation step
    StockFlowForm.tsx       # NEEDS: rotation button, price validation
    StockMovementHistory.tsx # NEEDS: wire to fetchStockFlowHistory action
    OutletStockDetail.tsx   # Mostly working
    InventorySourcePanel.tsx # Working (wired to getInventorySources)
    ProductionReadinessBar.tsx # NEEDS: wire real targets (K3MART-01)
    BulkSubmitDialog.tsx    # Working
  hooks/convex/
    useK3MartCockpit.ts     # 18 hooks (6 query, 8 action, 4 mutation - all defined)
```

### Pattern 1: BACKLOG Stub Resolution
**What:** The page has 6 labeled BACKLOG stubs that compute stub/default data instead of using real backend data.
**When to use:** This is the primary work pattern -- replace each stub with the correct data flow.
**Stubs to resolve:**

| Stub | Location | Current Behavior | Required Fix |
|------|----------|-----------------|--------------|
| K3MART-01 | Line 396 | `currentTarget: p.stickered` | Wire `productionProductTargets` (source="consignment") data |
| K3MART-02 | Line 415 | Minimal outlet structure | Enhance `getOutletStockSummary` response or add dispatch plan join |
| K3MART-03 | Lines 432-433 | `plannedQty: 0, planStatus: 'no_plan'` | Join today's dispatch plans per outlet per product |
| K3MART-04 | Lines 443-458 | Hardcoded sources with `available: 0` | Create/enhance query for inventory sources with real quantities |
| K3MART-05 | Line 458 | `movements: {}` | Wire `getStockMovementHistory` per outlet |
| K3MART-06 | Line 553 | `console.log` stub | Implement production bump via existing `setProductTarget` mutation |

### Pattern 2: Outlet-First Grid Restructuring
**What:** The current `WeeklyPlannerGrid` uses product tabs at top, with outlet rows below. The new design has outlet as primary rows, with product sub-rows nested under each outlet.
**Current structure:**
```
[Product Tab: Jumbo] [Product Tab: Chewy]
┌────────┬──────┬──────┬──────┐
│ Outlet │ Mon  │ Tue  │ Wed  │ ...
├────────┼──────┼──────┼──────┤
│ SCBD   │  20  │  15  │  20  │
│ Bintaro│  10  │  10  │  10  │
└────────┴──────┴──────┴──────┘
```
**New structure:**
```
┌──────────────────┬──────┬──────┬──────┬───────┐
│                  │ Mon  │ Tue  │ Wed  │ Total │
│                  │17 Feb│18 Feb│19 Feb│       │
│                  │      │      │Imlek │       │
├──────────────────┼──────┼──────┼──────┼───────┤
│ SCBD             │      │      │      │       │
│   Jumbo          │  20  │  15  │  20  │  55   │
│   Chewy          │  30  │  25  │  30  │  85   │
│   Subtotal       │  50  │  40  │  50  │  140  │
├──────────────────┼──────┼──────┼──────┼───────┤
│ Bintaro          │      │      │      │       │
│   Jumbo          │  10  │  10  │  10  │  30   │
│ (no subtotal - only 1 product shown)          │
├──────────────────┼──────┼──────┼──────┼───────┤
│ Daily Total      │  60  │  50  │  60  │  170  │
└──────────────────┴──────┴──────┴──────┴───────┘
```

### Pattern 3: Auto-Save on Blur
**What:** Instead of a "Save" button, cell edits auto-save when focus leaves the cell.
**Implementation approach:**
```typescript
// In EditablePlannerCell:
const handleBlur = useCallback(async () => {
  if (localValue !== serverValue) {
    await onSave({ date, outletId, menuProductId, plannedQty: localValue });
  }
}, [localValue, serverValue, onSave, date, outletId, menuProductId]);
```
**Key considerations:**
- Debounce rapid blur events (user tabbing through cells quickly)
- Show saving indicator per cell (small spinner or checkmark)
- Convex auto-updates mean the grid will reactively refresh after mutation
- Need unsaved-changes tracking for the navigation warning

### Pattern 4: Week Navigation with Reactive Queries
**What:** The user navigates weeks with arrow buttons. Each week change triggers a new `getWeeklyDispatchPlans` query with a different `weekNumber`.
**Implementation:**
```typescript
const [weekOffset, setWeekOffset] = useState(0);
const currentWeekNumber = useMemo(() => {
  const d = new Date();
  d.setDate(d.getDate() + weekOffset * 7);
  return getWeekNumber(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }));
}, [weekOffset]);

const { data, isLoading } = useConvexWeeklyDispatchPlans(currentWeekNumber);
```

### Pattern 5: Rotation Shortcut (Two API calls in sequence)
**What:** Rotation = stock-out remaining + stock-in fresh in one action.
**Flow:**
1. User taps "Rotate" button on outlet card
2. UI shows confirmation: "Stock out 3 remaining, stock in 30 fresh?"
3. On confirm: call `submitStockFlow` with `requestType: 0` (stock-out) first
4. Wait for success, then call `submitStockFlow` with `requestType: 1` (stock-in)
5. Both calls generate notes: "rotation stock-out" / "rotation stock-in"
**Critical:** Must handle partial failure (stock-out succeeds, stock-in fails).

### Anti-Patterns to Avoid
- **Never change `getWeekNumber()` algorithm:** Prior decision from Phase 15; production data depends on this exact algorithm
- **Never use `productionType`/`productionUnits`:** These deprecated fields cause confusion (per CLAUDE.md pitfall #11)
- **Never submit API call without price sanity check:** User decision -- validate price is present and non-zero before any K3Mart API call
- **Never auto-create stock movements from confirmed plans:** User decision -- stock movements are always manual
- **Don't save locally if API fails:** User decision -- error handling must show API error + retry, no optimistic local save

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ISO week numbers | Custom week calculation | `getWeekNumber()` from `convex/k3martCockpit/helpers.ts` | Algorithm is production-critical, must not change |
| Holiday detection | Inline date checks | `isHoliday()`, `getHolidayName()` from `src/lib/indonesianHolidays.ts` | Central source of truth for holidays |
| K3Mart API token | Per-action token fetch | `getK3MartToken()` from `convex/integrations/k3mart/adapter.ts` | Already handles DB fallback to env |
| Auth enforcement | Custom auth checks | `requireRole()` from `convex/lib/auth.ts` | Standard pattern, includes token validation |
| Protected mutations | Manual token passing | `useProtectedMutation()` hook | Auto-injects auth token |
| Kitchen production targets | New mutation | Existing `setProductTarget` in `convex/productionTargets/mutations.ts` | Already handles ball-total recomputation |
| Product detail transform | Custom API parsing | `transformProductDetailEntry()` from `convex/integrations/k3mart/helpers.ts` | Tested and reliable |

**Key insight:** Nearly all backend infrastructure exists. The phase is about wiring existing backend to restructured frontend, not building new backend.

## Common Pitfalls

### Pitfall 1: Product-Tab to Outlet-First Grid Migration
**What goes wrong:** The existing `WeeklyPlannerGrid` has product tabs with outlet rows. Restructuring to outlet-first with product sub-rows means the data key scheme changes from `${outletId}_${date}_${menuProductId}` (current) to needing nested iteration: outlet -> products -> dates.
**Why it happens:** The current `localChanges` Map uses `${outletId}_${date}` as key (product is implicit from active tab). With outlet-first, keys need to include product: `${outletId}_${menuProductId}_${date}`.
**How to avoid:** Design the new data structure first, then refactor components. Use TypeScript interfaces to enforce the new key scheme.
**Warning signs:** Cells not updating correctly, wrong product getting saved, subtotal calculations off.

### Pitfall 2: Auto-Save Race Conditions
**What goes wrong:** User tabs rapidly through cells, triggering multiple blur events. Each blur fires a mutation. If mutations arrive out of order, earlier saves can overwrite later ones.
**Why it happens:** Convex mutations are async; network latency can reorder them.
**How to avoid:** Debounce saves (e.g., 300ms). Batch multiple cell changes into a single `saveWeeklyDispatchPlan` call. The existing mutation already supports batch upsert.
**Warning signs:** Values "flickering" after rapid editing.

### Pitfall 3: Stale Stock Data in Rotation Flow
**What goes wrong:** The rotation shortcut does stock-out then stock-in. Between the two API calls, the stock level changes. The second call must use the updated stock as `currentStock`.
**Why it happens:** K3Mart API requires `currentStock` to match actual. Stale data = API rejection.
**How to avoid:** After the stock-out call succeeds, fetch fresh dashboard data before the stock-in call. The existing `submitStockFlow` action already fetches fresh dashboard.
**Warning signs:** "Stock mismatch" errors on the second (stock-in) part of rotation.

### Pitfall 4: Commercial Dates vs Holidays
**What goes wrong:** The existing `indonesianHolidays.ts` only has public holidays. The user wants commercial dates (Valentine's, 11/11, sequential dates 1/1 through 12/12) with different visual treatment.
**Why it happens:** These are not holidays in `INDONESIAN_HOLIDAYS_2026` array.
**How to avoid:** Add a separate `COMMERCIAL_DATES_2026` array to the holidays module. Expose `isCommercialDate()` and `getCommercialDateName()` functions alongside existing holiday functions.
**Warning signs:** Missing highlights on sales dates in grid headers.

### Pitfall 5: Per-Outlet Product Settings Schema Gap
**What goes wrong:** User wants per-outlet product selection and pricing, but no table exists for this configuration.
**Why it happens:** Current schema has `restockTargets` (weekday/weekend targets per outlet per product) but no per-outlet product pricing or visibility settings.
**How to avoid:** Either extend `restockTargets` with `price` and `isVisible` fields, or create a new `k3martOutletProductSettings` table. Recommendation: new table, because `restockTargets` serves a different purpose (restock target quantities).
**Warning signs:** Price defaults to 0 on API calls, causing K3Mart rejection.

### Pitfall 6: Kitchen Push (K3M-05) - Synthetic Order vs Production Target
**What goes wrong:** The requirement says "push confirmed day-plans to kitchen as synthetic orders" but the existing kitchen integration uses `productionProductTargets` (source="consignment"), not the order system.
**Why it happens:** The K3Mart kitchen card (`K3MartSyntheticCard`) reads `productionProductTargets` data, not actual orders. "Synthetic order" means setting the consignment production target, not creating an `orders` table record.
**How to avoid:** `confirmDayPlan` should compute kitchen delta and call `setProductTarget` with `source: "consignment"` for each affected menu product. This is what the existing `confirmDayPlan` mutation already partially does (it returns `kitchenDeltas` but doesn't call `setProductTarget`).
**Warning signs:** Kitchen view doesn't show K3Mart demand after confirming a day plan.

### Pitfall 7: Unsaved Changes Warning with Convex Real-time
**What goes wrong:** Convex auto-updates query results reactively. If the user has local unsaved changes and another user saves plans for the same week, the grid re-renders with server data, potentially clearing local changes.
**Why it happens:** React re-render from Convex subscription overwrites local state.
**How to avoid:** Track local changes in a separate state map. Merge server data with local overrides during render. Only clear local changes on successful save.
**Warning signs:** Local edits disappearing when another user modifies plans.

## Code Examples

### Existing: Save Weekly Dispatch Plan Mutation
```typescript
// convex/k3martCockpit/mutations.ts - Already supports batch upsert
export const saveWeeklyDispatchPlan = mutation({
  args: {
    token: v.string(),
    plans: v.array(v.object({
      date: v.string(),
      outletId: v.id("externalOutlets"),
      menuProductId: v.id("menuProducts"),
      externalProductId: v.string(),
      suggestedQty: v.number(),
      plannedQty: v.number(),
      isStockOut: v.boolean(),
      // ... source/destination optional fields
    })),
  },
  handler: async (ctx, args) => {
    // Upserts: checks existing by date+outlet+product+isStockOut, patches or inserts
  },
});
```

### Existing: Confirm Day Plan with Kitchen Delta
```typescript
// convex/k3martCockpit/mutations.ts - Already computes kitchen deltas
export const confirmDayPlan = mutation({
  args: { token: v.string(), date: v.string() },
  handler: async (ctx, args) => {
    // 1. Fetch all draft plans for date
    // 2. Mark all as "confirmed"
    // 3. Calculate kitchen delta per product
    // 4. Return { confirmedCount, kitchenDeltas }
    // GAP: Does NOT currently call setProductTarget -- needs to be added
  },
});
```

### New: Copy Last Week's Plan (Backend Query + Frontend)
```typescript
// Backend: query previous week's plans
// convex/k3martCockpit/queries.ts -- add new query
export const getPreviousWeekPlans = query({
  args: { weekNumber: v.string() },
  handler: async (ctx, args) => {
    // Parse week number to get previous week
    // Fetch plans for previous week
    // Return plans array (same shape as getWeeklyDispatchPlans)
  },
});

// Frontend: copy action
const handleCopyLastWeek = useCallback(async () => {
  const prevWeekData = await fetchPreviousWeekPlans(previousWeekNumber);
  const copies = prevWeekData.plans.map(plan => ({
    ...plan,
    date: shiftDateByWeek(plan.date, 1), // Move forward 1 week
    status: "draft", // Reset status
  }));
  await saveWeeklyDispatchPlan({ plans: copies });
}, [previousWeekNumber, saveWeeklyDispatchPlan]);
```

### New: Auto-Save on Blur Pattern
```typescript
// In restructured EditablePlannerCell
const handleBlur = useCallback(() => {
  if (localValue !== serverValue && localValue >= 0) {
    // Fire auto-save through parent
    onAutoSave({
      date,
      outletId,
      menuProductId,
      externalProductCode,
      plannedQty: localValue,
      suggestedQty,
      isStockOut: false,
    });
  }
}, [localValue, serverValue, date, outletId, menuProductId, externalProductCode, suggestedQty, onAutoSave]);
```

### New: Commercial Dates Extension
```typescript
// src/lib/indonesianHolidays.ts -- extend with commercial dates
export const COMMERCIAL_DATES_2026 = [
  { date: "2026-01-01", name: "New Year 1.1" },
  { date: "2026-02-02", name: "2.2 Sale" },
  { date: "2026-02-14", name: "Valentine's Day" },
  { date: "2026-03-03", name: "3.3 Sale" },
  // ... through 12.12
  { date: "2026-11-11", name: "11.11 Singles' Day" },
  { date: "2026-12-12", name: "12.12 Sale" },
] as const;

export function isCommercialDate(date: string): boolean { ... }
export function getCommercialDateName(date: string): string | undefined { ... }
export function getSpecialDayInfo(date: string): {
  type: 'weekday' | 'weekend' | 'holiday' | 'commercial';
  name?: string;
  demandMultiplier: number; // 1.0 for weekday, 2.5 for weekend/holiday/commercial
} { ... }
```

### New: Per-Outlet Product Settings Schema
```typescript
// convex/schema.ts -- new table needed
k3martOutletProductSettings: defineTable({
  outletId: v.id("externalOutlets"),
  menuProductId: v.id("menuProducts"),
  externalProductCode: v.string(),
  isVisible: v.boolean(), // Whether to show in planning grid
  customPrice: v.optional(v.number()), // Per-outlet price override (null = use menu product price)
  updatedBy: v.string(),
  updatedAt: v.number(),
})
  .index("by_outlet", ["outletId"])
  .index("by_outlet_product", ["outletId", "menuProductId"]),
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Product-tab grid | Outlet-first with product sub-rows | Phase 16 (this phase) | Full WeeklyPlannerGrid restructure |
| Manual save button | Auto-save on blur | Phase 16 (this phase) | Remove PlannerActionBar save button, add per-cell save |
| BACKLOG stubs (6) | Real data wiring | Phase 16 (this phase) | All cockpit data flows become functional |
| Holidays only | Holidays + commercial dates | Phase 16 (this phase) | Extended auto-suggest with sales day awareness |
| `productionCounts` table | `productionLog` aggregation | Phase 15 | productionCounts is archived/read-only; use `aggregateForProduct` |

**Deprecated/outdated:**
- `productionCounts` table: Archived read-only. Use `productionLog` + `aggregateForProduct()` helper (Phase 15 change)
- `productionType`/`productionUnits` fields: Never use these (CLAUDE.md pitfall #11)
- `RestockPlanner` page: Already redirects to `/k3mart-cockpit`

## Schema Analysis

### Existing Tables (No Changes Needed)
| Table | Records | Usage |
|-------|---------|-------|
| `k3martDispatchPlans` | Active | Weekly planning data; indexes: `by_date_outlet`, `by_date_status`, `by_outlet_date`, `by_week` |
| `k3martStockMovements` | Active | Stock movement audit log; indexes: `by_date`, `by_outlet_date`, `by_outlet_direction`, `by_status` |
| `externalOutlets` | 8 outlets | K3Mart outlet registry; has `isActive` toggle |
| `externalStockSnapshots` | Active | Latest stock per outlet per product |
| `externalProductMappings` | Active | Maps K3Mart product codes to menuProduct IDs |
| `externalRevenue` | Active | Sales transaction data |
| `restockTargets` | Active | Baseline weekday/weekend targets per outlet per product |
| `productionProductTargets` | Active | Kitchen production targets (source="consignment") |

### New Table Required
| Table | Purpose | Fields |
|-------|---------|--------|
| `k3martOutletProductSettings` | Per-outlet product visibility + pricing | `outletId`, `menuProductId`, `externalProductCode`, `isVisible`, `customPrice`, `updatedBy`, `updatedAt` |

**Rationale:** `restockTargets` stores restock quantity targets (weekday/weekend). Per-outlet product settings (visibility + custom pricing) is a separate concern. Merging would conflate restock targets with product configuration.

### Existing Backend API Coverage

**Queries (6) - All working, minor enhancements needed:**
1. `getOutletStockSummary(date)` -- Needs: add dispatch plan join (K3MART-03), add movements (K3MART-05)
2. `getWeeklyDispatchPlans(weekNumber)` -- Working. Needs: current stock column data
3. `getProductionReadiness(date)` -- Needs: wire real targets (K3MART-01)
4. `getInventorySources()` -- Needs: wire real available quantities (K3MART-04)
5. `getOutletDetail(outletId, days)` -- Working
6. `getStockMovementHistory(outletId, date, limit)` -- Working

**Mutations (7) - All working, one enhancement:**
1. `saveWeeklyDispatchPlan` -- Working. Supports batch upsert.
2. `confirmDayPlan` -- **Enhancement needed:** After confirming, call `setProductTarget` with kitchen delta
3. `updateDispatchPlanStatus` -- Working (internal)
4. `recordStockMovement` -- Working (internal)
5. `processStockOutDestination` -- Working
6. `updateMovementStatus` -- Working (internal)
7. `toggleOutletActive` -- Working

**Actions (8) - All working:**
1. `discoverK3MartOutlets` -- Working
2. `syncK3MartStock` -- Working
3. `syncK3MartSales` -- Working
4. `fetchOutletDashboard` -- Working
5. `submitStockFlow` -- Working (with retry)
6. `submitBulkStockIns` -- Working
7. `cancelStockFlow` -- Working
8. `fetchStockFlowHistory` -- Working
9. `fetchStockFlowDetail` -- Working
10. `verifySubmissionStatuses` -- Working
11. `refreshOutlets` -- Working

### K3Mart API Endpoints (All Configured)
| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/vendor-stock/detail/{productId}` | GET | Get stock per outlet per product | Working |
| `/vendor-sales/get-all` | GET | Get sales transactions | Working |
| `/vendor-profile/get-outlet` | GET | Get outlet list | Working |
| `/vendor-stock/get-dashboard` | GET | Get outlet dashboard (stock + price) | Working |
| `/vendor-stock-flow/get-list` | GET | Get stock flow history | Working |
| `/vendor-stock-flow/get-list-by-id` | GET | Get stock flow detail | Working |
| `/vendor-stock-flow/add` | POST | Submit stock-in/out | Working |
| `/vendor-stock-flow/cancel/{id}` | PUT | Cancel pending stock flow | Working |

**Key API detail:** Stock-in payload requires `currentStock` and `currentPrice` from fresh dashboard. The existing `submitStockFlow` action handles this by calling `fetchOutletDashboard` before submitting.

## Open Questions

1. **Auto-suggest algorithm: simple multiplier vs rolling average?**
   - What we know: User specified weekday baseline, weekend/holiday at ~2.5x weekday
   - What's unclear: Should we use `restockTargets.weekdayTarget/weekendTarget` as the basis, or calculate from `avgDailySales7d`?
   - Recommendation: Use `restockTargets` as the base when available; fall back to `avgDailySales7d * demandMultiplier` when no target exists. Simple multiplier approach as specified by user.

2. **"Copy last week" for weeks with no previous data?**
   - What we know: Button copies all saved values regardless of confirm status
   - What's unclear: What happens if last week has no plans (first use scenario)?
   - Recommendation: Show disabled button with tooltip "No plans from previous week" when previous week is empty.

3. **Per-outlet product pricing -- where does the default come from?**
   - What we know: Menu product price is default; "Custom pricing" toggle enables overrides
   - What's unclear: Where is the "menu product price" for K3Mart? The `K3MART_CONFIG.productMap` has hardcoded prices (80000 / 45000), and `externalStockSnapshots` has `price` from API.
   - Recommendation: Use `K3MART_CONFIG.productMap` price as the default. The new `k3martOutletProductSettings.customPrice` overrides it. Price sanity check: if neither exists, block API call with "Price not configured" error.

4. **Confirm day plan edit-after-confirm flow:**
   - What we know: Editing a confirmed day is allowed; button changes to "Update Kitchen"
   - What's unclear: Does "Update Kitchen" re-confirm AND re-push delta? Does it call `confirmDayPlan` again (which only processes drafts)?
   - Recommendation: When editing a confirmed plan, the mutation should allow patching confirmed plans (not just drafts). On "Update Kitchen": patch the plan, recalculate kitchen delta, and update `productionProductTargets` with the new delta.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `convex/k3martCockpit/queries.ts`, `mutations.ts` -- 6 queries, 7 mutations fully reviewed
- Codebase analysis: `convex/integrations/k3mart/adapter.ts` -- 11 actions fully reviewed
- Codebase analysis: `convex/integrations/k3mart/config.ts` -- API types and configuration
- Codebase analysis: `convex/schema.ts` lines 1251-1315 -- `k3martDispatchPlans` and `k3martStockMovements` tables
- Codebase analysis: `src/pages/K3MartCockpit.tsx` -- 6 BACKLOG stubs identified and cataloged
- Codebase analysis: `src/components/k3martCockpit/` -- 15 components reviewed
- Codebase analysis: `src/hooks/convex/useK3MartCockpit.ts` -- 18 hooks reviewed
- Codebase analysis: `docs/apiS/stock in stock out api documentation.md` -- K3Mart API documentation with payload examples
- Codebase analysis: `docs/reviews/staffreview-k3mart-cockpit-2026-02-11.md` -- Prior staff review (critical issues resolved)

### Secondary (MEDIUM confidence)
- Codebase analysis: `tests/convex/k3martCockpit.test.ts` -- Existing test suite with fixtures
- Codebase analysis: `src/lib/indonesianHolidays.ts` -- Holiday system structure

### Tertiary (LOW confidence)
- None -- all findings are from direct codebase analysis

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all dependencies are existing project libraries, no new packages
- Architecture: HIGH -- extensive existing codebase with clear patterns
- Pitfalls: HIGH -- identified from codebase analysis + prior staff review
- Backend completeness: HIGH -- 6 queries, 7 mutations, 11 actions already working
- Frontend scope: HIGH -- clear BACKLOG stubs + explicit CONTEXT.md decisions

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable codebase, no external dependencies changing)
