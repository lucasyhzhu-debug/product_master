/**
 * Decode a JWT payload without verification (we validate by test-fetching instead).
 * Shared utility -- used by K3Mart login, BigSeller paste flow, and any future JWT-based auth.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }
  // base64url -> base64 -> decode
  const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const json = atob(padded);
  return JSON.parse(json);
}
