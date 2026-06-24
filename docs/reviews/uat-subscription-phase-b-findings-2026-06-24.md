# Subscription Phase B — UAT Findings & UX Nits (2026-06-24)

Running list captured during manual UAT on dev (`exciting-fennec-671`). Lens: **a non-technical
operator must succeed without help** — every confusing state, missing feedback, or silent failure counts.
Severity: 🔴 blocker · 🟠 correctness · 🟡 UX/clarity · 🔵 polish.

## Fixed during UAT (on branch `fix/subscription-scheduler-session-query`)
- 🔴 **F1 — Scheduler page crashed on open.** `SubscriptionSchedulePage.tsx:117` called the public
  `menuProducts.queries.list` through `useSessionQuery` (injects `sessionId`); the plain `query`
  validator rejects the extra field → whole page fell into the error boundary ("Something went wrong
  loading this page"). A non-tech user would see a dead page with no recourse. **Fix:** use plain
  `useQuery`. *(Done.)*
- ~~F2 — "Reset to template" off-by-one day~~ **FALSE POSITIVE (reverted).** The schedule
  template's `dayOfWeek` is **0-based-from-Monday** (0=Mon … 6=Sun) — proven by `weeks.test.ts:22-23`
  and the calendar grid. `weekStart + dayOfWeek*DAY` is correct. My UAT seed used `1–5` assuming JS
  convention (Sun=0), which is why deliveries landed Tue–Sat. My "fix" broke the passing test; reverted.
  See U4 below (the convention is a real footgun even if not a bug).

- 🔴 **F3 — Kitchen crashed opening ANY order (OrderDetail).** `qrisPayments/queries.ts`
  `getQrisConfig` + `getActiveQrisPayment` were `roles:[order_staff,manager,admin]`, but the
  `/orders/:id` route allows **kitchen** and `OrderDetail`/`OrderSlideOver` mount these reads
  unconditionally. Kitchen → `Unauthorized: role 'kitchen' not in [...]` → error boundary. This is the
  **3rd recurrence of Pitfall #19** (Phase 84 origin, surfaced by §7). **Fix:** added `kitchen` to both
  read-only queries (charge action stays strict). *(Done.)*

## Open UX / clarity nits (address after UAT)
- 🟡 **U1 — Confirmed/invoiced week still shows editable quantity & product fields.** After a week is
  confirmed (orders + invoice generated), the schedule grid's quantity spinboxes, product dropdowns,
  and "Remove line" buttons remain interactive. There's no Save button so edits can't persist, but a
  non-tech user will type a new quantity, see it "stick" on screen, and believe they changed a
  confirmed order. **Suggested fix:** render the locked/invoiced week truly read-only — disable inputs,
  drop the Remove/Add buttons, show a "This week is confirmed — locked" banner.

- 🟡 **U2 — No obvious operator action to "deliver" a subscription order / recognize the sale.** Revenue
  recognition fires only on the **→ AwaitingDelivery** edge, which is driven by the kitchen/packaging
  flow. But the order is **read-only on every order surface for every role** (OrderDetail + OrderSlideOver,
  incl. manager/admin) — "Edit, status, and cancel actions are disabled here." A non-tech operator has no
  visible "Mark delivered" button to close the weekly loop and trigger the drawdown/revenue. **Suggested
  fix:** add a subscription-aware "Mark delivered" affordance (on the scheduler day row, or a guarded
  deliver button on the order) and confirm the kitchen/packaging path is actually reachable for these
  PaymentReceived orders. *(Needs path-confirmation in §7 kitchen login.)*
- 🔵 **U3 — Read-only subscription OrderDetail still shows "Generate Invoice" + delivery-fee "Edit".** Same
  class as the known WhatsApp/Fulfill deferral: edit affordances leak onto a "read-only" order (both
  OrderDetail and OrderSlideOver show the delivery-fee "Edit"). No data harm, but contradicts the
  "actions are disabled here" message. Suppress for true read-only.
- 🟡 **U4 — `scheduleTemplate.dayOfWeek` convention (0=Monday) is undocumented and contradicts the
  rest of the codebase.** `weekBounds.ts` uses JS convention (Sun=0, **Mon=1**) for real timestamps,
  but the template slot index is **0-based-from-Monday** (0=Mon…6=Sun). Nothing at the create boundary
  (`createSubscription` / `validateScheduleTemplate`, which only checks `0..6`) documents this, and
  there's no create-subscription UI to constrain it. Anyone seeding a subscription (today: devs) will
  guess wrong and schedule every delivery one day off — I did, during this UAT. **Suggested fix:** a
  one-line doc/validator comment, and when the create UI is built, use a named-day picker (Mon/Tue/…)
  not a raw number.

## Verified clean (no issues)
- §1 calendar render, seeding (after F2 fix), save+refresh persistence, single-day-edit isolation, read-only-no-Save.
- §2 confirm → 5 orders (AwaitingPayment/Unpaid/subscription_credit, partner price, production records), idempotent re-confirm.
- §3 invoice day-grouping + Bank Transfer Reference, mark-paid→fund (creditIssued=week total, orders→Paid/PaymentReceived, pool consumed=0/remaining=full), funding dashboard buckets + empty state.
- §4 drawdown at delivery (one per order, idempotent), B2B Wholesale income-statement line (keyed on customerType), excluded from per-channel daily sales, production ball-count still included.
- §7 price strip: kitchen + order_staff see "—" (qty+product visible) in OrderDetail; order_staff sees stripped slide-over + price-less kanban card; manager/admin see prices both surfaces; 🔒 badge + Open-in-scheduler + read-only on both; normal orders fully editable w/ prices for order_staff (unaffected). NOTE: kitchen has `canAccessOrders:false` so the kanban/slide-over is unreachable for kitchen by design — the kitchen strip check is OrderDetail-only.

<!-- more appended as UAT proceeds -->

## §5 / §6 / §8 — backend present + unit-tested, but NOT operator-testable yet
- 🟡 **U5 — Top-up (§5) and Reconcile (§6) have NO frontend at all** (grep for `createTopupInvoice`,
  `markTopupInvoicePaid`, `reconcileWeek`, `splitScheduledOrder`, `applyPartialCredit` in `src/` → zero
  hits). This matches the documented "reconcile/out-of-credit UI deferred to Phase D." Backend logic IS
  present and **unit-tested** (`outOfCredit`, `reconcileMath`, `reconcileNetting`, `rollover` — 52/52
  subscription tests pass). **Operator impact:** there is currently no way to issue a top-up, handle an
  out-of-credit day, or run a weekly reconcile from the UI — these flows don't exist for a non-tech user
  until Phase D builds them. Plan the Phase-D UI + a fresh UAT pass for §5/§6.
- §8 bank-matching: match engine (`bankStatements/matchEngine.ts`) implements the gap#1
  `subscriptionWeeklyInvoice` link (whole-token invoiceNumber exact match + amount/date fuzzy fallback);
  **60/60 matchEngine tests pass.** Funding is intentionally NOT auto-wired (Phase-D deferred) — operator
  funds via the dashboard. **Not exercised end-to-end in UI** (needs a bank-statement import whose memo
  contains an unpaid weekly invoiceNumber). Manual follow-up: import such a statement in `/financials`
  and confirm the credit line links to the weekly invoice.

## Still to test (manual, low-risk)
- §3 funding-dashboard listing **with data** + per-row Mark-paid (dashboard renders + buckets + empty
  state verified; per-row uses the same `markWeeklyInvoicePaid` already exercised on the invoice page).
- §8 end-to-end bank-statement match in `/financials` (logic unit-tested; UI flow pending bank data).
