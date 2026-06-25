import { describe, it, expect } from "vitest";
import { roleForKind, REMINDER_KINDS } from "../kinds";
import { subscriptionSlotKey } from "../../deliveryReceipts";

describe("roleForKind", () => {
  it("routes the 5 ops kinds to subscription-ops", () => {
    for (const k of ["confirm-next-week","invoice-due","today-deliveries","change-cutoff","reconcile"] as const) {
      expect(roleForKind(k)).toBe("subscription-ops");
    }
  });
  it("routes weekly-delivery-progress to founders", () => {
    expect(roleForKind("weekly-delivery-progress")).toBe("founders");
  });
  it("REMINDER_KINDS lists all six", () => {
    expect(REMINDER_KINDS).toHaveLength(6);
  });
});

describe("subscriptionSlotKey", () => {
  it("is deterministic per WIB day for a kind", () => {
    // 2026-06-25 00:05 UTC = 07:05 WIB (kind 3 fire) → WIB day 2026-06-25
    const ms = Date.UTC(2026, 5, 25, 0, 5);
    expect(subscriptionSlotKey("today-deliveries", ms)).toBe("sub:today-deliveries:2026-06-25");
  });
  it("sender and +15m watchdog compute the same key (no midnight cross)", () => {
    const primary = Date.UTC(2026, 5, 25, 0, 5);
    const watchdog = Date.UTC(2026, 5, 25, 0, 20);
    expect(subscriptionSlotKey("today-deliveries", primary))
      .toBe(subscriptionSlotKey("today-deliveries", watchdog));
  });
});
