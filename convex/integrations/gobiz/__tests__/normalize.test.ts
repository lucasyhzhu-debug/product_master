/**
 * Phase 74.5.1 Wave 0 — TDD RED tests for GoBiz adapter normalize() (R1).
 *
 * Covers Req R1 per-adapter shape check:
 *   - `normalize()` with empty payload returns [].
 *   - `normalize()` with canonical payload returns >=1 ChannelSaleEvent with
 *     the correct source="gobiz" literal.
 *
 * RED STATE: Wave 2 adds `normalize()` to gobiz adapter. Until then this file
 * imports a non-existent symbol and fails "Cannot find module" at vitest runtime.
 * @ts-expect-error comments keep tsc happy.
 */

import { describe, test, expect } from "vitest";

// @ts-expect-error — ChannelSaleEvent added in Wave 1 shared module
import type { ChannelSaleEvent } from "../../_shared/channelAdapter";
// @ts-expect-error — gobizAdapter gains `normalize()` method in Wave 2
import { gobizAdapter } from "../adapter";

describe("Req R1 — gobiz normalize() (TDD red; Wave 2 makes green)", () => {
  test("T-R1.gobiz.1 empty payload returns []", async () => {
    const events: ChannelSaleEvent[] = await gobizAdapter.normalize({ orders: [] });
    expect(events).toEqual([]);
  });

  test("T-R1.gobiz.2 canonical GoFood payload returns >=1 ChannelSaleEvent", async () => {
    // Canonical GoBiz (GoFood) sale shape — plan executor will refine fixture
    // in Wave 2. Today it's a skeleton: the test simply expects the adapter to
    // emit a non-empty array of events when given a plausibly-shaped payload.
    const fixture = {
      orders: [
        {
          orderId: "GF-0001",
          completedAt: 1_700_000_000_000,
          outletId: "outlet-gf-1",
          items: [
            { sku: "PROD-GF-1", quantity: 2, unitPrice: 25000, totalPrice: 50000 },
          ],
        },
      ],
    };

    const events: ChannelSaleEvent[] = await gobizAdapter.normalize(fixture);
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  test("T-R1.gobiz.3 every event has source=gobiz", async () => {
    const fixture = {
      orders: [
        {
          orderId: "GF-0002",
          completedAt: 1_700_000_100_000,
          outletId: "outlet-gf-1",
          items: [{ sku: "PROD-GF-1", quantity: 1, unitPrice: 25000, totalPrice: 25000 }],
        },
      ],
    };
    const events: ChannelSaleEvent[] = await gobizAdapter.normalize(fixture);
    for (const e of events) {
      expect(e.source).toBe("gobiz");
    }
  });
});
