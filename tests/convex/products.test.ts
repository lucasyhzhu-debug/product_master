/**
 * Product integration tests for Convex backend.
 * Tests COGS calculation, contribution margin, product pinning, and null cost handling.
 */

import { convexTest } from 'convex-test';
import { expect, test, describe } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';
import {
  setupRecipeWithVersion,
  setupPackagingWithVersion,
  setupProductWithRecipe,
  createIngredient,
  createPackagingMaterial,
} from './helpers';

// ============================================
// COGS Calculation Tests (4 tests)
// ============================================

describe('COGS Calculation', () => {
  test('calculates total COGS from recipe and packaging', async () => {
    const t = convexTest(schema);

    // Recipe: cost per gram = 10 IDR/g
    const { versionId: recipeVersionId } = await setupRecipeWithVersion(t, 'Recipe', {
      ingredientCost: 10,
      ingredientQuantityGrams: 1000,
      yieldGrams: 1000, // 10 IDR/g
    });

    // Packaging: 500 IDR total
    const { versionId: packagingVersionId } = await setupPackagingWithVersion(t, 'Packaging', {
      materialCostPerPiece: 500,
      materialQuantity: 1,
    });

    // Product: 10 pieces x 50g = 500g total
    // Recipe COGS: 500g * 10 IDR/g = 5000 IDR
    // Packaging COGS: 500 IDR
    // Total COGS: 5500 IDR
    const { productVersionId } = await setupProductWithRecipe(
      t,
      recipeVersionId,
      packagingVersionId,
      {
        numPieces: 10,
        gramsPerPiece: 50,
        retailPriceIdr: 10000,
      }
    );

    const productVersion = await t.run(async (ctx) => ctx.db.get(productVersionId));
    expect(productVersion?.cachedCogs?.totalGrams).toBe(500);
    expect(productVersion?.cachedCogs?.recipeCogs).toBe(5000);
    expect(productVersion?.cachedCogs?.packagingCogs).toBe(500);
    expect(productVersion?.cachedCogs?.totalCogs).toBe(5500);
  });

  test('calculates recipe COGS based on cost per gram', async () => {
    const t = convexTest(schema);

    // Recipe: 5000 IDR total, 1000g yield = 5 IDR/g
    const { versionId: recipeVersionId } = await setupRecipeWithVersion(t, 'Recipe', {
      ingredientCost: 5,
      ingredientQuantityGrams: 1000,
      yieldGrams: 1000,
    });

    const { versionId: packagingVersionId } = await setupPackagingWithVersion(t);

    // Product: 20 pieces x 100g = 2000g
    // Recipe COGS: 2000g * 5 IDR/g = 10000 IDR
    const { productVersionId } = await setupProductWithRecipe(
      t,
      recipeVersionId,
      packagingVersionId,
      {
        numPieces: 20,
        gramsPerPiece: 100,
      }
    );

    const productVersion = await t.run(async (ctx) => ctx.db.get(productVersionId));
    expect(productVersion?.cachedCogs?.totalGrams).toBe(2000);
    expect(productVersion?.cachedCogs?.recipeCogs).toBe(10000);
  });

  test('uses packaging cachedTotalCost for packaging COGS', async () => {
    const t = convexTest(schema);

    const { versionId: recipeVersionId } = await setupRecipeWithVersion(t);

    // Create packaging with specific cost: 2 materials at 300 IDR each = 600 IDR
    const { versionId: packagingVersionId } = await setupPackagingWithVersion(t, 'Custom Packaging', {
      materialCostPerPiece: 300,
      materialQuantity: 2,
    });

    const { productVersionId } = await setupProductWithRecipe(
      t,
      recipeVersionId,
      packagingVersionId
    );

    const productVersion = await t.run(async (ctx) => ctx.db.get(productVersionId));
    expect(productVersion?.cachedCogs?.packagingCogs).toBe(600);
  });

  test('stores COGS breakdown in cachedCogs object', async () => {
    const t = convexTest(schema);

    const { versionId: recipeVersionId } = await setupRecipeWithVersion(t, 'Recipe', {
      ingredientCost: 10,
      yieldGrams: 1000,
      ingredientQuantityGrams: 1000,
    });

    const { versionId: packagingVersionId } = await setupPackagingWithVersion(t, 'Packaging', {
      materialCostPerPiece: 1000,
      materialQuantity: 1,
    });

    const { productVersionId } = await setupProductWithRecipe(
      t,
      recipeVersionId,
      packagingVersionId,
      {
        numPieces: 5,
        gramsPerPiece: 100, // 500g total
        retailPriceIdr: 20000,
      }
    );

    const productVersion = await t.run(async (ctx) => ctx.db.get(productVersionId));
    const cogs = productVersion?.cachedCogs;

    expect(cogs).toBeDefined();
    expect(cogs).toHaveProperty('totalGrams', 500);
    expect(cogs).toHaveProperty('recipeCogs', 5000); // 500g * 10
    expect(cogs).toHaveProperty('packagingCogs', 1000);
    expect(cogs).toHaveProperty('totalCogs', 6000);
    expect(cogs).toHaveProperty('contributionMargin', 14000); // 20000 - 6000
    expect(cogs).toHaveProperty('contributionMarginPct');
  });
});

// ============================================
// Contribution Margin Tests (4 tests)
// ============================================

describe('Contribution Margin', () => {
  test('calculates contribution margin as price minus COGS', async () => {
    const t = convexTest(schema);

    const { versionId: recipeVersionId } = await setupRecipeWithVersion(t, 'Recipe', {
      ingredientCost: 10,
      yieldGrams: 1000,
      ingredientQuantityGrams: 500,
    });

    const { versionId: packagingVersionId } = await setupPackagingWithVersion(t, 'Packaging', {
      materialCostPerPiece: 500,
      materialQuantity: 1,
    });

    // Product: 10 pieces x 50g = 500g
    // Recipe COGS: 500g * 5 IDR/g = 2500 IDR (5000 total / 1000g yield = 5/g)
    // Packaging COGS: 500 IDR
    // Total COGS: 3000 IDR
    // Price: 10000 IDR
    // Margin: 7000 IDR
    const { productVersionId } = await setupProductWithRecipe(
      t,
      recipeVersionId,
      packagingVersionId,
      {
        numPieces: 10,
        gramsPerPiece: 50,
        retailPriceIdr: 10000,
      }
    );

    const productVersion = await t.run(async (ctx) => ctx.db.get(productVersionId));
    const totalCogs = productVersion?.cachedCogs?.totalCogs;
    const margin = productVersion?.cachedCogs?.contributionMargin;

    expect(margin).toBe(10000 - totalCogs!);
  });

  test('calculates contribution margin percentage correctly', async () => {
    const t = convexTest(schema);

    const { versionId: recipeVersionId } = await setupRecipeWithVersion(t, 'Recipe', {
      ingredientCost: 10,
      yieldGrams: 1000,
      ingredientQuantityGrams: 200,
    });

    const { versionId: packagingVersionId } = await setupPackagingWithVersion(t, 'Packaging', {
      materialCostPerPiece: 1000,
      materialQuantity: 1,
    });

    // Recipe total: 2000 IDR, yield 1000g = 2 IDR/g
    // Product: 100g -> Recipe COGS = 200 IDR
    // Packaging COGS: 1000 IDR
    // Total COGS: 1200 IDR
    // Price: 4000 IDR
    // Margin: 2800 IDR (70%)
    const { productVersionId } = await setupProductWithRecipe(
      t,
      recipeVersionId,
      packagingVersionId,
      {
        numPieces: 1,
        gramsPerPiece: 100,
        retailPriceIdr: 4000,
      }
    );

    const productVersion = await t.run(async (ctx) => ctx.db.get(productVersionId));
    const marginPct = productVersion?.cachedCogs?.contributionMarginPct;

    // (2800 / 4000) * 100 = 70
    expect(marginPct).toBe(70);
  });

  test('returns null margin when total COGS is null', async () => {
    const t = convexTest(schema);

    // Create recipe with null cost (no ingredient cost)
    const recipeId = await t.run(async (ctx) => {
      return await ctx.db.insert('recipes', {
        name: 'Uncosted Recipe',
        tagIds: [],
        createdBy: 'test',
      });
    });

    const recipeVersionId = await t.run(async (ctx) => {
      return await ctx.db.insert('recipeVersions', {
        recipeId,
        versionNumber: 1,
        versionName: 'v1',
        isSingleComponent: true,
        isReusableComponent: false,
        createdBy: 'test',
        // No cachedCostPerGram
      });
    });

    const { versionId: packagingVersionId } = await setupPackagingWithVersion(t);

    const productId = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        name: 'Product with Null Recipe Cost',
        tagIds: [],
        createdBy: 'test',
      });
    });

    const productVersionId = await t.run(async (ctx) => {
      return await ctx.db.insert('productVersions', {
        productId,
        versionNumber: 1,
        versionName: 'v1',
        recipeVersionId,
        packagingVersionId,
        retailPriceIdr: 10000,
        numPieces: 10,
        gramsPerPiece: 50,
        createdBy: 'test',
        cachedCogs: {
          totalGrams: 500,
          recipeCogs: undefined,
          packagingCogs: 500,
          totalCogs: undefined,
          contributionMargin: undefined,
          contributionMarginPct: undefined,
        },
      });
    });

    const productVersion = await t.run(async (ctx) => ctx.db.get(productVersionId));
    expect(productVersion?.cachedCogs?.totalCogs).toBeUndefined();
    expect(productVersion?.cachedCogs?.contributionMargin).toBeUndefined();
  });

  test('query returns fresh COGS calculation', async () => {
    const t = convexTest(schema);

    const { versionId: recipeVersionId } = await setupRecipeWithVersion(t, 'Recipe', {
      ingredientCost: 10,
      yieldGrams: 1000,
      ingredientQuantityGrams: 1000,
    });

    const { versionId: packagingVersionId } = await setupPackagingWithVersion(t, 'Packaging', {
      materialCostPerPiece: 500,
      materialQuantity: 1,
    });

    const { productVersionId } = await setupProductWithRecipe(
      t,
      recipeVersionId,
      packagingVersionId,
      {
        numPieces: 10,
        gramsPerPiece: 100, // 1000g
        retailPriceIdr: 30000,
      }
    );

    // Query the version detail
    const versionDetail = await t.query(api.products.queries.getVersion, {
      versionId: productVersionId,
    });

    expect(versionDetail?.cogs.totalGrams).toBe(1000);
    expect(versionDetail?.cogs.recipeCogs).toBe(10000); // 1000g * 10 IDR/g
    expect(versionDetail?.cogs.packagingCogs).toBe(500);
    expect(versionDetail?.cogs.totalCogs).toBe(10500);
    expect(versionDetail?.cogs.contributionMargin).toBe(19500); // 30000 - 10500
  });
});

// ============================================
// Product Pinning Tests (3 tests)
// ============================================

describe('Product Pinning', () => {
  test('product stays pinned to specific recipe version', async () => {
    const t = convexTest(schema);

    const { recipeId, versionId: recipeVersionId } = await setupRecipeWithVersion(t, 'Recipe');
    const { versionId: packagingVersionId } = await setupPackagingWithVersion(t);
    const { productVersionId } = await setupProductWithRecipe(
      t,
      recipeVersionId,
      packagingVersionId
    );

    // Create a new recipe version
    const newRecipeVersionId = await t.mutation(api.recipes.mutations.copyVersion, {
      recipeId,
      copyFromVersionId: recipeVersionId,
      versionName: 'v2',
    });

    // Product should still point to original version
    const productVersion = await t.run(async (ctx) => ctx.db.get(productVersionId));
    expect(productVersion?.recipeVersionId).toBe(recipeVersionId);
    expect(productVersion?.recipeVersionId).not.toBe(newRecipeVersionId);
  });

  test('product stays pinned to specific packaging version', async () => {
    const t = convexTest(schema);

    const { versionId: recipeVersionId } = await setupRecipeWithVersion(t);
    const { packagingId, versionId: packagingVersionId } = await setupPackagingWithVersion(t, 'Packaging');
    const { productVersionId } = await setupProductWithRecipe(
      t,
      recipeVersionId,
      packagingVersionId
    );

    // Create a new packaging version
    const newPackagingVersionId = await t.mutation(api.packaging.mutations.copyVersion, {
      packagingRecipeId: packagingId,
      copyFromVersionId: packagingVersionId,
      versionName: 'v2',
    });

    // Product should still point to original version
    const productVersion = await t.run(async (ctx) => ctx.db.get(productVersionId));
    expect(productVersion?.packagingVersionId).toBe(packagingVersionId);
    expect(productVersion?.packagingVersionId).not.toBe(newPackagingVersionId);
  });

  test('creating new product version can use different recipe version', async () => {
    const t = convexTest(schema);

    const { recipeId, versionId: recipeVersionId } = await setupRecipeWithVersion(t);
    const { versionId: packagingVersionId } = await setupPackagingWithVersion(t);
    const { productId, productVersionId } = await setupProductWithRecipe(
      t,
      recipeVersionId,
      packagingVersionId
    );

    // Create a new recipe version
    const newRecipeVersionId = await t.mutation(api.recipes.mutations.copyVersion, {
      recipeId,
      copyFromVersionId: recipeVersionId,
      versionName: 'v2 Recipe',
    });

    // Create new product version using new recipe version
    const newProductVersionId = await t.mutation(api.products.mutations.createVersion, {
      productId,
      versionData: {
        versionName: 'v2 Product',
        recipeVersionId: newRecipeVersionId,
        packagingVersionId,
        retailPriceIdr: 50000,
        numPieces: 10,
        gramsPerPiece: 50,
      },
    });

    // Old product version still uses old recipe
    const oldProductVersion = await t.run(async (ctx) => ctx.db.get(productVersionId));
    expect(oldProductVersion?.recipeVersionId).toBe(recipeVersionId);

    // New product version uses new recipe
    const newProductVersion = await t.run(async (ctx) => ctx.db.get(newProductVersionId));
    expect(newProductVersion?.recipeVersionId).toBe(newRecipeVersionId);
  });
});

// ============================================
// Null Cost Handling Tests (3 tests)
// ============================================

describe('Null Cost Handling', () => {
  test('handles null recipe cost per gram', async () => {
    const t = convexTest(schema);

    // Create recipe without cost data
    const recipeId = await t.run(async (ctx) => {
      return await ctx.db.insert('recipes', {
        name: 'Uncosted Recipe',
        tagIds: [],
        createdBy: 'test',
      });
    });

    const recipeVersionId = await t.run(async (ctx) => {
      return await ctx.db.insert('recipeVersions', {
        recipeId,
        versionNumber: 1,
        versionName: 'v1',
        isSingleComponent: true,
        isReusableComponent: false,
        createdBy: 'test',
        estimatedYieldGrams: 1000,
        // cachedCostPerGram is not set
      });
    });

    const { versionId: packagingVersionId } = await setupPackagingWithVersion(t);

    const versionDetail = await t.query(api.products.queries.getVersion, {
      versionId: await t.run(async (ctx) => {
        const productId = await ctx.db.insert('products', {
          name: 'Test Product',
          tagIds: [],
          createdBy: 'test',
        });

        return await ctx.db.insert('productVersions', {
          productId,
          versionNumber: 1,
          versionName: 'v1',
          recipeVersionId,
          packagingVersionId,
          retailPriceIdr: 10000,
          numPieces: 10,
          gramsPerPiece: 50,
          createdBy: 'test',
        });
      }),
    });

    expect(versionDetail?.cogs.recipeCogs).toBeNull();
    expect(versionDetail?.cogs.totalCogs).toBeNull();
  });

  test('handles null packaging cost', async () => {
    const t = convexTest(schema);

    const { versionId: recipeVersionId } = await setupRecipeWithVersion(t);

    // Create packaging without cost
    const packagingId = await t.run(async (ctx) => {
      return await ctx.db.insert('packagingRecipes', {
        name: 'Uncosted Packaging',
        tagIds: [],
        createdBy: 'test',
      });
    });

    const packagingVersionId = await t.run(async (ctx) => {
      return await ctx.db.insert('packagingVersions', {
        packagingRecipeId: packagingId,
        versionNumber: 1,
        versionName: 'v1',
        createdBy: 'test',
        // cachedTotalCost is not set
      });
    });

    const productId = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        name: 'Test Product',
        tagIds: [],
        createdBy: 'test',
      });
    });

    const productVersionId = await t.run(async (ctx) => {
      return await ctx.db.insert('productVersions', {
        productId,
        versionNumber: 1,
        versionName: 'v1',
        recipeVersionId,
        packagingVersionId,
        retailPriceIdr: 10000,
        numPieces: 10,
        gramsPerPiece: 50,
        createdBy: 'test',
      });
    });

    const versionDetail = await t.query(api.products.queries.getVersion, {
      versionId: productVersionId,
    });

    expect(versionDetail?.cogs.packagingCogs).toBeNull();
    expect(versionDetail?.cogs.totalCogs).toBeNull();
  });

  test('requires both recipe and packaging cost for total COGS', async () => {
    const t = convexTest(schema);

    // Recipe with cost
    const { versionId: recipeVersionId } = await setupRecipeWithVersion(t, 'Recipe', {
      ingredientCost: 10,
      yieldGrams: 1000,
      ingredientQuantityGrams: 1000,
    });

    // Packaging without cost
    const packagingId = await t.run(async (ctx) => {
      return await ctx.db.insert('packagingRecipes', {
        name: 'Uncosted Packaging',
        tagIds: [],
        createdBy: 'test',
      });
    });

    const packagingVersionId = await t.run(async (ctx) => {
      return await ctx.db.insert('packagingVersions', {
        packagingRecipeId: packagingId,
        versionNumber: 1,
        versionName: 'v1',
        createdBy: 'test',
      });
    });

    const productId = await t.run(async (ctx) => {
      return await ctx.db.insert('products', {
        name: 'Test Product',
        tagIds: [],
        createdBy: 'test',
      });
    });

    const productVersionId = await t.run(async (ctx) => {
      return await ctx.db.insert('productVersions', {
        productId,
        versionNumber: 1,
        versionName: 'v1',
        recipeVersionId,
        packagingVersionId,
        retailPriceIdr: 10000,
        numPieces: 10,
        gramsPerPiece: 50,
        createdBy: 'test',
      });
    });

    const versionDetail = await t.query(api.products.queries.getVersion, {
      versionId: productVersionId,
    });

    // Recipe cost is present
    expect(versionDetail?.cogs.recipeCogs).toBe(5000); // 500g * 10 IDR/g

    // But packaging is null, so total is null
    expect(versionDetail?.cogs.packagingCogs).toBeNull();
    expect(versionDetail?.cogs.totalCogs).toBeNull();
    expect(versionDetail?.cogs.contributionMargin).toBeNull();
  });
});
