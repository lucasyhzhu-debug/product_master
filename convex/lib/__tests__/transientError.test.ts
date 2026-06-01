// convex/lib/__tests__/transientError.test.ts
import { describe, it, expect } from "vitest";
import { isTransientError } from "../transientError";

describe("isTransientError", () => {
  it("matches the Convex capacity error (pack-list 2026-05-29)", () => {
    expect(
      isTransientError(
        new Error("There are no available workers to process the request"),
      ),
    ).toBe(true);
  });

  it("matches the Convex InternalServerError that broke GoFood 2026-05-31", () => {
    // Exact shape logged by the gobiz adapter re-throw.
    const msg =
      'Uncaught Error: {"code":"InternalServerError","message":"Your request couldn\'t be completed. Try again later."}';
    expect(isTransientError(new Error(msg))).toBe(true);
  });

  it("matches the plain 'Try again later' form (resilient wrapper 2026-06-01)", () => {
    expect(
      isTransientError(new Error("Your request couldn't be completed. Try again later.")),
    ).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isTransientError(new Error("INTERNALSERVERERROR"))).toBe(true);
  });

  it("accepts non-Error values (stringifies them)", () => {
    expect(isTransientError("no available workers right now")).toBe(true);
    expect(isTransientError({ toString: () => "try again later" })).toBe(true);
  });

  it("does NOT match a genuine application/validation error", () => {
    expect(
      isTransientError(new Error("CHANNEL_ROUTING_NOT_CONFIGURED: source=gobiz")),
    ).toBe(false);
    expect(isTransientError(new Error("Unauthorized: role 'manager' not in [admin]"))).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });
});
