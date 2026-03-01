import { describe, expect, it } from "vitest";
import { sourceToPlatform } from "../queries";

describe("sourceToPlatform", () => {
  it.each([
    ["gobiz", "GoFood"],
    ["k3mart", "K3 Mart"],
    ["internal", "Direct"],
    ["grabfood", "GrabFood"],
    ["shopee", "Shopee"],
    ["tiktok", "Tokopedia"],
    ["consignment", "Consignment"],
    ["bigseller", "BigSeller"],
  ] as const)("maps %s → %s", (source, expected) => {
    expect(sourceToPlatform(source)).toBe(expected);
  });

  it("returns unknown source as-is (fallback)", () => {
    expect(sourceToPlatform("newplatform")).toBe("newplatform");
  });

  it("returns empty string as-is", () => {
    expect(sourceToPlatform("")).toBe("");
  });
});
