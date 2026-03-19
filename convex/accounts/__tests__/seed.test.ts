/**
 * Tests for Chart of Accounts seed data and mutation behavior.
 *
 * Tests 1-7: Pure data validation on the exported DEFAULT_ACCOUNTS array.
 * These verify PSAK alignment, correct counts, and data integrity
 * without needing a Convex runtime.
 */

import { describe, it, expect } from "vitest";
import { DEFAULT_ACCOUNTS } from "../mutations";

describe("DEFAULT_ACCOUNTS data integrity", () => {
  it("has exactly 49 entries", () => {
    // 7 Revenue + 4 COGS + 12 OpEx + 5 Other + 13 Assets + 5 Liabilities + 3 Equity = 49
    expect(DEFAULT_ACCOUNTS).toHaveLength(49);
  });

  it("all entries have isSystem: true", () => {
    for (const account of DEFAULT_ACCOUNTS) {
      expect(account.isSystem).toBe(true);
    }
  });

  it("1600 Accumulated Depreciation is deactivated (replaced by 1610-1670)", () => {
    const acc1600 = DEFAULT_ACCOUNTS.find((a) => a.code === "1600");
    expect(acc1600).toBeDefined();
    expect(acc1600!.isActive).toBe(false);
  });

  it("all account codes are unique (no duplicates)", () => {
    const codes = DEFAULT_ACCOUNTS.map((a) => a.code);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it("account codes follow PSAK ranges", () => {
    for (const account of DEFAULT_ACCOUNTS) {
      const codeNum = parseInt(account.code, 10);
      const prefix = account.code[0];

      switch (prefix) {
        case "1":
          expect(account.type).toBe("asset");
          break;
        case "2":
          expect(account.type).toBe("liability");
          break;
        case "3":
          expect(account.type).toBe("equity");
          break;
        case "4":
          expect(account.type).toBe("revenue");
          break;
        case "5":
          expect(account.type).toBe("cogs");
          break;
        case "6":
          expect(account.type).toBe("opex");
          break;
        case "7":
          expect(account.type).toBe("other");
          break;
        default:
          throw new Error(`Unexpected code prefix: ${prefix} for code ${account.code}`);
      }

      // All codes should be 4-digit numbers
      expect(codeNum).toBeGreaterThanOrEqual(1000);
      expect(codeNum).toBeLessThan(10000);
    }
  });

  it("has correct counts per type", () => {
    const typeCounts = DEFAULT_ACCOUNTS.reduce(
      (acc, a) => {
        acc[a.type] = (acc[a.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    expect(typeCounts.revenue).toBe(7);
    expect(typeCounts.cogs).toBe(4);
    expect(typeCounts.opex).toBe(12); // +1: 6150 Depreciation Expense (Phase 60)
    expect(typeCounts.other).toBe(5); // +2: 7300 Gain, 7400 Loss on Asset Disposal (Phase 60)
    expect(typeCounts.asset).toBe(13); // +7: 1610-1670 per-category Accum Depr (Phase 60)
    expect(typeCounts.liability).toBe(5);
    expect(typeCounts.equity).toBe(3);
  });

  it("contains all key account codes", () => {
    const codes = new Set(DEFAULT_ACCOUNTS.map((a) => a.code));

    // One from each category
    expect(codes.has("1100")).toBe(true); // Cash (Bank Accounts)
    expect(codes.has("2200")).toBe(true); // Employee Reimbursements Payable
    expect(codes.has("3100")).toBe(true); // Owner's Capital
    expect(codes.has("4100")).toBe(true); // Direct Sales
    expect(codes.has("5100")).toBe(true); // Production COGS
    expect(codes.has("6100")).toBe(true); // Salaries & Wages
    expect(codes.has("7100")).toBe(true); // Interest Income

    // Phase 60: Fixed asset depreciation accounts
    expect(codes.has("6150")).toBe(true); // Depreciation Expense
    expect(codes.has("1610")).toBe(true); // Accum. Depr. - Buildings
    expect(codes.has("1620")).toBe(true); // Accum. Depr. - Vehicles
    expect(codes.has("1630")).toBe(true); // Accum. Depr. - Office Equipment
    expect(codes.has("1640")).toBe(true); // Accum. Depr. - Kitchen/Production
    expect(codes.has("1650")).toBe(true); // Accum. Depr. - Furniture
    expect(codes.has("1660")).toBe(true); // Accum. Depr. - Tools
    expect(codes.has("1670")).toBe(true); // Accum. Depr. - Leasehold Improvements
    expect(codes.has("7300")).toBe(true); // Gain on Asset Disposal
    expect(codes.has("7400")).toBe(true); // Loss on Asset Disposal
  });

  it("all entries have required fields with correct types", () => {
    for (const account of DEFAULT_ACCOUNTS) {
      expect(typeof account.code).toBe("string");
      expect(typeof account.name).toBe("string");
      expect(typeof account.type).toBe("string");
      expect(typeof account.category).toBe("string");
      expect(typeof account.isActive).toBe("boolean");
      expect(typeof account.isSystem).toBe("boolean");
      // name should not be empty
      expect(account.name.length).toBeGreaterThan(0);
      // category should not be empty
      expect(account.category.length).toBeGreaterThan(0);
    }
  });
});
