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

  // C1 gate: predicate must catch every funding path a subscription order can take.
  // Both call sites (getRevenueOrders, getDailySalesSummary) use this function as the
  // single exclusion predicate — these cases are the mechanical contract.

  it("true when subscriptionId present even if fundingSource is normal (tagged subscription)", () => {
    // An order linked to a subscription via subscriptionId must be excluded regardless
    // of how it was funded — subscriptionId is the authoritative tag.
    expect(isSubscriptionOrder({ fundingSource: "normal", subscriptionId: "sub_abc" })).toBe(true);
  });

  it("false when both fields are absent (plain retail order)", () => {
    // Retail orders must never be excluded from channel revenue.
    expect(isSubscriptionOrder({ fundingSource: undefined, subscriptionId: undefined })).toBe(false);
  });

  it("false when fundingSource is null and subscriptionId is undefined", () => {
    // Explicit null fundingSource (e.g. older orders) + no subscriptionId = retail.
    expect(isSubscriptionOrder({ fundingSource: null, subscriptionId: undefined })).toBe(false);
  });
});
