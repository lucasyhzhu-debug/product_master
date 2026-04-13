import { describe, it, expect } from "vitest";
import { validateReconciliation } from "../reconciliation";
import type { ParsedLine } from "../types";

function mkLine(
  direction: "debit" | "credit",
  amountIdr: number,
  i = 1,
): ParsedLine {
  return {
    rowIndex: i,
    date: Date.UTC(2025, 10, 19),
    rawDescription: "synthetic",
    direction,
    amountIdr,
    runningBalanceIdr: null,
    parsedCounterparty: null,
  };
}

describe("validateReconciliation", () => {
  const defaultLines: ParsedLine[] = [
    mkLine("credit", 1_000_000, 1),
    mkLine("debit", 50_000, 2),
    mkLine("credit", 135_000_000, 3),
    mkLine("debit", 76_876_615, 4),
    mkLine("debit", 30_000, 5),
  ];

  it("returns ok=true with zero diff when totals match exactly", () => {
    const res = validateReconciliation(defaultLines, {
      debitTotal: 76_956_615,
      creditTotal: 136_000_000,
      openingBalance: 0,
      closingBalance: 59_043_385,
    });
    expect(res.ok).toBe(true);
    expect(res.diff.debitDiff).toBe(0);
    expect(res.diff.creditDiff).toBe(0);
    expect(res.diff.balanceDiff).toBe(0);
  });

  it("returns ok=false with populated debit diff when reported debit off by 100", () => {
    const res = validateReconciliation(defaultLines, {
      debitTotal: 76_956_515, // parsed sum (76_956_615) − 100
      creditTotal: 136_000_000,
      openingBalance: 0,
      closingBalance: 59_043_385,
    });
    expect(res.ok).toBe(false);
    expect(res.diff.debitDiff).toBe(100);
  });

  it("accepts 0-row statement (closed/inactive account) as valid", () => {
    const res = validateReconciliation([], {
      debitTotal: 0,
      creditTotal: 0,
      openingBalance: 0,
      closingBalance: 0,
    });
    expect(res.ok).toBe(true);
    expect(res.diff.debitDiff).toBe(0);
    expect(res.diff.creditDiff).toBe(0);
    expect(res.diff.balanceDiff).toBe(0);
  });

  it("enforces EXACT integer match — any non-zero diff fails", () => {
    const res = validateReconciliation(defaultLines, {
      debitTotal: 76_956_614, // 1 IDR off
      creditTotal: 136_000_000,
      openingBalance: 0,
      closingBalance: 59_043_385,
    });
    expect(res.ok).toBe(false);
    expect(res.diff.debitDiff).toBe(1);
  });

  it("catches balance-equation mismatch (opening + credits − debits ≠ closing)", () => {
    const res = validateReconciliation(defaultLines, {
      debitTotal: 76_956_615,
      creditTotal: 136_000_000,
      openingBalance: 0,
      closingBalance: 59_043_384, // 1 IDR off on closing
    });
    expect(res.ok).toBe(false);
    expect(res.diff.balanceDiff).not.toBe(0);
  });
});
