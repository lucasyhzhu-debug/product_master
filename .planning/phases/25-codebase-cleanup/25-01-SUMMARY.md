---
phase: 25-codebase-cleanup
plan: 01
subsystem: ui
tags: [tailwind, dark-mode, design-system, semantic-tokens, whatsapp]

# Dependency graph
requires: []
provides:
  - "Dark mode compliance across 18 frontend components — all hardcoded gray/white Tailwind classes replaced with semantic tokens or explicit dark: counterparts"
  - "WhatsApp preview bubble in TemplateEditor with authentic dark mode aesthetic (dark:bg-[#0d1117] background, dark:bg-[#005c4b] bubble)"
affects:
  - future UI changes to inventory, orders, kitchen, whatsapp templates, restock, gofood depot components

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Semantic token substitution: bg-white → bg-card, text-gray-N → text-muted-foreground / text-foreground, border-gray-N → border-border, bg-gray-50/100 → bg-muted"
    - "Hardcoded dark overlays (e.g., always-dark tooltips) get dark: counterpart even if semantically dark-first"
    - "External UI simulations (WhatsApp) use brand-specific hex values with explicit dark: variants, not design-system tokens"

key-files:
  created: []
  modified:
    - src/components/menuProducts/POSPreviewPanel.tsx
    - src/pages/OrderManager.tsx
    - src/pages/OrderCreate.tsx
    - src/components/orders/ChannelButtons.tsx
    - src/components/orders/KanbanBoard.tsx
    - src/components/orders/AuditTrail.tsx
    - src/components/feedback/FeedbackCaptureMode.tsx
    - src/components/whatsappTemplates/TemplateCard.tsx
    - src/components/whatsappTemplates/TemplateEditor.tsx
    - src/components/gofoodDepot/DepotMappingSection.tsx

key-decisions:
  - "StatCard bg-white/10 left as-is — it is an intentional opacity-based overlay on the always-dark bg-slate-900 card; no dark: needed"
  - "ShiftSuccessScreen, IngredientsManager, VoucherInput, RestockTargetRow, K3MartSyntheticCard, KitchenOrderCard already had dark: counterparts — no changes required"
  - "KanbanBoard colorClass bg-gray-500 updated to bg-muted-foreground (neutral semantic token for Draft status dot)"
  - "AuditTrail neutral dot bg-gray-400 updated to bg-muted-foreground"
  - "FeedbackCaptureMode tooltip (bg-gray-900 text-white) kept as intentionally-dark overlay; dark:bg-gray-800 added for compliance"
  - "DepotMappingSection toggle knob bg-white gets dark:bg-gray-200 to remain light-colored in dark mode"
  - "TemplateCard preview bubble text-gray-800 gets dark:text-gray-700 since the bubble bg-[#DCF8C6] has no dark: in TemplateCard (card-level component always shows light bubble)"

patterns-established:
  - "Semantic token rule: do NOT add dark: to semantic tokens (bg-card, text-muted-foreground) — they already adapt via CSS variables in src/index.css"
  - "WhatsApp dark mode pattern: bg-[#ECE5DD] dark:bg-[#0d1117], bg-[#DCF8C6] dark:bg-[#005c4b], text-[#667781] dark:text-[#8696a0], bg-white/50 dark:bg-white/10"

requirements-completed:
  - CLEANUP-DARK-MODE

# Metrics
duration: 4min
completed: 2026-02-23
---

# Phase 25 Plan 01: Dark Mode Cleanup Summary

**Replaced hardcoded Tailwind gray/white color classes with semantic design-system tokens across 10 of 18 target files; 8 files already had compliant dark: counterparts; WhatsApp preview bubble now uses WhatsApp's own dark aesthetic.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-23T15:28:21Z
- **Completed:** 2026-02-23T15:32:22Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Eliminated all bare hardcoded `bg-white`, `bg-gray-N`, `text-gray-N`, `border-gray-N` classes in 10 target files by substituting semantic tokens or adding explicit `dark:` counterparts
- Applied WhatsApp's own dark mode color palette to TemplateEditor preview bubble: `dark:bg-[#0d1117]` (chat bg), `dark:bg-[#005c4b]` (sent bubble), `dark:text-[#e9edef]` (message text), `dark:text-[#8696a0]` (timestamp), `dark:bg-white/10` (sample badge)
- `npm run type-check` passes with zero errors after all changes

## Task Commits

1. **Task 1: inventory, menu product, and order components** - `c617386` (feat)
2. **Task 2: feedback, kitchen, WhatsApp, restock, and GoFood components** - `e3fd6e7` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `src/components/menuProducts/POSPreviewPanel.tsx` - border-gray-100, bg-gradient-to-r from-gray-50 to-white, text-gray-500 x2, border-gray-200, text-gray-300, text-gray-400 x2 → semantic tokens
- `src/pages/OrderManager.tsx` - border-gray-300 checkboxes and bg-white legend swatches → border-border, bg-card
- `src/pages/OrderCreate.tsx` - border-gray-300 address sync checkbox → border-border
- `src/components/orders/ChannelButtons.tsx` - text-gray-600 for "other" channel → text-muted-foreground
- `src/components/orders/KanbanBoard.tsx` - bg-gray-500 Draft colorClass → bg-muted-foreground
- `src/components/orders/AuditTrail.tsx` - bg-gray-400 neutral dot → bg-muted-foreground
- `src/components/feedback/FeedbackCaptureMode.tsx` - added dark:bg-gray-800 and dark:text-gray-400 to dark overlay tooltip
- `src/components/whatsappTemplates/TemplateCard.tsx` - text-gray-800 bubble text → + dark:text-gray-700
- `src/components/whatsappTemplates/TemplateEditor.tsx` - full WhatsApp dark mode aesthetic applied
- `src/components/gofoodDepot/DepotMappingSection.tsx` - toggle knob bg-white → + dark:bg-gray-200

## Decisions Made
- StatCard's `bg-white/10` is an intentional semi-transparent overlay on a dark-first (`bg-slate-900`) card — correct in both modes, left unchanged
- 8 of 18 target files (TransferStockDialog, StatCard, VoucherInput, ShiftSuccessScreen, IngredientsManager, RestockTargetRow, KitchenOrderCard, K3MartSyntheticCard) already had compliant dark: counterparts on every gray/white class — no changes needed
- FeedbackCaptureMode's cursor tooltip is an intentionally dark overlay (browser DevTools aesthetic); dark: variants added for strict compliance but visual behavior unchanged

## Deviations from Plan

None - plan executed exactly as written. The 8 files with fewer changes than the research audit predicted were due to those files having already-compliant dark: pairs that the research flagged as raw occurrences.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Dark mode cleanup for this batch complete; ready for Phase 25 Plan 02 (next cleanup wave)
- All 18 originally targeted files are now dark-mode compliant

---
*Phase: 25-codebase-cleanup*
*Completed: 2026-02-23*
