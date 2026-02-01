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
    productionType: v.string(), // "original" or "bite_sized"
    productionUnits: v.number(),
    isActive: v.boolean(),
    // PRD-0: Fixed products and COGS tracking
    isFixed: v.optional(v.boolean()), // Cannot be deleted if true
    unitCost: v.optional(v.number()), // COGS in IDR
  })
    .index("by_code", ["code"])
    .index("by_active", ["isActive"]),

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
    status: v.union(
      v.literal("Draft"),
      v.literal("AwaitingPayment"),
      v.literal("Confirmed"),
      v.literal("ProductionComplete"),
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

    // Sales tracking
    channel: v.optional(v.string()),
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

    // Cancellation
    cancellationReason: v.optional(v.string()),

    notes: v.optional(v.string()),
    createdBy: v.string(),

    // Denormalized count
    itemCount: v.number(),
  })
    .index("by_order_number", ["orderNumber"])
    .index("by_customer", ["customerId"])
    .index("by_due_date", ["dueDate"])
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
    ballsRemaining: v.optional(v.number()), // for completion tracking
  })
    .index("by_order", ["orderId"])
    .index("by_product_name", ["productName"]),

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
});
