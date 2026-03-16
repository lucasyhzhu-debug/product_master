/**
 * Tests for invoice mutation helpers and validation logic.
 *
 * Tests the exported pure functions from invoices/mutations.ts:
 * - INVOICEABLE_STATUSES allowlist (status validation)
 * - Invoice number prefix generation (WIB timezone)
 * - Invoice number formatting (INV-YYMM-NNN)
 * - Discount computation (percentage and flat)
 * - Customer write-back patch computation
 *
 * The ctx-dependent mutation handlers are tested indirectly via these
 * extracted helpers. Auth-gated convex-test runtime tests are deferred
 * per project convention (see bigsellerOrders/__tests__/mutations.test.ts).
 */

import { describe, it, expect } from "vitest";
import {
  INVOICEABLE_STATUSES,
  isInvoiceableStatus,
  buildInvoicePrefix,
  formatInvoiceNumber,
  computeDiscount,
  computeCustomerWriteBack,
} from "../mutations";

// ============================================
// Status Allowlist Validation
// ============================================
describe("INVOICEABLE_STATUSES allowlist", () => {
  it("contains exactly 4 statuses", () => {
    expect(INVOICEABLE_STATUSES.size).toBe(4);
  });

  it("includes PaymentReceived", () => {
    expect(INVOICEABLE_STATUSES.has("PaymentReceived")).toBe(true);
  });

  it("includes BeingPrepared", () => {
    expect(INVOICEABLE_STATUSES.has("BeingPrepared")).toBe(true);
  });

  it("includes AwaitingDelivery", () => {
    expect(INVOICEABLE_STATUSES.has("AwaitingDelivery")).toBe(true);
  });

  it("includes Complete", () => {
    expect(INVOICEABLE_STATUSES.has("Complete")).toBe(true);
  });

  it("does NOT include Draft", () => {
    expect(INVOICEABLE_STATUSES.has("Draft" as any)).toBe(false);
  });

  it("does NOT include AwaitingPayment", () => {
    expect(INVOICEABLE_STATUSES.has("AwaitingPayment" as any)).toBe(false);
  });

  it("does NOT include Cancelled", () => {
    expect(INVOICEABLE_STATUSES.has("Cancelled" as any)).toBe(false);
  });
});

describe("isInvoiceableStatus", () => {
  it("returns true for PaymentReceived", () => {
    expect(isInvoiceableStatus("PaymentReceived")).toBe(true);
  });

  it("returns true for BeingPrepared", () => {
    expect(isInvoiceableStatus("BeingPrepared")).toBe(true);
  });

  it("returns true for AwaitingDelivery", () => {
    expect(isInvoiceableStatus("AwaitingDelivery")).toBe(true);
  });

  it("returns true for Complete", () => {
    expect(isInvoiceableStatus("Complete")).toBe(true);
  });

  it("returns false for Draft", () => {
    expect(isInvoiceableStatus("Draft")).toBe(false);
  });

  it("returns false for AwaitingPayment", () => {
    expect(isInvoiceableStatus("AwaitingPayment")).toBe(false);
  });

  it("returns false for Cancelled", () => {
    expect(isInvoiceableStatus("Cancelled")).toBe(false);
  });

  it("returns false for legacy statuses (Confirmed, InProduction)", () => {
    expect(isInvoiceableStatus("Confirmed")).toBe(false);
    expect(isInvoiceableStatus("InProduction")).toBe(false);
  });

  it("returns false for unknown status", () => {
    expect(isInvoiceableStatus("SomeNewStatus")).toBe(false);
  });
});

// ============================================
// Invoice Number Prefix Generation
// ============================================
describe("buildInvoicePrefix", () => {
  it("generates YYMM format for March 2026 WIB", () => {
    // 2026-03-15 12:00:00 UTC = 2026-03-15 19:00:00 WIB (still March)
    const utcMs = Date.UTC(2026, 2, 15, 12, 0, 0); // month is 0-indexed
    expect(buildInvoicePrefix(utcMs)).toBe("2603");
  });

  it("generates YYMM format for January 2026 WIB", () => {
    const utcMs = Date.UTC(2026, 0, 15, 12, 0, 0);
    expect(buildInvoicePrefix(utcMs)).toBe("2601");
  });

  it("generates YYMM format for December 2026 WIB", () => {
    const utcMs = Date.UTC(2026, 11, 15, 12, 0, 0);
    expect(buildInvoicePrefix(utcMs)).toBe("2612");
  });

  it("handles WIB timezone boundary (late UTC = next day WIB but same month)", () => {
    // 2026-03-31 20:00 UTC = 2026-04-01 03:00 WIB -> April in WIB
    const utcMs = Date.UTC(2026, 2, 31, 20, 0, 0);
    expect(buildInvoicePrefix(utcMs)).toBe("2604");
  });

  it("pads single-digit month with leading zero", () => {
    // February
    const utcMs = Date.UTC(2026, 1, 15, 12, 0, 0);
    expect(buildInvoicePrefix(utcMs)).toBe("2602");
  });

  it("uses 2-digit year (handles 2030)", () => {
    const utcMs = Date.UTC(2030, 5, 15, 12, 0, 0);
    expect(buildInvoicePrefix(utcMs)).toBe("3006");
  });
});

// ============================================
// Invoice Number Formatting
// ============================================
describe("formatInvoiceNumber", () => {
  it("formats INV-YYMM-NNN for first invoice", () => {
    expect(formatInvoiceNumber("2603", 1)).toBe("INV-2603-001");
  });

  it("zero-pads sequence to 3 digits", () => {
    expect(formatInvoiceNumber("2603", 5)).toBe("INV-2603-005");
    expect(formatInvoiceNumber("2603", 42)).toBe("INV-2603-042");
  });

  it("handles 3-digit sequence without extra padding", () => {
    expect(formatInvoiceNumber("2603", 100)).toBe("INV-2603-100");
    expect(formatInvoiceNumber("2603", 999)).toBe("INV-2603-999");
  });

  it("handles sequence > 999 (no truncation)", () => {
    expect(formatInvoiceNumber("2603", 1000)).toBe("INV-2603-1000");
  });

  it("uses different prefixes for different months", () => {
    const jan = formatInvoiceNumber("2601", 1);
    const feb = formatInvoiceNumber("2602", 1);
    expect(jan).toBe("INV-2601-001");
    expect(feb).toBe("INV-2602-001");
    expect(jan).not.toBe(feb);
  });
});

// ============================================
// Discount Computation
// ============================================
describe("computeDiscount", () => {
  it("returns empty object when no discount value", () => {
    expect(computeDiscount(100000, undefined, undefined)).toEqual({});
  });

  it("returns empty object when discount value is 0", () => {
    expect(computeDiscount(100000, 0, "amount")).toEqual({});
  });

  it("returns empty object when discount value is negative", () => {
    expect(computeDiscount(100000, -5000, "amount")).toEqual({});
  });

  it("computes flat amount discount (no label)", () => {
    const result = computeDiscount(100000, 15000, "amount");
    expect(result.discountAmount).toBe(15000);
    expect(result.discountLabel).toBeUndefined();
  });

  it("computes percentage discount with label", () => {
    const result = computeDiscount(100000, 10, "percentage");
    expect(result.discountAmount).toBe(10000);
    expect(result.discountLabel).toBe("10%");
  });

  it("rounds percentage discount to nearest integer", () => {
    const result = computeDiscount(99999, 10, "percentage");
    // 99999 * 0.1 = 9999.9 -> rounds to 10000
    expect(result.discountAmount).toBe(10000);
  });

  it("handles 100% discount (zero final total is valid)", () => {
    const result = computeDiscount(50000, 100, "percentage");
    expect(result.discountAmount).toBe(50000);
    expect(result.discountLabel).toBe("100%");
  });

  it("computes flat discount without type (defaults to flat)", () => {
    const result = computeDiscount(100000, 5000, undefined);
    expect(result.discountAmount).toBe(5000);
    expect(result.discountLabel).toBeUndefined();
  });
});

// ============================================
// Customer Write-back Computation
// ============================================
describe("computeCustomerWriteBack", () => {
  it("returns empty patch when nothing differs", () => {
    const invoice = { buyerCompany: "PT Frollie", buyerNpwp: "12345", buyerAddress: "Jl. Test" };
    const customer = { companyName: "PT Frollie", npwp: "12345", billingAddress: "Jl. Test" };
    expect(computeCustomerWriteBack(invoice, customer)).toEqual({});
  });

  it("patches companyName when it differs", () => {
    const invoice = { buyerCompany: "PT New Name" };
    const customer = { companyName: "PT Old Name" };
    const patch = computeCustomerWriteBack(invoice, customer);
    expect(patch.companyName).toBe("PT New Name");
    expect(Object.keys(patch)).toHaveLength(1);
  });

  it("patches npwp when it differs", () => {
    const invoice = { buyerNpwp: "99.888.777.6-555.000" };
    const customer = { npwp: "11.222.333.4-555.000" };
    const patch = computeCustomerWriteBack(invoice, customer);
    expect(patch.npwp).toBe("99.888.777.6-555.000");
  });

  it("patches billingAddress when it differs", () => {
    const invoice = { buyerAddress: "Jl. Baru No. 1" };
    const customer = { billingAddress: "Jl. Lama No. 2" };
    const patch = computeCustomerWriteBack(invoice, customer);
    expect(patch.billingAddress).toBe("Jl. Baru No. 1");
  });

  it("patches multiple fields at once when all differ", () => {
    const invoice = {
      buyerCompany: "PT ABC",
      buyerNpwp: "12345",
      buyerAddress: "Addr A",
    };
    const customer = {
      companyName: "PT XYZ",
      npwp: "99999",
      billingAddress: "Addr B",
    };
    const patch = computeCustomerWriteBack(invoice, customer);
    expect(patch.companyName).toBe("PT ABC");
    expect(patch.npwp).toBe("12345");
    expect(patch.billingAddress).toBe("Addr A");
    expect(Object.keys(patch)).toHaveLength(3);
  });

  it("does NOT set field when invoice value is undefined", () => {
    const invoice = { buyerCompany: undefined, buyerNpwp: undefined, buyerAddress: undefined };
    const customer = { companyName: undefined, npwp: undefined, billingAddress: undefined };
    expect(computeCustomerWriteBack(invoice, customer)).toEqual({});
  });

  it("sets field when customer value is undefined but invoice has value", () => {
    const invoice = { buyerCompany: "PT New" };
    const customer = {};
    const patch = computeCustomerWriteBack(invoice, customer);
    expect(patch.companyName).toBe("PT New");
  });

  it("does NOT clear field when invoice value is empty string (falsy)", () => {
    // Empty string is falsy, so no write-back occurs
    const invoice = { buyerCompany: "" };
    const customer = { companyName: "PT Existing" };
    const patch = computeCustomerWriteBack(invoice, customer);
    expect(patch).toEqual({});
  });
});
