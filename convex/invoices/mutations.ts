/**
 * Invoice mutations -- create, update, discard, and finalize invoices.
 *
 * Key flows:
 * - createDraft: Auto-fills from order, customer, and business settings
 * - updateDraft: Partial update of draft fields (paymentStatus/paymentMethod excluded)
 * - discardDraft: Deletes a draft invoice
 * - finalize: Assigns race-safe INV-YYMM-NNN number and writes back buyer data to customer
 */

import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { protectedMutation } from "../lib/functions";
import { getWibComponents } from "../lib/periodRange";
import type { MutationCtx } from "../_generated/server";

/** Order statuses that allow invoice creation. Allowlist (not blocklist) to prevent
 *  silently allowing future status additions.
 *  Includes legacy statuses still present on unmigrated documents representing
 *  paid orders that should be invoiceable. */
export const INVOICEABLE_STATUSES = new Set([
  // Modern statuses
  "PaymentReceived",
  "BeingPrepared",
  "AwaitingDelivery",
  "Complete",
  // Legacy statuses (unmigrated documents)
  "Confirmed",
  "InProduction",
  "Boxed",
  "Labeled",
  "Packaging",
  "WaitingShipment",
  "WaitingPickup",
  "CompleteShipped",
  "PickedUp",
] as const);

/**
 * Check if an order status is invoiceable.
 * Type guard that checks against the INVOICEABLE_STATUSES set.
 * Pure function exported for testing.
 */
export function isInvoiceableStatus(status: string): boolean {
  return (INVOICEABLE_STATUSES as Set<string>).has(status);
}

/**
 * Build the YYMM prefix for invoice numbering from a UTC timestamp.
 * Uses WIB timezone (UTC+7) for the month boundary.
 * Pure function exported for testing.
 */
export function buildInvoicePrefix(utcMs: number): string {
  const { year, month } = getWibComponents(utcMs);
  return `${String(year).slice(-2)}${String(month + 1).padStart(2, "0")}`;
}

/**
 * Format an invoice number from prefix and sequence.
 * Pure function exported for testing.
 */
export function formatInvoiceNumber(prefix: string, sequence: number): string {
  return `INV-${prefix}-${String(sequence).padStart(3, "0")}`;
}

/**
 * Compute discount amount and label from order-level discount fields.
 * Pure function exported for testing.
 */
export function computeDiscount(
  subtotal: number,
  discountValue: number | undefined,
  discountType: "amount" | "percentage" | undefined,
): { discountAmount?: number; discountLabel?: string } {
  if (!discountValue || discountValue <= 0) return {};
  if (!discountType) return {}; // No discount type = no discount applied
  if (discountType === "percentage") {
    return {
      discountAmount: Math.round(subtotal * (discountValue / 100)),
      discountLabel: `${discountValue}%`,
    };
  }
  return { discountAmount: discountValue };
}

/**
 * Compute the customer write-back patch for finalize.
 * Returns only fields that differ from the current customer record.
 * Pure function exported for testing.
 */
export function computeCustomerWriteBack(
  invoice: { buyerCompany?: string; buyerNpwp?: string; buyerAddress?: string },
  customer: { companyName?: string; npwp?: string; billingAddress?: string },
): Record<string, string> {
  const patch: Record<string, string> = {};
  if (invoice.buyerCompany && invoice.buyerCompany !== customer.companyName) {
    patch.companyName = invoice.buyerCompany;
  }
  if (invoice.buyerNpwp && invoice.buyerNpwp !== customer.npwp) {
    patch.npwp = invoice.buyerNpwp;
  }
  if (invoice.buyerAddress && invoice.buyerAddress !== customer.billingAddress) {
    patch.billingAddress = invoice.buyerAddress;
  }
  return patch;
}

/**
 * Generate the next sequential invoice number for the current WIB month.
 *
 * Format: INV-YYMM-NNN (e.g., INV-2603-001)
 * Uses invoiceCounters table with OCC-safe read-increment-write.
 */
async function getNextInvoiceNumber(ctx: MutationCtx): Promise<string> {
  const prefix = buildInvoicePrefix(Date.now());

  // Use .first() instead of .unique() for safety (gracefully handles duplicates)
  const counter = await ctx.db
    .query("invoiceCounters")
    .withIndex("by_prefix", (q) => q.eq("prefix", prefix))
    .first();

  let sequence: number;
  if (counter) {
    sequence = counter.lastNumber + 1;
    await ctx.db.patch(counter._id, { lastNumber: sequence });
  } else {
    sequence = 1;
    await ctx.db.insert("invoiceCounters", { prefix, lastNumber: 1 });
  }

  return formatInvoiceNumber(prefix, sequence);
}

/**
 * Create a draft invoice from an order.
 *
 * Auto-fills seller info from business settings, buyer info from customer,
 * and line items from order items. Validates:
 * - Order status is in INVOICEABLE_STATUSES allowlist
 * - No existing draft for this order
 * - Bank account is configured in business settings
 * - Order has at least one item
 */
export const createDraft = protectedMutation({
  roles: ["admin", "manager"],
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    // 1. Read the order
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new ConvexError("Order not found");
    }

    // 2. Validate order status via allowlist
    if (!isInvoiceableStatus(order.status)) {
      throw new ConvexError(
        `Cannot create invoice for order with status '${order.status}'. Order must be PaymentReceived or later.`,
      );
    }

    // 3. Check no existing draft for this order
    const existingDraft = await ctx.db
      .query("invoices")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .filter((q) => q.eq(q.field("status"), "draft"))
      .first();
    if (existingDraft) {
      throw new ConvexError("Draft invoice already exists for this order");
    }

    // 4. Read customer
    const customer = await ctx.db.get(order.customerId);
    if (!customer) {
      throw new ConvexError("Customer not found for this order");
    }

    // 5. Read business settings
    const settings = await ctx.db.query("businessSettings").first();

    // 6. Resolve bank account with guard
    if (!settings || !settings.defaultBankAccountId) {
      throw new ConvexError(
        "No bank account configured. Please set a default bank account in Business Settings before creating invoices.",
      );
    }
    const bankAccount = await ctx.db.get(settings.defaultBankAccountId);
    if (!bankAccount) {
      throw new ConvexError(
        "No bank account configured. Please set a default bank account in Business Settings before creating invoices.",
      );
    }

    // 7. Build order items
    const orderItems = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .filter((q) => q.neq(q.field("isCancelled"), true))
      .collect();

    if (orderItems.length === 0) {
      throw new ConvexError("Cannot create invoice for an order with no items.");
    }

    const items = await Promise.all(
      orderItems.map(async (item) => {
        // Resolve product name from menuProducts if linked
        let productName = item.productName;
        if (item.menuProductId) {
          const mp = await ctx.db.get(item.menuProductId);
          if (mp) productName = mp.name;
        }
        return {
          productName,
          variant: item.productVariant,
          qty: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        };
      }),
    );

    // 8. Calculate totals
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

    const { discountAmount, discountLabel } = computeDiscount(
      subtotal,
      order.orderLevelDiscount,
      order.orderLevelDiscountType,
    );

    // 9. Snapshot payment info from order
    const paymentStatus = order.paymentStatus;
    const paymentMethod = order.paymentMethod;

    // 10. Insert draft invoice
    const invoiceId = await ctx.db.insert("invoices", {
      status: "draft",
      orderId: args.orderId,
      generatedBy: ctx.user._id,
      updatedAt: Date.now(),
      // Seller snapshot
      sellerName: settings.businessName,
      sellerAddress: settings.address,
      sellerPhone: settings.phone,
      sellerEmail: settings.email,
      sellerNpwp: settings.npwp,
      sellerLogoStorageId: settings.logoStorageId,
      // Bank snapshot
      bankName: bankAccount.bankName,
      bankAccountNumber: bankAccount.accountNumber,
      bankAccountName: bankAccount.name,
      // Buyer snapshot
      buyerName: customer.name,
      buyerCompany: customer.companyName,
      buyerNpwp: customer.npwp,
      buyerAddress: customer.billingAddress ?? customer.defaultAddress,
      buyerPhone: customer.phone,
      // Order snapshot
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      dueDate: order.dueDate,
      items,
      subtotal,
      discountAmount,
      discountLabel,
      deliveryFee: order.deliveryFee,
      finalTotal: order.finalTotal,
      paymentStatus,
      paymentMethod,
    });

    return invoiceId;
  },
});

/**
 * Update a draft invoice with partial fields.
 *
 * Only draft invoices can be updated. Finalized invoices are immutable.
 * paymentStatus and paymentMethod are NOT editable -- they are snapshotted
 * from the order at draft creation time.
 */
export const updateDraft = protectedMutation({
  roles: ["admin", "manager"],
  args: {
    invoiceId: v.id("invoices"),
    buyerName: v.optional(v.string()),
    buyerCompany: v.optional(v.string()),
    buyerNpwp: v.optional(v.string()),
    buyerAddress: v.optional(v.string()),
    buyerPhone: v.optional(v.string()),
    poNumber: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    notes: v.optional(v.string()),
    items: v.optional(
      v.array(
        v.object({
          productName: v.string(),
          variant: v.optional(v.string()),
          qty: v.number(),
          unitPrice: v.number(),
          lineTotal: v.number(),
        }),
      ),
    ),
    subtotal: v.optional(v.number()),
    discountAmount: v.optional(v.number()),
    discountLabel: v.optional(v.string()),
    deliveryFee: v.optional(v.number()),
    finalTotal: v.optional(v.number()),
    sellerName: v.optional(v.string()),
    sellerAddress: v.optional(v.string()),
    sellerPhone: v.optional(v.string()),
    sellerEmail: v.optional(v.string()),
    sellerNpwp: v.optional(v.string()),
    bankName: v.optional(v.string()),
    bankAccountNumber: v.optional(v.string()),
    bankAccountName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) {
      throw new ConvexError("Invoice not found");
    }
    if (invoice.status !== "draft") {
      throw new ConvexError("Cannot update a finalized invoice");
    }

    const { invoiceId: _, ...updates } = args;
    await ctx.db.patch(invoice._id, {
      ...updates,
      updatedAt: Date.now(),
    });

    return invoice._id;
  },
});

/**
 * Discard (delete) a draft invoice.
 *
 * Only draft invoices can be discarded. Finalized invoices cannot be deleted.
 */
export const discardDraft = protectedMutation({
  roles: ["admin", "manager"],
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) {
      throw new ConvexError("Invoice not found");
    }
    if (invoice.status !== "draft") {
      throw new ConvexError("Cannot discard a finalized invoice");
    }

    await ctx.db.delete(invoice._id);
    return true;
  },
});

/**
 * Finalize a draft invoice.
 *
 * Assigns a sequential INV-YYMM-NNN invoice number using the invoiceCounters
 * table for race-safe numbering. Patches the invoice to status="final" with
 * the generated number and timestamp.
 *
 * Also writes back buyer details (company, NPWP, billing address) to the
 * customer record if they differ.
 */
export const finalize = protectedMutation({
  roles: ["admin", "manager"],
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    // 1. Get invoice and verify draft status
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) {
      throw new ConvexError("Invoice not found");
    }
    if (invoice.status !== "draft") {
      throw new ConvexError("Cannot finalize an invoice that is not a draft");
    }

    // 2. Generate invoice number
    const invoiceNumber = await getNextInvoiceNumber(ctx);

    // 3. Patch invoice to final
    await ctx.db.patch(invoice._id, {
      status: "final",
      invoiceNumber,
      generatedAt: Date.now(),
    });

    // 4. Customer write-back
    const order = await ctx.db.get(invoice.orderId);
    if (order) {
      const customer = await ctx.db.get(order.customerId);
      if (customer) {
        const patch = computeCustomerWriteBack(invoice, customer);
        if (Object.keys(patch).length > 0) {
          await ctx.db.patch(customer._id, patch);
        }
      }
    }

    // 5. Return result
    return { invoiceId: args.invoiceId, invoiceNumber };
  },
});
