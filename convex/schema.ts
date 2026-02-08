import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ============================================
// Frollie Recipe Master - Convex Schema
// Migrated from FastAPI + SQLAlchemy
// ============================================

export default defineSchema({
  // ============================================
  // BASE TABLES - Simple entities
  // ============================================

  ingredients: defineTable({
    name: v.string(),
    brand: v.optional(v.string()),
    procurementSource: v.optional(v.string()),
    unitType: v.string(), // g, kg, ml, l, pcs
    volumePurchased: v.number(),
    priceExclShipping: v.number(),
    shippingCost: v.number(),
    createdBy: v.string(),
    // Denormalized for fast queries
    costPerBaseUnit: v.optional(v.number()),
    baseUnit: v.optional(v.string()),
  })
    .index("by_name", ["name"])
    .index("by_brand", ["brand"]),

  packagingMaterials: defineTable({
    name: v.string(),
    brand: v.optional(v.string()),
    procurementSource: v.optional(v.string()),
    unitType: v.string(), // pcs, m, cm, sheets
    volumePurchased: v.number(),
    priceExclShipping: v.number(),
    shippingCost: v.number(),
    createdBy: v.string(),
    // Denormalized
    costPerBaseUnit: v.optional(v.number()),
    baseUnit: v.optional(v.string()),
  })
    .index("by_name", ["name"]),

  tags: defineTable({
    name: v.string(),
  })
    .index("by_name", ["name"]),

  menuProducts: defineTable({
    code: v.string(),
    name: v.string(),
    grams: v.number(),
    defaultPrice: v.number(),
    productionType: v.string(), // "original" or "bite_sized" (DEPRECATED - use productionUnitTypes)
    productionUnits: v.number(), // (DEPRECATED - use menuProductComponents)
    isActive: v.boolean(),
    // PRD-0: Fixed products and COGS tracking
    isFixed: v.optional(v.boolean()), // Cannot be deleted if true
    unitCost: v.optional(v.number()), // COGS in IDR
    // PRD-5: Cached production summary for display
    cachedProductionSummary: v.optional(v.string()), // e.g., "1 Big, 2 Mid"
    // PRD-8: POS slot assignment (positive integer, or undefined for unassigned)
    // Only products with posSlot appear on POS. Unique per slot.
    posSlot: v.optional(v.number()),
    // BOM Refactor: Packaging POS slot (positive integer) for packaging-only products
    packagingPosSlot: v.optional(v.number()),
    // BOM Refactor: Derived product type (food = has production components, packaging = only packaging)
    productType: v.optional(v.union(
      v.literal("food"),       // Has >= 1 production component
      v.literal("packaging")   // Only packaging components
    )),
  })
    .index("by_code", ["code"])
    .index("by_active", ["isActive"])
    .index("by_pos_slot", ["posSlot"])
    .index("by_packaging_pos_slot", ["packagingPosSlot"]),

  // ============================================
  // PRD-5: PRODUCTION UNIT TYPES
  // Atomic units that kitchen produces (e.g., Big Ball, Mid Ball)
  // ============================================

  productionUnitTypes: defineTable({
    code: v.string(), // "BIG_BALL", "MID_BALL"
    name: v.string(), // "Big Ball", "Mid Ball"
    gramsPerUnit: v.number(), // 80 for big, 45 for mid
    unitCostIdr: v.number(), // COGS per unit
    color: v.optional(v.string()), // Hex color for kitchen display (e.g., "#EF4444")
    sortOrder: v.number(), // Display ordering
    isActive: v.boolean(),
  })
    .index("by_code", ["code"])
    .index("by_active", ["isActive"]),

  // ============================================
  // PRD-5: MENU PRODUCT COMPONENTS
  // Links menu products to their production unit requirements
  // Supports combo packs (e.g., 1 Big + 2 Mid)
  // ============================================

  menuProductComponents: defineTable({
    menuProductId: v.id("menuProducts"),
    componentTypeId: v.id("componentTypes"), // Unified BOM: production + packaging
    quantity: v.number(), // How many of this component per product
    sortOrder: v.number(), // Display ordering
    // Per-product override for consumption stage (overrides componentTypes.consumptionStage)
    consumptionStage: v.optional(v.union(
      v.literal("production"), // Consumed at InProduction transition
      v.literal("boxing"),     // Consumed at Boxed transition
      v.literal("labeling"),   // Consumed at Labeled transition
      v.literal("none")        // Legacy - not tracked
    )),
  })
    .index("by_menu_product", ["menuProductId"])
    .index("by_component_type", ["componentTypeId"]),

  // ============================================
  // RECIPE TABLES
  // ============================================

  recipes: defineTable({
    name: v.string(),
    tagIds: v.array(v.id("tags")), // Denormalized M2M (no junction table)
    createdBy: v.string(),
  })
    .index("by_name", ["name"]),

  recipeVersions: defineTable({
    recipeId: v.id("recipes"),
    versionNumber: v.number(),
    versionName: v.string(),
    description: v.optional(v.string()),
    estimatedYieldGrams: v.optional(v.number()),
    isSingleComponent: v.boolean(),
    isReusableComponent: v.boolean(),
    copiedFromVersionId: v.optional(v.id("recipeVersions")),
    createdBy: v.string(),
    // CACHED COSTS - Hybrid approach
    cachedTotalCost: v.optional(v.number()),
    cachedCostPerGram: v.optional(v.number()),
    costCacheUpdatedAt: v.optional(v.number()),
  })
    .index("by_recipe", ["recipeId"])
    .index("by_recipe_version", ["recipeId", "versionNumber"])
    .index("by_reusable", ["isReusableComponent"]),

  recipeComponents: defineTable({
    recipeVersionId: v.id("recipeVersions"),
    sortOrder: v.number(),
    componentName: v.string(),
    linkedRecipeVersionId: v.optional(v.id("recipeVersions")),
    // CACHED - for display
    cachedSubtotalCost: v.optional(v.number()),
  })
    .index("by_version", ["recipeVersionId"])
    .index("by_linked_version", ["linkedRecipeVersionId"]),

  componentIngredients: defineTable({
    recipeComponentId: v.id("recipeComponents"),
    ingredientId: v.id("ingredients"),
    sortOrder: v.number(),
    unit: v.string(), // g, kg, ml, l, pcs
    quantity: v.number(),
    // Denormalized for display
    ingredientName: v.optional(v.string()),
    cachedLineCost: v.optional(v.number()),
  })
    .index("by_component", ["recipeComponentId"])
    .index("by_ingredient", ["ingredientId"]),

  // ============================================
  // PACKAGING TABLES
  // ============================================

  packagingRecipes: defineTable({
    name: v.string(),
    tagIds: v.array(v.id("tags")),
    createdBy: v.string(),
  })
    .index("by_name", ["name"]),

  packagingVersions: defineTable({
    packagingRecipeId: v.id("packagingRecipes"),
    versionNumber: v.number(),
    versionName: v.string(),
    description: v.optional(v.string()),
    copiedFromVersionId: v.optional(v.id("packagingVersions")),
    createdBy: v.string(),
    // CACHED
    cachedTotalCost: v.optional(v.number()),
    costCacheUpdatedAt: v.optional(v.number()),
  })
    .index("by_packaging", ["packagingRecipeId"])
    .index("by_packaging_version", ["packagingRecipeId", "versionNumber"]),

  packagingComponents: defineTable({
    packagingVersionId: v.id("packagingVersions"),
    sortOrder: v.number(),
    componentName: v.string(),
    cachedSubtotalCost: v.optional(v.number()),
  })
    .index("by_version", ["packagingVersionId"]),

  packagingComponentMaterials: defineTable({
    packagingComponentId: v.id("packagingComponents"),
    packagingMaterialId: v.id("packagingMaterials"),
    sortOrder: v.number(),
    unit: v.string(), // pcs, m, cm, sheets
    quantity: v.number(),
    // Denormalized
    materialName: v.optional(v.string()),
    cachedLineCost: v.optional(v.number()),
  })
    .index("by_component", ["packagingComponentId"])
    .index("by_material", ["packagingMaterialId"]),

  // ============================================
  // PRODUCT TABLES
  // ============================================

  products: defineTable({
    name: v.string(),
    tagIds: v.array(v.id("tags")),
    createdBy: v.string(),
  })
    .index("by_name", ["name"]),

  productVersions: defineTable({
    productId: v.id("products"),
    versionNumber: v.number(),
    versionName: v.string(),
    description: v.optional(v.string()),
    recipeVersionId: v.id("recipeVersions"),
    packagingVersionId: v.id("packagingVersions"),
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
    // CACHED COGS
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
    .index("by_packaging_version", ["packagingVersionId"]),

  // ============================================
  // CUSTOMER & ORDER TABLES
  // ============================================

  customers: defineTable({
    name: v.string(),
    phone: v.optional(v.string()),
    source: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdBy: v.string(),
  })
    .index("by_name", ["name"])
    .index("by_phone", ["phone"]),

  orders: defineTable({
    orderNumber: v.string(),
    customerId: v.id("customers"),
    // Denormalized customer info for list queries
    customerName: v.string(),
    customerPhone: v.optional(v.string()),

    // PRD-0: Status workflow with type-safe unions
    // PRD-7: Added InProduction between Confirmed and Packaging
    // PRD-Kitchen-Workflow: Added Boxed and Labeled statuses for inventory management
    status: v.union(
      v.literal("Draft"),
      v.literal("AwaitingPayment"),
      v.literal("Confirmed"),
      v.literal("InProduction"),        // NEW: Kitchen actively producing
      v.literal("Boxed"),               // NEW: All packages filled and boxed
      v.literal("Labeled"),             // NEW: Stickers applied to boxes
      v.literal("ProductionComplete"),  // DEPRECATED: Use Packaging instead
      v.literal("Packaging"),           // DEPRECATED: Use Boxed instead
      v.literal("WaitingShipment"),
      v.literal("CompleteShipped"),
      v.literal("WaitingPickup"),
      v.literal("PickedUp"),
      v.literal("Cancelled")
    ),
    awaitingPaymentSince: v.optional(v.number()),

    // PRD-0: Payment status with type-safe union
    paymentStatus: v.union(
      v.literal("Unpaid"),
      v.literal("Partial"),
      v.literal("Paid")
    ),
    paymentMethod: v.optional(v.string()),

    orderDate: v.number(), // timestamp
    dueDate: v.optional(v.number()),

    // Totals (denormalized)
    totalAmount: v.number(),
    totalCost: v.number(),
    totalMargin: v.number(),

    // PRD-0: Order-level discount
    orderLevelDiscount: v.optional(v.number()),
    orderLevelDiscountType: v.optional(v.union(
      v.literal("amount"),
      v.literal("percentage")
    )),
    finalTotal: v.optional(v.number()), // totalAmount - discount

    // Voucher tracking (optional - only if voucher applied)
    voucherId: v.optional(v.id("vouchers")),
    voucherCode: v.optional(v.string()), // Snapshot of code at order time
    voucherDiscountValue: v.optional(v.number()), // Calculated discount snapshot
    lowPriceConfirmed: v.optional(v.boolean()), // True if user confirmed < 20k order

    // Sales tracking - Channel with type-safe union
    channel: v.optional(v.union(
      v.literal("whatsapp"),
      v.literal("instagram"),
      v.literal("shopee"),
      v.literal("tiktok"),
      v.literal("tokopedia"),
      v.literal("grabfood"),
      v.literal("k3mart_gf"),
      v.literal("legato_tamtem"),
      v.literal("legato_goldfinch"),
      v.literal("bazaar"),
      v.literal("other")
    )),
    soldBy: v.optional(v.string()),

    // Delivery info
    deliveryType: v.string(), // Pickup, Delivery
    pickupLocation: v.optional(v.string()),
    deliveryAddress: v.optional(v.string()),

    // Contact snapshot
    contactWa: v.optional(v.string()),
    contactIg: v.optional(v.string()),

    // Shipping
    shippingAgency: v.optional(v.string()),
    shippingNumber: v.optional(v.string()),

    // Cancellation - PRD-7: Enhanced with category and timestamp
    cancellationReason: v.optional(v.string()),
    cancellationCategory: v.optional(v.union(
      v.literal("customer_request"),
      v.literal("out_of_stock"),
      v.literal("payment_issue"),
      v.literal("duplicate"),
      v.literal("other")
    )),
    cancelledAt: v.optional(v.number()),

    notes: v.optional(v.string()),
    createdBy: v.string(),

    // Denormalized count
    itemCount: v.number(),
  })
    .index("by_order_number", ["orderNumber"])
    .index("by_customer", ["customerId"])
    // REMOVED: .index("by_due_date", ["dueDate"]) - covered by by_status_due_date
    .index("by_status", ["status"])
    .index("by_channel", ["channel"])
    .index("by_status_due_date", ["status", "dueDate"]),

  orderItems: defineTable({
    orderId: v.id("orders"),
    // Product info (standalone - no FK to product)
    productName: v.string(),
    productVariant: v.optional(v.string()),
    quantity: v.number(),
    unitPrice: v.number(),
    unitCost: v.number(),
    discountAmount: v.number(),
    // Calculated totals (stored for reporting)
    lineTotal: v.number(),
    lineCost: v.number(),
    lineMargin: v.number(),
    // Optional link to menu product
    menuProductId: v.optional(v.id("menuProducts")),
    // PRD-0: Ball tracking for Kitchen View
    productionType: v.optional(v.string()), // "original" or "bite_sized"
    productionUnits: v.optional(v.number()), // balls per unit
    // PRD-5: Production completion flag (denormalized for fast queries)
    isProductionComplete: v.optional(v.boolean()),
    // PRD-7: Cancellation flag for soft delete
    isCancelled: v.optional(v.boolean()),
    // PRD-6: Package status for visual inventory system
    // Grey (empty) -> Red (filling) -> Yellow (filled) -> Green (packed)
    packageStatus: v.optional(v.union(
      v.literal("empty"),
      v.literal("filling"),
      v.literal("filled"),
      v.literal("packed")
    )),
    // Track balls filled in this package (for visual display)
    ballsFilled: v.optional(v.number()),
    // PRD-6: Track which individual packages are packed (indices 0 to quantity-1)
    // When all packages are packed, packageStatus becomes "packed"
    packedPackageIndices: v.optional(v.array(v.number())),
  })
    .index("by_order", ["orderId"])
    .index("by_product_name", ["productName"])
    .index("by_menu_product", ["menuProductId"])
    .index("by_production_type", ["orderId", "productionType"]),

  // ============================================
  // PRD-5: ORDER ITEM PRODUCTION
  // Tracks production progress per unit type per order item
  // Supports multiple production types per item (for combo packs)
  // ============================================

  orderItemProduction: defineTable({
    orderItemId: v.id("orderItems"),
    productionUnitTypeId: v.id("productionUnitTypes"),
    // Snapshot at order creation (for historical accuracy)
    productionUnitCode: v.string(), // "BIG_BALL", "MID_BALL"
    productionUnitName: v.string(), // "Big Ball", "Mid Ball"
    // Production tracking
    unitsRequired: v.number(), // Total needed (orderItem.quantity * component.quantity)
    unitsCompleted: v.number(), // How many have been produced
    unitsRemaining: v.number(), // unitsRequired - unitsCompleted
    // PRD-7: Cancellation flag for soft delete
    isCancelled: v.optional(v.boolean()),
  })
    .index("by_order_item", ["orderItemId"])
    .index("by_production_type", ["productionUnitTypeId"])
    .index("by_remaining", ["unitsRemaining"])
    .index("by_completion", ["orderItemId", "unitsRemaining"]),

  // ============================================
  // PRD-0: WHATSAPP MESSAGE TRACKING
  // ============================================

  orderMessages: defineTable({
    orderId: v.id("orders"),
    template: v.string(), // e.g., "payment_request", "order_confirmation"
    messageHash: v.string(), // For deduplication
    sentAt: v.number(), // Timestamp
    sentBy: v.string(), // User who sent
    messagePreview: v.optional(v.string()), // First 100 chars
  })
    .index("by_order", ["orderId"])
    .index("by_order_template", ["orderId", "template"]),

  // ============================================
  // VISUAL FEEDBACK OVERLAY
  // ============================================

  feedback: defineTable({
    // Screenshot stored in Convex Storage
    screenshotStorageId: v.id("_storage"),
    // Element identification
    elementSelector: v.optional(v.string()),
    pageUrl: v.string(),
    pageTitle: v.string(),
    // Feedback content
    description: v.string(),
    // Status workflow
    status: v.union(v.literal("ongoing"), v.literal("archived")),
    // Priority levels
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    // Tags (multi-select)
    tags: v.array(v.string()), // "bug", "enhancement", "question"
    // Comments stored as array (simplified from separate table)
    comments: v.optional(v.array(v.object({
      content: v.string(),
      createdBy: v.optional(v.string()),
      createdAt: v.number(),
    }))),
    // User identification (optional)
    createdBy: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_priority", ["priority"]),

  // ============================================
  // PRD-4: AUTHENTICATION TABLES
  // ============================================

  users: defineTable({
    name: v.string(),
    pinHash: v.string(), // Format: "salt:sha256hash"
    role: v.union(
      v.literal("kitchen"),      // Production floor only
      v.literal("order_staff"),  // Orders + read-only kitchen
      v.literal("manager"),      // Orders + Recipes (no user mgmt)
      v.literal("admin")         // Full access
    ),
    avatarUrl: v.optional(v.string()),
    isActive: v.boolean(),
    locationId: v.optional(v.string()), // Future: multi-location
    failedAttempts: v.number(),
    lockedUntil: v.optional(v.number()),
    lastLoginAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_role", ["role"])
    .index("by_active", ["isActive"]),

  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(), // UUID v4
    expiresAt: v.number(), // 8 hours from creation
    createdAt: v.number(),
    lastActiveAt: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"])
    .index("by_expiry", ["expiresAt"]),

  // ============================================
  // KITCHEN INVENTORY TRAY
  // Visual inventory system - balls in trays
  // ============================================

  kitchenInventory: defineTable({
    date: v.string(), // YYYY-MM-DD format
    originalBallCount: v.number(), // Current Original balls in tray
    biteSizedBallCount: v.number(), // Current Bite-sized balls in tray
    lastUpdated: v.number(), // Timestamp
    updatedBy: v.optional(v.string()),
  })
    .index("by_date", ["date"]),

  // ============================================
  // PRD-7: USAGE TRACKING TABLES
  // Track frequently used channels and shipping agencies
  // for "top N" button selectors in OrderDetail
  // ============================================

  channelUsage: defineTable({
    channel: v.string(), // Channel code (e.g., "whatsapp", "instagram")
    usageCount: v.number(), // Number of times this channel was selected
  })
    .index("by_channel", ["channel"])
    .index("by_usage", ["usageCount"]),

  shippingAgencyUsage: defineTable({
    agency: v.string(), // Agency name (e.g., "Gojek", "GrabSend", "JNE")
    usageCount: v.number(), // Number of times this agency was selected
  })
    .index("by_agency", ["agency"])
    .index("by_usage", ["usageCount"]),

  // ============================================
  // WHATSAPP TEMPLATE MANAGEMENT
  // Editable templates for WhatsApp messages
  // ============================================

  whatsappTemplates: defineTable({
    code: v.string(), // "payment_request", "production_started", etc.
    name: v.string(), // Human-readable name
    description: v.optional(v.string()), // Usage context
    templateId: v.string(), // Indonesian template
    templateEn: v.string(), // English template
    availableVariables: v.array(v.string()), // ["{customer_name}", "{order_number}", ...]
    isDefault: v.boolean(), // System default (cannot delete)
    lastEditedBy: v.optional(v.string()),
    lastEditedAt: v.optional(v.number()),
  })
    .index("by_code", ["code"]),

  // ============================================
  // PRD-7: ORDER EVENTS AUDIT TABLE
  // Tracks all status changes and significant events
  // for audit trail and debugging
  // ============================================

  orderEvents: defineTable({
    orderId: v.id("orders"),
    eventType: v.string(), // "status_change", "status_auto_transition", "cancelled", etc.
    fromStatus: v.optional(v.string()), // Previous status (for transitions)
    toStatus: v.optional(v.string()), // New status (for transitions)
    reason: v.optional(v.string()), // Human-readable reason
    category: v.optional(v.string()), // Cancellation category, etc.
    metadata: v.optional(v.string()), // JSON string for additional data
    timestamp: v.number(),
    triggeredBy: v.optional(v.string()), // "system", "kitchen", user name, etc.
  })
    .index("by_order", ["orderId"])
    .index("by_type", ["eventType"])
    .index("by_timestamp", ["timestamp"]),

  // ============================================
  // VOUCHER SYSTEM
  // Promotional discount codes with usage tracking
  // ============================================

  vouchers: defineTable({
    // Core identification
    code: v.string(), // Unique, uppercase (e.g., "FREESHIP25")
    name: v.string(), // Admin display name
    description: v.optional(v.string()),

    // Discount configuration
    discountType: v.union(v.literal("amount"), v.literal("percentage")),
    discountValue: v.number(), // IDR amount or percentage (0-100)

    // Constraints
    minimumOrderAmount: v.optional(v.number()), // Min order to apply voucher
    maximumDiscount: v.optional(v.number()), // Cap for percentage discounts

    // Validity period
    isActive: v.boolean(),
    validFrom: v.optional(v.number()), // Timestamp
    validUntil: v.optional(v.number()), // Timestamp

    // Usage limits
    usageLimit: v.optional(v.number()), // Total uses allowed (null = unlimited)
    usageCount: v.number(), // Current total usage
    usagePerCustomer: v.optional(v.number()), // Per-customer limit (null = unlimited)

    // Manager Override fields (for single-use override vouchers)
    isManagerOverride: v.optional(v.boolean()), // True if auto-generated override
    overrideReason: v.optional(v.string()), // Required reason for override
    overrideOrderId: v.optional(v.id("orders")), // Link to specific order

    // Audit
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_code", ["code"])
    .index("by_active", ["isActive"])
    .index("by_manager_override", ["isManagerOverride"])
    .index("by_active_valid", ["isActive", "validFrom"]), // For efficient validation queries

  // Per-customer voucher usage tracking
  voucherUsage: defineTable({
    voucherId: v.id("vouchers"),
    customerId: v.id("customers"),
    orderId: v.id("orders"),
    usedAt: v.number(), // Timestamp
  })
    .index("by_voucher", ["voucherId"])
    .index("by_customer", ["customerId"])
    .index("by_voucher_customer", ["voucherId", "customerId"])
    .index("by_order", ["orderId"]),

  // ============================================
  // INVENTORY MANAGEMENT SYSTEM
  // Unified BOM tracking for production + packaging
  // ============================================

  // Unified component types (replaces productionUnitTypes for BOM)
  componentTypes: defineTable({
    // Identity
    code: v.string(), // "BIG_BALL", "LONG_BOX", "BROCHURE"
    name: v.string(), // "Big Ball", "Long Box", "Brochure"

    // Classification (2 categories after migration)
    category: v.union(
      v.literal("production"), // Kitchen produces (balls)
      v.literal("packaging") // All packaging items (boxes, stickers, brochures)
    ),

    // Production-specific (only for category="production")
    gramsPerUnit: v.optional(v.number()), // 80g for Big Ball

    // Description
    description: v.optional(v.string()),

    // Cost (all components)
    unitCostIdr: v.number(), // Cost per unit in IDR
    unit: v.string(), // "pcs", "g", "m", "sheets"

    // Inventory settings (packaging only - production is made to order)
    trackInventory: v.boolean(), // true for packaging, false for production
    reorderPoint: v.optional(v.number()), // Alert when available < this
    reorderQuantity: v.optional(v.number()), // Suggested order quantity

    // Consumption stage: when inventory is consumed during order lifecycle
    consumptionStage: v.optional(v.union(
      v.literal("production"), // Consumed at InProduction transition
      v.literal("boxing"),     // Consumed at Boxed transition
      v.literal("labeling"),   // Consumed at Labeled transition
      v.literal("none")        // Legacy - not tracked
    )),

    // Alarm percentage: alert when stock drops below this % of last restock
    alarmPercentage: v.optional(v.number()),

    // Display
    color: v.optional(v.string()), // Hex color (for kitchen balls)
    sortOrder: v.number(),
    isActive: v.boolean(),

    // Metadata
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_category", ["category"])
    .index("by_active", ["isActive"])
    .index("by_track_inventory", ["trackInventory"]),

  // Storage locations (Kitchen, Office, Legato Goldfinch)
  storageLocations: defineTable({
    name: v.string(), // "Kitchen", "Office", "Legato Goldfinch"
    locationType: v.union(
      v.literal("office"), // Office (default)
      v.literal("kitchen"), // Kitchen
      v.literal("venue") // Legato Goldfinch
    ),
    address: v.optional(v.string()),
    isActive: v.boolean(),
    isDefault: v.optional(v.boolean()), // Office = true
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_type", ["locationType"])
    .index("by_active", ["isActive"])
    .index("by_default", ["isDefault"]),

  // Inventory batches (FIFO tracking + purchase history)
  inventoryBatches: defineTable({
    componentTypeId: v.id("componentTypes"),
    locationId: v.id("storageLocations"),

    // Purchase details
    purchaseDate: v.number(), // When received
    supplierName: v.string(), // "Tokopedia - PackagingCo"
    supplierBrand: v.optional(v.string()), // Brand name if relevant
    purchaseReference: v.optional(v.string()), // PO#, invoice#
    purchaseUrl: v.optional(v.string()), // Link to reorder

    // Quantities
    quantityPurchased: v.number(), // 2000 stickers
    totalCostIdr: v.number(), // Rp 100,000 for the batch
    unitCostIdr: v.number(), // Rp 50 per sticker (calculated)

    // FIFO tracking
    quantityRemaining: v.number(), // How many left in this batch
    quantityReserved: v.number(), // Reserved for confirmed orders
    // Available = quantityRemaining - quantityReserved

    // Status
    status: v.union(
      v.literal("active"), // Has remaining stock
      v.literal("depleted"), // All consumed
      v.literal("expired") // Past expiry (if tracked)
    ),
    expiryDate: v.optional(v.number()), // For perishables

    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_component", ["componentTypeId"])
    .index("by_location", ["locationId"])
    .index("by_component_location", ["componentTypeId", "locationId"])
    .index("by_status", ["status"])
    .index("by_fifo", ["componentTypeId", "locationId", "purchaseDate"]), // FIFO order

  // Component stock (aggregated view - computed from batches)
  componentStock: defineTable({
    componentTypeId: v.id("componentTypes"),
    locationId: v.id("storageLocations"),

    // Aggregated from all active batches
    totalStock: v.number(), // Sum of quantityRemaining
    totalReserved: v.number(), // Sum of quantityReserved
    // Available = totalStock - totalReserved

    // Weighted average cost (for COGS display)
    weightedUnitCostIdr: v.number(), // Σ(qty × cost) / Σ(qty)

    // Latest batch info (LIFO for reordering)
    latestSupplierName: v.optional(v.string()),
    latestPurchaseUrl: v.optional(v.string()),
    latestUnitCostIdr: v.optional(v.number()),

    // BOM Refactor: Snapshot of totalStock after last restock (for % alarm calculation)
    lastRestockTotalStock: v.optional(v.number()),

    lastUpdated: v.number(),
  })
    .index("by_component", ["componentTypeId"])
    .index("by_location", ["locationId"])
    .index("by_component_location", ["componentTypeId", "locationId"]),

  // Transaction history (audit log)
  componentTransactions: defineTable({
    componentTypeId: v.id("componentTypes"),
    locationId: v.id("storageLocations"),
    batchId: v.optional(v.id("inventoryBatches")), // Which batch affected

    transactionType: v.union(
      v.literal("receive"), // New batch received
      v.literal("consume"), // Used for order (FIFO from oldest batch)
      v.literal("reserve"), // Reserved for confirmed order
      v.literal("unreserve"), // Released (order cancelled)
      v.literal("adjust"), // Physical count adjustment
      v.literal("transfer_out"),
      v.literal("transfer_in"),
      v.literal("expire") // Batch expired
    ),

    quantity: v.number(), // + for in, - for out
    unitCostAtTime: v.number(), // Cost per unit at transaction time (from batch)

    // Links
    orderId: v.optional(v.id("orders")),
    transferId: v.optional(v.string()),
    referenceNote: v.optional(v.string()),

    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_component", ["componentTypeId", "createdAt"])
    .index("by_location", ["locationId", "createdAt"])
    .index("by_batch", ["batchId"])
    .index("by_order", ["orderId"]),

  // Order component reservations (track reserved stock per order)
  orderComponentReservations: defineTable({
    orderId: v.id("orders"),
    componentTypeId: v.id("componentTypes"),
    locationId: v.id("storageLocations"),
    quantityReserved: v.number(),
    quantityConsumed: v.number(),
    status: v.union(
      v.literal("reserved"),
      v.literal("consumed"),
      v.literal("released")
    ),
    // Snapshot of effective consumption stage at reservation time
    // Decouples consumption pipeline from future schema changes
    consumptionStage: v.optional(v.union(
      v.literal("boxing"),
      v.literal("labeling"),
      v.literal("none")
    )),
    createdAt: v.number(),
    consumedAt: v.optional(v.number()),
  })
    .index("by_order", ["orderId"])
    .index("by_component", ["componentTypeId"])
    .index("by_status", ["status"]),

  // ============================================
  // EXTERNAL INTEGRATION TABLES
  // Multi-platform sales data (K3 Mart, GoBiz, etc.)
  // ============================================

  externalOutlets: defineTable({
    source: v.union(v.literal("k3mart"), v.literal("gobiz"), v.literal("internal")),
    externalId: v.string(),
    name: v.string(),
    address: v.optional(v.string()),
    isActive: v.boolean(),
    lastSyncAt: v.optional(v.number()),
    lastSyncStatus: v.optional(v.union(
      v.literal("success"), v.literal("error"), v.literal("partial")
    )),
    lastSyncError: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_source", ["source"])
    .index("by_source_external_id", ["source", "externalId"])
    .index("by_active", ["isActive"]),

  externalStockSnapshots: defineTable({
    outletId: v.id("externalOutlets"),
    snapshotBatchId: v.string(),
    snapshotAt: v.number(),
    externalProductId: v.string(),
    externalProductCode: v.string(),
    productName: v.string(),
    quantity: v.number(),
    price: v.number(),
    priceGrabfoodGofood: v.optional(v.number()),
    priceGrabmart: v.optional(v.number()),
    priceShopee: v.optional(v.number()),
    capital: v.optional(v.number()),
  })
    .index("by_outlet", ["outletId"])
    .index("by_batch", ["snapshotBatchId"])
    .index("by_outlet_product", ["outletId", "externalProductId"])
    .index("by_outlet_snapshot", ["outletId", "snapshotAt"])
    .index("by_snapshot_time", ["snapshotAt"]),

  externalRevenue: defineTable({
    outletId: v.optional(v.id("externalOutlets")),
    source: v.union(v.literal("k3mart"), v.literal("gobiz"), v.literal("internal")),
    externalProductCode: v.optional(v.string()),
    productName: v.optional(v.string()),
    quantitySold: v.optional(v.number()),
    transactionCount: v.optional(v.number()),
    revenueGross: v.optional(v.number()),
    revenueNet: v.optional(v.number()),
    costOfGoods: v.optional(v.number()),
    periodStart: v.number(),
    periodEnd: v.number(),
    dataOrigin: v.union(
      v.literal("stock_delta"),
      v.literal("api_revenue"),
      v.literal("manual_entry"),
      v.literal("csv_upload"),
      v.literal("db_query")
    ),
    confidence: v.union(
      v.literal("exact"),
      v.literal("inferred"),
      v.literal("manual")
    ),
    syncLogId: v.optional(v.id("externalSyncLogs")),
    linkedMenuProductId: v.optional(v.id("menuProducts")),
    externalTransactionId: v.optional(v.string()),
    transactionDate: v.optional(v.number()),
    transactionType: v.optional(v.union(
      v.literal("sales"),
      v.literal("return"),
      v.literal("delta_inferred")
    )),
    commission: v.optional(v.number()),
  })
    .index("by_source", ["source"])
    .index("by_outlet", ["outletId"])
    .index("by_period", ["periodStart"])
    .index("by_source_period", ["source", "periodStart"])
    .index("by_product", ["linkedMenuProductId"])
    .index("by_source_txn", ["source", "externalTransactionId"]),

  externalSyncLogs: defineTable({
    source: v.union(v.literal("k3mart"), v.literal("gobiz"), v.literal("internal")),
    outletId: v.optional(v.id("externalOutlets")),
    snapshotBatchId: v.optional(v.string()),
    syncType: v.union(v.literal("manual")),
    status: v.union(
      v.literal("started"), v.literal("success"), v.literal("error")
    ),
    productsCount: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    triggeredBy: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index("by_source", ["source"])
    .index("by_timestamp", ["timestamp"])
    .index("by_outlet", ["outletId"]),

  externalProductMappings: defineTable({
    source: v.union(v.literal("k3mart"), v.literal("gobiz"), v.literal("internal")),
    externalProductCode: v.string(),
    externalProductName: v.string(),
    menuProductId: v.optional(v.id("menuProducts")),
    isAutoMapped: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_source_code", ["source", "externalProductCode"])
    .index("by_menu_product", ["menuProductId"]),

  // ============================================
  // PLATFORM CREDENTIALS
  // Stores login credentials for external platforms (K3Mart, etc.)
  // Used for automatic token refresh via cron jobs
  // ============================================

  platformCredentials: defineTable({
    platformId: v.string(),
    email: v.string(),
    password: v.string(),
    currentToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    lastRefreshAt: v.optional(v.number()),
    lastRefreshStatus: v.optional(v.union(v.literal("success"), v.literal("error"))),
    lastRefreshError: v.optional(v.string()),
    updatedBy: v.string(),
    updatedAt: v.number(),
  })
    .index("by_platform", ["platformId"]),
});
