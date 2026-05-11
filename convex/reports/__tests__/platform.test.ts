import { describe, it, expect } from "vitest";
import {
  resolvePlatform,
  isPlatform,
  platformDisplay,
  PLATFORMS,
  type Platform,
  type OrderChannel,
} from "../platform";
import type { ExternalSource } from "../../lib/externalSource";

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

  it("bigseller + underlyingSource=bigseller → transitional fallback (recursive guard, triple-review Minor-2)", () => {
    // Edge case: the underlyingSource branch's `!== "bigseller"` runtime
    // guard prevents recursive resolution. Asserts the fallback fires.
    expect(
      resolvePlatform({ source: "bigseller", underlyingSource: "bigseller" }),
    ).toEqual({
      platform: "BigSeller",
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

/**
 * Triple-review C1: ensure EVERY orders.channel schema literal resolves
 * cleanly. Pre-fix `whatsapp`, `instagram`, `k3mart_gf`, `legato_tamtem`,
 * `legato_goldfinch`, `bazaar`, `other` all fell through `?? "Direct"` —
 * silently inflating Direct revenue for native consignment + K3Mart-GF
 * orders. The map is now type-narrowed against the schema's OrderChannel
 * union so future schema additions break TS at compile time.
 */
describe("resolvePlatform — orderChannel covers every orders.channel schema literal (triple-review C1)", () => {
  it.each<readonly [OrderChannel, Platform]>([
    ["whatsapp", "Direct"],
    ["instagram", "Direct"],
    ["shopee", "Shopee"],
    ["tiktok", "TikTok"],
    ["tokopedia", "TikTok"],
    ["grabfood", "GrabFood"],
    ["k3mart_gf", "K3Mart"],
    ["legato_tamtem", "Consignment"],
    ["legato_goldfinch", "Consignment"],
    ["bazaar", "Consignment"],
    ["other", "Direct"],
  ])("schema literal orderChannel=%s → Platform=%s", (orderChannel, expected) => {
    expect(
      resolvePlatform({ source: "internal", orderChannel }),
    ).toEqual({
      platform: expected,
      confidence: "exact",
    });
  });
});

/**
 * Triple-review I1: orderChannel-unknown fallback returns
 * `confidence: "inferred"` instead of `"exact"` so Phase 77's data-health
 * surface can grep the inferred branch to find drift between schema literals
 * and the resolver keyspace. Cast bypasses the TS narrowing because we are
 * deliberately exercising the runtime defensive branch.
 */
describe("resolvePlatform — orderChannel unknown fallback (triple-review I1)", () => {
  it("returns Direct + inferred confidence for an unknown orderChannel string", () => {
    expect(
      resolvePlatform({
        source: "internal",
        // simulate a future schema literal that the resolver hasn't been updated for
        orderChannel: "shopee_chat" as OrderChannel,
      }),
    ).toEqual({ platform: "Direct", confidence: "inferred" });
  });
});

/**
 * Triple-review C3: `resolvePlatform` should not return `undefined` at
 * runtime for unknown sources. Callers using `as ExternalSource` casts
 * (6 sites in this phase) can pass unknown values at runtime. Defensive
 * fallback returns BigSeller transitional + inferred confidence.
 */
describe("resolvePlatform — unknown source runtime fallback (triple-review C3)", () => {
  it("returns BigSeller + inferred confidence for an unknown source string", () => {
    expect(
      resolvePlatform({
        source: "unknown_marketplace" as ExternalSource,
      }),
    ).toEqual({ platform: "BigSeller", confidence: "inferred" });
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
