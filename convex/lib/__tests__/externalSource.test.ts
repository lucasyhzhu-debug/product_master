import { describe, it, expect } from "vitest";
import { EXTERNAL_SOURCES, isExternalSource } from "../externalSource";

describe("EXTERNAL_SOURCES", () => {
  it("should contain exactly 8 known platform sources", () => {
    expect(EXTERNAL_SOURCES).toHaveLength(8);
    // If this fails, a platform was added to schema.ts but not externalSource.ts (or vice versa)
    expect([...EXTERNAL_SOURCES].sort()).toEqual([
      "bigseller", "consignment", "gobiz", "grabfood",
      "internal", "k3mart", "shopee", "tiktok",
    ]);
  });
});

describe("isExternalSource", () => {
  it("returns true for all known sources", () => {
    for (const source of EXTERNAL_SOURCES) {
      expect(isExternalSource(source)).toBe(true);
    }
  });

  it("returns false for unknown strings", () => {
    expect(isExternalSource("unknown")).toBe(false);
    expect(isExternalSource("")).toBe(false);
    expect(isExternalSource("GOBIZ")).toBe(false); // case-sensitive
  });
});
