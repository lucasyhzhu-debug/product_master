/**
 * Phase 84 Plan 04 — handler-level test suite for the Xendit QRIS webhook
 * (staffreview C6). Asserts at the handler level, not just the pure
 * verifyCallbackToken fn:
 *
 *   (a) missing/invalid token   → 401 AND recordPaidAndTransition NOT invoked
 *   (b) valid + non-COMPLETED   → 200, mutation NOT invoked
 *   (c) valid + COMPLETED       → 200, mutation invoked exactly once with
 *                                 { xenditQrId, externalId, amount, receiptId,
 *                                   source, rawPayload }
 *   (d) valid + COMPLETED that the mutation reports unmatched ({transitioned:false})
 *                               → 200, no throw
 *
 * `httpAction` cannot be invoked via `t.action(internal.*)` (RESEARCH Pitfall 5),
 * so we test `processWebhook(deps, ...)` with an injectable runMutation spy —
 * the exact dependency surface the real httpAction wires `ctx.runMutation` into.
 */

import { describe, it, expect, vi } from "vitest";
import { handleXenditQrPayment, processWebhook } from "../webhooks";

const TOKEN = "whtok_test_abc123";

const completedBody = JSON.stringify({
  status: "COMPLETED",
  amount: 35000,
  reference_id: "0521-001",
  qr_id: "qr_live_xyz",
  payment_details: { receipt_id: "RRN12345", source: "DANA" },
});

describe("processWebhook (handler-level, staffreview C6)", () => {
  it("(a) missing token → 401 AND recordPaidAndTransition NOT invoked", async () => {
    const runMutation = vi.fn().mockResolvedValue({ transitioned: true });
    const result = await processWebhook({ runMutation }, null, completedBody, TOKEN);
    expect(result.status).toBe(401);
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("(a) invalid token → 401 AND recordPaidAndTransition NOT invoked", async () => {
    const runMutation = vi.fn().mockResolvedValue({ transitioned: true });
    const result = await processWebhook({ runMutation }, "whtok_test_WRONGXX", completedBody, TOKEN);
    expect(result.status).toBe(401);
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("(a) missing config (XENDIT_WEBHOOK_TOKEN undefined) → 401, no mutation", async () => {
    const runMutation = vi.fn().mockResolvedValue({ transitioned: true });
    const result = await processWebhook({ runMutation }, TOKEN, completedBody, undefined);
    expect(result.status).toBe(401);
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("(b) valid token + non-COMPLETED → 200, mutation NOT invoked", async () => {
    const runMutation = vi.fn().mockResolvedValue({ transitioned: false });
    const body = JSON.stringify({ status: "ACTIVE", amount: 35000, reference_id: "0521-001" });
    const result = await processWebhook({ runMutation }, TOKEN, body, TOKEN);
    expect(result.status).toBe(200);
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("(c) valid token + COMPLETED → 200, mutation invoked once with the parsed args", async () => {
    const runMutation = vi.fn().mockResolvedValue({ transitioned: true });
    const result = await processWebhook({ runMutation }, TOKEN, completedBody, TOKEN);
    expect(result.status).toBe(200);
    expect(runMutation).toHaveBeenCalledTimes(1);
    expect(runMutation).toHaveBeenCalledWith({
      xenditQrId: "qr_live_xyz", // primary match key (C8)
      externalId: "0521-001", // fallback (A4)
      amount: 35000,
      receiptId: "RRN12345",
      source: "DANA",
      rawPayload: completedBody,
    });
  });

  it("(c) defensively unwraps a { event, data } envelope (A2)", async () => {
    const runMutation = vi.fn().mockResolvedValue({ transitioned: true });
    const body = JSON.stringify({
      event: "qr.payment",
      data: {
        status: "COMPLETED",
        amount: 35000,
        id: "qr_via_id", // no qr_id → fall back to id
        external_id: "0521-002", // no reference_id → fall back to external_id
      },
    });
    const result = await processWebhook({ runMutation }, TOKEN, body, TOKEN);
    expect(result.status).toBe(200);
    expect(runMutation).toHaveBeenCalledTimes(1);
    expect(runMutation).toHaveBeenCalledWith(
      expect.objectContaining({ xenditQrId: "qr_via_id", externalId: "0521-002", amount: 35000 }),
    );
  });

  it("(d) valid + COMPLETED but unmatched ({transitioned:false}) → 200, no throw", async () => {
    const runMutation = vi.fn().mockResolvedValue({ transitioned: false });
    const result = await processWebhook({ runMutation }, TOKEN, completedBody, TOKEN);
    expect(result.status).toBe(200);
    expect(runMutation).toHaveBeenCalledTimes(1);
  });

  it("(d) a mutation throw is caught — never escapes as a 500", async () => {
    const runMutation = vi.fn().mockRejectedValue(new Error("boom"));
    const result = await processWebhook({ runMutation }, TOKEN, completedBody, TOKEN);
    expect(result.status).toBe(200);
    expect(runMutation).toHaveBeenCalledTimes(1);
  });

  it("invalid JSON body with a valid token → 200, no mutation (no 500)", async () => {
    const runMutation = vi.fn().mockResolvedValue({ transitioned: false });
    const result = await processWebhook({ runMutation }, TOKEN, "not-json{{{", TOKEN);
    expect(result.status).toBe(200);
    expect(runMutation).not.toHaveBeenCalled();
  });
});

// ─── Security review hardening ───────────────────────────────────────────────

const FWD = "fwd_secret_deadbeefcafebabe";

describe("processWebhook — refund deny-gate (HIGH-2)", () => {
  it("a SUCCEEDED refund event does NOT record payment (event name gate)", async () => {
    const runMutation = vi.fn().mockResolvedValue({ transitioned: true });
    const body = JSON.stringify({
      event: "qr.refund.succeeded",
      data: { status: "SUCCEEDED", amount: 35000, qr_id: "qr_live_xyz", reference_id: "0521-001" },
    });
    const result = await processWebhook({ runMutation }, TOKEN, body, TOKEN);
    expect(result.status).toBe(200);
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("a genuine qr.payment SUCCEEDED still records (gate is refund-specific)", async () => {
    const runMutation = vi.fn().mockResolvedValue({ transitioned: true });
    const body = JSON.stringify({
      event: "qr.payment",
      data: { status: "SUCCEEDED", amount: 35000, qr_id: "qr_live_xyz", reference_id: "0521-001" },
    });
    const result = await processWebhook({ runMutation }, TOKEN, body, TOKEN);
    expect(result.status).toBe(200);
    expect(runMutation).toHaveBeenCalledTimes(1);
  });
});

describe("processWebhook — forward-secret gate (MEDIUM-3)", () => {
  it("when configured, a missing forward secret → 401, no mutation", async () => {
    const runMutation = vi.fn().mockResolvedValue({ transitioned: true });
    const result = await processWebhook({ runMutation }, TOKEN, completedBody, TOKEN, {
      forwardSecret: null,
      expectedForwardSecret: FWD,
    });
    expect(result.status).toBe(401);
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("when configured, a wrong forward secret → 401, no mutation", async () => {
    const runMutation = vi.fn().mockResolvedValue({ transitioned: true });
    const result = await processWebhook({ runMutation }, TOKEN, completedBody, TOKEN, {
      forwardSecret: "fwd_secret_WRONGWRONGWRONG",
      expectedForwardSecret: FWD,
    });
    expect(result.status).toBe(401);
    expect(runMutation).not.toHaveBeenCalled();
  });

  it("when configured, the correct forward secret → 200, mutation invoked", async () => {
    const runMutation = vi.fn().mockResolvedValue({ transitioned: true });
    const result = await processWebhook({ runMutation }, TOKEN, completedBody, TOKEN, {
      forwardSecret: FWD,
      expectedForwardSecret: FWD,
    });
    expect(result.status).toBe(200);
    expect(runMutation).toHaveBeenCalledTimes(1);
  });

  it("when NOT configured (undefined), the gate is skipped (backward-compatible)", async () => {
    const runMutation = vi.fn().mockResolvedValue({ transitioned: true });
    const result = await processWebhook({ runMutation }, TOKEN, completedBody, TOKEN, {
      forwardSecret: null,
      expectedForwardSecret: undefined,
    });
    expect(result.status).toBe(200);
    expect(runMutation).toHaveBeenCalledTimes(1);
  });
});

describe("handleXenditQrPayment export", () => {
  it("is registered as an httpAction (callable handler)", () => {
    expect(handleXenditQrPayment).toBeDefined();
  });
});
