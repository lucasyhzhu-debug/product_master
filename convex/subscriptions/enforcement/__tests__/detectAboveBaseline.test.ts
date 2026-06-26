import { describe, it, expect } from "vitest";
import { detectAboveBaseline } from "../detectAboveBaseline";

describe("detectAboveBaseline", () => {
  it("flags a day whose total qty exceeds baseline", () => {
    expect(detectAboveBaseline([{ qty: 3 }, { qty: 2 }], 4)).toBe(true);
  });
  it("does not flag a day equal to baseline", () => {
    expect(detectAboveBaseline([{ qty: 2 }, { qty: 2 }], 4)).toBe(false);
  });
  it("does not flag a day below baseline", () => {
    expect(detectAboveBaseline([{ qty: 1 }], 4)).toBe(false);
  });
  it("does not flag an empty day", () => {
    expect(detectAboveBaseline([], 4)).toBe(false);
  });
});
