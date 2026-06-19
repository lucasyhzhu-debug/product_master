// convex/telegram/salesSummary/__tests__/salesSummaryFormat.test.ts
import { describe, it, expect } from "vitest";
import { formatSalesSummary, type RefreshStatus } from "../salesSummaryFormat";
import type { SalesSummaryData } from "../salesSummaryQuery";

const OK: RefreshStatus = { gofood: "ok", k3mart: "ok", direct: "ok", pos: "ok" };

const daily: SalesSummaryData = {
  cadence: "daily", periodLabel: "Wed 28 May 2026", generatedAt: Date.UTC(2026, 4, 28, 16, 2),
  grandTotal: { gross: 6_200_000, orders: 3, deltaPct: null },
  channels: [
    { platform: "GoFood", gross: 4_100_000, orders: 2, deltaPct: null, products: [],
      outlets: [
        { name: "Crystal", gross: 2_300_000, orders: 1, products: [{ name: "Jumbo", qty: 12 }] },
        { name: "Tamtem", gross: 1_800_000, orders: 1, products: [{ name: "Jumbo", qty: 9 }] },
      ] },
    { platform: "Direct", gross: 2_100_000, orders: 1, deltaPct: null,
      outlets: [{ name: "—", gross: 2_100_000, orders: 1, products: [{ name: "Jumbo", qty: 15 }] }],
      products: [{ name: "Jumbo", qty: 15 }] },
  ],
};

describe("formatSalesSummary — daily", () => {
  it("renders header, GoFood by outlet, Direct channel-level, and a refresh footer", () => {
    const chunks = formatSalesSummary({ data: daily, refresh: OK });
    const text = chunks.join("\n");
    expect(text).toContain("Sales — Wed 28 May 2026");
    expect(text).toContain("Rp 6.2M");
    expect(text).toContain("Crystal");
    expect(text).toContain("12× Jumbo");
    expect(text).toContain("GoFood ✓ K3Mart ✓ Direct ✓");
    expect(text).not.toContain("vs prior"); // no deltas on daily
  });

  it("marks a failed source in the footer", () => {
    const chunks = formatSalesSummary({ data: daily, refresh: { gofood: "fail", k3mart: "ok", direct: "ok", pos: "ok" } });
    expect(chunks.join("\n")).toContain("GoFood ✗");
  });

  it("renders a POS channel as 'Block M' with its products and a Block M refresh mark", () => {
    const withPos: SalesSummaryData = {
      ...daily,
      channels: [
        ...daily.channels,
        { platform: "POS", gross: 900_000, orders: 14, deltaPct: null,
          outlets: [{ name: "—", gross: 900_000, orders: 14, products: [{ name: "Dubai 8pcs", qty: 22 }] }],
          products: [{ name: "Dubai 8pcs", qty: 22 }] },
      ],
    };
    const text = formatSalesSummary({ data: withPos, refresh: { gofood: "ok", k3mart: "ok", direct: "ok", pos: "fail" } }).join("\n");
    expect(text).toContain("Block M</b> — Rp 900K (14 orders)"); // labelled Block M, not "POS"
    expect(text).not.toContain("POS</b>");
    expect(text).toContain("22× Dubai 8pcs");
    expect(text).not.toContain("• —"); // flat channel render — no per-outlet drill-down (POS has no outletId)
    expect(text).toContain("Block M ✗"); // footer reflects the pos refresh status
  });

  it("returns a single 'no sales' message when there are no channels", () => {
    const empty: SalesSummaryData = { ...daily, channels: [], grandTotal: { gross: 0, orders: 0, deltaPct: null } };
    const chunks = formatSalesSummary({ data: empty, refresh: OK });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("No sales recorded");
  });

  it("omits the order count for K3Mart (consignment) but keeps it for GoFood/Direct", () => {
    const withK3: SalesSummaryData = {
      ...daily,
      channels: [
        ...daily.channels,
        { platform: "K3Mart", gross: 1_200_000, orders: 18, deltaPct: null,
          outlets: [{ name: "—", gross: 1_200_000, orders: 18, products: [{ name: "Original", qty: 7 }] }],
          products: [{ name: "Original", qty: 7 }] },
      ],
    };
    const text = formatSalesSummary({ data: withK3, refresh: OK }).join("\n");
    expect(text).toContain("K3Mart</b> — Rp 1.2M"); // no "(18 orders)"
    expect(text).not.toContain("(18 orders)");
    expect(text).toContain("(2 orders)"); // GoFood still shows its order count
    expect(text).toContain("7× Original");
  });
});

describe("formatSalesSummary — weekly", () => {
  it("renders the date-range header and ▲/▼ deltas, no refresh footer", () => {
    const weekly: SalesSummaryData = {
      ...daily, cadence: "weekly", periodLabel: "18–24 May 2026",
      grandTotal: { gross: 58_200_000, orders: 980, deltaPct: 12 },
      channels: [{ ...daily.channels[0], gross: 34_100_000, deltaPct: 8 }],
    };
    const text = formatSalesSummary({ data: weekly, refresh: OK }).join("\n");
    expect(text).toContain("Weekly Sales — 18–24 May 2026");
    expect(text).toContain("▲ 12% vs prior week");
    expect(text).toContain("▲ 8%");
    expect(text).not.toContain("Refreshed");
  });
});
