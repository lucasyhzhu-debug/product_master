/**
 * Phase 74.5.1 Wave 0 — TDD RED tests for BigSeller adapter normalize() (R1).
 *
 * Covers Req R1 per-adapter shape check:
 *   - `normalize()` with empty payload returns [].
 *   - `normalize()` with canonical payload returns events whose `source` matches
 *     the actual platform (shopee or tiktok — per CLAUDE.md / memory note: use
 *     actual platform, NOT aggregator name).
 *
 * Per D74.5.1-L1 (RESEARCH Pitfall 3): BigSeller is aggregate-only; the
 * `bigseller` source is retained in the union but the flag stays permanent-OFF.
 * BigSeller adapter typically splits payloads into shopee + tiktok events.
 *
 * RED STATE: Wave 2 adds `normalize()` to bigseller adapter.
 */

import { describe, test, expect } from "vitest";

import type { ChannelSaleEvent } from "../../_shared/channelSaleEvent";
import type { ExternalSource } from "../../../lib/externalSource";
import { bigsellerAdapter } from "../adapter";

// Plan 74.5.2-01 Task 2 / D74.5.2-L2: tighten platform literal to the
// ExternalSource union rather than a free string. BigSeller's raw orders
// carry a platform that MUST be a member of ExternalSource restricted to
// the child sources BigSeller aggregates (shopee / tiktok / bigseller).
// Using `Extract<ExternalSource, ...>` guarantees any future rename in the
// canonical union (convex/lib/externalSource.ts) fails type-check here
// instead of silently diverging.
type BigsellerPlatform = Extract<
  ExternalSource,
  "bigseller" | "shopee" | "tiktok"
>;
type BigsellerRawOrder = {
  platform: BigsellerPlatform;
  orderId: string;
  completedAt: number;
  items: Array<{
    sku: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
};

describe("Req R1 — bigseller normalize() (TDD red; Wave 2 makes green)", () => {
  test("T-R1.bigseller.1 empty payload returns []", async () => {
    const events: ChannelSaleEvent[] = await bigsellerAdapter.normalize({ orders: [] });
    expect(events).toEqual([]);
  });

  test("T-R1.bigseller.2 canonical BigSeller payload returns >=1 ChannelSaleEvent", async () => {
    const fixture: { orders: BigsellerRawOrder[] } = {
      orders: [
        {
          platform: "shopee",
          orderId: "SH-0001",
          completedAt: 1_700_000_000_000,
          items: [{ sku: "PROD-SH-1", quantity: 1, unitPrice: 25000, totalPrice: 25000 }],
        },
      ],
    };
    const events: ChannelSaleEvent[] = await bigsellerAdapter.normalize(fixture);
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  test("T-R1.bigseller.3 events carry the actual platform source (shopee|tiktok|bigseller)", async () => {
    const fixture: { orders: BigsellerRawOrder[] } = {
      orders: [
        {
          platform: "tiktok",
          orderId: "TT-0001",
          completedAt: 1_700_000_100_000,
          items: [{ sku: "PROD-TT-1", quantity: 1, unitPrice: 15000, totalPrice: 15000 }],
        },
      ],
    };
    const events: ChannelSaleEvent[] = await bigsellerAdapter.normalize(fixture);
    for (const e of events) {
      expect(["shopee", "tiktok", "bigseller"]).toContain(e.source);
    }
  });
});
