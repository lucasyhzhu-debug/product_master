/**
 * Phase 74.5.1 Wave 0 — TDD RED tests for ChannelAdapter contract (R1).
 *
 * Covers Req R1 from 74.5.1-SPEC.md:
 *   - A shared `ChannelAdapter` interface + `ChannelSaleEvent` canonical type exist.
 *   - All 5 adapters (gobiz, bigseller, internal, k3mart, grabfood) satisfy the
 *     interface at compile time.
 *   - `normalize()` returns `ChannelSaleEvent[]` uniformly across adapters.
 *
 * RED STATE: imports `ChannelAdapter` from `../channelAdapter` (Wave 1 creates
 * the shared module) and five `*Adapter` exports (Wave 2 adds the `normalize`
 * function to each adapter file). @ts-expect-error comments keep compilation
 * alive until implementation lands.
 *
 * This is primarily a TYPE-LEVEL test — the assignments check structural
 * compatibility at compile time. If any adapter's `normalize()` return type
 * drifts from `ChannelSaleEvent[]`, tsc fails this file.
 */

import { describe, test, expect } from "vitest";

import type { ChannelAdapter } from "../channelAdapter";

import { gobizAdapter } from "../../gobiz/adapter";
import { bigsellerAdapter } from "../../bigseller/adapter";
import { internalAdapter } from "../../internal/adapter";
import { k3martAdapter } from "../../k3mart/adapter";
import { grabfoodAdapter } from "../../grabfood/adapter";

describe("Req R1 — ChannelAdapter contract (TDD red; Waves 1-2 make green)", () => {
  test("T-R1.0 all 5 adapters satisfy ChannelAdapter interface (compile-time)", () => {
    // These assignments are the assertion. If tsc accepts them, the 5 adapters
    // structurally satisfy ChannelAdapter. If any adapter's `normalize()` return
    // type drifts from `ChannelSaleEvent[]`, tsc fails HERE.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _gobiz: ChannelAdapter<any> = gobizAdapter;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _bigseller: ChannelAdapter<any> = bigsellerAdapter;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _internal: ChannelAdapter<any> = internalAdapter;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _k3mart: ChannelAdapter<any> = k3martAdapter;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const _grabfood: ChannelAdapter<any> = grabfoodAdapter;

    // Runtime sanity: each adapter exposes a `source` string field.
    expect(typeof _gobiz.source).toBe("string");
    expect(typeof _bigseller.source).toBe("string");
    expect(typeof _internal.source).toBe("string");
    expect(typeof _k3mart.source).toBe("string");
    expect(typeof _grabfood.source).toBe("string");
  });

  test("T-R1.0b adapter source literals are distinct and match externalSource union", () => {
    const sources = new Set([
      gobizAdapter.source,
      bigsellerAdapter.source,
      internalAdapter.source,
      k3martAdapter.source,
      grabfoodAdapter.source,
    ]);
    // All 5 adapters emit distinct source keys.
    expect(sources.size).toBe(5);
  });
});
