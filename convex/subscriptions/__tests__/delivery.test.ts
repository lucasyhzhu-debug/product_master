import { describe, it, expect } from "vitest";
import { isDeliverableSubscriptionStatus } from "../delivery";

describe("isDeliverableSubscriptionStatus", () => {
  it("allows funded/in-progress statuses", () => {
    expect(isDeliverableSubscriptionStatus("PaymentReceived")).toBe(true);
    expect(isDeliverableSubscriptionStatus("BeingPrepared")).toBe(true);
    expect(isDeliverableSubscriptionStatus("AwaitingDelivery")).toBe(true); // re-press safe
  });
  it("rejects not-yet-funded and terminal statuses", () => {
    expect(isDeliverableSubscriptionStatus("Draft")).toBe(false);
    expect(isDeliverableSubscriptionStatus("AwaitingPayment")).toBe(false);
    expect(isDeliverableSubscriptionStatus("Complete")).toBe(false);
    expect(isDeliverableSubscriptionStatus("Cancelled")).toBe(false);
  });
});
