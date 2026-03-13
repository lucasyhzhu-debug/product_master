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
  it("has exactly 39 entries", () => {
    // Plan listed 36 but detailed enumeration has 39:
    // 7 Revenue + 4 COGS + 11 OpEx + 3 Other + 6 Assets + 5 Liabilities + 3 Equity = 39
    expect(DEFAULT_ACCOUNTS).toHaveLength(39);
  });

  it("all entries have isSystem: true and isActive: true", () => {
    for (const account of DEFAULT_ACCOUNTS) {
      expect(account.isSystem).toBe(true);
      expect(account.isActive).toBe(true);
    }
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
    expect(typeCounts.opex).toBe(11);
    expect(typeCounts.other).toBe(3);
    expect(typeCounts.asset).toBe(6);
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
