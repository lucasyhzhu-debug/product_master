/**
 * Phase 74.5.1 Wave 0 — TDD RED tests for K3Mart adapter normalize() (R1).
 *
 * Covers Req R1 per-adapter shape check for K3Mart source.
 *
 * Important context (RESEARCH §Migration Matrix Row 5):
 *   - K3Mart writes revenue via `saveRevenue` today (parent-only, zero child
 *     externalRevenueItems).
 *   - 74.5.1 adds NEW child emission via `saveRevenueItems` in addition to the
 *     existing parent write. Normalize() must produce one ChannelSaleEvent per
 *     K3Mart transaction item.
 *
 * RED STATE: Wave 2 adds `normalize()` to k3mart adapter.
 */

import { describe, test, expect } from "vitest";

// @ts-expect-error — ChannelSaleEvent added in Wave 1
import type { ChannelSaleEvent } from "../../_shared/channelAdapter";
// @ts-expect-error — k3martAdapter.normalize() added in Wave 2
import { k3martAdapter } from "../adapter";

describe("Req R1 — k3mart normalize() (TDD red; Wave 2 makes green)", () => {
  test("T-R1.k3mart.1 empty payload returns []", async () => {
    const events: ChannelSaleEvent[] = await k3martAdapter.normalize({ transactions: [] });
    expect(events).toEqual([]);
  });

  test("T-R1.k3mart.2 canonical K3Mart sync payload returns >=1 ChannelSaleEvent", async () => {
    const fixture = {
      transactions: [
        {
          transactionId: "K3-0001",
          transactionDate: 1_700_000_000_000,
          outletExternalId: "k3-outlet-1",
          items: [{ productCode: "K3-PROD-1", quantity: 2, unitPrice: 15000, totalPrice: 30000 }],
        },
      ],
    };
    const events: ChannelSaleEvent[] = await k3martAdapter.normalize(fixture);
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  test("T-R1.k3mart.3 every event has source=k3mart", async () => {
    const fixture = {
      transactions: [
        {
          transactionId: "K3-0002",
          transactionDate: 1_700_000_100_000,
          outletExternalId: "k3-outlet-1",
          items: [{ productCode: "K3-PROD-1", quantity: 1, unitPrice: 15000, totalPrice: 15000 }],
        },
      ],
    };
    const events: ChannelSaleEvent[] = await k3martAdapter.normalize(fixture);
    for (const e of events) {
      expect(e.source).toBe("k3mart");
    }
  });
});
