---
phase: 22-remove-legacy-editors-tags-and-dashboard
plan: 01
subsystem: backend-cleanup
tags: [schema, cleanup, legacy, cost-invalidation, dead-code]
dependency_graph:
  requires: []
  provides: [clean-backend-without-legacy-tables, stripped-costInvalidation]
  affects: [convex/schema.ts, convex/lib/costInvalidation.ts, convex/ingredients/mutations.ts, convex/materials/mutations.ts]
tech_stack:
  added: []
  patterns: [schema-table-removal, dead-code-elimination]
key_files:
  created:
    - docs/legacy-export/README.md
  modified:
    - convex/schema.ts
    - convex/lib/costInvalidation.ts
    - convex/ingredients/mutations.ts
    - convex/materials/mutations.ts
    - src/App.tsx
    - src/pages/index.ts
    - src/hooks/convex/index.ts
    - src/hooks/__tests__/useConvexHooks.test.tsx
  deleted:
    - convex/recipes/ (queries.ts + mutations.ts)
    - convex/packaging/ (queries.ts + mutations.ts)
    - convex/products/ (queries.ts + mutations.ts)
    - convex/tags/ (queries.ts + mutations.ts)
    - convex/dashboard/ (queries.ts)
    - src/pages/RecipeEditor.tsx
    - src/pages/PackagingEditor.tsx
    - src/pages/ProductEditor.tsx
    - src/pages/TagsManager.tsx
    - src/pages/Dashboard.tsx
    - src/hooks/convex/useRecipes.ts
    - src/hooks/convex/usePackaging.ts
    - src/hooks/convex/useProducts.ts
    - src/hooks/convex/useTags.ts
    - src/hooks/convex/useDashboard.ts
    - src/components/shared/FormBuilder.example.tsx
decisions:
  - "All 11 legacy tables verified empty in production before dropping — no data export required"
  - "costInvalidation.ts stripped to 2 surviving functions: invalidateMenuProductCosts + invalidateProductionComponentCosts"
  - "ingredients/mutations.ts remove handler updated to check productionComponentIngredients instead of componentIngredients"
  - "materials/mutations.ts remove handler simplified (no package recipe check needed after table drop)"
  - "Legacy frontend pages (RecipeEditor, PackagingEditor, ProductEditor, TagsManager, Dashboard) deleted as Rule 3 auto-fix since they referenced dropped tables and blocked build"
  - "Legacy hooks (useRecipes, usePackaging, useProducts, useTags, useDashboard) deleted as Rule 3 auto-fix"
metrics:
  duration: 531s
  completed: 2026-02-23
  tasks_completed: 3
  files_changed: 27
---

# Phase 22 Plan 01: Drop Legacy Schema Tables and Clean Backend Summary

**One-liner:** Dropped 11 legacy recipe/packaging/product/tags schema tables, deleted 5 backend modules, stripped costInvalidation.ts to 2 surviving functions, and removed all referencing frontend dead code to restore clean build.

## What Was Built

### Task 1: Data Preservation Gate
- Queried all 11 legacy tables via Convex CLI (`npx convex run --prod`)
- Confirmed all tables were empty: recipes, recipeVersions, recipeComponents, componentIngredients, packagingRecipes, packagingVersions, packagingComponents, packagingComponentMaterials, products, productVersions, tags
- Created `docs/legacy-export/README.md` documenting the verification (no JSONL exports needed)

### Task 2: Schema + Backend Module Deletion
- Removed all 11 legacy table definitions from `convex/schema.ts`
- Deleted entire `convex/recipes/` directory (2 files)
- Deleted entire `convex/packaging/` directory (2 files) — legacy packaging recipe module, NOT the active orders packaging view
- Deleted entire `convex/products/` directory (2 files)
- Deleted entire `convex/tags/` directory (2 files)
- Deleted entire `convex/dashboard/` directory (1 file)

### Task 3: costInvalidation.ts + Caller Updates
- Deleted `invalidateRecipeCosts` function (referenced dropped componentIngredients/recipeComponents tables)
- Deleted `invalidatePackagingCosts` function (referenced dropped packagingComponentMaterials/packagingComponents tables)
- Kept `invalidateMenuProductCosts` (references active menuProductComponents/menuProducts)
- Kept `invalidateProductionComponentCosts` (references active productionComponentIngredients/componentTypes/productionComponentLinks)
- Removed `invalidateRecipeCosts` scheduler call from `ingredients/mutations.ts`
- Updated `ingredients/mutations.ts` remove handler to check `productionComponentIngredients` instead of `componentIngredients`
- Removed `invalidatePackagingCosts` scheduler call from `materials/mutations.ts`
- Removed dead `packagingComponentMaterials` usage check from `materials/mutations.ts` remove handler
- Removed unused `internal` import from `materials/mutations.ts`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Frontend pages referenced dropped tables, blocking build**
- **Found during:** Task 3 verification (npm run build)
- **Issue:** Legacy frontend pages (RecipeEditor, PackagingEditor, ProductEditor, TagsManager, Dashboard) and their hooks (useRecipes, usePackaging, useProducts, useTags, useDashboard) still referenced the dropped schema tables, causing TypeScript errors that blocked the build
- **Fix:** Deleted all 5 legacy pages, 5 legacy hooks, FormBuilder.example.tsx (also referenced tags table), updated App.tsx routes, pages/index.ts, hooks/convex/index.ts, and useConvexHooks.test.tsx to remove all dead references
- **Files modified:** See key_files.deleted above + App.tsx, src/pages/index.ts, src/hooks/convex/index.ts, src/hooks/__tests__/useConvexHooks.test.tsx
- **Commits:** 7e48e94

## Verification Results

- `npm run type-check`: PASS
- `npm run build`: PASS
- Zero references to `invalidateRecipeCosts` or `invalidatePackagingCosts` in backend
- Zero references to dropped table names in active backend code
- `convex/lib/costInvalidation.ts` exports only `invalidateMenuProductCosts` and `invalidateProductionComponentCosts`
- All 5 legacy backend module directories deleted

## Commits

| Hash | Message |
|------|---------|
| 485689f | docs(22-01): verify all 11 legacy tables empty in production |
| 19e8a32 | feat(22-01): drop 11 legacy schema tables and delete 5 backend modules |
| 7e48e94 | feat(22-01): strip costInvalidation.ts and remove all legacy frontend dead code |

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| docs/legacy-export/README.md exists | FOUND |
| convex/lib/costInvalidation.ts exists | FOUND |
| convex/schema.ts exists | FOUND |
| convex/recipes/ deleted | CONFIRMED |
| convex/packaging/ deleted | CONFIRMED |
| convex/products/ deleted | CONFIRMED |
| convex/tags/ deleted | CONFIRMED |
| convex/dashboard/ deleted | CONFIRMED |
| src/pages/RecipeEditor.tsx deleted | CONFIRMED |
| commit 485689f exists | CONFIRMED |
| commit 19e8a32 exists | CONFIRMED |
| commit 7e48e94 exists | CONFIRMED |
