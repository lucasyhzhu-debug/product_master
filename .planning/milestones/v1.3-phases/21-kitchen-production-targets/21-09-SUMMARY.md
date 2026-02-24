---
phase: 21-kitchen-production-targets
plan: "09"
subsystem: kitchen-ui
tags:
  - kitchen
  - manager-settings
  - packaging-mix
  - bom
  - per-component-toggles
  - unified-form
dependency_graph:
  requires:
    - 21-08 (enabledProductionComponents schema field)
  provides:
    - unified-manager-settings-form
    - packaging-mix-editor-with-bom
    - collapsible-manager-section
    - override-packaging-fallthrough
  affects:
    - src/components/kitchen/PackagingMixEditor.tsx
    - src/components/kitchen/ManagerTargetSettings.tsx
    - src/pages/KitchenViewV2.tsx
    - convex/kitchenConfig/queries.ts
tech_stack:
  added: []
  patterns:
    - bom-resolved-ui (PackagingMixEditor uses getByMenuProductIds batch query + getBomInfo helper)
    - unified-form-two-save-actions (single form state, two distinct save mutations)
    - null-means-all (enabledComponents defaults to ["BIG_BALL","MID_BALL"] when config returns null)
    - override-fallthrough (override path falls through to defaultPackagingMix when packagingOverrides empty)
key_files:
  created:
    - src/components/kitchen/PackagingMixEditor.tsx
  modified:
    - src/components/kitchen/ManagerTargetSettings.tsx
    - src/pages/KitchenViewV2.tsx
    - convex/kitchenConfig/queries.ts
    - docs/CHANGELOG.md
decisions:
  - "ProductionComponents toggle list loaded dynamically from componentTypes.getByCategory(production) — not hardcoded; future components appear automatically"
  - "maxProductionTarget kept > 0 in Save Defaults handler (legacy field) — computed as bigBallTarget + midBallTarget or 1 as floor; no user input"
  - "Apply Override uses current form ball targets (not separate inputs) — single set of inputs serves both save actions as intended by unified design"
  - "BallGroupSection disabled state uses opacity-50 + pointer-events-none on section div — excludes disabled sections from allocation totals naturally"
  - "Unclassified rows (no BOM data) shown in an 'Other' section rather than hidden — prevents data loss if a product has no components configured"
metrics:
  duration_minutes: 4
  completed_date: "2026-02-23"
  tasks_completed: 2
  files_modified: 5
---

# Phase 21 Plan 09: Unified Manager Settings + Smart Packaging Mix Editor Summary

One-liner: Redesigned Manager Settings into a single unified form with BOM-aware packaging mix editor, per-component toggles, two save actions, and collapsible section.

## What Was Built

### Task 1 — PackagingMixEditor (new component)

New `src/components/kitchen/PackagingMixEditor.tsx` with:
- Products grouped by ball type (Original 45g / Jumbo 80g sections)
- Per-row display: product name + BOM component badges + balls-per-unit + quantity input + subtotal
- Running allocation counter per section (X left to allocate / Fully allocated / X over)
- Amber soft warning when mix total does not match ball target
- Disabled state (opacity-50 + pointer-events-none) when component code not in enabledComponents
- Add product button per section — Select dropdown filtered to products not already in mix
- Product filter: `productType === "food" && isActive && posSlot !== undefined` (Gap 5)
- Uses `menuProductComponents.queries.getByMenuProductIds` for batch BOM fetch
- BOM classification: MID_BALL = Original, BIG_BALL = Jumbo

### Task 2 — Unified ManagerTargetSettings + KitchenViewV2 collapsible + Gap 2 fix

**ManagerTargetSettings.tsx** (rewritten):
- Single Card replacing two-card (Default + Override) layout
- Max Capacity field removed — ball targets are the ceiling (Gap 4 item 1)
- Ball Targets section: Original (45g) + Jumbo (80g) inputs
- Per-Component Production Toggles: dynamically loaded from `componentTypes.getByCategory("production", activeOnly:true)` — each gets a toggle switch, toggling off removes from `enabledComponents` array (Gap 7)
- PackagingMixEditor integrated with live ball target props
- Save as Default Daily Targets: calls `updateConfig` with `enabledProductionComponents` and `defaultPackagingMix`
- Apply Override for Today Only: calls `setDailyOverride` with today's ball targets
- Clear Override button shown only when override is active
- Last updated attribution preserved

**KitchenViewV2.tsx** (collapsible Manager Settings):
- Manager Settings section wrapped in collapsible toggle button (Gap 3)
- Default state: collapsed (starts hidden, clean kitchen view)
- ChevronDown/Up indicator

**convex/kitchenConfig/queries.ts** (Gap 2 override fallthrough):
- Override path: when `packagingOverrides` is not set (or empty), query now falls through to `config.defaultPackagingMix` for the packaging breakdown
- Prevents the packaging breakdown badges from disappearing when an override is active

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | b152560 | feat(21-09): create PackagingMixEditor with BOM info and ball allocation counters |
| Task 2 | 69c79f1 | feat(21-09): unified ManagerTargetSettings + collapsible section + override packaging fallthrough |

## Verification Results

- `npm run type-check` — PASS (clean after each task)
- `npm run build` — PASS (8.48s, no errors, only pre-existing CSS warnings)
- PackagingMixEditor.tsx created — CONFIRMED (file exists, imports verified)
- ManagerTargetSettings.tsx rewritten — CONFIRMED (unified form, two save buttons, per-component toggles)
- KitchenViewV2.tsx collapsible — CONFIRMED (settingsOpen state, ChevronDown/Up, starts false)
- queries.ts Gap 2 fix — CONFIRMED (fallthrough to defaultPackagingMix at line 100-101)

### Verification against success criteria:

- [x] `npm run type-check` passes
- [x] `npm run build` succeeds
- [x] Unified form replaces two-card layout
- [x] Max Capacity removed
- [x] Per-component toggles work (dynamically from componentTypes)
- [x] PackagingMixEditor shows BOM info and allocation counters
- [x] Two save buttons present (Save as Default / Apply Override for Today Only)
- [x] Manager Settings collapsible (starts collapsed)
- [x] Override preserves packaging breakdown (fallthrough to defaultPackagingMix)

## Deviations from Plan

None — plan executed exactly as written. The override fallthrough fix was inline in Task 2 as the plan suggested ("handle it in this task if the query file is small enough" — the file was small enough).

## Self-Check: PASSED

Files exist:
- `src/components/kitchen/PackagingMixEditor.tsx` — FOUND
- `src/components/kitchen/ManagerTargetSettings.tsx` — FOUND (rewritten)
- `src/pages/KitchenViewV2.tsx` — FOUND (collapsible added)
- `convex/kitchenConfig/queries.ts` — FOUND (Gap 2 fix)
- `docs/CHANGELOG.md` — FOUND (v1.3.3 entry)

Commits exist:
- b152560 — FOUND (feat 21-09 PackagingMixEditor)
- 69c79f1 — FOUND (feat 21-09 unified ManagerTargetSettings)
