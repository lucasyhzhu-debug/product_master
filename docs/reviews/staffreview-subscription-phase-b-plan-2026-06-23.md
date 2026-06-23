# Staff Review: Subscription Phase B — Implementation Plan

**Date:** 2026-06-23
**Plan:** `docs/superpowers/plans/2026-06-23-subscription-phase-b-weekly-cycle.md`
**Reviewers:** Staff Developer + Principal Developer
**Plan Structure:** ✅ Validated (Goal, File Structure, Waves PARALLEL/SEQUENTIAL, Testing, Success Criteria, Rollback in spec).
**Method:** Verified the plan's flagged assumptions against the real merged codebase (field names, exports, status literals, required schema fields).

---

## 1. Summary

**Overall Assessment:** Revise (3 Critical — all "won't compile / won't insert" literal & required-field bugs; 1 Improvement). The architecture, wave ordering, reuse, and TDD coverage are sound. Every Critical is a cheap factual fix grounded below; none change the design.

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location |
|---|-------|----------|----------|
| C1 | `confirmWeek` sets `paymentStatus:"AwaitingPayment"` — not a valid `paymentStatus` literal | Logic/Schema | Task B7 |
| C2 | `confirmWeek` order insert omits required `orders` fields (`deliveryType`, `isKitchenVisible`) | Schema | Task B7/B5 |
| C3 | `createSubscriptionWeeklyInvoice` insert omits required `invoices` fields (incl. `orderNumber`) | Schema | Task B9 |

### Issue C1: status/paymentStatus literal conflation
Grounded (`convex/schema.ts:215–242`): `orders.paymentStatus` is exactly `"Unpaid" | "Partial" | "Paid"`. `"AwaitingPayment"` is an **`orders.status`** literal, not a `paymentStatus`. `"Confirmed"` is a *legacy* status (Phase-14 canonical set is `Draft, AwaitingPayment, PaymentReceived, BeingPrepared, AwaitingDelivery, Complete, Cancelled`). The plan's `status:"Confirmed"` + `paymentStatus:"AwaitingPayment"` is wrong on both axes.

**Recommendation:** generated subscription order (awaiting credit funding) = `status: "AwaitingPayment"`, `paymentStatus: "Unpaid"`. On funding, `markWeeklyInvoicePaid` sets `paymentStatus: "Paid"` and advances `status` to `"PaymentReceived"` (canonical). `paymentMethod` is `v.optional(v.string())` so `"subscription_credit"` is fine (`schema.ts`).

### Issue C2: missing required `orders` fields
Grounded: `orders` REQUIRES `deliveryType` and `isKitchenVisible` (plus `createdByUserId`) — the plan's `confirmWeek` `orderFields` omits `deliveryType` and `isKitchenVisible`, so the insert fails at runtime. Worse, `insertOrderWithItems` casts `orderFields as never` (Task B5), which **suppresses the compiler error that would have caught this**.

**Recommendation:** add `deliveryType` (check its literal set in `schema.ts` — use the same default `create` uses for a pickup/delivery; pick the non-address default) and `isKitchenVisible: true` to the `confirmWeek` insert. See Improvement I1 — type `orderFields` so the compiler enforces required fields.

### Issue C3: missing required `invoices` fields (incl. `orderNumber`)
Grounded (`schema.ts:2287–2344`): `invoices` REQUIRES `status, generatedBy, updatedAt, sellerName, bankName, bankAccountNumber, bankAccountName, buyerName, orderNumber, orderDate, items, subtotal, finalTotal, paymentStatus`. The plan's `createSubscriptionWeeklyInvoice` insert provides only a subset, so it won't insert. Notably **`orderNumber` is required even though a subscription weekly invoice has no order** — there is no natural value.

**Recommendation:** provide every required field. For `orderNumber` (no order), synthesize a stable label, e.g. `SUB-${sub.label}-${getWibDateStr(week.weekStart)}` or `WEEK-${getWibDateStr(week.weekStart)}`. Pull `sellerName`/`bank*` from `businessSettings` and `buyerName` from `customer.name`, mirroring `createDraft` (`convex/invoices/mutations.ts:243–270`). Use `subtotal` + `finalTotal` (the real required names; there is no `total` field).

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| I1 | Type `insertOrderWithItems` `orderFields` (drop `as never`) so the compiler enforces required `orders` fields | H | L |

### I1: Don't cast `as never`
`insertOrderWithItems(ctx, { orderFields: Record<string, unknown> })` + `ctx.db.insert("orders", args.orderFields as never)` throws away type safety — it's precisely why C2 slipped through. Define a typed `OrderInsert` (or accept `WithoutSystemFields<Doc<"orders">>`) so any missing/mistyped field (like `deliveryType`) is a compile error. Same for the `orderItems` cast. Small effort, removes a whole class of runtime-insert bugs.

## 4. Refinements (Optional)

- Verify `getWibComponents` returns a **0-based `month`** (it does — `getUTCMonth`), so passing it straight into `wibMidnightToUtc(year, month, day)` (also 0-based) in Task B6's `previousWeek` re-date is consistent. The Task B2 test already pins the Monday, so a convention slip is caught.
- `confirmWeek` `totalCost: 0` / `lineCost: 0` — confirm downstream margin reports tolerate zero-cost subscription orders (they're revenue-excluded by C1 anyway, but kitchen/COGS views may read `lineCost`). Acceptable for v1; note it.

## 5. Duplication Analysis
Plan already reuses the right primitives (`insertOrderWithItems` extraction, `getNextInvoiceNumber`, `postLedgerEntry`, `generateNextOrderNumber`, `calculateWeekRange`, `menuProducts.list`, `makeScheduleLine`). No new duplication introduced. `generateNextOrderNumber` confirmed exported at `convex/orders/helpers/customerResolution.ts:55` ✓. `getNextInvoiceNumber` correctly flagged as needing `export` (Task B9 Step 1) ✓.

## 6. Phase / Wave Accuracy
| Wave | Assessment | Notes |
|------|------------|-------|
| W1 pure cores (B1–B4) | Good | Full TDD; signatures consistent with consumers |
| W2 scheduling (B5–B8) | Good after C1/C2 | Fix insert literals/fields |
| W3 money (B9–B13) | Good after C3 | Fix invoice required fields |
| W4 frontend (B14–B16) | Good | Pitfall #20 mirror called out |
| W5 verify/docs (B17) | Good | gate + code-auditor + docs |

**Ordering:** correct (cores → backend → UI → verify). **Missing phases:** none.

## 7. Specialist Agent Recommendations
| Wave | Agent | Rationale |
|------|-------|-----------|
| W1–W3 backend | `convex-backend` | Convex mutations/queries/ledger |
| W1/W3 pure cores | `tdd-test-architect` | Vitest pure-fn TDD |
| W4 UI | `react-ui-builder` | /crm pages |
| W5 | `code-auditor` | Pitfall #19/#20 + C1 gate audit |

## 8. Git Workflow Assessment
| Check | Status |
|-------|--------|
| Feature branch (`feature/subscription-phase-b`) | ✅ |
| Atomic commit per task | ✅ |
| `npm run build`/`type-check` before merge | ✅ |
| Rollback (additive, ship-dark) | ✅ |
| Deployment order (schema index → backend → UI) | ✅ |

## 9. Documentation Checkpoints
Task B17 covers CHANGELOG + API_REFERENCE + FILE_MAP. SCHEMA.md only needs the one new `invoices.by_subscriptionWeek` index — add it to B17 docs.

## 10. Testing Plan Assessment
**Verdict:** Adequate. Pure cores (B1–B4) full TDD; ctx-mutations verified via extracted pure helpers + manual UAT per project convention; C1 sentinel = `isSubscriptionOrder` predicate test + manual report assertion; C2 FIFO = `reconcileTranches` multi-week fixture. Add one explicit assertion to B17: after C1/C2 fixes, `npx vitest run convex/subscriptions` is green.

## 11. Edge Cases to Address
- [ ] `deliveryType` default for a generated subscription order (C2).
- [ ] `orderNumber` synthetic value for an order-less subscription invoice (C3).
- [ ] `markWeeklyInvoicePaid` status advance target (`PaymentReceived`) is a valid canonical literal.
- [ ] Zero-cost subscription orders in any margin view that reads `lineCost`.

## 12. Approval Conditions
**To approve, fix inline in the plan:**
1. C1 — correct status/paymentStatus literals in `confirmWeek` + `markWeeklyInvoicePaid`.
2. C2 — add `deliveryType` + `isKitchenVisible` to the generated-order insert.
3. C3 — provide all required `invoices` fields incl. a synthetic `orderNumber`.

**Recommended:**
4. I1 — type `orderFields` (drop `as never`).

---

*Generated by /staffreview*
