# POS → Frollie Pro Sales Sync — API Contract (v1)

**Date:** 2026-06-17
**Status:** Draft (the shared source of truth — both repos reference this)
**Producer:** `D:\Claude\FrolliePOS` (Frollie POS)
**Consumer:** `D:\Claude\Product Manager\product_master` (Frollie Pro ERP)
**Governs:** POS `docs/PUBLIC_API.md` (mirror the endpoint table here into it) + ERP `convex/integrations/pos/`

> This is the **trust boundary made concrete**. Neither repo imports the other's
> types. POS guarantees these response shapes; the ERP validates against them
> (zod + a frozen fixture, mirroring the Phase 83 HAR-fixture body-shape lock).
> A change to any shape below is a contract change — bump `/api/v2/` or follow
> the deprecation policy. Per ADR-034 §"External API surface".

---

## 1. Transport

| Concern | Value |
|---|---|
| Base URL | `https://<pos-deployment>.convex.site` (httpActions serve from `.site`, **not** `.cloud`) |
| Dev | POS `helpful-grasshopper-46` → ERP `exciting-fennec-671` |
| Prod | POS `savory-zebra-800` → ERP `decisive-wombat-7` |
| Path prefix | `/api/v1/` |
| Methods | `GET` only (read-only feed) |
| TLS | HTTPS-only (Convex default) |

## 2. Authentication

```
Authorization: Bearer frpos_live_<base64url 32-byte random>
```

- Opaque bearer token (M2M, single first-party consumer). **Not** a JWT — opaque tokens are revocable server-side instantly.
- Token prefix `frpos_live_` (or `frpos_test_`) enables secret-scanning + self-documents environment.
- Stored on POS as `SHA-256(token)`, compared in constant time. (256-bit random → a fast hash is correct; argon2id buys nothing here.)
- One scope for v1: `frollie_pro_full`. The `scope` field exists for forward-compat; no second scope is implemented.
- Endpoint allow-list is explicit (no globs). Revocable + rotatable (overlapping 7-day window).
- The consumer stores the token in `platformCredentials(platformId:"pos").currentToken` (ERP) and sends it on every request.
- Identity is **token-derived**: each token belongs to one consumer (and one environment via the `frpos_live_`/`frpos_test_` prefix), so the matched token row identifies the caller. No client-declared identity header.

## 3. Pagination — high-watermark incremental

Response envelope (both endpoints):

```json
{ "data": [ /* ... */ ], "nextCursor": "string | null" }
```

- `?cursor=<opaque>&limit=<N>` — `limit` default **100**, max **500**.
- Cursor is an **opaque base64 string**. Consumers MUST treat it as a black box and persist it verbatim.
- Server decodes it to the last-seen `(orderKeyMs, _creationTime)` and returns rows **strictly after** it, ascending.
- Absent/empty cursor = from the beginning of time.
- `nextCursor === null` ⟺ the returned page is the last one (consumer is caught up; stop and persist).
- A non-null `nextCursor` with a full page ⟹ keep paging **in the same run** until null.

### Watermark safety invariant (why this works)

Both feeds order on an **append-only, write-once** timestamp:

- `/transactions` orders on `paidAt` — set once at `_confirmPaid`, never mutated. New confirmations always get `paidAt ≈ now ≥ watermark`, so **no row ever appears below a watermark already passed**.
- `/refunds` orders on `createdAt` — `pos_refunds` is append-only (ADR-008).

`_creationTime` is the implicit tiebreak Convex appends to every index (you **cannot** name `_id` in an index definition). Equal-millisecond rows therefore page deterministically.

## 4. Error envelope

```json
{ "error": { "code": "string", "message": "string", "details": { } } }
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `BAD_CURSOR` | cursor fails to decode |
| 401 | `UNAUTHENTICATED` | missing / malformed / unknown / expired / revoked token |
| 403 | `ENDPOINT_NOT_ALLOWED` | token not allow-listed for this path |
| 429 | `RATE_LIMITED` | per-token RPM bucket exceeded (includes `Retry-After` header) |
| 500 | `INTERNAL` | unexpected server error (no internals leaked) |

## 5. `GET /api/v1/transactions`

Returns finalised sales (`status === "paid"` only — never `draft` / `awaiting_payment` / `cancelled`), ordered ascending by `(paidAt, _creationTime)`.

```json
{
  "data": [
    {
      "receiptNumber": "R-2026-0042",
      "paidAt": 1718600000000,
      "subtotal": 90000,
      "voucherCode": "OPEN10",
      "voucherDiscount": 9000,
      "total": 81000,
      "staffCode": "S-0001",
      "lines": [
        {
          "productCode": "DUBAI_8PC",
          "productName": "Dubai 8pcs",
          "qty": 2,
          "unitPrice": 45000,
          "lineSubtotal": 90000,
          "taxRate": 0
        }
      ]
    }
  ],
  "nextCursor": "eyJwIjoxNzE4NjAwMDAwMDAwLCJjIjoxNzE4Li4ufQ"
}
```

| Field | Type | Notes |
|---|---|---|
| `receiptNumber` | string | **Stable ID.** `R-YYYY-NNNN`. Parent dedup key. |
| `paidAt` | number | UTC epoch ms. Cursor order key. |
| `subtotal` / `voucherDiscount` / `total` | number | **Integer rupiah** (ADR-015). `total = subtotal - voucherDiscount`. |
| `voucherCode` | string \| null | Snapshot at sale; `null` if none. |
| `staffCode` | string | **Stable ID.** `S-NNNN`. |
| `lines[].productCode` | string | **Stable ID.** `UPPERCASE_SNAKE`(+`_<N>PC`). ERP join key. |
| `lines[].qty` / `unitPrice` / `lineSubtotal` | number | `lineSubtotal = unitPrice * qty`, integer rupiah. |
| `lines[].taxRate` | number | `0` today; schema-ready. |

`status` is intentionally omitted from the response — the endpoint returns only paid rows, so it carries no information.

## 6. `GET /api/v1/refunds`

Returns refund events, ordered ascending by `(createdAt, _creationTime)`.

```json
{
  "data": [
    {
      "receiptNumber": "R-2026-0042",
      "createdAt": 1718700000000,
      "totalRefund": 45000,
      "reason": "damaged",
      "lines": [
        { "productCode": "DUBAI_8PC", "qty": 1, "refundAmount": 45000 }
      ]
    }
  ],
  "nextCursor": null
}
```

| Field | Type | Notes |
|---|---|---|
| `receiptNumber` | string | The original sale's stable ID — links the reversal. |
| `createdAt` | number | UTC epoch ms. Cursor order key + part of the dedup identity. |
| `totalRefund` | number | Integer rupiah, **positive magnitude** (the ERP applies the sign via `transactionType: "return"`). |
| `reason` | string | Free text. |
| `lines[].productCode` / `qty` / `refundAmount` | — | Per-line reversal. `refundAmount` positive magnitude. |

**Refund identity:** `(receiptNumber, createdAt)` is unique for append-only refunds. The ERP forms `externalTransactionId = "{receiptNumber}|R|{createdAt}"` so a partial-refund-then-full-refund on one receipt produces two distinct reversal rows.

## 7. Stable identifier guarantees (POS owns these)

| Identifier | Format | Stability |
|---|---|---|
| `receiptNumber` | `R-YYYY-NNNN` | Allocated at `_confirmPaid`, immutable. |
| `productCode` | `UPPERCASE_SNAKE`(+`_<N>PC`) | Immutable post-creation. **Requires the POS `code`-required prerequisite** (see POS spec §7). |
| `staffCode` | `S-NNNN` | Allocated at staff creation, immutable. |

Convex `_id`s and `snake_case` internals are **never** exposed.

## 8. Versioning & deprecation

- Breaking change (remove/rename a field, change a type, change ordering semantics) → new `/api/v2/` path.
- Deprecation window: ≥14 days, agreed in writing (you, both ends).
- Additive change (new optional field) is **not** breaking — consumers ignore unknown fields; the ERP zod validator uses `.passthrough()` on objects.

## 9. What is NOT in v1 (non-goals)

- `/api/v1/catalog`, `/api/v1/inventory` — ~4 SKUs are mapped manually in the ERP; no endpoint needed.
- A second auth scope (`frollie_pro_aggregate_only`) — one trusted consumer, one scope.
- Push / webhooks from POS — the ERP pulls hourly; add push only if real-time reporting becomes a requirement.
- ERP → POS direction — POS owns its own stock (ADR-016).
