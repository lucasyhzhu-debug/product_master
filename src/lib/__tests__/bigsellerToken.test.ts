/**
 * Phase 83-03 (D-04) — decodeMucTokenExp unit tests.
 *
 * Frontend twin of convex/lib/jwt.ts. Returns exp in ms (or null). No signature
 * verification — display-only use for the freshness banner.
 */

import { describe, it, expect } from "vitest";
import { decodeMucTokenExp } from "../bigsellerToken";

// Real HAR JWT shape: payload { sub:"user", exp:1780911842, iat:1779183842 }.
// exp:1780911842 sourced from 83-RESEARCH.md:32.
const VALID_TOKEN =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIiwiZXhwIjoxNzgwOTExODQyLCJpYXQiOjE3NzkxODM4NDJ9.sig";
// payload { sub:"user", iat:1779183842 } — no exp
const NO_EXP_TOKEN =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIiwiaWF0IjoxNzc5MTgzODQyfQ.sig";

describe("decodeMucTokenExp", () => {
  it("returns exp in ms for a valid HAR JWT", () => {
    expect(decodeMucTokenExp(VALID_TOKEN)).toBe(1780911842 * 1000);
  });

  it("returns null for a malformed 2-part token", () => {
    expect(decodeMucTokenExp("only.two")).toBeNull();
  });

  it("returns null for a non-base64 payload", () => {
    expect(decodeMucTokenExp("a.!!!notbase64!!!.c")).toBeNull();
  });

  it("returns null for a token whose payload has no exp", () => {
    expect(decodeMucTokenExp(NO_EXP_TOKEN)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(decodeMucTokenExp("")).toBeNull();
  });
});
