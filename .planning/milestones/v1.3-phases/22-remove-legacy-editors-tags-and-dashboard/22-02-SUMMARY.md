---
phase: 22-remove-legacy-editors-tags-and-dashboard
plan: 02
subsystem: frontend-cleanup
tags: [frontend, cleanup, legacy, dead-code, permissions]
dependency_graph:
  requires: [22-01]
  provides: [clean-frontend-without-legacy-pages, clean-barrel-exports, clean-permissions]
  affects: [src/App.tsx, src/lib/types.ts, src/pages/index.ts, src/hooks/convex/index.ts, src/components/shared/index.ts, src/components/layout/MobileBottomNav.tsx]
tech_stack:
  added: []
  patterns: [dead-code-elimination, barrel-export-cleanup]
key_files:
  created: []
  modified:
    - src/pages/index.ts
    - src/hooks/convex/index.ts
    - src/components/shared/index.ts
    - src/App.tsx
    - src/lib/types.ts
    - src/components/layout/MobileBottomNav.tsx
  deleted:
    - src/pages/MaterialsManager.tsx
    - src/pages/PackagingComponentsManager.tsx
    - src/hooks/convex/useMaterials.ts
    - src/components/dashboard/ (6 files)
    - src/components/onboarding/ (3 files)
    - src/hooks/useOnboardingTour.ts
    - src/components/recipes/RecipeCard.tsx
    - src/components/recipes/IngredientSelector.tsx
    - src/components/packaging/PackagingCard.tsx
    - src/components/products/ProductCard.tsx
    - src/components/ingredients/IngredientCard.tsx
    - src/components/materials/MaterialCard.tsx
    - src/components/shared/Carousel.tsx
    - src/components/shared/TagFilterBar.tsx
decisions:
  - "IngredientSelector.tsx in src/components/recipes/ had zero consumers — deleted as orphaned dead code alongside RecipeCard.tsx"
  - "MobileBottomNav.tsx /tags entry with canAccessRecipes permission removed — discovered via grep, auto-fixed Rule 2"
  - "canAccessDashboard in App.tsx is valid — used by restock-planner and gofood-depot routes (active pages)"
metrics:
  duration: 264s
  completed: 2026-02-23
  tasks_completed: 2
  files_changed: 27
---

# Phase 22 Plan 02: Delete Legacy Frontend Dead Code Summary

**One-liner:** Deleted 23 legacy frontend files (pages, hooks, components, directories), cleaned all barrel exports, removed the /materials route, and stripped canAccessRecipes/canAccessProducts/canAccessMaterials from ROLE_PERMISSIONS across all 4 roles.

## What Was Built

### Task 1: Delete Legacy Files

**Pages (2 files):**
- Deleted `src/pages/MaterialsManager.tsx` — packaging materials page (no active references after Plan 01 removed backend)
- Deleted `src/pages/PackagingComponentsManager.tsx` — already dead (not in App.tsx routes or pages/index.ts)

**Hooks (1 file):**
- Deleted `src/hooks/convex/useMaterials.ts` — packaging materials Convex hook

**Dashboard components (6 files, directory removed):**
- Deleted `src/components/dashboard/` — entire directory (index.ts, LowStockAlert.tsx, OrderStatsCards.tsx, ProductionQueueTable.tsx, SalesWidget.tsx, SyncHealthBanner.tsx)

**Onboarding (3 files, directory removed):**
- Deleted `src/components/onboarding/` — entire directory (OnboardingTour.tsx, tour-steps.ts, index.ts)
- Deleted `src/hooks/useOnboardingTour.ts`

**Card components (5 files):**
- Deleted RecipeCard.tsx, PackagingCard.tsx, ProductCard.tsx, IngredientCard.tsx, MaterialCard.tsx

**Shared components (2 files):**
- Deleted `src/components/shared/Carousel.tsx` and `TagFilterBar.tsx`

**Empty directories removed:** recipes/, packaging/, products/, materials/, dashboard/, onboarding/

### Task 2: Barrel Exports, Routes, and Permissions

- `src/pages/index.ts`: removed `MaterialsManager` export
- `src/hooks/convex/index.ts`: removed Packaging Materials section (useMaterials and 6 exports)
- `src/components/shared/index.ts`: removed `Carousel` and `TagFilterBar` exports
- `src/App.tsx`: removed `MaterialsManager` import and `/materials` route
- `src/lib/types.ts`: removed `canAccessRecipes`, `canAccessProducts`, `canAccessMaterials` from `RolePermissions` interface and all 4 role objects (kitchen, order_staff, manager, admin)
- `src/components/layout/MobileBottomNav.tsx`: removed `/tags` nav item and `Tags` lucide icon import (discovered during grep verification)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing cleanup] IngredientSelector.tsx orphaned in recipes/ directory**
- **Found during:** Task 1 — checked remaining files after deleting RecipeCard.tsx from recipes/
- **Issue:** `src/components/recipes/IngredientSelector.tsx` had zero consumers anywhere in `src/`
- **Fix:** Deleted the file; removed now-empty recipes/ directory
- **Files modified:** src/components/recipes/IngredientSelector.tsx (deleted)
- **Commit:** fecdb8a

**2. [Rule 2 - Missing cleanup] MobileBottomNav.tsx referenced dead /tags route with canAccessRecipes**
- **Found during:** Task 2 verification grep for canAccessRecipes
- **Issue:** `src/components/layout/MobileBottomNav.tsx` had a `/tags` nav item using `canAccessRecipes` permission — both the route and permission are now deleted
- **Fix:** Removed the `/tags` TabItem entry and the `Tags` lucide-react icon import
- **Files modified:** src/components/layout/MobileBottomNav.tsx
- **Commit:** f3fc78a

## Verification Results

- `npm run type-check`: PASS
- `npm run build`: PASS
- `grep -rn "canAccessRecipes|canAccessProducts|canAccessMaterials" src/`: CLEAN (0 matches)
- `grep -n "RecipeEditor|PackagingEditor|ProductEditor|TagsManager|MaterialsManager|Dashboard" src/App.tsx`: CLEAN (0 matches)
- `grep -n "MaterialsManager" src/pages/index.ts`: CLEAN
- `grep -n "useMaterials" src/hooks/convex/index.ts`: CLEAN

## Commits

| Hash | Message |
|------|---------|
| fecdb8a | feat(22-02): delete legacy frontend files — pages, hooks, and orphaned components |
| f3fc78a | feat(22-02): clean barrel exports, remove legacy routes, strip dead permissions |

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| src/pages/MaterialsManager.tsx deleted | CONFIRMED |
| src/pages/PackagingComponentsManager.tsx deleted | CONFIRMED |
| src/hooks/convex/useMaterials.ts deleted | CONFIRMED |
| src/components/dashboard/ directory deleted | CONFIRMED |
| src/components/onboarding/ directory deleted | CONFIRMED |
| src/hooks/useOnboardingTour.ts deleted | CONFIRMED |
| card components (5) deleted | CONFIRMED |
| src/components/shared/Carousel.tsx deleted | CONFIRMED |
| src/components/shared/TagFilterBar.tsx deleted | CONFIRMED |
| npm run type-check passes | CONFIRMED |
| npm run build passes | CONFIRMED |
| canAccessRecipes/Products/Materials removed from types.ts | CONFIRMED |
| commit fecdb8a exists | CONFIRMED |
| commit f3fc78a exists | CONFIRMED |
