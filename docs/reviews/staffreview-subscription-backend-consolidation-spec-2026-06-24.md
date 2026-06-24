# Staff Review: Subscription Backend Consolidation Spec (Phase D · Slice 0)

**Date:** 2026-06-24
**Plan:** `docs/superpowers/specs/2026-06-24-subscription-backend-consolidation-spec.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Plan Structure:** ✅ Spec validated — WHAT + per-refactor ACs + cross-cutting constraints + success criteria present. (This is a SPEC, not a PLAN; wave map / commit boundaries / test-file specifics are deferred to the plan stage, which is correct.)

---

## 1. Summary

**Overall Assessment:** Revise (resolve 3 Criticals inline, then approve to planning)

The spec is well-grounded — every call site, index, and field name was verified against the merged Phase B code. The five refactors are real, located, and behavior-preserving in intent. Three issues block clean planning: **(C1)** R1 as specced ("thin seam") may not actually *centralize* anything — it risks being a rename that leaves 5 direct callers; the concrete win must be defined or R1 descoped. **(C2)** R2's "fix any leak we find" (QR5) directly contradicts the prime "behavior-preserving" directive — the two must be reconciled with an explicit protocol. **(C3)** R4 is silent on who allocates the stateful `invoiceNumber` counter, which affects idempotency. All three are decisions, not redesigns.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location |
|---|-------|----------|----------|
| C1 | R1 "thin seam" may be a no-op rename, not centralization | Logic/Scope | §2 R1 / QR1 |
| C2 | R2 leak-fix (QR5) contradicts behavior-preserving prime directive | Logic/Security | §2 R2 / QR5 + Prime directive |
| C3 | R4 doesn't define who allocates `invoiceNumber` (stateful counter) | Logic/Correctness | §2 R4 |

### Issue C1: R1's concrete win is undefined

The spec's DD-R1 position is a thin `recognizeOnDelivery` wrapper that the 5 sites call instead of `recognizeSubscriptionDelivery`. But the idempotency + non-subscription guards already live *inside* `recognizeSubscriptionDelivery` (verified `recognition.ts:43-50`), and the spec explicitly says the seam must NOT absorb the per-mutation edge decision. So a thin wrapper leaves all 5 sites still calling a function directly — that is a **rename, not a centralization**, and delivers ~zero value while spending a refactor + test cycle.

There are only two ways R1 buys anything real:
- **(a) Consistent `createdBy` resolution** — today 2 of 5 sites (`completeOrder:441`, `completePackaging:235`) pass NO `createdBy` and rely on the in-function `order.createdByUserId` fallback, while the other 3 pass the acting user. A seam that *requires* `actingUserId` and resolves the fallback uniformly removes that inconsistency. This is a genuine but *small* win.
- **(b) Real centralization** — route `completeOrder` / `completePackaging` / `forceComplete` through a shared forward-transition applier so recognition fires from one place. This is a much larger blast radius (every forward transition) and is NOT what the user scoped.

**Recommendation:** Pin R1's win to (a) explicitly: the seam's value is *uniform author resolution + one documented recognition entry point*, and the AC must state that. If (a) is too thin to be worth a slice item, **descope R1** to "documentation + a single AC that all callers pass `actingUserId`" rather than a new function. Do NOT silently ship a rename and call it centralization. Resolve QR1 in the spec before planning.

### Issue C2: R2 leak-fix contradicts "behavior-preserving"

The prime directive says every refactor is behavior-preserving and "any place where a refactor would change behavior … is a defect." But QR5 + AC-R2.2's framing invites *fixing a confidential-pricing leak* found during the refactor — which is, by definition, a behavior change (a non-manager who saw a price now sees `—`). Shipping that silently inside a "refactor" PR is exactly the kind of scope-blur that hides a real security fix from review.

**Recommendation:** Split the concern explicitly in the spec:
1. The R2 **refactor** is strictly behavior-preserving: it must reproduce *today's* stripping exactly, leak-for-leak. A characterization test captures current behavior at all 10 call sites first (red), then the seam keeps it green.
2. If a leak is discovered, it is a **separate, named change** (its own commit, its own test asserting the *new* stripped behavior, its own CHANGELOG line flagged as a security fix) — landed in the same slice is fine, but it is NOT "the refactor." The plan must carry it as a distinct task with its own AC, not folded into AC-R2.2.

This keeps the refactor reviewable and surfaces any security fix loudly. Resolve QR5 accordingly.

### Issue C3: R4 invoice-number allocation is undefined

Both builders call `getNextInvoiceNumber(ctx)` (a sequential, side-effecting counter — `invoicing.ts:61` weekly, `:252` topup) *before* constructing the insert object. The proposed `buildInvoiceSnapshot(...)` signature omits `invoiceNumber`. If the helper allocates it internally, two callers now share counter-allocation semantics (fine, but the helper is no longer a pure snapshot builder — it has a DB side effect, which affects R4's "pure object construction / Low risk" claim). If the caller allocates and passes it in, the helper stays pure.

**Recommendation:** Specify that the **caller** allocates `invoiceNumber` via `getNextInvoiceNumber` and passes it into `buildInvoiceSnapshot`, keeping the helper a pure builder (no DB writes, no counter side effects). Add an AC that `buildInvoiceSnapshot` performs no `ctx.db` *writes* (reads of settings/bank are fine). This preserves the "Low risk / pure" characterization and keeps idempotency reasoning local to each caller.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| I1 | R3: note `by_type` is a low-cardinality (5-value) index — narrows table-scan→type-partition scan, still unbounded over time; correct, but state the ceiling | M | L |
| I2 | R2: seam must stay generic over item shape (3 distinct item types flow through today) | M | L |
| I3 | R3 + R5 both edit `incomeStatement.ts` — wave map must serialize edits to that file | M | L |
| I4 | Testing: name the framework (`convex-test` + vitest) and the existing test files each refactor extends | M | M |
| I5 | R1: `createdBy` audit — name the 2 sites that currently omit it as the concrete inconsistency R1 fixes | L | L |

### Improvement I1: R3 index cardinality ceiling
`creditLedger.type` has 5 values; `drawdown` is the dominant one. A `by_type` index turns the full-table scan into a scan of the *drawdown partition* — strictly better, but for the busiest type that partition approaches the table size over time. The spec's CR3 caveat already says "scan-narrowing, not O(period)"; add the cardinality note so the plan doesn't over-sell it and a future reader knows the real bound is "all-drawdowns-ever," fixable only by period-bounding the income-statement ledger query (out of scope here). Convex appends `_creationTime` to every index, but recognition attributes revenue by `deliveryDate` (not `_creationTime`), so a `_creationTime` range would be *incorrect* for period filtering — confirm the plan does NOT attempt that shortcut.

### Improvement I2: R2 seam genericity
Verified the 10 strip calls pass three different item shapes: plain `items` (150, 280, 314, 934, 1002), empty `[]` (218, 372, 462), production-enriched `itemsWithProduction` (399), and menu-enriched `enrichedItems` (735). `stripSubscriptionPricing` is already generic (`<O, I>`); the new batch seam (`stripOrders`) MUST preserve that generic-over-item-type signature or it will reject the enriched shapes. Add an AC.

### Improvement I3: serialize incomeStatement.ts edits
R3 edits lines ~928/933; R5 edits the `resolveOrderCogs` lambda ~981-997. Disjoint regions, same file. The plan's wave map must run these two as the same agent or strictly sequential (no parallel writes to `incomeStatement.ts`) — and re-run `npx convex codegen` once after R3's index lands.

### Improvement I4: name the test surfaces
The ACs say "pinned by a test" but the plan must name: `convex-test` integration tests for recognition (extend existing recognition test), invoicing (full-shape assertion per invoice kind), incomeStatement (B2B total bit-identical), and a `stripSubscriptionPricing`/seam unit test covering all 10 surfaces × {manager, non-manager} × {subscription, non-subscription}. Existing test files: check `convex/orders/helpers/__tests__/stripSubscriptionPricing.test.ts` (already exists) to extend for R2.

---

## 4. Refinements (Optional)

- The "Phase D · Slice 0" naming is clear, but add a one-line pointer in the existing rev-4 CRM Phase D spec noting Slice 0 lands first (so the two specs cross-reference).
- R5: consider whether `accumulateOrderCogs` belongs in `costCalculator.ts` (alongside `buildProductCOGSMap`) vs a new `cogsAccumulation.ts` — `costCalculator.ts` is the right home (cohesion); just confirm no `no-restricted-imports` rule fires.

## 5. Duplication Analysis

### Existing code to leverage
| Code | Location | How to use |
|------|----------|------------|
| `stripSubscriptionPricing<O,I>` | `convex/orders/helpers/stripSubscriptionPricing.ts` | R2 seam wraps this — do NOT reimplement the field list |
| `buildProductCOGSMap` | `convex/lib/costCalculator.ts:148` | R5 helper sits beside it, consumes its output map |
| `getNextInvoiceNumber` | `convex/invoices/mutations.ts` | R4 caller allocates, passes into snapshot helper |
| `postLedgerEntry` / `deriveCreditPool` | `convex/subscriptions/ledger.ts`, `creditMath.ts` | R1 seam must not touch these — recognition internals stay |

### Potential duplication risks
- R2: if the seam doesn't fully replace inline calls, the codebase ends with TWO strip paths — AC-R2.1 (no inline `stripSubscriptionPricing` outside the seam) must be enforced by grep in the verification wave.

## 6. Phase / Wave Accuracy

Deferred to the plan, but the spec's QR4 sketch is correct: **R1 (order mutations)** and **R2 (order queries)** are disjoint → parallelizable. **R3 then R5** serialize on `incomeStatement.ts`. **R4** is independent (`invoicing.ts`). Critical path = R3→codegen→R5 (shared file + generated artifact). The plan must make this explicit.

## 7. Specialist Agent Recommendations

| Work | Recommended Agent | Rationale |
|------|-------------------|-----------|
| R1/R3/R4/R5 backend | `convex-backend` | Convex mutation/query/index/cost-logic specialist |
| R2 seam + tests | `convex-backend` + `tdd-test-architect` | leak-proofing needs the characterization-test discipline |
| Verification wave | `code-auditor` | grep-enforce AC-R2.1 / AC-R3.2 (no inline strip / no post-scan filter) |

## 8. Git Workflow Assessment

| Check | Status |
|-------|--------|
| Behavior-preserving discipline stated | ✅ (prime directive) |
| Codegen-after-index step | ✅ C2 constraint |
| Commit boundaries | ⚠️ deferred to plan — one commit per refactor (R1..R5) is the natural boundary |
| Build/typecheck before merge | ✅ C1 constraint |
| Rollback | ⚠️ add one line: index add is online (Convex backfills, no data migration); each refactor reverts independently |

## 9. Documentation Checkpoints

| Phase | Docs to update |
|-------|----------------|
| Merge | CHANGELOG.md (always), API_REFERENCE.md (new helpers: `recognizeOnDelivery`?/`stripOrders`/`buildInvoiceSnapshot`/`accumulateOrderCogs`), FILE_MAP.md (subscription consolidation entry), SCHEMA.md (creditLedger `by_type` index) |

## 10. Testing Plan Assessment

**Verdict:** Insufficient *as a spec is allowed to be* — ACs name what's pinned but not where. The plan MUST reach Adequate by naming framework + files (see I4). Characterization-test-first for R2 is mandatory (C2).

### Missing test coverage (must add in plan)
| # | Missing test | Why it matters | Approach |
|---|--------------|----------------|----------|
| 1 | R2 leak matrix: 10 surfaces × roles × order types | confidential pricing (Pitfall #19/D11, hit twice in Phase B) | extend `stripSubscriptionPricing.test.ts` + per-query integration |
| 2 | incomeStatement B2B total bit-identical (R3 + R5) | the two highest-risk behavior-preserving claims | convex-test golden-value before/after |
| 3 | invoice full-shape per kind (R4) | snapshot field drift | assert inserted doc shape weekly + topup |

## 11. Edge Cases to Address

- [ ] R1: `forceComplete` recognition on an order that skipped the delivery edge still fires (AC-R1.2)
- [ ] R2: `listPaginated`/`getByCustomer` items-less path (`[]`) tolerated by the batch seam
- [ ] R3: drawdown/expiry empty set (no subscriptions yet) returns zero, not error
- [ ] R4: `createSubscriptionWeeklyInvoice` idempotent return of existing `weeklyInvoiceId` preserved (helper must not run before the idempotency check)
- [ ] R5: order with cancelled items + missing-BOM items → both skipped, sum correct

## 12. Approval Conditions

**To approve, address inline:**
1. C1 — pin R1's win to uniform-author-resolution (a) or descope; resolve QR1.
2. C2 — split R2 refactor (behavior-preserving) from any leak-fix (separate task/AC/commit); resolve QR5.
3. C3 — caller allocates `invoiceNumber`, helper stays pure-no-writes; add AC.

**Recommended before planning:**
- I1–I4 (cardinality note, generic seam AC, serialize incomeStatement edits, name test surfaces).

---

*Generated by /staffreview*
