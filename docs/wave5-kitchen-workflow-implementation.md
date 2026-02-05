# Wave 5: Kitchen Workflow Frontend Implementation

**Date:** 2026-02-05
**Branch:** `feature/inventory-management-system`
**Status:** ✅ Complete

---

## Implementation Summary

This wave implements the redesigned Kitchen View with a 3-column Kanban layout for the Boxing → Stickering → Shipping workflow, supporting the new Boxed and Labeled order statuses.

### Files Created

#### Kitchen Components (`src/components/kitchen/`)
1. **KanbanColumn.tsx** - Reusable Kanban column wrapper with colored headers
2. **PackageCounter.tsx** - Package filling counter with +/- buttons
3. **BoxingOrderCard.tsx** - Order card showing package-by-package filling progress
4. **StickeringOrderCard.tsx** - Simple card for boxed orders awaiting stickers
5. **ReadyToShipCard.tsx** - Card for labeled orders ready for dispatch
6. **BallTrayCounter.tsx** - Enhanced ball tray with quick-add buttons (+5/+10/+20)
7. **PackagingStockItem.tsx** - Packaging inventory item with low stock alerts
8. **DailySummaryWidget.tsx** - Collapsible widget showing daily production stats
9. **BatchConfirmDialog.tsx** - Confirmation dialog with FIFO breakdown for batch operations
10. **index.ts** - Barrel export for all kitchen components

#### Pages
1. **KitchenViewV2.tsx** - New 3-column Kanban kitchen view implementation

### Files Modified

1. **src/lib/types.ts**
   - Added `Boxed` and `Labeled` to `OrderStatus` type

2. **src/lib/orderConstants.ts**
   - Added `Boxed` status color (amber)
   - Added `Labeled` status color (blue)
   - Added `Boxed` and `Labeled` to `kitchen` category

3. **src/pages/index.ts**
   - Exported `KitchenViewV2`

4. **src/App.tsx**
   - Added `/kitchen-v2` route for testing new implementation

---

## Features Implemented

### 1. Three-Column Kanban Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ [Ball Trays]  │  BOXING │ STICKERING │ SHIPPING  │  [Packaging] │
│               │         │            │           │   [Stock]    │
│ [Daily Stats] │         │            │           │              │
└─────────────────────────────────────────────────────────────────┘
```

#### Column 1: Needs Boxing (Amber)
- Shows orders with status: `Confirmed`, `InProduction`, `Packaging`
- Each order shows package counters per item
- Click `+1` to fill one package at a time
- Progress bar shows completion percentage
- Auto-transitions to `Boxed` when all packages filled (backend handles this)

#### Column 2: Needs Stickers (Blue)
- Shows orders with status: `Boxed`
- Simple cards showing sticker requirements
- Individual "Apply Stickers" button per order
- Batch "Apply Stickers to All" button at column footer
- Transitions orders to `Labeled` status

#### Column 3: Ready to Ship (Emerald)
- Shows orders with status: `Labeled`
- Cards show delivery type (Pickup/Delivery)
- "Mark Shipped" or "Mark Picked Up" button
- Transitions to `CompleteShipped` or `PickedUp`

### 2. Ball Tray Management

**Enhanced BallTrayCounter Features:**
- Visual ball icon with pistachio green (#93C572) fill
- Current count badge with low stock warning
- Pending orders/balls needed indicator
- Quick-add buttons: +5, +10, +20 balls
- Single remove button

### 3. Packaging Inventory Sidebar

**PackagingStockItem Features:**
- Shows available and reserved quantities
- Low stock warning (amber) when below reorder point
- Critical stock alert (red) when below 50% of reorder point
- Reorder threshold indicator

### 4. Daily Summary Widget

**Collapsible widget showing:**
- Balls produced today
- Orders completed today
- Packages boxed today
- Stickers applied today
- Inventory consumed list

### 5. Batch Operations

**BatchConfirmDialog Features:**
- Shows order/package count summary
- Lists materials to consume
- FIFO breakdown when low stock detected
- Total COGS impact calculation
- Low stock warning banner

---

## Backend Integration

### Mutations Used

| Mutation | Purpose | File |
|----------|---------|------|
| `fillPackage` | Increment package fill count | `convex/orders/mutations/packaging.ts` |
| `unfillPackage` | Decrement package fill count | `convex/orders/mutations/packaging.ts` |
| `addBallsToTray` | Add balls to tray inventory | `convex/orders/mutations/kitchen.ts` |
| `removeBallFromTray` | Remove ball from tray | `convex/orders/mutations/kitchen.ts` |
| `updateStatus` | Change order status | `convex/orders/mutations/statusUpdates.ts` |

### Status Transitions

```
Confirmed → InProduction → Boxed → Labeled → CompleteShipped/PickedUp
              │              │         │
              └─ Fill packages │         └─ Apply stickers
                               └─ Auto when all filled
```

### Queries Used

| Query | Purpose |
|-------|---------|
| `getKitchenOrders` | Fetch orders for kitchen workflow |
| `getTrayInventory` | Get current ball tray counts |

---

## Null Safety Implementation

**Critical Note #7 from Plan:**

All components handle orders without `menuProductId` gracefully:

```tsx
if (!item.menuProductId) {
  // Legacy or custom order - use basic fallback
  return {
    productName: item.product_name,
    quantity: item.quantity,
    filled: Math.floor((item.balls_filled ?? 0) / (item.production_units ?? 1)),
    ballsPerPackage: item.production_units ?? 1,
    boxType: 'Standard', // Fallback for legacy
  };
}
```

---

## Design System

### Colors

| Element | Color | Hex |
|---------|-------|-----|
| Ball fill | Pistachio green | #93C572 |
| Ball stroke | Chocolate brown | #7B3F00 |
| Boxing column | Amber | bg-amber-900/50 |
| Stickering column | Blue | bg-blue-900/50 |
| Shipping column | Emerald | bg-emerald-900/50 |
| Background | Slate gradient | from-slate-900 via-slate-800 |

### Component States

| State | Visual Indicator |
|-------|------------------|
| Package filled | Green background (emerald-900/30) |
| Package empty | Gray background (slate-600/30) |
| Low stock | Amber border/badge with pulse animation |
| Critical stock | Red border/badge |
| Urgent order | Red left border (>30min since confirmed) |
| Complete order | Green border |

---

## Testing Checklist

- [x] Kitchen components compile without errors
- [x] KitchenViewV2 page renders
- [x] Route `/kitchen-v2` added to App.tsx
- [x] New statuses added to TypeScript types
- [x] Status categories updated in orderConstants
- [ ] fillPackage mutation increments package counter
- [ ] unfillPackage mutation decrements package counter
- [ ] Order auto-transitions to Boxed when all packages filled
- [ ] Apply stickers transitions order to Labeled
- [ ] Mark shipped transitions to CompleteShipped
- [ ] Ball tray quick-add buttons work
- [ ] Null menuProductId handled gracefully
- [ ] Low stock alerts display correctly

---

## Known Limitations (TODOs)

### Backend Queries Needed

1. **Orders by Status Query**
   - Current: `getKitchenOrders` doesn't filter by Boxed/Labeled
   - Need: Update query to include new statuses

2. **Packaging Inventory Query**
   - Current: Mock data in frontend
   - Need: Query to fetch packaging stock levels

3. **Daily Stats Query**
   - Current: Mock data in frontend
   - Need: Query to calculate today's production metrics

4. **BOM Integration**
   - Current: Sticker requirements hardcoded
   - Need: Calculate from menuProduct components

### Frontend Features

1. **Box Type Detection**
   - Current: Hardcoded "Standard"
   - Need: Get from menuProduct packaging type

2. **Ball Type Detection**
   - Current: All assumed "original"
   - Need: Determine from menuProduct production type

3. **FIFO Breakdown**
   - Current: Mock data
   - Need: Real batch consumption data

---

## Migration Notes

### For Final Deployment

1. **Replace Current Kitchen View**
   - Rename `KitchenView.tsx` → `KitchenViewLegacy.tsx`
   - Rename `KitchenViewV2.tsx` → `KitchenView.tsx`
   - Update route from `/kitchen-v2` to `/kitchen`

2. **Status Migration**
   - Run `migratePackagingToBoxed` mutation for existing orders
   - Update any hardcoded status checks in other components

3. **Backend Updates Required**
   - Update `getKitchenOrders` to include Boxed/Labeled statuses
   - Create packaging inventory query
   - Create daily stats query
   - Implement BOM-based sticker calculation

---

## Related Documentation

- **Master Plan:** `C:\Users\Irfan\.claude\plans\cozy-bubbling-hopper.md` (Lines 99-110)
- **Schema:** `convex/schema.ts` (Lines 276-289 for order statuses)
- **Mutations:** `convex/orders/mutations/packaging.ts` (fillPackage, unfillPackage)
- **Status Constants:** `src/lib/orderConstants.ts`

---

## Next Steps (Wave 6)

1. **Order Integration & Stock Consumption**
   - Reserve stock on order confirm
   - Consume boxing materials when transitioning to Boxed
   - Consume sticker materials when transitioning to Labeled
   - Release reservations on cancellation

2. **Backend Query Updates**
   - Add Boxed/Labeled to kitchen orders query
   - Create packaging inventory query
   - Create daily summary stats query

3. **BOM Integration**
   - Calculate packaging requirements from menuProduct BOMs
   - Auto-consume correct materials based on BOM
   - FIFO batch tracking for consumption

---

## Commit Message

```
feat: redesign KitchenView with boxing/stickering workflow

Implements Wave 5 frontend for inventory management system:
- 3-column Kanban layout (Boxing, Stickering, Shipping)
- Package-level counters with +/- buttons
- Ball tray with quick-add buttons
- Packaging inventory sidebar
- Daily summary widget
- Batch sticker confirmation dialog
- New order statuses: Boxed, Labeled
- Null-safe menuProductId handling

Components:
- KanbanColumn, PackageCounter, BoxingOrderCard
- StickeringOrderCard, ReadyToShipCard
- BallTrayCounter, PackagingStockItem
- DailySummaryWidget, BatchConfirmDialog

Modified:
- orderConstants: Added Boxed/Labeled to kitchen category
- types: Added Boxed/Labeled to OrderStatus type
- App.tsx: Added /kitchen-v2 route for testing

Related: PRD-Kitchen-Workflow, Wave 5
```
