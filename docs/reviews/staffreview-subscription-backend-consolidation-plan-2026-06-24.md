# Staff Review: Subscription Backend Consolidation Plan (Phase D · Slice 0)

**Date:** 2026-06-24
**Plan:** `docs/superpowers/plans/2026-06-24-subscription-backend-consolidation.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Plan Structure:** ✅ Validated — Goal, File Structure, Execution Strategy (wave map/serialization/critical path), per-task TDD steps, Documentation Updates, Success Criteria all present. Rollback noted inline (each refactor reverts independently; index add is online).

---

## 1. Summary

**Overall Assessment:** Approve after one Critical fix (test-file paths).

The plan is well-grounded and behavior-preserving by construction. I verified every load-bearing assumption against the merged code: `stripSubscriptionPricing<O,I>` signature/return, Site B's `resolveOrderCogs` variable names, the `creditLedger` index block, `isSubscriptionOrder`, `getNextInvoiceNumber` import. All correct. **One Critical:** Tasks 3 and 5 reference a non-existent test file (`incomeStatement.test.ts`); the real regression guard is the existing split file `incomeStatement-b2b-wholesale.test.ts`. Two minor file-existence fixes round it out. No architectural concerns.

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location |
|---|-------|----------|----------|
| C1 | Tasks 3 & 5 point at a non-existent `incomeStatement.test.ts`; the real file is `incomeStatement-b2b-wholesale.test.ts` (already covers drawdown/expiry) | Testing | Task 3 Step 1/5, Task 5 Step 6 |

### Issue C1: Wrong income-statement test file

Income-statement tests are **split by concern** — verified the `__tests__` dir contains `incomeStatement-b2b-wholesale.test.ts`, `-capex`, `-gap-missingReversals`, `-pos-return-sign`, `-shopee`. There is **no** monolithic `incomeStatement.test.ts`. The B2B Wholesale revenue path that R3 (drawdown/expiry scans) and R5 (`resolveOrderCogs` → `accumulateOrderCogs`) touch is **already exercised by `incomeStatement-b2b-wholesale.test.ts`** — that is the existing golden/regression guard.

**Recommendation:** Repoint Task 3 Step 1/5 and Task 5 Step 6 to `convex/reports/__tests__/incomeStatement-b2b-wholesale.test.ts`. Framing: the existing B2B test is the behavior-preserving guard — it MUST stay green across R3 and R5 unchanged. Add an explicit "B2B total === known value" assertion there only if one isn't already present. Do NOT create a new `incomeStatement.test.ts`.

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| I1 | Task 4: `convex/subscriptions/__tests__/invoicing.test.ts` does not exist — say "create", not "extend" | M | L |
| I2 | Task 1: name the fixture donors for the new `recognition.test.ts` | L | L |

### Improvement I1: invoicing test file is new
No `invoicing.test.ts` exists under `convex/subscriptions/__tests__/`. Task 4 Step 1 should say **create** `convex/subscriptions/__tests__/invoicing.test.ts`. The full-shape assertion (seller/bank/buyer snapshot per kind) is net-new coverage — good, but call it a create so the implementer scaffolds the `convexTest(schema)` harness.

### Improvement I2: recognition fixture donors
Task 1's NOTE says copy the funded-week fixture from "Phase B's recognition/reconcile tests." Be precise: the usable fixture donors that exist are `convex/subscriptions/__tests__/reconcileMath.test.ts`, `reconcileNetting.test.ts`, `rollover.test.ts`, and `weeks.test.ts` (they build subscription + subscriptionWeek + funded `topup` ledger fixtures). Point the implementer there to avoid re-deriving the minimal funded-week shape.

## 4. Refinements (Optional)

- Task 6 Step 4 (code-auditor grep-gates) — add the exact grep for R1: `grep -rn "recognizeSubscriptionDelivery(" convex --include=*.ts | grep -v _generated` should return exactly one *call* (inside `recognizeOnDelivery`) + the definition line.
- Consider asserting in Task 2b that `OrderSlideOver` + `OrderDetail` still render (Pitfall #20) — but these are component surfaces; the server-side strip tests cover the data contract, and no component code changes, so a grep that `queries.ts` exports are unchanged in shape suffices. Low priority.

## 5. Duplication Analysis

### Existing code to leverage (all confirmed present)
| Code | Location | How to use |
|------|----------|------------|
| `stripSubscriptionPricing<O,I>` | `convex/orders/helpers/stripSubscriptionPricing.ts` (verified return `{order,items}`) | R2 seam wraps — field list stays here |
| `isSubscriptionOrder` | `convex/subscriptions/revenueGate.ts` (verified `fundingSource==="subscription_credit" \|\| subscriptionId!=null`) | strip predicate, unchanged |
| `buildProductCOGSMap` | `convex/lib/costCalculator.ts:148` | R5 helper sits beside it |
| `getNextInvoiceNumber` | imported at `invoicing.ts:23` | R4 caller allocates, passes in |
| `incomeStatement-b2b-wholesale.test.ts` | `convex/reports/__tests__/` | R3+R5 regression guard (see C1) |

### Potential duplication risks
- None new. R2 risk (two strip paths) is grep-gated by AC-R2.1 / Task 6 Step 4.

## 6. Phase / Wave Accuracy

| Wave | Assessment | Notes |
|------|------------|-------|
| Wave 1 (R1∥R2∥R4) | Good | Files verified disjoint: mutations/recognition vs queries/helpers vs invoicing |
| Wave 2 (R3→R5) | Good | Correctly serialized on `incomeStatement.ts`; codegen-after-R3 noted |
| Wave 3 (verify+close-out) | Good | Main-session `/triple-review`→`/simplify xhigh` correct |

**Ordering issues:** none. **Missing phases:** none.

## 7. Specialist Agent Recommendations

| Work | Recommended Agent | Rationale |
|------|-------------------|-----------|
| R1/R3/R4/R5 | `convex-backend` | exists; Convex mutation/query/index/cost specialist |
| R2 + characterization | `convex-backend` + `tdd-test-architect` | both exist; leak-proof discipline |
| Wave 3 grep-gates | `code-auditor` | exists; read-only AC enforcement |

## 8. Git Workflow Assessment

| Check | Status |
|-------|--------|
| Feature branch | ✅ planning worktree; execution handoff cuts a fresh branch off synced main |
| Commit boundaries | ✅ one commit per refactor (R1..R5) + separate characterization + leak-fix |
| Build/typecheck before merge | ✅ Task 6 |
| Merge strategy | ✅ squash (repo convention) |

### CI/CD & rollback
| Concern | Status |
|---------|--------|
| Rollback | ✅ each refactor reverts independently; index add online (Convex backfills, no data migration) |
| Deployment order | ✅ schema+code deploy atomically in Convex; codegen committed |
| Migration safety | ✅ additive index only |

## 9. Documentation Checkpoints

| Phase | Docs |
|-------|------|
| Merge | CHANGELOG (always), SCHEMA (by_type), API_REFERENCE (4 helpers), FILE_MAP |

### CHANGELOG draft
~~~markdown
## 2026-06-XX - Subscription backend consolidation (Phase D Slice 0)
- Single recognizeOnDelivery entry point (behavior-preserving)
- stripOrders seam (one source of truth for subscription price-strip)
- creditLedger.by_type index; incomeStatement scans switched off full-table filter
- buildInvoiceSnapshot helper (weekly + topup)
- accumulateOrderCogs helper (income-statement Site B)
~~~

## 10. Testing Plan Assessment

**Verdict:** Adequate after C1 fix.

### Planned tests
| Layer | What | Test type | Status |
|-------|------|-----------|--------|
| Backend | recognizeOnDelivery (no-op/idempotent/author) | convex-test | create `recognition.test.ts` |
| Backend | stripOrders + characterization matrix | vitest unit | extend `stripSubscriptionPricing.test.ts` + create `stripOrders.test.ts` |
| Backend | creditLedger.by_type → B2B total unchanged | convex-test | **`incomeStatement-b2b-wholesale.test.ts`** (C1) |
| Backend | invoice full-shape per kind | convex-test | create `invoicing.test.ts` (I1) |
| Backend | accumulateOrderCogs unit | vitest | extend `costCalculator.test.ts` (exists ✓) |

### Regression risk
- `incomeStatement-b2b-wholesale.test.ts` is the canary for R3+R5 — must stay green.
- Existing order-query callers (frontend hooks) unaffected — return shapes unchanged.

## 11. Edge Cases to Address

- [x] R1 forceComplete bypass preserved (AC-R1.2)
- [x] R1 token-less mutations pass undefined → createdByUserId fallback (AC-R1.4, verified completeOrder/completePackaging have no token)
- [x] R2 items-less + enriched shapes (AC-R2.3/2.4)
- [x] R3 empty drawdown/expiry set
- [x] R5 cancelled + missing-BOM skip
- [ ] R4 confirm `createSubscriptionWeeklyInvoice` allocates invoiceNumber AFTER the idempotency early-return (AC-R4.4) — implementer must not move `getNextInvoiceNumber` above the `if (week.weeklyInvoiceId) return` guard

## 4.9 Evidence-Before-Mitigation Gate

**N/A** — this plan is a behavior-preserving refactor, not a flake/race/transient-bug fix. No mitigation proposed; no Task 0 instrumentation required. Each refactor is proven by characterization/golden tests, not by inferred timing changes.

## 12. Approval Conditions

**To approve, address:**
1. C1 — repoint R3 + R5 tests to `incomeStatement-b2b-wholesale.test.ts`; do not create `incomeStatement.test.ts`.

**Recommended:**
- I1 (Task 4 "create" invoicing.test.ts), I2 (name recognition fixture donors).

---

*Generated by /staffreview*
