---
status: resolved
trigger: "Comprehensive dark mode audit and fix across the entire frontend codebase"
created: 2026-02-23T00:00:00Z
updated: 2026-02-23T01:00:00Z
symptoms_prefilled: true
---

## Current Focus

hypothesis: CONFIRMED — many components used light-mode-only background/text/border colors
test: Grep for bg-*-50, bg-*-100, from-*-50, bg-white patterns without dark: variants
expecting: Fixed all visible issues
next_action: COMPLETE

## Symptoms

expected: All UI components look correct in both light and dark mode
actual: Components appeared too bright, washed out, or had invisible text in dark mode
errors: Visual only — no JS errors
reproduction: Switch to dark mode, navigate pages
started: Pre-existing issue across codebase

## Already Fixed Before This Session (skip)
- src/components/inventory/LowStockAlertsBanner.tsx
- src/components/inventory/BatchCard.tsx
- src/components/whatsappTemplates/TemplateCard.tsx
- src/pages/MenuProductsManager.tsx

## Eliminated

- hypothesis: bg-white in panels needed fixing
  evidence: The only bg-white without dark: was a toggle switch thumb (intentional) and ring indicators (intentional)
  timestamp: 2026-02-23

- hypothesis: bg-*-500 dots/badges needed fixing
  evidence: All bg-*-500 uses are solid-color indicator dots/progress bars/buttons with white text — intentional, work in both modes
  timestamp: 2026-02-23

- hypothesis: from-emerald-500/10 gradient needed fixing
  evidence: Uses opacity modifier (/10, /5) — semi-transparent, works fine in dark mode
  timestamp: 2026-02-23

## Evidence

- timestamp: 2026-02-23
  checked: src/components/inventory/ComponentRow.tsx
  found: bg-red-50/60, bg-red-50/50, bg-amber-50/30, bg-emerald-50 badge, bg-blue-50 badge
  implication: Row backgrounds and badges were bright in dark mode

- timestamp: 2026-02-23
  checked: src/components/inventory/ProductStockCard.tsx
  found: bg-red-50/60, bg-amber-50/30, bg-red-100, bg-amber-100, bg-emerald-100 badges
  implication: Card background and stock count badge bright in dark mode

- timestamp: 2026-02-23
  checked: src/components/inventory/TransactionLogPanel.tsx
  found: bg-emerald-100, bg-blue-100, bg-purple-100, bg-amber-100 transaction type badges
  implication: All transaction badges bright in dark mode

- timestamp: 2026-02-23
  checked: src/components/inventory/FinishedGoodsTab.tsx
  found: bg-red-50 alert banner, bg-red-100 product name pills
  implication: Low-stock alert banner bright red in dark mode

- timestamp: 2026-02-23
  checked: src/components/orders/AuditTrail.tsx
  found: bg-green-100, bg-amber-100, bg-red-100, bg-gray-100 direction badges
  implication: All audit trail badges bright in dark mode

- timestamp: 2026-02-23
  checked: src/components/orders/KanbanCard.tsx
  found: bg-amber-50, bg-red-50, bg-red-100 urgency badges, bg-gray-100 cancelled badge, bg-amber-100 expedited badge, bg-amber-50 notes text
  implication: Multiple urgency indicators bright in dark mode

- timestamp: 2026-02-23
  checked: src/components/orders/OrderSlideOver.tsx
  found: bg-red-100, bg-red-50, bg-amber-50 due date badges, bg-amber-100 expedited badge
  implication: Due date urgency indicators and expedited badge bright in dark mode

- timestamp: 2026-02-23
  checked: src/components/orders/PasteTemplateBox.tsx
  found: bg-green-50, bg-red-50, bg-amber-50 alert boxes
  implication: Parse result alert boxes bright in dark mode

- timestamp: 2026-02-23
  checked: src/components/orders/EnhancedCancellationDialog.tsx
  found: bg-amber-50 impact box, bg-red-50 confirmation checkbox area
  implication: Cancellation impact boxes bright in dark mode

- timestamp: 2026-02-23
  checked: src/components/orders/PackageStatusDisplay.tsx
  found: bg-gray-100, bg-orange-100, bg-yellow-100, bg-green-100 status card backgrounds
  implication: All package status cards bright in dark mode

- timestamp: 2026-02-23
  checked: src/components/orders/OrderFormPOS.tsx
  found: bg-blue-50 customer icon, bg-purple-50 delivery icon, hover:bg-blue-50 dropdown, bg-amber-50 validation warning
  implication: Icon circles and validation box bright in dark mode

- timestamp: 2026-02-23
  checked: src/components/productionRecipes/COGSPreview.tsx
  found: bg-blue-50 manual mode box, bg-emerald-50 calculated mode boxes (x2)
  implication: COGS display panels bright in dark mode

- timestamp: 2026-02-23
  checked: src/components/k3martCockpit/OutletCard.tsx
  found: bg-amber-100, bg-blue-100, bg-green-100, bg-orange-100, bg-red-100 plan status badges
  implication: All plan status badges bright in dark mode

- timestamp: 2026-02-23
  checked: src/components/k3martCockpit/InventorySourcePanel.tsx
  found: bg-red-100 "Depleted" badges (x3 — one per source card)
  implication: Depleted badges bright in dark mode

- timestamp: 2026-02-23
  checked: src/components/k3martCockpit/ProductionReadinessBar.tsx
  found: from-amber-50 to-orange-50 gradient (loading + main), text-amber-900 header
  implication: Entire production deficit banner bright orange/amber in dark mode

- timestamp: 2026-02-23
  checked: src/components/k3martCockpit/StockFlowForm.tsx
  found: text-amber-800, text-amber-900 in rotation summary (bg already had dark:)
  implication: Text on amber bg was dark/invisible in dark mode

- timestamp: 2026-02-23
  checked: src/components/gofoodDepot/SeedWarningBlocker.tsx
  found: bg-amber-50 main box, bg-amber-100 instructions box, text-amber-900/800 (x4)
  implication: Entire warning blocker page was bright amber in dark mode

- timestamp: 2026-02-23
  checked: src/components/gofoodDepot/DepotCockpitTable.tsx
  found: bg-red-50/60 low-stock row, bg-blue-50 restock suggestion pill
  implication: Low-stock rows and restock suggestions bright in dark mode

- timestamp: 2026-02-23
  checked: src/components/gofoodDepot/DepotMappingSection.tsx
  found: bg-amber-50 "unmapped"/"unlinked" badges (x2), text-amber-800 unmapped name
  implication: Unmapped indicators bright in dark mode

- timestamp: 2026-02-23
  checked: src/components/gofoodDepot/DepotStockTransferDialog.tsx
  found: bg-amber-50 warning notice
  implication: Missing location warning bright in dark mode

- timestamp: 2026-02-23
  checked: src/components/menuProducts/PackagingComponentsSection.tsx
  found: bg-orange-100/bg-blue-100/bg-purple-100 stage toggle (selected state), bg-orange-50/bg-blue-50/bg-purple-50 create dialog stage toggle
  implication: Stage selector buttons bright in dark mode

- timestamp: 2026-02-23
  checked: src/components/menuProducts/POSPreviewPanel.tsx
  found: from-gray-50 to-white card header gradient, bg-blue-50/50 packaging slot button
  implication: Card header gradient and packaging slot buttons washed out in dark mode

- timestamp: 2026-02-23
  checked: src/components/menuProducts/DroppableSlotZone.tsx
  found: bg-blue-50/50, bg-red-50/30 drag-over highlights
  implication: DnD drop zone highlight colors bright in dark mode

- timestamp: 2026-02-23
  checked: src/pages/GoFoodDepotManager.tsx
  found: bg-red-50 low-stock banner, text-red-800/red-700 on colored bg
  implication: Low-stock banner bright in dark mode

- timestamp: 2026-02-23
  checked: src/pages/IngredientsManager.tsx
  found: bg-emerald-50 "Tracked" badge
  implication: Badge bright in dark mode

- timestamp: 2026-02-23
  checked: src/pages/OrderCreate.tsx
  found: bg-blue-50/amber-50/purple-50/emerald-50/slate-100 section icon circles, bg-amber-50 validation warning
  implication: All section icon backgrounds bright in dark mode

- timestamp: 2026-02-23
  checked: src/pages/OrderDetail.tsx
  found: bg-red-100/bg-red-50/bg-amber-50 due date badge function
  implication: Due date urgency badges bright in dark mode

## Resolution

root_cause: Light-mode background/text/border classes used throughout frontend without dark: counterparts. Pattern: bg-*-50/bg-*-100 for alert boxes, status badges, section icon circles, status indicators.

fix: Added dark: variants to all 24 affected files — bg-*-950/40 for -50 backgrounds, bg-*-900/40 for -100 backgrounds, dark:text-*-300 for dark-mode-safe text, dark:border-*-700/800 for borders. Also fixed text-*-800/900 on colored backgrounds.

verification: grep scan shows zero remaining bg-*-50 or bg-*-100 without dark: counterparts (excluding opacity modifiers /5, /10, /15, /20, etc. which are semi-transparent and inherently dark-mode safe)

files_changed:
  - src/components/inventory/ComponentRow.tsx
  - src/components/inventory/ProductStockCard.tsx
  - src/components/inventory/TransactionLogPanel.tsx
  - src/components/inventory/FinishedGoodsTab.tsx
  - src/components/inventory/ReceiveStockDialog.tsx
  - src/components/productionRecipes/COGSPreview.tsx
  - src/components/orders/AuditTrail.tsx
  - src/components/orders/KanbanCard.tsx
  - src/components/orders/OrderSlideOver.tsx
  - src/components/orders/PasteTemplateBox.tsx
  - src/components/orders/EnhancedCancellationDialog.tsx
  - src/components/orders/PackageStatusDisplay.tsx
  - src/components/orders/OrderFormPOS.tsx
  - src/components/k3martCockpit/OutletCard.tsx
  - src/components/k3martCockpit/InventorySourcePanel.tsx
  - src/components/k3martCockpit/ProductionReadinessBar.tsx
  - src/components/k3martCockpit/StockFlowForm.tsx
  - src/components/gofoodDepot/SeedWarningBlocker.tsx
  - src/components/gofoodDepot/DepotCockpitTable.tsx
  - src/components/gofoodDepot/DepotMappingSection.tsx
  - src/components/gofoodDepot/DepotStockTransferDialog.tsx
  - src/components/menuProducts/PackagingComponentsSection.tsx
  - src/components/menuProducts/POSPreviewPanel.tsx
  - src/components/menuProducts/DroppableSlotZone.tsx
  - src/pages/GoFoodDepotManager.tsx
  - src/pages/IngredientsManager.tsx
  - src/pages/OrderCreate.tsx
  - src/pages/OrderDetail.tsx
