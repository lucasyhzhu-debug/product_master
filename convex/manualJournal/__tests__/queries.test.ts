/**
 * Tests for manual journal entry query helpers.
 *
 * Tests the exported pure function from manualJournal/queries.ts:
 * - isTemplateEntry (filter predicate distinguishing template-based entries from CSV imports)
 *
 * The ctx-dependent listByPeriod query is tested indirectly via this
 * extracted helper. Auth-gated convex-test runtime tests are deferred
 * per project convention.
 */

import { describe, it, expect } from "vitest";
import { isTemplateEntry } from "../queries";

// ============================================
// isTemplateEntry Filter Predicate
// ============================================
describe("isTemplateEntry", () => {
  it("returns true for valid template entry (sourceType manual + metadata.templateType present)", () => {
    expect(
      isTemplateEntry({
        sourceType: "manual",
        metadata: { templateType: "equipment_purchase" },
      })
    ).toBe(true);
  });

  it("returns false for CSV import entry (sourceType manual + no metadata)", () => {
    expect(
      isTemplateEntry({
        sourceType: "manual",
        metadata: null,
      })
    ).toBe(false);
  });

  it("returns false for CSV import entry (sourceType manual + metadata with only receiptUrl)", () => {
    expect(
      isTemplateEntry({
        sourceType: "manual",
        metadata: { receiptUrl: "https://example.com/receipt.pdf" },
      })
    ).toBe(false);
  });

  it("returns false for non-manual entry (sourceType expense + metadata.templateType present)", () => {
    expect(
      isTemplateEntry({
        sourceType: "expense",
        metadata: { templateType: "equipment_purchase" },
      })
    ).toBe(false);
  });

  it("returns false for empty metadata object (sourceType manual + metadata: {})", () => {
    expect(
      isTemplateEntry({
        sourceType: "manual",
        metadata: {},
      })
    ).toBe(false);
  });
});
