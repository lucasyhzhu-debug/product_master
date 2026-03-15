/**
 * Unit tests for shared validation helpers.
 *
 * Covers the parameterized label on validateRequiredReason (Phase 52 I2).
 */

import { describe, it, expect } from "vitest";
import {
  validateRequiredReason,
  validatePositiveIntegerAmount,
  validatePeriodRange,
  validateRequiredDescription,
} from "../validation";

describe("validateRequiredReason with custom label", () => {
  it("throws with default label when reason is empty", () => {
    expect(() => validateRequiredReason("")).toThrow("Void reason is required");
    expect(() => validateRequiredReason("  ")).toThrow("Void reason is required");
  });

  it("throws with custom label when reason is empty", () => {
    expect(() => validateRequiredReason("", "Rejection reason")).toThrow("Rejection reason is required");
    expect(() => validateRequiredReason("   ", "Rejection reason")).toThrow("Rejection reason is required");
  });

  it("does not throw when reason is valid regardless of label", () => {
    expect(() => validateRequiredReason("valid reason")).not.toThrow();
    expect(() => validateRequiredReason("valid reason", "Rejection reason")).not.toThrow();
  });
});

describe("validatePositiveIntegerAmount", () => {
  it("throws on zero", () => {
    expect(() => validatePositiveIntegerAmount(0)).toThrow("positive integer");
  });

  it("throws on negative", () => {
    expect(() => validatePositiveIntegerAmount(-1)).toThrow("positive integer");
  });

  it("throws on fractional", () => {
    expect(() => validatePositiveIntegerAmount(1.5)).toThrow("positive integer");
  });

  it("accepts valid positive integer", () => {
    expect(() => validatePositiveIntegerAmount(100)).not.toThrow();
  });
});

describe("validatePeriodRange", () => {
  it("throws when start >= end", () => {
    expect(() => validatePeriodRange(100, 100)).toThrow("before period end");
    expect(() => validatePeriodRange(200, 100)).toThrow("before period end");
  });

  it("accepts start < end", () => {
    expect(() => validatePeriodRange(100, 200)).not.toThrow();
  });
});

describe("validateRequiredDescription", () => {
  it("throws on empty string", () => {
    expect(() => validateRequiredDescription("")).toThrow("Description is required");
    expect(() => validateRequiredDescription("   ")).toThrow("Description is required");
  });

  it("accepts non-empty string", () => {
    expect(() => validateRequiredDescription("Payroll")).not.toThrow();
  });
});
