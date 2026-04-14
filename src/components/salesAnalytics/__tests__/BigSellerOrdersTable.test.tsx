/**
 * Phase 79 Wave 0 — Plan 01 Task 2
 *
 * Failing component tests for BigSellerOrdersTable's 24h "Pending SKU from
 * Shopee" label branch and DA-11 deferral (no buyer columns).
 *
 * Wave 3 (Plan 07 Task 3) will add the label branching logic + confirm no
 * buyer columns are rendered. Until then, rows with empty skuVoList show a
 * generic "--" regardless of age, so the 24h label assertion fails red.
 *
 * Anchors: DA-13 (24h label), DA-11 (buyer PII deferred).
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BigSellerOrdersTable } from "../BigSellerOrdersTable";

type Order = {
  _id: string;
  platformOrderId: string;
  platform: string;
  shopName: string;
  orderState: string;
  orderTimeMs: number;
  saleAmount: number;
  skuVoList: Array<{ sku: string; skuNum: number; returnNum: number; isAddition: number }>;
};

function mkOrder(overrides: Partial<Order>): Order {
  return {
    _id: "ord1",
    platformOrderId: "SH-001",
    platform: "shopee",
    shopName: "Frollie - S",
    orderState: "completed",
    orderTimeMs: Date.now(),
    saleAmount: 100000,
    skuVoList: [],
    ...overrides,
  };
}

describe("BigSellerOrdersTable — Phase 79 Plan 07 T3", () => {
  it("renders 'Pending SKU from Shopee' for a Shopee row < 24h with empty skuVoList", () => {
    const recent = mkOrder({
      platform: "shopee",
      orderTimeMs: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
      skuVoList: [],
    });
    // @ts-expect-error — Table prop name/shape stabilizes in Wave 3.
    render(<BigSellerOrdersTable orders={[recent]} />);
    expect(screen.getByText("Pending SKU from Shopee")).toBeInTheDocument();
  });

  it("renders bare '--' for a row ≥ 24h old with empty skuVoList", () => {
    const old = mkOrder({
      platform: "shopee",
      orderTimeMs: Date.now() - 26 * 60 * 60 * 1000, // 26 hours ago
      skuVoList: [],
    });
    // @ts-expect-error — Table prop name/shape stabilizes in Wave 3.
    render(<BigSellerOrdersTable orders={[old]} />);
    expect(screen.queryByText("Pending SKU from Shopee")).not.toBeInTheDocument();
    expect(screen.getAllByText("--").length).toBeGreaterThan(0);
  });

  it("renders resolved product names when skuVoList has entries", () => {
    const resolved = mkOrder({
      skuVoList: [{ sku: "FRO-ORI", skuNum: 2, returnNum: 0, isAddition: 0 }],
    });
    // @ts-expect-error — Table prop name/shape stabilizes in Wave 3.
    render(<BigSellerOrdersTable orders={[resolved]} />);
    expect(screen.queryByText("Pending SKU from Shopee")).not.toBeInTheDocument();
    expect(screen.getByText(/FRO-ORI/)).toBeInTheDocument();
  });

  it("DA-11: does NOT render any buyer PII column headers or cells", () => {
    const order = mkOrder({
      skuVoList: [{ sku: "FRO-ORI", skuNum: 1, returnNum: 0, isAddition: 0 }],
    });
    // @ts-expect-error — Table prop name/shape stabilizes in Wave 3.
    render(<BigSellerOrdersTable orders={[order]} />);

    // These PII columns are explicitly deferred per DA-11.
    expect(screen.queryByText(/Buyer name/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Buyer phone/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Buyer address/i)).not.toBeInTheDocument();
  });
});
