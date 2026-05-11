import { describe, it, expect } from "vitest";
import { isProductionUnit } from "../productionUnitHelpers";

/**
 * Phase 81 / D-01: Canonical predicate is `category === "production"` ALONE.
 *
 * Drops historical clauses:
 *   - `unit === "pcs"` (future-proofs gram-denominated bulk variants)
 *   - `gramsPerUnit !== undefined` (BOM unification trajectory per CLAUDE.md rule 10)
 *
 * Table-driven per D-11. Matrix proves no field besides `category` is consulted.
 */

function makeCt(category: "production" | "packaging") {
  return { category };
}

describe("isProductionUnit", () => {
  it.each([
    ["production", true],
    ["packaging", false],
  ] as const)("category %s → %s", (category, expected) => {
    expect(isProductionUnit(makeCt(category))).toBe(expected);
  });

  it("returns true for production regardless of unit (D-01: drops unit === 'pcs' requirement)", () => {
    // Predicate accepts a structural subset — only `category` is consulted.
    // A production component with unit="g" (gram-denominated bulk) must still pass.
    expect(isProductionUnit({ category: "production" })).toBe(true);
  });

  it("returns true for production regardless of gramsPerUnit (D-01: drops gramsPerUnit !== undefined requirement)", () => {
    // A production component with no gramsPerUnit (BOM unification trajectory) must pass.
    // Numeric-aggregation callsites that need gramsPerUnit compose a secondary filter
    // (see convex/menuProducts/mutations.ts).
    expect(isProductionUnit({ category: "production" })).toBe(true);
  });

  // Exhaustive matrix — production/packaging × any other field shape.
  // Predicate looks at ONLY ct.category; matrix proves no other field is consulted.
  it.each([
    // [category, unit, gramsPerUnit, expectedResult]
    ["production", "pcs", 80, true],
    ["production", "pcs", undefined, true],
    ["production", "g", 1, true],
    ["production", "g", undefined, true],
    ["production", "ml", undefined, true],
    ["packaging", "pcs", undefined, false],
    ["packaging", "pcs", 100, false],
    ["packaging", "g", 100, false],
    ["packaging", "ml", undefined, false],
  ] as const)(
    "matrix: category=%s unit=%s gramsPerUnit=%s → %s (no other field consulted)",
    (category, unit, gramsPerUnit, expected) => {
      const ct = {
        category,
        _id: "x",
        _creationTime: 0,
        name: "Y",
        code: "Z",
        unit,
        gramsPerUnit,
      } as never;
      expect(isProductionUnit(ct)).toBe(expected);
    },
  );
});
