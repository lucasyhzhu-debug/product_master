---
phase: 25-codebase-cleanup
plan: 02
subsystem: hooks
tags: [refactor, hooks, cleanup, naming]
dependency_graph:
  requires: []
  provides: [CLEANUP-HOOK-RENAME-BATCH1-3]
  affects: [src/hooks/convex/index.ts, src/components, src/pages]
tech_stack:
  added: []
  patterns: [unprefixed-hook-naming]
key_files:
  modified:
    - src/hooks/convex/useMenuProductComponents.ts
    - src/hooks/convex/useSalesAnalytics.ts
    - src/hooks/convex/useProductionUnitTypes.ts
    - src/hooks/convex/useWhatsAppTemplates.ts
    - src/hooks/convex/useStorageLocations.ts
    - src/hooks/convex/useCustomers.ts
    - src/hooks/convex/useKitchenStats.ts
    - src/hooks/convex/index.ts
    - src/components/menuProducts/ProductForm.tsx
    - src/components/salesAnalytics/SettingsTab.tsx
    - src/components/whatsappTemplates/TemplateEditor.tsx
    - src/pages/WhatsAppTemplatesManager.tsx
    - src/components/inventory/FinishedGoodsTab.tsx
    - src/pages/InventoryManager.tsx
    - src/pages/LocationsManager.tsx
    - src/components/orders/CustomerSearch.tsx
    - src/components/orders/OrderForm.tsx
    - src/components/orders/OrderFormPOS.tsx
    - src/pages/CustomersManager.tsx
decisions:
  - "useConvex prefix removed from all 7 hook files in Batches 1-3; hooks are already scoped to src/hooks/convex/ making the prefix redundant"
metrics:
  duration_minutes: 5
  tasks_completed: 2
  files_modified: 19
  completed_date: 2026-02-23
requirements_fulfilled:
  - CLEANUP-HOOK-RENAME
---

# Phase 25 Plan 02: Hook Rename Batches 1-3 Summary

**One-liner:** Removed useConvex prefix from 34 exported hook names across 7 files (Batches 1-3), updated barrel index.ts, and updated all import sites across 12 consumer files.

## What Was Done

Renamed every exported hook function in 7 hook files, stripping the redundant `useConvex` prefix. Hooks already live in `src/hooks/convex/` making the prefix verbose at all call sites. This aligns with hooks that already lacked the prefix (useVouchers, useGoFoodDepot, etc.).

## Renamed Hooks — Complete List

### Batch 1

**useMenuProductComponents.ts (2 hooks):**
| Old Name | New Name |
|---|---|
| useConvexMenuProductComponents | useMenuProductComponents |
| useConvexMenuProductComponentsBatch | useMenuProductComponentsBatch |

**useSalesAnalytics.ts (3 hooks):**
| Old Name | New Name |
|---|---|
| useConvexSyncHealthStatus | useSyncHealthStatus |
| useConvexSyncHealthAlert | useSyncHealthAlert |
| useConvexCredentialStatusEnhanced | useCredentialStatusEnhanced |

**useProductionUnitTypes.ts (3 hooks):**
| Old Name | New Name |
|---|---|
| useConvexProductionUnitTypes | useProductionUnitTypes |
| useConvexProductionUnitType | useProductionUnitType |
| useConvexProductionUnitTypeByCode | useProductionUnitTypeByCode |

**useWhatsAppTemplates.ts (5 hooks):**
| Old Name | New Name |
|---|---|
| useConvexWhatsAppTemplates | useWhatsAppTemplates |
| useConvexWhatsAppTemplateByCode | useWhatsAppTemplateByCode |
| useConvexUpdateWhatsAppTemplate | useUpdateWhatsAppTemplate |
| useConvexResetWhatsAppTemplate | useResetWhatsAppTemplate |
| useConvexSeedWhatsAppTemplates | useSeedWhatsAppTemplates |

**Batch 1 consumer files updated:** ProductForm.tsx, SettingsTab.tsx, TemplateEditor.tsx, WhatsAppTemplatesManager.tsx

### Batch 2

**useStorageLocations.ts (6 hooks):**
| Old Name | New Name |
|---|---|
| useConvexStorageLocations | useStorageLocations |
| useConvexStorageLocation | useStorageLocation |
| useConvexDefaultLocation | useDefaultLocation |
| useConvexCreateStorageLocation | useCreateStorageLocation |
| useConvexUpdateStorageLocation | useUpdateStorageLocation |
| useConvexDeleteStorageLocation | useDeleteStorageLocation |

**useCustomers.ts (7 hooks):**
| Old Name | New Name |
|---|---|
| useConvexCustomers | useCustomers |
| useConvexCustomer | useCustomer |
| useConvexCustomerSearch | useCustomerSearch |
| useConvexCustomerByPhone | useCustomerByPhone |
| useConvexCreateCustomer | useCreateCustomer |
| useConvexUpdateCustomer | useUpdateCustomer |
| useConvexDeleteCustomer | useDeleteCustomer |

**Batch 2 consumer files updated:** FinishedGoodsTab.tsx, InventoryManager.tsx, LocationsManager.tsx, CustomerSearch.tsx, OrderForm.tsx, OrderFormPOS.tsx, CustomersManager.tsx

### Batch 3

**useKitchenStats.ts (8 hooks):**
| Old Name | New Name |
|---|---|
| useConvexKitchenStats | useKitchenStats |
| useConvexKitchenOrdersWithBalls | useKitchenOrdersWithBalls |
| useConvexCompletedToday | useCompletedToday |
| useConvexCompleteOrder | useCompleteOrder |
| useConvexRevertToConfirmed | useRevertToConfirmed |
| useConvexCompleteBalls | useCompleteBalls |
| useConvexCompletePackaging | useCompletePackaging |
| useConvexRevertToPackaging | useRevertToPackaging |

**Batch 3 consumer files updated:** None (hooks imported exclusively via index.ts barrel; no page/component directly consumed old names)

## Type-Check Results

- After Batch 1: `npm run type-check` passed (exit 0)
- After Batch 2: `npm run type-check` passed (exit 0)
- After Batch 3: `npm run type-check` passed (exit 0)

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 (Batch 1) | 0e9382f | refactor(25-02): rename Batch 1 hooks — strip useConvex prefix from 4 files |
| Task 2 (Batch 2+3) | e6d5800 | refactor(25-02): rename Batch 2+3 hooks — strip useConvex prefix from 3 files |

## Self-Check

### Files Exist

- FOUND: src/hooks/convex/useMenuProductComponents.ts
- FOUND: src/hooks/convex/useCustomers.ts
- FOUND: src/hooks/convex/useKitchenStats.ts

### Commits Exist

- FOUND: 0e9382f (Batch 1 renames)
- FOUND: e6d5800 (Batch 2+3 renames)

## Self-Check: PASSED
