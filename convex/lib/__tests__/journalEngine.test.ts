import { describe, it, expect } from "vitest";
import {
  validateJournalLines,
  validateVoidPairing,
  buildDebitLine,
  buildCreditLine,
  buildReversedLines,
} from "../journalEngine";
import type { JournalLine } from "../journalEngine";
import type { Id } from "../../_generated/dataModel";

// Mock account IDs for pure function tests (no DB access needed)
const accA = "acc_a" as unknown as Id<"accounts">;
const accB = "acc_b" as unknown as Id<"accounts">;
const accC = "acc_c" as unknown as Id<"accounts">;

describe("validateJournalLines", () => {
  it("accepts balanced entry with 2 lines", () => {
    const lines: JournalLine[] = [
      { accountId: accA, debitAmount: 50000, creditAmount: 0 },
      { accountId: accB, debitAmount: 0, creditAmount: 50000 },
    ];
    expect(() => validateJournalLines(lines)).not.toThrow();
  });

  it("rejects imbalanced entry with clear error message", () => {
    const lines: JournalLine[] = [
      { accountId: accA, debitAmount: 50000, creditAmount: 0 },
      { accountId: accB, debitAmount: 0, creditAmount: 49999 },
    ];
    expect(() => validateJournalLines(lines)).toThrow(
      "Journal entry imbalanced: debits (50000) != credits (49999)"
    );
  });

  it("rejects single line entry", () => {
    const lines: JournalLine[] = [
      { accountId: accA, debitAmount: 50000, creditAmount: 0 },
    ];
    expect(() => validateJournalLines(lines)).toThrow("at least 2 lines");
  });

  it("rejects empty lines array", () => {
    const lines: JournalLine[] = [];
    expect(() => validateJournalLines(lines)).toThrow("at least 2 lines");
  });

  it("rejects line with both debit and credit nonzero", () => {
    const lines: JournalLine[] = [
      { accountId: accA, debitAmount: 50000, creditAmount: 30000 },
      { accountId: accB, debitAmount: 0, creditAmount: 20000 },
    ];
    expect(() => validateJournalLines(lines)).toThrow(
      "either debit or credit, not both"
    );
  });

  it("rejects line with zero debit and zero credit", () => {
    const lines: JournalLine[] = [
      { accountId: accA, debitAmount: 50000, creditAmount: 0 },
      { accountId: accB, debitAmount: 0, creditAmount: 0 },
    ];
    expect(() => validateJournalLines(lines)).toThrow(
      "non-zero debit or credit"
    );
  });

  it("rejects negative debit amount", () => {
    const lines: JournalLine[] = [
      { accountId: accA, debitAmount: -50000, creditAmount: 0 },
      { accountId: accB, debitAmount: 0, creditAmount: 50000 },
    ];
    expect(() => validateJournalLines(lines)).toThrow("non-negative");
  });

  it("rejects negative credit amount", () => {
    const lines: JournalLine[] = [
      { accountId: accA, debitAmount: 50000, creditAmount: 0 },
      { accountId: accB, debitAmount: 0, creditAmount: -50000 },
    ];
    expect(() => validateJournalLines(lines)).toThrow("non-negative");
  });

  it("rejects fractional negative debit (-50000.5) with non-negative error (negative fires before integer)", () => {
    const lines: JournalLine[] = [
      { accountId: accA, debitAmount: -50000.5, creditAmount: 0 },
      { accountId: accB, debitAmount: 0, creditAmount: 50000 },
    ];
    expect(() => validateJournalLines(lines)).toThrow("non-negative");
  });

  it("rejects fractional debit amount (50000.5)", () => {
    const lines: JournalLine[] = [
      { accountId: accA, debitAmount: 50000.5, creditAmount: 0 },
      { accountId: accB, debitAmount: 0, creditAmount: 50000.5 },
    ];
    expect(() => validateJournalLines(lines)).toThrow("whole numbers");
  });

  it("rejects fractional credit amount (100.99)", () => {
    const lines: JournalLine[] = [
      { accountId: accA, debitAmount: 101, creditAmount: 0 },
      { accountId: accB, debitAmount: 0, creditAmount: 100.99 },
    ];
    expect(() => validateJournalLines(lines)).toThrow("whole numbers");
  });

  it("accepts multi-line balanced entry (3 lines)", () => {
    const lines: JournalLine[] = [
      { accountId: accA, debitAmount: 30000, creditAmount: 0 },
      { accountId: accB, debitAmount: 20000, creditAmount: 0 },
      { accountId: accC, debitAmount: 0, creditAmount: 50000 },
    ];
    expect(() => validateJournalLines(lines)).not.toThrow();
  });

  it("accepts large IDR amounts (100,000,000)", () => {
    const lines: JournalLine[] = [
      { accountId: accA, debitAmount: 100_000_000, creditAmount: 0 },
      { accountId: accB, debitAmount: 0, creditAmount: 100_000_000 },
    ];
    expect(() => validateJournalLines(lines)).not.toThrow();
  });

  it("error messages include line index", () => {
    const lines: JournalLine[] = [
      { accountId: accA, debitAmount: 50000, creditAmount: 0 },
      { accountId: accB, debitAmount: 0, creditAmount: 0 },
    ];
    expect(() => validateJournalLines(lines)).toThrow("line 2:");
  });
});

describe("validateVoidPairing", () => {
  it("accepts expense_approval -> expense_void", () => {
    expect(() =>
      validateVoidPairing("expense_approval", "expense_void")
    ).not.toThrow();
  });

  it("accepts reimbursement -> reimbursement_void", () => {
    expect(() =>
      validateVoidPairing("reimbursement", "reimbursement_void")
    ).not.toThrow();
  });

  it("accepts payroll -> payroll_void", () => {
    expect(() =>
      validateVoidPairing("payroll", "payroll_void")
    ).not.toThrow();
  });

  it("rejects mismatched pairing (expense_approval -> payroll_void)", () => {
    expect(() =>
      validateVoidPairing("expense_approval", "payroll_void")
    ).toThrow();
  });

  it("rejects manual sourceType as non-reversible", () => {
    expect(() =>
      validateVoidPairing("manual", "expense_void")
    ).toThrow("Cannot reverse a manual entry");
  });

  it("rejects void sourceType (expense_void) as non-reversible (no double-void)", () => {
    expect(() =>
      validateVoidPairing("expense_void", "expense_void")
    ).toThrow("Cannot reverse a expense_void entry");
  });
});

describe("buildDebitLine", () => {
  it("creates debit line with zero credit", () => {
    const line = buildDebitLine(accA, 50000);
    expect(line).toEqual({
      accountId: accA,
      debitAmount: 50000,
      creditAmount: 0,
    });
  });

  it("includes optional description", () => {
    const line = buildDebitLine(accA, 50000, "desc");
    expect(line).toEqual({
      accountId: accA,
      debitAmount: 50000,
      creditAmount: 0,
      description: "desc",
    });
  });
});

describe("buildCreditLine", () => {
  it("creates credit line with zero debit", () => {
    const line = buildCreditLine(accB, 50000);
    expect(line).toEqual({
      accountId: accB,
      debitAmount: 0,
      creditAmount: 50000,
    });
  });

  it("includes optional description", () => {
    const line = buildCreditLine(accB, 50000, "desc");
    expect(line).toEqual({
      accountId: accB,
      debitAmount: 0,
      creditAmount: 50000,
      description: "desc",
    });
  });
});

describe("buildReversedLines", () => {
  it("swaps debit and credit amounts", () => {
    const original: JournalLine[] = [
      { accountId: accA, debitAmount: 50000, creditAmount: 0 },
      { accountId: accB, debitAmount: 0, creditAmount: 50000 },
    ];
    const reversed = buildReversedLines(original);
    expect(reversed[0].debitAmount).toBe(0);
    expect(reversed[0].creditAmount).toBe(50000);
    expect(reversed[1].debitAmount).toBe(50000);
    expect(reversed[1].creditAmount).toBe(0);
  });

  it("preserves accountId and description", () => {
    const original: JournalLine[] = [
      {
        accountId: accA,
        debitAmount: 50000,
        creditAmount: 0,
        description: "Expense payment",
      },
      {
        accountId: accB,
        debitAmount: 0,
        creditAmount: 50000,
        description: "Cash out",
      },
    ];
    const reversed = buildReversedLines(original);
    expect(reversed[0].accountId).toBe(accA);
    expect(reversed[0].description).toBe("Expense payment");
    expect(reversed[1].accountId).toBe(accB);
    expect(reversed[1].description).toBe("Cash out");
  });

  it("preserves absent description as undefined", () => {
    const original: JournalLine[] = [
      { accountId: accA, debitAmount: 50000, creditAmount: 0 },
      { accountId: accB, debitAmount: 0, creditAmount: 50000 },
    ];
    const reversed = buildReversedLines(original);
    expect(reversed[0].description).toBeUndefined();
    expect(reversed[1].description).toBeUndefined();
  });
});
