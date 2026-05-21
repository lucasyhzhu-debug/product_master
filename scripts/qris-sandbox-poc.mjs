#!/usr/bin/env node
/**
 * QRIS sandbox proof-of-concept — Xendit Test Mode.
 *
 * THROWAWAY SPIKE. Not part of the build. Validates the end-to-end QRIS loop
 * before we commit to the full schema/UI integration.
 *
 * What it does:
 *   1. Create a DYNAMIC (exact-amount) QR code via Xendit QR Codes API.
 *   2. Decode the returned EMVCo `qr_string` and print the key tags
 *      (currency 360/IDR, embedded amount, country ID, merchant name, NMID).
 *   3. Simulate a payment (Test Mode only — no real wallet/funds).
 *   4. Poll the QR's payment status until it reports paid (or times out).
 *
 * Requirements:
 *   - Node 18+ (built-in global fetch). No npm deps.
 *   - A Xendit *Test Mode* secret API key (prefix `xnd_development_...`).
 *     Set it in .env.local (gitignored) or export it before running:
 *
 *         XENDIT_API_KEY=xnd_development_xxxx
 *
 * Run:
 *     node scripts/qris-sandbox-poc.mjs            # default Rp 35.000
 *     node scripts/qris-sandbox-poc.mjs 12345      # custom amount (IDR)
 *
 * NOTE: This is a spike. The Xendit QR Codes API has two field-naming
 * generations (legacy `external_id`/`callback_url` vs newer `reference_id`).
 * The script logs the full request + raw response at every step, so if a
 * field name is off we see Xendit's exact error and adjust in one pass.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const BASE = "https://api.xendit.co";

// ---- Load XENDIT_API_KEY from env or .env.local --------------------------
function loadApiKey() {
  if (process.env.XENDIT_API_KEY) return process.env.XENDIT_API_KEY.trim();
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const envPath = resolve(here, "..", ".env.local");
    const txt = readFileSync(envPath, "utf8");
    const line = txt.split(/\r?\n/).find((l) => l.startsWith("XENDIT_API_KEY="));
    if (line) return line.slice("XENDIT_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  } catch {
    /* no .env.local — fall through */
  }
  return null;
}

const API_KEY = loadApiKey();
if (!API_KEY) {
  console.error(
    "\n✗ No XENDIT_API_KEY found.\n" +
      "  Add to .env.local:  XENDIT_API_KEY=xnd_development_xxxx\n" +
      "  (Test Mode secret key from Xendit dashboard → Settings → Developers → API Keys)\n"
  );
  process.exit(1);
}
if (!API_KEY.startsWith("xnd_development_")) {
  console.warn(
    "⚠  Key does not start with 'xnd_development_' — make sure this is a TEST MODE key, not live.\n"
  );
}

const AMOUNT = Number(process.argv[2] || 35000);
const REFERENCE = `qris-poc-${Date.now()}`;

// ---- Xendit request helper -----------------------------------------------
const authHeader = "Basic " + Buffer.from(`${API_KEY}:`).toString("base64");

async function xendit(method, path, body) {
  const url = `${BASE}${path}`;
  const opts = {
    method,
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, ok: res.ok, json };
}

// ---- Minimal EMVCo MPM (QRIS) TLV decoder --------------------------------
function parseTLV(str) {
  const out = {};
  let i = 0;
  while (i + 4 <= str.length) {
    const tag = str.slice(i, i + 2);
    const len = parseInt(str.slice(i + 2, i + 4), 10);
    if (Number.isNaN(len)) break;
    const val = str.slice(i + 4, i + 4 + len);
    out[tag] = val;
    i += 4 + len;
  }
  return out;
}

function decodeQris(qr) {
  const root = parseTLV(qr);
  const lines = [];
  const initiation = root["01"] === "12" ? "12 (DYNAMIC ✓)" : `${root["01"]} (STATIC)`;
  lines.push(`  [01] Point of Initiation : ${initiation}`);
  lines.push(`  [52] Merchant Category   : ${root["52"] ?? "—"}`);
  lines.push(`  [53] Currency            : ${root["53"]} ${root["53"] === "360" ? "(IDR ✓)" : ""}`);
  lines.push(`  [54] Amount              : ${root["54"] ?? "(none — static)"}`);
  lines.push(`  [58] Country             : ${root["58"]} ${root["58"] === "ID" ? "✓" : ""}`);
  lines.push(`  [59] Merchant Name       : ${root["59"] ?? "—"}`);
  lines.push(`  [60] Merchant City       : ${root["60"] ?? "—"}`);
  // Merchant Account Information templates (26–51) — find the QRIS/NMID block.
  for (let t = 26; t <= 51; t++) {
    const tag = String(t).padStart(2, "0");
    if (root[tag]) {
      const sub = parseTLV(root[tag]);
      lines.push(`  [${tag}] Merchant Account   : GUID=${sub["00"] ?? "?"} NMID=${sub["01"] ?? "?"} criteria=${sub["03"] ?? "?"}`);
    }
  }
  return lines.join("\n");
}

// ---- Run -----------------------------------------------------------------
function banner(t) {
  console.log(`\n${"━".repeat(64)}\n${t}\n${"━".repeat(64)}`);
}

(async () => {
  console.log(`QRIS sandbox POC — Xendit Test Mode`);
  console.log(`Reference: ${REFERENCE}   Amount: Rp ${AMOUNT.toLocaleString("id-ID")}`);

  // 1. CREATE dynamic QR. Fields per Xendit QR Codes API.
  banner("1) CREATE dynamic QR  → POST /qr_codes");
  const createBody = {
    reference_id: REFERENCE,
    type: "DYNAMIC",
    currency: "IDR",
    amount: AMOUNT,
    // legacy-API compatibility — harmless if ignored by newer API:
    external_id: REFERENCE,
    callback_url: "https://example.com/qris-poc-webhook",
  };
  console.log("request:", JSON.stringify(createBody, null, 2));
  const created = await xendit("POST", "/qr_codes", createBody);
  console.log(`HTTP ${created.status}`);
  console.log("response:", JSON.stringify(created.json, null, 2));
  if (!created.ok) {
    console.error("\n✗ Create failed. Check the error above and adjust field names if needed.");
    process.exit(1);
  }

  const qrId = created.json.id;
  const qrString = created.json.qr_string;
  const refForSim = created.json.reference_id || created.json.external_id || REFERENCE;

  // 2. DECODE the EMVCo payload to prove it carries our exact amount.
  banner("2) DECODE qr_string (EMVCo MPM tags)");
  if (qrString) {
    console.log(decodeQris(qrString));
    const root = parseTLV(qrString);
    const embedded = Number(root["54"]);
    console.log(
      embedded === AMOUNT
        ? `\n  ✓ Embedded amount (${embedded}) matches requested (${AMOUNT}).`
        : `\n  ⚠ Embedded amount (${root["54"]}) != requested (${AMOUNT}).`
    );
  } else {
    console.log("  (no qr_string in response — see raw response above)");
  }

  // 3. SIMULATE payment (Test Mode only).
  banner("3) SIMULATE payment  → POST /qr_codes/:id/payments/simulate");
  // Try by-id first; fall back to by-reference path if the API expects that.
  let sim = await xendit("POST", `/qr_codes/${qrId}/payments/simulate`, { amount: AMOUNT });
  if (!sim.ok) {
    console.log(`(by-id returned HTTP ${sim.status}; retrying by reference '${refForSim}')`);
    sim = await xendit("POST", `/qr_codes/${refForSim}/payments/simulate`, { amount: AMOUNT });
  }
  console.log(`HTTP ${sim.status}`);
  console.log("response:", JSON.stringify(sim.json, null, 2));

  // 4. POLL status.
  banner("4) POLL status  → GET /qr_codes/:id");
  let paid = false;
  for (let attempt = 1; attempt <= 6 && !paid; attempt++) {
    let get = await xendit("GET", `/qr_codes/${qrId}`);
    if (!get.ok) get = await xendit("GET", `/qr_codes/${refForSim}`);
    const status = get.json.status ?? get.json._raw ?? "?";
    console.log(`  attempt ${attempt}: HTTP ${get.status}  status=${JSON.stringify(status)}`);
    const blob = JSON.stringify(get.json).toUpperCase();
    if (blob.includes("COMPLETED") || blob.includes("PAID") || blob.includes("SUCCEEDED")) {
      paid = true;
      console.log("  full:", JSON.stringify(get.json, null, 2));
    }
    if (!paid) await new Promise((r) => setTimeout(r, 2000));
  }

  banner(paid ? "✓ RESULT: payment confirmed — full loop works." : "RESULT: no paid status seen");
  if (!paid) {
    console.log(
      "Payment confirmation in Test Mode usually arrives via the webhook callback,\n" +
        "not the QR object status. Check the Xendit dashboard → Webhooks tab for the\n" +
        "qr payment event, or inspect the simulate response above (it often contains\n" +
        "the payment object with status COMPLETED)."
    );
  }
})().catch((e) => {
  console.error("\n✗ Unexpected error:", e);
  process.exit(1);
});
