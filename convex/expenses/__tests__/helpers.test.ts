import { describe, it, expect } from "vitest";
import {
  requiresReceipt,
  validateExpenseAmount,
  isLateSubmission,
  checkDuplicateExpense,
  canApproveExpense,
  requiresApproverComment,
  getTargetStatusAfterApproval,
  isVoidableStatus,
  RECEIPT_THRESHOLD,
  DUPLICATE_WINDOW_DAYS,
  LATE_SUBMISSION_DAYS,
  DOA_ADMIN_ONLY_THRESHOLD,
  COMMENT_REQUIRED_THRESHOLD,
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
  // Existing 1-arg backward-compat tests (must keep working)
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

  // New 2-arg tests for payment-method-aware behavior
  it("returns true for company_paid regardless of amount (even 1000)", () => {
    expect(requiresReceipt(1000, "company_paid")).toBe(true);
  });

  it("returns true for payment_request regardless of amount (even 1000)", () => {
    expect(requiresReceipt(1000, "payment_request")).toBe(true);
  });

  it("returns false for employee_paid below threshold", () => {
    expect(requiresReceipt(49999, "employee_paid")).toBe(false);
  });

  it("returns true for employee_paid above threshold", () => {
    expect(requiresReceipt(50001, "employee_paid")).toBe(true);
  });

  it("backward compat: returns false for no payment method below threshold", () => {
    expect(requiresReceipt(49999)).toBe(false);
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

// ---------------------------------------------------------------------------
// Phase 45: DoA (Delegation of Authority) helpers
// ---------------------------------------------------------------------------

describe("DoA constants", () => {
  it("DOA_ADMIN_ONLY_THRESHOLD is 500000", () => {
    expect(DOA_ADMIN_ONLY_THRESHOLD).toBe(500_000);
  });

  it("COMMENT_REQUIRED_THRESHOLD is 500000", () => {
    expect(COMMENT_REQUIRED_THRESHOLD).toBe(500_000);
  });
});

describe("canApproveExpense", () => {
  const submitterId = "user_submitter";
  const approverId = "user_approver";

  // Manager: can approve <= 500K submitted by others
  it("manager can approve expense at threshold (500K)", () => {
    const result = canApproveExpense("manager", 500_000, submitterId, approverId);
    expect(result).toEqual({ allowed: true });
  });

  it("manager cannot approve expense above threshold (500,001)", () => {
    const result = canApproveExpense("manager", 500_001, submitterId, approverId);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
  });

  // Admin: can approve any amount submitted by others
  it("admin can approve expense above threshold (500,001)", () => {
    const result = canApproveExpense("admin", 500_001, submitterId, approverId);
    expect(result).toEqual({ allowed: true });
  });

  it("admin can approve expense at low amount", () => {
    const result = canApproveExpense("admin", 100_000, submitterId, approverId);
    expect(result).toEqual({ allowed: true });
  });

  // Self-approval blocked for ALL roles
  it("admin cannot approve own expense", () => {
    const result = canApproveExpense("admin", 100_000, submitterId, submitterId);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("own expense");
  });

  it("manager cannot approve own expense", () => {
    const result = canApproveExpense("manager", 100_000, submitterId, submitterId);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("own expense");
  });

  // Non-approver roles blocked
  it("order_staff cannot approve", () => {
    const result = canApproveExpense("order_staff", 100_000, submitterId, approverId);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("kitchen cannot approve", () => {
    const result = canApproveExpense("kitchen", 100_000, submitterId, approverId);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
  });
});

describe("requiresApproverComment", () => {
  it("returns true at threshold (500K -- >= not >)", () => {
    expect(requiresApproverComment(500_000)).toBe(true);
  });

  it("returns true above threshold", () => {
    expect(requiresApproverComment(500_001)).toBe(true);
  });

  it("returns false below threshold (499,999)", () => {
    expect(requiresApproverComment(499_999)).toBe(false);
  });

  it("returns false for small amount", () => {
    expect(requiresApproverComment(1_000)).toBe(false);
  });
});

describe("getTargetStatusAfterApproval", () => {
  it("employee_paid -> awaiting_payment", () => {
    expect(getTargetStatusAfterApproval("employee_paid")).toBe("awaiting_payment");
  });

  it("payment_request -> approved", () => {
    expect(getTargetStatusAfterApproval("payment_request")).toBe("approved");
  });

  it("company_paid -> approved (edge case)", () => {
    expect(getTargetStatusAfterApproval("company_paid")).toBe("approved");
  });
});

describe("isVoidableStatus", () => {
  it("submitted is voidable", () => {
    expect(isVoidableStatus("submitted")).toBe(true);
  });

  it("approved is voidable", () => {
    expect(isVoidableStatus("approved")).toBe(true);
  });

  it("awaiting_payment is voidable", () => {
    expect(isVoidableStatus("awaiting_payment")).toBe(true);
  });

  it("rejected is voidable", () => {
    expect(isVoidableStatus("rejected")).toBe(true);
  });

  it("recorded is voidable", () => {
    expect(isVoidableStatus("recorded")).toBe(true);
  });

  it("paid is voidable", () => {
    expect(isVoidableStatus("paid")).toBe(true);
  });

  it("reimbursed is NOT voidable", () => {
    expect(isVoidableStatus("reimbursed")).toBe(false);
  });

  it("voided is NOT voidable", () => {
    expect(isVoidableStatus("voided")).toBe(false);
  });

  it("draft is NOT voidable", () => {
    expect(isVoidableStatus("draft")).toBe(false);
  });
});
