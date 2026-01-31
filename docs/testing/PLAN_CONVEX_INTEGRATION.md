# Agent 2: Convex Integration Tests Plan

> **Scope:** Convex mutations and queries with mock database context
> **Est. Test Cases:** 62
> **Parallel Safe:** Yes - uses isolated test contexts

---

## Target Files

| File | Functions | Priority | Business Rules |
|------|-----------|----------|----------------|
| `convex/recipes/mutations.ts` | 7 mutations | P1 | #2, #3, #5, #6 |
| `convex/recipes/queries.ts` | 4 queries | P1 | #3 |
| `convex/products/queries.ts` | COGS calculation | P1 | #4 |
| `convex/orders/mutations.ts` | 6 mutations | P1 | #8 |
| `convex/packaging/mutations.ts` | 5 mutations | P2 | #6 |
| `convex/tags/mutations.ts` | seedDefaults | P2 | #7 |

---

## Testing Strategy: convex-test

Use the official `convex-test` package for integration testing:

```typescript
import { convexTest } from 'convex-test';
import { expect, test, describe, beforeEach } from 'vitest';
import { api } from '../_generated/api';
import schema from '../schema';
```

---

## Test File 1: `tests/convex/recipes.test.ts`

### Business Rules Covered
- **#2:** Version immutability (new versions only)
- **#3:** Linked components cost inheritance
- **#5:** Reusable = single component only
- **#6:** Deletion blocking rules

### Setup & Fixtures
```typescript
import { convexTest } from 'convex-test';
import { expect, test, describe, beforeEach } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const testIngredient = {
  name: 'Test Flour',
  unitType: 'kg',
  volumePurchased: 25,
  priceExclShipping: 250000,
  shippingCost: 15000,
  costPerBaseUnit: 10.6,
  baseUnit: 'g',
  createdBy: 'test',
};

const testTag = { name: 'Test-Tag' };
```

### Test Cases (28 total)

#### Recipe Creation - 6 tests
```typescript
describe('recipes.create', () => {
  test('creates recipe with first version', async () => {
    const t = convexTest(schema);

    // Setup
    const ingredientId = await t.run(async (ctx) => {
      return await ctx.db.insert('ingredients', testIngredient);
    });

    // Execute
    const recipeId = await t.mutation(api.recipes.create, {
      name: 'Test Recipe',
      tagIds: [],
      firstVersion: {
        versionName: 'v1.0',
        estimatedYieldGrams: 1000,
        components: [{
          componentName: 'Main',
          ingredients: [{
            ingredientId,
            unit: 'g',
            quantity: 500,
          }],
        }],
      },
    });

    // Verify
    const recipe = await t.run(async (ctx) => {
      return await ctx.db.get(recipeId);
    });
    expect(recipe).not.toBeNull();
    expect(recipe?.name).toBe('Test Recipe');
  });

  test('first version has versionNumber 1', async () => {
    const t = convexTest(schema);
    const ingredientId = await t.run(async (ctx) => {
      return await ctx.db.insert('ingredients', testIngredient);
    });

    const recipeId = await t.mutation(api.recipes.create, {
      name: 'Test Recipe',
      firstVersion: {
        versionName: 'v1.0',
        components: [{
          componentName: 'Main',
          ingredients: [{ ingredientId, unit: 'g', quantity: 500 }],
        }],
      },
    });

    const versions = await t.run(async (ctx) => {
      return await ctx.db
        .query('recipeVersions')
        .withIndex('by_recipe', q => q.eq('recipeId', recipeId))
        .collect();
    });

    expect(versions).toHaveLength(1);
    expect(versions[0].versionNumber).toBe(1);
  });

  test('calculates and caches total cost', async () => {
    const t = convexTest(schema);
    const ingredientId = await t.run(async (ctx) => {
      return await ctx.db.insert('ingredients', testIngredient);
    });

    await t.mutation(api.recipes.create, {
      name: 'Cost Test',
      firstVersion: {
        versionName: 'v1.0',
        estimatedYieldGrams: 1000,
        components: [{
          componentName: 'Main',
          ingredients: [{ ingredientId, unit: 'g', quantity: 500 }],
        }],
      },
    });

    const version = await t.run(async (ctx) => {
      return await ctx.db.query('recipeVersions').first();
    });

    // 500g * 10.6 IDR/g = 5300 IDR
    expect(version?.cachedTotalCost).toBeCloseTo(5300);
    // 5300 / 1000g = 5.3 IDR/g
    expect(version?.cachedCostPerGram).toBeCloseTo(5.3);
  });

  test('sets isSingleComponent correctly for single component', async () => {
    const t = convexTest(schema);
    const ingredientId = await t.run(async (ctx) => {
      return await ctx.db.insert('ingredients', testIngredient);
    });

    await t.mutation(api.recipes.create, {
      name: 'Single Component Recipe',
      firstVersion: {
        versionName: 'v1.0',
        isReusableComponent: true,
        components: [{
          componentName: 'Only Component',
          ingredients: [{ ingredientId, unit: 'g', quantity: 100 }],
        }],
      },
    });

    const version = await t.run(async (ctx) => {
      return await ctx.db.query('recipeVersions').first();
    });

    expect(version?.isSingleComponent).toBe(true);
    expect(version?.isReusableComponent).toBe(true);
  });

  test('forces isReusableComponent=false for multi-component recipes', async () => {
    const t = convexTest(schema);
    const ingredientId = await t.run(async (ctx) => {
      return await ctx.db.insert('ingredients', testIngredient);
    });

    await t.mutation(api.recipes.create, {
      name: 'Multi Component Recipe',
      firstVersion: {
        versionName: 'v1.0',
        isReusableComponent: true, // Try to set true
        components: [
          { componentName: 'Component 1', ingredients: [{ ingredientId, unit: 'g', quantity: 100 }] },
          { componentName: 'Component 2', ingredients: [{ ingredientId, unit: 'g', quantity: 100 }] },
        ],
      },
    });

    const version = await t.run(async (ctx) => {
      return await ctx.db.query('recipeVersions').first();
    });

    expect(version?.isSingleComponent).toBe(false);
    expect(version?.isReusableComponent).toBe(false); // Forced to false!
  });

  test('handles null estimatedYieldGrams (costPerGram = null)', async () => {
    const t = convexTest(schema);
    const ingredientId = await t.run(async (ctx) => {
      return await ctx.db.insert('ingredients', testIngredient);
    });

    await t.mutation(api.recipes.create, {
      name: 'No Yield Recipe',
      firstVersion: {
        versionName: 'v1.0',
        // estimatedYieldGrams not provided
        components: [{
          componentName: 'Main',
          ingredients: [{ ingredientId, unit: 'g', quantity: 500 }],
        }],
      },
    });

    const version = await t.run(async (ctx) => {
      return await ctx.db.query('recipeVersions').first();
    });

    expect(version?.cachedTotalCost).toBeCloseTo(5300);
    expect(version?.cachedCostPerGram).toBeUndefined(); // null yield = null cost per gram
  });
});
```

#### Version Copying - 6 tests
```typescript
describe('recipes.copyVersion', () => {
  test('increments version number', async () => {
    const t = convexTest(schema);
    // Setup: create recipe with v1
    const { recipeId, versionId } = await setupRecipeWithVersion(t);

    // Copy to v2
    const newVersionId = await t.mutation(api.recipes.copyVersion, {
      recipeId,
      copyFromVersionId: versionId,
      versionName: 'v2.0',
    });

    const newVersion = await t.run(async (ctx) => {
      return await ctx.db.get(newVersionId);
    });

    expect(newVersion?.versionNumber).toBe(2);
  });

  test('deep copies components (not shared reference)', async () => {
    const t = convexTest(schema);
    const { recipeId, versionId } = await setupRecipeWithVersion(t);

    const newVersionId = await t.mutation(api.recipes.copyVersion, {
      recipeId,
      copyFromVersionId: versionId,
      versionName: 'v2.0',
    });

    // Get components for both versions
    const v1Components = await t.run(async (ctx) => {
      return await ctx.db
        .query('recipeComponents')
        .withIndex('by_version', q => q.eq('recipeVersionId', versionId))
        .collect();
    });

    const v2Components = await t.run(async (ctx) => {
      return await ctx.db
        .query('recipeComponents')
        .withIndex('by_version', q => q.eq('recipeVersionId', newVersionId))
        .collect();
    });

    // Different IDs = deep copy, not shared reference
    expect(v1Components[0]._id).not.toBe(v2Components[0]._id);
    expect(v1Components[0].componentName).toBe(v2Components[0].componentName);
  });

  test('deep copies ingredients within components', async () => {
    const t = convexTest(schema);
    const { recipeId, versionId } = await setupRecipeWithVersion(t);

    const newVersionId = await t.mutation(api.recipes.copyVersion, {
      recipeId,
      copyFromVersionId: versionId,
      versionName: 'v2.0',
    });

    const v1Ingredients = await t.run(async (ctx) => {
      const comp = await ctx.db
        .query('recipeComponents')
        .withIndex('by_version', q => q.eq('recipeVersionId', versionId))
        .first();
      return await ctx.db
        .query('componentIngredients')
        .withIndex('by_component', q => q.eq('recipeComponentId', comp!._id))
        .collect();
    });

    const v2Ingredients = await t.run(async (ctx) => {
      const comp = await ctx.db
        .query('recipeComponents')
        .withIndex('by_version', q => q.eq('recipeVersionId', newVersionId))
        .first();
      return await ctx.db
        .query('componentIngredients')
        .withIndex('by_component', q => q.eq('recipeComponentId', comp!._id))
        .collect();
    });

    // Different IDs = deep copy
    expect(v1Ingredients[0]._id).not.toBe(v2Ingredients[0]._id);
    expect(v1Ingredients[0].quantity).toBe(v2Ingredients[0].quantity);
  });

  test('preserves copiedFromVersionId reference', async () => {
    const t = convexTest(schema);
    const { recipeId, versionId } = await setupRecipeWithVersion(t);

    const newVersionId = await t.mutation(api.recipes.copyVersion, {
      recipeId,
      copyFromVersionId: versionId,
      versionName: 'v2.0',
    });

    const newVersion = await t.run(async (ctx) => {
      return await ctx.db.get(newVersionId);
    });

    expect(newVersion?.copiedFromVersionId).toBe(versionId);
  });

  test('throws error for non-existent recipe', async () => {
    const t = convexTest(schema);
    const fakeId = 'fake_recipe_id' as any;

    await expect(
      t.mutation(api.recipes.copyVersion, {
        recipeId: fakeId,
        copyFromVersionId: fakeId,
        versionName: 'v2.0',
      })
    ).rejects.toThrow('Recipe not found');
  });

  test('throws error for version from different recipe', async () => {
    const t = convexTest(schema);
    const { recipeId: recipe1Id } = await setupRecipeWithVersion(t);
    const { versionId: version2Id } = await setupRecipeWithVersion(t, 'Recipe 2');

    await expect(
      t.mutation(api.recipes.copyVersion, {
        recipeId: recipe1Id,
        copyFromVersionId: version2Id, // Wrong recipe's version
        versionName: 'v2.0',
      })
    ).rejects.toThrow('Source version not found or belongs to different recipe');
  });
});
```

#### Deletion Rules - 6 tests
```typescript
describe('recipes.remove', () => {
  test('deletes unused recipe successfully', async () => {
    const t = convexTest(schema);
    const { recipeId } = await setupRecipeWithVersion(t);

    const result = await t.mutation(api.recipes.remove, { recipeId });

    expect(result).toBe(true);

    const recipe = await t.run(async (ctx) => {
      return await ctx.db.get(recipeId);
    });
    expect(recipe).toBeNull();
  });

  test('deletes all versions when recipe deleted', async () => {
    const t = convexTest(schema);
    const { recipeId, versionId } = await setupRecipeWithVersion(t);

    // Create second version
    await t.mutation(api.recipes.copyVersion, {
      recipeId,
      copyFromVersionId: versionId,
      versionName: 'v2.0',
    });

    await t.mutation(api.recipes.remove, { recipeId });

    const versions = await t.run(async (ctx) => {
      return await ctx.db
        .query('recipeVersions')
        .withIndex('by_recipe', q => q.eq('recipeId', recipeId))
        .collect();
    });
    expect(versions).toHaveLength(0);
  });

  test('deletes all components and ingredients', async () => {
    const t = convexTest(schema);
    const { recipeId } = await setupRecipeWithVersion(t);

    await t.mutation(api.recipes.remove, { recipeId });

    const components = await t.run(async (ctx) => {
      return await ctx.db.query('recipeComponents').collect();
    });
    const ingredients = await t.run(async (ctx) => {
      return await ctx.db.query('componentIngredients').collect();
    });

    expect(components).toHaveLength(0);
    expect(ingredients).toHaveLength(0);
  });

  test('throws error when used in product', async () => {
    const t = convexTest(schema);
    const { recipeId, versionId } = await setupRecipeWithVersion(t);

    // Create product using this recipe version
    await setupProductWithRecipe(t, versionId);

    await expect(
      t.mutation(api.recipes.remove, { recipeId })
    ).rejects.toThrow('Cannot delete recipe: it is used in one or more products');
  });

  test('throws error when used as linked component', async () => {
    const t = convexTest(schema);
    const { versionId: reusableVersionId } = await setupReusableRecipe(t);
    const { recipeId } = await setupRecipeWithLinkedComponent(t, reusableVersionId);

    // Try to delete the reusable recipe
    await expect(
      t.mutation(api.recipes.remove, { recipeId: /* reusable recipe id */ })
    ).rejects.toThrow('Cannot delete recipe: it is used as a component in other recipes');
  });

  test('throws error for non-existent recipe', async () => {
    const t = convexTest(schema);
    const fakeId = 'fake_recipe_id' as any;

    await expect(
      t.mutation(api.recipes.remove, { recipeId: fakeId })
    ).rejects.toThrow('Recipe not found');
  });
});
```

#### Linked Component Cost Inheritance - 4 tests
```typescript
describe('Linked Component Cost Inheritance', () => {
  test('includes linked recipe cost in total', async () => {
    const t = convexTest(schema);

    // Create reusable base recipe (cost: 5000)
    const baseRecipeId = await t.mutation(api.recipes.create, {
      name: 'Base Sauce',
      firstVersion: {
        versionName: 'v1.0',
        estimatedYieldGrams: 500,
        isReusableComponent: true,
        components: [{
          componentName: 'Sauce',
          ingredients: [/* ingredients totaling 5000 */],
        }],
      },
    });

    const baseVersion = await t.run(async (ctx) => {
      return await ctx.db.query('recipeVersions').first();
    });

    // Create parent recipe linking to base
    await t.mutation(api.recipes.create, {
      name: 'Final Product',
      firstVersion: {
        versionName: 'v1.0',
        components: [{
          componentName: 'Base Sauce Link',
          linkedRecipeVersionId: baseVersion!._id,
          ingredients: [],
        }],
      },
    });

    const parentVersion = await t.run(async (ctx) => {
      return await ctx.db
        .query('recipeVersions')
        .order('desc')
        .first();
    });

    // Parent cost should include base recipe cost
    expect(parentVersion?.cachedTotalCost).toBe(baseVersion?.cachedTotalCost);
  });

  test('returns null cost if linked recipe has null cost', async () => {
    // Test that null propagates through the chain
  });

  test('combines multiple linked components', async () => {
    // Test recipe with 2+ linked components
  });

  test('handles nested linked recipes (3 levels deep)', async () => {
    // A links to B, B links to C - costs should cascade
  });
});
```

#### Cost Recalculation - 6 tests
```typescript
describe('recipes.recalculateCosts', () => {
  test('updates cached costs after ingredient price change', async () => {
    const t = convexTest(schema);
    const { ingredientId, versionId } = await setupRecipeWithVersion(t);

    // Original cost: 500g * 10.6 = 5300

    // Update ingredient price
    await t.run(async (ctx) => {
      await ctx.db.patch(ingredientId, { costPerBaseUnit: 20 });
    });

    // Recalculate
    const result = await t.mutation(api.recipes.recalculateCosts, { versionId });

    // New cost: 500g * 20 = 10000
    expect(result.totalCost).toBe(10000);
  });

  // ... 5 more tests for various recalculation scenarios
});
```

---

## Test File 2: `tests/convex/products.test.ts`

### Business Rule Covered
- **#4:** Product pinning to versions

### Test Cases (14 total)

```typescript
describe('Product COGS Calculation', () => {
  test('calculates COGS from recipe + packaging costs', async () => {
    const t = convexTest(schema);

    // Setup recipe with known cost (5000 IDR for 1000g = 5 IDR/g)
    // Setup packaging with known cost (2000 IDR)
    // Create product: 100g portion

    const product = await t.query(api.products.getWithCogs, { productId });

    // Recipe COGS: 100g * 5 IDR/g = 500
    // Packaging COGS: 2000
    // Total: 2500
    expect(product.cachedCogs.recipeCogs).toBe(500);
    expect(product.cachedCogs.packagingCogs).toBe(2000);
    expect(product.cachedCogs.totalCogs).toBe(2500);
  });

  test('calculates contribution margin', async () => {
    // Product price: 10000, COGS: 2500
    // Margin: 7500 (75%)
  });

  test('pinned to specific recipe version (not auto-updated)', async () => {
    const t = convexTest(schema);

    // Create product pinned to recipe v1
    // Create recipe v2 with different cost
    // Query product - should still use v1 cost
  });

  test('returns null COGS when recipe cost is null', async () => {
    // Recipe without yield = null costPerGram
    // Product COGS should be null
  });

  test('returns null COGS when packaging cost is null', async () => {
    // Packaging with null cost
    // Product COGS should be null
  });
});
```

---

## Test File 3: `tests/convex/orders.test.ts`

### Business Rule Covered
- **#8:** Order number MMDD-NNN format

### Test Cases (12 total)

```typescript
describe('orders.create', () => {
  test('generates order number in MMDD-NNN format', async () => {
    const t = convexTest(schema);

    const customerId = await t.run(async (ctx) => {
      return await ctx.db.insert('customers', {
        name: 'John Doe',
        phone: '+62812345678',
        createdBy: 'test',
      });
    });

    const orderId = await t.mutation(api.orders.create, {
      customerId,
      items: [{
        productName: 'Test Product',
        quantity: 1,
        unitPrice: 50000,
        unitCost: 20000,
        discountAmount: 0,
      }],
      deliveryType: 'Pickup',
    });

    const order = await t.run(async (ctx) => {
      return await ctx.db.get(orderId);
    });

    // Format: MMDD-NNN
    expect(order?.orderNumber).toMatch(/^\d{4}-\d{3,}$/);
  });

  test('increments sequence for same day', async () => {
    const t = convexTest(schema);
    // Create 2 orders, verify -001 and -002
  });

  test('calculates order totals correctly', async () => {
    // Verify totalAmount, totalCost, totalMargin
  });

  test('denormalizes customer info', async () => {
    // Verify customerName, customerPhone copied to order
  });
});

describe('orders.updateStatus', () => {
  test('only draft orders can be deleted', async () => {
    const t = convexTest(schema);
    // Create confirmed order, try to delete, expect error
  });

  test('tracks awaitingPaymentSince timestamp', async () => {
    // Transition to AwaitingPayment, verify timestamp
  });
});
```

---

## Test File 4: `tests/convex/tags.test.ts`

### Business Rule Covered
- **#7:** Default tag seeding

### Test Cases (8 total)

```typescript
describe('tags.seedDefaults', () => {
  test('creates all 5 default tags', async () => {
    const t = convexTest(schema);

    await t.mutation(api.tags.seedDefaults, {});

    const tags = await t.run(async (ctx) => {
      return await ctx.db.query('tags').collect();
    });

    const tagNames = tags.map(t => t.name);
    expect(tagNames).toContain('Dubai-Snack');
    expect(tagNames).toContain('Extruded-Snack');
    expect(tagNames).toContain('Sachet');
    expect(tagNames).toContain('Pouch');
    expect(tagNames).toContain('Box');
  });

  test('is idempotent (no duplicates on re-run)', async () => {
    const t = convexTest(schema);

    await t.mutation(api.tags.seedDefaults, {});
    await t.mutation(api.tags.seedDefaults, {});

    const tags = await t.run(async (ctx) => {
      return await ctx.db.query('tags').collect();
    });

    expect(tags).toHaveLength(5); // Not 10
  });
});
```

---

## Implementation Checklist

- [ ] Create `tests/convex/recipes.test.ts` (28 tests)
- [ ] Create `tests/convex/products.test.ts` (14 tests)
- [ ] Create `tests/convex/orders.test.ts` (12 tests)
- [ ] Create `tests/convex/tags.test.ts` (8 tests)
- [ ] Create shared test utilities in `tests/convex/helpers.ts`
- [ ] Run `npm run test:integration` - all pass
- [ ] Verify business rules #2-8 have explicit coverage

---

## Helper Functions

**File:** `tests/convex/helpers.ts`
```typescript
import { convexTest } from 'convex-test';
import schema from '../../convex/schema';

export async function setupRecipeWithVersion(t: ReturnType<typeof convexTest>, name = 'Test Recipe') {
  const ingredientId = await t.run(async (ctx) => {
    return await ctx.db.insert('ingredients', {
      name: 'Test Ingredient',
      unitType: 'kg',
      volumePurchased: 25,
      priceExclShipping: 250000,
      shippingCost: 15000,
      costPerBaseUnit: 10.6,
      baseUnit: 'g',
      createdBy: 'test',
    });
  });

  const recipeId = await t.mutation(api.recipes.create, {
    name,
    firstVersion: {
      versionName: 'v1.0',
      estimatedYieldGrams: 1000,
      components: [{
        componentName: 'Main',
        ingredients: [{ ingredientId, unit: 'g', quantity: 500 }],
      }],
    },
  });

  const version = await t.run(async (ctx) => {
    return await ctx.db.query('recipeVersions').first();
  });

  return { recipeId, versionId: version!._id, ingredientId };
}

// More helper functions...
```

---

## Completion Criteria

```bash
# All integration tests pass
npm run test:run -- tests/convex

# No flaky tests (run 3x)
npm run test:run -- tests/convex --run 3
```
