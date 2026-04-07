import { describe, it, expect } from "vitest";
import { computePiecesSold } from "../helpers/lifetimeHelpers";

// Minimal stubs: only fields accessed by computePiecesSold
function makeItem(overrides: {
  linkedMenuProductId?: string | null;
  totalPrice: number;
  quantity: number;
}) {
  return {
    _id: `item_${Math.random()}` as any,
    _creationTime: 0,
    revenueId: "rev1" as any,
    externalProductName: "Test",
    quantity: overrides.quantity,
    unitPrice: overrides.totalPrice / (overrides.quantity || 1),
    totalPrice: overrides.totalPrice,
    linkedMenuProductId: (overrides.linkedMenuProductId ?? null) as any,
  } as any;
}

function makeBomComponent(menuProductId: string, componentTypeId: string, quantity: number) {
  return {
    _id: `bom_${Math.random()}` as any,
    _creationTime: 0,
    menuProductId: menuProductId as any,
    componentTypeId: componentTypeId as any,
    quantity,
  } as any;
}

function makeComponentType(id: string, category: "production" | "packaging") {
  return {
    _id: id as any,
    _creationTime: 0,
    category,
    name: category === "production" ? "Ball" : "Box",
    code: category === "production" ? "BIG_BALL" : "SMALL_BOX",
  } as any;
}

describe("computePiecesSold", () => {
  const bigBallCT = makeComponentType("ct_big", "production");
  const midBallCT = makeComponentType("ct_mid", "production");
  const boxCT = makeComponentType("ct_box", "packaging");

  it("returns correct count for linked items with BOM", () => {
    // Product A: 1 BIG_BALL, qty ordered = 3 -> 3 balls
    // Product B: 1 BIG_BALL + 1 MID_BALL = 2 balls per product, qty ordered = 2 -> 4 balls
    // Total = 7 balls
    const items = [
      makeItem({ linkedMenuProductId: "mp_a", totalPrice: 105_000, quantity: 3 }),
      makeItem({ linkedMenuProductId: "mp_b", totalPrice: 140_000, quantity: 2 }),
    ];
    const bom = [
      makeBomComponent("mp_a", "ct_big", 1),
      makeBomComponent("mp_b", "ct_big", 1),
      makeBomComponent("mp_b", "ct_mid", 1),
      makeBomComponent("mp_b", "ct_box", 1), // packaging, should be ignored
    ];
    const cts = [bigBallCT, midBallCT, boxCT];

    // knownBalls = 3*1 + 2*2 = 7, knownRevenue = 245_000
    // avgRevenuePerBall = 245_000 / 7 = 35_000
    // periodGross = 245_000, result = 245_000 / 35_000 = 7
    const result = computePiecesSold(items, 245_000, bom, cts);
    expect(result).toBe(7);
  });

  it("returns 0 for zero items", () => {
    const result = computePiecesSold([], 0, [], []);
    expect(result).toBe(0);
  });

  it("uses fallback (35000) for all unlinked items", () => {
    const items = [
      makeItem({ linkedMenuProductId: null, totalPrice: 70_000, quantity: 2 }),
      makeItem({ linkedMenuProductId: null, totalPrice: 35_000, quantity: 1 }),
    ];
    // No BOM data, so fallback = 35_000
    // periodGross = 105_000
    // 105_000 / 35_000 = 3
    const result = computePiecesSold(items, 105_000, [], []);
    expect(result).toBe(3);
  });

  it("uses dynamic avgRevenuePerBall from linked items for estimation", () => {
    // 1 linked item: mp_a with 1 ball, revenue = 50_000, qty = 1
    // -> avgRevenuePerBall = 50_000 / 1 = 50_000
    // 1 unlinked item: revenue = 100_000
    // periodGross = 150_000
    // total estimate = 150_000 / 50_000 = 3
    const items = [
      makeItem({ linkedMenuProductId: "mp_a", totalPrice: 50_000, quantity: 1 }),
      makeItem({ linkedMenuProductId: null, totalPrice: 100_000, quantity: 2 }),
    ];
    const bom = [makeBomComponent("mp_a", "ct_big", 1)];
    const cts = [bigBallCT, boxCT];

    const result = computePiecesSold(items, 150_000, bom, cts);
    expect(result).toBe(3);
  });
});
