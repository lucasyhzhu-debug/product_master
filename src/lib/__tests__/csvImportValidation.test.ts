import { describe, it, expect } from "vitest";
import {
  parseAndValidateCsv,
  dateToWibEpoch,
} from "../csvImportValidation";
import type { AccountRef, CsvParseResult } from "../csvImportValidation";

// Mock accounts for testing
const mockAccounts: AccountRef[] = [
  { code: "6100", name: "Salaries & Wages", isActive: true },
  { code: "6200", name: "Rent", isActive: true },
  { code: "6300", name: "Marketing", isActive: false },
];

// ---------------------------------------------------------------------------
// dateToWibEpoch
// ---------------------------------------------------------------------------

describe("dateToWibEpoch", () => {
  it("converts YYYY-MM-DD to WIB midnight (UTC hour 17 previous day)", () => {
    const epoch = dateToWibEpoch("2026-01-15");
    const d = new Date(epoch);
    // WIB midnight (00:00 WIB) = 17:00 UTC previous day
    expect(d.getUTCHours()).toBe(17);
    expect(d.getUTCDate()).toBe(14);
    expect(d.getUTCMonth()).toBe(0); // January
    expect(d.getUTCFullYear()).toBe(2026);
  });

  it("returns NaN for 'not-a-date'", () => {
    expect(dateToWibEpoch("not-a-date")).toBeNaN();
  });

  it("returns NaN for empty string", () => {
    expect(dateToWibEpoch("")).toBeNaN();
  });

  it("returns NaN for partial date like '2026-01'", () => {
    expect(dateToWibEpoch("2026-01")).toBeNaN();
  });

  it("returns NaN for date with slashes '2026/01/15'", () => {
    expect(dateToWibEpoch("2026/01/15")).toBeNaN();
  });
});

// ---------------------------------------------------------------------------
// parseAndValidateCsv -- happy path
// ---------------------------------------------------------------------------

describe("parseAndValidateCsv", () => {
  it("parses a valid 2-row CSV into 2 validRows, 0 errors", () => {
    const csv = `date,amount,description,vendorName,accountCode,receiptUrl
2026-01-15,50000,Office supplies,PT Toko,6100,https://example.com/receipt1.pdf
2026-01-16,75000,Rent payment,,6200,`;

    const result = parseAndValidateCsv(csv, mockAccounts);
    expect(result.validRows).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it("converts amounts to numbers", () => {
    const csv = `date,amount,description,accountCode
2026-01-15,50000,Office supplies,6100`;

    const result = parseAndValidateCsv(csv, mockAccounts);
    expect(typeof result.validRows[0].amount).toBe("number");
    expect(result.validRows[0].amount).toBe(50000);
  });

  it("converts dates to WIB epoch numbers", () => {
    const csv = `date,amount,description,accountCode
2026-01-15,50000,Office supplies,6100`;

    const result = parseAndValidateCsv(csv, mockAccounts);
    expect(typeof result.validRows[0].date).toBe("number");
    // WIB midnight 2026-01-15 = 17:00 UTC Jan 14
    const d = new Date(result.validRows[0].date);
    expect(d.getUTCHours()).toBe(17);
    expect(d.getUTCDate()).toBe(14);
  });

  it("preserves optional vendorName when present", () => {
    const csv = `date,amount,description,vendorName,accountCode
2026-01-15,50000,Office supplies,PT Sumber Jaya,6100`;

    const result = parseAndValidateCsv(csv, mockAccounts);
    expect(result.validRows[0].vendorName).toBe("PT Sumber Jaya");
  });

  it("sets vendorName to undefined when empty", () => {
    const csv = `date,amount,description,vendorName,accountCode
2026-01-15,50000,Office supplies,,6100`;

    const result = parseAndValidateCsv(csv, mockAccounts);
    expect(result.validRows[0].vendorName).toBeUndefined();
  });

  it("preserves optional receiptUrl when present", () => {
    const csv = `date,amount,description,accountCode,receiptUrl
2026-01-15,50000,Office supplies,6100,https://example.com/receipt.pdf`;

    const result = parseAndValidateCsv(csv, mockAccounts);
    expect(result.validRows[0].receiptUrl).toBe(
      "https://example.com/receipt.pdf"
    );
  });

  it("sets receiptUrl to undefined when empty", () => {
    const csv = `date,amount,description,accountCode,receiptUrl
2026-01-15,50000,Office supplies,6100,`;

    const result = parseAndValidateCsv(csv, mockAccounts);
    expect(result.validRows[0].receiptUrl).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // parseAndValidateCsv -- validation errors
  // ---------------------------------------------------------------------------

  it("produces error containing 'description' for missing description", () => {
    const csv = `date,amount,description,accountCode
2026-01-15,50000,,6100`;

    const result = parseAndValidateCsv(csv, mockAccounts);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error.toLowerCase()).toContain("description");
    expect(result.errors[0].row).toBe(2); // 1-based, header=1
  });

  it("produces error containing 'positive' for negative amount", () => {
    const csv = `date,amount,description,accountCode
2026-01-15,-100,Refund,6100`;

    const result = parseAndValidateCsv(csv, mockAccounts);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error.toLowerCase()).toContain("positive");
  });

  it("produces error containing 'integer' for non-integer amount", () => {
    const csv = `date,amount,description,accountCode
2026-01-15,50000.5,Office supplies,6100`;

    const result = parseAndValidateCsv(csv, mockAccounts);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error.toLowerCase()).toContain("integer");
  });

  it("produces error containing 'not found' for unknown accountCode", () => {
    const csv = `date,amount,description,accountCode
2026-01-15,50000,Office supplies,9999`;

    const result = parseAndValidateCsv(csv, mockAccounts);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error.toLowerCase()).toContain("not found");
  });

  it("produces error containing 'inactive' for inactive accountCode", () => {
    const csv = `date,amount,description,accountCode
2026-01-15,50000,Marketing expense,6300`;

    const result = parseAndValidateCsv(csv, mockAccounts);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error.toLowerCase()).toContain("inactive");
  });

  it("produces error containing 'date' for invalid date format", () => {
    const csv = `date,amount,description,accountCode
15-01-2026,50000,Office supplies,6100`;

    const result = parseAndValidateCsv(csv, mockAccounts);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error.toLowerCase()).toContain("date");
  });

  // ---------------------------------------------------------------------------
  // parseAndValidateCsv -- edge cases
  // ---------------------------------------------------------------------------

  it("parses CSV with quoted fields containing commas correctly", () => {
    const csv = `date,amount,description,accountCode
2026-01-15,50000,"Office supplies, paper, pens",6100`;

    const result = parseAndValidateCsv(csv, mockAccounts);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0].description).toBe(
      "Office supplies, paper, pens"
    );
  });

  it("detects duplicate rows (same date+amount+description) as warning", () => {
    const csv = `date,amount,description,accountCode
2026-01-15,50000,Office supplies,6100
2026-01-15,50000,Office supplies,6200`;

    const result = parseAndValidateCsv(csv, mockAccounts);
    expect(result.validRows).toHaveLength(2); // Both are valid
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings[0].toLowerCase()).toContain("duplicate");
  });

  it("returns 0 validRows, 0 errors for empty CSV (header only)", () => {
    const csv = `date,amount,description,accountCode`;

    const result = parseAndValidateCsv(csv, mockAccounts);
    expect(result.validRows).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("handles whitespace in headers", () => {
    const csv = ` date , amount , description , accountCode
2026-01-15,50000,Office supplies,6100`;

    const result = parseAndValidateCsv(csv, mockAccounts);
    expect(result.validRows).toHaveLength(1);
  });
});
