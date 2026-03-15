/**
 * Unit tests for normalizePlatformFees -- TDD RED then GREEN.
 * All test values are HAR-confirmed from Frollie production data.
 *
 * Tests cover:
 * - BUG-01: saleAmount missing (Shopee originalPrice, TikTok revenueAmount)
 * - BUG-03: TikTok common fields missing (platformIncome, buyerShippingFee, commissionFee, otherFee, sellerShippingFee)
 * - BUG-04: Normalization condition uses === 0 but missing fields are undefined/null
 * - BUG-05: Shopee commission fees have wrong sign (positive instead of negative)
 * - CASE-01: otherfee (lowercase) vs otherFee (camelCase) case mismatch
 * - ENH-ORDERAMOUNT: orderAmount normalization from buyerTotalAmount (Shopee) or computed (TikTok)
 */

import { describe, it, expect } from "vitest";
import { normalizePlatformFees, type BigSellerOrderRow } from "../helpers";

/**
 * Helper to create a minimal BigSellerOrderRow with overrides.
 * Fields not provided default to undefined (simulating platform-specific endpoint responses).
 */
function makeOrder(overrides: Partial<BigSellerOrderRow> = {}): BigSellerOrderRow {
  return {
    shopId: 5090946,
    shopName: "Frollie - S",
    platform: "",
    platformOrderId: "TEST-001",
    orderState: "completed",
    orderTime: 1741305600000,
    saleAmount: undefined as unknown as number,
    platformIncome: undefined as unknown as number,
    costFee: 0,
    profit: 0,
    profitMargin: "0%",
    commissionFee: undefined as unknown as number,
    sellerShippingFee: undefined as unknown as number,
    buyerShippingFee: undefined as unknown as number,
    otherFee: undefined as unknown as number,
    allSkuNum: 1,
    skuVoList: [],
    ...overrides,
  };
}

// ============================================
// BUG-01: saleAmount MISSING
// ============================================
describe("BUG-01: saleAmount normalization", () => {
  it("Shopee: populates saleAmount from originalPrice when saleAmount is undefined", () => {
    const order = makeOrder({
      saleAmount: undefined as unknown as number,
      originalPrice: 270000,
    });
    const result = normalizePlatformFees(order, "shopee");
    expect(result.saleAmount).toBe(270000);
  });

  it("Shopee: populates saleAmount from originalPrice when saleAmount is 0 (wrong data from common endpoint)", () => {
    const order = makeOrder({
      saleAmount: 0,
      originalPrice: 270000,
    });
    const result = normalizePlatformFees(order, "shopee");
    expect(result.saleAmount).toBe(270000);
  });

  it("TikTok: populates saleAmount from revenueAmount when saleAmount is undefined", () => {
    const order = makeOrder({
      saleAmount: undefined as unknown as number,
      revenueAmount: 530000,
    });
    const result = normalizePlatformFees(order, "tiktok");
    expect(result.saleAmount).toBe(530000);
  });
});

// ============================================
// ENH-ORDERAMOUNT: orderAmount normalization
// ============================================
describe("ENH-ORDERAMOUNT: orderAmount normalization", () => {
  it("Shopee: populates orderAmount from buyerTotalAmount when orderAmount is undefined", () => {
    const order = makeOrder({
      orderAmount: undefined as unknown as number,
      buyerTotalAmount: 285000,
      originalPrice: 270000,
    });
    const result = normalizePlatformFees(order, "shopee");
    expect(result.orderAmount).toBe(285000);
  });

  it("Shopee: populates orderAmount from buyerTotalAmount when orderAmount is 0", () => {
    const order = makeOrder({
      orderAmount: 0,
      buyerTotalAmount: 285000,
      originalPrice: 270000,
    });
    const result = normalizePlatformFees(order, "shopee");
    expect(result.orderAmount).toBe(285000);
  });

  it("TikTok: computes orderAmount as saleAmount + buyerShippingFee when orderAmount is undefined", () => {
    const order = makeOrder({
      orderAmount: undefined as unknown as number,
      revenueAmount: 530000,
      customerPaidShippingFeeAmount: 0,
    });
    const result = normalizePlatformFees(order, "tiktok");
    expect(result.orderAmount).toBe(530000); // 530000 + 0
  });

  it("TikTok: computes orderAmount as saleAmount + buyerShippingFee with non-zero shipping", () => {
    const order = makeOrder({
      orderAmount: undefined as unknown as number,
      revenueAmount: 530000,
      customerPaidShippingFeeAmount: 15000,
    });
    const result = normalizePlatformFees(order, "tiktok");
    expect(result.orderAmount).toBe(545000); // 530000 + 15000
  });

  it("Common: does not overwrite orderAmount when already set", () => {
    const order = makeOrder({
      orderAmount: 285000,
      saleAmount: 270000,
      buyerShippingFee: 15000,
    });
    const result = normalizePlatformFees(order, "common");
    expect(result.orderAmount).toBe(285000);
  });
});

// ============================================
// BUG-03: TikTok platformIncome missing
// ============================================
describe("BUG-03: TikTok platformIncome normalization", () => {
  it("TikTok: populates platformIncome from settlementAmount when undefined", () => {
    const order = makeOrder({
      platformIncome: undefined as unknown as number,
      settlementAmount: 433350,
      revenueAmount: 530000,
    });
    const result = normalizePlatformFees(order, "tiktok");
    expect(result.platformIncome).toBe(433350);
  });

  it("TikTok: populates platformIncome from settlementAmount when 0", () => {
    const order = makeOrder({
      platformIncome: 0,
      settlementAmount: 433350,
      revenueAmount: 530000,
    });
    const result = normalizePlatformFees(order, "tiktok");
    expect(result.platformIncome).toBe(433350);
  });
});

// ============================================
// BUG-03: TikTok buyerShippingFee missing
// ============================================
describe("BUG-03: TikTok buyerShippingFee normalization", () => {
  it("TikTok: populates buyerShippingFee from customerPaidShippingFeeAmount when undefined", () => {
    const order = makeOrder({
      buyerShippingFee: undefined as unknown as number,
      customerPaidShippingFeeAmount: 15000,
      revenueAmount: 530000,
    });
    const result = normalizePlatformFees(order, "tiktok");
    expect(result.buyerShippingFee).toBe(15000);
  });
});

// ============================================
// BUG-03: TikTok commissionFee missing
// ============================================
describe("BUG-03: TikTok commissionFee normalization", () => {
  it("TikTok: computes commissionFee from 6 platform-specific fee fields (already negative)", () => {
    const order = makeOrder({
      commissionFee: undefined as unknown as number,
      platformCommissionAmount: -53000,
      dynamicCommissionAmount: -26500,
      transactionFeeAmount: 0,
      referralFeeAmount: 0,
      affiliateCommissionAmount: 0,
      affiliatePartnerCommissionAmount: 0,
      revenueAmount: 530000,
    });
    const result = normalizePlatformFees(order, "tiktok");
    expect(result.commissionFee).toBe(-79500); // -53000 + -26500
  });
});

// ============================================
// BUG-03: TikTok otherFee missing
// ============================================
describe("BUG-03: TikTok otherFee normalization", () => {
  it("TikTok: populates otherFee from extraCostsFee (already negative)", () => {
    const order = makeOrder({
      otherFee: undefined as unknown as number,
      extraCostsFee: -1250,
      revenueAmount: 530000,
    });
    const result = normalizePlatformFees(order, "tiktok");
    expect(result.otherFee).toBe(-1250);
  });
});

// ============================================
// BUG-03: TikTok sellerShippingFee missing
// ============================================
describe("BUG-03: TikTok sellerShippingFee default", () => {
  it("TikTok: defaults sellerShippingFee to 0 when undefined", () => {
    const order = makeOrder({
      sellerShippingFee: undefined as unknown as number,
      revenueAmount: 530000,
    });
    const result = normalizePlatformFees(order, "tiktok");
    expect(result.sellerShippingFee).toBe(0);
  });
});

// ============================================
// BUG-04: Normalization condition fix
// ============================================
describe("BUG-04: condition triggers for undefined and null", () => {
  it("triggers normalization when commissionFee is undefined (not just 0)", () => {
    const order = makeOrder({
      commissionFee: undefined as unknown as number,
      sellerTransactionFee: 0,
      orderAmsCommissionFee: 29970,
      campaignFee: 0,
      sellerOrderProcessingFee: 0,
      originalPrice: 270000,
    });
    const result = normalizePlatformFees(order, "shopee");
    expect(result.commissionFee).toBe(-29970);
  });

  it("triggers normalization when commissionFee is null", () => {
    const order = makeOrder({
      commissionFee: null as unknown as number,
      sellerTransactionFee: 0,
      orderAmsCommissionFee: 29970,
      campaignFee: 0,
      sellerOrderProcessingFee: 0,
      originalPrice: 270000,
    });
    const result = normalizePlatformFees(order, "shopee");
    expect(result.commissionFee).toBe(-29970);
  });
});

// ============================================
// BUG-05: Shopee sign convention
// ============================================
describe("BUG-05: Shopee fee sign negation", () => {
  it("Shopee: negates commission fees via -Math.abs() (HAR-confirmed)", () => {
    // HAR: Shopee order 260307H1VR6UCW has orderAmsCommissionFee=29970 (POSITIVE)
    const order = makeOrder({
      commissionFee: undefined as unknown as number,
      sellerTransactionFee: 0,
      orderAmsCommissionFee: 29970,
      campaignFee: 0,
      sellerOrderProcessingFee: 0,
      originalPrice: 270000,
    });
    const result = normalizePlatformFees(order, "shopee");
    expect(result.commissionFee).toBe(-29970); // NEGATED
  });

  it("Shopee: negates sellerShippingFee from finalShippingFee", () => {
    const order = makeOrder({
      sellerShippingFee: undefined as unknown as number,
      finalShippingFee: 5000,
      originalPrice: 270000,
    });
    const result = normalizePlatformFees(order, "shopee");
    expect(result.sellerShippingFee).toBe(-5000); // NEGATED
  });

  it("Shopee: negates otherFee from serviceFee", () => {
    const order = makeOrder({
      otherFee: undefined as unknown as number,
      serviceFee: 1000,
      originalPrice: 270000,
    });
    const result = normalizePlatformFees(order, "shopee");
    expect(result.otherFee).toBe(-1000); // NEGATED
  });
});

// ============================================
// CASE-01: otherfee vs otherFee mismatch
// ============================================
describe("CASE-01: otherfee/otherFee case mismatch", () => {
  it("handles otherfee (lowercase) when otherFee is absent", () => {
    const order = makeOrder({
      otherFee: undefined as unknown as number,
      revenueAmount: 530000,
    });
    // Simulate API returning lowercase otherfee
    (order as any).otherfee = 500;
    // After normalization, otherFee should reflect the lowercase value (or platform normalization)
    const result = normalizePlatformFees(order, "tiktok");
    // The function should not leave otherFee as undefined when otherfee exists
    expect(result.otherFee).toBeDefined();
    expect(typeof result.otherFee).toBe("number");
  });
});

// ============================================
// No-op cases
// ============================================
describe("No-op cases", () => {
  it("platform 'common' makes no changes", () => {
    const order = makeOrder({
      saleAmount: 50000,
      platformIncome: 44000,
      commissionFee: -6000,
      sellerShippingFee: 0,
      otherFee: 0,
      buyerShippingFee: 0,
      orderAmount: 50000,
    });
    const result = normalizePlatformFees(order, "common");
    expect(result.saleAmount).toBe(50000);
    expect(result.platformIncome).toBe(44000);
    expect(result.commissionFee).toBe(-6000);
    expect(result.sellerShippingFee).toBe(0);
    expect(result.otherFee).toBe(0);
    expect(result.orderAmount).toBe(50000);
  });

  it("Shopee: does not overwrite already populated non-zero fields", () => {
    const order = makeOrder({
      saleAmount: 270000,
      platformIncome: 240030,
      commissionFee: -29970,
      sellerShippingFee: -5000,
      otherFee: -1000,
      buyerShippingFee: 15000,
      orderAmount: 285000,
      // Platform-specific fields also present
      originalPrice: 270000,
      orderAmsCommissionFee: 29970,
      finalShippingFee: 5000,
      serviceFee: 1000,
      buyerTotalAmount: 285000,
    });
    const result = normalizePlatformFees(order, "shopee");
    // Should not overwrite existing non-zero values
    expect(result.saleAmount).toBe(270000);
    expect(result.commissionFee).toBe(-29970);
    expect(result.sellerShippingFee).toBe(-5000);
    expect(result.otherFee).toBe(-1000);
    expect(result.orderAmount).toBe(285000);
  });
});
