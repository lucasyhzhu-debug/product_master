/**
 * BigSeller muctoken JWT decode (frontend twin of convex/lib/jwt.ts).
 *
 * Per CLAUDE.md Pitfall #18 / D-13 precedent (src/lib/dateUtils.ts), the
 * frontend keeps a small decoupled copy of the backend JWT decoder rather than
 * importing the convex helper into src/. ~8 lines, no signature verification —
 * we trust the server-issued JWT (83-RESEARCH.md). The decoded `exp` is used
 * for the freshness banner display only, never for any authz decision.
 */

/**
 * Returns the token's `exp` in milliseconds, or null if the token is malformed
 * (not a 3-part JWT / non-base64 payload) or has no numeric `exp`.
 */
export function decodeMucTokenExp(mucToken: string): number | null {
  try {
    const parts = mucToken.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}
