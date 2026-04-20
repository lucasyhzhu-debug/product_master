/**
 * Phase 74.5.1 Wave 0 — TDD RED tests for internal adapter normalize() (R1).
 *
 * Covers Req R1 per-adapter shape check for internal (direct-order) source.
 *
 * Per D74.5.1-L2: the `internal` feature flag stays permanent OFF in 74.5.1/2
 * (reserveStockForOrderInternal is authoritative). The adapter still emits
 * normalized events for shape consistency, but saveRevenueItems will skip
 * deduction. This test verifies the `normalize()` shape only.
 *
 * RED STATE: Wave 2 adds `normalize()` to internal adapter.
 */

import { describe, test, expect } from "vitest";

// @ts-expect-error — ChannelSaleEvent added in Wave 1
import type { ChannelSaleEvent } from "../../_shared/channelAdapter";
// @ts-expect-error — internalAdapter.normalize() added in Wave 2
import { internalAdapter } from "../adapter";

describe("Req R1 — internal normalize() (TDD red; Wave 2 makes green)", () => {
  test("T-R1.internal.1 empty payload returns []", async () => {
    const events: ChannelSaleEvent[] = await internalAdapter.normalize({ orders: [] });
    expect(events).toEqual([]);
  });

  test("T-R1.internal.2 canonical internal order payload returns >=1 ChannelSaleEvent", async () => {
    const fixture = {
      orders: [
        {
          orderId: "INT-0001",
          completedAt: 1_700_000_000_000,
          items: [{ menuProductId: "fake-id", quantity: 1, unitPrice: 25000, totalPrice: 25000 }],
        },
      ],
    };
    const events: ChannelSaleEvent[] = await internalAdapter.normalize(fixture);
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  test("T-R1.internal.3 every event has source=internal", async () => {
    const fixture = {
      orders: [
        {
          orderId: "INT-0002",
          completedAt: 1_700_000_100_000,
          items: [{ menuProductId: "fake-id-2", quantity: 1, unitPrice: 25000, totalPrice: 25000 }],
        },
      ],
    };
    const events: ChannelSaleEvent[] = await internalAdapter.normalize(fixture);
    for (const e of events) {
      expect(e.source).toBe("internal");
    }
  });
});
