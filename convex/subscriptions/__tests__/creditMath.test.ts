import { describe, it, expect } from "vitest";
import {
  computeCreditSplit,
  computeLineTotal,
  computeScheduleTotal,
  deriveCreditPool,
  deriveWeekShortfall,
  nextBalanceAfter,
} from "../creditMath";
import type { Id } from "../../_generated/dataModel";
import type { PlannedDay } from "../types";

describe("deriveWeekShortfall", () => {
  it("reports a shortfall when planned consumption exceeds funded credit", () => {
    expect(deriveWeekShortfall({ plannedConsumption: 7_250_000, creditIssued: 4_350_000 })).toEqual({
      projectedShortfall: 2_900_000,
      projectedEndingPool: -2_900_000,
    });
  });
  it("reports no shortfall when funding covers the plan", () => {
    expect(deriveWeekShortfall({ plannedConsumption: 4_350_000, creditIssued: 4_350_000 })).toEqual({
      projectedShortfall: 0,
      projectedEndingPool: 0,
    });
  });
  it("reports a positive ending pool when over-funded", () => {
    const r = deriveWeekShortfall({ plannedConsumption: 3_000_000, creditIssued: 4_350_000 });
    expect(r.projectedShortfall).toBe(0);
    expect(r.projectedEndingPool).toBe(1_350_000);
  });
});

const line = (qty: number, unitPrice: number) =>
  ({ menuProductId: "x" as never, productName: "Dubai", qty, unitPrice, lineTotal: qty * unitPrice });
const day = (items: ReturnType<typeof line>[]): PlannedDay =>
  ({ date: 0, deliverByTime: "09:00", items, locked: false });

describe("computeLineTotal", () => {
  it("multiplies qty by unit price (integer IDR)", () => {
    expect(computeLineTotal(150, 29000)).toBe(4350000);
  });
});

describe("computeScheduleTotal", () => {
  it("sums every line across every day", () => {
    const days = [day([line(100, 29000), line(50, 29000)]), day([line(150, 29000)])];
    expect(computeScheduleTotal(days)).toBe(8700000); // (100+50+150)*29000
  });
  it("returns 0 for an empty schedule", () => {
    expect(computeScheduleTotal([])).toBe(0);
  });
});

describe("deriveCreditPool", () => {
  it("replays signed ledger entries into a pool (topup +, drawdown/expiry -)", () => {
    const pool = deriveCreditPool([
      { type: "topup", amount: 30450000 },
      { type: "drawdown", amount: -4350000 },
      { type: "drawdown", amount: -4350000 },
      { type: "expiry", amount: -1000000 },
    ]);
    expect(pool.creditIssued).toBe(30450000);
    expect(pool.creditConsumed).toBe(8700000);
    expect(pool.creditExpired).toBe(1000000);
    expect(pool.creditRemaining).toBe(30450000 - 8700000 - 1000000);
  });
  it("counts refund as a reduction of remaining, not consumption", () => {
    const pool = deriveCreditPool([
      { type: "topup", amount: 10000000 },
      { type: "refund", amount: -2000000 },
    ]);
    expect(pool.creditConsumed).toBe(0);
    expect(pool.creditRemaining).toBe(8000000);
  });
});

describe("nextBalanceAfter", () => {
  it("adds the signed amount to the previous balance", () => {
    expect(nextBalanceAfter(30450000, -4350000)).toBe(26100000);
  });
});

const P1 = "p1" as Id<"menuProducts">;   // subscription product
const P2 = "p2" as Id<"menuProducts">;   // off-plan product
const allowed = new Set<string>([P1]);

describe("computeCreditSplit", () => {
  it("all eligible, credit covers full eligible subtotal (partner price)", () => {
    // retail 10000, partner 7000; 8 units eligible
    const s = computeCreditSplit(
      [{ menuProductId: P1, qty: 8, retailUnitPrice: 10000 }],
      allowed, 7000, 1_000_000,
    );
    expect(s.eligibleSubtotal).toBe(56000);   // 8 * 7000 (partner)
    expect(s.creditCovered).toBe(56000);
    expect(s.offPlanTotal).toBe(0);
    expect(s.amountDue).toBe(0);
    expect(s.lines[0].effectiveUnitPrice).toBe(7000);
  });

  it("partial: credit < eligible subtotal", () => {
    const s = computeCreditSplit(
      [{ menuProductId: P1, qty: 8, retailUnitPrice: 10000 }],
      allowed, 7000, 30000,
    );
    expect(s.eligibleSubtotal).toBe(56000);
    expect(s.creditCovered).toBe(30000);
    expect(s.eligibleShortfall).toBe(26000);
    expect(s.amountDue).toBe(26000);
  });

  it("mixed eligible + off-plan: off-plan at retail, always due", () => {
    const s = computeCreditSplit(
      [
        { menuProductId: P1, qty: 2, retailUnitPrice: 10000 }, // partner 7000 -> 14000
        { menuProductId: P2, qty: 1, retailUnitPrice: 25000 }, // off-plan retail 25000
      ],
      allowed, 7000, 1_000_000,
    );
    expect(s.eligibleSubtotal).toBe(14000);
    expect(s.offPlanTotal).toBe(25000);
    expect(s.creditCovered).toBe(14000);
    expect(s.amountDue).toBe(25000); // off-plan only
  });

  it("off-plan only: creditCovered 0", () => {
    const s = computeCreditSplit(
      [{ menuProductId: P2, qty: 1, retailUnitPrice: 25000 }],
      allowed, 7000, 1_000_000,
    );
    expect(s.creditCovered).toBe(0);
    expect(s.amountDue).toBe(25000);
  });

  it("zero / negative available credit clamps to 0 covered", () => {
    const s = computeCreditSplit(
      [{ menuProductId: P1, qty: 2, retailUnitPrice: 10000 }],
      allowed, 7000, -50,
    );
    expect(s.creditCovered).toBe(0);
    expect(s.amountDue).toBe(14000);
  });
});
