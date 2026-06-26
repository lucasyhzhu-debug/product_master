import { describe, it, expect } from "vitest";
import { permanentChangeEffective, terminationEffective, effectiveDateOf, DAY_MS } from "../effectiveDates";

const T = 1_000_000_000_000;

describe("effective-date predicates", () => {
  it("effectiveDateOf adds days", () => {
    expect(effectiveDateOf(T, 14)).toBe(T + 14 * DAY_MS);
  });
  it("permanentChangeEffective true at boundary", () => {
    expect(permanentChangeEffective(T, 14, T + 14 * DAY_MS)).toBe(true);
  });
  it("permanentChangeEffective false before", () => {
    expect(permanentChangeEffective(T, 14, T + 14 * DAY_MS - 1)).toBe(false);
  });
  it("terminationEffective true after", () => {
    expect(terminationEffective(T, 30, T + 31 * DAY_MS)).toBe(true);
  });
});
