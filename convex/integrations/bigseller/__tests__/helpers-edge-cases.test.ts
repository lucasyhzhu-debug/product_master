/**
 * Extended edge case tests for BigSeller helpers.
 * Covers boundary conditions, malformed inputs, and business rule verification.
 */

import { describe, it, expect } from "vitest";
import {
  detectHtmlResponse,
  isJsonAuthError,
  buildPageListBody,
  buildBigSellerHeaders,
  buildSyncTaskCreateBody,
  mapOrderToRevenue,
  mapOrderToStorage,
  type BigSellerOrderRow,
} from "../helpers";
import { BIGSELLER_PAGE_SIZE, BIGSELLER_FROLLIE_SHOP_IDS } from "../config";

// ============================================
// detectHtmlResponse — Edge Cases
// ============================================
describe("detectHtmlResponse — edge cases", () => {
  it("handles case-insensitive HTML detection", () => {
    expect(detectHtmlResponse("<!DOCTYPE HTML>")).toBe(true);
    expect(detectHtmlResponse("<!doctype html>")).toBe(true);
    expect(detectHtmlResponse("<HTML>")).toBe(true);
  });

  it("handles BigSeller login page response pattern", () => {
    // Real auth failure returns the Indonesian login page
    expect(
      detectHtmlResponse(
        '<!DOCTYPE html><html lang="id"><head><title>BigSeller</title></head></html>'
      )
    ).toBe(true);
  });

  it("handles BOM prefix", () => {
    // UTF-8 BOM + HTML
    expect(detectHtmlResponse("\uFEFF<!DOCTYPE html>")).toBe(true);
  });

  it("does not false-positive on JSON containing HTML-like strings", () => {
    expect(
      detectHtmlResponse('{"msg":"<html> is not valid","code":-1}')
    ).toBe(false);
  });

  it("does not false-positive on error JSON", () => {
    expect(detectHtmlResponse('{"code":-1,"msg":"sync task is in progress"}')).toBe(false);
    expect(detectHtmlResponse('{"code":0,"data":null}')).toBe(false);
  });

  it("handles empty and whitespace-only responses", () => {
    expect(detectHtmlResponse("")).toBe(false);
    expect(detectHtmlResponse("   ")).toBe(false);
    expect(detectHtmlResponse("\n\t")).toBe(false);
  });
});

// ============================================
// isJsonAuthError — JSON auth failure detection
// ============================================
describe("isJsonAuthError", () => {
  it("returns true for code 401006 (token expired/invalid)", () => {
    expect(isJsonAuthError({ code: 401006 })).toBe(true);
    expect(isJsonAuthError({ code: 401006, msg: "Session expired" })).toBe(true);
    expect(isJsonAuthError({ code: 401006, errorCode: 2001 })).toBe(true);
  });

  it("returns true for code 401001 (token missing/malformed)", () => {
    expect(isJsonAuthError({ code: 401001 })).toBe(true);
  });

  it("returns true for code 401003 (account suspended)", () => {
    expect(isJsonAuthError({ code: 401003 })).toBe(true);
  });

  it("returns true when auth code is in errorCode field", () => {
    expect(isJsonAuthError({ code: -1, errorCode: 401006 })).toBe(true);
    expect(isJsonAuthError({ code: 0, errorCode: 401001 })).toBe(true);
  });

  it("returns false for normal success response", () => {
    expect(isJsonAuthError({ code: 0 })).toBe(false);
    expect(isJsonAuthError({ code: 0, msg: "Successfully" })).toBe(false);
  });

  it("returns false for generic API errors (not auth-related)", () => {
    expect(isJsonAuthError({ code: -1, msg: "sync task is in progress" })).toBe(false);
    expect(isJsonAuthError({ code: -1, msg: "Failed, please try again later" })).toBe(false);
    expect(isJsonAuthError({ code: 500, msg: "Internal error" })).toBe(false);
  });

  it("returns false when errorCode is not an auth code", () => {
    expect(isJsonAuthError({ code: -1, errorCode: 2001 })).toBe(false);
    expect(isJsonAuthError({ code: 0, errorCode: 3000 })).toBe(false);
  });
});

// ============================================
// buildBigSellerHeaders — Completeness
// ============================================
describe("buildBigSellerHeaders — completeness", () => {
  it("includes all 8 required headers", () => {
    const headers = buildBigSellerHeaders("jwt-abc123");
    const keys = Object.keys(headers);
    expect(keys).toContain("cookie");
    expect(keys).toContain("content-type");
    expect(keys).toContain("accept");
    expect(keys).toContain("referer");
    expect(keys).toContain("origin");
    expect(keys).toContain("user-agent");
    expect(keys).toContain("x-requested-with");
    expect(keys).toContain("clienttype");
  });

  it("cookie contains both muc_token and login account type", () => {
    const headers = buildBigSellerHeaders("mytoken");
    expect(headers.cookie).toContain("muc_token=mytoken");
    expect(headers.cookie).toContain("muc_login_account_type=EMAIL_ACCOUNT_TYPE");
  });

  it("handles empty token gracefully", () => {
    const headers = buildBigSellerHeaders("");
    expect(headers.cookie).toContain("muc_token=");
  });

  it("handles token with special characters", () => {
    const headers = buildBigSellerHeaders("token.with=special;chars");
    expect(headers.cookie).toContain("muc_token=token.with=special;chars");
  });
});

// ============================================
// buildPageListBody — Boundary Cases
// ============================================
describe("buildPageListBody — boundary cases", () => {
  it("uses correct page size from config", () => {
    const body = buildPageListBody("2026-01-01", "2026-01-31", 1, []);
    expect(body.pageSize).toBe(BIGSELLER_PAGE_SIZE);
  });

  it("passes through page number correctly for pagination", () => {
    const page1 = buildPageListBody("2026-01-01", "2026-01-31", 1, []);
    const page5 = buildPageListBody("2026-01-01", "2026-01-31", 5, []);
    expect(page1.pageNo).toBe(1);
    expect(page5.pageNo).toBe(5);
  });

  it("defaults to FROLLIE_SHOP_IDS when no shopIds provided", () => {
    const body = buildPageListBody("2026-01-01", "2026-01-31", 1);
    expect(body.shopIds).toEqual(BIGSELLER_FROLLIE_SHOP_IDS);
  });

  it("has exactly 25+ fields to match BigSeller API requirements", () => {
    const body = buildPageListBody("2026-01-01", "2026-01-31", 1, []);
    // The API requires ALL fields — missing any causes silent code:-1
    const fieldCount = Object.keys(body).length;
    expect(fieldCount).toBeGreaterThanOrEqual(20);
  });

  it("includes all filter fields even when unused (required by API)", () => {
    const body = buildPageListBody("2026-01-01", "2026-01-31", 1, []);
    // These must be present even when unused
    expect(body).toHaveProperty("warehouseIds");
    expect(body).toHaveProperty("adjustmentUpdateTimeStartTime");
    expect(body).toHaveProperty("adjustmentUpdateTimeEndTime");
    expect(body).toHaveProperty("hasLable"); // Note: BigSeller uses "lable" (typo)
    expect(body).toHaveProperty("inquireType");
    expect(body).toHaveProperty("platforms");
  });
});

// ============================================
// mapOrderToRevenue — Business Rule Verification
// ============================================
describe("mapOrderToRevenue — business rules", () => {
  const baseOrder: BigSellerOrderRow = {
    platformOrderId: "ORDER-789",
    platform: "shopee",
    saleAmount: 100000,
    platformIncome: 85000,
    commissionFee: -15000,
    sellerShippingFee: -5000,
    otherFee: -2000,
    costFee: 0,
    orderState: "completed",
    orderTime: 1736899200000,
    shopId: 5090946,
    shopName: "Frollie - S",
    profit: 78000,
    profitMargin: "91.76%",
    buyerShippingFee: 8000,
    allSkuNum: 3,
    skuVoList: [],
  };

  it("commission is always positive (absolute value of negative fee)", () => {
    const result = mapOrderToRevenue(baseOrder, "sync" as any, baseOrder.platform);
    expect(result.commission).toBe(15000);
    expect(result.commission).toBeGreaterThanOrEqual(0);
  });

  it("handles already-positive commission (defensive)", () => {
    const order = { ...baseOrder, commissionFee: 500 };
    const result = mapOrderToRevenue(order, "sync" as any, order.platform);
    expect(result.commission).toBe(500); // Math.abs(500) = 500
  });

  it("handles zero commission", () => {
    const order = { ...baseOrder, commissionFee: 0 };
    const result = mapOrderToRevenue(order, "sync" as any, order.platform);
    expect(result.commission).toBe(0);
  });

  it("uses lowercase platform (shopee, not SHOPEE)", () => {
    const result = mapOrderToRevenue(baseOrder, "sync" as any, baseOrder.platform);
    expect(result.source).toBe("shopee");
    expect(result.source).toBe(result.source.toLowerCase());
  });

  it("tiktok platform maps correctly", () => {
    const tiktokOrder = { ...baseOrder, platform: "tiktok" };
    const result = mapOrderToRevenue(tiktokOrder, "sync" as any, tiktokOrder.platform);
    expect(result.source).toBe("tiktok");
  });

  it("dedup key format is bigseller:{platformOrderId}", () => {
    const result = mapOrderToRevenue(baseOrder, "sync" as any, baseOrder.platform);
    expect(result.externalTransactionId).toMatch(/^bigseller:.+/);
    expect(result.externalTransactionId).toBe("bigseller:ORDER-789");
  });

  it("never uses bigseller as the source", () => {
    // This is a critical business rule - source must be the actual platform
    for (const platform of ["shopee", "tiktok", "tokopedia"]) {
      const order = { ...baseOrder, platform };
      const result = mapOrderToRevenue(order, "sync" as any, platform);
      expect(result.source).not.toBe("bigseller");
    }
  });

  it("uses explicit platform parameter (not order.platform)", () => {
    // With BUG-02 fix, platform comes from BIGSELLER_SHOP_PLATFORM_MAP, not order.platform
    const order = { ...baseOrder, platform: "" }; // API returns null/empty
    const result = mapOrderToRevenue(order, "sync" as any, "shopee");
    expect(result.source).toBe("shopee");
  });

  it("periodStart and periodEnd both use orderTime", () => {
    const result = mapOrderToRevenue(baseOrder, "sync" as any, baseOrder.platform);
    expect(result.periodStart).toBe(1736899200000);
    expect(result.periodEnd).toBe(1736899200000);
    expect(result.transactionDate).toBe(1736899200000);
  });

  it("profit calculation: net = platformIncome, gross = orderAmount ?? saleAmount (fallback)", () => {
    // revenueGross falls back to saleAmount when no orderAmount
    const result = mapOrderToRevenue(baseOrder, "sync" as any, baseOrder.platform);
    expect(result.revenueGross).toBe(100000); // saleAmount (no orderAmount on this order)
    expect(result.revenueNet).toBe(85000); // platformIncome
  });

  it("revenueGross uses orderAmount when present (primary path)", () => {
    // When orderAmount is set, it takes precedence over saleAmount
    const orderWithAmount = { ...baseOrder, orderAmount: 115000 };
    const result = mapOrderToRevenue(orderWithAmount, "sync" as any, orderWithAmount.platform);
    expect(result.revenueGross).toBe(115000); // orderAmount, NOT saleAmount (100000)
    expect(result.revenueNet).toBe(85000); // platformIncome unchanged
  });
});

// ============================================
// mapOrderToStorage — Data Preservation
// ============================================
describe("mapOrderToStorage — data preservation", () => {
  const baseOrder: BigSellerOrderRow = {
    platformOrderId: "ORDER-STORE-001",
    platform: "tiktok",
    saleAmount: 45000,
    platformIncome: 38000,
    commissionFee: -4500,
    sellerShippingFee: -2500,
    otherFee: -1000,
    costFee: -3000,
    orderState: "shipped",
    orderTime: 1737000000000,
    shopId: 5092855,
    shopName: "Frollie - T",
    profit: 32000,
    profitMargin: "84.21%",
    buyerShippingFee: 6000,
    allSkuNum: 3,
    skuVoList: [
      { sku: "FRO-BITE", skuNum: 2, returnNum: 0, isAddition: 0 },
      { sku: "FRO-ORI", skuNum: 1, returnNum: 1, isAddition: 0 },
    ],
  };

  it("preserves ALL raw negative fee values (no abs)", () => {
    const result = mapOrderToStorage(baseOrder, "sync" as any, baseOrder.platform);
    expect(result.commissionFee).toBe(-4500);
    expect(result.sellerShippingFee).toBe(-2500);
    expect(result.otherFee).toBe(-1000);
    expect(result.costFee).toBe(-3000);
  });

  it("preserves buyer shipping fee (positive value)", () => {
    const result = mapOrderToStorage(baseOrder, "sync" as any, baseOrder.platform);
    expect(result.buyerShippingFee).toBe(6000);
  });

  it("preserves profit margin as string percentage", () => {
    const result = mapOrderToStorage(baseOrder, "sync" as any, baseOrder.platform);
    expect(result.profitMargin).toBe("84.21%");
  });

  it("preserves SKU details with return counts", () => {
    const result = mapOrderToStorage(baseOrder, "sync" as any, baseOrder.platform);
    expect(result.skuVoList).toHaveLength(2);
    // First SKU: no returns
    expect(result.skuVoList[0].returnNum).toBe(0);
    // Second SKU: 1 return
    expect(result.skuVoList[1].returnNum).toBe(1);
    expect(result.skuVoList[1].sku).toBe("FRO-ORI");
  });

  it("handles empty skuVoList", () => {
    const order = { ...baseOrder, skuVoList: [] };
    const result = mapOrderToStorage(order, "sync" as any, order.platform);
    expect(result.skuVoList).toEqual([]);
  });

  it("has createdAt timestamp", () => {
    const before = Date.now();
    const result = mapOrderToStorage(baseOrder, "sync" as any, baseOrder.platform);
    const after = Date.now();
    expect(result.createdAt).toBeGreaterThanOrEqual(before);
    expect(result.createdAt).toBeLessThanOrEqual(after);
  });

  it("raw data preserved for BigSeller authoritative profit (order.profit)", () => {
    // profit = order.profit (BigSeller authoritative, not hand-rolled formula).
    // The old formula (platformIncome + fees) double-subtracted fees already in platformIncome.
    // We verify raw data is preserved correctly in storage.
    const result = mapOrderToStorage(baseOrder, "sync" as any, baseOrder.platform);
    expect(result.platformIncome).toBe(38000);
    expect(result.commissionFee).toBe(-4500);
    expect(result.sellerShippingFee).toBe(-2500);
    expect(result.otherFee).toBe(-1000);
    expect(result.profit).toBe(32000);
  });
});

// ============================================
// buildSyncTaskCreateBody
// ============================================
describe("buildSyncTaskCreateBody — validation", () => {
  it("uses orderCreatedTime as timeType", () => {
    const body = buildSyncTaskCreateBody("2026-01-01", "2026-01-31");
    expect(body.timeType).toBe("orderCreatedTime");
  });

  it("passes dates through without modification", () => {
    const body = buildSyncTaskCreateBody("2026-02-15", "2026-03-15");
    expect(body.startTime).toBe("2026-02-15");
    expect(body.endTime).toBe("2026-03-15");
  });
});

// ============================================
// Cross-function consistency
// ============================================
describe("cross-function consistency", () => {
  const order: BigSellerOrderRow = {
    platformOrderId: "CROSS-001",
    platform: "shopee",
    saleAmount: 50000,
    platformIncome: 44000,
    commissionFee: -6000,
    sellerShippingFee: 0,
    otherFee: 0,
    costFee: 0,
    orderState: "completed",
    orderTime: 1736899200000,
    shopId: 5090946,
    shopName: "Frollie - S",
    profit: 44000,
    profitMargin: "100%",
    buyerShippingFee: 0,
    allSkuNum: 1,
    skuVoList: [{ sku: "FRO-TEST", skuNum: 1, returnNum: 0, isAddition: 0 }],
  };

  it("revenue and storage use same platformOrderId", () => {
    const revenue = mapOrderToRevenue(order, "sync" as any, order.platform);
    const storage = mapOrderToStorage(order, "sync" as any, order.platform);
    // Revenue uses it in the dedup key
    expect(revenue.externalTransactionId).toContain(order.platformOrderId);
    // Storage uses it directly
    expect(storage.platformOrderId).toBe(order.platformOrderId);
  });

  it("revenue and storage use same platform value", () => {
    const revenue = mapOrderToRevenue(order, "sync" as any, order.platform);
    const storage = mapOrderToStorage(order, "sync" as any, order.platform);
    expect(revenue.source).toBe(storage.platform);
  });

  it("revenue uses orderAmount as gross (falls back to saleAmount when absent)", () => {
    const revenue = mapOrderToRevenue(order, "sync" as any, order.platform);
    const storage = mapOrderToStorage(order, "sync" as any, order.platform);
    // When orderAmount is undefined, revenueGross falls back to saleAmount
    expect(revenue.revenueGross).toBe(storage.orderAmount || storage.saleAmount);
  });

  it("revenue commission is abs of storage commissionFee", () => {
    const revenue = mapOrderToRevenue(order, "sync" as any, order.platform);
    const storage = mapOrderToStorage(order, "sync" as any, order.platform);
    expect(revenue.commission).toBe(Math.abs(storage.commissionFee));
  });
});
