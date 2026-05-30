# SEED-001 — Pack-list overdue flagging (incl. unpaid past-due) — Design

**Date:** 2026-05-30
**Area:** telegram / orders / pack-list
**Seed:** `.planning/seeds/SEED-001-packlist-overdue-flagging.md`
**Status:** approved design — ready for writing-plans

---

## Problem

The daily Telegram pack-list report flattens every due order into one undifferentiated
list. An order due three days ago renders identically to one due today, so genuinely
late fulfilment goes unnoticed. Separately, `AwaitingPayment` orders that are past their
delivery date are excluded entirely — nobody is prompted to chase those payments.

Two asks:

1. **Flag overdue paid orders** — visually separate orders whose delivery date has
   already passed from those due today, within the pack list.
2. **Surface unpaid past-due orders** — orders that are both unpaid **and** past their
   delivery date, as a distinct alert.

## Locked decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Overdue definition | A dueDate whose **WIB calendar day is strictly before today's WIB day**. No grace period. | Mirrors the kanban board's existing rule (`getUrgencyLevel` in `src/components/orders/KanbanCard.tsx`: `isPast(due) && !isToday(due)`), computed in WIB on the backend. Reuse the definition, don't reinvent a threshold. |
| Unpaid surfacing | `AwaitingPayment` orders that are overdue by that **same** rule (`dueDate < today's WIB midnight`). | A genuinely-overdue order: unpaid **AND** past delivery date. Orders with no dueDate don't surface (matches kanban → `default`). Due-today-unpaid is **not** yet overdue (delivery date hasn't passed). |
| Presentation | Pack-list message gains an `⚠️ OVERDUE` section above `Due Today`; unpaid past-due go out as a **separate alert message** to the same `pack-list` group. | The *action* differs — packers pack the paid overdue ones; someone chases payment on the unpaid ones. A separate message keeps the payment-chase signal from being mistaken for a packing task. |
| Paid status scope | Unchanged: `PaymentReceived` + `BeingPrepared`. | Matches the existing I3 decision. The 7 legacy in-progress statuses are past-packing or deprecated flow; no data audit shows live orders stuck there. YAGNI. |

## Semantics: why unpaid past-due is "overdue"

An `AwaitingPayment` order is overdue **only when both conditions hold at once**:
`status === "AwaitingPayment"` **AND** `dueDate < today's WIB midnight`. Neither alone
qualifies:

- Paid + past due → pack list's `⚠️ OVERDUE` section (just needs packing).
- Unpaid + still due today/future → **not** surfaced (delivery date hasn't passed yet).
- **Unpaid + past delivery date → the genuinely-overdue case** (should've shipped, and we
  don't even have the money).

---

## Architecture

Four isolated, independently-testable units.

### 1. `convex/telegram/queries/dueClassification.ts` (new — pure helpers)

The single source of truth for the overdue threshold, mirroring the kanban definition in
WIB. No I/O, fully unit-testable.

```ts
// Whole-day index in WIB (days since Unix epoch, WIB-shifted).
export function wibDayIndex(ms: number): number;          // floor((ms + WIB_OFFSET_MS) / DAY_MS)

export type DueBucket = "overdue" | "today" | "future";
// overdue ⟺ wibDayIndex(dueDate) < wibDayIndex(nowMs)
export function classifyDue(dueDate: number, nowMs: number): DueBucket;

// Whole WIB days the dueDate is late by (≥1 for overdue). = wibDayIndex(now) − wibDayIndex(due)
export function daysLate(dueDate: number, nowMs: number): number;
```

`WIB_OFFSET_MS` is imported from `convex/lib/periodRange.ts` (existing). The "strictly
before today" rule is realized once here and consumed by both the query (bucketing +
unpaid filter) and the formatter (days-late display).

### 2. `convex/telegram/queries/packListQuery.ts` → `getOrdersForPackList` (modified)

- **Paid scan** unchanged: two `by_status_due_date` slices (`PaymentReceived`,
  `BeingPrepared`) bounded by `dueDate <= endOfTodayMs`, filter out `undefined` dueDate.
  Then split each card by `classifyDue(dueDate, now)` into `overdue[]` vs `dueToday[]`.
  (`classifyDue` returns `"overdue"` or `"today"` here — never `"future"`, since the index
  bound excludes future; a defensive `"future"` is simply dropped.)
- **Unpaid scan** (new): one `by_status_due_date` slice on `AwaitingPayment` bounded by
  `dueDate < startOfTodayMs` (i.e. `.lt("dueDate", startOfTodayMs)`), filter out
  `undefined` dueDate → `unpaidOverdue[]`. Same index, no new index needed.
- Each bucket sorted **expedited → dueDate asc → _creationTime asc** (existing ordering,
  factored into a shared comparator).
- `deliveryCount` / `pickupCount` continue to count the **paid pack list** (overdue +
  dueToday), not the unpaid bucket.

Return shape:

```ts
{
  generatedAt: number;        // the `now` used — passed to formatter to avoid Date.now() drift
  totalCount: number;         // overdue.length + dueToday.length (paid orders to pack)
  overdueCount: number;       // overdue.length
  deliveryCount: number;
  pickupCount: number;
  overdue: KanbanOrderCard[];
  dueToday: KanbanOrderCard[];
  unpaidOverdue: KanbanOrderCard[];
}
```

`startOfTodayMs = wibMidnightToUtc(wib.year, wib.month, wib.day)` (the existing
`endOfTodayMs` computation already derives this neighbourhood).

### 3. `convex/telegram/packListFormat.ts` (modified)

Pure rendering. The only date math is `daysLate` (imported from unit 1).

- `formatPackList` renders, after the header:
  - `⚠️ OVERDUE (n)` section — **omitted entirely when `overdue` is empty**. Each order
    gets a `due {Wkd D Mon} · {n} day(s) late` line via `daysLate(card.dueDate, generatedAt)`.
  - `Due Today` section. Existing per-order rendering (`renderOrder`) reused as-is.
  - Chunking / `MAX_ORDER_LEN` / continuation-header logic preserved across both sections.
- Header line gains `· {n} overdue` only when `overdueCount > 0`:
  `5 orders to pack today · 2 overdue · 3 delivery · 2 pickup`.
- New `formatUnpaidAlert(input): string[]` — renders the unpaid past-due list with
  customer, amount (`finalTotal ?? totalAmount`), `due … · n days late`, and a contact
  line (`contactWa ?? customerPhone`). Returns `[]` when the bucket is empty (→ no message
  sent). Same chunking budget.

### 4. `convex/telegram/sendPackList.ts` (modified)

- Read `data.generatedAt` from the query result; pass it to **both** formatters as the
  single timestamp (replaces the separate `Date.now()` currently passed as `generatedAt`).
- Send pack-list chunks (existing sequential send + failure-breadcrumb wrapper).
- Then, if `unpaidOverdue` is non-empty, format via `formatUnpaidAlert` and send those
  chunk(s) as a **separate** message, after the pack-list chunks, with the same
  breadcrumb-on-partial-failure handling.
- Applies to all reasons (`morning` / `midday` / `command`).
- `sendPackListResilient` (cron wrapper) unchanged — it just calls `sendPackList`.

---

## Message formats

### Pack list (chunked, sent for every reason)

```
Pack List — Fri 30 May 2026

5 orders to pack today · 2 overdue · 3 delivery · 2 pickup

⚠️ OVERDUE (2)

0528-003 — Budi  [rush]
  2× Original
  Delivery → Jl. Mawar 5
  due Wed 28 May · 2 days late

0529-001 — Sari
  1× Jumbo
  Pickup
  due Thu 29 May · 1 day late

Due Today (3)

0530-001 — Maya
  1× Jumbo
  Pickup
```

When nothing is overdue, the `⚠️ OVERDUE` section is absent and the header drops the
`· N overdue` segment — identical to today's output. Empty pack list still renders
`Nothing to pack today. ✅`.

### Unpaid past-due alert (separate message; only sent when non-empty)

```
🚨 OVERDUE — Unpaid & Past Due — Fri 30 May 2026

2 orders past their delivery date with no payment — chase now.

0525-007 — Andi · Rp 150.000
  due Sun 25 May · 5 days late
  📞 0812-3456-7890

0527-002 — Maya · Rp 80.000
  due Tue 27 May · 3 days late
  📞 0813-1111-2222
```

---

## Data flow

```
cron / /pack
  → sendPackList(reason)
      → getOrdersForPackList({})            // WIB date math, buckets, generatedAt
          → classifyDue / daysLate          // shared threshold (unit 1)
      → formatPackList({ overdue, dueToday, counts, generatedAt })   → chunks[]
      → formatUnpaidAlert({ unpaidOverdue, generatedAt })            → alertChunks[] (or [])
      → send chunks[] sequentially
      → if alertChunks.length: send alertChunks[] sequentially (separate message)
```

## Error handling

- Partial-send failure on either message group emits the existing best-effort breadcrumb
  (`⚠️ … send failed after N/M chunks`) then rethrows.
- An order with a missing/blank delivery address keeps the existing
  `(no address — check order)` rendering.
- Unpaid order with no contact field renders the contact line as
  `(no contact — check order)` rather than an empty line.

## Testing

- **`dueClassification.test.ts` (new):** WIB boundary cases — due-yesterday = `overdue`,
  due-today (any hour) = `today`, due-tomorrow = `future`; `daysLate` whole-day math
  across the WIB midnight boundary; negative/zero guard for non-overdue inputs.
- **`packListQuery.test.ts` (extend):** overdue vs dueToday bucket membership + counts;
  `overdueCount`; unpaid scan includes past-due `AwaitingPayment`, excludes due-today,
  excludes no-dueDate, excludes paid statuses; `deliveryCount`/`pickupCount` still count
  paid only; `generatedAt` echoes the injected `now`.
- **`packListFormat.test.ts` (extend):** `⚠️ OVERDUE` section + `n days late` text;
  empty-overdue omits the section and the header segment; `formatUnpaidAlert` format
  (amount, days-late, contact); empty unpaid → `[]`; no-contact fallback line.
- Run the **full** `npm run test` before pushing (a filtered subset masked a fixture-path
  break last session).

## Out of scope

- The 7 legacy in-progress statuses (kept excluded — matches I3).
- Any new Telegram role/channel (unpaid alert reuses the `pack-list` role).
- Schema / index changes (existing `by_status_due_date` covers all scans).
- Changes to the kanban UI or its overdue logic (backend mirrors it; no shared module).

## Git workflow

- **Branch:** `feature/packlist-overdue-flagging`
- Backend + report-format only; no order-surface dual-wiring (`OrderSlideOver` /
  `OrderDetail` untouched).
- Workflow: writing-plans → subagent-driven implementation → `/triple-review` →
  `/simplify` → PR + squash-merge.
- Docs after merge: `docs/CHANGELOG.md` (always); `docs/API_REFERENCE.md` if the query
  return shape is documented there.
