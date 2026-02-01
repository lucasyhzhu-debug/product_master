# Handover Document: Kitchen Visual Inventory System - Phase 3 & 4

**Date:** 2026-02-01
**Current Branch:** `feature/kitchen-visual-inventory-phase0`
**Completed:** Phase 0 + Phase 1 + Phase 2 + Phase 3 + Phase 4 (ALL PHASES COMPLETE)

---

## Master Plan Reference

The complete design specification is documented in:
- **Plan file:** `C:\Users\Irfan\.claude\plans\quirky-questing-yao.md`

---

## What Was Completed This Session

### Phase 1: Data Layer Query
**File:** `convex/orders/queries.ts`
- Added `getTrayInventory` query (returns today's tray ball counts)

### Phase 2: Utilities
1. **`src/lib/channels.ts`** (NEW)
   - Channel definitions with colors, codes, and border styles
   - Helper functions: `getChannelInfo()`, `getChannelOptions()`

2. **`src/lib/kitchenSounds.ts`**
   - Added `playClunk()` - ball landing sound
   - Added `playSoftClick()` - package packing sound

3. **`src/components/orders/KitchenDashboard.tsx`**
   - Renamed "Big Balls" → "Original"
   - Renamed "Mid Balls" → "Bite-sized"
   - Updated colors to pistachio green (#93C572)

### Phase 3: UI Components (5 Components)

1. **`src/components/orders/ChannelBadge.tsx`** (NEW)
   - Colored badges for all 11 channels
   - Double border for green channels (WA, TKP, GRB)
   - Size variants: sm, md, lg
   - Tooltip with full channel name

2. **`src/components/orders/KitchenHelpPanel.tsx`** (NEW)
   - Collapsible tutorial panel
   - Auto-shows on first visit
   - localStorage persistence for collapsed state
   - 3-step workflow explanation

3. **`src/components/orders/ProductPackage.tsx`** (NEW)
   - Individual package visualization
   - State colors: grey → red → yellow → green
   - Ball slot visualization
   - Tap to pack/unpack functionality

4. **`src/components/orders/InventoryTray.tsx`** (NEW)
   - Natural pile ball visualization
   - Ghost balls for empty state
   - Overflow indicator (+N more)
   - Framer Motion animations

5. **`src/components/orders/OrderBox.tsx`** (NEW)
   - Complete order card redesign
   - Package grid layout
   - Channel badge integration
   - Hold-to-confirm completion
   - Urgency states (overdue, urgent)

### Phase 4: Page Integration

1. **`src/components/orders/BallCompletionButtons.tsx`** (REFACTORED)
   - Removed hold delay (instant tap)
   - Added hidden [-1] undo button
   - Renamed labels to Original/Bite-sized
   - Updated colors to pistachio green

2. **`src/pages/KitchenView.tsx`** (RESTRUCTURED)
   - Added KitchenHelpPanel at top
   - Side-by-side production zones with trays
   - Integrated InventoryTray components
   - Using OrderBox for pending orders
   - New tray-based mutations (addBallsToTray, removeBallFromTray)
   - Package status mutations (markPackagePacked, unmarkPackagePacked)

3. **`src/components/orders/OrderForm.tsx`** (UPDATED)
   - Replaced channel dropdown with ChannelBadge selector
   - Visual badge-based selection with ring highlight

---

## Build Status

- **TypeScript:** PASS
- **Vite Build:** PASS

---

## Files Created This Session

```
src/lib/channels.ts
src/components/orders/ChannelBadge.tsx
src/components/orders/KitchenHelpPanel.tsx
src/components/orders/ProductPackage.tsx
src/components/orders/InventoryTray.tsx
src/components/orders/OrderBox.tsx
docs/handover-phase2.md
docs/phase3-design.md
docs/phase4-design.md
docs/handover-phase3-4.md (this file)
```

## Files Modified This Session

```
convex/orders/queries.ts          - Added getTrayInventory query
src/lib/kitchenSounds.ts          - Added playClunk(), playSoftClick()
src/components/orders/index.ts    - Added new component exports
src/components/orders/BallCompletionButtons.tsx - Complete refactor
src/components/orders/KitchenDashboard.tsx - Label/color updates
src/components/orders/OrderForm.tsx - Channel badge selector
src/pages/KitchenView.tsx         - Complete restructure
```

---

## API Summary

### New Query
```typescript
const trayInventory = useQuery(api.orders.queries.getTrayInventory, {});
// Returns: { date, originalBallCount, biteSizedBallCount, lastUpdated, updatedBy }
```

### New Mutations
```typescript
// Add balls to tray (auto-drains to orders)
const result = await addBallsToTray({ ballType: 'original', count: 5 });
// Returns: { ballsUsed, overflow, filledPackages, trayCount }

// Remove ball from tray (undo)
await removeBallFromTray({ ballType: 'original' });

// Package status
await markPackagePacked({ orderItemId });
await unmarkPackagePacked({ orderItemId });
```

### New Sounds
```typescript
import { playClunk, playSoftClick } from '@/lib/kitchenSounds';
playClunk();      // When balls land in tray
playSoftClick();  // When marking package as packed
```

---

## Known Issues / Notes

1. **Schema validation error** - The database has existing orders with old channel values ("WA" instead of "whatsapp"). To fix, either:
   - Run a migration to update old channel values, OR
   - Add the old channel codes to the schema union

2. **Type casting** - Some order item mappings use type assertions due to mismatch between hook return types (snake_case) and component props (camelCase). Consider unifying types in future refactor.

3. **Convex types regeneration** - Run `npx convex dev` to regenerate types after schema changes are accepted.

---

## What's Left (Phase 5: Polish)

From the original plan, remaining items:
- [ ] Add overflow "+N more" badge (partially done in InventoryTray)
- [ ] Mobile responsive adjustments
- [ ] End-to-end testing
- [ ] Ball drain animation between tray and orders

---

## Testing Checklist

| # | Test | Status |
|---|------|--------|
| 1 | Check labels show "Original" and "Bite-sized" | Ready to test |
| 2 | Ball colors are pistachio green + chocolate outline | Ready to test |
| 3 | Tap +5 adds balls instantly (no hold) | Ready to test |
| 4 | Tray shows ball count | Ready to test |
| 5 | Help panel auto-shows on first visit | Ready to test |
| 6 | Help panel collapse state persists | Ready to test |
| 7 | Channel badges show in order form | Ready to test |
| 8 | Package states update (grey→red→yellow→green) | Ready to test |
| 9 | Tap yellow package plays soft click | Ready to test |
| 10 | Undo button [-1] revealed by [+] | Ready to test |

---

## Git Commands

To merge to main:
```bash
git add .
git commit -m "feat(kitchen): complete visual inventory tray system - Phases 1-4"
git switch main
git merge feature/kitchen-visual-inventory-phase0
git push
```

---

## How to Continue

1. Fix schema validation (update old channel values)
2. Run `npx convex dev` to regenerate types
3. Test the Kitchen View at `http://localhost:5173/kitchen`
4. Address any visual/UX feedback
5. Complete Phase 5 polish items if needed
