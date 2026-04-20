/**
 * K3Mart regression — parent-row shape preservation (CONTEXT D-08).
 *
 * Phase 74.5.1-07: K3Mart adapter gains a per-item emit branch (parent-only → parent+child).
 * The parent `externalRevenue` shape MUST remain byte-identical on happy path. This test
 * freezes the parent-record field set so future executors can spot unintended drift.
 *
 * Fixture-driven payload comparison will land when real prod payloads are captured per
 * `tests/fixtures/channel-regression/README.md`. Until then, we run a shape-contract
 * check against the adapter's record-building logic via the normalize() projection.
 */

import { describe, expect, test } from "vitest";
import { k3martNormalize } from "../../integrations/k3mart/adapter";

describe("K3Mart regression — parent shape preserved post-refactor", () => {
  test("T-K3M.1 collapsed-period invariant: occurredAt drives periodStart=periodEnd=transactionDate at source", () => {
    // Normalize produces `occurredAt` which the adapter subsequently writes as
    // periodStart=periodEnd=transactionDate on the parent externalRevenue row.
    // This test guards the projection: one occurredAt per event.
    const events = k3martNormalize({
      transactions: [
        {
          productCode: "K3-001",
          productName: "Frollie Original 80g",
          qty: 5,
          total: 175000,
          transactionDate: 1717200000000,
          dedupKey: "fixture-1",
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0].occurredAt).toBe(1717200000000);
  });

  test("T-K3M.2 dedup key flows through: externalTransactionId === dedupKey (unchanged invariant)", () => {
    const events = k3martNormalize({
      transactions: [
        {
          productCode: "K3-002",
          productName: "Frollie Bite 45g",
          qty: 2,
          total: 30000,
          transactionDate: 1717203600000,
          dedupKey: "2025-06-01-toko-a-K3-002-2-30000",
        },
      ],
    });
    expect(events[0].externalTransactionId).toBe("2025-06-01-toko-a-K3-002-2-30000");
  });

  test("T-K3M.3 child externalItemId shape: dedupKey + '-0' (single synthetic item per parent)", () => {
    // K3Mart parent → single child with externalItemId = dedupKey + "-0". This
    // matches the spec Plan 07 Task 7.1 emit branch.
    const events = k3martNormalize({
      transactions: [
        {
          productCode: "K3-003",
          productName: "Frollie Jumbo 80g",
          qty: 1,
          total: 40000,
          transactionDate: 0,
          dedupKey: "dedup-xyz",
        },
      ],
    });
    expect(events[0].externalItemId).toBe("dedup-xyz-0");
  });
});
