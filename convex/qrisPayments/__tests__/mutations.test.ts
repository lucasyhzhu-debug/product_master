/**
 * Phase 84 Wave 0 — TDD RED tests for qrisPayments CRUD mutations (R2).
 *
 *   - insertPending creates ONE pending row linked to the order.
 *   - expirePrior flips a prior pending row to "expired".
 *   - getActiveQrisPayment returns the latest non-expired row.
 *
 * Invoked via `t.run` / internal mutations (NOT `t.action(internal.*)` — Pitfall 5).
 *
 * RED STATE: references `internal.qrisPayments.mutations.*` /
 * `internal.qrisPayments.queries.*` which do not exist until Plan 03 (84-03),
 * and the `qrisPayments` table (Plan 02). DO NOT stub the implementation.
 */

import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "../../schema";
import { internal } from "../../_generated/api";
import { makeAwaitingPaymentOrder } from "./_factory";

const modules = import.meta.glob("../../**/*.ts");

describe("qrisPayments mutations (R2)", () => {
  it("insertPending creates exactly one pending row linked to the order", async () => {
    const t = convexTest(schema, modules);
    const seed = await makeAwaitingPaymentOrder(t);

    await t.mutation(internal.qrisPayments.mutations.insertPending, {
      orderId: seed.orderId,
      externalId: "0521-001",
      xenditQrId: "qr_test_abc123",
      qrString: "00020101021226TESTQR",
      amount: 35000,
      expiresAt: Date.now() + 30 * 60 * 1000,
    });

    const rows = await t.run((ctx) =>
      ctx.db
        .query("qrisPayments")
        .withIndex("by_order", (q) => q.eq("orderId", seed.orderId))
        .collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].orderId).toBe(seed.orderId);
  });

  it("expirePrior flips an existing pending row to expired", async () => {
    const t = convexTest(schema, modules);
    const seed = await makeAwaitingPaymentOrder(t);

    await t.mutation(internal.qrisPayments.mutations.insertPending, {
      orderId: seed.orderId,
      externalId: "0521-001",
      xenditQrId: "qr_test_aaa",
      qrString: "QR_A",
      amount: 35000,
      expiresAt: Date.now() + 30 * 60 * 1000,
    });

    await t.mutation(internal.qrisPayments.mutations.expirePrior, {
      orderId: seed.orderId,
    });

    const rows = await t.run((ctx) =>
      ctx.db
        .query("qrisPayments")
        .withIndex("by_order", (q) => q.eq("orderId", seed.orderId))
        .collect(),
    );
    expect(rows.every((r) => r.status === "expired")).toBe(true);
  });

  it("getActiveQrisPayment returns the latest non-expired row", async () => {
    const t = convexTest(schema, modules);
    const seed = await makeAwaitingPaymentOrder(t);

    // Prior pending row, then supersede + insert a fresh one.
    await t.mutation(internal.qrisPayments.mutations.insertPending, {
      orderId: seed.orderId,
      externalId: "0521-001",
      xenditQrId: "qr_old",
      qrString: "QR_OLD",
      amount: 35000,
      expiresAt: Date.now() + 30 * 60 * 1000,
    });
    await t.mutation(internal.qrisPayments.mutations.expirePrior, { orderId: seed.orderId });
    await t.mutation(internal.qrisPayments.mutations.insertPending, {
      orderId: seed.orderId,
      externalId: "0521-001",
      xenditQrId: "qr_new",
      qrString: "QR_NEW",
      amount: 35000,
      expiresAt: Date.now() + 30 * 60 * 1000,
    });

    const active = await t.query(internal.qrisPayments.queries.getActiveQrisPaymentInternal, {
      orderId: seed.orderId,
    });
    expect(active?.status).toBe("pending");
    expect(active?.xenditQrId).toBe("qr_new");
  });
});
