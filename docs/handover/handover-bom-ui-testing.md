# Handover: BOM UI Testing & User Feedback Session

**Date:** 2026-02-06
**Branch:** `main` (no code changes made -- testing + feedback capture only)
**Session:** Manual UI testing of BOM system + capturing user UX feedback

---

## Master Plan Reference

> **Plan:** `C:\Users\Irfan\.claude\plans\fluttering-mapping-blum.md`
> **Current Phase:** Manual UI Testing completed. Findings captured. Ready for implementation planning.

---

## What Was Completed

### Manual Testing Results (M1-M6)

| Test | Status | Result |
|------|--------|--------|
| M1: Component Types UI | PASS | 3 tabs render correctly, counts match (Production 2, Direct Packaging 4, Indirect Packaging 2) |
| M2: Menu Products POS Grid | PARTIAL | Food POS works, Packaging POS empty slots NOT clickable, productType bug confirmed, active toggle missing |
| M3: Inventory Report UI | PASS | Location tabs, stat cards, receive stock form all functional. UX feedback captured |
| M4: Storage Locations UI | PASS | 3 locations render with correct types (Office [Default], Kitchen, Legato Goldfinch) |
| M5: Kitchen Production Flow | PARTIAL | Kitchen V2 renders, order 0205-001 visible in "Needs Boxing". Found mock data in Materials sidebar |
| M6: Order Status Consumption | DEFERRED | Skipped due to session pivot to architecture feedback |

### 18 Issues Found

**Critical Bugs (fix immediately):**

| # | Issue | Location | Root Cause |
|---|-------|----------|------------|
| 4 | `productType` auto-detection broken in CREATE mutation | `convex/menuProducts/mutations.ts:165-170` | `Array.some(async ...)` always returns `true` (Promise is truthy). Update mutation at line 275-282 has correct `Promise.all` pattern |
| 17 | Kitchen V2 Materials sidebar uses MOCK hardcoded data | `src/pages/KitchenViewV2.tsx:237-244` | Hardcoded array with fake stock numbers, not wired to real inventory |

**Architecture Changes (user-requested simplifications):**

| # | Change | Summary |
|---|--------|---------|
| 14 | Remove Component Types page | Page is redundant (read-only). Move production components to Production page. Packaging components inline from ProductForm |
| 15 | Simplify New Component Type form | Only **Name** field needed for packaging components. Everything else auto-generated or derived |
| 16 | Remove direct/indirect packaging distinction from schema | Category is implicit from product composition, not intrinsic to component. Just "production" vs "packaging" |
| 9 | Explicit Food/Packaging product type selection | ProductForm must ask "Food" or "Packaging" upfront, then show appropriate fields |

**UX Improvements:**

| # | Area | Issue |
|---|------|-------|
| 1 | Order POS | Duplicate "Voucher" label (regression) -- `OrderFormPOS.tsx:843` + `VoucherInput.tsx:213-215` |
| 2 | Menu Products | Packaging POS empty slots not clickable (missing onClick + cursor-pointer) |
| 3 | Menu Products | "Legacy Products" should be "Available Products" with assignment to correct POS type |
| 5 | Menu Products | ProductForm uses Sheet (right panel) -- should be centered Dialog |
| 6 | Menu Products | Active/inactive toggle missing from UI (schema field exists) |
| 7 | ProductForm | Product Code field redundant -- should auto-generate |
| 8 | ProductForm | No duplicate name validation |
| 10 | Inventory UI | Stat card labels hard to read, titles too small, gradient colors messy |
| 11 | Inventory UI | Need thermometer/progress bars showing stock percentage levels |
| 12 | Inventory UI | Need category filter (Direct/Indirect Packaging) alongside location tabs |
| 13 | Component Types | Filter tabs too small |

---

## Architecture Vision (User's Direction)

The user wants a significant simplification of the BOM system. Key principles:

### 1. Two Types of Components Only
- **Production (Food):** Created/managed on the Production page. These are balls (Big Ball, Mid Ball, etc.)
- **Packaging (Non-Food):** Created inline from the Product Form. These are boxes, stickers, wraps, etc.

### 2. No Direct/Indirect Distinction
- Whether a packaging component is "direct" or "indirect" is determined by how it's used in a product BOM, not by a category field
- A component included in a product with food components = direct packaging
- A component-only product (no food components) = the components are implicitly indirect
- Remove `category` field distinction from `componentTypes` schema

### 3. Product Creation Flow
- User explicitly chooses **Food Product** or **Packaging Product** at start
- **Food Product path:** Production Components + Packaging Components + Weight + Food POS Slot (1-4)
- **Packaging Product path:** Only Packaging Components (required) + Packaging POS Slot (1-4). No weight, no production components
- Product Code auto-generates, Name gets duplicate validation

### 4. Remove Component Types Page
- Delete `/inventory/components` route and `ComponentTypesManager.tsx`
- Production components managed via existing Production page
- Packaging components created inline when building products

### 5. Simplify Packaging Component Creation
- Only field needed: **Name**
- Code auto-generates
- Unit defaults to "pcs"
- Cost derived from inventory batches (not static field)

---

## Files That Need Changes (Implementation Map)

### Backend (Convex)
| File | Change |
|------|--------|
| `convex/schema.ts` | Remove `category` distinction (direct/indirect) from componentTypes, simplify to production/packaging |
| `convex/menuProducts/mutations.ts:165-170` | **CRITICAL**: Fix `Array.some(async ...)` bug -- use `Promise.all` pattern |
| `convex/menuProducts/mutations.ts` | Add `productType` as explicit field from form, not auto-detected |
| `convex/menuProducts/queries.ts:79` | Fix legacy products query to exclude products with `packagingPosSlot` |
| `convex/componentTypes/mutations.ts` | Simplify create to only require name |

### Frontend
| File | Change |
|------|--------|
| `src/pages/ComponentTypesManager.tsx` | DELETE (page removed) |
| `src/pages/MenuProductsManager.tsx:474-476` | Add onClick + cursor-pointer to packaging POS empty slots |
| `src/pages/MenuProductsManager.tsx:501-527` | Rename "Legacy Products" to "Available Products", add POS assignment buttons |
| `src/components/menuProducts/ProductForm.tsx` | Major redesign: Food/Packaging choice upfront, conditional fields, Sheet->Dialog |
| `src/components/orders/VoucherInput.tsx:213-215` | Remove duplicate Label+Icon |
| `src/pages/KitchenViewV2.tsx:237-244` | Replace mock packagingInventory with real Convex query |
| `src/pages/InventoryManager.tsx` | Larger titles, simplified stat cards, progress bars, category filter |
| `src/App.tsx` | Remove `/inventory/components` route |

### Hooks
| File | Change |
|------|--------|
| `src/hooks/convex/useMenuProducts.ts` | Update legacy products hook for new "Available Products" filtering |
| `src/hooks/convex/useComponentTypes.ts` | Simplify for production/packaging only (no direct/indirect) |

---

## Test Status

- **255 automated tests passing** (all 16 test files)
- Manual testing M1-M4 complete, M5-M6 partial/deferred
- No code changes made this session -- testing and feedback capture only

---

## Context for New Session

### Key Decisions Made This Session
1. **Remove Component Types page entirely** -- redundant read-only page
2. **Remove direct/indirect packaging distinction** -- implicit from product composition
3. **Explicit Food/Packaging product type choice** in ProductForm (no auto-detection)
4. **Simplify packaging component creation** to just Name field
5. **Production components stay on Production page** -- don't duplicate

### Critical Bugs to Fix First
1. `productType` auto-detection bug in create mutation (issue #4) -- all products get "food"
2. Kitchen V2 mock data (issue #17) -- Materials sidebar shows fake numbers

### Recommended Implementation Order
1. **Wave 0 (Critical bug fixes):** Fix #4 (productType mutation bug), fix #1 (voucher label regression)
2. **Wave 1 (Schema simplification):** Remove direct/indirect from componentTypes, simplify creation
3. **Wave 2 (ProductForm redesign):** Food/Packaging choice, conditional fields, Sheet->Dialog
4. **Wave 3 (Menu Products page):** Clickable packaging slots, rename Legacy->Available, POS assignment
5. **Wave 4 (Inventory UI):** Readable stat cards, progress bars, category filter
6. **Wave 5 (Cleanup):** Remove ComponentTypesManager page, wire Kitchen V2 to real inventory

### Plan File Location
Full improvement notes table (18 issues) at: `C:\Users\Irfan\.claude\plans\fluttering-mapping-blum.md`

### Recommended Agents
| Task | Agent | Why |
|------|-------|-----|
| Schema simplification | `schema-architect` | Review schema changes before implementation |
| Backend bug fixes | `convex-backend` | Fix mutations, queries |
| ProductForm redesign | `react-ui-builder` | Major UI component rebuild |
| Full implementation | `cto-orchestrator` | Multi-agent coordination across waves |
| Verify fixes | `code-auditor` | Type check + pattern compliance |

---

## How to Continue

1. Read this handover document
2. Review the full improvement notes in the plan file
3. Run `npm run test` to confirm 255 tests still pass
4. Start with Wave 0: critical bug fixes (#4 productType, #1 voucher label)
5. Then proceed with schema simplification and ProductForm redesign

**Start new session with:** "Continue from `docs/handover/handover-bom-ui-testing.md` -- implement BOM improvements"

---

*Generated by /handover skill*
