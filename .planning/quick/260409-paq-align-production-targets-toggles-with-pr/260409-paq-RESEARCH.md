# Quick Task: Align Production Targets with Production Components - Research

**Researched:** 2026-04-09
**Domain:** Kitchen component data source unification
**Confidence:** HIGH

## Summary

The `kitchenComponents` table is a standalone table with 10 seeded leaf ingredients (OUTER_MARSHMALLOW, FILLING_PISTACHIO, etc.) tracked in grams. The `componentTypes` table (category="production") currently only has BIG_BALL and MID_BALL -- these are tier-1 components (used in product BOM via menuProductComponents). The leaf ingredients from kitchenComponents do NOT exist in componentTypes yet.

The migration requires: (1) creating the leaf components as new rows in componentTypes with productionComponentLinks connecting them as children of BIG_BALL/MID_BALL, (2) switching all UI/query references from `kitchenComponents` table to `componentTypes` filtered by tier, (3) keeping shift record `componentProduced` format unchanged (uses codes, not IDs).

**Primary recommendation:** Add leaf components to componentTypes, create productionComponentLinks, then swap all 6 consumer sites from kitchenComponents queries to componentTypes queries filtered by tier computation.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Derive kitchen components from `componentTypes` table where tier=0 (leaf, no children in productionComponentLinks). Retire the separate `kitchenComponents` table.
- Split Manager Settings toggles: "Production Components" section = tier-1+ (pieces), "Kitchen Components" section = tier-0/leaf (grams). Both from componentTypes (category="production"), split by computed tier.
- No targets for gram-tracked components in shift form "Components Produced" section. Keep input fields only.

### Specific Ideas
- Nutella Filling (NUTELLA_FILLING, tier-0) must appear in Kitchen Components toggles
- Nutella-Regular (HAZELNUT_REGULAR, tier-1) must appear in Production Components toggles
- enabledKitchenComponents stores codes from componentTypes (same codes as kitchenComponents used)
- Shift record componentProduced format stays compatible (code + name + grams)
</user_constraints>

## Data Flow: kitchenComponents Consumers

Complete inventory of every file referencing `kitchenComponents` table. [VERIFIED: codebase grep]

### Backend (Convex)

| File | Usage | Migration Action |
|------|-------|------------------|
| `convex/schema.ts:1360-1371` | Table definition with by_active, by_code indexes | Keep table temporarily for backward compat; mark deprecated |
| `convex/kitchenComponents/queries.ts` | `list` (activeOnly filter) and `getByCode` queries | Replace with componentTypes query filtered by tier=0 |
| `convex/kitchenComponents/mutations.ts` | `seedDefaults`, `create`, `update` mutations | No longer needed -- components managed via Production Components Manager |
| `convex/kitchenShiftRecords/mutations.ts:57-71` | Accepts `componentProduced` with `kitchenComponentCode` field | NO CHANGE -- uses string codes, not table IDs |
| `convex/kitchenShiftRecords/queries.ts:35-36,79-80` | Passes through `componentProduced`/`componentWaste` from records | NO CHANGE -- reads stored codes from records |
| `convex/kitchenConfig/queries.ts:35,57-59` | `enabledKitchenComponents` field stores codes | NO CHANGE to storage -- codes stay the same format |
| `convex/kitchenConfig/mutations.ts:30` | Accepts `enabledKitchenComponents` array of strings | NO CHANGE -- still stores code strings |

### Frontend (React)

| File | Usage | Migration Action |
|------|-------|------------------|
| `src/hooks/convex/useKitchenTargets.ts:31-32` | `useQuery(api.kitchenComponents.queries.list, { activeOnly: true })` | Switch to new tier-aware query |
| `src/components/kitchen/ManagerTargetSettings.tsx:72-73` | `useQuery(api.kitchenComponents.queries.list, { activeOnly: true })` | Switch to new tier-aware query |
| `src/components/kitchen/EndOfShiftForm.tsx:84-93` | Receives `kitchenComponents` prop (array with code, name, unit, sortOrder) | Update prop type to match componentTypes shape |
| `src/components/kitchen/ComponentProductionSection.tsx:23-30` | `KitchenComponent` interface with _id, name, code, ballTypeGroup, unit, sortOrder | Update interface to match componentTypes |
| `src/components/kitchen/ShiftEditDialog.tsx:90-91` | `useQuery(api.kitchenComponents.queries.list, { activeOnly: true })` | Switch to new tier-aware query |
| `src/pages/KitchenViewV2.tsx:57,234` | Destructures `kitchenComponents` from useKitchenTargets, passes to EndOfShiftForm | Update to use new field name from hook |

## Code Compatibility Analysis

### Shift Record Format: SAFE [VERIFIED: schema.ts + mutations.ts]

Shift records store component data as:
```typescript
componentProduced: [{
  kitchenComponentCode: string,   // e.g. "OUTER_MARSHMALLOW"
  kitchenComponentName: string,   // snapshot at submission time
  grams: number,
}]
```

This uses **string codes**, not table IDs. As long as the codes in componentTypes match the codes in kitchenComponents, all historical data stays valid. The daily component summary query (`getDailyComponentSummary`) aggregates by `kitchenComponentCode` string -- no table lookup needed.

### Code Format Comparison [VERIFIED: codebase grep]

| kitchenComponents codes | componentTypes codes (current) |
|------------------------|-------------------------------|
| OUTER_MARSHMALLOW | BIG_BALL |
| FILLING_PISTACHIO | MID_BALL |
| PISTACHIO_SPREAD | (only 2 production codes exist) |
| SALT | |
| CACAO_POWDER | |
| MILK_POWDER | |
| KUNAFA | |
| PISTACHIO_PASTE | |
| BUTTER | |
| MARSHMALLOW | |

**Key finding:** The kitchenComponents codes (OUTER_MARSHMALLOW, etc.) do NOT overlap with existing componentTypes codes (BIG_BALL, MID_BALL). The leaf codes must be ADDED to componentTypes as new rows. No collision risk.

### enabledKitchenComponents Config Field [VERIFIED: kitchenConfig schema + queries]

Currently stores kitchenComponents codes (e.g., `["OUTER_MARSHMALLOW", "FILLING_PISTACHIO"]`). After migration, will store componentTypes codes -- which are the SAME strings since we're creating new componentTypes rows with identical codes. No format change needed.

## Tier Computation Reuse

### Existing: `getComponentsWithTiers` [VERIFIED: productionRecipes/queries.ts:113-138]

- Fetches ALL componentTypes where category="production"
- Computes tier via `productionComponentLinks` traversal (leaf=0, parent=1+)
- Returns full component objects with `tier` field appended
- Used ONLY by ProductionComponentsManager page via `useProductionComponentsWithTiers` hook

### Recommendation for Kitchen Config Page

Create a lightweight query `getProductionComponentsByTier` that returns two arrays: `tier1Plus` (for "Production Components" toggles) and `tier0` (for "Kitchen Components" toggles). This avoids importing the heavy ProductionComponentsManager query and keeps the kitchen config page lean.

Alternatively, reuse `getComponentsWithTiers` directly and filter client-side. The query is already small (scans only production componentTypes + their links). For toggle rendering, the overhead is negligible.

**Recommendation:** Reuse `getComponentsWithTiers` from productionRecipes/queries.ts. It already computes tiers correctly. Client-side filter `tier === 0` vs `tier > 0` is trivial. No new query needed.

## Migration Strategy

### Phase 1: Data (Backend)

1. **Add leaf components to componentTypes** -- Create 10 new rows with same codes as kitchenComponents (OUTER_MARSHMALLOW, etc.), category="production", unit="g", trackInventory=false
2. **Create productionComponentLinks** -- Link each leaf as child of the appropriate parent (BIG_BALL or MID_BALL) based on the `ballTypeGroup` field from kitchenComponents. Components without ballTypeGroup can be linked to both parents or left unlinked (tier=0 regardless).
3. **Add Nutella components** -- Per CONTEXT.md, NUTELLA_FILLING (tier-0) and HAZELNUT_REGULAR (tier-1) need to exist. These may need to be created as new componentTypes if not already present.

### Phase 2: Query Migration (Backend)

1. Replace `kitchenComponents.queries.list` usage with `getComponentsWithTiers` filtered to tier=0 items

### Phase 3: Frontend Migration

1. Update `useKitchenTargets` hook to use tier-aware query
2. Update `ManagerTargetSettings` -- split the existing single "Kitchen Components" toggle section into tier-based sections (both already exist as "Production Components" and "Kitchen Components")
3. Update `EndOfShiftForm` and `ComponentProductionSection` prop types
4. Update `ShiftEditDialog` to use new query
5. Update `KitchenViewV2` prop passing

### Phase 4: Cleanup

1. Mark kitchenComponents table as deprecated (do not drop immediately -- historical reference)
2. Remove kitchenComponents queries/mutations from API

## Common Pitfalls

### Pitfall 1: ballTypeGroup mapping
**What goes wrong:** kitchenComponents have optional `ballTypeGroup` field (e.g., "MID_BALL", "BIG_BALL") used for grouping. When creating productionComponentLinks, this mapping determines parent-child relationships.
**How to avoid:** Use ballTypeGroup to determine parent. Components without ballTypeGroup are standalone leaves (still tier=0).

### Pitfall 2: Existing shift records
**What goes wrong:** Shift records with componentProduced entries reference codes like "OUTER_MARSHMALLOW". If codes change, historical data breaks.
**How to avoid:** Use IDENTICAL codes in componentTypes. Verified: no code collision exists.

### Pitfall 3: The getComponentsWithTiers maxDepth=3
**What goes wrong:** The tier computation has maxDepth=3 limit and cycle detection. Adding leaf nodes as children won't cause issues since they have no children themselves.
**How to avoid:** This is safe -- leaf nodes return tier=0 immediately.

### Pitfall 4: Unit tracking mismatch
**What goes wrong:** Current componentTypes production items use unit="pcs" (BIG_BALL, MID_BALL). Kitchen leaf components use unit="g". Both coexist in the same category.
**How to avoid:** The shift form already handles gram-based input separately. The unit field on componentTypes distinguishes them. Tier split naturally separates pieces (tier-1) from grams (tier-0).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The 10 kitchenComponents codes (OUTER_MARSHMALLOW, etc.) do not exist in componentTypes yet and must be seeded | Code Compatibility | Seed script would fail on duplicate code -- easy to detect |
| A2 | NUTELLA_FILLING and HAZELNUT_REGULAR are new codes that need to be created | Migration Strategy | If they already exist, seed would skip them -- no harm |
| A3 | Components without ballTypeGroup can be linked to both BIG_BALL and MID_BALL as parents | Migration Strategy | If wrong, tier would still be 0 even unlinked -- affects grouping in daily summary only |

## Sources

### Primary (HIGH confidence)
- `convex/schema.ts` -- kitchenComponents (lines 1360-1371), kitchenShiftRecords (lines 1378-1420), componentTypes (lines 740-798), productionComponentLinks (lines 807-815), kitchenConfig (lines 1330-1350)
- `convex/kitchenComponents/queries.ts` + `mutations.ts` -- full table API
- `convex/kitchenConfig/queries.ts` + `mutations.ts` -- config storage
- `convex/kitchenShiftRecords/mutations.ts` -- shift record write format
- `convex/kitchenShiftRecords/queries.ts` -- daily component summary aggregation
- `convex/productionRecipes/queries.ts:113-175` -- getComponentsWithTiers + computeTier
- `convex/componentTypes/seed.ts` -- only BIG_BALL + MID_BALL seeded
- `src/components/kitchen/ManagerTargetSettings.tsx` -- toggle UI
- `src/components/kitchen/EndOfShiftForm.tsx` -- shift form
- `src/components/kitchen/ComponentProductionSection.tsx` -- gram input UI
- `src/components/kitchen/ShiftEditDialog.tsx` -- edit dialog
- `src/hooks/convex/useKitchenTargets.ts` -- kitchen data hook
- `src/pages/KitchenViewV2.tsx` -- page wiring
