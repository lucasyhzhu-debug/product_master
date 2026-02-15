/**
 * Status Transitions Helper Tests
 *
 * Tests for pure functions in statusTransitions.ts
 * Phase 14: Updated for 7-status model
 */

import { describe, it, expect } from "vitest";
import {
  TERMINAL_STATUSES,
  ALL_ORDER_STATUSES,
  isTerminalStatus,
  canCancelOrder,
} from "../helpers/statusTransitions";

// ============================================
// TERMINAL_STATUSES Tests - 2 tests
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
// ALL_ORDER_STATUSES Tests - 2 tests
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
// isTerminalStatus() Tests - 4 tests
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
// canCancelOrder() Tests - 4 tests
// ============================================
describe("canCancelOrder", () => {
  it("should return true for Draft orders", () => {
    expect(canCancelOrder("Draft")).toBe(true);
  });

  it("should return true for in-progress orders", () => {
    expect(canCancelOrder("PaymentReceived")).toBe(true);
    expect(canCancelOrder("BeingPrepared")).toBe(true);
    expect(canCancelOrder("AwaitingDelivery")).toBe(true);
  });

  it("should return false for completed orders", () => {
    expect(canCancelOrder("Complete")).toBe(false);
  });

  it("should return false for already cancelled orders", () => {
    expect(canCancelOrder("Cancelled")).toBe(false);
  });
});
