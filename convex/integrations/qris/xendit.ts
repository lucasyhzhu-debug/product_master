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
 *    happen INSIDE `createInvoice`/`getStatus`, so importing this module (as the R1
 *    unit test does, importing only `buildCreateQrBody`) executes nothing and cannot
 *    throw on import.
 *  - Static imports only (pitfall #8). Secret read here only, never returned to client.
 */

import type { CreateInvoiceResult, QrisProvider } from "./provider";

declare const process: { env: Record<string, string | undefined> };

const XENDIT_BASE = "https://api.xendit.co";
const QR_EXPIRY_MS = 30 * 60 * 1000; // our own 30-min window, NOT Xendit's expires_at (staffreview R5)

/**
 * Pure builder for the Xendit create-QR request body (R1).
 *
 * Sends BOTH `reference_id` (newer field) and `external_id` (legacy) — the spike
 * does, and it is harmless (A4 fallback safety for whichever the webhook echoes).
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
  const apiKey = process.env.XENDIT_API_KEY;
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

  async getStatus(xenditQrId: string): Promise<{ status: string }> {
    const res = await fetch(`${XENDIT_BASE}/qr_codes/${xenditQrId}`, {
      method: "GET",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Xendit ${res.status}: ${await res.text()}`);
    }

    const json = (await res.json()) as { status: string };
    return { status: json.status };
  },
};
