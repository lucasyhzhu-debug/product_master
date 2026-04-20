/**
 * Req R1 — Grabfood adapter normalize() contract test.
 *
 * Per D74.5.1-L5: grabfood ships as a stub. orders:read OAuth scope is blocked —
 * cannot fetch per-order item detail. normalize() must throw `Not implemented`.
 *
 * Plan: 74.5.1-07 Task 7.2 (Wave 2). Tests first (TDD RED), then stub green.
 */

import { describe, expect, test } from "vitest";
import type { ChannelAdapter } from "../../_shared/channelAdapter";
import {
  grabfoodAdapter,
  grabfoodNormalize,
  type GrabfoodRawBatch,
} from "../adapter";

describe("Req R1 — grabfoodAdapter (stub per D74.5.1-L5)", () => {
  test("T-R1.grabfood.contract: grabfoodAdapter type-satisfies ChannelAdapter", () => {
    const _adapter: ChannelAdapter<GrabfoodRawBatch> = grabfoodAdapter;
    expect(_adapter.source).toBe("grabfood");
    expect(typeof _adapter.normalize).toBe("function");
  });

  test("T-R1.grabfood.stub: normalize() throws 'Not implemented' — orders:read scope blocker", () => {
    expect(() => grabfoodNormalize({ _placeholder: true })).toThrow(
      /Not implemented/,
    );
    expect(() => grabfoodNormalize({ _placeholder: true })).toThrow(
      /orders:read OAuth scope/,
    );
  });

  test("T-R1.grabfood.stub: adapter.normalize() also throws (contract symmetry)", () => {
    expect(() =>
      (grabfoodAdapter.normalize as (p: GrabfoodRawBatch) => unknown)({
        _placeholder: true,
      }),
    ).toThrow(/D74.5.1-L5/);
  });
});
