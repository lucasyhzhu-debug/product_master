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
 * DO NOT re-add a per-QR `callback_url` here: the Xendit account is shared with
 * the Frollie POS (savory-zebra-800) whose account-level "QR code paid" webhook
 * is authoritative. We PROVED live (order 0716-001, 2026-07-16) that Xendit's QR
 * Codes v2 API ACCEPTS `callback_url` but IGNORES it for routing — the paid event
 * still went to the account-level (POS) webhook. Routing to this deployment is
 * handled by the POS→RM forwarder, not a per-QR override.
 */
export function buildCreateQrBody(orderNumber: string, finalTotal: number) {
  return {
    reference_id: orderNumber,
    external_id: orderNumber,
    type: "DYNAMIC" as const,
    currency: "IDR" as const,
    amount: finalTotal,
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
    const res = await fetch(`${XENDIT_BASE}/qr_codes`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        "api-version": XENDIT_QR_API_VERSION,
      },
      body: JSON.stringify(buildCreateQrBody(orderNumber, finalTotal)),
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
