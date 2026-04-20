/**
 * Req R1 — K3Mart adapter normalize() contract test.
 *
 * Covers: adapter exports `k3martAdapter: ChannelAdapter` whose `normalize()` projects
 * K3Mart sync transactions to canonical `ChannelSaleEvent[]`.
 *
 * Plan: 74.5.1-07 (Wave 2). Tests are written first (TDD RED) then driven green by the refactor.
 */

import { describe, expect, test } from "vitest";
import type { ChannelAdapter } from "../../_shared/channelAdapter";
import type { ChannelSaleEvent } from "../../_shared/channelSaleEvent";
import {
  k3martAdapter,
  k3martNormalize,
  type K3martRawBatch,
} from "../adapter";

describe("Req R1 — k3martAdapter conforms to ChannelAdapter", () => {
  test("T-R1.k3mart.contract: k3martAdapter type-satisfies ChannelAdapter", () => {
    // Compile-time + runtime contract check.
    const _adapter: ChannelAdapter<K3martRawBatch> = k3martAdapter;
    expect(_adapter.source).toBe("k3mart");
    expect(typeof _adapter.normalize).toBe("function");
  });

  test("T-R1.k3mart.1: normalize() with empty transactions returns []", () => {
    const events = k3martNormalize({ transactions: [] });
    expect(Array.isArray(events)).toBe(true);
    expect(events).toHaveLength(0);
  });

  test("T-R1.k3mart.2: normalize() with canonical payload produces ChannelSaleEvent shape", () => {
    const events = k3martNormalize({
      transactions: [
        {
          productCode: "K3-001",
          productName: "Frollie Original 80g",
          qty: 5,
          total: 175000,
          transactionDate: 1717200000000,
          dedupKey: "dedup-abc",
        },
      ],
    });
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.source).toBe("k3mart");
    expect(ev.occurredAt).toBe(1717200000000);
    expect(ev.externalTransactionId).toBe("dedup-abc");
    expect(ev.externalItemId).toBe("dedup-abc-0");
    expect(ev.quantity).toBe(5);
    expect(ev.unitPrice).toBe(35000);
    expect(ev.totalPrice).toBe(175000);
    expect(ev.externalProductCode).toBe("K3-001");
    expect(ev.externalProductName).toBe("Frollie Original 80g");
  });

  test("T-R1.k3mart.3: normalize() skips zero-qty transactions (malformed)", () => {
    const events = k3martNormalize({
      transactions: [
        {
          productCode: "K3-001",
          productName: "Frollie Original 80g",
          qty: 0,
          total: 0,
          transactionDate: 1717200000000,
          dedupKey: "dedup-zero",
        },
        {
          productCode: "K3-002",
          productName: "Frollie Bite 45g",
          qty: 3,
          total: 45000,
          transactionDate: 1717200000000,
          dedupKey: "dedup-valid",
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0].externalTransactionId).toBe("dedup-valid");
  });

  test("T-R1.k3mart.4: normalize() event.source literal === 'k3mart'", () => {
    const events: ChannelSaleEvent[] = k3martNormalize({
      transactions: [
        {
          productCode: "X",
          productName: "X",
          qty: 1,
          total: 1000,
          transactionDate: 0,
          dedupKey: "k",
        },
      ],
    });
    for (const ev of events) {
      expect(ev.source).toBe("k3mart");
    }
  });
});
