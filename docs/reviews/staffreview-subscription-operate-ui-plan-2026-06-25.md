# Staff Review (PLAN gate): Subscription operate UI — implementation plan

**Date:** 2026-06-25
**Artifact:** `docs/superpowers/plans/2026-06-25-subscription-operate-ui-deliver-topup-reconcile.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Gate:** Plan (pre-execution). Primary job: verify the plan's flagged code assumptions against real code.

---

## 1. Summary

**Overall Assessment:** Approve (one drift fixed inline).

The plan is structurally complete (✅ all required sections: Task List, Execution Strategy, File Structure, per-task TDD detail, Git Workflow, Waves, Docs, Success Criteria). A 13-point assumption sweep against the real codebase came back **13/13 CONFIRMED** with a **single import-path drift**, fixed in place. The plan honestly carries the three risks the grounding surfaced (R1 IMP-4 recognition timing, R2 moveForward bypass, R3 deferred order generation) and routes them to human UAT rather than claiming them passed.

---

## 2. Assumption verification (the core of this gate)

| # | Assumption | Verdict | Real value |
|---|------------|---------|------------|
| 1 | `buildTopupInvoice` exported, `{subscriptionWeekId, items[{productName,qty,unitPrice,lineTotal}], generatedBy}` | ✅ CONFIRMED | `invoicing.ts:230`, returns `Id<"invoices">` |
| 2 | `computeLineTotal(qty, unitPrice)` exported, integer | ✅ CONFIRMED | `creditMath.ts:3` = `Math.round(qty*unitPrice)` |
| 3 | `recognizeSubscriptionDelivery(ctx, orderId, createdBy?)` exported | ✅ CONFIRMED | `recognition.ts:37` |
| 4 | `protectedMutation`/`protectedQuery` exported; `ctx.user._id`; queries.ts imports present | ✅ CONFIRMED | `lib/functions.ts:44,91`; ctx.user is `Doc<"users">` |
| 5 | `subscriptions.unitPrice`, `menuProducts.name` real fields | ✅ CONFIRMED | `schema.ts:2511`, `:96` |
| 6 | `plannedDays` item shape; `creditRemaining`/`status`/`refundStatus`; status literals | ✅ CONFIRMED | `schema.ts:2543–2575`; planned/confirmed/invoiced/paid/delivering/reconciled/closed |
| 7 | `reconcile.ts` imports `ConvexError`; patch block; no other callers | ✅ CONFIRMED | `reconcile.ts:39,280–286`; grep → 0 external callers |
| 8 | `orderItems.by_order` + `isCancelled`; orders fields | ✅ CONFIRMED | `schema.ts:399,381,264,217,240,335,336` |
| 9 | session hooks import path | ⚠️ **DRIFTED → FIXED** | `convex-helpers/react/sessions` (not `@/hooks/...`). Plan T6 import + test mock corrected. |
| 10 | SubscriptionSchedulePage `plan/weekStartMs/DAY_MS/weekId/isLocked` + days conversion | ✅ CONFIRMED | `:44,94,183,236–247` — exact conversion matches |
| 11 | WeeklyInvoicePage exposes `week._id`/`week.status` | ✅ CONFIRMED | `planningData.week` (`:182`) from `getPlanningWeek` |
| 12 | shadcn `select/textarea/label/dialog`; `getErrorMessage` | ✅ CONFIRMED | all present; `utils.ts:38` |
| 13 | `reconcileWeek` return keys `carried`/`expired`/`refundDue` | ✅ CONFIRMED | `reconcile.ts:288` `{weekId, leftover, expired, carried, refundDue}` |

**Net:** the only inaccuracy was the frontend hook import path. Fixed. Everything else the plan asserts is real.

---

## 3. Critical Issues

None blocking. The financial risk (R1/IMP-4) is correctly classified as a **known limitation surfaced for UAT**, not a silent ship — and the plan offers an explicit fallback (defer Path A split, ship the rest) for the plan/UAT owner to choose. This satisfies the Evidence-Before-Mitigation posture: the plan does not "fix" a financial flow it hasn't proven; it routes it to human verification with the code-cited mechanism (idempotency suppression at `creditLedger.by_order`).

---

## 4. Improvements (folded in or accepted)

- **I-a (accepted):** T5's snippet has a placeholder typo (`marketingDelivered` vs `markingDelivered`); the step text already instructs the executor to use `markingDelivered`. Low risk.
- **I-b (accepted):** amend re-prices `plannedDays` inline rather than extracting a shared `buildPlannedDays` helper from `weeks.ts`. The plan justifies this (avoid refactoring a tested mutation with no integration-test safety net; ~15 lines, money-critical part is the unit-tested `computeTopupDelta`). Acceptable trade-off.
- **I-c (accepted):** out-of-credit `kind` collapses to `adhoc` when `canApplyCredit` else `scheduled`; both buttons are independently gated by `canSplit`/`canApplyCredit`, so the `kind` label is cosmetic. Fine.

---

## 5. Testing assessment

**Verdict: Adequate** for this codebase's conventions. Backend = pure-fn TDD (matches the existing 52-test pattern — no `convexTest`), covering the money-critical units (`computeTopupDelta`, `isOverCredit`, `assertReconcileNote`, `isDeliverableSubscriptionStatus`). Frontend = one assertable render smoke test (compulsory-comment gate) + type-check/build + a human UAT checklist. Regression: grep confirmed `reconcileWeek` has zero existing callers, so the new required `reconcileNote` arg breaks no current code or test.

---

## 6. Execution strategy assessment

Wave map is sound: backend ×4 parallel with codegen serialized at the barrier (correctly identifies `api.d.ts` as the shared generated artifact); frontend parallel except the **T5→T8 serialization** on the two shared order files (correctly called out). Critical path (T2 → barrier → T5→T8 → T9) is realistic. Headless-impossible steps (manual UAT, IMP-4 timing check) are flagged pending. Close-out (`/triple-review` → `/simplify xhigh`) is reserved for the main session.

---

## 7. Approval

**Approved for execution** after the inline import-path fix (applied). The execution session must honor the verify-first notes that remain (buildTopupInvoice/computeLineTotal param confirmation is already done here; the remaining ones are defensive re-checks) and must NOT claim the UAT / R1 timing verification passed without a human run.

---

*Generated by /staffreview (plan gate)*
