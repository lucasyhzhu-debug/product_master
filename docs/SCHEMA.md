# Database Schema Reference

> **Purpose:** Complete Convex database schema documentation for Frollie Recipe Master.
> **When to read:** Before making database changes, adding fields, or modifying relationships.

## Table of Contents
- [System Architecture Overview](#system-architecture-overview)
- [Complete Database Schema](#complete-database-schema)
- [External Integration Tables (6 Tables)](#external-integration-tables-6-tables)
- [Order Status Workflow](#order-status-workflow)
- [Visual Schema Diagram](#visual-schema-diagram)
- [Data Flow Patterns](#data-flow-patterns)
- [Database Conventions](#database-conventions)

---

## System Architecture Overview

**Convex Architecture:**
```
User Browser
    ↓
React Components (src/pages/)
    ↓
Convex React Hooks (useQuery, useMutation)
    ↓
Convex Client (auto-generated API)
    ↓ WebSocket (real-time)
Convex Backend (convex/)
    ├── queries.ts (read operations)
    └── mutations.ts (write operations)
    ↓
Convex Database (automatic)
```

**Layer Responsibilities:**
- **Frontend Pages**: Handle routing, UI rendering, user interactions
- **Convex Hooks**: `useQuery` for reactive reads, `useMutation` for writes
- **Convex Queries**: Define read operations, return data reactively
- **Convex Mutations**: Define write operations, transactional updates
- **Convex DB**: Automatic indexing, real-time sync, ACID transactions

**Key Benefits:**
- Real-time updates: Data changes sync instantly to all connected clients
- Type safety: TypeScript types auto-generated from schema
- No cache management: Convex handles data consistency automatically
- Serverless: No servers to manage, auto-scaling

---

## Complete Database Schema (30 Tables)

Schema defined in `convex/schema.ts` using Convex's type-safe schema definition.

### 1. `ingredients` - Food Ingredients
```typescript
ingredients: defineTable({
  name: v.string(),                           // e.g., "Tepung Terigu"
  brand: v.optional(v.string()),              // e.g., "Cakra Kembar"
  procurementSource: v.optional(v.string()),  // e.g., "Tokopedia"
  unitType: v.string(),                       // g, kg, ml, l, pcs
  volumePurchased: v.number(),                // e.g., 1 (kg)
  priceExclShipping: v.number(),              // IDR
  shippingCost: v.number(),                   // IDR
  createdBy: v.string(),
  // Denormalized for fast queries
  costPerBaseUnit: v.optional(v.number()),
  baseUnit: v.optional(v.string()),
  // Inventory tracking link (Phase 20)
  ingredientComponentTypeId: v.optional(v.id("componentTypes")), // Links to componentType for inventory tracking
})
  .index("by_name", ["name"])
```

### 2. `packagingMaterials` - Packaging Materials
```typescript
packagingMaterials: defineTable({
  name: v.string(),
  brand: v.optional(v.string()),
  procurementSource: v.optional(v.string()),
  unitType: v.string(),                       // pcs, m, cm, sheets
  volumePurchased: v.number(),
  priceExclShipping: v.number(),
  shippingCost: v.number(),
  createdBy: v.string(),
  // Denormalized
  costPerBaseUnit: v.optional(v.number()),
  baseUnit: v.optional(v.string()),
})
  .index("by_name", ["name"])
```

### 3. `tags` - Category Tags
```typescript
tags: defineTable({
  name: v.string(),                           // e.g., "Dubai-Snack"
})
  .index("by_name", ["name"])
// Seeded: Dubai-Snack, Extruded-Snack, Sachet, Pouch, Box
```

### 4. `menuProducts` - Predefined Menu Products
```typescript
menuProducts: defineTable({
  code: v.string(),                           // e.g., "ORIGINAL" (auto-generated from name)
  name: v.string(),                           // e.g., "Original"
  grams: v.optional(v.number()),              // Weight in grams (food products only)
  defaultPrice: v.number(),                   // IDR 50000
  productionType: v.optional(v.string()),     // DEPRECATED - use BOM components
  productionUnits: v.optional(v.number()),    // DEPRECATED - use BOM components
  isActive: v.optional(v.boolean()),          // Active/inactive toggle
  isFixed: v.optional(v.boolean()),           // Prevents deletion when true
  unitCost: v.optional(v.number()),           // COGS in IDR (cached from BOM)
  cachedProductionSummary: v.optional(v.string()), // e.g., "1 Big Ball, 2 Mid Ball"
  // POS Slot System (dynamic, no upper limit):
  posSlot: v.optional(v.number()),            // Food POS slot (1, 2, 3, ...), null = not on POS
  packagingPosSlot: v.optional(v.number()),   // Packaging POS slot, null = not on POS
  productType: v.optional(v.union(v.literal("food"), v.literal("packaging"))),
})
  .index("by_code", ["code"])
  .index("by_active", ["isActive"])
  .index("by_pos_slot", ["posSlot"])
  .index("by_packaging_pos_slot", ["packagingPosSlot"])
  .index("by_default_price", ["defaultPrice"]) // For GoBiz auto-matching
```

**POS Slots:** Dynamic numbering (v.number, no hardcoded limit). Products can be assigned to food POS or packaging POS. Runtime validation ensures positive integers.

**Product Types:**
- `food` - Has production components (balls) + packaging components, shown on food POS
- `packaging` - Has only packaging components, shown on packaging POS in order form

### 5. `recipes` - Recipe Parent Entity
```typescript
recipes: defineTable({
  name: v.string(),                           // e.g., "Choco Crunch Base"
  tagIds: v.array(v.id("tags")),              // M2M via array (no junction table)
  createdBy: v.string(),
})
  .index("by_name", ["name"])
```

### 6. `recipeVersions` - Versioned Recipe Data
```typescript
recipeVersions: defineTable({
  recipeId: v.id("recipes"),
  versionNumber: v.number(),                  // 1, 2, 3...
  versionName: v.string(),                    // e.g., "Initial Formula"
  description: v.optional(v.string()),
  estimatedYieldGrams: v.optional(v.number()),
  isSingleComponent: v.boolean(),
  isReusableComponent: v.boolean(),
  copiedFromVersionId: v.optional(v.id("recipeVersions")),
  createdBy: v.string(),
  // Cached costs (hybrid approach)
  cachedTotalCost: v.optional(v.number()),
  cachedCostPerGram: v.optional(v.number()),
  costCacheUpdatedAt: v.optional(v.number()),
})
  .index("by_recipe", ["recipeId"])
  .index("by_recipe_version", ["recipeId", "versionNumber"])
  .index("by_reusable", ["isReusableComponent"])
```

### 7. `recipeComponents` - Components in a Recipe Version
```typescript
recipeComponents: defineTable({
  recipeVersionId: v.id("recipeVersions"),
  sortOrder: v.number(),
  componentName: v.string(),                  // e.g., "Dough Base"
  linkedRecipeVersionId: v.optional(v.id("recipeVersions")),
  // Cached
  cachedSubtotalCost: v.optional(v.number()),
})
  .index("by_version", ["recipeVersionId"])
  .index("by_linked_version", ["linkedRecipeVersionId"])
```

### 8. `componentIngredients` - Ingredients in a Component
```typescript
componentIngredients: defineTable({
  recipeComponentId: v.id("recipeComponents"),
  ingredientId: v.id("ingredients"),
  sortOrder: v.number(),
  unit: v.string(),                           // g, kg, ml, l, pcs
  quantity: v.number(),                       // e.g., 500 (g)
  // Denormalized for display
  ingredientName: v.optional(v.string()),
  cachedLineCost: v.optional(v.number()),
})
  .index("by_component", ["recipeComponentId"])
  .index("by_ingredient", ["ingredientId"])
```

### 9. `packagingRecipes` - Packaging Parent Entity
```typescript
packagingRecipes: defineTable({
  name: v.string(),                           // e.g., "Standard Sachet"
  tagIds: v.array(v.id("tags")),
  createdBy: v.string(),
})
  .index("by_name", ["name"])
```

### 10. `packagingVersions` - Versioned Packaging Data
```typescript
packagingVersions: defineTable({
  packagingRecipeId: v.id("packagingRecipes"),
  versionNumber: v.number(),
  versionName: v.string(),
  description: v.optional(v.string()),
  copiedFromVersionId: v.optional(v.id("packagingVersions")),
  createdBy: v.string(),
  // Cached
  cachedTotalCost: v.optional(v.number()),
  costCacheUpdatedAt: v.optional(v.number()),
})
  .index("by_packaging", ["packagingRecipeId"])
  .index("by_packaging_version", ["packagingRecipeId", "versionNumber"])
```

### 11. `packagingComponents` - Components in Packaging Version
```typescript
packagingComponents: defineTable({
  packagingVersionId: v.id("packagingVersions"),
  sortOrder: v.number(),
  componentName: v.string(),                  // e.g., "Inner Sachet"
  cachedSubtotalCost: v.optional(v.number()),
})
  .index("by_version", ["packagingVersionId"])
```

### 12. `packagingComponentMaterials` - Materials in Packaging Component
```typescript
packagingComponentMaterials: defineTable({
  packagingComponentId: v.id("packagingComponents"),
  packagingMaterialId: v.id("packagingMaterials"),
  sortOrder: v.number(),
  unit: v.string(),                           // pcs, m, cm, sheets
  quantity: v.number(),
  // Denormalized
  materialName: v.optional(v.string()),
  cachedLineCost: v.optional(v.number()),
})
  .index("by_component", ["packagingComponentId"])
  .index("by_material", ["packagingMaterialId"])
```

### 13. `products` - Product Parent Entity
```typescript
products: defineTable({
  name: v.string(),                           // e.g., "Choco Crunch 50g"
  tagIds: v.array(v.id("tags")),
  createdBy: v.string(),
})
  .index("by_name", ["name"])
```

### 14. `productVersions` - Product Version with COGS
```typescript
productVersions: defineTable({
  productId: v.id("products"),
  versionNumber: v.number(),
  versionName: v.string(),
  description: v.optional(v.string()),
  recipeVersionId: v.id("recipeVersions"),    // Pinned recipe
  packagingVersionId: v.id("packagingVersions"), // Pinned packaging
  retailPriceIdr: v.number(),
  numPieces: v.number(),
  gramsPerPiece: v.number(),
  copiedFromVersionId: v.optional(v.id("productVersions")),
  createdBy: v.string(),
  // Denormalized for display
  recipeName: v.optional(v.string()),
  recipeVersionName: v.optional(v.string()),
  packagingName: v.optional(v.string()),
  packagingVersionName: v.optional(v.string()),
  // Cached COGS
  cachedCogs: v.optional(v.object({
    totalGrams: v.number(),
    recipeCogs: v.optional(v.number()),
    packagingCogs: v.optional(v.number()),
    totalCogs: v.optional(v.number()),
    contributionMargin: v.optional(v.number()),
    contributionMarginPct: v.optional(v.number()),
  })),
  cogsCacheUpdatedAt: v.optional(v.number()),
})
  .index("by_product", ["productId"])
  .index("by_product_version", ["productId", "versionNumber"])
  .index("by_recipe_version", ["recipeVersionId"])
  .index("by_packaging_version", ["packagingVersionId"])
```

### 15. `customers` - Customer Entity
```typescript
customers: defineTable({
  name: v.string(),
  phone: v.optional(v.string()),              // WhatsApp number
  source: v.optional(v.string()),             // 'WhatsApp', 'Instagram', 'Friend'
  notes: v.optional(v.string()),
  createdBy: v.string(),
})
  .index("by_name", ["name"])
  .index("by_phone", ["phone"])
```

### 16. `orders` - Order Entity
```typescript
orders: defineTable({
  orderNumber: v.string(),                    // Format: "0129-001" (MMDD-seq)
  customerId: v.id("customers"),
  // Denormalized customer info
  customerName: v.string(),
  customerPhone: v.optional(v.string()),

  // Status workflow
  status: v.string(),                         // Draft|AwaitingPayment|Confirmed|...
  awaitingPaymentSince: v.optional(v.number()),

  // Payment
  paymentStatus: v.string(),                  // Unpaid|Partial|Paid
  paymentMethod: v.optional(v.string()),      // BCA, QRIS, Cash

  orderDate: v.number(),                      // timestamp
  dueDate: v.optional(v.number()),

  // Totals (denormalized)
  totalAmount: v.number(),
  totalCost: v.number(),
  totalMargin: v.number(),

  // Sales tracking
  channel: v.optional(v.string()),            // IG, WA, Shopee, Tokopedia
  soldBy: v.optional(v.string()),

  // Delivery info
  deliveryType: v.string(),                   // Pickup, Delivery
  pickupLocation: v.optional(v.string()),
  deliveryAddress: v.optional(v.string()),
  contactWa: v.optional(v.string()),
  contactIg: v.optional(v.string()),

  // Shipping
  shippingAgency: v.optional(v.string()),
  shippingNumber: v.optional(v.string()),

  // Cancellation
  cancellationReason: v.optional(v.string()),

  notes: v.optional(v.string()),
  createdBy: v.string(),
  itemCount: v.number(),

  // PRD-0 additions:
  orderLevelDiscount: v.optional(v.number()),
  orderLevelDiscountType: v.optional(v.union(
    v.literal("amount"),
    v.literal("percentage")
  )),

  // Voucher tracking (optional - only if voucher applied)
  voucherId: v.optional(v.id("vouchers")),
  voucherCode: v.optional(v.string()),           // Snapshot of code at order time
  voucherDiscountValue: v.optional(v.number()),  // Calculated discount snapshot
  lowPriceConfirmed: v.optional(v.boolean()),    // True if user confirmed < 20k order
})
  .index("by_order_number", ["orderNumber"])
  .index("by_customer", ["customerId"])
  .index("by_due_date", ["dueDate"])
  .index("by_status", ["status"])
  .index("by_channel", ["channel"])
  .index("by_status_due_date", ["status", "dueDate"])
```

### 17. `orderItems` - Order Line Items
```typescript
orderItems: defineTable({
  orderId: v.id("orders"),
  // Product info (standalone - no FK)
  productName: v.string(),
  productVariant: v.optional(v.string()),
  quantity: v.number(),
  unitPrice: v.number(),
  unitCost: v.number(),
  discountAmount: v.number(),
  // Calculated totals
  lineTotal: v.number(),
  lineCost: v.number(),
  lineMargin: v.number(),
  // Optional menu product link
  menuProductId: v.optional(v.id("menuProducts")),
  // PRD-0 additions for Kitchen View:
  productionType: v.optional(v.string()),     // "original" or "bite_sized"
  productionUnits: v.optional(v.number()),    // Balls needed for this item
  // PRD-6: Visual package status tracking
  packageStatus: v.optional(v.union("empty", "filling", "filled", "packed")),
  ballsFilled: v.optional(v.number()),        // Current balls in package
  isProductionComplete: v.optional(v.boolean()),
})
  .index("by_order", ["orderId"])
  .index("by_menu_product", ["menuProductId"])
```

**Kitchen Ball Tracking (PRD-1 → PRD-5 Migration):**

> **Note:** As of 2026-02-03, production tracking uses `orderItemProduction` table exclusively.

**Production Tracking System:**
- Production progress tracked in `orderItemProduction` table
- `unitsRemaining` = units still needed, `unitsCompleted` = units done
- Supports multiple production types per item (combo packs)
- Order completion determined by all production records having `unitsRemaining === 0`
- Visual tracking: `ballsFilled` and `packageStatus` for UI display
- `productionType === "original"` → "big" balls, `productionType === "bite_sized"` → "mid" balls

**Ball Distribution Priority:**
When balls are added to the kitchen tray, they are distributed to pending orders in this priority:
1. **Due date** (earliest first)
2. **Total units** (largest orders first)
3. **Order date** (oldest first)

See `convex/orders/helpers/ballDistribution.ts` for implementation.

### 18. `orderMessages` - WhatsApp Message Tracking (PRD-0)
```typescript
orderMessages: defineTable({
  orderId: v.id("orders"),
  template: v.string(),                       // e.g., "payment_request"
  messageHash: v.string(),                    // SHA-256 for deduplication
  sentAt: v.number(),                         // Timestamp
  sentBy: v.string(),                         // User who sent
  messagePreview: v.optional(v.string()),     // First 100 chars
})
  .index("by_order", ["orderId"])
  .index("by_order_template", ["orderId", "template"])
```

**Purpose:** Track sent WhatsApp messages for deduplication (5-minute window prevents duplicates).

**Template Types:**
- `payment_request` - Bank transfer details
- `production_started` - Production notification
- `delivery_complete` - Delivery confirmation
- `receipt` - Order receipt
- `shipping` - Shipping notification
- `pickup_ready` - Pickup notification

### 19. `productionTargets` - Daily Production Goals (Kitchen V3)
```typescript
productionTargets: defineTable({
  date: v.string(),                             // YYYY-MM-DD
  productionUnitTypeId: v.id("productionUnitTypes"),
  autoTargetQuantity: v.number(),               // Calculated from confirmed orders
  manualOverride: v.optional(v.number()),       // Manager addition
  createdBy: v.optional(v.string()),
  createdAt: v.number(),
})
  .index("by_date", ["date"])
  .index("by_type_date", ["productionUnitTypeId", "date"])
```

**Purpose:** Daily ball production goals per unit type (Big Ball / Mid Ball). Auto-calculated from confirmed order requirements, with optional manager override. `effectiveTarget = autoTargetQuantity + (manualOverride ?? 0)`.

### 20. `productionCounts` - Running Production Tallies (Kitchen V3)
```typescript
productionCounts: defineTable({
  menuProductId: v.id("menuProducts"),
  boxed: v.number(),                            // Total boxed since last reset
  stickered: v.number(),                        // Total stickered since last reset
  packed: v.number(),                           // Total packed since last reset
  shippedToGoldfinch: v.optional(v.number()),   // Boxes shipped to Goldfinch depot since last reset
  lastResetAt: v.optional(v.number()),          // When counts were last reset
  lastResetBy: v.optional(v.string()),          // Who reset the counts
})
  .index("by_menu_product", ["menuProductId"])
```

**Purpose:** Running totals per menu product tracking progression through the production pipeline: boxing → stickering → packing. Derived availability: `availableForStickering = boxed - stickered`, `availableForPacking = stickered - packed`. Manager/admin can reset counts to zero via `resetCounts` mutation. `shippedToGoldfinch` tracks boxes shipped to the Goldfinch GoFood depot.

### 21. `productionLog` - Production Audit Log (Kitchen V3)
```typescript
productionLog: defineTable({
  menuProductId: v.id("menuProducts"),
  action: v.union(
    v.literal("box"), v.literal("unbox"),
    v.literal("sticker"), v.literal("unsticker"),
    v.literal("pack"), v.literal("unpack")
  ),
  quantity: v.number(),                         // Always positive
  timestamp: v.number(),                        // Date.now()
  performedBy: v.string(),                      // Username from token
  orderId: v.optional(v.id("orders")),          // For pack/unpack actions
  orderItemId: v.optional(v.id("orderItems")),  // For pack/unpack actions
  note: v.optional(v.string()),                 // e.g., "correction"
})
  .index("by_menu_product", ["menuProductId"])
  .index("by_timestamp", ["timestamp"])
```

**Purpose:** Immutable audit trail for every production action. Every `boxProducts`, `stickerProducts`, `togglePackOrderLineItem`, and `markOrderReady` call writes a log entry. Supports daily summaries via compound `by_menu_product_timestamp` index.

### 22. `gofoodDepotStock` - GoFood Depot Running Stock (Goldfinch)
```typescript
gofoodDepotStock: defineTable({
  menuProductId: v.id("menuProducts"),     // Which product
  quantity: v.number(),                    // Current boxes at Goldfinch (can go negative = debt)
  stickerDeficit: v.optional(v.number()), // Cumulative sticker shortfall
  lastUpdated: v.number(),                // Timestamp of last change
})
  .index("by_menuProduct", ["menuProductId"])
```

**Purpose:** Per-product running stock at the Goldfinch GoFood depot. Source of truth for "what's at Goldfinch." Incremented by `recordShipment` (ship to depot), decremented by `processSyncSales` (GoFood sale detected). Quantity can go negative (= debt when sales exceed shipments). `stickerDeficit` tracks cumulative sticker shortfall when stickers are insufficient at Goldfinch during sale processing.

### 23. `gofoodDepotShipments` - Depot Shipment Audit Log
```typescript
gofoodDepotShipments: defineTable({
  date: v.string(),                          // YYYY-MM-DD
  menuProductId: v.id("menuProducts"),       // Which product
  quantity: v.number(),                      // How many boxes shipped
  stickersTransferred: v.number(),           // How many stickers transferred alongside
  shippedBy: v.string(),                     // Who confirmed the shipment
  timestamp: v.number(),                     // When confirmed
})
  .index("by_date", ["date"])
  .index("by_product_date", ["menuProductId", "date"])
```

**Purpose:** Audit log of every shipment from Office to Goldfinch. Enables freshness tracking (product age at depot calculated from shipment dates using FIFO assumption). Multiple shipments per day are supported (e.g., morning + emergency restock).

### 24. `vouchers` - Discount Voucher Codes
```typescript
vouchers: defineTable({
  // Core identification
  code: v.string(),                               // Unique, uppercase (e.g., "FREESHIP25")
  name: v.string(),                               // Admin display name
  description: v.optional(v.string()),

  // Discount configuration
  discountType: v.union(
    v.literal("amount"),
    v.literal("percentage")
  ),
  discountValue: v.number(),                      // IDR amount or percentage (0-100)

  // Constraints
  minimumOrderAmount: v.optional(v.number()),     // Min order to apply voucher
  maximumDiscount: v.optional(v.number()),        // Cap for percentage discounts

  // Validity period
  isActive: v.boolean(),
  validFrom: v.optional(v.number()),              // Timestamp
  validUntil: v.optional(v.number()),             // Timestamp

  // Usage limits
  usageLimit: v.optional(v.number()),             // Total uses allowed (null = unlimited)
  usageCount: v.number(),                         // Current total usage
  usagePerCustomer: v.optional(v.number()),       // Per-customer limit (null = unlimited)

  // Manager Override fields (for single-use override vouchers)
  isManagerOverride: v.optional(v.boolean()),     // True if auto-generated override
  overrideReason: v.optional(v.string()),         // Required reason for override
  overrideOrderId: v.optional(v.id("orders")),    // Link to specific order

  // Audit
  createdBy: v.string(),
  createdAt: v.number(),                          // Timestamp
})
  .index("by_code", ["code"])
  .index("by_active", ["isActive"])
  .index("by_active_valid", ["isActive", "validFrom"])
```

**Voucher Types:**
- **Regular vouchers**: Created by admin in VouchersManager, reusable based on usage limits
- **Manager overrides**: Auto-generated single-use codes for special discounts, expire in 24 hours

**Business Rules:**
- Codes are automatically uppercase
- Manager overrides require `overrideReason` and are automatically single-use
- Vouchers are snapshotted on orders (code, discount value) for historical accuracy
- Vouchers auto-release when order is edited (user must re-apply)
- Final price after discount must be > 0 (hard block)
- Final price < Rp 20,000 triggers confirmation dialog

### 23. `voucherUsage` - Per-Customer Voucher Usage Tracking
```typescript
voucherUsage: defineTable({
  voucherId: v.id("vouchers"),
  customerId: v.id("customers"),
  orderId: v.id("orders"),
  usedAt: v.number(),                             // Timestamp
})
  .index("by_voucher", ["voucherId"])
  .index("by_customer", ["customerId"])
  .index("by_voucher_customer", ["voucherId", "customerId"])
  .index("by_order", ["orderId"])
```

**Purpose:** Enforce per-customer usage limits (e.g., "max 1 use per customer").

**Usage Flow:**
1. User enters voucher code in checkout
2. Backend validates code, checks usage limits
3. On order creation: `usageCount` increments, `voucherUsage` record created
4. On order cancellation: `usageCount` decrements, `voucherUsage` record deleted
5. On order edit: voucher auto-released (usage count decremented, record deleted)

---

### 24. `productInventory` - Finished Goods Stock by Location (Phase 17.1)
```typescript
productInventory: defineTable({
  menuProductId: v.id("menuProducts"),  // Which product
  locationId: v.id("storageLocations"), // Which location
  quantity: v.number(),                 // Current stock (can be negative with manager override)
  lastUpdated: v.number(),              // Timestamp of last stock change
})
  .index("by_product_location", ["menuProductId", "locationId"])
  .index("by_location", ["locationId"])
```

**Purpose:** Tracks how many boxes of each finished product are at each storage location. Upserted on every add/drawdown/adjustment.

**Key Operations:**
- `addStock`: kitchen adds after production (upsert, log transaction)
- `adjustStock`: manager correction with required reason (allows negative)
- `fulfillFromInventory`: atomic drawdown for a full order (checks all items, deducts all or throws)
- `processGofoodSales`: internal auto-deduct for GoFood sync (negative stock allowed)

---

### 25. `productInventoryTransactions` - Finished Goods Audit Log (Phase 17.1)
```typescript
productInventoryTransactions: defineTable({
  menuProductId: v.id("menuProducts"),
  locationId: v.id("storageLocations"),
  transactionType: v.union(
    v.literal("add"),
    v.literal("drawdown"),
    v.literal("adjust"),
    v.literal("gofood_sale"),
  ),
  quantity: v.number(),                       // Signed delta (negative = deduction)
  previousQuantity: v.number(),
  newQuantity: v.number(),
  orderId: v.optional(v.id("orders")),        // Set for drawdown transactions
  gofoodOrderRef: v.optional(v.string()),     // Set for gofood_sale transactions
  reason: v.optional(v.string()),             // Required for adjust type
  performedBy: v.string(),                    // User name or "system:gobiz_sync"
  createdAt: v.number(),
})
  .index("by_product", ["menuProductId", "createdAt"])
  .index("by_location", ["locationId", "createdAt"])
  .index("by_created_at", ["createdAt"])
```

**Purpose:** Full immutable audit trail for all finished goods stock movements. Never deleted. Paginated for display in TransactionLogPanel.

---

### 26. `productInventorySettings` - Finished Goods Config (Phase 17.1)
```typescript
productInventorySettings: defineTable({
  globalLowStockThreshold: v.number(),                                         // Default: 5 boxes
  defaultAddLocationId: v.optional(v.id("storageLocations")),                  // Pre-select in Add dialog
  autoAdvanceOnDrawdown: v.boolean(),                                          // Reserved for future use
  alertMode: v.union(v.literal("toast"), v.literal("toast_and_badge")),        // Notification mode
  updatedBy: v.string(),
  updatedAt: v.number(),
})
```

**Purpose:** Singleton settings row (only one row ever exists). Controls low-stock threshold and UI defaults. Admin-only updates via `updateSettings` mutation.

---

## Order Status Workflow

*Updated Phase 14: Simplified from 12 statuses to 7.*

```
Draft
  └─> AwaitingPayment (invoice sent, waiting for payment)
        └─> PaymentReceived (payment confirmed)
              ├─> BeingPrepared (auto at due-2d, or manual expedite) [Kitchen Production path]
              │     └─> AwaitingDelivery (kitchen marks complete)
              └─> AwaitingDelivery (fulfillFromInventory — skips production) [Inventory Fulfillment path]
                    └─> Complete (delivered or picked up)

Any non-terminal → Cancelled (requires reason)
```

**Status Meanings:**

| Status | Description | Forward Transition |
|--------|-------------|-------------|
| Draft | Order being composed, not yet submitted | Submit Order -> AwaitingPayment |
| AwaitingPayment | Invoice sent, waiting for customer payment | Customer Paid! -> PaymentReceived |
| PaymentReceived | Payment confirmed, waiting for kitchen | Auto at due-2d or Expedite -> BeingPrepared |
| BeingPrepared | Kitchen is producing and packing the order | Kitchen Complete -> AwaitingDelivery |
| AwaitingDelivery | Ready for shipping or customer pickup | Mark Delivered -> Complete |
| Complete | Order fulfilled (terminal) | - |
| Cancelled | Order cancelled (terminal) | - |

**Backward Transitions:** All non-terminal statuses support backward transitions with optional reason text. Example: BeingPrepared -> PaymentReceived ("Send back to order desk").

**New Fields (Phase 14):**
- `orders.createdByUserId` - Links to users table for creator attribution
- `orders.expedited` - Boolean flag for manually expedited orders
- `orders.kitchenEnteredAt` - Timestamp when order entered BeingPrepared
- `orderEvents.userId` - Links to users table for audit trail attribution

**AwaitingPayment Visual Indicator:**
- Green badge: Waiting < 24 hours
- Yellow badge: Waiting 1-2 days
- Red badge: Waiting > 2 days

**Shipping Agencies:**
Gojek, GrabSend, JNE, J&T, SiCepat, AnterAja, Paxel, Lalamove, Other

---

## Visual Schema Diagram

```
┌──────────────┐
│  Ingredient  │──┐
└──────────────┘  │
                  │  ┌──────────────────────┐      ┌──────────────────┐      ┌─────────────┐      ┌────────────┐
                  └─>│ ComponentIngredient  │─────>│ RecipeComponent  │─────>│RecipeVersion│─────>│   Recipe   │
                     └──────────────────────┘      └──────────────────┘      └─────────────┘      └────────────┘
                                                             │                       │
                                                             │(linkedRecipe          │(1:N)
                                                             │ VersionId)            │
                                                             └───────────────────────┘

┌────────────────────┐
│ PackagingMaterial  │──┐
└────────────────────┘  │
                        │  ┌───────────────────────────┐   ┌──────────────────────┐   ┌─────────────────┐
                        └─>│PackagingComponentMaterial │──>│ PackagingComponent   │──>│PackagingVersion │
                           └───────────────────────────┘   └──────────────────────┘   └─────────────────┘
                                                                                              │
                                                                                              │
                                                      ┌───────────────────────────────────────┘
                                                      │        ┌────────────────┐
                                                      └───────>│ ProductVersion │<─── RecipeVersion
                                                               └────────────────┘
                                                                       │
                                                                       │(1:N)
                                                                       ▼
                                                               ┌───────────────┐
                                                               │    Product    │
                                                               └───────────────┘

┌──────┐
│ Tag  │<──── recipes.tagIds[], packagingRecipes.tagIds[], products.tagIds[]
└──────┘      (M:N via array - no junction table)

┌──────────┐      ┌─────────┐      ┌───────────┐
│ Customer │<─────│  Order  │─────>│ OrderItem │
└──────────┘      └─────────┘      └───────────┘
     │                 │                  │
     │                 │                  └─── menuProductId ───> MenuProduct (optional)
     │                 │
     │                 ├─────────────────>┌───────────────┐
     │                 │                  │ OrderMessages │ (WhatsApp tracking)
     │                 │                  └───────────────┘
     │                 │
     │                 └─── voucherId ───>┌──────────┐
     │                                    │ Vouchers │
     │                                    └──────────┘
     │                                         │
     │                                         │
     └────────────────────────────────────────┴──> VoucherUsage (M:N tracking)

┌──────────────────┐      ┌──────────────────┐
│ ProductionTarget │─────>│ProductionUnitType│ (Big Ball, Mid Ball)
│  (daily goals)   │      └──────────────────┘
└──────────────────┘

┌──────────────────┐      ┌─────────────┐
│ ProductionCounts │─────>│ MenuProduct │ (running tallies: boxed/stickered/packed)
└──────────────────┘      └─────────────┘

┌────────────────┐
│ ProductionLog  │─────> MenuProduct + optional Order/OrderItem (audit trail)
└────────────────┘
```

---

## Data Flow Patterns

### Cost Calculation Flow
```
Step 1: Base Cost (Ingredient/PackagingMaterial)
    priceExclShipping + shippingCost = totalCost
    normalize(volumePurchased, unitType) = baseVolume
    → costPerBaseUnit = totalCost / baseVolume
    Example: 25,000 IDR ÷ 1000g = 25 IDR/g

Step 2: Component Line Cost (ComponentIngredient/PackagingComponentMaterial)
    quantity × ingredient.costPerBaseUnit = lineCost
    Example: 500g × 25 IDR/g = 12,500 IDR

Step 3: Component Total Cost (RecipeComponent)
    IF linkedRecipeVersionId EXISTS:
        → get linked recipe version cost
    ELSE:
        → sum(all componentIngredient line costs)

Step 4: Recipe Version Total Cost
    sum(all recipeComponent costs) = totalCost
    IF estimatedYieldGrams:
        → costPerGram = totalCost / estimatedYieldGrams
    Example: 50,000 IDR ÷ 1000g = 50 IDR/g

Step 5: Product COGS Breakdown
    totalGrams = numPieces × gramsPerPiece
    recipeCogs = recipeCostPerGram × totalGrams
    packagingCogs = sum(all packagingComponentMaterial costs)
    totalCogs = recipeCogs + packagingCogs
    contributionMargin = retailPriceIdr - totalCogs
    marginPct = (contributionMargin / retailPriceIdr) × 100
```

### Version Copy Flow
```
User Action: "Copy Version 3 to new version"
    ↓
1. Get source version (recipeVersionId)
    ↓
2. Calculate next versionNumber = max(versionNumber) + 1
    ↓
3. Create new RecipeVersion
    - versionNumber = new
    - copiedFromVersionId = source
    - Copy all scalar fields from source
    ↓
4. Deep copy all RecipeComponents
    For each component in source:
        - Create new RecipeComponent
        - Copy componentName, sortOrder, linkedRecipeVersionId
        ↓
        5. Deep copy all ComponentIngredients
            For each ingredient in component:
                - Create new ComponentIngredient
                - Copy ingredientId, quantity, unit, sortOrder
    ↓
6. Return new version ID
    ↓
Result: Fully independent version that can be edited without affecting source
```

---

## Database Conventions

### Naming
- Tables: `camelCase`, plural (`recipes`, `recipeVersions`)
- Fields: `camelCase` (`recipeId`, `versionNumber`)
- Foreign keys: `{referenced_table_singular}Id` (`recipeId`, `customerId`)
- No junction tables: M2M via `tagIds: v.array(v.id("tags"))`

### Convex ID Types
```typescript
// All IDs are typed strings
v.id("recipes")        // Id<"recipes">
v.id("tags")           // Id<"tags">
v.array(v.id("tags"))  // Id<"tags">[]
```

### Unit Types
- Ingredients: `g`, `kg`, `ml`, `l`, `pcs`
- Packaging Materials: `pcs`, `m`, `cm`, `sheets`

### Patterns
```typescript
// Optional fields
brand: v.optional(v.string()),

// Timestamps (Convex provides _creationTime automatically)
// For custom timestamps, use v.number() (Unix ms)
orderDate: v.number(),

// Indexes for fast queries
.index("by_name", ["name"])
.index("by_recipe_version", ["recipeId", "versionNumber"])

// Denormalized fields for display (avoid joins)
customerName: v.string(),  // Copied from customer at order creation
```

### Transactions
```typescript
// Mutations are automatically transactional
export const createRecipeWithVersion = mutation({
  args: { ... },
  handler: async (ctx, args) => {
    // All operations in one transaction
    const recipeId = await ctx.db.insert("recipes", { ... });
    const versionId = await ctx.db.insert("recipeVersions", {
      recipeId,
      ...
    });
    return { recipeId, versionId };
    // If any operation fails, entire mutation rolls back
  },
});
```

---

## External Integration Tables (6 Tables + 4 Phase 26 Tables + 2 Restock Tables)

### externalOutlets
Platform outlet/store definitions with sync tracking.

| Field | Type | Description |
|-------|------|-------------|
| source | `"k3mart" \| "gobiz" \| "internal" \| "grabfood" \| "bigseller" \| "consignment"` | Platform identifier (shared `externalSource` validator) |
| externalId | string | Platform-specific outlet ID |
| name | string | Outlet display name |
| address | string? | Optional address |
| isActive | boolean | Whether to include in syncs |
| lastSyncAt | number? | Last sync timestamp |
| lastSyncStatus | `"success" \| "error" \| "partial"` | Last sync result |
| lastSyncError | string? | Error message if failed |
| createdBy | string | Who created the outlet |
| createdAt | number | Creation timestamp |

**Indexes:** `by_source`, `by_source_external_id`, `by_active`

### externalStockSnapshots
Raw stock data snapshots from K3Mart outlets.

| Field | Type | Description |
|-------|------|-------------|
| outletId | Id<"externalOutlets"> | Reference to outlet |
| snapshotBatchId | string | Groups snapshots from same sync |
| snapshotAt | number | When snapshot was taken |
| externalProductId | string | Platform product ID |
| externalProductCode | string | Platform product code |
| productName | string | Product display name |
| quantity | number | Current stock quantity |
| price | number | Selling price |
| priceGrabfoodGofood | number? | GoFood/GrabFood price |
| priceGrabmart | number? | GrabMart price |
| priceShopee | number? | Shopee price |
| capital | number? | Cost price |

**Indexes:** `by_outlet`, `by_batch`, `by_outlet_product`, `by_outlet_snapshot`, `by_snapshot_time`

### externalRevenue
Unified revenue records from all platforms with confidence tracking.

| Field | Type | Description |
|-------|------|-------------|
| outletId | Id<"externalOutlets">? | Optional outlet reference |
| source | `"k3mart" \| "gobiz" \| "internal"` | Platform identifier |
| externalProductCode | string? | Platform product code |
| productName | string? | Product display name |
| quantitySold | number? | Units sold |
| transactionCount | number? | Number of transactions |
| revenueGross | number? | Gross revenue in IDR |
| revenueNet | number? | Net revenue in IDR |
| costOfGoods | number? | COGS if available |
| periodStart | number | Period start timestamp |
| periodEnd | number | Period end timestamp |
| dataOrigin | `"stock_delta" \| "api_revenue" \| "manual_entry" \| "csv_upload" \| "db_query"` | How data was obtained |
| confidence | `"exact" \| "inferred" \| "manual"` | Data reliability level |
| syncLogId | Id<"externalSyncLogs">? | Reference to sync operation |
| linkedMenuProductId | Id<"menuProducts">? | Mapped internal product |
| externalTransactionId | string? | Platform transaction ID (used for deduplication) |
| transactionDate | number? | Transaction timestamp |
| transactionType | `"sales" \| "return" \| "delta_inferred"`? | Transaction category |
| commission | number? | Platform commission amount |
| adBurn | number? | GoBiz: Ad campaign costs |
| promoBurn | number? | GoBiz: Promotional discount costs |
| gobizOrderNumber | number? | GoBiz: Order number for reference |

**Indexes:** `by_source`, `by_outlet`, `by_period`, `by_source_period`, `by_product`, `by_source_txn`

### externalRevenueItems
Journal-level line items for external revenue transactions. Used by GoBiz to store per-product detail within a journal entry.

| Field | Type | Description |
|-------|------|-------------|
| revenueId | Id<"externalRevenue"> | Parent revenue record |
| source | `"k3mart" \| "gobiz" \| "internal"` | Platform identifier |
| externalItemId | string? | Platform item ID (for dedup) |
| productName | string | Product name from platform |
| unitPrice | number | Price per unit |
| quantity | number | Units sold |
| totalPrice | number | unitPrice × quantity |
| variants | string? | JSON string for variant details |
| linkedMenuProductId | Id<"menuProducts">? | Auto-matched menu product |
| isAutoMatched | boolean | Whether link was automatic |
| matchConfidence | `"exact" \| "price_only" \| "name_only" \| "none"`? | Confidence level of auto-match |
| createdAt | number | Creation timestamp |

**Indexes:** `by_revenue`, `by_source`, `by_menu_product`, `by_product_name`

**Auto-Matching Algorithm:**
1. **Exact**: Price + name match (case-insensitive)
2. **Price Only**: Price matches, name doesn't
3. **Name Only**: Name contains/is-contained-by (case-insensitive), price doesn't match
4. **None**: No match found

### externalSyncLogs
Sync operation logs with timing and error details.

| Field | Type | Description |
|-------|------|-------------|
| source | `externalSource` (6 literals) | Platform identifier |
| outletId | Id<"externalOutlets">? | Optional outlet reference |
| snapshotBatchId | string? | Batch ID for stock syncs |
| syncType | `"manual" \| "cron" \| "token_refresh"` | Sync trigger type |
| status | `"started" \| "success" \| "error"` | Sync status |
| productsCount | number? | Products processed |
| errorMessage | string? | Error details |
| durationMs | number? | Sync duration in ms |
| triggeredBy | string? | Who triggered the sync |
| timestamp | number | When sync started |

**Indexes:** `by_source`, `by_timestamp`, `by_outlet`

### externalProductMappings
Maps external product codes to internal menu products.

| Field | Type | Description |
|-------|------|-------------|
| source | `"k3mart" \| "gobiz" \| "internal"` | Platform identifier |
| externalProductCode | string | Platform product code |
| externalProductName | string | Platform product name |
| menuProductId | Id<"menuProducts">? | Linked internal product |
| isAutoMapped | boolean | Whether mapping was automatic |
| createdAt | number | Creation timestamp |

**Indexes:** `by_source_code`, `by_menu_product`

### grabfoodOrders (Phase 26)
GrabFood order records synced via POS API for revenue and menu analytics.

| Field | Type | Description |
|-------|------|-------------|
| source | `"grabfood"` | Always "grabfood" |
| externalOrderId | string | GrabFood order ID |
| orderStatus | string | GrabFood order status |
| orderTime | number | Order placement timestamp (ms) |
| totalAmount | number | Order gross total in IDR |
| items | `{ name: string; quantity: number; price: number }[]` | Line items snapshot |
| outletId | Id<"externalOutlets">? | Linked outlet if matched |
| linkedMenuProductIds | Id<"menuProducts">[] | Auto-matched internal products |
| syncLogId | Id<"externalSyncLogs">? | Sync operation reference |
| createdAt | number | Record creation timestamp |

**Indexes:** `by_source`, `by_order_id`, `by_order_time`, `by_outlet`, `by_linked_revenue`

---

### bigsellerOrders (Phase 26)
BigSeller multi-marketplace order records (Shopee, Tokopedia, etc.) for revenue analytics.

| Field | Type | Description |
|-------|------|-------------|
| source | `"bigseller"` | Always "bigseller" |
| externalOrderId | string | BigSeller order ID |
| platform | string | Marketplace platform (e.g., "shopee", "tokopedia") |
| orderStatus | string | BigSeller order status |
| orderTime | number | Order placement timestamp (ms) |
| totalAmount | number | Order gross total in IDR |
| items | `{ name: string; quantity: number; price: number }[]` | Line items snapshot |
| outletId | Id<"externalOutlets">? | Linked outlet if matched |
| linkedMenuProductIds | Id<"menuProducts">[] | Auto-matched internal products |
| syncLogId | Id<"externalSyncLogs">? | Sync operation reference |
| createdAt | number | Record creation timestamp |

**Indexes:** `by_source`, `by_order_id`, `by_order_time`, `by_platform`, `by_linked_revenue`

---

### consignmentOutlets (Phase 26)
Consignment outlet definitions for manual settlement tracking.

| Field | Type | Description |
|-------|------|-------------|
| source | `"consignment"` | Always "consignment" |
| name | string | Outlet display name |
| location | string? | Optional location description |
| contactName | string? | Primary contact |
| contactPhone | string? | Contact phone number |
| isActive | boolean | Whether outlet is active |
| createdBy | string | Admin who created the outlet |
| createdAt | number | Creation timestamp |

**Indexes:** `by_source`, `by_name`, `by_active`

---

### consignmentSettlements (Phase 26)
Manual consignment revenue settlement entries per outlet per period.

| Field | Type | Description |
|-------|------|-------------|
| source | `"consignment"` | Always "consignment" |
| outletId | Id<"consignmentOutlets"> | Reference to outlet |
| periodStart | number | Settlement period start timestamp (ms) |
| periodEnd | number | Settlement period end timestamp (ms) |
| totalRevenue | number | Gross revenue collected in IDR |
| notes | string? | Optional settlement notes |
| settledBy | string | Admin who recorded the settlement |
| settledAt | number | Settlement entry timestamp |

**Indexes:** `by_source`, `by_outlet`, `by_period`, `by_outlet_period`

---

### restockTargets
User-edited restock quantities per channel/outlet per product. Persisted overrides for the computed suggestions.

| Field | Type | Description |
|-------|------|-------------|
| outletId | Id<"externalOutlets">? | For K3 Mart outlets |
| channel | string | `"k3mart" \| "gobiz" \| "internal"` |
| productKey | string | externalProductCode (K3 Mart) or productName (GoBiz/internal) |
| menuProductId | Id<"menuProducts">? | Linked menu product if mapped |
| weekdayTarget | number | Dispatch target for weekdays |
| weekendTarget | number | Dispatch target for weekends |
| updatedBy | string | Who last edited |
| updatedAt | number | Last edit timestamp |

**Indexes:** `by_outlet`, `by_channel`, `by_outlet_product`

### manualStockEntries
For channels without automatic stock sync (GoBiz, Internal, future channels). Manual stock entry by staff.

| Field | Type | Description |
|-------|------|-------------|
| channel | string | `"gobiz" \| "internal"` (or future channels) |
| productKey | string | Product identifier |
| menuProductId | Id<"menuProducts">? | Linked menu product |
| quantity | number | Current stock count |
| enteredBy | string | Who entered the data |
| enteredAt | number | Entry timestamp |

**Indexes:** `by_channel`, `by_channel_product`

---

---

## Platform Credentials (1 Table)

### platformCredentials
Stores login credentials for external platforms (K3Mart, etc.) for automatic token refresh via cron jobs. Admin-only access; password never exposed in query responses.

| Field | Type | Description |
|-------|------|-------------|
| platformId | string | Platform identifier (e.g., "k3mart", "gobiz") |
| email | string? | Login email (for platforms with programmatic login) |
| password | string? | Login password (never returned in queries) |
| currentToken | string? | Active JWT/Bearer token |
| tokenExpiresAt | number? | Token expiry timestamp |
| refreshToken | string? | OAuth refresh token (GoBiz) |
| lastRefreshAt | number? | Last refresh attempt timestamp |
| lastRefreshStatus | `"success" \| "error"`? | Result of last refresh |
| lastRefreshError | string? | Error message if last refresh failed |
| updatedBy | string | User who last updated credentials |
| updatedAt | number | Last update timestamp |

**Indexes:** `by_platform`

**Token Refresh Flow:**
1. Admin enters credentials via Settings UI (`saveCredentials` mutation)
2. `refreshK3MartToken` action: HTTP POST to K3Mart login -> extract JWT -> decode expiry -> validate via test API call -> store in DB
3. 12-hour cron job (`convex/crons.ts`) calls `refreshK3MartTokenCron` to keep token fresh
4. K3Mart adapter reads token from `platformCredentials` first, falls back to `K3MART_API_TOKEN` env var

---

### Querying Patterns
```typescript
// Get by ID
const recipe = await ctx.db.get(args.id);

// Query with index
const versions = await ctx.db
  .query("recipeVersions")
  .withIndex("by_recipe", (q) => q.eq("recipeId", args.recipeId))
  .collect();

// Filter and sort
const activeOrders = await ctx.db
  .query("orders")
  .withIndex("by_status", (q) => q.eq("status", "Confirmed"))
  .order("desc")
  .take(10);
```

---

## Denormalization Patterns

This project uses three categories of denormalized data. All patterns are annotated inline in `convex/schema.ts` with formal `SNAPSHOT:`, `CACHE:`, or `DERIVED:` comments.

For the complete field audit and categorization of all 215 `v.optional()` fields, see `docs/SCHEMA_AUDIT.md`.

### SNAPSHOT (frozen at creation, never updated)

Data copied from a source record at creation time. The snapshot preserves the value as it was when the event occurred, even if the source record changes later.

| Table | Field | Source | Captured At |
|-------|-------|--------|-------------|
| orders | customerName | customers.name | Order creation |
| orders | customerPhone | customers.phone | Order creation |
| orders | voucherCode | vouchers.code | Order creation |
| orders | voucherDiscountValue | Calculated from voucher | Order creation |
| orderItems | productName | Manual entry or menuProducts.name | Item creation |
| orderItems | unitPrice | Manual entry or menuProducts.defaultPrice | Item creation |
| orderItems | unitCost | menuProducts.unitCost | Item creation |
| orderItemProduction | productionUnitCode | productionUnitTypes.code | Order confirmation |
| orderItemProduction | productionUnitName | productionUnitTypes.name | Order confirmation |
| componentIngredients | ingredientName | ingredients.name | Component creation |
| packagingComponentMaterials | materialName | packagingMaterials.name | Component creation |
| productVersions | recipeName | recipes.name | Version creation |
| productVersions | recipeVersionName | recipeVersions.versionName | Version creation |
| productVersions | packagingName | packagingRecipes.name | Version creation |
| productVersions | packagingVersionName | packagingVersions.versionName | Version creation |
| externalStockSnapshots | productName | External API | Snapshot time |
| k3martStockMovements | priceAtSubmission | K3Mart state | Submission time |
| k3martStockMovements | currentStockAtSubmission | K3Mart state | Submission time |

### CACHE (refreshable/invalidatable)

Computed values stored for query performance. These can be recalculated from their source data at any time.

| Table | Field | Source | Updated When |
|-------|-------|--------|--------------|
| ingredients | costPerBaseUnit | price/volume/shipping formula | On ingredient edit |
| ingredients | baseUnit | Derived from unitType | On ingredient edit |
| packagingMaterials | costPerBaseUnit | price/volume/shipping formula | On material edit |
| packagingMaterials | baseUnit | Derived from unitType | On material edit |
| recipeVersions | cachedTotalCost | componentIngredients sum | On cost invalidation |
| recipeVersions | cachedCostPerGram | cachedTotalCost / yield | On cost invalidation |
| recipeVersions | costCacheUpdatedAt | Timestamp | On cost invalidation |
| recipeComponents | cachedSubtotalCost | componentIngredients sum | On cost invalidation |
| componentIngredients | cachedLineCost | ingredientCost * quantity | On cost invalidation |
| packagingVersions | cachedTotalCost | packagingComponentMaterials sum | On cost invalidation |
| packagingVersions | costCacheUpdatedAt | Timestamp | On cost invalidation |
| packagingComponents | cachedSubtotalCost | packagingComponentMaterials sum | On cost invalidation |
| packagingComponentMaterials | cachedLineCost | materialCost * quantity | On cost invalidation |
| productVersions | cachedCogs | recipeVersions + packagingVersions | On cost invalidation |
| productVersions | cogsCacheUpdatedAt | Timestamp | On cost invalidation |
| menuProducts | unitCost | BOM via componentTypes.unitCostIdr | On recalculateAllCosts |
| menuProducts | unitCostStaleAt | Staleness marker | On componentType cost change |
| menuProducts | cachedProductionSummary | menuProductComponents + componentTypes | On BOM change |
| componentStock | totalStock | inventoryBatches.quantityRemaining | On batch change |
| componentStock | totalReserved | inventoryBatches.quantityReserved | On reservation change |
| componentStock | weightedUnitCostIdr | Weighted average from batches | On batch change |
| componentStock | latestSupplierName | Most recent batch | On new batch |
| componentStock | latestPurchaseUrl | Most recent batch | On new batch |
| componentStock | latestUnitCostIdr | Most recent batch | On new batch |
| componentStock | lastRestockTotalStock | totalStock snapshot | On restock |

### DERIVED (computed from other fields)

Values computed from other fields in the same or related records. Updated as part of the same write operation that changes the source fields.

| Table | Field | Derivation | Updated When |
|-------|-------|------------|--------------|
| orders | totalAmount | Sum of orderItems.lineTotal | On item add/remove/edit |
| orders | totalCost | Sum of orderItems.lineCost | On item add/remove/edit |
| orders | totalMargin | totalAmount - totalCost | On item add/remove/edit |
| orders | finalTotal | totalAmount - orderLevelDiscount | On discount change |
| orders | itemCount | Count of orderItems | On item add/remove |
| orders | isKitchenVisible | From status via computeKitchenVisibility() | On status transition |
| orders | completedAt | Set on terminal status | On CompleteShipped/PickedUp/Cancelled |
| orderItems | lineTotal | quantity * unitPrice - discountAmount | On creation/update |
| orderItems | lineCost | quantity * unitCost | On creation/update |
| orderItems | lineMargin | lineTotal - lineCost | On creation/update |
| orderItemProduction | unitsRemaining | unitsRequired - unitsCompleted | On ball completion |
| inventoryBatches | unitCostIdr | totalCostIdr / quantityPurchased | On batch creation |

---

## Dispatch Planner Tables (4 Tables)

Added in Phase 17 for multi-channel production dispatch planning.

### `dispatchPlans` - Dispatch Plan Cells

Individual plan cells in the weekly dispatch grid. Each cell represents a planned quantity of a menu product for a specific channel/outlet on a specific date.

```typescript
dispatchPlans: defineTable({
  date: v.string(),                              // YYYY-MM-DD
  channel: v.string(),                           // "direct" | "gofood" | "k3mart" | "consignment"
  outletId: v.optional(v.id("externalOutlets")), // For GoFood/K3Mart/Consignment outlets
  orderId: v.optional(v.id("orders")),           // For Direct Sales (links to specific order)
  menuProductId: v.id("menuProducts"),           // Which product
  plannedQty: v.number(),                        // Planned ball quantity
  actualQty: v.optional(v.number()),             // Filled from actual sales data (past days)
  source: v.string(),                            // "manual" | "auto_suggest" | "redistributed"
  updatedBy: v.string(),
  updatedAt: v.number(),
})
```

**Indexes:**
- `by_date_channel` — (date, channel) for querying all plans for a date+channel
- `by_date` — (date) for querying all plans for a given date
- `by_order` — (orderId) for finding plans linked to a specific order
- `by_outlet_date` — (outletId, date) for per-outlet daily plans

**Relationships:**
- `menuProductId` → `menuProducts._id`
- `outletId` → `externalOutlets._id` (optional)
- `orderId` → `orders._id` (optional, Direct Sales only)

### `dispatchChannelConfig` - Channel Configuration

Configuration for each sales channel including priority ordering, commission rates, and display settings.

```typescript
dispatchChannelConfig: defineTable({
  channelKey: v.string(),     // "direct" | "gofood" | "k3mart" | "consignment"
  displayName: v.string(),    // "Direct Sales", "GoFood", etc.
  color: v.string(),          // Hex color for capacity bar segment
  priority: v.number(),       // Lower = higher priority (1 = highest)
  commissionRate: v.number(), // Percentage (e.g., 19 for 19%)
  isBuiltIn: v.boolean(),     // true for Direct/GoFood/K3Mart, false for custom
  isEnabled: v.boolean(),
  updatedBy: v.string(),
  updatedAt: v.number(),
})
```

**Indexes:**
- `by_channel` — (channelKey) for looking up a specific channel
- `by_priority` — (priority) for ordered display

### `dispatchConsignmentOutlets` - Consignment Outlets

Configurable consignment outlets with per-product name/price mappings.

```typescript
dispatchConsignmentOutlets: defineTable({
  name: v.string(),                         // "Legato Tamtem", "Legato Goldfinch"
  channelKey: v.literal("consignment"),
  isEnabled: v.boolean(),
  productMappings: v.array(v.object({
    menuProductId: v.id("menuProducts"),
    externalName: v.string(),               // Product name at this outlet
    externalPrice: v.number(),              // Price at this outlet
  })),
  commissionRate: v.optional(v.number()),   // Override channel-level rate
  createdBy: v.string(),
  createdAt: v.number(),
  updatedBy: v.string(),
  updatedAt: v.number(),
})
```

**Indexes:**
- `by_enabled` — (isEnabled) for filtering active outlets

**Relationships:**
- `productMappings[].menuProductId` → `menuProducts._id`

### `dispatchPlannerSettings` - Planner Settings

Single-row settings table for global planner configuration.

```typescript
dispatchPlannerSettings: defineTable({
  dailyCapacity: v.number(), // Default 200 balls
  updatedBy: v.string(),
  updatedAt: v.number(),
})
```

### `productionComponentLinks` - Hierarchical Sub-Component Links (Phase 20)

Links production components to their sub-components in a hierarchy (up to 3 tiers deep). E.g., Mid Ball -> Marshmallow Mix -> individual ingredients.

```typescript
productionComponentLinks: defineTable({
  parentComponentTypeId: v.id("componentTypes"), // Parent production component
  childComponentTypeId: v.id("componentTypes"),  // Child sub-component
  quantity: v.number(),                          // How many child units per parent
  unit: v.optional(v.string()),                  // Unit label (e.g., "g", "pcs")
})
  .index("by_parent", ["parentComponentTypeId"])
  .index("by_child", ["childComponentTypeId"])
```

**Indexes:**
- `by_parent` -- (parentComponentTypeId) for walking hierarchy downward
- `by_child` -- (childComponentTypeId) for reverse lookup / cost invalidation cascade

**Relationships:**
- `parentComponentTypeId` -> `componentTypes._id`
- `childComponentTypeId` -> `componentTypes._id`

### `productionComponentIngredients` - Direct Ingredient Links (Phase 20)

Links production components directly to raw ingredients (leaf nodes in the hierarchy).

```typescript
productionComponentIngredients: defineTable({
  componentTypeId: v.id("componentTypes"),       // Parent production component
  ingredientId: v.id("ingredients"),             // Raw ingredient
  quantity: v.number(),                          // Quantity per batch
  unit: v.optional(v.string()),                  // Unit label
})
  .index("by_component", ["componentTypeId"])
  .index("by_ingredient", ["ingredientId"])
```

**Indexes:**
- `by_component` -- (componentTypeId) for recipe lookup
- `by_ingredient` -- (ingredientId) for reverse lookup / cost invalidation

**Relationships:**
- `componentTypeId` -> `componentTypes._id`
- `ingredientId` -> `ingredients._id`

### componentTypes Extended Fields (Phase 20)

The following fields were added to the `componentTypes` table for production recipe and COGS support:

```typescript
// Added to componentTypes (Phase 20)
batchSize: v.optional(v.number()),               // Production batch size (e.g., 100 balls)
batchSizeUnit: v.optional(v.string()),           // Unit for batch size (e.g., "pcs", "g")
cogsMode: v.optional(v.string()),                // "manual" | "calculated"
manualUnitCostIdr: v.optional(v.number()),       // Manual COGS value (IDR per unit)
cachedCalculatedCogs: v.optional(v.number()),    // Cached calculated COGS from hierarchy
cogsCacheUpdatedAt: v.optional(v.number()),      // When COGS cache was last refreshed
cogsMissingCount: v.optional(v.number()),        // Number of ingredients with missing costs
```

---

## Phase 35: Schema Audit Quick-Win Changes (2026-03-05)

### Indexes Removed (21)

The following indexes had zero `.withIndex()` references across all backend code (including crons.ts and http.ts) and were removed to reduce write overhead:

| Table | Index | Fields |
|-------|-------|--------|
| `ingredients` | `by_name` | `["name"]` |
| `packagingMaterials` | `by_name` | `["name"]` |
| `customers` | `by_name` | `["name"]` |
| `menuProducts` | `by_pos_slot` | `["posSlot"]` |
| `menuProducts` | `by_packaging_pos_slot` | `["packagingPosSlot"]` |
| `orderItemProduction` | `by_production_type` | `["productionUnitTypeId"]` |
| `vouchers` | `by_active_valid` | `["isActive", "validFrom"]` |
| `externalStockSnapshots` | `by_snapshot_time` | `["snapshotAt"]` |
| `externalRevenue` | `by_product` | `["linkedMenuProductId"]` |
| `consignmentSettlements` | `by_outlet_period` | `["outletId", "periodStart"]` |
| `consignmentSettlements` | `by_outlet_status` | `["outletId", "status"]` |
| `kitchenShiftRecords` | `by_date_submitted` | `["date", "submittedAt"]` |
| `k3martStockMovements` | `by_outlet_direction` | `["outletId", "direction"]` |
| `grabfoodOrders` | `by_merchant` | `["merchantID"]` |
| `grabfoodOrders` | `by_sync_log` | `["syncLogId"]` |
| `grabfoodOrders` | `by_linked_revenue` | `["linkedRevenueId"]` |
| `bigsellerOrders` | `by_shop` | `["shopId"]` |
| `bigsellerOrders` | `by_sync_log` | `["syncLogId"]` |
| `bigsellerOrders` | `by_state` | `["orderState"]` |
| `bigsellerOrders` | `by_linked_revenue` | `["linkedRevenueId"]` |
| `grabfoodMenuItems` | `by_grabfood_item_id` | `["grabfoodItemId"]` |

### Indexes Added (5 compound indexes)

| Table | Index | Fields | Purpose |
|-------|-------|--------|---------|
| `externalOutlets` | `by_source_active` | `["source", "isActive"]` | Eliminates isActive post-filter on 9+ query sites |
| `storageLocations` | `by_type_active` | `["locationType", "isActive"]` | Eliminates isActive post-filter on 4 query sites |
| `productionLog` | `by_menu_product_timestamp` | `["menuProductId", "timestamp"]` | Efficient per-product production log queries with time filtering |
| `orderComponentReservations` | `by_order_status` | `["orderId", "status"]` | Efficient reservation lookups by order + status |
| `externalStockSnapshots` | `by_batch_outlet` | `["snapshotBatchId", "outletId"]` | Eliminates outletId post-filter on 7 query sites |

### Fields Removed

| Table | Field | Reason |
|-------|-------|--------|
| `dispatchChannelConfig` | `commissionRate` | Explicitly marked "unused -- net/gross tracked from external APIs" (DUP-01) |

### Critical Query Fix (MIS-01)

`cleanupExpiredSessions` in `convex/auth/mutations.ts` was performing a full table scan instead of using the existing `by_expiry` index. Fixed to use `.withIndex("by_expiry", q => q.lt("expiresAt", now))`.

### Range Bound Anti-Pattern Fixes (IRB-01, IRB-02)

Fixed 10 query sites that applied the upper period bound as a post-scan `.filter()` instead of chaining it in the `.withIndex()` callback:
- 5 sites in `convex/externalData/queries.ts` (IRB-01: `by_period`)
- 2 sites in `convex/k3martCockpit/queries.ts` (IRB-02: `by_source_period`)
- 1 site in `convex/k3martKitchen/queries.ts` (IRB-02: `by_source_period`)
- 1 site in `convex/dispatchPlanner/queries.ts` (IRB-02: `by_source_period`)
- 1 site in `convex/gofoodDepot/queries.ts` (IRB-02: `by_source_period`)

### Annotations Updated

- `productionCounts` table: Updated comment from "Running production tallies" to "ARCHIVED: Read-only since Phase 21. Source of truth is now productionLog aggregation + productionResets timestamps."

### Net Change: 166 → 150 indexes (removed 21, added 5)

---

## Accounting & Expense Tables (Phase 41-43)

### `accounts` — Chart of Accounts (PSAK-aligned GL accounts)

| Field | Type | Description |
|-------|------|-------------|
| `code` | `string` | 4-digit PSAK code (1xxx-7xxx). Prefix determines type. |
| `name` | `string` | Account display name (e.g., "Direct Sales") |
| `type` | `union` | `"asset"` \| `"liability"` \| `"equity"` \| `"revenue"` \| `"cogs"` \| `"opex"` \| `"other"` |
| `category` | `string` | Display group (e.g., "Revenue", "Operating Expenses") |
| `isActive` | `boolean` | Active accounts appear in dropdowns |
| `isSystem` | `boolean` | System accounts cannot be deleted |
| `description` | `optional string` | Optional notes |

**Indexes:** `by_code` (code), `by_type` (type), `by_active_type` (isActive, type)

**Seed:** 39 default accounts via `accounts:seedDefaults` from dashboard. Upsert pattern — safe to re-run.

**Code prefix mapping:**
- `1xxx` = Asset, `2xxx` = Liability, `3xxx` = Equity, `4xxx` = Revenue
- `5xxx` = COGS, `6xxx` = OpEx, `7xxx` = Other Income/Expense

### `expenses` — Expense Records

| Field | Type | Description |
|-------|------|-------------|
| `accountId` | `id("accounts")` | GL account reference |
| `expenseNumber` | `string` | Sequential EXP-MMDD-NNN format |
| `submittedBy` | `id("users")` | Employee who submitted |
| `amount` | `number` | IDR amount (integer) |
| `expenseDate` | `number` | Epoch ms of expense date |
| `description` | `string` | Expense description |
| `vendorName` | `string` | Vendor/payee name |
| `paymentMethod` | `union` | `"personal_cash"` \| `"personal_transfer"` \| `"company_card"` |
| `status` | `union` | `"draft"` \| `"submitted"` \| `"approved"` \| `"rejected"` \| `"awaiting_payment"` \| `"reimbursed"` \| `"voided"` |
| `receiptFileId` | `optional id("_storage")` | Receipt image in Convex storage |
| `receiptImageHash` | `optional string` | For duplicate detection |
| `lateSubmission` | `boolean` | Flagged if submitted after policy window |

**Indexes:** `by_submitter_status`, `by_status`, `by_status_expenseDate` *(Phase 50)*, `by_amount_date_submitter`, `by_receipt_hash`, `by_expense_number`, `by_account`

**Note:** Full field list in `convex/schema.ts` (includes approval/rejection/void workflow fields).

### `journalEntries` — Double-Entry Journal Entries (Header)

| Field | Type | Description |
|-------|------|-------------|
| `entryNumber` | `string` | Sequential JE number (JE-YYYYMM-NNN) |
| `date` | `number` | Epoch ms of business date |
| `description` | `string` | Entry description |
| `sourceType` | `union` | `"expense_approval"` \| `"expense_void"` \| `"reimbursement"` \| `"reimbursement_void"` \| `"payroll"` \| `"payroll_void"` \| `"manual"` \| `"depreciation"` \| `"depreciation_void"` |
| `sourceId` | `optional string` | Reference to source record |
| `isReversed` | `boolean` | Whether entry has been reversed |
| `reversedByEntryId` | `optional id("journalEntries")` | Reversal entry reference |
| `createdBy` | `id("users")` | User who created the entry |
| `createdAt` | `number` | Epoch ms of creation time |
| `metadata` | `optional object` | Optional metadata. Contains `receiptUrl: optional string` for Google Drive receipt links (used by historical import, Phase 51) and `templateType: optional string` for template-based manual journal entries (Phase 62). Values: `"loan_repayment"`, `"dividend_payment"`, `"capital_injection"`, `"receive_loan"`, `"tax_payment"`. (Note: `equipment_purchase` removed in Phase 60 — use Asset Register instead.) |

**Indexes:** `by_entry_number`, `by_source` (sourceType, sourceId), `by_date`, `by_sourceType_date` (sourceType, date)

### `journalEntryLines` — Double-Entry Journal Entry Lines (Debit/Credit)

| Field | Type | Description |
|-------|------|-------------|
| `journalEntryId` | `id("journalEntries")` | Parent journal entry |
| `accountId` | `id("accounts")` | GL account reference |
| `entryDate` | `number` | Denormalized from parent `journalEntries.date` (Convex indexes cannot span tables) |
| `debitAmount` | `number` | Debit amount (IDR) |
| `creditAmount` | `number` | Credit amount (IDR) |
| `description` | `optional string` | Line-level description |

**Indexes:** `by_journal_entry`, `by_account_entryDate` (accountId, entryDate), `by_entryDate`

### `fixedAssets` -- Fixed Asset Register (Phase 60)

| Field | Type | Description |
|-------|------|-------------|
| `assetNumber` | `string` | Unique asset number (FA-{ABBR}-YYMM-NNN) |
| `name` | `string` | Asset name |
| `category` | `string` | PSAK category key (e.g., "mesin_produksi", "kendaraan") |
| `acquisitionDate` | `number` | Epoch ms of acquisition date |
| `cost` | `number` | Original cost (IDR) |
| `salvageValue` | `number` | Residual value (IDR) |
| `usefulLifeMonths` | `number` | Useful life in months |
| `monthlyDepreciation` | `number` | Calculated monthly depreciation amount (IDR) |
| `accumulatedDepreciation` | `number` | Running total of depreciation posted (IDR) |
| `lastDepreciationMonth` | `optional string` | Last posted month (YYYY-MM) |
| `status` | `string` | "active" \| "fully_depreciated" \| "disposed" |
| `location` | `optional string` | Physical location description |
| `characteristics` | `array` | Key-value pairs [{key, value}] for serial numbers, models, etc. |
| `attachmentIds` | `array` | Storage IDs for photos/documents |
| `disposalType` | `optional string` | "sold" \| "scrapped" \| "written_off" |
| `disposalDate` | `optional number` | Epoch ms of disposal |
| `saleProceeds` | `optional number` | Proceeds from sale (IDR) |
| `createdBy` | `id("users")` | User who registered the asset |

**Indexes:** `by_status` (status), `by_category` (category), `by_asset_number` (assetNumber)

**Relationships:**
- Journal entries reference fixed assets via `sourceType="depreciation"` + `sourceId=asset._id`
- Disposal JEs use `sourceType="manual"` to prevent accidental void by depreciation void operation
- GL accounts: DR 6150 (Depreciation Expense), CR 1610-1670 (per-category Accumulated Depreciation)
- Disposal gain/loss: 7300 (Gain on Asset Disposal), 7400 (Loss on Asset Disposal)
