# Staff Review: Subscription Phase B (merged B+C — Automated ordering schedule + weekly billing cycle)

**Date:** 2026-06-23
**Spec:** `docs/superpowers/specs/2026-06-23-subscription-credit-system-design.md` (merged Phase B = §6 schedule, §7 billing/credit/weekly cycle incl. reconcile, §8 out-of-credit)
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Scope:** This is a SPEC review of the merged phase only (Phase A shipped, PR #189). Findings grounded against the real merged codebase.
**Plan Structure:** ✅ Spec carries Git Workflow / Waves / Docs / Success Criteria; merged-phase scope reconciled in §Implementation Waves.

---

## 1. Summary

**Overall Assessment:** Revise (address 2 Critical + 4 Improvements inline, then plan)

The merged-phase scope is coherent and the credit-wallet primitives from Phase A are well-shaped for reuse. The two Critical findings are both **correctness/data-integrity** risks that the spec already *gestures* at but does not pin to a mechanism: (C1) subscription revenue leaking into the financial reports, and (C2) FIFO rollover-tranche reconciliation, which is now in-scope and cannot be done by the current single-`weeksCarried` helper. Both must be pinned before the plan. The Improvements are mostly DRY/validation hardening (extract a shared order-insert helper, a `makeScheduleLine` factory, template/week-alignment validation). One open question (§13.4 refund payout) must be explicitly resolved now that reconciliation is in-scope.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location |
|---|-------|----------|----------|
| C1 | Subscription revenue can pollute financial reports — no aggregation filters it today | Logic/Analytics | spec §4.4 (I3) |
| C2 | FIFO rollover-tranche reconcile is in-scope but `computeRolloverExpiry` can't handle a mixed-age pool | Logic | spec §7 reconcile, §13.1 |

### Issue C1: Subscription revenue leakage into financial reports

The spec (§4.4, "Analytics isolation") *names* this risk but defers it to "audit every aggregation before merge." That's not a mechanism — it's a TODO. Grounding the real reports surfaces the concrete blast radius: every period revenue aggregation scans by period bounds with **no** `source`/`fundingSource`/`subscriptionId` exclusion:

- `getIncomeStatement` — `convex/reports/incomeStatement.ts:945`
- `fetchAndAggregate` (the shared P&L helper) — `convex/reports/incomeStatement.ts:581`
- `getDailySalesSummary` — `convex/reports/dailySales.ts:8` (filters only `status ∉ {Draft, Cancelled}`)
- `getMultiPeriodPLExport` — `convex/reports/financialExport.ts:283`

A 1,050 pcs/wk B2B order at a confidential price is exactly the kind of distortion that makes gross/margin meaningless. The spec must **pin the mechanism**, not the intent. Two viable designs:

1. **Don't route subscription orders into `externalRevenue` at all** (preferred) — they are credit-funded internal fulfilment, not channel sales. If internal orders are synced to `externalRevenue` via a hook, gate that hook on `fundingSource !== "subscription_credit"` (and `!subscriptionId`).
2. **Bucket, don't drop** — stamp a distinct `source`/bucket and add an explicit exclusion (or a separate "Subscription (B2B)" line) to each of the 4 aggregations above.

**Recommendation:** Pin design #1 in the spec (subscription fulfilment is not channel revenue), and add a **mechanical sentinel test** as a success criterion: seed a subscription order, run each of the 4 aggregations, assert its qty/Rp is absent from the channel/gross totals. (Sentinel-value isolation is an established project pattern — see MEMORY "Sentinel values in unused data paths prove correct source selection.") Also confirm **BOM ball-counting still resolves** for the subscription products (Pitfall #11/#13) so kitchen/production volume stays correct even while revenue is excluded.

### Issue C2: FIFO rollover-tranche reconciliation needs per-tranche tracking

Folding reconcile into this phase makes the §13.1 "deterministic FIFO, oldest-week-first" rollover a **first-class deliverable**. Grounding confirms the Phase-A helper can't do it:

```ts
// convex/subscriptions/rollover.ts — collapses a week to ONE age
computeRolloverExpiry({ unconsumed, policy, rolloverExpiryWeeks, weeksCarried }): { action, amount }
```

`weeksCarried` is a single scalar — it cannot represent a pool that mixes credit carried from *multiple* prior weeks with *different* ages (the exact case §13.1 promises to handle FIFO). And `postLedgerEntry.balanceAfter` is **week-scoped** (grounded: seeds from the last entry of the *same* `subscriptionWeekId`), so carried credit posts as a fresh `topup` on the next week tagged `rolloverFromWeekId` — meaning reconcile must walk the `rolloverFromWeekId`-tagged ledger tranches per age, expire those past `rolloverExpiryWeeks`, and carry the rest, **oldest-first**.

**Recommendation:** Make per-tranche FIFO an explicit TDD target with a multi-week fixture (credit carried from W1+W2+W3 with a mid-stream `unitPrice` change; assert oldest expires first at the horizon). Either (a) extend the pure helper to take a tranche list `[{ amount, weeksCarried }]` and return per-tranche `expire`/`carry`, or (b) add a `rollGeneration` denormalised field. Add a **closed-week posting guard** to `reconcileWeek` (refuse to post against a `closed` week). Rollover is opt-in (default `expire`), but since it's shipping it must be correct.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| I1 | Extract a shared internal `insertOrderWithItems` helper from `orders.create`; don't replicate | H | M |
| I2 | Add `makeScheduleLine` factory; route all line construction through it | M | L |
| I3 | Add `validateScheduleTemplate` + Monday-WIB week alignment; decide deleted-product policy | M | L |
| I4 | Resolve §13.4 refund-payout open question explicitly (v1 = flag-only) | M | L |

### I1: Reuse, don't replicate, order creation
`orders.create` (`convex/orders/mutations/orderCrud.ts:47`) is a **monolithic public mutation**, not an extracted helper. `confirmWeek` must produce identical orders (orderNumber via `generateNextOrderNumber`, `orderItems` insert, **and `createProductionRecordsForItem`** — grounded as REQUIRED or the order shows no production units on the kanban). Replicating that inline will drift. **Recommendation:** extract an internal `insertOrderWithItems(ctx, {...})` helper that both `create` and `confirmWeek` call, so production-record creation and totals stay in one place. Generated `orderItems` MUST carry the subscription **partner `unitPrice`** (not `menuProducts.defaultPrice`) so `orders.totalAmount` == drawdown (spec §4.4 I3).

### I2: `makeScheduleLine` factory
`ScheduleLine.lineTotal` is hand-keyable and the merged phase introduces ≥3 construction sites (week seed, order-gen, invoice builder). Add `makeScheduleLine(menuProductId, productName, qty, unitPrice)` in `creditMath.ts` (reusing `computeLineTotal`) and route all construction through it so `schedule = invoice = credit` is enforced at construction, not just by shape. (Phase-A forward-carried finding.)

### I3: Template + week-alignment validation
`seedWeek` takes a raw `weekStart: number` with no Monday-00:00-WIB guard; `createSubscription` accepts an unvalidated `scheduleTemplate`. Add a shared pure `validateScheduleTemplate` (`dayOfWeek ∈ 0..6`, non-empty, `qty > 0`) reused by create + order-gen, compute `weekStart`/`weekEnd` via `calculateWeekRange` (`convex/lib/periodRange.ts`) instead of the hand-rolled `+7*DAY-1`, and **decide the deleted-product policy** — today `buildPlannedDays` silently seeds `productName:"Unknown"`; choose fail-loud (reject confirm) vs skip-with-warning. The new `seedWeek` `source: "template"|"previousWeek"|"blank"` (note r1.c1) shares the same validation.

### I4: Pin the refund-payout open question (§13.4)
§13.4 is still OPEN ("manual expense/transfer vs tracked obligation"). Reconcile is now in-scope, so this can't stay deferred to a non-existent later phase. **Recommendation:** confirm v1 = **track `refundDue` as an obligation flag only**; the actual payout is handled manually outside the system (no refund-payout mutation/expense wiring in v1). State it as a closed decision in §13.4 + a non-goal in Success Criteria. *(User: confirm this is acceptable.)*

---

## 4. Refinements (Optional)

- Add `.index("by_subscriptionWeek", ["subscriptionWeekId"])` to `invoices` when the weekly-invoice lookup lands (reverse pointer `subscriptionWeeks.weeklyInvoiceId` already exists, so not strictly required — but cheap).
- `createSubscriptionWeeklyInvoice` must be a **new** mutation, not a reuse of `createDraft` (grounded: `createDraft` hard-requires `orderId` and builds items from `orderItems` via `by_order`). Reuse only `getNextInvoiceNumber` + `invoiceCounters`.
- The untracked `…-phase-d-spec.md` / `…-phase-e-spec.md` drafts still say "Phase B (scheduling) and Phase C (invoicing/reconcile) planned separately" — stale after the merge. Outside this PR's scope; reconcile when D/E are planned.

## 5. Duplication Analysis

### Existing code to leverage
| Code | Location | How to use |
|------|----------|------------|
| `getNextInvoiceNumber` + `invoiceCounters` | `convex/invoices/mutations.ts:114` | weekly/top-up invoice numbering (INV-YYMM-NNN) — do not re-roll |
| `finalize` orderId guard | `convex/invoices/mutations.ts:396` | already null-tolerant for subscription invoices ✓ |
| `createProductionRecordsForItem` | `convex/orders/helpers/productionRecords.ts:155` | REQUIRED on every generated order for kanban production units |
| `generateNextOrderNumber` | `convex/orders/helpers/customerResolution.ts:55` | order numbering for generated orders |
| `postLedgerEntry` | `convex/subscriptions/ledger.ts:6` | topup (invoice paid) + drawdown (funded order) — week-scoped balance |
| `calculateWeekRange` / `getWibComponents` | `convex/lib/periodRange.ts` | Monday-WIB `weekStart`/`weekEnd` (Pitfall #18 bans hand-rolled) |
| `menuProducts.list({activeOnly})` | `convex/menuProducts/queries.ts:8` | calendar product-picker dropdown |

### Potential duplication risks
- Re-implementing order insert in `confirmWeek` instead of extracting from `create` (see I1).
- Hand-keying `lineTotal` at new construction sites instead of `makeScheduleLine` (see I2).

## 6. Phase / Wave Accuracy

| Phase | Assessment | Notes |
|-------|------------|-------|
| Merged B (sched+billing+reconcile) | Good, but LARGE | Plan must wave it: (W1) backend scheduling+order-gen, (W2) invoicing+drawdown+reconcile backend, (W3) calendar+invoice+funding UI, (W4) kanban read-only, (W5) verification. Internal checkpoints/commits per wave. |

**Ordering issues:** none — schema already landed in A. Backend before UI.
**Missing phases:** none.

## 7. Specialist Agent Recommendations

| Wave | Recommended Agent | Rationale |
|------|-------------------|-----------|
| Backend scheduling/order-gen/invoice/reconcile | `convex-backend` | Convex mutation/query + ledger work |
| Pure-fn cores (validate, makeScheduleLine, FIFO tranche) | `tdd-test-architect` | Vitest pure-fn TDD per convention |
| Calendar / invoice / funding UI | `react-ui-builder` | `/crm` pages, shadcn |
| Verification | `code-auditor` | Access-control (Pitfall #19) + pattern compliance + analytics-leak audit |

## 8. Git Workflow Assessment

| Check | Status |
|-------|--------|
| Feature branch specified | ✅ `feature/subscription-credit-system` style (per-phase branch) |
| Branch naming convention | ✅ |
| Merge strategy (squash PR) | ✅ project convention |
| Rollback (additive/ship-dark) | ✅ all additive, manager+admin gated, revert = revert commits |
| Deployment order (schema→backend→frontend) | ✅ schema already in A; Convex before Vercel |
| Split-brain guard (check `gh run list` post-merge) | ✅ spec §Rollback notes it |

## 9. Documentation Checkpoints

| Item | Docs |
|------|------|
| Merged phase | CHANGELOG.md (always), API_REFERENCE.md (new queries/mutations), FILE_MAP.md (CRM area + perms), SCHEMA.md (only if any new index) |

## 10. Testing Plan Assessment

**Verdict:** Adequate *if* the plan makes these explicit (spec defers detail to plan):

| Layer | What | Type | Status |
|-------|------|------|--------|
| Pure fn | `validateScheduleTemplate`, `makeScheduleLine`, FIFO-tranche reconcile, top-up delta, out-of-credit split math | Vitest | must plan |
| Backend (ctx) | `confirmWeek` order-gen, drawdown-on-funded, weekly invoice build, `reconcileWeek` | indirect via helpers + manual | must plan |
| Analytics | subscription order absent from the 4 report aggregations | **mechanical sentinel** | must plan (C1) |
| UI | calendar plan/confirm, invoice render, funding dashboard, kanban read-only both surfaces | RTL smoke + manual | must plan |

**Regression risk:** the 4 financial aggregations (C1); both kanban surfaces (Pitfall #20); invoice `finalize` now reached by order-less invoices (guard already in place).

## 11. Edge Cases to Address

- [ ] Confirm a week with a since-deleted `menuProduct` (I3 deleted-product policy).
- [ ] `seedWeek source:"previousWeek"` when no prior week exists → fall back to template or empty (define).
- [ ] Re-seed / re-confirm an already-`planned` week (idempotency; reject if not `planned`).
- [ ] Mid-week `unitPrice` change vs already-confirmed week (carried credit re-prices? grounded: `previousWeek` re-prices at live `unitPrice`).
- [ ] Out-of-credit: scheduled-order split (scheduler) vs ad-hoc apply-partial (normal flow) — §8 Paths A/B.
- [ ] Reconcile a week with zero leftover; with Frollie-fault shortfall (refund flag); with rollover past horizon.
- [ ] Confirm generating N orders + invoice + ledger in one mutation stays within Convex write/time limits (7 days × few products = fine; note the ceiling).

## 12. Approval Conditions

**To approve, address inline in the spec:**
1. C1 — pin the analytics-isolation mechanism (don't-sync vs filter) + sentinel-test success criterion.
2. C2 — make per-tranche FIFO reconcile an explicit deliverable + TDD target; closed-week guard.

**Confirm with user:**
3. I4 — §13.4 refund payout = flag-only for v1.

**Carry into the implementation plan (plan-level, not spec-level):**
4. I1 (extract `insertOrderWithItems`), I2 (`makeScheduleLine`), I3 (`validateScheduleTemplate` + week alignment).

---

*Generated by /staffreview*
