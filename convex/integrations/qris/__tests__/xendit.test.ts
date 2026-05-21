/**
 * Phase 84 Wave 0 — TDD RED test for `buildCreateQrBody` (R1).
 *
 * Asserts the Xendit create-QR request-body shape:
 *   - type: "DYNAMIC", currency: "IDR"
 *   - external_id === reference_id === orderNumber
 *   - amount === finalTotal (exact, no rounding)
 *
 * RED STATE: This file imports `{ buildCreateQrBody }` from `../xendit`, which
 * does NOT exist until Plan 02 (84-02). Running this suite fails with
 * "Cannot find module '../xendit'" — that is the TDD contract for Wave 0.
 * DO NOT create a stub implementation to make it green.
 *
 * staffreview I1: import ONLY the pure `buildCreateQrBody` — NOT `xenditProvider`
 * or anything that reads process.env / fetch at import time. The Plan 02 impl
 * keeps env/fetch INSIDE `createInvoice`, so importing the pure fn has no side
 * effects and the test never needs to stub process.env.
 */

import { describe, it, expect } from "vitest";
import { buildCreateQrBody } from "../xendit";

describe("buildCreateQrBody (R1)", () => {
  it("returns the canonical DYNAMIC / IDR body with orderNumber as both ids and exact amount", () => {
    const body = buildCreateQrBody("0521-001", 35000);
    expect(body).toEqual({
      reference_id: "0521-001",
      external_id: "0521-001",
      type: "DYNAMIC",
      currency: "IDR",
      amount: 35000,
    });
  });

  it("uses orderNumber for both external_id and reference_id", () => {
    const body = buildCreateQrBody("1230-099", 50000);
    expect(body.external_id).toBe("1230-099");
    expect(body.reference_id).toBe("1230-099");
  });

  it("passes finalTotal through as amount with no rounding (Xendit floor 1500)", () => {
    const body = buildCreateQrBody("0101-001", 1500);
    expect(body.amount).toBe(1500);
  });

  it("always emits type DYNAMIC and currency IDR regardless of inputs", () => {
    const body = buildCreateQrBody("0707-007", 999999);
    expect(body.type).toBe("DYNAMIC");
    expect(body.currency).toBe("IDR");
  });
});
