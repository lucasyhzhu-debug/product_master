/**
 * T7 integration tests: getCreditOrderWhatsappDraft query
 *
 * Uses explicit modules glob so convex-test loads the worktree's implementations,
 * not stale main-tree code via the node_modules junction.
 */
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import type { SessionId } from "convex-helpers/server/sessions";
import schema from "../../schema";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

const modules = import.meta.glob("/convex/**/*.ts");

type TestT = ReturnType<typeof convexTest>;

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function createManagerSession(
  t: TestT,
): Promise<{ sessionId: SessionId; userId: Id<"users"> }> {
  const token = `manager-token-t7-${Date.now()}-${Math.random()}` as SessionId;
  const userId = await t.run(async (ctx) => {
    const uid = await ctx.db.insert("users", {
      name: "Test Manager T7",
      pinHash: "salt:hash",
      role: "manager",
      isActive: true,
      failedAttempts: 0,
      createdAt: Date.now(),
    } as never);
    await ctx.db.insert("sessions", {
      userId: uid,
      token,
      expiresAt: Date.now() + 8 * 3600 * 1000,
      createdAt: Date.now(),
    } as never);
    return uid as Id<"users">;
  });
  return { sessionId: token, userId };
}

// ---------------------------------------------------------------------------
// Seed helper
// ---------------------------------------------------------------------------

interface SeedOpts {
  customerName: string;
  creditUsed: number;
  creditRemaining: number;
  plannedRemaining: number;
}

/**
 * Seeds:
 * - The SUBSCRIPTION_CREDIT_TOPUP whatsapp template
 * - Customer, product, subscription
 * - A funded (delivering) week with `plannedRemaining` future planned days
 * - A credit topup ledger entry for (creditUsed + creditRemaining)
 * - An order with subscriptionCreditApplied = creditUsed (no by_order ledger → unrealized)
 * - One order item
 */
async function seedDeliveredCreditOrder(
  t: TestT,
  opts: SeedOpts,
): Promise<{ orderId: Id<"orders">; sessionId: SessionId }> {
  const { sessionId, userId } = await createManagerSession(t);
  const NOW = Date.now();
  const weekStart = NOW - 3 * 86400000;
  const weekEnd = NOW + 4 * 86400000;
  const poolTotal = opts.creditUsed + opts.creditRemaining;

  const orderId = await t.run(async (ctx) => {
    // Seed the template so getTemplateContent can find it by code.
    await ctx.db.insert("whatsappTemplates", {
      code: "SUBSCRIPTION_CREDIT_TOPUP",
      name: "Subscription Credit Top-up",
      description: "Sent after a credit-funded subscription order",
      templateId: [
        "Halo {customerName}! 🙏 Terima kasih.",
        "Pesanan hari ini: {itemsText}",
        "Kami pakai kredit langganan Rp {creditUsed} untuk pesanan ini.",
        "Sisa kredit minggu ini: Rp {creditRemaining} · Pengiriman terjadwal tersisa: {plannedDeliveriesRemaining}.",
      ].join("\n"),
      templateEn: [
        "Halo {customerName}! 🙏 Terima kasih.",
        "Pesanan hari ini: {itemsText}",
        "Kami pakai kredit langganan Rp {creditUsed} untuk pesanan ini.",
        "Sisa kredit minggu ini: Rp {creditRemaining} · Pengiriman terjadwal tersisa: {plannedDeliveriesRemaining}.",
      ].join("\n"),
      availableVariables: [
        "{customerName}",
        "{itemsText}",
        "{creditUsed}",
        "{creditRemaining}",
        "{plannedDeliveriesRemaining}",
      ],
      isDefault: true,
    } as never);

    const productId = (await ctx.db.insert("menuProducts", {
      code: "T7-P1",
      name: "Original T7",
      grams: 80,
      defaultPrice: 10000,
      isActive: true,
      unitCost: 5000,
      cachedProductionSummary: "1 Big",
    } as never)) as Id<"menuProducts">;

    const customerId = (await ctx.db.insert("customers", {
      name: opts.customerName,
      phone: "+628111000777",
      createdBy: "test",
    } as never)) as Id<"customers">;

    const subscriptionId = (await ctx.db.insert("subscriptions", {
      customerId,
      label: "Weekly T7",
      status: "active",
      billingModel: "prepaid_weekly_credit",
      unitPrice: 7000,
      confidentialPrice: false,
      baselineDailyQty: 10,
      weeklyQty: 70,
      deliverByTime: "09:00",
      creditRolloverPolicy: "expire",
      changeCutoffHour: 13,
      changeCutoffDayOffset: -1,
      permanentChangeNoticeDays: 14,
      terminationNoticeDays: 30,
      cogsBasis: 4000,
      startDate: weekStart,
      scheduleTemplate: [
        { dayOfWeek: 1, items: [{ menuProductId: productId, qty: 10 }] },
      ],
      createdBy: userId,
    } as never)) as Id<"subscriptions">;

    // plannedRemaining future days (all tomorrow or later)
    const plannedDays = Array.from({ length: opts.plannedRemaining }, (_, i) => ({
      date: NOW + (i + 1) * 86400000,
      deliverByTime: "09:00",
      items: [
        {
          menuProductId: productId,
          productName: "Original T7",
          qty: 8,
          unitPrice: 7000,
          lineTotal: 56000,
        },
      ],
      locked: false,
    }));

    const weekId = (await ctx.db.insert("subscriptionWeeks", {
      subscriptionId,
      weekStart,
      weekEnd,
      status: "delivering",
      plannedDays,
      creditIssued: poolTotal,
      creditConsumed: 0,
      creditRemaining: poolTotal,
      creditExpired: 0,
      shortfall: 0,
      shortfallFault: "none",
      refundDue: 0,
    } as never)) as Id<"subscriptionWeeks">;

    // Fund the pool with a topup entry
    await ctx.db.insert("creditLedger", {
      subscriptionId,
      subscriptionWeekId: weekId,
      type: "topup",
      amount: poolTotal,
      balanceAfter: poolTotal,
      createdBy: userId,
    } as never);

    // Order: subscriptionCreditApplied = creditUsed, no by_order ledger → unrealized reservation
    const orderId = (await ctx.db.insert("orders", {
      orderNumber: "0629-T7A",
      customerId,
      customerName: opts.customerName,
      customerPhone: "+628111000777",
      status: "PaymentReceived",
      paymentStatus: "Paid",
      paymentMethod: "subscription_credit",
      fundingSource: "subscription_credit",
      orderDate: NOW,
      dueDate: NOW,
      deliveryDate: NOW,
      deliveryType: "Delivery",
      totalAmount: opts.creditUsed,
      totalCost: 0,
      totalMargin: opts.creditUsed,
      finalTotal: opts.creditUsed,
      itemCount: 1,
      createdBy: "Test Manager T7",
      createdByUserId: userId,
      isKitchenVisible: true,
      subscriptionId,
      subscriptionWeekId: weekId,
      subscriptionCreditApplied: opts.creditUsed,
    } as never)) as Id<"orders">;

    // One order item
    await ctx.db.insert("orderItems", {
      orderId,
      productName: "Original T7",
      quantity: 8,
      unitPrice: 7000,
      unitCost: 0,
      discountAmount: 0,
      lineTotal: 56000,
      lineCost: 0,
      lineMargin: 56000,
      menuProductId: productId,
    } as never);

    return orderId;
  });

  return { orderId, sessionId };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getCreditOrderWhatsappDraft — T7", () => {
  it("renders the credit top-up summary with correct figures", async () => {
    const t = convexTest(schema, modules);
    const { orderId, sessionId } = await seedDeliveredCreditOrder(t, {
      customerName: "Amsterdam!",
      creditUsed: 56000,
      creditRemaining: 44000,
      plannedRemaining: 3,
    });

    const draft = await t.query(
      api.subscriptions.creditOrder.getCreditOrderWhatsappDraft,
      { orderId, sessionId },
    );

    expect(draft).not.toBeNull();
    expect(draft!.text).toContain("Amsterdam!"); // customerName
    expect(draft!.text).toContain("56"); // creditUsed 56000 → "56.000"
    expect(draft!.text).toContain("44"); // creditRemaining 44000 → "44.000"
    expect(draft!.text).toContain("3"); // plannedDeliveriesRemaining
  });

  it("returns null when order has no subscriptionCreditApplied", async () => {
    const t = convexTest(schema, modules);
    const { sessionId, userId } = await createManagerSession(t);

    const orderId = await t.run(async (ctx) => {
      const customerId = (await ctx.db.insert("customers", {
        name: "Plain Customer T7",
        phone: "+628111000778",
        createdBy: "test",
      } as never)) as Id<"customers">;
      return (await ctx.db.insert("orders", {
        orderNumber: "0629-T7B",
        customerId,
        customerName: "Plain Customer T7",
        status: "Draft",
        paymentStatus: "Unpaid",
        orderDate: Date.now(),
        totalAmount: 10000,
        totalCost: 0,
        totalMargin: 10000,
        finalTotal: 10000,
        deliveryType: "Delivery",
        createdBy: "Test Manager T7",
        createdByUserId: userId,
        itemCount: 0,
        isKitchenVisible: false,
      } as never)) as Id<"orders">;
    });

    const draft = await t.query(
      api.subscriptions.creditOrder.getCreditOrderWhatsappDraft,
      { orderId, sessionId },
    );
    expect(draft).toBeNull();
  });
});
