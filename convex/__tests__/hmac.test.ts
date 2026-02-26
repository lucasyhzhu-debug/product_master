import { describe, it, expect } from "vitest";
import { validateHmacSignature } from "../integrations/grabfood/webhooks";

describe("validateHmacSignature", () => {
  it("returns valid=true with correct HMAC signature", async () => {
    const secret = "test-secret";
    const body = "test body";
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const hexSig = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const result = await validateHmacSignature(body, hexSig, secret);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("returns valid=false with incorrect HMAC signature", async () => {
    const result = await validateHmacSignature(
      "test body",
      "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      "test-secret"
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("mismatch");
  });

  it("returns valid=true with reason 'no_secret' when secret is undefined", async () => {
    const result = await validateHmacSignature("test body", "some-sig", undefined);
    expect(result.valid).toBe(true);
    expect(result.reason).toBe("no_secret");
  });

  it("returns valid=true with reason 'no_signature' when header is null", async () => {
    const result = await validateHmacSignature("test body", null, "test-secret");
    expect(result.valid).toBe(true);
    expect(result.reason).toBe("no_signature");
  });

  it("handles empty body string (GET request scenario)", async () => {
    const secret = "test-secret";
    const body = "";
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const hexSig = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const result = await validateHmacSignature(body, hexSig, secret);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });
});
