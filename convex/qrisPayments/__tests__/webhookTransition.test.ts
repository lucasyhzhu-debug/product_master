/**
 * Phase 84 Wave 0 — TDD RED tests for the webhook paid-transition (R4b / R4c).
 *
 * Two layers:
 *   A) Pure `decideWebhookOutcome(order, row, payload)` cases — testable without a
 *      live runtime, sidestepping the convex-test `t.action(internal.*)` resolver bug
 *      (RESEARCH Pitfall 5).
 *   B) An integration block that drives the real `recordPaidAndTransition` internal
 *      mutation TWICE and asserts the reserved quantity decrements EXACTLY ONCE
 *      (non-vacuous idempotency — staffreview C5), plus an unmatched-COMPLETED no-op.
 *
 * RED STATE: imports `{ decideWebhookOutcome }` from `../mutations` (Plan 03) and
 * uses `makeQrisPayment` (qrisPayments table added in Plan 02). Until then the suite
 * fails to resolve `../mutations` / cannot insert `qrisPayments`. DO NOT stub.
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { internal } from "../../_generated/api";
import { decideWebhookOutcome } from "../mutations";
import {
  makeAwaitingPaymentOrder,
  makeQrisPayment,
  readReservedQty,
} from "./_factory";

// convex-test module-resolution glob. Absolute-root form: a relative
// "../../**/*.ts" glob from inside convex/qrisPayments/ collapses
// "../../qrisPayments/mutations.ts" → "../mutations.ts", which convex-test cannot
// map to the `qrisPayments/mutations` function ref (RESEARCH Pitfall 5). Globbing
// from /convex keeps keys canonical.
const modules = import.meta.glob("/convex/**/*.ts");

// ---------------------------------------------------------------------------
// A) Pure decideWebhookOutcome cases (R4b / R4c) — no runtime needed.
// ---------------------------------------------------------------------------
describe("decideWebhookOutcome (R4b/R4c — pure)", () => {
  const pendingRow = { amount: 35000, status: "pending" };

  it("AwaitingPayment + amount match + pending row → transition, recordPaid, no review", () => {
    const out = decideWebhookOutcome(
      { status: "AwaitingPayment" },
      pendingRow,
      { amount: 35000 },
    );
    expect(out.transition).toBe(true);
    expect(out.recordPaid).toBe(true);
    expect(out.needsReview).toBe(false);
  });

  it("PaymentReceived (replay) → no transition (idempotency)", () => {
    const out = decideWebhookOutcome(
      { status: "PaymentReceived" },
      pendingRow,
      { amount: 35000 },
    );
    expect(out.transition).toBe(false);
  });

  it("amount mismatch → needsReview + recordPaid, reason mentions amount", () => {
    const out = decideWebhookOutcome(
      { status: "AwaitingPayment" },
      { amount: 35000, status: "pending" },
      { amount: 30000 },
    );
    expect(out.needsReview).toBe(true);
    expect(out.recordPaid).toBe(true);
    expect(out.reason).toMatch(/amount/i);
  });

  it("superseded/expired row → needsReview + recordPaid, reason mentions superseded", () => {
    const out = decideWebhookOutcome(
      { status: "AwaitingPayment" },
      { amount: 35000, status: "expired" },
      { amount: 35000 },
    );
    expect(out.needsReview).toBe(true);
    expect(out.recordPaid).toBe(true);
    expect(out.reason).toMatch(/superseded/i);
  });

  it("BOTH amount-mismatch AND superseded → reason contains BOTH signals (staffreview C7)", () => {
    const out = decideWebhookOutcome(
      { status: "AwaitingPayment" },
      { amount: 35000, status: "expired" },
      { amount: 30000 },
    );
    expect(out.needsReview).toBe(true);
    expect(out.recordPaid).toBe(true);
    expect(out.reason).toMatch(/amount/i);
    expect(out.reason).toMatch(/superseded/i);
  });
});

// ---------------------------------------------------------------------------
// B) Integration: recordPaidAndTransition reserves EXACTLY ONCE (R4b idempotency).
//    Non-vacuous: reads reserved qty before/after via the inventory-seeding factory.
// ---------------------------------------------------------------------------
describe("recordPaidAndTransition (R4b — non-vacuous idempotency)", () => {
  it("first COMPLETED transitions to PaymentReceived and reserves expectedReserveQty; replay leaves both unchanged", async () => {
    const t = convexTest(schema, modules);
    const seed = await makeAwaitingPaymentOrder(t, { orderNumber: "0521-001", finalTotal: 35000 });
    await makeQrisPayment(t, {
      orderId: seed.orderId,
      externalId: "0521-001",
      xenditQrId: "qr_test_abc123",
      amount: 35000,
      status: "pending",
    });

    const reservedBefore = await readReservedQty(t, seed.locationId, seed.packagingComponentTypeId);

    // First COMPLETED callback.
    await t.mutation(internal.qrisPayments.mutations.recordPaidAndTransition, {
      externalId: "0521-001",
      amount: 35000,
    });

    const orderAfterFirst = await t.run((ctx) => ctx.db.get(seed.orderId));
    expect(orderAfterFirst?.status).toBe("PaymentReceived");
    // paymentStatus must flip to "Paid" on the payment-received transition
    // (triple-review I1 — was left "Unpaid" despite money arriving).
    expect(orderAfterFirst?.paymentStatus).toBe("Paid");
    // paymentMethod stamped "QRIS" so reporting can separate QRIS from bank transfer.
    expect(orderAfterFirst?.paymentMethod).toBe("QRIS");

    const reservedAfterFirst = await readReservedQty(t, seed.locationId, seed.packagingComponentTypeId);
    // Reserve actually decremented stock by the order's packaging requirement.
    expect(reservedAfterFirst - reservedBefore).toBe(seed.expectedReserveQty);

    // Replayed (duplicate) COMPLETED callback.
    await t.mutation(internal.qrisPayments.mutations.recordPaidAndTransition, {
      externalId: "0521-001",
      amount: 35000,
    });

    const orderAfterReplay = await t.run((ctx) => ctx.db.get(seed.orderId));
    expect(orderAfterReplay?.status).toBe("PaymentReceived");

    const reservedAfterReplay = await readReservedQty(t, seed.locationId, seed.packagingComponentTypeId);
    // UNCHANGED vs after the first call — reserved exactly once (NOT a 0===0 vacuous pass).
    expect(reservedAfterReplay).toBe(reservedAfterFirst);
  });

  it("unmatched COMPLETED (no qrisPayments row matches) → { transitioned: false }, throws nothing, order untouched (staffreview C4)", async () => {
    const t = convexTest(schema, modules);
    const seed = await makeAwaitingPaymentOrder(t, { orderNumber: "0521-002", finalTotal: 35000 });

    const result = await t.mutation(internal.qrisPayments.mutations.recordPaidAndTransition, {
      externalId: "does-not-exist-9999",
      amount: 35000,
    });

    expect(result).toEqual({ transitioned: false });
    const order = await t.run((ctx) => ctx.db.get(seed.orderId));
    expect(order?.status).toBe("AwaitingPayment");
  });
});
