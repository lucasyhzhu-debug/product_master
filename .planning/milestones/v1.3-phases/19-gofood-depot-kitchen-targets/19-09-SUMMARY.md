---
phase: 19-gofood-depot-kitchen-targets
plan: 09
subsystem: gofood-depot, inventory
tags: [polish, ux, tooltip, accessibility, color-coding]
dependency_graph:
  requires: []
  provides: [readable-restock-tooltip, move-receive-color-coding, sync-prerequisite-note]
  affects: [GoFoodDepotManager, DepotCockpitTable, FinishedGoodsTab]
tech_stack:
  added: []
  patterns: [tailwind-dark-mode-safe-colors, cn-conditional-classes]
key_files:
  modified:
    - src/components/gofoodDepot/DepotCockpitTable.tsx
    - src/components/inventory/FinishedGoodsTab.tsx
    - src/pages/GoFoodDepotManager.tsx
decisions:
  - "Removed text-muted-foreground from TooltipContent paragraph; tooltip inherits its own readable color"
  - "Move buttons use blue outline variant; Receive buttons use green outline variant for semantic clarity"
  - "GoBiz sync note is always-visible (non-dismissible) to ensure users see the prerequisite info"
metrics:
  duration: "3 minutes"
  completed: "2026-02-22"
  tasks: 2
  files: 3
---

# Phase 19 Plan 09: UI Polish — Tooltip Contrast, Edit Affordance, Button Color, Sync Note Summary

**One-liner:** Tooltip muted-foreground removed for contrast, Move/Receive buttons color-coded blue/green, GoBiz sync prerequisite note added to GoFood Depot page.

## What Was Built

Four low-severity polish improvements targeting daily usability:

1. **Tooltip contrast fix** (`DepotCockpitTable.tsx`): The restock breakdown tooltip had `text-muted-foreground` on the inner paragraph, which inverts contrast against the dark tooltip background in light mode — making the text near-invisible. Removing the class lets text inherit `TooltipContent`'s own readable color in both light and dark themes.

2. **Inline edit affordance** (`DepotCockpitTable.tsx`): Already implemented in a prior session — the `InlineEditCell` component has a group container with a pencil icon that fades in on hover and `autoFocus` on the input. No changes needed here beyond confirming correctness.

3. **Move/Receive button color coding** (`FinishedGoodsTab.tsx`): Changed both `ProductGroupedView` and `LocationGroupedView` inline transfer buttons from `variant="ghost"` to `variant="outline"` with semantic colors — Move buttons use blue tint (`border-primary/40 text-primary hover:bg-primary/10`), Receive buttons use green tint (`border-green-500/40 text-green-700 dark:text-green-400 hover:bg-green-500/10`). Active state preserved with matching bg classes.

4. **GoBiz sync prerequisite note** (`GoFoodDepotManager.tsx`): Added a non-dismissible info block below the outlet selector tabs. Explains that stock decreases only when each outlet has a linked storage location AND each product has a mapping configured — resolves user confusion about why sync doesn't seem to decrease stock.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix tooltip contrast + confirm inline edit affordance | 279a4a2 | DepotCockpitTable.tsx |
| 2 | Color-coded Move/Receive buttons + GoBiz sync note | 77d4770 | FinishedGoodsTab.tsx, GoFoodDepotManager.tsx |

## Verification

- `npm run type-check` passed (0 errors)
- `npm run build` succeeded (3479 modules, no new warnings)
- Tooltip contrast: `text-muted-foreground` removed from `TooltipContent` breakdown paragraph
- Move buttons: blue outline tint in both ProductGroupedView and LocationGroupedView
- Receive buttons: green outline tint in both views
- GoBiz sync note: placed between outlet selector and low-stock alert banner

## Deviations from Plan

### Inline Edit Affordance Already Implemented

**Found during:** Task 1 — reading DepotCockpitTable.tsx source

The plan described adding a group container with pencil icon hover affordance to `InlineEditCell`. This was already present in the file (lines 159-168): `<button className="flex items-center gap-1.5 group cursor-pointer">` with `<Pencil className="... opacity-0 group-hover:opacity-100 transition-opacity">` and `autoFocus` on the editing input.

Only the tooltip contrast fix was needed. No additional changes made to the display state.

## Self-Check: PASSED

- [x] `src/components/gofoodDepot/DepotCockpitTable.tsx` modified (tooltip fix)
- [x] `src/components/inventory/FinishedGoodsTab.tsx` modified (button colors)
- [x] `src/pages/GoFoodDepotManager.tsx` modified (sync note)
- [x] Commit 279a4a2 exists
- [x] Commit 77d4770 exists
