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
  })
    .index("by_code", ["code"])
    .index("by_active", ["isActive"]),

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
    productionUnitTypeId: v.id("productionUnitTypes"),
    quantity: v.number(), // How many of this unit type per product
    sortOrder: v.number(), // Display ordering
  })
    .index("by_menu_product", ["menuProductId"])
    .index("by_production_type", ["productionUnitTypeId"]),

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
    status: v.union(
      v.literal("Draft"),
      v.literal("AwaitingPayment"),
      v.literal("Confirmed"),
      v.literal("InProduction"),        // NEW: Kitchen actively producing
      v.literal("ProductionComplete"),  // DEPRECATED: Use Packaging instead
      v.literal("Packaging"),
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
    // @deprecated ballsRemaining is no longer updated - use orderItemProduction.unitsRemaining
    // Kept for backward compatibility with existing data
    ballsRemaining: v.optional(v.number()),
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
    .index("by_menu_product", ["menuProductId"]),

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
    .index("by_remaining", ["unitsRemaining"]),

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
});
