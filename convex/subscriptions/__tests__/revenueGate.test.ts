import { describe, it, expect } from "vitest";
import { isSubscriptionOrder } from "../revenueGate";

describe("isSubscriptionOrder", () => {
  it("true when fundingSource is subscription_credit", () => {
    expect(isSubscriptionOrder({ fundingSource: "subscription_credit" })).toBe(true);
  });
  it("true when subscriptionId is present", () => {
    expect(isSubscriptionOrder({ subscriptionId: "sub1" })).toBe(true);
  });
  it("false for a normal order", () => {
    expect(isSubscriptionOrder({ fundingSource: "normal" })).toBe(false);
    expect(isSubscriptionOrder({})).toBe(false);
  });
});
