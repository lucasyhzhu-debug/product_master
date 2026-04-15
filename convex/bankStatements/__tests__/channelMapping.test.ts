/**
 * channelMapping unit tests (C1 from staff review).
 *
 * Pure-function tests — no convex-test runtime needed.
 */

import { describe, expect, it } from "vitest";
import { mapChannelToSource, CHANNEL_TO_SOURCE } from "../channelMapping";

describe("mapChannelToSource", () => {
  it("maps gopay to gobiz", () => {
    expect(mapChannelToSource("gopay")).toBe("gobiz");
  });

  it("maps gofood to gobiz", () => {
    expect(mapChannelToSource("gofood")).toBe("gobiz");
  });

  it("maps grabfood to grabfood", () => {
    expect(mapChannelToSource("grabfood")).toBe("grabfood");
  });

  it("maps shopeefood to shopee", () => {
    expect(mapChannelToSource("shopeefood")).toBe("shopee");
  });

  it("maps shopee to shopee", () => {
    expect(mapChannelToSource("shopee")).toBe("shopee");
  });

  it("maps tiktok to tiktok", () => {
    expect(mapChannelToSource("tiktok")).toBe("tiktok");
  });

  it("maps tokopedia to null (merged with tiktok - channel unmapped)", () => {
    expect(mapChannelToSource("tokopedia")).toBeNull();
  });

  it("maps ovo to null (payment wallet, no externalRevenue source)", () => {
    expect(mapChannelToSource("ovo")).toBeNull();
  });

  it("maps dana to null (payment wallet, no externalRevenue source)", () => {
    expect(mapChannelToSource("dana")).toBeNull();
  });

  it("maps bca to internal (intra-account transfer)", () => {
    expect(mapChannelToSource("bca")).toBe("internal");
  });

  it("maps mandiri to internal (intra-account transfer)", () => {
    expect(mapChannelToSource("mandiri")).toBe("internal");
  });

  it("returns null for unknown channel", () => {
    expect(mapChannelToSource("unknown_channel")).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(mapChannelToSource(undefined)).toBeNull();
  });

  it("returns null for null input", () => {
    expect(mapChannelToSource(null)).toBeNull();
  });

  it("returns null for empty string input", () => {
    expect(mapChannelToSource("")).toBeNull();
  });

  it("returns null for whitespace-only input", () => {
    expect(mapChannelToSource("   ")).toBeNull();
  });

  it("is case-insensitive (GoPay -> gobiz)", () => {
    expect(mapChannelToSource("GoPay")).toBe("gobiz");
  });

  it("is case-insensitive (GRABFOOD -> grabfood)", () => {
    expect(mapChannelToSource("GRABFOOD")).toBe("grabfood");
  });

  it("trims whitespace", () => {
    expect(mapChannelToSource("  gopay  ")).toBe("gobiz");
  });

  it("CHANNEL_TO_SOURCE contains the 11 documented entries", () => {
    const keys = Object.keys(CHANNEL_TO_SOURCE).sort();
    expect(keys).toEqual(
      [
        "bca",
        "dana",
        "gofood",
        "gopay",
        "grabfood",
        "mandiri",
        "ovo",
        "shopee",
        "shopeefood",
        "tiktok",
        "tokopedia",
      ].sort(),
    );
  });
});
