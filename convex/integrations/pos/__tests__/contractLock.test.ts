import { describe, it, expect } from "vitest";
import { salesPageFixture, refundsPageFixture } from "../fixtures";
import { posTransactionsPageSchema, posRefundsPageSchema } from "../contractSchema";

describe("POS contract fixture lock", () => {
  it("accepts the frozen sales fixture", () => {
    expect(() => posTransactionsPageSchema.parse(salesPageFixture)).not.toThrow();
  });
  it("accepts the frozen refunds fixture", () => {
    expect(() => posRefundsPageSchema.parse(refundsPageFixture)).not.toThrow();
  });
  it("rejects an EXTRA key (POS-side additive drift tripwire)", () => {
    const drifted = { ...salesPageFixture,
      data: [{ ...salesPageFixture.data[0], surprise: 1 }] };
    expect(() => posTransactionsPageSchema.parse(drifted)).toThrow();
  });
  it("rejects a MISSING key (POS-side removal drift)", () => {
    const { total, ...rest } = salesPageFixture.data[0];
    const drifted = { ...salesPageFixture, data: [rest] };
    expect(() => posTransactionsPageSchema.parse(drifted)).toThrow();
  });
});
