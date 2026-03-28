/**
 * Unit tests for BigSeller helper functions.
 * Tests HTML detection, request body construction, and field mapping.
 */

import { describe, it, expect } from "vitest";
import {
  detectHtmlResponse,
  isJsonAuthError,
  buildPageListBody,
  mapOrderToRevenue,
  mapOrderToStorage,
  buildBigSellerHeaders,
  buildSyncTaskCreateBody,
  type BigSellerOrderRow,
} from "../helpers";

// ============================================
// detectHtmlResponse() Tests
// ============================================
describe("detectHtmlResponse", () => {
  it("returns true for HTML responses (auth failure)", () => {
    expect(detectHtmlResponse("<!DOCTYPE html><html>...</html>")).toBe(true);
    expect(detectHtmlResponse("<html lang='id'>...</html>")).toBe(true);
  });

  it("returns true for HTML with leading whitespace", () => {
    expect(detectHtmlResponse("  <!DOCTYPE html>...")).toBe(true);
    expect(detectHtmlResponse("\n<html>...")).toBe(true);
  });

  it("returns false for JSON responses", () => {
    expect(detectHtmlResponse('{"code":0,"data":{}}')).toBe(false);
    expect(detectHtmlResponse('{"code":-1,"msg":"error"}')).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(detectHtmlResponse("")).toBe(false);
  });
});

// ============================================
// isJsonAuthError() Tests
// ============================================
describe("isJsonAuthError", () => {
  it("detects auth error code 401006 (reported error)", () => {
    expect(isJsonAuthError({ code: 401006, errorCode: 2001, msg: "token expired" })).toBe(true);
  });

  it("returns false for success", () => {
    expect(isJsonAuthError({ code: 0 })).toBe(false);
  });

  it("returns false for generic errors", () => {
    expect(isJsonAuthError({ code: -1, msg: "error" })).toBe(false);
  });
});

// ============================================
// buildBigSellerHeaders() Tests
// ============================================
describe("buildBigSellerHeaders", () => {
  it("includes muc_token cookie", () => {
    const headers = buildBigSellerHeaders("test-jwt-token");
    expect(headers.cookie).toContain("muc_token=test-jwt-token");
  });

  it("includes required headers for POST requests", () => {
    const headers = buildBigSellerHeaders("token");
    expect(headers["content-type"]).toBe("application/json");
    expect(headers.referer).toContain("bigseller.com");
    expect(headers.clienttype).toBe("1");
  });
});

// ============================================
// buildPageListBody() Tests
// ============================================
describe("buildPageListBody", () => {
  it("includes all required fields", () => {
    const body = buildPageListBody("2026-01-01", "2026-01-31", 1, [5090946, 5092855]);
    // Required fields that cause silent -1 errors if missing
    expect(body).toHaveProperty("searchType", "order");
    expect(body).toHaveProperty("platformTemplate", "common");
    expect(body).toHaveProperty("currency", "IDR");
    expect(body).toHaveProperty("queryType", "sku");
    expect(body).toHaveProperty("orderState");
    expect(Array.isArray(body.orderState)).toBe(true);
    expect((body.orderState as string[]).length).toBe(5);
    expect(body).toHaveProperty("shopIds", [5090946, 5092855]);
    expect(body).toHaveProperty("pageNo", 1);
    expect(body).toHaveProperty("pageSize");
    expect(body).toHaveProperty("startTime", "2026-01-01");
    expect(body).toHaveProperty("endTime", "2026-01-31");
    expect(body).toHaveProperty("timeType", "orderCreatedTime");
  });

  it("uses provided shopIds to prevent multi-brand data leakage", () => {
    const body = buildPageListBody("2026-01-01", "2026-01-31", 1, [9999999]);
    expect(body).toHaveProperty("shopIds", [9999999]);
  });

  it("includes null/empty filter fields", () => {
    const body = buildPageListBody("2026-01-01", "2026-01-31", 1, []);
    expect(body).toHaveProperty("searchContent", null);
    expect(body).toHaveProperty("lableIds", null);
    expect(body).toHaveProperty("sampleOrder", null);
    expect(body).toHaveProperty("dimension", "");
    expect(body).toHaveProperty("evalationOrder", "");
    expect(body).toHaveProperty("categoryList", "");
  });

  it("includes all 5 order states including new", () => {
    const body = buildPageListBody("2026-01-01", "2026-01-31", 1, []);
    const states = body.orderState as string[];
    expect(states).toContain("completed");
    expect(states).toContain("shipped");
    expect(states).toContain("canceled");
    expect(states).toContain("other");
    expect(states).toContain("new");
  });
});

// ============================================
// buildSyncTaskCreateBody() Tests
// ============================================
describe("buildSyncTaskCreateBody", () => {
  it("includes required fields", () => {
    const body = buildSyncTaskCreateBody("2026-01-01", "2026-01-31");
    expect(body.startTime).toBe("2026-01-01");
    expect(body.endTime).toBe("2026-01-31");
    expect(body.timeType).toBe("orderCreatedTime");
  });
});

// ============================================
// mapOrderToRevenue() Tests
// ============================================
describe("mapOrderToRevenue", () => {
  const mockOrder: BigSellerOrderRow = {
    platformOrderId: "ORDER-123",
    platform: "shopee",
    saleAmount: 50000,
    platformIncome: 44150,
    commissionFee: 5850, // Positive -- normalized at sync time
    sellerShippingFee: 0,
    otherFee: 0,
    costFee: 0,
    orderState: "completed",
    orderTime: 1736899200000,
    shopId: 5090946,
    shopName: "Frollie - S",
    profit: 44150,
    profitMargin: "100%",
    buyerShippingFee: 0,
    allSkuNum: 1,
    skuVoList: [],
  };

  it("uses actual platform source, not bigseller", () => {
    const result = mapOrderToRevenue(mockOrder, "synclog-id" as any, mockOrder.platform);
    expect(result.source).toBe("shopee");
    expect(result.source).not.toBe("bigseller");
  });

  it("passes through positive commissionFee directly as commission", () => {
    const result = mapOrderToRevenue(mockOrder, "synclog-id" as any, mockOrder.platform);
    expect(result.commission).toBe(5850); // direct: 5850
  });

  it("uses externalTransactionId with bigseller prefix for dedup", () => {
    const result = mapOrderToRevenue(mockOrder, "synclog-id" as any, mockOrder.platform);
    expect(result.externalTransactionId).toBe("bigseller:ORDER-123");
  });

  it("maps gross and net revenue correctly", () => {
    const result = mapOrderToRevenue(mockOrder, "synclog-id" as any, mockOrder.platform);
    expect(result.revenueGross).toBe(50000);
    expect(result.revenueNet).toBe(44150);
  });

  it("handles zero revenue orders (returns/refunds)", () => {
    const zeroOrder = { ...mockOrder, saleAmount: 0, platformIncome: 0 };
    const result = mapOrderToRevenue(zeroOrder, "synclog-id" as any, zeroOrder.platform);
    expect(result.revenueGross).toBe(0);
    expect(result.revenueNet).toBe(0);
  });

  it("uses api_revenue data origin", () => {
    const result = mapOrderToRevenue(mockOrder, "synclog-id" as any, mockOrder.platform);
    expect(result.dataOrigin).toBe("api_revenue");
    expect(result.confidence).toBe("exact");
  });

  it("sets transactionCount to 1 for each order", () => {
    const result = mapOrderToRevenue(mockOrder, "synclog-id" as any, mockOrder.platform);
    expect(result.transactionCount).toBe(1);
  });

  it("prefers orderAmount over saleAmount for revenueGross", () => {
    const orderWithOrderAmount = {
      ...mockOrder,
      saleAmount: 50000,
      orderAmount: 65000, // includes buyer shipping
    };
    const result = mapOrderToRevenue(orderWithOrderAmount, "synclog-id" as any, orderWithOrderAmount.platform);
    expect(result.revenueGross).toBe(65000); // orderAmount, not saleAmount
  });

  it("falls back to saleAmount when orderAmount is undefined", () => {
    const orderNoOrderAmount = {
      ...mockOrder,
      saleAmount: 50000,
      orderAmount: undefined,
    };
    const result = mapOrderToRevenue(orderNoOrderAmount, "synclog-id" as any, orderNoOrderAmount.platform);
    expect(result.revenueGross).toBe(50000); // saleAmount fallback
  });
});

// ============================================
// mapOrderToStorage() Tests
// ============================================
describe("mapOrderToStorage", () => {
  const mockOrder: BigSellerOrderRow = {
    platformOrderId: "ORDER-456",
    platform: "tiktok",
    saleAmount: 30000,
    platformIncome: 27000,
    commissionFee: 3000,
    sellerShippingFee: 1500,
    otherFee: 0,
    costFee: 0,
    orderState: "shipped",
    orderTime: 1736985600000,
    shopId: 5092855,
    shopName: "Frollie - T",
    profit: 25500,
    profitMargin: "94.44%",
    buyerShippingFee: 5000,
    allSkuNum: 2,
    skuVoList: [{ sku: "FROLLIE-ORI", skuNum: 2, returnNum: 0, isAddition: 0 }],
  };

  it("stores normalized positive fee values", () => {
    const result = mapOrderToStorage(mockOrder, "synclog-id" as any, mockOrder.platform);
    expect(result.commissionFee).toBe(3000);
    expect(result.sellerShippingFee).toBe(1500);
  });

  it("includes skuVoList", () => {
    const result = mapOrderToStorage(mockOrder, "synclog-id" as any, mockOrder.platform);
    expect(result.skuVoList).toBeDefined();
    expect(result.skuVoList.length).toBe(1);
    expect(result.skuVoList[0].sku).toBe("FROLLIE-ORI");
  });

  it("preserves platform as lowercase", () => {
    const result = mapOrderToStorage(mockOrder, "synclog-id" as any, mockOrder.platform);
    expect(result.platform).toBe("tiktok");
  });

  it("includes orderTimeMs from orderTime", () => {
    const result = mapOrderToStorage(mockOrder, "synclog-id" as any, mockOrder.platform);
    expect(result.orderTimeMs).toBe(1736985600000);
  });
});
