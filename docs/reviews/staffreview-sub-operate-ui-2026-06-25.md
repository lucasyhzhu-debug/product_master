# Staff Review — Subscription Operate UI (deliver/recognize, top-up, reconcile, out-of-credit)

**Date:** 2026-06-25
**Branch:** `feature/subscription-operate-ui` (`6168c016..f7a74d78`)
**Artifacts:** plan `docs/superpowers/plans/2026-06-25-subscription-operate-ui-deliver-topup-reconcile.md`, spec `docs/superpowers/specs/2026-06-25-subscription-operate-ui-deliver-topup-reconcile-SPEC.md`
**Gate:** Implementation review (post-execution, pre-merge)
**Reviewer:** Staff/Principal engineer

---

## Summary

**Overall: Approve with fixes.** The implementation is a faithful, disciplined rendering of the plan — all nine tasks (T1–T9) shipped, every new backend function is `protectedMutation`/`protectedQuery` gated `roles: ["manager","admin"]`, the money-critical logic is isolated in unit-tested pure helpers (`computeTopupDelta`, `isOverCredit`, `assertReconcileNote`, `isDeliverableSubscriptionStatus`), the dual-surface rule (Pitfall #20) is honored on both `OrderSlideOver.tsx` and `OrderDetail.tsx`, and the schema touch is a single additive optional field. The seam discipline ("additive only, read-only orders stay read-only, scoped actions inside the lock block") holds. The known R1 recognition-timing flaw is surfaced honestly — in the UI, CHANGELOG, and a UAT gate — rather than silently shipped.

The decision to ship **Path A (split) behind a labeled caveat + UAT gate** rather than deferring it is **acceptable**, with one caveat of my own (see C1): the in-UI warning describes the *intended* behavior, not the *actual* idempotency-suppression behavior, so the caveat as written can mislead the operator who reads it.

Findings below: 1 Critical (doc-accuracy on a financial caveat), 3 Important, 3 Minor, 2 Nitpick. None block the architecture; C1 and I1 should be fixed before the UAT sign-off is trusted.

---

## Critical Issues

### C1 — The Split button's R1 caveat text contradicts the actual code behavior (financial-trust risk)

`OrderSlideOver.tsx:1355` / `OrderDetail.tsx:1509` render:

> "Note: splitting recognizes the covered sale now (at split), not at delivery."

That is true. But the *risk* the plan flagged (R1) is not "recognition happens early" — it is that the at-split drawdown **suppresses** the later at-delivery drawdown because both key on `creditLedger.by_order`. Confirmed against source: `splitScheduledOrderOnCredit` posts a `drawdown` with `orderId: order._id` (`outOfCredit.ts:133-141, 197-205`), and `recognizeSubscriptionDelivery` returns early if **any** `creditLedger.by_order` row exists (`recognition.ts:46-50`). So after a Split, a subsequent **Mark delivered** on the same covered order is a silent no-op — `markSubscriptionDelivered` will report `recognized: true` (`delivery.ts:418-424`) even though it posted nothing new.

The operator-facing consequence: an operator who splits and then (reasonably) presses "Mark delivered" gets a success toast ("Delivery recognized — sale posted.") with **no second drawdown** — which is *correct* accounting but *contradicts* the very button they just clicked. The caveat text tells them the opposite of what the idempotency guard does. This is exactly the class of money-flow ambiguity the R1 gate exists to catch, and the UI note as written does not convey it.

**Fix (doc/string only, no logic change):** change the note to state the actual behavior, e.g. "Splitting recognizes the covered sale immediately. After a split, 'Mark delivered' on this order is a no-op (the drawdown is already posted) — do not expect a second recognition." This keeps Path A shipped behind the caveat (acceptable) while making the caveat *true*. The UAT §5.5 R1 check (`uat-…-2026-06-25.md:945`) already verifies "EXACTLY ONE drawdown" — good — but the operator reading the live UI should not be told something the code disproves.

**On the ship-vs-defer judgment:** shipping Path A behind a labeled caveat + a blocking UAT item is defensible *because* the suppression direction is the safe one (one drawdown, not two — no double revenue). Had the idempotency guard keyed such that both fired, deferral would be mandatory. So: keep it shipped, but fix the caveat string per above before UAT sign-off, or the human tester validates a UI claim that is false.

---

## Improvements (Important)

### I1 — `docs/API_REFERENCE.md` documents three signatures that do not match the shipped code

The API doc block (`API_REFERENCE.md:627-702`) drifted from the implementation on all three new pure helpers and the query return shape:

1. `getOrderCreditStatus` documented as `kind: "subscription" | "non_subscription"` (`:688`). Actual return is `kind: "scheduled" | "adhoc"` with a `"none"` sentinel (`queries.ts:478-535`). The documented union does not exist in the code.
2. `computeTopupDelta(oldDays: PlanDay[], newDays: PlanDay[]): number` (`:660`). Actual signature takes a structured object `{ currentQtyByProduct, newQtyByProduct, unitPrice, productNameByProduct }` and returns `{ addedLines, deltaTotal }` (`amend.ts:248-271`).
3. `isOverCredit(creditRemaining, orderTotal)` (`:700`) — argument order is reversed; actual is `isOverCredit(orderFinalTotal, creditRemaining)` (`queries.ts:464`). For a doc whose entire job is to say "true when total > remaining," a reversed arg order is a real trap for the next caller.

Also `amendConfirmedWeek` is documented as returning `{ topupInvoiceId, delta }` (`:654`) but actually returns `{ topupInvoiceId, deltaTotal, addedLines }` (`amend.ts:364`). Fix the doc block to match the code; this is the canonical API reference that the next phase's authors will trust.

### I2 — `OrderDetail` over-subscribes `getOrderCreditStatus` for every order (surface divergence from `OrderSlideOver`)

`OrderSlideOver.tsx:178` guards the query with `isManagerOrAdmin && isSubscriptionOrder && orderId`. `OrderDetail.tsx:126` guards only `isManagerOrAdmin && orderId` — `isSubscriptionOrder` is derived later (`:223`, after the hook, so it cannot be referenced at the hook per Rules of Hooks). The code comment at `:122-124` acknowledges this. Consequence: for a manager, **every** order detail page fires `getOrderCreditStatus`, which loads the order, (returns `none` early for non-subscription — `queries.ts:489`), so it is cheap and correct, not a bug. But it is a real-time subscription per order-detail mount that the slide-over avoids, and it is an un-mirrored divergence in two surfaces the project explicitly wants kept in lockstep (Pitfall #20). Prefer hoisting a cheap `Boolean(order?.subscription_id)` check (or reading `order` once before the hook) so both surfaces gate identically. Low load impact today; flagged because "the two order surfaces diverge" is the exact maintenance hazard Pitfall #20 warns about.

### I3 — `amendConfirmedWeek` recomputes `currentQtyByProduct` from `week.plannedDays`, but the diff is taken against the *grid's current local state*, which on first amend equals the server plan → first save with no edit throws

`SubscriptionSchedulePage.tsx:1634` builds `days` from `displayPlan` (the grid's current state). On entering amend mode with no edits, `displayPlan` is derived from `week.plannedDays`, so `computeTopupDelta` yields `deltaTotal === 0` and the mutation throws `"Amend supports increases only…"` (`amend.ts:335-337`). That is the *intended* guard, but the UX path is: operator clicks "Amend week", clicks "Save amendments" without changing anything, and gets an error toast. Acceptable for v1 (the plan accepts increases-only), but worth a cheap client guard (disable "Save amendments" until the plan total exceeds the funded total) so the operator isn't shown a backend error for a no-op. Functional, not a correctness bug — listed Important because it is a guaranteed first-touch rough edge on a money action.

---

## Refinements (Minor)

### M1 — `reconcileWeek` reconcile-note is persisted to the week row but NOT stamped onto the reconcile ledger note

The spec (SPEC `:71`) says "persist it in the existing `ctx.db.patch(week._id, …)` (**and stamp onto the reconcile ledger note for traceability**)." The implementation persists `reconcileNote` to `subscriptionWeeks.reconcileNote` (`reconcile.ts:294`) but does not thread it into any ledger-entry `note`. Per CRM principle C10 (money traceable), the operator's *reason* for an expiry/refund is exactly the kind of context that belongs on the ledger row, not only on the mutable week doc. Minor because the note is captured and queryable; flagged because the spec called for both and only one landed.

### M2 — Reconcile button visibility uses a brittle inline cast

`SubscriptionWeeklyInvoicePage.tsx:1762`: `(['paid', 'delivering'] as const).includes(week.status as 'paid' | 'delivering')`. The `as` cast defeats the type system — if a future status string is added, this silently won't match and gives no compile signal. A small `isReconcilable(status)` predicate (mirroring the backend `["confirmed","invoiced","paid","delivering"]` amendable set and the reconcile-eligible set) would centralize the status vocabulary and remove the cast. The backend already gates reconcile correctly (closed/reconciled rejected, `reconcile.ts:135-140`), so this is UI-affordance hygiene only.

### M3 — `getOrderCreditStatus` `kind` field is dead weight (cosmetic, already noted in plan staffreview I-c)

`kind` collapses to `"adhoc"` when `canApplyCredit` else `"scheduled"` (`queries.ts:525`), but both buttons are independently gated by `canSplit`/`canApplyCredit` and no consumer reads `kind`. It is a returned field with no reader. Either drop it or document that it is advisory. Carrying it is harmless but it is the kind of unused surface that invites a future consumer to trust a label that was never load-bearing.

---

## Nitpicks

### N1 — Loading state for `creditStatus` is implicit, not designed (D12)

The out-of-credit block renders only when `creditStatus && creditStatus.isOverCredit` (`OrderSlideOver.tsx:629`, `OrderDetail.tsx:383`). While `creditStatus === undefined` (Convex loading), nothing renders — which is fine functionally, but D12 asks for *designed* loading states on CRM surfaces. The over-credit flag silently popping in after load is acceptable for a secondary affordance; noting it only for D12 completeness. The Reconcile dialog and amend flows do handle empty/error states well.

### N2 — `markSubscriptionDelivered` returns `recognized: true` even when recognition was suppressed

`delivery.ts:418-424` derives `recognized` by checking whether *any* `creditLedger.by_order` row exists after the call — which is `true` even if the row was posted earlier by a split (see C1). The return value therefore means "a ledger row exists for this order," not "this call recognized the sale." No consumer currently branches on it, so harmless, but the field name overpromises. Tie-in to C1: if the caveat string is fixed, also consider returning `{ recognized, alreadyRecognized }` or renaming, so the signal isn't misleading to a future caller.

---

## What was checked and is correct

- **Plan fidelity:** T1–T9 all present; file-for-file match to the plan's File Structure; wave/serialization (T5→T8 on shared order files) respected — both surfaces show Mark-delivered above the out-of-credit block inside the lock block.
- **Gating:** all four backend fns `roles: ["manager","admin"]`; T8's `getOrderCreditStatus` skip-guarded with `isManagerOrAdmin` (Pitfall #19) — the T8 commit `11c15460` explicitly added this. order_staff cannot mount the manager query → no page crash.
- **Read-only invariant:** scoped actions are added *inside* the existing violet lock block; no generic edit/status/cancel re-enabled. `!isSubscriptionOrder` guards on the destructive actions are untouched.
- **Integer IDR / server-side delta (C10):** `computeTopupDelta` runs server-side via `computeLineTotal` (`Math.round`); no client re-keying of a money total. Toasts format with `toLocaleString('id-ID')` for display only.
- **Idempotency:** `markSubscriptionDelivered` re-press is a no-op via `recognizeSubscriptionDelivery`'s `by_order` guard (verified in source) — modulo the C1 caveat-wording issue.
- **Tests:** 4 new pure-fn suites + 1 dialog render smoke test (compulsory-comment gate) — matches the repo's "extract pure logic, unit-test that, thin Convex wrappers verified by type-check + UAT" convention. No `reconcileWeek` caller drift (grep-confirmed in plan staffreview; the new required `reconcileNote` arg breaks nothing).
- **Schema:** single additive `subscriptionWeeks.reconcileNote: v.optional(v.string())`; `docs/SCHEMA.md` updated. No index change, no `creditLedger` mutation, no deferred-revenue change.
- **Honest risk handling:** R1/R2/R3 carried into CHANGELOG "Notes" and the UAT checklist as blocking UNTESTED items — not claimed passed.

---

## Verdict

**Approve for merge after C1 (caveat-string fix) and I1 (API_REFERENCE correction).** The architecture is sound and additive; the financial flow is shipped behind an honest gate with the *safe* idempotency direction. The single real risk is operator confusion from a caveat string that contradicts the code — a one-line fix. Everything else is hygiene the next phase will thank you for.

*Generated by staffreview (implementation gate)*
