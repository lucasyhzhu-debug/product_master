/**
 * Phase 79 Wave 0 — Plan 01 Task 1
 *
 * Failing tests for the `dominantSku` helper.
 *
 * Anchor rule (D-09): dominant SKU = max qty; ties broken by max
 * `menuProductPrice` (mapping-derived); further ties resolved by first-listed
 * SKU (documented assumption A5 in RESEARCH.md).
 *
 * Wave 1 (Plan 02) will add the `dominantSku` export. Tests fail red until.
 */

import { describe, it, expect } from "vitest";
import { dominantSku } from "../helpers";

type Sku = { sku: string; skuNum: number };
type MappingEntry = { menuProductId?: string; menuProductPrice?: number };

describe("dominantSku — D-09 rule", () => {
  it("returns null for both fields on empty skuVoList", () => {
    const res = dominantSku([], new Map<string, MappingEntry>());
    expect(res).toEqual({ sku: null, menuProductId: null });
  });

  it("picks the single SKU and resolves menuProductId via mapping", () => {
    const mapping = new Map<string, MappingEntry>([["A", { menuProductId: "mp-A" }]]);
    const res = dominantSku([{ sku: "A", skuNum: 5 }], mapping);
    expect(res.sku).toBe("A");
    expect(res.menuProductId).toBe("mp-A");
  });

  it("picks the max-qty SKU across a multi-SKU order", () => {
    const mapping = new Map<string, MappingEntry>([
      ["A", { menuProductId: "mp-A" }],
      ["B", { menuProductId: "mp-B" }],
    ]);
    const res = dominantSku(
      [
        { sku: "A", skuNum: 5 },
        { sku: "B", skuNum: 3 },
      ],
      mapping,
    );
    expect(res.sku).toBe("A");
    expect(res.menuProductId).toBe("mp-A");
  });

  it("breaks qty ties by max mapping menuProductPrice", () => {
    const mapping = new Map<string, MappingEntry>([
      ["A", { menuProductId: "mp-A", menuProductPrice: 40000 }],
      ["B", { menuProductId: "mp-B", menuProductPrice: 60000 }],
    ]);
    const res = dominantSku(
      [
        { sku: "A", skuNum: 3 },
        { sku: "B", skuNum: 3 },
      ],
      mapping,
    );
    expect(res.sku).toBe("B");
    expect(res.menuProductId).toBe("mp-B");
  });

  it("when qty + price both tie, first-listed SKU wins (A5 assumption)", () => {
    const mapping = new Map<string, MappingEntry>([
      ["A", { menuProductId: "mp-A", menuProductPrice: 50000 }],
      ["B", { menuProductId: "mp-B", menuProductPrice: 50000 }],
    ]);
    const res = dominantSku(
      [
        { sku: "A", skuNum: 3 },
        { sku: "B", skuNum: 3 },
      ],
      mapping,
    );
    expect(res.sku).toBe("A");
  });

  it("reports the sku but null menuProductId when mapping is missing", () => {
    const mapping = new Map<string, MappingEntry>(); // no entries
    const res = dominantSku([{ sku: "UNKNOWN", skuNum: 2 }], mapping);
    expect(res.sku).toBe("UNKNOWN");
    expect(res.menuProductId).toBeNull();
  });
});
