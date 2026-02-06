/**
 * Status Transitions Helper Tests
 *
 * Tests for pure functions in statusTransitions.ts
 */

import { describe, it, expect } from "vitest";
import {
  TERMINAL_STATUSES,
  ALL_ORDER_STATUSES,
  isTerminalStatus,
  canCancelOrder,
} from "../helpers/statusTransitions";
import type { Doc } from "../../_generated/dataModel";

// ============================================
// TERMINAL_STATUSES Tests - 2 tests
// ============================================
describe("TERMINAL_STATUSES", () => {
  it("should contain CompleteShipped, PickedUp, and Cancelled", () => {
    expect(TERMINAL_STATUSES).toContain("CompleteShipped");
    expect(TERMINAL_STATUSES).toContain("PickedUp");
    expect(TERMINAL_STATUSES).toContain("Cancelled");
  });

  it("should have exactly 3 terminal statuses", () => {
    expect(TERMINAL_STATUSES.length).toBe(3);
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
      "Confirmed",
      "InProduction",
      "Boxed",
      "Labeled",
      "Packaging",
      "WaitingShipment",
      "WaitingPickup",
      "CompleteShipped",
      "PickedUp",
      "Cancelled",
    ];

    for (const status of expectedStatuses) {
      expect(ALL_ORDER_STATUSES).toContain(status);
    }
  });

  it("should have exactly 12 statuses", () => {
    expect(ALL_ORDER_STATUSES.length).toBe(12);
  });
});

// ============================================
// isTerminalStatus() Tests - 4 tests
// ============================================
describe("isTerminalStatus", () => {
  it("should return true for CompleteShipped", () => {
    expect(isTerminalStatus("CompleteShipped")).toBe(true);
  });

  it("should return true for PickedUp", () => {
    expect(isTerminalStatus("PickedUp")).toBe(true);
  });

  it("should return true for Cancelled", () => {
    expect(isTerminalStatus("Cancelled")).toBe(true);
  });

  it("should return false for non-terminal statuses", () => {
    expect(isTerminalStatus("Draft")).toBe(false);
    expect(isTerminalStatus("Confirmed")).toBe(false);
    expect(isTerminalStatus("InProduction")).toBe(false);
    expect(isTerminalStatus("Packaging")).toBe(false);
    expect(isTerminalStatus("WaitingShipment")).toBe(false);
    expect(isTerminalStatus("WaitingPickup")).toBe(false);
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
  // Helper to create a mock order with a specific status
  const createMockOrder = (status: string): Doc<"orders"> => {
    return {
      _id: "test-id" as any,
      _creationTime: Date.now(),
      orderNumber: "0202-001",
      customerId: "customer-id" as any,
      customerName: "Test Customer",
      status,
      paymentStatus: "Unpaid",
      orderDate: Date.now(),
      totalAmount: 100000,
      totalCost: 50000,
      totalMargin: 50000,
      itemCount: 1,
    } as Doc<"orders">;
  };

  it("should return true for Draft orders", () => {
    const order = createMockOrder("Draft");
    expect(canCancelOrder(order)).toBe(true);
  });

  it("should return true for in-progress orders", () => {
    expect(canCancelOrder(createMockOrder("Confirmed"))).toBe(true);
    expect(canCancelOrder(createMockOrder("InProduction"))).toBe(true);
    expect(canCancelOrder(createMockOrder("Packaging"))).toBe(true);
    expect(canCancelOrder(createMockOrder("WaitingShipment"))).toBe(true);
    expect(canCancelOrder(createMockOrder("WaitingPickup"))).toBe(true);
  });

  it("should return false for completed orders", () => {
    expect(canCancelOrder(createMockOrder("CompleteShipped"))).toBe(false);
    expect(canCancelOrder(createMockOrder("PickedUp"))).toBe(false);
  });

  it("should return false for already cancelled orders", () => {
    expect(canCancelOrder(createMockOrder("Cancelled"))).toBe(false);
  });
});
