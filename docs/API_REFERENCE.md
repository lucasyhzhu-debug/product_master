# Convex Functions Reference

> **Purpose:** Complete Convex queries and mutations documentation for Frollie Recipe Master.
> **When to read:** Before implementing or modifying backend functions.

## Table of Contents
- [Overview](#overview)
- [Queries (Read Operations)](#queries-read-operations)
- [Mutations (Write Operations)](#mutations-write-operations)
- [Response Patterns](#response-patterns)
- [Error Handling](#error-handling)

---

## Overview

The backend is built with Convex, a real-time serverless database. All functions are defined in the `convex/` directory and are automatically available to the frontend via the generated `api` object.

**Function Types:**
- **Queries** — Read-only, reactive (auto-update when data changes)
- **Mutations** — Write operations, transactional

**Frontend Usage:**
```typescript
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

// Query (reactive)
const recipes = useQuery(api.recipes.list);

// Mutation
const createRecipe = useMutation(api.recipes.create);
await createRecipe({ name: "New Recipe", ... });
```

---

## Queries (Read Operations)

### Dashboard
```typescript
// convex/dashboard/queries.ts
dashboard.getStats()                    // Dashboard statistics
```

### Ingredients
```typescript
// convex/ingredients/queries.ts
ingredients.list()                      // List all with costs
ingredients.getById({ id })             // Get single ingredient
```

### Packaging Materials
```typescript
// convex/materials/queries.ts
materials.list()                        // List all with costs
materials.getById({ id })               // Get single material
```

### Tags
```typescript
// convex/tags/queries.ts
tags.list()                             // List all tags
```

### Menu Products
```typescript
// convex/menuProducts/queries.ts
menuProducts.list({ activeOnly? })      // List all menu products (optional filter)
menuProducts.get({ id })                // Get single menu product by ID
menuProducts.getByCode({ code })        // Get by product code
menuProducts.listPosProducts()          // PRD-8: Get products in POS slots 1-4 (sorted by slot)
menuProducts.listLegacyProducts()       // PRD-8: Get products not on POS (posSlot undefined)
```

### Recipes
```typescript
// convex/recipes/queries.ts
recipes.list()                          // List all with latest version info
recipes.listReusable()                  // List reusable components only
recipes.getById({ id })                 // Get recipe with all versions
recipes.getVersion({ recipeId, versionNumber }) // Get specific version with components
```

### Packaging
```typescript
// convex/packaging/queries.ts
packaging.list()                        // List all with latest version info
packaging.getById({ id })               // Get packaging with all versions
packaging.getVersion({ packagingRecipeId, versionNumber }) // Get specific version
```

### Products
```typescript
// convex/products/queries.ts
products.list()                         // List with COGS summaries
products.getById({ id })                // Get product with all versions
products.getVersion({ productId, versionNumber }) // Get version with COGS breakdown
```

### Customers
```typescript
// convex/customers/queries.ts
customers.list()                        // List all customers
customers.search({ query })             // Search by name/phone
customers.getById({ id })               // Get single customer
```

### Orders
```typescript
// convex/orders/queries.ts
orders.list({ status?, channel?, dueDateFrom?, dueDateTo? }) // List with filters
orders.getById({ id })                  // Get detail with items and WhatsApp text
orders.getProductionReport({ dateFrom, dateTo }) // Production report grouped by date
orders.getProductSuggestions()          // Distinct products from history
orders.getSellerSuggestions()           // Distinct sold_by from history

// Phase 14: Kanban & Audit Trail
orders.queries.listForKanban({})        // All active orders grouped by 6 Kanban columns
orders.queries.getAuditTrail({ orderId }) // Status change events enriched with user names
orders.queries.searchCustomers({ query }) // Debounced customer search for autocomplete
```

### Order Status Transitions (Phase 14)
```typescript
// convex/orders/mutations/statusUpdates.ts
orders.mutations.statusUpdates.moveForward({ orderId, token })              // Move order forward in Kanban workflow
orders.mutations.statusUpdates.moveBackward({ orderId, targetStatus, reason?, token }) // Move backward with optional reason
orders.mutations.statusUpdates.expediteOrder({ orderId, token })            // Manual kitchen entry (PaymentReceived -> BeingPrepared)

// convex/orders/mutations/orderCrud.ts
orders.mutations.orderCrud.submitOrder({ orderId, token })                  // Draft -> AwaitingPayment
orders.mutations.orderCrud.copyFromCancelled({ orderId, token })            // Create new Draft from Cancelled order
```

### Kitchen View Queries (PRD-1)
```typescript
// convex/orders/queries.ts
orders.getKitchenOrders()               // Active orders (Confirmed→Labeled) with ball counts, priority sorted
orders.getKitchenStats()                // Dashboard stats: balls needed/completed, order counts
orders.getCompletedToday()              // Orders completed since midnight
```

**getKitchenOrders Response:**
```typescript
{
  _id: Id<"orders">;
  orderNumber: string;
  customerName: string;
  dueDate: number | null;
  status: "Draft" | "Confirmed" | "InProduction" | "Packaging" | "Boxed" | "Labeled" | "WaitingShipment" | "WaitingPickup";
  items: Doc<"orderItems">[];
  bigBallsNeeded: number;    // Sum of productionUnits for original type
  midBallsNeeded: number;    // Sum of productionUnits for bite_sized type
}[]
// Priority: Active (Confirmed/InProduction/Packaging) → Post-production (Boxed/Labeled) → Draft → Waiting
// Within priority: dueDate ASC → creationTime ASC
```

**getKitchenStats Response:**
```typescript
{
  bigBallsNeeded: number;       // Pending orders total
  bigBallsCompleted: number;    // Since midnight
  midBallsNeeded: number;
  midBallsCompleted: number;
  ordersPending: number;        // Count of Confirmed orders
  ordersCompletedToday: number; // Count since midnight
}
```

### Kitchen V3: Production Pipeline Queries
```typescript
// convex/productionCounts/queries.ts
productionCounts.queries.getAll()                      // All menu products with boxed/stickered/packed + derived availability
productionCounts.queries.getByMenuProduct({ menuProductId }) // Single product counts

// convex/productionTargets/queries.ts
productionTargets.queries.getByDate({ date })          // Raw targets for a date (YYYY-MM-DD)
productionTargets.queries.getProductionSummary({ date }) // Enriched targets with unit type names + effectiveTarget

// convex/productionLog/queries.ts
productionLog.queries.getRecent({ limit })             // Recent log entries (desc), enriched with product name
productionLog.queries.getByMenuProduct({ menuProductId }) // Log entries for a specific product
productionLog.queries.getDailySummary({ date })        // Aggregated totals by product × action for a date

// convex/orders/kitchenQueries.ts
orders.kitchenQueries.getKitchenPackingOrders()        // Packing-ready orders with product items + packaging materials
```

**getAll Response (productionCounts):**
```typescript
[{
  menuProductId: Id<"menuProducts">;
  menuProductName: string;
  menuProductCode: string;
  boxed: number;
  stickered: number;
  packed: number;
  availableForStickering: number;  // boxed - stickered
  availableForPacking: number;     // stickered - packed
  lastResetAt?: number;
  lastResetBy?: string;
}]
```

**getProductionSummary Response:**
```typescript
[{
  ...productionTargets fields,
  unitTypeName: string;        // e.g., "Big Ball (80g)"
  unitTypeCode: string;        // e.g., "BIG_BALL"
  effectiveTarget: number;     // autoTargetQuantity + (manualOverride ?? 0)
}]
```

**getKitchenPackingOrders Response:**
```typescript
[{
  _id: Id<"orders">;
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  status: string;
  deliveryType?: string;
  dueDate?: number;
  productItems: [{
    _id: Id<"orderItems">;
    productName: string;
    productVariant?: string;
    quantity: number;
    menuProductId?: Id<"menuProducts">;
    packageStatus: string;       // "empty" | "filling" | "filled" | "packed"
    isPacked: boolean;
    canPack: boolean;            // availableForPacking >= quantity
    availableForPacking: number;
  }];
  packagingMaterials: [{
    componentTypeId: string;
    componentName: string;
    quantityNeeded: number;
  }];
  allProductsPacked: boolean;
  canMarkReady: boolean;         // true when allProductsPacked
}]
// Sorted by dueDate ASC, then orderDate ASC
```

### WhatsApp Templates (PRD-0)
```typescript
// convex/orders/whatsapp.ts
orders.whatsapp.getMessage({ orderId, template })    // Get formatted message
orders.whatsapp.getOrderTemplate()                   // Clean order template for copy/paste
orders.whatsapp.markMessageSent({ orderId, template, sentBy, messageContent? })
orders.whatsapp.getMessageHistory({ orderId })       // Sent message audit trail
```

**Template Types:**
- `payment_request` - Bank transfer details
- `production_started` - Production notification
- `delivery_complete` - Delivery confirmation
- `receipt` - Order receipt
- `shipping` - Shipping notification
- `pickup_ready` - Pickup notification

**markMessageSent Response:**
```typescript
{
  alreadySent: boolean;       // True if sent within 5-minute window
  lastSentAt?: number;        // Timestamp of last send
  lastSentBy?: string;        // User who last sent
}
```

### Kitchen V3: Production Pipeline Mutations (Auth Required: kitchen, manager, admin)
```typescript
// convex/orders/mutations/kitchen.ts
orders.mutations.index.boxProducts({ token, menuProductId, quantity })
  // Box products: deduct balls from tray, consume boxing-stage FIFO, increment boxed count
  // quantity > 0 = box, quantity < 0 = undo (unbox)

orders.mutations.index.stickerProducts({ token, menuProductId, quantity })
  // Sticker products: validate vs boxed count, consume labeling-stage FIFO, increment stickered
  // quantity > 0 = sticker, quantity < 0 = undo (unsticker)

orders.mutations.index.togglePackOrderLineItem({ token, orderId, orderItemId })
  // Toggle pack/unpack on a single order line item
  // Pack: validates availableForPacking >= item.quantity, sets packageStatus="packed"
  // Unpack: reverts to "filled", decrements packed count

orders.mutations.index.markOrderReady({ token, orderId })
  // Validates all product items are packed
  // Consumes "none"-stage packaging (outer boxes, inserts) from FIFO
  // Transitions order to WaitingPickup (pickup) or WaitingShipment (delivery)
```

**boxProducts Behavior:**
1. Looks up menu product's production components (balls)
2. Deducts `comp.quantity × args.quantity` balls from kitchen tray
3. Consumes boxing-stage packaging from FIFO inventory
4. Increments `productionCounts.boxed`
5. Logs to `productionLog` (action: "box" or "unbox")

**togglePackOrderLineItem Response:**
```typescript
{ packed: boolean }  // true = just packed, false = just unpacked
```

### Production Counts Mutations (Auth Required: manager, admin)
```typescript
// convex/productionCounts/mutations.ts
productionCounts.mutations.resetCounts({ token, menuProductId? })
  // Reset production counts to zero
  // If menuProductId provided: resets only that product
  // Otherwise: resets ALL products' counts
  // Sets lastResetAt and lastResetBy for audit
```

**resetCounts Response:**
```typescript
{ reset: number }  // Number of products reset
```

### K3 Mart Cockpit (Phase 16)

#### Queries
```typescript
// convex/k3martCockpit/queries.ts
k3martCockpit.queries.getWeeklyDispatchPlans({ weekNumber })
  // Outlet-first weekly dispatch plans with product sub-rows, stock, pricing, auto-suggest
  // Hidden products (isHidden on restockTargets) are filtered out
  // Returns: { outlets: [{ outletId, outletName, isActive, products: [{ menuProductId, productName,
  //   externalProductCode, price, currentStock, avgDailySales }] }],
  //   plans: Record<string, { plannedQty, suggestedQty, status }>,
  //   weekDates: string[], dayTypes: Record<string, string> }

k3martCockpit.queries.getOutletSettings()
  // Per-outlet product visibility, custom pricing, and restock targets
  // Returns: { outlets: [{ outletId, outletName, products: [{ productKey, menuProductId,
  //   productName, customPrice?, isHidden?, weekdayTarget, weekendTarget }] }] }

k3martCockpit.queries.getOutletStockSummary({ date })
  // Today's stock summary per outlet with product breakdown
k3martCockpit.queries.getProductionReadiness({ date })
  // Production readiness with deficit detection (stickered vs planned)
k3martCockpit.queries.getInventorySources()
  // Office, Goldfinch, K3Mart total stock by product
k3martCockpit.queries.getStockMovementHistory({ outletId, limit? })
  // Stock movement history per outlet with status badges
```

#### Mutations (Auth Required: manager, admin)
```typescript
// convex/k3martCockpit/mutations.ts
k3martCockpit.mutations.saveWeeklyDispatchPlan({ plans: [...] })
  // Batch upsert dispatch plans (auto-save on blur from planner cells)

k3martCockpit.mutations.confirmDayPlan({ date })
  // Confirms all draft plans for a date, computes kitchen deltas,
  // pushes to productionProductTargets (source="consignment"),
  // recomputes ball totals into productionTargets.manualOverride
  // Returns: { confirmedCount, kitchenDeltas: [{ menuProductId, kitchenOrderQty, apiStockInQty }] }

k3martCockpit.mutations.copyLastWeek({ targetWeekNumber })
  // Duplicates previous week's plans as drafts (+7 day shift)
  // Skips slots where plan already exists in target week
  // Returns: { copiedCount }

k3martCockpit.mutations.saveOutletSettings({ outletId, products: [...] })
  // Upserts restockTargets with customPrice, isHidden, weekday/weekendTarget
  // Price sanity check: customPrice must be > 0 if provided

k3martCockpit.mutations.toggleOutletActive({ outletId, isActive })
  // Toggle outlet active/inactive (admin only)
```

### K3 Mart Kitchen

#### Queries
```typescript
// convex/k3martKitchen/queries.ts
k3martKitchen.queries.getK3MartKitchenSummary({ date })  // Virtual daily summary for kitchen view
// Combines: consignment targets, outlet stock snapshots, today's K3 Mart sales, product mappings
// Returns: { items: [{ menuProductId, productName, consignmentTarget, totalOutletStock,
//   totalSoldToday, gapToTarget, outletBreakdown: [{ outletName, stock, soldToday }] }],
//   lastSyncAt, totalOutlets, syncStatus }
```

### GoFood Depot (Goldfinch)

#### Queries
```typescript
// convex/gofoodDepot/queries.ts
gofoodDepot.queries.getDepotStock()               // All depot stock records, enriched with product names
gofoodDepot.queries.getGoFoodDailyOrder({ date })  // Virtual daily order assembled from targets + depot + shipments + sales
gofoodDepot.queries.getTodayShipments({ date })    // Today's shipments, enriched with product names
gofoodDepot.queries.getGoldfinchStickerInventory() // Labeling-stage sticker inventory at Goldfinch
gofoodDepot.queries.getDepotFreshness({            // Freshness info for a product's depot stock
  menuProductId, lookbackDays?
})
```

**getGoFoodDailyOrder Response:**
```typescript
{
  orderNumber: string;      // "GF-MMDD" format
  customerName: "GoFood Depot";
  date: string;
  items: Array<{
    menuProductId: Id<"menuProducts">;
    productName: string;
    productCode: string;
    targetQty: number;       // From productionProductTargets (source="gofood")
    existingAtDepot: number; // Current boxes at Goldfinch
    toShipToday: number;     // max(0, target - existing)
    shippedToday: number;    // Already shipped today
    soldToday: number;       // Sold via GoFood today
    currentDepotStock: number;
    stickerDeficit: number;
  }>;
  lastSyncAt?: number;
  lastSyncStatus?: string;
} | null  // null when no GoFood targets for the date
```

**getDepotFreshness Response:**
```typescript
{
  currentQuantity: number;
  ageBreakdown: Array<{ date: string; quantity: number; ageDays: number }>;
  freshness: "fresh" | "day_old" | "aging";
  maxAgeDays: number;
  today: string;
}
```

#### Mutations (Auth Required: kitchen, order_staff, manager, admin)
```typescript
// convex/gofoodDepot/mutations.ts
gofoodDepot.mutations.recordShipment({
  token, items: Array<{
    menuProductId: Id<"menuProducts">,
    quantity: number,
    stickerTransfers?: Array<{ componentTypeId: Id<"componentTypes">, quantity: number }>
  }>
})
  // Records shipment from Office to Goldfinch
  // 1. Increments gofoodDepotStock.quantity
  // 2. Inserts gofoodDepotShipments audit record
  // 3. Increments productionCounts.shippedToGoldfinch
  // 4. Transfers stickers from Office to Goldfinch via FIFO (if stickerTransfers provided)
  // Returns: { totalBoxes, totalStickers }
```

#### Mutations (Auth Required: manager, admin)
```typescript
gofoodDepot.mutations.adjustDepotStock({
  token, menuProductId, newQuantity: number, reason: string
})
  // Manual depot stock adjustment for physical count corrections
  // Returns: { success: true }
```

#### Internal Mutations (server-only, not callable from frontend)
```typescript
gofoodDepot.mutations.processSyncSales({
  items: Array<{ menuProductId: Id<"menuProducts">, quantity: number }>
})
  // Batch sale processing from GoBiz sync (Phase C)
  // 1. Decrements gofoodDepotStock.quantity (can go negative = debt)
  // 2. Consumes labeling-stage stickers from Goldfinch FIFO (deficit-tolerant)
  // 3. Increments productionCounts.stickered
  // 4. Writes productionLog entries (action="sticker", note="auto:gobiz-sale")
  // Returns: { processed, deficits }

gofoodDepot.mutations.recordSale({
  menuProductId, quantity: number
})
  // Single sale for manual testing/debugging
  // Returns: { success: true }
```

### Vouchers
```typescript
// convex/vouchers/queries.ts
vouchers.list()                         // List all vouchers
vouchers.getById({ id })                // Get single voucher
vouchers.validateVoucher({             // Validate and calculate discount
  code: string,
  customerId?: Id<"customers">,
  orderTotal: number
})
```

**validateVoucher Response:**
```typescript
{
  isValid: boolean;
  voucherId?: Id<"vouchers">;
  voucher?: Doc<"vouchers">;
  calculatedDiscount?: number;
  finalPrice?: number;
  errorMessage?: string;          // Reason for invalid (if isValid is false)
}
```

**Validation Rules:**
- Code must be active (`isActive === true`)
- Current date must be within `validFrom` and `validUntil` (if set)
- Usage limit not exceeded (`usageCount < usageLimit` if set)
- Per-customer limit not exceeded (if `customerId` provided and `usagePerCustomer` set)
- Order total meets minimum (`orderTotal >= minimumOrderAmount` if set)
- Final price after discount must be > 0

### Inventory
```typescript
// convex/inventory/queries.ts
inventory.getLowStockAlerts()              // Components below reorder point or alarm %
inventory.getComponentInventory({          // Stock across all locations for one component
  componentTypeId, includeTransactions?, transactionLimit?
})
inventory.getLocationInventory({           // All components at one location
  locationId, activeOnly?
})
inventory.getInventoryReport({             // Full matrix: components × locations
  activeComponentsOnly?
})
inventory.getComponentBatches({            // FIFO-ordered batches at location
  componentTypeId, locationId, includeExpired?
})
inventory.getLocationTransactions({        // Recent movements at location
  locationId, limit?
})
inventory.getPackagingStockSummary()        // Aggregated packaging stock for Kitchen V2
inventory.getLatestBatch({                 // Most recent batch (for supplier pre-fill)
  componentTypeId, locationId
})
```

**getInventoryReport stockByLocation fields:**
```typescript
{
  locationId: Id<"storageLocations">;
  locationName: string;
  totalStock: number;
  totalReserved: number;
  available: number;
  weightedUnitCostIdr: number;
  latestSupplierName?: string;    // From componentStock aggregate
  latestPurchaseUrl?: string;     // From componentStock aggregate
  latestUnitCostIdr?: number;     // From componentStock aggregate
}
```

---

## Mutations (Write Operations)

### Ingredients
```typescript
// convex/ingredients/mutations.ts
ingredients.create({ name, brand?, procurementSource?, unitType, volumePurchased, priceExclShipping, shippingCost, createdBy })
ingredients.update({ id, name?, brand?, ... })
ingredients.remove({ id })
```

### Packaging Materials
```typescript
// convex/materials/mutations.ts
materials.create({ name, brand?, procurementSource?, unitType, volumePurchased, priceExclShipping, shippingCost, createdBy })
materials.update({ id, name?, brand?, ... })
materials.remove({ id })
```

### Tags
```typescript
// convex/tags/mutations.ts
tags.create({ name })
tags.remove({ id })
tags.seedDefaults()                     // Seed default tags
```

### Menu Products
```typescript
// convex/menuProducts/mutations.ts
menuProducts.create({ code?, name, grams?, defaultPrice, productionType?, productionUnits?, isActive? })
menuProducts.update({ id, code?, name?, grams?, defaultPrice?, productionType?, productionUnits?, isActive? })
menuProducts.remove({ id })                 // Fails if isFixed === true
menuProducts.toggleActive({ id })           // Toggle isActive status
menuProducts.assignToSlot({ id, slot })     // PRD-8: Assign product to POS slot (1-4), atomic swap
menuProducts.removeFromSlot({ id })         // PRD-8: Remove product from POS (set posSlot undefined)
menuProducts.seedFixedProducts()            // Seed 4 fixed Frollie products with COGS (PRD-0)
menuProducts.migrateFixedProductsToSlots()  // PRD-8: One-time migration to assign existing fixed products to slots
```

**Fixed Products (seedFixedProducts):**
| Code | Name | Grams | Price | COGS | Units |
|------|------|-------|-------|------|-------|
| ORIGINAL | Original | 80g | Rp 50k | Rp 19,231 | 1 |
| BITE_SINGLE | Bite Sized Single | 45g | Rp 35k | Rp 12,422 | 1 |
| BITE_DOUBLE | Bite Sized Double | 90g | Rp 70k | Rp 24,843 | 2 |
| BITE_TRIPLE | Bite Sized Triple | 135g | Rp 99k | Rp 36,765 | 3 |

### Recipes
```typescript
// convex/recipes/mutations.ts
recipes.create({ name, tagIds, createdBy, versionName, description?, estimatedYieldGrams?, isSingleComponent, isReusableComponent, components })
  // components: [{ componentName, sortOrder, linkedRecipeVersionId?, ingredients: [{ ingredientId, quantity, unit, sortOrder }] }]

recipes.createVersion({ recipeId, versionName, description?, estimatedYieldGrams?, isSingleComponent, isReusableComponent, components, createdBy })

recipes.copyVersion({ recipeId, copyFromVersionId, versionName, description?, createdBy })

recipes.updateTags({ id, tagIds })

recipes.remove({ id })                  // Fails if used in products
```

### Packaging
```typescript
// convex/packaging/mutations.ts
packaging.create({ name, tagIds, createdBy, versionName, description?, components })
  // components: [{ componentName, sortOrder, materials: [{ packagingMaterialId, quantity, unit, sortOrder }] }]

packaging.createVersion({ packagingRecipeId, versionName, description?, components, createdBy })

packaging.copyVersion({ packagingRecipeId, copyFromVersionId, versionName, description?, createdBy })

packaging.updateTags({ id, tagIds })

packaging.remove({ id })                // Fails if used in products
```

### Products
```typescript
// convex/products/mutations.ts
products.create({ name, tagIds, createdBy, versionName, description?, recipeVersionId, packagingVersionId, retailPriceIdr, numPieces, gramsPerPiece })

products.createVersion({ productId, versionName, description?, recipeVersionId, packagingVersionId, retailPriceIdr, numPieces, gramsPerPiece, createdBy })

products.copyVersion({ productId, copyFromVersionId, versionName, description?, createdBy })

products.updateTags({ id, tagIds })

products.remove({ id })
```

### Customers
```typescript
// convex/customers/mutations.ts
customers.create({ name, phone?, source?, notes?, createdBy })
customers.update({ id, name?, phone?, source?, notes? })
customers.remove({ id })                // Fails if has orders
```

### Orders
```typescript
// convex/orders/mutations/index.ts (barrel re-exports from orderCrud, statusUpdates, inventoryIntegration, kitchen)
orders.mutations.index.create({
  customerId,
  dueDate?,
  channel?,
  soldBy?,
  deliveryType,
  pickupLocation?,
  deliveryAddress?,
  contactWa?,
  contactIg?,
  notes?,
  items: [{ productName, productVariant?, quantity, unitPrice, unitCost, discountAmount, menuProductId? }],
  createdBy
})

orders.mutations.index.updateStatus({ orderId, status, skipStockCheck? })

orders.mutations.index.updatePayment({ orderId, paymentStatus, paymentMethod? })

orders.mutations.index.updateShipping({ orderId, shippingAgency, shippingNumber })

orders.mutations.index.remove({ orderId })   // Only Draft status allowed

// Item CRUD (convex/orders/mutations/itemCrud.ts)
orders.addItem({ orderId, item: { productName, quantity, unitPrice, unitCost, menuProductId? } })
orders.removeItem({ itemId })
orders.updateItemQuantity({ itemId, quantity })
orders.replaceItems({ orderId, items: [...] })  // Atomic bulk replace (Draft/AwaitingPayment only)
```

### Kitchen Mutations (PRD-1, PRD-2)
```typescript
// convex/orders/mutations/index.ts
orders.mutations.index.completeOrder({ id })              // Mark order as ProductionComplete
orders.mutations.index.revertToConfirmed({ id })          // Undo completion, restore ball counts
orders.mutations.index.completeBalls({ ballType, count }) // Batch ball completion with overflow
```

**completeBalls Args:**
```typescript
{
  ballType: "big" | "mid";  // "big" = original, "mid" = bite_sized
  count: number;            // 1 or 5
}
```

**completeBalls Response:**
```typescript
{
  completedOrderIds: Id<"orders">[];  // Orders auto-completed (all balls = 0)
  ballsUsed: number;                   // Balls actually applied
  overflow: number;                    // Remaining (no orders to apply to)
}
```

**Ball Completion Logic:**
1. Get Confirmed orders sorted by priority (dueDate ASC → totalUnits DESC → orderDate ASC)
2. Apply balls to matching items (original → big, bite_sized → mid)
3. Decrement `ballsRemaining` on each item (min 0)
4. If order has leftover count, overflow to next order
5. Auto-complete orders when ALL items have `ballsRemaining === 0`

### Vouchers
```typescript
// convex/vouchers/mutations.ts
vouchers.create({
  code: string,                      // Auto-uppercase
  name: string,
  description?: string,
  discountType: "amount" | "percentage",
  discountValue: number,
  minimumOrderAmount?: number,
  maximumDiscount?: number,
  isActive: boolean,
  validFrom?: number,
  validUntil?: number,
  usageLimit?: number,
  usagePerCustomer?: number,
  createdBy: string
})

vouchers.update({
  id: Id<"vouchers">,
  // All fields optional except id
  code?: string,
  name?: string,
  description?: string,
  discountType?: "amount" | "percentage",
  discountValue?: number,
  minimumOrderAmount?: number,
  maximumDiscount?: number,
  isActive?: boolean,
  validFrom?: number,
  validUntil?: number,
  usageLimit?: number,
  usagePerCustomer?: number
})

vouchers.deactivate({ id })          // Set isActive = false

vouchers.createManagerOverride({    // Generate single-use override code
  discountType: "amount" | "percentage",
  discountValue: number,
  reason: string,
  orderId: Id<"orders">,
  createdBy: string
})
```

**Manager Override Rules:**
- Automatically generates unique code (format: `OVERRIDE-XXXXXX`)
- Single-use: `usageLimit = 1`
- 24-hour expiry: `validUntil = now + 24h`
- Requires `reason` for audit trail
- Linked to specific `orderId`

**Authorization:**
- All voucher CRUD mutations require admin role
- Manager override creation allowed for managers and admins (but only accessible during checkout, not via VouchersManager page)

### Inventory
```typescript
// convex/inventory/mutations.ts
inventory.receiveStock({                   // Create new batch with supplier info
  componentTypeId, locationId, purchaseDate, supplierName,
  supplierBrand?, purchaseReference?, purchaseUrl?,
  quantityPurchased, totalCostIdr, expiryDate?,
  referenceNote?, createdBy, copyFromBatchId?
})
inventory.createComponentAndReceiveStock({ // Create component + first batch
  code, name, category, unit, reorderPoint?, color?,
  locationId, purchaseDate, supplierName, ...batchFields
})
inventory.transferStock({                  // Transfer between locations (FIFO, per-batch copies)
  componentTypeId, fromLocationId, toLocationId,
  quantity, referenceNote?, createdBy
})
inventory.adjustStock({                    // Physical count adjustment
  batchId, newQuantity, reason, createdBy
})
inventory.deleteBatch({ batchId })         // Delete (blocked if reserved)
inventory.expireBatch({                    // Mark expired (blocked if reserved)
  batchId, reason?, createdBy
})
```

**adjustStock behavior:**
- Updates `quantityRemaining` to `newQuantity`
- If `newQuantity > quantityPurchased`: also updates `quantityPurchased` and recalculates `totalCostIdr` at same unit cost
- Sets status to `"depleted"` if `newQuantity === 0`

**transferStock behavior:**
- Consumes from source using FIFO
- Creates per-source-batch copies at destination preserving original supplier name, brand, purchase URL, expiry date, and unit cost
- Links all batches/transactions via `transferId`

---

## Reports: Unit Economics (Phases 80 + 80.1)

Manager/admin analytics queries in `convex/reports/unitEconomics.ts`. All queries share filter args: `{ fromTs: number, toTs: number, channels?: string[], menuProductIds?: Id<"menuProducts">[] }`. Excludes `Draft` and `Cancelled` orders. Uses `by_completed_at` (primary) + `by_order_date` (legacy fallback) indexes for bounded scans. Revenue math sourced from denormalized `orderItems.lineTotal` via `itemNetRevenue`/`itemGrossRevenue`/`itemDiscount` helpers. Production-unit counting iterates `componentTypes` where `category="production" AND unit="pcs"` — Big Ball + Mid Ball + Hazelnut (+future) counted automatically.

**Phase 80.1 consolidated 12 per-widget wrapper queries into 3 grouped snapshot queries.** `/analytics` now issues 3 Convex subscriptions (not 12) per filter click. Internal pure-function reducers remain exported for unit tests.

### Snapshot queries (current — consumed by `/analytics`)

- **`kpiAndChannelSnapshot({ fromTs, toTs, channels?, menuProductIds? })` → `{ kpi, channelEconomics, channelMomentum }`**
  Loads current + prior period (one `loadFilteredData` each — 2 loads total) and runs `precomputeBomMaps` once. `kpi` carries `{ current, prior, delta }` across 6 KPIs. `channelEconomics` is `Array<{ channel, gross, discount, fees, net, units, orderCount, takePct, revPerUnit }>`. `channelMomentum` carries `{ bucketCount, channels[{ channel, revenueSpark, unitsSpark, aovSpark, totalRevenue, priorRevenue, wowPct }] }` with adaptive buckets (7 / 13 / 12 by span).
  Widgets: KPI Row, RevPerUnitChart, TakeRateTable, ChannelSparklineTable, UnitsPerTxnByChannel, AovByChannel (AOV + unitsPerTxn computed client-side from channelEconomics totals).

- **`timeSeriesSnapshot({ fromTs, toTs, channels?, menuProductIds? })` → `{ byWeekday, byWeekdayRolling, rollingTrend, dayHourHeatmap, volumeByType: { day, week }, typeMixOverTime: { day, week } }`**
  Single `loadFilteredData` call. Both granularities (day + week) computed server-side so the granularity toggle is a client-side slice (no new subscription). `dayHourHeatmap` returns `{ grid: number[7][8], max, rowLabels, colLabels }` (uncollapsed — overnight collapse happens in DayHourHeatmap.tsx via `useMemo`).
  Widgets: WeekdayDualAxisChart (mode-dispatches byWeekday vs byWeekdayRolling), RollingTrendChart, DayHourHeatmap (Nivo), UnitsByTypeStackedBars, TypeMixOverTime.

- **`skuSnapshot({ fromTs, toTs, channels?, menuProductIds? })` → `{ skuTop, skuChannelMatrix }`**
  Server-side cap: `SKU_SNAPSHOT_TOP_CAP = 20` on both `skuTop.rows` and `skuChannelMatrix`. Clients slice for display topN (Pareto=10, channel matrix=8). Single `loadFilteredData` call. `skuTop` returns `{ rows[{ productKey, name, revenue, cumulativePct }], totalRevenue }`. `skuChannelMatrix` returns `{ products, channels, matrix: [{ productKey, product, channels: [{channel, revenue, pctOfChannel}] }] }`.
  Widgets: SkuParetoChart, SkuChannelHeatmap (Nivo).

### Removed in Phase 80.1

All 12 per-widget wrappers deleted after `/analytics` migrated to snapshot hooks:

`kpiSummary`, `channelEconomics`, `channelMomentum`, `byWeekday`, `rollingTrend`, `dayHourHeatmap`, `volumeByType`, `typeMixOverTime`, `unitsPerTxnByChannel`, `aovByChannel`, `skuPareto`, `skuChannelMatrix`.

Any external caller depending on these paths must migrate to the equivalent snapshot field. See `docs/CHANGELOG.md` for the migration timeline.

### Reducers (pure functions, exported for unit tests)

`reduceKpi`, `reduceChannelEconomics`, `reduceChannelMomentum`, `reduceByWeekday`, `reduceRollingTrend`, `reduceDayHourHeatmap`, `reduceVolumeByType(current, pre, granularity)`, `reduceTypeMixOverTime(current, pre, granularity)`, `reduceSkuTop(current, pre, topN)`, `reduceSkuChannelMatrix(current, pre, topN)`. All accept `WindowData` + `Precomputed` — no `ctx` access.

### Display Channel Taxonomy (`convex/reports/channelTaxonomy.ts`)

Raw `orders.channel` literal → DisplayChannel:
- `shopee` → Shopee
- `tokopedia` → Tokopedia
- `grabfood` → GoFood
- `k3mart_gf` → K3Mart
- `whatsapp`, `instagram` → Direct
- `legato_tamtem`, `legato_goldfinch`, `bazaar` → Consignment
- `tiktok` → TikTok
- everything else / undefined → Other

---

## Bank Reconciliation (Phases 72 + 73)

Phase 72 shipped admin-only statement ingestion + auto-classification. Phase 73 added the reviewer workspace and widened the read surface + reconciliation mutations from admin-only to **manager + admin** per D-23. Rule CRUD (`bankKeywordRules.{create,update,deactivate}`) stays admin-only. `seedDefaults` is dashboard-callable with an optional token (falls back to first admin user when invoked from the Convex dashboard Functions tab).

### Queries (Read Operations)

```typescript
// List most-recent 50 imported bank statements (descending by createdAt)
bankStatements.listStatements({ token }): BankStatementHeader[]

// Fetch a single statement header by id
bankStatements.getStatement({ token, id }): BankStatementHeader | null

// List all lines for a statement, with optional status filter
bankStatements.listLines({
  token,
  statementId,
  statusFilter?: "unmatched" | "auto_matched"
}): BankStatementLine[]

// List active (or all) keyword rules, sorted priority DESC then ruleCode ASC
bankKeywordRules.list({
  token,
  includeInactive?: boolean
}): BankKeywordRule[]

// Fetch a single rule by id
bankKeywordRules.getById({ token, id }): BankKeywordRule | null
```

### Mutations (Write Operations)

```typescript
// Ingest a ParsedStatement (from frontend parser lib).
// Atomically inserts header + N lines, runs match engine inline per line,
// patches header.matchedCount at end. Never posts journalEntries.
// Throws ConvexError on:
//  - reconciliation mismatch (debit/credit/balance diff non-zero — T-72-19)
//  - dedup violation by fileHash ("Already imported")
//  - dedup violation by accountNumber+period ("already imported" with masked account)
//  - line count > MAX_LINES (5000)
bankStatements.createFromParsedStatement({
  token,
  header: {
    fileHash, fileName, bankName, accountNumber, accountHolder,
    periodStart, periodEnd, currencyCode,
    openingBalance, closingBalance,
    reportedDebitTotal, reportedCreditTotal
  },
  lines: ParsedLine[]
}): {
  statementId: Id<"bankStatements">,
  lineCount: number,
  matchedCount: number
}

// Seed all 26 canonical rules via upsert-by-ruleCode.
// Idempotent. Fails loudly with ConvexError listing unresolved account names
// if any expected account is missing (no partial seed).
// Dashboard-callable with no token (falls back to first admin user).
bankKeywordRules.seedDefaults({
  token?: string
}): Array<{ ruleCode: string, action: "created" | "updated", id: Id<"bankKeywordRules"> }>

// Admin CRUD
bankKeywordRules.create({ token, ...fields }): Id<"bankKeywordRules">
bankKeywordRules.update({ token, id, patch }): null
bankKeywordRules.deactivate({ token, id }): null
```

**Classification pipeline per line (inside `createFromParsedStatement`):**
```
ParsedLine
  → classifyLine(line, activeRules)     // Layer A — pure classifier
  → findLinkedRecord(ctx, line)         // Layer B — ctx scan across 4 tables
  → computeConfidence(rule, hintHit, linkage)
  → insert bankStatementLines { classification + proposal JE account IDs }
```

**Proposal-only JE fields (NOT posted in Phase 72):**
`jeDebitAccountId`, `jeCreditAccountId` on `bankStatementLines` are written from the matching rule's account references. Phase 73 reads these values to post real `journalEntries` after user confirmation.

### Phase 73 — Reconciliation Workspace (manager + admin)

All functions below require `requireRole(ctx, token, ["manager", "admin"])`. The 4 Phase 72 queries (`listStatements`, `getStatement`, `findByFileHash`, `listLines`) are ALSO widened to manager+admin at Plan 01 (per D-23). Rule CRUD stays admin-only.

#### New Queries

```typescript
// Aggregate counters for a single statement (progress bar + chips)
// Returns: { total, unmatched, autoMatched, suggested, confirmed, matched, reconciledPct }
// Powered by 4 indexed prefix scans on by_statement_status (Pattern 5).
bankStatements.getStatementProgress({
  token,
  statementId: Id<"bankStatements">
}): StatementProgress

// Bulk progress for the history list (1 query for N rows — T-73-19 mitigation)
// Throws when statementIds.length > 50 (RESEARCH Pitfall 7).
bankStatements.getStatementProgressBulk({
  token,
  statementIds: Id<"bankStatements">[]
}): Record<string, StatementProgress>

// Right-pane candidates for a selected bank line:
// 4 groups (expense / revenue / reimbursement / payroll), filtered by
// amountIdr === line.amountIdr AND date within ±3 days. Each row annotated
// with optional `alreadyLinkedToLineId` when another line already links to
// that record (D-04 1:1 cardinality surface).
bankStatements.listCandidatesForLine({
  token,
  lineId: Id<"bankStatementLines">
}): { expense: Candidate[], revenue: Candidate[], reimbursement: Candidate[], payroll: Candidate[] }

// Escape-hatch whole-table search (widens beyond default ±3-day window).
// Caps at 50 rows. Ranks by similarityScore when searchTerm present.
bankStatements.searchExpenses({
  token,
  amountIdr?, dateStart?, dateEnd?, searchTerm?
}): ExpenseCandidate[]

bankStatements.searchRevenue({ token, ...filters }): RevenueCandidate[]
bankStatements.searchReimbursements({ token, ...filters }): ReimbursementCandidate[]
bankStatements.searchPayroll({ token, ...filters }): PayrollCandidate[]

// Revenue Gap dashboard (D-13/D-14/C1): returns { rows, unmappedRows }.
// Mapped rows: { channel, source, bankCr, extRev, diff, diffPct }.
// Unmapped rows: { channel, bankCr, extRev: null, diff: bankCr, diffPct: null, unmapped: true }.
// Legacy (unallocated) row stays in `rows` with source=null + extRev=null.
bankStatements.revenueGapByPeriod({
  token,
  periodStart: number,  // epoch ms, WIB-bucketed upstream
  periodEnd: number
}): { rows: GapRow[], unmappedRows: GapRow[] }

// Single-line fetch (used by AssetRegister CapEx round-trip to resolve
// ?fromBankLine=... URL param).
bankStatements.getLine({
  token,
  lineId: Id<"bankStatementLines">
}): BankStatementLine | null
```

#### New Mutations

```typescript
// Link a bank line to an existing record. Guards:
//  - line exists, not already confirmed
//  - target record exists
//  - pre-write cross-link guard via by_matched index (D-04 1:1)
//  - C3 TOCTOU defense: post-write re-query; throws
//    `Concurrent match detected; retry` if >1 row linked
// Throws on kitchen/order_staff tokens.
bankStatements.manualMatch({
  token,
  lineId: Id<"bankStatementLines">,
  matchedType: "expense" | "externalRevenue" | "reimbursement" | "payroll",
  matchedId: string
}): null

// Clear match. For a previously-confirmed line:
//  - loads original JE + lines
//  - builds reversed lines (swaps DR/CR)
//  - posts new JE via createJournalEntryWithLines with
//    sourceType: "bank_statement_reversal", date: original.date (JE-03)
//  - patches reversal audit fields on line + marks original JE isReversed=true
// Rejects double-unmatch via reversalJournalEntryId guard.
bankStatements.unmatch({
  token,
  lineId: Id<"bankStatementLines">
}): null

// Post a balanced 2-line JE with sourceType: "bank_statement",
// sourceId: lineId. Guards: missing JE accounts, already-confirmed.
// Records confirmedAt/By/JournalEntryId (D-25).
bankStatements.confirmLine({
  token,
  lineId: Id<"bankStatementLines">
}): Id<"journalEntries">

// Scan by_statement_status for ('auto_matched' | 'suggested'),
// filter confidence === "exact" with both JE accounts present.
// Posts N journal entries all-or-nothing via Convex mutation atomicity.
bankStatements.batchConfirmExactTier({
  token,
  statementId: Id<"bankStatements">
}): { posted: number, skipped: number, totalAmountIdr: number }

// Inline-create: money already left bank, but no existing expense record.
// D-17 CRITICAL: status hard-coded "submitted", NEVER "approved". Reviewer
// is often not the person who incurred the expense.
bankStatements.inlineCreateExpense({
  token,
  lineId,
  categoryAccountId, amountIdr, expenseDate,
  description, submittedBy,
  receiptStorageId
}): Id<"expenses">

// Inline-create: untracked bank credit, no externalRevenue row.
// D-18 / C2: source uses strict 8-literal externalSource validator.
bankStatements.inlineCreateRevenue({
  token,
  lineId,
  source: ExternalSource,   // strict 8-literal union
  amountIdr, transactionDate,
  channel?, description?
}): Id<"externalRevenue">

// Inline-create: creates pending reimbursement batch shell (awaiting_payment)
// + items. Validates employee ownership + non-zero total.
bankStatements.inlineCreateReimbursement({
  token,
  lineId,
  employeeUserId: Id<"users">,
  expenseIds: Id<"expenses">[]
}): Id<"reimbursementBatches">

// CapEx round-trip: mark a bank line as linked to an asset's companion
// expense (set by fixedAssets.create(sourceBankLineId=...)). Idempotent:
// no-op when createdExpenseId === args.expenseId; throws
// "Line already linked to different expense" when called with a different id.
bankStatements.markAssetLinked({
  token,
  bankLineId: Id<"bankStatementLines">,
  expenseId: Id<"expenses">
}): null
```

```typescript
// bankKeywordRules — manager + admin gated (the ONLY widened rule mutation).
// Save a keyword rule from a reviewer's category override.
// Validates /^[A-Z]\d{2}$/ ruleCode, rejects duplicate ruleCode, enforces
// catch-all uniqueness guard, populates createdBy from session user.
// Plain create / update / deactivate stay admin-only (D-23 / P72 D-19).
bankKeywordRules.createFromOverride({
  token,
  ruleCode, description, priority, isActive, isCatchAll,
  direction, matchType, counterpartyPatterns,
  descriptionPatterns, descriptionPatternsMode,
  originalCategory, subCategory?, plSection,
  categoryAccountName, jeDebitAccountName?, jeCreditAccountName?,
  linkedChannel?, confidence, flags?
}): Id<"bankKeywordRules">
```

**Companion backend change — `convex/fixedAssets/mutations.ts::create` (D-21):**
- Accepts optional `sourceBankLineId: Id<"bankStatementLines">` arg.
- When present, after creating the asset + acquisition JE, the mutation also creates a companion expense (status="recorded", approvedBy=creator) and patches the bank line (`matchedType="expense"`, `status="suggested"`, `createdExpenseId=expense`) in the same transaction.
- Return shape extended: `{ assetId, expenseId }` (previously bare `assetId`) when `sourceBankLineId` supplied.
- Idempotent on re-invocation with the same line (returns existing expenseId).

---

## Staff Attendance (Phase 74)

Kitchen staff clock-in/out time tracking (ATT-01..ATT-04). Joined with existing `kitchenShiftRecords` at query time on `(date, chefUserId)` — no FK (D-06). All mutations take `token: v.string()` and are gated via `requireRole`. `clockIn` NEVER accepts a `userId` arg (T-74-01 spoofing prevention — the target is always derived from the session).

### Mutations (Write Operations)

```typescript
// clockIn — caller clocks themselves in. userId derived from session (T-74-01).
// D-04: rejects when a prior-day open shift exists; same-day double-click guarded.
// ConvexError: "You have an open shift from {date}. Please ask a manager to correct it."
// ConvexError: "You're already clocked in."
staffAttendance.mutations.clockIn({ token }): Id<"staffAttendance">

// clockOut — owner-or-manager gate. Staff cannot self-close prior-day shifts (D-04).
// ConvexError: "Attendance record not found" | "Cannot clock out a deleted shift"
//            | "Cannot clock out another user's shift"  | "Shift already closed"
//            | "This shift is from a prior day. Ask a manager to correct it."
staffAttendance.mutations.clockOut({
  token,
  attendanceId: Id<"staffAttendance">
}): void

// correctAttendance — manager/admin-only. Each call appends ONE corrections[] entry
// with a previous-state snapshot (T-74-02 non-repudiable audit trail).
// Actions: "edit_timestamps" | "add_missed" | "reassign" | "delete"
// D-19: rejects empty/whitespace correctionNote.
// I-1: rejects clockOut < clockIn.
staffAttendance.mutations.correctAttendance({
  token,
  action: "edit_timestamps" | "add_missed" | "reassign" | "delete",
  correctionNote: string,           // Trimmed server-side; must be non-empty (D-19)
  attendanceId?: Id<"staffAttendance">,  // Required for edit_timestamps / reassign / delete
  userId?: Id<"users">,             // Required for add_missed / reassign target
  date?: string,                     // Required for add_missed (YYYY-MM-DD WIB)
  clockIn?: number,                  // Required for add_missed; optional for edit_timestamps
  clockOut?: number                  // Optional for add_missed / edit_timestamps
}): Id<"staffAttendance"> | void    // Returns new id for add_missed; void otherwise
```

### Queries (Read Operations)

```typescript
// getCurrentOpenShift — caller's open attendance row (O(1) via by_user_open).
staffAttendance.queries.getCurrentOpenShift({ token }):
  Doc<"staffAttendance"> | null

// getMyLastShiftSummary — caller's most recent CLOSED attendance row joined with
// same-day kitchenShiftRecords. Ball counts are BOM-resolved (category="production").
// Powers the gate-screen "Last shift: 6h 23m • 42 balls" recap.
staffAttendance.queries.getMyLastShiftSummary({ token }):
  { date, clockIn, clockOut, durationMs, ballsProduced } | null

// getFlaggedShifts — manager/admin-only range scan. Runs detectFlags per session
// and detectOverlaps across sibling sessions. Returns rows with flagReasons[].
staffAttendance.queries.getFlaggedShifts({
  token,
  startDate: string,
  endDate: string
}): Array<{
  attendance: Doc<"staffAttendance">,
  userName: string,
  flagReasons: Array<"missing_clockout" | "over_16h" | "overlapping" | "before_hire">
}>

// getMyPerformance — T-74-03 info-disclosure mitigation: userIdFilter is
// HARD-SCOPED to the session user (cannot be overridden via args). Returns
// staff: StaffSummary | null — single object (differs from getStaffPerformanceSummary
// which returns an array; documented divergence).
staffAttendance.queries.getMyPerformance({
  token,
  startDate: string,
  endDate: string
}): {
  startDate, endDate, totalRecords,
  staff: StaffPerformanceSummary | null
}
```

### Extended query

```typescript
// getStaffPerformanceSummary — additive extension (Plan 01 Task 3).
// Existing consumers unchanged; new fields propagate via TypeScript inference.
kitchenShiftRecords.queries.getStaffPerformanceSummary({
  token, startDate, endDate
}): {
  startDate, endDate, totalRecords,
  staff: Array<StaffPerformanceSummary & {
    totalHoursWorked: number,     // Sum of closed durationMs / 3_600_000 (D-03: open=0)
    daysAttended: number,          // Distinct dates with ≥1 clock-in
    flaggedShiftCount: number,     // Sessions with any flag reason
    perDayBreakdown: Array<{
      date: string,
      hoursWorked: number,
      sessions: Array<{
        attendanceId, clockIn, clockOut, durationMs,
        isFlagged: boolean,
        flagReasons: FlagReason[]
      }>,
      ballsProduced: number,
      componentTotals: Array<{     // D-11: preserves unit — no cross-unit sum
        code: string,
        name: string,
        unit: "g" | "pcs",
        quantity: number
      }>
    }>
  }>
}
```

### D-14 adapter behavior

`aggregateStaffPerformance` runtime-probes `kitchenConfig` for an optional `componentTracking: { code, tracked, unit }[]` array (worktree-merged schema) and uses it authoritatively when present. Otherwise derives from `componentTypes` (production → pcs) + `kitchenComponents` (→ g) tables, using legacy `enabledProductionComponents` / `enabledKitchenComponents` arrays as the tracked filter. Result: `perDayBreakdown[].componentTotals` emits native units regardless of which branch is merged.

---

## Response Patterns

### List Endpoints (Summaries)
```typescript
// Recipe list item
interface RecipeSummary {
  _id: Id<"recipes">;
  _creationTime: number;
  name: string;
  tagIds: Id<"tags">[];
  tagNames: string[];              // Resolved tag names
  latestVersion: number;
  latestVersionName: string;
  totalCost: number | null;
  costPerGram: number | null;
}
```

### Detail Endpoints
```typescript
// Recipe version detail
interface RecipeVersionDetail {
  _id: Id<"recipeVersions">;
  recipeId: Id<"recipes">;
  versionNumber: number;
  versionName: string;
  description: string | null;
  estimatedYieldGrams: number | null;
  isSingleComponent: boolean;
  isReusableComponent: boolean;
  components: RecipeComponentDetail[];
  totalCost: number | null;
  costPerGram: number | null;
}

interface RecipeComponentDetail {
  _id: Id<"recipeComponents">;
  componentName: string;
  sortOrder: number;
  linkedRecipeVersionId: Id<"recipeVersions"> | null;
  linkedRecipeName: string | null;    // If linked
  ingredients: ComponentIngredientDetail[];
  subtotalCost: number | null;
}

interface ComponentIngredientDetail {
  _id: Id<"componentIngredients">;
  ingredientId: Id<"ingredients">;
  ingredientName: string;
  quantity: number;
  unit: string;
  sortOrder: number;
  lineCost: number | null;
}
```

### Order Detail
```typescript
interface OrderDetail {
  _id: Id<"orders">;
  orderNumber: string;
  customer: CustomerDetail;
  status: string;
  awaitingPaymentSince: number | null;
  paymentStatus: string;
  paymentMethod: string | null;
  orderDate: number;
  dueDate: number | null;
  totalAmount: number;
  totalCost: number;
  totalMargin: number;
  channel: string | null;
  soldBy: string | null;
  deliveryType: string;
  items: OrderItemDetail[];
  // WhatsApp templates
  whatsappText: string;
  paymentRequestText: string;
  productionStartedText: string;
  deliveryCompleteText: string;
}
```

---

## Error Handling

### Error Throwing Pattern
```typescript
// In mutations - throw errors for validation failures
export const remove = mutation({
  args: { id: v.id("recipes") },
  handler: async (ctx, args) => {
    // Check if recipe is used in products
    const products = await ctx.db
      .query("productVersions")
      .withIndex("by_recipe_version")
      .collect();

    const blockingProducts = products.filter(
      p => p.recipeVersionId === args.id
    );

    if (blockingProducts.length > 0) {
      throw new Error(
        `Cannot delete recipe. Used in products: ${blockingProducts.map(p => p.productName).join(", ")}`
      );
    }

    await ctx.db.delete(args.id);
  },
});
```

### Frontend Error Handling
```typescript
const removeRecipe = useMutation(api.recipes.remove);

try {
  await removeRecipe({ id: recipeId });
  toast.success("Recipe deleted");
} catch (error) {
  // Error message from mutation
  toast.error(error.message || "Failed to delete recipe");
}
```

---

## External Data (Multi-Platform Sales Integration)

### Actions (Node.js Runtime)

#### `integrations.k3mart.adapter.discoverK3MartOutlets`
Discovers K3Mart outlets by fetching product detail for each configured product ID. Each call returns ALL outlets for that product, making exactly N API calls for N products.

| Arg | Type | Description |
|-----|------|-------------|
| triggeredBy | string? | Who triggered the sync (e.g., "dashboard", "settings") |

**Returns:** `{ success, syncLogId, outletsScanned, outletsFound, totalStockUnits, errors, durationMs }`

**Flow:** For each product ID in `K3MART_CONFIG.products.ids`, calls `GET /vendor-stock/detail/{productId}`. Groups entries by `outlet_name`, upserts outlets with resolved external IDs, saves stock snapshots and product mappings.

**Outlet ID Resolution:** Uses `K3MART_OUTLET_NAME_TO_ID` reverse map (name -> numeric ID). Unknown outlets get synthetic `"name:{outletName}"` IDs via `resolveOutletExternalId()`.

#### `integrations.k3mart.adapter.syncK3MartStock`
Fast stock refresh using product detail API. Fetches all outlets per product in a single call. Makes exactly N API calls for N configured product IDs.

| Arg | Type | Description |
|-----|------|-------------|
| triggeredBy | string? | Who triggered the sync |

**Returns:** `{ success, syncLogId, outletsPolled, totalStockUnits, errors, durationMs }`

**Flow:**
1. Read API token from DB (`platformCredentials`) or env var `K3MART_API_TOKEN`
2. Fetch active outlets from `externalOutlets` (source="k3mart", isActive=true)
3. For each product ID: `GET /vendor-stock/detail/{productId}` (returns all outlets)
4. Match entries to active outlets by `outlet_name`, group products per outlet
5. Save `externalStockSnapshots`, update outlet `lastSyncAt` / `lastSyncStatus`

**K3 Mart Product Detail API:**
```
GET https://consapi.k3mart.id/api/v1/vendor-stock/detail/{productId}
Headers:
  Authorization: JWT {token}
  Origin: https://umkm.k3mart.id
  Referer: https://umkm.k3mart.id/
```

**Response format:**
```json
{
  "success": true,
  "meta": { "success": true },
  "data": [
    {
      "price": 45000,
      "quantity": 1,
      "outlet_name": "JKT-GADING SERPONG",
      "product_name": "Dubai Chewy Cookie",
      "product_code": "F03131-P00002",
      "capital": 0
    }
  ]
}
```

**Types:** `K3MartProductDetailEntry` (single outlet entry) and `K3MartProductDetailResponse` (full response).

#### `integrations.k3mart.adapter.syncK3MartSales`
Syncs K3Mart sales transactions with incremental date range and outlet linking.

| Arg | Type | Description |
|-----|------|-------------|
| triggeredBy | string? | Who triggered the sync |
| fromDate | string? | Start date (YYYY-MM-DD). Defaults to last sync - overlap days |
| toDate | string? | End date (YYYY-MM-DD). Defaults to tomorrow |

**Returns:** `{ success, syncLogId, fromDate, toDate, totalTransactions, newTransactions, skippedDuplicates, totalUnits, grossSales, totalCommission, netProfit, durationMs }`

**Flow:** Determines incremental date range, fetches from `/vendor-sales/get-all`, deduplicates via `externalTransactionId`, links each transaction to its outlet doc via `getOutletNameToIdMap`. Revenue records stored with `confidence: "exact"`, `dataOrigin: "api_revenue"`.

**Outlet Linking:** Looks up `outletNameMap[txn.outletName]` to attach `outletId` to each revenue record. Gracefully handles missing outlets (outletId stays undefined).

#### `integrations.gobiz.adapter.syncGoBizRevenue`
Syncs revenue data from GoBiz (GoFood) using dashboard API with 5 metrics.

| Arg | Type | Description |
|-----|------|-------------|
| daysBack | number? | Number of days to sync (default: 7) |
| triggeredBy | string? | Who triggered the sync |

**Returns (success):** `{ success: true, syncLogId, daysProcessed, totalGross, totalNet, totalTransactions, period: { from, to }, durationMs }`

**Returns (failure):** `{ success: false, syncLogId, error, durationMs }`

**Flow:**
1. Resolves both access_token and refresh_token from DB (or env vars)
2. Generates WIB date range (default: last 7 days)
3. For each day: queries dashboard API (proxy/63) to extract 5 metrics:
   - Net sales (bottomline)
   - Gross sales (topline)
   - Commission
   - Ad burn
   - Promo burn
4. On 401 error: attempts 3-method token refresh cascade:
   - Method 1: Cookie refresh (GET /micro-app/auth)
   - Method 2: Token rotate (POST /analytics-backend/api/auth/token/rotate)
   - Method 3: API refresh (POST api.gobiz.co.id/auth/token/refresh)
5. Stores each day as separate `externalRevenue` record with all 5 metrics
6. Updates sync log with final status

**Token Refresh:** Auto-refreshes expired tokens using refresh_token. On success, updates DB with new access_token. On failure after all 3 methods, marks token expired and returns error.

**Note:** No auto-sync cron. Manual sync only via dashboard or settings.

#### `integrations.internal.adapter.syncInternalOrders`
Syncs revenue from own Convex orders database. No external API calls or tokens required.

| Arg | Type | Description |
|-----|------|-------------|
| triggeredBy | string? | Who triggered the sync (e.g., "dashboard", "settings") |

**Returns (success):** `{ success: true, syncLogId, totalOrders, newTransactions, skippedDuplicates, totalGross, totalNet, durationMs }`

**Returns (failure):** `{ success: false, error, syncLogId, durationMs }`

**Flow:**
1. Creates sync log with status `"started"`
2. Gets last successful sync timestamp for incremental sync (via `getLatestSyncTimestamp`)
3. Fetches revenue-countable orders since last sync (via `getRevenueOrders` internalQuery)
4. Maps orders to revenue records in batches of 100, deduplicates by `orderNumber` using `by_source_txn` index
5. Updates sync log with `"success"` or `"error"`

**Revenue-countable statuses:** Confirmed, InProduction, Boxed, Labeled, WaitingShipment, WaitingPickup, CompleteShipped, PickedUp

**Revenue record mapping:**
- `revenueGross` = order's `finalTotal` (or `totalAmount` if no voucher discount)
- `revenueNet` = order's `totalMargin`
- `costOfGoods` = order's `totalCost`
- `dataOrigin` = `"db_query"`, `confidence` = `"exact"`

#### `integrations.internal.queries.getRevenueOrders` (internalQuery)
Fetches orders that qualify as revenue. Used internally by `syncInternalOrders`.

| Arg | Type | Description |
|-----|------|-------------|
| sinceTimestamp | number? | Only return orders created after this timestamp |

**Returns:** Array of order documents filtered by revenue-countable statuses.

### Internal Queries (used by adapters)

#### `externalData.queries.getOutletNameToIdMap`
Returns a map of outlet display name to document ID for a given platform source.

| Arg | Type | Description |
|-----|------|-------------|
| source | `"k3mart" \| "gobiz" \| "internal"` | Platform source |

**Returns:** `Record<string, string>` — e.g., `{ "JKT-SCBD": "jd7abc...", "JKT-BINTARO": "kx9def..." }`

Used by `syncK3MartSales` to link revenue records to outlet docs by matching `txn.outletName`.

### Admin Mutations (Phase 80.2 — Unlinked Products Fix)

#### `externalData.mutations.backfillInternalRevenueItems` (admin-only)

Paginated-WRITE mutation that repairs orphan Direct (source=`internal`) `externalRevenue` parents by rebuilding their `externalRevenueItems` children from the native `orders` + `orderItems` tables. Idempotent via `saveRevenueItems`' existing `(revenueId, externalItemId)` dedup — re-runs on already-backfilled data return all-zero counters. Writes one audit row to `externalSyncLogs.summary` per invocation.

Fixes the 219/262 Direct parents synced before 2026-04-10 that were permanently orphaned because `syncInternalOrders` had an unconditional skip-if-not-new guard before `saveRevenueItems` was added to the flow.

| Arg | Type | Description |
|-----|------|-------------|
| token | string | Admin session token (enforced via `requireRole(ctx, token, ["admin"])`) |
| cursor | string? \| null | Pagination cursor — null or omit for first call |
| limit | number? | Page size (default 200, hard cap `Math.min(limit, 4000)` — matches Convex per-mutation write ceiling) |

**Returns:**

```typescript
{
  parentsScanned: number;         // total externalRevenue[source=internal] rows visited in this page
  parentsBackfilled: number;      // orphan parents that received new children in this page
  itemsInserted: number;          // total externalRevenueItems rows inserted in this page
  skippedHasChildren: number;     // parents with children already — no-op skip
  skippedMissingOrder: number;    // parents whose native order was deleted since sync
  skippedEmptyOrderItems: number; // parents whose native order has no items
  continueCursor: string | null;  // pass back into next invocation until isDone=true
  isDone: boolean;                // true when no more pages remain
}
```

**Idempotency guarantee:** second run on the same data returns `{ parentsBackfilled: 0, itemsInserted: 0, skippedHasChildren: <total> }`. Safe to re-invoke after partial failure.

**Usage — CLI:**
```bash
npx convex run externalData:mutations:backfillInternalRevenueItems --prod '{"token": "<admin-token>", "limit": 500}'
# If isDone: false, loop with returned cursor:
npx convex run externalData:mutations:backfillInternalRevenueItems --prod '{"token": "<admin-token>", "cursor": "<cursor>", "limit": 500}'
```

**Phase:** 80.2 Unlinked Products Fix (2026-04-19) — first paginated-WRITE mutation in this codebase.

#### `externalData.mutations.applyRetroactiveProductMapping` (admin-only)

Existing cascade mutation — extended in Phase 80.2 with a K3Mart branch (after Shopee/TikTok). Return type widened additively with new `externalRevenueUpdated: number` field. Idempotent via `linkedMenuProductId` equality check.

**New field in return object:** `externalRevenueUpdated: number` — count of `externalRevenue` parent rows patched in the K3Mart cascade branch (0 for Shopee/TikTok/other sources). All 3 existing call sites (admin UI mapping save handlers) continue to work unchanged — the change is purely additive.

### Migration Mutations (one-time, run from dashboard)

#### `externalData.mutations.seedK3MartOutletNames`
Upserts 7 known K3Mart outlets with real location names. Safe to run multiple times.

**Returns:** `{ updated, created }`

**Run order:** Must run BEFORE `backfillRevenueOutletIds`.

#### `externalData.mutations.backfillRevenueOutletIds`
Patches existing K3Mart revenue records with `outletId` by parsing the outlet name from the dedup key (`externalTransactionId`). Skips records that already have `outletId`.

**Returns:** `{ patched, skipped, total }`

**Run order:** Must run AFTER `seedK3MartOutletNames`.

#### `migrations.gofoodSaleToChannelSale.runGofoodSaleToChannelSaleMigration` (Phase 74.5.2)
Admin-gated scheduler trigger. Schedules a paginated forward-only migration of `productInventoryTransactions` rows from `transactionType: "gofood_sale"` to `transactionType: "channel_sale" + source: "gobiz"`.

**Args:** `{ token: string }` (admin role required via `requireRole`)

**Returns:** `{ scheduled: true }` — non-blocking; actual migration runs in the scheduler via `migrateGofoodSaleToChannelSale` internalAction.

**Behavior:**
- Paginated: 500-row chunks, MAX_PAGES=1000 safety cap (500K-row ceiling).
- Self-healing on re-run: `by_type` index filter narrows to remaining `gofood_sale` rows only, so rerun is a no-op if migration already complete.
- Preserves `gofoodOrderRef` on migrated rows (legacy compat for `TransactionLogPanel`).
- Writes `externalRef = gofoodOrderRef ?? legacy-{_id}` (fallback for legacy rows with null ref).
- **Landmine guard:** writes `source: "gobiz"` (integration literal), NEVER `"gofood"` (surface name not in `externalSource` union).

**Frontend integration:** Admin triggers via Convex dashboard or future admin UI button. Non-blocking — UI polls `externalSyncLogs` for completion.

### Queries

#### `externalData.queries.listOutlets`
Lists all external outlets, optionally filtered by source.

| Arg | Type | Description |
|-----|------|-------------|
| source | `"k3mart" \| "gobiz" \| "internal"`? | Filter by platform |

#### `externalData.queries.getLatestSnapshots`
Gets latest stock snapshot batch for an outlet.

| Arg | Type | Description |
|-----|------|-------------|
| outletId | Id<"externalOutlets"> | Outlet to query |

#### `externalData.queries.getRevenue`
Gets revenue records with optional filters. Each record is enriched with `customerStoreName`:
- **K3Mart**: outlet location name from `externalOutlets` (e.g., "JKT-SCBD")
- **Internal**: customer name from linked order
- **GoBiz**: undefined (no store concept)

| Arg | Type | Description |
|-----|------|-------------|
| source | `"k3mart" \| "gobiz" \| "internal"`? | Filter by platform |
| periodStart | number? | Period start filter |
| periodEnd | number? | Period end filter |

**Returns:** `Array<externalRevenue & { customerStoreName?: string }>`

#### `externalData.queries.getSyncLogs`
Gets sync operation history.

| Arg | Type | Description |
|-----|------|-------------|
| source | `"k3mart" \| "gobiz" \| "internal"`? | Filter by platform |
| limit | number? | Max results (default 50) |

#### `externalData.queries.getDashboardSummary`
Aggregated dashboard data: outlet counts, recent revenue totals (last 24h), last sync per platform. Used by main Dashboard SalesWidget.

#### `externalData.queries.getDashboardSummaryByPeriod`
Period-based dashboard summary with current vs previous period comparison and per-channel breakdowns. Active outlets derived from actual sales in period.

| Arg | Type | Description |
|-----|------|-------------|
| preset | `"today" \| "yesterday" \| "last7days" \| "last30days" \| "thisMonth"` | Period preset |

**Returns:** `{ platforms, currentPeriod: { totalGross, totalNet, totalTransactions, totalCommission, totalAdBurn, totalPromoBurn, totalDiscounts, platformGross, internalGross, channels: { k3mart, gobiz, internal }, periodLabel, comparisonLabel, periodStart, periodEnd }, previousPeriod: { same fields } }`

#### `externalData.queries.getOrderDetailsByOrderNumber`
Fetches order header and non-cancelled items for expanding internal revenue rows.

| Arg | Type | Description |
|-----|------|-------------|
| orderNumber | string | Order number (e.g. "0202-001") |

**Returns:** `{ orderId, orderNumber, customerName, channel, status, deliveryType, totalAmount, finalTotal, orderLevelDiscount, orderLevelDiscountType, voucherCode, voucherDiscountValue, items: [{ productName, productVariant, quantity, unitPrice, totalPrice }] }` or `null`

### Mutations (Auth Required: manager, admin)

#### `externalData.mutations.upsertOutlet`
Creates or updates an external outlet.

| Arg | Type | Description |
|-----|------|-------------|
| token | string | Auth token |
| source | `"k3mart" \| "gobiz" \| "internal"` | Platform |
| externalId | string | Platform outlet ID |
| name | string | Display name |
| address | string? | Address |
| isActive | boolean | Active status |

#### `externalData.mutations.toggleOutletActive`
Toggles outlet active status.

| Arg | Type | Description |
|-----|------|-------------|
| token | string | Auth token |
| outletId | Id<"externalOutlets"> | Outlet ID |
| isActive | boolean | New active state |

#### `externalData.mutations.linkProductMapping`
Links an external product to an internal menu product.

| Arg | Type | Description |
|-----|------|-------------|
| token | string | Auth token |
| mappingId | Id<"externalProductMappings"> | Mapping ID |
| menuProductId | Id<"menuProducts">? | Internal product (null to unlink) |

### Restock Planner Queries

#### `externalData.queries.getRestockOverview`
Returns all active channels/outlets with current stock + demand summary. Powers the main restock grid.

**Args:** None

**Returns:**
```typescript
{
  summary: { activeChannels: number, lowStockAlerts: number, lastSyncAt: number | null },
  channels: [{
    type: "k3mart" | "gobiz" | "internal",
    outletId?: Id<"externalOutlets">,
    outletName?: string,
    lastSnapshotAt?: number,        // K3 Mart only
    products: [{
      productKey: string,
      productName: string,
      currentStock?: number,         // K3 Mart: from snapshots; GoBiz/Internal: from manual entries
      dailyRate: number,
      daysRemaining?: number,        // K3 Mart only
      status?: "critical" | "warning" | "ok",  // K3 Mart only
    }],
    criticalCount?: number,          // K3 Mart only
    warningCount?: number,           // K3 Mart only
    totalDailyDemand: number,
  }]
}
```

**Logic:** Aggregates stock snapshots (K3 Mart), manual stock entries (GoBiz/Internal), and 14-day revenue data across all channels. Status thresholds: critical < 1 day, warning < 2 days, ok >= 2 days.

#### `externalData.queries.getChannelSellThrough`
Detailed per-channel sell-through analysis with weekday/weekend split and restock suggestions.

| Arg | Type | Description |
|-----|------|-------------|
| channel | `"k3mart" \| "gobiz" \| "internal"` | Channel to analyze |
| outletId | Id<"externalOutlets">? | Specific outlet (K3 Mart) |

**Returns:**
```typescript
{
  channel: { type, outletId?, outletName?, lastSnapshotAt? },
  products: [{
    productKey, productName, menuProductId?,
    currentStock?,
    weekdaySalesTotal, weekendSalesTotal, totalSold30d,
    weekdayDailyRate, weekendDailyRate, overallDailyRate,
    daysRemaining?, status?,
    suggestedWeekday, suggestedWeekend,      // computed: rate × days × 1.2 buffer
    targetWeekday?, targetWeekend?,           // user-saved overrides
    last7dSales, prev7dSales,
    trendDirection: "up" | "down" | "flat",
    transactionCount,
    confidence: "high" | "medium" | "low",
  }]
}
```

**Logic:** 30-day sales window. Weekday/weekend split using WIB timezone. Suggestions: weekday = ceil(weekdayRate × 5 × 1.2), weekend = ceil(weekendRate × 2 × 1.2). Products with stock but no sales are included. Sorted by daysRemaining asc (K3 Mart) or demand desc (others).

### Restock Planner Mutations (Auth Required: manager, admin)

#### `restock.mutations.saveRestockTarget`
Upserts a restock target for a channel/outlet/product combination.

| Arg | Type | Description |
|-----|------|-------------|
| token | string | Auth token |
| channel | string | Channel type |
| outletId | Id<"externalOutlets">? | Outlet (K3 Mart only) |
| productKey | string | Product identifier |
| menuProductId | Id<"menuProducts">? | Linked menu product |
| weekdayTarget | number | Weekday restock quantity |
| weekendTarget | number | Weekend restock quantity |

#### `restock.mutations.updateManualStock`
Updates manual stock entry for GoBiz/Internal channels.

| Arg | Type | Description |
|-----|------|-------------|
| token | string | Auth token |
| channel | string | Channel type (not "k3mart") |
| productKey | string | Product identifier |
| menuProductId | Id<"menuProducts">? | Linked menu product |
| quantity | number | Current stock count |

---

## Platform Credentials (Token Auto-Refresh)

### Queries

#### `platformCredentials.queries.getHealthStatusAll` (Phase 26)
Get health status for ALL 6 platforms in a single registry-driven query. Requires manager or admin auth.

| Arg | Type | Description |
|-----|------|-------------|
| token | string | Auth token (manager or admin) |

**Returns:** `PlatformHealthStatus[]` — one entry per platform from the registry.

```typescript
type SyncLogEntry = {
  timestamp: number;
  status: "started" | "success" | "error";
  syncType: "manual" | "cron" | "token_refresh";
  productsCount?: number;
  durationMs?: number;
  errorMessage?: string;
};

type PlatformHealthStatus = {
  platformId: string;        // "k3mart" | "gobiz" | "internal" | "grabfood" | "bigseller" | "consignment"
  platformName: string;      // Human-readable name from registry
  authStrategy: string;      // "password_grant" | "paste_token" | "client_credentials" | "pos_login" | "session_auth"
  category: string;          // "delivery" | "marketplace" | "pos" | "internal"
  status: "green" | "yellow" | "red" | "disconnected";
  label: string;             // "Connected", "7 days remaining", "Not configured", etc.
  lastActivity: number | null; // Last sync timestamp (ms) or null
  daysRemaining: number | null; // For token_expiry platforms (bigseller), null otherwise
  hasExpiry: boolean;          // From healthConfig — true only for bigseller
  reconnectSteps: string[];    // From registry — for help dialogs
  syncHistory: SyncLogEntry[]; // Last 5 sync/refresh entries (empty for internal/consignment)
};
```

**Health check strategies:**
- `always_green`: Internal, Consignment (always connected), GrabFood (checks client_id presence + fetches sync history)
- `last_sync`: K3Mart, GoBiz — green <=2d, yellow 2-7d, red >7d since last `externalSyncLogs` entry
- `token_expiry`: BigSeller — green >7d, yellow 3-7d, red <3d until `tokenExpiresAt` (fetches sync history when token configured)

---

#### `platformCredentials.queries.getCredentialStatus`
Get credential status for a platform (admin-only). Never exposes the password.

| Arg | Type | Description |
|-----|------|-------------|
| token | string | Auth token |
| platformId | string | Platform ID (e.g., "k3mart") |

**Returns:** `{ hasCredentials, email, tokenExpiresAt, lastRefreshAt, lastRefreshStatus, lastRefreshError }`

### Mutations (Auth Required: admin)

#### `platformCredentials.mutations.saveCredentials`
Save or update platform credentials. Upserts by platformId.

| Arg | Type | Description |
|-----|------|-------------|
| token | string | Auth token |
| platformId | string | Platform ID (e.g., "k3mart") |
| email | string | Login email |
| password | string | Login password |

### Actions

#### `integrations.gobiz.adapter.loginWithCredentials` (Phase 26, AUTH-01)
One-click GoBiz token refresh via password grant endpoint. Admin-only.

Reads `GOBIZ_EMAIL` and `GOBIZ_PASSWORD` from Convex environment variables. POSTs to GoBiz password grant endpoint, saves `Bearer {access_token}` + `refresh_token` via internal mutation.

| Arg | Type | Description |
|-----|------|-------------|
| token | string | Admin auth token |

**Returns:** `{ success: true }` or `{ success: false, error: string }`

**Graceful fallback:** If `GOBIZ_EMAIL` or `GOBIZ_PASSWORD` are not configured, returns `{ success: false, error: "...not configured..." }` without throwing.

---

#### `integrations.bigseller.sync.startSync` (Phase 28)
Start a BigSeller sync. Triggers the scheduler-chain: `startSync` → `triggerSync` → `pollSyncTask` (60s intervals) → `fetchOrders`. Admin-only.

Uses **platform-specific endpoints** (`shopee/pageList.json`, `tiktok/pageList.json`) instead of the common endpoint to capture real fee data. Normalizes platform-specific fee fields (e.g., Shopee's `sellerTransactionFee`, TikTok's `platformCommissionAmount`) into standard `commissionFee`/`sellerShippingFee`/`otherFee` fields via `normalizePlatformFees()`.

| Arg | Type | Description |
|-----|------|-------------|
| token | string | Admin auth token |
| startDate | string? | Start date (YYYY-MM-DD). Defaults to last successful sync date |
| endDate | string? | End date (YYYY-MM-DD). Defaults to today |

**Returns:** `{ success: true }` or `{ success: false, error: string }`

**Shop-to-platform mapping:** Configured in `convex/integrations/bigseller/config.ts` → `BIGSELLER_SHOP_PLATFORM_MAP`. Each shop ID maps to a platform (`"shopee"` or `"tiktok"`) which determines which API endpoint and fee normalization logic to use.

---

#### `integrations.bigseller.adapter.previewBigSellerToken` (Phase 26, AUTH-02)
Decode a pasted BigSeller `muc_token` JWT and return expiry info for preview. Admin-only. Does NOT save the token.

| Arg | Type | Description |
|-----|------|-------------|
| token | string | Admin auth token |
| mucToken | string | Raw JWT string from BigSeller cookies |

**Returns:**
```typescript
{ success: true, expiresAt: number, daysRemaining: number, uid?: string }
| { success: false, error: string }
```

---

#### `integrations.bigseller.adapter.saveBigSellerToken` (Phase 26, AUTH-02)
Save a pasted BigSeller `muc_token` with decoded JWT expiry. Admin-only.

Stores `muc_token` as `currentToken` (not refreshToken — it is the primary access credential).
Stores actual JWT `exp` as `tokenExpiresAt` for health dashboard countdown.

| Arg | Type | Description |
|-----|------|-------------|
| token | string | Admin auth token |
| mucToken | string | Raw JWT string from BigSeller cookies |

**Returns:** `{ success: true, daysRemaining: number }` or `{ success: false, error: string }`

---

#### `platformCredentials.actions.refreshK3MartToken`
Refresh K3Mart token by logging in via HTTP, validating the JWT, and storing it in DB. Admin-only.

| Arg | Type | Description |
|-----|------|-------------|
| token | string | Auth token |

**Returns:** `{ success, tokenExpiresAt?, error? }`

**Flow:**
1. Read credentials from `platformCredentials` table
2. HTTP POST to `https://umkm.k3mart.id/api/auth/login` with email/password
3. Extract JWT from response (checks `token`, `access_token`, `data.token`)
4. Decode JWT payload to read `exp` claim (expiry)
5. Validate token via test fetch to K3Mart dashboard API
6. Store token + expiry in DB via `updateToken` internal mutation

#### `platformCredentials.actions.refreshK3MartTokenCron` (internal)
Same as above but called by the 12-hour cron job. No auth check (system-level).

### Cron Jobs

| Schedule | Function | Description |
|----------|----------|-------------|
| Every 12 hours | `refreshK3MartTokenCron` | Auto-refresh K3Mart JWT token |
| `0 1,3,5,7,9,11,13 * * *` | `autoSyncGoBizRevenue` | Auto-sync GoBiz revenue at WIB business hours (8,10,12,14,16,18,20 WIB) |

**Note:** GoBiz auto-sync added in GoFood Depot integration. Runs at WIB business hours, includes Phase C (auto sticker deduction on GoFood sales). Falls back gracefully if no valid token.

Defined in `convex/crons.ts`.

---

### Dispatch Planner

```typescript
// convex/dispatchPlanner/queries.ts
dispatchPlanner.getChannelConfig({ token })           // Get all channel configs ordered by priority
dispatchPlanner.getPlannerSettings({ token })          // Get planner settings (daily capacity)
dispatchPlanner.getConsignmentOutlets({ token })       // Get all consignment outlets
dispatchPlanner.getUnifiedWeeklyPlan({ token, weekStartDate })  // Full weekly plan with all channels, outlets, products, direct orders
dispatchPlanner.simulateInventory({ token, weekStartDate })     // BOM-walk inventory simulation for planned quantities
```

**`getUnifiedWeeklyPlan`** — The main query. Returns:
- `channels[]` — Channel configs with outlets and per-day/per-product plan cells
- `directOrders[]` — Confirmed orders with due dates in the week, auto-populated as direct channel rows
- `menuProducts[]` — All active menu products
- `weekDates[]` — Array of 7 date strings (YYYY-MM-DD)
- `dailyTotals` — Per-date aggregate of all planned quantities across channels
- `todayStr` — Current date in Jakarta timezone

**`simulateInventory`** — Walks the BOM for each planned product quantity, checks `componentStock` for production and packaging components, returns per-component sufficiency status. Also walks production component hierarchy via `collectLeafIngredients` to calculate ingredient requirements per day, returning `{ days, ingredientStatus }` where `ingredientStatus` shows projected resupply dates.

```typescript
// convex/dispatchPlanner/mutations.ts
dispatchPlanner.seedDefaults({ token })                              // Seed default channel config + settings
dispatchPlanner.savePlanCell({ token, date, channel, outletId?, orderId?, menuProductId, plannedQty, source })  // Create/update a single plan cell
dispatchPlanner.updateChannelConfig({ token, channelId, displayName?, color?, commissionRate?, isEnabled? })    // Update channel settings
dispatchPlanner.reorderChannelPriorities({ token, orderedIds })      // Reorder channel priorities
dispatchPlanner.updatePlannerSettings({ token, dailyCapacity })      // Update daily capacity
dispatchPlanner.addConsignmentOutlet({ token, name, productMappings, commissionRate? })    // Add consignment outlet
dispatchPlanner.updateConsignmentOutlet({ token, outletId, name?, isEnabled?, productMappings?, commissionRate? })  // Update outlet
dispatchPlanner.removeConsignmentOutlet({ token, outletId })         // Delete consignment outlet
```

**Auth:** All queries and mutations require `token` (Manager or Admin via `requireRole`).

```typescript
// convex/dispatchPlanner/helpers.ts (pure functions, not exposed as API)
generateWeekDates(startDate)        // Generate 7 consecutive YYYY-MM-DD strings
epochToDateString(epoch)            // Convert epoch ms to YYYY-MM-DD in Jakarta timezone
orderDueDateToProductionStart(dueDate)  // Subtract 2 days for production window
CHANNEL_COLORS                      // Default color map for channels
```

---

### Production Recipes (Phase 20)

```typescript
// convex/productionRecipes/queries.ts
productionRecipes.queries.getRecipeForComponent({ componentTypeId })     // Get sub-components + ingredients for a production component
productionRecipes.queries.calculateCogs({ componentTypeId })              // Calculate COGS by traversing hierarchy (returns { totalCogs, missingCount, breakdown })
productionRecipes.queries.getComponentsWithTiers({})                      // List all production components with computed tier depth, sorted tier desc

// convex/productionRecipes/mutations.ts
productionRecipes.mutations.addSubComponent({ parentId, childId, quantity, unit? })           // Add sub-component link
productionRecipes.mutations.removeSubComponent({ linkId })                                    // Remove sub-component link
productionRecipes.mutations.updateSubComponentQuantity({ linkId, quantity, unit? })            // Update quantity on sub-component link
productionRecipes.mutations.addIngredient({ componentTypeId, ingredientId, quantity, unit? })  // Add direct ingredient
productionRecipes.mutations.removeIngredient({ linkId })                                      // Remove direct ingredient
productionRecipes.mutations.updateIngredientQuantity({ linkId, quantity, unit? })              // Update quantity on ingredient link
```

**Internal functions:**
```typescript
// convex/productionRecipes/internal.ts (not exposed as API)
recalculateComponentCogs(ctx, componentTypeId)      // Recalculate and cache COGS for a component
invalidateProductionComponentCosts(ctx, componentTypeId)  // Walk upward via productionComponentLinks.by_child to cascade stale markers
```

**`calculateCogs`** returns:
- `totalCogs` — Total COGS in IDR per unit (or null if all ingredients missing)
- `missingCount` — Number of ingredients without cost data
- `breakdown` — Array of `{ ingredientName, quantity, unit, costPerUnit, lineCost }` for each leaf ingredient

---

### Reports: Income Statement

#### `reports.incomeStatement.getWeeklyIncomeStatement`
**Type:** Query (real-time, reactive)
**Auth:** None (read-only analytics query)
**Args:**

| Arg | Type | Description |
|-----|------|-------------|
| `weekStart` | `number` | Epoch ms for Monday 00:00 WIB of the target week |

**Returns:** Income statement object with the following structure:

| Field | Type | Description |
|-------|------|-------------|
| `weekStart` | `number` | Input weekStart value |
| `weekEnd` | `number` | Epoch ms for next Monday 00:00 WIB (exclusive) |
| `current` | `WeekData` | Current week P&L breakdown |
| `previous` | `WeekData` | Previous week P&L breakdown (for comparison) |
| `deltas` | `Deltas` | Delta amounts and percentages between current and previous |
| `gapAnalysis` | `GapAnalysis` | Data quality issues for current week |

**WeekData structure:**
- `totalGross` — Gross revenue across all channels
- `totalDiscounts` / `totalCommission` / `totalAdBurn` / `totalPromoBurn` / `totalRevShare` — Deduction subtotals
- `totalDeductions` — Sum of all deductions
- `netRevenue` — After deductions (discounts, commissions, ad/promo, rev share)
- `totalProductionCogs` / `totalPackagingCogs` — COGS subtotals by category
- `totalCogs` — Production COGS + Packaging COGS (BOM-resolved)
- `grossProfit` — Net revenue minus COGS
- `grossMarginPercent` — Gross profit / net revenue * 100, or `null` if net revenue = 0
- `channels[]` — Per-channel breakdown with `{ source, displayName, gross, netRevenue, discount, commission, adBurn, promoBurn, revShare, transactions, cogs: { production, packaging, total }, products[], confidence }`

**Deltas structure:**
- `grossRevenue` / `netRevenue` / `totalCogs` / `grossProfit` — Each has `{ amount, percent }` where percent is null if previous = 0
- `grossMarginPp` — Percentage point change in gross margin, or null

**GapAnalysis structure:**
- `unmappedProducts[]` — Products with no `linkedMenuProductId` (COGS = 0): `{ name, count, revenue }`
- `zeroCostComponents[]` — BOM component types with `unitCostIdr = 0`: `{ name, code }`
- `missingChannels[]` — Known channels with no revenue data: `{ source, displayName, reason }`
- `totalMappedProducts` / `totalProducts` — Mapping coverage stats

**Example usage:**
```typescript
const statement = useQuery(api.reports.incomeStatement.getWeeklyIncomeStatement, {
  weekStart: 1740182400000, // Monday 2026-02-24 00:00 WIB in UTC epoch ms
});
```

**Notes:**
- Consignment settlements included where `periodStart` falls within the week (no proration)
- Delivery fees excluded from P&L (pass-through to shipping)
- Unmapped products show revenue but COGS = 0 with `confidence: "missing"`
- Returns data from `transactionType: "return"` reduce gross revenue naturally
- Internal channel uses order-level `totalAmount`/`finalTotal`/`deliveryFee` for accurate discount calculation

**Phase 49 Extensions:**
- `totalOpex` — Operating expenses subtotal (from GL accounts with type "opex")
- `opexItems[]` — Per-category OpEx breakdown: `{ code, name, total }`
- `ebit` — Earnings Before Interest & Taxes (grossProfit - totalOpex)
- `totalOther` — Other income/expense subtotal (from GL accounts with type "other")
- `otherItems[]` — Per-category other breakdown: `{ code, name, total }`
- `netIncome` — Bottom-line: ebit + totalOther
- `netIncomeMarginPercent` — Net income / net revenue * 100, or `null`
- CSV export available on frontend via download button

**Phase 75 Extensions (CapEx / FCF / D/A split / missingReversals):**

`WeekData` gains 5 new fields — all additive, no existing field removed:

| Field | Type | Description |
|-------|------|-------------|
| `current.opexExcludingDA` | `number` | Operating expenses excluding depreciation and amortization (IDR). Equals `totalOpEx − depreciationAmortization`. |
| `current.depreciationAmortization` | `number` | Sum of depreciation (code `6150`) and amortization (code `6160`) OpEx lines (IDR). Sourced from `journalEntryLines` per existing EBITDA bridge. |
| `current.capExAmount` | `number` | Sum of `fixedAssets.cost` where `acquisitionDate ∈ [periodStart, periodEnd)` (IDR). Includes all disposalTypes per D-04 — gross acquisitions, not net of disposal proceeds. |
| `current.freeCashFlow` | `number` | `netIncome + depreciationAmortization − capExAmount` (IDR). Single subtotal. |
| `current.fcfMarginPercent` | `number \| null` | `freeCashFlow / totalGross × 100`, or `null` if `totalGross === 0`. Uses gross revenue denominator to match EBITDA/EBIT/Net margin convention. |

`current.opex[]` changed — codes `6150` (Depreciation) and `6160` (Amortization) are now **excluded** from the returned array. D/A is rendered as its own row from `depreciationAmortization`. Downstream consumers that destructure or iterate `opex.items` must account for the trimmed list. `totalOpEx` is preserved inclusive of D/A for back-compat.

`deltas` block gains parallel entries:
- `deltas.opexExcludingDA` / `depreciationAmortization` / `capExAmount` / `freeCashFlow` — each `{ amount, percent }` where `percent` is `null` if previous = 0.
- `deltas.fcfMarginPp` — percentage-point change in FCF margin, or `null`.

`gapAnalysis` gains:
- `missingReversals[]` — converted-expense gap check: expenses with `convertedToAssetId != null` whose linked `journalEntries` row has `isReversed !== true`. Each item: `{ expenseId, description, expenseDate, journalEntryId }`. Non-empty array indicates a silent P&L double-count risk (Phase 71 reclassification bridge — the reversal JE should zero the original OpEx posting; if it never posted, the expense appears in both OpEx AND the CapEx bridge).

**Example usage:**
```typescript
const stmt = useQuery(api.reports.incomeStatement.getWeeklyIncomeStatement, {
  weekStart,
});
// stmt.current.capExAmount          — sum of fixedAssets.cost in period
// stmt.current.freeCashFlow         — NI + D/A − CapEx
// stmt.current.opexExcludingDA      — cleaner OpEx base for EBITDA computation
// stmt.current.gapAnalysis.missingReversals.length > 0  — double-count warning
```

**Confidence propagation on new rows:**
- D/A row: `"exact"` (journal-sourced 6150/6160 extraction).
- CapEx row: `"exact"` (fixedAssets.cost validated at creation).
- FCF row: `"calculated"` (derived: NI + D/A − CapEx).

**Scale notes:** `fixedAssets` is scanned in-memory via a single Promise.all fetch per query (no `by_acquisitionDate` index added). Acceptable at <1000 assets; revisit if production asset count >10k or P&L query latency >200ms.

---

### Reports: Financial Export (Phase 76)

**Module:** `convex/reports/financialExport.ts`
**Auth:** `requireRole(ctx, token, ["manager", "admin"])` — every query, on the first line of the handler. Kitchen and order_staff roles are rejected with `Not authorized`.
**Frontend route:** `/financials/export` — also gated via `<ProtectedRoute allowedRoles={["manager", "admin"]}>` for the UX layer.

Three real-time Convex queries powering the multi-period financial CSV export page. All three accept the same time-range shape: `[periodStart, periodEnd)` half-open epoch ms intervals (D-03). No N+1 — all `ctx.db.get` calls are wrapped in `Promise.all` over Set-deduped IDs.

#### `reports.financialExport.getRawTransactionsExport`

Flat GL line export — one row per `journalEntryLines` entry in the date range, denormalized with parent JE + account + user fields. Reversal/`_void` JEs are included verbatim (D-04). The frontend pipes the result through `generateRawTransactionsCSV` from `src/lib/financialExportHelpers.ts`.

**Type:** Query (real-time, reactive)

**Args:**

| Arg | Type | Description |
|-----|------|-------------|
| `periodStart` | `number` | Epoch ms — inclusive start of the date range (WIB-aware) |
| `periodEnd` | `number` | Epoch ms — exclusive end (next-day midnight WIB for inclusive labels) |
| `token` | `string` | Session token — required (manager+admin gate) |

**Returns:** `RawTransactionRow[]` — empty array if no journal lines fall in the range.

| Field | Type | Description |
|-------|------|-------------|
| `entryDate` | `number` | Epoch ms — `journalEntryLines.entryDate` |
| `journalEntryId` | `Id<"journalEntries">` | Parent JE ID (serializes as opaque string over the wire) |
| `entryNumber` | `string` | Sequential JE number (e.g., `JE-0508-001`) |
| `sourceType` | `string` | Verbatim `journalEntries.sourceType` literal — `_void` / `_reversal` suffix naturally identifies reversal rows (D-04) |
| `accountCode` | `string` | PSAK chart-of-accounts code (e.g., `4000`) |
| `accountName` | `string` | Account display name from `accounts.name` |
| `debitAmount` | `number` | INTEGER rupiah (D-15) — frontend renders `String(amount)` (no decimals, no separators) |
| `creditAmount` | `number` | INTEGER rupiah |
| `description` | `string` | Verbatim `journalEntries.description ?? ""` |
| `sourceId` | `string \| undefined` | Optional source document ID (e.g., expense ID) — undefined for manual JEs |
| `createdByName` | `string \| null` | Display name of the user who created the JE; `null` when the user has been deleted (Edge case 10) |
| `_creationTime` | `number` | Convex `_creationTime` — used for sort stability |

**Sort order (D-02):** `entryDate ASC, entryNumber.localeCompare ASC, _creationTime ASC, debit-before-credit tiebreaker`.

**Index used:** `journalEntryLines.by_entryDate` — single range scan with both bounds inside `.withIndex(...)` (per CLAUDE.md `Pitfall #10`-style index discipline).

**Example usage:**
```typescript
const rows = await convex.query(api.reports.financialExport.getRawTransactionsExport, {
  periodStart: 1747008000000, // Mon 2026-05-12 00:00 WIB in UTC ms
  periodEnd:   1747612800000, // Mon 2026-05-19 00:00 WIB in UTC ms (exclusive)
  token,
});
```

#### `reports.financialExport.getMultiPeriodPLExport`

Loops `fetchAndAggregate` (Phase 75 P&L engine) over weekly / monthly / custom buckets within the range; returns one period record per bucket plus a range-aggregated gap analysis. `includePrevious=false` is passed per bucket — the frontend computes in-range deltas from `periods[i-1].current` (D-05) so we never re-fetch previous-period data per bucket.

**Type:** Query (real-time, reactive)

**Args:**

| Arg | Type | Description |
|-----|------|-------------|
| `periodStart` | `number` | Epoch ms — inclusive start |
| `periodEnd` | `number` | Epoch ms — exclusive end |
| `granularity` | `"weekly" \| "monthly" \| "custom"` | Bucket size: weekly snaps to Monday 00:00 WIB; monthly snaps to WIB calendar 1st; custom returns exactly one bucket spanning the input range. Partial leading/trailing buckets are clamped and labelled with `(partial)` suffix. |
| `token` | `string` | Session token — required |

**Returns:**

| Field | Type | Description |
|-------|------|-------------|
| `periods` | `Array<PeriodBucket>` | One entry per bucket; ordered by `bucketStart` ASC |
| `rangeGap` | `RangeGap` | Range-aggregated data quality issues (deduped union across periods) |

**`PeriodBucket` shape:**

| Field | Type | Description |
|-------|------|-------------|
| `bucketStart` | `number` | Epoch ms — bucket inclusive start |
| `bucketEnd` | `number` | Epoch ms — bucket exclusive end |
| `label` | `string` | Display label: `2026-W15` (weekly), `2026-04` (monthly), `2026-04-01 to 2026-04-19` (custom) — appends ` (partial)` suffix when bucket is clamped |
| `current` | `WeekData` | Full Phase 75 P&L for this bucket (same shape as `getWeeklyIncomeStatement` returns; see Reports: Income Statement above) |

**`RangeGap` shape (D-08 — union across all periods, deduped):**

| Field | Type | Description |
|-------|------|-------------|
| `totalProducts` | `number` | Sum of `gapAnalysis.totalProducts` across periods |
| `totalMappedProducts` | `number` | Sum of mapped products across periods |
| `unmappedProducts` | `Array<{ name, count, revenue }>` | Union by `name` (counts + revenues summed for shared names) |
| `missingChannels` | `Array<{ source, displayName, reason }>` | Union by `source` (last-seen entry wins for displayName/reason) |
| `zeroCostComponents` | `Array<{ name, code }>` | Union by `code` |
| `missingReversals` | `Array<{ expenseId, description, expenseDate, journalEntryId }>` | Union by `expenseId` — flags Phase 71 converted-expense reversal gaps that risk silent P&L double-counts. Single-period CSV emits this; multi-period also emits so accountants get the same warning regardless of export view (Triple-review I1). |

**Performance note:** The bucket loop is sequential (each call issues ~15 parallel DB queries; for N buckets that's N serial query batches). The preflight `isTooManyBuckets` flag warns at >26 weekly buckets to keep the user under the per-query CPU / 16,384-doc-read budget. Revisit if a future phase ships a single-shot multi-bucket helper.

**Example usage:**
```typescript
const data = await convex.query(api.reports.financialExport.getMultiPeriodPLExport, {
  periodStart: 1735689600000, // Mon 2026-01-01 00:00 WIB
  periodEnd:   1751299200000, // Mon 2026-07-01 00:00 WIB
  granularity: "monthly",
  token,
});
// data.periods → 6 entries (Jan, Feb, Mar, Apr, May, Jun) each with a full WeekData P&L
// data.rangeGap.unmappedProducts → deduped union across all 6 months
```

#### `reports.financialExport.getExportPreflight`

Cheap parallel index-bound counts for the UI preflight panel. Three counts + two soft-warning flags, returned in a single round-trip. Used by `FinancialExportPage` with a 300ms debounce on the inputs to avoid re-querying per keystroke.

**Type:** Query (real-time, reactive)

**Args:**

| Arg | Type | Description |
|-----|------|-------------|
| `periodStart` | `number` | Epoch ms — inclusive start |
| `periodEnd` | `number` | Epoch ms — exclusive end |
| `granularity` | `"weekly" \| "monthly" \| "custom"` | Used only for `periodCount` (delegates to `buildPeriodBuckets`) |
| `token` | `string` | Session token — required |

**Returns:**

| Field | Type | Description |
|-------|------|-------------|
| `journalLineCount` | `number` | Count from `journalEntryLines.by_entryDate` range scan |
| `revenueRowCount` | `number` | Count from `externalRevenue.by_period` range scan (gte/lt against `periodStart`) |
| `periodCount` | `number` | `buildPeriodBuckets(...)` length — reflects partial leading/trailing buckets |
| `isLargeRange` | `boolean` | `journalLineCount > 10_000` — D-16 soft warning (no hard cap) |
| `isTooManyBuckets` | `boolean` | `periodCount > 26` — soft warning before the user clicks Generate; sequential bucket loop in `getMultiPeriodPLExport` risks per-query budget exhaustion at high bucket counts (Triple-review I4) |

**Indexes used:** `journalEntryLines.by_entryDate`, `externalRevenue.by_period`. Both bounds inside `.withIndex(...)` per Convex index discipline.

**Example usage:**
```typescript
const preflight = useQuery(api.reports.financialExport.getExportPreflight, {
  periodStart: debouncedStart, // 300ms-debounced via useDebouncedValue
  periodEnd:   debouncedEnd,
  granularity, // discrete radio click — no debounce needed
  token: user?.token,
});
// preflight.isLargeRange → render amber Alert
// preflight.isTooManyBuckets → render amber Alert
```

#### Shared helper: `convex/lib/periodBuckets.ts`

`buildPeriodBuckets(periodStart, periodEnd, granularity)` returns `Array<[number, number]>` half-open `[bucketStart, bucketEnd)` intervals. Pure function (no Convex context) — imported by both backend `convex/reports/financialExport.ts` and frontend `src/lib/financialExportHelpers.ts` so the bucket math is the single source of truth across tiers and cannot drift.

- `"weekly"` — snaps to Monday 00:00 WIB via `(dayOfWeek + 6) % 7` math; clamps partial leading/trailing buckets.
- `"monthly"` — walks WIB calendar months via `wibMidnightToUtc(y, m, 1)`; clamps edge buckets.
- `"custom"` — returns `[[periodStart, periodEnd]]` (single bucket spanning input range).

---

### Expense Analytics (Phase 50)

#### `expenses.analyticsQueries.getOpExAnalytics`
**Type:** protectedQuery (manager, admin)
**Args:**

| Arg | Type | Description |
|-----|------|-------------|
| `periodStart` | `number` | Epoch ms for period start (WIB-aligned) |
| `periodEnd` | `number` | Epoch ms for period end (exclusive) |

**Returns:**

| Field | Type | Description |
|-------|------|-------------|
| `totalOpEx` | `number` | Total operating expenses for period |
| `byCategory` | `Array<{ code, name, total }>` | GL category breakdown (sorted by total desc) |
| `trend` | `Array<{ month, total }>` | 6-month trailing trend (always trailing from now, not period) |

**Notes:** Uses `journalEntryLines` with opex-type accounts. Trend uses YYYY-MM composite keys for year-boundary safety. Near-zero amounts excluded from byCategory.

#### `expenses.analyticsQueries.getExpenseMetrics`
**Type:** protectedQuery (manager, admin)
**Args:** `{ periodStart: number, periodEnd: number }`
**Returns:**

| Field | Type | Description |
|-------|------|-------------|
| `byEmployee` | `Array<{ userId, name, total }>` | Employee spend (sorted by total desc) |
| `pendingTotal` | `number` | Sum of ALL awaiting_payment expenses (no date filter) |
| `avgApprovalDays` | `number \| null` | Mean approval turnaround in days, null if no data |

**Notes:** Uses `by_status_expenseDate` compound index for efficient date+status filtering. Combines approved, awaiting_payment, and reimbursed expenses for employee spend.

#### `expenses.analyticsQueries.getFraudFlags`
**Type:** protectedQuery (manager, admin)
**Args:** `{}` (no period — uses fixed time windows)
**Returns:**

| Field | Type | Description |
|-------|------|-------------|
| `splits` | `SplitFlag[]` | FRAUD-06: Same employee + GL + 48hrs + >Rp 500K |
| `concentrations` | `ConcentrationFlag[]` | FRAUD-07: Approver handles >80% of employee's expenses in 30d |
| `unfamiliarVendors` | `string[]` | FRAUD-08: Vendor names not seen in last 90 days |

**SplitFlag:** `{ employeeName, employeeId, accountId, expenseIds[], totalAmount }`
**ConcentrationFlag:** `{ employeeName, approverName, employeeId, approverId, percent, count, totalCount }`

**Notes:** Pure detection logic in `convex/expenses/fraudHelpers.ts` (no ctx). Query layer fetches data and resolves user names.

---

### Chart of Accounts (Phase 43)

#### `accounts.queries.list`
**Type:** Query (real-time, reactive)
**Auth:** None (read-only, route protected by admin role)
**Args:**

| Arg | Type | Description |
|-----|------|-------------|
| `activeOnly` | `optional boolean` | If true, returns only active accounts via `by_active_type` index |

**Returns:** `Account[]` sorted by code ascending (natural PSAK ordering: 1xxx, 2xxx, ..., 7xxx)

#### `accounts.queries.getById`
**Type:** Query
**Auth:** None
**Args:** `{ id: Id<"accounts"> }`
**Returns:** `Account | null`

#### `accounts.mutations.seedDefaults`
**Type:** Mutation
**Auth:** Optional (`token: v.optional(v.string())` — enforces admin when provided)
**Args:** `{ token?: string }`
**Returns:** `Array<{ code, action: "created" | "updated", id }>` — 39 PSAK-aligned default accounts
**Notes:** Upsert pattern — safe to re-run. Call from Convex dashboard Functions tab.

#### `accounts.mutations.create`
**Type:** Protected Mutation (admin)
**Args:**

| Arg | Type | Description |
|-----|------|-------------|
| `code` | `string` | 4-digit PSAK code (validated: format + prefix 1-7 + uniqueness) |
| `name` | `string` | Account name (required, trimmed) |
| `description` | `optional string` | Optional notes |

**Returns:** `Id<"accounts">`
**Notes:** Type and category auto-derived from code prefix.

#### `accounts.mutations.update`
**Type:** Protected Mutation (admin)
**Args:** `{ id, name?, description?, isActive? }`
**Notes:** Code is immutable. Empty description string clears the field (uses `ctx.db.replace()`).

#### `accounts.mutations.remove`
**Type:** Protected Mutation (admin)
**Args:** `{ id: Id<"accounts"> }`
**Errors:** Blocked if system account, referenced by journal entries (`by_account_entryDate` index), or referenced by expenses (`by_account` index).

---

### Historical Expense Import (Phase 51)

#### `journalImport.mutations.bulkCreateJournalEntries`
**Type:** Protected Mutation (admin only)
**Location:** `convex/journalImport/mutations.ts`
**Args:**

| Arg | Type | Description |
|-----|------|-------------|
| `importBatchId` | `string` | Client-generated batch identifier for grouping |
| `rows` | `Array<ImportRow>` | Array of import rows (max 50 per call) |

**ImportRow fields:**

| Field | Type | Description |
|-------|------|-------------|
| `date` | `number` | Epoch milliseconds (UTC midnight of the WIB date) |
| `amount` | `number` | IDR amount (positive integer) |
| `description` | `string` | Expense description |
| `vendorName` | `optional string` | Vendor/payee name |
| `accountCode` | `string` | 4-digit GL account code (must exist in accounts table) |
| `receiptUrl` | `optional string` | Google Drive receipt link (stored in metadata) |

**Returns:** `{ created: number }` -- count of journal entries created

**Behavior:**
- Validates all rows first (fail-fast: if any row invalid, entire batch rejected)
- Creates one journal entry per row: DR expense account, CR 1100 (Cash)
- `sourceType: "manual"` with `[Historical Import]` prefix on description
- Batch size capped at 50 rows per call (frontend handles batching for larger imports)
- Receipt URLs stored in `journalEntries.metadata.receiptUrl`

**Frontend integration:**
- `src/pages/HistoricalImportPage.tsx` -- wizard page at `/import`
- `src/hooks/convex/useJournalImport.ts` -- hook wrapping the mutation
- CSV template download and CoA reference download built into wizard
- Client-side validation with row-level error reporting before server submission

---

### Product Inventory — Channel Deduction Backfill (Phase 74.5.2)

Per-source historical backfill for channel deductions. Flag-independent (runs regardless of `productInventorySettings.channelDeductionEnabled[source]`) and idempotent (set-once `externalRevenueItems.inventoryDeductedAt`).

#### `productInventory.backfill.runChannelBackfill` (mutation, admin)
Schedules a full paginated backfill for the given source. Dispatches `backfillChannelDeductions` internalAction which drains `externalRevenueItems` where `inventoryDeductedAt IS NULL` for the source.

**Args:** `{ source: ExternalSource, token: string }`

**Returns:** `{ scheduled: true }` — non-blocking.

**Behavior:**
- Uses `by_source_deductedAt` compound index (Phase 74.5.2) to narrow to un-deducted rows in O(n).
- 200-item chunks, MAX_ITERATIONS=500 runaway cap (100K-row ceiling per run).
- Silent-drop guard: items with `linkedMenuProductId === null` are skipped (D74.5.2-L4).
- Timestamp preservation: backfilled `productInventoryTransactions.createdAt` uses `externalRevenue.transactionDate` (D-16) — not the current clock.

#### `productInventory.backfill.runOneChannelBackfillPage` (mutation, admin)
Single-page variant for UI loop-polling (used by `ChannelBackfillCard`).

**Args:** `{ source: ExternalSource, token: string }`

**Returns:** `{ itemsProcessed: number, deducted: number, skipped: number, isDone: boolean }` — client loops until `isDone`.

#### `productInventory.backfill.getChannelBackfillPreflight` (query, admin)
Reactive query returning pending-item counts and audit blockers for the source.

**Args:** `{ source: ExternalSource, token: string }`

**Returns:** `{ pendingItems: number, blockingAuditIssues: number }` — per-source gate, not global. UI renders informational warning when `blockingAuditIssues > 0` but does NOT disable the button (D-17, Pitfall 4).

**Frontend integration:**
- `src/hooks/convex/useChannelBackfill.ts` — `useChannelBackfillPreflight`, `useRunChannelBackfill` hooks.
- `src/pages/UnlinkedProductsBackfill.tsx` — 6 per-source `ChannelBackfillCard` components under "Channel Deduction Backfill" section.
- GrabFood card renders permanent-OFF degraded state ("Awaiting OAuth scope") per D74.5.2-L15.

---

### Consignment — Per-Product Breakdown (Phase 74.5.2)

#### `consignment.queries.getSettlementItems` (query, admin + manager)
Returns enriched per-product breakdown for a settlement. Joins `externalRevenueItems` (linked via `consignmentSettlements.linkedRevenueId`) with `menuProducts` for display names.

**Args:** `{ settlementId: Id<"consignmentSettlements">, token: string }`

**Returns:** `Array<{ itemId, productName, menuProductId?, unitPrice, quantity, totalPrice }>`

**Behavior:**
- Pre-74.5.1 settlements (no `linkedRevenueId`) return empty array gracefully — no error, no null.
- Lazy-loaded from `SettlementTimeline.tsx` via `useQuery(…, expanded ? args : "skip")` — zero network cost on collapsed rows.

**Frontend integration:**
- `src/components/salesAnalytics/SettlementFormDialog.tsx` — optional item-row inputs with ±Rp1 sum validation on create.
- `src/components/salesAnalytics/SettlementTimeline.tsx` — per-settlement expandable "Products sold" sub-section.

---

### Library Utilities

#### `buildProductCOGSMap` (convex/lib/costCalculator.ts)
Pure function. Builds per-product COGS map from BOM data.
**Args:** `bomComponents[]` (menuProductId, componentTypeId, quantity), `componentTypes[]` (_id, unitCostIdr, category)
**Returns:** `Map<string, { production, packaging, total }>` — IDR per unit

#### `calculateWeekRange` (convex/lib/periodRange.ts)
Pure function. Computes current + previous week boundaries.
**Args:** `weekStartMs: number` (epoch ms for Monday 00:00 WIB)
**Returns:** `{ currentStart, currentEnd, previousStart, previousEnd }` — All UTC epoch ms. `currentEnd` is exclusive (next Monday).

---

### Phase 81 Canonical Exports

Single sources of truth for three domain rule clusters consolidated in Phase 81 (2026-05-11). Importers blocked by ESLint `no-restricted-imports` from re-importing the deleted alternatives. See `docs/CHANGELOG.md` Phase 81 entry for the full deletion list and breaking-change notes.

#### `convex/reports/platform.ts`

```typescript
export const PLATFORMS = [
  "Direct",       // internal source
  "GoFood",       // gobiz source
  "GrabFood",     // grabfood source (D-05: distinct from GoFood)
  "Shopee",       // shopee source
  "TikTok",       // tiktok source (D-02: NOT "Tokopedia")
  "K3Mart",       // k3mart source (D-02: no space)
  "Consignment",  // consignment source
  "BigSeller",    // transitional — fades on ADR-0001 schema field landing
] as const;
export type Platform = (typeof PLATFORMS)[number];

export type OrderChannel =
  | "whatsapp" | "instagram" | "other"
  | "gofood" | "grabfood" | "shopee" | "tiktok"
  | "k3mart_gf" | "legato_tamtem" | "legato_goldfinch" | "bazaar"
  | "tokopedia"; // deprecated synonym for tiktok

export function isPlatform(s: string): s is Platform;
export function platformDisplay(p: Platform): string;
export function resolvePlatform(row: {
  source: ExternalSource;
  underlyingSource?: Exclude<ExternalSource, "bigseller">;  // D-03 forward-compat
  orderChannel?: OrderChannel | string;                     // overload per PATTERNS.md finding #6
}): { platform: Platform; confidence: Confidence };
```

**Resolution priority:**
1. `orderChannel` (if set) → `ORDER_CHANNEL_TO_PLATFORM` map; unknown channels return `confidence: "inferred"` so Phase 77 Data Health Dashboard can detect drift; `tokopedia` → `TikTok` (deprecated synonym).
2. `source === "bigseller"` → `underlyingSource` if present and not "bigseller" → corresponding Platform + confidence='inferred' (ADR-0001 forward-compat); else fallback to `BigSeller` transitional + `inferred`.
3. `source` via `SOURCE_TO_PLATFORM` map → Platform + `confidence='exact'`. Unknown source returns `BigSeller` transitional + `inferred` (defensive runtime fallback per triple-review C3).

The `{platform, confidence}` return shape lets callers compose with `worstConfidence` (analog: `convex/reports/incomeStatement.ts:333-335`) without double-downgrading rows already at 'inferred'.

#### `convex/reports/productionUnitHelpers.ts`

```typescript
export function isProductionUnit(ct: Pick<Doc<"componentTypes">, "category">): boolean;
// Rule: category === "production" alone (Phase 81 / D-01).
// Drops historical `unit === "pcs"` and `gramsPerUnit !== undefined` clauses to
// future-proof gram-denominated production variants. Numeric-aggregation callsites
// that need a gramsPerUnit guard compose: .filter(isProductionUnit).filter(c => c.gramsPerUnit !== undefined)
```

Structural `Pick<Doc, "category">` signature accepts trivial test stubs (`{category: "production"}`) and the partial-shape spreads in `menuProducts/mutations.ts`.

#### `convex/lib/periodRange.ts`

```typescript
export function getWibDateStr(utcMs: number): string;
// Returns YYYY-MM-DD WIB date string (e.g., "2026-05-11").
// Throws on non-finite input (Number.isFinite NaN-guard, lifted from the deleted
// staffAttendance/flagEngine#toWibDateString — fail-loud, no silent "Invalid Date" leakage).
```

Canonical home for all YYYY-MM-DD WIB date-string formatting (Phase 81 / D-06). Replaces 4 deleted per-feature duplicates: `getWibDateString` + `getWibDateStringDaysAgo` (gofoodDepot/helpers), `toWibDateString` (staffAttendance/flagEngine), `utcToWibDateStr` (collapsed into this function).

#### `convex/lib/counter.ts`

```typescript
export function getWibMonthDayStr(utcMs: number): string;
// Returns MMDD (e.g., "0511"). Used by EXP-MMDD-NNN / JE-MMDD-NNN / RMB-MMDD-NNN counter sequencing.
// Renamed from getWibDateStr in Phase 81 to free the canonical YYYY-MM-DD name (see periodRange.ts).
```

**Deletions:** Phase 81 deleted 6 legacy WIB date helpers + 3 platform mappers + 1 type + 1 const. Cross-reference `docs/CHANGELOG.md` Phase 81 entry for the full deletion list and ESLint ban directives.

---

### QRIS Payments (Phase 84)

In-person QRIS charging via Xendit. Files: `convex/qrisPayments/{actions,mutations,queries}.ts`, `convex/integrations/qris/{provider,xendit,webhooks}.ts`, route registered in `convex/http.ts`.

| Function | Type | Roles | Purpose |
|----------|------|-------|---------|
| `qrisPayments.actions.createQrisInvoice` | `action` | order_staff, manager, admin (via `getOrderForCreate` → `requireRole`) | Mint a Xendit dynamic QR for an order. Re-checks `QRIS_ENABLED`, guards `AwaitingPayment` + `finalTotal ≥ 1500`, supersedes prior pending rows, inserts one new `pending` row. Token never forwarded to Xendit. |
| `qrisPayments.queries.getActiveQrisPayment` | `protectedQuery` | order_staff, manager, admin | Most-recent non-expired row for an order (drives the dialog; flips reactively on paid). |
| `qrisPayments.queries.getQrisConfig` | `protectedQuery` | order_staff, manager, admin | `{ enabled, qrisNmid, merchantName }` — reads `QRIS_ENABLED` server-side + folds in order-staff-safe NMID (avoids admin-only `businessSettings.get`, pitfall #19). |
| `qrisPayments.mutations.recordPaidAndTransition` | `internalMutation` | webhook-only | Payment-durable idempotent paid transition (records `paid` before reserve; `AwaitingPayment → PaymentReceived`; reserve-failure reverts + flags `needsReview`). |
| `qrisPayments.mutations.{insertPending,expirePrior}` | `internalMutation` | action-only | Insert one pending row / supersede prior pending rows. |
| `POST /api/xendit/qr-payment` | `httpAction` | Xendit callback (constant-time `verifyCallbackToken`) | Inbound webhook. 401 on bad token (no mutation); idempotent transition on COMPLETED; safe 200 no-op on unmatched. |

Match priority: globally-unique `xenditQrId` (indexed) first, then active row by `externalId`. Payment detection is webhook-only (no polling).

### Subscriptions & CRM (Phase B — weekly cycle, 2026-06-24)

All functions require `token: v.string()` and `protectedQuery`/`protectedMutation` from `convex/lib/functions`. All roles: **manager + admin** unless noted.

#### Scheduling queries (`convex/subscriptions/scheduling/queries.ts`)

```typescript
subscriptions.scheduling.queries.getPlanningWeek({ subscriptionId, weekStart })
  // Returns { week: subscriptionWeeks | null, subscription } for the given ISO week.

subscriptions.scheduling.queries.listWeeks({ subscriptionId })
  // All weeks for a subscription, most-recent first (bounded by subscriptionId index).

subscriptions.scheduling.queries.getFundingDashboard()
  // Weeks in "invoiced" + "confirmed" status enriched with subscriptionLabel + customerName.
  // Returns: Array<{ week, subscriptionId, subscriptionLabel, customerId, customerName }>
```

#### Week mutations (`convex/subscriptions/weeks.ts`)

```typescript
subscriptions.weeks.seedWeek({ subscriptionId, weekStart, source? })
  // Idempotent: creates the subscriptionWeeks row if absent.
  // source: "template" (default) | "previousWeek" | "blank"

subscriptions.weeks.saveWeekPlan({ subscriptionWeekId, days })
  // Persists calendar edits. Guard: week.status must be "planned".
  // days: Array<{ date: number, items: Array<{ menuProductId, qty }> }>
```

#### Confirm week (`convex/subscriptions/scheduling/confirmWeek.ts`)

```typescript
subscriptions.scheduling.confirmWeek.confirmWeek({ subscriptionWeekId })
  // Generates one order per planned day (at partner price), flips week planned → confirmed.
  // Idempotent: refuses if week.status !== "planned".
```

#### Invoicing (`convex/subscriptions/invoicing.ts`)

```typescript
subscriptions.invoicing.createSubscriptionWeeklyInvoice({ subscriptionWeekId })
  // Builds a "subscription_weekly" invoice; invoiceNumber = bank-transfer reference.
  // Idempotent: returns existing weeklyInvoiceId if already created.

subscriptions.invoicing.markWeeklyInvoicePaid({ subscriptionWeekId })
  // Cash event: funds deferred-revenue pool (topup ledger entry), transitions orders
  // AwaitingPayment → PaymentReceived (paid from credit), week → "delivering".
  // Idempotent via creditLedger.by_invoice.

subscriptions.invoicing.createTopupInvoice({ subscriptionWeekId, addedLines })
  // Builds a "subscription_topup" invoice for mid-week delta lines.
  // addedLines: Array<{ productName, qty, unitPrice, lineTotal }>

subscriptions.invoicing.markTopupInvoicePaid({ invoiceId })
  // Cash event for a topup invoice: additional topup ledger entry on the week's pool.

subscriptions.invoicing.billWeekShortfall({ subscriptionWeekId })   // 2026-06-29
  // Bills the projected end-of-week credit shortfall as ONE subscription_topup invoice
  // (the "almost out of credit" offer). Idempotent: throws while an unpaid top-up exists.
  // Returns { invoiceId, projectedShortfall, customerId }. Throws if shortfall <= 0.
```

#### Edit undelivered order (`convex/subscriptions/editOrder.ts`)

```typescript
subscriptions.editOrder.editUndeliveredSubscriptionOrder({
  orderId: Id<"orders">,
  lines: Array<{ itemId: Id<"orderItems">, newQty: number }>
})
// Reduces or removes lines on an undelivered subscription day-order.
// Re-derives orders.subscriptionCreditApplied = Math.min(applied, newTotalAmount)
// (never increases the reservation; keeps computeWeekAvailableCredit exact).
// Resyncs the week plan via resyncWeekPlanFromOrders after edit.
// Roles: ["order_staff", "manager", "admin"]
// Guards:
//   - subscription-order only (order.subscriptionId must be set)
//   - undelivered: order.status NOT in DELIVERY_DONE_STATUSES (deny-list, no drift)
//   - not recognized: isOrderRecognized(ctx, orderId) must be false
//   - not settled week (subscriptionWeeks.status !== "settled" | "reconciled")
//   - rejects remove-all (at least 1 line must remain)
//   - rejects partial-credit orders (0 < subscriptionCreditApplied < totalAmount)
// Returns: { ok: true }
```

**`resyncWeekPlanFromOrders` roles widened (2026-06-30)** — now accepts `["order_staff", "manager", "admin"]` (was `["manager", "admin"]`). Required so order_staff can trigger resync after editing a day-order (Pitfall #19).

**Amend → credit draw-down (2026-06-29).** `subscriptions.amend.amendConfirmedWeek({ subscriptionWeekId, days })` no longer bills a top-up invoice. It re-prices the plan and **bumps the amended day's actual order** (qty + `orderItemProduction`) so the larger delivery draws down the existing credit pool at delivery. Increases only; blocks amending an already-delivered day and blocks omitting an existing planned day. Returns `{ deltaTotal, addedLines, projectedShortfall, projectedEndingPool }`.

`subscriptions.queries.getWeekShortfall({ subscriptionWeekId })` (2026-06-29) — projected end-of-week credit position: `{ plannedConsumption, creditIssued, creditRemaining, projectedShortfall, projectedEndingPool, funded, hasPendingTopup, shouldOfferTopup }`. `shouldOfferTopup` = funded & projected to overrun & no unpaid top-up.

#### Reconcile (`convex/subscriptions/reconcile.ts`)

```typescript
subscriptions.reconcile.reconcileWeek({ subscriptionWeekId, shortfallFault })
  // Per-tranche FIFO rollover/expiry/carry at week-end.
  // shortfallFault: "none" | "cafe" | "frollie"
  // Expired credit → expiry ledger entries (recognized as B2B Wholesale breakage in P&L).
  // Carried credit → topup on next open week tagged with rolloverFromWeekId.
  // frollie-fault → sets refundDue (FLAG ONLY — no payout mutation).
  // Closed-week guard: refuses if status === "closed" or "reconciled".
  // Returns: { weekId, leftover, expired, carried, refundDue }
```

#### Out-of-credit (`convex/subscriptions/outOfCredit.ts`)

```typescript
subscriptions.outOfCredit.splitScheduledOrderOnCredit({ orderId })
  // Path A: splits a single-item scheduled order when credit is insufficient.
  // Covered qty stays on credit drawdown; uncovered remainder → subscription_topup invoice.
  // Returns: { coveredOrderId, topupInvoiceId | null, drawdownAmount }

subscriptions.outOfCredit.applyPartialCreditToAdHocOrder({ orderId })
  // Path B: applies min(remainingCredit, orderTotal) as a drawdown on an ad-hoc order.
  // Order stays AwaitingPayment; remainder collected via QRIS/bank.
  // Returns: { coveredAmount, remainderAmount }
```

#### Pure cores (internal, no ctx — unit-tested)

| File | Exports |
|------|---------|
| `convex/subscriptions/reconcileMath.ts` | `reconcileTranches({ tranches, policy, rolloverExpiryWeeks })` |
| `convex/subscriptions/weekBounds.ts` | `computeWeekBounds(weekStart)`, `isAlignedWeekStart(ts)` |
| `convex/subscriptions/scheduleLine.ts` | `makeScheduleLine(...)`, `validateScheduleTemplate(...)` |
| `convex/subscriptions/revenueGate.ts` | `isSubscriptionOrder(order)` |

#### Shared order helpers added

| File | Export | Purpose |
|------|--------|---------|
| `convex/orders/helpers/insertOrder.ts` | `insertOrderWithItems({ orderFields, items })` | Shared typed write path (orders + orderItems + production records). Used by `confirmWeek`. |
| `convex/orders/helpers/stripSubscriptionPricing.ts` | `stripSubscriptionPricing(order, items, role)` | Strips 6 confidential money fields from subscription orders for non-manager callers (D11). |

#### Frontend CRM routes (`src/App.tsx`)

| Route | Component | Permission |
|-------|-----------|------------|
| `/crm/customers/:cid/subscriptions/:subId/week` | `SubscriptionSchedulePage` | `canAccessCrm` (manager+admin) |
| `/crm/customers/:cid/subscriptions/:subId/week/invoice` | `SubscriptionWeeklyInvoicePage` | `canAccessCrm` |
| `/crm/funding` | `CrmFundingDashboardPage` | `canAccessCrm` |

---

### Subscription & CRM — Phase D Slice 0 shared helpers (2026-06-25)

Behavior-preserving refactors. No new public API surface — these are internal shared helpers consumed by existing Phase B call sites. All proven bit-identical by characterization tests.

#### `recognizeOnDelivery` (`convex/subscriptions/recognition.ts`)

```typescript
recognizeOnDelivery(ctx: MutationCtx, orderId: Id<"orders">, actingUserId?: Id<"users">): Promise<void>
```

Single delivery-recognition entry point. Wraps `recognizeSubscriptionDelivery`: posts a `drawdown` ledger entry against the week's credit pool and recognizes B2B Wholesale revenue. Idempotent via `creditLedger.by_order`. Token-less callers (packaging.ts, two statusUpdates.ts edges) pass `undefined` → falls back to `order.createdByUserId`. Five call sites repointed from inline `recognizeSubscriptionDelivery` calls.

#### `stripOrder` / `stripOrders` (`convex/orders/helpers/stripOrders.ts`)

```typescript
stripOrder(order: OrderWithItems, role: UserRole): OrderWithItems
stripOrders(orders: OrderWithItems[], role: UserRole): OrderWithItems[]
```

Forward seam over `stripSubscriptionPricing` (which strips 6 confidential money fields from subscription orders for non-manager roles, server-side per D11). Ten inline call sites in `convex/orders/queries.ts` repointed to `stripOrders`. `stripOrders` (batch form) is the documented seam for upcoming Phase D CRM list and timeline queries — kept intentionally even though not yet consumed by a new call site.

#### `buildInvoiceSnapshot` (`convex/subscriptions/invoicing.ts`)

```typescript
buildInvoiceSnapshot(
  ctx: QueryCtx,
  args: { subscriptionId, subscriptionWeekId, invoiceNumber, kind, lines, dueDate? }
): Promise<Omit<Doc<"invoices">, "_id" | "_creationTime">>
```

Shared invoice-snapshot builder returning the full insert object for an `invoices` row. Does **no** db write and **no** invoice-number allocation — the caller allocates `invoiceNumber` and passes it in. Consumed by both `createSubscriptionWeeklyInvoice` (kind `subscription_weekly`) and `createTopupInvoice` (kind `subscription_topup`). Behavior-preserving: golden tests assert full-shape equality per kind.

#### `accumulateOrderCogs` (`convex/lib/costCalculator.ts`)

```typescript
accumulateOrderCogs(
  items: Array<{ menuProductId?: Id<"menuProducts"> | null; quantity: number; status?: string }>,
  cogsMap: Map<string, number>
): number
```

Shared order-COGS accumulation. Skips cancelled items, items with no `menuProductId`, and items not present in `cogsMap`; multiplies unit COGS by quantity; returns integer IDR total. Adopted at `incomeStatement.ts` Site B (subscription B2B Wholesale COGS). Site A (`resolveItemsCOGS`) left as-is — it keys on `linkedMenuProductId` and builds `ProductDetail[]`, a different shape.

---

### CRM (Phase D — CRM surface, 2026-06-26)

All functions are `protectedQuery` / `protectedMutation` from `convex/lib/functions`. All roles: **manager + admin** (Pitfall #19 superset of `canAccessCrm`). All require `token: v.string()`.

#### Customers (`convex/crm/customers.ts`)

```typescript
crm.customers.createCustomer({
  name: string,
  phone?: string,
  source?: string,
  notes?: string,
  defaultAddress?: string,
  companyName?: string,
  npwp?: string,
  billingAddress?: string,
  keyContactName?: string,
  keyContactRole?: string,
  whatsapp?: string,
  email?: string,
  instagram?: string,
  otherSocials?: string[],
  deliveryAddress?: string,
  storeAddress?: string,
  otherAddresses?: string[],
  altPhone?: string,
  customerType?: string,
})
\ Returns: Id<"customers">
\ Mutation, roles: ["manager","admin"]. Atomic single insert with full CRM field union.
\ Server-sets createdBy: ctx.user.name. Drops undefined fields before insert.
\ Exists because customers.create (convex/customers/mutations.ts) only accepts
\ name/phone/source/notes/defaultAddress — the five original fields. This mutation
\ carries the complete CRM field union in one atomic write. (PR #209)

crm.customers.updateCustomerCrmFields({
  customerId: Id<"customers">,
  // All fields optional — only provided fields are patched:
  keyContactName?: string,
  keyContactRole?: string,
  whatsapp?: string,
  email?: string,
  instagram?: string,
  otherSocials?: Array<{ platform: string, handle: string, url?: string }>,
  deliveryAddress?: string,
  storeAddress?: string,
  otherAddresses?: string[],
  altPhone?: string,
  notes?: string,
})
// Returns: Id<"customers">

crm.customers.getCustomerRecord({ customerId: Id<"customers"> })
// Returns: {
//   customer: Doc<"customers">,
//   subscriptions: Doc<"subscriptions">[],
//   agreements: Doc<"supplyAgreements">[],
//   currentWeekPoolBySubscription: Record<string,
//     { week: Doc<"subscriptionWeeks">, pool: CreditPool } | null
//   >,
//   unpaidInvoices: Doc<"invoices">[],    // paymentStatus !== "Paid"
// } | null

crm.customers.getCrmHomeActiveSubscriptions()
// Returns: Array<{
//   subscription: Doc<"subscriptions">,
//   customerId: Id<"customers">,
//   customerName: string | null,
//   currentWeek: Doc<"subscriptionWeeks"> | null,
// }>
```

#### Agreements (`convex/crm/agreements.ts`)

```typescript
crm.agreements.generateAgreementUploadUrl()
// Returns: string  (Convex storage upload URL)

crm.agreements.createSupplyAgreement({
  customerId: Id<"customers">,
  subscriptionId?: Id<"subscriptions">,
  fileStorageId: Id<"_storage">,
  fileName: string,
  fileSize: number,
  status: "draft" | "signed" | "expired" | "terminated",
  signedDate?: number,
  governingLaw?: string,
  signatories?: string,
  keyTerms?: {
    weeklyQty: number, unitPrice: number, weeklyCreditAmount: number,
    baselineDailyQty: number, deliverByTime: string,
    permanentChangeNoticeDays: number, terminationNoticeDays: number,
    creditRolloverPolicy: "expire" | "rollover", termType: string,
  },
  lang: "id" | "en",
})
// Returns: Id<"supplyAgreements">

crm.agreements.addAgreementVersion({
  agreementId: Id<"supplyAgreements">,
  fileStorageId: Id<"_storage">,
  fileName: string,
  lang: "id" | "en",
})
// Returns: Id<"supplyAgreements">

crm.agreements.linkAgreementToSubscription({
  agreementId: Id<"supplyAgreements">,
  subscriptionId: Id<"subscriptions">,
})
// Returns: void  (patches both supplyAgreements.subscriptionId + subscriptions.agreementId)

crm.agreements.getAgreement({ agreementId: Id<"supplyAgreements"> })
// Returns: Doc<"supplyAgreements"> | null

crm.agreements.listAgreementsByCustomer({ customerId: Id<"customers"> })
// Returns: Doc<"supplyAgreements">[]

crm.agreements.getFileUrl({ storageId: Id<"_storage"> })
// Returns: string | null  (signed URL for browser open)
```

#### Ledger (`convex/crm/ledger.ts`)

```typescript
crm.ledger.getCreditLedgerStatement({ subscriptionWeekId: Id<"subscriptionWeeks"> })
// Returns: LedgerStatement[]  (signed amount + running balance rows via buildLedgerStatement)

crm.ledger.getWeekBackReferences({ subscriptionWeekId: Id<"subscriptionWeeks"> })
// Returns: {
//   orders: Doc<"orders">[],
//   ledgerEntries: Doc<"creditLedger">[],
//   fundingInvoice: Doc<"invoices"> | null,
// }
```

#### Timeline (`convex/crm/timeline.ts`)

```typescript
crm.timeline.logCustomerInteraction({
  customerId: Id<"customers">,
  type: "whatsapp_drafted" | "note" | "manual_milestone",
  subtype?: string,
  note?: string,
  summary?: string,
  subscriptionId?: Id<"subscriptions">,
  invoiceId?: Id<"invoices">,
  orderId?: Id<"orders">,
  agreementId?: Id<"supplyAgreements">,
})
// Returns: Id<"customerActivity">

crm.timeline.getCustomerTimeline({
  customerId: Id<"customers">,
  sinceDays?: number,   // default 14; extend to show older events ("Load older")
  types?: string[],     // category filter: "order"|"finance"|"message"|"document"|"schedule"|"milestone"
})
// Returns: { items: TimelineItem[] }
// TimelineItem: { id, eventType, at, actor?, title, detail?, subtype?, linkTo: { kind, id } }
// subtype drives the icon override (payment_funded → "funded" ✓; logged rows pass their own subtype)
// eventTypes projected: order_placed, order_delivered, invoice_sent, payment_funded,
//   subscription_started, subscription_ended, subscription_terminated, topup,
//   agreement_uploaded, agreement_signed, whatsapp_drafted, note, manual_milestone
// NOTE: types filter is in-memory post-scan (category is derived from eventType, not indexed).
```

#### Drawdown (`convex/crm/drawdown.ts`)

```typescript
crm.drawdown.getCustomerDrawdown({
  subscriptionId: Id<"subscriptions">,
  weekStart?: number,   // epoch ms; omit to resolve current week
})
// Returns: {
//   week: Doc<"subscriptionWeeks">,
//   series: DrawdownSeriesResult,
// } | null
// DrawdownSeriesResult: per-planned-day trajectory of creditRemaining + delivered pcs.
// Reads orders via by_subscriptionWeek (C9); reads ledger via by_subscriptionWeek; never re-keys balanceAfter (C10).
```

#### Additive schema indexes (C9 windowing)

Three new compound indexes added to `convex/schema.ts` — no behavior change, scan-bound only:

| Table | Index name | Fields |
|-------|-----------|--------|
| `orders` | `by_customer_orderDate` | `["customerId", "orderDate"]` |
| `invoices` | `by_customer_generatedAt` | `["customerId", "generatedAt"]` |
| `creditLedger` | `by_subscription_creationTime` | `["subscriptionId", "_creationTime"]` |

#### `getFundingDashboard` additive field

`convex/subscriptions/scheduling/queries.ts` — response now includes `customerPhone: string | null` (resolves `customer.whatsapp ?? customer.phone`). Powers the Draft-WhatsApp button on `CrmFundingDashboardPage` without an extra frontend query.

#### Frontend CRM routes (Phase D)

| Route | Component | Permission |
|-------|-----------|------------|
| `/crm` | `CrmHome` | `canAccessCrm` (manager+admin) |
| `/crm/customers/:customerId` | `CustomerDashboard` | `canAccessCrm` |
| `/crm/customers/:customerId/activity` | `CustomerActivityPage` | `canAccessCrm` |
| `/crm/customers/:customerId/agreements` | `AgreementPage` | `canAccessCrm` |
| `/crm/customers/:customerId/subscriptions/:subId` | `SubscriptionPage` | `canAccessCrm` |

### Subscription & CRM — Phase D operate-UI (deliver/recognize, top-up, reconcile, out-of-credit) — 2026-06-25

All new functions are `protectedMutation`/`protectedQuery` with `roles: ["manager","admin"]`. All require `token: v.string()`.

#### Delivery / recognize (`convex/subscriptions/delivery.ts`)

```typescript
subscriptions.delivery.markSubscriptionDelivered({ orderId, token })
  // Transitions a funded subscription order to AwaitingDelivery and recognizes the sale.
  // Deliverable statuses: PaymentReceived | BeingPrepared | AwaitingDelivery.
  // Calls recognizeSubscriptionDelivery — idempotent via creditLedger.by_order (no double drawdown).
  // Throws ConvexError if order is not a subscription order or not in a deliverable status.
  // Returns: { orderId: Id<"orders">, recognized: boolean, newlyRecognized: boolean }
  //   recognized: true if a creditLedger row exists for this order after the call.
  //   newlyRecognized: true only if recognition happened THIS call (false when recognition
  //   already fired at split time — split-then-deliver no-op is correct, not an error).
```

Pure helper (unit-tested, no ctx):
```typescript
isDeliverableSubscriptionStatus(status: string): boolean
  // Returns true for PaymentReceived | BeingPrepared | AwaitingDelivery.
```

#### Amend confirmed week (`convex/subscriptions/amend.ts`)

```typescript
subscriptions.amend.amendConfirmedWeek({ subscriptionWeekId, days, token })
  // Re-prices plannedDays for a confirmed/invoiced/paid/delivering week.
  // Positive quantity delta billed as an UNPAID top-up invoice via buildTopupInvoice.
  // Increases only — per-product decrease or removal is rejected (findProductDecreases guard).
  // Does NOT regenerate per-day orders (R3).
  // Returns: { topupInvoiceId: Id<"invoices"> | null, deltaTotal: number, addedLines: TopupLine[] }
```

Pure helpers (unit-tested, no ctx):
```typescript
computeTopupDelta(args: {
  currentQtyByProduct: Record<string, number>;
  newQtyByProduct: Record<string, number>;
  unitPrice: number;
  productNameByProduct: Record<string, string>;
}): { addedLines: TopupLine[]; deltaTotal: number }
  // Per-product positive increase delta, priced at unitPrice. Integer IDR.

findProductDecreases(
  currentQtyByProduct: Record<string, number>,
  newQtyByProduct: Record<string, number>,
): string[]
  // Returns product IDs whose amended qty is below the funded qty.
  // Used by amendConfirmedWeek to reject decreases before computing delta.
```

#### reconcileWeek — new required arg (`convex/subscriptions/reconcile.ts`)

The existing `reconcileWeek` mutation gains a REQUIRED `reconcileNote: v.string()` argument (Phase D operate-UI). Submit is disabled in the UI until the note is non-empty. The note is persisted to `subscriptionWeeks.reconcileNote`.

```typescript
subscriptions.reconcile.reconcileWeek({ subscriptionWeekId, shortfallFault, reconcileNote, token })
  // All prior behavior unchanged (FIFO rollover/expiry, breakage recognition, refundDue flag).
  // reconcileNote: non-empty string (trimmed; throws ConvexError on empty — assertReconcileNote guard).
  // Persisted to subscriptionWeeks.reconcileNote.
```

Pure helper (unit-tested, no ctx):
```typescript
assertReconcileNote(note: string): string
  // Trims note; throws ConvexError("A reconcile comment is required") if result is empty.
  // Returns the trimmed note string (used by the caller to persist).
```

#### Out-of-credit status query (`convex/subscriptions/queries.ts`)

```typescript
subscriptions.queries.getOrderCreditStatus({ orderId, token })
  // Returns credit status for a subscription order; used to gate Split and Apply-credit buttons.
  // Returns: {
  //   kind: "scheduled" | "adhoc" | "none",
  //     // "scheduled" = split path (over credit, single item) or in-credit subscription order
  //     // "adhoc"     = apply-credit path (AwaitingPayment, creditRemaining > 0)
  //     // "none"      = not a subscription order (or week/order not found)
  //     // NOTE: kind is currently advisory/unused by the frontend; buttons use canSplit/canApplyCredit.
  //   isOverCredit: boolean,
  //   creditRemaining: number | null,  // IDR; null for "none" rows
  //   orderTotal: number,              // IDR
  //   subscriptionWeekId: Id<"subscriptionWeeks"> | null,
  //   canSplit: boolean,               // precondition for splitScheduledOrderOnCredit
  //   canApplyCredit: boolean,         // precondition for applyPartialCreditToAdHocOrder
  // }
  // Skip-guarded with isManagerOrAdmin AND isSubscriptionOrder on the frontend (Pitfall #19)
  // so non-manager callers or non-subscription orders do NOT mount the protectedQuery.
```

Pure helper (unit-tested, no ctx):
```typescript
isOverCredit(orderFinalTotal: number, creditRemaining: number): boolean
  // Returns true when orderFinalTotal > creditRemaining (strict; exact coverage is NOT over-credit).
```
### Subscription credit drawdown in OrderCreate — 2026-06-29

All functions `protectedQuery`/`protectedMutation` with `roles: ["manager","admin"]`, `token: v.string()` required.

#### Subscription selector query — Slice 1 (2026-06-30) (`convex/subscriptions/queries.ts`)

```typescript
subscriptions.queries.listActiveSubscriptionsForCustomer({ customerId, token })
  // Lightweight subscription picker for the B2B order sheet.
  // Returns all active subscriptions for the customer with reservation-aware credit remaining.
  //
  // Returns: Array<{
  //   subscriptionId: Id<"subscriptions">,
  //   label: string,
  //   creditRemaining: number | null,  // null if no open funded week; integer IDR
  // }>
  //
  // creditRemaining = computeWeekAvailableCredit(weekId) — nets out un-recognized reservations.
  // D11: partner unitPrice NOT returned. Roles: order_staff + manager + admin.
```

**Role widenings — Slice 1 (2026-06-30).** The following functions previously required `["manager", "admin"]`; all now accept `["order_staff", "manager", "admin"]` so order staff can complete the B2B credit-order flow end-to-end:
- `getSubscriptionCreditContext` — credit context + split; `split.effectiveUnitPrice` is intentionally visible to order_staff (deliberate D11 carve-out, approved 2026-06-30).
- `createCreditFundedOrder` — creates a credit-funded ad-hoc order.
- `getCreditOrderWhatsappDraft` — builds the WhatsApp summary for a credit order.
- `logCustomerInteraction` (`convex/crm/timeline.ts`) — widened so order_staff's `whatsapp_drafted` activity event is not silently dropped from the CRM timeline.

Operate-surface credit functions (`getOrderCreditStatus`, `splitScheduledOrderOnCredit`, `applyPartialCreditToAdHocOrder`) intentionally remain `manager+admin` — Slice 2.

#### Credit context query (`convex/subscriptions/queries.ts`)

```typescript
subscriptions.queries.getSubscriptionCreditContext({ subscriptionId, token })
  // Per active subscription, returns the available-credit context for a new ad-hoc order.
  // Returns: {
  //   subscriptionId: Id<"subscriptions">,
  //   label: string,
  //   weekId: Id<"subscriptionWeeks"> | null,
  //   allowedProductIds: Id<"menuProducts">[],  // products in current week plan
  //   availableCredit: number,  // IDR; pool − Σ un-recognized subscriptionCreditApplied (excl. Cancelled)
  //   split: { eligibleTotal: number, offPlanTotal: number, creditCovered: number, amountDue: number } | null,
  //   plannedDeliveriesRemaining: number,
  // } | null  // null if no active subscription week
  //
  // availableCredit uses computeWeekAvailableCredit (convex/subscriptions/creditReservation.ts)
  // which nets out existing un-recognized reservations so concurrent order creation doesn't
  // double-spend the pool. eligibleTotal prices subscription-plan items at partner unitPrice.
```

#### Create credit-funded order (`convex/subscriptions/creditOrder.ts`)

```typescript
subscriptions.creditOrder.createCreditFundedOrder({
  subscriptionId: Id<"subscriptions">,
  items: Array<{ menuProductId: Id<"menuProducts">, qty: number, unitPrice: number }>,
  customerId: Id<"customers">,
  channel: string,
  token: string,
})
  // Creates an ad-hoc order funded by the subscription customer's prepaid weekly credit.
  // Server-side split re-derivation (ignores client-supplied split to prevent tampering).
  //
  // Full cover (creditCovered >= orderTotal):
  //   fundingSource: "subscription_credit", paymentStatus: "Paid",
  //   paymentMethod: "subscription_credit", status: "PaymentReceived"
  //
  // Partial cover (creditCovered < orderTotal):
  //   fundingSource: "deposit", status: "AwaitingPayment", paymentStatus: "Unpaid"
  //   subscriptionCreditApplied = creditCovered (reservation only; no ledger entry)
  //
  // In both cases: NO creditLedger entry at creation. Recognition draws at delivery via
  // recognizeSubscriptionDelivery (subscriptionCreditApplied ?? totalAmount).
  //
  // Returns: { orderId, creditCovered, amountDue, offPlanTotal, eligibleShortfall }
  //   eligibleShortfall: IDR amount of eligible items not covered by credit (= 0 for full cover)
```

Pure helper (unit-tested, no ctx, `convex/subscriptions/creditMath.ts`):
```typescript
computeCreditSplit(args: {
  items: CartItem[],
  allowedProductIds: Set<string>,
  unitPriceByProduct: Record<string, number>,
  availableCredit: number,
}): { eligibleTotal: number, offPlanTotal: number, creditCovered: number, amountDue: number }
  // Splits cart into credit-eligible (re-priced to subscription partner unitPrice) vs off-plan
  // (retail price). creditCovered = min(eligibleTotal, availableCredit). Integer IDR throughout.
```

Shared reservation-netting helper (internal, `convex/subscriptions/creditReservation.ts`):
```typescript
computeWeekAvailableCredit(ctx: QueryCtx, weekId: Id<"subscriptionWeeks">): Promise<number>
  // pool − Σ subscriptionCreditApplied for non-Cancelled, un-recognized orders in the week.
  // "Un-recognized" = no creditLedger drawdown row for that orderId.
```

#### WhatsApp draft query (`convex/subscriptions/creditOrder.ts`)

```typescript
subscriptions.creditOrder.getCreditOrderWhatsappDraft({ orderId, token })
  // Returns { text: string } | null — WhatsApp summary for a credit-funded ad-hoc order
  // using the SUBSCRIPTION_CREDIT_TOPUP template (convex/whatsappTemplates/render.ts).
  // null if order is not a credit-funded subscription order.
```

#### Path B behavior change (`convex/subscriptions/outOfCredit.ts`)

`applyPartialCreditToAdHocOrder` (Path B: apply credit to an existing AwaitingPayment ad-hoc order) is refactored from eager drawdown to the reservation model:
- **Before (IMP-4 bug):** posted a `drawdown` creditLedger entry immediately at application time.
- **After (IMP-4 fix):** sets `subscriptionCreditApplied` on the order row only; posts NO ledger entry. Recognition draws at delivery. `getOrderCreditStatus.canApplyCredit` returns `false` once reserved.

---

### Subscription Telegram notification layer — Phase E Slice 1 (2026-06-25)

Outbound-only Telegram reminders for subscription operations. **All functions are `internal*` (cron context, no token, no public/staff surface).** Read-only except a `telegramDeliveries` receipt. No schema change. Ship-dark until an operator assigns the `subscription-ops` / `founders` chats via `/admin/telegram-chats`.

#### Read-only queries (`convex/subscriptions/reminders/queries.ts`)

All `internalQuery`, args `{}`, returning typed rows from `convex/subscriptions/reminders/types.ts`. Integer IDR/pcs throughout; delivered = `order.status === "Complete"`.

| Function | Returns | What it lists |
|----------|---------|---------------|
| `getWeeksToConfirm` | `ConfirmRow[]` | `planned` weeks of active subs awaiting confirmation. |
| `getWeeklyInvoicesDue` | `InvoiceDueRow[]` | `confirmed`/`invoiced` unpaid weeks of active subs; `amountDue = Σ plannedDays[].items[].lineTotal` (not `creditIssued`, which is 0 pre-payment). |
| `getTodaySubscriptionDeliveries` | `TodayDeliveriesRow[]` | Today's (WIB) planned deliveries per active sub, split per product; flags a deleted product (`missingProduct`, EC6). |
| `getDaysApproachingCutoff` | `ConfirmRow[]` | Active subs with an unlocked planned day landing tomorrow (WIB) — notify only, no lock flip (Slice 2). |
| `getWeeksToReconcile` | `ReconcileRow[]` | `delivering` weeks whose window has ended (`weekEnd < now`). Intentionally not filtered by sub status (a terminated sub's final week still reconciles). |
| `getWeeklyDeliveryProgress` | `DeliveryProgressRow[]` | Per active sub: `weekPlannedPcs` vs `deliveredPcs` (Complete orders via `orders.by_subscriptionWeek`, summing `orderItems.quantity`); `remaining`/`overBy` clamped to ≥ 0. |

#### `subscriptionSlotKey` (`convex/telegram/deliveryReceipts.ts`)

```typescript
subscriptionSlotKey(kind: string, nowMs: number): string  // → `sub:${kind}:${getWibDateStr(nowMs)}`
```

WIB-day-keyed delivery-receipt slot. Sender and the +15min watchdog compute the same key (no WIB-midnight slot), so the watchdog finds the sender's receipt and skips re-firing.

#### `ReminderKind` / `roleForKind` (`convex/telegram/subscriptionReminders/kinds.ts`)

`REMINDER_KINDS` (6 literals), `ReminderKind` union, and `roleForKind(kind): TelegramRole` — an exhaustive `Record` mapping the 5 ops kinds → `subscription-ops` and `weekly-delivery-progress` → `founders` (a new kind is a compile error until routed).

#### Send triad (`convex/telegram/subscriptionReminders/sendSubscriptionReminder.ts`)

```typescript
sendSubscriptionReminder({ kind })            // internalAction: build + chunk + send + record receipt
sendSubscriptionReminderResilient({ kind, attempt? })  // internalAction: transient retry (cronRetry, max 3)
watchdogSubscriptionReminder({ kind })        // internalAction: re-fire if no receipt for the slot
```

Reuses `cronRetry.ts` and `deliveryReceipts.ts`. Fails fast (ship-dark) when no chat is assigned for the kind's role. Messages are chunked under Telegram's 4096-char limit with a partial-send breadcrumb (mirrors `sendSalesSummary`). Registered by 12 crons in `convex/crons.ts` (6 primary + 6 watchdog, UTC-minute-unique — asserted by `convex/crons.test.ts`).

---

### Environment Variables

| Variable | Description | Lifespan |
|----------|-------------|----------|
| `K3MART_API_TOKEN` | K3 Mart JWT token (fallback if DB token unavailable) | ~24h |
| `GOBIZ_API_TOKEN` | GoBiz access token (Bearer token, fallback if DB token unavailable) | ~1h |
| `GOBIZ_REFRESH_TOKEN` | GoBiz refresh token (fallback if DB token unavailable) | days/weeks |
| `QRIS_ENABLED` | Feature flag — `"true"` shows the Charge via QRIS button + arms the action/webhook. Unset = OFF (current prod state pending Xendit KYB). | persistent |
| `XENDIT_API_KEY` | Xendit secret key (Basic-auth username, empty password). Action throws if missing. Server-side only, never returned to client. | persistent |
| `XENDIT_WEBHOOK_TOKEN` | Xendit webhook verification token (constant-time compared against the `x-callback-token` header). | persistent |

---

### Common Error Cases

| Scenario | Error Message |
|----------|---------------|
| Recipe used in products | "Cannot delete recipe. Used in products: [names]" |
| Customer has orders | "Cannot delete customer with existing orders" |
| Delete non-draft order | "Can only delete orders in Draft status" |
| Reference not found | "Customer not found" / "Recipe version not found" |
| Invalid status transition | "Invalid status transition from X to Y" |
| Missing required field | Convex validator error (automatic) |

---

## Convex Quick Reference

```typescript
// Frontend: Reading data (reactive, auto-updates)
const recipes = useQuery(api.recipes.list);
const recipe = useQuery(api.recipes.getById, { id: recipeId });
const conditional = useQuery(api.recipes.getById, id ? { id } : "skip");
if (recipes === undefined) return <Loading />;

// Frontend: Writing data
const createRecipe = useMutation(api.recipes.create);
await createRecipe({ name: "Recipe Name", tagIds: [], createdBy: "admin" });

// Backend: Query
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("recipes").collect();
  },
});

// Backend: Mutation with auth
export const create = mutation({
  args: { token: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.token, ["admin"]);
    const { token: _, ...data } = args;
    return await ctx.db.insert("recipes", data);
  },
});
```
