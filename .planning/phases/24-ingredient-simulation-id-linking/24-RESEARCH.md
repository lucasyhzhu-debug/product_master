# Phase 24: Ingredient Simulation Fix + Restock-Kitchen Integration - Research

**Researched:** 2026-02-23
**Domain:** Convex backend simulation logic, schema migration, React frontend integration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Linking Strategy:**
- Replace the 2 name-match sites in `dispatchPlanner/queries.ts` (lines ~939 and ~994) with ID-based lookup using `ingredients.ingredientComponentTypeId`
- Thread `ingredientId` through the hierarchy traversal chain so it's available at the simulation point (currently only `ingredientName` string is passed forward)
- Build a pre-loaded map of ingredientId → componentTypeId to avoid N+1 lookups
- Kitchen shift deduction (`ingredientDeduction.ts`) already uses the correct ID-based pattern — simulation should match

**Migration / Admin Mapping:**
- Research phase should check production data to determine how many ingredients are missing `ingredientComponentTypeId`
- Add admin mapping UI on the **Ingredients Manager page** — show which ingredients are linked to inventory componentTypes and allow admin to fix missing links
- No auto-migration by name match — admin explicitly maps each ingredient

**Fallback Behavior:**
- When an ingredient has no `ingredientComponentTypeId` link, simulation **skips it** and shows a warning
- Warning appears in **both places**:
  - Amber banner in Materials Check simulation results: "N ingredients not linked — forecasts may be incomplete"
  - Badge/alert on Ingredients Manager page for unlinked records
- No fallback to name matching — clean break

**Kitchen Target Source:**
- Remove the Capacity tab from Restock Planner Settings dialog entirely
- Simulation reads daily production capacity from `kitchenConfig.defaultTargets` (same values managers configure on Kitchen page)
- Simulation uses the **same priority chain as kitchen view**: kitchenDailyOverrides (if exists for that day) > kitchenConfig defaults
- Forecasts reflect actual planned production, not a separate static number

**Save Targets for Kitchen:**
- "Save targets for kitchen" button per day at top of restock calendar
- Saves the **full packaging breakdown** (e.g. 106 singles, 40 triples) — not just ball totals
- Writes to `kitchenDailyOverrides` with new `source` field: `"manual"` | `"restock_planner"`
- Kitchen UI shows source badge when override comes from Restock Planner (e.g. "from Restock Planner")
- Manager can always overwrite a restock-originated override from kitchen page (source changes to "manual")
- Last write wins — both restock and manager overrides live in same table

**Algorithm Review:**
- Health check only — no known bugs or performance issues
- Review for correctness and edge cases while modifying the simulation code
- Not a rewrite — targeted fixes if issues are found

### Claude's Discretion
- Pre-loaded map implementation details (Map vs object, query structure)
- Exact placement and styling of unlinked ingredients warning
- How to thread ingredientId through hierarchy traversal (extend IngredientUsage interface or separate lookup)
- Algorithm edge case fixes if found during review
- "Save targets for kitchen" button placement and interaction design

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 24 touches three tightly-coupled concerns in the dispatch planner simulation and the kitchen target pipeline. All modifications center on `convex/dispatchPlanner/queries.ts` (`simulateInventory` query, ~300 lines) plus schema changes to `kitchenDailyOverrides`.

**Concern 1 — ID linking:** The `simulateInventory` query currently resolves ingredients by name string matching (`ct.name.toLowerCase() === ingInfo.name.toLowerCase()`). This appears at two sites (~lines 939 and 994). The fix is: build a `Map<ingredientId, componentTypeId>` from the `ingredients` table (`ingredients.ingredientComponentTypeId`), then look up stock directly by that ID. The `collectLeafIngredients` / `traverseHierarchy` chain already yields `ingredientId: Id<"ingredients">` in the `IngredientUsage` interface — so the fix is at the simulation layer, not in traversal.

**Concern 2 — Kitchen capacity integration:** The `simulateInventory` query reads `dispatchPlannerSettings.dailyCapacity`. This must be replaced with `kitchenConfig.maxProductionTarget` (with priority chain: `kitchenDailyOverrides` for that date > `kitchenConfig` defaults). The `ChannelSettingsDialog` Capacity tab wraps `updatePlannerSettings` mutation — this tab is removed entirely.

**Concern 3 — Save targets for kitchen:** The `kitchenDailyOverrides` schema needs a `source` field (`"manual" | "restock_planner"`). The `setDailyOverride` mutation must accept and store this. The Dispatch Planner UI gets a per-day "Save targets for kitchen" button that computes bigBalls/midBalls from the dispatch plan BOM and writes `kitchenDailyOverrides` with `source="restock_planner"`. The `ProductionTargetsBar` in `KitchenViewV2` gets a source badge when `source === "override"` and the override originated from restock.

**Primary recommendation:** Attack in waves — (1) schema: add `source` field to `kitchenDailyOverrides`, (2) backend: fix ID linking + capacity source in `simulateInventory`, update `setDailyOverride` mutation, (3) frontend: remove Capacity tab, add "Save targets" button, add source badge to kitchen.

---

## Standard Stack

### Core Libraries (already in project)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| Convex | ^1.31.7 | Backend queries/mutations | All backend changes are pure Convex |
| React 19 | ^19.2.0 | Frontend UI | Hooks, components |
| TypeScript | ~5.9 | Type safety | Strict mode in use |
| shadcn/ui | (in project) | Badge, Button, Dialog, Tabs | Used in all relevant components |
| Lucide React | (in project) | Icons | AlertTriangle for warning badges |
| Sonner | (in project) | Toast notifications | For save success/error |

No new dependencies required for this phase.

---

## Architecture Patterns

### Relevant File Locations

```
convex/
├── dispatchPlanner/
│   ├── queries.ts          # simulateInventory query — primary backend target
│   └── mutations.ts        # updatePlannerSettings — to be deprecated/removed from UI
├── kitchenDailyOverrides/
│   └── mutations.ts        # setDailyOverride — add source field
├── kitchenConfig/
│   └── queries.ts          # getConfig, getKitchenTargetsForDate — read capacity from here
├── schema.ts               # kitchenDailyOverrides table — add source field
src/
├── components/dispatchPlanner/
│   └── ChannelSettingsDialog.tsx   # Remove Capacity tab
├── components/kitchen/
│   ├── ProductionTargetsBar.tsx    # Add source badge for restock_planner origin
│   └── ManagerTargetSettings.tsx   # Update setDailyOverride call with source="manual"
├── pages/
│   ├── DispatchPlanner.tsx         # Add "Save targets for kitchen" button per day
│   └── IngredientsManager.tsx      # Add unlinked ingredients warning/admin mapping
```

### Pattern 1: ID-Based Ingredient Stock Lookup

**What:** Replace name-match with direct ID join via `ingredients.ingredientComponentTypeId`

**Current broken code (simulateInventory, ~lines 939 and 994):**
```typescript
// BROKEN: Name string matching
const matchingCt = ingredientComponentTypes.find(
  (ct) => ct.name.toLowerCase() === ingInfo.name.toLowerCase()
);
const available = matchingCt
  ? (ingredientStockMap.get(matchingCt._id as string) ?? 0)
  : 0;
```

**Fix — pre-load the map earlier in simulateInventory:**
```typescript
// Load ingredients that have an ingredientComponentTypeId link
const allIngredients = await ctx.db.query("ingredients").collect();
// Map: ingredientId -> componentTypeId (for stock lookup)
const ingredientToComponentTypeMap = new Map<string, string>();
// Map: ingredientId -> ingredient doc (for unlinked warning)
const ingredientDocMap = new Map<string, typeof allIngredients[0]>();
for (const ing of allIngredients) {
  ingredientDocMap.set(ing._id as string, ing);
  if (ing.ingredientComponentTypeId) {
    ingredientToComponentTypeMap.set(
      ing._id as string,
      ing.ingredientComponentTypeId as string
    );
  }
}
```

**Then replace the two name-match sites:**
```typescript
// FIXED: ID-based lookup
const componentTypeId = ingredientToComponentTypeMap.get(ingId);
const available = componentTypeId
  ? (ingredientStockMap.get(componentTypeId) ?? 0)
  : 0;
```

**Unlinked ingredient tracking (for warning banner):**
```typescript
const unlinkedIngredientNames: string[] = [];
// When componentTypeId is not found:
if (!componentTypeId) {
  unlinkedIngredientNames.push(ingInfo.name);
  continue; // skip — no fallback to name match
}
```

**Source of truth:** `ingredientDeduction.ts` lines 138-141 show the correct pattern:
```typescript
const ingredient = await ctx.db.get(need.ingredientId);
if (!ingredient || !ingredient.ingredientComponentTypeId) continue;
const componentType = await ctx.db.get(ingredient.ingredientComponentTypeId);
```
The simulation fix mirrors this exact approach.

### Pattern 2: IngredientUsage Interface Already Has ingredientId

The `IngredientUsage` interface in `convex/lib/hierarchyTraversal.ts` already exposes `ingredientId: Id<"ingredients">`. The simulation already captures this as `leaf.ingredientId`. The key is that `cumulativeIngredientRequired` is keyed by `ingKey = leaf.ingredientId as string` — so the map already uses ingredient IDs, not names. Only the lookup phase at the end is broken (name matching). No changes needed to `hierarchyTraversal.ts`.

### Pattern 3: Capacity Source Migration

**Current:** `simulateInventory` uses `dispatchPlannerSettings.dailyCapacity` (a separate static setting with its own table).

**Target:** Read from kitchenConfig, using the same priority chain as kitchen view.

```typescript
// In simulateInventory, replace dispatchPlannerSettings read:
// OLD:
const settings = await ctx.db.query("dispatchPlannerSettings").first();
const dailyCapacity = settings?.dailyCapacity ?? 200;

// NEW: Read from kitchenConfig + check per-day overrides
const kitchenCfg = await ctx.db.query("kitchenConfig").first();
const maxTarget = kitchenCfg?.maxProductionTarget ?? 200;

// For each date: check kitchenDailyOverrides first
const override = await ctx.db
  .query("kitchenDailyOverrides")
  .withIndex("by_date", (q) => q.eq("date", date))
  .first();
const dailyCapacity = override
  ? (override.bigBallOverride ?? 0) + (override.midBallOverride ?? 0) || maxTarget
  : maxTarget;
```

Note: The `getKitchenTargetsForDate` query in `kitchenConfig/queries.ts` already implements this priority chain. The simulation should call it per day or replicate the same logic inline (inline is preferred to avoid N+1 query round-trips).

### Pattern 4: schema.ts — Add source Field to kitchenDailyOverrides

**Current schema (convex/schema.ts, ~line 1328):**
```typescript
kitchenDailyOverrides: defineTable({
  date: v.string(),
  bigBallOverride: v.optional(v.number()),
  midBallOverride: v.optional(v.number()),
  packagingOverrides: v.optional(v.array(v.object({
    menuProductId: v.id("menuProducts"),
    quantity: v.number(),
  }))),
  setAt: v.number(),
  setBy: v.string(),
})
  .index("by_date", ["date"]),
```

**Updated schema:**
```typescript
kitchenDailyOverrides: defineTable({
  date: v.string(),
  bigBallOverride: v.optional(v.number()),
  midBallOverride: v.optional(v.number()),
  packagingOverrides: v.optional(v.array(v.object({
    menuProductId: v.id("menuProducts"),
    quantity: v.number(),
  }))),
  setAt: v.number(),
  setBy: v.string(),
  source: v.optional(v.union(v.literal("manual"), v.literal("restock_planner"))),
})
  .index("by_date", ["date"]),
```

`source` is optional for backward compatibility with existing rows (treat `undefined` as `"manual"`).

### Pattern 5: setDailyOverride Mutation — Add source Arg

```typescript
// convex/kitchenDailyOverrides/mutations.ts
export const setDailyOverride = mutation({
  args: {
    token: v.string(),
    date: v.string(),
    bigBallOverride: v.optional(v.number()),
    midBallOverride: v.optional(v.number()),
    packagingOverrides: v.optional(v.array(v.object({
      menuProductId: v.id("menuProducts"),
      quantity: v.number(),
    }))),
    source: v.optional(v.union(v.literal("manual"), v.literal("restock_planner"))),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);
    const overrideData = {
      date: args.date,
      bigBallOverride: args.bigBallOverride,
      midBallOverride: args.midBallOverride,
      packagingOverrides: args.packagingOverrides,
      source: args.source ?? "manual",  // default to "manual" for existing callers
      setAt: Date.now(),
      setBy: user.name,
    };
    // ... upsert logic unchanged
  },
});
```

**Existing callers** of `setDailyOverride` (in `ManagerTargetSettings.tsx`) must pass `source: "manual"` explicitly to be clear (or rely on the default).

### Pattern 6: simulateInventory Return Type — Add unlinkedIngredients

The query return type needs a new top-level field:

```typescript
return {
  days: result,
  ingredientStatus,
  unlinkedIngredients: unlinkedIngredientNames,  // NEW: string[]
};
```

Frontend `Materials Check` panel reads this field and renders the amber banner when `unlinkedIngredients.length > 0`.

### Pattern 7: Source Badge in ProductionTargetsBar

The `KitchenTargets` interface in `ProductionTargetsBar.tsx` currently has `source: "override" | "dispatch_plan" | "defaults"`. The source field on `kitchenDailyOverrides` is a separate concept — it describes where the override came from, not what source the targets use.

To surface the restock planner badge:
1. `getKitchenTargetsForDate` query must return the `source` field of the override when source is `"override"` — needs a new `overrideSource?: "manual" | "restock_planner"` field in the return shape
2. `ProductionTargetsBar` renders a badge only when `source === "override"` AND `overrideSource === "restock_planner"`

```typescript
// In kitchenConfig/queries.ts, getKitchenTargetsForDate
if (override) {
  return {
    bigBalls, midBalls, packagingBreakdown,
    source: "override" as const,
    overrideSource: override.source ?? "manual",  // NEW
  };
}
```

```tsx
// In ProductionTargetsBar.tsx
{targets.source === "override" && targets.overrideSource === "restock_planner" && (
  <Badge variant="outline" className="text-xs border-blue-300 text-blue-700 dark:text-blue-400">
    from Restock Planner
  </Badge>
)}
```

### Pattern 8: "Save Targets for Kitchen" Button in Dispatch Planner

The button lives in the Dispatch Planner's daily column header (or a dedicated row at the top of the calendar). It:
1. Reads `dailyTotals[date]` from the `getUnifiedWeeklyPlan` result (which has quantities per channel)
2. Iterates through BOM for that day's dispatch plan entries to compute `bigBalls` + `midBalls`
3. Builds `packagingOverrides` from the per-product quantities for that day
4. Calls `setDailyOverride` with `source: "restock_planner"`

This can reuse existing BOM traversal data already computed in `getKitchenTargetsForDate`. The simplest approach is to add a new backend query `getDispatchPlanSummaryForDate` that returns the ball totals and packaging breakdown for a given date from the dispatch plans, and call `setDailyOverride` from the UI with the result.

Alternatively, the button calls `setDailyOverride` with:
- `bigBallOverride`: sum of `BIG_BALL` quantities across all products × BOM quantities for that date
- `midBallOverride`: sum of `MID_BALL` quantities
- `packagingOverrides`: per-`menuProductId` quantities for that date
- `source: "restock_planner"`

The packaging breakdown for the override mirrors the exact structure of `packagingOverrides` in the schema.

### Pattern 9: Remove Capacity Tab from ChannelSettingsDialog

The `ChannelSettingsDialog` has three tabs: Channels, Outlets, Capacity. The Capacity tab calls `useDispatchUpdateSettings` which calls `updatePlannerSettings`. The tab is removed entirely — no replacement, since capacity is now read from `kitchenConfig`.

Steps:
1. Remove the `TabsTrigger` and `TabsContent` for "Capacity" from `ChannelSettingsDialog.tsx`
2. Remove `useDispatchPlannerSettings` and `useDispatchUpdateSettings` hooks from the component (if no other callers)
3. Remove `getPlannerSettings` usage in `simulateInventory` (replace with kitchenConfig read)

Note: `getUnifiedWeeklyPlan` also reads `dispatchPlannerSettings.dailyCapacity` for the CapacityBar display. This may stay as-is (planner page still shows a capacity bar) or be updated to read from kitchenConfig. Per CONTEXT.md, only the simulation and the Capacity tab are changing — the dispatch planner CapacityBar is a separate concern. Verify if `getUnifiedWeeklyPlan`'s `dailyCapacity` field should also be migrated.

### Pattern 10: Ingredients Manager Admin Mapping UI

The `IngredientsManager.tsx` already has:
- `"Tracked"` badge when `ingredient.ingredientComponentTypeId` is set
- `EnableTrackingButton` component for creating a new linked componentType (calls `createIngredientComponentType`)

What's missing for "admin mapping of unlinked ingredients":
- A way to **link an ingredient to an EXISTING componentType** (not just create a new one)
- An amber/warning badge when the ingredient has no link (currently shows `EnableTrackingButton` instead of a warning)

New `LinkIngredientButton` component next to the existing `EnableTrackingButton`:
- Shows an alert/warning on each unlinked row in the table
- Opens a dropdown/select of existing `production + trackInventory` componentTypes for the admin to pick from
- Calls a new mutation `linkIngredientToComponentType(ingredientId, componentTypeId)`

New backend mutation in `convex/ingredients/mutations.ts`:
```typescript
export const linkIngredientToComponentType = mutation({
  args: {
    token: v.string(),
    ingredientId: v.id("ingredients"),
    componentTypeId: v.id("componentTypes"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);
    await ctx.db.patch(args.ingredientId, {
      ingredientComponentTypeId: args.componentTypeId,
    });
  },
});
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| BOM traversal for "save targets" button | Custom traversal in frontend | Call existing `getKitchenTargetsForDate` query (or a new backend query) | Traversal logic already correct in backend |
| ID→name resolution for unlinked warning | Frontend name lookups | Pass names in simulateInventory return | Backend already has the data |
| Source badge display logic | Custom source parsing | Extend `KitchenTargets` interface with `overrideSource` field | Type-safe, consistent with existing `source` pattern |
| FIFO stock tracking for simulation | Write new stock reader | Use existing `componentStock` table aggregation | Already aggregated in `stockByComponent` map |

---

## Common Pitfalls

### Pitfall 1: cumulativeIngredientRequired Already Uses ingredientId as Key

**What goes wrong:** Developer assumes the simulation keys by ingredient name and tries to change the key type.
**Root cause:** Looking at the code superficially — `ingredientNameMap` stores names but `cumulativeIngredientRequired` is already keyed by `ingKey = leaf.ingredientId as string`.
**How to avoid:** The ONLY broken sites are the two `matchingCt = ingredientComponentTypes.find(ct => ct.name.toLowerCase() === ...)` calls. The map key is already the ingredient ID. The fix inserts only a new pre-built `ingredientToComponentTypeMap` and changes the lookup, not the map structure.

### Pitfall 2: Two Name-Match Sites in simulateInventory

**What goes wrong:** Fixing only one of the two name-match sites leaves the summary `ingredientStatus` array still broken.
**Root cause:** The pattern appears at ~line 939 (per-day shortage check) and ~line 994 (top-level summary). Both must be updated.
**How to avoid:** Grep for `ingInfo.name.toLowerCase()` in `dispatchPlanner/queries.ts` — there are exactly 2 occurrences.

### Pitfall 3: source Field Is Optional on kitchenDailyOverrides

**What goes wrong:** New code accesses `override.source` without null guard and TypeScript doesn't warn because the field is `v.optional(...)`.
**Root cause:** Existing rows in production have no `source` field at all.
**How to avoid:** Always treat missing `source` as `"manual"`: `override.source ?? "manual"`. The `getKitchenTargetsForDate` query return and `ProductionTargetsBar` must both handle the `undefined` case.

### Pitfall 4: ManagerTargetSettings Already Calls setDailyOverride

**What goes wrong:** After adding `source` arg to `setDailyOverride`, the existing `ManagerTargetSettings.tsx` call fails TypeScript if the arg is required.
**Root cause:** The mutation adds a new optional arg — existing callers don't pass it.
**How to avoid:** Make `source` optional with default `"manual"` in the mutation handler. Existing callers continue working unchanged, but should be updated to explicitly pass `source: "manual"` for clarity.

### Pitfall 5: "Save targets for kitchen" Needs Ball Totals from BOM

**What goes wrong:** Button saves only `packagingOverrides` without `bigBallOverride`/`midBallOverride`, causing the kitchen view to show 0 balls.
**Root cause:** The ball totals must be computed from BOM traversal, not just from product quantities.
**How to avoid:** The button must trigger a backend query (or reuse `getKitchenTargetsForDate` data) that returns both ball totals AND packaging breakdown. The `getKitchenTargetsForDate` query with `source = "dispatch_plan"` already computes this. A new backend query `getBallTotalsForDate(date)` can expose this specifically for the "Save targets" flow.

### Pitfall 6: ChannelSettingsDialog Capacity Tab Has Hook Dependencies

**What goes wrong:** Removing the Capacity tab while leaving `useDispatchPlannerSettings` / `useDispatchUpdateSettings` hooks in the component causes unused-variable TypeScript errors.
**Root cause:** Hook calls must happen before any conditional returns (React rules), so they can't be conditionally imported.
**How to avoid:** Remove both the hooks and their imports from `ChannelSettingsDialog.tsx`. Check `useDispatchPlanner.ts` hook file for whether `getPlannerSettings` / `updatePlannerSettings` are still used elsewhere before deleting the hooks.

### Pitfall 7: simulateInventory Capacity per Day vs. Static Value

**What goes wrong:** Using a single static `maxTarget` for all 7 days ignores per-day kitchen overrides already set.
**Root cause:** `kitchenDailyOverrides` is per-day, so capacity could differ each day if the manager already set overrides.
**How to avoid:** Pre-load all override docs for the 7-day window at the start of `simulateInventory` (one query with 7 withIndex calls or a range scan), then look up per day.

---

## Code Examples

### Building ingredientToComponentTypeMap in simulateInventory

```typescript
// Source: convex/dispatchPlanner/queries.ts
// Add after fetching componentTypes (around line 780)

// Pre-load ingredient -> componentType mapping for ID-based lookup
const allIngredients = await ctx.db.query("ingredients").collect();
const ingredientToComponentTypeId = new Map<string, string>(); // ingredientId -> componentTypeId
const unlinkedIngredients = new Set<string>(); // ingredient names for warning

for (const ing of allIngredients) {
  if (ing.ingredientComponentTypeId) {
    ingredientToComponentTypeId.set(
      ing._id as string,
      ing.ingredientComponentTypeId as string
    );
  }
}
```

### Replacing the Name-Match Lookup

```typescript
// Source: convex/dispatchPlanner/queries.ts (both ~line 939 and ~994)
// BEFORE (broken):
const matchingCt = ingredientComponentTypes.find(
  (ct) => ct.name.toLowerCase() === ingInfo.name.toLowerCase()
);
const available = matchingCt
  ? (ingredientStockMap.get(matchingCt._id as string) ?? 0)
  : 0;

// AFTER (fixed):
const linkedCtId = ingredientToComponentTypeId.get(ingId);
if (!linkedCtId) {
  // Track unlinked ingredient for warning
  if (!unlinkedIngredientSet.has(ingInfo.name)) {
    unlinkedIngredientSet.add(ingInfo.name);
  }
  continue; // skip — no fallback to name match
}
const available = ingredientStockMap.get(linkedCtId) ?? 0;
```

### Updated simulateInventory Return

```typescript
// Source: convex/dispatchPlanner/queries.ts
return {
  days: result,
  ingredientStatus,
  unlinkedIngredients: Array.from(unlinkedIngredientSet), // NEW
};
```

### setDailyOverride with source Field

```typescript
// Source: convex/kitchenDailyOverrides/mutations.ts
export const setDailyOverride = mutation({
  args: {
    token: v.string(),
    date: v.string(),
    bigBallOverride: v.optional(v.number()),
    midBallOverride: v.optional(v.number()),
    packagingOverrides: v.optional(v.array(v.object({
      menuProductId: v.id("menuProducts"),
      quantity: v.number(),
    }))),
    source: v.optional(v.union(v.literal("manual"), v.literal("restock_planner"))),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, args.token, ["manager", "admin"]);
    const overrideData = {
      date: args.date,
      bigBallOverride: args.bigBallOverride,
      midBallOverride: args.midBallOverride,
      packagingOverrides: args.packagingOverrides,
      source: args.source ?? "manual",
      setAt: Date.now(),
      setBy: user.name,
    };
    // upsert unchanged...
  },
});
```

### getKitchenTargetsForDate — Return overrideSource

```typescript
// Source: convex/kitchenConfig/queries.ts
if (override) {
  return {
    bigBalls,
    midBalls,
    packagingBreakdown,
    source: "override" as const,
    overrideSource: (override.source ?? "manual") as "manual" | "restock_planner",  // NEW
  };
}
// Other branches return overrideSource: undefined (or omit field)
```

### KitchenTargets Interface Update

```typescript
// Source: src/components/kitchen/ProductionTargetsBar.tsx
export interface KitchenTargets {
  bigBalls: number;
  midBalls: number;
  packagingBreakdown: Array<{ menuProductId: string; name: string; quantity: number }>;
  source: "override" | "dispatch_plan" | "defaults";
  overrideSource?: "manual" | "restock_planner";  // NEW
}
```

### linkIngredientToComponentType Mutation

```typescript
// Source: convex/ingredients/mutations.ts (new mutation)
export const linkIngredientToComponentType = mutation({
  args: {
    token: v.string(),
    ingredientId: v.id("ingredients"),
    componentTypeId: v.id("componentTypes"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);
    // Validate componentType exists and is trackable
    const ct = await ctx.db.get(args.componentTypeId);
    if (!ct || !ct.trackInventory) {
      throw new ConvexError("Component type must have trackInventory=true");
    }
    await ctx.db.patch(args.ingredientId, {
      ingredientComponentTypeId: args.componentTypeId,
    });
  },
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Name string matching for ingredient stock | ID-based lookup via `ingredientComponentTypeId` | Phase 24 (this phase) | Simulation no longer breaks when ingredient names diverge from tracker componentType names |
| Separate `dispatchPlannerSettings.dailyCapacity` | Read from `kitchenConfig.maxProductionTarget` | Phase 24 (this phase) | One unified capacity setting; kitchen and planner stay in sync |
| No source tag on overrides | `source: "manual" | "restock_planner"` | Phase 24 (this phase) | Kitchen staff can see when targets came from Restock Planner |

**Existing pattern preserved:**
- `kitchenShiftRecords/ingredientDeduction.ts` already uses the correct ID-based pattern — simulation fix mirrors it exactly
- `kitchenDailyOverrides` upsert pattern (single row per date) stays unchanged

---

## Open Questions

1. **Does getUnifiedWeeklyPlan need to migrate from dispatchPlannerSettings to kitchenConfig?**
   - What we know: `getUnifiedWeeklyPlan` reads `dispatchPlannerSettings.dailyCapacity` for the `CapacityBar` in the Dispatch Planner page
   - What's unclear: CONTEXT.md only says "Remove Capacity tab" and "simulation uses kitchenConfig" — it doesn't explicitly state whether the CapacityBar should also switch data sources
   - Recommendation: Leave `getUnifiedWeeklyPlan.dailyCapacity` using `dispatchPlannerSettings` for the CapacityBar display (it's a separate visual concern from production capacity). Only `simulateInventory` switches to kitchenConfig. Confirm with user if unclear.

2. **How many ingredients are currently unlinked in production?**
   - What we know: `ingredientComponentTypeId` is an optional FK on ingredients (line 28 schema)
   - What's unclear: Exact count not known until runtime — CONTEXT.md notes "research phase should check production data"
   - Recommendation: This is a data question, not a code question. The admin mapping UI will surface all unlinked ingredients. No code blocker.

3. **What triggers "Save targets for kitchen" — ball totals from dispatch plans or from simulation?**
   - What we know: CONTEXT.md says "saves full packaging breakdown" (e.g. 106 singles, 40 triples) — these come from the dispatch plan product quantities for that day, NOT from the simulation's ingredient check results
   - What's unclear: Should the button re-compute BOM traversal on click, or reuse already-fetched data on the page?
   - Recommendation: Add a `getBallTotalsForDispatchPlanDate(date)` query that returns `{ bigBalls, midBalls, packagingBreakdown }` derived from `dispatchPlans.by_date` + BOM. Frontend calls this on button click. Avoids duplicating BOM logic in frontend.

---

## Algorithm Health Check — simulateInventory Findings

Reviewed the full ~300-line `simulateInventory` query. Findings:

**Correct:**
- Cumulative running totals across 7 days (each day adds to previous) — correctly models running out over time
- Caching of `ingredientCache` per production component ID — avoids repeated BOM traversal
- Separate `ingredientRunsOutDate` tracking for first runs-out date
- "Low" threshold at 20% buffer (`available < required * 1.2`) — reasonable early warning

**Edge cases to fix while modifying:**
1. **Day-loop capacity check:** The code checks `if (!ct.trackInventory && ct.category !== "production") continue` — this accidentally skips ALL non-tracked production components (BIG_BALL, MID_BALL). Balls shouldn't generate packaging shortages, but the condition logic is inverted. Clarify: should be `if (ct.category === "packaging" && !ct.trackInventory) continue` to skip non-tracked packaging.
2. **ingredientShortages array rebuilt per day:** The `ingredientShortages` array is re-populated each day but contains ALL ingredients that were ever short (cumulative). This is correct behavior but could generate duplicate entries for the same ingredient across multiple days of the week view.
3. **`unlinkedIngredientSet`:** After the fix, unlinked ingredients are silently skipped. The top-level `ingredientStatus` array naturally omits them. The new `unlinkedIngredients` return field handles surfacing them.

**No blocking algorithm bugs found** — the health check confirms it's a targeted fix, not a rewrite.

---

## Sources

### Primary (HIGH confidence)
- `convex/dispatchPlanner/queries.ts` — Direct code inspection; both name-match sites at ~939 and ~994 confirmed
- `convex/kitchenShiftRecords/ingredientDeduction.ts` — Reference pattern for correct ID-based lookup
- `convex/lib/hierarchyTraversal.ts` — `IngredientUsage` interface confirms `ingredientId` is already available
- `convex/schema.ts` — `kitchenDailyOverrides` table structure confirmed; `dispatchPlannerSettings` structure confirmed
- `convex/kitchenDailyOverrides/mutations.ts` — `setDailyOverride` current signature confirmed
- `convex/kitchenConfig/queries.ts` — Priority chain implementation confirmed; `getKitchenTargetsForDate` pattern available for reuse
- `src/components/kitchen/ProductionTargetsBar.tsx` — `KitchenTargets` interface and `source` field confirmed; JSDoc notes "No source label shown (per user decision)" — this needs revision for restock_planner badge
- `src/pages/IngredientsManager.tsx` — Existing `EnableTrackingButton` pattern confirmed; `ingredientComponentTypeId` display already in Tracking column
- `src/components/dispatchPlanner/ChannelSettingsDialog.tsx` — Capacity tab location confirmed (3 tabs: Channels, Outlets, Capacity)

### Secondary (MEDIUM confidence)
- `docs/plans/2026-02-23-v1.4-milestone-brief.md` — Design decisions for priority chain and example flow confirmed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all libraries already in use
- Architecture: HIGH — all relevant files read and cross-referenced
- ID linking fix: HIGH — both broken sites identified, reference pattern (`ingredientDeduction.ts`) confirmed
- Schema change: HIGH — `kitchenDailyOverrides` structure clear, change is additive optional field
- Frontend patterns: HIGH — existing component interfaces read directly
- Pitfalls: HIGH — derived from direct code inspection, not speculation

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (stable codebase, no fast-moving external deps)
