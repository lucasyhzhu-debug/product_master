# Database Schema Reference

> **Purpose:** Complete Convex database schema documentation for Malo Recipe Master.
> **When to read:** Before making database changes, adding fields, or modifying relationships.

## Table of Contents
- [System Architecture Overview](#system-architecture-overview)
- [Complete Database Schema (19 Tables)](#complete-database-schema-19-tables)
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

## Complete Database Schema (19 Tables)

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
})
  .index("by_name", ["name"])
  .index("by_brand", ["brand"])
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
  code: v.string(),                           // e.g., "ORI-50"
  name: v.string(),                           // e.g., "Original 50g"
  grams: v.number(),                          // 50
  defaultPrice: v.number(),                   // IDR
  productionType: v.string(),                 // "original" or "bite_sized"
  productionUnits: v.number(),                // Units per production batch
  isActive: v.boolean(),
})
  .index("by_code", ["code"])
  .index("by_active", ["isActive"])
```

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
})
  .index("by_order", ["orderId"])
  .index("by_product_name", ["productName"])
```

---

## Order Status Workflow

```
Draft
  └─> AwaitingPayment (WhatsApp sent, waiting for payment)
        └─> Confirmed (payment verified)
              └─> ProductionComplete (kitchen: production done)
                    └─> Packaging (kitchen: actively packaging)
                          ├─> WaitingShipment ─> CompleteShipped (delivered)
                          └─> WaitingPickup ─> PickedUp (customer picked up)

Any non-terminal → Cancelled (requires cancellationReason)
```

**Status Meanings:**

| Status | Description | Next States |
|--------|-------------|-------------|
| Draft | Order created, not confirmed | AwaitingPayment, Cancelled |
| AwaitingPayment | WhatsApp sent, waiting for payment | Confirmed, Cancelled |
| Confirmed | Payment verified, ready for production | ProductionComplete, Cancelled |
| ProductionComplete | Kitchen finished production | Packaging, Cancelled |
| Packaging | Actively packaging | WaitingShipment, WaitingPickup, Cancelled |
| WaitingShipment | Ready for courier | CompleteShipped, Cancelled |
| CompleteShipped | Delivered to customer (terminal) | - |
| WaitingPickup | Ready for customer pickup | PickedUp, Cancelled |
| PickedUp | Customer picked up (terminal) | - |
| Cancelled | Order cancelled (terminal) | - |

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
                       │
                       └─── menuProductId ───> MenuProduct (optional)
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
