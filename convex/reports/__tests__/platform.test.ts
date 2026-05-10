import { describe, it, expect } from "vitest";
import {
  resolvePlatform,
  isPlatform,
  platformDisplay,
  PLATFORMS,
  type Platform,
} from "../platform";

describe("resolvePlatform — D-05 source→Platform map", () => {
  it.each([
    ["internal", "Direct"],
    ["gobiz", "GoFood"],
    ["grabfood", "GrabFood"], // D-05 closes ambiguity 138 — separate from gobiz
    ["shopee", "Shopee"],
    ["tiktok", "TikTok"], // D-02: NOT "Tokopedia"
    ["k3mart", "K3Mart"], // D-02: no space
    ["consignment", "Consignment"],
  ] as const)("%s → %s", (source, expected) => {
    const result = resolvePlatform({ source });
    expect(result).toEqual({ platform: expected, confidence: "exact" });
  });
});

describe("resolvePlatform — D-03 BigSeller fallback chain (ADR-0001 forward-compat)", () => {
  it("bigseller alone → BigSeller transitional + inferred confidence", () => {
    expect(resolvePlatform({ source: "bigseller" })).toEqual({
      platform: "BigSeller",
      confidence: "inferred",
    });
  });

  it("bigseller + underlyingSource=shopee → Shopee + inferred (ADR-0001 forward-compat)", () => {
    expect(
      resolvePlatform({ source: "bigseller", underlyingSource: "shopee" }),
    ).toEqual({
      platform: "Shopee",
      confidence: "inferred",
    });
  });

  it("bigseller + underlyingSource=tiktok → TikTok + inferred", () => {
    expect(
      resolvePlatform({ source: "bigseller", underlyingSource: "tiktok" }),
    ).toEqual({
      platform: "TikTok",
      confidence: "inferred",
    });
  });

  it.skip(
    "bigseller + linkedMenuProductId → linked product source's Platform + inferred (DEFERRED per staffreview I1 until menuProducts.source schema field exists)",
    () => {
      // Skipped: menuProducts has no `source` field in convex/schema.ts (verified 2026-05-10).
      // The lookup branch was removed from resolvePlatform implementation. When ADR-0001's
      // externalRevenue.underlyingSource + companion menuProducts.source fields land,
      // re-introduce the lookup branch + un-skip this test (use convexTest harness pattern
      // from convex/integrations/k3mart/__tests__/cascade.test.ts).
    },
  );
});

describe("resolvePlatform — orderChannel overload (PATTERNS.md finding #6)", () => {
  it.each([
    ["shopee", "Shopee"],
    ["tiktok", "TikTok"],
    ["tokopedia", "TikTok"], // deprecated orderChannel synonym (CONTEXT.md ambiguity 137)
    ["internal", "Direct"],
    ["gobiz", "GoFood"],
  ] as const)("orderChannel=%s → %s", (orderChannel, expected) => {
    // source value is ignored when orderChannel is provided
    expect(
      resolvePlatform({ source: "internal", orderChannel }),
    ).toEqual({
      platform: expected,
      confidence: "exact",
    });
  });
});

describe("isPlatform runtime guard", () => {
  it.each(PLATFORMS as readonly string[])("accepts %s", (p) => {
    expect(isPlatform(p)).toBe(true);
  });

  it.each(["Other", "tiktok", "K3 Mart", "Tokopedia", ""])(
    "rejects non-canonical %s",
    (s) => {
      expect(isPlatform(s)).toBe(false);
    },
  );
});

describe("platformDisplay identity-on-literal", () => {
  it.each(PLATFORMS as readonly Platform[])("%s → %s (identity)", (p) => {
    expect(platformDisplay(p)).toBe(p);
  });
});
