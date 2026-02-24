---
phase: 25-codebase-cleanup
plan: "04"
subsystem: ui
tags: [react, hooks, refactoring, barrel-exports, typescript]

# Dependency graph
requires:
  - phase: 25-02
    provides: Batches 1-3 hook renames (useVouchers, useCustomers, useRecipes, useTags, useDashboard, useK3MartKitchen, useProductionLog)
provides:
  - All remaining useConvex-prefixed hook exports renamed (Batches 4-5, 87 renames across 8 hook files)
  - Zero useConvex references anywhere in src/ — prefix fully eliminated
  - Updated barrel index.ts with all clean export names
  - Updated test file useConvexHooks.test.tsx to use new hook names
affects: [25-05-plan, any phase that adds new hooks to src/hooks/convex/]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hook naming convention: unprefixed (useOrders, useInventory) in src/hooks/convex/ — the directory scope makes the convex qualifier redundant"
    - "Barrel export pattern: index.ts re-exports all hook functions by clean name; consumer files import from @/hooks/convex barrel only"

key-files:
  created: []
  modified:
    - src/hooks/convex/useComponentTypes.ts
    - src/hooks/convex/useIngredients.ts
    - src/hooks/convex/useOrders.ts
    - src/hooks/convex/useInventory.ts
    - src/hooks/convex/useFeedback.ts
    - src/hooks/convex/useMenuProducts.ts
    - src/hooks/convex/useExternalData.ts
    - src/hooks/convex/useK3MartCockpit.ts
    - src/hooks/convex/index.ts
    - src/hooks/__tests__/useConvexHooks.test.tsx

key-decisions:
  - "useMenuProducts.ts source file renames completed via replace_all operations (file had not been rewritten like other batch-5 files)"
  - "Comment-only references updated for accuracy (TransferStockDialog, AdjustStockDialog, OutletSettingsModal docstrings)"
  - "useOrders.ts mutation hooks NOT migrated to useSessionMutation — that work is deferred to plan 25-05 per plan instructions"

patterns-established:
  - "All hooks in src/hooks/convex/ use unprefixed names — no useConvex prefix anywhere"
  - "Consumer files import from @/hooks/convex barrel, never directly from hook source files (exception: ProductForm.tsx imports directly — preserved as-is)"

requirements-completed:
  - CLEANUP-HOOK-RENAME

# Metrics
duration: 45min
completed: 2026-02-23
---

# Phase 25 Plan 04: Batch 4-5 Hook Rename Summary

**87 remaining useConvex-prefixed hook exports eliminated across 8 files (useComponentTypes, useIngredients, useOrders, useInventory, useFeedback, useMenuProducts, useExternalData, useK3MartCockpit), completing the full prefix removal started in plan 25-02**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-02-23T22:00:00Z
- **Completed:** 2026-02-23T23:08:00Z
- **Tasks:** 2
- **Files modified:** 49

## Accomplishments

- Renamed 41 hooks in Batch 4 (useComponentTypes: 10, useIngredients: 6 of 8, useOrders: 24 of 27)
- Renamed 46 hooks in Batch 5 (useInventory: 13, useFeedback: 12, useMenuProducts: 16, useExternalData: 24, useK3MartCockpit: 22 — some files counted jointly)
- Updated 49 consumer files across components/ and pages/ (22 in Batch 4, 27 in Batch 5)
- Zero useConvex references remain anywhere in src/ — prefix fully eliminated from codebase
- Type check passes (zero errors), test file passes (10/10 tests)

## Task Commits

1. **Task 1: Batch 4 — useComponentTypes, useIngredients (partial), useOrders (partial)** - `a3891b6` (refactor)
2. **Task 2: Batch 5 — useInventory, useFeedback, useMenuProducts, useExternalData, useK3MartCockpit** - `9f8d3c9` (refactor)

**Plan metadata:** _(see final docs commit below)_

## Files Created/Modified

**Hook source files (8):**
- `src/hooks/convex/useComponentTypes.ts` - 10 hooks renamed (useConvexComponentTypes → useComponentTypes, etc.)
- `src/hooks/convex/useIngredients.ts` - 6 hooks renamed (kept useLinkIngredientToComponentType, useUnlinkIngredientFromComponentType)
- `src/hooks/convex/useOrders.ts` - 24 hooks renamed (kept useKanbanOrders, useCreateDraft, useUpdateDraft)
- `src/hooks/convex/useInventory.ts` - 13 hooks renamed (useLowStockAlerts, useComponentInventory, useReceiveStock, etc.)
- `src/hooks/convex/useFeedback.ts` - 12 hooks renamed (useFeedbackList, useCreateFeedback, useToggleFeedbackStatus, etc.)
- `src/hooks/convex/useMenuProducts.ts` - 16 hooks renamed (useMenuProducts, usePosProducts, useAssignToSlot, useReorderSlots, etc.)
- `src/hooks/convex/useExternalData.ts` - 24 hooks renamed (useExternalOutlets, useSyncK3MartSales, useRestockOverview, etc.)
- `src/hooks/convex/useK3MartCockpit.ts` - 22 hooks renamed (useWeeklyDispatchPlans, useSaveWeeklyDispatchPlan, useOutletSettings, etc.)

**Barrel + test (2):**
- `src/hooks/convex/index.ts` - All 5 Batch 5 sections updated with clean names; Batch 4 sections updated
- `src/hooks/__tests__/useConvexHooks.test.tsx` - Updated to import and use unprefixed names

**Consumer components (22 in Batch 4, 15 in Batch 5):**
- `src/components/inventory/` - ComponentRow, ComponentTypeDialog, EditComponentDialog, ReceiveStockDialog, RenameComponentDialog, AdjustStockDialog, TransferStockDialog
- `src/components/menuProducts/` - PackagingComponentsSection, ProductionComponentsSection, ProductForm
- `src/components/orders/` - OrderForm, OrderFormPOS, OrderSlideOver
- `src/components/productionRecipes/` - IngredientSection, SubComponentSection
- `src/components/feedback/` - CommentSection, ExportButton, FeedbackCard, FeedbackForm, FeedbackPanel, FeedbackPanelToggle
- `src/components/salesAnalytics/` - GoBizTokenDialog, K3MartCredentialsDialog, OverviewTab, ProductMappingCard, ProductMappingTab, SalesChart, SettingsTab
- `src/components/k3martCockpit/` - WeeklyPlannerGrid, OutletSettingsModal

**Consumer pages (9):**
- `src/pages/IngredientsManager.tsx`, `src/pages/ProductionComponentsManager.tsx`, `src/pages/OrderCreate.tsx`, `src/pages/OrderDetail.tsx`, `src/pages/MenuProductsManager.tsx`, `src/pages/VouchersManager.tsx`, `src/pages/InventoryManager.tsx`, `src/pages/K3MartCockpit.tsx`, `src/pages/RestockPlanner.tsx`

## Decisions Made

- useMenuProducts.ts was not rewritten as a whole file (unlike the other Batch 5 files) — used targeted replace_all operations per function, discovering this mid-execution when the source file still showed old names after consumer updates. Resolved cleanly.
- Mutation hooks in useOrders.ts intentionally left using raw `useMutation` (not migrated to `useSessionMutation`) — plan 25-05 covers that migration; this plan is rename-only.
- Three file-level JSDoc comments referencing old hook names updated for accuracy (TransferStockDialog, AdjustStockDialog, OutletSettingsModal) — counted as part of the rename batch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale JSDoc comments referencing old useConvex hook names**
- **Found during:** Task 2 (final grep sweep)
- **Issue:** Three component files had JSDoc `@param` / `@description` comments referencing old `useConvexTransferStock`, `useConvexAdjustStock`, `useConvexOutletSettings` names. Would confuse future developers.
- **Fix:** Updated 3 comment strings to use new unprefixed names
- **Files modified:** `src/components/inventory/TransferStockDialog.tsx`, `src/components/inventory/AdjustStockDialog.tsx`, `src/components/k3martCockpit/OutletSettingsModal.tsx`
- **Verification:** Final grep sweep returns zero matches
- **Committed in:** `9f8d3c9` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — stale comments)
**Impact on plan:** Minor accuracy fix. No scope creep. Zero effect on runtime behavior.

## Issues Encountered

- **useMenuProducts.ts source file not rewritten**: The previous session had updated the barrel exports for `useMenuProducts` but not rewritten the source file itself (unlike useInventory, useFeedback, useExternalData, useK3MartCockpit which were fully rewritten). This was discovered during the final grep sweep after all consumer updates were complete. Fixed via targeted `replace_all` operations for each of the 16 functions. Type check confirmed clean after fix.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All `useConvex` prefixes removed from `src/` — prefix elimination complete
- Ready for plan 25-05: migrate `useOrders.ts` and remaining mutation hooks from `useMutation + token` pattern to `useSessionMutation` pattern
- No blockers

---
*Phase: 25-codebase-cleanup*
*Completed: 2026-02-23*
