import { describe, it, expect } from "vitest";
import {
  requiresReceipt,
  validateExpenseAmount,
  isLateSubmission,
  checkDuplicateExpense,
  RECEIPT_THRESHOLD,
  DUPLICATE_WINDOW_DAYS,
  LATE_SUBMISSION_DAYS,
} from "../helpers";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe("constants", () => {
  it("RECEIPT_THRESHOLD is 50000", () => {
    expect(RECEIPT_THRESHOLD).toBe(50_000);
  });

  it("DUPLICATE_WINDOW_DAYS is 7", () => {
    expect(DUPLICATE_WINDOW_DAYS).toBe(7);
  });

  it("LATE_SUBMISSION_DAYS is 14", () => {
    expect(LATE_SUBMISSION_DAYS).toBe(14);
  });
});

describe("requiresReceipt", () => {
  it("returns true for amount 50001 (above threshold)", () => {
    expect(requiresReceipt(50001)).toBe(true);
  });

  it("returns false for amount 50000 (at threshold)", () => {
    expect(requiresReceipt(50000)).toBe(false);
  });

  it("returns false for amount 49999 (below threshold)", () => {
    expect(requiresReceipt(49999)).toBe(false);
  });

  it("returns false for amount 1 (small amount)", () => {
    expect(requiresReceipt(1)).toBe(false);
  });
});

describe("validateExpenseAmount", () => {
  it("throws on amount 0", () => {
    expect(() => validateExpenseAmount(0)).toThrow("positive integer");
  });

  it("throws on negative amount", () => {
    expect(() => validateExpenseAmount(-1)).toThrow("positive integer");
  });

  it("throws on fractional amount", () => {
    expect(() => validateExpenseAmount(50000.5)).toThrow("positive integer");
  });

  it("does not throw on valid positive integer", () => {
    expect(() => validateExpenseAmount(50000)).not.toThrow();
  });

  it("does not throw on amount 1", () => {
    expect(() => validateExpenseAmount(1)).not.toThrow();
  });
});

describe("isLateSubmission", () => {
  const now = Date.now();

  it("returns true when expense is 15 days old", () => {
    const expenseDate = now - 15 * MS_PER_DAY;
    expect(isLateSubmission(expenseDate, now)).toBe(true);
  });

  it("returns false when expense is exactly 14 days old (boundary)", () => {
    const expenseDate = now - 14 * MS_PER_DAY;
    expect(isLateSubmission(expenseDate, now)).toBe(false);
  });

  it("returns false when expense is 13 days old", () => {
    const expenseDate = now - 13 * MS_PER_DAY;
    expect(isLateSubmission(expenseDate, now)).toBe(false);
  });

  it("returns false when expense is today", () => {
    expect(isLateSubmission(now, now)).toBe(false);
  });
});

describe("checkDuplicateExpense", () => {
  const baseDate = Date.now();

  it("returns warning string for same amount and same date", () => {
    const existing = [
      { amount: 50000, expenseDate: baseDate, expenseNumber: "EXP-0313-001" },
    ];
    const result = checkDuplicateExpense(existing, 50000, baseDate);
    expect(result).toBeTypeOf("string");
    expect(result).toContain("EXP-0313-001");
    expect(result).toContain("duplicate");
  });

  it("returns warning when dates are 6 days apart (within 7-day window)", () => {
    const existing = [
      {
        amount: 50000,
        expenseDate: baseDate - 6 * MS_PER_DAY,
        expenseNumber: "EXP-0307-001",
      },
    ];
    const result = checkDuplicateExpense(existing, 50000, baseDate);
    expect(result).toBeTypeOf("string");
    expect(result).toContain("EXP-0307-001");
  });

  it("returns null when dates are 8 days apart (outside 7-day window)", () => {
    const existing = [
      {
        amount: 50000,
        expenseDate: baseDate - 8 * MS_PER_DAY,
        expenseNumber: "EXP-0305-001",
      },
    ];
    const result = checkDuplicateExpense(existing, 50000, baseDate);
    expect(result).toBeNull();
  });

  it("returns null for different amount same date", () => {
    const existing = [
      { amount: 40000, expenseDate: baseDate, expenseNumber: "EXP-0313-001" },
    ];
    const result = checkDuplicateExpense(existing, 50000, baseDate);
    expect(result).toBeNull();
  });

  it("returns null for empty array", () => {
    const result = checkDuplicateExpense([], 50000, baseDate);
    expect(result).toBeNull();
  });

  it("checks symmetric window (future dates within window match too)", () => {
    const existing = [
      {
        amount: 50000,
        expenseDate: baseDate + 6 * MS_PER_DAY,
        expenseNumber: "EXP-0319-001",
      },
    ];
    const result = checkDuplicateExpense(existing, 50000, baseDate);
    expect(result).toBeTypeOf("string");
    expect(result).toContain("EXP-0319-001");
  });
});
