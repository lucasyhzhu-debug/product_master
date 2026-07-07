/**
 * Dev-only CRM UAT seed — Phase D UAT run-spec.
 *
 * Creates:
 *   - 1 B2B customer "UAT Cafe B2B" with all CRM fields populated
 *   - 2 active subscriptions (Morning Bundle A, Afternoon Bundle B)
 *   - 1 supply agreement linked to Sub 1 (see storage limitation below)
 *   - Current week for Sub 1 (status: "delivering") with:
 *       opening topup + 3 drawdowns across Mon/Tue/Wed + mid-week amendment topup
 *   - 3 invoices for Sub 1: weekly (Paid), amendment (Paid), pending amendment (Unpaid)
 *   - Past closed week for Sub 2 with a paid weekly invoice
 *   - 6 orders: 3 Complete subscription (Mon-Wed), 1 BeingPrepared subscription (Thu),
 *               1 Draft, 1 AwaitingPayment
 *
 * Prod-safety: refuses to run if CONVEX_CLOUD_URL contains "decisive-wombat-7".
 * Idempotency: if "UAT Cafe B2B" already exists (matched by UAT_PHONE), returns
 *              existing IDs immediately without re-seeding.
 *
 * Agreement file limitation: supplyAgreements.fileStorageId requires a real
 * _storage document ID — mutations cannot store file bytes (that requires an action).
 * This seed borrows an existing storage ID found in: feedback.screenshotStorageId →
 * businessSettings.logoStorageId → any menuProducts.photoStorageId. If none is found,
 * agreement creation is SKIPPED and agreementSkipped=true is returned.
 * When a borrowed ID is used, the AgreementPage "Open" button will resolve a URL but
 * the file will NOT be the actual agreement PDF. This is a seed limitation, not a bug.
 *
 * Run from Convex dashboard Functions tab (dev:exciting-fennec-671 only):
 *   subscriptions/_devSeed:seedCrmUat
 */

import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { postLedgerEntry } from "./ledger";
import { computeWeekBounds, computeWeekStart } from "./weekBounds";
import { deriveWeeklyQty } from "./creditMath";

const DAY_MS = 86_400_000;

// Unique phone used as idempotency key — must not collide with real customers.
const UAT_PHONE = "+6281234560099";

export const seedCrmUat = mutation({
  args: {},
  handler: async (ctx) => {
    // ── Prod-safety guard ─────────────────────────────────────────────────────
    const cloudUrl = process.env.CONVEX_CLOUD_URL ?? "";
    if (cloudUrl.includes("decisive-wombat-7")) {
      throw new Error(
        "seedCrmUat: REFUSED — CONVEX_CLOUD_URL targets production (decisive-wombat-7). " +
          "Run against dev:exciting-fennec-671 only.",
      );
    }

    // ── Resolve an admin user for typed-ID author fields ──────────────────────
    const adminUser = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .first();
    if (!adminUser) {
      throw new Error(
        "seedCrmUat: No admin user found. Run auth:seedAdminUser first.",
      );
    }
    const userId = adminUser._id;

    // ── Idempotency: return early if UAT customer already exists ──────────────
    const existing = await ctx.db
      .query("customers")
      .withIndex("by_phone", (q) => q.eq("phone", UAT_PHONE))
      .first();

    if (existing) {
      const existingSubs = await ctx.db
        .query("subscriptions")
        .withIndex("by_customer", (q) => q.eq("customerId", existing._id))
        .collect();
      return {
        alreadySeeded: true,
        customerId: existing._id,
        subscriptionIds: existingSubs.map((s) => s._id),
        agreementSkipped: false,
        summary: "UAT Cafe B2B already seeded — returning existing IDs.",
        navigate: `/crm/customers/${existing._id}`,
      };
    }

    // ── Resolve an active menu product for schedule + order items ─────────────
    // If none exists, schedule templates are empty arrays (valid per schema).
    const menuProduct = await ctx.db
      .query("menuProducts")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .first();
    const menuProductId = menuProduct?._id as Id<"menuProducts"> | undefined;
    const productName = menuProduct?.name ?? "Frollie Snack";

    // Pricing constants (integer IDR)
    const unitPriceA = 75_000; // Sub 1 partner price
    const unitCostA = 40_000;  // Sub 1 COGS
    const unitPriceB = 65_000; // Sub 2 partner price
    const unitCostB = 35_000;  // Sub 2 COGS

    // Sub 1 schedule: Mon–Fri, 5 units/day
    const sub1Items = menuProductId
      ? [{ menuProductId, qty: 5 }]
      : ([] as { menuProductId: Id<"menuProducts">; qty: number }[]);
    const sub1Schedule = sub1Items.length > 0
      ? [0, 1, 2, 3, 4].map((d) => ({ dayOfWeek: d, items: sub1Items }))
      : ([] as { dayOfWeek: number; items: { menuProductId: Id<"menuProducts">; qty: number }[] }[]);
    const sub1WeeklyQty = deriveWeeklyQty(sub1Schedule);          // 25
    const sub1WeeklyCredit = sub1WeeklyQty * unitPriceA;          // 1,875,000 IDR

    // Sub 2 schedule: Mon/Wed/Fri, 3 units/day
    const sub2Items = menuProductId
      ? [{ menuProductId, qty: 3 }]
      : ([] as { menuProductId: Id<"menuProducts">; qty: number }[]);
    const sub2Schedule = sub2Items.length > 0
      ? [0, 2, 4].map((d) => ({ dayOfWeek: d, items: sub2Items }))
      : ([] as { dayOfWeek: number; items: { menuProductId: Id<"menuProducts">; qty: number }[] }[]);
    const sub2WeeklyQty = deriveWeeklyQty(sub2Schedule);          // 9

    const now = Date.now();

    // ── 1. Customer ───────────────────────────────────────────────────────────
    const customerId = await ctx.db.insert("customers", {
      name: "UAT Cafe B2B",
      phone: UAT_PHONE,
      whatsapp: "+6281234560099",
      source: "b2b_direct",
      notes: "Dev seed — Phase D CRM UAT. Safe to delete after UAT run completes.",
      defaultAddress: "Jl. Jend. Sudirman Kav. 52–53, Jakarta Selatan 12190",
      createdBy: "dev-seed",
      companyName: "PT UAT Cafe Indonesia",
      npwp: "01.234.567.8-012.000",
      billingAddress: "Jl. Jend. Sudirman Kav. 52–53, Jakarta Selatan 12190",
      keyContactName: "Budi Santoso",
      keyContactRole: "Purchasing Manager",
      email: "purchasing@uatcafe.id",
      instagram: "@uatcafeid",
      deliveryAddress: "Jl. Jend. Sudirman Kav. 52–53 (Lantai 1, Reception), Jakarta Selatan 12190",
      storeAddress: "Jl. Kemang Raya No. 45, Jakarta Selatan 12730",
      customerType: "b2b_wholesale" as const,
    });

    // ── 2. Subscription 1 — Morning Bundle A (active, started 4 weeks ago) ───
    const sub1Id = await ctx.db.insert("subscriptions", {
      customerId,
      label: "Morning Bundle A",
      status: "active" as const,
      billingModel: "prepaid_weekly_credit" as const,
      unitPrice: unitPriceA,
      confidentialPrice: true,
      baselineDailyQty: 5,
      weeklyQty: sub1WeeklyQty,
      deliverByTime: "09:00",
      creditRolloverPolicy: "expire" as const,
      rolloverExpiryWeeks: 4,
      changeCutoffHour: 13,
      changeCutoffDayOffset: -1,
      permanentChangeNoticeDays: 14,
      terminationNoticeDays: 30,
      cogsBasis: unitCostA,
      startDate: now - 28 * DAY_MS,
      scheduleTemplate: sub1Schedule,
      createdBy: userId,
      notes: "Dev seed — Sub A (Mon–Fri, 5 units/day at 09:00)",
    });

    // ── 3. Subscription 2 — Afternoon Bundle B (active, started 2 weeks ago) ─
    const sub2Id = await ctx.db.insert("subscriptions", {
      customerId,
      label: "Afternoon Bundle B",
      status: "active" as const,
      billingModel: "prepaid_weekly_credit" as const,
      unitPrice: unitPriceB,
      confidentialPrice: true,
      baselineDailyQty: 3,
      weeklyQty: sub2WeeklyQty,
      deliverByTime: "14:00",
      creditRolloverPolicy: "rollover" as const,
      rolloverExpiryWeeks: null,
      changeCutoffHour: 13,
      changeCutoffDayOffset: -1,
      permanentChangeNoticeDays: 14,
      terminationNoticeDays: 30,
      cogsBasis: unitCostB,
      startDate: now - 14 * DAY_MS,
      scheduleTemplate: sub2Schedule,
      createdBy: userId,
      notes: "Dev seed — Sub B (Mon/Wed/Fri, 3 units/day at 14:00)",
    });

    // ── 4. Supply agreement for Sub 1 (placeholder storage — see file header) ─
    let agreementId: Id<"supplyAgreements"> | null = null;
    let agreementSkipped = false;

    // Try to borrow an existing _storage ID as a placeholder for the file bytes.
    // Priority: feedback screenshot → businessSettings logo → any product photo.
    let placeholderStorageId: Id<"_storage"> | null = null;
    const fbRow = await ctx.db.query("feedback").first();
    if (fbRow?.screenshotStorageId) {
      placeholderStorageId = fbRow.screenshotStorageId;
    } else {
      const bizSettings = await ctx.db.query("businessSettings").first();
      if (bizSettings?.logoStorageId) {
        placeholderStorageId = bizSettings.logoStorageId;
      } else {
        const products = await ctx.db
          .query("menuProducts")
          .withIndex("by_active", (q) => q.eq("isActive", true))
          .collect();
        const withPhoto = products.find((p) => p.photoStorageId !== undefined);
        if (withPhoto?.photoStorageId) {
          placeholderStorageId = withPhoto.photoStorageId;
        }
      }
    }

    if (placeholderStorageId !== null) {
      const agreementUploadedAt = now - 7 * DAY_MS;
      agreementId = await ctx.db.insert("supplyAgreements", {
        customerId,
        subscriptionId: sub1Id,
        fileStorageId: placeholderStorageId,      // PLACEHOLDER — not a real agreement file
        fileName: "UAT-Supply-Agreement-ID.pdf",
        fileSize: 0,                              // Placeholder — actual bytes are unrelated
        uploadedBy: userId,
        uploadedAt: agreementUploadedAt,
        status: "signed" as const,
        signedDate: agreementUploadedAt + DAY_MS,
        governingLaw: "Hukum Indonesia / Indonesian Law",
        signatories: "Frollie Indonesia & PT UAT Cafe Indonesia",
        keyTerms: {
          weeklyQty: sub1WeeklyQty,
          unitPrice: unitPriceA,
          weeklyCreditAmount: sub1WeeklyCredit,
          baselineDailyQty: 5,
          deliverByTime: "09:00",
          permanentChangeNoticeDays: 14,
          terminationNoticeDays: 30,
          creditRolloverPolicy: "expire" as const,
          termType: "rolling_monthly",
        },
        versions: [
          {
            fileStorageId: placeholderStorageId,
            fileName: "UAT-Supply-Agreement-ID.pdf",
            uploadedAt: agreementUploadedAt,
            lang: "id" as const,
          },
          {
            // SEED LIMITATION: both versions share the same placeholder storage ID.
            // In production, each version has its own distinct uploaded file.
            fileStorageId: placeholderStorageId,
            fileName: "UAT-Supply-Agreement-EN.pdf",
            uploadedAt: agreementUploadedAt + 3_600_000,
            lang: "en" as const,
          },
        ],
      });
      // Bidirectional link: patch Sub 1 with agreementId (CRM principle A4)
      await ctx.db.patch(sub1Id, { agreementId });
    } else {
      agreementSkipped = true;
    }

    // ── 5. Current week for Sub 1 (status: delivering) ───────────────────────
    // weekStart = most recent Monday 00:00 WIB
    const weekStart = computeWeekStart(now);
    const { weekEnd } = computeWeekBounds(weekStart);

    // plannedDays: Mon–Fri (indices 0–4 from weekStart)
    const plannedDays = [0, 1, 2, 3, 4].map((i) => ({
      date: weekStart + i * DAY_MS,
      deliverByTime: "09:00",
      locked: i <= 2, // Mon–Wed locked (already delivered)
      items: sub1Items.map((si) => ({
        menuProductId: si.menuProductId,
        productName,
        qty: si.qty,
        unitPrice: unitPriceA,
        lineTotal: si.qty * unitPriceA,
      })),
    }));

    const weekId1 = await ctx.db.insert("subscriptionWeeks", {
      subscriptionId: sub1Id,
      weekStart,
      weekEnd,
      status: "delivering" as const,
      plannedDays,
      creditIssued: 0,     // postLedgerEntry re-derives these after each entry
      creditConsumed: 0,
      creditRemaining: 0,
      creditExpired: 0,
      shortfall: 0,
      shortfallFault: "none" as const,
      refundDue: 0,
      confirmedAt: weekStart,
      confirmedBy: userId,
      paymentReceivedAt: weekStart + 2 * 3_600_000, // Mon 02:00 WIB
    });

    // ── 6. Paid weekly invoice (funds the current week topup) ─────────────────
    const weeklyInvoiceId = await ctx.db.insert("invoices", {
      status: "final" as const,
      invoiceNumber: "INV-UAT-2606-001",
      subscriptionWeekId: weekId1,
      customerId,
      invoiceKind: "subscription_weekly" as const,
      generatedAt: weekStart - DAY_MS,              // Sun before week starts
      generatedBy: userId,
      updatedAt: weekStart + 2 * 3_600_000,         // Mon 02:00 (paid)
      sellerName: "Frollie Indonesia",
      sellerAddress: "Jl. Frollie No. 1, Jakarta Selatan",
      bankName: "BCA",
      bankAccountNumber: "6044830994",
      bankAccountName: "PT Malo Group Bahagia",
      buyerName: "UAT Cafe B2B",
      buyerCompany: "PT UAT Cafe Indonesia",
      buyerAddress: "Jl. Jend. Sudirman Kav. 52–53, Jakarta Selatan 12190",
      buyerPhone: UAT_PHONE,
      orderNumber: "INV-UAT-2606-001",
      orderDate: weekStart - DAY_MS,
      dueDate: weekStart,
      items: [
        {
          productName,
          qty: sub1WeeklyQty,
          unitPrice: unitPriceA,
          lineTotal: sub1WeeklyCredit,
          date: weekStart,
        },
      ],
      subtotal: sub1WeeklyCredit,
      finalTotal: sub1WeeklyCredit,
      paymentStatus: "Paid" as const,
      paymentMethod: "transfer",
      notes: "Seed: weekly credit for Morning Bundle A — current week",
    });

    // Link invoice to week
    await ctx.db.patch(weekId1, { weeklyInvoiceId });

    // ── 7. Opening topup ledger entry (posted when weekly invoice was paid) ───
    await postLedgerEntry(ctx, {
      subscriptionId: sub1Id,
      subscriptionWeekId: weekId1,
      type: "topup",
      amount: sub1WeeklyCredit,   // +1,875,000 IDR
      createdBy: userId,
      invoiceId: weeklyInvoiceId,
      note: "Weekly credit funded — INV-UAT-2606-001 (seed)",
    });

    // ── 8. Subscription orders Mon/Tue/Wed (Complete) + drawdown entries ──────
    // Delivered order quantities:  Mon=5, Tue=5, Wed=3 (partial — edge case for chart)
    const completedDays: { dayOffset: number; qty: number }[] = [
      { dayOffset: 0, qty: 5 },
      { dayOffset: 1, qty: 5 },
      { dayOffset: 2, qty: 3 },
    ];
    const completedOrderIds: Id<"orders">[] = [];

    for (const { dayOffset, qty } of completedDays) {
      const deliveryDate = weekStart + dayOffset * DAY_MS;
      const lineTotal = qty * unitPriceA;
      const lineCost = qty * unitCostA;

      const orderId = await ctx.db.insert("orders", {
        orderNumber: `UAT-${String(dayOffset + 1).padStart(3, "0")}`,
        customerId,
        customerName: "UAT Cafe B2B",
        customerPhone: UAT_PHONE,
        status: "Complete" as const,
        paymentStatus: "Paid" as const,
        paymentMethod: "subscription_credit",
        orderDate: deliveryDate,
        deliveryDate,
        dueDate: deliveryDate,
        confirmedAt: deliveryDate,
        totalAmount: lineTotal,
        totalCost: lineCost,
        totalMargin: lineTotal - lineCost,
        finalTotal: lineTotal,
        deliveryType: "Delivery",
        deliveryAddress: "Jl. Jend. Sudirman Kav. 52–53 (Lantai 1), Jakarta Selatan 12190",
        channel: "whatsapp" as const,
        soldBy: "System (subscription)",
        createdBy: "dev-seed",
        createdByUserId: userId,
        itemCount: menuProductId ? 1 : 0,
        isKitchenVisible: false,
        completedAt: deliveryDate + 6 * 3_600_000, // completed ~6h after delivery date
        subscriptionId: sub1Id,
        subscriptionWeekId: weekId1,
        fundingSource: "subscription_credit" as const,
      });

      if (menuProductId) {
        await ctx.db.insert("orderItems", {
          orderId,
          productName,
          quantity: qty,
          unitPrice: unitPriceA,
          unitCost: unitCostA,
          discountAmount: 0,
          lineTotal,
          lineCost,
          lineMargin: lineTotal - lineCost,
          menuProductId,
        });
      }

      // Drawdown for this delivered order
      await postLedgerEntry(ctx, {
        subscriptionId: sub1Id,
        subscriptionWeekId: weekId1,
        type: "drawdown",
        amount: -lineTotal,          // signed negative
        createdBy: userId,
        orderId,
        note: `Delivery day ${dayOffset + 1} (seed)`,
      });

      completedOrderIds.push(orderId);
    }

    // ── 9. Mid-week amendment topup — paid invoice (Wed) ─────────────────────
    // This is the "mid-week amendment top-up" the drawdown chart edge case tests.
    const amendmentAmount = 300_000;
    const amendmentInvoiceId = await ctx.db.insert("invoices", {
      status: "final" as const,
      invoiceNumber: "INV-UAT-2606-002",
      subscriptionWeekId: weekId1,
      customerId,
      invoiceKind: "subscription_topup" as const,
      generatedAt: weekStart + 2 * DAY_MS,                  // Wed
      generatedBy: userId,
      updatedAt: weekStart + 2 * DAY_MS + 3 * 3_600_000,    // Wed + 3h (paid same day)
      sellerName: "Frollie Indonesia",
      sellerAddress: "Jl. Frollie No. 1, Jakarta Selatan",
      bankName: "BCA",
      bankAccountNumber: "6044830994",
      bankAccountName: "PT Malo Group Bahagia",
      buyerName: "UAT Cafe B2B",
      buyerCompany: "PT UAT Cafe Indonesia",
      buyerAddress: "Jl. Jend. Sudirman Kav. 52–53, Jakarta Selatan 12190",
      buyerPhone: UAT_PHONE,
      orderNumber: "INV-UAT-2606-002",
      orderDate: weekStart + 2 * DAY_MS,
      items: [
        {
          productName: "Mid-week credit amendment (2 extra units Thu)",
          qty: 1,
          unitPrice: amendmentAmount,
          lineTotal: amendmentAmount,
          date: weekStart + 3 * DAY_MS,
        },
      ],
      subtotal: amendmentAmount,
      finalTotal: amendmentAmount,
      paymentStatus: "Paid" as const,
      paymentMethod: "transfer",
      notes: "Seed: mid-week amendment topup (paid) — INV-UAT-2606-002",
    });

    // Mid-week amendment topup ledger entry
    await postLedgerEntry(ctx, {
      subscriptionId: sub1Id,
      subscriptionWeekId: weekId1,
      type: "topup",
      amount: amendmentAmount,     // +300,000 IDR
      createdBy: userId,
      invoiceId: amendmentInvoiceId,
      note: "Mid-week amendment — INV-UAT-2606-002 (seed)",
    });

    // ── 10. Thu subscription order — BeingPrepared (in-progress) ─────────────
    const thuDate = weekStart + 3 * DAY_MS;
    const thuQty = 5;
    const thuLineTotal = thuQty * unitPriceA;
    const thuLineCost = thuQty * unitCostA;

    const thuOrderId = await ctx.db.insert("orders", {
      orderNumber: "UAT-004",
      customerId,
      customerName: "UAT Cafe B2B",
      customerPhone: UAT_PHONE,
      status: "BeingPrepared" as const,
      paymentStatus: "Paid" as const,
      paymentMethod: "subscription_credit",
      orderDate: thuDate,
      deliveryDate: thuDate,
      dueDate: thuDate,
      totalAmount: thuLineTotal,
      totalCost: thuLineCost,
      totalMargin: thuLineTotal - thuLineCost,
      finalTotal: thuLineTotal,
      deliveryType: "Delivery",
      deliveryAddress: "Jl. Jend. Sudirman Kav. 52–53 (Lantai 1), Jakarta Selatan 12190",
      channel: "whatsapp" as const,
      soldBy: "System (subscription)",
      createdBy: "dev-seed",
      createdByUserId: userId,
      itemCount: menuProductId ? 1 : 0,
      isKitchenVisible: true,
      subscriptionId: sub1Id,
      subscriptionWeekId: weekId1,
      fundingSource: "subscription_credit" as const,
    });

    if (menuProductId) {
      await ctx.db.insert("orderItems", {
        orderId: thuOrderId,
        productName,
        quantity: thuQty,
        unitPrice: unitPriceA,
        unitCost: unitCostA,
        discountAmount: 0,
        lineTotal: thuLineTotal,
        lineCost: thuLineCost,
        lineMargin: thuLineTotal - thuLineCost,
        menuProductId,
      });
    }

    // ── 11. Unpaid amendment invoice — triggers Draft-WA button ──────────────
    // This is the "unpaid invoice" the UAT spec requires.
    // Balance after seed: 1,875,000 - 375,000 - 375,000 - 225,000 + 300,000 = 1,200,000 IDR
    const pendingAmount = 450_000;
    const unpaidInvoiceId = await ctx.db.insert("invoices", {
      status: "final" as const,
      invoiceNumber: "INV-UAT-2606-003",
      subscriptionWeekId: weekId1,
      customerId,
      invoiceKind: "subscription_topup" as const,
      generatedAt: weekStart + 3 * DAY_MS,          // Thu
      generatedBy: userId,
      updatedAt: weekStart + 3 * DAY_MS,
      sellerName: "Frollie Indonesia",
      sellerAddress: "Jl. Frollie No. 1, Jakarta Selatan",
      bankName: "BCA",
      bankAccountNumber: "6044830994",
      bankAccountName: "PT Malo Group Bahagia",
      buyerName: "UAT Cafe B2B",
      buyerCompany: "PT UAT Cafe Indonesia",
      buyerAddress: "Jl. Jend. Sudirman Kav. 52–53, Jakarta Selatan 12190",
      buyerPhone: UAT_PHONE,
      orderNumber: "INV-UAT-2606-003",
      orderDate: weekStart + 3 * DAY_MS,
      dueDate: weekStart + 5 * DAY_MS,              // Due Sat
      items: [
        {
          productName: "Additional credit — Fri batch top-up",
          qty: 1,
          unitPrice: pendingAmount,
          lineTotal: pendingAmount,
          date: weekStart + 4 * DAY_MS,
        },
      ],
      subtotal: pendingAmount,
      finalTotal: pendingAmount,
      paymentStatus: "Unpaid" as const,
      notes: "Seed: pending amendment — activates Draft-WA button (INV-UAT-2606-003)",
    });

    // ── 12. Non-subscription orders (for kanban + order-surface customer-link) ─
    const draftOrderId = await ctx.db.insert("orders", {
      orderNumber: "UAT-005",
      customerId,
      customerName: "UAT Cafe B2B",
      customerPhone: UAT_PHONE,
      status: "Draft" as const,
      paymentStatus: "Unpaid" as const,
      orderDate: now - 2 * DAY_MS,
      totalAmount: 3 * 85_000,
      totalCost: 3 * unitCostA,
      totalMargin: 3 * (85_000 - unitCostA),
      finalTotal: 3 * 85_000,
      deliveryType: "Pickup",
      channel: "instagram" as const,
      soldBy: "Budi",
      createdBy: "dev-seed",
      createdByUserId: userId,
      itemCount: 0,
      isKitchenVisible: false,
    });

    const apOrderId = await ctx.db.insert("orders", {
      orderNumber: "UAT-006",
      customerId,
      customerName: "UAT Cafe B2B",
      customerPhone: UAT_PHONE,
      status: "AwaitingPayment" as const,
      paymentStatus: "Unpaid" as const,
      orderDate: now - DAY_MS,
      awaitingPaymentSince: now - DAY_MS,
      totalAmount: 10 * unitPriceA,
      totalCost: 10 * unitCostA,
      totalMargin: 10 * (unitPriceA - unitCostA),
      finalTotal: 10 * unitPriceA,
      deliveryType: "Delivery",
      deliveryAddress: "Jl. Jend. Sudirman Kav. 52–53 (Lantai 1), Jakarta Selatan 12190",
      channel: "whatsapp" as const,
      soldBy: "Budi",
      createdBy: "dev-seed",
      createdByUserId: userId,
      itemCount: 0,
      isKitchenVisible: false,
    });

    // ── 13. Sub 2: past closed week (2 weeks ago) with paid invoice ───────────
    // This demonstrates: switching the selector to Sub 2 shows a different/empty current week,
    // and the Sub 2 customer hub shows no current-week credit gauge (empty state).
    const pastWeekStart = computeWeekStart(now - 14 * DAY_MS);
    const { weekEnd: pastWeekEnd } = computeWeekBounds(pastWeekStart);

    const sub2WeekId = await ctx.db.insert("subscriptionWeeks", {
      subscriptionId: sub2Id,
      weekStart: pastWeekStart,
      weekEnd: pastWeekEnd,
      status: "closed" as const,
      plannedDays: sub2Items.length > 0
        ? [0, 2, 4].map((i) => ({
            date: pastWeekStart + i * DAY_MS,
            deliverByTime: "14:00",
            locked: true,
            items: sub2Items.map((si) => ({
              menuProductId: si.menuProductId,
              productName,
              qty: si.qty,
              unitPrice: unitPriceB,
              lineTotal: si.qty * unitPriceB,
            })),
          }))
        : [],
      creditIssued: 0,
      creditConsumed: 0,
      creditRemaining: 0,
      creditExpired: 0,
      shortfall: 0,
      shortfallFault: "none" as const,
      refundDue: 0,
    });

    const sub2WeeklyCredit = sub2WeeklyQty * unitPriceB;  // 9 * 65,000 = 585,000

    const sub2InvoiceId = await ctx.db.insert("invoices", {
      status: "final" as const,
      invoiceNumber: "INV-UAT-2606-004",
      subscriptionWeekId: sub2WeekId,
      customerId,
      invoiceKind: "subscription_weekly" as const,
      generatedAt: pastWeekStart - DAY_MS,          // Sun before past week
      generatedBy: userId,
      updatedAt: pastWeekStart + 2 * 3_600_000,     // Paid Mon 02:00
      sellerName: "Frollie Indonesia",
      sellerAddress: "Jl. Frollie No. 1, Jakarta Selatan",
      bankName: "BCA",
      bankAccountNumber: "6044830994",
      bankAccountName: "PT Malo Group Bahagia",
      buyerName: "UAT Cafe B2B",
      buyerCompany: "PT UAT Cafe Indonesia",
      buyerAddress: "Jl. Jend. Sudirman Kav. 52–53, Jakarta Selatan 12190",
      buyerPhone: UAT_PHONE,
      orderNumber: "INV-UAT-2606-004",
      orderDate: pastWeekStart - DAY_MS,
      items: [
        {
          productName,
          qty: sub2WeeklyQty,
          unitPrice: unitPriceB,
          lineTotal: sub2WeeklyCredit,
          date: pastWeekStart,
        },
      ],
      subtotal: sub2WeeklyCredit,
      finalTotal: sub2WeeklyCredit,
      paymentStatus: "Paid" as const,
      paymentMethod: "transfer",
      notes: "Seed: Sub B past week weekly invoice (closed)",
    });

    await ctx.db.patch(sub2WeekId, { weeklyInvoiceId: sub2InvoiceId });

    // Post sub2 topup so the past week's credit pool isn't all-zero
    await postLedgerEntry(ctx, {
      subscriptionId: sub2Id,
      subscriptionWeekId: sub2WeekId,
      type: "topup",
      amount: sub2WeeklyCredit,
      createdBy: userId,
      invoiceId: sub2InvoiceId,
      note: "Past week credit funded (seed)",
    });

    // ── Return ────────────────────────────────────────────────────────────────
    const creditBalance =
      sub1WeeklyCredit        // +1,875,000
      - completedDays.reduce((s, d) => s + d.qty * unitPriceA, 0) // -975,000
      + amendmentAmount;       // +300,000  → 1,200,000 IDR remaining

    return {
      alreadySeeded: false,
      customerId,
      subscriptionIds: { sub1: sub1Id, sub2: sub2Id },
      weekIds: { sub1CurrentWeek: weekId1, sub2PastWeek: sub2WeekId },
      invoiceIds: {
        weeklyPaid: weeklyInvoiceId,
        amendmentPaid: amendmentInvoiceId,
        amendmentUnpaid: unpaidInvoiceId,
        sub2WeeklyPaid: sub2InvoiceId,
      },
      orderIds: {
        completedSubscription: completedOrderIds,
        inProgressSubscription: thuOrderId,
        draft: draftOrderId,
        awaitingPayment: apOrderId,
      },
      agreementId,
      agreementSkipped,
      creditBalance,
      summary: [
        `Customer: UAT Cafe B2B — ${customerId}`,
        `Sub 1 (Morning Bundle A, Mon–Fri 5 units @ 09:00): ${sub1Id}`,
        `Sub 2 (Afternoon Bundle B, Mon/Wed/Fri 3 units @ 14:00): ${sub2Id}`,
        `Current week (Sub 1, delivering): ${weekId1}`,
        `  Ledger: +${sub1WeeklyCredit.toLocaleString()} IDR topup → 3 drawdowns → +${amendmentAmount.toLocaleString()} IDR mid-week topup`,
        `  Remaining credit: ${creditBalance.toLocaleString()} IDR`,
        `Invoices: 2 paid (weekly + amendment), 1 UNPAID (INV-UAT-2606-003 = Draft-WA trigger)`,
        `Orders: 3 Complete subscription + 1 BeingPrepared + 1 Draft + 1 AwaitingPayment`,
        agreementSkipped
          ? "Agreement: SKIPPED (no _storage file found to borrow — create manually via /crm/customers/:id/agreements)"
          : `Agreement: ${agreementId} (placeholder storage — Open URL resolves but file is unrelated to agreement)`,
        `Navigate to: /crm/customers/${customerId}`,
      ].join("\n"),
      navigate: `/crm/customers/${customerId}`,
    };
  },
});

/**
 * UAT fixture for Phase E Slice-2 rule enforcement (Journey A).
 *
 * Creates a NEXT-week **planned** (editable) week for Sub 1 "Morning Bundle A"
 * so the schedule page surfaces BOTH new journey-A elements:
 *   - Mon (day 0): `locked: true` on a planned week → amber "past 13:00 cutoff"
 *     warning. Add-product stays ENABLED (warn-not-lock invariant).
 *   - Tue (day 1): qty 8 > baseline 5, `needsSupplierConfirmation: true` →
 *     orange supplier-confirmation badge.
 *   - Wed–Fri: baseline qty 5, editable (operator can bump one above baseline
 *     live and Save to exercise the enforcement write-path badge).
 *
 * Idempotent: deletes any pre-existing week at next-week weekStart for Sub 1
 * before inserting. Self-guards vs prod. Dev-only.
 */
export const seedCutoffFixture = mutation({
  args: {},
  handler: async (ctx) => {
    const cloudUrl = process.env.CONVEX_CLOUD_URL ?? "";
    if (cloudUrl.includes("decisive-wombat-7")) {
      throw new Error(
        "seedCutoffFixture: REFUSED — CONVEX_CLOUD_URL targets production. Dev only.",
      );
    }

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_phone", (q) => q.eq("phone", UAT_PHONE))
      .first();
    if (!customer) {
      throw new Error("seedCutoffFixture: run seedCrmUat first (UAT customer missing).");
    }

    const subs = await ctx.db
      .query("subscriptions")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .collect();
    const sub1 = subs.find((s) => s.label === "Morning Bundle A");
    if (!sub1) {
      throw new Error("seedCutoffFixture: Sub 1 'Morning Bundle A' not found.");
    }

    const menuProduct = await ctx.db
      .query("menuProducts")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .first();
    const menuProductId = menuProduct?._id;
    const productName = menuProduct?.name ?? "Frollie Snack";
    const unitPrice = sub1.unitPrice;
    const baseline = sub1.baselineDailyQty ?? 5;

    const now = Date.now();
    const nextWeekStart = computeWeekStart(now) + 7 * DAY_MS;
    const { weekEnd } = computeWeekBounds(nextWeekStart);

    // Idempotent: drop existing next-week row for this sub.
    const existingWeek = await ctx.db
      .query("subscriptionWeeks")
      .withIndex("by_subscription_weekStart", (q) =>
        q.eq("subscriptionId", sub1._id).eq("weekStart", nextWeekStart),
      )
      .first();
    if (existingWeek) {
      await ctx.db.delete(existingWeek._id);
    }

    const mkItems = (qty: number) =>
      menuProductId
        ? [
            {
              menuProductId,
              productName,
              qty,
              unitPrice,
              lineTotal: qty * unitPrice,
            },
          ]
        : [];

    const plannedDays = [0, 1, 2, 3, 4].map((i) => {
      const aboveBaseline = i === 1;
      const qty = aboveBaseline ? baseline + 3 : baseline; // Tue = 8 (>5)
      return {
        date: nextWeekStart + i * DAY_MS,
        deliverByTime: "09:00",
        items: mkItems(qty),
        locked: i === 0, // Mon locked on a planned week → cutoff warning
        needsSupplierConfirmation: aboveBaseline, // Tue above baseline → badge
      };
    });

    const weekId = await ctx.db.insert("subscriptionWeeks", {
      subscriptionId: sub1._id,
      weekStart: nextWeekStart,
      weekEnd,
      status: "planned" as const,
      plannedDays,
      creditIssued: 0,
      creditConsumed: 0,
      creditRemaining: 0,
      creditExpired: 0,
      shortfall: 0,
      shortfallFault: "none" as const,
      refundDue: 0,
    });

    return {
      ok: true,
      subscriptionId: sub1._id,
      weekId,
      weekStart: nextWeekStart,
      baseline,
      navigate: `/crm/customers/${customer._id}/subscriptions/${sub1._id}/week?weekStart=${nextWeekStart}`,
      summary:
        `Planned next-week fixture for Sub 1 (baseline ${baseline}): ` +
        `Mon locked (cutoff warning), Tue qty ${baseline + 3} (supplier badge), Wed–Fri editable @ ${baseline}. ` +
        `Open schedule at weekStart=${nextWeekStart}.`,
    };
  },
});

/**
 * Dev-only reset for the CRM UAT fixture.
 *
 * seedCrmUat is idempotent-by-customer (matches UAT_PHONE) and returns early if
 * the customer row exists. When a UAT run partially clears data (e.g. deletes
 * subscriptions/weeks but leaves the customer), the seed can no longer rebuild
 * a clean fixture. This mutation cascade-deletes every UAT-linked entity so the
 * next seedCrmUat run recreates everything fresh.
 *
 * Purges (all reachable from the UAT customer):
 *   orders + orderItems, invoices, supplyAgreements,
 *   subscriptions → subscriptionWeeks + creditLedger, then the customer.
 *
 * Prod-safety: refuses to run against decisive-wombat-7.
 *
 * Run from dashboard (dev only): subscriptions/_devSeed:resetCrmUat
 */
export const resetCrmUat = mutation({
  args: {},
  handler: async (ctx) => {
    const cloudUrl = process.env.CONVEX_CLOUD_URL ?? "";
    if (cloudUrl.includes("decisive-wombat-7")) {
      throw new Error(
        "resetCrmUat: REFUSED — CONVEX_CLOUD_URL targets production. Dev only.",
      );
    }

    const customer = await ctx.db
      .query("customers")
      .withIndex("by_phone", (q) => q.eq("phone", UAT_PHONE))
      .first();
    if (!customer) {
      return { ok: true, found: false, summary: "No UAT customer to reset." };
    }
    const customerId = customer._id;

    const counts = {
      orderItems: 0,
      orders: 0,
      invoices: 0,
      supplyAgreements: 0,
      subscriptionWeeks: 0,
      creditLedger: 0,
      subscriptions: 0,
      customers: 0,
    };

    // ── Orders + their line items ─────────────────────────────────────────────
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_customer", (q) => q.eq("customerId", customerId))
      .collect();
    for (const order of orders) {
      const items = await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();
      for (const item of items) {
        await ctx.db.delete(item._id);
        counts.orderItems++;
      }
      await ctx.db.delete(order._id);
      counts.orders++;
    }

    // ── Invoices ──────────────────────────────────────────────────────────────
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_customer", (q) => q.eq("customerId", customerId))
      .collect();
    for (const inv of invoices) {
      await ctx.db.delete(inv._id);
      counts.invoices++;
    }

    // ── Supply agreements ─────────────────────────────────────────────────────
    const agreements = await ctx.db
      .query("supplyAgreements")
      .withIndex("by_customer", (q) => q.eq("customerId", customerId))
      .collect();
    for (const ag of agreements) {
      await ctx.db.delete(ag._id);
      counts.supplyAgreements++;
    }

    // ── Subscriptions → weeks + ledger ────────────────────────────────────────
    const subs = await ctx.db
      .query("subscriptions")
      .withIndex("by_customer", (q) => q.eq("customerId", customerId))
      .collect();
    for (const sub of subs) {
      const weeks = await ctx.db
        .query("subscriptionWeeks")
        .withIndex("by_subscription_weekStart", (q) =>
          q.eq("subscriptionId", sub._id),
        )
        .collect();
      for (const w of weeks) {
        await ctx.db.delete(w._id);
        counts.subscriptionWeeks++;
      }
      const ledger = await ctx.db
        .query("creditLedger")
        .withIndex("by_subscription", (q) => q.eq("subscriptionId", sub._id))
        .collect();
      for (const entry of ledger) {
        await ctx.db.delete(entry._id);
        counts.creditLedger++;
      }
      await ctx.db.delete(sub._id);
      counts.subscriptions++;
    }

    // ── Customer ──────────────────────────────────────────────────────────────
    await ctx.db.delete(customerId);
    counts.customers = 1;

    return {
      ok: true,
      found: true,
      counts,
      summary:
        `Purged UAT fixture: ${counts.subscriptions} subs, ${counts.subscriptionWeeks} weeks, ` +
        `${counts.creditLedger} ledger, ${counts.orders} orders, ${counts.invoices} invoices, ` +
        `${counts.supplyAgreements} agreements, 1 customer. Re-run seedCrmUat.`,
    };
  },
});
