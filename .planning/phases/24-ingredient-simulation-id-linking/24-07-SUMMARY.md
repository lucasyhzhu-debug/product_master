---
phase: 24-ingredient-simulation-id-linking
plan: 07
subsystem: ui
tags: [react, convex, inventory, ingredients, finished-goods]

# Dependency graph
requires:
  - phase: 24-ingredient-simulation-id-linking
    provides: ingredient componentType linking infrastructure
provides:
  - unlinkIngredientFromComponentType mutation (admin-only untrack)
  - UntrackButton component with inline confirm on IngredientsManager
  - FGAdjustDialog with 4 reason categories + direction toggle
  - Adjust button per row in ProductGroupedView and LocationGroupedView
  - Single-toast ingredient edit (double toast fixed)
affects: [inventory, ingredients, finished-goods-tab]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Empty successMessage in createMutationHook suppresses hook toast, letting caller (EntityManager) own it"
    - "useMutation+token pattern (not useSessionMutation) for productInventory mutations in dialog components"
    - "AdjustDialogState type passed via onAdjust callback from grouped views up to parent tab"

key-files:
  created:
    - src/components/inventory/FGAdjustDialog.tsx
  modified:
    - convex/ingredients/mutations.ts
    - src/hooks/convex/useIngredients.ts
    - src/hooks/convex/index.ts
    - src/hooks/convex/createMutationHook.ts
    - src/pages/IngredientsManager.tsx
    - src/components/inventory/FinishedGoodsTab.tsx

key-decisions:
  - "Remove successMessage from useConvexUpdateIngredient so EntityManager's handleFormSubmit owns the single success toast"
  - "createMutationHook skips toast.success when successMessage is empty string (not falsy-safe before this fix)"
  - "UntrackButton uses inline two-step confirm (button -> Yes/No) rather than ConfirmDialog to keep it compact in a table cell"
  - "Adjust button uses amber tint to distinguish from Move (blue) and Receive (green)"
  - "AdjustDialogState lifted to FinishedGoodsTab; ProductGroupedView and LocationGroupedView receive onAdjust callback"

patterns-established:
  - "Empty successMessage suppresses hook toast: createMutationHook now guards toast.success with if(config.successMessage)"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-02-23
---

# Phase 24 Plan 07: Ingredients UAT-3 Gap Closure Summary

**Single-toast ingredient edit, Untrack button for tracked ingredients, and FGAdjustDialog with 4 reason categories wired into Finished Goods inventory rows**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-23T10:31:31Z
- **Completed:** 2026-02-23T10:36:45Z
- **Tasks:** 2
- **Files modified:** 7 (6 modified, 1 created)

## Accomplishments
- Fixed double-toast bug on ingredient edit: `createMutationHook` now skips toast when `successMessage` is empty; `useConvexUpdateIngredient` passes empty string so EntityManager owns the single toast
- Added `unlinkIngredientFromComponentType` mutation (admin only) + hook + barrel export + `UntrackButton` with inline confirm next to Tracked badge
- Created `FGAdjustDialog` (Wastage / QC+Testing / Freebie+Gift / Manual Correction) with Deduct/Add toggle, qty, notes, over-deduction warning, and resulting-stock preview
- Wired Adjust button (amber) in both `ProductGroupedView` and `LocationGroupedView`

## Task Commits

1. **Task 1: Fix double toast + add unlink mutation and UI** - `f84f5f1` (feat)
2. **Task 2: FG Adjust dialog and button wiring** - `63e5474` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `convex/ingredients/mutations.ts` - Added `unlinkIngredientFromComponentType` mutation
- `src/hooks/convex/createMutationHook.ts` - Guard `toast.success` on non-empty message
- `src/hooks/convex/useIngredients.ts` - Empty successMessage for update hook; added `useUnlinkIngredientFromComponentType`
- `src/hooks/convex/index.ts` - Barrel export for `useUnlinkIngredientFromComponentType`
- `src/pages/IngredientsManager.tsx` - UntrackButton component; onUpdate uses mutateAsync; Untrack button in Tracked cell
- `src/components/inventory/FGAdjustDialog.tsx` - New dialog component (created)
- `src/components/inventory/FinishedGoodsTab.tsx` - AdjustDialogState, onAdjust prop, Adjust buttons, FGAdjustDialog render

## Decisions Made
- `createMutationHook`: guard `toast.success` with `if (config.successMessage)` so empty string suppresses the hook toast. This lets EntityManager's `handleFormSubmit` own the sole success toast for update operations.
- `UntrackButton` uses an inline two-step confirm (renders Yes/No buttons) rather than importing `ConfirmDialog` — keeps the component self-contained in a narrow table cell.
- `FGAdjustDialog` uses `useMutation` + `user.token` pattern (same as `transferStock` in `FinishedGoodsTab`) since `adjustStock` takes a `token` arg, not a session-based pattern.
- Adjust button uses amber tint (`border-amber-400/40 text-amber-600`) to visually distinguish from Move (blue/primary) and Receive (green/success).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 24 UAT Test 3 gaps fully closed
- Ingredient tracking now has full link/unlink lifecycle
- Finished Goods adjust flow complete end-to-end
- `npm run build` passes

---
*Phase: 24-ingredient-simulation-id-linking*
*Completed: 2026-02-23*
