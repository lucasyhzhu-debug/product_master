---
phase: quick-4
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/k3martCockpit/InventorySourcePanel.tsx
  - src/components/k3martCockpit/ExpandedOutletPanel.tsx
  - src/components/k3martCockpit/OutletCard.tsx
  - src/components/k3martCockpit/OutletStockDetail.tsx
  - src/components/k3martCockpit/BulkSubmitDialog.tsx
  - src/components/k3martCockpit/StockFlowForm.tsx
  - src/components/k3martCockpit/StockMovementHistory.tsx
  - src/components/k3martCockpit/ProductionReadinessBar.tsx
  - src/components/k3martCockpit/StockFlowConfirmDialog.tsx
autonomous: true
must_haves:
  truths:
    - "All K3Mart cockpit non-grid components render correctly in dark mode"
    - "No hardcoded white/light backgrounds remain in the 9 target files"
    - "Colored accent backgrounds (blue-50, purple-50, amber-50, etc.) have dark mode variants"
  artifacts:
    - path: "src/components/k3martCockpit/InventorySourcePanel.tsx"
      provides: "Dark-mode-compatible inventory source panel"
    - path: "src/components/k3martCockpit/StockFlowForm.tsx"
      provides: "Dark-mode-compatible stock flow form"
    - path: "src/components/k3martCockpit/StockMovementHistory.tsx"
      provides: "Dark-mode-compatible stock movement history"
  key_links: []
---

<objective>
Replace all hardcoded light-mode Tailwind classes with theme-aware tokens across 9 K3Mart cockpit components so that dark mode renders correctly.

Purpose: The K3Mart cockpit has white/light backgrounds and hardcoded gray text colors that break dark mode. This is a mechanical token replacement task.
Output: 9 updated component files with proper dark mode support.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@docs/UI_BRAND_REFERENCE.md
@src/components/k3martCockpit/InventorySourcePanel.tsx
@src/components/k3martCockpit/ExpandedOutletPanel.tsx
@src/components/k3martCockpit/OutletCard.tsx
@src/components/k3martCockpit/OutletStockDetail.tsx
@src/components/k3martCockpit/BulkSubmitDialog.tsx
@src/components/k3martCockpit/StockFlowForm.tsx
@src/components/k3martCockpit/StockMovementHistory.tsx
@src/components/k3martCockpit/ProductionReadinessBar.tsx
@src/components/k3martCockpit/StockFlowConfirmDialog.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace tokens in smaller components (5 files, ~750 lines)</name>
  <files>
    src/components/k3martCockpit/ExpandedOutletPanel.tsx
    src/components/k3martCockpit/OutletCard.tsx
    src/components/k3martCockpit/BulkSubmitDialog.tsx
    src/components/k3martCockpit/ProductionReadinessBar.tsx
    src/components/k3martCockpit/StockFlowConfirmDialog.tsx
  </files>
  <action>
Read each file and apply these token replacements:

**Background replacements:**
- `bg-white` -> `bg-card`
- `bg-gray-50` -> `bg-muted`
- `bg-gray-100` -> `bg-muted`
- `bg-gray-200` -> `bg-muted`
- `hover:bg-gray-50` -> `hover:bg-muted`
- `hover:bg-gray-50/50` -> `hover:bg-muted/50`

**Text replacements:**
- `text-gray-900` -> `text-foreground`
- `text-gray-700` -> `text-foreground`
- `text-gray-600` -> `text-muted-foreground`
- `text-gray-500` -> `text-muted-foreground`
- `text-gray-400` -> `text-muted-foreground/70`

**Border replacements:**
- `border-gray-100` -> `border-border`
- `border-gray-200` -> `border-border`
- `border-[#E8E2DB]` -> `border-border`

**Colored accent backgrounds (add dark variant, keep light):**
- `bg-blue-50` -> `bg-blue-50 dark:bg-blue-900/20`
- `bg-purple-50` -> `bg-purple-50 dark:bg-purple-900/20`
- `bg-amber-50` -> `bg-amber-50 dark:bg-amber-900/20`
- `bg-green-50` -> `bg-green-50 dark:bg-green-900/20`
- `bg-red-50` -> `bg-red-50 dark:bg-red-900/20`
- `border-blue-100` -> `border-blue-200 dark:border-blue-800/30`
- `border-purple-100` -> `border-purple-200 dark:border-purple-800/30`

**In OutletCard.tsx** the status map has `bg-gray-100` for certain statuses -- replace with `bg-muted`.

Do NOT change any semantic/status colors (text-red-600, text-green-600, bg-green-100, etc.) that are intentionally colored for meaning.
  </action>
  <verify>Run `npx grep -rn "bg-white\|bg-gray-50\|bg-gray-100\|text-gray-900\|text-gray-500\|border-gray-100" src/components/k3martCockpit/ExpandedOutletPanel.tsx src/components/k3martCockpit/OutletCard.tsx src/components/k3martCockpit/BulkSubmitDialog.tsx src/components/k3martCockpit/ProductionReadinessBar.tsx src/components/k3martCockpit/StockFlowConfirmDialog.tsx` returns no matches. Run `npm run type-check` passes.</verify>
  <done>All 5 smaller files use theme tokens instead of hardcoded light colors. No TypeScript errors.</done>
</task>

<task type="auto">
  <name>Task 2: Replace tokens in larger components (4 files, ~1350 lines)</name>
  <files>
    src/components/k3martCockpit/InventorySourcePanel.tsx
    src/components/k3martCockpit/OutletStockDetail.tsx
    src/components/k3martCockpit/StockFlowForm.tsx
    src/components/k3martCockpit/StockMovementHistory.tsx
  </files>
  <action>
Read each file and apply the SAME token mapping from Task 1.

**Extra attention for these files:**

**InventorySourcePanel.tsx** (226 lines): Has `bg-blue-50`, `bg-purple-50`, `border-[#E8E2DB]`, `border-blue-100`, `border-purple-100`. Replace all per the mapping. The stat cards with colored backgrounds need the `dark:bg-*-900/20` pattern.

**StockFlowForm.tsx** (617 lines -- largest file): Has `bg-white`, `bg-gray-100`, `bg-gray-50/50`, `bg-red-50`, `bg-amber-50`, `bg-green-50`, `hover:bg-amber-50`, `border-gray-100`. Replace grays per mapping. For colored backgrounds add dark variants. For `hover:bg-amber-50` -> `hover:bg-amber-50 dark:hover:bg-amber-900/20`.

**StockMovementHistory.tsx** (344 lines): Has `bg-white`, `bg-gray-100`, `bg-gray-200`, `border-gray-200`, `border-gray-100`, `hover:bg-gray-50/50`. Replace all per mapping.

**OutletStockDetail.tsx** (166 lines): Has `text-gray-500/600/900`, `hover:bg-gray-50/50`, `bg-gray-50/50`. Replace per mapping.

Do NOT change semantic/status colors that convey meaning (red for errors, green for success, etc.).
  </action>
  <verify>Run grep across all 4 files for any remaining hardcoded gray/white tokens. Run `npm run type-check` passes. Run `npm run build` succeeds.</verify>
  <done>All 4 larger files use theme tokens. Zero hardcoded light-only colors remain across all 9 target files. Build passes.</done>
</task>

</tasks>

<verification>
1. `grep -rn "bg-white\|bg-gray-50[^/]\|bg-gray-100\|text-gray-900\|text-gray-700\|text-gray-600\|text-gray-500\|text-gray-400\|border-gray-100\|border-gray-200\|border-\[#E8E2DB\]" src/components/k3martCockpit/InventorySourcePanel.tsx src/components/k3martCockpit/ExpandedOutletPanel.tsx src/components/k3martCockpit/OutletCard.tsx src/components/k3martCockpit/OutletStockDetail.tsx src/components/k3martCockpit/BulkSubmitDialog.tsx src/components/k3martCockpit/StockFlowForm.tsx src/components/k3martCockpit/StockMovementHistory.tsx src/components/k3martCockpit/ProductionReadinessBar.tsx src/components/k3martCockpit/StockFlowConfirmDialog.tsx` — returns NO matches
2. `npm run type-check` — passes
3. `npm run build` — succeeds
</verification>

<success_criteria>
- All 9 K3Mart cockpit component files use theme-aware tokens (bg-card, bg-muted, text-foreground, text-muted-foreground, border-border)
- Colored accent backgrounds have dark: variants
- No hardcoded bg-white, bg-gray-*, text-gray-*, border-gray-* remain in these files
- TypeScript compilation passes
- Build succeeds
</success_criteria>

<output>
After completion, create `.planning/quick/4-fix-k3mart-cockpit-dark-mode-replace-rem/4-SUMMARY.md`
</output>
