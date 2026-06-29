# Staff Review: PLAN — Ordering Subscription-Credit UX (Slices 1–3)

**Date:** 2026-06-29
**Plan:** `docs/superpowers/plans/2026-06-29-ordering-subscription-credit-ux.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Plan Structure:** ✅ Validated (Goal, File Changes, Waves, Testing, Success Criteria, Rollback all present; Task List + Execution Strategy present).

---

## 1. Summary

**Overall Assessment:** Approve (after fixing 1 Critical — the T8 status guard)

The plan is well-grounded, reuses shipped machinery (`itemCrud`, `resyncWeekPlanFromOrders`, `createCreditFundedOrder`), and correctly encodes the spec's Critical (reservation re-derivation). Verifying the plan's one remaining unverified assumption — the order-status literals used in T8's undelivered guard — found the **allow-list is wrong** (uses legacy statuses, omits the current `PaymentReceived`/`BeingPrepared`). Fixing that to a deny-list aligned with the existing `DELIVERY_DONE_STATUSES` set is the only blocker. Evidence gate (§4.9): the live bug has a screenshot + grounded code citations (`OrderCreate.tsx:424`, `SubscriptionCreditBanner.tsx:135`) → evidence present, reviewed on merits.

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location |
|---|-------|----------|----------|
| 1 | T8 `UNDELIVERED_OK` allow-list uses wrong/legacy status literals | Logic | T8 |

### Issue 1: T8's undelivered-status guard is built on wrong literals

The plan's T8 uses `UNDELIVERED_OK = new Set(["Draft","AwaitingPayment","Confirmed","InProduction","Boxed","Labeled"])`. The real `orders.status` union (`convex/schema.ts:217-235`) is the **Phase-14 simplified model**: `Draft, AwaitingPayment, PaymentReceived, BeingPrepared, AwaitingDelivery, Complete, Cancelled` (+ legacy `Confirmed/InProduction/Boxed/Labeled/Packaging/WaitingShipment/WaitingPickup/CompleteShipped/PickedUp`). So the allow-list:
- **omits the live undelivered statuses** `PaymentReceived` and `BeingPrepared` → a normal confirmed-but-not-shipped order would be wrongly rejected as un-editable.
- lists only legacy statuses that most current orders no longer use.

**Recommendation:** invert to a **deny-list**, reusing the set already defined in `getSubscriptionCreditContext` (`convex/subscriptions/queries.ts:197-207`):

```ts
// Editable = NOT dispatched/complete/cancelled AND not recognized.
const DELIVERY_DONE = new Set([
  "AwaitingDelivery","Complete","WaitingShipment","WaitingPickup","CompleteShipped","PickedUp",
]);
if (order.status === "Cancelled" || DELIVERY_DONE.has(order.status))
  throw new ConvexError(`Order is ${order.status} — only undelivered orders can be edited here`);
```

Better: **export** that set from `queries.ts` (it's currently a private `const DELIVERY_DONE_STATUSES`) and import it in both places — single source, no drift (it already bit this plan once). The `by_order` ledger-row check stays as the recognized-order backstop.

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Export & share `DELIVERY_DONE_STATUSES` instead of re-declaring | M | L |
| 2 | T8's inline resync helper must keep the settled-week guard | M | L |
| 3 | State the `Date.now()`-in-query reactivity note explicitly | L | L |

### Improvement 1: Single-source the delivery-done status set
`DELIVERY_DONE_STATUSES` is private in `queries.ts`. Export it (or move to a small `convex/subscriptions/statusSets.ts`) so T8 and the credit context can't drift. This directly prevents recurrence of Critical #1.

### Improvement 2: Preserve `resyncWeekPlanFromOrders`'s settled-week guard
`resyncWeekPlanFromOrders` throws if `week.status ∈ {reconciled, closed}` (`resyncPlan.ts:28`). When T8 extracts a `resyncWeekPlanInline` helper, it MUST keep that guard, so editing an order whose week was already settled fails loudly rather than silently rewriting a closed plan. Add a test: editing an order in a reconciled week throws.

### Improvement 3: `Date.now()` in the reactive T1 query
T1 uses `Date.now()` to resolve "current week." This is allowed in Convex queries but makes the result depend on wall-clock at evaluation; the week boundary can shift mid-session. Acceptable for "this week's remaining credit" (the operator expects live), and distinct from the scheduled/batch `Date.now()` drift in `lessons_packlist_overdue`. Add a one-line comment so a future reader doesn't "fix" it.

## 4. Refinements (Optional)
- **Pre-existing (out of scope, note only):** `crm.customers.createCustomer` is `roles: ["manager","admin"]`, but `/orders/new` is reachable by `order_staff`, and `CustomerSearch`'s "Create new customer" routes there. An order_staff creating a brand-new customer would hit a Pitfall #19 rejection today — unrelated to this plan, but the plan touches `createCustomer` (T3). Worth a follow-up issue; do NOT widen create-customer roles inside this slice without a separate decision.
- T7: if `OrderForm.tsx`/`OrderFormPOS.tsx` render the dropdown via the shared `CustomerSearch` component (not their own list), T5 already covers them — verify before editing, skip if so (the plan already says this).

## 5. Duplication Analysis
### Existing code to leverage
| Code | Location | How to use |
|------|----------|------------|
| `updateItemQuantity`/`removeItem` math | `convex/orders/mutations/itemCrud.ts` | extract internal helpers; T8 + public mutations both delegate (DRY) |
| `DELIVERY_DONE_STATUSES` | `convex/subscriptions/queries.ts:197` | export + reuse in T8 (Improvement 1) |
| `computeWeekAvailableCredit` | `convex/subscriptions/creditReservation.ts` | T1 + T8 reservation math |
| `resyncWeekPlanFromOrders` | `convex/subscriptions/resyncPlan.ts` | extract `resyncWeekPlanInline`; keep settled guard |
### Potential duplication risks
- Copy-pasting item-edit math into T8 instead of extracting shared helpers — the plan's note already forbids this; reviewer concurs (enforce in code review).

## 6. Phase / Wave Accuracy
| Wave | Assessment | Notes |
|------|------------|-------|
| S1-A (T1/T2/T3) | Good | T2→T3 ordering for `phone.ts` correctly called out |
| S1-B (T4/T5/T6/T7) | Good | T6 depends on T4; codegen barrier before frontend is correct |
| S2-A (T8/T9) | Good | T8 solo on critical path; T9 follows role decision |
| S2-B (T10/T11) | Good | dual-surface parallel, different files |
| S3 (T12) | Good | reuses Slice 1 selector + existing mutation |

**Ordering issues:** none. **Missing phases:** none.

## 7. Specialist Agent Recommendations
Matches the plan's Task List Agent column: `convex-backend` (T1-T3,T8,T9), `frontend-integrator` (T4), `react-ui-builder` (T5-T7,T10-T12), `code-auditor` (gate). All exist in the roster. ✓

## 8. Git Workflow Assessment
| Check | Status |
|-------|--------|
| Feature branch specified | ✅ one per slice |
| Branch naming follows convention | ✅ `feature/sub-credit-ux-sliceN` |
| Merge strategy documented | ✅ squash-PR per slice |
| `npm run build` before merge | ✅ |
| Commit-per-task | ✅ |
| Rollback | ✅ per-slice revert; search rewrite isolated |
| Deployment order | ✅ Convex auto-deploy on merge; no schema change |

## 9. Documentation Checkpoints
Plan covers CHANGELOG (per slice), API_REFERENCE (new fns), CLAUDE.md Pitfall #23 extension, ROADMAP. ✓ Add SCHEMA.md: **not needed** (no schema change).

## 10. Testing Plan Assessment
**Verdict:** Adequate (add Improvement 2's settled-week test + correct the T8 status test to use real literals)
| Layer | What | Type | Status |
|-------|------|------|--------|
| Backend | listActiveSubscriptionsForCustomer / search / dedup / editOrder | convex-test | planned |
| Frontend | dropdown flag / selector auto-select / add-more prompt | component | planned |
| Manual | live ordering flow | persona-UAT | planned (close-out) |

### Missing test coverage (must add)
| # | Missing test | Why | Approach |
|---|--------------|-----|----------|
| 1 | edit rejected on `AwaitingDelivery`/`Complete` (real literals) | Critical #1 fix verification | seed order in each delivered status, assert throw |
| 2 | edit rejected in reconciled/closed week | Improvement 2 | seed settled week, assert throw |

## 11. Edge Cases to Address
- [ ] Order in `PaymentReceived`/`BeingPrepared` IS editable (Critical #1)
- [ ] Order in `AwaitingDelivery`/`Complete` is NOT (deny-list)
- [ ] Reconciled/closed week edit blocked (Improvement 2)
- [ ] Reduce below already-filled production count
- [ ] Credit-funded reduce → reservation drops, pool frees (already in T8 tests)
- [ ] Non-credit-funded subscription order → reservation untouched (already in T8 tests)

## 12. Approval Conditions
**To approve, address:**
1. Critical #1 — replace T8's allow-list with the deny-list (reuse `DELIVERY_DONE_STATUSES`), and correct the T8 status test to real literals.

**Recommended before implementation:**
1. Export/share `DELIVERY_DONE_STATUSES` (Improvement 1).
2. Keep the settled-week guard in T8's inline resync + add the test (Improvement 2).
3. Comment the `Date.now()` choice in T1 (Improvement 3).

---

*Generated by /staffreview*
