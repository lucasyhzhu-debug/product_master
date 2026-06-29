# Staff Review: SPEC — Ordering screen B2B subscription-credit UX (Slices 1–3)

**Date:** 2026-06-29
**Plan:** `docs/superpowers/specs/2026-06-29-ordering-subscription-credit-ux-SPEC.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Plan Structure:** SPEC (pre-plan design doc) — reviewed for architecture correctness + what the PLAN must incorporate before code.

---

## 1. Summary

**Overall Assessment:** Approve (with 1 Critical the plan MUST encode)

The spec is well-grounded — file:line citations are accurate, the open questions are resolved, and the live bug is correctly diagnosed (two facets). Grounding against the real code surfaced **one genuine money-path correctness gap in Slice 2** (the credit reservation must be re-derived on edit) and **a large reuse win** (Slice 2 can lean on existing `itemCrud` mutations + `resyncWeekPlanFromOrders` instead of a new edit mutation). Slice 1 (read queries + UI) and Slice 3 (existing `createCreditFundedOrder`) are low-risk. Evidence gate (§4.9): the live bug has a screenshot + grounded code citation → proceed on merits.

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location |
|---|-------|----------|----------|
| 1 | Editing a credit-funded subscription order must re-derive/cap `subscriptionCreditApplied`, else recognition over-draws and available-credit under-reports | Logic / Money | Slice 2 |

### Issue 1: Slice 2 must adjust the credit RESERVATION, not just items/totals

The spec says Slice 2 does "NO recognized-revenue/drawdown correction (out of scope)." That is correct for the *recognized* ledger — but a credit-funded subscription order carries an **un-recognized reservation** in `orders.subscriptionCreditApplied`, and two code paths consume it:

- **Recognition at delivery** (`convex/subscriptions/recognition.ts:73`):
  `const drawdownAmount = order.subscriptionCreditApplied ?? order.totalAmount;`
  If Slice 2 reduces the order's items (lowering `totalAmount`) but leaves
  `subscriptionCreditApplied` at the original higher value, delivery draws the **stale,
  too-large** reservation from the pool.
- **Available-credit math** (`convex/subscriptions/creditReservation.ts`):
  `availableCredit = max(0, pool.creditRemaining − Σ subscriptionCreditApplied)` over
  un-recognized orders. A stale-high reservation **under-reports** headroom (blocks
  legitimate new orders).

This is exactly Pitfall #23's reservation model. **Recommendation:** the Slice 2 edit
flow MUST, when the edited order has `subscriptionCreditApplied > 0` and no `by_order`
ledger row (un-recognized), re-derive the reservation to the new eligible total (cap to
the reduced `totalAmount`, or recompute via the same eligible-line split used at
creation). Add a TDD test: reduce a credit-funded order from N→M pieces, assert
`subscriptionCreditApplied` drops accordingly AND `computeWeekAvailableCredit` rises by
the freed amount. **This is why Slice 2 is a triple-review money-path slice.** A
non-credit-funded subscription order (no reservation) needs no reservation adjustment —
guard on `subscriptionCreditApplied > 0`.

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Slice 2: reuse `itemCrud` mutations + `resyncWeekPlanFromOrders`, don't rebuild | H | L |
| 2 | Decide Slice 2 edit roles + fix the auth gap on reused mutations | H | M |
| 3 | Resolve which week funds `creditRemaining` in the decoupled selector (no due-date yet) | M | L |
| 4 | Decide dropdown-fix scope across `OrderForm.tsx`/`OrderFormPOS.tsx` (Pitfall #20) | M | L |

### Improvement 1: Slice 2 — reuse existing item-edit machinery
`convex/orders/mutations/itemCrud.ts` already has `updateItemQuantity` (line 269),
`removeItem` (111), `replaceItems` (170) — `updateItemQuantity` already updates
`orderItems`, the `orderItemProduction` records (via
`updateProductionRecordsForQuantityChange`), recalculates order totals + `finalTotal`,
and clears the voucher. So Slice 2 should be a **thin orchestrator**: guard
(undelivered + subscription order) → apply the item reductions via the existing
mutation(s) → **adjust the reservation (Critical #1)** → `resyncWeekPlanFromOrders`. Do
NOT author a from-scratch edit mutation. The plan's Task List should name `itemCrud`
reuse explicitly.

### Improvement 2: Slice 2 roles + the auth gap
`resyncWeekPlanFromOrders` is `roles: ["manager","admin"]`; the `itemCrud` mutations are
**plain `mutation` with no auth at all** (pre-existing). Decide who can edit an
undelivered subscription order from `OrderSlideOver`/`OrderDetail` — if order_staff can,
either the new Slice 2 orchestrator must be `protectedMutation` with
`["order_staff","manager","admin"]` AND `resyncWeekPlanFromOrders` widened to match
(Pitfall #19), or Slice 2 stays manager/admin. Recommend the new orchestrator be a
single `protectedMutation` that internally does the work (so the plain `mutation` auth
gap isn't widened further). The plan must state the chosen role set.

### Improvement 3: `creditRemaining` in the decoupled selector
`getSubscriptionCreditContext` resolves the funding week via `dueDate`. The Slice 1
selector shows on customer-select, before a due date exists. The new
`listActiveSubscriptionsForCustomer` must either (a) resolve `creditRemaining` against
the **current open week** (today WIB, status paid/delivering) — recommended, matches the
operator's mental model — or (b) omit `creditRemaining` from the selector until a due
date is set and let the existing per-line banner fill it in. Pick (a); document that the
figure is "this week's remaining."

### Improvement 4: dropdown-fix scope (Pitfall #20)
`OrderForm.tsx` and `OrderFormPOS.tsx` also call `useCustomerSearch`. The **search-query
matching fix** (phone/whatsapp/altPhone normalization) benefits all consumers
automatically (shared query). The **`[B2B]`/companyName render** is per-component. Decide
whether the render changes mirror into those two surfaces now or are OrderCreate-only for
this slice; state it in the plan to avoid a silent half-fix.

## 4. Refinements (Optional)
- `customerType` is **optional** in schema — the `[B2B]` test treats `undefined` as
  not-B2B (already noted in spec). ✓
- `altPhone` (a 3rd number field) is included in matching/dedup (already noted). ✓
- Edge: reducing an order whose production already started (balls filled but not
  delivered) — `updateProductionRecordsForQuantityChange` should handle it; add a test
  for reduce-below-filled-count.

## 5. Duplication Analysis
| Code | Location | How to use |
|------|----------|------------|
| `updateItemQuantity`/`removeItem`/`replaceItems` | `convex/orders/mutations/itemCrud.ts` | Slice 2 item edits (totals + production already handled) |
| `resyncWeekPlanFromOrders` | `convex/subscriptions/resyncPlan.ts` | Slice 2 schedule resync after edit |
| `createCreditFundedOrder` + `getCreditOrderWhatsappDraft` | `convex/subscriptions/creditOrder.ts` | Slice 3 draw-down (already wired `OrderCreate.tsx:265`) |
| `getSubscriptionCreditContext` + `computeWeekAvailableCredit` | `convex/subscriptions/queries.ts`, `creditReservation.ts` | Slice 1 per-line detail (unchanged); reservation netting |
| `SubscriptionCreditBanner` detail render | `src/components/orders/SubscriptionCreditBanner.tsx` | Slice 1 — reuse split detail; lift sub-CHOICE up to Customer card |
| `textSearch` | `convex/lib/queryHelpers.ts` | Replace generic call with customer-specific normalized search |

## 6. Phase / Wave Accuracy
Slices are correctly ordered and independent. Slice 1 = read queries + UI (low risk).
Slice 2 = money-path (Critical #1, triple-review). Slice 3 = mostly Slice 1 selector +
existing mutation. Build order Slice 1 → 2 → 3 is sound; 1 and 3 share the selector so 3
naturally follows 1.

## 7. Specialist Agent Recommendations
| Slice | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Backend queries/mutations | `convex-backend` | project-primed Convex schema/query/mutation work |
| Frontend selector/dropdown | `react-ui-builder` / `frontend-integrator` | UI + hook wiring |
| Tests | `tdd-test-architect` | convex-test + vitest money-path tests |
| Between-wave gate | `code-auditor` | type + pattern compliance |

## 8. Git Workflow Assessment
Feature branch per slice (CLAUDE.md). `npm run build` before merge. Triple-review Slices
2 & 3. CHANGELOG after each merge. Convex auto-deploys on merge (marker-tag drift). ✓

## 9. Documentation Checkpoints
- CHANGELOG.md after each slice merge.
- API_REFERENCE.md — new `listActiveSubscriptionsForCustomer` + Slice 2 edit mutation.
- CLAUDE.md Pitfall #23 — extend the note to cover reservation adjustment on edit.
- ROADMAP.md — record the slice at plan-land time.

## 10. Testing Plan Assessment
**Verdict:** Adequate (with Critical #1's reservation test added)
- Slice 1: search-matching unit tests (phone-in-whatsapp hits; normalized digits);
  `listActiveSubscriptionsForCustomer` role tests (order_staff allowed, kitchen rejected);
  selector auto-select-when-one render test.
- Slice 2: **reservation re-derive test (Critical #1)**; undelivered-only guard; resync
  after edit; reduce-below-filled-count edge.
- Slice 3: credit-funded order draws down pool (largely existing coverage).

## 11. Edge Cases to Address
- [ ] `customerType === undefined` (legacy) → not B2B
- [ ] Customer with multiple active subscriptions (radio, no default)
- [ ] Customer with exactly one (auto-select; selector still renders a control)
- [ ] Credit-funded order edited to fewer pieces → reservation drops, pool frees
- [ ] Non-credit-funded subscription order edited → no reservation touch
- [ ] Editing an already-delivered/recognized order → blocked (undelivered-only guard)
- [ ] Phone formatting variants (`0812…` vs `+62812…`) match as one identity

## 12. Approval Conditions
**To approve, the PLAN must:**
1. Encode Critical #1 — reservation re-derivation on Slice 2 edits, with a test.

**Recommended before implementation:**
1. Slice 2 reuses `itemCrud` + `resyncWeekPlanFromOrders` (Improvement 1).
2. State Slice 2 role set + handle the reused-mutation auth gap (Improvement 2).
3. Resolve selector `creditRemaining` week (Improvement 3).
4. State dropdown-fix scope across order surfaces (Improvement 4).

---

*Generated by /staffreview*
