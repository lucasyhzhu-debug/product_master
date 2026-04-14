/**
 * Regression tests for dispatchPlanner.getBallTotalsForDispatchPlanDate.
 *
 * Phase 80 addendum Test #10: guarantees the migrated implementation no longer
 * hardcodes BIG_BALL / MID_BALL and instead resolves production units dynamically
 * from componentTypes. Adding HAZELNUT_REGULAR (or any future production type)
 * must surface in unitsByType automatically; legacy bigBalls / midBalls must
 * still compute correctly for products that use those codes.
 */

import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import type { TestConvex } from "convex-test";
import type { Id } from "../../convex/_generated/dataModel";

const modules = import.meta.glob("../../convex/**/*.*s");

type TestContext = TestConvex<typeof schema>;

async function seedComponentTypes(t: TestContext) {
  const now = Date.now();
  const bigBallId = await t.run(async (ctx) =>
    ctx.db.insert("componentTypes", {
      name: "Big Ball",
      code: "BIG_BALL",
      category: "production" as const,
      unit: "pcs",
      unitCostIdr: 19231,
      trackInventory: false,
      sortOrder: 1,
      isActive: true,
      createdBy: "test",
      createdAt: now,
    }),
  );
  const midBallId = await t.run(async (ctx) =>
    ctx.db.insert("componentTypes", {
      name: "Mid Ball",
      code: "MID_BALL",
      category: "production" as const,
      unit: "pcs",
      unitCostIdr: 12000,
      trackInventory: false,
      sortOrder: 2,
      isActive: true,
      createdBy: "test",
      createdAt: now,
    }),
  );
  const hazelnutId = await t.run(async (ctx) =>
    ctx.db.insert("componentTypes", {
      name: "Hazelnut-Regular",
      code: "HAZELNUT_REGULAR",
      category: "production" as const,
      unit: "pcs",
      unitCostIdr: 15000,
      trackInventory: false,
      sortOrder: 3,
      isActive: true,
      createdBy: "test",
      createdAt: now,
    }),
  );
  return { bigBallId, midBallId, hazelnutId };
}

async function seedMenuProduct(
  t: TestContext,
  name: string,
  componentTypeId: Id<"componentTypes">,
  qtyPerProduct = 1,
): Promise<Id<"menuProducts">> {
  const menuProductId = await t.run(async (ctx) =>
    ctx.db.insert("menuProducts", {
      code: name.replace(/\s+/g, "_").toUpperCase(),
      name,
      grams: 80,
      defaultPrice: 50000,
      unitCost: 0,
      isActive: true,
      cachedProductionSummary: "",
    }),
  );
  await t.run(async (ctx) =>
    ctx.db.insert("menuProductComponents", {
      menuProductId,
      componentTypeId,
      quantity: qtyPerProduct,
      sortOrder: 0,
    }),
  );
  return menuProductId;
}

async function seedCustomer(t: TestContext): Promise<Id<"customers">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("customers", { name: "Test Customer", createdBy: "test" }),
  );
}

// Seed an order + item with a dueDate for a given WIB calendar date string
// (YYYY-MM-DD). dispatchPlanner reads direct-sales orders by dueDate range.
async function seedOrderForDispatchDate(
  t: TestContext,
  customerId: Id<"customers">,
  menuProductId: Id<"menuProducts">,
  productName: string,
  quantity: number,
  dateStr: string,
  status: "Confirmed" | "InProduction" = "Confirmed",
) {
  // dueDate is epoch ms; pick WIB noon (avoids any timezone rounding drift).
  const dueDate = new Date(dateStr + "T12:00:00+07:00").getTime();
  const orderId = await t.run(async (ctx) =>
    ctx.db.insert("orders", {
      orderNumber: `DSP-${dateStr}-${Math.random().toString(36).slice(2, 6)}`,
      customerId,
      customerName: "Test Customer",
      status,
      paymentStatus: "Paid" as const,
      orderDate: dueDate,
      dueDate,
      totalAmount: quantity * 50000,
      totalCost: 0,
      totalMargin: quantity * 50000,
      finalTotal: quantity * 50000,
      deliveryType: "Pickup",
      createdBy: "test",
      itemCount: 1,
      channel: "whatsapp",
    }),
  );
  await t.run(async (ctx) =>
    ctx.db.insert("orderItems", {
      orderId,
      productName,
      quantity,
      unitPrice: 50000,
      unitCost: 0,
      discountAmount: 0,
      lineTotal: quantity * 50000,
      lineCost: 0,
      lineMargin: quantity * 50000,
      menuProductId,
    }),
  );
  return orderId;
}

describe("dispatchPlanner.getBallTotalsForDispatchPlanDate", () => {
  test("HAZELNUT_REGULAR counted dynamically; legacy bigBalls still works (Pitfall #11 closure)", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId, hazelnutId } = await seedComponentTypes(t);

    // Hazelnut product: 2 HAZELNUT_REGULAR per unit
    const hazelnutProduct = await seedMenuProduct(
      t,
      "Hazelnut Triple",
      hazelnutId,
      2,
    );
    // Legacy product: 1 BIG_BALL per unit
    const bigBallProduct = await seedMenuProduct(t, "Original", bigBallId, 1);

    const customerId = await seedCustomer(t);
    const dateStr = "2026-04-20";

    // 3 hazelnut product units → 6 HAZELNUT_REGULAR
    await seedOrderForDispatchDate(
      t,
      customerId,
      hazelnutProduct,
      "Hazelnut Triple",
      3,
      dateStr,
      "Confirmed",
    );
    // 5 big ball product units → 5 BIG_BALL
    await seedOrderForDispatchDate(
      t,
      customerId,
      bigBallProduct,
      "Original",
      5,
      dateStr,
      "InProduction",
    );

    const res = await t.query(
      api.dispatchPlanner.queries.getBallTotalsForDispatchPlanDate,
      { date: dateStr },
    );

    // Dynamic: HAZELNUT_REGULAR must appear without any code change.
    expect(res.unitsByType["HAZELNUT_REGULAR"]).toBe(6);
    // Legacy: bigBalls still computed from BIG_BALL count.
    expect(res.unitsByType["BIG_BALL"]).toBe(5);
    expect(res.bigBalls).toBe(5);
    // No mid balls were seeded.
    expect(res.midBalls).toBe(0);
  });

  test("excludes Draft and Cancelled orders", async () => {
    const t = convexTest(schema, modules);
    const { bigBallId } = await seedComponentTypes(t);
    const bigBallProduct = await seedMenuProduct(t, "Original", bigBallId, 1);
    const customerId = await seedCustomer(t);
    const dateStr = "2026-04-21";
    const dueDate = new Date(dateStr + "T12:00:00+07:00").getTime();

    for (const status of ["Draft", "Cancelled"] as const) {
      const orderId = await t.run(async (ctx) =>
        ctx.db.insert("orders", {
          orderNumber: `X-${status}`,
          customerId,
          customerName: "Test Customer",
          status,
          paymentStatus: "Paid" as const,
          orderDate: dueDate,
          dueDate,
          totalAmount: 50000,
          totalCost: 0,
          totalMargin: 50000,
          finalTotal: 50000,
          deliveryType: "Pickup",
          createdBy: "test",
          itemCount: 1,
        }),
      );
      await t.run(async (ctx) =>
        ctx.db.insert("orderItems", {
          orderId,
          productName: "Original",
          quantity: 100,
          unitPrice: 50000,
          unitCost: 0,
          discountAmount: 0,
          lineTotal: 5000000,
          lineCost: 0,
          lineMargin: 5000000,
          menuProductId: bigBallProduct,
        }),
      );
    }

    const res = await t.query(
      api.dispatchPlanner.queries.getBallTotalsForDispatchPlanDate,
      { date: dateStr },
    );
    expect(res.bigBalls).toBe(0);
    expect(res.midBalls).toBe(0);
    expect(Object.keys(res.unitsByType).length).toBe(0);
  });
});
