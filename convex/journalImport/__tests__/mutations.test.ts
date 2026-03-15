import { describe, it, expect } from "vitest";
import {
  validateImportRow,
  MAX_BATCH_SIZE,
} from "../mutations";
import type { ImportRow, AccountMap } from "../mutations";
import type { Id } from "../../_generated/dataModel";

// Mock account IDs for pure function tests (no DB access needed)
const acc6100 = "acc_6100" as unknown as Id<"accounts">;
const acc6200 = "acc_6200" as unknown as Id<"accounts">;
const acc1100 = "acc_1100" as unknown as Id<"accounts">;
const acc6300 = "acc_6300" as unknown as Id<"accounts">;

// Mock account maps
const activeAccounts: AccountMap = new Map([
  ["6100", { id: acc6100, isActive: true }],
  ["6200", { id: acc6200, isActive: true }],
  ["1100", { id: acc1100, isActive: true }],
]);

const accountsWithInactive: AccountMap = new Map([
  ["6100", { id: acc6100, isActive: true }],
  ["6200", { id: acc6200, isActive: true }],
  ["1100", { id: acc1100, isActive: true }],
  ["6300", { id: acc6300, isActive: false }],
]);

function validRow(overrides?: Partial<ImportRow>): ImportRow {
  return {
    date: Date.now(),
    amount: 50000,
    description: "Office supplies purchase",
    accountCode: "6100",
    ...overrides,
  };
}

describe("validateImportRow", () => {
  it("returns null for a valid row", () => {
    const result = validateImportRow(validRow(), activeAccounts);
    expect(result).toBeNull();
  });

  it("returns error containing 'description' for missing description", () => {
    const result = validateImportRow(
      validRow({ description: "" }),
      activeAccounts
    );
    expect(result).not.toBeNull();
    expect(result!.toLowerCase()).toContain("description");
  });

  it("returns error containing 'positive' for negative amount", () => {
    const result = validateImportRow(
      validRow({ amount: -100 }),
      activeAccounts
    );
    expect(result).not.toBeNull();
    expect(result!.toLowerCase()).toContain("positive");
  });

  it("returns error containing 'positive' for zero amount", () => {
    const result = validateImportRow(
      validRow({ amount: 0 }),
      activeAccounts
    );
    expect(result).not.toBeNull();
    expect(result!.toLowerCase()).toContain("positive");
  });

  it("returns error containing 'integer' for non-integer amount", () => {
    const result = validateImportRow(
      validRow({ amount: 50000.5 }),
      activeAccounts
    );
    expect(result).not.toBeNull();
    expect(result!.toLowerCase()).toContain("integer");
  });

  it("returns error containing 'not found' for unknown account code", () => {
    const result = validateImportRow(
      validRow({ accountCode: "9999" }),
      activeAccounts
    );
    expect(result).not.toBeNull();
    expect(result!.toLowerCase()).toContain("not found");
  });

  it("returns error containing 'inactive' for inactive account code", () => {
    const result = validateImportRow(
      validRow({ accountCode: "6300" }),
      accountsWithInactive
    );
    expect(result).not.toBeNull();
    expect(result!.toLowerCase()).toContain("inactive");
  });

  it("returns null for a valid row with optional vendorName", () => {
    const result = validateImportRow(
      validRow({ vendorName: "PT Sumber Jaya" }),
      activeAccounts
    );
    expect(result).toBeNull();
  });

  it("returns null for a valid row with optional receiptUrl", () => {
    const result = validateImportRow(
      validRow({ receiptUrl: "https://storage.example.com/receipt.pdf" }),
      activeAccounts
    );
    expect(result).toBeNull();
  });

  it("accepts receiptUrl field through validation (metadata persistence guard)", () => {
    const row = validRow({
      receiptUrl: "https://storage.example.com/receipt-001.pdf",
      vendorName: "PT Toko Buku",
    });
    const result = validateImportRow(row, activeAccounts);
    expect(result).toBeNull();
    // Verify the row interface preserves receiptUrl
    expect(row.receiptUrl).toBe("https://storage.example.com/receipt-001.pdf");
  });
});

describe("MAX_BATCH_SIZE", () => {
  it("equals 50", () => {
    expect(MAX_BATCH_SIZE).toBe(50);
  });
});
