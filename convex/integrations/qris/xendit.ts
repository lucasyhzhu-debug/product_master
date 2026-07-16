/**
 * Phase 84 — Xendit QRIS adapter (R1).
 *
 * Implements the provider-agnostic `QrisProvider` against the Xendit QR Codes
 * API (`POST /qr_codes`, `GET /qr_codes/{id}`).
 *
 * Runtime notes (staffreview I1/R3):
 *  - NO `"use node"`. The default Convex runtime already provides `btoa` + `fetch`;
 *    `"use node"` would DROP `btoa`. Use `btoa(...)` for Basic auth, NOT `Buffer`.
 *  - NO module-top-level `process.env` reads or `fetch` calls. All such side effects
 *    happen INSIDE `createInvoice`, so importing this module (as the R1 unit test
 *    does, importing only `buildCreateQrBody`) executes nothing and cannot throw on
 *    import.
 *
 * Payment detection is exclusively webhook-driven (the QR never reads "paid" on
 * poll; spike-confirmed), so there is no status-poll method here.
 *  - Static imports only (pitfall #8). Secret read here only, never returned to client.
 */

import type { CreateInvoiceResult, QrisProvider } from "./provider";

declare const process: { env: Record<string, string | undefined> };

const XENDIT_BASE = "https://api.xendit.co";
const QR_EXPIRY_MS = 30 * 60 * 1000; // our own 30-min window, NOT Xendit's expires_at (staffreview R5)
// Pin the QR Codes API to v2. The create body uses the v2 shape (reference_id +
// currency) and — critically — the dashboard `qr_code` webhook event ONLY fires
// for this version. Without it Xendit uses the account default and the paid
// callback may never arrive.
const XENDIT_QR_API_VERSION = "2022-07-31";

/**
 * Pure builder for the Xendit create-QR request body (R1).
 *
 * Sends BOTH `reference_id` (newer field) and `external_id` (legacy) — the spike
 * does, and it is harmless (A4 fallback safety for whichever the webhook echoes).
 *
 * `callbackUrl` (optional) stamps a PER-QR webhook URL on the code. This is the
 * multi-tenant fix: the Xendit account is shared with another Frollie system (the
 * POS, savory-zebra-800) whose account-level "QR code paid" webhook is already
 * set. Without a per-QR override, THIS deployment's paid callbacks would be
 * delivered to the POS endpoint (which no-ops on our unknown refs) and our order
 * would never flip to paid. Stamping our own `CONVEX_SITE_URL` callback routes
 * only our QRs to us, leaving the account-level POS webhook untouched. Omitted →
 * field absent (Xendit falls back to the account-level webhook).
 */
export function buildCreateQrBody(orderNumber: string, finalTotal: number, callbackUrl?: string) {
  return {
    reference_id: orderNumber,
    external_id: orderNumber,
    type: "DYNAMIC" as const,
    currency: "IDR" as const,
    amount: finalTotal,
    ...(callbackUrl ? { callback_url: callbackUrl } : {}),
  };
}

/** Build the Basic-auth header: API key as username, EMPTY password. btoa, not Buffer. */
function authHeader(): string {
  // Accept either env-var name. The code standard (and the dev deployment) is
  // XENDIT_API_KEY, but the prod deployment (decisive-wombat-7) stores the same
  // live secret under XENDIT_SECRET_KEY. Reading both means neither environment
  // has to duplicate the secret under a second name to satisfy this reader.
  const apiKey = process.env.XENDIT_API_KEY ?? process.env.XENDIT_SECRET_KEY;
  // Fail fast on a misconfigured deployment — `btoa("undefined:")` would otherwise
  // produce a valid-looking header and surface as a cryptic Xendit 401.
  if (!apiKey) throw new Error("Missing XENDIT_API_KEY / XENDIT_SECRET_KEY environment variable");
  return "Basic " + btoa(`${apiKey}:`);
}

export const xenditProvider: QrisProvider = {
  async createInvoice({
    orderNumber,
    finalTotal,
  }: {
    orderNumber: string;
    finalTotal: number;
  }): Promise<CreateInvoiceResult> {
    // Per-QR callback URL self-targeting this deployment (CONVEX_SITE_URL is a
    // Convex system env var → dev routes to the dev site, prod to the prod site).
    // Must match the http.route path in convex/http.ts. Omitted if unset so the
    // account-level webhook still applies as a fallback.
    const siteUrl = process.env.CONVEX_SITE_URL;
    const callbackUrl = siteUrl ? `${siteUrl}/api/xendit/qr-payment` : undefined;

    const res = await fetch(`${XENDIT_BASE}/qr_codes`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        "api-version": XENDIT_QR_API_VERSION,
      },
      body: JSON.stringify(buildCreateQrBody(orderNumber, finalTotal, callbackUrl)),
    });

    if (!res.ok) {
      throw new Error(`Xendit ${res.status}: ${await res.text()}`);
    }

    const json = (await res.json()) as { id: string; qr_string: string };
    return {
      xenditQrId: json.id,
      qrString: json.qr_string,
      expiresAt: Date.now() + QR_EXPIRY_MS,
    };
  },
};
