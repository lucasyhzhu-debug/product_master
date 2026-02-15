/**
 * Status Transitions Helper Tests
 *
 * Tests for pure functions in statusTransitions.ts and autoEntry.ts
 * Phase 14-02: TDD RED-GREEN-REFACTOR for status transitions and auto-entry
 */

import { describe, it, expect } from "vitest";
import {
  TERMINAL_STATUSES,
  ALL_ORDER_STATUSES,
  isTerminalStatus,
  canCancelOrder,
  isValidForwardTransition,
  isValidBackwardTransition,
  computeIsKitchenVisible,
} from "../helpers/statusTransitions";
import { shouldAutoEnterKitchen } from "../helpers/autoEntry";

// ============================================
// TERMINAL_STATUSES Tests
// ============================================
describe("TERMINAL_STATUSES", () => {
  it("should contain Complete and Cancelled", () => {
    expect(TERMINAL_STATUSES).toContain("Complete");
    expect(TERMINAL_STATUSES).toContain("Cancelled");
  });

  it("should have exactly 2 terminal statuses", () => {
    expect(TERMINAL_STATUSES.length).toBe(2);
  });
});

// ============================================
// ALL_ORDER_STATUSES Tests
// ============================================
describe("ALL_ORDER_STATUSES", () => {
  it("should contain all expected statuses", () => {
    const expectedStatuses = [
      "Draft",
      "AwaitingPayment",
      "PaymentReceived",
      "BeingPrepared",
      "AwaitingDelivery",
      "Complete",
      "Cancelled",
    ];

    for (const status of expectedStatuses) {
      expect(ALL_ORDER_STATUSES).toContain(status);
    }
  });

  it("should have exactly 7 statuses", () => {
    expect(ALL_ORDER_STATUSES.length).toBe(7);
  });
});

// ============================================
// isTerminalStatus() Tests
// ============================================
describe("isTerminalStatus", () => {
  it("should return true for Complete", () => {
    expect(isTerminalStatus("Complete")).toBe(true);
  });

  it("should return true for Cancelled", () => {
    expect(isTerminalStatus("Cancelled")).toBe(true);
  });

  it("should return false for non-terminal statuses", () => {
    expect(isTerminalStatus("Draft")).toBe(false);
    expect(isTerminalStatus("AwaitingPayment")).toBe(false);
    expect(isTerminalStatus("PaymentReceived")).toBe(false);
    expect(isTerminalStatus("BeingPrepared")).toBe(false);
    expect(isTerminalStatus("AwaitingDelivery")).toBe(false);
  });

  it("should return false for unknown statuses", () => {
    expect(isTerminalStatus("Unknown")).toBe(false);
    expect(isTerminalStatus("")).toBe(false);
  });
});

// ============================================
// canCancelOrder() Tests
// ============================================
describe("canCancelOrder", () => {
  it("should return true for Draft orders", () => {
    expect(canCancelOrder("Draft")).toBe(true);
  });

  it("should return true for AwaitingPayment orders", () => {
    expect(canCancelOrder("AwaitingPayment")).toBe(true);
  });

  it("should return true for PaymentReceived orders", () => {
    expect(canCancelOrder("PaymentReceived")).toBe(true);
  });

  it("should return true for BeingPrepared orders", () => {
    expect(canCancelOrder("BeingPrepared")).toBe(true);
  });

  it("should return true for AwaitingDelivery orders", () => {
    expect(canCancelOrder("AwaitingDelivery")).toBe(true);
  });

  it("should return false for Complete orders", () => {
    expect(canCancelOrder("Complete")).toBe(false);
  });

  it("should return false for already Cancelled orders", () => {
    expect(canCancelOrder("Cancelled")).toBe(false);
  });
});

// ============================================
// isValidForwardTransition() Tests
// ============================================
describe("isValidForwardTransition", () => {
  it("should allow Draft -> AwaitingPayment", () => {
    expect(isValidForwardTransition("Draft", "AwaitingPayment")).toBe(true);
  });

  it("should allow AwaitingPayment -> PaymentReceived", () => {
    expect(isValidForwardTransition("AwaitingPayment", "PaymentReceived")).toBe(true);
  });

  it("should allow PaymentReceived -> BeingPrepared", () => {
    expect(isValidForwardTransition("PaymentReceived", "BeingPrepared")).toBe(true);
  });

  it("should allow BeingPrepared -> AwaitingDelivery", () => {
    expect(isValidForwardTransition("BeingPrepared", "AwaitingDelivery")).toBe(true);
  });

  it("should allow AwaitingDelivery -> Complete", () => {
    expect(isValidForwardTransition("AwaitingDelivery", "Complete")).toBe(true);
  });

  it("should reject skipping statuses (Draft -> PaymentReceived)", () => {
    expect(isValidForwardTransition("Draft", "PaymentReceived")).toBe(false);
  });

  it("should reject forward from Complete (terminal)", () => {
    expect(isValidForwardTransition("Complete", "Draft")).toBe(false);
  });

  it("should reject forward from Cancelled (terminal)", () => {
    expect(isValidForwardTransition("Cancelled", "Draft")).toBe(false);
  });

  it("should reject same-status transition", () => {
    expect(isValidForwardTransition("Draft", "Draft")).toBe(false);
  });

  it("should reject backward direction as forward", () => {
    expect(isValidForwardTransition("PaymentReceived", "AwaitingPayment")).toBe(false);
  });
});

// ============================================
// isValidBackwardTransition() Tests
// ============================================
describe("isValidBackwardTransition", () => {
  it("should allow AwaitingPayment -> Draft", () => {
    expect(isValidBackwardTransition("AwaitingPayment", "Draft")).toBe(true);
  });

  it("should allow PaymentReceived -> AwaitingPayment", () => {
    expect(isValidBackwardTransition("PaymentReceived", "AwaitingPayment")).toBe(true);
  });

  it("should allow PaymentReceived -> Draft (multi-step back)", () => {
    expect(isValidBackwardTransition("PaymentReceived", "Draft")).toBe(true);
  });

  it("should allow BeingPrepared -> PaymentReceived", () => {
    expect(isValidBackwardTransition("BeingPrepared", "PaymentReceived")).toBe(true);
  });

  it("should allow AwaitingDelivery -> BeingPrepared", () => {
    expect(isValidBackwardTransition("AwaitingDelivery", "BeingPrepared")).toBe(true);
  });

  it("should allow Complete -> AwaitingDelivery", () => {
    expect(isValidBackwardTransition("Complete", "AwaitingDelivery")).toBe(true);
  });

  it("should reject wrong direction (Draft -> AwaitingPayment is forward, not backward)", () => {
    expect(isValidBackwardTransition("Draft", "AwaitingPayment")).toBe(false);
  });

  it("should reject Cancelled -> Draft (cancelled cannot revert)", () => {
    expect(isValidBackwardTransition("Cancelled", "Draft")).toBe(false);
  });

  it("should reject Cancelled -> any status", () => {
    expect(isValidBackwardTransition("Cancelled", "AwaitingPayment")).toBe(false);
    expect(isValidBackwardTransition("Cancelled", "PaymentReceived")).toBe(false);
  });
});

// ============================================
// computeIsKitchenVisible() Tests
// ============================================
describe("computeIsKitchenVisible", () => {
  it("should return true for BeingPrepared", () => {
    expect(computeIsKitchenVisible("BeingPrepared")).toBe(true);
  });

  it("should return false for Draft", () => {
    expect(computeIsKitchenVisible("Draft")).toBe(false);
  });

  it("should return false for PaymentReceived", () => {
    expect(computeIsKitchenVisible("PaymentReceived")).toBe(false);
  });

  it("should return false for Complete", () => {
    expect(computeIsKitchenVisible("Complete")).toBe(false);
  });

  it("should return false for AwaitingPayment", () => {
    expect(computeIsKitchenVisible("AwaitingPayment")).toBe(false);
  });

  it("should return false for AwaitingDelivery", () => {
    expect(computeIsKitchenVisible("AwaitingDelivery")).toBe(false);
  });

  it("should return false for Cancelled", () => {
    expect(computeIsKitchenVisible("Cancelled")).toBe(false);
  });
});

// ============================================
// shouldAutoEnterKitchen() Tests
// ============================================
describe("shouldAutoEnterKitchen", () => {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const TWO_DAYS_MS = 2 * ONE_DAY_MS;
  const NOW = Date.now();

  it("should return false when order is due in 3 days (>2 day threshold)", () => {
    expect(
      shouldAutoEnterKitchen(
        { status: "PaymentReceived", dueDate: NOW + 3 * ONE_DAY_MS },
        NOW
      )
    ).toBe(false);
  });

  it("should return true when order is due in exactly 2 days (<=2 day threshold)", () => {
    expect(
      shouldAutoEnterKitchen(
        { status: "PaymentReceived", dueDate: NOW + TWO_DAYS_MS },
        NOW
      )
    ).toBe(true);
  });

  it("should return true when order is due in 1 day", () => {
    expect(
      shouldAutoEnterKitchen(
        { status: "PaymentReceived", dueDate: NOW + ONE_DAY_MS },
        NOW
      )
    ).toBe(true);
  });

  it("should return true when order is due today", () => {
    expect(
      shouldAutoEnterKitchen(
        { status: "PaymentReceived", dueDate: NOW },
        NOW
      )
    ).toBe(true);
  });

  it("should return true when order is overdue", () => {
    expect(
      shouldAutoEnterKitchen(
        { status: "PaymentReceived", dueDate: NOW - ONE_DAY_MS },
        NOW
      )
    ).toBe(true);
  });

  it("should return false when kitchenEnteredAt is set (threshold consumed)", () => {
    expect(
      shouldAutoEnterKitchen(
        {
          status: "PaymentReceived",
          dueDate: NOW + TWO_DAYS_MS,
          kitchenEnteredAt: NOW - ONE_DAY_MS,
        },
        NOW
      )
    ).toBe(false);
  });

  it("should return false when status is AwaitingPayment (not PaymentReceived)", () => {
    expect(
      shouldAutoEnterKitchen(
        { status: "AwaitingPayment", dueDate: NOW + TWO_DAYS_MS },
        NOW
      )
    ).toBe(false);
  });

  it("should return false when status is BeingPrepared (already in kitchen)", () => {
    expect(
      shouldAutoEnterKitchen(
        { status: "BeingPrepared", dueDate: NOW + TWO_DAYS_MS },
        NOW
      )
    ).toBe(false);
  });

  it("should return false when status is Draft", () => {
    expect(
      shouldAutoEnterKitchen(
        { status: "Draft", dueDate: NOW + ONE_DAY_MS },
        NOW
      )
    ).toBe(false);
  });

  it("should return false when order has no dueDate", () => {
    expect(
      shouldAutoEnterKitchen(
        { status: "PaymentReceived" },
        NOW
      )
    ).toBe(false);
  });

  it("should return true for expedited order regardless of due date", () => {
    expect(
      shouldAutoEnterKitchen(
        {
          status: "PaymentReceived",
          dueDate: NOW + 10 * ONE_DAY_MS,
          expedited: true,
        },
        NOW
      )
    ).toBe(true);
  });

  it("should return true for expedited order even without dueDate", () => {
    expect(
      shouldAutoEnterKitchen(
        { status: "PaymentReceived", expedited: true },
        NOW
      )
    ).toBe(true);
  });

  it("should return false for expedited order not in PaymentReceived status", () => {
    expect(
      shouldAutoEnterKitchen(
        { status: "Draft", expedited: true, dueDate: NOW + ONE_DAY_MS },
        NOW
      )
    ).toBe(false);
  });
});
