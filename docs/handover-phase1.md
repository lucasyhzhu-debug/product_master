# Handover Document: Kitchen Visual Inventory System - Phase 1

**Date:** 2026-02-01
**Current Branch:** `feature/kitchen-visual-inventory-phase0`
**Previous Session Completed:** Phase 0 (Data Layer + Audit + Fixes)

---

## Master Plan Reference

The complete design specification is documented in:
- **Plan file:** `C:\Users\Irfan\.claude\plans\quirky-questing-yao.md`

This contains:
- Full design specifications from CTO
- Ball visual design (pistachio green + chocolate brown)
- Layout mockups (side-by-side trays)
- Order box with package states
- Channel badge definitions
- Animation flow
- Verification checklist (24 items)

---

## What Was Completed (Phase 0)

### Schema Changes (`convex/schema.ts`)
1. **Added `kitchenInventory` table** - Stores daily ball counts in trays
   - `originalBallCount`, `biteSizedBallCount`, `lastUpdated`, `updatedBy`
   - Index: `by_date`

2. **Updated `channel` field** - Changed from `v.string()` to union type
   - 11 channels: whatsapp, instagram, shopee, tiktok, tokopedia, grabfood, k3mart_gf, legato_tamtem, legato_goldfinch, bazaar, other

3. **Added to `orderItems`:**
   - `packageStatus`: union of "empty" | "filling" | "filled" | "packed"
   - `ballsFilled`: number tracking filled balls per package

### Mutations (`convex/orders/mutations.ts`)
1. **`addBallsToTray`** - Lines ~1258-1427
   - Accepts `ballType: "original" | "bite_sized"` and `count: number`
   - Auto-drains balls to pending orders by priority (due date, size, order date)
   - Updates both old system (ballsRemaining) and new system (orderItemProduction)
   - Returns `trayCount`, `ballsUsed`, `completedOrderIds`, `overflow`

2. **`removeBallFromTray`** - Lines ~1435-1469
   - LIFO removal from tray
   - Returns `trayCount`

3. **`markPackagePacked`** - Lines ~1475-1520
   - Changes package status from "filled" to "packed"
   - Validates current status is "filled"

4. **`unmarkPackagePacked`** - Lines ~1526-1548
   - Changes package status from "packed" back to "filled"
   - No confirmation needed (instant toggle)

### Type Fixes Applied
- Fixed channel validator in `create` mutation to match schema union type
- Added `orderLevelDiscount` to interfaces in useDashboard.ts and useKitchenStats.ts
- Added `total_discount` to all transform functions
- Exported `OrderChannel` type from useOrders.ts
- Fixed unused variable in addBallsToTray loop
- Fixed duplicate `formatDueDate` in PackagingView.tsx

### Build Status
- TypeScript: PASS
- Vite Build: PASS
- All critical audit issues resolved

---

## What's Left (Phases 1-4)

### Phase 1: Complete Data Layer
- [ ] Create `getTrayInventory` query (return today's tray counts)

### Phase 2: Utilities & Simple Updates
- [ ] Create `src/lib/channels.ts` - Channel definitions with colors and codes
- [ ] Add sounds to `kitchenSounds.ts` - "clunk" (tray landing) and "soft click" (packing)
- [ ] Update `KitchenDashboard.tsx` - Rename labels to "Original" / "Bite-sized"

### Phase 3: UI Components (Can run in parallel)
- [ ] Create `ChannelBadge.tsx` - Color variants, double border for green channels
- [ ] Create `KitchenHelpPanel.tsx` - Collapsible tutorial with localStorage persistence
- [ ] Create `ProductPackage.tsx` - Package with state colors (grey/red/yellow/green)
- [ ] Create `InventoryTray.tsx` - Natural pile of balls with Framer Motion animations
- [ ] Create `OrderBox.tsx` - Replaces KitchenOrderCard with new package grid design

### Phase 4: Page Integration
- [ ] Refactor `BallCompletionButtons.tsx` - Remove hold delay, add hidden [-1] undo
- [ ] Restructure `KitchenView.tsx` - Layout with trays and help panel
- [ ] Update `OrderManager.tsx` - Replace channel dropdown with badge selector

---

## Agent Architecture for Remaining Work

| Task | Recommended Agent |
|------|-------------------|
| `getTrayInventory` query | `convex-backend` |
| `channels.ts`, sounds, dashboard labels | Direct edit (simple) |
| `ChannelBadge.tsx` | `ui-component-builder` |
| `KitchenHelpPanel.tsx` | `ui-component-builder` |
| `ProductPackage.tsx` | `ui-component-builder` |
| `InventoryTray.tsx` | `ui-component-builder` |
| `OrderBox.tsx` | `ui-component-builder` |
| `BallCompletionButtons.tsx` | `react-ui-builder` |
| `KitchenView.tsx` | `react-ui-builder` |
| `OrderManager.tsx` | `react-ui-builder` |

**Recommended strategy:**
1. Complete Phase 1 (one query) with `convex-backend`
2. Do Phase 2 utility updates with direct edits
3. Launch Phase 3 UI components in parallel with multiple `ui-component-builder` agents
4. Do Phase 4 page integration sequentially with `react-ui-builder`

---

## Key Design Decisions (From Plan)

1. **Ball colors:** Pistachio green (#93C572) center + chocolate brown (#7B3F00) outline
2. **Ball sizes:** Original ~28px, Bite-sized ~18px
3. **Naming:** "Original" (not Big), "Bite-sized" (not Mid)
4. **Package states:** Grey → Red → Yellow → Green borders
5. **Production buttons:** Instant tap (no hold delay)
6. **Order completion:** 1-second hold (safety confirmation)
7. **Tutorial:** Auto-shows first visit, remembers if minimized
8. **Undo button:** Hidden [-1] revealed by tapping [+]

---

## Files Modified This Session

```
convex/schema.ts                      - Schema changes
convex/orders/mutations.ts            - New mutations + type fix
src/hooks/convex/useDashboard.ts      - Added orderLevelDiscount + total_discount
src/hooks/convex/useKitchenStats.ts   - Added orderLevelDiscount + total_discount
src/hooks/convex/useOrders.ts         - Added OrderChannel type
src/components/orders/OrderForm.tsx   - Type cast for channel
src/pages/PackagingView.tsx           - Fixed formatDueDate duplicate
```

---

## Git Information

**Branch:** `feature/kitchen-visual-inventory-phase0`
**Commit:** `feat(kitchen): add visual inventory tray system - Phase 0 (Data Layer)`

To merge to main:
```bash
git switch main
git merge feature/kitchen-visual-inventory-phase0
git push
```

---

## How to Continue

1. Read the master plan: `C:\Users\Irfan\.claude\plans\quirky-questing-yao.md`
2. Review this handover document
3. Start with Phase 1: Create `getTrayInventory` query
4. Use `code-auditor` agent after each phase to verify before committing
5. Create new handover document for next phase: `handover-phase2.md`, etc.
