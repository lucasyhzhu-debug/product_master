import { describe, it, expect } from "vitest";
import { normalize, similarityScore } from "../fuzzyMatch";

describe("normalize", () => {
  it("lowercases, collapses whitespace, strips punctuation", () => {
    expect(normalize(" Hello, World! ")).toBe("hello world");
  });

  it("collapses internal runs of whitespace", () => {
    expect(normalize("foo   bar\tbaz")).toBe("foo bar baz");
  });
});

describe("similarityScore", () => {
  it("returns 1 for identical strings", () => {
    expect(similarityScore("abc", "abc")).toBe(1);
  });

  it("returns 0 for completely different strings of equal length", () => {
    expect(similarityScore("abc", "xyz")).toBe(0);
  });

  it("returns 0 when both inputs normalize to empty", () => {
    expect(similarityScore("  ", "...")).toBe(0);
  });

  it("is case-insensitive after normalization", () => {
    expect(similarityScore("Shipping Pierre", "shipping pierre")).toBeGreaterThanOrEqual(
      0.95,
    );
  });

  it("produces a fuzzy score >= 0.3 for real BCA descriptor vs short reimburse phrase", () => {
    const score = similarityScore(
      "TRSF E-BANKING DB 3011/FTSCY/WS95051 76876615.00 reimburse KEVIN YOSUA / RIST",
      "reimburse Kevin Yosua",
    );
    expect(score).toBeGreaterThanOrEqual(0.3);
  });

  it("returns a number in [0,1]", () => {
    const s1 = similarityScore("hello world", "hello");
    expect(s1).toBeGreaterThanOrEqual(0);
    expect(s1).toBeLessThanOrEqual(1);
  });
});
