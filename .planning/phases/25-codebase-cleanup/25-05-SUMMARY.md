---
phase: 25-codebase-cleanup
plan: "05"
subsystem: ui
tags: [react, hooks, useSessionMutation, protectedMutation, queryHelpers, refactoring, typescript]

# Dependency graph
requires:
  - phase: 25-03
    provides: protectedMutation migration for forceComplete (statusUpdates.ts) and 6 productionRecipes mutations
  - phase: 25-04
    provides: clean hook names in useOrders.ts (useConvex prefix removed)
provides:
  - useProductionRecipes.ts: all 6 CRUD mutations use useSessionMutation (no manual token)
  - useOrders.ts: useForceComplete hook added using useSessionMutation
  - IngredientSection.tsx + SubComponentSection.tsx: token removed from call sites
  - whatsappTemplates/queries.ts + menuProducts/queries.ts: queryHelpers applied
affects: [future phases adding productionRecipes mutations, future phases using forceComplete]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "protectedMutation frontend pattern: use useSessionMutation (not useMutation+token) for backends using protectedMutation wrapper — sessionId auto-injected"
    - "queryHelpers getByIdHelper explicit type param: getByIdHelper<\"tableName\">(ctx, id) to avoid union type inference issue in generated API"

key-files:
  created: []
  modified:
    - src/hooks/convex/useProductionRecipes.ts
    - src/hooks/convex/useOrders.ts
    - src/hooks/convex/index.ts
    - src/components/orders/OrderSlideOver.tsx
    - src/pages/OrderDetail.tsx
    - src/components/productionRecipes/IngredientSection.tsx
    - src/components/productionRecipes/SubComponentSection.tsx
    - convex/menuProducts/queries.ts
    - convex/whatsappTemplates/queries.ts

key-decisions:
  - "forceComplete has no pre-existing hook in useOrders.ts — added useForceComplete as new hook rather than updating an existing one"
  - "useKitchenStats.ts unchanged — no kitchen mutations were migrated to protectedMutation in 25-03; all kitchen ops remain bare mutation()"
  - "menuProducts/queries.ts: only get query updated (getByIdHelper); list query skipped due to activeOnly conditional branch using withIndex — not a clean listAll fit"
  - "kitchenConfig/queries.ts: skipped entirely — complex BOM traversal logic across both queries makes queryHelpers inapplicable"
  - "getByIdHelper requires explicit type param <tableName> when called from Convex query handlers to avoid TypeScript inferring union-of-all-docs return type"
  - "IngredientSection.tsx useAuth import removed (no longer needed after token removal); SubComponentSection.tsx keeps useAuth for user.name (createdBy)"

patterns-established:
  - "Frontend hooks for protectedMutation backends: always use useSessionMutation, never useMutation + manual token passing"
  - "queryHelpers getByIdHelper in query handlers: always provide explicit type parameter getByIdHelper<\"tableName\">"

requirements-completed:
  - CLEANUP-PROTECTED-MUTATION
  - CLEANUP-QUERY-FACTORY

# Metrics
duration: 16min
completed: 2026-02-23
---

# Phase 25 Plan 05: useSessionMutation Migration + queryHelpers Expansion Summary

**Migrated 6 productionRecipes hooks and forceComplete order hook from useMutation+token to useSessionMutation; applied queryHelpers listAll/getById to whatsappTemplates and menuProducts query files**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-02-23T16:13:17Z
- **Completed:** 2026-02-23T16:29:11Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- All 6 productionRecipes mutations (addSubComponent, removeSubComponent, updateSubComponentQuantity, addIngredient, removeIngredient, updateIngredientQuantity) now use useSessionMutation — no manual token passing at call sites
- Added useForceComplete hook to useOrders.ts using useSessionMutation; updated OrderSlideOver.tsx and OrderDetail.tsx to use it instead of raw useMutation
- Applied listAll to whatsappTemplates/queries.ts list query; applied getByIdHelper to menuProducts/queries.ts get query
- npm run type-check passes, npm run build succeeds

## Task Commits

1. **Task 1: Migrate frontend hooks to useSessionMutation** - `0b5454a` (refactor)
2. **Task 2: Apply queryHelpers + fix call sites** - `f9bdaa6` (refactor)

**Plan metadata:** _(see final docs commit below)_

## Files Created/Modified

**Hook source files (2):**
- `src/hooks/convex/useProductionRecipes.ts` - 6 mutations migrated from useMutation to useSessionMutation
- `src/hooks/convex/useOrders.ts` - Added useForceComplete hook using useSessionMutation; added useSessionMutation import

**Barrel (1):**
- `src/hooks/convex/index.ts` - Added useForceComplete export

**Consumer components (4):**
- `src/components/orders/OrderSlideOver.tsx` - forceCompleteMutation → useForceComplete(); removed token from call site
- `src/pages/OrderDetail.tsx` - forceCompleteMutation → useForceComplete(); removed token from call site; removed unused toast import
- `src/components/productionRecipes/IngredientSection.tsx` - Removed token from addIngredient/removeIngredient/updateIngredientQuantity; removed unused useAuth import
- `src/components/productionRecipes/SubComponentSection.tsx` - Removed token from addSubComponent/removeSubComponent/updateSubComponentQuantity; kept useAuth for user.name

**Query files (2):**
- `convex/whatsappTemplates/queries.ts` - list query: ctx.db.query().collect() → listAll(ctx, "whatsappTemplates")
- `convex/menuProducts/queries.ts` - get query: ctx.db.get(id) → getByIdHelper<"menuProducts">(ctx, id)

## Decisions Made

- `useKitchenStats.ts` has no changes — all kitchen mutations in orderCrud/packaging/kitchen.ts were NOT migrated to protectedMutation in 25-03 (they use no requireRole), so raw useMutation is correct there.
- `kitchenConfig/queries.ts` skipped for queryHelpers — both queries have complex multi-table logic that makes listAll/getById inapplicable.
- `menuProducts/queries.ts` list query skipped — conditional `activeOnly` branch uses `.withIndex("by_active")` making listAll a worse fit (would require post-filter on indexed path). Only the simple `get` query was updated.
- Added explicit `<"menuProducts">` type parameter to `getByIdHelper` call — TypeScript inferred `T` as union of all TableNames otherwise, causing type error in useMenuProducts.ts hook.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Call sites in IngredientSection.tsx and SubComponentSection.tsx still passed `token` to protectedMutation-backed hooks**
- **Found during:** Task 2 verification (npm run build)
- **Issue:** After Task 1 migrated productionRecipes mutations to useSessionMutation, the 8 call sites in IngredientSection.tsx and SubComponentSection.tsx still passed `token: user.token` which is no longer an accepted arg. tsc-b caught 8 errors.
- **Fix:** Removed `token` from all 8 call sites; removed `!user?.token` guards (replaced with just `!selectedChildId`/`!selectedIngredientId`); removed unused `useAuth` import from IngredientSection.tsx
- **Files modified:** src/components/productionRecipes/IngredientSection.tsx, src/components/productionRecipes/SubComponentSection.tsx
- **Verification:** npm run build succeeds with zero errors
- **Committed in:** f9bdaa6 (Task 2 commit)

**2. [Rule 1 - Bug] Unused toast import in OrderDetail.tsx**
- **Found during:** Task 2 verification (npm run build)
- **Issue:** Task 1 replaced handleForceComplete with useForceComplete (which handles its own toast), leaving the toast import unused. tsc-b flagged TS6133.
- **Fix:** Removed `import { toast } from 'sonner'` from OrderDetail.tsx
- **Files modified:** src/pages/OrderDetail.tsx
- **Verification:** npm run build succeeds
- **Committed in:** f9bdaa6 (Task 2 commit)

**3. [Rule 1 - Bug] queryHelpers getByIdHelper caused union type inference in useMenuProducts.ts**
- **Found during:** Task 2 verification (npm run build)
- **Issue:** `getByIdHelper(ctx, args.id)` without type param caused TypeScript to infer `T = TableNames` union, making the query return type a union of all 59 doc types. useMenuProducts.ts hook failed type check (TS2345) when passing the result to transformMenuProduct.
- **Fix:** Changed call to `getByIdHelper<"menuProducts">(ctx, args.id)` — explicit type param pins `T = "menuProducts"` giving precise return type.
- **Files modified:** convex/menuProducts/queries.ts
- **Verification:** npm run type-check passes, npm run build succeeds
- **Committed in:** f9bdaa6 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 — bugs caused by or discovered during Task 1/2 changes)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep. The call site fixes are part of the same logical change (removing token from protectedMutation call sites).

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- useSessionMutation migration complete: all 3 protectedMutation backends have their frontend hooks updated
- queryHelpers expansion: 2 query files updated with helpers where clean fit exists
- No useConvex prefix anywhere + no manual token passing on protectedMutation hooks
- Ready for next plan in Phase 25 (plan 06 or beyond)

---
*Phase: 25-codebase-cleanup*
*Completed: 2026-02-23*
