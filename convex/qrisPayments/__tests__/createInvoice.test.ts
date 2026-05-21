/**
 * Phase 84 Wave 0 — TDD RED tests for the create-invoice state guards (R3).
 *
 *   - non-AwaitingPayment order → throws AND writes nothing (no qrisPayments row).
 *   - finalTotal < 1500 (Xendit floor) → rejected.
 *
 * Exercises the internal query/mutation pieces via `t.run` / internal mutations,
 * NOT `t.action(internal.*)` (RESEARCH Pitfall 5 — convex-test resolver bug).
 *
 * RED STATE: references `internal.qrisPayments.mutations.*` (Plan 03) and the
 * `qrisPayments` table (Plan 02). DO NOT stub the implementation.
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { internal } from "../../_generated/api";
import { makeAwaitingPaymentOrder } from "./_factory";

// Absolute-root glob — see mutations.test.ts: Vite collapses the same-dir paths
// so convex-test cannot resolve `qrisPayments/*` function refs (RESEARCH Pitfall 5).
const modules = import.meta.glob("/convex/**/*.ts");

describe("createInvoice guards (R3)", () => {
  it("throws and writes nothing when the order is not AwaitingPayment", async () => {
    const t = convexTest(schema, modules);
    const seed = await makeAwaitingPaymentOrder(t);
    // Flip the order out of AwaitingPayment.
    await t.run((ctx) => ctx.db.patch(seed.orderId, { status: "PaymentReceived" }));

    await expect(
      t.mutation(internal.qrisPayments.mutations.insertPending, {
        orderId: seed.orderId,
        externalId: "0521-001",
        xenditQrId: "qr_test",
        qrString: "QR",
        amount: 35000,
        expiresAt: Date.now() + 30 * 60 * 1000,
        requireAwaitingPayment: true,
      }),
    ).rejects.toThrow();

    const rows = await t.run((ctx) =>
      ctx.db
        .query("qrisPayments")
        .withIndex("by_order", (q) => q.eq("orderId", seed.orderId))
        .collect(),
    );
    expect(rows).toHaveLength(0);
  });

  it("rejects a finalTotal below the Xendit floor of 1500 IDR", async () => {
    const t = convexTest(schema, modules);
    const seed = await makeAwaitingPaymentOrder(t, { finalTotal: 1000 });

    await expect(
      t.mutation(internal.qrisPayments.mutations.insertPending, {
        orderId: seed.orderId,
        externalId: "0521-001",
        xenditQrId: "qr_test",
        qrString: "QR",
        amount: 1000,
        expiresAt: Date.now() + 30 * 60 * 1000,
        requireAwaitingPayment: true,
      }),
    ).rejects.toThrow();

    const rows = await t.run((ctx) =>
      ctx.db
        .query("qrisPayments")
        .withIndex("by_order", (q) => q.eq("orderId", seed.orderId))
        .collect(),
    );
    expect(rows).toHaveLength(0);
  });
});
