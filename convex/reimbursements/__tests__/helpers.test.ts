/**
 * Unit tests for reimbursement helper validation functions.
 *
 * TDD RED/GREEN cycle: these tests define the expected behavior
 * for pure validation helpers used by reimbursement mutations.
 */

import { describe, test, expect } from "vitest";
import {
  validateBankReference,
  validateTransferDate,
  validateVoidReason,
} from "../helpers";

describe("validateBankReference", () => {
  test("accepts a valid non-empty reference", () => {
    expect(() => validateBankReference("ABC123")).not.toThrow();
  });

  test("accepts a reference with spaces around it", () => {
    expect(() => validateBankReference("  REF-001  ")).not.toThrow();
  });

  test("throws for empty string", () => {
    expect(() => validateBankReference("")).toThrow(
      "Bank reference number is required"
    );
  });

  test("throws for whitespace-only string", () => {
    expect(() => validateBankReference("   ")).toThrow(
      "Bank reference number is required"
    );
  });
});

describe("validateTransferDate", () => {
  test("accepts a valid positive timestamp", () => {
    expect(() => validateTransferDate(Date.now())).not.toThrow();
  });

  test("accepts a small positive number", () => {
    expect(() => validateTransferDate(1)).not.toThrow();
  });

  test("throws for zero", () => {
    expect(() => validateTransferDate(0)).toThrow(
      "Transfer date is required"
    );
  });

  test("throws for negative number", () => {
    expect(() => validateTransferDate(-1)).toThrow(
      "Transfer date is required"
    );
  });
});

describe("validateVoidReason", () => {
  test("accepts a valid non-empty reason", () => {
    expect(() => validateVoidReason("legit reason")).not.toThrow();
  });

  test("throws for empty string", () => {
    expect(() => validateVoidReason("")).toThrow("Void reason is required");
  });

  test("throws for whitespace-only string", () => {
    expect(() => validateVoidReason("   ")).toThrow(
      "Void reason is required"
    );
  });
});
