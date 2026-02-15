/**
 * Recipe integration tests for Convex backend.
 * Tests recipe creation, versioning, cost calculation, and deletion rules.
 */

import { convexTest } from 'convex-test';
import { expect, test, describe, beforeEach } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import {
  setupRecipeWithVersion,
  setupReusableRecipe,
  setupRecipeWithLinkedComponent,
  setupPackagingWithVersion,
  setupProductWithRecipe,
  createIngredient,
} from './helpers';

// ============================================
// Recipe Creation Tests (6 tests)
// ============================================

describe('Recipe Creation', () => {
  test('creates first version with version number 1', async () => {
    const t = convexTest(schema);

    const ingredientId = await createIngredient(t);

    const recipeId = await t.mutation(api.recipes.mutations.create, {
      name: 'Test Recipe',
      tagIds: [],
      firstVersion: {
        versionName: 'Initial',
        estimatedYieldGrams: 1000,
        components: [
          {
            componentName: 'Main',
            ingredients: [
              { ingredientId, unit: 'g', quantity: 500 },
            ],
          },
        ],
      },
    });

    expect(recipeId).toBeDefined();

    // Verify version was created with number 1
    const recipe = await t.query(api.recipes.queries.get, { id: recipeId });
    expect(recipe).toBeDefined();
    expect(recipe?.versions).toHaveLength(1);
    expect(recipe?.versions[0].versionNumber).toBe(1);
  });

  test('sets isSingleComponent correctly based on component count', async () => {
    const t = convexTest(schema);

    const ingredientId = await createIngredient(t);

    // Single component recipe
    const singleRecipeId = await t.mutation(api.recipes.mutations.create, {
      name: 'Single Component Recipe',
      firstVersion: {
        versionName: 'v1',
        components: [
          { componentName: 'Only Component', ingredients: [{ ingredientId, unit: 'g', quantity: 100 }] },
        ],
      },
    });

    const singleRecipe = await t.query(api.recipes.queries.get, { id: singleRecipeId });
    expect(singleRecipe?.versions[0].isSingleComponent).toBe(true);

    // Multi-component recipe
    const multiRecipeId = await t.mutation(api.recipes.mutations.create, {
      name: 'Multi Component Recipe',
      firstVersion: {
        versionName: 'v1',
        components: [
          { componentName: 'Component 1', ingredients: [{ ingredientId, unit: 'g', quantity: 100 }] },
          { componentName: 'Component 2', ingredients: [{ ingredientId, unit: 'g', quantity: 100 }] },
        ],
      },
    });

    const multiRecipe = await t.query(api.recipes.queries.get, { id: multiRecipeId });
    expect(multiRecipe?.versions[0].isSingleComponent).toBe(false);
  });

  test('caches total cost on creation', async () => {
    const t = convexTest(schema);

    // Create ingredient: 1kg at 10,000 IDR = 10 IDR/g
    const ingredientId = await createIngredient(t, {
      name: 'Flour',
      unitType: 'kg',
      volumePurchased: 1,
      priceExclShipping: 10000,
      shippingCost: 0,
    });

    const recipeId = await t.mutation(api.recipes.mutations.create, {
      name: 'Costed Recipe',
      firstVersion: {
        versionName: 'v1',
        estimatedYieldGrams: 1000,
        components: [
          { componentName: 'Main', ingredients: [{ ingredientId, unit: 'g', quantity: 500 }] },
        ],
      },
    });

    const recipe = await t.query(api.recipes.queries.get, { id: recipeId });
    const version = recipe?.versions[0];

    // 500g * 10 IDR/g = 5000 IDR
    expect(version?.cachedTotalCost).toBe(5000);
    expect(version?.costCacheUpdatedAt).toBeDefined();
  });

  test('caches cost per gram when yield is set', async () => {
    const t = convexTest(schema);

    const ingredientId = await createIngredient(t, {
      unitType: 'kg',
      volumePurchased: 1,
      priceExclShipping: 10000,
      shippingCost: 0,
    });

    const recipeId = await t.mutation(api.recipes.mutations.create, {
      name: 'Recipe with Yield',
      firstVersion: {
        versionName: 'v1',
        estimatedYieldGrams: 500, // 500g yield
        components: [
          { componentName: 'Main', ingredients: [{ ingredientId, unit: 'g', quantity: 500 }] },
        ],
      },
    });

    const recipe = await t.query(api.recipes.queries.get, { id: recipeId });
    const version = recipe?.versions[0];

    // Total cost: 500g * 10 IDR/g = 5000 IDR
    // Cost per gram: 5000 / 500 = 10 IDR/g
    expect(version?.cachedCostPerGram).toBe(10);
  });

  test('sets isReusableComponent only for single component recipes', async () => {
    const t = convexTest(schema);

    const ingredientId = await createIngredient(t);

    // Single component marked as reusable - should work
    const singleRecipeId = await t.mutation(api.recipes.mutations.create, {
      name: 'Single Reusable',
      firstVersion: {
        versionName: 'v1',
        isReusableComponent: true,
        components: [
          { componentName: 'Only', ingredients: [{ ingredientId, unit: 'g', quantity: 100 }] },
        ],
      },
    });

    const singleRecipe = await t.query(api.recipes.queries.get, { id: singleRecipeId });
    expect(singleRecipe?.versions[0].isReusableComponent).toBe(true);

    // Multi-component marked as reusable - should be rejected (set to false)
    const multiRecipeId = await t.mutation(api.recipes.mutations.create, {
      name: 'Multi Reusable',
      firstVersion: {
        versionName: 'v1',
        isReusableComponent: true,
        components: [
          { componentName: 'Comp1', ingredients: [{ ingredientId, unit: 'g', quantity: 100 }] },
          { componentName: 'Comp2', ingredients: [{ ingredientId, unit: 'g', quantity: 100 }] },
        ],
      },
    });

    const multiRecipe = await t.query(api.recipes.queries.get, { id: multiRecipeId });
    // Business rule: only single-component can be reusable
    expect(multiRecipe?.versions[0].isReusableComponent).toBe(false);
  });

  test('stores createdBy field', async () => {
    const t = convexTest(schema);

    const ingredientId = await createIngredient(t);

    const recipeId = await t.mutation(api.recipes.mutations.create, {
      name: 'Recipe with Creator',
      createdBy: 'john_doe',
      firstVersion: {
        versionName: 'v1',
        components: [
          { componentName: 'Main', ingredients: [{ ingredientId, unit: 'g', quantity: 100 }] },
        ],
      },
    });

    const recipe = await t.run(async (ctx) => ctx.db.get(recipeId));
    expect(recipe?.createdBy).toBe('john_doe');
  });
});

// ============================================
// Version Copying Tests (6 tests)
// ============================================

describe('Version Copying', () => {
  test('increments version number when copying', async () => {
    const t = convexTest(schema);

    const { recipeId, versionId } = await setupRecipeWithVersion(t);

    const newVersionId = await t.mutation(api.recipes.mutations.copyVersion, {
      recipeId,
      copyFromVersionId: versionId,
      versionName: 'v2 - copied',
    });

    const newVersion = await t.run(async (ctx) => ctx.db.get(newVersionId));
    expect(newVersion?.versionNumber).toBe(2);

    // Copy again
    const thirdVersionId = await t.mutation(api.recipes.mutations.copyVersion, {
      recipeId,
      copyFromVersionId: newVersionId,
      versionName: 'v3 - copied',
    });

    const thirdVersion = await t.run(async (ctx) => ctx.db.get(thirdVersionId));
    expect(thirdVersion?.versionNumber).toBe(3);
  });

  test('deep copies components', async () => {
    const t = convexTest(schema);

    const { recipeId, versionId, componentId } = await setupRecipeWithVersion(t);

    const newVersionId = await t.mutation(api.recipes.mutations.copyVersion, {
      recipeId,
      copyFromVersionId: versionId,
      versionName: 'v2',
    });

    // Get components for new version
    const newComponents = await t.run(async (ctx) => {
      return await ctx.db
        .query('recipeComponents')
        .withIndex('by_version', (q) => q.eq('recipeVersionId', newVersionId))
        .collect();
    });

    expect(newComponents).toHaveLength(1);
    // New component should have different ID (deep copy)
    expect(newComponents[0]._id).not.toBe(componentId);
    expect(newComponents[0].componentName).toBe('Main Component');
  });

  test('deep copies ingredients within components', async () => {
    const t = convexTest(schema);

    const { recipeId, versionId, componentId, ingredientId } = await setupRecipeWithVersion(t);

    // Get original ingredient entries
    const originalIngredients = await t.run(async (ctx) => {
      return await ctx.db
        .query('componentIngredients')
        .withIndex('by_component', (q) => q.eq('recipeComponentId', componentId))
        .collect();
    });

    const newVersionId = await t.mutation(api.recipes.mutations.copyVersion, {
      recipeId,
      copyFromVersionId: versionId,
      versionName: 'v2',
    });

    // Get new components and their ingredients
    const newComponents = await t.run(async (ctx) => {
      return await ctx.db
        .query('recipeComponents')
        .withIndex('by_version', (q) => q.eq('recipeVersionId', newVersionId))
        .collect();
    });

    const newIngredients = await t.run(async (ctx) => {
      return await ctx.db
        .query('componentIngredients')
        .withIndex('by_component', (q) => q.eq('recipeComponentId', newComponents[0]._id))
        .collect();
    });

    expect(newIngredients).toHaveLength(1);
    // Should reference same ingredient but different componentIngredient entry
    expect(newIngredients[0]._id).not.toBe(originalIngredients[0]._id);
    expect(newIngredients[0].ingredientId).toBe(ingredientId);
  });

  test('sets copiedFromVersionId on copied version', async () => {
    const t = convexTest(schema);

    const { recipeId, versionId } = await setupRecipeWithVersion(t);

    const newVersionId = await t.mutation(api.recipes.mutations.copyVersion, {
      recipeId,
      copyFromVersionId: versionId,
      versionName: 'v2',
    });

    const newVersion = await t.run(async (ctx) => ctx.db.get(newVersionId));
    expect(newVersion?.copiedFromVersionId).toBe(versionId);
  });

  test('copies estimatedYieldGrams from source', async () => {
    const t = convexTest(schema);

    const { recipeId, versionId } = await setupRecipeWithVersion(t, 'Test', {
      yieldGrams: 750,
    });

    const newVersionId = await t.mutation(api.recipes.mutations.copyVersion, {
      recipeId,
      copyFromVersionId: versionId,
      versionName: 'v2',
    });

    const newVersion = await t.run(async (ctx) => ctx.db.get(newVersionId));
    expect(newVersion?.estimatedYieldGrams).toBe(750);
  });

  test('recalculates costs on copy', async () => {
    const t = convexTest(schema);

    const { recipeId, versionId } = await setupRecipeWithVersion(t, 'Test', {
      ingredientCost: 20, // 20 IDR/g
      ingredientQuantityGrams: 500,
      yieldGrams: 1000,
    });

    const newVersionId = await t.mutation(api.recipes.mutations.copyVersion, {
      recipeId,
      copyFromVersionId: versionId,
      versionName: 'v2',
    });

    const newVersion = await t.run(async (ctx) => ctx.db.get(newVersionId));
    // 500g * 20 IDR/g = 10,000 IDR
    expect(newVersion?.cachedTotalCost).toBe(10000);
    // 10000 / 1000 = 10 IDR/g
    expect(newVersion?.cachedCostPerGram).toBe(10);
  });
});

// ============================================
// Deletion Rules Tests (6 tests)
// ============================================

describe('Deletion Rules', () => {
  test('allows deleting unused recipe', async () => {
    const t = convexTest(schema);

    const { recipeId } = await setupRecipeWithVersion(t);

    const result = await t.mutation(api.recipes.mutations.remove, { recipeId });
    expect(result).toBe(true);

    // Verify deletion
    const recipe = await t.run(async (ctx) => ctx.db.get(recipeId));
    expect(recipe).toBeNull();
  });

  test('cascade deletes all versions', async () => {
    const t = convexTest(schema);

    const { recipeId, versionId } = await setupRecipeWithVersion(t);

    // Create a second version
    const secondVersionId = await t.mutation(api.recipes.mutations.copyVersion, {
      recipeId,
      copyFromVersionId: versionId,
      versionName: 'v2',
    });

    await t.mutation(api.recipes.mutations.remove, { recipeId });

    // Verify both versions deleted
    const version1 = await t.run(async (ctx) => ctx.db.get(versionId));
    const version2 = await t.run(async (ctx) => ctx.db.get(secondVersionId));
    expect(version1).toBeNull();
    expect(version2).toBeNull();
  });

  test('cascade deletes components and ingredients', async () => {
    const t = convexTest(schema);

    const { recipeId, componentId } = await setupRecipeWithVersion(t);

    // Get ingredient entry IDs before deletion
    const ingredientEntries = await t.run(async (ctx) => {
      return await ctx.db
        .query('componentIngredients')
        .withIndex('by_component', (q) => q.eq('recipeComponentId', componentId))
        .collect();
    });
    expect(ingredientEntries.length).toBeGreaterThan(0);
    const ingredientEntryId = ingredientEntries[0]._id;

    await t.mutation(api.recipes.mutations.remove, { recipeId });

    // Verify cascade deletion
    const component = await t.run(async (ctx) => ctx.db.get(componentId));
    const ingredientEntry = await t.run(async (ctx) => ctx.db.get(ingredientEntryId));
    expect(component).toBeNull();
    expect(ingredientEntry).toBeNull();
  });

  test('blocks deletion when recipe version is used in a product', async () => {
    const t = convexTest(schema);

    const { recipeId, versionId } = await setupRecipeWithVersion(t);
    const { versionId: packagingVersionId } = await setupPackagingWithVersion(t);

    // Create a product using this recipe version
    await setupProductWithRecipe(t, versionId, packagingVersionId);

    // Attempt to delete should fail
    await expect(
      t.mutation(api.recipes.mutations.remove, { recipeId })
    ).rejects.toThrow('Cannot delete recipe: it is used in one or more products');
  });

  test('blocks deletion when recipe version is used as linked component', async () => {
    const t = convexTest(schema);

    // Create a reusable recipe
    const { recipeId: reusableRecipeId, versionId: reusableVersionId } =
      await setupReusableRecipe(t);

    // Create another recipe that links to it
    await setupRecipeWithLinkedComponent(t, reusableVersionId);

    // Attempt to delete the reusable recipe should fail
    await expect(
      t.mutation(api.recipes.mutations.remove, { recipeId: reusableRecipeId })
    ).rejects.toThrow('Cannot delete recipe: it is used as a component in other recipes');
  });

  test('allows deletion after product is deleted', async () => {
    const t = convexTest(schema);

    const { recipeId, versionId } = await setupRecipeWithVersion(t);
    const { versionId: packagingVersionId } = await setupPackagingWithVersion(t);
    const { productId } = await setupProductWithRecipe(t, versionId, packagingVersionId);

    // Delete the product first
    await t.mutation(api.products.mutations.remove, { productId });

    // Now recipe deletion should succeed
    const result = await t.mutation(api.recipes.mutations.remove, { recipeId });
    expect(result).toBe(true);
  });
});

// ============================================
// Linked Component Costs Tests (4 tests)
// ============================================

describe('Linked Component Costs', () => {
  test('inherits cost from linked recipe version', async () => {
    const t = convexTest(schema);

    // Create reusable recipe with known cost: 500g * 10 IDR/g = 5000 IDR
    const { versionId: reusableVersionId } = await setupReusableRecipe(t, 'Base', {
      ingredientCost: 10,
      ingredientQuantityGrams: 500,
      yieldGrams: 500,
    });

    // Verify reusable has correct cost
    const reusableVersion = await t.run(async (ctx) => ctx.db.get(reusableVersionId));
    expect(reusableVersion?.cachedTotalCost).toBe(5000);

    // Create recipe that uses reusable as linked component
    const ingredientId = await createIngredient(t, { name: 'Additional' });

    const mainRecipeId = await t.mutation(api.recipes.mutations.create, {
      name: 'Main Recipe',
      firstVersion: {
        versionName: 'v1',
        estimatedYieldGrams: 1000,
        components: [
          {
            componentName: 'Linked Base',
            linkedRecipeVersionId: reusableVersionId,
            ingredients: [],
          },
        ],
      },
    });

    const mainRecipe = await t.query(api.recipes.queries.get, { id: mainRecipeId });
    const mainVersion = mainRecipe?.versions[0];

    // Cost should equal linked recipe cost
    expect(mainVersion?.cachedTotalCost).toBe(5000);
  });

  test('returns null cost when linked version has null cost', async () => {
    const t = convexTest(schema);

    // Create a recipe with null cost (no ingredient cost data)
    const recipeId = await t.run(async (ctx) => {
      return await ctx.db.insert('recipes', {
        name: 'Uncosted Recipe',
        tagIds: [],
        createdBy: 'test',
      });
    });

    const versionId = await t.run(async (ctx) => {
      return await ctx.db.insert('recipeVersions', {
        recipeId,
        versionNumber: 1,
        versionName: 'v1',
        estimatedYieldGrams: 500,
        isSingleComponent: true,
        isReusableComponent: true,
        createdBy: 'test',
        // No cachedTotalCost - it's null/undefined
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert('recipeComponents', {
        recipeVersionId: versionId,
        sortOrder: 0,
        componentName: 'Main',
      });
    });

    // Create recipe linking to uncosted version
    const mainRecipeId = await t.mutation(api.recipes.mutations.create, {
      name: 'Main Recipe',
      firstVersion: {
        versionName: 'v1',
        estimatedYieldGrams: 1000,
        components: [
          {
            componentName: 'Linked',
            linkedRecipeVersionId: versionId,
            ingredients: [],
          },
        ],
      },
    });

    const mainRecipe = await t.query(api.recipes.queries.get, { id: mainRecipeId });
    const mainVersion = mainRecipe?.versions[0];

    // Cost should be undefined when linked has no cost
    expect(mainVersion?.cachedTotalCost).toBeUndefined();
  });

  test('combines linked component cost with other ingredients', async () => {
    const t = convexTest(schema);

    // Create reusable: 5000 IDR total cost
    const { versionId: reusableVersionId } = await setupReusableRecipe(t, 'Base', {
      ingredientCost: 10,
      ingredientQuantityGrams: 500,
      yieldGrams: 500,
    });

    // Create additional ingredient: 20 IDR/g
    const additionalIngredientId = await createIngredient(t, {
      name: 'Additional',
      unitType: 'kg',
      volumePurchased: 1,
      priceExclShipping: 20000, // 20 IDR/g
      shippingCost: 0,
    });

    const mainRecipeId = await t.mutation(api.recipes.mutations.create, {
      name: 'Combined Recipe',
      firstVersion: {
        versionName: 'v1',
        estimatedYieldGrams: 1000,
        components: [
          {
            componentName: 'Linked Base',
            linkedRecipeVersionId: reusableVersionId,
            ingredients: [],
          },
          {
            componentName: 'Extra Ingredients',
            ingredients: [
              { ingredientId: additionalIngredientId, unit: 'g', quantity: 100 }, // 100g * 20 = 2000
            ],
          },
        ],
      },
    });

    const mainRecipe = await t.query(api.recipes.queries.get, { id: mainRecipeId });
    const mainVersion = mainRecipe?.versions[0];

    // Total: 5000 (linked) + 2000 (additional) = 7000
    expect(mainVersion?.cachedTotalCost).toBe(7000);
  });

  test('query returns linked component cost in subtotal', async () => {
    const t = convexTest(schema);

    const { versionId: reusableVersionId } = await setupReusableRecipe(t, 'Base', {
      ingredientCost: 10,
      ingredientQuantityGrams: 500,
      yieldGrams: 500,
    });

    const mainRecipeId = await t.mutation(api.recipes.mutations.create, {
      name: 'Main Recipe',
      firstVersion: {
        versionName: 'v1',
        components: [
          {
            componentName: 'Linked Base',
            linkedRecipeVersionId: reusableVersionId,
            ingredients: [],
          },
        ],
      },
    });

    const mainRecipe = await t.query(api.recipes.queries.get, { id: mainRecipeId });
    const versionId = mainRecipe?.versions[0]._id;

    const versionDetail = await t.query(api.recipes.queries.getVersion, { versionId: versionId! });

    expect(versionDetail?.components).toHaveLength(1);
    expect(versionDetail?.components[0].subtotalCost).toBe(5000);
    expect(versionDetail?.components[0].linkedRecipeVersionId).toBe(reusableVersionId);
  });
});

// ============================================
// Cost Recalculation Tests (6 tests)
// ============================================

describe('Cost Recalculation', () => {
  test('recalculates cost when mutation is called', async () => {
    const t = convexTest(schema);

    const { versionId, ingredientId } = await setupRecipeWithVersion(t, 'Test', {
      ingredientCost: 10,
      ingredientQuantityGrams: 500,
      yieldGrams: 1000,
    });

    // Initial cost: 500g * 10 IDR/g = 5000 IDR
    let version = await t.run(async (ctx) => ctx.db.get(versionId));
    expect(version?.cachedTotalCost).toBe(5000);

    // Update ingredient price: now 20 IDR/g
    await t.run(async (ctx) => {
      await ctx.db.patch(ingredientId, {
        priceExclShipping: 20000,
        costPerBaseUnit: 20,
      });
    });

    // Recalculate
    const result = await t.mutation(api.recipes.mutations.recalculateCosts, {
      versionId,
    });

    // New cost: 500g * 20 IDR/g = 10000 IDR
    expect(result.totalCost).toBe(10000);

    version = await t.run(async (ctx) => ctx.db.get(versionId));
    expect(version?.cachedTotalCost).toBe(10000);
  });

  test('recalculates cost per gram after ingredient change', async () => {
    const t = convexTest(schema);

    const { versionId, ingredientId } = await setupRecipeWithVersion(t, 'Test', {
      ingredientCost: 10,
      ingredientQuantityGrams: 500,
      yieldGrams: 1000,
    });

    // Initial: 5000 / 1000 = 5 IDR/g
    let version = await t.run(async (ctx) => ctx.db.get(versionId));
    expect(version?.cachedCostPerGram).toBe(5);

    // Update ingredient price to 20 IDR/g
    await t.run(async (ctx) => {
      await ctx.db.patch(ingredientId, {
        priceExclShipping: 20000,
        costPerBaseUnit: 20,
      });
    });

    await t.mutation(api.recipes.mutations.recalculateCosts, { versionId });

    // New: 10000 / 1000 = 10 IDR/g
    version = await t.run(async (ctx) => ctx.db.get(versionId));
    expect(version?.cachedCostPerGram).toBe(10);
  });

  test('returns zero cost when ingredient has zero cost', async () => {
    const t = convexTest(schema);

    const { versionId, ingredientId } = await setupRecipeWithVersion(t);

    // Set ingredient cost to zero (costPerBaseUnit is required after schema tightening)
    await t.run(async (ctx) => {
      await ctx.db.patch(ingredientId, {
        costPerBaseUnit: 0,
      });
    });

    const result = await t.mutation(api.recipes.mutations.recalculateCosts, {
      versionId,
    });

    expect(result.totalCost).toBe(0);
    expect(result.costPerGram).toBe(0);
  });

  test('returns null cost per gram when yield is not set', async () => {
    const t = convexTest(schema);

    const ingredientId = await createIngredient(t);

    const recipeId = await t.mutation(api.recipes.mutations.create, {
      name: 'No Yield Recipe',
      firstVersion: {
        versionName: 'v1',
        // No estimatedYieldGrams
        components: [
          { componentName: 'Main', ingredients: [{ ingredientId, unit: 'g', quantity: 100 }] },
        ],
      },
    });

    const recipe = await t.query(api.recipes.queries.get, { id: recipeId });
    const versionId = recipe?.versions[0]._id;

    const result = await t.mutation(api.recipes.mutations.recalculateCosts, {
      versionId: versionId!,
    });

    // Total cost exists but cost per gram is null (no yield)
    expect(result.totalCost).toBeDefined();
    expect(result.costPerGram).toBeNull();
  });

  test('updates costCacheUpdatedAt timestamp', async () => {
    const t = convexTest(schema);

    const { versionId } = await setupRecipeWithVersion(t);

    const beforeRecalc = await t.run(async (ctx) => ctx.db.get(versionId));
    const beforeTimestamp = beforeRecalc?.costCacheUpdatedAt;

    // Small delay to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 10));

    await t.mutation(api.recipes.mutations.recalculateCosts, { versionId });

    const afterRecalc = await t.run(async (ctx) => ctx.db.get(versionId));
    expect(afterRecalc?.costCacheUpdatedAt).toBeDefined();
    expect(afterRecalc?.costCacheUpdatedAt).not.toBe(beforeTimestamp);
  });

  test('handles multiple ingredients in cost calculation', async () => {
    const t = convexTest(schema);

    // Create two ingredients
    const flourId = await createIngredient(t, {
      name: 'Flour',
      unitType: 'kg',
      volumePurchased: 1,
      priceExclShipping: 10000, // 10 IDR/g
      shippingCost: 0,
    });

    const sugarId = await createIngredient(t, {
      name: 'Sugar',
      unitType: 'kg',
      volumePurchased: 1,
      priceExclShipping: 15000, // 15 IDR/g
      shippingCost: 0,
    });

    const recipeId = await t.mutation(api.recipes.mutations.create, {
      name: 'Multi-ingredient Recipe',
      firstVersion: {
        versionName: 'v1',
        estimatedYieldGrams: 1000,
        components: [
          {
            componentName: 'Main',
            ingredients: [
              { ingredientId: flourId, unit: 'g', quantity: 500 }, // 5000 IDR
              { ingredientId: sugarId, unit: 'g', quantity: 200 }, // 3000 IDR
            ],
          },
        ],
      },
    });

    const recipe = await t.query(api.recipes.queries.get, { id: recipeId });
    const version = recipe?.versions[0];

    // Total: 5000 + 3000 = 8000 IDR
    expect(version?.cachedTotalCost).toBe(8000);
  });
});
