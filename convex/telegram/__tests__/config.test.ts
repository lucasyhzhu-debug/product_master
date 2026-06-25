import { describe, it, expect } from "vitest";
import { KNOWN_TELEGRAM_ROLES, isKnownTelegramRole } from "../config";

describe("KNOWN_TELEGRAM_ROLES — Phase E Slice 1", () => {
  it("includes subscription-ops and founders", () => {
    expect(KNOWN_TELEGRAM_ROLES).toContain("subscription-ops");
    expect(KNOWN_TELEGRAM_ROLES).toContain("founders");
  });
  it("isKnownTelegramRole accepts the new roles", () => {
    expect(isKnownTelegramRole("subscription-ops")).toBe(true);
    expect(isKnownTelegramRole("founders")).toBe(true);
    expect(isKnownTelegramRole("nope")).toBe(false);
  });
});
