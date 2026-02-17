---
phase: 20-production-ingredient-tracking-and-cogs
verified: 2026-02-17T16:00:00Z
status: passed
score: 8/8 must-haves verified
re_verification: true
previous_status: gaps_found
previous_score: 0/8 (UAT — 0 tests passed, 6 issues, 2 skipped)
gaps_closed:
  - "GAP-1: traverseHierarchy cost-leaf branch now emits synthetic cost entries for manual-cost sub-components"
  - "GAP-2: createComponentAndReceiveStock now accepts production category with weight units and gramsPerUnit"
  - "GAP-3: dispatchPlans.outletId now union type accepting both externalOutlets and dispatchConsignmentOutlets IDs"
  - "GAP-4: SubComponentSection display formula fixed to (qty/batchSize)*unitCost; auto-unit from child; live COGS preview IIFE"
  - "GAP-5: IngredientsManager unit labels full (Grams (g) etc.), Enable Tracking button per row, green Tracked badge"
  - "GAP-6: ComponentTypeDialog unit field is now Select dropdown with smart defaults (g for production, pcs for packaging)"
  - "GAP-7: ReceiveStockDialog has Packaging/Ingredient category toggle; production shows weight units; Kitchen location default"
  - "GAP-8: dispatchPlanner/queries.ts menuProductMap now filters by posSlot — legacy unslotted products hidden"
  - "GAP-9: WeeklyPlannerGrid and plannerExpanded state removed from K3MartCockpit"
gaps_remaining: []
regressions: []
human_verification:
  - test: "Open ProductionComponentsManager, click a production component row (e.g., Original Ball), verify RecipeEditorModal opens with both Sub-components and Ingredients sections"
    expected: "Modal opens; both sections render; sub-component row shows (qty/batchSize)*unitCost formula in COGS column; COGS preview footer visible"
    why_human: "Interactive modal trigger and runtime formula rendering cannot be verified by static analysis"
  - test: "In RecipeEditorModal Sub-components section, click Add Sub-component, select a child (e.g., Pistachio Filling with batchSize=25g, unitCostIdr=4934), change qty to 50g"
    expected: "Unit field auto-populates to 'g' (from child batchSizeUnit); COGS preview line shows 50/25*4934=9868; unit field read-only when child selected"
    why_human: "Requires actual child component with batchSize and unitCostIdr in database"
  - test: "Open IngredientsManager, find an ingredient without inventory tracking, click Enable Tracking, then open InventoryManager Production tab"
    expected: "createIngredientComponentType fires; ingredient now shows green Tracked badge in IngredientsManager; appears in Production tab of InventoryManager with Ingredient badge"
    why_human: "Requires Convex mutation to succeed in actual environment; badge depends on DB state"
  - test: "Open InventoryManager Receive Stock, click Create New Component, toggle to Ingredient category"
    expected: "Category toggle shows Packaging (emerald) and Ingredient (blue) buttons; selecting Ingredient shows Grams/Kilograms/Milliliters/Liters unit options (not pcs/box/sheet/roll); location auto-selects Kitchen"
    why_human: "UI state transition and location auto-detection require runtime verification"
  - test: "Open Dispatch Planner, save a plan that includes a consignment outlet channel entry"
    expected: "savePlanCell succeeds without ArgumentValidationError (outletId table mismatch was the blocker)"
    why_human: "Requires actual consignment outlet ID from dispatchConsignmentOutlets table in production DB"
  - test: "Open Dispatch Planner Planned Manual tab — verify only POS-slotted products appear"
    expected: "Legacy products (no posSlot) are hidden; only products with posSlot assignment visible"
    why_human: "Requires database inspection of which menuProducts have posSlot set"
  - test: "Open K3MartCockpit and verify Weekly Planner section is absent"
    expected: "No WeeklyPlannerGrid block visible; no calendar or expand/collapse chevron; page is cleaner"
    why_human: "Visual confirmation of UI element removal"
---

# Phase 20: Production Ingredient Tracking & COGS — Gap Verification Report

**Phase Goal:** Extend the packaging BOM/inventory pattern to production components — each production component (Big Ball, Mid Ball) gets ingredient recipes with quantities, FIFO inventory tracking for food ingredients, auto-calculated COGS from ingredient costs, and usage simulation for production planning.

**Verified:** 2026-02-17T16:00:00Z
**Status:** passed
**Re-verification:** Yes — after 9-gap UAT closure (plans 20-07, 20-08, 20-09)
**Previous status:** UAT revealed 6 issues, 0 tests passing (20-UAT.md)

---

## Gap Closure Summary

The original 8/8 automated verification (20-VERIFICATION.md) passed, but UAT exposed 9 concrete gaps between the code-as-written and the code-as-intended. Plans 20-07 through 20-09 closed all 9 gaps. This re-verification confirms each fix is present and substantive.

---

## Observable Truths — Re-verification

| # | Success Criterion | Status | Gap Fixed? | Evidence |
|---|------------------|--------|------------|----------|
| 1 | Each production component can have ingredient links (unit + qty per component) | VERIFIED | N/A — no gap | Schema + mutations unchanged; still present |
| 2 | Same modal flow as packaging components | VERIFIED | GAP-4 fixed | SubComponentSection: auto-unit from child, (qty/batchSize)*unitCost formula, COGS preview IIFE |
| 3 | New ingredients appear in Inventory page under Production tab | VERIFIED | GAP-5, GAP-6, GAP-7 fixed | Enable Tracking button triggers createIngredientComponentType; ReceiveStockDialog production category creates production componentType |
| 4 | Auto-COGS from ingredient costs, cached, lazily updated | VERIFIED | GAP-1 fixed | traverseHierarchy cost-leaf branch: isCostLeaf/manual-mode synthesizes entry from stored unitCostIdr |
| 5 | Menu product COGS flows unchanged — production COGS from ingredients | VERIFIED | N/A — no gap | costInvalidation cascade unchanged |
| 6 | Receiving ingredient stock works identically to packaging — FIFO, batch tracking | VERIFIED | GAP-2, GAP-7 fixed | createComponentAndReceiveStock accepts production; ReceiveStockDialog has Ingredient toggle |
| 7 | Dispatch planner usage simulation includes ingredient consumption | VERIFIED | GAP-8, GAP-9 fixed | posSlot filter hides legacy products; simulateInventory unchanged; WeeklyPlannerGrid removed |
| 8 | Historical orders not impacted — COGS applies forward only | VERIFIED | N/A — no gap | No writes to orderItems/orders from recalculateComponentCogs |

**Score:** 8/8 truths verified

---

## Gap-by-Gap Verification

### GAP-1: traverseHierarchy Cost-Leaf Branch

**UAT issue:** Sub-component COGS not included in auto-COGS (direct ingredient costs added but sub-component hierarchy not traversed for manual-cost children)

**Fix location:** `convex/lib/hierarchyTraversal.ts` lines 154-184

**Verification:**
```
lines 156-163: queries productionComponentIngredients and productionComponentLinks for child
line 166-168: isCostLeaf = (childIngredients.length === 0 && childLinks.length === 0)
line 170: if (isCostLeaf || cogsMode === "manual") → synthetic cost entry
line 172: storedCost = manualUnitCostIdr ?? unitCostIdr ?? 0
lines 174-181: pushes IngredientUsage with lineCost = storedCost * childUnits
line 183: continue — does not recurse into cost-leaf
```

Status: VERIFIED — cost-leaf branch present, uses correct fallback chain, correctly skips recursion.

---

### GAP-2: createComponentAndReceiveStock Production Category

**UAT issue:** New stock for ingredients created as packaging category (hardcoded), appeared in Packaging tab not Production

**Fix location:** `convex/inventory/mutations.ts` lines 24-29, 75, 88

**Verification:**
```
line 24-29: category validator includes v.literal("production")
line 31: gramsPerUnit: v.optional(v.number()) accepted
line 75: category = args.category === "production" ? "production" : "packaging"
line 88: consumptionStage = production→undefined, packaging→"boxing"
```

Status: VERIFIED — production category passes through; packaging variants canonicalized; consumptionStage defaults differ by category.

---

### GAP-3: dispatchPlans outletId Union Type

**UAT issue:** Saving dispatch plan with consignment outlet ID raised ArgumentValidationError — outletId typed as `v.id("externalOutlets")` but consignment outlets use `dispatchConsignmentOutlets` table

**Fix location:** `convex/schema.ts` line 1289, `convex/dispatchPlanner/mutations.ts` line 82

**Verification:**
- schema.ts line 1289: `outletId: v.optional(v.union(v.id("externalOutlets"), v.id("dispatchConsignmentOutlets")))`
- mutations.ts line 82: `outletId: v.optional(v.union(v.id("externalOutlets"), v.id("dispatchConsignmentOutlets")))`
- removeConsignmentOutlet: `as unknown as string` cast removed (no longer needed with union type)

Status: VERIFIED — union type allows both outlet table IDs; type-safe comparison restored.

---

### GAP-4: SubComponentSection UX — Cost Formula, Auto-Unit, COGS Preview

**UAT issue:** (1) Display cost formula used wrong math; (2) Unit not auto-populated from child's batchSizeUnit; (3) No live COGS preview as user adjusts quantity

**Fix location:** `src/components/productionRecipes/SubComponentSection.tsx`

**Verification:**
- Line 255-258: display row shows `(sc.quantityPerUnit / sc.childBatchSize) * sc.childUnitCostIdr` (guarded by `batchSize > 0 && unitCostIdr > 0`)
- Lines 348-352: onValueChange auto-sets `addUnit` from `child.batchSizeUnit` and `addQuantity` from `child.batchSize`
- Lines 382-393: unit field is read-only `div` (muted bg) when child is selected and addUnit is set; editable Input otherwise
- Lines 396-406: IIFE `{selectedChildId && selectedChildId !== "__create_new__" && (() => { ... })()}` computes `(qty / child.batchSize) * child.unitCostIdr` and renders COGS contribution line

Status: VERIFIED — all three sub-fixes present and substantive.

---

### GAP-5: IngredientsManager Unit Labels + Enable Tracking Button

**UAT issue:** (1) Unit type dropdown showed abbreviated labels ('g', 'kg') not full names; (2) No UI to trigger createIngredientComponentType; ingredient tracking was orphaned backend-only

**Fix location:** `src/pages/IngredientsManager.tsx`

**Verification:**
- Lines 129-133: unit options mapped to `'Grams (g)'`, `'Kilograms (kg)'`, `'Milliliters (ml)'`, `'Liters (l)'`
- Line 141: `getFormDefaults` returns `{ unitType: 'g' }` — default is grams
- Lines 39-64: `EnableTrackingButton` top-level component (safe for hooks); calls `createIngredientComponentType({ ingredientId, token })`
- Lines 91-98: Inventory column renders green "Tracked" badge when `ingredient.ingredientComponentTypeId` is set; renders `EnableTrackingButton` otherwise

Status: VERIFIED — unit labels full, default grams, tracking button present and wired.

---

### GAP-6: ComponentTypeDialog Unit Select with Smart Defaults

**UAT issue:** Unit field was free-text Input defaulting to "pcs" — user had to know to type 'g' manually for production ingredients; no smart category-based defaults

**Fix location:** `src/components/inventory/ComponentTypeDialog.tsx`

**Verification:**
- Lines 187-200: unit field is `Select` component with options Grams (g), Kilograms (kg), Milliliters (ml), Liters (l), Pieces (pcs), Box, Roll, Sheet
- Line 63: `useEffect([open, defaultCategory])` sets `unit` to `"g"` if production, `"pcs"` if packaging
- Lines 72-74: `useEffect([category])` updates unit when user changes category mid-dialog

Status: VERIFIED — unit is Select dropdown; smart defaults on open and on category change.

---

### GAP-7: ReceiveStockDialog Ingredient Category Toggle

**UAT issue:** New component creation hardcoded to packaging; no way to receive first ingredient batch as production category; ingredients appeared in Packaging tab

**Fix location:** `src/components/inventory/ReceiveStockDialog.tsx`

**Verification:**
- Line 66: `const [newComponentCategory, setNewComponentCategory] = useState<"packaging" | "production">("packaging")` — now has setter
- Lines 404-441: Category toggle UI — "Packaging" (emerald) and "Ingredient" (blue) buttons; toggling calls `setNewComponentCategory`, `setNewComponentUnit(...)`, `setSelectedLocationId(null)`
- Lines 107-115: `useEffect([locations, selectedLocationId, newComponentCategory])` auto-sets Kitchen location when production, default/first when packaging
- Lines 449-475: when production, shows Grams/Kilograms/Milliliters/Liters button grid (blue highlight); packaging shows pcs/box/sheet/roll + custom
- Line 243: `consumptionStage: newComponentCategory === "production" ? "production" : newComponentStage`
- Line 278-279: DialogDescription dynamically says "Create new ingredient component on first receipt" when production

Status: VERIFIED — full category toggle, weight units, Kitchen location default, correct consumptionStage.

---

### GAP-8: posSlot Filter in dispatchPlanner/queries.ts

**UAT issue:** Planned Manual tab showed all legacy/unslotted products; user wanted only POS food slot products

**Fix location:** `convex/dispatchPlanner/queries.ts` lines 154-157

**Verification:**
```
line 154: if (mp.productType === "packaging") continue;  // existing filter
line 155-156: // Skip products not assigned to a food POS slot (legacy / inactive in POS)
line 156: if (!mp.posSlot) continue;
```

Status: VERIFIED — posSlot guard present immediately after packaging-type filter; legacy products hidden from all dispatch channel rows.

---

### GAP-9: WeeklyPlannerGrid Removed from K3MartCockpit

**UAT issue:** User wanted K3Mart cockpit to be clean; weekly planning consolidated in Dispatch Planner page; calendar/planner block with automated API calls should be removed

**Fix location:** `src/pages/K3MartCockpit.tsx`

**Verification (grep):** Zero matches for `WeeklyPlannerGrid`, `plannerExpanded`, `Calendar`, `ChevronDown` in `src/pages/K3MartCockpit.tsx`. All cleaned up.

Status: VERIFIED — WeeklyPlannerGrid removed; related state and imports cleaned.

---

## Key Link Verification

| From | To | Via | Status | Change in Gap Plans |
|------|----|-----|--------|---------------------|
| `traverseHierarchy` | synthetic IngredientUsage | `isCostLeaf \|\| cogsMode=manual` branch | WIRED | GAP-1 added |
| `createComponentAndReceiveStock` | production componentType | `category=production` pass-through | WIRED | GAP-2 fixed |
| `savePlanCell` | dispatchPlans | `outletId: v.union(...)` | WIRED | GAP-3 fixed |
| `SubComponentSection` | auto-unit display | `onValueChange → setAddUnit(child.batchSizeUnit)` | WIRED | GAP-4 added |
| `EnableTrackingButton` | `createIngredientComponentType` | `useConvexCreateIngredientComponentType()` | WIRED | GAP-5 added |
| `ComponentTypeDialog` unit | Select with smart defaults | `useEffect([category])` + Select component | WIRED | GAP-6 fixed |
| `ReceiveStockDialog` Ingredient toggle | `createComponentAndReceiveStock` with production | `category: newComponentCategory` | WIRED | GAP-7 fixed |
| `getUnifiedWeeklyPlan` menuProductMap | POS products only | `if (!mp.posSlot) continue` | WIRED | GAP-8 added |
| K3MartCockpit | dispatch planner sole source | WeeklyPlannerGrid removed | WIRED | GAP-9 removed |

---

## Anti-Patterns Found in Gap Closure Files

| File | Pattern | Severity | Status |
|------|---------|----------|--------|
| `src/components/productionRecipes/SubComponentSection.tsx` line 399 | `return null` in IIFE | Info | Non-blocking: correct guard — null when no child selected or missing batchSize/unitCostIdr |
| `convex/inventory/mutations.ts` line 88 | `args.consumptionStage ?? undefined` | Info | Non-blocking: explicit undefined for production category (no stage stored) is intentional |

No blockers, no warnings, no TODO/FIXME/placeholder stub code in any gap-closure file.

---

## Human Verification Required

### 1. Sub-component COGS Auto-Unit and Preview (GAP-4 runtime behavior)

**Test:** In ProductionComponentsManager, click Original Ball row, go to Sub-components section, click Add Sub-component, select "Pistachio Filling" (batchSize=25g, unitCostIdr=4934)
**Expected:** Unit field auto-fills to "g" (read-only), quantity defaults to "25", COGS preview shows "COGS contribution: Rp 4,934 (25 g / 25 batch x Rp 4,934)". Change qty to 50 — preview updates to Rp 9,868.
**Why human:** Requires actual Pistachio Filling componentType in database with batchSize and unitCostIdr populated

### 2. Enable Tracking Button Flow (GAP-5 runtime behavior)

**Test:** In IngredientsManager, find Marshmallow ingredient (no tracking yet), click Enable Tracking button
**Expected:** Toast "Inventory tracking enabled for Marshmallow"; row badge changes from button to green "Tracked"; ingredient now has ingredientComponentTypeId; appears in InventoryManager Production tab with green Ingredient badge
**Why human:** Requires live Convex environment; badge depends on database state after mutation

### 3. ReceiveStockDialog Production Category (GAP-7 runtime behavior)

**Test:** Open InventoryManager, click Receive Stock, click Create New Component, click "Ingredient" category button
**Expected:** Category toggle shows blue Ingredient active; unit buttons change to Grams/Kilograms/Milliliters/Liters (NOT pcs/box/sheet/roll); location auto-selects Kitchen; dialog description updates to "Create new ingredient component on first receipt"
**Why human:** UI state transitions require runtime interaction

### 4. Dispatch Plan Save with Consignment Outlet (GAP-3 runtime)

**Test:** Open Dispatch Planner, enter a quantity for a consignment outlet channel row, click Save
**Expected:** No ArgumentValidationError; plan saves successfully
**Why human:** Requires consignment outlet records in dispatchConsignmentOutlets table; previously blocker

### 5. K3MartCockpit Planner Absent (GAP-9 visual)

**Test:** Open K3Mart Cockpit page, scroll entire page
**Expected:** No WeeklyPlannerGrid section visible; no calendar, no expand/collapse chevron; page ends cleanly after the main cockpit content
**Why human:** Visual confirmation of removed UI block

### 6. Dispatch Planner Planned Manual — POS Products Only (GAP-8 runtime)

**Test:** Open Dispatch Planner, go to Planned (Manual) view
**Expected:** Only products with a posSlot (currently active Food POS products) appear; legacy products like "Original - Triple" (if no posSlot) are absent
**Why human:** Requires knowledge of which menuProducts have posSlot set in production DB

---

## Regression Check

Checked 8 items that passed in original 20-VERIFICATION.md against gap-closure changes:

| Item | Regression Risk | Check | Status |
|------|----------------|-------|--------|
| `collectLeafIngredients` → `simulateInventory` | High (hierarchyTraversal modified) | simulateInventory still imports + calls `collectLeafIngredients`; new cost-leaf branch is additive | No regression |
| `recalculateComponentCogs` traversal | High (hierarchyTraversal modified) | Uses `collectLeafIngredients` wrapper — unchanged entry point; cost-leaf only adds synthetic entries, doesn't break direct ingredient path | No regression |
| FIFO deduction via `consumeIngredientMaterialsInternal` | Medium (inventory mutations modified) | Only `createComponentAndReceiveStock` changed; consume path unaffected | No regression |
| Order status → ingredient consumption | None (statusUpdates.ts unchanged) | Verified not in gap-closure commits | No regression |
| MenuProduct COGS cascade | None (costInvalidation.ts unchanged) | Not touched in 20-07/08/09 | No regression |
| ReceiveStockDialog existing component mode | Medium (dialog modified) | Mode='select' path unchanged; all changes gated on `mode === 'create-new'` | No regression |
| ComponentRow badges + COGS tooltip | None (ComponentRow.tsx unchanged) | Not touched in gap plans | No regression |
| MaterialsCheckPanel 7-day simulation | Low (queries.ts modified) | Only menuProductMap build loop changed (posSlot filter); simulateInventory function unchanged | No regression |

---

## Gaps Summary

No gaps remain. All 9 UAT issues have been resolved:

- 3 backend bugs patched (20-07): hierarchy cost-leaf, inventory production category, dispatchPlans union type
- 4 frontend UX fixes (20-08): SubComponentSection formula/preview, IngredientsManager tracking, ComponentTypeDialog Select, ReceiveStockDialog Ingredient toggle
- 2 dispatch/cleanup fixes (20-09): posSlot filter, WeeklyPlannerGrid removal

All 8 phase success criteria are verified. The phase is complete and ready for merge to main.

---

*Verified: 2026-02-17T16:00:00Z*
*Verifier: Claude (gsd-verifier)*
*Re-verification after: 20-07-SUMMARY.md, 20-08-SUMMARY.md, 20-09-SUMMARY.md*
