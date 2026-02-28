/**
 * Settlement Math Tests
 *
 * Tests the pure settlement math functions used in SettlementFormDialog's live preview.
 * Mirrors the backend helpers (convex/consignment/helpers.ts) to ensure consistency.
 */
import { describe, it, expect } from "vitest";
import {
  computeSettlementPreview,
  toLocalEpoch,
  fromEpochToDateString,
} from "../settlementUtils";

describe("computeSettlementPreview", () => {
  it("computes standard 10% rev share", () => {
    const result = computeSettlementPreview(5_000_000, 10);
    expect(result.revShareAmount).toBe(500_000);
    expect(result.frolliePayment).toBe(4_500_000);
  });

  it("computes 15% rev share", () => {
    const result = computeSettlementPreview(1_000_000, 15);
    expect(result.revShareAmount).toBe(150_000);
    expect(result.frolliePayment).toBe(850_000);
  });

  it("handles zero rev share (0%)", () => {
    const result = computeSettlementPreview(1_000_000, 0);
    expect(result.revShareAmount).toBe(0);
    expect(result.frolliePayment).toBe(1_000_000);
  });

  it("handles full rev share (100%)", () => {
    const result = computeSettlementPreview(1_000_000, 100);
    expect(result.revShareAmount).toBe(1_000_000);
    expect(result.frolliePayment).toBe(0);
  });

  it("handles zero revenue", () => {
    const result = computeSettlementPreview(0, 10);
    expect(result.revShareAmount).toBe(0);
    expect(result.frolliePayment).toBe(0);
  });

  it("handles fractional percent (12.5%)", () => {
    const result = computeSettlementPreview(1_000_000, 12.5);
    expect(result.revShareAmount).toBe(125_000);
    expect(result.frolliePayment).toBe(875_000);
  });
});

describe("toLocalEpoch", () => {
  it("produces a valid epoch > 0 for a date string", () => {
    const epoch = toLocalEpoch("2026-03-15");
    expect(epoch).toBeGreaterThan(0);
  });

  it("uses local midnight (not UTC)", () => {
    const epoch = toLocalEpoch("2026-03-15");
    const d = new Date(epoch);
    // The date should be the 15th in local time
    expect(d.getDate()).toBe(15);
    expect(d.getMonth()).toBe(2); // March = 2 (0-indexed)
    expect(d.getFullYear()).toBe(2026);
    // Hours should be 0 (midnight local)
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });
});

describe("fromEpochToDateString", () => {
  it("round-trips with toLocalEpoch", () => {
    const original = "2026-03-15";
    const epoch = toLocalEpoch(original);
    const result = fromEpochToDateString(epoch);
    expect(result).toBe(original);
  });

  it("formats single-digit months and days with zero padding", () => {
    const epoch = toLocalEpoch("2026-01-05");
    const result = fromEpochToDateString(epoch);
    expect(result).toBe("2026-01-05");
  });
});
