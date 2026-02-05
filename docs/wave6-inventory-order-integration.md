# Wave 6: Inventory Order Integration - Implementation Summary

**Date:** 2026-02-05
**Branch:** `feature/inventory-management-system`
**Commit:** 25de040

---

## Overview

Implemented order-inventory integration that automatically manages stock reservations and consumption throughout the order lifecycle. This completes Wave 6 of the Inventory Management System plan.

## What Was Built

### New File: `convex/orders/mutations/inventoryIntegration.ts` (663 lines)

Four main mutations that handle inventory operations during order state transitions:

#### 1. `reserveStockForOrder`
- **When:** Order transitions to "Confirmed"
- **What:** Reserves packaging components (not production) from available stock
- **How:** FIFO reservation from oldest batches first
- **Error:** Throws detailed shortage report if insufficient stock
- **Records:** Creates `orderComponentReservations` and `componentTransactions` (type: "reserve")

#### 2. `consumeBoxingMaterials`
- **When:** Order transitions to "Boxed"
- **What:** Consumes boxes, wrappers, ball paper, box stickers
- **How:** FIFO consumption from reserved batches
- **Records:** Updates batch quantities, creates transactions (type: "consume")
- **Aggregate:** Updates `componentStock` totals

#### 3. `consumeStickerMaterials`
- **When:** Order transitions to "Labeled"
- **What:** Consumes product stickers, QR stickers
- **How:** FIFO consumption from reserved batches
- **Records:** Updates batch quantities, creates transactions (type: "consume")
- **Aggregate:** Updates `componentStock` totals

#### 4. `releaseReservation`
- **When:** Order transitions to "Cancelled"
- **What:** Unreserves all components, returns stock to available
- **How:** FIFO unreservation (same order as reservation)
- **Records:** Creates transactions (type: "unreserve")
- **Aggregate:** Updates `componentStock` totals

### Updated File: `convex/orders/mutations/statusUpdates.ts`

Enhanced `updateStatus` mutation to call inventory functions:

```typescript
// Before: Just updated status
await ctx.db.patch(args.orderId, { status: newStatus });

// After: Integrated with inventory
if (newStatus === "Confirmed") {
  await reserveStockForOrder(...);
}
if (newStatus === "Boxed") {
  await consumeBoxingMaterials(...);
}
if (newStatus === "Labeled") {
  await consumeStickerMaterials(...);
}
if (newStatus === "Cancelled") {
  await releaseReservation(...);
}
```

**Error Handling:** Reverts status on reservation/consumption failure (except cancellation).

### Updated File: `convex/orders/mutations/index.ts`

Exported new inventory integration mutations for use in frontend.

---

## Technical Highlights

### Bridge Pattern for Schema Compatibility

**Problem:** Current schema uses `menuProductComponents.productionUnitTypeId` (referencing `productionUnitTypes`), but inventory system uses `componentTypes`.

**Solution:** Bridge function that maps by code:

```typescript
async function mapProductionUnitToComponent(
  ctx: MutationCtx,
  productionUnitTypeId: Id<"productionUnitTypes">
): Promise<Id<"componentTypes"> | null> {
  const productionUnit = await ctx.db.get(productionUnitTypeId);
  const componentType = await ctx.db
    .query("componentTypes")
    .withIndex("by_code", (q) => q.eq("code", productionUnit.code))
    .first();
  return componentType?._id ?? null;
}
```

**Future:** After Wave 4 migrates `menuProductComponents.componentTypeId`, this bridge can be removed.

### FIFO Reservation Logic

Reservations follow same FIFO order as consumption:

1. Query batches by `by_fifo` index (componentTypeId, locationId, purchaseDate)
2. Sort by purchaseDate (oldest first)
3. Reserve from oldest batches until quantity met
4. Update `batch.quantityReserved` for each batch
5. Create `componentTransactions` audit records

### Production vs Packaging Components

**Production Components** (category: "production"):
- `trackInventory: false`
- Made to order, not stocked
- **Skipped** during reservation (not in BOM for stock)

**Packaging Components** (category: "direct_packaging" or "indirect_packaging"):
- `trackInventory: true`
- Stocked in batches
- **Reserved** during confirmation
- **Consumed** during boxing/labeling

### Default Location Logic

If `locationId` not specified, uses Office (default location):

```typescript
const defaultLocation = await ctx.db
  .query("storageLocations")
  .withIndex("by_default", (q) => q.eq("isDefault", true))
  .first();
```

---

## Data Flow Example

### Order Lifecycle: 2× Original Triple 135g

**Product BOM:**
- 3× Mid Ball (production, trackInventory: false)
- 1× Long Box (direct_packaging, trackInventory: true)
- 3× Wrapper (direct_packaging, trackInventory: true)
- 1× Box Sticker (direct_packaging, trackInventory: true)
- 1× QR Sticker (direct_packaging, trackInventory: true)

**For 2 units:**
- 6× Mid Ball → **SKIP** (production)
- 2× Long Box → **RESERVE**
- 6× Wrapper → **RESERVE**
- 2× Box Sticker → **RESERVE**
- 2× QR Sticker → **RESERVE**

### Step 1: Confirm Order

```
Status: Draft → Confirmed
Action: reserveStockForOrder(orderId)
```

**Result:**
- `inventoryBatches`: quantityReserved +2 (Long Box), +6 (Wrapper), +2 (Box Sticker), +2 (QR Sticker)
- `orderComponentReservations`: 4 records created (status: "reserved")
- `componentTransactions`: 4 records (type: "reserve")
- `componentStock`: totalReserved updated

**If shortage:** Throws error with details:
```
Insufficient stock to reserve for order:
Long Box: need 2, have 1 (short 1)
Wrapper: need 6, have 4 (short 2)
```

### Step 2: Box Order

```
Status: Confirmed → Boxed
Action: consumeBoxingMaterials(orderId)
```

**Materials consumed:** Long Box, Wrapper, Box Sticker (NOT QR Sticker - that's for labeling)

**Result:**
- `inventoryBatches`: quantityRemaining -2, -6, -2 (FIFO from oldest)
- `orderComponentReservations`: 3 records (status: "consumed")
- `componentTransactions`: 3 records (type: "consume")
- `componentStock`: totalStock and totalReserved updated

### Step 3: Label Order

```
Status: Boxed → Labeled
Action: consumeStickerMaterials(orderId)
```

**Materials consumed:** QR Sticker (NOT box materials - already consumed)

**Result:**
- `inventoryBatches`: quantityRemaining -2 (QR Sticker)
- `orderComponentReservations`: 1 record (status: "consumed")
- `componentTransactions`: 1 record (type: "consume")
- `componentStock`: totalStock and totalReserved updated

### Step 4 (Alternative): Cancel Order

```
Status: Confirmed → Cancelled
Action: releaseReservation(orderId)
```

**Result:**
- `inventoryBatches`: quantityReserved -2, -6, -2, -2 (FIFO unreserve)
- `orderComponentReservations`: 4 records (status: "released")
- `componentTransactions`: 4 records (type: "unreserve")
- `componentStock`: totalReserved updated

---

## Verification Checklist

### Manual Testing (After Wave 4 Migration)

1. **Seed Data:**
   - Run `componentTypes/seed:seedAll` to create locations + production components
   - Create packaging components (Long Box, Wrapper, etc.)
   - Receive inventory batches via `inventory/mutations:receiveStock`

2. **Create Product:**
   - Add BOM to "Original Triple" with production + packaging components
   - Verify COGS auto-calculates from component costs

3. **Confirm Order:**
   - Create order for 2× Original Triple
   - Confirm order → verify packaging reserved (not production)
   - Check `orderComponentReservations` table
   - Check `componentStock.totalReserved` increased

4. **Box Order:**
   - Mark order as "Boxed"
   - Verify boxes/wrappers consumed (FIFO)
   - Verify stickers NOT consumed yet
   - Check `inventoryBatches.quantityRemaining` decreased

5. **Label Order:**
   - Mark order as "Labeled"
   - Verify stickers consumed
   - Check all reservations marked "consumed"

6. **Cancel Order:**
   - Create + confirm another order
   - Cancel order → verify reservations released
   - Check `componentStock.totalReserved` decreased

7. **Shortage Handling:**
   - Create order requiring 10 boxes
   - Stock only 5 boxes
   - Try to confirm → verify error shows shortage details

---

## Dependencies

### Requires Wave 4 (Blocked)

**Schema Migration:**
- Change `menuProductComponents.productionUnitTypeId` → `componentTypeId`
- Update `menuProductComponents` index: `by_component_type`

**After Migration:**
- Remove `mapProductionUnitToComponent` bridge function
- Use `componentTypeId` directly in BOM calculation

### Requires Wave 1 (Completed)

- `componentTypes` table ✓
- `inventoryBatches` table ✓
- `componentStock` table ✓
- `orderComponentReservations` table ✓
- `componentTransactions` table ✓

### Requires Wave 2 (Completed)

- `consumeFromFIFO` helper ✓
- `applyFIFOConsumption` helper ✓
- `updateComponentStock` helper ✓

---

## Future Enhancements

### After Wave 4 Migration

1. **Remove Bridge Pattern:** Use `componentTypeId` directly
2. **Enhanced BOM Display:** Show packaging breakdown in Order detail
3. **Stock Alerts:** Frontend notifications when confirming order with low stock
4. **Batch Tracking:** Display which batches consumed for each order (audit trail)

### Kitchen View Integration

1. **Stock Visibility:** Show packaging inventory in Kitchen View
2. **Low Stock Warnings:** Alert before boxing if materials running low
3. **Consumption Confirmation:** Show materials consumed when marking boxed/labeled

---

## Code Quality

### Type Safety

- All IDs properly typed: `Id<"orders">`, `Id<"componentTypes">`, etc.
- Helper interfaces for complex return types
- No `any` types used

### Error Handling

- Descriptive error messages with shortage details
- Status rollback on failure (transactional behavior)
- Graceful degradation for production-only orders

### Audit Trail

- All operations logged in `componentTransactions`
- Reservation status tracked: reserved → consumed/released
- Timestamps: createdAt, consumedAt

### Performance

- Batch operations minimize DB queries
- Indexes used: `by_order`, `by_fifo`, `by_component_location`
- Aggregate updates prevent expensive recalculations

---

## Files Changed

| File | Lines | Status |
|------|-------|--------|
| `convex/orders/mutations/inventoryIntegration.ts` | +663 | New |
| `convex/orders/mutations/statusUpdates.ts` | +74 | Modified |
| `convex/orders/mutations/index.ts` | +8 | Modified |

**Total:** +745 lines

---

## Next Steps

1. **Wave 4 Migration:** Update `menuProductComponents` FK to enable full functionality
2. **Frontend Integration:** Add inventory visibility to Order Manager and Kitchen View
3. **Testing:** Create test orders with various packaging configurations
4. **Documentation:** Update API reference with new mutation signatures

---

## Commit Details

```
commit 25de040
feat: integrate inventory with order lifecycle

Implements Wave 6 of Inventory Management System
```

**Branch:** `feature/inventory-management-system`
**Status:** Ready for testing after Wave 4 migration
**Build:** ✅ Type check passed
