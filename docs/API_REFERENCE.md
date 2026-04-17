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

## Reports: Unit Economics (Phase 80)

Manager/admin analytics queries in `convex/reports/unitEconomics.ts`. All queries share filter args: `{ fromTs: number, toTs: number, channels?: string[], menuProductIds?: Id<"menuProducts">[] }`. Excludes `Draft` and `Cancelled` orders. Uses `by_completed_at` (primary) + `by_order_date` (legacy fallback) indexes for bounded scans. Revenue math sourced from denormalized `orderItems.lineTotal` via `itemNetRevenue`/`itemGrossRevenue`/`itemDiscount` helpers. Production-unit counting iterates `componentTypes` where `category="production" AND unit="pcs"` — Big Ball + Mid Ball + Hazelnut (+future) counted automatically.

| Query | Returns | Used by |
|---|---|---|
| `kpiSummary` | `{ current, prior, delta }` across 6 KPIs | A: KPI Row |
| `byWeekday` | `{ labels, orders[7], units[7] }` (Mon-Sun) | B1 |
| `dayHourHeatmap` | `{ grid: number[7][8], max, rowLabels, colLabels }` | B2 |
| `channelEconomics` | per-channel `{ gross, discount, fees, net, units, takePct, revPerUnit, netPerUnit }` | C3, C4 |
| `volumeByType` | `{ buckets, series: [{ code, name, values[] }] }` with day/week granularity | D1, D4 |
| `unitsPerTxnByChannel` | per-channel `{ units, orderCount, unitsPerTxn }` | D2 |
| `aovByChannel` | per-channel `{ grossAov, netAov }` | D3 |
| `skuPareto` | `{ rows: [{ name, revenue, cumulativePct }], totalRevenue }` (topN + "Other") | E1 |
| `skuChannelMatrix` | `{ products, channels, matrix: [{ product, channels: [{channel, revenue, pctOfChannel}] }] }` | E2 |
| `channelMomentum` | `{ bucketCount, channels: [{ channel, revenueSpark, unitsSpark, aovSpark, totalRevenue, priorRevenue, wowPct }] }` with adaptive buckets (7/13/12 by span) | F1 |
| `rollingTrend` | `{ dates, daily, rolling7, rolling28 }` | F2 |

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

### Migration Mutations (one-time, run from dashboard)

#### `externalData.mutations.seedK3MartOutletNames`
Upserts 7 known K3Mart outlets with real location names. Safe to run multiple times.

**Returns:** `{ updated, created }`

**Run order:** Must run BEFORE `backfillRevenueOutletIds`.

#### `externalData.mutations.backfillRevenueOutletIds`
Patches existing K3Mart revenue records with `outletId` by parsing the outlet name from the dedup key (`externalTransactionId`). Skips records that already have `outletId`.

**Returns:** `{ patched, skipped, total }`

**Run order:** Must run AFTER `seedK3MartOutletNames`.

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

### Environment Variables

| Variable | Description | Lifespan |
|----------|-------------|----------|
| `K3MART_API_TOKEN` | K3 Mart JWT token (fallback if DB token unavailable) | ~24h |
| `GOBIZ_API_TOKEN` | GoBiz access token (Bearer token, fallback if DB token unavailable) | ~1h |
| `GOBIZ_REFRESH_TOKEN` | GoBiz refresh token (fallback if DB token unavailable) | days/weeks |

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
