# Code Review: Kitchen Components Migration (paq)

**Date:** 2026-04-09
**Branch:** gsd/phase-70-data-accuracy-foundation
**Scope:** Migration from `kitchenComponents` table to `componentTypes` filtered by tier

---

## Summary

The migration replaces `api.kitchenComponents.queries.list` with `api.productionRecipes.queries.getComponentsWithTiers` filtered by `tier === 0`. The overall approach is sound. Three issues require attention before merge.

---

## Critical Issues

None.

---

## Improvements Needed

### 1. `kitchenComponents` table still exists and is still reachable

**Files:** `convex/kitchenComponents/queries.ts`, `convex/kitchenComponents/mutations.ts`, `convex/schema.ts:1360`

The old `kitchenComponents` table is still defined in the schema and both query/mutation files still reference it. No frontend code calls `api.kitchenComponents.queries.list` anymore (confirmed by grep), but the table and its API surface remain live. This is not a bug today, but it means:

- Historical code paths in mutations can still insert/update records in the dead table
- The schema definition will accumulate drift
- The Convex dashboard shows two data sources for the same concept

This should be tracked as a follow-up cleanup task. The migration is incomplete until the old table is removed (with the proper data-wipe-first approach per project lessons).

### 2. `as any` casts in `seedLeafKitchenComponents` suppress type safety

**File:** `convex/componentTypes/seed.ts`, lines 291, 307, 317, 318

```typescript
childComponentId: childId as any,
parentComponentId: hazelnutRegular as any,
```

`childId` and `hazelnutRegular` are `string` (from `Map.get()` return or `ctx.db.insert()` return), not `Id<"componentTypes">`. The correct fix is to type the map and the variable properly:

```typescript
const codeToId = new Map<string, Id<"componentTypes">>();
// ctx.db.insert returns Id<"componentTypes"> — assign directly
const id: Id<"componentTypes"> = await ctx.db.insert("componentTypes", { ... });
codeToId.set(comp.code, id);

// hazelnutRegular should be Id<"componentTypes"> | undefined
const hazelnutRegular: Id<"componentTypes"> | undefined = codeToId.get("HAZELNUT_REGULAR");
```

With proper types, the `as any` casts are unnecessary and the `productionComponentLinks` insert will be correctly typed.

### 3. `HAZELNUT_REGULAR` will appear as a "Kitchen Component" in the shift form

**File:** `convex/componentTypes/seed.ts`, line 195; `src/hooks/convex/useKitchenTargets.ts`, line 38

`HAZELNUT_REGULAR` is seeded with `unit="pcs"` and `sortOrder: 3`. The docstring calls it "a tier-1 ball product". However, its tier depends entirely on whether `productionComponentLinks` seeds have been run. If `NUTELLA_FILLING` is successfully linked under it, `HAZELNUT_REGULAR` will have `tier === 1` (has children). But if `seedLeafKitchenComponents` is run before `seedProductionComponents` (BIG_BALL/MID_BALL exist) but the NUTELLA_FILLING link fails for any reason, `HAZELNUT_REGULAR` will have `tier === 0` and will surface in `kitchenComponents` as a gram-tracked leaf — despite being a `unit="pcs"` component. This would produce a broken UX (the form always shows `g` label, ignoring the component's actual unit).

The tier-filtering approach is fragile for components whose tier depends on correct link data. A more robust guard would be to also filter by `unit === "g"` when deriving kitchen components:

```typescript
// useKitchenTargets.ts
const kitchenComponents = useMemo(
  () =>
    (productionComponentsWithTiers ?? []).filter((c) => c.tier === 0 && c.unit === "g"),
  [productionComponentsWithTiers]
);
```

Apply the same guard in `ManagerTargetSettings.tsx` line 69 and `ShiftEditDialog.tsx` line 91.

---

## Suggestions

### 4. `allCodes` is computed twice in `ManagerTargetSettings`

**File:** `src/components/kitchen/ManagerTargetSettings.tsx`, lines 124 and 310

`const allCodes = kitchenComponentsList.map((c) => c.code)` is computed inside `toggleKitchenComponent()` and again inside the render IIFE at line 310. This is fine for the current list sizes, but it's inconsistent. Move it to a single `useMemo` at the top of the component:

```typescript
const kitchenComponentCodes = useMemo(
  () => kitchenComponentsList.map((c) => c.code),
  [kitchenComponentsList]
);
```

### 5. IIFE pattern in JSX is unusual and harder to read

**File:** `src/components/kitchen/ManagerTargetSettings.tsx`, lines 309–360

The `{kitchenComponentsList.length > 0 && (() => { ... })()}` pattern is unusual and slightly harder to scan. A named helper component or a simple conditional block would be cleaner. This is style only — no functional issue.

### 6. `handleConfirm` dependency array in `EndOfShiftForm` includes derived values that change on every render

**File:** `src/components/kitchen/EndOfShiftForm.tsx`, line 355

`visibleItems` and `visibleKitchenComponents` are filter results computed inline (not memoized). They are listed as `useCallback` dependencies, which means the callback reference changes whenever `targets`, `config`, or the filter inputs change. This is correct for correctness but defeats the purpose of `useCallback`. If memoization matters here, wrap `visibleItems` and `visibleKitchenComponents` with `useMemo`.

### 7. Seed function does not set `tier` field on new components

**File:** `convex/componentTypes/seed.ts`, line 215

The `getComponentsWithTiers` query computes tier dynamically at query time from link data — it is not stored. This is correct behavior; no issue here. Just noting it is working as designed.

---

## What Looks Good

- Idempotency in all three seed functions is correctly implemented using `by_code` index checks and link existence checks before each insert.
- No stale `api.kitchenComponents.queries.list` calls remain in frontend code — the migration is complete on the consumer side.
- Tier filtering logic is consistent across `useKitchenTargets`, `ManagerTargetSettings`, and `ShiftEditDialog` (all use `c.tier === 0` for kitchen, `c.tier > 0` for production).
- `enabledKitchenComponents: null` sentinel for "all enabled" is handled consistently between the query layer, the config mutation, and all frontend consumers.
- The `addableComponents` filter in `ShiftEditDialog` correctly respects `enabledKitchenComponents` from `kitchenConfig` when showing the "add component" buttons for past-shift edits.
- `componentProduced` and `componentWaste` are correctly excluded from the submit payload when empty (via spread with length check), keeping the mutation args clean for shifts with no component data.

---

## Overall Assessment

**Needs Changes** — two issues should be fixed before merge, one is a follow-up.

**Priority order:**
1. Add `unit === "g"` guard to tier-0 filtering (issue 3) — prevents a seeding-order-dependent UI bug with HAZELNUT_REGULAR
2. Fix `as any` casts in seed.ts (issue 2) — type safety in a mutation that runs against production data
3. Track old `kitchenComponents` table removal as a follow-up cleanup task (issue 1)
