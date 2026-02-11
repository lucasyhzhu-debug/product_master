/**
 * Test fixtures for K3 Mart Cockpit integration tests.
 * Provides helper functions for creating test data for outlets, stock snapshots,
 * product mappings, dispatch plans, and stock movements.
 */

import type { TestConvex } from 'convex-test';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

type TestContext = TestConvex<typeof schema>;

/**
 * Creates a K3 Mart outlet (externalOutlets record).
 * Default: K3Mart Taman Anggrek outlet
 */
export async function createK3MartOutlet(
  t: TestContext,
  overrides: {
    externalId?: string;
    name?: string;
    address?: string;
    isActive?: boolean;
    lastSyncAt?: number;
    createdBy?: string;
  } = {}
): Promise<Id<'externalOutlets'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('externalOutlets', {
      source: 'k3mart',
      externalId: overrides.externalId ?? '45',
      name: overrides.name ?? 'K3Mart Taman Anggrek',
      address: overrides.address,
      isActive: overrides.isActive ?? true,
      lastSyncAt: overrides.lastSyncAt ?? Date.now(),
      createdBy: overrides.createdBy ?? 'test',
      createdAt: Date.now(),
    });
  });
}

/**
 * Creates a stock snapshot record (externalStockSnapshots).
 * Default: 10 units of Frollie Original at K3 Mart
 */
export async function createStockSnapshot(
  t: TestContext,
  opts: {
    outletId: Id<'externalOutlets'>;
    externalProductId?: string;
    externalProductCode?: string;
    productName?: string;
    quantity?: number;
    price?: number;
    snapshotAt?: number;
    snapshotBatchId?: string;
  }
): Promise<Id<'externalStockSnapshots'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('externalStockSnapshots', {
      outletId: opts.outletId,
      externalProductId: opts.externalProductId ?? '47068',
      externalProductCode: opts.externalProductCode ?? '47068',
      productName: opts.productName ?? 'Frollie Original',
      quantity: opts.quantity ?? 10,
      price: opts.price ?? 50000,
      snapshotAt: opts.snapshotAt ?? Date.now(),
      snapshotBatchId: opts.snapshotBatchId ?? 'batch-test-001',
    });
  });
}

/**
 * Creates a product mapping (externalProductMappings).
 * Links external product to internal menu product.
 */
export async function createProductMapping(
  t: TestContext,
  opts: {
    externalProductId?: string;
    externalProductCode?: string;
    productName?: string;
    menuProductId: Id<'menuProducts'>;
    isAutoMapped?: boolean;
  }
): Promise<Id<'externalProductMappings'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('externalProductMappings', {
      source: 'k3mart',
      externalProductCode: opts.externalProductCode ?? '47068',
      externalProductName: opts.productName ?? 'Frollie Original',
      menuProductId: opts.menuProductId,
      isAutoMapped: opts.isAutoMapped ?? false,
      createdAt: Date.now(),
    });
  });
}

/**
 * Creates a K3 Mart revenue record (externalRevenue).
 * Default: 5 units sold, 50k gross, 45k net
 */
export async function createK3MartRevenue(
  t: TestContext,
  opts: {
    periodStart: number;
    periodEnd: number;
    outletId?: Id<'externalOutlets'>;
    externalProductCode?: string;
    productName?: string;
    quantitySold?: number;
    revenueGross?: number;
    revenueNet?: number;
  }
): Promise<Id<'externalRevenue'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('externalRevenue', {
      source: 'k3mart',
      periodStart: opts.periodStart,
      periodEnd: opts.periodEnd,
      dataOrigin: 'api_daily_sales',
      confidence: 'exact',
      revenueGross: opts.revenueGross ?? 50000,
      revenueNet: opts.revenueNet ?? 45000,
      outletId: opts.outletId,
      externalProductCode: opts.externalProductCode ?? '47068',
      productName: opts.productName,
      quantitySold: opts.quantitySold ?? 5,
    });
  });
}

/**
 * Creates a dispatch plan record (k3martDispatchPlans).
 * Default: Draft plan for 5 units
 */
export async function createDispatchPlan(
  t: TestContext,
  opts: {
    date: string; // YYYY-MM-DD
    weekNumber?: string; // ISO week e.g. "2026-W07"
    outletId: Id<'externalOutlets'>;
    menuProductId: Id<'menuProducts'>;
    externalProductId?: string;
    suggestedQty?: number;
    plannedQty?: number;
    isStockOut?: boolean;
    source?: 'kitchen' | 'goldfinch' | 'outlet';
    sourceOutletId?: Id<'externalOutlets'>;
    destinationOutletId?: Id<'externalOutlets'>;
    destination?: 'office' | 'goldfinch' | 'outlet';
    status?: 'draft' | 'confirmed' | 'submitted' | 'approved' | 'rejected' | 'canceled';
    createdBy?: string;
    createdAt?: number;
    updatedAt?: number;
  }
): Promise<Id<'k3martDispatchPlans'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('k3martDispatchPlans', {
      date: opts.date,
      weekNumber: opts.weekNumber ?? '2026-W07',
      outletId: opts.outletId,
      menuProductId: opts.menuProductId,
      externalProductId: opts.externalProductId ?? '47068',
      suggestedQty: opts.suggestedQty ?? 5,
      plannedQty: opts.plannedQty ?? 5,
      isStockOut: opts.isStockOut ?? false,
      source: opts.source,
      sourceOutletId: opts.sourceOutletId,
      destinationOutletId: opts.destinationOutletId,
      destination: opts.destination,
      status: opts.status ?? 'draft',
      createdBy: opts.createdBy ?? 'test',
      createdAt: opts.createdAt ?? Date.now(),
      updatedAt: opts.updatedAt ?? Date.now(),
    });
  });
}

/**
 * Creates a stock movement record (k3martStockMovements).
 * Default: Stock-in of 5 units
 */
export async function createStockMovement(
  t: TestContext,
  opts: {
    date: string; // YYYY-MM-DD
    outletId: Id<'externalOutlets'>;
    direction: 'stock_in' | 'stock_out';
    menuProductId: Id<'menuProducts'>;
    externalProductId?: string;
    quantity: number;
    priceAtSubmission?: number;
    currentStockAtSubmission?: number;
    source?: 'kitchen' | 'goldfinch' | 'outlet';
    destination?: 'office' | 'goldfinch' | 'outlet';
    destinationOutletId?: Id<'externalOutlets'>;
    k3martRequestId?: number;
    k3martStatus?: 'pending' | 'approved' | 'rejected' | 'canceled';
    note?: string;
    submittedBy?: string;
  }
): Promise<Id<'k3martStockMovements'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('k3martStockMovements', {
      date: opts.date,
      outletId: opts.outletId,
      direction: opts.direction,
      menuProductId: opts.menuProductId,
      externalProductId: opts.externalProductId ?? '47068',
      quantity: opts.quantity,
      priceAtSubmission: opts.priceAtSubmission ?? 50000,
      currentStockAtSubmission: opts.currentStockAtSubmission ?? 10,
      source: opts.source,
      destination: opts.destination,
      destinationOutletId: opts.destinationOutletId,
      k3martRequestId: opts.k3martRequestId,
      k3martStatus: opts.k3martStatus,
      note: opts.note,
      attemptCount: 0,
      submittedBy: opts.submittedBy ?? 'test',
      submittedAt: Date.now(),
    });
  });
}

/**
 * Creates an admin user session.
 * Returns session token for use in authenticated mutations.
 */
export async function createAdminSession(
  t: TestContext,
  overrides: {
    name?: string;
  } = {}
): Promise<string> {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      name: overrides.name ?? 'Admin',
      pinHash: 'salt:hash',
      role: 'admin',
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    });

    const token = `admin-test-token-${Date.now()}`;
    await ctx.db.insert('sessions', {
      userId,
      token,
      expiresAt: Date.now() + 3600000, // 1 hour
      createdAt: Date.now(),
    });

    return token;
  });
}

/**
 * Creates a manager user session.
 * Returns session token for use in authenticated mutations.
 */
export async function createManagerSession(
  t: TestContext,
  overrides: {
    name?: string;
  } = {}
): Promise<string> {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      name: overrides.name ?? 'Manager',
      pinHash: 'salt:hash',
      role: 'manager',
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    });

    const token = `manager-test-token-${Date.now()}`;
    await ctx.db.insert('sessions', {
      userId,
      token,
      expiresAt: Date.now() + 3600000, // 1 hour
      createdAt: Date.now(),
    });

    return token;
  });
}

/**
 * Creates a kitchen user session.
 * Returns session token for use in authenticated mutations.
 */
export async function createKitchenSession(
  t: TestContext,
  overrides: {
    name?: string;
  } = {}
): Promise<string> {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      name: overrides.name ?? 'Kitchen',
      pinHash: 'salt:hash',
      role: 'kitchen',
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    });

    const token = `kitchen-test-token-${Date.now()}`;
    await ctx.db.insert('sessions', {
      userId,
      token,
      expiresAt: Date.now() + 3600000, // 1 hour
      createdAt: Date.now(),
    });

    return token;
  });
}

/**
 * Creates a production count record (productionCounts).
 * Default: 0 unstickered, 0 stickered
 */
export async function createProductionCount(
  t: TestContext,
  opts: {
    menuProductId: Id<'menuProducts'>;
    boxed?: number;
    stickered?: number;
    packed?: number;
    shippedToGoldfinch?: number;
  }
): Promise<Id<'productionCounts'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('productionCounts', {
      menuProductId: opts.menuProductId,
      boxed: opts.boxed ?? 0,
      stickered: opts.stickered ?? 0,
      packed: opts.packed ?? 0,
      shippedToGoldfinch: opts.shippedToGoldfinch,
      lastResetAt: undefined,
      lastResetBy: undefined,
    });
  });
}

/**
 * Creates a depot stock record (gofoodDepotStock).
 * Default: 0 quantity at Goldfinch depot
 */
export async function createDepotStock(
  t: TestContext,
  opts: {
    menuProductId: Id<'menuProducts'>;
    quantity?: number;
    stickerDeficit?: number;
  }
): Promise<Id<'gofoodDepotStock'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('gofoodDepotStock', {
      menuProductId: opts.menuProductId,
      quantity: opts.quantity ?? 0,
      stickerDeficit: opts.stickerDeficit,
      lastUpdated: Date.now(),
    });
  });
}

/**
 * Creates a menu product for testing.
 * Simplified helper for K3 Mart tests.
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
