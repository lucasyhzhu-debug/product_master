---
phase: quick-260409-paq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - convex/componentTypes/seed.ts
  - convex/productionRecipes/queries.ts
  - src/hooks/convex/useKitchenTargets.ts
  - src/components/kitchen/ManagerTargetSettings.tsx
  - src/components/kitchen/EndOfShiftForm.tsx
  - src/components/kitchen/ComponentProductionSection.tsx
  - src/components/kitchen/ShiftEditDialog.tsx
  - src/pages/KitchenViewV2.tsx
autonomous: true
requirements: []

must_haves:
  truths:
    - "Manager Settings shows two distinct toggle sections: 'Production Components' (tier-1+ like Dubai-Regular, Nutella-Regular) tracked as pieces, and 'Kitchen Components' (tier-0 leaves like Outer-Marshmallow, Filling-Pistachio) tracked as grams"
    - "Both toggle sections derive data from componentTypes table (category=production), split by computed tier"
    - "Shift form 'Components Produced' section shows only tier-0 leaf components with gram inputs and no target numbers"
    - "Enabling/disabling kitchen component toggles still stores codes in enabledKitchenComponents config field"
    - "Historical shift records remain valid (codes unchanged: OUTER_MARSHMALLOW, etc.)"
    - "NUTELLA_FILLING appears in Kitchen Components toggles, HAZELNUT_REGULAR appears in Production Components toggles"
  artifacts:
    - path: "convex/componentTypes/seed.ts"
      provides: "seedLeafKitchenComponents mutation adding 10+ leaf components to componentTypes + productionComponentLinks"
    - path: "convex/productionRecipes/queries.ts"
      provides: "getComponentsWithTiers query (existing, reused by frontend)"
      exports: ["getComponentsWithTiers"]
    - path: "src/hooks/convex/useKitchenTargets.ts"
      provides: "Kitchen targets hook using getComponentsWithTiers instead of kitchenComponents.queries.list"
    - path: "src/components/kitchen/ManagerTargetSettings.tsx"
      provides: "Split toggles: tier-1+ as Production Components, tier-0 as Kitchen Components"
  key_links:
    - from: "src/hooks/convex/useKitchenTargets.ts"
      to: "convex/productionRecipes/queries.ts"
      via: "useQuery(api.productionRecipes.queries.getComponentsWithTiers)"
      pattern: "getComponentsWithTiers"
    - from: "src/components/kitchen/ManagerTargetSettings.tsx"
      to: "convex/productionRecipes/queries.ts"
      via: "useQuery(api.productionRecipes.queries.getComponentsWithTiers)"
      pattern: "getComponentsWithTiers"
    - from: "src/components/kitchen/EndOfShiftForm.tsx"
      to: "componentTypes tier-0 data"
      via: "kitchenComponents prop (now tier-0 from componentTypes)"
      pattern: "tier.*0"
---

<objective>
Unify kitchen component data source from the standalone `kitchenComponents` table to `componentTypes` (category="production") split by computed tier. Tier-1+ components (Big Ball, Mid Ball, Dubai-Regular, Nutella-Regular, etc.) appear as "Production Components" tracked in pieces. Tier-0 leaf components (Outer-Marshmallow, Filling-Pistachio, Nutella Filling, etc.) appear as "Kitchen Components" tracked in grams.

Purpose: Eliminate data duplication between kitchenComponents and componentTypes tables. Establish single source of truth for all production component hierarchy.
Output: All 6 frontend consumer sites migrated from kitchenComponents queries to tier-filtered componentTypes queries. Seed mutation for leaf components in componentTypes.
</objective>

<execution_context>
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/workflows/execute-plan.md
@D:/Claude/Product Manager/product_master/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/quick/260409-paq-align-production-targets-toggles-with-pr/260409-paq-CONTEXT.md
@.planning/quick/260409-paq-align-production-targets-toggles-with-pr/260409-paq-RESEARCH.md

<interfaces>
<!-- Key types and contracts the executor needs. -->

From convex/productionRecipes/queries.ts:
```typescript
// Returns all componentTypes where category="production" with computed tier field
export const getComponentsWithTiers = query({
  args: {},
  handler: async (ctx) => {
    // Returns: Array<ComponentType & { tier: number }>
    // tier=0 means leaf (no children in productionComponentLinks)
    // tier=1+ means has children
  },
});
```

From convex/schema.ts (componentTypes):
```typescript
componentTypes: defineTable({
  code: v.string(),
  name: v.string(),
  category: v.union(v.literal("production"), v.literal("packaging")),
  gramsPerUnit: v.optional(v.number()),
  unit: v.string(),          // "pcs" for balls, "g" for leaves
  trackInventory: v.boolean(),
  sortOrder: v.number(),
  isActive: v.boolean(),
  createdBy: v.string(),
  createdAt: v.number(),
  // ... other optional fields
})

productionComponentLinks: defineTable({
  parentComponentId: v.id("componentTypes"),
  childComponentId: v.id("componentTypes"),
  quantityPerUnit: v.number(),
  unit: v.string(),
  sortOrder: v.number(),
})
```

From convex/kitchenComponents schema (being retired):
```typescript
kitchenComponents: defineTable({
  name: v.string(),
  code: v.string(),           // e.g. "OUTER_MARSHMALLOW"
  ballTypeGroup: v.optional(v.string()),  // "MID_BALL" or "BIG_BALL"
  unit: v.string(),           // always "g"
  isActive: v.boolean(),
  sortOrder: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
```

From src/components/kitchen/ComponentProductionSection.tsx:
```typescript
export interface KitchenComponent {
  _id: string;
  name: string;
  code: string;
  ballTypeGroup?: string;
  unit: string;
  sortOrder: number;
}
```

From src/components/kitchen/EndOfShiftForm.tsx:
```typescript
kitchenComponents?: Array<{
  _id: string;
  name: string;
  code: string;
  ballTypeGroup?: string;
  unit: string;
  sortOrder: number;
}>;
```
</interfaces>
</context>

## Git Workflow
**Branch:** `gsd/phase-70-data-accuracy-foundation` (current branch)
**Checkpoints:** None (fully autonomous)

## Implementation Waves
### Wave 1: Backend + Frontend [SEQUENTIAL]
| Task | Files |
|------|-------|
| Task 1: Seed leaf components + productionComponentLinks | `convex/componentTypes/seed.ts` |
| Task 2: Swap all 6 consumer sites from kitchenComponents to tier-filtered componentTypes | `src/hooks/convex/useKitchenTargets.ts`, `src/components/kitchen/ManagerTargetSettings.tsx`, `src/components/kitchen/EndOfShiftForm.tsx`, `src/components/kitchen/ComponentProductionSection.tsx`, `src/components/kitchen/ShiftEditDialog.tsx`, `src/pages/KitchenViewV2.tsx` |

### Wave 2: Verification [SEQUENTIAL]
| Task |
|------|
| `npm run type-check` passes |
| `npm run build` succeeds |

## Documentation Updates
- [ ] CHANGELOG.md (after merge to main)

## Success Criteria
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] No references to `api.kitchenComponents.queries.list` in frontend code
- [ ] ManagerTargetSettings has two distinct toggle sections split by tier

<tasks>

<task type="auto">
  <name>Task 1: Seed leaf kitchen components into componentTypes and create productionComponentLinks</name>
  <files>convex/componentTypes/seed.ts</files>
  <action>
Add a new `seedLeafKitchenComponents` mutation to `convex/componentTypes/seed.ts`. This mutation:

1. Creates 12 leaf ingredient rows in `componentTypes` with category="production", unit="g", trackInventory=false, isActive=true. Use IDENTICAL codes from the existing kitchenComponents table so historical shift records stay valid. The components to seed:

```
{ code: "OUTER_MARSHMALLOW", name: "Outer-Marshmallow", sortOrder: 10 }
{ code: "FILLING_PISTACHIO", name: "Filling-Pistachio", sortOrder: 11 }
{ code: "PISTACHIO_SPREAD", name: "Pistachio Spread", sortOrder: 12 }
{ code: "SALT", name: "Salt", sortOrder: 13 }
{ code: "MARSHMALLOW", name: "Marshmallow", sortOrder: 14 }
{ code: "CACAO_POWDER", name: "Cacao Powder", sortOrder: 15 }
{ code: "MILK_POWDER", name: "Milk Powder", sortOrder: 16 }
{ code: "KUNAFA", name: "Kunafa", sortOrder: 17 }
{ code: "PISTACHIO_PASTE", name: "Pistachio Paste", sortOrder: 18 }
{ code: "BUTTER", name: "Butter", sortOrder: 19 }
{ code: "NUTELLA_FILLING", name: "Nutella Filling", sortOrder: 20 }
{ code: "HAZELNUT_REGULAR", name: "Hazelnut-Regular", sortOrder: 3 }
```

For all leaf ingredients (everything except HAZELNUT_REGULAR): unitCostIdr=0, unit="g", createdBy="system-seed".
For HAZELNUT_REGULAR: unitCostIdr=0, unit="pcs" (it's a tier-1 ball product like BIG_BALL/MID_BALL).

2. After creating componentTypes rows, create `productionComponentLinks` to establish the hierarchy:
   - HAZELNUT_REGULAR is a tier-1 parent (like BIG_BALL/MID_BALL) -- it will get children linked to it
   - Leaf components with no specific ballTypeGroup get linked as children of BOTH BIG_BALL and MID_BALL
   - The kitchenComponents seedDefaults had no ballTypeGroup data, so link all 10 original leaves to both BIG_BALL and MID_BALL (quantityPerUnit=1, unit="g")
   - NUTELLA_FILLING gets linked as child of HAZELNUT_REGULAR (quantityPerUnit=1, unit="g")

3. Idempotent: check by_code index before inserting each component. Skip if exists. Check productionComponentLinks by_parent + by_child before inserting links.

4. Return counts of created/skipped components and links.

NOTE: This seed must be run manually from the Convex dashboard Functions tab before the frontend changes take effect. The frontend will still work without seed data (getComponentsWithTiers returns empty tier-0 list gracefully), but toggles won't show leaf components until seeded.
  </action>
  <verify>
    <automated>cd D:/Claude/Product\ Manager/product_master && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>seedLeafKitchenComponents mutation exists in convex/componentTypes/seed.ts, type-checks clean, creates 12 componentTypes rows + productionComponentLinks establishing leaf-parent hierarchy</done>
</task>

<task type="auto">
  <name>Task 2: Swap all frontend consumers from kitchenComponents to tier-filtered componentTypes</name>
  <files>src/hooks/convex/useKitchenTargets.ts, src/components/kitchen/ManagerTargetSettings.tsx, src/components/kitchen/EndOfShiftForm.tsx, src/components/kitchen/ComponentProductionSection.tsx, src/components/kitchen/ShiftEditDialog.tsx, src/pages/KitchenViewV2.tsx</files>
  <action>
Migrate 6 files from `api.kitchenComponents.queries.list` to `api.productionRecipes.queries.getComponentsWithTiers`, filtering by tier.

**File 1: `src/hooks/convex/useKitchenTargets.ts`**
- Replace `useQuery(api.kitchenComponents.queries.list, { activeOnly: true })` with `useQuery(api.productionRecipes.queries.getComponentsWithTiers)`
- The returned data includes all production componentTypes with `tier` field. Filter to `tier === 0` for kitchen components (leaves).
- Export the full `componentsWithTiers` array (so ManagerTargetSettings can also use it for tier-1+ filtering without a second query).
- Rename the return field from `kitchenComponents` to `productionComponentsWithTiers` for clarity.
- Also expose a derived `kitchenComponents` field that filters to `tier === 0` items for backward compat with EndOfShiftForm props.

Return shape should be:
```typescript
return {
  today,
  targets,
  todayShiftRecords,
  productionComponentsWithTiers, // full array with tier field
  kitchenComponents,             // tier === 0 only (for shift form)
  dailyComponentSummary,
};
```

**File 2: `src/components/kitchen/ManagerTargetSettings.tsx`**
- Remove `useQuery(api.kitchenComponents.queries.list, { activeOnly: true })` (line 72-73).
- Remove `useQuery(api.componentTypes.queries.getByCategory, { category: "production", activeOnly: true })` (line 66-69).
- Instead, accept a new prop `productionComponentsWithTiers` (the full array from useKitchenTargets) OR add its own `useQuery(api.productionRecipes.queries.getComponentsWithTiers)`.

  PREFERRED: Add `useQuery(api.productionRecipes.queries.getComponentsWithTiers)` directly in this component (it's manager-only, always rendered when visible, and Convex deduplicates reactive queries). This avoids changing the component's props API.

- For "Production Components" toggle section (existing, lines 273-310): filter `componentsWithTiers` to `tier > 0` items. These are BIG_BALL, MID_BALL, HAZELNUT_REGULAR, etc. The toggle uses `ct.code` which works identically.
- For "Kitchen Components" toggle section (existing, lines 313-365): filter `componentsWithTiers` to `tier === 0` items. Replace `kitchenComponentsList` references with this filtered array. The toggle logic using `comp.code` stays the same.
- Remove all references to `kitchenComponentsList` variable.
- The `allCodes` computation (line 315) should use the tier-0 filtered array instead.

**File 3: `src/components/kitchen/ComponentProductionSection.tsx`**
- Update the `KitchenComponent` interface: remove `ballTypeGroup?: string` (not present on componentTypes). Add optional `tier?: number` field for type compat. Keep `_id`, `name`, `code`, `unit`, `sortOrder` which all exist on componentTypes.
- No other changes needed -- the component receives filtered data via props.

**File 4: `src/components/kitchen/EndOfShiftForm.tsx`**
- Update the `kitchenComponents` prop type (line 84-91): remove `ballTypeGroup?: string`. These are now tier-0 componentTypes rows which don't have ballTypeGroup. The `_id`, `name`, `code`, `unit`, `sortOrder` fields all exist on componentTypes.
- No logic changes needed -- the component uses `comp.code` and `comp.name` which are identical fields.

**File 5: `src/components/kitchen/ShiftEditDialog.tsx`**
- Replace `useQuery(api.kitchenComponents.queries.list, { activeOnly: true })` (line 90-91) with `useQuery(api.productionRecipes.queries.getComponentsWithTiers)`.
- Filter to `tier === 0` items for kitchen component display.
- Import `api` from correct path (already imported).

**File 6: `src/pages/KitchenViewV2.tsx`**
- Destructure the new field names from `useKitchenTargets()`. Replace `kitchenComponents` with the hook's new return shape.
- Pass tier-0 filtered `kitchenComponents` to `EndOfShiftForm` as before.
- The `kitchenComponents ?? []` on line 234 should use the tier-0 filtered array from the hook.

CRITICAL: Do NOT remove imports of `api` modules that are still used elsewhere in each file. Only remove the specific `kitchenComponents.queries` references.

CRITICAL: The shift form `componentProduced` submission format must remain `{ kitchenComponentCode, kitchenComponentName, grams }` -- this is stored in shift records and must not change. The field NAMES in the mutation args are `kitchenComponentCode`/`kitchenComponentName` regardless of data source.
  </action>
  <verify>
    <automated>cd D:/Claude/Product\ Manager/product_master && npm run build 2>&1 | tail -20</automated>
  </verify>
  <done>All 6 frontend files use getComponentsWithTiers instead of kitchenComponents.queries.list. ManagerTargetSettings shows two toggle sections split by tier (tier-1+ = "Production Components" in pieces, tier-0 = "Kitchen Components" in grams). Build passes clean. No references to api.kitchenComponents.queries.list remain in src/ directory.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| seed mutation | Admin-only mutation creates componentTypes rows -- no user input beyond auth token |
| shift form submission | Component codes stored in shift records must match new componentTypes codes exactly |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-paq-01 | T (Tampering) | Seed mutation | accept | Seed is admin-only, runs once manually. Idempotent check prevents duplicates. Low risk. |
| T-paq-02 | I (Info Disclosure) | componentTypes query | accept | getComponentsWithTiers is a public query returning non-sensitive component metadata (names, codes). Same visibility as existing kitchenComponents.queries.list. |
| T-paq-03 | D (Denial of Service) | Tier computation | accept | computeTier has maxDepth=3 and cycle detection. Adding leaf nodes (depth=0) adds no computation overhead. |
</threat_model>

<verification>
1. `npm run type-check` -- zero errors
2. `npm run build` -- succeeds
3. `grep -r "kitchenComponents.queries.list" src/` -- zero matches (all consumers migrated)
4. After running seed from Convex dashboard: `getComponentsWithTiers` returns 12+ items, tier-0 items include OUTER_MARSHMALLOW, FILLING_PISTACHIO, NUTELLA_FILLING, tier-1+ items include BIG_BALL, MID_BALL, HAZELNUT_REGULAR
</verification>

<success_criteria>
- `npm run build` passes
- No frontend imports of `api.kitchenComponents.queries.list`
- ManagerTargetSettings renders two distinct toggle sections: "Production Components" (tier-1+ codes) and "Kitchen Components" (tier-0 codes)
- Shift form ComponentProductionSection shows only tier-0 leaf components with gram inputs, no target numbers
- enabledKitchenComponents config field continues to store string codes
- Seed mutation is idempotent and creates all 12 componentTypes + productionComponentLinks
</success_criteria>

<output>
After completion, create `.planning/quick/260409-paq-align-production-targets-toggles-with-pr/260409-paq-SUMMARY.md`
</output>
