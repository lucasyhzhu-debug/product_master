import { describe, it, expect } from "vitest";
import {
  allocateLeftoverToTranches,
  reconcileTranches,
} from "../reconcileMath";

/**
 * Coverage for the DELIVERED-THEN-RECONCILED path (CR-A coverage gap): a week funded N,
 * partially delivered (drawdowns already fired at delivery), then reconciled. The tranche
 * amounts fed to `reconcileTranches` MUST sum to the NET `leftover`, never the gross funded
 * total. We unit-test the pure netting helper plus its composition with the decision core.
 *
 * Scenario mirrors the prompt example: funded 1,000,000; delivered 600,000; leftover 400,000.
 */
describe("allocateLeftoverToTranches (CR-A netting)", () => {
  it("nets delivered consumption against a single tranche → remainder = leftover", () => {
    // Funded 1,000,000 (one base topup), delivered 600,000 → leftover 400,000.
    const tranches = [{ weekId: "w", amount: 1_000_000, weeksCarried: 0 }];
    const netted = allocateLeftoverToTranches(tranches, 400_000);
    // Invariant 1: tranche amounts sum to leftover, NOT gross.
    expect(netted.reduce((s, t) => s + t.amount, 0)).toBe(400_000);
    expect(netted).toEqual([{ weekId: "w", amount: 400_000, weeksCarried: 0 }]);
  });

  it("consumes OLDEST credit first (FIFO) and drops fully-consumed tranches", () => {
    // Two tranches: aged 600,000 (carried) + fresh 400,000. leftover = 700,000 means
    // 300,000 consumed → eats the oldest (600k) down to 300k, fresh 400k untouched.
    const tranches = [
      { weekId: "wOld", amount: 600_000, weeksCarried: 3 },
      { weekId: "wNew", amount: 400_000, weeksCarried: 0 },
    ];
    const netted = allocateLeftoverToTranches(tranches, 700_000);
    expect(netted.reduce((s, t) => s + t.amount, 0)).toBe(700_000);
    expect(netted).toEqual([
      { weekId: "wOld", amount: 300_000, weeksCarried: 3 },
      { weekId: "wNew", amount: 400_000, weeksCarried: 0 },
    ]);
  });

  it("drops a fully-consumed oldest tranche entirely", () => {
    const tranches = [
      { weekId: "wOld", amount: 300_000, weeksCarried: 2 },
      { weekId: "wNew", amount: 400_000, weeksCarried: 0 },
    ];
    // leftover 400,000 → 300,000 consumed → oldest fully gone.
    const netted = allocateLeftoverToTranches(tranches, 400_000);
    expect(netted.reduce((s, t) => s + t.amount, 0)).toBe(400_000);
    expect(netted).toEqual([{ weekId: "wNew", amount: 400_000, weeksCarried: 0 }]);
  });

  it("fully delivered → leftover 0 → no surviving tranches", () => {
    const tranches = [{ weekId: "w", amount: 1_000_000, weeksCarried: 0 }];
    const netted = allocateLeftoverToTranches(tranches, 0);
    expect(netted).toEqual([]);
  });

  it("clamps negative leftover (over-delivery) to zero tranches", () => {
    const tranches = [{ weekId: "w", amount: 1_000_000, weeksCarried: 0 }];
    const netted = allocateLeftoverToTranches(tranches, -50_000);
    expect(netted).toEqual([]);
  });

  it("never inflates a tranche above its topup when leftover exceeds gross (defensive)", () => {
    const tranches = [{ weekId: "w", amount: 100, weeksCarried: 0 }];
    const netted = allocateLeftoverToTranches(tranches, 999);
    expect(netted).toEqual([{ weekId: "w", amount: 100, weeksCarried: 0 }]);
  });
});

describe("delivered-then-reconciled composition (CR-A invariants 1 + 3)", () => {
  // Funded 1,000,000; delivered 600,000 → leftover 400,000.
  const fundedTranches = [{ weekId: "w", amount: 1_000_000, weeksCarried: 0 }];
  const leftover = 400_000;
  const netted = allocateLeftoverToTranches(fundedTranches, leftover);

  it("invariant 1: netted tranche amounts sum to leftover (400k), never gross (1M)", () => {
    expect(netted.reduce((s, t) => s + t.amount, 0)).toBe(leftover);
  });

  it("invariant 3 (cafe/none, expire): breakage = NETTED expired only (400k, not 1M)", () => {
    const { expire, carry } = reconcileTranches({
      tranches: netted,
      policy: "expire",
      rolloverExpiryWeeks: null,
    });
    const breakage = expire.reduce((s, e) => s + e.amount, 0);
    expect(breakage).toBe(400_000); // NOT 1,000,000 (the CR-A bug)
    expect(carry).toEqual([]);
  });

  it("invariant (cafe/none, rollover under horizon): carries NETTED leftover, no expiry", () => {
    const { expire, carry } = reconcileTranches({
      tranches: netted,
      policy: "rollover",
      rolloverExpiryWeeks: 4,
    });
    expect(expire).toEqual([]);
    const carried = carry.reduce((s, c) => s + c.amount, 0);
    expect(carried).toBe(400_000); // carry conserves the NET leftover
  });

  it("invariant 3 negative case: a fully-delivered week recognizes ZERO breakage", () => {
    const fullyDelivered = allocateLeftoverToTranches(fundedTranches, 0);
    const { expire } = reconcileTranches({
      tranches: fullyDelivered,
      policy: "expire",
      rolloverExpiryWeeks: null,
    });
    expect(expire.reduce((s, e) => s + e.amount, 0)).toBe(0);
  });
});
