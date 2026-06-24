# Staff/Principal Review — `feature/subscription-backend-consolidation`

**Phase:** D Slice 0 — Subscription/Credit backend consolidation (5 behavior-preserving refactors)
**Range:** `c94e743a..0db601cc` (9 commits)
**Reviewer lens:** Staff/Principal Engineer — plan-to-implementation fidelity, design/spec compliance, architectural risk, missing pieces, over-engineering.
**Date:** 2026-06-25

---

## Summary

This is a clean, disciplined slice. All five refactors (R1 recognizeOnDelivery, R2 stripOrders seam, R3 `creditLedger.by_type`, R4 buildInvoiceSnapshot, R5 accumulateOrderCogs) landed as specified, each backed by characterization/golden tests that prove behavior-preservation. Every grep-gate the plan and spec demand is **green** in the working tree:

- `recognizeSubscriptionDelivery(` → exactly ONE call site (inside `recognizeOnDelivery`) + its definition. ✅
- `stripSubscriptionPricing(` in `queries.ts` → ZERO; all 10 sites route through the seam. ✅
- `q.eq(q.field("type")` in `incomeStatement.ts` → ZERO; both scans now `withIndex("by_type", …)`. ✅
- One `buildInvoiceSnapshot`, one `accumulateOrderCogs` export. ✅

Spec/plan fidelity is high. The two deferred items the team-lead flagged were investigated:

1. **The "deferred ESLint `no-restricted-imports` for `recognizeSubscriptionDelivery`" is NOT a half-done plan requirement.** Neither the plan nor the spec mandates an ESLint ban on `recognizeSubscriptionDelivery` or `stripSubscriptionPricing`. The single-caller invariant is enforced by the Wave-3 grep-gate, not lint. The only ESLint mention in the spec-staffreview is an R5 sanity check ("confirm no `no-restricted-imports` rule fires" on `accumulateOrderCogs`'s home) — which holds. So there is no half-finished lint task. (See Refinement R-1 for whether a guard *should* be added — that's an enhancement, not a gap.)
2. **The R2 leak-fix protocol correctly did NOT fire.** The characterization matrix proves the refactor is leak-for-leak identical to pre-R2 behavior; no surface was found that failed to strip for a non-manager. Per DD-R2, the separate-task/commit protocol only triggers on a *discovered* leak. None was discovered, so nothing was left half-done.

The only genuinely outstanding work is the **Wave-3 close-out (Task 6): docs (CHANGELOG/SCHEMA/API_REFERENCE/FILE_MAP) are not yet written**, and `/triple-review` + `/simplify` have not run. That is expected — Task 6 is the only incomplete task and is owned by the main session. This review is the input to it.

**Verdict: SAFE to proceed to Wave-3 close-out.** No Critical issues. The findings below are Important (docs gate, one dead-code/over-engineering call) and Minor/Nitpick.

---

## Critical Issues

**None.**

The architectural invariant the team-lead specifically named — the `stripOrders` batch-form output-map seed — was fixed correctly. `stripOrders` seeds a **fresh empty `outItems` map** (`const outItems = new Map(...)`, commit `29036013`) and only populates it when `itemsByOrder` was passed; it never mutates or returns the caller's input map. The single-form `stripOrder` defaults omitted items to `[]`. Both are behavior-preserving and side-effect-free. `stripSubscriptionPricing` itself is verified pure (object spread, explicit-`undefined` sentinel, no in-place mutation — pinned by the new "original object is not mutated" characterization test).

---

## Important

### I-1 — Docs gate (CHANGELOG/SCHEMA/API_REFERENCE/FILE_MAP) not yet written
**Where:** `docs/CHANGELOG.md`, `docs/SCHEMA.md`, `docs/API_REFERENCE.md`, `docs/FILE_MAP.md`
**What:** `git diff c94e743a..0db601cc` touches none of the four docs the plan's "Documentation Updates" section and CLAUDE.md's after-merge rule require. SCHEMA.md in particular must record the new `creditLedger.by_type` index, and API_REFERENCE.md the four new helper exports.
**Why:** CLAUDE.md: "After every merge to main — Update `docs/CHANGELOG.md` (ALWAYS). Also `docs/SCHEMA.md` if schema changed, `docs/API_REFERENCE.md` if backend changed." A schema index landed and four backend helpers were added.
**Fix:** Complete as part of Task 6 close-out before merge — this is the expected next step, not a defect in the code. Flagging so it isn't skipped (recurring "no phase complete pending docs" gate).

### I-2 — Batch `stripOrders` is exported + tested but has zero production consumers (dead seam)
**Where:** `convex/orders/helpers/stripOrders.ts:10` (`stripOrders` batch form)
**What:** Grep confirms **no call site in `queries.ts` uses the batch `stripOrders`** — all 10 sites adopted the single `stripOrder`. The batch function exists only to satisfy its own unit test.
**Why:** This is consistent with the plan ("do not force batching") so it isn't a fidelity violation, but shipping an exported, tested function with no caller is a small over-engineering/dead-code cost. It's defensible *only* if D-CRM read queries are imminently going to consume it (the slice's stated purpose is "so the Phase D CRM surface consumes clean APIs").
**Fix:** Either (a) keep it and add a one-line comment at the export documenting it as the batch seam intended for the Phase D CRM list/timeline queries (so a future reader doesn't delete it as dead), or (b) drop it until a consumer exists and re-add in D1. Recommend (a) — the seam is the point of the slice. Decide explicitly during `/simplify` rather than leaving it ambient.

---

## Minor

### M-1 — `recognizeOnDelivery` is a pure pass-through; its value is documentation + the grep-gate, not logic
**Where:** `convex/subscriptions/recognition.ts:131-135`
**What:** `recognizeOnDelivery` adds no logic over `recognizeSubscriptionDelivery(ctx, orderId, actingUserId)` — it's a rename-with-a-comment. The spec (DD-R1) is explicit and honest about this ("the win is narrow and honest: ONE documented recognition entry point"), so it's intended.
**Why:** A thin wrapper whose only enforcement is a grep-gate can silently rot: a future author can call `recognizeSubscriptionDelivery` directly and nothing fails at build/CI time (the grep-gate is a manual review step, not a lint rule). This is the same failure mode CLAUDE.md Pitfall #18 solved for the platform/WIB helpers with `no-restricted-imports`.
**Fix:** See R-1 — adding a `no-restricted-imports` rule banning `recognizeSubscriptionDelivery` outside `recognition.ts` would make the single-entry invariant load-bearing instead of advisory. Not required by the plan; worth it given the recognition trigger is a money-side-effect.

### M-2 — `accumulateOrderCogs` typed on a structurally narrower shape than the rows it receives
**Where:** `convex/lib/costCalculator.ts:162-178`; call site `incomeStatement.ts:982`
**What:** The helper's `items` param is `Array<{ menuProductId?: string; quantity: number; isCancelled?: boolean }>`, but the call passes `Doc<"orderItems">[]` (full rows). This works (structural subtyping) and exactly preserves the old inline lambda's semantics, including the same `isCancelled`/missing-id/unmapped skips. No behavior change.
**Why:** The narrow param type is good (keeps the helper reusable for future B2B invoicing COGS, as the spec notes). Just confirm the `menuProductId` field on `orderItems` is `string`-compatible — it is cast `as string` at the old site and the helper takes `string`, consistent.
**Fix:** None required. Noting that the test fixture uses plain objects, which is fine, but a one-line assertion that `Doc<"orderItems">` is assignable (a type-level `satisfies`) would harden against a future field rename. Optional.

---

## Nitpick

### N-1 — Site A un-adoptability comment is accurate but terse
**Where:** `convex/reports/incomeStatement.ts:213`
**What:** The comment "does NOT use accumulateOrderCogs — this site also tracks unmapped products and builds ProductDetail[]" is correct. It omits the *third* real blocker the spec calls out (NR5): Site A reads `linkedMenuProductId`, not `menuProductId` (confirmed at line 224). That divergence is the hardest reason adoption would silently break.
**Fix:** Append "and keys on `linkedMenuProductId`, not `menuProductId`" to the comment so the next person doesn't attempt the merge and get zero COGS.

### N-2 — `buildInvoiceSnapshot` return omits `_id`/`_creationTime` via `Omit<Doc<…>>` — good, but `orderId` absence is by-comment only
**Where:** `convex/subscriptions/invoicing.ts:1681-1738`
**What:** The snapshot intentionally omits `orderId` (subscription invoices span many orders). This relies on `orderId` being optional in the `invoices` schema. The full-shape tests assert seller/bank/buyer/items/totals but do not assert `orderId === undefined`.
**Fix:** Optional — add `expect(invoice!.orderId).toBeUndefined()` to both kind tests to pin the "no single order" invariant against a future schema change that makes `orderId` required.

---

## Architectural notes (no action required)

- **R3 cardinality caveat is honored.** The schema comment and the spec (CR3) both correctly state `by_type` is a scan-narrowing win only — the income-statement ledger read is still unbounded over time (the `drawdown` partition approaches table size). No `_creationTime` range shortcut was attempted (correct — recognition attributes by `deliveryDate`). The real period-bound is explicitly deferred. Good.
- **Real-time subscription load:** none of these refactors change query reactivity surface or add new `.collect()` over unbounded history beyond what already existed (R3 strictly reduces the scan). No new real-time load introduced.
- **Dual-surface (Pitfall #20):** R2 is read-query-only and touches no Actions/UI; both `OrderSlideOver` and `OrderDetail` consume the same `get`/`list` queries, which strip identically. No surface drift.
- **Codegen:** `convex/_generated/api.d.ts` regenerated for the new `stripOrders` module (and the R3 index needs no api.d.ts delta — index adds don't change the function API). Committed. The recurring Phase-76/81 stale-generated-file trap is avoided.

---

## STAFFREVIEW COMPLETE
