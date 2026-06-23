import { describe, it, expect } from "vitest";
import { computeRolloverExpiry } from "../rollover";

describe("computeRolloverExpiry", () => {
  it("expires leftover when policy is expire", () => {
    expect(computeRolloverExpiry({ unconsumed: 4350000, policy: "expire", rolloverExpiryWeeks: 4, weeksCarried: 0 }))
      .toEqual({ action: "expire", amount: 4350000 });
  });
  it("carries leftover forward within the horizon", () => {
    expect(computeRolloverExpiry({ unconsumed: 4350000, policy: "rollover", rolloverExpiryWeeks: 4, weeksCarried: 1 }))
      .toEqual({ action: "carry", amount: 4350000 });
  });
  it("expires rolled credit once it reaches the horizon", () => {
    expect(computeRolloverExpiry({ unconsumed: 4350000, policy: "rollover", rolloverExpiryWeeks: 4, weeksCarried: 4 }))
      .toEqual({ action: "expire", amount: 4350000 });
  });
  it("never expires when rolloverExpiryWeeks is null (explicit opt-out)", () => {
    expect(computeRolloverExpiry({ unconsumed: 4350000, policy: "rollover", rolloverExpiryWeeks: null, weeksCarried: 99 }))
      .toEqual({ action: "carry", amount: 4350000 });
  });
  it("is a no-op for zero leftover", () => {
    expect(computeRolloverExpiry({ unconsumed: 0, policy: "rollover", rolloverExpiryWeeks: 4, weeksCarried: 0 }))
      .toEqual({ action: "carry", amount: 0 });
  });
});
