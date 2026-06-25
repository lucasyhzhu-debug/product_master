import { describe, it, expect } from "vitest";
import { assertReconcileNote } from "../reconcile";

describe("assertReconcileNote", () => {
  it("returns the trimmed note when non-empty", () => {
    expect(assertReconcileNote("  cafe undercounted 2 boxes ")).toBe("cafe undercounted 2 boxes");
  });
  it("throws on empty / whitespace-only", () => {
    expect(() => assertReconcileNote("")).toThrow();
    expect(() => assertReconcileNote("   ")).toThrow();
  });
});
