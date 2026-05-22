/**
 * Phase 84 Wave 0 — TDD RED test for `verifyCallbackToken` (R4a).
 *
 * Modelled on convex/__tests__/hmac.test.ts. Covers the Xendit webhook callback
 * token compare, which DIVERGES from grabfood's HMAC behaviour:
 *   - grabfood treats a missing secret/signature as valid (skip) →
 *   - Xendit MUST return false → 401 (SPEC acceptance criterion, RESEARCH Pitfall 4).
 *
 * Behaviour contract:
 *   - header null            → false (missing header → 401)
 *   - expected undefined     → false (missing config → 401)
 *   - length mismatch        → false
 *   - content mismatch       → false (same length, different chars)
 *   - exact match            → true (constant-time XOR compare)
 *
 * RED STATE: imports `{ verifyCallbackToken }` from `../webhooks`, which does NOT
 * exist until Plan 04 (84-04). Running this suite fails to resolve `../webhooks` —
 * that is the TDD contract for Wave 0. DO NOT stub the implementation.
 */

import { describe, it, expect } from "vitest";
import { verifyCallbackToken } from "../webhooks";

const EXPECTED = "whtok_test_abc123";

describe("verifyCallbackToken (R4a)", () => {
  it("returns false when the header is null (missing header → 401)", () => {
    expect(verifyCallbackToken(null, EXPECTED)).toBe(false);
  });

  it("returns false when the expected token is undefined (missing config → 401)", () => {
    expect(verifyCallbackToken(EXPECTED, undefined)).toBe(false);
  });

  it("returns false on a length mismatch", () => {
    expect(verifyCallbackToken("short", EXPECTED)).toBe(false);
  });

  it("returns false on a content mismatch of the same length", () => {
    // Same length as EXPECTED (17 chars), different content.
    const sameLengthWrong = "whtok_test_XXXXXX";
    expect(sameLengthWrong.length).toBe(EXPECTED.length);
    expect(verifyCallbackToken(sameLengthWrong, EXPECTED)).toBe(false);
  });

  it("returns true on an exact match", () => {
    expect(verifyCallbackToken(EXPECTED, EXPECTED)).toBe(true);
  });
});
