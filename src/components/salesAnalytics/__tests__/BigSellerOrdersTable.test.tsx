/**
 * Phase 79 Wave 0 — Plan 01 Task 2 (updated in Plan 07 Task 3 to match the
 * hook-based component surface that Wave 3 ships).
 *
 * Verifies the 24h "Pending SKU from Shopee" label branch in
 * BigSellerOrdersTable and the DA-11 deferral (no buyer PII columns).
 *
 * Anchors: DA-13 (24h label), DA-11 (buyer PII deferred).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

type Order = {
  _id: string;
  platformOrderId: string;
  platform: string;
  shopName: string;
  orderState: string;
  orderTimeMs: number;
  saleAmount: number;
  allSkuNum: number;
  platformIncome: number;
  commissionFee: number;
  sellerShippingFee: number;
  buyerShippingFee: number;
  otherFee: number;
  profit: number;
  calculatedProfit: number;
  skuVoList: Array<{ sku: string; skuNum: number; returnNum: number; isAddition: number }>;
  resolvedSkus: Array<{
    sku: string;
    skuNum: number;
    returnNum: number;
    isAddition: number;
    externalProductMappingId: null;
    mappedMenuProductId: null;
    mappedMenuProductName: string | null;
  }>;
};

let currentOrders: Order[] = [];

vi.mock("@/hooks/convex", () => ({
  useBigSellerOrders: () => ({
    data: {
      orders: currentOrders,
      total: currentOrders.length,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    },
    isLoading: false,
  }),
  useSetMenuProductForSku: () => vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { _id: "u1", role: "admin", token: "t" } }),
}));

vi.mock("convex/react", () => ({
  useQuery: () => [],
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(() => "id"), info: vi.fn() },
}));

// Import AFTER mocks.
import { BigSellerOrdersTable } from "../BigSellerOrdersTable";

function mkOrder(overrides: Partial<Order>): Order {
  const skus = overrides.skuVoList ?? [];
  return {
    _id: "ord1",
    platformOrderId: "SH-001",
    platform: "shopee",
    shopName: "Frollie - S",
    orderState: "completed",
    orderTimeMs: Date.now(),
    saleAmount: 100000,
    allSkuNum: skus.reduce((s, x) => s + x.skuNum, 0),
    platformIncome: 85000,
    commissionFee: 10000,
    sellerShippingFee: 0,
    buyerShippingFee: 0,
    otherFee: 0,
    profit: 75000,
    calculatedProfit: 75000,
    skuVoList: skus,
    resolvedSkus: skus.map((s) => ({
      ...s,
      externalProductMappingId: null,
      mappedMenuProductId: null,
      mappedMenuProductName: null,
    })),
    ...overrides,
  };
}

describe("BigSellerOrdersTable — Phase 79 Plan 07 T3", () => {
  beforeEach(() => {
    currentOrders = [];
  });

  it("renders 'Pending SKU from Shopee' for a Shopee row < 24h with empty skuVoList + allSkuNum > 0", () => {
    currentOrders = [
      mkOrder({
        platform: "shopee",
        orderTimeMs: Date.now() - 2 * 60 * 60 * 1000, // 2h ago
        skuVoList: [],
        resolvedSkus: [],
        allSkuNum: 2, // BigSeller says 2 units but returned no SKU breakdown
      }),
    ];
    render(<BigSellerOrdersTable />);
    expect(screen.getByText("Pending SKU from Shopee")).toBeInTheDocument();
  });

  it("renders bare '--' for a row ≥ 24h old with empty skuVoList", () => {
    currentOrders = [
      mkOrder({
        platform: "shopee",
        orderTimeMs: Date.now() - 26 * 60 * 60 * 1000, // 26h ago
        skuVoList: [],
        resolvedSkus: [],
        allSkuNum: 2,
      }),
    ];
    render(<BigSellerOrdersTable />);
    expect(screen.queryByText("Pending SKU from Shopee")).not.toBeInTheDocument();
    expect(screen.getAllByText("--").length).toBeGreaterThan(0);
  });

  it("renders resolved SKU codes when skuVoList has entries", () => {
    currentOrders = [
      mkOrder({
        skuVoList: [{ sku: "FRO-ORI", skuNum: 2, returnNum: 0, isAddition: 0 }],
      }),
    ];
    render(<BigSellerOrdersTable />);
    expect(screen.queryByText("Pending SKU from Shopee")).not.toBeInTheDocument();
    expect(screen.getByText(/FRO-ORI/)).toBeInTheDocument();
  });

  it("DA-11: does NOT render any buyer PII column headers or cells", () => {
    currentOrders = [
      mkOrder({
        skuVoList: [{ sku: "FRO-ORI", skuNum: 1, returnNum: 0, isAddition: 0 }],
      }),
    ];
    render(<BigSellerOrdersTable />);

    expect(screen.queryByText(/Buyer name/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Buyer phone/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Buyer address/i)).not.toBeInTheDocument();
  });
});
