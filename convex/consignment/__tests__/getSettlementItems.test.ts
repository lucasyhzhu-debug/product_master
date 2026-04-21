/// <reference types="vite/client" />
/**
 * Phase 74.5.2 Plan 07 — Tests for getSettlementItems query.
 *
 * Covers:
 *  - Admin + manager gate (kitchen/order_staff rejected)
 *  - Enrichment (items joined with linked menuProduct by id)
 *  - Empty-state for pre-74.5.1 settlements (no linkedRevenueId)
 *  - Null menuProduct when item has no linkedMenuProductId
 *  - Nonexistent settlement returns [] (defensive)
 *
 * Pattern: direct-handler invocation via `_getSettlementItemsForTest` and
 * `_getSettlementItemsWithAuthForTest` exports. convex-test's module resolver
 * fails for `t.query(api.consignment.queries.getSettlementItems, ...)` with
 * "Could not find module for: consignment/queries" — the same class of bug
 * hit by `productInventory/*` (Plan 01 / D74.5.2-L1) and worked around via
 * direct-handler invocation there. Same fix applied here.
 */

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../../schema";
import {
  _getSettlementItemsForTest,
  _getSettlementItemsWithAuthForTest,
} from "../queries";

const modules = import.meta.glob("../../**/*.ts");

async function seedUserWithSession(
  t: ReturnType<typeof convexTest>,
  role: "admin" | "manager" | "kitchen" | "order_staff",
  token: string,
): Promise<void> {
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: `Test ${role}`,
      pinHash: "salt:hash",
      role,
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    });
    await ctx.db.insert("sessions", {
      userId,
      token,
      expiresAt: Date.now() + 8 * 3600 * 1000,
      createdAt: Date.now(),
    });
  });
}

describe("getSettlementItems", () => {
  test("kitchen token rejected — admin+manager gate enforced", async () => {
    const t = convexTest(schema, modules);
    await seedUserWithSession(t, "kitchen", "kitchen-token");

    const settlementId = await t.run(async (ctx) => {
      const outletId = await ctx.db.insert("consignmentOutlets", {
        name: "Gate Test Outlet",
        revSharePercent: 20,
        type: "retail",
        isActive: true,
        createdBy: "test",
        createdAt: Date.now(),
      });
      return await ctx.db.insert("consignmentSettlements", {
        outletId,
        periodStart: Date.now() - 86400000,
        periodEnd: Date.now(),
        totalRevenue: 0,
        revSharePercent: 20,
        revShareAmount: 0,
        frolliePayment: 0,
        status: "pending",
        createdBy: "test",
        createdAt: Date.now(),
      });
    });

    await expect(
      t.run((ctx) =>
        _getSettlementItemsWithAuthForTest(ctx, settlementId, "kitchen-token"),
      ),
    ).rejects.toThrow();
  });

  test("order_staff token rejected — admin+manager gate enforced", async () => {
    const t = convexTest(schema, modules);
    await seedUserWithSession(t, "order_staff", "staff-token");

    const settlementId = await t.run(async (ctx) => {
      const outletId = await ctx.db.insert("consignmentOutlets", {
        name: "Gate Test Outlet 2",
        revSharePercent: 15,
        type: "cafe",
        isActive: true,
        createdBy: "test",
        createdAt: Date.now(),
      });
      return await ctx.db.insert("consignmentSettlements", {
        outletId,
        periodStart: Date.now() - 86400000,
        periodEnd: Date.now(),
        totalRevenue: 0,
        revSharePercent: 15,
        revShareAmount: 0,
        frolliePayment: 0,
        status: "pending",
        createdBy: "test",
        createdAt: Date.now(),
      });
    });

    await expect(
      t.run((ctx) =>
        _getSettlementItemsWithAuthForTest(ctx, settlementId, "staff-token"),
      ),
    ).rejects.toThrow();
  });

  test("manager allowed; items returned enriched with menuProduct", async () => {
    const t = convexTest(schema, modules);
    await seedUserWithSession(t, "manager", "mgr-token");

    const settlementId = await t.run(async (ctx) => {
      const outletId = await ctx.db.insert("consignmentOutlets", {
        name: "Enrich Outlet",
        revSharePercent: 20,
        type: "retail",
        isActive: true,
        createdBy: "test",
        createdAt: Date.now(),
      });
      const menuProductId = await ctx.db.insert("menuProducts", {
        code: "WIDGET",
        name: "Widget",
        grams: 80,
        defaultPrice: 25000,
        isActive: true,
        unitCost: 5000,
        cachedProductionSummary: "1 Big",
      });
      const NOW = Date.now();
      const revenueId = await ctx.db.insert("externalRevenue", {
        source: "consignment",
        externalTransactionId: "settle-1",
        transactionDate: NOW,
        periodStart: NOW,
        periodEnd: NOW,
        dataOrigin: "manual_entry",
        confidence: "manual",
        revenueGross: 50000,
      });
      await ctx.db.insert("externalRevenueItems", {
        revenueId,
        source: "consignment",
        productName: "Widget",
        quantity: 2,
        unitPrice: 25000,
        totalPrice: 50000,
        isAutoMatched: true,
        linkedMenuProductId: menuProductId,
        createdAt: Date.now(),
      });
      return await ctx.db.insert("consignmentSettlements", {
        outletId,
        periodStart: NOW - 86400000,
        periodEnd: NOW,
        totalRevenue: 50000,
        revSharePercent: 20,
        revShareAmount: 10000,
        frolliePayment: 40000,
        status: "pending",
        linkedRevenueId: revenueId,
        createdBy: "test",
        createdAt: Date.now(),
      });
    });

    const items = await t.run((ctx) =>
      _getSettlementItemsWithAuthForTest(ctx, settlementId, "mgr-token"),
    );
    expect(items.length).toBe(1);
    expect(items[0].productName).toBe("Widget");
    expect(items[0].menuProduct).not.toBeNull();
    expect(items[0].menuProduct?.name).toBe("Widget");
    expect(items[0].quantity).toBe(2);
    expect(items[0].unitPrice).toBe(25000);
    expect(items[0].totalPrice).toBe(50000);
  });

  test("admin allowed; item without linkedMenuProductId has menuProduct=null", async () => {
    const t = convexTest(schema, modules);
    await seedUserWithSession(t, "admin", "admin-token");

    const settlementId = await t.run(async (ctx) => {
      const outletId = await ctx.db.insert("consignmentOutlets", {
        name: "Unmapped Outlet",
        revSharePercent: 25,
        type: "event",
        isActive: true,
        createdBy: "test",
        createdAt: Date.now(),
      });
      const NOW = Date.now();
      const revenueId = await ctx.db.insert("externalRevenue", {
        source: "consignment",
        externalTransactionId: "settle-unmapped",
        transactionDate: NOW,
        periodStart: NOW,
        periodEnd: NOW,
        dataOrigin: "manual_entry",
        confidence: "manual",
        revenueGross: 12000,
      });
      await ctx.db.insert("externalRevenueItems", {
        revenueId,
        source: "consignment",
        productName: "Unknown SKU",
        quantity: 1,
        unitPrice: 12000,
        totalPrice: 12000,
        isAutoMatched: false,
        // linkedMenuProductId intentionally omitted
        createdAt: Date.now(),
      });
      return await ctx.db.insert("consignmentSettlements", {
        outletId,
        periodStart: NOW - 86400000,
        periodEnd: NOW,
        totalRevenue: 12000,
        revSharePercent: 25,
        revShareAmount: 3000,
        frolliePayment: 9000,
        status: "pending",
        linkedRevenueId: revenueId,
        createdBy: "test",
        createdAt: Date.now(),
      });
    });

    const items = await t.run((ctx) =>
      _getSettlementItemsWithAuthForTest(ctx, settlementId, "admin-token"),
    );
    expect(items.length).toBe(1);
    expect(items[0].productName).toBe("Unknown SKU");
    expect(items[0].menuProduct).toBeNull();
  });

  test("pre-74.5.1 settlement (no linkedRevenueId) returns empty array", async () => {
    const t = convexTest(schema, modules);
    await seedUserWithSession(t, "admin", "admin-token");

    const settlementId = await t.run(async (ctx) => {
      const outletId = await ctx.db.insert("consignmentOutlets", {
        name: "Legacy Outlet",
        revSharePercent: 15,
        type: "retail",
        isActive: true,
        createdBy: "test",
        createdAt: Date.now(),
      });
      return await ctx.db.insert("consignmentSettlements", {
        outletId,
        periodStart: Date.now() - 86400000,
        periodEnd: Date.now(),
        totalRevenue: 10000,
        revSharePercent: 15,
        revShareAmount: 1500,
        frolliePayment: 8500,
        status: "pending",
        // linkedRevenueId intentionally undefined (legacy pre-74.5.1)
        createdBy: "test",
        createdAt: Date.now(),
      });
    });

    const items = await t.run((ctx) =>
      _getSettlementItemsWithAuthForTest(ctx, settlementId, "admin-token"),
    );
    expect(items).toEqual([]);
  });

  test("nonexistent settlementId returns empty array (defensive)", async () => {
    const t = convexTest(schema, modules);
    await seedUserWithSession(t, "admin", "admin-token");

    // Insert + delete to obtain a valid-shape-but-dead id.
    const deadId = await t.run(async (ctx) => {
      const outletId = await ctx.db.insert("consignmentOutlets", {
        name: "Doomed",
        revSharePercent: 10,
        type: "event",
        isActive: true,
        createdBy: "test",
        createdAt: Date.now(),
      });
      const id = await ctx.db.insert("consignmentSettlements", {
        outletId,
        periodStart: Date.now() - 86400000,
        periodEnd: Date.now(),
        totalRevenue: 0,
        revSharePercent: 10,
        revShareAmount: 0,
        frolliePayment: 0,
        status: "pending",
        createdBy: "test",
        createdAt: Date.now(),
      });
      await ctx.db.delete(id);
      return id;
    });

    const items = await t.run((ctx) =>
      _getSettlementItemsWithAuthForTest(ctx, deadId, "admin-token"),
    );
    expect(items).toEqual([]);
  });

  test("core handler (bypassing auth) still empty for no-linkedRevenueId", async () => {
    const t = convexTest(schema, modules);
    const settlementId = await t.run(async (ctx) => {
      const outletId = await ctx.db.insert("consignmentOutlets", {
        name: "Bypass Outlet",
        revSharePercent: 10,
        type: "retail",
        isActive: true,
        createdBy: "test",
        createdAt: Date.now(),
      });
      return await ctx.db.insert("consignmentSettlements", {
        outletId,
        periodStart: Date.now() - 86400000,
        periodEnd: Date.now(),
        totalRevenue: 0,
        revSharePercent: 10,
        revShareAmount: 0,
        frolliePayment: 0,
        status: "pending",
        createdBy: "test",
        createdAt: Date.now(),
      });
    });

    // Direct-handler variant does not require a session token; verifies the
    // "no linkedRevenueId" branch in isolation.
    const items = await t.run((ctx) =>
      _getSettlementItemsForTest(ctx, settlementId),
    );
    expect(items).toEqual([]);
  });
});
