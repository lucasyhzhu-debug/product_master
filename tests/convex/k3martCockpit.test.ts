/**
 * K3 Mart Cockpit Integration Tests
 *
 * Tests for queries (6) and mutations (7) of the K3 Mart Cockpit backend.
 * Uses convex-test for in-memory Convex environment.
 */

import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { internal, api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import type { Id } from "../../convex/_generated/dataModel";
import {
  createK3MartOutlet,
  createStockSnapshot,
  createK3MartRevenue,
  createDispatchPlan,
  createAdminSession,
  createManagerSession,
  createKitchenSession,
  createProductionCount,
  createDepotStock,
  createProductMapping,
  createMenuProduct,
} from "../fixtures/k3martCockpit";

// ============================================
// saveWeeklyDispatchPlan - 4 tests
// ============================================
describe("K3 Mart Cockpit - saveWeeklyDispatchPlan", () => {
  test("inserts new draft plans for a week", async () => {
    const t = convexTest(schema);
    const outlet = await createK3MartOutlet(t);
    const menuProduct = await createMenuProduct(t, { name: "Product A" });
    const token = await createAdminSession(t);

    const result = await t.mutation(api.k3martCockpit.mutations.saveWeeklyDispatchPlan, {
      token,
      plans: [
        {
          date: "2026-02-17",
          outletId: outlet,
          menuProductId: menuProduct,
          externalProductId: "47068",
          suggestedQty: 10,
          plannedQty: 12,
          isStockOut: false,
        },
        {
          date: "2026-02-18",
          outletId: outlet,
          menuProductId: menuProduct,
          externalProductId: "47068",
          suggestedQty: 8,
          plannedQty: 10,
          isStockOut: false,
        },
      ],
    });

    expect(result.upsertedCount).toBe(2);

    const plans = await t.run(async (ctx) => {
      return await ctx.db.query("k3martDispatchPlans").collect();
    });

    expect(plans).toHaveLength(2);
    expect(plans[0].status).toBe("draft");
    expect(plans[1].status).toBe("draft");
  });

  test("upserts existing plans", async () => {
    const t = convexTest(schema);
    const outlet = await createK3MartOutlet(t);
    const menuProduct = await createMenuProduct(t, { name: "Product B" });
    const token = await createAdminSession(t);

    // Insert initial plan via fixture
    await createDispatchPlan(t, {
      date: "2026-02-17",
      outletId: outlet,
      menuProductId: menuProduct,
      externalProductId: "47068",
      plannedQty: 5,
      isStockOut: false,
    });

    // Upsert via mutation
    await t.mutation(api.k3martCockpit.mutations.saveWeeklyDispatchPlan, {
      token,
      plans: [
        {
          date: "2026-02-17",
          outletId: outlet,
          menuProductId: menuProduct,
          externalProductId: "47068",
          suggestedQty: 10,
          plannedQty: 15,
          isStockOut: false,
        },
      ],
    });

    const plans = await t.run(async (ctx) => {
      return await ctx.db.query("k3martDispatchPlans").collect();
    });

    expect(plans).toHaveLength(1);
    expect(plans[0].plannedQty).toBe(15);
  });

  test("rejects negative quantity", async () => {
    const t = convexTest(schema);
    const outlet = await createK3MartOutlet(t);
    const menuProduct = await createMenuProduct(t, { name: "Product C" });
    const token = await createAdminSession(t);

    await expect(
      t.mutation(api.k3martCockpit.mutations.saveWeeklyDispatchPlan, {
        token,
        plans: [
          {
            date: "2026-02-17",
            outletId: outlet,
            menuProductId: menuProduct,
            externalProductId: "47068",
            suggestedQty: 10,
            plannedQty: -5,
            isStockOut: false,
          },
        ],
      })
    ).rejects.toThrow("Quantity cannot be negative");
  });

  test("rejects kitchen role", async () => {
    const t = convexTest(schema);
    const outlet = await createK3MartOutlet(t);
    const menuProduct = await createMenuProduct(t, { name: "Product D" });
    const token = await createKitchenSession(t);

    await expect(
      t.mutation(api.k3martCockpit.mutations.saveWeeklyDispatchPlan, {
        token,
        plans: [
          {
            date: "2026-02-17",
            outletId: outlet,
            menuProductId: menuProduct,
            externalProductId: "47068",
            suggestedQty: 10,
            plannedQty: 10,
            isStockOut: false,
          },
        ],
      })
    ).rejects.toThrow();
  });
});

// ============================================
// confirmDayPlan - 4 tests
// ============================================
describe("K3 Mart Cockpit - confirmDayPlan", () => {
  test("confirms all drafts for a date", async () => {
    const t = convexTest(schema);
    const outlet = await createK3MartOutlet(t);
    const mp1 = await createMenuProduct(t, { name: "Product E" });
    const mp2 = await createMenuProduct(t, { name: "Product F" });
    const mp3 = await createMenuProduct(t, { name: "Product G" });
    const token = await createAdminSession(t);

    await createDispatchPlan(t, { date: "2026-02-17", outletId: outlet, menuProductId: mp1, plannedQty: 5 });
    await createDispatchPlan(t, { date: "2026-02-17", outletId: outlet, menuProductId: mp2, plannedQty: 8 });
    await createDispatchPlan(t, { date: "2026-02-17", outletId: outlet, menuProductId: mp3, plannedQty: 3 });

    const result = await t.mutation(api.k3martCockpit.mutations.confirmDayPlan, {
      token,
      date: "2026-02-17",
    });

    expect(result.confirmedCount).toBe(3);

    const plans = await t.run(async (ctx) => {
      return await ctx.db
        .query("k3martDispatchPlans")
        .withIndex("by_date_status", (q) => q.eq("date", "2026-02-17").eq("status", "confirmed"))
        .collect();
    });
    expect(plans).toHaveLength(3);
  });

  test("returns kitchen deltas", async () => {
    const t = convexTest(schema);
    const outlet = await createK3MartOutlet(t);
    const menuProduct = await createMenuProduct(t, { name: "Product H" });
    const token = await createManagerSession(t);

    // Stock-in plan: kitchen needs to produce these
    await createDispatchPlan(t, {
      date: "2026-02-17",
      outletId: outlet,
      menuProductId: menuProduct,
      plannedQty: 10,
      isStockOut: false,
    });

    const result = await t.mutation(api.k3martCockpit.mutations.confirmDayPlan, {
      token,
      date: "2026-02-17",
    });

    expect(result.kitchenDeltas).toBeDefined();
    expect(result.kitchenDeltas.length).toBeGreaterThan(0);
    const delta = result.kitchenDeltas[0];
    expect(delta.apiStockInQty).toBe(10);
    expect(delta.kitchenOrderQty).toBe(10);
  });

  test("throws if no drafts", async () => {
    const t = convexTest(schema);
    const token = await createAdminSession(t);

    await expect(
      t.mutation(api.k3martCockpit.mutations.confirmDayPlan, {
        token,
        date: "2026-02-17",
      })
    ).rejects.toThrow("No draft plans found");
  });

  test("ignores already confirmed plans", async () => {
    const t = convexTest(schema);
    const outlet = await createK3MartOutlet(t);
    const mp1 = await createMenuProduct(t, { name: "Product I" });
    const mp2 = await createMenuProduct(t, { name: "Product J" });
    const token = await createAdminSession(t);

    await createDispatchPlan(t, {
      date: "2026-02-17",
      outletId: outlet,
      menuProductId: mp1,
      plannedQty: 5,
      status: "confirmed",
    });
    await createDispatchPlan(t, {
      date: "2026-02-17",
      outletId: outlet,
      menuProductId: mp2,
      plannedQty: 8,
      status: "draft",
    });

    const result = await t.mutation(api.k3martCockpit.mutations.confirmDayPlan, {
      token,
      date: "2026-02-17",
    });

    expect(result.confirmedCount).toBe(1);
  });
});

// ============================================
// processStockOutDestination - 5 tests
// ============================================
describe("K3 Mart Cockpit - processStockOutDestination", () => {
  test("routes to office - writes productionLog sticker entry", async () => {
    const t = convexTest(schema);
    const outlet = await createK3MartOutlet(t);
    const menuProduct = await createMenuProduct(t, { name: "Product K" });
    const token = await createAdminSession(t);

    const movementId = await t.run(async (ctx) => {
      return await ctx.db.insert("k3martStockMovements", {
        date: "2026-02-17",
        outletId: outlet,
        direction: "stock_out",
        menuProductId: menuProduct,
        externalProductId: "47068",
        quantity: 10,
        priceAtSubmission: 50000,
        currentStockAtSubmission: 20,
        attemptCount: 1,
        submittedBy: "admin",
        submittedAt: Date.now(),
      });
    });

    await t.mutation(api.k3martCockpit.mutations.processStockOutDestination, {
      token,
      movementId,
      destination: "office",
      quantity: 3,
    });

    // Phase 11: production counts are now derived from productionLog aggregation
    const logs = await t.run(async (ctx) => {
      return await ctx.db
        .query("productionLog")
        .filter((q) => q.eq(q.field("menuProductId"), menuProduct))
        .collect();
    });
    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe("sticker");
    expect(logs[0].quantity).toBe(3);
    expect(logs[0].note).toBe("k3mart-stock-out:office");
  });

  test("routes to goldfinch - increments depot stock", async () => {
    const t = convexTest(schema);
    const outlet = await createK3MartOutlet(t);
    const menuProduct = await createMenuProduct(t, { name: "Product L" });
    const token = await createAdminSession(t);

    const depotId = await createDepotStock(t, {
      menuProductId: menuProduct,
      quantity: 10,
    });

    const movementId = await t.run(async (ctx) => {
      return await ctx.db.insert("k3martStockMovements", {
        date: "2026-02-17",
        outletId: outlet,
        direction: "stock_out",
        menuProductId: menuProduct,
        externalProductId: "47068",
        quantity: 8,
        priceAtSubmission: 50000,
        currentStockAtSubmission: 15,
        attemptCount: 1,
        submittedBy: "admin",
        submittedAt: Date.now(),
      });
    });

    await t.mutation(api.k3martCockpit.mutations.processStockOutDestination, {
      token,
      movementId,
      destination: "goldfinch",
      quantity: 5,
    });

    const updatedStock = await t.run(async (ctx) => ctx.db.get(depotId));
    expect(updatedStock?.quantity).toBe(15);
  });

  test("routes to outlet - creates draft dispatch plan", async () => {
    const t = convexTest(schema);
    const sourceOutlet = await createK3MartOutlet(t, { name: "Source Outlet" });
    const destOutlet = await createK3MartOutlet(t, { externalId: "99", name: "Dest Outlet" });
    const menuProduct = await createMenuProduct(t, { name: "Product M" });
    const token = await createAdminSession(t);

    const movementId = await t.run(async (ctx) => {
      return await ctx.db.insert("k3martStockMovements", {
        date: "2026-02-17",
        outletId: sourceOutlet,
        direction: "stock_out",
        menuProductId: menuProduct,
        externalProductId: "47068",
        quantity: 7,
        priceAtSubmission: 50000,
        currentStockAtSubmission: 20,
        attemptCount: 1,
        submittedBy: "admin",
        submittedAt: Date.now(),
      });
    });

    await t.mutation(api.k3martCockpit.mutations.processStockOutDestination, {
      token,
      movementId,
      destination: "outlet",
      destinationOutletId: destOutlet,
      quantity: 4,
    });

    const plans = await t.run(async (ctx) => {
      return await ctx.db.query("k3martDispatchPlans").collect();
    });

    expect(plans).toHaveLength(1);
    expect(plans[0].status).toBe("draft");
    expect(plans[0].plannedQty).toBe(4);
    expect(plans[0].source).toBe("outlet");
    expect(plans[0].sourceOutletId).toBe(sourceOutlet);
  });

  test("rejects quantity <= 0", async () => {
    const t = convexTest(schema);
    const outlet = await createK3MartOutlet(t);
    const menuProduct = await createMenuProduct(t, { name: "Product N" });
    const token = await createAdminSession(t);

    const movementId = await t.run(async (ctx) => {
      return await ctx.db.insert("k3martStockMovements", {
        date: "2026-02-17",
        outletId: outlet,
        direction: "stock_out",
        menuProductId: menuProduct,
        externalProductId: "47068",
        quantity: 10,
        priceAtSubmission: 50000,
        currentStockAtSubmission: 20,
        attemptCount: 1,
        submittedBy: "admin",
        submittedAt: Date.now(),
      });
    });

    await expect(
      t.mutation(api.k3martCockpit.mutations.processStockOutDestination, {
        token,
        movementId,
        destination: "office",
        quantity: 0,
      })
    ).rejects.toThrow();
  });

  test("rejects outlet without destination outlet", async () => {
    const t = convexTest(schema);
    const outlet = await createK3MartOutlet(t);
    const menuProduct = await createMenuProduct(t, { name: "Product O" });
    const token = await createAdminSession(t);

    const movementId = await t.run(async (ctx) => {
      return await ctx.db.insert("k3martStockMovements", {
        date: "2026-02-17",
        outletId: outlet,
        direction: "stock_out",
        menuProductId: menuProduct,
        externalProductId: "47068",
        quantity: 10,
        priceAtSubmission: 50000,
        currentStockAtSubmission: 20,
        attemptCount: 1,
        submittedBy: "admin",
        submittedAt: Date.now(),
      });
    });

    await expect(
      t.mutation(api.k3martCockpit.mutations.processStockOutDestination, {
        token,
        movementId,
        destination: "outlet",
        quantity: 5,
      })
    ).rejects.toThrow("Destination outlet required");
  });
});

// ============================================
// toggleOutletActive - 2 tests
// ============================================
describe("K3 Mart Cockpit - toggleOutletActive", () => {
  test("admin can deactivate outlet", async () => {
    const t = convexTest(schema);
    const outlet = await createK3MartOutlet(t, { isActive: true });
    const token = await createAdminSession(t);

    await t.mutation(api.k3martCockpit.mutations.toggleOutletActive, {
      token,
      outletId: outlet,
      isActive: false,
    });

    const updated = await t.run(async (ctx) => ctx.db.get(outlet));
    expect(updated?.isActive).toBe(false);
  });

  test("manager cannot toggle", async () => {
    const t = convexTest(schema);
    const outlet = await createK3MartOutlet(t);
    const token = await createManagerSession(t);

    await expect(
      t.mutation(api.k3martCockpit.mutations.toggleOutletActive, {
        token,
        outletId: outlet,
        isActive: false,
      })
    ).rejects.toThrow();
  });
});

// ============================================
// Internal mutations - 3 tests
// ============================================
describe("K3 Mart Cockpit - Internal mutations", () => {
  test("updateDispatchPlanStatus updates status and k3mart fields", async () => {
    const t = convexTest(schema);
    const outlet = await createK3MartOutlet(t);
    const menuProduct = await createMenuProduct(t, { name: "Product P" });

    const planId = await createDispatchPlan(t, {
      date: "2026-02-17",
      outletId: outlet,
      menuProductId: menuProduct,
      plannedQty: 10,
      status: "confirmed",
    });

    const now = Date.now();
    await t.mutation(internal.k3martCockpit.mutations.updateDispatchPlanStatus, {
      planId,
      status: "submitted",
      k3martRequestId: 12345,
      submittedAt: now,
      submittedBy: "admin",
    });

    const updated = await t.run(async (ctx) => ctx.db.get(planId));
    expect(updated?.status).toBe("submitted");
    expect(updated?.k3martRequestId).toBe(12345);
    expect(updated?.submittedAt).toBe(now);
    expect(updated?.submittedBy).toBe("admin");
  });

  test("recordStockMovement creates movement with all fields", async () => {
    const t = convexTest(schema);
    const outlet = await createK3MartOutlet(t);
    const menuProduct = await createMenuProduct(t, { name: "Product Q" });

    await t.mutation(internal.k3martCockpit.mutations.recordStockMovement, {
      date: "2026-02-17",
      outletId: outlet,
      direction: "stock_in",
      menuProductId: menuProduct,
      externalProductId: "47068",
      quantity: 15,
      priceAtSubmission: 50000,
      currentStockAtSubmission: 10,
      source: "kitchen",
      k3martRequestId: 67890,
      k3martStatus: "pending",
      note: "Test movement",
      submittedBy: "admin",
    });

    const movements = await t.run(async (ctx) => {
      return await ctx.db.query("k3martStockMovements").collect();
    });

    expect(movements).toHaveLength(1);
    expect(movements[0].direction).toBe("stock_in");
    expect(movements[0].quantity).toBe(15);
    expect(movements[0].source).toBe("kitchen");
    expect(movements[0].k3martRequestId).toBe(67890);
    expect(movements[0].k3martStatus).toBe("pending");
    expect(movements[0].attemptCount).toBe(1);
    expect(movements[0].note).toBe("Test movement");
  });

  test("updateMovementStatus updates status and attempt count", async () => {
    const t = convexTest(schema);
    const outlet = await createK3MartOutlet(t);
    const menuProduct = await createMenuProduct(t, { name: "Product R" });

    const movementId = await t.run(async (ctx) => {
      return await ctx.db.insert("k3martStockMovements", {
        date: "2026-02-17",
        outletId: outlet,
        direction: "stock_in",
        menuProductId: menuProduct,
        externalProductId: "47068",
        quantity: 8,
        priceAtSubmission: 50000,
        currentStockAtSubmission: 5,
        k3martStatus: "pending",
        attemptCount: 1,
        submittedBy: "admin",
        submittedAt: Date.now(),
      });
    });

    await t.mutation(internal.k3martCockpit.mutations.updateMovementStatus, {
      movementId,
      k3martStatus: "approved",
      attemptCount: 2,
    });

    const updated = await t.run(async (ctx) => ctx.db.get(movementId));
    expect(updated?.k3martStatus).toBe("approved");
    expect(updated?.attemptCount).toBe(2);
  });
});

// ============================================
// getOutletStockSummary - 2 tests
// ============================================
describe("K3 Mart Cockpit - getOutletStockSummary", () => {
  test("returns active outlets with stock data", async () => {
    const t = convexTest(schema);
    const activeOutlet = await createK3MartOutlet(t, { name: "Active Outlet", isActive: true });
    await createK3MartOutlet(t, { externalId: "99", name: "Inactive Outlet", isActive: false });

    await createStockSnapshot(t, {
      outletId: activeOutlet,
      quantity: 10,
    });

    const result = await t.query(api.k3martCockpit.queries.getOutletStockSummary, {
      date: "2026-02-17",
    });

    expect(result.outlets.length).toBe(1);
    expect(result.outlets[0].name).toBe("Active Outlet");
    expect(result.outlets[0].products.length).toBeGreaterThan(0);
  });

  test("returns empty array when no K3 Mart outlets", async () => {
    const t = convexTest(schema);

    const result = await t.query(api.k3martCockpit.queries.getOutletStockSummary, {
      date: "2026-02-17",
    });

    expect(result.outlets).toEqual([]);
  });
});

// ============================================
// getWeeklyDispatchPlans - 2 tests
// ============================================
describe("K3 Mart Cockpit - getWeeklyDispatchPlans", () => {
  test("returns plans and targets for a week", async () => {
    const t = convexTest(schema);
    const outlet = await createK3MartOutlet(t);
    const menuProduct = await createMenuProduct(t, { name: "Product U" });

    await createDispatchPlan(t, {
      date: "2026-02-17",
      weekNumber: "2026-W07",
      outletId: outlet,
      menuProductId: menuProduct,
      plannedQty: 10,
    });
    await createDispatchPlan(t, {
      date: "2026-02-18",
      weekNumber: "2026-W07",
      outletId: outlet,
      menuProductId: menuProduct,
      plannedQty: 12,
    });

    const result = await t.query(api.k3martCockpit.queries.getWeeklyDispatchPlans, {
      weekNumber: "2026-W07",
    });

    expect(result.plans.length).toBeGreaterThanOrEqual(2);
  });

  test("returns empty when no plans for week", async () => {
    const t = convexTest(schema);

    const result = await t.query(api.k3martCockpit.queries.getWeeklyDispatchPlans, {
      weekNumber: "2026-W99",
    });

    expect(result.plans).toEqual([]);
  });
});

// ============================================
// getProductionReadiness - 2 tests
// ============================================
describe("K3 Mart Cockpit - getProductionReadiness", () => {
  test("calculates deficit correctly", async () => {
    const t = convexTest(schema);
    const outlet = await createK3MartOutlet(t);
    const menuProduct = await createMenuProduct(t, { name: "Product V" });

    // Phase 11: production counts derived from productionLog aggregation
    await t.run(async (ctx) => {
      await ctx.db.insert("productionLog", {
        menuProductId: menuProduct,
        action: "sticker",
        quantity: 5,
        timestamp: Date.now(),
        performedBy: "test",
        note: "test-setup",
      });
    });

    // Today: confirmed plan for 8 stock-in
    await createDispatchPlan(t, {
      date: "2026-02-17",
      outletId: outlet,
      menuProductId: menuProduct,
      plannedQty: 8,
      status: "confirmed",
      isStockOut: false,
    });

    // Tomorrow: confirmed plan for 3 stock-in
    await createDispatchPlan(t, {
      date: "2026-02-18",
      outletId: outlet,
      menuProductId: menuProduct,
      plannedQty: 3,
      status: "confirmed",
      isStockOut: false,
    });

    const result = await t.query(api.k3martCockpit.queries.getProductionReadiness, {
      date: "2026-02-17",
    });

    const productReadiness = result.products.find(
      (r: any) => r.menuProductId === menuProduct
    );
    expect(productReadiness).toBeDefined();
    expect(productReadiness?.stickered).toBe(5);
    // deficit = max(0, plannedToday + plannedTomorrow - stickered) = max(0, 8 + 3 - 5) = 6
    expect(productReadiness?.deficit).toBe(6);
  });

  test("returns empty when no data", async () => {
    const t = convexTest(schema);

    const result = await t.query(api.k3martCockpit.queries.getProductionReadiness, {
      date: "2026-02-17",
    });

    expect(result.products).toEqual([]);
  });
});

// ============================================
// getInventorySources - 1 test
// ============================================
describe("K3 Mart Cockpit - getInventorySources", () => {
  test("returns office and goldfinch stock", async () => {
    const t = convexTest(schema);
    const mp1 = await createMenuProduct(t, { name: "Product W" });
    const mp2 = await createMenuProduct(t, { name: "Product X" });

    // Office stock (production counts)
    await createProductionCount(t, { menuProductId: mp1, stickered: 10 });
    await createProductionCount(t, { menuProductId: mp2, stickered: 5 });

    // Goldfinch stock (depot)
    await createDepotStock(t, { menuProductId: mp1, quantity: 8 });

    const result = await t.query(api.k3martCockpit.queries.getInventorySources, {});

    expect(result.office.length).toBe(2);
    expect(result.goldfinch.length).toBe(1);
  });
});

// ============================================
// getStockMovementHistory - 4 tests
// ============================================
describe("K3 Mart Cockpit - getStockMovementHistory", () => {
  test("returns movements filtered by outlet", async () => {
    const t = convexTest(schema);
    const outlet1 = await createK3MartOutlet(t, { name: "Outlet 1" });
    const outlet2 = await createK3MartOutlet(t, { externalId: "99", name: "Outlet 2" });
    const menuProduct = await createMenuProduct(t, { name: "Product Y" });

    await t.run(async (ctx) => {
      await ctx.db.insert("k3martStockMovements", {
        date: "2026-02-17",
        outletId: outlet1,
        direction: "stock_in",
        menuProductId: menuProduct,
        externalProductId: "47068",
        quantity: 10,
        priceAtSubmission: 50000,
        currentStockAtSubmission: 5,
        attemptCount: 1,
        submittedBy: "admin",
        submittedAt: Date.now(),
      });
      await ctx.db.insert("k3martStockMovements", {
        date: "2026-02-17",
        outletId: outlet2,
        direction: "stock_in",
        menuProductId: menuProduct,
        externalProductId: "47068",
        quantity: 8,
        priceAtSubmission: 50000,
        currentStockAtSubmission: 3,
        attemptCount: 1,
        submittedBy: "admin",
        submittedAt: Date.now(),
      });
    });

    const result = await t.query(api.k3martCockpit.queries.getStockMovementHistory, {
      outletId: outlet1,
    });

    expect(result.length).toBe(1);
    expect(result[0].outletId).toBe(outlet1);
  });

  test("returns movements filtered by date", async () => {
    const t = convexTest(schema);
    const outlet = await createK3MartOutlet(t);
    const menuProduct = await createMenuProduct(t, { name: "Product Z" });

    await t.run(async (ctx) => {
      await ctx.db.insert("k3martStockMovements", {
        date: "2026-02-17",
        outletId: outlet,
        direction: "stock_in",
        menuProductId: menuProduct,
        externalProductId: "47068",
        quantity: 10,
        priceAtSubmission: 50000,
        currentStockAtSubmission: 5,
        attemptCount: 1,
        submittedBy: "admin",
        submittedAt: Date.now(),
      });
      await ctx.db.insert("k3martStockMovements", {
        date: "2026-02-18",
        outletId: outlet,
        direction: "stock_in",
        menuProductId: menuProduct,
        externalProductId: "47068",
        quantity: 8,
        priceAtSubmission: 50000,
        currentStockAtSubmission: 3,
        attemptCount: 1,
        submittedBy: "admin",
        submittedAt: Date.now(),
      });
    });

    const result = await t.query(api.k3martCockpit.queries.getStockMovementHistory, {
      date: "2026-02-17",
    });

    expect(result.length).toBe(1);
    expect(result[0].date).toBe("2026-02-17");
  });

  test("returns all movements with no filters", async () => {
    const t = convexTest(schema);
    const outlet = await createK3MartOutlet(t);
    const menuProduct = await createMenuProduct(t, { name: "Product AA" });

    await t.run(async (ctx) => {
      for (let i = 0; i < 3; i++) {
        await ctx.db.insert("k3martStockMovements", {
          date: "2026-02-17",
          outletId: outlet,
          direction: "stock_in",
          menuProductId: menuProduct,
          externalProductId: "47068",
          quantity: 10 + i,
          priceAtSubmission: 50000,
          currentStockAtSubmission: 5,
          attemptCount: 1,
          submittedBy: "admin",
          submittedAt: Date.now(),
        });
      }
    });

    const result = await t.query(api.k3martCockpit.queries.getStockMovementHistory, {});

    expect(result.length).toBe(3);
  });

  test("respects limit parameter", async () => {
    const t = convexTest(schema);
    const outlet = await createK3MartOutlet(t);
    const menuProduct = await createMenuProduct(t, { name: "Product AB" });

    await t.run(async (ctx) => {
      for (let i = 0; i < 5; i++) {
        await ctx.db.insert("k3martStockMovements", {
          date: "2026-02-17",
          outletId: outlet,
          direction: "stock_in",
          menuProductId: menuProduct,
          externalProductId: "47068",
          quantity: 10 + i,
          priceAtSubmission: 50000,
          currentStockAtSubmission: 5,
          attemptCount: 1,
          submittedBy: "admin",
          submittedAt: Date.now(),
        });
      }
    });

    const result = await t.query(api.k3martCockpit.queries.getStockMovementHistory, {
      limit: 2,
    });

    expect(result.length).toBe(2);
  });
});

// ============================================
// getOutletDetail - 2 tests
// ============================================
describe("K3 Mart Cockpit - getOutletDetail", () => {
  test("returns outlet with stock and movements", async () => {
    const t = convexTest(schema);
    const outlet = await createK3MartOutlet(t);
    const menuProduct = await createMenuProduct(t, { name: "Product AC" });

    await createStockSnapshot(t, {
      outletId: outlet,
      quantity: 15,
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("k3martStockMovements", {
        date: "2026-02-17",
        outletId: outlet,
        direction: "stock_in",
        menuProductId: menuProduct,
        externalProductId: "47068",
        quantity: 10,
        priceAtSubmission: 50000,
        currentStockAtSubmission: 5,
        attemptCount: 1,
        submittedBy: "admin",
        submittedAt: Date.now(),
      });
    });

    const result = await t.query(api.k3martCockpit.queries.getOutletDetail, {
      outletId: outlet,
    });

    expect(result.outlet).toBeDefined();
    expect(result.stockSnapshots.length).toBeGreaterThan(0);
    expect(result.movements.length).toBeGreaterThan(0);
  });

  test("throws for non-existent outlet", async () => {
    const t = convexTest(schema);
    // Create a valid outlet, then use a non-existent ID
    const outlet = await createK3MartOutlet(t);
    // Delete it to make the ID invalid
    await t.run(async (ctx) => { await ctx.db.delete(outlet); });

    await expect(
      t.query(api.k3martCockpit.queries.getOutletDetail, {
        outletId: outlet,
      })
    ).rejects.toThrow();
  });
});
