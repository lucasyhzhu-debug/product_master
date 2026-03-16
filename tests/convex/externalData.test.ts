/**
 * Integration tests for external data layer (mutations + queries).
 * Tests dedup logic, outlet upsert, sync timestamp tracking,
 * and dashboard summary aggregation.
 */

import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { internal } from "../../convex/_generated/api";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createMenuProduct, createExternalRevenue } from "./helpers";

// ============================================
// Helper: create a test outlet
// ============================================
async function createTestOutlet(t: ReturnType<typeof convexTest>, source: "k3mart" | "gobiz" = "k3mart", externalId = "48") {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("externalOutlets", {
      source,
      externalId,
      name: `Test Outlet #${externalId}`,
      isActive: true,
      createdBy: "test",
      createdAt: Date.now(),
    });
  });
}

// ============================================
// saveRevenue Dedup Tests - 6 tests
// ============================================
describe("saveRevenue dedup logic", () => {
  test("inserts a revenue record without externalTransactionId", async () => {
    const t = convexTest(schema);

    const ids = await t.mutation(internal.externalData.mutations.saveRevenue, {
      records: [
        {
          source: "k3mart",
          periodStart: 1000,
          periodEnd: 2000,
          dataOrigin: "stock_delta",
          confidence: "inferred",
          quantitySold: 10,
          revenueGross: 150000,
        },
      ],
    });

    expect(ids).toHaveLength(1);
  });

  test("inserts a revenue record with externalTransactionId", async () => {
    const t = convexTest(schema);

    const ids = await t.mutation(internal.externalData.mutations.saveRevenue, {
      records: [
        {
          source: "k3mart",
          externalTransactionId: "07 Feb 2026|Outlet A|PROD-001|5|75000",
          periodStart: 1000,
          periodEnd: 2000,
          dataOrigin: "api_revenue",
          confidence: "exact",
          transactionType: "sales",
          commission: 26250,
          transactionDate: 1000,
          quantitySold: 5,
          revenueGross: 75000,
          revenueNet: 48750,
        },
      ],
    });

    expect(ids).toHaveLength(1);
  });

  test("upserts duplicate when same externalTransactionId exists", async () => {
    const t = convexTest(schema);
    const dedupKey = "07 Feb 2026|Outlet A|PROD-001|5|75000";

    // Insert first time
    const ids1 = await t.mutation(internal.externalData.mutations.saveRevenue, {
      records: [
        {
          source: "k3mart",
          externalTransactionId: dedupKey,
          periodStart: 1000,
          periodEnd: 2000,
          dataOrigin: "api_revenue",
          confidence: "exact",
          transactionType: "sales",
          quantitySold: 5,
          revenueGross: 75000,
        },
      ],
    });
    expect(ids1).toHaveLength(1);

    // Insert same transaction again — should upsert (update + return existing ID)
    const ids2 = await t.mutation(internal.externalData.mutations.saveRevenue, {
      records: [
        {
          source: "k3mart",
          externalTransactionId: dedupKey,
          periodStart: 1000,
          periodEnd: 2000,
          dataOrigin: "api_revenue",
          confidence: "exact",
          transactionType: "sales",
          quantitySold: 5,
          revenueGross: 80000, // Updated value
        },
      ],
    });
    expect(ids2).toHaveLength(1); // Returns existing ID after update

    // Verify only 1 record in DB (not duplicated)
    const allRevenue = await t.run(async (ctx) => {
      return await ctx.db.query("externalRevenue").collect();
    });
    expect(allRevenue).toHaveLength(1);
    // Verify the value was updated
    expect(allRevenue[0].revenueGross).toBe(80000);
  });

  test("allows different externalTransactionIds from same source", async () => {
    const t = convexTest(schema);

    const ids = await t.mutation(internal.externalData.mutations.saveRevenue, {
      records: [
        {
          source: "k3mart",
          externalTransactionId: "txn-1|OutletA|PROD-001|5|75000",
          periodStart: 1000,
          periodEnd: 2000,
          dataOrigin: "api_revenue",
          confidence: "exact",
          transactionType: "sales",
          quantitySold: 5,
          revenueGross: 75000,
        },
        {
          source: "k3mart",
          externalTransactionId: "txn-2|OutletA|PROD-002|3|45000",
          periodStart: 1000,
          periodEnd: 2000,
          dataOrigin: "api_revenue",
          confidence: "exact",
          transactionType: "sales",
          quantitySold: 3,
          revenueGross: 45000,
        },
      ],
    });
    expect(ids).toHaveLength(2);
  });

  test("stores commission and transactionType fields", async () => {
    const t = convexTest(schema);

    await t.mutation(internal.externalData.mutations.saveRevenue, {
      records: [
        {
          source: "k3mart",
          externalTransactionId: "test-commission|Outlet|PROD|5|75000",
          periodStart: 1000,
          periodEnd: 2000,
          dataOrigin: "api_revenue",
          confidence: "exact",
          transactionType: "sales",
          commission: 26250,
          transactionDate: 1000,
          quantitySold: 5,
          revenueGross: 75000,
          revenueNet: 48750,
        },
      ],
    });

    const records = await t.run(async (ctx) => {
      return await ctx.db.query("externalRevenue").collect();
    });

    expect(records).toHaveLength(1);
    expect(records[0].commission).toBe(26250);
    expect(records[0].transactionType).toBe("sales");
    expect(records[0].transactionDate).toBe(1000);
    expect(records[0].externalTransactionId).toBe("test-commission|Outlet|PROD|5|75000");
  });

  test("handles return transactions with negative values", async () => {
    const t = convexTest(schema);

    await t.mutation(internal.externalData.mutations.saveRevenue, {
      records: [
        {
          source: "k3mart",
          externalTransactionId: "return-txn|Outlet|PROD|-2|-30000",
          periodStart: 1000,
          periodEnd: 2000,
          dataOrigin: "api_revenue",
          confidence: "exact",
          transactionType: "return",
          commission: -10500,
          quantitySold: -2,
          revenueGross: -30000,
          revenueNet: -19500,
        },
      ],
    });

    const records = await t.run(async (ctx) => {
      return await ctx.db.query("externalRevenue").collect();
    });

    expect(records).toHaveLength(1);
    expect(records[0].transactionType).toBe("return");
    expect(records[0].quantitySold).toBe(-2);
    expect(records[0].revenueGross).toBe(-30000);
  });
});

// ============================================
// internalUpsertOutlet Tests - 4 tests
// ============================================
describe("internalUpsertOutlet", () => {
  test("creates a new outlet when none exists", async () => {
    const t = convexTest(schema);

    const outletId = await t.mutation(internal.externalData.mutations.internalUpsertOutlet, {
      source: "k3mart",
      externalId: "48",
      name: "K3 Mart #48",
      isActive: true,
    });

    expect(outletId).toBeDefined();

    const outlet = await t.run(async (ctx) => {
      return await ctx.db.get(outletId);
    });

    expect(outlet).toBeDefined();
    expect(outlet!.source).toBe("k3mart");
    expect(outlet!.externalId).toBe("48");
    expect(outlet!.name).toBe("K3 Mart #48");
    expect(outlet!.isActive).toBe(true);
    expect(outlet!.createdBy).toBe("system");
  });

  test("updates existing outlet instead of creating duplicate", async () => {
    const t = convexTest(schema);

    // Create first
    const id1 = await t.mutation(internal.externalData.mutations.internalUpsertOutlet, {
      source: "k3mart",
      externalId: "48",
      name: "K3 Mart #48",
      isActive: true,
    });

    // Upsert same outlet with new name
    const id2 = await t.mutation(internal.externalData.mutations.internalUpsertOutlet, {
      source: "k3mart",
      externalId: "48",
      name: "K3 Mart Outlet 48 (Updated)",
      isActive: true,
    });

    // Should return same ID
    expect(id1).toBe(id2);

    // Should have only 1 outlet total
    const outlets = await t.run(async (ctx) => {
      return await ctx.db.query("externalOutlets").collect();
    });
    expect(outlets).toHaveLength(1);
    expect(outlets[0].name).toBe("K3 Mart Outlet 48 (Updated)");
  });

  test("creates separate outlets for different externalIds", async () => {
    const t = convexTest(schema);

    await t.mutation(internal.externalData.mutations.internalUpsertOutlet, {
      source: "k3mart",
      externalId: "48",
      name: "K3 Mart #48",
      isActive: true,
    });

    await t.mutation(internal.externalData.mutations.internalUpsertOutlet, {
      source: "k3mart",
      externalId: "72",
      name: "K3 Mart #72",
      isActive: true,
    });

    const outlets = await t.run(async (ctx) => {
      return await ctx.db.query("externalOutlets").collect();
    });
    expect(outlets).toHaveLength(2);
  });

  test("creates separate outlets for different sources", async () => {
    const t = convexTest(schema);

    await t.mutation(internal.externalData.mutations.internalUpsertOutlet, {
      source: "k3mart",
      externalId: "1",
      name: "K3 Mart #1",
      isActive: true,
    });

    await t.mutation(internal.externalData.mutations.internalUpsertOutlet, {
      source: "gobiz",
      externalId: "1",
      name: "GoBiz Store #1",
      isActive: true,
    });

    const outlets = await t.run(async (ctx) => {
      return await ctx.db.query("externalOutlets").collect();
    });
    expect(outlets).toHaveLength(2);
  });
});

// ============================================
// getLatestSyncTimestamp Tests - 4 tests
// ============================================
describe("getLatestSyncTimestamp", () => {
  test("returns null when no sync logs exist", async () => {
    const t = convexTest(schema);

    const result = await t.query(internal.externalData.queries.getLatestSyncTimestamp, {
      source: "k3mart",
    });

    expect(result).toBeNull();
  });

  test("returns null when only error logs exist", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("externalSyncLogs", {
        source: "k3mart",
        syncType: "manual",
        status: "error",
        errorMessage: "Token expired",
        timestamp: 1000,
      });
    });

    const result = await t.query(internal.externalData.queries.getLatestSyncTimestamp, {
      source: "k3mart",
    });

    expect(result).toBeNull();
  });

  test("returns timestamp of most recently created successful sync", async () => {
    const t = convexTest(schema);

    // In production, sync logs are created sequentially, so
    // _creationTime order matches timestamp order.
    // convex-test inserts within same run share creation ordering.
    await t.run(async (ctx) => {
      await ctx.db.insert("externalSyncLogs", {
        source: "k3mart",
        syncType: "manual",
        status: "success",
        timestamp: 1000,
      });
      await ctx.db.insert("externalSyncLogs", {
        source: "k3mart",
        syncType: "manual",
        status: "error",
        errorMessage: "fail",
        timestamp: 2000,
      });
      await ctx.db.insert("externalSyncLogs", {
        source: "k3mart",
        syncType: "manual",
        status: "success",
        timestamp: 3000, // latest created AND latest timestamp
      });
    });

    const result = await t.query(internal.externalData.queries.getLatestSyncTimestamp, {
      source: "k3mart",
    });

    // The most recently created successful log has timestamp 3000
    expect(result).toBe(3000);
  });

  test("returns only for the requested source", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("externalSyncLogs", {
        source: "k3mart",
        syncType: "manual",
        status: "success",
        timestamp: 1000,
      });
      await ctx.db.insert("externalSyncLogs", {
        source: "gobiz",
        syncType: "manual",
        status: "success",
        timestamp: 5000, // higher but different source
      });
    });

    const k3Result = await t.query(internal.externalData.queries.getLatestSyncTimestamp, {
      source: "k3mart",
    });
    const gobizResult = await t.query(internal.externalData.queries.getLatestSyncTimestamp, {
      source: "gobiz",
    });

    expect(k3Result).toBe(1000);
    expect(gobizResult).toBe(5000);
  });
});

// ============================================
// getDashboardSummary Tests - 3 tests
// ============================================
describe("getDashboardSummary", () => {
  test("returns empty summary when no data exists", async () => {
    const t = convexTest(schema);

    const result = await t.query(api.externalData.queries.getDashboardSummary, {});

    expect(result.platforms.k3mart.outletCount).toBe(0);
    expect(result.platforms.k3mart.activeOutlets).toBe(0);
    expect(result.platforms.gobiz.outletCount).toBe(0);
    expect(result.platforms.gobiz.activeOutlets).toBe(0);
    expect(result.recentRevenue.totalGross).toBe(0);
    expect(result.recentRevenue.totalNet).toBe(0);
    expect(result.recentRevenue.totalTransactions).toBe(0);
  });

  test("counts outlets by source and active status", async () => {
    const t = convexTest(schema);

    await t.run(async (ctx) => {
      await ctx.db.insert("externalOutlets", {
        source: "k3mart", externalId: "1", name: "K3 #1", isActive: true,
        createdBy: "test", createdAt: Date.now(),
      });
      await ctx.db.insert("externalOutlets", {
        source: "k3mart", externalId: "2", name: "K3 #2", isActive: false,
        createdBy: "test", createdAt: Date.now(),
      });
      await ctx.db.insert("externalOutlets", {
        source: "gobiz", externalId: "1", name: "GoBiz #1", isActive: true,
        createdBy: "test", createdAt: Date.now(),
      });
    });

    const result = await t.query(api.externalData.queries.getDashboardSummary, {});

    expect(result.platforms.k3mart.outletCount).toBe(2);
    expect(result.platforms.k3mart.activeOutlets).toBe(1);
    expect(result.platforms.gobiz.outletCount).toBe(1);
    expect(result.platforms.gobiz.activeOutlets).toBe(1);
  });

  test("aggregates recent revenue from last 24 hours", async () => {
    const t = convexTest(schema);
    const now = Date.now();

    await t.run(async (ctx) => {
      // Revenue within last 24 hours
      await ctx.db.insert("externalRevenue", {
        source: "k3mart",
        periodStart: now - 3600000, // 1 hour ago
        periodEnd: now,
        dataOrigin: "api_revenue",
        confidence: "exact",
        revenueGross: 100000,
        revenueNet: 65000,
        transactionCount: 5,
      });
      await ctx.db.insert("externalRevenue", {
        source: "gobiz",
        periodStart: now - 7200000, // 2 hours ago
        periodEnd: now,
        dataOrigin: "api_revenue",
        confidence: "exact",
        revenueGross: 200000,
        revenueNet: 180000,
        transactionCount: 10,
      });
      // Revenue older than 24 hours - should NOT be included
      await ctx.db.insert("externalRevenue", {
        source: "k3mart",
        periodStart: now - 48 * 3600000, // 48 hours ago
        periodEnd: now - 47 * 3600000,
        dataOrigin: "stock_delta",
        confidence: "inferred",
        revenueGross: 500000,
        revenueNet: 400000,
        transactionCount: 20,
      });
    });

    const result = await t.query(api.externalData.queries.getDashboardSummary, {});

    expect(result.recentRevenue.totalGross).toBe(300000); // 100k + 200k
    expect(result.recentRevenue.totalNet).toBe(245000); // 65k + 180k
    expect(result.recentRevenue.totalTransactions).toBe(15); // 5 + 10
  });
});

// ============================================
// createSyncLog + updateSyncLog Tests - 3 tests
// ============================================
describe("createSyncLog + updateSyncLog", () => {
  test("creates sync log with started status", async () => {
    const t = convexTest(schema);

    const logId = await t.mutation(internal.externalData.mutations.createSyncLog, {
      source: "k3mart",
      syncType: "manual",
      status: "started",
      triggeredBy: "test",
      timestamp: Date.now(),
    });

    const log = await t.run(async (ctx) => {
      return await ctx.db.get(logId);
    });

    expect(log).toBeDefined();
    expect(log!.source).toBe("k3mart");
    expect(log!.status).toBe("started");
    expect(log!.triggeredBy).toBe("test");
  });

  test("updates sync log status to success with metrics", async () => {
    const t = convexTest(schema);

    const logId = await t.mutation(internal.externalData.mutations.createSyncLog, {
      source: "k3mart",
      syncType: "manual",
      status: "started",
      timestamp: Date.now(),
    });

    await t.mutation(internal.externalData.mutations.updateSyncLog, {
      logId,
      status: "success",
      productsCount: 42,
      durationMs: 1500,
    });

    const log = await t.run(async (ctx) => {
      return await ctx.db.get(logId);
    });

    expect(log!.status).toBe("success");
    expect(log!.productsCount).toBe(42);
    expect(log!.durationMs).toBe(1500);
  });

  test("updates sync log status to error with message", async () => {
    const t = convexTest(schema);

    const logId = await t.mutation(internal.externalData.mutations.createSyncLog, {
      source: "k3mart",
      syncType: "manual",
      status: "started",
      timestamp: Date.now(),
    });

    await t.mutation(internal.externalData.mutations.updateSyncLog, {
      logId,
      status: "error",
      errorMessage: "TOKEN_EXPIRED: K3Mart API token expired",
      durationMs: 200,
    });

    const log = await t.run(async (ctx) => {
      return await ctx.db.get(logId);
    });

    expect(log!.status).toBe("error");
    expect(log!.errorMessage).toContain("TOKEN_EXPIRED");
  });
});

// ============================================
// updateOutletSyncStatus Tests - 2 tests
// ============================================
describe("updateOutletSyncStatus", () => {
  test("updates outlet with success status", async () => {
    const t = convexTest(schema);
    const outletId = await createTestOutlet(t);

    await t.mutation(internal.externalData.mutations.updateOutletSyncStatus, {
      outletId,
      lastSyncAt: Date.now(),
      lastSyncStatus: "success",
    });

    const outlet = await t.run(async (ctx) => {
      return await ctx.db.get(outletId);
    });

    expect(outlet!.lastSyncStatus).toBe("success");
    expect(outlet!.lastSyncAt).toBeDefined();
  });

  test("updates outlet with error status and message", async () => {
    const t = convexTest(schema);
    const outletId = await createTestOutlet(t);

    await t.mutation(internal.externalData.mutations.updateOutletSyncStatus, {
      outletId,
      lastSyncAt: Date.now(),
      lastSyncStatus: "error",
      lastSyncError: "API timeout",
    });

    const outlet = await t.run(async (ctx) => {
      return await ctx.db.get(outletId);
    });

    expect(outlet!.lastSyncStatus).toBe("error");
    expect(outlet!.lastSyncError).toBe("API timeout");
  });
});

// ============================================
// saveRevenueItems Tests - 3 tests
// ============================================
describe("saveRevenueItems", () => {
  test("inserts items for a revenue record", async () => {
    const t = convexTest(schema);
    const revenueId = await createExternalRevenue(t, { source: "gobiz" });

    const ids = await t.mutation(internal.externalData.mutations.saveRevenueItems, {
      revenueId,
      items: [
        {
          externalItemId: "item-1",
          productName: "Frollie Original",
          unitPrice: 25000,
          quantity: 2,
          totalPrice: 50000,
          isAutoMatched: false,
        },
        {
          externalItemId: "item-2",
          productName: "Frollie Bite",
          unitPrice: 15000,
          quantity: 3,
          totalPrice: 45000,
          isAutoMatched: false,
        },
      ],
    });

    expect(ids).toHaveLength(2);

    const items = await t.run(async (ctx) => {
      return await ctx.db.query("externalRevenueItems")
        .withIndex("by_revenue", (q) => q.eq("revenueId", revenueId))
        .collect();
    });

    expect(items).toHaveLength(2);
    expect(items[0].productName).toBe("Frollie Original");
    expect(items[1].productName).toBe("Frollie Bite");
  });

  test("skips duplicate items (same revenueId + externalItemId)", async () => {
    const t = convexTest(schema);
    const revenueId = await createExternalRevenue(t, { source: "gobiz" });

    // Insert first time
    const ids1 = await t.mutation(internal.externalData.mutations.saveRevenueItems, {
      revenueId,
      items: [
        {
          externalItemId: "item-1",
          productName: "Frollie Original",
          unitPrice: 25000,
          quantity: 2,
          totalPrice: 50000,
          isAutoMatched: false,
        },
      ],
    });
    expect(ids1).toHaveLength(1);

    // Insert same item again — should be skipped
    const ids2 = await t.mutation(internal.externalData.mutations.saveRevenueItems, {
      revenueId,
      items: [
        {
          externalItemId: "item-1",
          productName: "Frollie Original",
          unitPrice: 25000,
          quantity: 2,
          totalPrice: 50000,
          isAutoMatched: false,
        },
      ],
    });
    expect(ids2).toHaveLength(0);

    // Verify only 1 item in DB
    const items = await t.run(async (ctx) => {
      return await ctx.db.query("externalRevenueItems")
        .withIndex("by_revenue", (q) => q.eq("revenueId", revenueId))
        .collect();
    });
    expect(items).toHaveLength(1);
  });

  test("handles multiple items per revenue", async () => {
    const t = convexTest(schema);
    const revenueId = await createExternalRevenue(t, { source: "gobiz" });

    const ids = await t.mutation(internal.externalData.mutations.saveRevenueItems, {
      revenueId,
      items: [
        { externalItemId: "1", productName: "Product A", unitPrice: 10000, quantity: 1, totalPrice: 10000, isAutoMatched: false },
        { externalItemId: "2", productName: "Product B", unitPrice: 20000, quantity: 2, totalPrice: 40000, isAutoMatched: false },
        { externalItemId: "3", productName: "Product C", unitPrice: 30000, quantity: 1, totalPrice: 30000, isAutoMatched: false },
      ],
    });

    expect(ids).toHaveLength(3);
  });
});

// ============================================
// autoMatchMenuProduct Tests - 4 tests
// ============================================
describe("autoMatchMenuProduct", () => {
  test("matches by exact price + name (exact confidence)", async () => {
    const t = convexTest(schema);
    await createMenuProduct(t, { name: "Frollie Original", defaultPrice: 25000 });

    const result = await t.mutation(internal.externalData.mutations.autoMatchMenuProduct, {
      productName: "Frollie Original",
      unitPrice: 25000,
      source: "gobiz",
    });

    expect(result.linkedMenuProductId).toBeDefined();
    expect(result.matchConfidence).toBe("exact");
  });

  test("matches by price only (price_only confidence)", async () => {
    const t = convexTest(schema);
    await createMenuProduct(t, { name: "Frollie Original", defaultPrice: 25000 });

    const result = await t.mutation(internal.externalData.mutations.autoMatchMenuProduct, {
      productName: "Different Name",
      unitPrice: 25000,
      source: "gobiz",
    });

    expect(result.linkedMenuProductId).toBeDefined();
    expect(result.matchConfidence).toBe("price_only");
  });

  test("matches by name only (name_only confidence)", async () => {
    const t = convexTest(schema);
    await createMenuProduct(t, { name: "Frollie Original", defaultPrice: 25000 });

    const result = await t.mutation(internal.externalData.mutations.autoMatchMenuProduct, {
      productName: "Frollie Original",
      unitPrice: 30000, // Different price
      source: "gobiz",
    });

    expect(result.linkedMenuProductId).toBeDefined();
    expect(result.matchConfidence).toBe("name_only");
  });

  test("returns none when no match found", async () => {
    const t = convexTest(schema);
    await createMenuProduct(t, { name: "Frollie Original", defaultPrice: 25000 });

    const result = await t.mutation(internal.externalData.mutations.autoMatchMenuProduct, {
      productName: "Completely Different Product",
      unitPrice: 99999,
      source: "gobiz",
    });

    expect(result.linkedMenuProductId).toBeUndefined();
    expect(result.matchConfidence).toBe("none");
  });
});

// ============================================
// getRevenueItems Tests - 2 tests
// ============================================
describe("getRevenueItems", () => {
  test("returns empty array for revenue with no items", async () => {
    const t = convexTest(schema);
    const revenueId = await createExternalRevenue(t, { source: "gobiz" });

    const items = await t.query(api.externalData.queries.getRevenueItems, {
      revenueId,
    });

    expect(items).toHaveLength(0);
  });

  test("returns items enriched with menu product name", async () => {
    const t = convexTest(schema);
    const revenueId = await createExternalRevenue(t, { source: "gobiz" });
    const menuProductId = await createMenuProduct(t, { name: "Frollie Original" });

    await t.mutation(internal.externalData.mutations.saveRevenueItems, {
      revenueId,
      items: [
        {
          externalItemId: "item-1",
          productName: "Frollie Original",
          unitPrice: 25000,
          quantity: 2,
          totalPrice: 50000,
          linkedMenuProductId: menuProductId,
          isAutoMatched: true,
          matchConfidence: "exact",
        },
      ],
    });

    const items = await t.query(api.externalData.queries.getRevenueItems, {
      revenueId,
    });

    expect(items).toHaveLength(1);
    expect(items[0].menuProductName).toBe("Frollie Original");
    expect(items[0].matchConfidence).toBe("exact");
  });
});

// ============================================
// getDashboardSummary commission fields - 1 test
// ============================================
describe("getDashboardSummary commission fields", () => {
  test("includes totalCommission, totalAdBurn, totalPromoBurn", async () => {
    const t = convexTest(schema);
    const now = Date.now();

    await createExternalRevenue(t, {
      source: "gobiz",
      revenueGross: 100000,
      revenueNet: 80000,
      commission: 5000,
      adBurn: 2000,
      promoBurn: 3000,
      periodStart: now - 3600000,
      periodEnd: now,
    });

    await createExternalRevenue(t, {
      source: "k3mart",
      revenueGross: 200000,
      revenueNet: 160000,
      commission: 10000,
      adBurn: 4000,
      promoBurn: 6000,
      periodStart: now - 3600000,
      periodEnd: now,
    });

    const result = await t.query(api.externalData.queries.getDashboardSummary, {});

    expect(result.recentRevenue.totalCommission).toBe(15000); // 5k + 10k
    expect(result.recentRevenue.totalAdBurn).toBe(6000); // 2k + 4k
    expect(result.recentRevenue.totalPromoBurn).toBe(9000); // 3k + 6k
  });
});

// ============================================
// saveDirectToken refresh token - 1 test
// ============================================
describe("saveDirectToken refresh token", () => {
  test("stores refresh token alongside bearer token", async () => {
    const t = convexTest(schema);

    // Create an admin user and session
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Admin",
        pinHash: "salt:hash",
        role: "admin",
        isActive: true,
        failedAttempts: 0,
        createdAt: Date.now(),
      });
    });

    const token = await t.run(async (ctx) => {
      const session = await ctx.db.insert("sessions", {
        userId,
        token: "test-token",
        expiresAt: Date.now() + 3600000,
        createdAt: Date.now(),
      });
      return "test-token";
    });

    const credId = await t.mutation(api.platformCredentials.mutations.saveDirectTokenPublic, {
      token,
      platformId: "gobiz",
      bearerToken: "bearer-abc123",
      refreshToken: "refresh-xyz789",
    });

    const cred = await t.run(async (ctx) => {
      return await ctx.db.get(credId);
    });

    expect(cred!.currentToken).toBe("bearer-abc123");
    expect(cred!.refreshToken).toBe("refresh-xyz789");
  });
});
