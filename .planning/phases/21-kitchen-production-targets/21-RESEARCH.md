# Phase 21: Kitchen Production Targets & Overhaul - Research

**Researched:** 2026-02-22
**Domain:** Kitchen production workflow, shift record storage, finished goods inventory integration, dispatch plan target derivation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Kitchen View Layout**
- Full-screen simplified view — pure production focus
- Layout: targets top-center of page, end-of-shift input middle-bottom of page
- Collapsible "View Today's Orders" toggle for context when needed (hidden by default)
- No order list shown by default — kitchen staff doesn't need order detail during production
- Remove boxing/stickering columns from the kitchen view entirely — these are no longer tracked separately

**Production Targets Display**
- Two target numbers at top: total Original balls to make + total Jumbo balls to make (from BOM quantities)
- Below the ball totals: packaging breakdown — "30 triples, 50 singles, 60 singles (cafe)" derived from dispatch plan menu products
- No source label ("from dispatch plan" vs "default") — just show the numbers
- If plan has zero for a product type, display zero (do not fall back to default; do not hide the type)
- Target derivation: (1) ball totals from BOM via dispatch plan quantities; (2) packaging breakdown from menu products + BOM linkage

**End-of-Shift Input (new capability)**
- Input fields always visible at middle-bottom of kitchen page
- Kitchen staff and managers can submit
- Input fields: units produced by product type (matching the target categories shown)
- Optional waste section: prompted with "Any waste to capture?" — categorized by reason:
  - QA/testing (quality control samples/testing)
  - Spoilage (ingredient or product spoilage)
  - Waste (general production waste)
  - Each waste reason has a quantity field (optional; can submit with zero waste)
- Two-step confirmation:
  1. Review summary screen: "You made 80 singles + 25 triples. Waste: 5 singles (QA). Inventory will be updated." → Confirm button
  2. Success screen after commit: clean summary of what was recorded, shareable with manager

**Finished Goods Inventory Integration**
- Submitting end-of-shift adds produced quantities to Finished Goods Inventory at Kitchen storage location
- This replaces the manual boxing/stickering tracking — kitchen output IS the finished goods
- Waste quantities are deducted separately (not counted as produced)
- Ingredient inventory deduction happens at shift end (based on ball quantities via ingredient recipes), matching the existing BeingPrepared-triggered pattern

**Settings — Manager Access**
- Manager-only settings section on the kitchen page itself (not a separate settings page)
- Configures default daily targets: Original ball count (default 110), Jumbo ball count (default 0), packaging mix
- Manager can also override today's targets directly on the kitchen page (per-day override, does not change the defaults)
- Override is for today only — no persistence beyond current day

**Shift History & Editing**
- Shift production records stored per shift with date, submitted by, produced quantities, waste breakdown
- Managers can edit past shift records
- Edit triggers an impact confirmation: "This will reduce inventory by 1,800 units — confirm?" (diff between original and new values)
- History viewable by managers (accessible from kitchen page or a linked history view)

**Plan vs Default Handoff**
- When a dispatch plan exists for today, targets come from plan output (ball totals + packaging breakdown from BOM)
- When no plan exists, targets come from configured defaults
- If manager applies a per-day override, that takes precedence over both plan and default
- Priority order: per-day override > dispatch plan > configured defaults

**Access Control**
- Kitchen staff: can view targets, submit end-of-shift, view today's shift entry
- Managers: can view targets, submit end-of-shift, configure defaults, apply daily override, view/edit shift history
- Admin: same as manager

### Claude's Discretion
- Exact visual treatment of the packaging breakdown (cards vs table vs list)
- Loading skeleton for target display while plan data loads
- How the ingredient inventory deduction is triggered (follow existing BeingPrepared pattern)
- Design of the shift history list (inline on kitchen page or linked page)

### Deferred Ideas (OUT OF SCOPE)
- None raised during discussion — all ideas are in scope for Phase 21
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| KIT-09 | Default daily production target configurable by manager on the kitchen page (default: 110 Original singles + 30 Original triples = 140 total balls) | `kitchenConfig` table exists and has `bigBallTarget`/`midBallTarget` fields; `updateConfig` mutation exists — needs schema extension to add per-product default packaging mix |
| KIT-12 | Kitchen view displays today's production targets (ball totals by type + packaging breakdown) driven by dispatch plan via BOM; fallback to configured defaults when no plan exists | `dispatchPlans` table + `menuProductComponents` BOM tables exist; new `getKitchenTargetsForDate` query needed to compute ball totals + packaging breakdown with fallback logic |
| KIT-13 | Kitchen view simplified: boxing/stickering columns removed; full-screen production-focused layout with collapsible order context toggle | `KitchenViewV2.tsx` currently has 4 panels (Production, Boxing, Stickering, Orders); requires full page redesign into a new simplified layout with targets + end-of-shift + optional orders toggle |
| KIT-14 | End-of-shift input records produced units by product type + optional waste by reason (QA/testing, spoilage, waste); submission adds produced quantities to Finished Goods Inventory at Kitchen location | New `kitchenShiftRecords` table + `submitShiftRecord` mutation; integrates with `productInventory.addStock` pattern + waste deduction via `productInventory.adjustStock` |
| KIT-15 | Two-step end-of-shift confirmation: review summary screen before commit, success summary screen after submit | Frontend-only multi-step form state machine (review → submitting → success); no new backend tables needed |
| KIT-16 | Shift production records stored per shift (date, submitted by, produced quantities, waste breakdown); viewable by managers | New `kitchenShiftRecords` table; `getShiftHistory` query with date-range + role-gated fetch |
| KIT-17 | Manager can edit past shift records; edit triggers inventory impact confirmation ("this will adjust inventory by N units — confirm?") | `updateShiftRecord` mutation that computes inventory diff and applies delta adjustments; frontend shows confirmation dialog with computed impact |
| KIT-18 | Manager can override today's production targets on the kitchen page (per-day only, does not change configured defaults) | New `kitchenDailyOverrides` table (or field on `kitchenShiftRecords`); override takes precedence in `getKitchenTargetsForDate` computation |
</phase_requirements>

---

## Summary

Phase 21 is a significant overhaul of the kitchen page and a new shift-record persistence system. The core challenge is threefold: (1) deriving meaningful production targets from the existing `dispatchPlans` table via BOM calculations, (2) building a new `kitchenShiftRecords` table that stores end-of-shift data and drives Finished Goods inventory, and (3) redesigning `KitchenViewV2.tsx` from a 4-panel boxing/stickering tracker into a simplified production-focused UI with a top target bar and bottom shift submission form.

All the building blocks exist. The `dispatchPlans` table holds today's planned quantities per channel per menu product. The `menuProductComponents` BOM table links each menu product to `componentTypes` (BIG_BALL/MID_BALL). The `productInventory` + `productInventoryTransactions` tables handle finished goods stock at the Kitchen location. The `productInventory.addStock` and `productInventory.adjustStock` mutations have the exact patterns needed. The `kitchenConfig` table already holds `bigBallTarget`/`midBallTarget` defaults and needs only a schema extension for per-product packaging defaults.

The largest design decision is the new `kitchenShiftRecords` schema — it must record produced quantities (by menuProductId), waste (by menuProductId + reason), the date, who submitted, and support manager edits with an inventory impact audit trail.

**Primary recommendation:** Build backend first in Wave 1 (schema + queries + mutations), then the simplified UI in Wave 2 using the new hooks, with the order-context toggle as the last UI component.

---

## Standard Stack

### Core (all already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Convex | ^1.31.7 | Backend DB + mutations | Project standard |
| React 19 | ^19.2.0 | UI | Project standard |
| TypeScript | ~5.9 | Types | Project standard |
| Tailwind CSS | ^4.1.18 | Styling | Project standard |
| shadcn/ui | installed | UI primitives (Button, Dialog, Badge, etc.) | Project standard |
| Sonner | installed | Toast notifications | Project standard |
| Lucide React | installed | Icons | Project standard |
| date-fns | installed | `startOfDay`, date arithmetic | Already used in `KitchenViewV2.tsx` |

### No new dependencies required
This phase is entirely internal — all libraries are already in `package.json`. No `npm install` needed.

---

## Architecture Patterns

### New Schema Tables Required

#### 1. `kitchenShiftRecords`
Stores each end-of-shift submission. One record per shift submission (a kitchen worker may submit multiple times per day if needed — each is a separate record).

```typescript
// convex/schema.ts addition
kitchenShiftRecords: defineTable({
  date: v.string(),                          // YYYY-MM-DD
  submittedAt: v.number(),                   // Date.now()
  submittedBy: v.string(),                   // username from token
  submittedByUserId: v.optional(v.id("users")),

  // Produced quantities per menu product
  produced: v.array(v.object({
    menuProductId: v.id("menuProducts"),
    quantity: v.number(),
  })),

  // Waste by reason (optional — each item is a waste entry)
  waste: v.array(v.object({
    menuProductId: v.id("menuProducts"),
    reason: v.union(
      v.literal("qa_testing"),
      v.literal("spoilage"),
      v.literal("waste")
    ),
    quantity: v.number(),
  })),

  // Inventory impact (computed at submit time for audit trail)
  inventoryUpdates: v.array(v.object({
    menuProductId: v.id("menuProducts"),
    locationId: v.id("storageLocations"),
    delta: v.number(),               // net change (+produced, -waste)
    previousQuantity: v.number(),
    newQuantity: v.number(),
  })),

  // Edit audit — if this record was edited by a manager
  editedAt: v.optional(v.number()),
  editedBy: v.optional(v.string()),
  editNote: v.optional(v.string()),
})
  .index("by_date", ["date"])
  .index("by_date_submitted", ["date", "submittedAt"])
```

#### 2. `kitchenDailyOverrides`
Stores per-day target overrides (manager-only, does not persist beyond the day).

```typescript
// convex/schema.ts addition
kitchenDailyOverrides: defineTable({
  date: v.string(),                          // YYYY-MM-DD
  // Override values (null means use plan/defaults for that ball type)
  bigBallOverride: v.optional(v.number()),
  midBallOverride: v.optional(v.number()),
  // Per-product packaging override (optional)
  packagingOverrides: v.optional(v.array(v.object({
    menuProductId: v.id("menuProducts"),
    quantity: v.number(),
  }))),
  setAt: v.number(),
  setBy: v.string(),
})
  .index("by_date", ["date"])
```

#### 3. `kitchenConfig` schema extension
The existing `kitchenConfig` table needs to be extended to store per-product default packaging mix (for KIT-09 default targets). The current schema only has `bigBallTarget`/`midBallTarget`.

**Current:**
```typescript
kitchenConfig: defineTable({
  maxProductionTarget: v.number(),
  bigBallTarget: v.number(),
  midBallTarget: v.number(),
  updatedAt: v.number(),
  updatedBy: v.string(),
})
```

**Extended:**
```typescript
kitchenConfig: defineTable({
  maxProductionTarget: v.number(),
  bigBallTarget: v.number(),
  midBallTarget: v.number(),
  // New: default packaging mix (per product, optional — used when no dispatch plan)
  defaultPackagingMix: v.optional(v.array(v.object({
    menuProductId: v.id("menuProducts"),
    quantity: v.number(),
  }))),
  updatedAt: v.number(),
  updatedBy: v.string(),
})
```

### New Backend Query: `getKitchenTargetsForDate`

This is the core query that implements the priority chain: per-day override > dispatch plan > configured defaults.

```typescript
// convex/kitchenConfig/queries.ts (new query)
export const getKitchenTargetsForDate = query({
  args: { date: v.string() },
  handler: async (ctx, args): Promise<KitchenTargets> => {
    // 1. Check for per-day override
    const override = await ctx.db
      .query("kitchenDailyOverrides")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .first();

    if (override) {
      return buildTargetsFromOverride(override, menuProducts);
    }

    // 2. Check for dispatch plan entries today
    const todayPlans = await ctx.db
      .query("dispatchPlans")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect();

    if (todayPlans.length > 0) {
      return buildTargetsFromDispatchPlan(ctx, todayPlans);
    }

    // 3. Fall back to kitchenConfig defaults
    const config = await ctx.db.query("kitchenConfig").first();
    return buildTargetsFromDefaults(config);
  }
});
```

**Target derivation algorithm (from dispatch plan):**
1. Sum `plannedQty` per `menuProductId` across all `dispatchPlans` entries for `date`
2. For each `(menuProductId, plannedQty)`, look up `menuProductComponents` for that product
3. Filter components where `componentType.category === "production"` and `componentType.code === "BIG_BALL"` or `"MID_BALL"`
4. Multiply `comp.quantity * plannedQty` to get balls per product, sum across all products
5. Return `{ bigBalls: N, midBalls: M, packagingBreakdown: [{ menuProductId, name, quantity }] }`

This BOM lookup pattern already exists in `convex/productionTargets/mutations.ts` (`autoCalculate` and `setProductTarget`). The new query follows the same `menuProductComponents` → `componentTypes` traversal.

### New Backend Mutation: `submitShiftRecord`

```typescript
// convex/kitchenShiftRecords/mutations.ts
export const submitShiftRecord = mutation({
  args: {
    token: v.string(),
    date: v.string(),
    produced: v.array(v.object({
      menuProductId: v.id("menuProducts"),
      quantity: v.number(),
    })),
    waste: v.array(v.object({
      menuProductId: v.id("menuProducts"),
      reason: v.union(v.literal("qa_testing"), v.literal("spoilage"), v.literal("waste")),
      quantity: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["kitchen", "order_staff", "manager", "admin"]);

    // 1. Find Kitchen storage location (by locationType = "kitchen")
    const kitchenLocation = await ctx.db
      .query("storageLocations")
      .withIndex("by_type", (q) => q.eq("locationType", "kitchen"))
      .first();
    if (!kitchenLocation) throw new Error("Kitchen location not found");

    const now = Date.now();
    const inventoryUpdates = [];

    // 2. Add produced quantities to productInventory at Kitchen location
    for (const item of args.produced) {
      if (item.quantity <= 0) continue;
      const existing = await ctx.db
        .query("productInventory")
        .withIndex("by_product_location", (q) =>
          q.eq("menuProductId", item.menuProductId).eq("locationId", kitchenLocation._id)
        )
        .first();
      const prev = existing?.quantity ?? 0;
      const next = prev + item.quantity;
      // upsert productInventory + log transaction (same pattern as productInventory/mutations.ts addStock)
      inventoryUpdates.push({ menuProductId: item.menuProductId, locationId: kitchenLocation._id, delta: item.quantity, previousQuantity: prev, newQuantity: next });
      // ... upsert + transaction insert
    }

    // 3. Deduct waste quantities from productInventory at Kitchen location
    for (const waste of args.waste) {
      if (waste.quantity <= 0) continue;
      // deduct with reason = waste.reason
      // ... upsert + transaction insert with transactionType: "adjust"
    }

    // 4. Insert kitchenShiftRecord
    await ctx.db.insert("kitchenShiftRecords", {
      date: args.date,
      submittedAt: now,
      submittedBy: user.name,
      submittedByUserId: user._id,
      produced: args.produced.filter(p => p.quantity > 0),
      waste: args.waste.filter(w => w.quantity > 0),
      inventoryUpdates,
    });

    return { success: true };
  }
});
```

### New Backend Mutation: `updateShiftRecord`

For manager edit of past records. Must compute inventory delta (new - original), apply adjustment transactions, and record the edit.

```typescript
// convex/kitchenShiftRecords/mutations.ts
export const updateShiftRecord = mutation({
  args: {
    token: v.string(),
    recordId: v.id("kitchenShiftRecords"),
    produced: v.array(v.object({ menuProductId: v.id("menuProducts"), quantity: v.number() })),
    waste: v.array(v.object({ menuProductId: v.id("menuProducts"), reason: v.union(...), quantity: v.number() })),
    editNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["manager", "admin"]);

    const record = await ctx.db.get(args.recordId);
    if (!record) throw new Error("Shift record not found");

    // Compute net delta per product: (new produced - new waste) - (old produced - old waste)
    // Apply adjustments to productInventory with transactionType: "adjust"
    // reason: `shift record edit by ${user.name}`
    // Update the record fields + set editedAt/editedBy
  }
});
```

### Frontend Architecture: New Simplified Kitchen Page

The existing `KitchenViewV2.tsx` (currently 567 lines) needs to be replaced/refactored. The CONTEXT.md decision is to build a new simplified layout. Strategy: keep the file name `KitchenViewV2.tsx` but replace the implementation.

**New page structure:**
```
KitchenViewV2
  ├── KitchenHeader (date, name)
  ├── ProductionTargetsBar (top-center: bigBalls, midBalls, packagingBreakdown)
  ├── [Collapsible] TodaysOrdersToggle -> OrderContextPanel
  ├── EndOfShiftInputForm (middle-bottom: produced quantities + waste section)
  │   ├── ProducedQuantities (per product type, matching target categories)
  │   ├── WasteSection (expandable: QA/testing, Spoilage, Waste per product)
  │   └── SubmitButton (→ ReviewModal → SuccessScreen)
  └── [Manager only] ManagerSection
      ├── DefaultTargetsConfig (KIT-09)
      ├── TodayOverridePanel (KIT-18)
      └── ShiftHistoryPanel (KIT-16/17)
```

**New components to create:**
- `ProductionTargetsBar.tsx` — displays ball totals + packaging breakdown
- `EndOfShiftForm.tsx` — produced + waste inputs with two-step confirm
- `ShiftReviewModal.tsx` — review summary before commit (KIT-15)
- `ShiftSuccessScreen.tsx` — post-commit success screen (KIT-15)
- `ShiftHistoryList.tsx` — past shift records viewable/editable by manager (KIT-16/17)
- `ShiftEditDialog.tsx` — edit form with inventory impact confirmation (KIT-17)
- `ManagerTargetSettings.tsx` — default config + daily override (KIT-09/18)

**Components to remove (no longer used in simplified view):**
- `BoxingPanel.tsx`, `StickeringPanel.tsx`, `SwipeableKitchenLayout.tsx` — boxing/stickering concept eliminated
- `ProductionLogPanel.tsx` — replaced by `EndOfShiftForm.tsx`
- `BatchConfirmDialog.tsx`, `BallTrayCounter.tsx` — tray model replaced by end-of-shift submission

**Components to keep:**
- `DueDateOrderList.tsx` — used in the collapsible order context toggle
- `DashboardHeader.tsx` — may be simplified or replaced by `ProductionTargetsBar`
- `DueDateGroupHeader.tsx`, `KitchenOrderCard.tsx` — used inside the collapsible

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-step form confirmation | Custom state machine | React `useState` with step enum | Simple enough, no lib needed; consistent with project |
| Inventory add/deduct | New inventory logic | `productInventory` upsert pattern (same as `addStock`/`adjustStock` in `convex/productInventory/mutations.ts`) | Existing pattern is correct, tested, and includes transaction logging |
| Kitchen location lookup | Custom location resolver | `.withIndex("by_type", q => q.eq("locationType", "kitchen"))` | Already used in `inventoryIntegration.ts` line 582 |
| BOM ball-count derivation | New ball counter | Same `menuProductComponents` + `componentTypes` traversal used in `productionTargets/mutations.ts` `autoCalculate` | Already proven, just move to a query |
| Auth guard | Custom auth | `requireRole(ctx, args.token, [...roles])` from `convex/lib/auth.ts` | Project standard |
| Protected mutations | Custom token handling | `useProtectedMutation` hook from `src/hooks/convex/useProtectedMutation.ts` | Project standard |
| Confirmation dialog | Custom dialog | shadcn/ui `Dialog` + `Button` | Project standard; used everywhere |
| Date display | Manual date format | `date-fns` `format`, `startOfDay` | Already installed and used in `KitchenViewV2.tsx` |

**Key insight:** The inventory mutation pattern (`addStock` for produced, `adjustStock` for waste) is fully reusable. The shift submission mutation should call the same upsert+transaction-log pattern inline rather than calling `addStock`/`adjustStock` as sub-mutations (Convex mutations cannot call other mutations). Copy the pattern directly.

---

## Common Pitfalls

### Pitfall 1: Convex mutations cannot call other mutations
**What goes wrong:** Trying to call `productInventory.addStock` from within `submitShiftRecord` mutation. Convex does not support nested mutation calls.
**Why it happens:** The addStock/adjustStock mutations contain reusable inventory logic, but they're exposed as mutation endpoints, not helpers.
**How to avoid:** Inline the upsert + transaction-log logic directly in `submitShiftRecord`. The pattern is simple: (1) find existing row by `by_product_location` index, (2) compute new quantity, (3) patch or insert `productInventory`, (4) insert `productInventoryTransactions`. Copy from `productInventory/mutations.ts` lines 51-86.

### Pitfall 2: Kitchen location not guaranteed to exist
**What goes wrong:** `getKitchenLocation` query returns null if `seedFinishedGoodsLocations` hasn't been run.
**Why it happens:** The Kitchen location is seeded, not created at schema init. Phase 17.1 established this pattern.
**How to avoid:** In `submitShiftRecord`, check for null Kitchen location and throw a user-friendly `ConvexError`. Frontend should handle this gracefully (show admin warning, similar to Phase 19's GF-05 seed warning pattern).

### Pitfall 3: React hooks before conditionals
**What goes wrong:** Any new hooks inside the redesigned `KitchenViewV2.tsx` placed after conditional returns causes React hooks rule violation.
**Why it happens:** Common refactoring mistake when simplifying a complex component.
**How to avoid:** Call ALL `useQuery`, `useMutation`, `useAction`, `useMemo`, `useCallback` hooks before any conditional `if (isLoading) return ...` — CLAUDE.md Pitfall #9.

### Pitfall 4: Dispatch plan to ball totals: don't forget packaging-only products
**What goes wrong:** Including `productType === "packaging"` products in ball count derivation. These products have no production BOM components.
**Why it happens:** The dispatch planner shows all active POS products including packaging-type items.
**How to avoid:** Filter `menuProducts` to `productType !== "packaging"` before traversing BOM. The `getUnifiedWeeklyPlan` query does this already (line 153 in `dispatchPlanner/queries.ts`).

### Pitfall 5: Per-day override store vs. ephemeral state
**What goes wrong:** Implementing the per-day override as React state (lost on page refresh) rather than a `kitchenDailyOverrides` table entry.
**Why it happens:** CONTEXT.md says "no persistence beyond current day" which might be misread as "don't persist."
**How to avoid:** "No persistence beyond current day" means the override only applies for the day it was set, NOT that it should be ephemeral. It must be stored in a DB table (so it survives page refresh) but the `getKitchenTargetsForDate` query only reads it for today's date. It does not roll forward.

### Pitfall 6: Waste deduction going negative
**What goes wrong:** Waste deduction at end of shift pushes inventory below zero (kitchen only added produced items, then waste deducts more than was added).
**Why it happens:** The order of operations (add produced, then deduct waste) may result in net negative if waste > produced.
**How to avoid:** This is a valid business scenario — manager accepted that waste > produced is impossible but implement a validation guard: `waste.quantity <= produced.quantity` per product. If waste exceeds produced for a product, reject the submission with a clear error.

### Pitfall 7: `updateShiftRecord` inventory delta sign
**What goes wrong:** When computing edit delta, mixing up the sign conventions. New - Old gives the adjustment, but "new produced=200 vs old produced=2000" means inventory goes DOWN by 1800, which is a negative adjustment.
**Why it happens:** The CONTEXT.md example explicitly says: "put 2000 units produced, edit to 200 total — inventory should reduce by 1800."
**How to avoid:** Delta = (newProduced - newWaste) - (oldProduced - oldWaste). Apply as `adjustStock` equivalent. If delta < 0, show the "this will REDUCE inventory by N units" warning. If delta > 0, show "this will ADD N units."

### Pitfall 8: Shift record per "submission" not per "day"
**What goes wrong:** Designing `kitchenShiftRecords` as one-record-per-day (upsert pattern) when the business may need multiple submissions per day.
**Why it happens:** The natural CRUD instinct is "one record per day."
**How to avoid:** Store each submission as a new insert. The history list shows all submissions for a day. Managers can edit any individual record. The cumulative effect on inventory is the sum of all records for the day. This matches the "shift history" semantic.

---

## Code Examples

Verified patterns from existing codebase:

### Kitchen Location Lookup
```typescript
// Source: convex/orders/mutations/inventoryIntegration.ts:580-583
const kitchenLocation = await ctx.db
  .query("storageLocations")
  .withIndex("by_type", (q) => q.eq("locationType", "kitchen"))
  .first();
```

### ProductInventory Upsert Pattern
```typescript
// Source: convex/productInventory/mutations.ts:51-86 (addStock handler)
const existing = await ctx.db
  .query("productInventory")
  .withIndex("by_product_location", (q) =>
    q.eq("menuProductId", args.menuProductId).eq("locationId", args.locationId)
  )
  .first();

const previousQuantity = existing?.quantity ?? 0;
const newQuantity = previousQuantity + args.quantity;

if (existing) {
  await ctx.db.patch(existing._id, { quantity: newQuantity, lastUpdated: now });
} else {
  await ctx.db.insert("productInventory", { menuProductId, locationId, quantity: newQuantity, lastUpdated: now });
}

await ctx.db.insert("productInventoryTransactions", {
  menuProductId: args.menuProductId,
  locationId: args.locationId,
  transactionType: "add",
  quantity: args.quantity,
  previousQuantity,
  newQuantity,
  performedBy: user.name,
  createdAt: now,
});
```

### BOM Ball-Count Derivation Pattern
```typescript
// Source: convex/productionTargets/mutations.ts:93-120 (autoCalculate)
// For each order item -> fetch menuProductComponents -> filter category="production"
// -> find productionUnitType by componentType.code -> accumulate ball totals
const components = await ctx.db
  .query("menuProductComponents")
  .withIndex("by_menu_product", (q) => q.eq("menuProductId", item.menuProductId!))
  .collect();

for (const comp of components) {
  const componentType = await ctx.db.get(comp.componentTypeId);
  if (!componentType || componentType.category !== "production") continue;

  const unitType = await ctx.db
    .query("productionUnitTypes")
    .withIndex("by_code", (q) => q.eq("code", componentType.code))
    .first();

  if (unitType) {
    const current = unitTotals.get(unitType._id) ?? 0;
    unitTotals.set(unitType._id, current + comp.quantity * item.quantity);
  }
}
```

For Phase 21 target derivation, use `componentType.code === "BIG_BALL"` → bigBalls, `"MID_BALL"` → midBalls (directly from `componentTypes` table without joining through `productionUnitTypes`).

### Dispatch Plan Query for Today
```typescript
// Source: convex/dispatchPlanner/queries.ts (assembleDirectChannel)
// Pattern: query by_date index
const todayPlans = await ctx.db
  .query("dispatchPlans")
  .withIndex("by_date", (q) => q.eq("date", args.date))
  .collect();
```

### requireRole Usage
```typescript
// Source: convex/kitchenConfig/mutations.ts:18
const user = await requireRole(ctx, args.token, ["manager", "admin"]);
// For kitchen staff access:
const user = await requireRole(ctx, args.token, ["kitchen", "order_staff", "manager", "admin"]);
```

### useProtectedMutation Hook
```typescript
// Source: src/hooks/convex/useProtectedMutation.ts (already used in KitchenViewV2)
const submitShift = useProtectedMutation(api.kitchenShiftRecords.mutations.submitShiftRecord);
// Call:
await submitShift({ date: today, produced: [...], waste: [...] });
```

### WIB Today Date String
```typescript
// Source: src/hooks/convex/useKitchenProduction.ts:162-164
const now = new Date();
const wibNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
const today = wibNow.toISOString().slice(0, 10); // YYYY-MM-DD
```

---

## State of the Art

| Old Approach | Current Approach | Phase Changed | Impact |
|--------------|------------------|---------------|--------|
| Boxing/stickering tracking per product | Removed entirely (Phase 21) | Phase 21 | `BoxingPanel`, `StickeringPanel` components retired |
| Production tray count (accumulated ball count) | End-of-shift one-time submission | Phase 21 | `kitchenInventory` tray model superseded |
| `productionCounts` table for production tallies | `productionLog` aggregation (Phase 18) | Phase 18 | Already migrated; Phase 21 builds on this |
| Manual boxer/stickerer boxing step triggering inventory deduction | End-of-shift submission triggers inventory add | Phase 21 | `productInventory.addStock` called from new mutation |

**Deprecated/outdated after Phase 21:**
- `BoxingPanel.tsx`, `StickeringPanel.tsx` — no longer rendered
- `SwipeableKitchenLayout.tsx` — 4-panel mobile swipe concept removed
- `ProductionLogPanel.tsx` — replaced by `EndOfShiftForm`
- `BallTrayCounter.tsx`, `addBallsToTray` mutation — tray count model replaced

Note: The deprecated components should NOT be deleted in Phase 21 unless REQUIREMENTS.md includes explicit cleanup task. Leave them unused for now; Phase 24 "Remove legacy editors" is the right place for cleanup.

---

## Open Questions

1. **Should one shift record cover an entire day, or can multiple submissions exist per day?**
   - What we know: CONTEXT.md says "input fields always visible" and staff can submit anytime
   - What's clear from context: multiple submissions per day are implied ("shift history" shows records; managers edit "past shift records" plural)
   - Recommendation: Design for multiple submissions per day (insert model, not upsert). This avoids the need to merge records.

2. **Ingredient deduction at shift end: what triggers it?**
   - What we know: CONTEXT.md says "ingredient inventory deduction happens at shift end (based on ball quantities via ingredient recipes), matching the existing BeingPrepared-triggered pattern"
   - What's clear: the BeingPrepared pattern uses `componentTypes` with `category="production"` and `trackInventory=true` (production ingredients)
   - What's unclear: does this require looking up the production component hierarchy (via `productionComponentIngredients` + `productionComponentLinks`) to find raw ingredient quantities?
   - Recommendation: Mark as Claude's Discretion per CONTEXT.md. Implement the simplest valid approach: when `submitShiftRecord` is called, for each `produced` item, use `buildBallInfoMap`-equivalent logic to find BIG_BALL/MID_BALL quantities, then traverse `productionComponentIngredients` to find ingredient-type componentTypes (`category="production"`, `trackInventory=true`), and deduct from `componentStock`. This is the same path as the BeingPrepared inventory integration in `inventoryIntegration.ts`. If complexity is high, defer ingredient deduction to a follow-up plan within Phase 21.

3. **Packaging breakdown defaults: how is "default packaging mix" configured?**
   - What we know: KIT-09 says "default daily production target configurable by manager" — default 110 Original singles + 30 Original triples
   - What's unclear: Is the default packaging mix stored as a list of `(menuProductId, quantity)` pairs on `kitchenConfig`? Or as a free-form target ball count only?
   - Recommendation: Extend `kitchenConfig` with a `defaultPackagingMix: v.optional(v.array(v.object({ menuProductId: v.id("menuProducts"), quantity: v.number() })))` field. If not set, derive from `bigBallTarget`/`midBallTarget` ball totals without packaging breakdown. The UI settings panel lets managers configure this mix.

4. **Is today's `dispatchPlans` query expensive?**
   - What we know: `by_date` index exists on `dispatchPlans`; Phase 20 optimized heavy queries but left reactive queries alone for lightweight endpoints
   - Recommendation: The `getKitchenTargetsForDate` query is reactive (kitchen page keeps it live). It reads one day of dispatch plans (~10-30 rows), fetches BOM for active products (~10-20 products), and does BOM traversal. This is similar in load to `getProductionSummary` and should be fine as a reactive query. No action conversion needed.

---

## Sources

### Primary (HIGH confidence)
- `convex/schema.ts` — Complete table definitions verified directly
- `convex/productInventory/mutations.ts` — `addStock`, `adjustStock`, `transferStock` patterns
- `convex/productionTargets/mutations.ts` — BOM ball-count derivation pattern (`autoCalculate`)
- `convex/dispatchPlanner/queries.ts` — `getUnifiedWeeklyPlan`, dispatch plan structure
- `convex/kitchenConfig/queries.ts` + `mutations.ts` — Existing config patterns
- `convex/productionLog/helpers.ts` — `buildBallInfoMap` pattern
- `src/pages/KitchenViewV2.tsx` — Full current kitchen page (567 lines)
- `src/hooks/convex/useKitchenProduction.ts` — Combined kitchen data hook
- `convex/orders/mutations/inventoryIntegration.ts:580-583` — Kitchen location lookup pattern
- `.planning/phases/21-kitchen-production-targets/21-CONTEXT.md` — All user decisions

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — Accumulated project decisions and phase history
- `.planning/ROADMAP.md` — Phase 21 success criteria and dependencies
- `.planning/REQUIREMENTS.md` — KIT-09, KIT-12, KIT-13, KIT-14, KIT-15, KIT-16, KIT-17, KIT-18 definitions

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All libraries already installed, no new deps
- Architecture: HIGH — Schema design derived from existing patterns; all building blocks verified in codebase
- Pitfalls: HIGH — All pitfalls derived from actual code review (mutation nesting, location seeding, hooks order, sign conventions)

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (30 days — stable stack, no fast-moving dependencies)
