/**
 * Consignment Settlement Helper Tests
 *
 * Tests pure business logic for settlement math, auto-archive rules,
 * settlement guards, input validation, and revenue bridge building.
 */

import { describe, it, expect } from "vitest";
import {
  computeSettlementMath,
  shouldAutoArchive,
  assertSettlementEditable,
  validateSettlementInput,
} from "../helpers";

// ============================================
// Settlement Math Tests (computeSettlementMath)
// ============================================

describe("computeSettlementMath", () => {
  it("computes 10% rev share on 5,000,000", () => {
    const result = computeSettlementMath(5_000_000, 10);
    expect(result).toEqual({
      revShareAmount: 500_000,
      frolliePayment: 4_500_000,
    });
  });

  it("computes 15% rev share on 1,000,000", () => {
    const result = computeSettlementMath(1_000_000, 15);
    expect(result).toEqual({
      revShareAmount: 150_000,
      frolliePayment: 850_000,
    });
  });

  it("computes 0% rev share (Frollie keeps all)", () => {
    const result = computeSettlementMath(1_000_000, 0);
    expect(result).toEqual({
      revShareAmount: 0,
      frolliePayment: 1_000_000,
    });
  });

  it("computes 100% rev share (outlet keeps all)", () => {
    const result = computeSettlementMath(1_000_000, 100);
    expect(result).toEqual({
      revShareAmount: 1_000_000,
      frolliePayment: 0,
    });
  });

  it("computes zero revenue correctly", () => {
    const result = computeSettlementMath(0, 10);
    expect(result).toEqual({
      revShareAmount: 0,
      frolliePayment: 0,
    });
  });
});

// ============================================
// Auto-Archive Tests (shouldAutoArchive)
// ============================================

describe("shouldAutoArchive", () => {
  it("returns true for event-type outlets", () => {
    expect(shouldAutoArchive("event")).toBe(true);
  });

  it("returns false for cafe-type outlets", () => {
    expect(shouldAutoArchive("cafe")).toBe(false);
  });

  it("returns false for retail-type outlets", () => {
    expect(shouldAutoArchive("retail")).toBe(false);
  });
});

// ============================================
// Settlement Guard Tests (assertSettlementEditable)
// ============================================

describe("assertSettlementEditable", () => {
  it("does NOT throw for pending settlements", () => {
    expect(() => assertSettlementEditable("pending")).not.toThrow();
  });

  it("throws for paid settlements", () => {
    expect(() => assertSettlementEditable("paid")).toThrow(
      "Cannot modify paid settlement"
    );
  });
});

// ============================================
// Input Validation Tests (validateSettlementInput)
// ============================================

describe("validateSettlementInput", () => {
  it("throws on negative totalRevenue", () => {
    expect(() =>
      validateSettlementInput({
        totalRevenue: -100,
        periodStart: 0,
        periodEnd: 1,
      })
    ).toThrow("Revenue cannot be negative");
  });

  it("throws when periodStart > periodEnd", () => {
    expect(() =>
      validateSettlementInput({
        totalRevenue: 100,
        periodStart: 1000,
        periodEnd: 500,
      })
    ).toThrow("Period start must be before period end");
  });

  it("passes with valid input", () => {
    expect(() =>
      validateSettlementInput({
        totalRevenue: 100,
        periodStart: 1,
        periodEnd: 2,
      })
    ).not.toThrow();
  });
});

