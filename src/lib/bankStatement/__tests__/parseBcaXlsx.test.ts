import { describe, it, expect } from "vitest";
import {
  generateSyntheticBcaWorkbook,
  generateBrokenReconciliationWorkbook,
  generateMultiSheetWorkbook,
} from "../../../../tests/fixtures/bca-sample-synthetic";
import { parseBcaXlsx } from "../parseBcaXlsx";
import { ReconciliationError } from "../types";

const periodStart = Date.UTC(2025, 10, 1); // 01 Nov 2025
const periodEnd = Date.UTC(2025, 10, 30); // 30 Nov 2025
const nov19 = Date.UTC(2025, 10, 19);
const nov20 = Date.UTC(2025, 10, 20);
const nov30 = Date.UTC(2025, 10, 30);

describe("parseBcaXlsx — metadata + transactions (happy path)", () => {
  const buf = generateSyntheticBcaWorkbook();
  const parsed = parseBcaXlsx(buf);

  it("extracts header metadata", () => {
    expect(parsed.header.accountNumber).toBe("9999999999");
    expect(parsed.header.accountHolder).toBe("SYNTHETIC TEST CO PT");
    expect(parsed.header.reportedPeriodStart).toBe(periodStart);
    expect(parsed.header.reportedPeriodEnd).toBe(periodEnd);
    expect(parsed.header.currency).toBe("Rp");
    expect(parsed.header.openingBalance).toBe(0);
    expect(parsed.header.closingBalance).toBe(59_043_385);
    expect(parsed.header.reportedDebitTotal).toBe(76_956_615);
    expect(parsed.header.reportedCreditTotal).toBe(136_000_000);
  });

  it("returns exactly 5 transaction lines", () => {
    expect(parsed.lines).toHaveLength(5);
  });

  it("parses row 1 (BI-FAST CR) as credit 1,000,000 on 19-Nov", () => {
    const row = parsed.lines[0];
    expect(row.direction).toBe("credit");
    expect(row.amountIdr).toBe(1_000_000);
    expect(row.date).toBe(nov19);
    expect(row.runningBalanceIdr).toBe(1_000_000);
    expect(row.rawDescription).toMatch(/BI-FAST CR/);
  });

  it("parses row 2 (ND-LAINNYA) as debit 50,000 on 20-Nov", () => {
    const row = parsed.lines[1];
    expect(row.direction).toBe("debit");
    expect(row.amountIdr).toBe(50_000);
    expect(row.date).toBe(nov20);
    expect(row.runningBalanceIdr).toBe(950_000);
  });

  it("parses rows 3 and 4 (30-Nov, non-last-of-day) with saldo=null", () => {
    expect(parsed.lines[2].date).toBe(nov30);
    expect(parsed.lines[2].direction).toBe("credit");
    expect(parsed.lines[2].amountIdr).toBe(135_000_000);
    expect(parsed.lines[2].runningBalanceIdr).toBeNull();

    expect(parsed.lines[3].date).toBe(nov30);
    expect(parsed.lines[3].direction).toBe("debit");
    expect(parsed.lines[3].amountIdr).toBe(76_876_615);
    expect(parsed.lines[3].runningBalanceIdr).toBeNull();
  });

  it("parses row 5 (BIAYA ADM) as debit 30,000 on 30-Nov with saldo", () => {
    const row = parsed.lines[4];
    expect(row.direction).toBe("debit");
    expect(row.amountIdr).toBe(30_000);
    expect(row.date).toBe(nov30);
    expect(row.runningBalanceIdr).toBe(59_043_385);
    expect(row.rawDescription).toBe("BIAYA ADM");
  });

  it("sets rowIndex 1-based from first transaction row", () => {
    expect(parsed.lines[0].rowIndex).toBe(1);
    expect(parsed.lines[4].rowIndex).toBe(5);
  });
});

describe("parseBcaXlsx — error paths", () => {
  it("rejects multi-sheet workbook", () => {
    expect(() => parseBcaXlsx(generateMultiSheetWorkbook())).toThrow(
      /single.?sheet|multi.?sheet/i,
    );
  });

  it("rejects non-Rp currency", () => {
    const buf = generateSyntheticBcaWorkbook({
      header: { currency: "USD" },
    });
    expect(() => parseBcaXlsx(buf)).toThrow(/currency|IDR|Rp/i);
  });

  it("throws ReconciliationError with populated diff on broken reconciliation", () => {
    const buf = generateBrokenReconciliationWorkbook();
    let caught: unknown;
    try {
      parseBcaXlsx(buf);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ReconciliationError);
    const err = caught as ReconciliationError;
    expect(err.diff).toBeDefined();
    expect(typeof err.diff.debitDiff).toBe("number");
    expect(typeof err.diff.creditDiff).toBe("number");
    expect(typeof err.diff.balanceDiff).toBe("number");
    // tampered totalDebit=99,999,999 vs actual 76,956,615
    expect(err.diff.debitDiff).not.toBe(0);
  });

  it("rejects a row with zero amount", () => {
    const buf = generateSyntheticBcaWorkbook({
      transactions: [
        {
          date: "19-Nov",
          description: "ZERO AMOUNT ROW",
          amountIdr: 0,
          direction: "credit",
          runningBalanceIdr: 0,
        },
      ],
      footer: {
        openingBalance: 0,
        totalDebit: 0,
        totalCredit: 0,
        closingBalance: 0,
      },
    });
    expect(() => parseBcaXlsx(buf)).toThrow(/row.*zero amount/i);
  });

  it("error messages do not leak accountNumber or accountHolder", () => {
    // Tamper the debit footer so ReconciliationError fires; confirm the message
    // text does not include the synthetic account number or holder name.
    const buf = generateBrokenReconciliationWorkbook();
    try {
      parseBcaXlsx(buf);
      throw new Error("expected throw");
    } catch (e) {
      const msg = (e as Error).message ?? "";
      expect(msg).not.toContain("9999999999");
      expect(msg).not.toContain("SYNTHETIC TEST CO PT");
    }
  });
});
