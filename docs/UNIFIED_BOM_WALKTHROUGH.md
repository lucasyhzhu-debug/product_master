# Unified BOM System - End-to-End Walkthrough

**Date:** 2026-02-06
**Branch:** `feature/inventory-management-system`
**Status:** Post-Migration Cleanup Complete

---

## Overview

This document explains how the **Unified Bill of Materials (BOM)** system bridges:
1. **Product Definition** (Menu Products)
2. **Order Creation** (POS)
3. **Kitchen Production** (KitchenViewV2)
4. **Inventory Management** (Stock Reservation & FIFO Consumption)

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         UNIFIED COMPONENT TYPES                          │
│                         (componentTypes table)                           │
├───────────────────┬─────────────────────┬───────────────────────────────┤
│    PRODUCTION     │  DIRECT PACKAGING   │    INDIRECT PACKAGING         │
│   (made to order) │  (auto-included)    │    (sold separately)          │
├───────────────────┼─────────────────────┼───────────────────────────────┤
│ • Big Ball (45g)  │ • Long Box          │ • Brochure                    │
│ • Mid Ball (80g)  │ • Single Box        │ • Shopping Bag                │
│                   │ • Wrapper           │                               │
│                   │ • Product Sticker   │                               │
├───────────────────┼─────────────────────┼───────────────────────────────┤
│ trackInventory:   │ trackInventory:     │ trackInventory:               │
│     FALSE         │     TRUE            │     TRUE                      │
└───────────────────┴─────────────────────┴───────────────────────────────┘
```

---

## Schema Changes

### Before Migration (Legacy)

```typescript
// menuProductComponents (old)
{
  menuProductId: v.id("menuProducts"),
  productionUnitTypeId: v.id("productionUnitTypes"), // REQUIRED
  quantity: v.number(),
  sortOrder: v.number(),
}
```

### After Migration (Unified BOM)

```typescript
// menuProductComponents (new)
{
  menuProductId: v.id("menuProducts"),
  componentTypeId: v.id("componentTypes"),           // REQUIRED - primary FK
  quantity: v.number(),
  sortOrder: v.number(),
  productionUnitTypeId: v.optional(v.id("productionUnitTypes")), // Legacy, optional
}
```

**Key Tables Added:**
- `componentTypes` - Unified component definitions (production + packaging)
- `storageLocations` - Multi-location tracking (Kitchen, Office, Venue)
- `inventoryBatches` - FIFO batch tracking with purchase history
- `componentStock` - Aggregated stock levels per location
- `componentTransactions` - Full audit trail
- `orderComponentReservations` - Stock reservations per order

---

## End-to-End Flow

### Step 1: Product Definition (BOM Setup)

**Location:** `src/pages/MenuProductsManager.tsx` → `ProductForm.tsx`

**Backend:** `convex/menuProductComponents/mutations.ts`

When you define a product, you specify its components:

```typescript
// Example: "Original Triple 135g"
menuProductComponents: [
  { componentTypeId: "ct_big_ball", quantity: 3 },    // 3× Big Ball
  { componentTypeId: "ct_long_box", quantity: 1 },    // 1× Long Box
  { componentTypeId: "ct_wrapper", quantity: 3 },     // 3× Wrapper
  { componentTypeId: "ct_sticker", quantity: 1 },     // 1× Sticker
]
```

**UI Flow:**
1. Navigate to `/menu-products`
2. Click product → Opens `ProductForm` sheet
3. Add components from dropdown (shows all componentTypes)
4. Save → BOM stored in `menuProductComponents` table
5. `cachedProductionSummary` updated (e.g., "3 Big Ball, 1 Long Box")

---

### Step 2: Order Creation

**Location:** `src/pages/OrderManager.tsx` → Order form dialogs

**Backend:** `convex/orders/mutations/orderCrud.ts`

When a customer orders products:

```typescript
// Order for 5× "Original Triple 135g"
orderItems: [
  {
    menuProductId: "mp_123",
    quantity: 5,
    pricePerUnit: 50000,
    subtotal: 250000
  }
]
```

**BOM Calculation (automatic):**
```
5 packages × 3 Big Balls = 15 balls (production)
5 packages × 1 Long Box  = 5 boxes (packaging)
5 packages × 3 Wrappers  = 15 wrappers (packaging)
5 packages × 1 Sticker   = 5 stickers (packaging)
```

**Production Records Created:**
```typescript
// orderItemProduction table
{
  orderId: "ord_456",
  orderItemId: "oi_789",
  productionUnitTypeId: "ct_big_ball",
  unitsRequired: 15,
  unitsRemaining: 15  // Tracks kitchen progress
}
```

---

### Step 3: Order Confirmed → Stock Reservation

**Location:** Order detail page → Status update

**Backend:** `convex/orders/mutations/inventoryIntegration.ts`

**Function:** `reserveStockForOrderInternal()`

When order status changes to "Confirmed":

1. **Get packaging components** (production excluded - made to order)
2. **Check availability** per location
3. **Reserve from oldest batches first** (FIFO)
4. **Create reservation records**

```typescript
// orderComponentReservations table
[
  {
    orderId: "ord_456",
    componentTypeId: "ct_long_box",
    locationId: "loc_office",
    quantityReserved: 5,
    quantityConsumed: 0,
    status: "reserved"
  },
  // ... similar for wrappers, stickers
]
```

**inventoryBatches updated:**
```typescript
{
  componentTypeId: "ct_long_box",
  quantityRemaining: 80,
  quantityReserved: 5  // ← Reserved for this order
}
```

**componentStock updated:**
```typescript
{
  componentTypeId: "ct_long_box",
  totalStock: 130,
  totalReserved: 5,  // ← Shows in UI
  availableStock: 125
}
```

---

### Step 4: Kitchen Production (KitchenViewV2)

**Location:** `src/pages/KitchenViewV2.tsx`

**Components:**
- `BoxingOrderCard.tsx` - Orders in boxing stage
- `StickeringOrderCard.tsx` - Orders ready for stickers
- `ReadyToShipCard.tsx` - Completed orders
- `BallTrayCounter.tsx` - Ball inventory (not tracked)
- `PackagingStockItem.tsx` - Real-time packaging levels

**UI Layout:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  Ball Tray: [+5] [+10] [+20]  │  Big: 15   Mid: 0                       │
├───────────────────┬───────────────────┬─────────────────────────────────┤
│     BOXING        │    STICKERING     │       READY TO SHIP             │
├───────────────────┼───────────────────┼─────────────────────────────────┤
│ Order #0206-001   │                   │                                 │
│ 5× Original Triple│                   │                                 │
│ Package 1/5       │                   │                                 │
│ [0/3 balls]       │                   │                                 │
│ [+1] [Fill All]   │                   │                                 │
└───────────────────┴───────────────────┴─────────────────────────────────┘
│                                                                         │
│  Packaging Stock Sidebar:                                               │
│  → Long Box: 125 avail (5 reserved) ✅                                  │
│  → Wrapper: 485 avail (15 reserved) ✅                                  │
│  → Sticker: 95 avail (5 reserved) ⚠️ LOW                                │
└─────────────────────────────────────────────────────────────────────────┘
```

**Kitchen Workflow:**
1. **Fill packages:** Click [+1] to add ball → `unitsRemaining` decreases
2. **Package complete:** When package has all balls (e.g., 3/3)
3. **All packages done:** Order auto-transitions to "Boxed"

---

### Step 5: All Packages Filled → "Boxed" (Stock Consumption)

**Backend:** `convex/orders/mutations/inventoryIntegration.ts`

**Function:** `consumeBoxingMaterialsInternal()`

When all packages are filled:

1. Order status → "Boxed"
2. **Consume boxing materials via FIFO:**
   - Long Box (oldest batch first)
   - Wrapper (oldest batch first)

```typescript
// componentTransactions table (new records)
{
  componentTypeId: "ct_long_box",
  batchId: "batch_001",          // Oldest batch
  transactionType: "consume",
  quantity: 5,
  unitCostAtTime: 400,           // Cost at consumption time
  orderId: "ord_456",
  referenceNote: "Consumed for boxing order 0206-001"
}
```

**inventoryBatches updated:**
```typescript
{
  _id: "batch_001",
  quantityRemaining: 75,  // Was 80, consumed 5
  quantityReserved: 0     // Released (now consumed)
}
```

**orderComponentReservations updated:**
```typescript
{
  orderId: "ord_456",
  componentTypeId: "ct_long_box",
  quantityReserved: 5,
  quantityConsumed: 5,   // ← Marked consumed
  status: "consumed"     // ← Status changed
}
```

---

### Step 6: Apply Stickers → "Labeled"

**Location:** KitchenViewV2 → Stickering column

**Backend:** `consumeStickerMaterialsInternal()`

1. Staff clicks "Apply Stickers" button
2. Order status → "Labeled"
3. **Consume stickers via FIFO**

```typescript
// componentTransactions table
{
  componentTypeId: "ct_sticker",
  transactionType: "consume",
  quantity: 5,
  orderId: "ord_456",
  referenceNote: "Consumed for labeling order 0206-001"
}
```

---

### Step 7: Ship Order

**Location:** KitchenViewV2 → Ready to Ship column

1. Staff clicks "Mark Shipped"
2. Order status → "Shipped"
3. Order complete (no more inventory changes)

---

### Cancellation Flow

**Function:** `releaseReservationInternal()`

If order is cancelled after confirmation:

1. All reservations released
2. `quantityReserved` returned to batches
3. Transaction records created with type "unreserve"
4. Stock becomes available for other orders

---

## FIFO Cost Tracking

**Why FIFO matters for COGS:**

```typescript
// Example: Two batches of Long Box at different prices
Batch 1: 100 boxes @ Rp 400 (purchased Jan 15)
Batch 2:  50 boxes @ Rp 500 (purchased Feb 01)

// Order needs 5 boxes
// FIFO consumes from Batch 1 first:
COGS = 5 × Rp 400 = Rp 2,000  ✓ (accurate)

// If we used LIFO (wrong):
COGS = 5 × Rp 500 = Rp 2,500  ✗ (overstated)
```

**Weighted Average Cost:**
```typescript
// componentStock table
{
  componentTypeId: "ct_long_box",
  totalStock: 150,
  weightedAvgCost: 433.33  // (100×400 + 50×500) / 150
}
```

---

## UI Components Reference

### Inventory Management

| Component | Location | Purpose |
|-----------|----------|---------|
| `InventoryManager.tsx` | `/inventory` | Main inventory dashboard |
| `ComponentTypeRow.tsx` | Inventory page | Row per component type |
| `BatchCard.tsx` | Inventory page | Individual batch details |
| `ReceiveStockDialog.tsx` | Inventory page | Add new batch |
| `LowStockAlertsBanner.tsx` | Dashboard | Top 3 low stock alerts |

### Kitchen Workflow

| Component | Location | Purpose |
|-----------|----------|---------|
| `KitchenViewV2.tsx` | `/kitchen-v2` | 3-column Kanban board |
| `KanbanColumn.tsx` | Kitchen page | Column container |
| `BoxingOrderCard.tsx` | Kitchen page | Order card in boxing |
| `StickeringOrderCard.tsx` | Kitchen page | Order card in stickering |
| `ReadyToShipCard.tsx` | Kitchen page | Completed order card |
| `BallTrayCounter.tsx` | Kitchen page | Production ball inventory |
| `PackagingStockItem.tsx` | Kitchen sidebar | Stock level per component |
| `DailySummaryWidget.tsx` | Kitchen page | Daily production stats |

### Product Management

| Component | Location | Purpose |
|-----------|----------|---------|
| `ProductForm.tsx` | Menu Products | Product editor with BOM |
| `useMenuProductComponents.ts` | Hook | Fetch/manage BOM |
| `useComponentTypes.ts` | Hook | Fetch component types |

---

## Backend Functions Reference

### Inventory Integration (`convex/orders/mutations/inventoryIntegration.ts`)

| Function | Trigger | Action |
|----------|---------|--------|
| `reserveStockForOrderInternal` | Order → Confirmed | Reserve packaging stock (FIFO) |
| `consumeBoxingMaterialsInternal` | Order → Boxed | Consume boxes, wrappers |
| `consumeStickerMaterialsInternal` | Order → Labeled | Consume stickers |
| `releaseReservationInternal` | Order → Cancelled | Release all reservations |

### BOM Calculations

| Function | Location | Purpose |
|----------|----------|---------|
| `calculateComponentsForOrder` | inventoryIntegration.ts | Get total components for order |
| `getPackagingComponentsForOrder` | inventoryIntegration.ts | Filter to tracked components |
| `calculateUnitCostFromComponentTypes` | menuProducts/mutations.ts | COGS calculation with breakdown |

### FIFO Logic (`convex/inventory/fifo.ts`)

| Function | Purpose |
|----------|---------|
| `consumeFromFIFO` | Calculate which batches to consume |
| `applyFIFOConsumption` | Execute consumption and log transactions |

---

## Key Tables Summary

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `componentTypes` | Unified component definitions | code, name, category, unitCostIdr, trackInventory |
| `menuProductComponents` | Product BOM | menuProductId, componentTypeId, quantity |
| `inventoryBatches` | FIFO batch tracking | componentTypeId, quantityRemaining, quantityReserved |
| `componentStock` | Aggregated stock view | totalStock, totalReserved, weightedAvgCost |
| `componentTransactions` | Audit trail | transactionType, quantity, orderId |
| `orderComponentReservations` | Per-order reservations | quantityReserved, quantityConsumed, status |

---

## Migration Cleanup (Completed)

**Changes Made:**

1. **inventoryIntegration.ts:**
   - Removed `mapProductionUnitToComponent()` bridge function
   - `calculateComponentsForOrder()` now uses `componentTypeId` directly

2. **menuProducts/mutations.ts:**
   - `calculateUnitCostFromComponents()` marked as @deprecated
   - `calculateUnitCostFromComponentTypes()` exported for reuse
   - `updateCachedProductionSummary()` simplified (no fallback)

3. **menuProductComponents/mutations.ts:**
   - `create()` accepts both `componentTypeId` and legacy `productionUnitTypeId`
   - `update()` accepts both
   - `setComponents()` accepts both

4. **menuProductComponents/queries.ts:**
   - Returns both `componentType` and `productionUnitType` for backward compat
   - `productionUnitType` marked as @deprecated

---

## Next Steps (Optional)

1. **Update Frontend Forms:** Switch to using `componentTypeId` directly
2. **Remove Legacy Fields:** Once frontend migrated, remove `productionUnitTypeId`
3. **Deprecate `productionUnitTypes` Table:** All logic now uses `componentTypes`

---

*Document generated: 2026-02-06*
*Branch: feature/inventory-management-system*
