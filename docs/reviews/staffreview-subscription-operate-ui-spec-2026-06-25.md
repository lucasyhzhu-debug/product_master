# Staff Review (SPEC gate): Subscription operate UI — deliver/recognize, top-up, reconcile, out-of-credit

**Date:** 2026-06-25
**Artifact:** `docs/superpowers/specs/2026-06-25-subscription-operate-ui-deliver-topup-reconcile-SPEC.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Gate:** Spec (pre-plan). Findings grounded in real code via two Explore sweeps (backend API + frontend surfaces).

---

## 1. Summary

**Overall Assessment:** Revise (then proceed to plan).

The spec's core premise — "all backend exists, UI just wires it, **no backend changes**" — is **largely true but wrong in three load-bearing places** uncovered by grounding the claims against real code:

1. **Reconcile compulsory comment (operator decision 3) has nowhere to live.** `reconcileWeek` accepts only `{ subscriptionWeekId, shortfallFault }` — no note arg — and `subscriptionWeeks` has no field to persist a reconcile reason. A required comment ⇒ a thin schema field + a required mutation arg. This is a real (small) backend + schema change.
2. **"Mark delivered" cannot cleanly reuse the existing path.** `recognizeSubscriptionDelivery` is an internal helper fired as a side-effect of `moveForward` — a **bare `mutation` with no role guard** that advances exactly **one** `FORWARD_TRANSITIONS` step. A manager-gated, idempotent, single-press "Mark delivered" should be a thin `protectedMutation` wrapper, not a relabeled call to the unguarded generic mutation.
3. **Reconcile entry point is mis-placed.** `getFundingDashboard` returns only `confirmed|invoiced` weeks; reconcilable weeks (`paid`/`delivering`) never appear there. The Reconcile action must live on the per-week surface (which loads any week status), or the dashboard query must be widened.

Plus one API-table inaccuracy (`markTopupInvoicePaid` takes `invoiceId` only) and one money-safety concern (amend→top-up delta should be computed server-side, CRM principle C10).

None of these block the phase; they reshape it from "pure UI wiring" to "thin backend additions + UI". Address them in the spec now so the plan is honest.

---

## 2. Critical Issues (Must Fix in spec)

| # | Issue | Category | Location in spec |
|---|-------|----------|------------------|
| C1 | Reconcile compulsory comment has no backend home | Schema/Logic | §In scope C, AC §6 |
| C2 | "Mark delivered" wiring relies on an unguarded, single-step generic mutation | Logic/Security | §In scope A, Backend API table row 1 |
| C3 | Reconcile entry point (`getFundingDashboard`) excludes reconcilable weeks | Logic | §In scope C |
| C4 | Spec asserts "no backend changes"; reality needs thin additive backend (C1+C2) | Scope accuracy | §Goal, §Out of scope |

### C1 — Reconcile compulsory comment needs a thin schema + arg addition
`convex/subscriptions/reconcile.ts:127` registers:
```ts
reconcileWeek = protectedMutation({
  roles: ["manager", "admin"],
  args: { subscriptionWeekId: v.id("subscriptionWeeks"),
          shortfallFault: v.union(v.literal("none"), v.literal("cafe"), v.literal("frollie")) },
```
No note/reason arg; the only notes posted are auto-generated ledger strings (lines 212/236/264/274). `subscriptionWeeks` (written at reconcile.ts:280–286) has no `reconcileNote` field.

**Recommendation:** add (thin, additive):
- `subscriptionWeeks.reconcileNote: v.optional(v.string())` in `convex/schema.ts`.
- `reconcileNote: v.string()` (required) to `reconcileWeek` args; persist it in the existing `ctx.db.patch(week._id, {...})`. Optionally also stamp it onto the reconcile ledger entries' note for traceability (C10).
- Update `docs/SCHEMA.md`. This is the ONE schema change in the phase — call it out explicitly.

### C2 — "Mark delivered" should be a thin `protectedMutation`, not the bare `moveForward`
`recognizeSubscriptionDelivery` (`convex/subscriptions/recognition.ts:37`) is an internal helper, idempotent via:
```ts
const already = await ctx.db.query("creditLedger")
  .withIndex("by_order", q => q.eq("orderId", orderId)).first();
if (already) return;
```
It fires from `moveForward` (`convex/orders/mutations/statusUpdates.ts:535`), `updateStatus` (:226), and `forceComplete` (:759). `moveForward` is a **bare `mutation`** (no `protectedMutation`, no role check) and advances exactly one step (`BeingPrepared → AwaitingDelivery`). Consequences:
- A subscription order at `PaymentReceived` would need two `moveForward` calls; the button's precondition is unclear.
- Calling an unguarded generic mutation from a "manager+admin only" action means auth is UI-only (Pitfall #19 spirit: enforce server-side).

**Recommendation:** add a thin `markSubscriptionDelivered({ orderId })` `protectedMutation` (`roles: ["manager","admin"]`) in the subscriptions backend that: (a) asserts the order is a subscription order (`order.subscriptionId` present) in a deliverable status, (b) transitions it to `AwaitingDelivery` reusing the existing recognition path, (c) calls `recognizeSubscriptionDelivery`. Idempotency is already guaranteed by the `creditLedger.by_order` guard, so re-press is a no-op. Keep the generic order surfaces read-only; this is the ONE scoped action.

### C3 — Reconcile must be reachable for post-payment week statuses
`getFundingDashboard` (`convex/subscriptions/scheduling/queries.ts:75`) filters to `status === "invoiced" || status === "confirmed"`. Weeks become reconcilable only after `paid` → `delivering`, which this query never returns. A Reconcile button on the funding dashboard would render against rows that can't be reconciled.

**Recommendation:** put the Reconcile action on the **per-week surface** — `SubscriptionWeeklyInvoicePage.tsx` (loads any week via `getById`/`getPlanningWeek`) or `SubscriptionSchedulePage.tsx` (already renders the full status set incl. `delivering`/`reconciled`). Gate visibility on a reconcilable status. (Optionally, a later improvement widens `getFundingDashboard` to surface "needs reconcile" — out of scope here.)

### C4 — Restate the scope honestly
The spec's §Goal ("No backend logic changes beyond thin wiring") and §Out-of-scope ("Any change to … ledger ops, or pure credit-math") are fine, but the spec must add a short **"Thin backend additions"** subsection enumerating C1 (schema field + reconcile arg) and C2 (the `markSubscriptionDelivered` wrapper) so the plan doesn't pretend these are pure-frontend.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| I1 | Amend→top-up delta computed **server-side**, not client subtraction | H | M |
| I2 | "Over-credit" detection needs a defined source (derive from `getWeekPool`) | M | M |
| I3 | API table fix: `markTopupInvoicePaid` takes `invoiceId` only | L | L |
| I4 | Out-of-credit result surfacing: define what the operator sees post-action | M | L |

### I1 — Server-side amend delta (money safety, CRM C10)
Decision 2 (Amend-week auto-computes the top-up delta). `createTopupInvoice` (`invoicing.ts:307`) takes explicit `addedLines: {productName,qty,unitPrice,lineTotal}[]`. If the UI subtracts "new plan − funded" client-side, it re-keys money totals — violating C10 ("read the derived pool, never re-key a total") and risking rounding drift. **Recommend a thin backend `amendConfirmedWeek`/`computeTopupDelta` helper** that diffs the amended plan against the funded weekly total server-side and produces `addedLines` (or calls `createTopupInvoice`). Keep credit math in the backend where it's unit-tested.

### I2 — Define the over-credit flag source
Decision 4 (operator button "when an order is flagged over-credit"). Nothing today returns that flag. The remaining pool comes from `getWeekPool → deriveCreditPool().creditRemaining`. The UI must compare an order's `finalTotal` against `creditRemaining`. Specify where this derivation happens (ideally a small query/selector returning `isOverCredit` so the button condition isn't ad-hoc client math).

### I3 — API table correction
`markTopupInvoicePaid` (`invoicing.ts:342`) args are `{ invoiceId: v.id("invoices") }` only — it resolves the week internally. Fix the spec's Backend API table row (currently "… invoiceId/weekId").

### I4 — Out-of-credit result UX
`splitScheduledOrderOnCredit` returns `{ coveredOrderId, topupInvoiceId, drawdownAmount }` and **cancels the order when `covered === 0`**; `applyPartialCreditToAdHocOrder` returns `{ coveredAmount, remainderAmount }`, sets `fundingSource:"deposit"`, leaves status `AwaitingPayment`. The spec should state what the operator sees after pressing (toast + resulting links/badges), since these mutate money + order state.

---

## 4. Refinements (Optional)

- Add a `deliveredAt` timestamp when marking delivered (consistency with other status stamps), if a column exists.
- Reconcile dialog should echo the computed outcome (rollover/expiry/refund) **before** commit if cheap, or immediately after via the mutation return (`{ leftover, expired[], carried[], refundDue }`).

---

## 5. Duplication / reuse (leverage, don't rebuild)

| Code | Location | Use for |
|------|----------|---------|
| `VoidReasonDialog` (required-textarea, submit disabled until `reason.trim()`) | `src/components/shared/VoidReasonDialog.tsx` | Reconcile **compulsory comment** dialog — exact pattern |
| `MarkPaidButton` (loading flag + `toast` + `getErrorMessage`) | `src/pages/crm/CrmFundingDashboardPage.tsx:92` | Every new mutation button |
| `isManagerOrAdmin` gate | `OrderSlideOver.tsx:137`, `OrderDetail.tsx:102` | "Mark delivered" visibility |
| `deriveCreditPool` | `convex/subscriptions/creditMath.ts:29` | Over-credit / pool reads (I2) |
| `getErrorMessage` | `src/lib/utils.ts` | Error toasts |
| `WeekCalendarGrid` `locked` prop | `src/components/crm/WeekCalendarGrid.tsx` | Amend-mode toggle (flip `locked`) |

---

## 6. Dual-surface (Pitfall #20)

"Mark delivered" is an **order-level** action ⇒ MUST land in BOTH `src/components/orders/OrderSlideOver.tsx` (subscription lock block ~lines 578–607) AND `src/pages/OrderDetail.tsx` (lock block ~lines 326–357). Both already mirror the read-only lock and both expose `isManagerOrAdmin`. Treat a change to one as incomplete until the mirror lands.

---

## 7. Access control (Pitfall #19) — clean

All CRM surfaces (`SubscriptionSchedulePage`, `SubscriptionWeeklyInvoicePage`, `CrmFundingDashboardPage`) are routed under `requiredPermission="canAccessCrm"` → manager+admin. All backend fns touched (`reconcileWeek`, `createTopupInvoice`, `markTopupInvoicePaid`, out-of-credit, `getWeekPool`, `getFundingDashboard`) are `protectedMutation/Query` with `roles: ["manager","admin"]` — already aligned. The new `markSubscriptionDelivered` (C2) must also be `["manager","admin"]`. The "Mark delivered" button lives on order surfaces reachable by `order_staff`/`kitchen`; gate the **button** to manager+admin and rely on the protected mutation server-side. Because it's a mutation (fires on click, not a query subscribing on mount), it won't crash non-manager mounts — Pitfall #19 is satisfied.

---

## 8. Testing plan (for the plan to honor)

**Verdict for spec:** acceptable; the plan must add:
- Backend unit tests: `markSubscriptionDelivered` (happy, re-press no-op, non-subscription reject, role reject); `reconcileWeek` with `reconcileNote` (persisted + required-arg validation); amend-delta helper (I1) with known-value money assertions.
- Frontend: smoke render of each new dialog/button incl. empty/loading/error (D12); required-comment disables submit; over-credit flag conditional render.
- Regression: existing 52 subscription + 60 matchEngine tests must stay green; `reconcileWeek` arg addition will touch existing reconcile tests (update call sites).

---

## 9. Documentation checkpoints

- `docs/SCHEMA.md` — `subscriptionWeeks.reconcileNote` (C1).
- `docs/API_REFERENCE.md` — `markSubscriptionDelivered`, `reconcileWeek` arg change, amend helper.
- `docs/CHANGELOG.md` — at execution/merge.
- CLAUDE.md Pitfall #20 already covers the dual-surface rule; no new entry needed unless a new gotcha emerges.

---

## 10. Approval conditions

**To approve the spec → plan transition, the spec must:**
1. Add a **"Thin backend additions"** section enumerating C1 (`reconcileNote` schema field + required reconcile arg) and C2 (`markSubscriptionDelivered` protectedMutation). (C4)
2. Move the **Reconcile entry point** to a per-week surface and say so. (C3)
3. Fix the **API table** (`markTopupInvoicePaid` = `invoiceId` only). (I3)
4. Record decisions 1–4 (resolved) and the amend-delta **server-side** stance (I1) + over-credit flag source (I2).

**Recommended before implementation:** I1, I2, I4 folded into acceptance criteria.

---

*Generated by /staffreview (spec gate)*
