# Handover: BOM Schema Review Session

**Date:** 2026-02-06
**Branch:** `feature/inventory-management-system`
**Purpose:** Comprehensive BOM schema review using schema-architect agent

---

## Session Summary

A schema-architect agent reviewed the Unified BOM (Bill of Materials) system based on `docs/UNIFIED_BOM_WALKTHROUGH.md`. The review assessed schema quality, migration status, and provided actionable recommendations.

---

## BOM System Architecture

### Core Tables Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         UNIFIED COMPONENT TYPES                      │
│                         (componentTypes table)                       │
├───────────────────┬─────────────────────┬───────────────────────────┤
│    PRODUCTION     │  DIRECT PACKAGING   │    INDIRECT PACKAGING     │
│   (made to order) │  (auto-included)    │    (sold separately)      │
├───────────────────┼─────────────────────┼───────────────────────────┤
│ • Big Ball (45g)  │ • Long Box          │ • Brochure                │
│ • Mid Ball (80g)  │ • Single Box        │ • Shopping Bag            │
│                   │ • Wrapper           │                           │
│                   │ • Product Sticker   │                           │
├───────────────────┼─────────────────────┼───────────────────────────┤
│ trackInventory:   │ trackInventory:     │ trackInventory:           │
│     FALSE         │     TRUE            │     TRUE                  │
└───────────────────┴─────────────────────┴───────────────────────────┘
```

### Schema Tables

**1. componentTypes** (Unified Component Definitions)
```typescript
componentTypes: defineTable({
  code: v.string(),                    // Unique: "BIG_BALL", "LONG_BOX"
  name: v.string(),
  category: v.union(
    v.literal("production"),           // Made to order, no inventory
    v.literal("direct_packaging"),     // Auto-included in products
    v.literal("indirect_packaging")    // Sold separately
  ),
  unitCostIdr: v.number(),
  trackInventory: v.boolean(),         // false for production, true for packaging
  gramsPerUnit: v.optional(v.number()), // Only for production
  reorderPoint: v.optional(v.number()),
  reorderQuantity: v.optional(v.number()),
  isActive: v.boolean(),
})
  .index("by_code", ["code"])
  .index("by_category", ["category"])
  .index("by_active", ["isActive"])
```

**2. menuProductComponents** (Product BOM)
```typescript
menuProductComponents: defineTable({
  menuProductId: v.id("menuProducts"),
  componentTypeId: v.id("componentTypes"),                    // PRIMARY FK
  quantity: v.number(),
  sortOrder: v.number(),
  productionUnitTypeId: v.optional(v.id("productionUnitTypes")), // LEGACY
})
  .index("by_menuProduct", ["menuProductId"])
  .index("by_componentType", ["componentTypeId"])
```

**3. inventoryBatches** (FIFO Batch Tracking)
```typescript
inventoryBatches: defineTable({
  componentTypeId: v.id("componentTypes"),
  locationId: v.id("storageLocations"),
  purchaseDate: v.number(),            // For FIFO ordering
  quantityPurchased: v.number(),
  quantityRemaining: v.number(),
  quantityReserved: v.number(),        // Reserved for confirmed orders
  unitCostIdr: v.number(),
  totalCostIdr: v.number(),
  supplierName: v.optional(v.string()),
  expiryDate: v.optional(v.number()),
  status: v.union(v.literal("active"), v.literal("depleted"), v.literal("expired")),
})
  .index("by_fifo", ["componentTypeId", "locationId", "purchaseDate"])  // CRITICAL
  .index("by_component_location", ["componentTypeId", "locationId"])
  .index("by_status", ["status"])
```

**4. componentStock** (Aggregated Stock View)
```typescript
componentStock: defineTable({
  componentTypeId: v.id("componentTypes"),
  locationId: v.id("storageLocations"),
  totalStock: v.number(),              // Sum of quantityRemaining
  totalReserved: v.number(),           // Sum of quantityReserved
  weightedAvgCost: v.number(),         // Weighted average for reporting
})
  .index("by_component", ["componentTypeId"])
  .index("by_location", ["locationId"])
```

**5. componentTransactions** (Audit Trail)
```typescript
componentTransactions: defineTable({
  componentTypeId: v.id("componentTypes"),
  locationId: v.id("storageLocations"),
  batchId: v.optional(v.id("inventoryBatches")),
  transactionType: v.union(
    v.literal("receive"),
    v.literal("consume"),
    v.literal("reserve"),
    v.literal("unreserve"),
    v.literal("adjust"),
    v.literal("transfer_out"),
    v.literal("transfer_in"),
    v.literal("expire")
  ),
  quantity: v.number(),
  unitCostAtTime: v.number(),
  orderId: v.optional(v.id("orders")),
  referenceNote: v.optional(v.string()),
})
  .index("by_component", ["componentTypeId"])
  .index("by_order", ["orderId"])
  .index("by_batch", ["batchId"])
```

**6. orderComponentReservations** (Per-Order Reservations)
```typescript
orderComponentReservations: defineTable({
  orderId: v.id("orders"),
  componentTypeId: v.id("componentTypes"),
  locationId: v.id("storageLocations"),
  quantityReserved: v.number(),
  quantityConsumed: v.number(),
  status: v.union(v.literal("reserved"), v.literal("consumed"), v.literal("released")),
})
  .index("by_order", ["orderId"])
  .index("by_component_location", ["componentTypeId", "locationId"])
  .index("by_status", ["status"])
```

---

## Order-to-Inventory Workflow

### Complete Lifecycle

```
PHASE 1: PRODUCT DEFINITION
├─ MenuProductsManager → ProductForm → setComponents mutation
├─ Creates menuProductComponents records
└─ Example: "Original Triple 135g" = [3× Big Ball, 1× Long Box, 3× Wrapper, 1× Sticker]

PHASE 2: ORDER CREATION
├─ calculateComponentsForOrder() multiplies: (orderItem.quantity × component.quantity)
├─ Creates orderItemProduction records for kitchen tracking
└─ Example: 5 packages × 3 Big Balls = 15 balls needed

PHASE 3: ORDER CONFIRMED → STOCK RESERVATION
├─ reserveStockForOrderInternal() executes
├─ getPackagingComponentsForOrder() filters to trackInventory: true only
├─ FIFO reserves from oldest batches first
├─ Creates orderComponentReservations (status="reserved")
├─ Creates "reserve" transactions in audit trail
└─ CRITICAL: Production components NOT reserved (made to order)

PHASE 4: KITCHEN PRODUCTION (→InProduction)
├─ KitchenViewV2 - staff fills balls
├─ Updates orderItemProduction.unitsRemaining
└─ NO inventory changes (production is made to order)

PHASE 5: ALL PACKAGES FILLED (→Boxed)
├─ consumeBoxingMaterialsInternal() executes
├─ FIFO consumes: LONG_BOX, SINGLE_BOX, WRAPPER
├─ Updates batch.quantityRemaining
├─ Creates "consume" transactions with actual COGS
└─ Updates reservation status → "consumed"

PHASE 6: APPLY STICKERS (→Labeled)
├─ consumeStickerMaterialsInternal() executes
├─ FIFO consumes: PRODUCT_STICKER, QR_STICKER
└─ Stickers consumed separately from boxing materials

PHASE 7: SHIP (→CompleteShipped/PickedUp)
└─ No inventory changes (all already consumed)

CANCELLATION FLOW (Any status → Cancelled)
├─ releaseReservationInternal() executes
├─ FIFO unreserves from batches
├─ Creates "unreserve" transactions
└─ Stock becomes available for other orders
```

### Key Backend Functions

| Function | Location | Trigger |
|----------|----------|---------|
| `calculateComponentsForOrder` | `inventoryIntegration.ts` | Order creation |
| `getPackagingComponentsForOrder` | `inventoryIntegration.ts` | Filter tracked components |
| `reserveStockForOrderInternal` | `inventoryIntegration.ts` | Order → Confirmed |
| `consumeBoxingMaterialsInternal` | `inventoryIntegration.ts` | Order → Boxed |
| `consumeStickerMaterialsInternal` | `inventoryIntegration.ts` | Order → Labeled |
| `releaseReservationInternal` | `inventoryIntegration.ts` | Order → Cancelled |
| `consumeFromFIFO` | `inventory/fifo.ts` | Calculate consumption |
| `applyFIFOConsumption` | `inventory/fifo.ts` | Execute consumption |

---

## Schema Review Findings

### Overall Assessment: **8/10 - SOLID**

### Strengths

| Strength | Evidence |
|----------|----------|
| Excellent FIFO Index | `by_fifo` on `[componentTypeId, locationId, purchaseDate]` |
| Complete Audit Trail | `componentTransactions` captures all movements |
| Reservation Protection | Cannot delete batches with `quantityReserved > 0` |
| Clean Category Separation | `trackInventory` differentiates production vs packaging |
| Type-Safe Unions | Status fields use `v.union(v.literal(...))` |

### Issues Identified

| Issue | Severity | Impact |
|-------|----------|--------|
| Legacy `productionUnitTypeId` dual-FK | **Medium** | 10-20% code complexity |
| Hardcoded material lists | **Medium** | Extension difficulty |
| Cost insights N+1 query | Low | Performance at scale |
| Missing batch expiry alerts | Low | Operational gap |

### Recommended Actions

**Critical:**
1. Remove dual-FK acceptance from mutations
2. Add `consumptionStage` field to `componentTypes`:
   ```typescript
   consumptionStage: v.optional(v.union(
     v.literal("boxing"),    // Consumed when order → Boxed
     v.literal("labeling"),  // Consumed when order → Labeled
     v.literal("none")       // Production (not consumed)
   ))
   ```

**High:**
3. Create migration verification query
4. Add `getExpiringBatches` query
5. Update `docs/SCHEMA.md`

**Medium:**
6. Optimize cost insights query using `componentStock.weightedAvgCost`
7. Add default location uniqueness validation

---

## Files to Reference

| File | Purpose |
|------|---------|
| `docs/UNIFIED_BOM_WALKTHROUGH.md` | Complete system documentation |
| `convex/schema.ts` | All table definitions |
| `convex/componentTypes/` | Component CRUD |
| `convex/menuProductComponents/` | BOM management |
| `convex/inventory/` | Stock operations |
| `convex/orders/mutations/inventoryIntegration.ts` | Order-inventory bridge |
| `convex/inventory/fifo.ts` | FIFO logic |

---

## Migration Status

**Completed:**
- componentTypes table with 3 categories
- menuProductComponents.componentTypeId as primary FK
- All inventory tables (batches, stock, transactions, reservations)
- FIFO consumption logic
- Order-inventory integration

**Pending:**
- Remove legacy `productionUnitTypeId` field
- Remove dual-FK acceptance in mutations
- Update schema documentation

---

*Handover created: 2026-02-06*
*For new session: Start by reading this file and `docs/UNIFIED_BOM_WALKTHROUGH.md`*
