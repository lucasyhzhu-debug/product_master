---
created: 2026-05-30
planted_during: "Telegram /sales command brainstorming (2026-05-30)"
trigger_when: "next time the Telegram pack-list report or order-overdue handling is in scope"
area: telegram / orders / pack-list
status: seed
---

# SEED-001: Flag overdue orders explicitly in the pack-list report (incl. awaiting-payment)

## The idea

Make the daily Telegram pack-list report call out **overdue** orders explicitly, instead of
silently mixing them into the flat due-today list. Additionally, surface **awaiting-payment
orders that are overdue** — which the pack list excludes entirely today.

## Current behaviour (grounding — `convex/telegram/queries/packListQuery.ts`)

- `ACTIVE_STATUSES = ["PaymentReceived", "BeingPrepared"]` only.
- Pulls orders with `dueDate` set AND `dueDate <= end of today WIB`.
- Sort is `expedited → dueDate asc → creation asc` — but **no visual/structural overdue
  distinction**: an order due 3 days ago renders the same as one due today.
- `AwaitingPayment` orders are **not included at all** (pre-payment status, outside the
  paid→packed window the list targets).
- Code note (I3): 7 legacy in-progress statuses are intentionally ignored; likely out of
  scope for overdue detection too.

## Two distinct asks

1. **Overdue flagging** — visually/structurally separate orders where `dueDate < today WIB
   midnight` (genuinely overdue) from those due today. E.g. a `⚠️ OVERDUE` section or per-card
   badge with days-late.
2. **Awaiting-payment overdue** — surface aging unpaid orders (currently excluded). "Just
   document it" per operator — this is a payment/ops follow-up signal, not a packing signal.

## Open questions to resolve when planned

- **Definition of overdue:** `dueDate < today WIB midnight`, or past a grace period?
- **Awaiting-payment overdue metric:** by `dueDate` (do these orders even carry one?), or by
  age since order/creation date? Needs a separate threshold.
- **Presentation:** same daily pack-list message (new `⚠️ OVERDUE` / `💸 UNPAID & AGING`
  sections) vs a separate alert? Packers pack paid orders — unpaid-overdue may belong in a
  different channel/role rather than the pack-list group.
- **Status coverage:** include the 7 ignored legacy in-progress statuses in overdue detection,
  or keep them out (matching the current I3 decision)?
- **Index:** `by_status_due_date` already supports `AwaitingPayment` scans; confirm awaiting
  orders have queryable `dueDate`/date fields before scoping the query.

## Why this matters

Overdue orders getting lost in a flat list means late fulfilment goes unnoticed; aging unpaid
orders are revenue/ops risk that nobody is currently prompted to chase. Explicit flagging turns
the existing report into an exception-surfacing tool.

## Related

- Pack-list bot: `convex/telegram/sendPackList.ts`, `packListFormat.ts`, `queries/packListQuery.ts`
- Order status workflow: CLAUDE.md Key Business Rule #9
- Sibling telegram work: `docs/superpowers/specs/2026-05-30-telegram-sales-command-design.md`
