# Prompt for the FrolliePOS agent — validate the POS → Frollie Pro sales API (v1) is live & contract-conformant

> Paste everything below to the agent working in `D:\Claude\FrolliePOS`.
> It is self-contained — the POS agent does NOT need the ERP repo.

---

You own the **producer** side of the POS → Frollie Pro sales sync. The ERP consumer
(`convex/integrations/pos/`) has shipped to prod and will pull hourly, but it is
**dark** until your API is confirmed live and a token is issued. Your job: **validate
the live API against the contract below by hitting your own endpoints, fix any drift,
issue the ERP a token, and report back the exact base URL + token + evidence.**

The contract is the frozen source of truth: `docs/superpowers/specs/2026-06-17-pos-erp-sales-sync-CONTRACT.md` (v1). Everything here is derived from it — if your implementation and the contract disagree, the contract wins (or we bump `/api/v2/` per §8).

## What the ERP actually sends (validate against these exact requests)

The ERP issues plain `GET`s with a Bearer token, `limit=500`, cursor URL-encoded (empty on the first call):

```
GET {BASE}/api/v1/transactions?cursor=&limit=500     Authorization: Bearer <token>
GET {BASE}/api/v1/refunds?cursor=&limit=500          Authorization: Bearer <token>
```

- `{BASE}` is your **`.convex.site`** httpAction host (NOT `.cloud`):
  - **dev:** `https://helpful-grasshopper-46.convex.site`
  - **prod:** `https://savory-zebra-800.convex.site`
- The ERP then pages forward: takes `nextCursor` from the response and re-requests
  `?cursor=<that value, URL-encoded>&limit=500` until `nextCursor === null`, persisting the cursor verbatim per page (≤50 pages/run).
- On **any** non-2xx the ERP throws and retries next hour (it does NOT treat 4xx specially yet), so a misconfigured token/endpoint = a stalled sync that logs an error.
- Runtime parse is zod `.passthrough()`: **extra fields are fine**, but a **missing required field or a wrong type throws** and fails the run. So every required field below MUST be present with the exact type/units.

## Required response shapes (must match field-for-field)

`GET /api/v1/transactions` — finalised sales only (`status === "paid"`; never draft/awaiting_payment/cancelled), ascending by `(paidAt, _creationTime)`:

```json
{ "data": [ {
  "receiptNumber": "R-2026-0042",   // string, stable ID R-YYYY-NNNN, immutable, parent dedup key
  "paidAt": 1718600000000,          // number, UTC epoch ms, cursor order key
  "subtotal": 90000,                // number, INTEGER RUPIAH
  "voucherCode": "OPEN10",          // string | null  (null if none)
  "voucherDiscount": 9000,          // number, integer rupiah
  "total": 81000,                   // number, integer rupiah; MUST equal subtotal - voucherDiscount
  "staffCode": "S-0001",            // string, stable ID S-NNNN, immutable
  "lines": [ {
    "productCode": "DUBAI_8PC",     // string, UPPERCASE_SNAKE(+_<N>PC), immutable — ERP join key
    "productName": "Dubai 8pcs",    // string
    "qty": 2,                       // number
    "unitPrice": 45000,             // number, integer rupiah
    "lineSubtotal": 90000,          // number; MUST equal unitPrice * qty
    "taxRate": 0                    // number (0 today)
  } ]
} ], "nextCursor": "string | null" }
```

`GET /api/v1/refunds` — append-only refund events, ascending by `(createdAt, _creationTime)`:

```json
{ "data": [ {
  "receiptNumber": "R-2026-0042",   // string, the original sale's stable ID
  "createdAt": 1718700000000,       // number, UTC epoch ms, cursor order key + dedup identity
  "totalRefund": 45000,             // number, integer rupiah, POSITIVE magnitude (ERP applies the sign)
  "reason": "damaged",              // string
  "lines": [ {
    "productCode": "DUBAI_8PC",     // string
    "qty": 1,                       // number
    "refundAmount": 45000           // number, integer rupiah, positive magnitude
  } ]
} ], "nextCursor": "string | null" }
```

The ERP forms the refund's unique key as `"{receiptNumber}|R|{createdAt}"`, so `(receiptNumber, createdAt)` MUST be unique per refund event (a partial-then-full refund on one receipt = two distinct rows).

## Validation checklist — run real requests and confirm each

Hit your OWN live endpoints (dev first) with a valid token and verify:

1. **Endpoints exist & are GET-only** at `/api/v1/transactions` and `/api/v1/refunds` on the `.convex.site` host. A `POST`/other method is rejected.
2. **Envelope** is exactly `{ "data": [...], "nextCursor": string|null }` on both.
3. **Every required field** above is present with the exact name, type, and units (integer rupiah, epoch ms). No `snake_case` internals, no Convex `_id`s leaked. (Extra fields are allowed by the ERP, but don't rename/retype/drop required ones.)
4. **Invariants hold**: `total === subtotal - voucherDiscount`; `lineSubtotal === unitPrice * qty`; `voucherCode` is `null` (not absent/empty) when no voucher; refund amounts are **positive**.
5. **Only paid sales** appear in `/transactions` (no draft/awaiting/cancelled).
6. **Pagination**: `limit` honored (default 100, max 500 — `limit=500` must work); absent/empty `cursor` returns from the beginning ascending; `nextCursor` is an **opaque base64 string** treated as a black box; a non-null `nextCursor` means "more pages"; `nextCursor === null` is returned on the final page; rows are **strictly after** the decoded cursor; equal-ms rows tiebreak deterministically on `_creationTime`.
7. **Auth**: `Authorization: Bearer <opaque token>` required; token prefix `frpos_live_` (prod) / `frpos_test_` (dev); stored as SHA-256, constant-time compare; revocable; scope `frollie_pro_full`; both endpoints allow-listed for the ERP's token.
8. **Error envelope** `{ "error": { "code", "message", "details" } }` with: 400 `BAD_CURSOR`, 401 `UNAUTHENTICATED` (missing/malformed/unknown/expired/revoked), 403 `ENDPOINT_NOT_ALLOWED`, 429 `RATE_LIMITED` (+`Retry-After` header), 500 `INTERNAL` (no internals leaked).
9. **Stable IDs** immutable: `receiptNumber` (R-YYYY-NNNN, allocated at confirm-paid), `productCode` (UPPERCASE_SNAKE — confirm the POS `code`-required prerequisite is done so every product has one), `staffCode` (S-NNNN).
10. **"Yesterday" check** (the ERP has no date filter — it drains from the beginning forward): confirm there ARE `status:"paid"` transactions with `paidAt` inside **yesterday's** window in the live POS data, and that a no-cursor `/transactions` request actually returns them. Do the same spot-check for any refunds created yesterday.

## What to report back

1. **Confirmed base URLs** for dev (`helpful-grasshopper-46.convex.site`) and prod (`savory-zebra-800.convex.site`) — confirm both are live and serving `/api/v1/`.
2. **A token for the ERP consumer**, per environment: a `frpos_test_…` for dev and a `frpos_live_…` for prod, each allow-listed for both endpoints, scope `frollie_pro_full`. (The ERP stores these in `platformCredentials(platformId:"pos").currentToken`.)
3. **Evidence**: the raw JSON of a real first-page `GET /api/v1/transactions?cursor=&limit=500` and a `GET /api/v1/refunds?cursor=&limit=500` (redact nothing in the shape; you may trim `data` to ~2 rows), plus one paginated follow-up showing a non-null→null `nextCursor` transition.
4. **Any drift you found and fixed**, or any field you cannot provide as specified (so we decide contract-change vs ERP-side adaptation before the ERP goes live).
5. Confirm the **yesterday spot-check** (#10): how many paid transactions / refunds fall in yesterday's window and that they appear in the feed.

Once you return the base URL + token + green evidence, the ERP side sets `POS_API_BASE_URL` + the `pos` credential, runs an on-demand drain, and reconciles the landed rows against your dashboard day-summary.
