# Phase 29: Consignment Settlements - Research

**Researched:** 2026-02-28
**Domain:** Consignment outlet management, manual settlement entry, revenue bridging
**Confidence:** HIGH

## Summary

Phase 29 implements a self-contained consignment management system within the Sales Analytics page. The core work involves: (1) merging two existing tables (`dispatchConsignmentOutlets` and `consignmentOutlets`) into one unified consignment outlet table, (2) building CRUD for outlet management with revenue sharing configuration, (3) creating settlement entry with auto-calculated rev share math, (4) bridging settlements to `externalRevenue` for Sales Analytics visibility, and (5) adding a new "Consignment" tab in Sales Analytics.

Both `consignmentOutlets` and `consignmentSettlements` tables already exist in `convex/schema.ts` (lines 1542-1578) — the schema is partially scaffolded but needs field modifications (replace `mode` with `type`, add `linkedRevenueId` to settlements). The `dispatchConsignmentOutlets` table (lines 1275-1290) must be merged into the unified table, requiring updates to `dispatchPlanner/queries.ts` and `dispatchPlanner/mutations.ts` which reference it extensively. No `convex/consignment/` backend module exists yet — it must be created from scratch.

**Primary recommendation:** Build `convex/consignment/` (mutations.ts + queries.ts) as a new backend module, update the `consignmentOutlets` schema to replace `mode` with `type` (cafe/retail/event), add `linkedRevenueId` to `consignmentSettlements`, migrate `dispatchConsignmentOutlets` data to the unified table, and build the ConsignmentTab frontend component following established Sales Analytics tab patterns.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Single form dialog: select outlet, pick date range, enter total revenue
- Auto-calculated preview of rev share amount and Frollie payment shown inline before save
- Manual entry only — admin enters revenue from their own records/forms (no pre-fill from synced data)
- Edit allowed on pending settlements; settlement locks once marked "Paid"
- "Consignment" is a single channel with outlets underneath — same pattern as GoFood (one channel, multiple outlets)
- Merge `dispatchConsignmentOutlets` and `consignmentOutlets` into one unified consignment outlet table — one source of truth for both dispatch planning and settlement tracking
- Outlet types: `cafe`, `retail`, `event` (replaces `mode` field with `type`)
- Event-type outlets auto-archive (auto-deactivate) after their settlement is marked paid — reduces clutter from one-off bazaars/pop-ups
- Required fields for outlet creation: name, revSharePercent, type
- Optional fields: address, contactName, notes
- Consignment management lives as a tab within Sales Analytics (alongside BigSeller panel, GrabFood panel, Settings)
- Not a separate page — extends the unified channel management concept
- Each outlet displayed as a card showing running totals: Total Revenue, Total Rev Share, Frollie Payment, Outstanding Balance
- Click/expand outlet card to see settlement history
- Settlement history uses timeline cards (vertical chronological, newest first) — not table rows
- Global summary banner at top of consignment tab: total consignment revenue, total outstanding, total paid across all outlets
- One `externalRevenue` record per settlement (total amount, no per-product breakdown)
- Source = `"consignment"`, outletId links to the consignment outlet's externalOutlet record
- Bridge on settlement creation — revenue appears in Sales Analytics immediately (always confirmed for manual consignment)
- Editing a settlement auto-syncs the linked externalRevenue record — analytics always current
- Deleting or voiding: update externalRevenue accordingly

### Claude's Discretion
- Date period picker implementation (arbitrary range vs month presets — choose best UX pattern matching existing app)
- Exact card layout and timeline card design
- Auto-archive timing for event outlets (immediate on paid, or end-of-day)
- Summary banner stat formatting and color scheme
- Use `/frontend-design` skill for all UI component design

### Deferred Ideas (OUT OF SCOPE)
- K3Mart confirmed/unconfirmed revenue classification — outlet inventory = unconfirmed sales, transaction data = confirmed. Noted for Phase 30 analytics enhancement.
- Per-product line items in settlement entry — allow admin to enter product breakdown (10x Original, 5x Bite) for granular per-product analytics across channels. Future enhancement after Phase 29 proves the flow.
- Automated consignment settlement generation from K3Mart sync data — if K3Mart outlets become consignment-like, auto-generate settlements from API data.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CON-01 | Admin can manage consignment outlets (CRUD) with configurable rev sharing percentage per outlet | Schema already has `consignmentOutlets` table with `revSharePercent`. Need new `convex/consignment/mutations.ts` with CRUD (create, update, delete/archive). Merge `dispatchConsignmentOutlets` data. Use `protectedMutation` pattern with admin role. |
| CON-02 | Admin can enter consignment settlement records: select outlet, enter period (date range), enter total revenue; system auto-calculates rev sharing and payment to Frollie | Schema already has `consignmentSettlements` table. Add `linkedRevenueId` field. Create settlement mutation that computes `revShareAmount = totalRevenue * revSharePercent / 100`, `frolliePayment = totalRevenue - revShareAmount`, and simultaneously inserts `externalRevenue` record. |
| CON-03 | Admin can mark settlement as paid with payment date; system tracks payment status per settlement period | Settlement status field already supports `"pending"` / `"paid"`. Add `markAsPaid` mutation that sets `status: "paid"`, `paidAt: Date.now()`. For event-type outlets, auto-set `isActive: false` on the outlet after payment. |
| CON-04 | Consignment page shows running totals per outlet and settlement history with status | Build query that aggregates settlements by outlet (SUM totalRevenue, SUM frolliePayment, filter by status for outstanding vs paid). Use on-demand action pattern (Phase 20 precedent) to avoid reactive subscription on aggregates. Frontend: outlet cards with expandable timeline. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Backend mutations, queries, schema | Project's serverless backend — all data operations go through Convex |
| React | ^19.2.0 | UI components | Project frontend framework |
| TypeScript | ~5.9 | Type safety | Project type system |
| Tailwind CSS | ^4.1.18 | Styling | Project styling framework |
| shadcn/ui | latest | UI primitives (Card, Tabs, Dialog, Badge, Button, Input) | Project component library |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Lucide React | latest | Icons (Store, Calendar, DollarSign, ChevronDown, etc.) | All icon needs |
| Sonner | latest | Toast notifications | Success/error feedback on mutations |
| date-fns or native Date | N/A | Date range formatting | Settlement period display |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom date picker | react-datepicker | Unnecessary dependency — native HTML date inputs + existing patterns sufficient |
| Recharts for per-outlet charts | SalesChart component | Deferred — no per-outlet charting in Phase 29 scope |

**Installation:**
No new packages needed. All required libraries are already in the project.

## Architecture Patterns

### Recommended Project Structure
```
convex/
├── consignment/
│   ├── mutations.ts       # CRUD: outlets, settlements, markAsPaid
│   └── queries.ts         # getOutletsWithTotals, getSettlementHistory
src/
├── components/salesAnalytics/
│   ├── ConsignmentTab.tsx          # Main tab component
│   ├── OutletCard.tsx              # Single outlet card with running totals
│   ├── SettlementTimeline.tsx      # Timeline cards for settlement history
│   ├── OutletFormDialog.tsx        # Create/edit outlet dialog
│   └── SettlementFormDialog.tsx    # Create/edit settlement dialog
├── hooks/convex/
│   └── useConsignment.ts           # Convex hooks for consignment queries/mutations
```

### Pattern 1: Revenue Bridge (Settlement → externalRevenue)
**What:** Every settlement creation simultaneously inserts an `externalRevenue` record so consignment revenue appears in Sales Analytics.
**When to use:** On every settlement create/update/delete.
**Example:**
```typescript
// In consignment/mutations.ts — settlement creation
const revShareAmount = args.totalRevenue * outlet.revSharePercent / 100;
const frolliePayment = args.totalRevenue - revShareAmount;

// Create externalRevenue record for analytics bridge
const revenueId = await ctx.db.insert("externalRevenue", {
  source: "consignment",
  outletId: outlet.externalOutletId, // links to externalOutlets record
  revenueGross: args.totalRevenue,
  revenueNet: frolliePayment,
  periodStart: args.periodStart,
  periodEnd: args.periodEnd,
  dataOrigin: "manual_entry",
  confidence: "manual",
  transactionType: "sales",
});

// Create settlement with linked revenue
const settlementId = await ctx.db.insert("consignmentSettlements", {
  outletId: args.outletId,
  periodStart: args.periodStart,
  periodEnd: args.periodEnd,
  totalRevenue: args.totalRevenue,
  revSharePercent: outlet.revSharePercent,
  revShareAmount,
  frolliePayment,
  status: "pending",
  linkedRevenueId: revenueId,
  createdBy: user.name,
  createdAt: Date.now(),
});
```

### Pattern 2: Unified Outlet Table with externalOutlets Bridge
**What:** Consignment outlets need both a `consignmentOutlets` record (for settlement tracking) AND an `externalOutlets` record (for revenue analytics linking). On outlet creation, create both and cross-link.
**When to use:** On outlet creation.
**Example:**
```typescript
// Create externalOutlets record for analytics integration
const externalOutletId = await ctx.db.insert("externalOutlets", {
  source: "consignment",
  externalId: `consignment-${Date.now()}`, // synthetic unique ID
  name: args.name,
  address: args.address,
  isActive: true,
  createdBy: user.name,
  createdAt: Date.now(),
});

// Create consignment outlet linking to externalOutlets
const outletId = await ctx.db.insert("consignmentOutlets", {
  name: args.name,
  revSharePercent: args.revSharePercent,
  type: args.type, // "cafe" | "retail" | "event"
  isActive: true,
  externalOutletId,
  address: args.address,
  contactName: args.contactName,
  notes: args.notes,
  createdBy: user.name,
  createdAt: Date.now(),
});
```

### Pattern 3: protectedMutation with Admin Role
**What:** All consignment mutations use `protectedMutation` wrapper or `requireRole` for admin-only access.
**When to use:** Every mutation in the consignment module.
**Example:**
```typescript
// Option A: requireRole pattern (used in dispatchPlanner/mutations.ts)
export const createOutlet = mutation({
  args: { token: v.string(), name: v.string(), revSharePercent: v.number(), type: v.string() },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin"]);
    // ... implementation
  },
});

// Option B: protectedMutation pattern (used in customers/mutations.ts)
export const createOutlet = protectedMutation({
  roles: ["admin"],
  args: { name: v.string(), revSharePercent: v.number(), type: v.string() },
  handler: async (ctx, args) => {
    // ctx.user available from wrapper
  },
});
```
**Recommendation:** Use `requireRole` pattern (Option A) for consistency with dispatchPlanner and existing external data modules. The `protectedMutation` wrapper is used by some modules but `requireRole` is more prevalent in integration-related code.

### Pattern 4: On-Demand Action for Aggregate Queries
**What:** Use on-demand fetch (action) instead of reactive `useQuery` for expensive aggregate computations.
**When to use:** For outlet running totals that aggregate across all settlements.
**Caveat:** For Phase 29, the settlement count per outlet will be small (< 50 per outlet). A reactive `useQuery` is acceptable here — no need for the action pattern. The query will be fast enough. Reserve the action pattern for when data volume grows.
**Decision:** Use standard `query` for `getOutletsWithTotals` — the data volume is small and real-time updates are desirable (when a settlement is created, the card should update instantly).

### Pattern 5: Event Auto-Archive on Payment
**What:** When a settlement for an event-type outlet is marked as paid, automatically set `isActive: false` on the outlet.
**When to use:** In the `markAsPaid` mutation.
**Example:**
```typescript
export const markAsPaid = mutation({
  args: { token: v.string(), settlementId: v.id("consignmentSettlements") },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["admin"]);
    const settlement = await ctx.db.get(args.settlementId);
    if (!settlement) throw new Error("Settlement not found");
    if (settlement.status === "paid") throw new Error("Already paid");

    await ctx.db.patch(args.settlementId, {
      status: "paid",
      paidAt: Date.now(),
      updatedBy: user.name,
      updatedAt: Date.now(),
    });

    // Auto-archive event outlets
    const outlet = await ctx.db.get(settlement.outletId);
    if (outlet && outlet.type === "event") {
      await ctx.db.patch(outlet._id, { isActive: false, updatedBy: user.name, updatedAt: Date.now() });
    }
  },
});
```

### Anti-Patterns to Avoid
- **Direct dispatchConsignmentOutlets reference in new code:** All new code must reference the unified `consignmentOutlets` table. Only the migration and dispatch planner update code should touch `dispatchConsignmentOutlets`.
- **Missing externalRevenue bridge:** Never create a settlement without simultaneously creating/linking the `externalRevenue` record. Revenue must always appear in Sales Analytics.
- **Editing paid settlements:** Never allow edits to settlements with `status: "paid"`. Enforce in mutation, not just UI.
- **Orphaned externalRevenue records:** When deleting a settlement, also delete/update the linked `externalRevenue` record.
- **Reactive queries for large aggregates:** While acceptable for Phase 29 (small data), avoid adding complex aggregation queries that scan all settlements across all outlets in a single reactive subscription as data grows.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form dialogs | Custom modal + form | shadcn Dialog + FormBuilder or inline form | Existing FormBuilder handles validation, field types, sections |
| Tab management | Custom tab state | shadcn Tabs (same as SalesAnalytics.tsx) | Already used — add another TabsTrigger/TabsContent |
| Date inputs | Custom date picker | HTML `<input type="date">` + Tailwind styling | No external date picker library in project; native inputs are sufficient |
| Currency formatting | Manual string formatting | `formatCurrency()` from `src/lib/utils.ts` | Already exists, handles IDR formatting |
| Auth token injection | Manual token passing | `useProtectedMutation` hook | Auto-injects session token |
| Toast notifications | Custom alert system | `toast.success()` / `toast.error()` from Sonner | Already used everywhere |

**Key insight:** This phase requires no new external dependencies. All patterns (CRUD, tabs, cards, dialogs, currency formatting, auth) are well-established in the codebase.

## Common Pitfalls

### Pitfall 1: Table Merge Migration Complexity
**What goes wrong:** Merging `dispatchConsignmentOutlets` into `consignmentOutlets` requires updating every reference in `dispatchPlanner/queries.ts` and `dispatchPlanner/mutations.ts`. The `dispatchPlans.outletId` field is typed as `v.union(v.id("externalOutlets"), v.id("dispatchConsignmentOutlets"))` — this union must be updated.
**Why it happens:** Two tables were created independently for different features (dispatch planning vs settlement tracking) and now must unify.
**How to avoid:** Plan the migration carefully in 3 steps: (1) Update schema — modify `consignmentOutlets` fields, update `dispatchPlans.outletId` union type, (2) Migrate data — copy `dispatchConsignmentOutlets` records to `consignmentOutlets`, (3) Update references — repoint all dispatch planner code from `dispatchConsignmentOutlets` to `consignmentOutlets`.
**Warning signs:** Build failures in `dispatchPlanner/` modules after schema change.

### Pitfall 2: Convex Field Removal Requires Data Stripping First
**What goes wrong:** Removing the `mode` field from `consignmentOutlets` (replaced by `type`) will fail validation if existing documents still have `mode`.
**Why it happens:** Convex strict schema validation rejects documents with extra fields not in the validator.
**How to avoid:** Two-phase approach: (1) Add `type` field alongside `mode`, deploy, (2) Run migration to strip `mode` from all documents, then remove `mode` from schema. Alternatively, if no production data exists in `consignmentOutlets`, the schema can be changed directly.
**Warning signs:** Convex deploy error: "Extra field not in validator."

### Pitfall 3: dispatchPlans.outletId Union Type
**What goes wrong:** The `dispatchPlans` table has `outletId: v.optional(v.union(v.id("externalOutlets"), v.id("dispatchConsignmentOutlets")))`. After merging, this must become `v.optional(v.union(v.id("externalOutlets"), v.id("consignmentOutlets")))`. But existing dispatch plan records reference `dispatchConsignmentOutlets` IDs.
**Why it happens:** TypedIDs in Convex encode the table name. A `Id<"dispatchConsignmentOutlets">` cannot be cast to `Id<"consignmentOutlets">`.
**How to avoid:** Either (a) keep the old union type temporarily and handle both ID types in queries, or (b) migrate existing `dispatchPlans` records to reference the new `consignmentOutlets` IDs. Option (b) is cleaner but requires a data migration step.
**Warning signs:** Type errors on `outletId` in dispatch planner queries.

### Pitfall 4: Missing externalOutlets Record for Revenue Bridge
**What goes wrong:** The `externalRevenue.outletId` field references `Id<"externalOutlets">`, not `Id<"consignmentOutlets">`. If a consignment outlet doesn't have a linked `externalOutlets` record, the revenue bridge breaks.
**Why it happens:** The revenue system was designed around platform outlets (K3Mart, GoBiz) that always have `externalOutlets` records.
**How to avoid:** On consignment outlet creation, always create a corresponding `externalOutlets` record with `source: "consignment"` and store the link in `consignmentOutlets.externalOutletId`. The existing `externalOutletId` field already supports this.
**Warning signs:** `outletId: undefined` in `externalRevenue` records.

### Pitfall 5: Hooks Order Violation in ConsignmentTab
**What goes wrong:** React hooks called conditionally (after early return for loading state) cause runtime errors.
**Why it happens:** Complex tab components with multiple queries often trigger early loading returns before all hooks are declared.
**How to avoid:** Declare ALL hooks at the top of the component, before any conditional returns. Use `"skip"` pattern for conditional queries instead of early returns.
**Warning signs:** React error: "Rendered more hooks than during the previous render."

### Pitfall 6: Settlement Edit Must Sync externalRevenue
**What goes wrong:** Admin edits a pending settlement's revenue amount but the linked `externalRevenue` record still has the old values, causing analytics to show stale data.
**Why it happens:** Update mutation patches the settlement but forgets to patch the linked revenue record.
**How to avoid:** In the update settlement mutation, always check for `linkedRevenueId` and patch the `externalRevenue` record with updated `revenueGross`, `revenueNet`, `periodStart`, `periodEnd`.
**Warning signs:** Mismatch between settlement card totals and Sales Analytics overview numbers.

## Code Examples

### Settlement Form with Live Math Preview
```typescript
// In SettlementFormDialog.tsx
function SettlementFormDialog({ outlet, onClose }: Props) {
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  // Live calculation preview
  const revShareAmount = totalRevenue * outlet.revSharePercent / 100;
  const frolliePayment = totalRevenue - revShareAmount;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        {/* Date range inputs */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Period Start</Label>
            <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div>
            <Label>Period End</Label>
            <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>

        {/* Revenue input */}
        <div>
          <Label>Total Revenue</Label>
          <Input type="number" value={totalRevenue} onChange={(e) => setTotalRevenue(Number(e.target.value))} />
        </div>

        {/* Live math preview */}
        <div className="rounded-lg bg-muted p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span>Revenue</span>
            <span>{formatCurrency(totalRevenue)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Rev Share ({outlet.revSharePercent}%)</span>
            <span className="text-amber-600">-{formatCurrency(revShareAmount)}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-semibold">
            <span>Frollie Payment</span>
            <span className="text-green-600">{formatCurrency(frolliePayment)}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### Adding Consignment Tab to SalesAnalytics.tsx
```typescript
// SalesAnalytics.tsx — extend existing tab structure
import { ConsignmentTab } from "@/components/salesAnalytics/ConsignmentTab";

// Update activeTab logic:
const activeTab = tabParam === "settings" ? "settings"
  : tabParam === "mappings" ? "mappings"
  : tabParam === "consignment" ? "consignment"
  : "overview";

// Add TabsTrigger and TabsContent:
<TabsTrigger value="consignment">Consignment</TabsTrigger>
<TabsContent value="consignment" className="mt-4">
  <ConsignmentTab />
</TabsContent>
```

### Outlet Card with Running Totals
```typescript
// OutletCard.tsx pattern
function OutletCard({ outlet, settlements, onExpand }: Props) {
  const totals = useMemo(() => {
    const totalRevenue = settlements.reduce((sum, s) => sum + s.totalRevenue, 0);
    const totalRevShare = settlements.reduce((sum, s) => sum + s.revShareAmount, 0);
    const totalFrollie = settlements.reduce((sum, s) => sum + s.frolliePayment, 0);
    const outstanding = settlements
      .filter((s) => s.status === "pending")
      .reduce((sum, s) => sum + s.frolliePayment, 0);
    return { totalRevenue, totalRevShare, totalFrollie, outstanding };
  }, [settlements]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">{outlet.name}</CardTitle>
          <Badge variant="outline">{outlet.type}</Badge>
        </div>
        <Badge variant={outlet.isActive ? "default" : "secondary"}>
          {outlet.isActive ? "Active" : "Archived"}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Stat label="Total Revenue" value={formatCurrency(totals.totalRevenue)} />
          <Stat label="Rev Share" value={formatCurrency(totals.totalRevShare)} />
          <Stat label="Frollie Payment" value={formatCurrency(totals.totalFrollie)} />
          <Stat label="Outstanding" value={formatCurrency(totals.outstanding)} highlight />
        </div>
      </CardContent>
    </Card>
  );
}
```

### Dispatch Planner Migration — Key Code Changes
```typescript
// dispatchPlanner/queries.ts — assembleConsignmentChannel
// BEFORE: queries "dispatchConsignmentOutlets"
const consignmentOutlets = await ctx.db
  .query("dispatchConsignmentOutlets")
  .withIndex("by_enabled", (q) => q.eq("isEnabled", true))
  .collect();

// AFTER: queries unified "consignmentOutlets"
const consignmentOutlets = await ctx.db
  .query("consignmentOutlets")
  .withIndex("by_active", (q) => q.eq("isActive", true))
  .collect();
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate `dispatchConsignmentOutlets` + `consignmentOutlets` | Unified `consignmentOutlets` table | Phase 29 | Single source of truth for both dispatch planning and settlement tracking |
| `mode: "automated" \| "manual"` on consignmentOutlets | `type: "cafe" \| "retail" \| "event"` | Phase 29 | Better semantics — type describes the outlet, not the integration method |
| No revenue bridge for consignment | `externalRevenue` per settlement with `source: "consignment"` | Phase 29 | Consignment revenue visible in Sales Analytics alongside GoBiz, GrabFood, BigSeller |

**Deprecated/outdated:**
- `dispatchConsignmentOutlets` table: Merged into `consignmentOutlets`. All dispatch planner code must be updated.
- `consignmentOutlets.mode` field: Replaced by `type` field with outlet classification semantics.

## Open Questions

1. **Existing production data in `dispatchConsignmentOutlets`?**
   - What we know: The table exists in schema with seed data ("Legato Tamtem", "Legato Goldfinch"). Production env may have data.
   - What's unclear: Whether there are live dispatch plans referencing `dispatchConsignmentOutlets` IDs.
   - Recommendation: Check production data before migration. If records exist, run a data migration mutation. If empty, schema change is safe.

2. **Existing production data in `consignmentOutlets`?**
   - What we know: Table exists in schema but no backend module (`convex/consignment/`) exists.
   - What's unclear: Whether any documents were manually inserted via dashboard.
   - Recommendation: Check production. If empty, schema field changes (mode → type) are safe without data migration. If populated, need two-phase migration.

3. **Revenue bridge outletId type**
   - What we know: `externalRevenue.outletId` is `v.optional(v.id("externalOutlets"))`. Consignment settlements need to link via `externalOutlets`.
   - What's unclear: Whether existing `externalOutlets` records with `source: "consignment"` exist.
   - Recommendation: Always create an `externalOutlets` record on outlet creation. Cross-link via `consignmentOutlets.externalOutletId`.

## Specific Technical Decisions

### Date Period Picker (Claude's Discretion)
**Recommendation:** Use two native HTML `<input type="date">` fields (period start and period end). This matches the project's minimal-dependency approach and is consistent with how date inputs are used elsewhere in the app. No need for month presets — arbitrary date ranges give admins full flexibility for irregular settlement periods.

### Auto-Archive Timing (Claude's Discretion)
**Recommendation:** Immediate on payment. When `markAsPaid` is called for a settlement belonging to an event-type outlet, set `isActive: false` on the outlet in the same mutation. This is simpler than end-of-day (which would require a cron job, explicitly excluded from v1.4 architecture decisions).

### Summary Banner Stats (Claude's Discretion)
**Recommendation:** Three stats in a horizontal banner: "Total Revenue" (sum of all settlement revenue), "Outstanding" (sum of frolliePayment where status = pending), "Paid" (sum of frolliePayment where status = paid). Use existing Card/Badge patterns with subtle color coding — green for paid, amber for outstanding.

## Schema Change Plan

### Modified Tables

**`consignmentOutlets`** — Replace `mode` with `type`, ensure compatibility with dispatch planner:
```typescript
consignmentOutlets: defineTable({
  name: v.string(),
  revSharePercent: v.number(),
  type: v.union(v.literal("cafe"), v.literal("retail"), v.literal("event")),
  isActive: v.boolean(),
  externalOutletId: v.optional(v.id("externalOutlets")),
  address: v.optional(v.string()),
  contactName: v.optional(v.string()),
  notes: v.optional(v.string()),
  // Dispatch planner fields (merged from dispatchConsignmentOutlets)
  productMappings: v.optional(v.array(v.object({
    menuProductId: v.id("menuProducts"),
    externalName: v.string(),
    externalPrice: v.number(),
  }))),
  createdBy: v.string(),
  createdAt: v.number(),
  updatedBy: v.optional(v.string()),
  updatedAt: v.optional(v.number()),
})
  .index("by_active", ["isActive"])
  .index("by_type", ["type"]),
```

**`consignmentSettlements`** — Add `linkedRevenueId`:
```typescript
consignmentSettlements: defineTable({
  outletId: v.id("consignmentOutlets"),
  periodStart: v.number(),
  periodEnd: v.number(),
  totalRevenue: v.number(),
  revSharePercent: v.number(),
  revShareAmount: v.number(),
  frolliePayment: v.number(),
  status: v.union(v.literal("pending"), v.literal("paid")),
  paidAt: v.optional(v.number()),
  linkedRevenueId: v.optional(v.id("externalRevenue")),
  notes: v.optional(v.string()),
  createdBy: v.string(),
  createdAt: v.number(),
  updatedBy: v.optional(v.string()),
  updatedAt: v.optional(v.number()),
})
  .index("by_outlet", ["outletId"])
  .index("by_period", ["periodStart"])
  .index("by_outlet_period", ["outletId", "periodStart"])
  .index("by_status", ["status"]),
```

**`dispatchPlans`** — Update outletId union:
```typescript
// BEFORE
outletId: v.optional(v.union(v.id("externalOutlets"), v.id("dispatchConsignmentOutlets"))),
// AFTER
outletId: v.optional(v.union(v.id("externalOutlets"), v.id("consignmentOutlets"))),
```

### Removed Tables
- `dispatchConsignmentOutlets` — Merged into `consignmentOutlets`. Remove from schema AFTER data migration.

### Files Requiring Dispatch Planner Updates
1. `convex/dispatchPlanner/queries.ts` — `getConsignmentOutlets()` and `assembleConsignmentChannel()` reference `dispatchConsignmentOutlets`
2. `convex/dispatchPlanner/mutations.ts` — `addConsignmentOutlet()`, `updateConsignmentOutlet()`, `removeConsignmentOutlet()`, `savePlanCell()` reference `dispatchConsignmentOutlets`
3. `src/hooks/convex/useDispatchPlanner.ts` — Types referencing `dispatchConsignmentOutlets`
4. `convex/schema.ts` — Table definition removal

## Integration Points Summary

| Integration Point | What Changes | Risk |
|-------------------|-------------|------|
| `convex/schema.ts` | Modify `consignmentOutlets`, `consignmentSettlements`, `dispatchPlans`; remove `dispatchConsignmentOutlets` | MEDIUM — must migrate data first |
| `convex/dispatchPlanner/queries.ts` | Repoint from `dispatchConsignmentOutlets` to `consignmentOutlets` | MEDIUM — extensive code changes |
| `convex/dispatchPlanner/mutations.ts` | Repoint outlet CRUD and plan cell mutations | MEDIUM — 4 mutations affected |
| `src/pages/SalesAnalytics.tsx` | Add Consignment tab | LOW — additive |
| `src/hooks/convex/index.ts` | Export new consignment hooks | LOW — additive |
| `convex/_generated/api.d.ts` | Auto-regenerated on `npx convex dev` | LOW — automatic |

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `convex/schema.ts` lines 1275-1290 (dispatchConsignmentOutlets), 1542-1578 (consignmentOutlets, consignmentSettlements), 999-1083 (externalOutlets, externalRevenue)
- Codebase analysis: `convex/dispatchPlanner/queries.ts` (assembleConsignmentChannel, getConsignmentOutlets)
- Codebase analysis: `convex/dispatchPlanner/mutations.ts` (consignment outlet CRUD, savePlanCell)
- Codebase analysis: `convex/grabfoodOrders/mutations.ts` (externalRevenue bridge pattern)
- Codebase analysis: `src/pages/SalesAnalytics.tsx` (tab structure)
- Codebase analysis: `src/hooks/convex/useProtectedMutation.ts` (auth token injection pattern)

### Secondary (MEDIUM confidence)
- Codebase analysis: `src/components/salesAnalytics/SettingsTab.tsx` (platform integration card patterns)
- Codebase analysis: `src/hooks/convex/useExternalData.ts` (on-demand action vs reactive query patterns)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries needed, all patterns exist in codebase
- Architecture: HIGH — follows established channel/outlet/revenue patterns from Phases 26-28
- Pitfalls: HIGH — table merge complexity is the main risk, well-documented from codebase analysis

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (stable — internal codebase patterns, no external API dependencies)
