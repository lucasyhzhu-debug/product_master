# Inventory Page Overhaul - Implementation Plan

## Overview
Redesign the Inventory Manager page to align with the terracotta design system, add wastage tracking, active/legacy component sections, component archiving, and location-to-location transfer UI.

## Git Workflow
**Branch:** `feature/inventory-overhaul` (created from `feature/bom-improvements`)
**Checkpoints:** Commit after each wave

## Current State Assessment

### Backend: READY (no new mutations needed)
All required backend mutations already exist:
- `inventory/mutations.ts:transferStock` (line 262) - FIFO-based location-to-location transfer
- `inventory/mutations.ts:adjustStock` (line 356) - Batch quantity adjustment with reason tracking
- `inventory/mutations.ts:expireBatch` (line 446) - Mark batch as expired (audit trail)
- `inventory/mutations.ts:deleteBatch` (line 413) - Delete batch with reservation protection
- `componentTypes/mutations.ts:update` (line 104) - Update `isActive` flag for archive/restore

### Hooks: READY (all wired up)
- `useConvexTransferStock()` - Transfer mutation hook
- `useConvexAdjustStock()` - Adjust mutation hook
- `useConvexExpireBatch()` - Expire mutation hook
- `useConvexDeleteBatch()` - Delete mutation hook
- `useConvexUpdateComponentType()` - Toggle `isActive` for archive/restore
- `useConvexInventoryReport(activeComponentsOnly)` - Already supports active filtering

### Schema: READY
- `componentTypes.isActive` boolean exists
- `componentTransactions.transactionType` includes: `adjust`, `transfer_out`, `transfer_in`, `expire`
- `componentTransactions.referenceNote` stores wastage reason

### What's Missing: Frontend UI Only
1. No transfer dialog
2. No wastage/adjustment dialog
3. No archive/restore component UI
4. No active vs legacy section split
5. StatCard not using terracotta theme
6. BatchCard has no action buttons (transfer, adjust, expire)
7. ComponentRow has no action menu

---

## Implementation Waves

### Wave 1: Theme Alignment + StatCard Upgrade [PARALLEL]
| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | Update StatCard to use terracotta gradient for primary variant | `src/components/inventory/StatCard.tsx` |
| react-ui-builder | Add terracotta accents to InventoryManager page chrome (header, card borders) | `src/pages/InventoryManager.tsx` |

**StatCard changes:**
- Add `terracotta` variant: `bg-gradient-to-br from-[#E07856]/20 to-[#D66A4A]/10 text-orange-100 border-[#E07856]/30`
- Update `primary` variant to use dark-gradient: `from-[#2D3748] to-[#1A202C]`
- Add terracotta icon containers: `bg-[#E07856]/10` with `text-[#E07856]`

**InventoryManager changes:**
- "Receive Stock" button: terracotta gradient `bg-gradient-to-r from-[#E07856] to-[#D66A4A]`
- Main card header: subtle terracotta underline accent
- Category filter badges: terracotta active state
- Use `terracotta` variant for "Total Components" stat

### Wave 2: Transfer Stock Dialog [SEQUENTIAL after Wave 1]
| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | Create TransferStockDialog component | `src/components/inventory/TransferStockDialog.tsx` |

**TransferStockDialog spec:**
- Trigger: Button in ComponentRow expanded view, per-location
- Props: `componentTypeId`, `fromLocationId`, `fromLocationName`, `locations[]`, `maxQuantity`
- Form fields: To Location (button grid), Quantity (with max display), Note (optional)
- Uses `useConvexTransferStock()` hook
- Validation: quantity > 0, quantity <= maxQuantity, from !== to
- Success toast + auto-close

### Wave 3: Wastage/Adjust Stock Dialog [PARALLEL with Wave 2]
| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | Create AdjustStockDialog (handles wastage + count corrections) | `src/components/inventory/AdjustStockDialog.tsx` |

**AdjustStockDialog spec:**
- Trigger: Button on BatchCard (action menu)
- Props: `batch` object, `componentName`
- Mode toggle: "Record Wastage" | "Count Correction"
  - Wastage: Enter waste quantity, reason (dropdown: damaged, expired, lost, other + freetext)
  - Correction: Enter new actual count, reason
- Both use `useConvexAdjustStock()` hook
  - Wastage: `newQuantity = batch.quantityRemaining - wasteQty`
  - Correction: `newQuantity = actualCount`
- Reason stored in `referenceNote` prefixed with `[WASTAGE]` or `[COUNT]`

### Wave 4: Active/Legacy Sections + Archive UI [SEQUENTIAL after Wave 1]
| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | Split inventory view into Active and Legacy tabs | `src/pages/InventoryManager.tsx` |
| react-ui-builder | Add archive/restore action to ComponentRow | `src/components/inventory/ComponentRow.tsx` |

**InventoryManager changes:**
- Add `showLegacy` toggle state (default false)
- Pass `activeComponentsOnly: !showLegacy` to `useConvexInventoryReport`
- Add "Show Legacy" toggle button in header area
- When showLegacy=true, show a separate "Legacy Components" section below active with muted styling
- Actually: Use a single query with `activeComponentsOnly: false` and split client-side into two lists

**ComponentRow changes:**
- Add kebab menu (three-dot) with actions:
  - "Archive Component" (when active) - calls `useConvexUpdateComponentType({ id, isActive: false })`
  - "Restore Component" (when legacy) - calls `useConvexUpdateComponentType({ id, isActive: true })`
- Archive uses a ConfirmDialog: "This will move {name} to Legacy. Historic orders are preserved."
- Legacy rows get muted styling: opacity-60, striped background

### Wave 5: Wire Actions into BatchCard + ComponentRow [SEQUENTIAL after Wave 2+3]
| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | Add action buttons to BatchCard | `src/components/inventory/BatchCard.tsx` |
| react-ui-builder | Add transfer button to ComponentRow per-location | `src/components/inventory/ComponentRow.tsx` |
| react-ui-builder | Update barrel export | `src/components/inventory/index.ts` |

**BatchCard changes:**
- Add action row at bottom of each batch:
  - "Adjust" button -> opens AdjustStockDialog
  - "Expire" button (only if batch is active) -> calls expireBatch with confirm
- Expired batches shown with red strikethrough styling

**ComponentRow changes:**
- Per-location row gets a "Transfer" icon button -> opens TransferStockDialog
- Per-location row gets a "Receive" icon button -> opens ReceiveStockDialog (pre-selected component+location)

### Wave 6: Verification [SEQUENTIAL]
| Agent | Task |
|-------|------|
| code-auditor | Type check + pattern compliance |
| Bash | `npm run build` |
| Bash | `npm run test` |

---

## Documentation Updates
- [ ] CHANGELOG.md - Add inventory overhaul entry
- [ ] No schema changes needed
- [ ] No API changes needed (all mutations already exist)

## Success Criteria
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] StatCard uses terracotta theme for primary variant
- [ ] Transfer dialog works: select destination, enter qty, submit
- [ ] Wastage dialog works: record waste with reason, submit
- [ ] Active/Legacy toggle separates archived components
- [ ] Archive/Restore action on component rows works
- [ ] BatchCard has Adjust and Expire action buttons
- [ ] ComponentRow has Transfer button per-location
- [ ] All existing inventory features still work (receive stock, expand batches, low stock alerts)

---

## Key Design Tokens (from /frontend-design exploration)

```
Primary Terracotta: #E07856
Dark Terracotta: #D66A4A
Darker Terracotta: #C55A3A
Terracotta Light: rgba(224, 120, 86, 0.1)
Terracotta Muted: rgba(224, 120, 86, 0.05)

Dark Gradient From: #2D3748
Dark Gradient To: #1A202C

Button: bg-gradient-to-r from-[#E07856] to-[#D66A4A]
Accent Border: border-[#E07856]/20
Icon Container: bg-[#E07856]/10 text-[#E07856]
Hover: hover:border-[#E07856]/30 hover:shadow-md
```

## Risk Assessment
- **Low risk**: All backend mutations already exist and are tested
- **Low risk**: No schema changes needed
- **Medium risk**: Theme changes could affect other pages using StatCard - mitigation: new `terracotta` variant, existing variants unchanged
- **Low risk**: ComponentRow prop additions are backwards-compatible
