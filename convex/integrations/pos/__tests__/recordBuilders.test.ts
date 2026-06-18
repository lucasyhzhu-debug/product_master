import { describe, it, expect } from "vitest";
import { buildPosSalesRecords, buildPosRefundRecords } from "../recordBuilders";
import { salesPageFixture, refundsPageFixture } from "./fixtures";

const LOG = "log123" as any;

describe("buildPosSalesRecords", () => {
  const [built] = buildPosSalesRecords(salesPageFixture, LOG);
  it("builds a positive sales parent with collapsed period + exact confidence", () => {
    expect(built.record).toMatchObject({
      source: "pos", revenueGross: 81000, transactionType: "sales",
      dataOrigin: "api_revenue", confidence: "exact",
      externalTransactionId: "R-2026-0042",
      periodStart: 1718600000000, periodEnd: 1718600000000, transactionDate: 1718600000000,
    });
    expect(built.record.revenueNet).toBeUndefined();
    expect(built.record.commission).toBeUndefined();
  });
  it("builds one item per line keyed for set-once dedup", () => {
    expect(built.items).toHaveLength(1);
    expect(built.items[0]).toMatchObject({
      externalItemId: "R-2026-0042|DUBAI_8PC", quantity: 2,
      unitPrice: 45000, totalPrice: 90000, isAutoMatched: false,
    });
  });
});
describe("buildPosRefundRecords", () => {
  const [built] = buildPosRefundRecords(refundsPageFixture, LOG);
  it("builds a NEGATIVE-gross return parent, keyed by the refund identity, with NO items", () => {
    expect(built.record).toMatchObject({
      source: "pos", revenueGross: -45000, transactionType: "return",
      dataOrigin: "api_revenue", confidence: "exact",
      externalTransactionId: "R-2026-0042|R|1718700000000",
      periodStart: 1718700000000, periodEnd: 1718700000000, transactionDate: 1718700000000,
    });
    expect("items" in built).toBe(false);
  });
});
