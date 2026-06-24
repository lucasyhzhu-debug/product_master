import { describe, it, expect } from "vitest";
import { reconcileTranches } from "../reconcileMath";

describe("reconcileTranches", () => {
  it("expires everything under policy=expire", () => {
    const r = reconcileTranches({
      tranches: [{ weekId: "w1", amount: 100, weeksCarried: 0 }],
      policy: "expire", rolloverExpiryWeeks: 4,
    });
    expect(r.expire).toEqual([{ weekId: "w1", amount: 100 }]);
    expect(r.carry).toEqual([]);
  });
  it("carries fresh tranches and expires those at/over the horizon (FIFO oldest-first)", () => {
    const r = reconcileTranches({
      tranches: [
        { weekId: "wOld", amount: 50, weeksCarried: 4 }, // at horizon → expire
        { weekId: "wMid", amount: 30, weeksCarried: 2 }, // carry
        { weekId: "wNew", amount: 20, weeksCarried: 0 }, // carry
      ],
      policy: "rollover", rolloverExpiryWeeks: 4,
    });
    expect(r.expire).toEqual([{ weekId: "wOld", amount: 50 }]);
    expect(r.carry).toEqual([
      { weekId: "wMid", amount: 30 },
      { weekId: "wNew", amount: 20 },
    ]);
  });
  it("never expires when rolloverExpiryWeeks is null (explicit opt-out)", () => {
    const r = reconcileTranches({
      tranches: [{ weekId: "w", amount: 10, weeksCarried: 99 }],
      policy: "rollover", rolloverExpiryWeeks: null,
    });
    expect(r.expire).toEqual([]);
    expect(r.carry).toEqual([{ weekId: "w", amount: 10 }]);
  });
  it("drops zero-amount tranches from both lists", () => {
    const r = reconcileTranches({
      tranches: [{ weekId: "w", amount: 0, weeksCarried: 0 }],
      policy: "rollover", rolloverExpiryWeeks: 4,
    });
    expect(r.expire).toEqual([]);
    expect(r.carry).toEqual([]);
  });
});
