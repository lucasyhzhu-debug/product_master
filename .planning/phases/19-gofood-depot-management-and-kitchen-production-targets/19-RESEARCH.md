# Phase 19: GoFood Depot Management - Research

**Researched:** 2026-02-22
**Domain:** GoFood depot stock management, inventory transfers, restock suggestions
**Confidence:** HIGH

## Summary

Phase 19 builds a GoFood depot management cockpit on top of existing infrastructure: `externalOutlets` (3 GoBiz outlets), `productInventory` (finished goods tracking), `gofoodDepotStock` (legacy per-product stock), and `storageLocations`. The core work is: (1) a new GoFood Depot page per outlet with cockpit-style stock display, (2) per-outlet product mappings, (3) stock transfers between `productInventory` locations, (4) restock suggestions with specific day-of-week rules, (5) a seed-not-run warning, and (6) a redesigned Finished Goods tab on the Inventory page.

The codebase already has strong foundations: `productInventory` mutations for add/adjust/drawdown/gofood_sale, `getStockOverview` query, `processGofoodSales` internal mutation that resolves `outlet.linkedStorageLocationId`, and the K3Mart Cockpit as a UI pattern reference. The main gaps are: (a) `gofoodDepotStock` has no `outletId` field (blocking schema migration), (b) `productInventoryTransactions` has no `transfer` type, (c) no GoFood depot page exists yet, (d) the Finished Goods tab needs a major redesign, and (e) no `/frontend-design` skill exists despite being referenced in the context decisions.

**Primary recommendation:** Start with schema migration (add `outletId` to `gofoodDepotStock`, add `transfer` transaction type to `productInventoryTransactions`), then build the stock transfer mutation in `productInventory`, then build the depot page following K3Mart Cockpit patterns, then redesign the Finished Goods tab.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Model after K3Mart Cockpit: cockpit-style one-glance dashboard per depot
- Each depot has its own page/view (navigation between depots via depot selector or list)
- Single scrollable page per depot -- not tabbed -- with sections stacked: cockpit table at top, mapping section below
- The seed warning (when `seedFinishedGoodsLocations` has not been run) is a **full-page blocker**: nothing else loads until the seed is run
- Cockpit table primary number: current remaining (largest, most prominent); secondary: sold today; same visual hierarchy as K3Mart Cockpit
- Restock suggestion shown as an additional column: "Restock Tomorrow: X"
- Mapping configuration is a section/tab within the depot page (not a separate admin area)
- New depot auto-populated silently with previous depot's mapping -- admin sees it pre-filled and edits if needed
- Mapping shows: each GoFood product + which `menuProduct` in the system it maps to; unmapped products are flagged visually
- **Explicit Save button** for mapping changes (not auto-save)
- Starting stock is **inline editable** directly in the cockpit table -- designed to be updated multiple times throughout the day as stock is replenished
- Visual cue to indicate editability (e.g., pencil icon, input styling)
- Low-stock alert (< 5 total remaining) appears as: (1) Alert banner at top of depot page, (2) Red row highlight on affected products
- "Last synced: [time]" shown on the depot page
- Depot stock (GoFood + K3Mart) is **linked to and constrained by the existing `productInventory` system**
- "Add stock to depot" = stock transfer: admin selects source location -> quantity -> destination (depot's linked storage location); system debits source `productInventory` and credits depot location
- Cockpit table shows per product: available inventory across all locations (from `productInventory`), current depot stock, transfer action ("Move stock here") that is **blocked if source inventory is insufficient**
- K3Mart outlets follow the same inventory-linked stocking pattern
- **No negative transfers allowed:** UI validates available stock before confirming
- Restock suggestion column: "Restock Tomorrow: X" with hover tooltip showing calculation breakdown
- Calculation rules: n+1 of 3-day average; n+2 on Friday and Saturday; Monday resets to previous Thursday's total
- Also extend existing Dispatch Planner page to show GoFood depot restock data (additional deliverable)
- Finished Goods tab redesign: becomes **primary screen** of Inventory page; Packaging and Ingredients become secondary tabs
- Hero section with grand total per product type across ALL locations, location-type breakdown (Internal / GoFood Outlets / K3Mart + Consignment)
- Grouping toggle: product view vs. location view (both modes must be specced before implementation)
- Per-row stock movement actions: "Move To" and "Receive From" mini-forms, plus global "Move Stock" modal
- All locations shown by default (even zero-stock); per-location toggle to manually hide; zero-stock rows styled distinctly but never hidden

### Claude's Discretion
- Exact cockpit table column order and widths
- Loading skeleton design
- Empty state when no GoFood sales data exists yet
- Specific color tokens for low-stock highlighting (red/orange)
- Tooltip trigger design (hover vs. info icon click)
- Visual design of the hero summary numbers (cards vs. stat row)
- Exact styling of zero-stock rows and hidden-location toggle

### Deferred Ideas (OUT OF SCOPE)
- **Multi-platform depot management** (Tokopedia, Shopee, etc.) -- design with extensibility in mind but don't implement multi-platform now
- **Inline-editable 7-day restock table across all GoFood + K3Mart locations** -- significant Dispatch Planner expansion, not Phase 19 scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GF-02 | Admin can configure per-outlet product mappings for each GoFood depot (outlet selector in mapping tab; new outlets default to previous depot's mapping) | Existing `externalOutlets` table has 3 GoBiz outlets with `linkedStorageLocationId`. `externalRevenueItems` has `linkedMenuProductId` for auto-matching. Need new `gofoodProductMappings` table or per-outlet mapping rows. Auto-matching via `autoMatchMenuProduct` already exists but is global, not per-outlet. |
| GF-03 | Each GoFood depot displays current stock level; alert fires when any depot drops below 5 total products remaining | `productInventory` already tracks stock per `(menuProductId, locationId)`. Each outlet has a `linkedStorageLocationId`. Query `productInventory` by location to get depot stock. Low-stock threshold of 5 from `productInventorySettings.globalLowStockThreshold`. |
| GF-04 | Depot restock suggestion shown per depot: n+1 avg last 3 days; n+2 on Fri/Sat; Monday reset to previous Thursday's total | `externalRevenue` + `externalRevenueItems` have per-outlet sales data with timestamps. Can compute 3-day average from `externalRevenueItems` filtered by `outletId` and date range. Day-of-week logic is pure computation. |
| GF-05 | When `seedFinishedGoodsLocations` has not been run, an admin-visible warning appears on the GoFood depot page instead of a silent skip | Check: any `externalOutlets` with `source="gobiz"` that have `linkedStorageLocationId === undefined`. If any exist, show full-page blocker. Seed mutation exists at `convex/migrations/seedFinishedGoodsLocations.ts`. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Real-time serverless backend | Project standard |
| React | ^19.2.0 | UI framework | Project standard |
| TypeScript | ~5.9 | Type safety | Project standard |
| Tailwind CSS | ^4.1.18 | Styling | Project standard |
| shadcn/ui | latest | Accessible UI components | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Lucide React | latest | Icons | All UI icons |
| Sonner | latest | Toast notifications | Stock alerts, save confirmations |
| Framer Motion | latest | Animations | Optional: low-stock pulse animation |

### Alternatives Considered
None -- this phase uses only existing project stack. No new libraries needed.

**Installation:**
```bash
# No new packages required
```

## Architecture Patterns

### Recommended Project Structure
```
convex/
  gofoodDepot/
    queries.ts          # Extended: per-outlet depot stock, restock suggestions
    mutations.ts        # Extended: per-outlet operations
  productInventory/
    mutations.ts        # Extended: transferStock mutation
    queries.ts          # Extended: getStockOverviewGrouped
  schema.ts             # Modified: gofoodDepotStock gains outletId + composite index,
                        #           productInventoryTransactions gains "transfer" type

src/
  pages/
    GoFoodDepotManager.tsx   # NEW: depot page with outlet selector
    InventoryManager.tsx     # MODIFIED: tab order, Finished Goods becomes default
  components/
    gofoodDepot/             # NEW: depot cockpit components
      DepotCockpitTable.tsx
      DepotMappingSection.tsx
      DepotStockTransferDialog.tsx
      SeedWarningBlocker.tsx
    inventory/
      FinishedGoodsTab.tsx   # MAJOR REWRITE: hero section, grouping toggle, transfer actions
      StockTransferModal.tsx # NEW: global "Move Stock" modal
  hooks/convex/
    useGoFoodDepot.ts        # NEW: depot data hooks
```

### Pattern 1: K3Mart Cockpit Reference Pattern
**What:** The GoFood depot page follows the K3Mart Cockpit layout: one-glance dashboard per outlet with data grid, action buttons, and sync status.
**When to use:** Building any depot/outlet cockpit page.
**Key files to reference:**
- `src/pages/K3MartCockpit.tsx` -- overall page structure, outlet cards, bulk actions
- `src/components/k3martCockpit/OutletCardGrid.tsx` -- outlet navigation cards
- `src/components/k3martCockpit/InventorySourcePanel.tsx` -- multi-location inventory display
- `src/components/k3martCockpit/OutletCard.tsx` -- per-outlet summary card

### Pattern 2: ProductInventory Transfer Mutation
**What:** Stock transfer = debit source + credit destination + two audit log entries, all in a single mutation (atomic).
**When to use:** Moving finished goods between storage locations.
**Example:**
```typescript
// New mutation in convex/productInventory/mutations.ts
export const transferStock = mutation({
  args: {
    token: v.string(),
    menuProductId: v.id("menuProducts"),
    sourceLocationId: v.id("storageLocations"),
    destinationLocationId: v.id("storageLocations"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);
    // 1. Validate source has sufficient stock (no negatives)
    // 2. Debit source productInventory row
    // 3. Credit destination productInventory row (upsert)
    // 4. Log "transfer" transaction for source (negative qty)
    // 5. Log "transfer" transaction for destination (positive qty)
    // Fields: reason = "Transfer to {destName}", transferPairLocationId = other location
  },
});
```

### Pattern 3: Seed Warning Detection
**What:** Query checks if any GoBiz outlet lacks `linkedStorageLocationId`. If so, UI renders a full-page blocker instead of the depot content.
**When to use:** Any page that depends on seed data being initialized.
**Example:**
```typescript
// Query: check if seed has been run
export const isSeedRequired = query({
  args: {},
  handler: async (ctx) => {
    const gobizOutlets = await ctx.db
      .query("externalOutlets")
      .withIndex("by_source", (q) => q.eq("source", "gobiz"))
      .collect();
    // Also check productInventorySettings
    const settings = await ctx.db.query("productInventorySettings").first();
    return {
      seedRequired: gobizOutlets.some(o => !o.linkedStorageLocationId) || !settings,
      unlinkedOutlets: gobizOutlets.filter(o => !o.linkedStorageLocationId).map(o => o.name),
    };
  },
});
```

### Pattern 4: Restock Suggestion Calculation
**What:** Pure function computing restock amount based on day-of-week rules.
**When to use:** Displaying restock suggestions in cockpit table and Dispatch Planner.
**Example:**
```typescript
// Pure helper function (no ctx dependency)
function computeRestockSuggestion(
  salesLast3Days: number[], // [day-3, day-2, day-1]
  dayOfWeek: number,        // 0=Sun, 1=Mon, ..., 6=Sat
  previousThursdayTotal: number
): { suggestion: number; breakdown: string } {
  if (dayOfWeek === 1) { // Monday
    return { suggestion: previousThursdayTotal, breakdown: "Monday reset to Thu total" };
  }
  const avg3d = salesLast3Days.reduce((s, v) => s + v, 0) / Math.max(salesLast3Days.length, 1);
  const buffer = (dayOfWeek === 5 || dayOfWeek === 6) ? 2 : 1; // Fri/Sat = n+2
  const suggestion = Math.ceil(avg3d + buffer);
  const label = buffer === 2 ? "weekend" : "weekday";
  return {
    suggestion,
    breakdown: `3-day avg: ${avg3d.toFixed(1)} + ${buffer} (${label}) = ${suggestion}`,
  };
}
```

### Anti-Patterns to Avoid
- **Querying `gofoodDepotStock` without `outletId`:** After migration, all queries must filter by outlet. The legacy `by_menuProduct` index is insufficient for per-outlet tracking.
- **Inline stock editing without optimistic update:** Starting stock changes should feel instant. Use Convex mutation + let reactive query update the UI.
- **Building separate transfer logic per depot type:** GoFood and K3Mart must share the same `productInventory.transferStock` mutation. Don't duplicate transfer logic.
- **Negative transfer amounts:** The transfer mutation must validate `source.quantity >= transferQuantity` and throw a clear error. UI must also pre-validate.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-outlet stock levels | Custom stock tracking table | `productInventory` filtered by `locationId` | Each outlet already has a `linkedStorageLocationId`; `productInventory` is the source of truth |
| Product auto-matching | Custom name-matching for GoFood products | Existing `autoMatchMenuProduct` internal mutation | Already handles price + name matching with confidence levels |
| Stock transfer audit trail | Separate transfer log table | `productInventoryTransactions` with new `transfer` type | Single audit trail for all stock changes; consistent with existing `add`/`drawdown`/`adjust`/`gofood_sale` |
| GoFood outlet discovery | Hardcoded outlet list | `externalOutlets` table filtered by `source="gobiz"` | Outlets are already seeded from `GOBIZ_OUTLET_SEED` config |
| Day-of-week determination | Manual date parsing | `new Date().getDay()` with WIB offset | Already used throughout codebase (K3Mart, Restock Planner) |

**Key insight:** Most of the infrastructure for per-outlet tracking already exists via `externalOutlets.linkedStorageLocationId` -> `productInventory(locationId)`. The `gofoodDepotStock` table is the legacy per-product aggregate that Phase 19 needs to extend with `outletId` for backward compatibility, but the real source of truth for depot stock should be `productInventory`.

## Common Pitfalls

### Pitfall 1: Dual Stock Tables Confusion
**What goes wrong:** `gofoodDepotStock` and `productInventory` both track GoFood depot stock, leading to inconsistency.
**Why it happens:** `gofoodDepotStock` was built in Phase 17 before `productInventory` existed. Both `recordShipment` (writes to `gofoodDepotStock`) and `processGofoodSales` (writes to both) exist.
**How to avoid:** Decide on a migration path. Option A: Make `productInventory` the sole source of truth and have `gofoodDepotStock` become a read-through cache. Option B: Keep both but always update them atomically. **Recommendation: Option A** -- `productInventory` is already updated by `processGofoodSales`, and the depot page should read from `productInventory.quantity` at the outlet's `linkedStorageLocationId`.
**Warning signs:** If cockpit table shows different numbers than Finished Goods tab for the same product at the same location.

### Pitfall 2: Schema Migration Order
**What goes wrong:** Frontend code references new `outletId` field or `transfer` transaction type before schema is deployed.
**Why it happens:** Convex requires schema changes to be deployed before any code references them.
**How to avoid:** Wave 1 must be schema-only: deploy the schema change, then build mutations, then build UI.
**Warning signs:** Type errors mentioning missing fields on `gofoodDepotStock` or `productInventoryTransactions`.

### Pitfall 3: Missing WIB Timezone Handling
**What goes wrong:** Restock suggestions use UTC dates instead of WIB (UTC+7), causing sales to be attributed to wrong days.
**Why it happens:** `Date.now()` returns UTC; Indonesia is UTC+7.
**How to avoid:** Reuse existing WIB helpers: `new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)` for WIB date. This pattern is already established in `gofoodDepot/mutations.ts`, `K3MartCockpit.tsx`.
**Warning signs:** Restock suggestions reset at midnight UTC instead of midnight WIB.

### Pitfall 4: Convex Hooks Before Conditional Returns
**What goes wrong:** React hooks called after early returns (e.g., `if (seedRequired) return <SeedWarning />`).
**Why it happens:** Seed check returns early before hooks for stock data are called.
**How to avoid:** Call ALL hooks unconditionally at the top of the component. Use Convex `"skip"` pattern for conditional queries. Render seed warning after all hooks are called.
**Warning signs:** React error: "Rendered more hooks than during the previous render."

### Pitfall 5: Transfer Mutation Race Condition
**What goes wrong:** Two simultaneous transfers from the same source location can overdraw stock.
**Why it happens:** Read-then-write pattern without optimistic concurrency control.
**How to avoid:** Convex mutations are serialized per-document thanks to OCC (Optimistic Concurrency Control). The existing `productInventory` read-then-patch pattern is safe in Convex -- if a concurrent mutation modifies the same row, Convex automatically retries. Just validate stock >= transfer quantity within the mutation.
**Warning signs:** Stock going negative despite "no negative transfers" rule.

### Pitfall 6: Product Mapping vs. Revenue Item Matching
**What goes wrong:** Confusing per-outlet product mappings (GF-02) with the existing `autoMatchMenuProduct` which matches GoFood product names to `menuProducts`.
**Why it happens:** These serve different purposes. `autoMatchMenuProduct` is for the GoBiz sync pipeline (linking external revenue items to internal menu products). Per-outlet product mappings (GF-02) let admins configure which products each outlet sells.
**How to avoid:** Keep them separate. The mapping tab (GF-02) configures which `menuProducts` are active at each outlet. The auto-match system links incoming GoBiz data to those `menuProducts`. They can coexist.
**Warning signs:** Admin edits a mapping and expects it to change how GoBiz sync matches products.

## Code Examples

### Existing: GoFood Outlets Discovery
```typescript
// From convex/integrations/gobiz/config.ts
export const GOBIZ_OUTLET_SEED = [
  { externalId: "G293156297", name: "Legato Goldfinch", source: "gobiz" },
  { externalId: "G347061572", name: "GoFood Crystal", source: "gobiz" },
  { externalId: "G958262444", name: "Legato Tamtem", source: "gobiz" },
];

// Query outlets from DB:
const gobizOutlets = await ctx.db
  .query("externalOutlets")
  .withIndex("by_source", (q) => q.eq("source", "gobiz"))
  .collect();
```

### Existing: ProductInventory Stock at Location
```typescript
// From convex/productInventory/queries.ts - getStockOverview
const rows = await ctx.db
  .query("productInventory")
  .withIndex("by_location", (q) => q.eq("locationId", args.locationId))
  .collect();
```

### Existing: GoFood Sales Auto-Deduction with Outlet Resolution
```typescript
// From convex/productInventory/mutations.ts - processGofoodSales
const outlet = await ctx.db.get(item.outletId);
const linkedLocationId = outlet?.linkedStorageLocationId ?? null;
if (!linkedLocationId) { /* skip */ }
// Then debit productInventory at that location
```

### Existing: K3Mart Cockpit Hook Pattern
```typescript
// From src/pages/K3MartCockpit.tsx
import {
  useConvexOutletStockSummary,
  useConvexProductionReadiness,
  useConvexInventorySources,
} from '@/hooks/convex';
```

### Schema Migration: gofoodDepotStock
```typescript
// Add outletId field + composite index
gofoodDepotStock: defineTable({
  menuProductId: v.id("menuProducts"),
  outletId: v.optional(v.id("externalOutlets")),  // NEW: per-outlet tracking
  quantity: v.number(),
  stickerDeficit: v.optional(v.number()),
  lastUpdated: v.number(),
})
  .index("by_menuProduct", ["menuProductId"])
  .index("by_outlet_product", ["outletId", "menuProductId"]),  // NEW composite index
```

### Schema Migration: productInventoryTransactions
```typescript
// Add "transfer" to transactionType union
productInventoryTransactions: defineTable({
  // ... existing fields ...
  transactionType: v.union(
    v.literal("add"),
    v.literal("drawdown"),
    v.literal("gofood_sale"),
    v.literal("adjust"),
    v.literal("transfer"),      // NEW
  ),
  // ... existing fields ...
  transferPairLocationId: v.optional(v.id("storageLocations")),  // NEW: links source<->dest
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `gofoodDepotStock` per-product only (no outlet) | `productInventory` per-product-per-location with `linkedStorageLocationId` on outlets | Phase 17.1 | Depot stock should read from `productInventory` at the outlet's linked location |
| `recordShipment` writes to `gofoodDepotStock` only | `processGofoodSales` writes to both `gofoodDepotStock` AND `productInventory` | Phase 17.1 | Both systems updated, but `productInventory` is the source of truth |
| Manual stock counting at depot | Auto-deduction via GoBiz sync | Phase 17 | Sales are automatically deducted; starting stock still set manually |

**Deprecated/outdated:**
- `gofoodDepotStock` as sole stock tracker: `productInventory` is now the source of truth for depot stock levels. `gofoodDepotStock` should be treated as a secondary/cache table.

## Open Questions

1. **Product mapping table design**
   - What we know: GF-02 requires per-outlet product mappings (which `menuProducts` each outlet sells, linked to GoFood product names).
   - What's unclear: Should this be a new `gofoodOutletProductMappings` table, or extend existing `externalRevenueItems.linkedMenuProductId` auto-matching? The context says "each GoFood product + which menuProduct it maps to; unmapped products are flagged visually."
   - Recommendation: Create a new `gofoodOutletProductMappings` table: `{ outletId: Id<"externalOutlets">, externalProductName: string, menuProductId: v.optional(v.id("menuProducts")), isActive: boolean }`. This keeps mappings explicit and editable per-outlet, separate from the auto-match pipeline.

2. **`/frontend-design` skill does not exist**
   - What we know: CONTEXT.md references "Use the `/frontend-design` skill during planning waves to produce a complete holistic spec before implementation." The skill is not found in `.agent/skills/` or `.claude/agents/`.
   - What's unclear: Whether this skill should be created as part of Phase 19 or if it refers to a manual process.
   - Recommendation: Treat `/frontend-design` as a planning directive rather than an automated skill. The planner should include a "UI Design" wave before implementation that produces component specs, wireframe descriptions, and prop interfaces for all new components (GoFood depot page, Finished Goods redesign).

3. **gofoodDepotStock migration vs. deprecation**
   - What we know: The context says "gofoodDepotStock schema migration (add outletId, composite index) is blocking dependency." But `productInventory` at `linkedStorageLocationId` already provides per-outlet per-product stock.
   - What's unclear: Whether `gofoodDepotStock` should be migrated and kept active, or deprecated in favor of `productInventory`.
   - Recommendation: Add `outletId` to `gofoodDepotStock` for backward compatibility with existing `recordShipment` and `processSyncSales` flows, but make the depot cockpit UI read from `productInventory` at the outlet's linked location. This avoids a risky rewrite of the GoBiz sync pipeline while establishing `productInventory` as the single source of truth for the new UI.

4. **Consignment section visibility**
   - What we know: Context says "Design the Consignment bucket in the hero and groupings now. Section renders only when consignment locations exist (Phase 21 will add them). Until Phase 21: section is hidden."
   - What's unclear: No consignment `storageLocations` exist yet (they come in Phase 21).
   - Recommendation: Include the consignment bucket in the hero section design but conditionally render it: `if (consignmentLocations.length > 0)`. This is purely a frontend conditional -- no backend work needed.

5. **Dispatch Planner extension scope**
   - What we know: Context says "extend existing Dispatch Planner page to show GoFood depot restock data."
   - What's unclear: How deeply to integrate -- add a GoFood section to the existing `RestockPlanner.tsx`, or link to the depot page?
   - Recommendation: Add a GoFood outlet section to the Restock Planner page that shows the same restock suggestion numbers computed for the depot page. Reuse the `computeRestockSuggestion` pure function. This is a read-only addition (no new mutations needed for the planner).

## Existing Infrastructure Map

### Tables Involved
| Table | Role in Phase 19 | Modification Needed |
|-------|-------------------|---------------------|
| `externalOutlets` | GoFood outlet registry (3 outlets: Crystal, Goldfinch, Tamtem) | None -- read only |
| `storageLocations` | Physical/virtual locations linked to outlets | None -- read only |
| `productInventory` | Source of truth for finished goods stock per product per location | None for schema; new `transferStock` mutation |
| `productInventoryTransactions` | Audit trail for all stock changes | Add `transfer` type + `transferPairLocationId` field |
| `productInventorySettings` | Global config (threshold=5, auto-advance) | None |
| `gofoodDepotStock` | Legacy per-product stock (needs outletId) | Add `outletId` + composite index |
| `gofoodDepotShipments` | Shipment audit log | None |
| `externalRevenue` | Per-outlet sales data (source of restock calculation) | None -- read only |
| `externalRevenueItems` | Per-item sales detail with `linkedMenuProductId` | None -- read only |
| `menuProducts` | Product catalog | None -- read only |
| NEW: `gofoodOutletProductMappings` | Per-outlet product mapping config | NEW table |

### Existing Mutations to Extend
| Mutation | File | Change Needed |
|----------|------|---------------|
| `recordShipment` | `convex/gofoodDepot/mutations.ts` | Update to write `outletId` to `gofoodDepotStock` (currently hardcoded to single Goldfinch depot) |
| `processSyncSales` | `convex/gofoodDepot/mutations.ts` | Update to filter `gofoodDepotStock` by `outletId` |
| `processGofoodSales` | `convex/productInventory/mutations.ts` | Already per-outlet -- no changes needed |

### Existing Queries to Extend
| Query | File | Change Needed |
|-------|------|---------------|
| `getDepotStock` | `convex/gofoodDepot/queries.ts` | Filter by `outletId` |
| `getGoFoodDailyOrder` | `convex/gofoodDepot/queries.ts` | Filter by `outletId` |
| `getStockOverview` | `convex/productInventory/queries.ts` | May need grouping support for Finished Goods redesign |

### GoFood Outlet -> Storage Location Mapping (from seed)
| Outlet | External ID | Linked Storage Location | Location Type |
|--------|-------------|------------------------|---------------|
| GoFood Crystal | G347061572 | Office (isDefault=true) | office |
| Legato Goldfinch | G293156297 | Legato Goldfinch | venue |
| Legato Tamtem | G958262444 | Tamtem Depot | depot |

**Important:** Crystal's linked location is the Office (default). Per context, Crystal should get a **virtual** GoFood storage location (depot-type) to ring-fence GoFood allocation from direct-order stock. This requires either (a) creating a new "Crystal GoFood" storage location in the seed, or (b) documenting this as a Phase 19 seed extension.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `convex/schema.ts` -- all table definitions and indexes
- Codebase inspection: `convex/gofoodDepot/mutations.ts` -- `recordShipment`, `processSyncSales`, `adjustDepotStock`
- Codebase inspection: `convex/gofoodDepot/queries.ts` -- `getDepotStock`, `getGoFoodDailyOrder`, `getGoldfinchStickerInventory`
- Codebase inspection: `convex/productInventory/mutations.ts` -- `addStock`, `adjustStock`, `fulfillFromInventory`, `processGofoodSales`, `transferStock` (needs creation)
- Codebase inspection: `convex/productInventory/queries.ts` -- `getStockOverview`, `getTransactions`, `getLowStockAlerts`
- Codebase inspection: `convex/inventory/queries.ts` -- `getLocationInventory`, `getInventoryReport`
- Codebase inspection: `convex/migrations/seedFinishedGoodsLocations.ts` -- seed logic and outlet-location mapping
- Codebase inspection: `convex/integrations/gobiz/config.ts` -- `GOBIZ_OUTLET_SEED`, 3 outlets
- Codebase inspection: `convex/integrations/gobiz/adapter.ts` -- GoBiz sync pipeline, auto-matching, per-outlet sales deduction
- Codebase inspection: `src/pages/K3MartCockpit.tsx` -- UI reference pattern
- Codebase inspection: `src/pages/RestockPlanner.tsx` -- Dispatch Planner to extend
- Codebase inspection: `src/components/inventory/FinishedGoodsTab.tsx` -- current implementation to redesign

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions -- user requirements and UX decisions

### Tertiary (LOW confidence)
- `/frontend-design` skill reference -- does not exist in codebase, unclear if it's a planned skill or a naming error

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all existing project libraries, no new dependencies
- Architecture: HIGH -- patterns established by K3Mart Cockpit, productInventory system well-understood
- Pitfalls: HIGH -- dual stock table issue identified, migration order clear, WIB timezone patterns documented
- Product mapping: MEDIUM -- new table needed, design is straightforward but needs planner validation
- Finished Goods redesign: MEDIUM -- scope is large (hero section, grouping toggle, transfer modals), needs careful UI spec before implementation

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (stable domain, no external library changes)
