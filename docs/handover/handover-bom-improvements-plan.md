# Handover: BOM Improvements Implementation Plan (v2 -- Staff Reviewed)

**Date:** 2026-02-06
**Revision:** v2 (post staff-review + Convex migration expert + codebase audit + 3 rounds additional user feedback)
**Branch:** `main` (no code changes made -- planning session only)
**Session:** Comprehensive planning for 25 BOM improvements based on manual UI testing + live user feedback
**Staff Review:** `docs/reviews/staffreview-bom-improvements-plan-2026-02-06.md`

---

## How to Continue

**Start new session with:**
> "Implement the BOM improvements plan from `docs/handover/handover-bom-improvements-plan.md`. Start with Wave 0. All Convex backend steps are fully automated -- no manual dashboard steps required."

**Before starting:**
1. Read this handover document fully
2. Run `npm run test` to confirm 255 tests still pass
3. Run `npx convex export` to backup production database
4. Create branch: `git switch -c feature/bom-improvements`
5. Start with Wave 0 (critical bug fixes)

---

## Context Summary

After manual UI testing of the BOM system, 18 issues were found (documented in `docs/handover/handover-bom-ui-testing.md`). During the planning session, the user provided 8 rounds of additional live feedback via screenshots, expanding the scope to **25 issues**. No code was written -- this session was purely planning.

**Expert reviews completed:**
- Staff review: 4 critical issues found, 6 improvements recommended
- Convex migration expert: 3-deployment migration strategy required for category merge
- Codebase audit: 66+ hardcoded slot refs, 40+ category refs across 17 files verified

---

## User's Key Directives (From Live Feedback)

### 1. Remove Packaging Components Page
> "There are just too many clicks and buttons... The only thing we care about is where does the component get consumed. Let's add that data capture into the actual menu product creation process itself. Then this entire Packaging Components page is also redundant."

**Action:** Delete `PackagingComponentsManager.tsx`. Move consumption stage (boxing/labeling) selection into the ProductForm when adding packaging components. Allow inline creation of new packaging components (just name + consumption stage).

### 2. Simplify Production Component Form
> "Make the code and name just one thing. Auto-create code from name. Unit cost and grams per unit makes sense, keep that. The colour -- create a simple colour picker. Remove hex input."

**Action:** Auto-generate code from name (e.g., "Big Ball" -> "BIG_BALL"). Replace hex input with `<input type="color">`. Add curated icon selector (5-8 Lucide icons).

### 3. Dynamic POS Slots
> "Make the POS slots more dynamic. Add slot 5, slot 6, etc. In the ordering section it would just be dynamic."

**Action:** Remove hardcoded 4-slot limit. Schema changes from `v.union(v.literal(1)..4)` to `v.number()`. Frontend shows occupied slots + "+" button to add more. Drag-and-drop reordering. Right-side live POS preview (similar to WhatsApp Templates page). Use `/frontend-design` skill for polished UI.

### 4. Packaging Section in Order Form
> "There is actually no packaging product section in the new order interface. That needs to be created."

**Action:** Add separate "Packaging Products" grid section below "Food Products" in `OrderFormPOS.tsx`. Dynamic sizing based on assigned packaging slots.

### 5. Fix POS Card Production Summary
> "Those 'Production: 1 original balls' underneath each card is incorrect."

**Action:** Lines 237-240 in `MenuProductsManager.tsx` use legacy `productionType`/`productionUnits` fields. Replace with `cachedProductionSummary` which has correct BOM data.

### 6. Order Summary: Conditional Subtotal + Unit Price Display (NEW)
> "The subtotal line doesn't need to exist when there are no vouchers applied -- a total line is fine. When you have more than 1 unit of a product you should also show what a single one costs above the subtotal line."

**Action:** In `OrderFormPOS.tsx:871-892`:
- Hide "Subtotal" row when no voucher is applied (show only "Total")
- Show "Subtotal" + "Voucher" + "Total" only when a voucher discount exists
- For line items with `quantity > 1`, show unit price (e.g., "@ Rp 80.000") below the product name or above the line total, so users see both per-unit and total cost

### 7. Receive Stock Dialog Redesign (NEW)
> "Every single component should already be a button there because there's not many. Storage location should just be the three buttons of the three storage locations. Supplier information should already have the default from the previous batch. Manage components link doesn't need to exist."

**Action:** In `ReceiveStockDialog.tsx`:
- Replace dropdown with button grid showing ALL packaging components (sorted by lowest inventory % first)
- Replace storage location text input with 3 toggle buttons (one per storage location)
- Auto-populate supplier info from most recent batch when a component is selected
- Remove "Manage Components" link
- Inline "Create New" follows same UX as ProductForm inline creation (name + consumption stage only)
- Remove the "Other..." tab -- just show all components as buttons directly

### 8. Confirm: All Packaging in COGS (Business Logic Change)
> User confirmed merging direct/indirect packaging means ALL packaging is included in COGS.

**Action:** `costCalculator.ts` return type changes from `{production, directPackaging, indirectPackaging, total}` to `{production, packaging, total}`. Total = production + packaging. This is an intentional business decision, not just a schema simplification.

---

## Complete Issue List (25 Issues)

### Critical Bugs (Wave 0)
| # | Issue | File | Fix |
|---|-------|------|-----|
| 1 | Duplicate "Voucher" label in order form | `VoucherInput.tsx:213-215` | Remove Label (parent `OrderFormPOS.tsx:841-843` already renders it) |
| 4 | `productType` auto-detection broken in CREATE mutation (`Array.some(async)` always truthy) | `convex/menuProducts/mutations.ts:165-170` | Use `Promise.all` + `.some()` pattern from UPDATE mutation (lines 275-282) |
| POS | POS cards show "Production: 1 original balls" instead of actual BOM data | `MenuProductsManager.tsx:237-240` | Replace legacy `productionType`/`productionUnits` with `cachedProductionSummary` |

### Schema & Backend (Wave 1A + 1B)
| # | Issue | File | Fix |
|---|-------|------|-----|
| 16 | `direct_packaging`/`indirect_packaging` distinction redundant | `convex/schema.ts:676-680` | **3-deployment migration** to merge to `"packaging"` (see Migration Strategy) |
| COGS | costCalculator return type must change | `convex/lib/costCalculator.ts` | Merge `directPackaging`/`indirectPackaging` into single `packaging` bucket. Update all callers |
| 15 | Component type creation over-engineered | `convex/componentTypes/mutations.ts` | For packaging: only Name required. Code auto-generates, unit="pcs", cost=0 |
| SLOT | POS slots hardcoded to 4 | `convex/schema.ts:65-73` | Change to `v.number()` with runtime validation (must be positive integer) |
| STAGE | `consumptionStage` pipeline needs dual-location support | `menuProductComponents` + `componentTypes` | Add to both tables; snapshot effective stage into `orderComponentReservations` at reservation time |

### Product Form Redesign (Wave 2A + 2B)
| # | Issue | File | Fix |
|---|-------|------|-----|
| 9 | No Food/Packaging product type selector | `ProductForm.tsx` | Add toggle at top. Conditional fields per type |
| 5 | Form uses Sheet (right panel) | `ProductForm.tsx` | Convert to centered Dialog |
| 7 | Product Code field redundant | `ProductForm.tsx` | Remove from form, auto-generate on backend |
| 8 | No duplicate name validation | `ProductForm.tsx` | Query existing products, show warning |
| 6 | Active/inactive toggle missing | `ProductForm.tsx` | Add Switch component |
| CONS | Packaging component consumption stage not captured during product creation | `PackagingComponentsSection.tsx` | Add "Consumed at" selector (Boxing/Labeling) next to each packaging component |
| INLINE | Can't create packaging components inline | `PackagingComponentsSection.tsx` | Add "Create new" option: just name + consumption stage |

### Menu Products Page (Wave 3)
| # | Issue | File | Fix |
|---|-------|------|-----|
| 2 | Packaging POS empty slots not clickable | `MenuProductsManager.tsx:474-495` | Add `cursor-pointer` + `onClick` |
| 3 | "Legacy Products" should be "Available Products" | `MenuProductsManager.tsx:501-527` | Rename + fix query to exclude `packagingPosSlot` |
| DYN | POS slots hardcoded to 4 in frontend | `MenuProductsManager.tsx` | Dynamic slot rendering + drag-and-drop + live POS preview |

### Production Components (Wave 4)
| # | Issue | File | Fix |
|---|-------|------|-----|
| PROD | Code field redundant, hex color input bad UX | `ProductionComponentsManager.tsx` | Auto-generate code from name, color picker, icon selector |

### Inventory UI (Wave 5)
| # | Issue | File | Fix |
|---|-------|------|-----|
| 10 | Stat card labels hard to read | `InventoryManager.tsx:132-158` | Larger titles, high-contrast text |
| 11 | No stock level progress bars | `InventoryManager.tsx` | Add colored progress bars (green/yellow/red) |
| 12 | No category filter | `InventoryManager.tsx` | Add All/Production/Packaging filter |
| RCV | Receive Stock dialog needs redesign | `ReceiveStockDialog.tsx` | Component buttons, location buttons, auto-supplier, remove Manage Components link |

### Order Form + Kitchen + Cleanup (Wave 6)
| # | Issue | File | Fix |
|---|-------|------|-----|
| ORD | No packaging products in Order POS | `OrderFormPOS.tsx` | Add separate "Packaging Products" section below food |
| SUM | Subtotal always shown even without voucher + no unit price for qty>1 | `OrderFormPOS.tsx:871-892` | Conditional subtotal, show per-unit price |
| 17 | Kitchen V2 uses mock inventory data | `KitchenViewV2.tsx:237-244` | Replace with real Convex query |
| DEL | ComponentTypesManager + PackagingComponentsManager pages redundant | `ComponentTypesManager.tsx`, `PackagingComponentsManager.tsx` | DELETE pages + routes |

---

## CRITICAL: Migration Strategy (From Convex Expert Review)

**The category merge (`direct_packaging`/`indirect_packaging` -> `packaging`) CANNOT be done in a single deployment.** Convex validates schema against existing data BEFORE deploying code. If existing records have `direct_packaging`, a schema that only allows `"production" | "packaging"` will be **rejected at deploy time** and migration code never runs.

### Required 3-Deployment Approach (All Automated)

**Deployment 1 (Wave 1A-step1): Expand schema**
```
Schema accepts 4 values: production | direct_packaging | indirect_packaging | packaging
All existing data remains valid. Zero risk.
```
- Deploy via `npx convex deploy` (automated in CI, or via `npx convex dev` locally)

**Deployment 2 (Wave 1A-step2): Migrate data + update code**
```
1. Deploy updated code (new mutations, costCalculator, frontend)
2. Run migration mutation programmatically (NOT from dashboard)
3. Verify migration via verification mutation
```
- Migration runs as a Convex mutation called from a script or test
- All 17 files updated to use `"packaging"` instead of old values
- `costCalculator.ts` refactored: return type changes
- All tests updated

**Deployment 3 (Wave 1A-step3): Remove old literals**
```
Schema only accepts 2 values: production | packaging
Safe because all data already migrated in step 2.
```
- Deploy via `npx convex deploy`

### Automation: No Manual Dashboard Steps

The migration mutation will be invoked programmatically:
```typescript
// In a Node.js script or test file:
import { ConvexHttpClient } from "convex/browser";
const client = new ConvexHttpClient(process.env.CONVEX_URL!);
await client.mutation(api.migrations.categorySimplification.migrateCategories);
const result = await client.mutation(api.migrations.categorySimplification.verifyMigration);
console.assert(result.migrationComplete === true);
```

---

## Staff Review: Critical Issues Addressed

### Critical 1: consumptionStage Pipeline Break (ADDRESSED)
The inventory consumption pipeline in `inventoryIntegration.ts` reads `consumptionStage` from `componentTypes`. Moving it solely to `menuProductComponents` would break the `consumeBoxingMaterialsInternal` and `consumeStickerMaterialsInternal` functions.

**Resolution:** Add `consumptionStage` to BOTH tables:
- `componentTypes.consumptionStage` = default value (kept for backwards compatibility)
- `menuProductComponents.consumptionStage` = override per product-component link
- At reservation time, snapshot the effective stage into `orderComponentReservations.consumptionStage`
- Consumption functions read from the reservation record (decoupled from future schema changes)

### Critical 2: COGS Business Logic Change (ADDRESSED)
Merging categories changes COGS calculation -- indirect packaging was previously excluded from total. User confirmed this is intentional.

**Resolution:** Explicit Wave 1A.5 task for costCalculator refactor with:
- Function signature change
- Return type change (`{production, packaging, total}`)
- All caller updates
- Test updates (7+ test cases in costCalculatorBOM.test.ts)
- CostTooltip.tsx frontend update

### Critical 3: No Data Migration Strategy (ADDRESSED)
See Migration Strategy section above. 3-deployment approach with backup, migration, verification, and rollback.

### Critical 4: Dynamic POS Slot Type Safety (ADDRESSED)
**Resolution:** Use `v.number()` in schema + runtime validation in every mutation:
```typescript
if (args.slot < 1 || !Number.isInteger(args.slot)) {
  throw new Error("Slot must be a positive integer");
}
```
No hardcoded upper limit -- UI enforces practical max (can't add more slots than products exist).

---

## Implementation Waves (Revised)

### Wave 0: Critical Bug Fixes [PARALLEL, no dependencies]

**Commit checkpoint after wave. Run: `npm run type-check && npm run build && npm run test`**

| Agent | Task | Files |
|-------|------|-------|
| convex-backend | **Fix #4**: `Array.some(async)` bug in CREATE mutation. Replace lines 165-170 with `Promise.all` + `.some()` pattern matching UPDATE mutation at 275-282 | `convex/menuProducts/mutations.ts` |
| react-ui-builder | **Fix #1**: Remove duplicate "Voucher" label. Delete `<Label>` at lines 213-215 in VoucherInput (parent `OrderFormPOS.tsx:841-843` already renders it) | `src/components/orders/VoucherInput.tsx` |
| react-ui-builder | **Fix POS summary**: Lines 237-240 use legacy `productionType`/`productionUnits`. Replace with `cachedProductionSummary` | `src/pages/MenuProductsManager.tsx` |
| react-ui-builder | **Fix Kitchen V2 mock data**: Replace hardcoded `packagingInventory` array (lines 237-244) with real Convex query. Independent of everything else | `src/pages/KitchenViewV2.tsx` |
| convex-backend | **Kitchen V2 backend**: Create `getPackagingStockSummary` query returning real inventory data | `convex/inventory/queries.ts` |

---

### Wave 1A: Category Migration [SEQUENTIAL -- 3 deployments]

**This wave requires 3 sequential Convex deployments. All automated, no manual dashboard steps.**

**Step 1: Expand schema (Deployment 1)**

| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Add `"packaging"` to the category union (keep old values temporarily). Add `consumptionStage` optional field to `menuProductComponents` and `orderComponentReservations` tables | `convex/schema.ts` |

**Deploy:** `npx convex dev` (auto-deploys in dev mode) or `npx convex deploy`

**Step 2: Migration script + code updates + costCalculator refactor (Deployment 2)**

| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Create migration mutations: `migrateCategories` (converts direct/indirect -> packaging), `verifyMigration` (confirms 0 old values), `rollbackMigration` (emergency restore) | `convex/migrations/categorySimplification.ts` (NEW) |
| convex-backend | **Refactor costCalculator**: Change category type from 3 to 2 values. Change return from `{production, directPackaging, indirectPackaging, total}` to `{production, packaging, total}`. Total = production + packaging (all packaging in COGS) | `convex/lib/costCalculator.ts` |
| convex-backend | Update ALL backend files: componentTypes queries/mutations, inventory mutations, menuProducts mutations. Update `consumeBoxingMaterialsInternal`/`consumeStickerMaterialsInternal` to read consumptionStage from reservation | `convex/componentTypes/queries.ts`, `convex/componentTypes/mutations.ts`, `convex/inventory/mutations.ts`, `convex/menuProducts/mutations.ts`, `convex/orders/mutations/inventoryIntegration.ts` |
| convex-backend | Simplify component type creation -- for packaging: only Name required. Code auto-generates from name, unit defaults "pcs", cost defaults 0 | `convex/componentTypes/mutations.ts` |
| react-ui-builder | Update ALL frontend files: hooks, components, dialogs. Replace `"direct_packaging"`/`"indirect_packaging"` with `"packaging"` everywhere. Update `CostTooltip.tsx` for new COGS return shape | `src/hooks/convex/useComponentTypes.ts`, `src/hooks/convex/useInventory.ts`, `src/components/menuProducts/PackagingComponentsSection.tsx`, `src/components/menuProducts/ProductForm.tsx`, `src/components/inventory/ComponentTypeDialog.tsx`, `src/components/inventory/ReceiveStockDialog.tsx`, `src/components/shared/CostTooltip.tsx` |
| code-auditor | Update ALL test files: replace old categories with `"packaging"`. Update COGS test expectations (directPackaging/indirectPackaging -> packaging). | `convex/lib/__tests__/costCalculatorBOM.test.ts`, `tests/convex/componentTypes.test.ts`, `tests/convex/inventory.test.ts` |

**Deploy + Run migration programmatically:**
```bash
npx convex dev  # deploys code
# Migration runs automatically via Node.js script (see Migration Strategy section)
```

**Step 3: Remove old literals (Deployment 3)**

| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Remove `direct_packaging` and `indirect_packaging` from schema union. Only `"production"` and `"packaging"` remain | `convex/schema.ts` |

**Commit checkpoint. Run: `npm run type-check && npm run build && npm run test`**

---

### Wave 1B: Dynamic POS Slots [Can run parallel with Wave 1A Step 2]

| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Change `posSlot`/`packagingPosSlot` from `v.union(v.literal(1)..4)` to `v.optional(v.number())`. Add runtime validation (positive integer) to `assignToSlot` and `assignToPackagingSlot` mutations. Merge the two near-identical mutations into single `assignToSlot(id, slot, slotType: "food" | "packaging")` | `convex/schema.ts`, `convex/menuProducts/mutations.ts` |
| react-ui-builder | Update all frontend slot types from `1 \| 2 \| 3 \| 4` to `number`. Remove hardcoded `[1,2,3,4]` arrays. Update `useMenuProducts.ts` types and casts | `src/hooks/convex/useMenuProducts.ts`, `src/components/menuProducts/ProductForm.tsx`, `src/components/orders/ProductButtons.tsx`, `src/components/dashboard/OrderStatsCards.tsx` |

**Commit checkpoint. Run: `npm run type-check && npm run build && npm run test`**

---

> **CONTEXT CHECKPOINT: Run `/compact` here (~50% context).** The migration waves are complete. Remaining waves are all frontend-focused UI work. Summarize: "Waves 0, 1A, 1B complete. Category migrated to production|packaging. POS slots now dynamic v.number(). costCalculator returns {production, packaging, total}. consumptionStage on both componentTypes and menuProductComponents. All tests passing. Continue with Wave 2A from handover plan."

---

### Wave 2A: ProductForm Structural Changes [SEQUENTIAL, after Wave 1A]

Use `/frontend-design` skill for the ProductForm to make it polished.

| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | **#5**: Convert Sheet to Dialog. Use `<Dialog>/<DialogContent className="max-w-2xl max-h-[90vh]">` | `src/components/menuProducts/ProductForm.tsx` |
| react-ui-builder | **#9**: Add Food/Packaging toggle at top. Food path: Production Components + Packaging Components + Weight + Food POS Slot. Packaging path: Only Packaging Components + Packaging POS Slot. Set `productType` explicitly from this choice (removes broken auto-detection) | `src/components/menuProducts/ProductForm.tsx` |
| react-ui-builder | **#6**: Add active/inactive toggle (Switch component) | `src/components/menuProducts/ProductForm.tsx` |

**Commit checkpoint. Run: `npm run type-check && npm run build`**

---

### Wave 2B: ProductForm Behavioral Changes [SEQUENTIAL, after Wave 2A]

| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | **#7**: Remove Product Code field from form. Auto-generate on backend (already done in mutations) | `src/components/menuProducts/ProductForm.tsx` |
| react-ui-builder | **#8**: Add duplicate name validation. Query existing products, show inline warning if name matches | `src/components/menuProducts/ProductForm.tsx` |
| react-ui-builder | **Consumption stage in BOM**: When adding a packaging component to a product, show a "Consumed at" selector (Boxing/Labeling) next to each component. Saves to `menuProductComponents.consumptionStage` | `src/components/menuProducts/PackagingComponentsSection.tsx`, `convex/menuProductComponents/mutations.ts` |
| react-ui-builder | **Inline packaging component creation**: When adding a packaging component, user can either pick existing OR create new inline (just name + consumption stage). Reuse simplified `ComponentTypeDialog.tsx` in a modal-within-modal pattern, or inline form expansion | `src/components/menuProducts/PackagingComponentsSection.tsx` |

**Commit checkpoint. Run: `npm run type-check && npm run build && npm run test`**

---

### Wave 3: Menu Products Page Overhaul [after Wave 2B]

Use `/frontend-design` skill. Reference WhatsApp Templates page design for live preview pattern.

| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | **Dynamic POS slots**: Replace all `[1,2,3,4].map()` with dynamic slot rendering. Show all occupied slots + one "+" card. Drag-and-drop reordering. Right-side live POS preview showing how it looks in the order form | `src/pages/MenuProductsManager.tsx` |
| react-ui-builder | **#2**: Make packaging empty slots clickable (add `cursor-pointer` + `onClick` to open ProductForm with `productType: "packaging"` prefilled) | `src/pages/MenuProductsManager.tsx` |
| react-ui-builder | **#3**: Rename "Legacy Products" to "Available Products". Fix query to exclude `packagingPosSlot`. Add "Assign to Food POS" / "Assign to Packaging POS" buttons per product type | `src/pages/MenuProductsManager.tsx` |
| convex-backend | Rename `listLegacyProducts` query to `listAvailableProducts`. Exclude products with `packagingPosSlot` | `convex/menuProducts/queries.ts`, `src/hooks/convex/useMenuProducts.ts` |

**Commit checkpoint. Run: `npm run type-check && npm run build && npm run test`**

---

### Wave 4: Production Components + Page Deletions [after Wave 1A, independent of Waves 2-3]

| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | **Simplify form**: Auto-generate Code from Name (e.g., "Big Ball" -> "BIG_BALL"). Replace hex color input with `<input type="color">` styled with Tailwind. Add curated icon selector (5-8 Lucide icons: Circle, Cookie, Candy, Box, Package, Star, Sparkles, Zap). Fix row icon to use selected component icon | `src/pages/ProductionComponentsManager.tsx` |
| react-ui-builder | **Delete pages**: Remove `ComponentTypesManager.tsx` page + route. Remove `PackagingComponentsManager.tsx` page + route. Remove any nav links/sidebar references. Add redirects for bookmarked URLs | `src/pages/ComponentTypesManager.tsx` (DELETE), `src/pages/PackagingComponentsManager.tsx` (DELETE), `src/App.tsx` |

**Commit checkpoint. Run: `npm run type-check && npm run build`**

---

### Wave 5: Inventory UI + Receive Stock Redesign [after Wave 1A]

| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | **#10**: Improve stat card readability -- larger titles, high-contrast text, clean styling | `src/pages/InventoryManager.tsx` |
| react-ui-builder | **#11**: Add progress bars showing stock percentage vs reorder point. Green >66%, Yellow 33-66%, Red <33% | `src/pages/InventoryManager.tsx` |
| react-ui-builder | **#12**: Add category filter (All / Production / Packaging) alongside location tabs | `src/pages/InventoryManager.tsx` |
| react-ui-builder | **Receive Stock redesign**: Replace component dropdown with button grid (ALL components shown, sorted by lowest inventory % first). Replace storage location text input with 3 toggle buttons (one per location). Auto-populate supplier info from most recent batch on component selection. Remove "Manage Components" link. Inline "Create New" uses same UX as ProductForm inline creation (name + consumption stage only) | `src/components/inventory/ReceiveStockDialog.tsx` |

**Commit checkpoint. Run: `npm run type-check && npm run build`**

---

### Wave 6: Order Form Packaging + Summary UX [after Wave 3]

| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | **Packaging section in Order POS**: Add separate "Packaging Products" section below "Food Products". Query `packagingPosProducts` and render as a second grid. Dynamic sizing based on number of assigned packaging slots | `src/components/orders/OrderFormPOS.tsx`, `src/components/orders/ProductButtons.tsx` |
| react-ui-builder | **Order Summary UX**: (1) Hide "Subtotal" row when no voucher applied -- show only "Total". Show Subtotal + Voucher + Total only when discount exists. (2) For line items with `quantity > 1`, display unit price (e.g., "@ Rp 80.000") below product name in the item card at `OrderFormPOS.tsx:598-623` | `src/components/orders/OrderFormPOS.tsx` |

**Commit checkpoint. Run: `npm run type-check && npm run build && npm run test`**

---

### Wave 7: Verification + Documentation [SEQUENTIAL, after all waves]

| Agent | Task |
|-------|------|
| code-auditor | Full type check: `npm run type-check` |
| code-auditor | Grep for stale refs: `direct_packaging`, `indirect_packaging`, `ComponentTypesManager`, `PackagingComponentsManager`, hardcoded `[1, 2, 3, 4]` |
| Bash | `npm run build` |
| Bash | `npm run test` |
| Docs | Update `docs/CHANGELOG.md`, `docs/SCHEMA.md` (category values, POS slot changes, consumptionStage), `docs/API_REFERENCE.md` (updated queries/mutations), `CLAUDE.md` (remove deleted pages from Quick File Finder, update page count from 19 to 17) |

---

## Key Design Decisions

1. **Consumption stage lives on BOTH tables**: `componentTypes.consumptionStage` (default) and `menuProductComponents.consumptionStage` (per-product override). At reservation time, the effective stage is snapshotted into `orderComponentReservations.consumptionStage`. This decouples the inventory consumption pipeline from future schema changes.

2. **Dynamic POS slots**: Schema uses `v.number()` with runtime validation (positive integer). Frontend dynamically renders occupied slots + "+" button. Max = number of products of that type. Drag-and-drop reordering.

3. **Both ComponentTypes AND PackagingComponents pages removed.** Production components stay on their existing page. Packaging components created inline during product creation.

4. **POS card summary** must use `cachedProductionSummary` (from BOM) not legacy `productionType`/`productionUnits`.

5. **All packaging included in COGS** after merging direct/indirect. `costCalculator.ts` returns `{production, packaging, total}` where total = production + packaging. This is an intentional business decision.

6. **Category migration requires 3 Convex deployments** (expand schema -> migrate data + update code -> remove old literals). Cannot be done in single deployment because Convex validates schema against existing data before deploying code.

7. **Slot mutations consolidated**: `assignToSlot` and `assignToPackagingSlot` merge into single `assignToSlot(id, slot, slotType)` since they are 90% identical code.

8. **Order Summary conditional**: Subtotal line only shows when voucher is applied. Unit price shown for multi-quantity items.

9. **Receive Stock dialog uses button grid**: All components shown as buttons (not dropdown), sorted by lowest inventory %. Storage locations shown as 3 toggle buttons. Supplier info auto-populates from most recent batch.

---

## Critical Code Locations

### The `Array.some(async)` Bug (Issue #4)
**File:** `convex/menuProducts/mutations.ts`
```
Lines 165-170 (BROKEN - CREATE mutation):
  const hasProductionComponent = args.components.some(async (comp) => {
    const componentType = await ctx.db.get(comp.componentTypeId);
    return componentType?.category === "production";
  });
  // Array.some() with async callback returns Promise (truthy), so always "food"

Lines 275-282 (CORRECT - UPDATE mutation):
  const hasProductionComponent = await Promise.all(
    components.map(async (comp) => {
      const componentType = await ctx.db.get(comp.componentTypeId);
      return componentType?.category === "production";
    })
  );
  patchData.productType = hasProductionComponent.some((p) => p) ? "food" : "packaging";
```

### POS Card Legacy Summary Bug
**File:** `src/pages/MenuProductsManager.tsx:237-240`
```
CURRENT (WRONG - uses legacy fields):
  Production: {product.productionUnits} {product.productionType === 'bite_sized' ? 'bite-sized' : 'original'} balls

SHOULD USE:
  {product.cachedProductionSummary}  // e.g., "2 Big Ball, 1 Mid Ball"
```

### Schema: Category Union (3-deployment migration)
**File:** `convex/schema.ts:676-680`
```
CURRENT:  v.union(v.literal("production"), v.literal("direct_packaging"), v.literal("indirect_packaging"))
STEP 1:   v.union(v.literal("production"), v.literal("direct_packaging"), v.literal("indirect_packaging"), v.literal("packaging"))
STEP 3:   v.union(v.literal("production"), v.literal("packaging"))
```

### Schema: POS Slots (single deployment -- type widening)
**File:** `convex/schema.ts:65-77`
```
CURRENT:  v.optional(v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4)))
TARGET:   v.optional(v.number())  // Any positive integer, validated at runtime
```

### costCalculator Refactor
**File:** `convex/lib/costCalculator.ts:100-137`
```
CURRENT return: { production, directPackaging, indirectPackaging, total }
  total = production + directPackaging (indirect excluded)

TARGET return:  { production, packaging, total }
  total = production + packaging (all packaging included)
```

### Inventory Consumption Pipeline (Critical to preserve)
**File:** `convex/orders/mutations/inventoryIntegration.ts`
```
consumeBoxingMaterialsInternal:  reads consumptionStage === "boxing" from componentType
consumeStickerMaterialsInternal: reads consumptionStage === "labeling" from componentType

AFTER CHANGE: reads consumptionStage from orderComponentReservations (snapshotted at reservation time)
```

### Order Summary Conditional Subtotal
**File:** `src/components/orders/OrderFormPOS.tsx:871-892`
```
CURRENT: Always shows Subtotal + Total rows
TARGET:  Show only Total when no voucher. Show Subtotal + Voucher discount + Total when voucher applied.
         For line items with quantity > 1, show "@ Rp X" unit price.
```

### Receive Stock Dialog
**File:** `src/components/inventory/ReceiveStockDialog.tsx`
```
CURRENT: Dropdown for component selection, text input for location, manual supplier entry
TARGET:  Button grid for ALL components (sorted by lowest inventory %),
         3 toggle buttons for storage locations,
         auto-populate supplier from most recent batch
```

### Files Referencing direct_packaging/indirect_packaging (17 files confirmed)
**Backend (7):** schema.ts, componentTypes/queries.ts, componentTypes/mutations.ts, inventory/mutations.ts, lib/costCalculator.ts, menuProducts/mutations.ts, componentTypes/seed.ts
**Frontend (7):** useComponentTypes.ts, useInventory.ts, ProductForm.tsx, PackagingComponentsSection.tsx, ComponentTypeDialog.tsx, ReceiveStockDialog.tsx, CostTooltip.tsx
**Tests (3):** costCalculatorBOM.test.ts, componentTypes.test.ts, inventory.test.ts

### Hardcoded [1,2,3,4] Slot References (9 files, 66+ locations)
**Frontend (5):** MenuProductsManager.tsx (lines 84-88, 355, 404), ProductForm.tsx (lines 43, 46, 271-273, 298-299, 500-512), useMenuProducts.ts (lines 164, 175, 193, 383, 398, 476, 496), ProductButtons.tsx (line 22), OrderStatsCards.tsx (line 222)
**Backend (4):** schema.ts (lines 65-77), menuProducts/mutations.ts (lines 472, 529, 595-599), menuProducts/queries.ts (lines 46-100), orders/whatsapp.ts (lines 546-549)

---

## Edge Cases to Address

1. **Existing orders with reserved `direct_packaging` components**: After migration, reservation records keep their original `consumptionStage` snapshot -- consumption still works.
2. **Products with zero components**: `productType` defaults to value set by Food/Packaging toggle (no longer auto-derived from components).
3. **Concurrent slot assignment**: Two admins assigning to same slot simultaneously -- last write wins (existing Convex behavior). Frontend should show real-time occupancy.
4. **Empty packaging POS**: If no packaging products exist, Order POS packaging section shows graceful empty state with "No packaging products configured" message.
5. **Inline component creation failure mid-product-creation**: Use optimistic creation pattern -- create component type first, then add to product. If product creation fails, orphan component type is harmless.
6. **Historical cost reports**: Cached COGS on existing orders are immutable. New calculations use updated formula. Consider logging the change in CHANGELOG.
7. **Receive Stock with no previous batch**: When component has no batch history, supplier fields start empty (no auto-populate).

---

## User Preferences (Captured During Session -- All 8 Rounds)

- **Icon selector:** Small curated set (5-8 Lucide icons), simple grid click
- **Inline component creation:** Both pick existing OR create new inline (name + consumption stage)
- **Order POS packaging:** Separate section below food (not tabs, not mixed grid)
- **POS slots:** Dynamic with drag-and-drop reorder. Max = number of products. Right-side live POS preview
- **Design quality:** Use `/frontend-design` skill for ProductForm and MenuProducts page. User praised WhatsApp Templates page design as a reference
- **Order Summary:** No subtotal when no voucher. Show unit price when qty > 1
- **Receive Stock:** All components as buttons (not dropdown). 3 location buttons (not text). Auto-supplier from previous batch. No "Manage Components" link
- **Receive Stock inline creation:** Same UX as ProductForm inline creation (just name + consumption stage)

---

## Test Status

- **255 automated tests passing** across 16 test files
- No code changes made this session
- Tests will need updates in Wave 1A for category/slot/COGS changes
- Test files requiring updates:
  - `convex/lib/__tests__/costCalculatorBOM.test.ts` (7+ category refs, return type changes)
  - `tests/convex/componentTypes.test.ts` (15+ category refs)
  - `tests/convex/inventory.test.ts` (2+ category refs)

---

## Documentation Updates
- [ ] CHANGELOG.md (always required)
- [ ] SCHEMA.md (category values, POS slot changes, consumptionStage, orderComponentReservations)
- [ ] API_REFERENCE.md (updated queries/mutations, new migration mutations)
- [ ] CLAUDE.md (remove deleted pages from Quick File Finder, update page count 19->17, update business rules)

## Success Criteria
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] `npm run test` -- all tests pass (255+ tests)
- [ ] Creating a packaging-only product correctly sets `productType: "packaging"`
- [ ] No duplicate "Voucher" label in order form
- [ ] Zero references to `direct_packaging`/`indirect_packaging` in non-migration code
- [ ] ProductForm shows Food/Packaging toggle with conditional fields
- [ ] Packaging components creatable inline during product creation with consumption stage
- [ ] POS slots are dynamic (add/reorder)
- [ ] POS cards show correct production summary from BOM
- [ ] Order form has separate Packaging Products section
- [ ] Order summary hides subtotal when no voucher; shows unit price for qty > 1
- [ ] Kitchen V2 shows real inventory data (no mock)
- [ ] ComponentTypesManager and PackagingComponentsManager pages removed
- [ ] Stat cards readable, progress bars visible, category filter works
- [ ] Receive Stock uses component buttons, location buttons, auto-supplier
- [ ] costCalculator returns `{production, packaging, total}` with all packaging in COGS
- [ ] Inventory consumption pipeline works end-to-end (boxing + labeling stages)
- [ ] Migration verified: 0 `direct_packaging`/`indirect_packaging` records in database

---

## Recommended Agents

| Task | Agent |
|------|-------|
| Schema migration + costCalculator + backend | `convex-backend` |
| ProductForm redesign | `react-ui-builder` with `/frontend-design` skill |
| MenuProducts page overhaul | `react-ui-builder` with `/frontend-design` skill |
| Order Summary + Receive Stock UX | `react-ui-builder` with `/frontend-design` skill |
| Verify fixes | `code-auditor` |
| Full orchestration | `cto-orchestrator` (if doing all waves in one session) |

---

*Generated by /handover skill, revised by CTO review session (staff-review + convex-expert + codebase audit)*
