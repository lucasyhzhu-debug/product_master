/**
 * Test helper functions for Convex integration tests.
 * Provides reusable setup functions for creating test fixtures.
 */

import type { TestConvex } from 'convex-test';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

type TestContext = TestConvex<typeof schema>;

/**
 * Creates an ingredient with cost calculation.
 * Default: Flour at 10 IDR/g (1kg at 10,000 IDR)
 */
export async function createIngredient(
  t: TestContext,
  overrides: {
    name?: string;
    unitType?: string;
    volumePurchased?: number;
    priceExclShipping?: number;
    shippingCost?: number;
  } = {}
): Promise<Id<'ingredients'>> {
  const name = overrides.name ?? 'Test Flour';
  const unitType = overrides.unitType ?? 'kg';
  const volumePurchased = overrides.volumePurchased ?? 1;
  const priceExclShipping = overrides.priceExclShipping ?? 10000;
  const shippingCost = overrides.shippingCost ?? 0;

  // Calculate cost per base unit
  let costPerBaseUnit: number;
  let baseUnit: string;

  if (unitType === 'kg' || unitType === 'g') {
    const baseVolume = unitType === 'kg' ? volumePurchased * 1000 : volumePurchased;
    costPerBaseUnit = (priceExclShipping + shippingCost) / baseVolume;
    baseUnit = 'g';
  } else if (unitType === 'l' || unitType === 'ml') {
    const baseVolume = unitType === 'l' ? volumePurchased * 1000 : volumePurchased;
    costPerBaseUnit = (priceExclShipping + shippingCost) / baseVolume;
    baseUnit = 'ml';
  } else {
    costPerBaseUnit = (priceExclShipping + shippingCost) / volumePurchased;
    baseUnit = unitType;
  }

  return await t.run(async (ctx) => {
    return await ctx.db.insert('ingredients', {
      name,
      unitType,
      volumePurchased,
      priceExclShipping,
      shippingCost,
      createdBy: 'test',
      costPerBaseUnit,
      baseUnit,
    });
  });
}

/**
 * Creates a packaging material with cost calculation.
 * Default: Box at 500 IDR/pcs
 */
export async function createPackagingMaterial(
  t: TestContext,
  overrides: {
    name?: string;
    unitType?: string;
    volumePurchased?: number;
    priceExclShipping?: number;
    shippingCost?: number;
  } = {}
): Promise<Id<'packagingMaterials'>> {
  const name = overrides.name ?? 'Test Box';
  const unitType = overrides.unitType ?? 'pcs';
  const volumePurchased = overrides.volumePurchased ?? 100;
  const priceExclShipping = overrides.priceExclShipping ?? 50000;
  const shippingCost = overrides.shippingCost ?? 0;

  // Calculate cost per base unit
  let costPerBaseUnit: number;
  let baseUnit: string;

  if (unitType === 'm' || unitType === 'cm') {
    const baseVolume = unitType === 'm' ? volumePurchased * 100 : volumePurchased;
    costPerBaseUnit = (priceExclShipping + shippingCost) / baseVolume;
    baseUnit = 'cm';
  } else {
    costPerBaseUnit = (priceExclShipping + shippingCost) / volumePurchased;
    baseUnit = unitType;
  }

  return await t.run(async (ctx) => {
    return await ctx.db.insert('packagingMaterials', {
      name,
      unitType,
      volumePurchased,
      priceExclShipping,
      shippingCost,
      createdBy: 'test',
      costPerBaseUnit,
      baseUnit,
    });
  });
}

/**
 * Creates a complete recipe with a version containing one component and one ingredient.
 * Returns both the recipe ID and the version ID.
 */
export async function setupRecipeWithVersion(
  t: TestContext,
  name: string = 'Test Recipe',
  options: {
    ingredientCost?: number; // Cost per gram
    yieldGrams?: number;
    ingredientQuantityGrams?: number;
  } = {}
): Promise<{
  recipeId: Id<'recipes'>;
  versionId: Id<'recipeVersions'>;
  ingredientId: Id<'ingredients'>;
  componentId: Id<'recipeComponents'>;
}> {
  const ingredientCost = options.ingredientCost ?? 10; // 10 IDR/g
  const yieldGrams = options.yieldGrams ?? 1000;
  const ingredientQuantityGrams = options.ingredientQuantityGrams ?? 500;

  // Create ingredient with specified cost per gram
  // 1kg at (ingredientCost * 1000) IDR = ingredientCost IDR/g
  const ingredientId = await createIngredient(t, {
    name: `${name} Ingredient`,
    unitType: 'kg',
    volumePurchased: 1,
    priceExclShipping: ingredientCost * 1000,
    shippingCost: 0,
  });

  // Create recipe
  const recipeId = await t.run(async (ctx) => {
    return await ctx.db.insert('recipes', {
      name,
      tagIds: [],
      createdBy: 'test',
    });
  });

  // Calculate expected costs
  const totalCost = ingredientCost * ingredientQuantityGrams;
  const costPerGram = totalCost / yieldGrams;

  // Create version
  const versionId = await t.run(async (ctx) => {
    return await ctx.db.insert('recipeVersions', {
      recipeId,
      versionNumber: 1,
      versionName: 'v1',
      estimatedYieldGrams: yieldGrams,
      isSingleComponent: true,
      isReusableComponent: false,
      createdBy: 'test',
      cachedTotalCost: totalCost,
      cachedCostPerGram: costPerGram,
      costCacheUpdatedAt: Date.now(),
    });
  });

  // Create component
  const componentId = await t.run(async (ctx) => {
    return await ctx.db.insert('recipeComponents', {
      recipeVersionId: versionId,
      sortOrder: 0,
      componentName: 'Main Component',
    });
  });

  // Add ingredient to component
  await t.run(async (ctx) => {
    const ingredient = await ctx.db.get(ingredientId);
    await ctx.db.insert('componentIngredients', {
      recipeComponentId: componentId,
      ingredientId,
      sortOrder: 0,
      unit: 'g',
      quantity: ingredientQuantityGrams,
      ingredientName: ingredient?.name,
      cachedLineCost: totalCost,
    });
  });

  return { recipeId, versionId, ingredientId, componentId };
}

/**
 * Creates a packaging recipe with a version containing one component and one material.
 */
export async function setupPackagingWithVersion(
  t: TestContext,
  name: string = 'Test Packaging',
  options: {
    materialCostPerPiece?: number;
    materialQuantity?: number;
  } = {}
): Promise<{
  packagingId: Id<'packagingRecipes'>;
  versionId: Id<'packagingVersions'>;
  materialId: Id<'packagingMaterials'>;
}> {
  const materialCostPerPiece = options.materialCostPerPiece ?? 500; // 500 IDR/pcs
  const materialQuantity = options.materialQuantity ?? 1;

  // Create material
  const materialId = await createPackagingMaterial(t, {
    name: `${name} Material`,
    unitType: 'pcs',
    volumePurchased: 100,
    priceExclShipping: materialCostPerPiece * 100,
    shippingCost: 0,
  });

  // Create packaging recipe
  const packagingId = await t.run(async (ctx) => {
    return await ctx.db.insert('packagingRecipes', {
      name,
      tagIds: [],
      createdBy: 'test',
    });
  });

  // Calculate total cost
  const totalCost = materialCostPerPiece * materialQuantity;

  // Create version
  const versionId = await t.run(async (ctx) => {
    return await ctx.db.insert('packagingVersions', {
      packagingRecipeId: packagingId,
      versionNumber: 1,
      versionName: 'v1',
      createdBy: 'test',
      cachedTotalCost: totalCost,
      costCacheUpdatedAt: Date.now(),
    });
  });

  // Create component
  const componentId = await t.run(async (ctx) => {
    return await ctx.db.insert('packagingComponents', {
      packagingVersionId: versionId,
      sortOrder: 0,
      componentName: 'Main Component',
    });
  });

  // Add material to component
  await t.run(async (ctx) => {
    const material = await ctx.db.get(materialId);
    await ctx.db.insert('packagingComponentMaterials', {
      packagingComponentId: componentId,
      packagingMaterialId: materialId,
      sortOrder: 0,
      unit: 'pcs',
      quantity: materialQuantity,
      materialName: material?.name,
      cachedLineCost: totalCost,
    });
  });

  return { packagingId, versionId, materialId };
}

/**
 * Creates a product pinned to a specific recipe and packaging version.
 */
export async function setupProductWithRecipe(
  t: TestContext,
  recipeVersionId: Id<'recipeVersions'>,
  packagingVersionId: Id<'packagingVersions'>,
  options: {
    name?: string;
    retailPriceIdr?: number;
    numPieces?: number;
    gramsPerPiece?: number;
  } = {}
): Promise<{
  productId: Id<'products'>;
  productVersionId: Id<'productVersions'>;
}> {
  const name = options.name ?? 'Test Product';
  const retailPriceIdr = options.retailPriceIdr ?? 50000;
  const numPieces = options.numPieces ?? 10;
  const gramsPerPiece = options.gramsPerPiece ?? 50;

  // Get recipe and packaging version details
  const recipeVersion = await t.run(async (ctx) => ctx.db.get(recipeVersionId));
  const packagingVersion = await t.run(async (ctx) => ctx.db.get(packagingVersionId));

  if (!recipeVersion || !packagingVersion) {
    throw new Error('Recipe or packaging version not found');
  }

  const recipe = await t.run(async (ctx) => ctx.db.get(recipeVersion.recipeId));
  const packaging = await t.run(async (ctx) => ctx.db.get(packagingVersion.packagingRecipeId));

  // Calculate COGS
  const totalGrams = numPieces * gramsPerPiece;
  const recipeCogs = recipeVersion.cachedCostPerGram != null
    ? recipeVersion.cachedCostPerGram * totalGrams
    : undefined;
  const packagingCogs = packagingVersion.cachedTotalCost ?? undefined;
  const totalCogs = recipeCogs != null && packagingCogs != null
    ? recipeCogs + packagingCogs
    : undefined;
  const contributionMargin = totalCogs != null
    ? retailPriceIdr - totalCogs
    : undefined;
  const contributionMarginPct = totalCogs != null && retailPriceIdr > 0
    ? (contributionMargin! / retailPriceIdr) * 100
    : undefined;

  // Create product
  const productId = await t.run(async (ctx) => {
    return await ctx.db.insert('products', {
      name,
      tagIds: [],
      createdBy: 'test',
    });
  });

  // Create product version
  const productVersionId = await t.run(async (ctx) => {
    return await ctx.db.insert('productVersions', {
      productId,
      versionNumber: 1,
      versionName: 'v1',
      recipeVersionId,
      packagingVersionId,
      retailPriceIdr,
      numPieces,
      gramsPerPiece,
      createdBy: 'test',
      recipeName: recipe?.name,
      recipeVersionName: recipeVersion.versionName,
      packagingName: packaging?.name,
      packagingVersionName: packagingVersion.versionName,
      cachedCogs: {
        totalGrams,
        recipeCogs,
        packagingCogs,
        totalCogs,
        contributionMargin,
        contributionMarginPct,
      },
      cogsCacheUpdatedAt: Date.now(),
    });
  });

  return { productId, productVersionId };
}

/**
 * Creates a single-component reusable recipe.
 * Only single-component recipes can be marked as reusable.
 */
export async function setupReusableRecipe(
  t: TestContext,
  name: string = 'Reusable Base',
  options: {
    ingredientCost?: number;
    yieldGrams?: number;
    ingredientQuantityGrams?: number;
  } = {}
): Promise<{
  recipeId: Id<'recipes'>;
  versionId: Id<'recipeVersions'>;
  ingredientId: Id<'ingredients'>;
}> {
  const ingredientCost = options.ingredientCost ?? 10;
  const yieldGrams = options.yieldGrams ?? 500;
  const ingredientQuantityGrams = options.ingredientQuantityGrams ?? 500;

  // Create ingredient
  const ingredientId = await createIngredient(t, {
    name: `${name} Ingredient`,
    unitType: 'kg',
    volumePurchased: 1,
    priceExclShipping: ingredientCost * 1000,
    shippingCost: 0,
  });

  // Create recipe
  const recipeId = await t.run(async (ctx) => {
    return await ctx.db.insert('recipes', {
      name,
      tagIds: [],
      createdBy: 'test',
    });
  });

  // Calculate costs
  const totalCost = ingredientCost * ingredientQuantityGrams;
  const costPerGram = totalCost / yieldGrams;

  // Create version (single component, reusable)
  const versionId = await t.run(async (ctx) => {
    return await ctx.db.insert('recipeVersions', {
      recipeId,
      versionNumber: 1,
      versionName: 'v1',
      estimatedYieldGrams: yieldGrams,
      isSingleComponent: true,
      isReusableComponent: true, // This is the key difference
      createdBy: 'test',
      cachedTotalCost: totalCost,
      cachedCostPerGram: costPerGram,
      costCacheUpdatedAt: Date.now(),
    });
  });

  // Create component
  const componentId = await t.run(async (ctx) => {
    return await ctx.db.insert('recipeComponents', {
      recipeVersionId: versionId,
      sortOrder: 0,
      componentName: 'Main Component',
    });
  });

  // Add ingredient
  await t.run(async (ctx) => {
    const ingredient = await ctx.db.get(ingredientId);
    await ctx.db.insert('componentIngredients', {
      recipeComponentId: componentId,
      ingredientId,
      sortOrder: 0,
      unit: 'g',
      quantity: ingredientQuantityGrams,
      ingredientName: ingredient?.name,
      cachedLineCost: totalCost,
    });
  });

  return { recipeId, versionId, ingredientId };
}

/**
 * Creates a recipe with a linked component (references another recipe version).
 */
export async function setupRecipeWithLinkedComponent(
  t: TestContext,
  linkedVersionId: Id<'recipeVersions'>,
  name: string = 'Recipe with Linked Component'
): Promise<{
  recipeId: Id<'recipes'>;
  versionId: Id<'recipeVersions'>;
}> {
  // Get linked version for cost calculation
  const linkedVersion = await t.run(async (ctx) => ctx.db.get(linkedVersionId));
  if (!linkedVersion) {
    throw new Error('Linked version not found');
  }

  // Create recipe
  const recipeId = await t.run(async (ctx) => {
    return await ctx.db.insert('recipes', {
      name,
      tagIds: [],
      createdBy: 'test',
    });
  });

  // Use linked version cost as total cost
  const totalCost = linkedVersion.cachedTotalCost ?? undefined;
  const yieldGrams = 1000;
  const costPerGram = totalCost != null ? totalCost / yieldGrams : undefined;

  // Create version
  const versionId = await t.run(async (ctx) => {
    return await ctx.db.insert('recipeVersions', {
      recipeId,
      versionNumber: 1,
      versionName: 'v1',
      estimatedYieldGrams: yieldGrams,
      isSingleComponent: true,
      isReusableComponent: false,
      createdBy: 'test',
      cachedTotalCost: totalCost,
      cachedCostPerGram: costPerGram,
      costCacheUpdatedAt: Date.now(),
    });
  });

  // Create linked component (no ingredients, just links to another recipe)
  await t.run(async (ctx) => {
    await ctx.db.insert('recipeComponents', {
      recipeVersionId: versionId,
      sortOrder: 0,
      componentName: 'Linked Component',
      linkedRecipeVersionId: linkedVersionId,
      cachedSubtotalCost: linkedVersion.cachedTotalCost ?? undefined,
    });
  });

  return { recipeId, versionId };
}

/**
 * Creates a default storage location (required for order confirmation).
 */
export async function createDefaultStorageLocation(
  t: TestContext,
  overrides: {
    name?: string;
    locationType?: string;
  } = {}
): Promise<Id<'storageLocations'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('storageLocations', {
      name: overrides.name ?? 'Office',
      locationType: overrides.locationType ?? 'office',
      isDefault: true,
      isActive: true,
      createdBy: 'test',
      createdAt: Date.now(),
    });
  });
}

/**
 * Creates a customer for order tests.
 */
export async function createCustomer(
  t: TestContext,
  overrides: {
    name?: string;
    phone?: string;
    source?: string;
  } = {}
): Promise<Id<'customers'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('customers', {
      name: overrides.name ?? 'Test Customer',
      phone: overrides.phone ?? '+62812345678',
      source: overrides.source ?? 'Test',
      createdBy: 'test',
    });
  });
}

/**
 * Creates a tag.
 */
export async function createTag(
  t: TestContext,
  name: string
): Promise<Id<'tags'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('tags', { name });
  });
}

/**
 * Creates a menu product for testing.
 */
export async function createMenuProduct(
  t: TestContext,
  overrides: {
    code?: string;
    name?: string;
    defaultPrice?: number;
    isActive?: boolean;
  } = {}
): Promise<Id<'menuProducts'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('menuProducts', {
      code: overrides.code ?? 'TEST-001',
      name: overrides.name ?? 'Test Product',
      grams: 100,
      defaultPrice: overrides.defaultPrice ?? 25000,
      productionType: 'original',
      productionUnits: 1,
      isActive: overrides.isActive ?? true,
    });
  });
}

/**
 * Creates an external revenue record for testing.
 */
export async function createExternalRevenue(
  t: TestContext,
  overrides: {
    source?: 'k3mart' | 'gobiz' | 'internal';
    revenueGross?: number;
    revenueNet?: number;
    commission?: number;
    adBurn?: number;
    promoBurn?: number;
    periodStart?: number;
    periodEnd?: number;
  } = {}
): Promise<Id<'externalRevenue'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('externalRevenue', {
      source: overrides.source ?? 'gobiz',
      periodStart: overrides.periodStart ?? Date.now(),
      periodEnd: overrides.periodEnd ?? Date.now(),
      dataOrigin: 'api_revenue',
      confidence: 'exact',
      revenueGross: overrides.revenueGross ?? 100000,
      revenueNet: overrides.revenueNet ?? 80000,
      commission: overrides.commission,
      adBurn: overrides.adBurn,
      promoBurn: overrides.promoBurn,
    });
  });
}
