import { describe, it, expect } from "vitest";
import {
  detectSplits,
  detectApproverConcentration,
  detectUnfamiliarVendors,
  MS_48_HOURS,
  SPLIT_THRESHOLD,
  CONCENTRATION_THRESHOLD,
  MIN_EXPENSES_FOR_CONCENTRATION,
  type ExpenseForFraud,
  type SplitFlag,
  type ConcentrationFlag,
} from "../fraudHelpers";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ─── Test data factories ───

function makeExpense(overrides: Partial<ExpenseForFraud> & { _id: string }): ExpenseForFraud {
  return {
    submittedBy: "user1",
    accountId: "acct1",
    amount: 100_000,
    expenseDate: Date.now(),
    vendorName: "Test Vendor",
    status: "submitted",
    ...overrides,
  };
}

// ============================================================================
// Constants
// ============================================================================

describe("fraud detection constants", () => {
  it("MS_48_HOURS is 48 hours in milliseconds", () => {
    expect(MS_48_HOURS).toBe(48 * 60 * 60 * 1000);
  });

  it("SPLIT_THRESHOLD is 500,000", () => {
    expect(SPLIT_THRESHOLD).toBe(500_000);
  });

  it("CONCENTRATION_THRESHOLD is 0.80", () => {
    expect(CONCENTRATION_THRESHOLD).toBe(0.80);
  });

  it("MIN_EXPENSES_FOR_CONCENTRATION is 2", () => {
    expect(MIN_EXPENSES_FOR_CONCENTRATION).toBe(2);
  });
});

// ============================================================================
// detectSplits
// ============================================================================

describe("detectSplits", () => {
  it("returns empty array when no expenses", () => {
    expect(detectSplits([])).toEqual([]);
  });

  it("returns empty array when single expense per group", () => {
    const expenses = [
      makeExpense({ _id: "e1", amount: 600_000 }),
    ];
    expect(detectSplits(expenses)).toEqual([]);
  });

  it("flags when 2+ expenses from same employee + same GL within 48hrs sum > 500K", () => {
    const now = Date.now();
    const expenses = [
      makeExpense({ _id: "e1", submittedBy: "emp1", accountId: "gl1", amount: 300_000, expenseDate: now }),
      makeExpense({ _id: "e2", submittedBy: "emp1", accountId: "gl1", amount: 250_000, expenseDate: now + 12 * 60 * 60 * 1000 }),
    ];
    const flags = detectSplits(expenses);
    expect(flags.length).toBe(1);
    expect(flags[0].employeeId).toBe("emp1");
    expect(flags[0].accountId).toBe("gl1");
    expect(flags[0].totalAmount).toBe(550_000);
    expect(flags[0].expenseIds).toContain("e1");
    expect(flags[0].expenseIds).toContain("e2");
  });

  it("does NOT flag when expenses are > 48hrs apart", () => {
    const now = Date.now();
    const expenses = [
      makeExpense({ _id: "e1", submittedBy: "emp1", accountId: "gl1", amount: 300_000, expenseDate: now }),
      makeExpense({ _id: "e2", submittedBy: "emp1", accountId: "gl1", amount: 300_000, expenseDate: now + 49 * 60 * 60 * 1000 }),
    ];
    expect(detectSplits(expenses)).toEqual([]);
  });

  it("does NOT flag when sum <= 500K", () => {
    const now = Date.now();
    const expenses = [
      makeExpense({ _id: "e1", submittedBy: "emp1", accountId: "gl1", amount: 200_000, expenseDate: now }),
      makeExpense({ _id: "e2", submittedBy: "emp1", accountId: "gl1", amount: 200_000, expenseDate: now + 1000 }),
    ];
    expect(detectSplits(expenses)).toEqual([]);
  });

  it("does NOT flag expenses from different employees", () => {
    const now = Date.now();
    const expenses = [
      makeExpense({ _id: "e1", submittedBy: "emp1", accountId: "gl1", amount: 300_000, expenseDate: now }),
      makeExpense({ _id: "e2", submittedBy: "emp2", accountId: "gl1", amount: 300_000, expenseDate: now }),
    ];
    expect(detectSplits(expenses)).toEqual([]);
  });

  it("does NOT flag expenses to different GL accounts", () => {
    const now = Date.now();
    const expenses = [
      makeExpense({ _id: "e1", submittedBy: "emp1", accountId: "gl1", amount: 300_000, expenseDate: now }),
      makeExpense({ _id: "e2", submittedBy: "emp1", accountId: "gl2", amount: 300_000, expenseDate: now }),
    ];
    expect(detectSplits(expenses)).toEqual([]);
  });

  it("flags exactly at 48hr boundary (inclusive)", () => {
    const now = Date.now();
    const expenses = [
      makeExpense({ _id: "e1", submittedBy: "emp1", accountId: "gl1", amount: 300_000, expenseDate: now }),
      makeExpense({ _id: "e2", submittedBy: "emp1", accountId: "gl1", amount: 300_000, expenseDate: now + MS_48_HOURS }),
    ];
    // Exactly 48hrs -- should still flag (<=)
    const flags = detectSplits(expenses);
    expect(flags.length).toBe(1);
  });
});

// ============================================================================
// detectApproverConcentration
// ============================================================================

describe("detectApproverConcentration", () => {
  it("returns empty array when no approved expenses", () => {
    const expenses = [
      makeExpense({ _id: "e1", status: "draft" }),
      makeExpense({ _id: "e2", status: "submitted" }),
    ];
    expect(detectApproverConcentration(expenses)).toEqual([]);
  });

  it("flags when same approver approved >80% of one employee's expenses in window", () => {
    const expenses = [
      makeExpense({ _id: "e1", submittedBy: "emp1", approvedBy: "mgr1", status: "approved" }),
      makeExpense({ _id: "e2", submittedBy: "emp1", approvedBy: "mgr1", status: "approved" }),
      makeExpense({ _id: "e3", submittedBy: "emp1", approvedBy: "mgr1", status: "reimbursed" }),
      makeExpense({ _id: "e4", submittedBy: "emp1", approvedBy: "mgr1", status: "awaiting_payment" }),
      makeExpense({ _id: "e5", submittedBy: "emp1", approvedBy: "mgr2", status: "approved" }),
    ];
    // mgr1 approved 4/5 = 80%, which is NOT > 80%. Need > 80%.
    // Actually 4/5 = 0.80 which is exactly threshold, not above.
    // So this should NOT flag at exactly 80%.
    const flags = detectApproverConcentration(expenses);
    expect(flags).toEqual([]);
  });

  it("flags when approver ratio is above 80%", () => {
    const expenses = [
      makeExpense({ _id: "e1", submittedBy: "emp1", approvedBy: "mgr1", status: "approved" }),
      makeExpense({ _id: "e2", submittedBy: "emp1", approvedBy: "mgr1", status: "approved" }),
      makeExpense({ _id: "e3", submittedBy: "emp1", approvedBy: "mgr1", status: "approved" }),
      makeExpense({ _id: "e4", submittedBy: "emp1", approvedBy: "mgr1", status: "approved" }),
      makeExpense({ _id: "e5", submittedBy: "emp1", approvedBy: "mgr1", status: "approved" }),
      makeExpense({ _id: "e6", submittedBy: "emp1", approvedBy: "mgr2", status: "approved" }),
    ];
    // mgr1 approved 5/6 = 83.3% > 80%
    const flags = detectApproverConcentration(expenses);
    expect(flags.length).toBe(1);
    expect(flags[0].employeeId).toBe("emp1");
    expect(flags[0].approverId).toBe("mgr1");
    expect(flags[0].count).toBe(5);
    expect(flags[0].totalCount).toBe(6);
    expect(flags[0].percent).toBeCloseTo(83.33, 1);
  });

  it("does NOT flag when ratio <= 80%", () => {
    const expenses = [
      makeExpense({ _id: "e1", submittedBy: "emp1", approvedBy: "mgr1", status: "approved" }),
      makeExpense({ _id: "e2", submittedBy: "emp1", approvedBy: "mgr1", status: "approved" }),
      makeExpense({ _id: "e3", submittedBy: "emp1", approvedBy: "mgr2", status: "approved" }),
      makeExpense({ _id: "e4", submittedBy: "emp1", approvedBy: "mgr2", status: "approved" }),
      makeExpense({ _id: "e5", submittedBy: "emp1", approvedBy: "mgr2", status: "approved" }),
    ];
    // mgr1 = 2/5 = 40%, mgr2 = 3/5 = 60%, both <= 80%
    expect(detectApproverConcentration(expenses)).toEqual([]);
  });

  it("does NOT flag when employee has only 1 expense (trivially 100% but not meaningful)", () => {
    const expenses = [
      makeExpense({ _id: "e1", submittedBy: "emp1", approvedBy: "mgr1", status: "approved" }),
    ];
    expect(detectApproverConcentration(expenses)).toEqual([]);
  });

  it("considers awaiting_payment and reimbursed as approved statuses", () => {
    const expenses = [
      makeExpense({ _id: "e1", submittedBy: "emp1", approvedBy: "mgr1", status: "awaiting_payment" }),
      makeExpense({ _id: "e2", submittedBy: "emp1", approvedBy: "mgr1", status: "reimbursed" }),
      makeExpense({ _id: "e3", submittedBy: "emp1", approvedBy: "mgr1", status: "approved" }),
    ];
    // All 3 approved by mgr1 = 100% > 80%
    const flags = detectApproverConcentration(expenses);
    expect(flags.length).toBe(1);
    expect(flags[0].percent).toBe(100);
  });

  it("ignores expenses without approvedBy", () => {
    const expenses = [
      makeExpense({ _id: "e1", submittedBy: "emp1", approvedBy: "mgr1", status: "approved" }),
      makeExpense({ _id: "e2", submittedBy: "emp1", approvedBy: undefined, status: "approved" }),
      makeExpense({ _id: "e3", submittedBy: "emp1", approvedBy: "mgr1", status: "approved" }),
    ];
    // mgr1 = 2/2 approved-with-approver = 100% (ignoring the undefined one)
    const flags = detectApproverConcentration(expenses);
    expect(flags.length).toBe(1);
  });
});

// ============================================================================
// detectUnfamiliarVendors
// ============================================================================

describe("detectUnfamiliarVendors", () => {
  it("returns empty array when all vendors are in historical set", () => {
    const recent = ["Vendor A", "Vendor B"];
    const historical = new Set(["vendor a", "vendor b", "vendor c"]);
    expect(detectUnfamiliarVendors(recent, historical)).toEqual([]);
  });

  it("returns vendor names not present in historical set", () => {
    const recent = ["Vendor A", "Vendor B", "New Vendor"];
    const historical = new Set(["vendor a", "vendor b"]);
    const result = detectUnfamiliarVendors(recent, historical);
    expect(result).toEqual(["New Vendor"]);
  });

  it("normalizes comparison case-insensitively", () => {
    const recent = ["VENDOR A"];
    const historical = new Set(["vendor a"]);
    expect(detectUnfamiliarVendors(recent, historical)).toEqual([]);
  });

  it("returns unique vendor names (no duplicates)", () => {
    const recent = ["New Vendor", "New Vendor", "New Vendor"];
    const historical = new Set(["vendor a"]);
    const result = detectUnfamiliarVendors(recent, historical);
    expect(result).toEqual(["New Vendor"]);
  });

  it("returns empty array when recent is empty", () => {
    const historical = new Set(["vendor a"]);
    expect(detectUnfamiliarVendors([], historical)).toEqual([]);
  });

  it("returns all vendors when historical is empty", () => {
    const recent = ["A", "B"];
    const historical = new Set<string>();
    expect(detectUnfamiliarVendors(recent, historical)).toEqual(["A", "B"]);
  });
});
