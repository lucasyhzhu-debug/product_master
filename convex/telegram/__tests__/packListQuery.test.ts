/**
 * Integration tests for the morning/midday/command pack list query.
 * Uses convex-test against the real schema — verifies index filters, sort order,
 * and the WIB end-of-day boundary computation.
 *
 * Glob from absolute root (Pitfall 5 from convex-test docs): keep keys canonical.
 */
import { convexTest, type TestConvex } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { internal } from "../../_generated/api";

const modules = import.meta.glob("/convex/**/*.ts");

// Schema-aware test context so `ctx.db.query(...).withIndex("by_status_due_date", ...)`
// resolves the real user-defined index (mirrors convex/qrisPayments/__tests__/_factory.ts:22-29).
type TestContext = TestConvex<typeof schema>;

// Construct a UTC ms for "WIB midnight of date D" — same helper convention as periodRange.test.ts.
function wibMidnight(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day, -7, 0, 0, 0);
}

// 2026-05-27 fixed reference day. End-of-day WIB = 2026-05-28 WIB midnight - 1ms.
const TODAY_START = wibMidnight(2026, 5, 27);
const TOMORROW_START = wibMidnight(2026, 5, 28);
const YESTERDAY_START = wibMidnight(2026, 5, 26);

async function seedOrder(
  t: TestContext,
  override: Partial<{
    orderNumber: string;
    status: "PaymentReceived" | "BeingPrepared" | "Draft" | "AwaitingDelivery" | "Complete" | "AwaitingPayment";
    dueDate: number | undefined;
    expedited: boolean;
    deliveryType: "Delivery" | "Pickup";
    notes: string;
    cancelledItem: boolean;  // for T1 — seed a 2nd orderItem marked cancelled
  }> = {},
) {
  return await t.run(async (ctx) => {
    const customerId = await ctx.db.insert("customers", {
      name: "Test Customer",
      phone: "0812",
      createdBy: "test",  // required field — schema.ts:183
    });
    const orderId = await ctx.db.insert("orders", {
      orderNumber: override.orderNumber ?? "0527-001",
      customerId,
      customerName: "Test Customer",
      status: override.status ?? "PaymentReceived",
      paymentStatus: (override.status ?? "PaymentReceived") === "AwaitingPayment" ? "Unpaid" : "Paid",
      orderDate: TODAY_START,
      dueDate: "dueDate" in override ? override.dueDate : TODAY_START + 8 * 3600_000,
      totalAmount: 50000,
      totalCost: 20000,
      totalMargin: 30000,
      finalTotal: 50000,
      deliveryType: override.deliveryType ?? "Delivery",
      deliveryAddress: "Jl. Test",
      notes: override.notes,
      createdBy: "tester",
      expedited: override.expedited,
      itemCount: 1,
    });
    await ctx.db.insert("orderItems", {
      orderId,
      productName: "Jumbo",
      quantity: 2,
      unitPrice: 25000,
      unitCost: 10000,
      discountAmount: 0,
      lineTotal: 50000,
      lineCost: 20000,
      lineMargin: 30000,
    });
    if (override.cancelledItem) {
      await ctx.db.insert("orderItems", {
        orderId,
        productName: "Cancelled Bite Triple",
        quantity: 5,
        unitPrice: 30000,
        unitCost: 12000,
        discountAmount: 0,
        lineTotal: 150000,
        lineCost: 60000,
        lineMargin: 90000,
        isCancelled: true,
      });
    }
    return orderId;
  });
}

describe("getOrdersForPackList — status filter", () => {
  it("includes PaymentReceived + BeingPrepared", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, { orderNumber: "0527-001", status: "PaymentReceived" });
    await seedOrder(t, { orderNumber: "0527-002", status: "BeingPrepared" });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.totalCount).toBe(2);
    expect([...result.overdue, ...result.dueToday].map((o) => o.orderNumber).sort()).toEqual(["0527-001", "0527-002"]);
  });

  it("excludes Draft / AwaitingDelivery / Complete", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, { orderNumber: "0527-001", status: "PaymentReceived" });
    await seedOrder(t, { orderNumber: "0527-002", status: "Draft" });
    await seedOrder(t, { orderNumber: "0527-003", status: "AwaitingDelivery" });
    await seedOrder(t, { orderNumber: "0527-004", status: "Complete" });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.totalCount).toBe(1);
    expect(result.dueToday[0].orderNumber).toBe("0527-001");
  });
});

describe("getOrdersForPackList — dueDate boundary", () => {
  it("includes overdue (dueDate < today's WIB midnight)", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, { orderNumber: "0526-001", dueDate: YESTERDAY_START + 8 * 3600_000 });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.totalCount).toBe(1);
  });

  it("includes due-today (dueDate within today's WIB day)", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, { orderNumber: "0527-001", dueDate: TODAY_START + 23 * 3600_000 });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.totalCount).toBe(1);
  });

  it("excludes future (dueDate >= tomorrow's WIB midnight)", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, { orderNumber: "0528-001", dueDate: TOMORROW_START });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.totalCount).toBe(0);
  });

  it("excludes orders without a dueDate", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, { orderNumber: "0527-001", dueDate: undefined });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.totalCount).toBe(0);
  });
});

describe("getOrdersForPackList — sort + counts", () => {
  it("expedited orders come first", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, { orderNumber: "0527-001", expedited: false, dueDate: TODAY_START + 8 * 3600_000 });
    await seedOrder(t, { orderNumber: "0527-002", expedited: true, dueDate: TODAY_START + 20 * 3600_000 });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect([...result.overdue, ...result.dueToday][0].orderNumber).toBe("0527-002");
  });

  it("counts delivery vs pickup correctly", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, { orderNumber: "0527-001", deliveryType: "Delivery" });
    await seedOrder(t, { orderNumber: "0527-002", deliveryType: "Delivery" });
    await seedOrder(t, { orderNumber: "0527-003", deliveryType: "Pickup" });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.totalCount).toBe(3);
    expect(result.deliveryCount).toBe(2);
    expect(result.pickupCount).toBe(1);
  });
});

describe("getOrdersForPackList — cancelled item exclusion (T1)", () => {
  it("excludes orderItems flagged isCancelled from the rendered card", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, { orderNumber: "0527-001", cancelledItem: true });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.totalCount).toBe(1);
    expect(result.dueToday[0].items).toHaveLength(1);
    expect(result.dueToday[0].items[0].productName).toBe("Jumbo");
  });
});

describe("getOrdersForPackList — overdue vs dueToday buckets", () => {
  it("splits paid orders into overdue and dueToday by WIB day", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, { orderNumber: "0526-001", dueDate: YESTERDAY_START + 8 * 3600_000 });   // overdue
    await seedOrder(t, { orderNumber: "0527-001", dueDate: TODAY_START + 20 * 3600_000 });       // today
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.totalCount).toBe(2);
    expect(result.overdueCount).toBe(1);
    expect(result.overdue.map((o) => o.orderNumber)).toEqual(["0526-001"]);
    expect(result.dueToday.map((o) => o.orderNumber)).toEqual(["0527-001"]);
  });

  it("echoes the injected now as generatedAt", async () => {
    const t = convexTest(schema, modules);
    const now = TODAY_START + 12 * 3600_000;
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now },
    );
    expect(result.generatedAt).toBe(now);
  });
});

describe("getOrdersForPackList — unpaid past-due scan", () => {
  it("includes AwaitingPayment orders past their delivery date", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, {
      orderNumber: "0525-007",
      status: "AwaitingPayment",
      dueDate: YESTERDAY_START + 8 * 3600_000,
    });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.unpaidOverdue.map((o) => o.orderNumber)).toEqual(["0525-007"]);
    expect(result.totalCount).toBe(0); // unpaid does NOT count toward the pack list
  });

  it("excludes AwaitingPayment orders due today (not yet past delivery)", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, {
      orderNumber: "0527-009",
      status: "AwaitingPayment",
      dueDate: TODAY_START + 8 * 3600_000,
    });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.unpaidOverdue).toHaveLength(0);
  });

  it("excludes AwaitingPayment orders without a dueDate", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, { orderNumber: "0527-010", status: "AwaitingPayment", dueDate: undefined });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.unpaidOverdue).toHaveLength(0);
  });

  it("does not surface paid past-due orders in the unpaid bucket", async () => {
    const t = convexTest(schema, modules);
    await seedOrder(t, {
      orderNumber: "0526-001",
      status: "PaymentReceived",
      dueDate: YESTERDAY_START + 8 * 3600_000,
    });
    const result = await t.query(
      internal.telegram.queries.packListQuery.getOrdersForPackList,
      { now: TODAY_START + 12 * 3600_000 },
    );
    expect(result.unpaidOverdue).toHaveLength(0);
    expect(result.overdue).toHaveLength(1);
  });
});
