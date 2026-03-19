import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ============================================
// Frollie Recipe Master - Convex Schema
// Migrated from FastAPI + SQLAlchemy
// ============================================

// ============================================
// SHARED VALIDATORS
// Exported so integrations/type guards can reference without re-defining.
// ============================================

/**
 * Shared source union for all external integration tables.
 * Must stay in sync with PlatformId in convex/integrations/registry.ts.
 */
export const externalSource = v.union(
  v.literal("k3mart"),
  v.literal("gobiz"),
  v.literal("internal"),
  v.literal("grabfood"),
  v.literal("bigseller"),
  v.literal("consignment"),
  v.literal("shopee"),
  v.literal("tiktok"),
);

/**
 * Shared syncType validator for externalSyncLogs.
 * Must stay in sync with SyncLogEntry type in platformCredentials/queries.ts.
 */
export const syncType = v.union(
  v.literal("manual"),
  v.literal("cron"),
  v.literal("token_refresh"),
  v.literal("webhook"),
);

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
    // CACHE: Calculated from price/volume/shipping. Updated: on ingredient edit.
    costPerBaseUnit: v.number(),
    // CACHE: Derived from unitType (kg->g, l->ml). Updated: on ingredient edit.
    baseUnit: v.string(),
    // Phase 20: Links ingredient to an inventory-tracking componentType (for production ingredient tracking)
    ingredientComponentTypeId: v.optional(v.id("componentTypes")),
  }),
  // OI-01: removed by_name -- zero withIndex references
  // QFIX-05: removed by_brand -- zero withIndex references

  packagingMaterials: defineTable({
    name: v.string(),
    brand: v.optional(v.string()),
    procurementSource: v.optional(v.string()),
    unitType: v.string(), // pcs, m, cm, sheets
    volumePurchased: v.number(),
    priceExclShipping: v.number(),
    shippingCost: v.number(),
    createdBy: v.string(),
    // CACHE: Calculated from price/volume/shipping. Updated: on material edit.
    costPerBaseUnit: v.number(),
    // CACHE: Derived from unitType. Updated: on material edit.
    baseUnit: v.string(),
  }),
  // OI-02: removed by_name -- zero withIndex references

  menuProducts: defineTable({
    code: v.string(),
    name: v.string(),
    grams: v.number(),
    defaultPrice: v.number(),
    isActive: v.boolean(),
    // CACHE: Production COGS from BOM. Source: componentTypes.unitCostIdr via menuProductComponents. Updated: by recalculateAllCosts or invalidateMenuProductCosts.
    unitCost: v.number(),
    // CACHE: Human-readable BOM summary (e.g., "1 Big, 2 Mid"). Source: menuProductComponents + componentTypes. Updated: on BOM change.
    cachedProductionSummary: v.string(),
    // PRD-8: POS slot assignment (positive integer, or undefined for unassigned)
    // Only products with posSlot appear on POS. Unique per slot.
    posSlot: v.optional(v.number()),
    // CACHE: Timestamp when unitCost was marked stale. Cleared after recalculation. Source: set on componentType cost change.
    unitCostStaleAt: v.optional(v.number()),
    // BOM Refactor: Packaging POS slot (positive integer) for packaging-only products
    packagingPosSlot: v.optional(v.number()),
    // BOM Refactor: Derived product type (food = has production components, packaging = only packaging)
    productType: v.optional(v.union(
      v.literal("food"),       // Has >= 1 production component
      v.literal("packaging")   // Only packaging components
    )),
    // DEPRECATED: Legacy fields kept for schema compat with existing docs. Use BOM instead.
    productionType: v.optional(v.string()),
    productionUnits: v.optional(v.number()),
    isFixed: v.optional(v.boolean()),
    /** Storage ID for product photo (written back from GrabFood Menu Simulator uploads) */
    photoStorageId: v.optional(v.id("_storage")),
  })
    .index("by_code", ["code"])
    .index("by_active", ["isActive"])
    // OI-04: removed by_pos_slot -- zero withIndex references
    // OI-05: removed by_packaging_pos_slot -- zero withIndex references
    .index("by_default_price", ["defaultPrice"]),

  // ============================================
  // PRD-5: PRODUCTION UNIT TYPES
  // Atomic units that kitchen produces (e.g., Big Ball, Mid Ball)
  // ============================================

  productionUnitTypes: defineTable({
    code: v.string(), // "BIG_BALL", "MID_BALL"
    name: v.string(), // "Big Ball", "Mid Ball"
    gramsPerUnit: v.number(), // 80 for big, 45 for mid
    unitCostIdr: v.number(), // COGS per unit
    color: v.string(), // Hex color for kitchen display (e.g., "#EF4444")
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
  // CUSTOMER & ORDER TABLES
  // ============================================

  customers: defineTable({
    name: v.string(),
    phone: v.optional(v.string()),
    source: v.optional(v.string()),
    notes: v.optional(v.string()),
    defaultAddress: v.optional(v.string()),
    createdBy: v.string(),
    // Phase 57: Invoice buyer fields (write-back from invoice finalize)
    companyName: v.optional(v.string()),
    npwp: v.optional(v.string()),
    billingAddress: v.optional(v.string()),
  })
    // OI-03: removed by_name -- zero withIndex references
    .index("by_phone", ["phone"]),

  orders: defineTable({
    orderNumber: v.string(),
    customerId: v.id("customers"),
    // SNAPSHOT: Copied from customers.name at order creation. Never updated after.
    customerName: v.string(),
    // SNAPSHOT: Copied from customers.phone at order creation. Never updated after.
    customerPhone: v.optional(v.string()),

    // Phase 14: Simplified 7-status Kanban workflow
    status: v.union(
      v.literal("Draft"),
      v.literal("AwaitingPayment"),
      v.literal("PaymentReceived"),     // Was "Confirmed"
      v.literal("BeingPrepared"),       // Replaces InProduction/Boxed/Labeled/Packaging
      v.literal("AwaitingDelivery"),    // Replaces WaitingShipment/WaitingPickup
      v.literal("Complete"),            // Replaces CompleteShipped/PickedUp
      v.literal("Cancelled"),
      // LEGACY: Old statuses kept for unmigrated production docs
      v.literal("Confirmed"),
      v.literal("InProduction"),
      v.literal("Boxed"),
      v.literal("Labeled"),
      v.literal("Packaging"),
      v.literal("WaitingShipment"),
      v.literal("WaitingPickup"),
      v.literal("CompleteShipped"),
      v.literal("PickedUp")
    ),
    awaitingPaymentSince: v.optional(v.number()),
    confirmedAt: v.optional(v.number()), // When payment was confirmed (revenue recognition date)

    // PRD-0: Payment status with type-safe union
    paymentStatus: v.union(
      v.literal("Unpaid"),
      v.literal("Partial"),
      v.literal("Paid")
    ),
    paymentMethod: v.optional(v.string()),

    orderDate: v.number(), // timestamp
    dueDate: v.optional(v.number()),

    // DERIVED: Sum of orderItems.lineTotal. Updated on item add/remove/edit.
    totalAmount: v.number(),
    // DERIVED: Sum of orderItems.lineCost. Updated on item add/remove/edit.
    totalCost: v.number(),
    // DERIVED: totalAmount - totalCost. Updated on item add/remove/edit.
    totalMargin: v.number(),

    // PRD-0: Order-level discount
    orderLevelDiscount: v.optional(v.number()),
    orderLevelDiscountType: v.optional(v.union(
      v.literal("amount"),
      v.literal("percentage")
    )),
    // DERIVED: totalAmount - orderLevelDiscount. Updated on discount change.
    finalTotal: v.number(),
    // Manually entered GoSend delivery fee. Separate from product costs. Included in finalTotal.
    deliveryFee: v.optional(v.number()),

    // Voucher tracking (optional - only if voucher applied)
    voucherId: v.optional(v.id("vouchers")),
    // SNAPSHOT: Copied from vouchers.code at order creation. Never updated after.
    voucherCode: v.optional(v.string()),
    // SNAPSHOT: Calculated discount at order creation. Never updated after.
    voucherDiscountValue: v.optional(v.number()),
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
    // Phase 14: Creator attribution (machine-readable link to users table)
    createdByUserId: v.optional(v.id("users")),
    // Phase 14: Rush order marking
    expedited: v.optional(v.boolean()),
    // Phase 14: Reference to original order when copied from cancelled
    copiedFromOrderId: v.optional(v.id("orders")),
    // Phase 14: Timestamp when order entered kitchen (auto-entry tracking, one-time threshold consumed)
    kitchenEnteredAt: v.optional(v.number()),

    // DERIVED: Count of orderItems for this order. Updated on item add/remove.
    itemCount: v.number(),

    // DERIVED: Computed from status. Set on every status transition. Source: statusTransitions.ts computeKitchenVisibility().
    isKitchenVisible: v.optional(v.boolean()),
    // DERIVED: Set when order reaches terminal status (Complete/Cancelled). Cleared on revert.
    completedAt: v.optional(v.number()),
  })
    .index("by_order_number", ["orderNumber"])
    .index("by_customer", ["customerId"])
    // REMOVED: .index("by_due_date", ["dueDate"]) - covered by by_status_due_date
    .index("by_status", ["status"])
    .index("by_channel", ["channel"])
    .index("by_status_due_date", ["status", "dueDate"])
    .index("by_kitchen_visible", ["isKitchenVisible", "dueDate"]),

  orderItems: defineTable({
    orderId: v.id("orders"),
    // SNAPSHOT: From manual entry or menuProducts.name at item creation. Never updated after.
    productName: v.string(),
    productVariant: v.optional(v.string()),
    quantity: v.number(),
    // SNAPSHOT: From manual entry or menuProducts.defaultPrice at item creation. Never updated after.
    unitPrice: v.number(),
    // SNAPSHOT: From menuProducts.unitCost at item creation. Never updated after.
    unitCost: v.number(),
    discountAmount: v.number(),
    // DERIVED: quantity * unitPrice - discountAmount. Computed at creation/update.
    lineTotal: v.number(),
    // DERIVED: quantity * unitCost. Computed at creation/update.
    lineCost: v.number(),
    // DERIVED: lineTotal - lineCost. Computed at creation/update.
    lineMargin: v.number(),
    // Optional link to menu product
    menuProductId: v.optional(v.id("menuProducts")),
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
    // DEPRECATED: Legacy fields kept for schema compat with existing docs. Use BOM instead.
    productionType: v.optional(v.string()),
    productionUnits: v.optional(v.number()),
  })
    .index("by_order", ["orderId"])
    .index("by_menu_product", ["menuProductId"]),
  // QFIX-05: removed by_product_name -- zero withIndex references
  // QFIX-05: removed by_production_type -- deprecated field, zero references

  // ============================================
  // PRD-5: ORDER ITEM PRODUCTION
  // Tracks production progress per unit type per order item
  // Supports multiple production types per item (for combo packs)
  // ============================================

  orderItemProduction: defineTable({
    orderItemId: v.id("orderItems"),
    productionUnitTypeId: v.id("productionUnitTypes"),
    // SNAPSHOT: From productionUnitTypes.code at order confirmation. Never updated after.
    productionUnitCode: v.string(), // "BIG_BALL", "MID_BALL"
    // SNAPSHOT: From productionUnitTypes.name at order confirmation. Never updated after.
    productionUnitName: v.string(), // "Big Ball", "Mid Ball"
    // Production tracking
    unitsRequired: v.number(), // Total needed (orderItem.quantity * component.quantity)
    unitsCompleted: v.number(), // How many have been produced
    // DERIVED: unitsRequired - unitsCompleted. Updated on each ball completion.
    unitsRemaining: v.number(),
    // PRD-7: Cancellation flag for soft delete
    isCancelled: v.optional(v.boolean()),
  })
    .index("by_order_item", ["orderItemId"]),
  // OI-07: removed by_production_type -- zero withIndex references
  // QFIX-05: removed by_remaining, by_completion -- zero withIndex references

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
    // Phase 41: Bank details for reimbursement payments
    bankAccountNumber: v.optional(v.string()),
    bankName: v.optional(v.string()),
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
    originalBallCount: v.number(), // Current Original (45g, MID_BALL) balls in tray
    biteSizedBallCount: v.number(), // Current Jumbo (80g, BIG_BALL) balls in tray
    totalProducedOriginal: v.optional(v.number()), // Cumulative balls produced today (never decremented)
    totalProducedBiteSized: v.optional(v.number()), // Cumulative balls produced today (never decremented)
    lastUpdated: v.number(), // Timestamp
    updatedBy: v.optional(v.string()),
  })
    .index("by_date", ["date"]),

  // ============================================
  // KITCHEN PRODUCTION TRACKING
  // Batch production targets, counts, and audit log
  // ============================================

  // Daily production goals per unit type
  productionTargets: defineTable({
    date: v.string(), // YYYY-MM-DD
    productionUnitTypeId: v.id("productionUnitTypes"),
    autoTargetQuantity: v.number(), // Calculated from confirmed orders
    manualOverride: v.optional(v.number()), // Manager addition
    createdBy: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_date", ["date"])
    .index("by_type_date", ["productionUnitTypeId", "date"]),

  // Per-product production targets by source
  // source: "consignment" (K3 Mart / retail) or "gofood" (GoFood / online)
  // Orders are auto-calculated from active orders, not stored here
  productionProductTargets: defineTable({
    date: v.string(), // YYYY-MM-DD
    source: v.string(), // "consignment" | "gofood"
    menuProductId: v.id("menuProducts"),
    quantity: v.number(), // How many of this product to produce
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_date", ["date"])
    .index("by_date_source", ["date", "source"])
    .index("by_date_source_product", ["date", "source", "menuProductId"]),
  // QFIX-05: removed by_date_product -- prefix subset of by_date_source_product, zero references

  // ARCHIVED: Read-only since Phase 21. Source of truth is now productionLog aggregation + productionResets timestamps.
  // Kept for backward compatibility with existing documents. Do NOT write to this table.
  productionCounts: defineTable({
    menuProductId: v.id("menuProducts"),
    boxed: v.number(), // Total boxed since last reset
    stickered: v.number(), // Total stickered since last reset
    packed: v.number(), // Total packed since last reset
    shippedToGoldfinch: v.optional(v.number()), // Boxes shipped to Goldfinch depot since last reset
    lastResetAt: v.optional(v.number()), // When counts were last reset
    lastResetBy: v.optional(v.string()), // Who reset the counts
  })
    .index("by_menu_product", ["menuProductId"]),

  // Audit log for production target changes (daily target history)
  productionTargetLogs: defineTable({
    date: v.string(), // YYYY-MM-DD
    timestamp: v.number(), // Date.now()
    source: v.string(), // "consignment" | "gofood"
    menuProductId: v.id("menuProducts"),
    previousQuantity: v.number(),
    newQuantity: v.number(),
  })
    .index("by_date", ["date"]),
  // QFIX-05: removed by_date_timestamp -- zero withIndex references, insert-only table

  // Audit log for every production action
  productionLog: defineTable({
    menuProductId: v.id("menuProducts"),
    action: v.union(
      v.literal("box"), v.literal("unbox"),
      v.literal("sticker"), v.literal("unsticker"),
      v.literal("pack"), v.literal("unpack"),
      v.literal("ship_goldfinch"), v.literal("return_goldfinch")
    ),
    quantity: v.number(), // Always positive
    timestamp: v.number(), // Date.now()
    performedBy: v.string(), // Username from token
    orderId: v.optional(v.id("orders")), // For pack/unpack actions
    orderItemId: v.optional(v.id("orderItems")), // For pack/unpack actions
    note: v.optional(v.string()), // e.g., "correction"
  })
    .index("by_menu_product", ["menuProductId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_menu_product_timestamp", ["menuProductId", "timestamp"]),

  // ============================================
  // INTEGRITY CHECK LOGS
  // Weekly automated data integrity checks
  // ============================================

  integrityCheckLogs: defineTable({
    timestamp: v.number(),
    type: v.string(), // Check type (e.g. "production_counts")
    status: v.union(v.literal("pass"), v.literal("fail")),
    mismatchCount: v.number(),
    mismatches: v.optional(v.string()), // JSON string of mismatch details
  })
    .index("by_timestamp", ["timestamp"]),

  // ============================================
  // PRODUCTION RESETS
  // Tracks when production counts were last reset per menu product
  // ============================================

  productionResets: defineTable({
    menuProductId: v.id("menuProducts"),
    lastResetAt: v.number(), // Timestamp of last reset
    lastResetBy: v.string(), // Username who reset
  })
    .index("by_menu_product", ["menuProductId"]),

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
  // BUSINESS SETTINGS (singleton)
  // Company identity for invoice generation
  // ============================================

  businessSettings: defineTable({
    businessName: v.string(),
    logoStorageId: v.optional(v.id("_storage")),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    npwp: v.optional(v.string()),
    defaultBankAccountId: v.optional(v.id("bankAccounts")),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
  }),

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
    // Phase 14: Who performed the action (machine-readable link to users table)
    userId: v.optional(v.id("users")),
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
    applicableMenuProductId: v.optional(v.id("menuProducts")), // Item-linked: only discounts matching product

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

    // Free Voucher fields (admin-only, 100% discount)
    isFreeVoucher: v.optional(v.boolean()), // True if created via createFreeVoucher
    freeReason: v.optional(v.string()), // "QA Testing" | "Gift" | "Other: {text}"

    // Audit
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_code", ["code"])
    .index("by_active", ["isActive"])
    .index("by_manager_override", ["isManagerOverride"]),
    // OI-09: removed by_active_valid -- zero withIndex references

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

    // Phase 20: Batch size and COGS fields for production ingredient tracking
    batchSize: v.optional(v.number()),            // e.g., 100g for marshmallow, 45g for Mid Ball
    batchSizeUnit: v.optional(v.string()),        // "g", "ml", "pcs"
    cogsMode: v.optional(v.union(v.literal("manual"), v.literal("calculated"))),
    manualUnitCostIdr: v.optional(v.number()),    // Preserved manual cost fallback
    cachedCalculatedCogs: v.optional(v.number()), // Calculated COGS per unit
    cogsCacheUpdatedAt: v.optional(v.number()),   // When cache was last updated
    cogsMissingCount: v.optional(v.number()),     // Count of ingredients missing cost data

    // Metadata
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_category", ["category"])
    .index("by_active", ["isActive"])
    .index("by_track_inventory", ["trackInventory"]),

  // ============================================
  // Production Component Recipes (Hierarchical BOM)
  // Links production components to sub-components and direct ingredients
  // Supports up to 3 tiers of nesting with circular reference detection
  // ============================================

  // Links production components to sub-components (hierarchical BOM)
  productionComponentLinks: defineTable({
    parentComponentId: v.id("componentTypes"),    // Parent production component
    childComponentId: v.id("componentTypes"),     // Child sub-component
    quantityPerUnit: v.number(),                  // Qty of child per 1 unit of parent
    unit: v.string(),                             // Unit (g, ml, pcs)
    sortOrder: v.number(),
  })
    .index("by_parent", ["parentComponentId"])
    .index("by_child", ["childComponentId"]),

  // Links production components to direct ingredients
  productionComponentIngredients: defineTable({
    componentTypeId: v.id("componentTypes"),      // Parent production component
    ingredientId: v.id("ingredients"),            // Direct ingredient
    quantityPerUnit: v.number(),                  // Qty per 1 unit of parent
    unit: v.string(),                             // Unit (g, ml, pcs)
    sortOrder: v.number(),
    ingredientName: v.optional(v.string()),       // SNAPSHOT from ingredients.name
    cachedLineCost: v.optional(v.number()),        // CACHE: ingredientCost * quantityPerUnit
  })
    .index("by_component", ["componentTypeId"])
    .index("by_ingredient", ["ingredientId"]),

  // Storage locations (Kitchen, Office, Legato Goldfinch)
  storageLocations: defineTable({
    name: v.string(), // "Kitchen", "Office", "Legato Goldfinch"
    locationType: v.union(
      v.literal("office"), // Office (default)
      v.literal("kitchen"), // Kitchen
      v.literal("venue"), // Legato Goldfinch
      v.literal("depot") // External depot (Tamtem, Goldfinch)
    ),
    address: v.optional(v.string()),
    isActive: v.boolean(),
    isDefault: v.optional(v.boolean()), // Office = true
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_type", ["locationType"])
    .index("by_active", ["isActive"])
    .index("by_default", ["isDefault"])
    .index("by_type_active", ["locationType", "isActive"]),

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
    // DERIVED: totalCostIdr / quantityPurchased. Computed at batch creation.
    unitCostIdr: v.number(),

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
    .index("by_fifo", ["componentTypeId", "locationId", "purchaseDate"]), // FIFO order
  // QFIX-05: removed by_status -- zero withIndex references, queries filter by status after by_fifo/by_component

  // Component stock (aggregated view - computed from batches)
  componentStock: defineTable({
    componentTypeId: v.id("componentTypes"),
    locationId: v.id("storageLocations"),

    // CACHE: Sum of inventoryBatches.quantityRemaining. Updated: on batch change.
    totalStock: v.number(),
    // CACHE: Sum of inventoryBatches.quantityReserved. Updated: on reservation change.
    totalReserved: v.number(),
    // Available = totalStock - totalReserved

    // CACHE: Weighted average cost from active batches. Updated: on batch change.
    weightedUnitCostIdr: v.number(),

    // CACHE: From most recent inventoryBatch. Updated: on new batch.
    latestSupplierName: v.optional(v.string()),
    // CACHE: From most recent inventoryBatch. Updated: on new batch.
    latestPurchaseUrl: v.optional(v.string()),
    // CACHE: From most recent inventoryBatch. Updated: on new batch.
    latestUnitCostIdr: v.optional(v.number()),

    // CACHE: Snapshot of totalStock at last restock. Updated: on restock.
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
    .index("by_location", ["locationId", "createdAt"]),
  // QFIX-05: removed by_batch, by_order -- zero withIndex references on componentTransactions

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
    .index("by_status", ["status"])
    .index("by_order_status", ["orderId", "status"]),

  // ============================================
  // FINISHED GOODS INVENTORY
  // Product-level stock tracking at locations (boxes)
  // ============================================

  // Simple aggregate stock per product per location (NOT FIFO batch tracking)
  productInventory: defineTable({
    menuProductId: v.id("menuProducts"),
    locationId: v.id("storageLocations"),
    quantity: v.number(),           // Current stock count (boxes). Can go negative for GoFood.
    lowStockThreshold: v.optional(v.number()),  // Per-product-location override (null = use global)
    lastUpdated: v.number(),
  })
    .index("by_menu_product", ["menuProductId"])
    .index("by_location", ["locationId"])
    .index("by_product_location", ["menuProductId", "locationId"]),

  // Full audit trail of all stock changes
  productInventoryTransactions: defineTable({
    menuProductId: v.id("menuProducts"),
    locationId: v.id("storageLocations"),
    transactionType: v.union(
      v.literal("add"),           // Kitchen adds stock
      v.literal("drawdown"),      // Order fulfilment drawdown
      v.literal("gofood_sale"),   // GoFood sync auto-deduction
      v.literal("adjust"),        // Manager adjustment (spoilage, correction, transfer)
      v.literal("transfer"),      // Phase 19: Stock transfer between locations
    ),
    quantity: v.number(),          // + for add/adjust-up, - for drawdown/adjust-down
    previousQuantity: v.number(),
    newQuantity: v.number(),
    orderId: v.optional(v.id("orders")),
    gofoodOrderRef: v.optional(v.string()),
    reason: v.optional(v.string()), // For adjustments
    // Phase 19: Links source and destination transfer transactions
    transferPairLocationId: v.optional(v.id("storageLocations")),
    performedBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_product_location", ["menuProductId", "locationId", "createdAt"])
    .index("by_location", ["locationId", "createdAt"])
    .index("by_order", ["orderId"])
    .index("by_type", ["transactionType", "createdAt"]),

  // Global config (single-row pattern)
  productInventorySettings: defineTable({
    globalLowStockThreshold: v.number(),   // Default 5
    defaultAddLocationId: v.optional(v.id("storageLocations")),
    autoAdvanceOnDrawdown: v.boolean(),    // Default true
    alertMode: v.union(v.literal("toast"), v.literal("toast_and_badge")),
    updatedBy: v.string(),
    updatedAt: v.number(),
  }),

  // ============================================
  // EXTERNAL INTEGRATION TABLES
  // Multi-platform sales data (K3 Mart, GoBiz, etc.)
  // ============================================

  externalOutlets: defineTable({
    source: externalSource,
    externalId: v.string(),
    name: v.string(),
    address: v.optional(v.string()),
    isActive: v.boolean(),
    lastSyncAt: v.optional(v.number()),
    lastSyncStatus: v.optional(v.union(
      v.literal("success"), v.literal("error"), v.literal("partial")
    )),
    lastSyncError: v.optional(v.string()),
    // Phase 17.1: Links GoFood outlet to a storageLocation for finished goods tracking
    linkedStorageLocationId: v.optional(v.id("storageLocations")),
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_source", ["source"])
    .index("by_source_external_id", ["source", "externalId"])
    .index("by_active", ["isActive"])
    .index("by_source_active", ["source", "isActive"]),

  externalStockSnapshots: defineTable({
    outletId: v.id("externalOutlets"),
    snapshotBatchId: v.string(),
    snapshotAt: v.number(),
    externalProductId: v.string(),
    externalProductCode: v.string(),
    // SNAPSHOT: From external API at snapshot time. Never updated after.
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
    // OI-10: removed by_snapshot_time -- zero withIndex references
    .index("by_batch_outlet", ["snapshotBatchId", "outletId"]),

  externalRevenue: defineTable({
    outletId: v.optional(v.id("externalOutlets")),
    source: externalSource,
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
    adBurn: v.optional(v.number()),
    promoBurn: v.optional(v.number()),
    deliveryFees: v.optional(v.number()),
    gobizOrderNumber: v.optional(v.string()),
  })
    .index("by_source", ["source"])
    .index("by_outlet", ["outletId"])
    .index("by_period", ["periodStart"])
    .index("by_source_period", ["source", "periodStart"])
    // OI-11: removed by_product -- zero withIndex references
    .index("by_source_txn", ["source", "externalTransactionId"]),

  externalRevenueItems: defineTable({
    revenueId: v.id("externalRevenue"),
    source: externalSource,
    externalItemId: v.optional(v.string()),
    productName: v.string(),
    unitPrice: v.number(),
    quantity: v.number(),
    totalPrice: v.number(),
    variants: v.optional(v.string()),
    linkedMenuProductId: v.optional(v.id("menuProducts")),
    isAutoMatched: v.boolean(),
    matchConfidence: v.optional(v.union(
      v.literal("exact"), v.literal("price_only"),
      v.literal("name_only"), v.literal("none")
    )),
    createdAt: v.number(),
  })
    .index("by_revenue", ["revenueId"])
    .index("by_source", ["source"])
    .index("by_menu_product", ["linkedMenuProductId"])
    .index("by_product_name", ["source", "productName"]),

  externalSyncLogs: defineTable({
    source: externalSource,
    outletId: v.optional(v.id("externalOutlets")),
    snapshotBatchId: v.optional(v.string()),
    syncType: syncType,
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
    source: externalSource,
    externalProductCode: v.string(),
    externalProductName: v.string(),
    menuProductId: v.optional(v.id("menuProducts")),
    isAutoMapped: v.boolean(),
    createdAt: v.number(),
    grabfoodPrice: v.optional(v.number()),
    isAvailable: v.optional(v.boolean()),
  })
    .index("by_source_code", ["source", "externalProductCode"])
    .index("by_menu_product", ["menuProductId"]),

  // ============================================
  // PLATFORM CREDENTIALS
  // Stores login credentials for external platforms (K3Mart, etc.)
  // Used for automatic token refresh via cron jobs
  // ============================================

  // ============================================
  // RESTOCK PLANNER
  // Persisted restock targets + manual stock entries
  // ============================================

  restockTargets: defineTable({
    outletId: v.optional(v.id("externalOutlets")),
    channel: v.string(),
    productKey: v.string(),
    menuProductId: v.optional(v.id("menuProducts")),
    weekdayTarget: v.number(),
    weekendTarget: v.number(),
    customPrice: v.optional(v.number()), // Per-outlet price override (null = use menu product default)
    isHidden: v.optional(v.boolean()), // Whether to hide from planning grid
    updatedBy: v.string(),
    updatedAt: v.number(),
  })
    .index("by_outlet", ["outletId"])
    .index("by_channel", ["channel"])
    .index("by_outlet_product", ["outletId", "productKey"]),

  manualStockEntries: defineTable({
    channel: v.string(),
    productKey: v.string(),
    menuProductId: v.optional(v.id("menuProducts")),
    quantity: v.number(),
    enteredBy: v.string(),
    enteredAt: v.number(),
  })
    .index("by_channel", ["channel"])
    .index("by_channel_product", ["channel", "productKey"]),

  platformCredentials: defineTable({
    platformId: v.string(),
    email: v.optional(v.string()),
    password: v.optional(v.string()),
    currentToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    refreshToken: v.optional(v.string()),
    lastRefreshAt: v.optional(v.number()),
    lastRefreshStatus: v.optional(v.union(v.literal("success"), v.literal("error"))),
    lastRefreshError: v.optional(v.string()),
    hmacSecret: v.optional(v.string()),
    updatedBy: v.string(),
    updatedAt: v.number(),
  })
    .index("by_platform", ["platformId"]),

  // ============================================
  // GOFOOD DEPOT (GOLDFINCH) TRACKING
  // Per-product stock at Goldfinch depot + shipment audit log
  // ============================================

  // Per-product running stock at Goldfinch depot (source of truth)
  gofoodDepotStock: defineTable({
    menuProductId: v.id("menuProducts"), // Which product
    quantity: v.number(), // Current boxes at Goldfinch (can go negative = debt)
    stickerDeficit: v.optional(v.number()), // Cumulative sticker shortfall
    lastUpdated: v.number(), // Timestamp of last change
    // Phase 19: Per-outlet stock tracking (optional for backward compat)
    outletId: v.optional(v.id("externalOutlets")),
  })
    .index("by_menuProduct", ["menuProductId"])
    .index("by_outlet_product", ["outletId", "menuProductId"]),

  // Phase 19: Per-outlet product mapping config (GoFood product name -> internal menuProduct)
  gofoodOutletProductMappings: defineTable({
    outletId: v.id("externalOutlets"),
    externalProductName: v.string(),        // GoFood product name from GoBiz sync
    menuProductId: v.optional(v.id("menuProducts")), // Linked internal product (null = unmapped)
    isActive: v.boolean(),                  // Whether this product is sold at this outlet
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_outlet", ["outletId"])
    .index("by_outlet_product", ["outletId", "externalProductName"]),

  // Audit log of every shipment from Office to Goldfinch
  gofoodDepotShipments: defineTable({
    date: v.string(), // YYYY-MM-DD
    menuProductId: v.id("menuProducts"), // Which product
    quantity: v.number(), // How many boxes shipped
    stickersTransferred: v.number(), // How many stickers transferred alongside
    shippedBy: v.string(), // Who confirmed the shipment
    timestamp: v.number(), // When confirmed
  })
    .index("by_date", ["date"])
    .index("by_product_date", ["menuProductId", "date"]),

  // ============================================
  // K3 MART COCKPIT - Dispatch Planning & Stock Movements
  // Weekly dispatch plans and stock movement audit log
  // ============================================

  // ============================================
  // DISPATCH PLANNER
  // Multi-channel production dispatch planning
  // ============================================

  dispatchPlans: defineTable({
    date: v.string(), // YYYY-MM-DD
    channel: v.string(), // "direct" | "gofood" | "k3mart" | "consignment"
    outletId: v.optional(v.union(v.id("externalOutlets"), v.id("consignmentOutlets"))), // For GoFood/K3Mart/Consignment outlets
    orderId: v.optional(v.id("orders")), // For Direct Sales (links to specific order)
    menuProductId: v.id("menuProducts"),
    plannedQty: v.number(),
    actualQty: v.optional(v.number()), // Filled from actual sales data (past days)
    source: v.string(), // "manual" | "auto_suggest" | "redistributed"
    updatedBy: v.string(),
    updatedAt: v.number(),
  })
    .index("by_date_channel", ["date", "channel"])
    .index("by_date", ["date"])
    .index("by_order", ["orderId"])
    .index("by_outlet_date", ["outletId", "date"]),

  dispatchChannelConfig: defineTable({
    channelKey: v.string(), // "direct" | "gofood" | "k3mart" | "consignment"
    displayName: v.string(), // "Direct Sales", "GoFood", etc.
    color: v.string(), // Hex color for capacity bar segment
    priority: v.number(), // Lower = higher priority (1 = highest)
    isBuiltIn: v.boolean(), // true for Direct/GoFood/K3Mart, false for custom
    isEnabled: v.boolean(),
    updatedBy: v.string(),
    updatedAt: v.number(),
    // DUP-01: removed commissionRate -- unused, net/gross tracked from external APIs
    commissionRate: v.optional(v.number()), // DATA-COMPAT: kept optional until dev DB patched
  })
    .index("by_channel", ["channelKey"])
    .index("by_priority", ["priority"]),

  dispatchPlannerSettings: defineTable({
    dailyCapacity: v.number(), // Default 200 balls
    updatedBy: v.string(),
    updatedAt: v.number(),
  }),

  // ============================================
  // KITCHEN CONFIG
  // Single-row table for kitchen production targets
  // ============================================

  kitchenConfig: defineTable({
    maxProductionTarget: v.number(),  // Default 200
    bigBallTarget: v.number(),        // Absolute number, default 150
    midBallTarget: v.number(),        // Absolute number, default 50
    // Phase 21: Default packaging mix for target derivation (fallback when no dispatch plan)
    defaultPackagingMix: v.optional(v.array(v.object({
      menuProductId: v.id("menuProducts"),
      quantity: v.number(),
    }))),
    // Phase 21-07: when false, Jumbo (80g) stat card is hidden in ProductionTargetsBar
    showJumbo: v.optional(v.boolean()),
    // Phase 21-08: Per-component visibility toggles (replaces showJumbo long-term)
    // Array of enabled production component codes, e.g. ["BIG_BALL", "MID_BALL"]
    // When unset, defaults to all active production component codes (all enabled)
    enabledProductionComponents: v.optional(v.array(v.string())),
    updatedAt: v.number(),
    updatedBy: v.string(),
  }),

  // ============================================
  // KITCHEN SHIFT RECORDS
  // Per-shift production + waste audit log
  // ============================================

  kitchenShiftRecords: defineTable({
    date: v.string(),                          // YYYY-MM-DD
    submittedAt: v.number(),                   // Date.now()
    submittedBy: v.string(),                   // username from auth
    submittedByUserId: v.optional(v.id("users")),
    // Phase 21-08: Actual cook (may differ from the person who submitted the record)
    chefName: v.optional(v.string()),
    chefUserId: v.optional(v.id("users")),
    produced: v.array(v.object({
      menuProductId: v.id("menuProducts"),
      quantity: v.number(),
    })),
    waste: v.array(v.object({
      menuProductId: v.id("menuProducts"),
      reason: v.union(
        v.literal("qa_testing"),
        v.literal("spoilage"),
        v.literal("waste")
      ),
      quantity: v.number(),
    })),
    inventoryUpdates: v.array(v.object({
      menuProductId: v.id("menuProducts"),
      locationId: v.id("storageLocations"),
      delta: v.number(),
      previousQuantity: v.number(),
      newQuantity: v.number(),
    })),
    editedAt: v.optional(v.number()),
    editedBy: v.optional(v.string()),
    editNote: v.optional(v.string()),
  })
    .index("by_date", ["date"]),
    // OI-14: removed by_date_submitted -- zero withIndex references

  // ============================================
  // KITCHEN DAILY OVERRIDES
  // Per-day production target overrides (manager can override dispatch plan)
  // Priority chain: override > dispatch_plan > defaults
  // ============================================

  kitchenDailyOverrides: defineTable({
    date: v.string(),                          // YYYY-MM-DD
    bigBallOverride: v.optional(v.number()),
    midBallOverride: v.optional(v.number()),
    packagingOverrides: v.optional(v.array(v.object({
      menuProductId: v.id("menuProducts"),
      quantity: v.number(),
    }))),
    setAt: v.number(),
    setBy: v.string(),
    source: v.optional(v.union(v.literal("manual"), v.literal("restock_planner"))),
  })
    .index("by_date", ["date"]),

  k3martDispatchPlans: defineTable({
    date: v.string(), // YYYY-MM-DD
    weekNumber: v.string(), // ISO week e.g. "2026-W07"
    outletId: v.id("externalOutlets"),
    menuProductId: v.id("menuProducts"),
    externalProductId: v.string(), // "47068" or "47069"
    suggestedQty: v.number(),
    plannedQty: v.number(),
    isStockOut: v.boolean(), // false = stock-in, true = stock-out
    source: v.optional(v.union(v.literal("kitchen"), v.literal("goldfinch"), v.literal("outlet"))),
    sourceOutletId: v.optional(v.id("externalOutlets")),
    destinationOutletId: v.optional(v.id("externalOutlets")),
    destination: v.optional(v.union(v.literal("office"), v.literal("goldfinch"), v.literal("outlet"))),
    status: v.union(
      v.literal("draft"),
      v.literal("confirmed"),
      v.literal("submitted"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("canceled")
    ),
    submissionInProgress: v.optional(v.boolean()),
    k3martRequestId: v.optional(v.number()),
    submittedAt: v.optional(v.number()),
    submittedBy: v.optional(v.string()),
    updatedBy: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_date_outlet", ["date", "outletId"])
    .index("by_date_status", ["date", "status"])
    .index("by_outlet_date", ["outletId", "date"])
    .index("by_week", ["weekNumber"]),

  k3martStockMovements: defineTable({
    date: v.string(), // YYYY-MM-DD
    outletId: v.id("externalOutlets"),
    direction: v.union(v.literal("stock_in"), v.literal("stock_out")),
    menuProductId: v.id("menuProducts"),
    externalProductId: v.string(),
    quantity: v.number(),
    // SNAPSHOT: Price at K3Mart submission time. Never updated after.
    priceAtSubmission: v.number(),
    // SNAPSHOT: Stock level at K3Mart submission time. Never updated after.
    currentStockAtSubmission: v.number(),
    source: v.optional(v.union(v.literal("kitchen"), v.literal("goldfinch"), v.literal("outlet"))),
    k3martRequestId: v.optional(v.number()),
    k3martStatus: v.optional(v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("canceled")
    )),
    destination: v.optional(v.union(v.literal("office"), v.literal("goldfinch"), v.literal("outlet"))),
    destinationOutletId: v.optional(v.id("externalOutlets")),
    note: v.optional(v.string()),
    attemptCount: v.number(),
    submittedBy: v.string(),
    submittedAt: v.number(),
  })
    .index("by_date", ["date"])
    .index("by_outlet_date", ["outletId", "date"])
    // OI-15: removed by_outlet_direction -- zero withIndex references
    .index("by_status", ["k3martStatus"]),

  // ============================================
  // PHASE 26: NEW PLATFORM ORDER TABLES
  // GrabFood, BigSeller, and Consignment settlement tables.
  // Source union in all 5 external tables extended to include these platforms.
  // ============================================

  grabfoodOrders: defineTable({
    orderID: v.string(),            // Dedup key from GrabFood API
    merchantID: v.string(),
    shortOrderNumber: v.string(),
    orderState: v.optional(v.string()),
    orderTime: v.string(),          // ISO 8601 string from API
    orderTimeMs: v.number(),        // Unix ms for range queries
    currency: v.string(),
    items: v.array(v.any()),        // Raw item data -- schema refined in Phase 27
    price: v.any(),                 // Raw price object -- refined in Phase 27
    rawJson: v.optional(v.string()),
    syncLogId: v.optional(v.id("externalSyncLogs")),
    outletId: v.optional(v.id("externalOutlets")),
    linkedRevenueId: v.optional(v.id("externalRevenue")),
    createdAt: v.number(),
  })
    .index("by_order_id", ["orderID"])
    // OI-16: removed by_merchant -- zero withIndex references
    .index("by_outlet", ["outletId"])
    .index("by_time", ["orderTimeMs"]),
    // OI-17: removed by_sync_log -- zero withIndex references
    // OI-18: removed by_linked_revenue -- zero withIndex references

  bigsellerOrders: defineTable({
    platformOrderId: v.string(),    // Dedup key from BigSeller API
    shopId: v.number(),
    shopName: v.string(),
    platform: v.string(),           // "shopee", "tokopedia", etc.
    orderState: v.string(),
    orderTimeMs: v.number(),        // Unix ms for range queries
    saleAmount: v.number(),
    orderAmount: v.optional(v.number()), // Total buyer paid (product + shipping). Optional for backwards compat with pre-Phase 54 data.
    platformIncome: v.number(),
    costFee: v.number(),
    profit: v.number(),
    profitMargin: v.string(),
    commissionFee: v.number(),
    sellerShippingFee: v.number(),
    buyerShippingFee: v.number(),
    otherFee: v.number(),
    allSkuNum: v.number(),
    skuVoList: v.array(v.object({
      sku: v.string(),
      skuNum: v.number(),
      returnNum: v.number(),
      isAddition: v.number(),
    })),
    syncLogId: v.optional(v.id("externalSyncLogs")),
    linkedRevenueId: v.optional(v.id("externalRevenue")),
    createdAt: v.number(),
  })
    .index("by_platform_order", ["platformOrderId"])
    // OI-19: removed by_shop -- zero withIndex references
    .index("by_platform", ["platform"])
    .index("by_time", ["orderTimeMs"]),
    // OI-20: removed by_sync_log -- zero withIndex references
    // OI-21: removed by_state -- zero withIndex references

  // Phase 28: BigSeller sync state — singleton document tracking current sync progress.
  // Field named `stage` (not `phase`) to avoid confusion with GSD phase numbers.
  bigsellerSyncState: defineTable({
    stage: v.union(
      v.literal("idle"),
      v.literal("triggering"),
      v.literal("polling"),
      v.literal("fetching"),
      v.literal("storing"),
      v.literal("complete"),
      v.literal("failed"),
      v.literal("retrying"),
    ),
    pollAttempt: v.number(),
    maxPolls: v.number(),
    attempt: v.number(),
    startDate: v.string(),
    endDate: v.string(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    summary: v.optional(v.object({
      totalOrders: v.number(),
      newOrders: v.number(),
      updatedOrders: v.number(),
      totalRevenue: v.number(),
      unmappedSkus: v.number(),
    })),
  }),

  consignmentOutlets: defineTable({
    name: v.string(),
    revSharePercent: v.number(),
    type: v.union(v.literal("cafe"), v.literal("retail"), v.literal("event")),
    isActive: v.boolean(),
    externalOutletId: v.optional(v.id("externalOutlets")),
    address: v.optional(v.string()),
    contactName: v.optional(v.string()),
    notes: v.optional(v.string()),
    // Dispatch planner fields (merged from dispatchConsignmentOutlets)
    channelKey: v.optional(v.literal("consignment")),
    isEnabled: v.optional(v.boolean()),
    productMappings: v.optional(v.array(v.object({
      menuProductId: v.id("menuProducts"),
      externalName: v.string(),
      externalPrice: v.number(),
    }))),
    commissionRate: v.optional(v.number()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedBy: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_active", ["isActive"])
    .index("by_type", ["type"]),

  consignmentSettlements: defineTable({
    outletId: v.id("consignmentOutlets"),
    periodStart: v.number(),
    periodEnd: v.number(),
    totalRevenue: v.number(),
    revSharePercent: v.number(),
    revShareAmount: v.number(),
    frolliePayment: v.number(),
    status: v.union(v.literal("pending"), v.literal("paid")),
    paidAt: v.optional(v.number()),
    linkedRevenueId: v.optional(v.id("externalRevenue")),
    notes: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedBy: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_outlet", ["outletId"])
    .index("by_period", ["periodStart"])
    // OI-12: removed by_outlet_period -- zero withIndex references
    .index("by_status", ["status"]),
    // OI-13: removed by_outlet_status -- zero withIndex references

  // ============================================
  // GRABFOOD MENU SIMULATOR
  // Stores GrabFood-specific overrides per menu product for the Menu Simulator UI.
  // Enables price/availability editing and push-to-GrabFood without modifying core menuProducts.
  // ============================================

  grabfoodMenuItems: defineTable({
    menuProductId: v.id("menuProducts"),
    grabfoodItemId: v.optional(v.string()),    // GrabFood's item ID (from externalProductCode)
    grabfoodName: v.string(),                  // Override name for GrabFood display
    grabfoodDescription: v.optional(v.string()),
    grabfoodPrice: v.number(),                 // IDR integer (no decimals, exponent=0)
    isAvailable: v.boolean(),                  // Manual availability toggle
    photoStorageId: v.optional(v.id("_storage")),
    photoUrl: v.optional(v.string()),          // External URL (from GrabFood pull)
    sequence: v.number(),                      // Display order in the menu
    // Push state tracking — enables persistent diff across page reloads
    lastPushedPrice: v.optional(v.number()),          // Price at last push
    lastPushedAvailability: v.optional(v.boolean()),  // Availability at last push
    lastPushedAt: v.optional(v.number()),             // Timestamp of last push
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_menu_product", ["menuProductId"])
    .index("by_sequence", ["sequence"]),
    // OI-22: removed by_grabfood_item_id -- zero withIndex references

  // ============================================
  // ACCOUNTING & EXPENSE TABLES
  // Phase 41: Foundational data layer for v1.7 Expense & Accounting system
  // ============================================

  // Chart of Accounts — PSAK-aligned GL accounts (1xxx-7xxx)
  accounts: defineTable({
    code: v.string(),
    name: v.string(),
    type: v.union(
      v.literal("asset"),
      v.literal("liability"),
      v.literal("equity"),
      v.literal("revenue"),
      v.literal("cogs"),
      v.literal("opex"),
      v.literal("other")
    ),
    category: v.string(),
    isActive: v.boolean(),
    isSystem: v.boolean(),
    description: v.optional(v.string()),
  })
    .index("by_code", ["code"])
    .index("by_type", ["type"])
    .index("by_active_type", ["isActive", "type"]),

  // Expense records — full lifecycle from draft to reimbursed/voided
  expenses: defineTable({
    expenseNumber: v.string(),
    submittedBy: v.id("users"),
    amount: v.number(),
    accountId: v.id("accounts"),
    expenseDate: v.number(),
    description: v.string(),
    vendorName: v.string(),
    paymentMethod: v.union(
      v.literal("employee_paid"),
      v.literal("company_paid"),
      v.literal("payment_request")
    ),
    receiptFileId: v.optional(v.id("_storage")),
    receiptImageHash: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("awaiting_payment"),
      v.literal("reimbursed"),
      v.literal("voided"),
      v.literal("recorded"),
      v.literal("paid")
    ),
    lateSubmission: v.boolean(),
    duplicateWarning: v.optional(v.string()),
    submittedAt: v.optional(v.number()),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    approverComment: v.optional(v.string()),
    rejectedBy: v.optional(v.id("users")),
    rejectedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    previousExpenseId: v.optional(v.id("expenses")),
    voidedBy: v.optional(v.id("users")),
    voidedAt: v.optional(v.number()),
    voidReason: v.optional(v.string()),
    journalEntryId: v.optional(v.id("journalEntries")),
    transactionReference: v.optional(v.string()),
    flaggedForReview: v.optional(v.boolean()),
    flaggedBy: v.optional(v.id("users")),
    flaggedAt: v.optional(v.number()),
    flagReason: v.optional(v.string()),
    paidAt: v.optional(v.number()),
    paidBy: v.optional(v.id("users")), // Who executed the bank transfer (markAsPaid)
    sharedReceiptAcknowledged: v.optional(v.boolean()), // User confirmed intentional receipt reuse
    createdAt: v.number(),
  })
    .index("by_submitter_status", ["submittedBy", "status"])
    .index("by_status", ["status"])
    .index("by_status_expenseDate", ["status", "expenseDate"])
    .index("by_amount_date_submitter", ["amount", "expenseDate", "submittedBy"])
    .index("by_receipt_hash", ["receiptImageHash"])
    .index("by_expense_number", ["expenseNumber"])
    .index("by_account", ["accountId"]),

  // Expense status audit trail
  expenseStatusHistory: defineTable({
    expenseId: v.id("expenses"),
    fromStatus: v.optional(v.string()),
    toStatus: v.string(),
    changedBy: v.id("users"),
    changedAt: v.number(),
    comment: v.optional(v.string()),
  })
    .index("by_expense", ["expenseId"]),

  // Reimbursement batches — group approved expenses for bank transfer
  reimbursementBatches: defineTable({
    batchNumber: v.string(),
    employeeUserId: v.id("users"),
    totalAmount: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("voided")
    ),
    bankAccountId: v.optional(v.id("bankAccounts")),
    bankReference: v.optional(v.string()),
    transferDate: v.optional(v.number()),
    confirmedBy: v.optional(v.id("users")),
    confirmedAt: v.optional(v.number()),
    voidedBy: v.optional(v.id("users")),
    voidedAt: v.optional(v.number()),
    voidReason: v.optional(v.string()),
    journalEntryId: v.optional(v.id("journalEntries")),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_batch_number", ["batchNumber"])
    .index("by_employee_status", ["employeeUserId", "status"])
    .index("by_status", ["status"]),

  // Reimbursement batch line items — link expenses to batches
  reimbursementBatchItems: defineTable({
    batchId: v.id("reimbursementBatches"),
    expenseId: v.id("expenses"),
  })
    .index("by_batch", ["batchId"])
    .index("by_expense", ["expenseId"]),

  // Double-entry journal entries — header record
  journalEntries: defineTable({
    entryNumber: v.string(),
    date: v.number(),
    description: v.string(),
    sourceType: v.union(
      v.literal("expense_approval"),
      v.literal("expense_void"),
      v.literal("reimbursement"),
      v.literal("reimbursement_void"),
      v.literal("payroll"),
      v.literal("payroll_void"),
      v.literal("manual"),
      v.literal("depreciation"),
      v.literal("depreciation_void")
    ),
    sourceId: v.optional(v.string()),
    isReversed: v.boolean(),
    reversedByEntryId: v.optional(v.id("journalEntries")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    metadata: v.optional(v.object({
      receiptUrl: v.optional(v.string()),
      templateType: v.optional(v.string()),
    })),
  })
    .index("by_entry_number", ["entryNumber"])
    .index("by_source", ["sourceType", "sourceId"])
    .index("by_date", ["date"])
    .index("by_sourceType_date", ["sourceType", "date"]),

  // Double-entry journal entry lines — debit/credit per account
  // entryDate denormalized from parent journalEntries.date (Convex indexes cannot span tables)
  journalEntryLines: defineTable({
    journalEntryId: v.id("journalEntries"),
    accountId: v.id("accounts"),
    entryDate: v.number(),
    debitAmount: v.number(),
    creditAmount: v.number(),
    description: v.optional(v.string()),
  })
    .index("by_journal_entry", ["journalEntryId"])
    .index("by_account_entryDate", ["accountId", "entryDate"])
    .index("by_entryDate", ["entryDate"]),

  // Company bank accounts for reimbursement transfers
  bankAccounts: defineTable({
    name: v.string(),
    bankName: v.string(),
    accountNumber: v.string(),
    isActive: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_active", ["isActive"]),

  // ============================================
  // INVOICE SYSTEM
  // Sequential invoice numbering + invoice records
  // ============================================

  invoiceCounters: defineTable({
    prefix: v.string(),
    lastNumber: v.number(),
  }).index("by_prefix", ["prefix"]),

  invoices: defineTable({
    status: v.union(v.literal("draft"), v.literal("final")),
    invoiceNumber: v.optional(v.string()),
    orderId: v.id("orders"),
    generatedAt: v.optional(v.number()),
    generatedBy: v.id("users"),
    updatedAt: v.number(),
    sellerName: v.string(),
    sellerAddress: v.optional(v.string()),
    sellerPhone: v.optional(v.string()),
    sellerEmail: v.optional(v.string()),
    sellerNpwp: v.optional(v.string()),
    sellerLogoStorageId: v.optional(v.id("_storage")),
    bankName: v.string(),
    bankAccountNumber: v.string(),
    bankAccountName: v.string(),
    buyerName: v.string(),
    buyerCompany: v.optional(v.string()),
    buyerNpwp: v.optional(v.string()),
    buyerAddress: v.optional(v.string()),
    buyerPhone: v.optional(v.string()),
    poNumber: v.optional(v.string()),
    orderNumber: v.string(),
    orderDate: v.number(),
    dueDate: v.optional(v.number()),
    items: v.array(v.object({
      productName: v.string(),
      variant: v.optional(v.string()),
      qty: v.number(),
      unitPrice: v.number(),
      lineTotal: v.number(),
    })),
    subtotal: v.number(),
    discountAmount: v.optional(v.number()),
    discountLabel: v.optional(v.string()),
    deliveryFee: v.optional(v.number()),
    finalTotal: v.number(),
    paymentStatus: v.union(
      v.literal("Unpaid"),
      v.literal("Partial"),
      v.literal("Paid")
    ),
    paymentMethod: v.optional(v.string()),
    notes: v.optional(v.string()),
  })
    .index("by_order", ["orderId"])
    .index("by_status_number", ["status", "invoiceNumber"])
    .index("by_date", ["generatedAt"]),

  // Payroll entries — contractor and staff salary records
  payrollEntries: defineTable({
    payrollNumber: v.string(),
    employeeType: v.union(
      v.literal("contractor"),
      v.literal("staff")
    ),
    recipientName: v.string(),
    frequency: v.union(
      v.literal("weekly"),
      v.literal("monthly")
    ),
    amount: v.number(),
    periodStart: v.number(),
    periodEnd: v.number(),
    description: v.string(),
    attachmentFileId: v.optional(v.id("_storage")),
    status: v.union(
      v.literal("active"),
      v.literal("voided")
    ),
    voidedBy: v.optional(v.id("users")),
    voidedAt: v.optional(v.number()),
    voidReason: v.optional(v.string()),
    journalEntryId: v.optional(v.id("journalEntries")),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_period", ["periodStart"])
    .index("by_employee_type", ["employeeType"])
    .index("by_status", ["status"]),

  // Fixed assets — PSAK-aligned asset register with denormalized depreciation tracking
  fixedAssets: defineTable({
    assetNumber: v.string(), // FA-KIT-2603-001
    name: v.string(),
    category: v.string(), // AssetCategoryKey
    acquisitionDate: v.number(), // Epoch ms (business date)
    cost: v.number(), // IDR, integer
    salvageValue: v.number(), // IDR, integer
    usefulLifeMonths: v.number(), // Years * 12
    location: v.optional(v.string()), // Simple string
    characteristics: v.array(v.object({ key: v.string(), value: v.string() })),
    attachmentIds: v.array(v.id("_storage")),
    status: v.union(v.literal("active"), v.literal("fully_depreciated"), v.literal("disposed")),
    monthlyDepreciation: v.number(),
    accumulatedDepreciation: v.number(),
    lastDepreciationMonth: v.optional(v.string()), // "YYYY-MM"
    disposalDate: v.optional(v.number()),
    disposalType: v.optional(v.union(v.literal("sold"), v.literal("scrapped"), v.literal("written_off"))),
    saleProceeds: v.optional(v.number()),
    disposalGainLoss: v.optional(v.number()),
    disposalJournalEntryId: v.optional(v.id("journalEntries")),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_category", ["category"])
    .index("by_asset_number", ["assetNumber"]),

  // Atomic daily counters for sequential ID generation (EXP-MMDD-NNN, RMB-MMDD-NNN, JE-MMDD-NNN)
  counters: defineTable({
    prefix: v.string(),
    date: v.string(),
    lastSequence: v.number(),
  })
    .index("by_prefix_date", ["prefix", "date"]),
});
