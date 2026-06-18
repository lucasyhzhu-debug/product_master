import { describe, it, expect } from "vitest";
import { posAdapter, normalizeRefunds } from "../adapter";
import { salesPageFixture, refundsPageFixture } from "../fixtures";

describe("posAdapter.normalize", () => {
  it("emits one ChannelSaleEvent per line with correct refs", () => {
    const events = posAdapter.normalize(salesPageFixture);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      source: "pos",
      occurredAt: 1718600000000,                       // = paidAt
      externalTransactionId: "R-2026-0042",
      externalItemId: "R-2026-0042|DUBAI_8PC",
      externalProductCode: "DUBAI_8PC",
      quantity: 2, unitPrice: 45000, totalPrice: 90000, // = lineSubtotal
    });
  });
});
describe("normalizeRefunds", () => {
  it("negates the total and shapes the refund identity", () => {
    const r = normalizeRefunds(refundsPageFixture);
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({
      receiptNumber: "R-2026-0042", createdAt: 1718700000000,
      negatedTotal: -45000, reason: "damaged",        // ← NEGATIVE
    });
  });
});
