/// <reference types="vite/client" />
/**
 * Integration tests for convex/subscriptions/reminders/queries.ts
 * Phase E Slice 1 — six read-only internalQuery reminder queries.
 *
 * Uses convex-test with the in-file glob pattern (project standard:
 * see convex/migrations/__tests__/gofoodSaleToChannelSale.test.ts).
 *
 * Spec §5 fixtures used here:
 *   - active sub + current "delivering" week (multi-product day, one deleted product — EC6)
 *   - a "planned" next week (kind 1)
 *   - a "confirmed"/unpaid week (kind 2)
 *   - a prior "delivering" week (kind 5) — same shape as current delivering week
 *   - delivered + non-delivered + other-week orders (kind 6 / EC7)
 *   - a terminated/ended sub (excluded from active iteration)
 */

import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../../schema";
import { internal } from "../../../_generated/api";

// Project convex-test pattern: absolute glob from project root (matches chatRegistry, salesSummaryQuery, etc.).
const modules = import.meta.glob("/convex/**/*.ts");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

// A fixed Monday 00:00 UTC that is safely in the past and well-known.
// Monday 2026-06-15 00:00:00 UTC  (WIB = 2026-06-15 07:00)
const WEEK_START_CURRENT = Date.UTC(2026, 5, 15, 0, 0, 0); // ms

// A planned "next" week (starts next Monday)
const WEEK_START_NEXT = WEEK_START_CURRENT + WEEK_MS;
const WEEK_END_NEXT = WEEK_START_NEXT + WEEK_MS - 1;

// A prior (older) delivering week — for kind 5
const WEEK_START_PRIOR = WEEK_START_CURRENT - WEEK_MS;
const WEEK_END_PRIOR = WEEK_START_PRIOR + WEEK_MS - 1;

// ---------------------------------------------------------------------------
// Seed helpers — schema-fidelity verified against convex/schema.ts
// ---------------------------------------------------------------------------

type TestT = ReturnType<typeof convexTest>;
type RunCtx = Parameters<Parameters<TestT["run"]>[0]>[0];

async function insertUser(ctx: RunCtx) {
  return ctx.db.insert("users", {
    name: "Admin",
    pinHash: "salt:hash",
    role: "admin" as const,
    isActive: true,
    failedAttempts: 0,
    createdAt: Date.now(),
  } as never);
}

async function insertCustomer(ctx: RunCtx, name: string) {
  return ctx.db.insert("customers", { name, createdBy: "test" } as never);
}

async function insertMenuProduct(ctx: RunCtx, code: string, name: string) {
  return ctx.db.insert("menuProducts", {
    code,
    name,
    grams: 80,
    defaultPrice: 35000,
    isActive: true,
    unitCost: 0,
    cachedProductionSummary: "1 Big",
  } as never);
}

async function insertSubscription(
  ctx: RunCtx,
  userId: any,
  customerId: any,
  menuProductId: any,
  label: string,
  status: "active" | "ended" = "active",
) {
  return ctx.db.insert("subscriptions", {
    customerId,
    label,
    status,
    billingModel: "prepaid_weekly_credit" as const,
    unitPrice: 29000,
    confidentialPrice: true,
    baselineDailyQty: 10,
    weeklyQty: 70,
    deliverByTime: "09:00",
    creditRolloverPolicy: "expire" as const,
    changeCutoffHour: 13,
    changeCutoffDayOffset: -1,
    permanentChangeNoticeDays: 14,
    terminationNoticeDays: 30,
    cogsBasis: 18000,
    startDate: WEEK_START_CURRENT,
    scheduleTemplate: [{ dayOfWeek: 1, items: [{ menuProductId, qty: 7 }] }],
    createdBy: userId,
  } as never);
}

/**
 * Insert a subscriptionWeek with multi-product plannedDays.
 * `dayTimestamps`: array of UTC-ms timestamps for each planned day.
 * `menuProductIdA` and optional `menuProductIdB`: products for items.
 * When `includeDeletedProduct` is true, a fake "deleted" product ID is used for a 3rd item.
 */
async function insertWeek(
  ctx: RunCtx,
  subscriptionId: any,
  weekStart: number,
  weekEnd: number,
  status: "planned" | "confirmed" | "invoiced" | "paid" | "delivering" | "reconciled" | "closed",
  dayTimestamps: number[],
  menuProductIdA: any,
  opts: {
    menuProductIdB?: any;
    deletedProductId?: any;
    paymentReceivedAt?: number;
    shortfall?: number;
    refundDue?: number;
  } = {},
) {
  const items: any[] = [
    { menuProductId: menuProductIdA, productName: "Product A", qty: 3, unitPrice: 29000, lineTotal: 87000 },
  ];
  if (opts.menuProductIdB) {
    items.push({ menuProductId: opts.menuProductIdB, productName: "Product B", qty: 4, unitPrice: 29000, lineTotal: 116000 });
  }
  if (opts.deletedProductId) {
    items.push({ menuProductId: opts.deletedProductId, productName: "Deleted Product", qty: 2, unitPrice: 29000, lineTotal: 58000 });
  }
  const plannedDays = dayTimestamps.map((date) => ({
    date,
    deliverByTime: "09:00",
    items,
    locked: false,
  }));

  return ctx.db.insert("subscriptionWeeks", {
    subscriptionId,
    weekStart,
    weekEnd,
    status,
    plannedDays,
    creditIssued: status === "planned" ? 0 : 87000,
    creditConsumed: 0,
    creditRemaining: status === "planned" ? 0 : 87000,
    creditExpired: 0,
    shortfall: opts.shortfall ?? 0,
    shortfallFault: "none" as const,
    refundDue: opts.refundDue ?? 0,
    ...(opts.paymentReceivedAt ? { paymentReceivedAt: opts.paymentReceivedAt } : {}),
  } as never);
}

async function insertOrder(
  ctx: RunCtx,
  customerId: any,
  subscriptionId: any,
  subscriptionWeekId: any,
  status: "Complete" | "AwaitingDelivery" | "BeingPrepared",
) {
  return ctx.db.insert("orders", {
    orderNumber: `0617-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`,
    customerId,
    customerName: "Test Cafe",
    status,
    paymentStatus: "Paid" as const,
    orderDate: Date.now(),
    totalAmount: 87000,
    totalCost: 50000,
    totalMargin: 37000,
    finalTotal: 87000,
    deliveryType: "Delivery",
    createdBy: "system",
    itemCount: 3,
    subscriptionId,
    subscriptionWeekId,
  } as never);
}

async function insertOrderItems(ctx: RunCtx, orderId: any, quantities: number[]) {
  for (const quantity of quantities) {
    await ctx.db.insert("orderItems", {
      orderId,
      productName: "Product A",
      quantity,
      unitPrice: 29000,
      unitCost: 18000,
      discountAmount: 0,
      lineTotal: quantity * 29000,
      lineCost: quantity * 18000,
      lineMargin: quantity * 11000,
    } as never);
  }
}

// ---------------------------------------------------------------------------
// getWeeklyDeliveryProgress
// ---------------------------------------------------------------------------

describe("getWeeklyDeliveryProgress", () => {
  it("counts Complete subscription-order pcs (orderItems.quantity) for the current week only", async () => {
    const t = convexTest(schema, modules);
    // Use real Date.now() so the "current week" window actually contains now.
    const now = Date.now();
    // week spans 7 days: 3 days before now and 4 days after
    const wStart = now - 3 * DAY_MS;
    const wEnd = now + 4 * DAY_MS;
    // 3 planned days spread across the week
    const day1 = wStart + DAY_MS / 2;
    const day2 = now - DAY_MS / 2;
    const day3 = now + DAY_MS / 2;

    await t.run(async (ctx) => {
      const userId = await insertUser(ctx);
      const customerId = await insertCustomer(ctx, "Cafe Alpha");
      const mpA = await insertMenuProduct(ctx, "ORI-80", "Original 80g");

      const subId = await insertSubscription(ctx, userId, customerId, mpA, "Cafe Alpha", "active");

      // Current week: 3 planned days × (3+4) pcs = 21 weekPlannedPcs
      const weekId = await insertWeek(
        ctx, subId, wStart, wEnd, "delivering",
        [day1, day2, day3],
        mpA,
        { menuProductIdB: mpA }, // items: [{qty:3}, {qty:4}] → 7 pcs/day × 3 days = 21
      );

      // Complete order in this week: qty=5 → 5 delivered pcs
      const ord1 = await insertOrder(ctx, customerId, subId, weekId, "Complete");
      await insertOrderItems(ctx, ord1, [5]);

      // Complete order in this week: qty=3 → 3 delivered pcs
      const ord2 = await insertOrder(ctx, customerId, subId, weekId, "Complete");
      await insertOrderItems(ctx, ord2, [3]);

      // Non-Complete order (excluded from delivered count)
      const ord3 = await insertOrder(ctx, customerId, subId, weekId, "AwaitingDelivery");
      await insertOrderItems(ctx, ord3, [10]);

      // Complete order in a DIFFERENT week (excluded by weekId filter)
      const priorWStart = wStart - WEEK_MS;
      const priorWEnd = wStart - 1;
      const otherWeekId = await insertWeek(
        ctx, subId, priorWStart, priorWEnd, "delivering",
        [priorWStart + DAY_MS], mpA,
      );
      const ord4 = await insertOrder(ctx, customerId, subId, otherWeekId, "Complete");
      await insertOrderItems(ctx, ord4, [99]);
    });

    const rows = await t.query(internal.subscriptions.reminders.queries.getWeeklyDeliveryProgress, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].weekPlannedPcs).toBe(21); // 3 days × (3+4) pcs
    expect(rows[0].deliveredPcs).toBe(8);    // 5 + 3 from two Complete orders
    expect(rows[0].remaining).toBe(13);      // 21 - 8
    expect(rows[0].overBy).toBe(0);
  });

  it("skips accounts with no active current week", async () => {
    // Empty DB — no subscriptions, no weeks
    const t = convexTest(schema, modules);
    const rows = await t.query(internal.subscriptions.reminders.queries.getWeeklyDeliveryProgress, {});
    expect(rows).toEqual([]);
  });

  it("skips ended subscriptions", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      const userId = await insertUser(ctx);
      const customerId = await insertCustomer(ctx, "Ended Cafe");
      const mpA = await insertMenuProduct(ctx, "ORI-80-E", "Original Ended");

      // Ended subscription — should be excluded
      const subId = await insertSubscription(ctx, userId, customerId, mpA, "Ended Cafe", "ended");
      await insertWeek(ctx, subId, 0, Number.MAX_SAFE_INTEGER, "delivering", [Date.now()], mpA);
    });

    const rows = await t.query(internal.subscriptions.reminders.queries.getWeeklyDeliveryProgress, {});
    expect(rows).toEqual([]);
  });

  it("returns remaining=0 and overBy when delivered exceeds plan", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const wStart = now - DAY_MS; // starts yesterday
    const wEnd = now + 6 * DAY_MS;

    await t.run(async (ctx) => {
      const userId = await insertUser(ctx);
      const customerId = await insertCustomer(ctx, "Over Plan Cafe");
      const mpA = await insertMenuProduct(ctx, "ORI-OVER", "Original Over");

      const subId = await insertSubscription(ctx, userId, customerId, mpA, "Over Plan Cafe", "active");

      // 1 planned day with 2 pcs → weekPlannedPcs = 2
      const weekId = await insertWeek(
        ctx, subId, wStart, wEnd, "delivering",
        [now - DAY_MS / 2], // yesterday mid-day
        mpA, // single product: qty=3, so items has 1 entry with qty=3 → weekPlannedPcs=3
        // Actually insertWeek with just mpA gives items=[{qty:3}] → 3 pcs
      );

      // Deliver 5 pcs → overBy = 5-3 = 2, remaining = 0
      const ord = await insertOrder(ctx, customerId, subId, weekId, "Complete");
      await insertOrderItems(ctx, ord, [5]);
    });

    const rows = await t.query(internal.subscriptions.reminders.queries.getWeeklyDeliveryProgress, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].weekPlannedPcs).toBe(3); // 1 day × (3 pcs from mpA alone)
    expect(rows[0].deliveredPcs).toBe(5);
    expect(rows[0].remaining).toBe(0);
    expect(rows[0].overBy).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getTodaySubscriptionDeliveries — EC6: deleted product flag
// ---------------------------------------------------------------------------

describe("getTodaySubscriptionDeliveries", () => {
  it("flags a deleted product (EC6) but still lists the stored productName", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const wStart = now - DAY_MS;
    const wEnd = now + 6 * DAY_MS;

    await t.run(async (ctx) => {
      const userId = await insertUser(ctx);
      const customerId = await insertCustomer(ctx, "EC6 Cafe");
      const mpA = await insertMenuProduct(ctx, "ALIVE-01", "Alive Product");

      // Insert a product then delete it to simulate EC6 — convex-test uses a real DB
      // so we can delete a doc. We'll insert then delete.
      const deletedId = await insertMenuProduct(ctx, "DEAD-01", "Deleted Product");
      await ctx.db.delete(deletedId);

      const subId = await insertSubscription(ctx, userId, customerId, mpA, "EC6 Cafe", "active");

      // Week spanning "now": plan a day with timestamp = now (same WIB day)
      // We set pd.date = now so getWibComponents(pd.date) matches getWibComponents(Date.now())
      await insertWeek(
        ctx, subId, wStart, wEnd, "delivering",
        [now], // today
        mpA,
        { deletedProductId: deletedId },
      );
    });

    const rows = await t.query(internal.subscriptions.reminders.queries.getTodaySubscriptionDeliveries, {});
    expect(rows).toHaveLength(1);

    const deletedLine = rows[0].lines.find((l) => l.missingProduct);
    expect(deletedLine).toBeTruthy();
    expect(deletedLine!.productName).toBe("Deleted Product");
    expect(deletedLine!.productName).not.toBe("");

    // Alive product (first item, productName "Product A" from insertWeek helper) should NOT be flagged
    const aliveLine = rows[0].lines.find((l) => !l.missingProduct);
    expect(aliveLine).toBeDefined();
    expect(aliveLine!.productName).toBe("Product A"); // snapshot from insertWeek helper
  });

  it("returns empty when no active subscription has a current week", async () => {
    const t = convexTest(schema, modules);
    const rows = await t.query(internal.subscriptions.reminders.queries.getTodaySubscriptionDeliveries, {});
    expect(rows).toEqual([]);
  });

  it("returns empty when current week has no planned day for today", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const wStart = now - 3 * DAY_MS;
    const wEnd = now + 4 * DAY_MS;

    await t.run(async (ctx) => {
      const userId = await insertUser(ctx);
      const customerId = await insertCustomer(ctx, "No Today Cafe");
      const mpA = await insertMenuProduct(ctx, "ORI-NT", "Original NT");
      const subId = await insertSubscription(ctx, userId, customerId, mpA, "No Today Cafe", "active");

      // Plan a day 2 days ago — NOT today
      await insertWeek(ctx, subId, wStart, wEnd, "delivering",
        [now - 2 * DAY_MS], // 2 days ago
        mpA,
      );
    });

    const rows = await t.query(internal.subscriptions.reminders.queries.getTodaySubscriptionDeliveries, {});
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getWeeksToConfirm
// ---------------------------------------------------------------------------

describe("getWeeksToConfirm", () => {
  it("returns planned weeks for active subscriptions", async () => {
    const t = convexTest(schema, modules);

    let subId: any;
    await t.run(async (ctx) => {
      const userId = await insertUser(ctx);
      const customerId = await insertCustomer(ctx, "Confirm Cafe");
      const mpA = await insertMenuProduct(ctx, "ORI-CF", "Original CF");
      subId = await insertSubscription(ctx, userId, customerId, mpA, "Confirm Cafe", "active");
      // Next week planned
      await insertWeek(ctx, subId, WEEK_START_NEXT, WEEK_END_NEXT, "planned",
        [WEEK_START_NEXT + DAY_MS], mpA);
    });

    const rows = await t.query(internal.subscriptions.reminders.queries.getWeeksToConfirm, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].account).toBe("Confirm Cafe");
    expect(rows[0].weekStart).toBe(WEEK_START_NEXT);
    expect(rows[0].subscriptionId).toBe(subId);
  });

  it("excludes planned weeks for ended subscriptions", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      const userId = await insertUser(ctx);
      const customerId = await insertCustomer(ctx, "Ended Confirm Cafe");
      const mpA = await insertMenuProduct(ctx, "ORI-EC", "Original EC");
      const subId = await insertSubscription(ctx, userId, customerId, mpA, "Ended Confirm Cafe", "ended");
      await insertWeek(ctx, subId, WEEK_START_NEXT, WEEK_END_NEXT, "planned",
        [WEEK_START_NEXT + DAY_MS], mpA);
    });

    const rows = await t.query(internal.subscriptions.reminders.queries.getWeeksToConfirm, {});
    expect(rows).toEqual([]);
  });

  it("returns empty when no planned weeks exist", async () => {
    const t = convexTest(schema, modules);
    const rows = await t.query(internal.subscriptions.reminders.queries.getWeeksToConfirm, {});
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getWeeklyInvoicesDue
// ---------------------------------------------------------------------------

describe("getWeeklyInvoicesDue", () => {
  it("returns confirmed unpaid weeks with amountDue = Σ plannedDays[].items[].lineTotal", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      const userId = await insertUser(ctx);
      const customerId = await insertCustomer(ctx, "Invoice Cafe");
      const mpA = await insertMenuProduct(ctx, "ORI-INV", "Original INV");
      const subId = await insertSubscription(ctx, userId, customerId, mpA, "Invoice Cafe", "active");

      // Confirmed, unpaid week: 1 day × items = [{qty:3, lineTotal:87000},{qty:4, lineTotal:116000}]
      // amountDue = 87000 + 116000 = 203000
      await insertWeek(ctx, subId, WEEK_START_PRIOR, WEEK_END_PRIOR, "confirmed",
        [WEEK_START_PRIOR + DAY_MS], mpA, { menuProductIdB: mpA });
    });

    const rows = await t.query(internal.subscriptions.reminders.queries.getWeeklyInvoicesDue, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].account).toBe("Invoice Cafe");
    expect(rows[0].weekStatus).toBe("confirmed");
    expect(rows[0].amountDue).toBe(203000); // 87000 + 116000
  });

  it("excludes weeks that already have paymentReceivedAt set", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      const userId = await insertUser(ctx);
      const customerId = await insertCustomer(ctx, "Paid Cafe");
      const mpA = await insertMenuProduct(ctx, "ORI-PAID", "Original Paid");
      const subId = await insertSubscription(ctx, userId, customerId, mpA, "Paid Cafe", "active");

      // Week with paymentReceivedAt set → already paid
      await insertWeek(ctx, subId, WEEK_START_PRIOR, WEEK_END_PRIOR, "confirmed",
        [WEEK_START_PRIOR + DAY_MS], mpA,
        { paymentReceivedAt: Date.now() - 1000 });
    });

    const rows = await t.query(internal.subscriptions.reminders.queries.getWeeklyInvoicesDue, {});
    expect(rows).toEqual([]);
  });

  it("includes invoiced status as well as confirmed", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      const userId = await insertUser(ctx);
      const customerId = await insertCustomer(ctx, "Invoiced Cafe");
      const mpA = await insertMenuProduct(ctx, "ORI-INVD", "Original INVD");
      const subId = await insertSubscription(ctx, userId, customerId, mpA, "Invoiced Cafe", "active");

      await insertWeek(ctx, subId, WEEK_START_PRIOR, WEEK_END_PRIOR, "invoiced",
        [WEEK_START_PRIOR + DAY_MS], mpA);
    });

    const rows = await t.query(internal.subscriptions.reminders.queries.getWeeklyInvoicesDue, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].weekStatus).toBe("invoiced");
  });

  it("returns empty when no unpaid confirmed/invoiced weeks exist", async () => {
    const t = convexTest(schema, modules);
    const rows = await t.query(internal.subscriptions.reminders.queries.getWeeklyInvoicesDue, {});
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getWeeksToReconcile
// ---------------------------------------------------------------------------

describe("getWeeksToReconcile", () => {
  it("returns weeks in delivering status with shortfall and refundDue", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      const userId = await insertUser(ctx);
      const customerId = await insertCustomer(ctx, "Reconcile Cafe");
      const mpA = await insertMenuProduct(ctx, "ORI-REC", "Original REC");
      const subId = await insertSubscription(ctx, userId, customerId, mpA, "Reconcile Cafe", "active");

      // Prior delivering week with shortfall
      await insertWeek(ctx, subId, WEEK_START_PRIOR, WEEK_END_PRIOR, "delivering",
        [WEEK_START_PRIOR + DAY_MS], mpA,
        { shortfall: 58000, refundDue: 29000 });
    });

    const rows = await t.query(internal.subscriptions.reminders.queries.getWeeksToReconcile, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].account).toBe("Reconcile Cafe");
    expect(rows[0].shortfall).toBe(58000);
    expect(rows[0].refundDue).toBe(29000);
  });

  it("returns empty when no delivering weeks exist", async () => {
    const t = convexTest(schema, modules);
    const rows = await t.query(internal.subscriptions.reminders.queries.getWeeksToReconcile, {});
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getDaysApproachingCutoff
// ---------------------------------------------------------------------------

describe("getDaysApproachingCutoff", () => {
  it("returns subscription with a tomorrow unlocked planned day", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    // tomorrow = now + 24h; we need a plannedDay whose WIB date = tomorrow's WIB date
    const tomorrow = now + DAY_MS;
    const wStart = now - 3 * DAY_MS;
    const wEnd = now + 4 * DAY_MS;

    await t.run(async (ctx) => {
      const userId = await insertUser(ctx);
      const customerId = await insertCustomer(ctx, "Cutoff Cafe");
      const mpA = await insertMenuProduct(ctx, "ORI-CUT", "Original CUT");
      const subId = await insertSubscription(ctx, userId, customerId, mpA, "Cutoff Cafe", "active");

      await insertWeek(ctx, subId, wStart, wEnd, "delivering",
        [tomorrow], // planned day is tomorrow
        mpA);
    });

    const rows = await t.query(internal.subscriptions.reminders.queries.getDaysApproachingCutoff, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].account).toBe("Cutoff Cafe");
  });

  it("returns empty when no unlocked tomorrow days exist", async () => {
    const t = convexTest(schema, modules);
    const rows = await t.query(internal.subscriptions.reminders.queries.getDaysApproachingCutoff, {});
    expect(rows).toEqual([]);
  });
});
