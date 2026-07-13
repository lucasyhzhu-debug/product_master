import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getLastUserId, setLastUserId, clearLastUserId } from "../lastUser";

const KEY = "malo_last_user_id";

describe("lastUser", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when nothing is stored", () => {
    expect(getLastUserId()).toBeNull();
  });

  it("round-trips the user id", () => {
    setLastUserId("user_abc123");
    expect(getLastUserId()).toBe("user_abc123");
  });

  it("clears the stored id", () => {
    setLastUserId("user_abc123");
    clearLastUserId();
    expect(getLastUserId()).toBeNull();
  });

  it("never persists a token or PIN alongside the id", () => {
    setLastUserId("user_abc123");
    expect(Object.keys(localStorage)).toEqual([KEY]);
  });

  // Private mode / sandboxed iframe: localStorage exists but throws on access.
  it("returns null instead of throwing when getItem is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(() => getLastUserId()).not.toThrow();
    expect(getLastUserId()).toBeNull();
  });

  it("degrades silently when setItem is over quota", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(() => setLastUserId("user_abc123")).not.toThrow();
  });

  it("degrades silently when removeItem is blocked", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(() => clearLastUserId()).not.toThrow();
  });
});
