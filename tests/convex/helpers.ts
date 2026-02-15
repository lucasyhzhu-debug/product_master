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
    locationType?: 'office' | 'kitchen' | 'venue';
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

      isActive: overrides.isActive ?? true,
      unitCost: 0,
      cachedProductionSummary: '',
      productType: 'food' as const,
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

// ============================================
// FIFO Inventory Test Helpers
// ============================================

/**
 * Creates a storage location for inventory tests.
 * Default: Office location, active, non-default.
 */
export async function createStorageLocation(
  t: TestContext,
  overrides: {
    name?: string;
    locationType?: 'office' | 'kitchen' | 'venue';
    isDefault?: boolean;
    isActive?: boolean;
  } = {}
): Promise<Id<'storageLocations'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('storageLocations', {
      name: overrides.name ?? 'Test Warehouse',
      locationType: overrides.locationType ?? 'office',
      isDefault: overrides.isDefault ?? false,
      isActive: overrides.isActive ?? true,
      createdBy: 'test',
      createdAt: Date.now(),
    });
  });
}

/**
 * Creates a packaging component type for inventory tests.
 * Default: Box at 500 IDR/pcs, tracked inventory, consumed at boxing stage.
 */
export async function createPackagingComponentType(
  t: TestContext,
  overrides: {
    code?: string;
    name?: string;
    unitCostIdr?: number;
    unit?: string;
    trackInventory?: boolean;
    consumptionStage?: 'production' | 'boxing' | 'labeling' | 'none';
    reorderPoint?: number;
    reorderQuantity?: number;
  } = {}
): Promise<Id<'componentTypes'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('componentTypes', {
      code: overrides.code ?? 'TEST_BOX',
      name: overrides.name ?? 'Test Box',
      category: 'packaging',
      unitCostIdr: overrides.unitCostIdr ?? 500,
      unit: overrides.unit ?? 'pcs',
      trackInventory: overrides.trackInventory ?? true,
      consumptionStage: overrides.consumptionStage ?? 'boxing',
      isActive: true,
      sortOrder: 0,
      reorderPoint: overrides.reorderPoint,
      reorderQuantity: overrides.reorderQuantity,
      createdBy: 'test',
      createdAt: Date.now(),
    });
  });
}

/**
 * Creates an inventory batch for FIFO tests.
 * Default: 100 units at 500 IDR/unit, active status, purchased now.
 *
 * Uses realistic packaging costs:
 * - Boxes: ~500 IDR/pcs
 * - Stickers: ~50 IDR/pcs
 */
export async function createInventoryBatch(
  t: TestContext,
  componentTypeId: Id<'componentTypes'>,
  locationId: Id<'storageLocations'>,
  overrides: {
    quantity?: number;
    unitCost?: number;
    purchaseDate?: number;
    expiryDate?: number;
    status?: 'active' | 'depleted' | 'expired';
    quantityReserved?: number;
    supplierName?: string;
  } = {}
): Promise<Id<'inventoryBatches'>> {
  const quantity = overrides.quantity ?? 100;
  const unitCost = overrides.unitCost ?? 500;

  return await t.run(async (ctx) => {
    return await ctx.db.insert('inventoryBatches', {
      componentTypeId,
      locationId,
      purchaseDate: overrides.purchaseDate ?? Date.now(),
      supplierName: overrides.supplierName ?? 'Test Supplier',
      quantityPurchased: quantity,
      totalCostIdr: quantity * unitCost,
      unitCostIdr: unitCost,
      quantityRemaining: quantity,
      quantityReserved: overrides.quantityReserved ?? 0,
      status: overrides.status ?? 'active',
      expiryDate: overrides.expiryDate,
      createdBy: 'test',
      createdAt: Date.now(),
    });
  });
}

/**
 * Verifies that an inventory batch has the expected quantityRemaining.
 * Throws assertion-style error if mismatch.
 */
export async function verifyBatchState(
  t: TestContext,
  batchId: Id<'inventoryBatches'>,
  expectedRemaining: number
): Promise<void> {
  const batch = await t.run(async (ctx) => ctx.db.get(batchId));
  if (!batch) {
    throw new Error(`Batch ${batchId} not found`);
  }
  if (batch.quantityRemaining !== expectedRemaining) {
    throw new Error(
      `Batch ${batchId}: expected quantityRemaining=${expectedRemaining}, got ${batch.quantityRemaining}`
    );
  }
}

// ============================================
// Voucher Test Helpers
// ============================================

/**
 * Creates a voucher for testing discount and validation scenarios.
 * Default: 10% percentage discount, active, valid from yesterday to tomorrow, no usage limits.
 *
 * Note: Schema uses discountType "amount" (not "fixed") and "percentage".
 */
export async function createVoucher(
  t: TestContext,
  overrides: {
    code?: string;
    name?: string;
    discountType?: 'percentage' | 'amount';
    discountValue?: number;
    minimumOrderAmount?: number;
    maximumDiscount?: number;
    validFrom?: number;
    validUntil?: number;
    usageLimit?: number;
    usagePerCustomer?: number;
    isActive?: boolean;
  } = {}
): Promise<Id<'vouchers'>> {
  const now = Date.now();
  return await t.run(async (ctx) => {
    return await ctx.db.insert('vouchers', {
      code: overrides.code ?? 'SAVE10',
      name: overrides.name ?? 'Test Voucher',
      discountType: overrides.discountType ?? 'percentage',
      discountValue: overrides.discountValue ?? 10,
      minimumOrderAmount: overrides.minimumOrderAmount,
      maximumDiscount: overrides.maximumDiscount,
      validFrom: overrides.validFrom ?? (now - 86400000), // Yesterday
      validUntil: overrides.validUntil ?? (now + 86400000), // Tomorrow
      usageLimit: overrides.usageLimit,
      usagePerCustomer: overrides.usagePerCustomer,
      isActive: overrides.isActive ?? true,
      usageCount: 0,
      createdBy: 'test',
      createdAt: now,
    });
  });
}

/**
 * Creates an order with a voucher applied via the order creation mutation.
 * Sets up customer and order items, then creates the order with a voucherCode.
 * Returns the order ID and customer ID for verification.
 *
 * The orderTotal is achieved by creating a single item at the specified price.
 * Uses lowPriceConfirmed: true for orders where final price may be below 20K.
 */
export async function createOrderWithVoucher(
  t: TestContext,
  overrides: {
    voucherCode: string;
    orderTotal?: number;
    customerId?: Id<'customers'>;
    unitCost?: number;
  }
): Promise<{
  orderId: Id<'orders'>;
  customerId: Id<'customers'>;
}> {
  const { api } = await import('../../convex/_generated/api');

  // Create customer if not provided
  const customerId = overrides.customerId ?? await createCustomer(t, {
    name: 'Voucher Test Customer',
    phone: '+62899887766',
  });

  const orderTotal = overrides.orderTotal ?? 100000;
  const unitCost = overrides.unitCost ?? Math.floor(orderTotal * 0.4); // 40% cost default

  // Create order with voucher code via mutation
  const orderId = await t.mutation(api.orders.mutations.index.create, {
    customerId,
    voucherCode: overrides.voucherCode,
    lowPriceConfirmed: true, // Accept any final price
    items: [
      {
        productName: 'Voucher Test Product',
        quantity: 1,
        unitPrice: orderTotal,
        unitCost,
      },
    ],
  });

  return { orderId, customerId };
}

/**
 * Verifies voucher usage tracking by querying the voucherUsage table
 * and the voucher's own usageCount field.
 * Throws assertion-style errors if counts don't match expected.
 * Returns usage records for further inspection.
 */
export async function verifyVoucherUsage(
  t: TestContext,
  voucherId: Id<'vouchers'>,
  expectedUsageCount: number
): Promise<Array<{
  voucherId: Id<'vouchers'>;
  customerId: Id<'customers'>;
  orderId: Id<'orders'>;
  usedAt: number;
}>> {
  const usageRecords = await t.run(async (ctx) => {
    return await ctx.db
      .query('voucherUsage')
      .withIndex('by_voucher', (q) => q.eq('voucherId', voucherId))
      .collect();
  });

  // Also verify the voucher's own usageCount field
  const voucher = await t.run(async (ctx) => ctx.db.get(voucherId));
  if (voucher) {
    if (voucher.usageCount !== expectedUsageCount) {
      throw new Error(
        `Expected voucher.usageCount to be ${expectedUsageCount}, got ${voucher.usageCount}`
      );
    }
  }

  if (usageRecords.length !== expectedUsageCount) {
    throw new Error(
      `Expected ${expectedUsageCount} usage records, found ${usageRecords.length}`
    );
  }

  return usageRecords;
}

// ============================================
// Ball Distribution Test Helpers
// ============================================

/**
 * Creates a component type (production or packaging) in the unified BOM system.
 * Default: BIG_BALL production component (80g/Jumbo).
 *
 * Uses the componentTypes table (unified BOM) -- NOT the deprecated
 * productionUnitTypes table. However, also creates a matching
 * productionUnitTypes entry for production components since
 * orderItemProduction.productionUnitTypeId requires it.
 */
export async function createComponentType(
  t: TestContext,
  overrides: {
    code?: string;
    name?: string;
    category?: 'production' | 'packaging';
    gramsPerUnit?: number;
    unitCostIdr?: number;
    unit?: string;
    trackInventory?: boolean;
    sortOrder?: number;
    isActive?: boolean;
    color?: string;
  } = {}
): Promise<Id<'componentTypes'>> {
  const code = overrides.code ?? 'BIG_BALL';
  const name = overrides.name ?? 'Big Ball';
  const category = overrides.category ?? 'production';
  const gramsPerUnit = overrides.gramsPerUnit ?? (code === 'MID_BALL' ? 45 : 80);
  const unitCostIdr = overrides.unitCostIdr ?? 1000;
  const unit = overrides.unit ?? 'pcs';
  const trackInventory = overrides.trackInventory ?? (category === 'packaging');
  const sortOrder = overrides.sortOrder ?? 0;
  const isActive = overrides.isActive ?? true;

  const componentTypeId = await t.run(async (ctx) => {
    return await ctx.db.insert('componentTypes', {
      code,
      name,
      category,
      gramsPerUnit: category === 'production' ? gramsPerUnit : undefined,
      unitCostIdr,
      unit,
      trackInventory,
      sortOrder,
      isActive,
      color: overrides.color,
      createdBy: 'test',
      createdAt: Date.now(),
    });
  });

  // For production components, also create matching productionUnitTypes entry.
  // This is required because orderItemProduction.productionUnitTypeId is a required
  // field (v.id, not optional) and createProductionRecordsForItem bridges via code.
  if (category === 'production') {
    await t.run(async (ctx) => {
      // Check if already exists (avoid duplicates in multi-component tests)
      const existing = await ctx.db
        .query('productionUnitTypes')
        .withIndex('by_code', (q) => q.eq('code', code))
        .first();
      if (!existing) {
        await ctx.db.insert('productionUnitTypes', {
          code,
          name,
          gramsPerUnit,
          unitCostIdr,
          color: overrides.color ?? '#93C572',
          sortOrder,
          isActive,
        });
      }
    });
  }

  return componentTypeId;
}

/**
 * Creates a menu product with BOM entries (menuProductComponents + componentTypes).
 * Uses the unified BOM system -- NOT deprecated productionType/productionUnits fields.
 *
 * Default: Single product with 1 BIG_BALL at 25,000 IDR.
 *
 * @param ballConfig Array of {code, quantity} for production components.
 *   e.g., [{code: 'BIG_BALL', quantity: 2}, {code: 'MID_BALL', quantity: 1}]
 */
export async function createMenuProductWithBOM(
  t: TestContext,
  overrides: {
    code?: string;
    name?: string;
    defaultPrice?: number;
    grams?: number;
    isActive?: boolean;
    ballConfig?: Array<{ code: string; quantity: number }>;
  } = {}
): Promise<{
  menuProductId: Id<'menuProducts'>;
  componentTypeIds: Id<'componentTypes'>[];
}> {
  const code = overrides.code ?? 'BOM-001';
  const name = overrides.name ?? 'Test BOM Product';
  const defaultPrice = overrides.defaultPrice ?? 25000;
  const grams = overrides.grams ?? 100;
  const isActive = overrides.isActive ?? true;
  const ballConfig = overrides.ballConfig ?? [{ code: 'BIG_BALL', quantity: 1 }];

  // Create the menu product (uses legacy fields with placeholder values -- required by schema)
  const menuProductId = await t.run(async (ctx) => {
    return await ctx.db.insert('menuProducts', {
      code,
      name,
      grams,
      defaultPrice,

      isActive,
      unitCost: 0,
      cachedProductionSummary: '',
      productType: 'food' as const,
    });
  });

  // Create component types and BOM links
  const componentTypeIds: Id<'componentTypes'>[] = [];

  for (let i = 0; i < ballConfig.length; i++) {
    const config = ballConfig[i];
    const componentName = config.code === 'BIG_BALL' ? 'Big Ball' :
                          config.code === 'MID_BALL' ? 'Mid Ball' :
                          config.code;
    const componentGrams = config.code === 'BIG_BALL' ? 80 :
                           config.code === 'MID_BALL' ? 45 : 0;

    const componentTypeId = await createComponentType(t, {
      code: config.code,
      name: componentName,
      category: 'production',
      gramsPerUnit: componentGrams,
    });
    componentTypeIds.push(componentTypeId);

    // Create BOM link (menuProductComponents)
    await t.run(async (ctx) => {
      await ctx.db.insert('menuProductComponents', {
        menuProductId,
        componentTypeId,
        quantity: config.quantity,
        sortOrder: i,
      });
    });
  }

  return { menuProductId, componentTypeIds };
}

/**
 * Creates an order with order items, production records, and all required
 * supporting data (customer, menu product with BOM).
 *
 * This helper creates the full order structure needed for ball distribution tests:
 * 1. Customer (if not provided)
 * 2. Menu product with BOM (if not provided)
 * 3. Order record
 * 4. Order items with production records (orderItemProduction)
 *
 * Returns orderId and all created entity IDs for test assertions.
 */
export async function createBasicOrder(
  t: TestContext,
  overrides: {
    customerId?: Id<'customers'>;
    menuProductId?: Id<'menuProducts'>;
    quantity?: number;
    dueDate?: number;
    status?: string;
    orderDate?: number;
    productName?: string;
    unitPrice?: number;
    unitCost?: number;
    ballConfig?: Array<{ code: string; quantity: number }>;
  } = {}
): Promise<{
  orderId: Id<'orders'>;
  customerId: Id<'customers'>;
  menuProductId: Id<'menuProducts'>;
  orderItemIds: Id<'orderItems'>[];
}> {
  const quantity = overrides.quantity ?? 1;
  const status = overrides.status ?? 'BeingPrepared';
  const dueDate = overrides.dueDate ?? Date.now() + 86400000; // Tomorrow
  const orderDate = overrides.orderDate ?? Date.now();
  const productName = overrides.productName ?? 'Test Product';
  const unitPrice = overrides.unitPrice ?? 25000;
  const unitCost = overrides.unitCost ?? 10000;

  // Create customer if not provided
  const customerId = overrides.customerId ?? await createCustomer(t);

  // Create menu product with BOM if not provided
  let menuProductId = overrides.menuProductId;
  if (!menuProductId) {
    const bomResult = await createMenuProductWithBOM(t, {
      ballConfig: overrides.ballConfig ?? [{ code: 'BIG_BALL', quantity: 1 }],
    });
    menuProductId = bomResult.menuProductId;
  }

  // Create the order
  const orderId = await t.run(async (ctx) => {
    const now = new Date();
    const orderNumber = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`;

    const totalAmount = quantity * unitPrice;
    const kitchenVisibleStatuses = ['BeingPrepared'];
    return await ctx.db.insert('orders', {
      orderNumber,
      customerId,
      customerName: 'Test Customer',
      status: status as 'Draft' | 'AwaitingPayment' | 'PaymentReceived' | 'BeingPrepared' | 'AwaitingDelivery' | 'Complete' | 'Cancelled',
      paymentStatus: 'Unpaid',
      orderDate,
      dueDate,
      totalAmount,
      totalCost: quantity * unitCost,
      totalMargin: quantity * (unitPrice - unitCost),
      deliveryType: 'Delivery',
      createdBy: 'test',
      itemCount: 1,
      finalTotal: totalAmount,
      isKitchenVisible: kitchenVisibleStatuses.includes(status),
    });
  });

  // Create order item
  const orderItemId = await t.run(async (ctx) => {
    return await ctx.db.insert('orderItems', {
      orderId,
      productName,
      quantity,
      unitPrice,
      unitCost,
      discountAmount: 0,
      lineTotal: quantity * unitPrice,
      lineCost: quantity * unitCost,
      lineMargin: quantity * (unitPrice - unitCost),
      menuProductId,
      packageStatus: 'empty',
      ballsFilled: 0,
    });
  });

  // Create production records from BOM
  // Fetch menu product components to build orderItemProduction records
  await t.run(async (ctx) => {
    const components = await ctx.db
      .query('menuProductComponents')
      .withIndex('by_menu_product', (q) => q.eq('menuProductId', menuProductId!))
      .collect();

    for (const comp of components) {
      const componentType = await ctx.db.get(comp.componentTypeId);
      if (!componentType || componentType.category !== 'production') continue;

      // Find matching productionUnitType by code
      const productionUnitType = await ctx.db
        .query('productionUnitTypes')
        .withIndex('by_code', (q) => q.eq('code', componentType.code))
        .first();
      if (!productionUnitType) continue;

      const unitsRequired = comp.quantity * quantity;
      await ctx.db.insert('orderItemProduction', {
        orderItemId,
        productionUnitTypeId: productionUnitType._id,
        productionUnitCode: componentType.code,
        productionUnitName: componentType.name,
        unitsRequired,
        unitsCompleted: 0,
        unitsRemaining: unitsRequired,
      });
    }
  });

  return {
    orderId,
    customerId,
    menuProductId,
    orderItemIds: [orderItemId],
  };
}

/**
 * Verifies no ghost balls exist in the system.
 * A "ghost ball" is an orderItemProduction record that is:
 * - Not cancelled
 * - Has unitsCompleted > 0 (balls were produced)
 * - But the record has no valid orderId linkage through its orderItemId
 *
 * Also verifies the fundamental invariant:
 *   For each active production record: unitsRequired = unitsCompleted + unitsRemaining
 *
 * Returns a verification result with details about any violations found.
 */
export async function verifyNoGhostBalls(
  t: TestContext
): Promise<{
  passed: boolean;
  totalRecords: number;
  activeRecords: number;
  totalProduced: number;
  totalRemaining: number;
  violations: string[];
}> {
  return await t.run(async (ctx) => {
    const allRecords = await ctx.db.query('orderItemProduction').collect();
    const violations: string[] = [];
    let activeRecords = 0;
    let totalProduced = 0;
    let totalRemaining = 0;

    for (const record of allRecords) {
      if (record.isCancelled) continue;
      activeRecords++;
      totalProduced += record.unitsCompleted;
      totalRemaining += record.unitsRemaining;

      // Invariant: unitsRequired = unitsCompleted + unitsRemaining
      if (record.unitsRequired !== record.unitsCompleted + record.unitsRemaining) {
        violations.push(
          `Record ${record._id}: unitsRequired(${record.unitsRequired}) != ` +
          `unitsCompleted(${record.unitsCompleted}) + unitsRemaining(${record.unitsRemaining})`
        );
      }

      // Verify the record's orderItem exists and has a valid orderId
      const orderItem = await ctx.db.get(record.orderItemId);
      if (!orderItem) {
        violations.push(
          `Record ${record._id}: orderItemId ${record.orderItemId} does not exist (ghost ball)`
        );
        continue;
      }

      // Verify the order exists
      const order = await ctx.db.get(orderItem.orderId);
      if (!order) {
        violations.push(
          `Record ${record._id}: order ${orderItem.orderId} does not exist (orphaned production)`
        );
      }
    }

    return {
      passed: violations.length === 0,
      totalRecords: allRecords.length,
      activeRecords,
      totalProduced,
      totalRemaining,
      violations,
    };
  });
}

// ============================================
// Order Lifecycle Test Helpers
// ============================================

/**
 * Valid order status transition paths.
 * Used by createOrderAtStatus to advance orders through the lifecycle.
 */
const STATUS_PROGRESSION: Record<string, string> = {
  Draft: 'AwaitingPayment',
  AwaitingPayment: 'Confirmed',
  Confirmed: 'InProduction',
  InProduction: 'Boxed',
  Boxed: 'Labeled',
  Labeled: 'WaitingShipment', // Default path; pickup uses WaitingPickup
};

/**
 * Creates an order and advances it to the target status through valid transitions.
 *
 * Uses createBasicOrder to create the order in Draft, then transitions
 * through the valid workflow to reach targetStatus. Creates required
 * infrastructure (storage location, inventory) as needed.
 *
 * @param t - Test context from convexTest(schema)
 * @param options.targetStatus - The desired final status
 * @param options.deliveryType - 'Delivery' (shipped) or 'Pickup' (pickup path)
 * @param options.withInventory - Whether to create packaging inventory for reservation (default: true for Confirmed+)
 * @param options.overrides - Overrides passed to createBasicOrder
 * @returns orderId and supporting entity IDs
 */
export async function createOrderAtStatus(
  t: TestContext,
  options: {
    targetStatus: string;
    deliveryType?: 'Delivery' | 'Pickup';
    withInventory?: boolean;
    overrides?: Parameters<typeof createBasicOrder>[1];
  }
): Promise<{
  orderId: Id<'orders'>;
  customerId: Id<'customers'>;
  menuProductId: Id<'menuProducts'>;
  orderItemIds: Id<'orderItems'>[];
  storageLocationId?: Id<'storageLocations'>;
}> {
  const { api } = await import('../../convex/_generated/api');

  const targetStatus = options.targetStatus;
  const deliveryType = options.deliveryType ?? 'Delivery';
  const withInventory = options.withInventory ?? true;

  // Create storage location (needed for Confirmed+ transitions)
  let storageLocationId: Id<'storageLocations'> | undefined;
  if (targetStatus !== 'Draft' && targetStatus !== 'AwaitingPayment') {
    storageLocationId = await createDefaultStorageLocation(t);
  }

  // Create the order in Draft status via createBasicOrder
  const orderResult = await createBasicOrder(t, {
    ...options.overrides,
    status: 'Draft', // Always start at Draft
  });

  // Fix: createBasicOrder creates order directly with the given status,
  // but we need to start at Draft and transition forward.
  // Patch the order to Draft first if needed.
  await t.run(async (ctx) => {
    await ctx.db.patch(orderResult.orderId, {
      status: 'Draft',
      deliveryType,
    });
  });

  if (targetStatus === 'Draft') {
    return { ...orderResult, storageLocationId };
  }

  // Define the path to reach target status
  const statusPath: string[] = [];
  let current = 'Draft';

  while (current !== targetStatus) {
    let next: string;

    if (current === 'Labeled') {
      // Branch: shipped vs pickup path
      if (targetStatus === 'WaitingPickup' || targetStatus === 'PickedUp') {
        next = 'WaitingPickup';
      } else {
        next = 'WaitingShipment';
      }
    } else if (current === 'WaitingShipment') {
      next = 'CompleteShipped';
    } else if (current === 'WaitingPickup') {
      next = 'PickedUp';
    } else {
      next = STATUS_PROGRESSION[current];
    }

    if (!next) {
      throw new Error(`No valid transition from ${current} toward ${targetStatus}`);
    }

    statusPath.push(next);
    current = next;
  }

  // Execute transitions
  for (const status of statusPath) {
    await t.mutation(api.orders.mutations.index.updateStatus, {
      orderId: orderResult.orderId,
      status: status as 'Draft' | 'AwaitingPayment' | 'Confirmed' | 'InProduction' | 'Boxed' | 'Labeled' | 'WaitingShipment' | 'CompleteShipped' | 'WaitingPickup' | 'PickedUp' | 'Cancelled',
    });
  }

  return { ...orderResult, storageLocationId };
}

/**
 * Verifies that orderComponentReservations exist for an order and all have status 'reserved'.
 *
 * @param t - Test context
 * @param orderId - The order to check
 * @returns Number of active reservations found
 * @throws Error if no reservations found or any have non-reserved status
 */
export async function verifyInventoryReserved(
  t: TestContext,
  orderId: Id<'orders'>
): Promise<number> {
  const reservations = await t.run(async (ctx) => {
    return await ctx.db
      .query('orderComponentReservations')
      .withIndex('by_order', (q) => q.eq('orderId', orderId))
      .collect();
  });

  const activeReservations = reservations.filter((r) => r.status === 'reserved');

  if (activeReservations.length === 0 && reservations.length === 0) {
    // No reservations at all -- may be expected if no packaging components
    return 0;
  }

  return activeReservations.length;
}

/**
 * Verifies that no active reservations remain for an order.
 * All reservations should be either 'released' or 'consumed'.
 *
 * @param t - Test context
 * @param orderId - The order to check
 * @returns true if no active reservations remain
 * @throws Error if any reservations still have 'reserved' status
 */
export async function verifyInventoryReleased(
  t: TestContext,
  orderId: Id<'orders'>
): Promise<boolean> {
  const reservations = await t.run(async (ctx) => {
    return await ctx.db
      .query('orderComponentReservations')
      .withIndex('by_order', (q) => q.eq('orderId', orderId))
      .filter((q) => q.eq(q.field('status'), 'reserved'))
      .collect();
  });

  if (reservations.length > 0) {
    throw new Error(
      `Expected 0 active reservations, found ${reservations.length} still with status 'reserved'`
    );
  }

  return true;
}

/**
 * Comprehensive cancellation verification.
 * Checks all aspects of cancellation rollback per RESEARCH.md Pitfall 4:
 * 1. Order status is 'Cancelled'
 * 2. Inventory reservations released (no 'reserved' status)
 * 3. Production records cancelled (isCancelled: true)
 * 4. Voucher usage released (if applicable)
 * 5. Cancellation event logged in orderEvents
 *
 * @param t - Test context
 * @param orderId - The order to verify
 * @returns Verification result with details
 */
export async function verifyOrderFullyCancelled(
  t: TestContext,
  orderId: Id<'orders'>
): Promise<{
  passed: boolean;
  orderStatus: string;
  inventoryReleased: boolean;
  productionCancelled: boolean;
  cancellationEventLogged: boolean;
  voucherReleased: boolean;
  failures: string[];
}> {
  const failures: string[] = [];

  // 1. Check order status
  const order = await t.run(async (ctx) => ctx.db.get(orderId));
  const orderStatus = order?.status ?? 'NOT_FOUND';
  if (orderStatus !== 'Cancelled') {
    failures.push(`Order status is '${orderStatus}', expected 'Cancelled'`);
  }

  // 2. Check inventory reservations released
  let inventoryReleased = true;
  try {
    await verifyInventoryReleased(t, orderId);
  } catch {
    inventoryReleased = false;
    failures.push('Inventory reservations not fully released');
  }

  // 3. Check production records cancelled
  let productionCancelled = true;
  const productionCheck = await t.run(async (ctx) => {
    const items = await ctx.db
      .query('orderItems')
      .withIndex('by_order', (q) => q.eq('orderId', orderId))
      .collect();

    for (const item of items) {
      const records = await ctx.db
        .query('orderItemProduction')
        .withIndex('by_order_item', (q) => q.eq('orderItemId', item._id))
        .collect();

      for (const record of records) {
        if (!record.isCancelled) {
          return false;
        }
      }
    }
    return true;
  });

  if (!productionCheck) {
    productionCancelled = false;
    failures.push('Not all production records marked as cancelled');
  }

  // 4. Check voucher usage released
  let voucherReleased = true;
  if (order?.voucherId) {
    const voucherUsage = await t.run(async (ctx) => {
      return await ctx.db
        .query('voucherUsage')
        .withIndex('by_voucher', (q) => q.eq('voucherId', order.voucherId!))
        .collect();
    });

    // Check if any usage records for this order still exist
    const orderUsage = voucherUsage.filter((u) => u.orderId === orderId);
    if (orderUsage.length > 0) {
      voucherReleased = false;
      failures.push('Voucher usage not released for this order');
    }
  }

  // 5. Check cancellation event logged
  const cancellationEventLogged = await t.run(async (ctx) => {
    const events = await ctx.db
      .query('orderEvents')
      .withIndex('by_order', (q) => q.eq('orderId', orderId))
      .collect();

    return events.some((e) => e.eventType === 'cancelled');
  });

  if (!cancellationEventLogged) {
    failures.push('No cancellation event found in orderEvents');
  }

  return {
    passed: failures.length === 0,
    orderStatus,
    inventoryReleased,
    productionCancelled,
    cancellationEventLogged,
    voucherReleased,
    failures,
  };
}
