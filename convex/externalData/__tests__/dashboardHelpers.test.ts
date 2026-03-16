/**
 * Unit tests for dashboardHelpers aggregation.
 * Verifies that aggregatePeriodRevenue uses stored revenueNet
 * instead of recalculating net from gross - commission - adBurn - promoBurn.
 */

import { describe, it, expect } from "vitest";
import { aggregatePeriodRevenue } from "../helpers/dashboardHelpers";

// Minimal mock that satisfies Doc<"externalRevenue"> shape for aggregation.
// Only fields used by aggregatePeriodRevenue are needed.
function mockRevenue(overrides: {
  source: string;
  revenueGross?: number;
  revenueNet?: number;
  commission?: number;
  adBurn?: number;
  promoBurn?: number;
  transactionCount?: number;
  externalTransactionId?: string;
}) {
  return {
    _id: "mock_id" as any,
    _creationTime: Date.now(),
    source: overrides.source,
    revenueGross: overrides.revenueGross ?? 0,
    revenueNet: overrides.revenueNet,
    commission: overrides.commission ?? 0,
    adBurn: overrides.adBurn ?? 0,
    promoBurn: overrides.promoBurn ?? 0,
    transactionCount: overrides.transactionCount ?? 1,
    externalTransactionId: overrides.externalTransactionId ?? "txn-1",
    periodStart: Date.now(),
    periodEnd: Date.now(),
    dataOrigin: "api_revenue" as const,
    confidence: "exact" as const,
  } as any;
}

describe("aggregatePeriodRevenue", () => {
  const emptyOrderMap = new Map<string, { totalAmount: number; finalTotal: number; deliveryFee: number }>();

  it("should use stored revenueNet for platform channels, not recalculate", () => {
    // Real GoBiz promo order: gross=140000, commission=29526, promoBurn=24500
    // Stored revenueNet=85974 (correct, from journal API)
    // Recalculated would be: 140000 - 29526 - 0 - 24500 = 85974 (happens to match here)
    // But for a case where revenueNet differs from recalculation:
    const records = [
      mockRevenue({
        source: "gobiz",
        revenueGross: 140000,
        revenueNet: 85974,
        commission: 29526,
        promoBurn: 24500,
        transactionCount: 1,
      }),
    ];

    const result = aggregatePeriodRevenue(records, emptyOrderMap);

    // Net MUST be the stored revenueNet, not recalculated
    expect(result.totalNet).toBe(85974);
    expect(result.channels).toHaveLength(1);
    expect(result.channels[0].net).toBe(85974);
  });

  it("should sum revenueNet correctly when it differs from recalculated value", () => {
    // Stored revenueNet intentionally differs from gross-commission-promoBurn.
    // Platform may apply taxes, adjustments, or rounding that our formula doesn't capture.
    // Recalculated: 100000 - 21090 - 24500 = 54410, but stored = 60000.
    const records = [
      mockRevenue({
        source: "gobiz",
        revenueGross: 100000,
        revenueNet: 60000, // Platform net differs from naive formula
        commission: 21090,
        promoBurn: 24500,
        transactionCount: 1,
      }),
    ];

    const result = aggregatePeriodRevenue(records, emptyOrderMap);

    // MUST use stored revenueNet (60000), NOT recalculated (54410)
    expect(result.totalNet).toBe(60000);
  });

  it("should treat revenueNet: 0 as valid zero, not fall back to revenueGross", () => {
    // revenueNet=0 is a legitimate value (100% promo-funded order).
    // The ?? operator correctly treats 0 as non-nullish. This test locks that behavior
    // so a future ?? → || refactor doesn't silently regress.
    const records = [
      mockRevenue({
        source: "gobiz",
        revenueGross: 50000,
        revenueNet: 0,
        commission: 0,
        promoBurn: 50000,
        transactionCount: 1,
      }),
    ];

    const result = aggregatePeriodRevenue(records, emptyOrderMap);

    // MUST be 0, NOT 50000. If this returns 50000, someone changed ?? to ||
    expect(result.totalNet).toBe(0);
    expect(result.channels[0].net).toBe(0);
  });

  it("should fall back to revenueGross when revenueNet is undefined", () => {
    const records = [
      mockRevenue({
        source: "gobiz",
        revenueGross: 100000,
        revenueNet: undefined,
        commission: 15000,
        transactionCount: 1,
      }),
    ];

    const result = aggregatePeriodRevenue(records, emptyOrderMap);

    // Fallback: revenueNet ?? revenueGross = 100000
    expect(result.totalNet).toBe(100000);
  });

  it("should produce correct net for BigSeller records with revenueNet set", () => {
    const records = [
      mockRevenue({
        source: "bigseller_shopee",
        revenueGross: 100000,
        revenueNet: 85000,
        commission: 15000,
        transactionCount: 1,
      }),
    ];

    const result = aggregatePeriodRevenue(records, emptyOrderMap);

    expect(result.totalNet).toBe(85000);
    expect(result.channels[0].net).toBe(85000);
  });

  it("should include commission and promoBurn in channel items", () => {
    const records = [
      mockRevenue({
        source: "gobiz",
        revenueGross: 140000,
        revenueNet: 85974,
        commission: 29526,
        promoBurn: 24500,
        transactionCount: 1,
      }),
    ];

    const result = aggregatePeriodRevenue(records, emptyOrderMap);

    expect(result.channels).toHaveLength(1);
    expect(result.channels[0]).toHaveProperty("commission", 29526);
    expect(result.channels[0]).toHaveProperty("promoBurn", 24500);
  });

  it("should aggregate totalPromoBurn correctly across channels", () => {
    const records = [
      mockRevenue({
        source: "gobiz",
        revenueGross: 140000,
        revenueNet: 85974,
        commission: 29526,
        promoBurn: 24500,
        transactionCount: 1,
      }),
      mockRevenue({
        source: "bigseller_shopee",
        revenueGross: 100000,
        revenueNet: 82000,
        commission: 15000,
        promoBurn: 3000,
        transactionCount: 1,
      }),
    ];

    const result = aggregatePeriodRevenue(records, emptyOrderMap);

    expect(result.totalPromoBurn).toBe(27500); // 24500 + 3000
    expect(result.totalNet).toBe(85974 + 82000); // Sum of stored revenueNet values
  });

  it("should default transactionCount to 1 when undefined (BigSeller/consignment records)", () => {
    // BigSeller and consignment records may not have transactionCount set.
    // Each externalRevenue record represents 1 order, so default should be 1.
    const records = [
      mockRevenue({
        source: "shopee",
        revenueGross: 196200,
        revenueNet: 180000,
        transactionCount: undefined,
      }),
      mockRevenue({
        source: "shopee",
        revenueGross: 250000,
        revenueNet: 230000,
        transactionCount: undefined,
        externalTransactionId: "txn-2",
      }),
    ];

    const result = aggregatePeriodRevenue(records, emptyOrderMap);

    // Each record without transactionCount should count as 1 transaction
    expect(result.totalTransactions).toBe(2);
    const shopeeChannel = result.channels.find((c) => c.source === "shopee");
    expect(shopeeChannel).toBeDefined();
    expect(shopeeChannel!.transactions).toBe(2);
    expect(shopeeChannel!.gross).toBe(196200 + 250000);
  });

  it("should add commission=0 and promoBurn=0 for internal channel", () => {
    // Internal channel needs an order in orderDataMap to produce data
    const orderMap = new Map([
      ["0315-001", { totalAmount: 100000, finalTotal: 90000, deliveryFee: 10000 }],
    ]);
    const records = [
      mockRevenue({
        source: "internal",
        revenueGross: 100000,
        transactionCount: 1,
        externalTransactionId: "0315-001",
      }),
    ];

    const result = aggregatePeriodRevenue(records, orderMap);

    const internalChannel = result.channels.find((c) => c.source === "internal");
    expect(internalChannel).toBeDefined();
    expect(internalChannel!.commission).toBe(0);
    expect(internalChannel!.promoBurn).toBe(0);
  });
});
