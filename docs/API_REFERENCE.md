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
```

### Kitchen View Queries (PRD-1)
```typescript
// convex/orders/queries.ts
orders.getKitchenOrders()               // Confirmed orders with ball counts, priority sorted
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
  status: "Confirmed";
  items: Doc<"orderItems">[];
  bigBallsNeeded: number;    // Sum of productionUnits for original type
  midBallsNeeded: number;    // Sum of productionUnits for bite_sized type
}[]
// Sorted by: dueDate ASC → totalUnits DESC → orderDate ASC
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
// convex/orders/mutations.ts
orders.create({
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

orders.updateStatus({ id, status, awaitingPaymentSince?, cancellationReason? })

orders.updatePayment({ id, paymentStatus, paymentMethod? })

orders.updateShipping({ id, shippingAgency, shippingNumber })

orders.remove({ id })                   // Only Draft status allowed
```

### Kitchen Mutations (PRD-1, PRD-2)
```typescript
// convex/orders/mutations.ts
orders.completeOrder({ id })              // Mark order as ProductionComplete
orders.revertToConfirmed({ id })          // Undo completion, restore ball counts
orders.completeBalls({ ballType, count }) // Batch ball completion with overflow
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

### Common Error Cases

| Scenario | Error Message |
|----------|---------------|
| Recipe used in products | "Cannot delete recipe. Used in products: [names]" |
| Customer has orders | "Cannot delete customer with existing orders" |
| Delete non-draft order | "Can only delete orders in Draft status" |
| Reference not found | "Customer not found" / "Recipe version not found" |
| Invalid status transition | "Invalid status transition from X to Y" |
| Missing required field | Convex validator error (automatic) |
