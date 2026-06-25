// convex/subscriptions/__tests__/overCredit.test.ts
import { describe, it, expect } from "vitest";
import { isOverCredit } from "../queries";

describe("isOverCredit", () => {
  it("true when the order total exceeds remaining credit", () => {
    expect(isOverCredit(50_000, 30_000)).toBe(true);
  });
  it("false when credit covers the order exactly or more", () => {
    expect(isOverCredit(30_000, 30_000)).toBe(false);
    expect(isOverCredit(20_000, 30_000)).toBe(false);
  });
});
