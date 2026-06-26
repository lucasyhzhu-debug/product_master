# Staff Review: Subscription Phase E Slice-2 — Rule-Enforcement (PLAN)

**Date:** 2026-06-26
**Plan:** `docs/superpowers/plans/2026-06-26-subscription-rule-enforcement.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Plan Structure:** ✅ Validated — header, Task List, Execution Strategy (wave map + serialization + critical path + headless-pending + close-out), Git Workflow, Implementation Waves, Documentation Updates, Success Criteria all present.

---

## 1. Summary

**Overall Assessment:** Revise (one Critical, two Improvements — all addressed inline in plan rev-2).

The plan is faithfully derived from spec rev-2, with real signatures, TDD steps, correct wave-gating, and the `weeks.ts` serialization (T8→T9) correctly identified. The grounding pass on the staffreview surfaced **one Critical**: the convex-test auth harness the plan points at (`amend.test.ts`) is **pure-function-only** — it does NOT exercise a `protectedMutation` handler, and `protectedMutation` resolves the user via a **`sessionId` arg** (not `ctx.auth` identity), so T7/T8/T9 must seed `users` + `sessions` and pass `sessionId`. Fixed by repointing those tasks at the correct harness (`convex/bankStatements/__tests__/`). Two Improvements (exact FE hook name; `buildPlannedDays` caller fan-out) folded in.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location |
|---|-------|----------|----------|
| C1 | Wrong test-harness reference for `protectedMutation` handlers; `sessionId` auth arg not surfaced | Testing | T7, T8, T9 |

### Issue C1: `protectedMutation` tests need a `users`+`sessions` seed and a `sessionId` arg

`convex/lib/functions.ts:44` — `protectedMutation = customMutation(mutation, { args: SessionIdArg, ... })` resolves `ctx.user` from a **`sessionId`** argument (validated via `getSessionUserWithReason`), **not** from a Convex auth identity. The plan's T7/T8/T9 say "reuse the auth/seed harness already used by `amend.test.ts`/`saveWeekPlan` tests" — but `convex/subscriptions/__tests__/amend.test.ts` only tests **pure functions** (`computeTopupDelta`, `findProductDecreases`); there is **no** protected-handler auth harness anywhere under `convex/subscriptions/__tests__/`.

**Recommendation (applied inline):** point T7/T8/T9 at the working pattern in `convex/bankStatements/__tests__/mutations.test.ts` + `reconcileHelpers.ts` (`createSession(t, "manager", name)` → inserts a `users` row + a `sessions` row, returns a `token`; the test then calls `t.mutation(api.subscriptions.mutations.scheduleBaselineChange, { sessionId: token, subscriptionId, newQty })`). Every protected-handler call in T7/T8/T9 must pass `sessionId`. Auth-rejection coverage (e.g. an `order_staff` session is refused) should be added to T7. **T5/T6** call `internalMutation`s (no session) and are correct as written.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| I1 | Name the exact FE mutation hook (`useSessionMutation` from `convex-helpers/react/sessions`) | M | L |
| I2 | `buildPlannedDays` gains a required arg → every caller must pass it (fan-out) | M | L |

### I1: Exact FE hook
`CustomerDashboard.tsx:35` imports `useSessionQuery, useSessionMutation` from `convex-helpers/react/sessions`; the existing dialog wires via `useSessionMutation(api.crm.customers.updateCustomerCrmFields)` (`:592`). T12 said "the project's session-mutation hook" — pin it to `useSessionMutation` so the implementer doesn't reach for plain `useMutation`. **Applied to T12.**

### I2: `buildPlannedDays` caller fan-out
T9 adds `baselineDailyQty` to `buildPlannedDays`. `buildPlannedDays` is called by `seedFromTemplate` (`weeks.ts:48`), which is called by both the `seedWeek` template path and the `previousWeek` fallback. Making the arg **required** forces all call sites to compile; the `previousWeek` re-date branch (which doesn't go through `buildPlannedDays`) sets the flag inline. **T9 step 3a updated** to make the dependency explicit so a caller isn't missed.

## 4. Refinements (Optional)
- R1: T13's cron "smoke test" — if the repo has no cron-introspection harness, an AST/string assertion on `crons.ts` is acceptable (plan already says so). Consider asserting the two new minutes against a hardcoded set of existing primary minutes for a real collision check.
- R2: T1 could also note that `_devSeed.ts` (`seedCrmUat`) may want a `pendingBaselineChange`/`terminating` fixture for live persona-UAT — optional, execution-time.

## 5. Duplication Analysis
| Code | Location | How to use |
|------|----------|------------|
| session test harness | `convex/bankStatements/__tests__/reconcileHelpers.ts` (`createSession`) | reuse for T7/T8/T9 (C1) |
| `aggregateQtyByProduct` | `convex/subscriptions/amend.ts:10` | conceptual sibling of `detectAboveBaseline` (different output — keep separate) |
| `CrmFieldsEditDialog` | `src/pages/crm/CustomerDashboard.tsx:145` | structural template for the new `SubscriptionSettingsDialog` (T12) |
| WIB helpers | `convex/lib/periodRange.ts` | T4 (`getWibComponents`/`wibMidnightToUtc`) — verified shapes |

## 6. Phase / Wave Accuracy
| Wave | Assessment | Notes |
|------|------------|-------|
| 0 (schema solo) | Good | correct — schema + codegen before anything compiles |
| 1 (pure) | Good | T2/T3/T4 independent |
| 2 (backend) | Good | T8→T9 `weeks.ts` serialization correctly flagged; codegen barrier present |
| 3 (FE+cron) | Good | T11 dep T10, T12 dep T7, T13 dep T5/T6 |
| 4 (verify) | Good | T14 verify-only, T15 full gate + docs |

**Ordering issues:** none. **Missing phases:** none.

## 7. Specialist Agent Recommendations
| Wave | Agent | Rationale |
|------|-------|-----------|
| 0–2 | `convex-backend` | schema/mutations/crons/guards |
| 3 | `react-ui-builder` | DayPlanCell/grid/dialog |
| 4 | `code-auditor` | role/internal/Pitfall-#18/#19 + generated-file checks |

## 8. Git Workflow Assessment
| Check | Status |
|-------|--------|
| Feature branch specified | ✅ `feature/subscription-rule-enforcement` |
| Branch from synced main | ✅ stated in handoff |
| Commit-per-task | ✅ |
| Pre-push build/typecheck | ✅ T15 |
| Rollback | ✅ additive, revert commits |
| Deploy order | ✅ schema+codegen first; watch post-merge Deploy (index/deploy lesson) |

## 9. Documentation Checkpoints
| Phase | Docs |
|-------|------|
| T15 | CHANGELOG (always), SCHEMA (2 fields) |
| planning PR | ROADMAP (this PR) |

## 10. Testing Plan Assessment
**Verdict:** Adequate (after C1 fix). Pure predicates (T2/T3/T4 TDD), convex-test for crons/guards/mutations/wiring (T5–T9), component tests (T10/T12), cron smoke (T13), verify-only audit (T14). Auth-rejection coverage added to T7 per C1.

### Missing test coverage (added)
| # | Test | Why | Approach |
|---|------|-----|----------|
| 1 | protected-handler auth rejection (T7) | confirm `roles:["manager","admin"]` enforced | call with an `order_staff` session → expect ConvexError |
| 2 | cutoff predicate at multiple `now` (T5) | C1 of spec — date-relative correctness | already in T5 test |

## 11. Edge Cases to Address
- [x] cutoff boundary (T4/T5), effective-date boundary (T3), idempotency (T5/T6), in-flight week allowed (T8), double-notice rejected (T7), undefined endDate no-op (T8), lazy flag recompute (spec EC11).

## 12. Approval Conditions
**To approve:** C1 (done inline). **Recommended:** I1, I2 (done inline).

---

*Generated via /staffreview (skill read from disk; background-agent fallback). Findings grounded in `convex/lib/functions.ts`, `convex/bankStatements/__tests__/`, `CustomerDashboard.tsx`, `periodRange.ts`.*
