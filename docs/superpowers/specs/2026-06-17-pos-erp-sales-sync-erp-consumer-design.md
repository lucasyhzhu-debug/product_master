# POS → Frollie Pro Sales Sync — ERP Consumer (execution-ready spec)

**Date:** 2026-06-17 (finalized 2026-06-18)
**Status:** Execution-ready (verified against the codebase; supersedes the prior draft)
**Repo:** `D:\Claude\Product Manager\product_master` (consumer side, "Frollie Pro" ERP)
**Contract (source of truth for the API):** [`2026-06-17-pos-erp-sales-sync-CONTRACT.md`](./2026-06-17-pos-erp-sales-sync-CONTRACT.md)
**Producer spec:** `FrolliePOS\docs\superpowers\specs\2026-06-17-pos-erp-sales-sync-design.md`
**Implements:** ADR-034 (POS) external API surface; reuses the Phase 74.5 channel spine (ERP)

> **Verification discipline.** Every API fact below cites the CONTRACT by section.
> Every codebase claim cites a `file:line` that was read while writing this spec.
> Where the prior draft made an unverified assumption that turned out **wrong**, it
> is called out in a **⚠ CORRECTION** box. No placeholders.

---

## 1. Goal & non-goals

**Goal.** POS becomes the ERP's **9th external revenue source (`source: "pos"`)**. Each paid
POS transaction lands as **one parent `externalRevenue` row + one `externalRevenueItems`
row per line**, joined to menu products via `productCode`. Refunds land as
`transactionType: "return"` reversals keyed to the original `receiptNumber`. Pure pull,
hourly cron, ERP owns all sync state (token + two cursors). POS is stateless. (CONTRACT §9; intent brief "What's SETTLED".)

**Non-goals (v1)** — CONTRACT §9:
- **Inventory deduction stays OFF.** `channelDeductionEnabled.pos = false` (ship-dark by construction). Revenue-only first; flip the flag later via the standard per-source cutover after a soak.
- No `/catalog` or `/inventory` endpoints — ~4 SKUs mapped manually via `/admin/unlinked-products`.
- No second auth scope, no push/webhooks, no ERP→POS writes.

---

## 2. The reuse thesis (what is genuinely new vs. wired-in)

POS is the **cleanest adapter in the codebase**: it conforms to the existing `ChannelAdapter`
interface (`convex/integrations/_shared/channelAdapter.ts:14-32`), writes parents through the
existing `saveRevenue` upsert (`convex/externalData/mutations.ts:56-135`) and children through
`saveRevenueItemsWithCounts` (`convex/externalData/mutations.ts:1016`), dedups on existing
indexes, and maps via `/admin/unlinked-products`. **The only genuinely new mechanics are: (a) an
HTTP `fetch` against a bearer-token API, and (b) an opaque-cursor checkpoint.** Everything else
mirrors the **K3Mart adapter** (`convex/integrations/k3mart/adapter.ts`), which is the closest
analog — it is also `dataOrigin:"api_revenue"`, `confidence:"exact"`, emits `transactionType:"return"`
rows with **negative** magnitudes, and uses the `saveRevenue` → `saveRevenueItemsWithCounts`
two-step. POS differs from K3Mart in one way only: POS has **real per-line children** (multiple
`externalRevenueItems` per parent), whereas K3Mart emits a single synthetic child per parent.

```
crons.interval (hourly) → syncPosRevenue (internalAction, "use node")
  ├─ load token  from platformCredentials(platformId:"pos").currentToken
  ├─ load cursors from posSyncCheckpoint (single row: salesCursor?, refundsCursor?)
  ├─ createSyncLog(source:"pos", syncType:"cron", status:"started")
  ├─ Phase A — drain GET /api/v1/transactions?cursor=salesCursor to nextCursor===null
  │     posAdapter.normalize(page) → ChannelSaleEvent[] (one per line)
  │     per txn: saveRevenue([parent]) → {id,isNew}; if new (or no children yet)
  │              → saveRevenueItemsWithCounts({revenueId, items: lines})
  │     after full drain → persist salesCursor
  ├─ Phase B — drain GET /api/v1/refunds?cursor=refundsCursor to nextCursor===null
  │     per refund: saveRevenue([parent]) with revenueGross = -totalRefund (NEGATIVE),
  │              transactionType:"return", externalTransactionId="{rcpt}|R|{createdAt}"
  │              (parent-only — no child items, mirroring K3Mart returns)
  │     after full drain → persist refundsCursor
  └─ updateSyncLog(status:"success", counts, durationMs)
```

---

## 3. Source-literal cascade — file-by-file checklist (Phase 81 sharp edge)

Adding `"pos"` is **not one line**. Every site below was read and confirmed. Severity column:
**C** = compile/type error (the safety net — lean on it), **T** = test failure, **S** = silent
bucketing/UI bug (no error; wrong behavior). `.map(EXTERNAL_SOURCES)` UI sites auto-include `"pos"`
once the array is updated — verified, listed for completeness.

| # | File:line | Change | Sev |
|---|---|---|---|
| 1 | `convex/schema.ts:18-27` | add `v.literal("pos")` to the `externalSource` union (currently 8 literals: k3mart, gobiz, internal, grabfood, bigseller, consignment, shopee, tiktok) | C |
| 2 | `convex/lib/externalSource.ts:10-19` | add `"pos"` to the `EXTERNAL_SOURCES` `as const` array (`ExternalSource` type derives from it) | C/S |
| 3 | `convex/lib/__tests__/externalSource.test.ts:5` | bump `.toHaveLength(8)` → `9` | T |
| 4 | `convex/lib/__tests__/externalSource.test.ts:8-11` | add `"pos"` to the sorted-array assertion | T |
| 5 | `convex/reports/platform.ts:17-26` | add `"POS"` to the `PLATFORMS` `as const` array (new distinct platform — see §3a) | C |
| 6 | `convex/reports/platform.ts:48-56` | add `pos: "POS"` to `SOURCE_TO_PLATFORM` (typed `Record<Exclude<ExternalSource,"bigseller">, Platform>` → omitting `pos` is a **compile error** once #1 lands) | C |
| 7 | `convex/reports/__tests__/platform.test.ts:13-24` | add `["pos", "POS"]` to the source→platform `it.each` table | T |
| 8 | `convex/reports/incomeStatement.ts:126-142` | add `case "pos": return "exact";` to `getChannelRevenueConfidence` (POS is system-of-record). Without it, POS falls to the `default → "inferred"` arm → **silent** wrong confidence badge | S |
| 9 | `convex/productInventory/channelFlags.ts:42-51` | add `pos: false` to `DEFAULT_FLAGS` (typed `Record<ExternalSource, boolean>` → **compile error** once #1 lands). `false` = ship-dark | C |
| 10 | `convex/schema.ts:1135-1144` | add `pos: v.boolean()` to the **closed** `channelDeductionEnabled` object inside `productInventorySettings`. Without it the settings doc cannot persist a POS toggle | S |
| 11 | `src/lib/platformColors.ts:19-37` | add **two** entries to `PALETTE`: `pos: {...}` (raw source key) **and** `POS: {...}` (platform aggregate key). Pick an unused hue (e.g. cyan `#06b6d4`). Missing → `getPlatformPalette("pos")` returns gray `FALLBACK` | S |
| 12 | `src/pages/UnlinkedProductsBackfill.tsx:92-107` | add `{ value: "pos", label: "POS" }` to the `CHANNEL_SOURCES` array (hand-maintained, **not** `EXTERNAL_SOURCES`-driven). Without it, no POS backfill card appears | S |
| 13 | `src/pages/ChannelRoutingManager.tsx:478` | uses `EXTERNAL_SOURCES.map(...)` — **auto-includes** ✓ (no edit) | — |
| 14 | `src/components/bankReconciliation/InlineRevenueDialog.tsx:132` | uses `EXTERNAL_SOURCES.map(...)` — **auto-includes** ✓ (no edit) | — |
| 15 | `src/components/channelIntegration/ResolutionPreviewPanel.tsx:129` | uses `EXTERNAL_SOURCES.map(...)` — **auto-includes** ✓ (no edit) | — |

**Decisions on borderline sites (verified):**
- `convex/integrations/registry.ts:13` (`PlatformId` union + `PLATFORMS` meta Record, `:40-166`) —
  this registry powers the credential-management admin UI cards. **Decision: ADD `"pos"`** with a
  minimal `PlatformMeta`, so an operator pastes the bearer token via the existing credentials UI
  rather than the raw dashboard. (Shopee/TikTok are absent here because they're BigSeller-managed;
  POS is first-party like gobiz/k3mart, so it belongs.) Additive, compile-checked — confirm the exact
  `PlatformMeta` shape at `registry.ts:40-166` during planning.
- `convex/externalData/mutations.ts:510` (the `source === "shopee" || "tiktok"` dominant-SKU cascade)
  — **NO `pos` branch.** POS carries a real `externalProductCode` per item; the legacy name-based arm
  (`mutations.ts:485-504`, all sources) + `by_source_external_item` covers it. See §7.
- `convex/externalData/queries.ts:1003-1010` (sell-through channel union) — **leave unchanged for
  v1.** POS sell-through is out of scope (deduction OFF, no inventory feed). *(Plan-stage confirm;
  additive `v.literal("pos")` if a sell-through view is later wanted.)*

### 3a. Why a distinct `"POS"` Platform (not reuse `"Direct"`)

`internal` (web/WhatsApp orders) maps to `"Direct"` (`platform.ts:49`). Booth POS sales are a
physically distinct channel the operator will want to see **separately** in analytics, not merged
into web "Direct" revenue. Adding a `"POS"` Platform literal is a contained, mostly compile-checked
cascade (#5–#7, #11). `platformDisplay` is identity-on-literal (`platform.ts:43-45`) so `"POS"`
renders as `"POS"` with no extra arm.

### 3b. Audit gate (plan must include)

Run `npm run type-check` immediately after #1 lands and BEFORE writing adapter code — the
`Record<ExternalSource,…>` / `Record<Exclude<…>,Platform>` types (#6, #9) surface every compile-level
miss at once. Then `npm run test` surfaces the test-level misses (#3, #4, #7). This is the Phase 81
lesson: lean on the type system to enumerate the cascade rather than grep alone.

---

## 4. Schema changes

### 4.1 New table: `posSyncCheckpoint` (single row)

```ts
// convex/schema.ts — new table
posSyncCheckpoint: defineTable({
  salesCursor: v.optional(v.string()),    // opaque, persist verbatim (CONTRACT §3)
  refundsCursor: v.optional(v.string()),  // opaque, persist verbatim
  updatedAt: v.number(),
}),
// No index needed — singleton, read via .query("posSyncCheckpoint").first().
```

**⚠ DECISION (open item #1 — RESOLVED): dedicated table, not `externalSyncLogs`.**
No existing source persists an opaque pagination cursor. Date-based sources (GoBiz/GoFood) derive
their watermark from the latest `externalSyncLogs.timestamp` (`by_timestamp` index); BigSeller has a
`bigsellerSyncState` row but it tracks a **poll workflow** (`schema.ts:1783-1809`), not a cursor.
`externalSyncLogs` is an **append-only audit log** (`schema.ts:1278-1298`) — overloading it for a
mutable watermark is wrong (which of N log rows is authoritative? race on concurrent writes?). The
CONTRACT (§3) requires the cursor be persisted **verbatim** as a black box; a dedicated single-row
table with two independent watermark fields is the faithful representation. `platformCredentials` has
no cursor field and overloading `currentToken` would conflate auth with pagination.

### 4.2 Cascade schema edits

Items #1, #5, #6, #9, #10, #12 from §3 (the `externalSource` union, `channelDeductionEnabled.pos`,
platform/flag/color additions).

**Token + cursor storage summary:**
- **Token** → `platformCredentials(platformId:"pos").currentToken` (`schema.ts:1351-1371`; its designed purpose).
- **Cursors** → new `posSyncCheckpoint` row (sales + refunds independent watermarks).

---

## 5. The adapter — `convex/integrations/pos/adapter.ts`

Pure, side-effect-free `normalize()` (no `ctx`, no network) → unit-testable against a frozen
fixture. Implements `ChannelAdapter<PosTransactionsPage>` (`channelAdapter.ts:14-32`). Output type is
`ChannelSaleEvent[]` (`convex/integrations/_shared/channelSaleEvent.ts:13-50`).

```ts
// convex/integrations/pos/types.ts — local types (NOT imported from POS; mirror the CONTRACT)
export interface PosTransactionLine {
  productCode: string; productName: string; qty: number;
  unitPrice: number; lineSubtotal: number; taxRate: number;
}
export interface PosTransaction {
  receiptNumber: string; paidAt: number; subtotal: number;
  voucherCode: string | null; voucherDiscount: number; total: number;
  staffCode: string; lines: PosTransactionLine[];
}
export interface PosTransactionsPage { data: PosTransaction[]; nextCursor: string | null; }

export interface PosRefundLine { productCode: string; qty: number; refundAmount: number; }
export interface PosRefund {
  receiptNumber: string; createdAt: number; totalRefund: number;
  reason: string; lines: PosRefundLine[];
}
export interface PosRefundsPage { data: PosRefund[]; nextCursor: string | null; }
```

```ts
// convex/integrations/pos/adapter.ts
import type { ChannelAdapter } from "../_shared/channelAdapter";
import type { ChannelSaleEvent } from "../_shared/channelSaleEvent";
import type { PosTransactionsPage, PosRefundsPage } from "./types";

/** Sales: one ChannelSaleEvent per line. occurredAt = paidAt (business time, CONTRACT §5). */
export const posAdapter: ChannelAdapter<PosTransactionsPage> = {
  source: "pos",
  normalize(page): ChannelSaleEvent[] {
    return page.data.flatMap((txn) =>
      txn.lines.map((l) => ({
        source: "pos" as const,
        occurredAt: txn.paidAt,
        externalTransactionId: txn.receiptNumber,
        externalItemId: `${txn.receiptNumber}|${l.productCode}`,
        externalProductCode: l.productCode,
        externalProductName: l.productName,
        quantity: l.qty,
        unitPrice: l.unitPrice,
        totalPrice: l.lineSubtotal,
      })),
    );
  },
};

/**
 * Refunds: POS serves POSITIVE magnitudes (CONTRACT §6). The ERP applies the sign.
 * Returns are PARENT-ONLY (see §6.3), so this returns one event per REFUND (not per line),
 * carrying the negated total for the parent's revenueGross. Per-line refund detail stays in POS.
 */
export function normalizeRefunds(page: PosRefundsPage): Array<{
  receiptNumber: string; createdAt: number; negatedTotal: number; reason: string;
}> {
  return page.data.map((r) => ({
    receiptNumber: r.receiptNumber,
    createdAt: r.createdAt,
    negatedTotal: -r.totalRefund,   // ← NEGATE here (CONTRACT §6 + ERP sign convention, §6.3)
    reason: r.reason,
  }));
}
```

**Note on `quantity`:** `ChannelSaleEvent` requires `quantity > 0` for deduction; ≤0 is flagged
`malformed_item` by the spine (`channelSaleEvent.ts:38`). POS sales lines are always positive, so
sales are clean. Refunds never become `ChannelSaleEvent`s (parent-only), so they never hit that guard.

---

## 6. The sync action + cron — `convex/integrations/pos/sync.ts`

`syncPosRevenue` is an `internalAction` with `"use node"` (HTTP needs Node runtime; mirrors
`gobiz/adapter.ts:1`). Registered in `convex/crons.ts` via `crons.interval` (hourly), mirroring the
existing `"sync internal orders revenue"` entry (`crons.ts:6-11`).

### 6.1 HTTP fetch idiom (CONTRACT §2)

Plain native `fetch` (no extra deps — same as `gobiz/adapter.ts:324-328`), bearer header on every request:

```ts
const res = await fetch(`${baseUrl}/api/v1/transactions?cursor=${encodeURIComponent(cursor ?? "")}&limit=100`, {
  method: "GET",
  headers: { Authorization: `Bearer ${token}` },
});
if (res.status === 401) throw new Error("POS UNAUTHENTICATED — token missing/expired/revoked");
if (res.status === 429) { /* honor Retry-After header; back off and abort run (cursor unmoved) */ }
if (!res.ok) throw new Error(`POS ${res.status}: ${(await res.json())?.error?.code ?? "INTERNAL"}`);
const page = (await res.json()) as PosTransactionsPage;  // zod-validate first — see §8.2
```

- `baseUrl` from an env var, e.g. `POS_API_BASE_URL` (dev `https://helpful-grasshopper-46.convex.site`,
  prod `https://savory-zebra-800.convex.site` — CONTRACT §1). **Decision:** env var, not a credential
  field — it's environment config, not a secret. Confirm naming during planning.
- `token` from `platformCredentials(pos).currentToken` via
  `internal.platformCredentials.queries.getCredentialsInternal({platformId:"pos"})`
  (`convex/platformCredentials/queries.ts:129-139`). If absent → log + abort (no-op run).

### 6.2 Phase A — sales (parent + per-line children)

For each page until `nextCursor === null`, for each `txn`:

1. **Parent** via `saveRevenue` (`mutations.ts:56`), batched per page:
   ```ts
   {
     source: "pos",
     productName: `POS ${txn.receiptNumber}`,
     quantitySold: <sum of line qty>,            // optional; informational
     transactionCount: 1,
     revenueGross: txn.total,                     // POSITIVE for sales (CONTRACT §5)
     // revenueNet / commission / fee fields → UNDEFINED (open item #3 — see §10)
     ...collapseRevenuePeriod(txn.paidAt),        // sets periodStart=periodEnd=transactionDate=paidAt
     dataOrigin: "api_revenue",
     confidence: "exact",                          // POS is system-of-record (earns "exact", Phase 81)
     transactionType: "sales",
     externalTransactionId: txn.receiptNumber,     // parent dedup key (by_source_txn)
     syncLogId,
   }
   ```
   `saveRevenue` **upserts** on `by_source_txn (source, externalTransactionId)` and returns
   `{id, isNew}` (`mutations.ts:100-133`) — re-pulling the same receipt patches the same row (no dup).

2. **Children** — for each new parent (existence-guard mirrors K3Mart `adapter.ts:636-645`: if
   `!isNew`, query `hasExternalRevenueItemsQuery`; skip if children already exist), call
   `saveRevenueItemsWithCounts` (`mutations.ts:1016`) with one item per POS line:
   ```ts
   { externalItemId: `${txn.receiptNumber}|${line.productCode}`,
     productName: line.productName, unitPrice: line.unitPrice,
     quantity: line.qty, totalPrice: line.lineSubtotal,
     isAutoMatched: false /* mapping resolved later via /admin/unlinked-products */ }
   ```
   `saveRevenueItems*` dedups items on `(revenueId, externalItemId)` set-once (`mutations.ts:845-858`),
   and runs deduction **only if** `channelDeductionEnabled.pos === true` (OFF in v1 → ship-dark).
   `*WithCounts` returns `{ids, inserted, deducted, skipped}` for the sync-log counters
   (mirrors gobiz/k3mart wiring, D74.5.1-R9).

### 6.3 Phase B — refunds (parent-only, NEGATIVE gross)

For each page until `nextCursor === null`, for each refund event (via `normalizeRefunds`):

```ts
saveRevenue([{
  source: "pos",
  productName: `POS refund ${r.receiptNumber}`,
  transactionCount: 1,
  revenueGross: r.negatedTotal,                  // ← NEGATIVE (= -totalRefund)
  ...collapseRevenuePeriod(r.createdAt),
  dataOrigin: "api_revenue",
  confidence: "exact",
  transactionType: "return",
  externalTransactionId: `${r.receiptNumber}|R|${r.createdAt}`,  // refund dedup key (CONTRACT §6)
  syncLogId,
}])
// NO child items for refunds.
```

> **⚠ CORRECTION — refund sign (open item #4, RESOLVED).** The prior draft said refund `revenueGross`
> should be a **positive magnitude** with "the `transactionType` carrying the direction; no negative
> numbers in `revenueGross`." **That is wrong.** The financials aggregation sums `revenueGross`
> **raw** — `channelGross += rec.revenueGross ?? 0` (`convex/reports/incomeStatement.ts:299`) — it
> does **not** branch on `transactionType` to negate. The established convention (K3Mart) stores
> returns with **negative** `revenueGross`: `revenueGross: txn.total` where `txn.total` is negative
> for returns (`k3mart/adapter.ts:601`, `transactionType` set at `:607`; K3Mart's API serves the
> sign, config comment `k3mart/config.ts:68-69`). A positive POS refund gross would **inflate**
> revenue. **POS must negate at the adapter** (`normalizeRefunds`) so the parent gross is negative,
> and the existing additive aggregation subtracts it correctly.

> **⚠ DECISION — refunds are parent-only (no children).** Mirrors K3Mart, which writes a return
> parent but skips the child when `quantitySold <= 0` (`k3mart/adapter.ts:650`). Rationale:
> (a) financials read the parent `revenueGross` only (`incomeStatement.ts:299`), so the negative
> parent fully captures the reversal; (b) children exist to feed **deduction** (OFF in v1) and
> **per-item product mapping** (a refund needs no new mapping — the original sale's SKU is already
> mapped); (c) emitting negative-`quantity` children would trip the spine's `malformed_item` guard
> (`channelSaleEvent.ts:38`) at the future deduction cutover. **Limitation accepted:** per-line refund
> detail is not stored in the ERP (it remains in POS). Revisit at the deduction cutover if restock-on-
> return is implemented — that change must add negative children *and* a restock path together.
> **Alternative (rejected for v1):** emit negative-magnitude children for grain fidelity.

### 6.4 Cursor discipline & resume (open item #5 — RESOLVED)

- **Persist a cursor only after its phase fully drains to `nextCursor === null`.** Phase A persists
  `salesCursor`; Phase B persists `refundsCursor`. The two watermarks are **independent** — if A
  drains but B throws, `salesCursor` advances and `refundsCursor` stays.
- **A mid-drain throw leaves the cursor unmoved.** Next run resumes from the last fully-persisted
  cursor and re-pulls the partially-processed pages. This is safe because **every write is
  idempotent**: parents upsert on `by_source_txn`, items set-once on `(revenueId, externalItemId)`.
  Re-pulling a page inserts zero duplicates. (Self-healing, mirrors the #177 resilient backfill.)
- On any thrown error: `updateSyncLog(status:"error", errorMessage)` and return. Do **not** advance
  the cursor for the failed phase. The watermark is the primary mechanism; the dedup keys are the
  overlap safety net.
- **429 RATE_LIMITED:** honor `Retry-After`, abort the run (cursor unmoved); the hourly cron retries.

---

## 7. Product mapping (manual, one-time, ~4 SKUs)

Via the existing `/admin/unlinked-products` flow:
`externalProductMappings(source:"pos", externalProductCode=productCode) → menuProductId`
(`schema.ts:1300-1311`; `by_source_code` index). The retroactive cascade
(`convex/externalData/mutations.ts:474-639`, Phase 80.2) patches already-synced rows when a mapping
is saved. **`pos` needs no new cascade branch** — it carries a real `externalProductCode` on every
item, so the legacy name-based arm (`mutations.ts:485-504`, all sources) plus the `by_source_external_item`
item index cover it. The Shopee/TikTok dominant-SKU branch (`:510`) and the K3Mart parent-only branch
(`:620`) are source-specific and **not** extended for POS. *(Plan gate: after the first dev sync,
confirm a saved POS mapping back-patches `linkedMenuProductId` onto existing `externalRevenueItems`
rows — the retroactive cascade is the proof.)*

---

## 8. Idempotency / dedup & testing

### 8.1 Dedup table

| Layer | Key | Mechanism | file:line |
|---|---|---|---|
| Parent (sales) | `(source:"pos", receiptNumber)` | `saveRevenue` upsert via `by_source_txn` | `mutations.ts:103-128` |
| Parent (refund) | `(source:"pos", "{rcpt}\|R\|{createdAt}")` | same | `mutations.ts:103-128` |
| Line items | `(revenueId, "{rcpt}\|{productCode}")` | `saveRevenueItems` set-once | `mutations.ts:845-858` |
| Sales watermark | persisted `salesCursor` | `posSyncCheckpoint` (primary) | new table |
| Refund watermark | persisted `refundsCursor` | `posSyncCheckpoint` (primary) | new table |

### 8.2 Tests (mirror existing fixtures/patterns)

1. **`normalize()` unit** — one fixture `PosTransactionsPage` → N `ChannelSaleEvent`s; assert
   `externalItemId`, `occurredAt === paidAt`, `totalPrice === lineSubtotal`, per-line fan-out count.
2. **`normalizeRefunds()` unit** — assert `negatedTotal === -totalRefund` (the sign correction),
   one event per refund, `externalTransactionId` shape `{rcpt}|R|{createdAt}`.
3. **Contract fixture lock (zod, bidirectional)** — a frozen JSON fixture of each endpoint response,
   validated by a zod schema that rejects **both** missing and extra keys (`.strict()` on objects —
   this is the ERP-CI drift tripwire; mirrors the Phase 83 HAR-fixture body-shape lock,
   `lessons_phase_83_01a_triple_review`). *(Note: CONTRACT §8 says the **runtime parse** should
   `.passthrough()` unknown fields for additive forward-compat; the FIXTURE LOCK test is a separate,
   stricter artifact whose whole job is to fail loudly on drift. Use `.strict()` in the lock test and
   `.passthrough()` in the runtime parse — two different goals, two different schemas.)*
4. **Parent + item dedup** — run the same fixture window twice through the sync helpers; assert zero
   duplicate `externalRevenue` parents and zero duplicate `externalRevenueItems`.
5. **Refund modeling + sign** — a refund fixture produces a `transactionType:"return"` parent with
   **negative** `revenueGross`, keyed to the original `receiptNumber`; assert it **subtracts** in an
   income-statement aggregation (the §6.3 correction, end-to-end).
6. **`collapseRevenuePeriod`** — assert POS parents have `periodStart === periodEnd === transactionDate === paidAt` (sales) / `=== createdAt` (refund).
7. **Cursor resume** — simulate a throw mid-drain (page 2 of 3); assert `salesCursor` unmoved, then a
   second run completes with no gaps and no dupes.
8. **Source-cascade gate** — `npm run type-check` && `npm run test` && `npm run build` green after
   the §3 cascade (the type errors from #6/#9 are the enumerator).

Tests use `convex-test` for the mutation/dedup paths and plain Vitest for the pure `normalize`/zod
units. **No live POS calls** — the endpoints don't exist yet (intent brief); everything tests against
the frozen fixture.

---

## 9. Rollout (deduction stays OFF throughout)

1. POS ships its `code`-required prerequisite + the two endpoints, and issues a `frpos_test_` token on dev (CONTRACT §1-2; POS spec §4, §7).
2. **ERP land:** the §3 cascade + `posSyncCheckpoint` table + `pos/adapter.ts` + `pos/sync.ts` +
   the hourly cron + the `registry.ts` POS card. Set `POS_API_BASE_URL` (dev). Land behind a
   **manual-trigger** internal mutation first (so the operator can drain on demand before the cron is trusted).
3. Set `platformCredentials(pos).currentToken` = the `frpos_test_` token (via the credentials admin UI).
4. **Dev↔dev drain + reconcile** against the POS dashboard day-summary (gross sales total + refund total). Confirm parent/item counts and that a saved mapping back-patches.
5. **Prod:** POS issues a `frpos_live_` token; set the prod credential + `POS_API_BASE_URL` (prod); let the hourly cron run; soak ≥24h; reconcile.
6. **Deduction cutover (separate change, later):** flip `channelDeductionEnabled.pos = true` only
   after the revenue soak proves mapping, via the standard per-source cutover. *(If restock-on-return
   is wanted then, also implement refund children + a restock path — see §6.3.)*

---

## 10. Open items — all RESOLVED

| # | Item | Decision | Rationale |
|---|---|---|---|
| 1 | Cursor storage: `posSyncCheckpoint` vs `externalSyncLogs` | **Dedicated `posSyncCheckpoint` single-row table** | No source persists an opaque cursor today; `externalSyncLogs` is append-only audit, wrong for a mutable watermark; CONTRACT §3 demands verbatim persistence; two independent watermarks. (§4.1) |
| 2 | Store `staffCode`? | **Drop in v1** | Attribution-only; no ERP consumer/field/report for it; `externalRevenue` has no staff field; adding one is scope creep. POS still sends it; the runtime parse ignores it. Add later if staff-level POS reporting is wanted. |
| 3 | `revenueNet` / `commission` / fees for POS | **Leave `undefined`** | Direct booth sale — no platform MDR/commission/delivery fee. `incomeStatement.ts:300` does `+= rec.commission ?? 0` → 0; net = gross for POS, which is correct. |
| 4 | Return sign convention | **Store `revenueGross` NEGATIVE; negate at the adapter** | **Corrected from the draft.** Aggregation sums raw (`incomeStatement.ts:299`); K3Mart precedent stores returns negative (`k3mart/adapter.ts:601`). A positive refund gross would inflate revenue. (§6.3) |
| 5 | Cursor discipline / resume | **Persist per-phase only after full drain to `null`; mid-drain throw leaves cursor unmoved; dedup keys are the overlap safety net** | Self-healing resume; idempotent writes make re-pull free. (§6.4) |

---

## 11. Self-review (staffreview-style)

**Schema flow.** New `posSyncCheckpoint` is a self-contained singleton — no FK, no migration of
existing rows. The `externalSource` union widening is the only schema change that touches existing
data shapes, and it is purely additive (existing rows keep their literal). `channelDeductionEnabled`
gains one optional boolean key; unset reads as `false` (ship-dark holds automatically).

**Logic.** Parent via `saveRevenue` upsert (idempotent), children via `saveRevenueItemsWithCounts`
with an existence guard, cursor persisted only on full drain. The sign correction is the one place a
naive implementation goes wrong; it is pinned by a dedicated test (§8.2 #5) and an inline `⚠`.

**Edge cases.** (a) Empty page / immediate `nextCursor:null` → drain ends, cursor persists, no
writes. (b) Token missing → no-op run, logged. (c) 401/429/500 → throw, cursor unmoved, cron retries.
(d) Partial refund then full refund on one receipt → two distinct parents via the `|R|{createdAt}`
key (CONTRACT §6). (e) Re-pull after a mid-drain crash → dedup makes it a no-op. (f) A POS line with
`qty:0` → produces a `ChannelSaleEvent` with `quantity:0`, flagged `malformed_item` by the spine but
deduction is OFF, so it lands as a child with zero qty; acceptable (informational) and rare.

**Performance (N+1).** Per page (≤500 rows): one batched `saveRevenue` call for all parents, then
one `saveRevenueItemsWithCounts` per *new* parent (the existence guard skips re-pulled parents). The
existence-guard query (`hasExternalRevenueItemsQuery`) is one indexed lookup per parent — same shape
as K3Mart's proven path. Drain loop is bounded by `limit` pages; hourly cadence keeps page counts
small after the initial backfill. No unbounded `.collect()` over `externalRevenue`.

**Rollback.** Pure-additive: revert the branch → the `externalSource` union narrows back (no POS rows
exist yet in prod on first ship), the cron entry disappears, `posSyncCheckpoint` is dropped. If POS
rows already landed and must be purged: a one-shot internal mutation deletes `externalRevenue where
source=="pos"` + their `externalRevenueItems` + the `posSyncCheckpoint` row. Deduction never ran
(flag OFF), so there is no inventory state to unwind — the clean rollback property is the direct
payoff of ship-dark.

---

## 12. Acceptance (self-check against the brief)

- ✅ Every API fact cites the CONTRACT (§1-§9 referenced inline).
- ✅ Every codebase claim cites a `file:line` read while writing (cascade table §3, write path §6, dedup §8.1).
- ✅ All five §10 open items decided with rationale.
- ✅ The source-literal cascade is a verified file-by-file checklist with severities.
- ✅ No placeholders; the one draft assumption that was wrong (refund sign) is corrected with proof.
