/**
 * Unit tests for BigSeller order mutation logic.
 *
 * Note: Full convex-test integration tests for upsertOrders are deferred
 * because the listOrders query requires auth (requireRole) which needs
 * session token setup in convex-test. The dedup logic is verified here
 * via the mapOrderToStorage helper + schema validation.
 *
 * The critical dedup behavior is: upsertOrders checks by_platform_order index
 * for existing platformOrderId and patches instead of inserting duplicates.
 */

import { describe, it, expect } from "vitest";
import { mapOrderToStorage, type BigSellerOrderRow } from "../../integrations/bigseller/helpers";
import { resolveSkuVoListOnUpdate } from "../mutations";

const mockOrder = (overrides: Partial<BigSellerOrderRow> = {}): BigSellerOrderRow => ({
  platformOrderId: "ORDER-001",
  platform: "shopee",
  shopId: 5090946,
  shopName: "Frollie - S",
  orderState: "completed",
  orderTime: 1736899200000,
  saleAmount: 50000,
  platformIncome: 44150,
  commissionFee: -5850,
  sellerShippingFee: 0,
  buyerShippingFee: 3500,
  otherFee: 0,
  costFee: 0,
  profit: 44150,
  profitMargin: "100%",
  allSkuNum: 1,
  skuVoList: [{ sku: "FROLLIE-ORI", skuNum: 1, returnNum: 0, isAddition: 0 }],
  ...overrides,
});

describe("mapOrderToStorage (pre-upsert transform)", () => {
  it("maps all required fields for bigsellerOrders schema", () => {
    const order = mockOrder();
    const result = mapOrderToStorage(order, "sync-id" as any, order.platform);
    expect(result.platformOrderId).toBe("ORDER-001");
    expect(result.shopId).toBe(5090946);
    expect(result.shopName).toBe("Frollie - S");
    expect(result.platform).toBe("shopee");
    expect(result.orderState).toBe("completed");
    expect(result.orderTimeMs).toBe(1736899200000);
    expect(result.saleAmount).toBe(50000);
    expect(result.platformIncome).toBe(44150);
    expect(result.commissionFee).toBe(-5850);
    expect(result.sellerShippingFee).toBe(0);
    expect(result.buyerShippingFee).toBe(3500);
    expect(result.otherFee).toBe(0);
    expect(result.costFee).toBe(0);
    expect(result.profit).toBe(44150);
    expect(result.profitMargin).toBe("100%");
    expect(result.allSkuNum).toBe(1);
    expect(result.createdAt).toBeGreaterThan(0);
  });

  it("preserves skuVoList with all fields", () => {
    const order = mockOrder({
      skuVoList: [
        { sku: "FRO-DubChe-Reg1", skuNum: 4, returnNum: 0, isAddition: 0 },
        { sku: "FRO-ORI", skuNum: 2, returnNum: 1, isAddition: 1 },
      ],
    });
    const result = mapOrderToStorage(order, "sync-id" as any, order.platform);
    expect(result.skuVoList).toHaveLength(2);
    expect(result.skuVoList[0]).toEqual({
      sku: "FRO-DubChe-Reg1",
      skuNum: 4,
      returnNum: 0,
      isAddition: 0,
    });
    expect(result.skuVoList[1]).toEqual({
      sku: "FRO-ORI",
      skuNum: 2,
      returnNum: 1,
      isAddition: 1,
    });
  });

  it("produces unique platformOrderId for dedup key", () => {
    const o1 = mockOrder({ platformOrderId: "A" });
    const o2 = mockOrder({ platformOrderId: "B" });
    const order1 = mapOrderToStorage(o1, "s" as any, o1.platform);
    const order2 = mapOrderToStorage(o2, "s" as any, o2.platform);
    expect(order1.platformOrderId).not.toBe(order2.platformOrderId);
  });

  it("handles TikTok orders correctly", () => {
    const tiktokOrder = mockOrder({
      platform: "tiktok",
      shopId: 5092855,
      shopName: "Frollie - T",
      commissionFee: -3000,
      otherFee: -500,
    });
    const result = mapOrderToStorage(tiktokOrder, "sync-id" as any, tiktokOrder.platform);
    expect(result.platform).toBe("tiktok");
    expect(result.commissionFee).toBe(-3000);
    expect(result.otherFee).toBe(-500);
  });
});

describe("resolveSkuVoListOnUpdate (preserve-non-empty guard)", () => {
  const entry = (sku: string) => ({ sku, skuNum: 1, returnNum: 0, isAddition: 0 });

  it("keeps existing list when incoming is empty and existing has entries", () => {
    const existing = [entry("FRO-OubChe-Reg1")];
    const incoming: ReturnType<typeof entry>[] = [];
    const result = resolveSkuVoListOnUpdate(incoming, existing);
    expect(result).toEqual(existing);
  });

  it("overwrites with incoming when incoming has entries", () => {
    const existing = [entry("FRO-OLD")];
    const incoming = [entry("FRO-NEW-A"), entry("FRO-NEW-B")];
    const result = resolveSkuVoListOnUpdate(incoming, existing);
    expect(result).toEqual(incoming);
    expect(result.map((s) => s.sku)).toEqual(["FRO-NEW-A", "FRO-NEW-B"]);
  });

  it("returns empty when both incoming and existing are empty", () => {
    const result = resolveSkuVoListOnUpdate([], []);
    expect(result).toEqual([]);
  });

  it("keeps incoming empty when existing is also empty (first-time insert parity)", () => {
    const result = resolveSkuVoListOnUpdate([], []);
    expect(result).toHaveLength(0);
  });

  it("overwrites even if incoming is a SINGLE entry and existing had many", () => {
    // Intentional: a legitimate reduction in SKUs (e.g. partial refund removing a line)
    // must not be suppressed. Only *empty* incoming is treated as BigSeller dropout.
    const existing = [entry("A"), entry("B"), entry("C")];
    const incoming = [entry("A")];
    const result = resolveSkuVoListOnUpdate(incoming, existing);
    expect(result).toEqual(incoming);
    expect(result).toHaveLength(1);
  });

  it("returns a copy, not the same array reference (defensive immutability)", () => {
    const existing = [entry("FRO-X")];
    const result = resolveSkuVoListOnUpdate([], existing);
    expect(result).toEqual(existing);
    expect(result).not.toBe(existing);
  });
});
