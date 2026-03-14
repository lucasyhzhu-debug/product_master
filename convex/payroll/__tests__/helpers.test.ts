/**
 * TDD tests for shared validation helpers (via payroll re-exports).
 *
 * Tests validatePositiveIntegerAmount, validateRequiredReason, and
 * validatePeriodRange from convex/lib/validation.ts, accessed through
 * convex/payroll/helpers.ts re-exports.
 */

import { describe, expect, test } from "vitest";
import {
  validatePositiveIntegerAmount,
  validateRequiredReason,
  validatePeriodRange,
} from "../helpers";

// ---------------------------------------------------------------------------
// validatePositiveIntegerAmount
// ---------------------------------------------------------------------------

describe("validatePositiveIntegerAmount", () => {
  test("throws for zero", () => {
    expect(() => validatePositiveIntegerAmount(0)).toThrow("positive integer");
  });

  test("throws for negative numbers", () => {
    expect(() => validatePositiveIntegerAmount(-1)).toThrow("positive integer");
  });

  test("throws for fractional numbers", () => {
    expect(() => validatePositiveIntegerAmount(50000.5)).toThrow(
      "positive integer"
    );
  });

  test("accepts 1", () => {
    expect(() => validatePositiveIntegerAmount(1)).not.toThrow();
  });

  test("accepts large positive integer", () => {
    expect(() => validatePositiveIntegerAmount(100000)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateRequiredReason
// ---------------------------------------------------------------------------

describe("validateRequiredReason", () => {
  test("throws for empty string", () => {
    expect(() => validateRequiredReason("")).toThrow("required");
  });

  test("throws for whitespace-only string", () => {
    expect(() => validateRequiredReason("  ")).toThrow("required");
  });

  test("accepts non-empty string", () => {
    expect(() => validateRequiredReason("Duplicate entry")).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// validatePeriodRange
// ---------------------------------------------------------------------------

describe("validatePeriodRange", () => {
  test("throws when start > end", () => {
    expect(() => validatePeriodRange(100, 50)).toThrow(
      "Period start must be before period end"
    );
  });

  test("throws when start === end", () => {
    expect(() => validatePeriodRange(100, 100)).toThrow(
      "Period start must be before period end"
    );
  });

  test("accepts start < end", () => {
    expect(() => validatePeriodRange(50, 100)).not.toThrow();
  });
});
