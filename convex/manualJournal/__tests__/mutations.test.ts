/**
 * Tests for manual journal entry mutation helpers and validation logic.
 *
 * Tests the exported pure functions from manualJournal/mutations.ts:
 * - TEMPLATE_TYPES array (6 valid template types)
 * - TEMPLATES constant (debit/credit account code mapping)
 * - validateTemplateType (asserts valid template type)
 * - validateManualJournalAmount (positive integer enforcement)
 * - validateManualJournalDate (date bounds: >= 2020-01-01, <= tomorrow)
 *
 * The ctx-dependent create mutation is tested indirectly via these
 * extracted helpers. Auth-gated convex-test runtime tests are deferred
 * per project convention.
 */

import { describe, it, expect } from "vitest";
import {
  TEMPLATE_TYPES,
  TEMPLATES,
  validateTemplateType,
  validateManualJournalAmount,
  validateManualJournalDate,
} from "../mutations";

// ============================================
// TEMPLATE_TYPES Array
// ============================================
describe("TEMPLATE_TYPES", () => {
  it("has exactly 6 entries", () => {
    expect(TEMPLATE_TYPES).toHaveLength(6);
  });

  it("contains all expected template types", () => {
    expect(TEMPLATE_TYPES).toContain("equipment_purchase");
    expect(TEMPLATE_TYPES).toContain("loan_repayment");
    expect(TEMPLATE_TYPES).toContain("dividend_payment");
    expect(TEMPLATE_TYPES).toContain("capital_injection");
    expect(TEMPLATE_TYPES).toContain("receive_loan");
    expect(TEMPLATE_TYPES).toContain("tax_payment");
  });
});

// ============================================
// TEMPLATES Constant
// ============================================
describe("TEMPLATES", () => {
  it("maps all 6 types to correct debit/credit account codes", () => {
    expect(TEMPLATES.equipment_purchase).toEqual({ debit: "1500", credit: "1100" });
    expect(TEMPLATES.loan_repayment).toEqual({ debit: "2500", credit: "1100" });
    expect(TEMPLATES.dividend_payment).toEqual({ debit: "3200", credit: "1100" });
    expect(TEMPLATES.capital_injection).toEqual({ debit: "1100", credit: "3100" });
    expect(TEMPLATES.receive_loan).toEqual({ debit: "1100", credit: "2500" });
    expect(TEMPLATES.tax_payment).toEqual({ debit: "2400", credit: "1100" });
  });

  it("has an entry for every TEMPLATE_TYPES value", () => {
    for (const type of TEMPLATE_TYPES) {
      expect(TEMPLATES[type]).toBeDefined();
      expect(TEMPLATES[type].debit).toBeTruthy();
      expect(TEMPLATES[type].credit).toBeTruthy();
    }
  });
});

// ============================================
// validateTemplateType
// ============================================
describe("validateTemplateType", () => {
  it("passes for valid template type 'equipment_purchase'", () => {
    expect(() => validateTemplateType("equipment_purchase")).not.toThrow();
  });

  it("passes for all 6 valid template types", () => {
    for (const type of TEMPLATE_TYPES) {
      expect(() => validateTemplateType(type)).not.toThrow();
    }
  });

  it("throws for invalid template type", () => {
    expect(() => validateTemplateType("invalid_type")).toThrow("Invalid template type");
  });

  it("throws for empty string", () => {
    expect(() => validateTemplateType("")).toThrow("Invalid template type");
  });
});

// ============================================
// validateManualJournalAmount
// ============================================
describe("validateManualJournalAmount", () => {
  it("passes for positive integer (50000)", () => {
    expect(() => validateManualJournalAmount(50000)).not.toThrow();
  });

  it("passes for amount of 1 (minimum valid)", () => {
    expect(() => validateManualJournalAmount(1)).not.toThrow();
  });

  it("throws for zero", () => {
    expect(() => validateManualJournalAmount(0)).toThrow("must be greater than 0");
  });

  it("throws for negative number", () => {
    expect(() => validateManualJournalAmount(-1)).toThrow("must be greater than 0");
  });

  it("throws for fractional number", () => {
    expect(() => validateManualJournalAmount(50000.5)).toThrow("must be a whole number");
  });
});

// ============================================
// validateManualJournalDate
// ============================================
describe("validateManualJournalDate", () => {
  it("passes for a valid recent date (June 15, 2024)", () => {
    expect(() => validateManualJournalDate(Date.UTC(2024, 5, 15))).not.toThrow();
  });

  it("passes for exactly 2020-01-01 (lower bound)", () => {
    expect(() => validateManualJournalDate(Date.UTC(2020, 0, 1))).not.toThrow();
  });

  it("throws for zero (epoch)", () => {
    expect(() => validateManualJournalDate(0)).toThrow("date");
  });

  it("throws for pre-2020 date (Dec 31, 2019)", () => {
    expect(() => validateManualJournalDate(Date.UTC(2019, 11, 31))).toThrow("2020");
  });

  it("throws for far-future date (2 days from now)", () => {
    expect(() => validateManualJournalDate(Date.now() + 2 * 86400000)).toThrow("future");
  });
});
