# Staff Review: Subscription Phase E — Slice 1 (Telegram notification layer) — PLAN

**Date:** 2026-06-25
**Plan:** `docs/superpowers/plans/2026-06-25-subscription-phase-e-slice1-notifications.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Plan Structure:** ✅ Validated — Goal/Architecture/Global Constraints, flat Task List, Execution Strategy (waves + serialization + critical path + headless + close-out), File Structure, per-task TDD steps with real code, Git Workflow, Documentation Updates, Success Criteria, Self-Review. All present.

---

## 1. Summary
**Overall Assessment:** Approve (after the inline fixes below, all applied).
The plan is execution-ready: pure-additive, internal-only, faithfully cloning the `sales-updates` resilient/watchdog/receipt playbook, with bite-sized TDD steps and real signatures. Verifying the flagged assumptions against merged Phase B caught two genuine correctness bugs (date off-by-one, wrong amount-due source) and one test-harness mismatch — all fixed in the plan before any code is written, which is exactly the point of this gate.

## 2. Critical Issues (Must Fix) — all addressed inline

| # | Issue | Category | Location |
|---|-------|----------|----------|
| C1 | `fmtDate` renders a 0-indexed month (June → "05") | Logic | T4 formatter |
| C2 | kind-2 `amountDue` read from `creditIssued` (= 0 pre-payment) | Logic/Money | T3 `getWeeklyInvoicesDue` |

### C1: Month off-by-one in `fmtDate`
`getWibComponents` returns `month` **0-indexed** (`convex/lib/periodRange.ts:35`). The plan's `fmtDate` fed it straight into the display string, so every reminder/summary date would be one month behind. **Fix (applied):** `month + 1` in `fmtDate`, plus a guard test asserting `22/06/26` for a June `weekStart`. (The in-query comparisons are unaffected — both sides come from `getWibComponents`, so they stay consistent.)

### C2: Amount-due source under deferred revenue
`createSubscriptionWeeklyInvoice` (`convex/subscriptions/invoicing.ts:111`) builds the invoice from `Σ plannedDays[].items[].lineTotal`. In the deferred-revenue model, `subscriptionWeeks.creditIssued` is only populated when the invoice is **paid** (top-up at funding) — so a `confirmed`/`invoiced` **unpaid** week (exactly what kind 2 reminds about) has `creditIssued = 0`, and the reminder would show "Rp 0 due". **Fix (applied):** `getWeeklyInvoicesDue` now computes `amountDue` from `plannedDays[].items[].lineTotal`.

## 3. Improvements (Recommended) — addressed inline

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| I1 | convex-test harness import was a nonexistent `test.setup` | H | L |

### I1: convex-test module glob
The project pattern (verified in `convex/consignment/__tests__`, `convex/migrations/__tests__`, `convex/productInventory/__tests__`) is an **in-file** `const modules = import.meta.glob("../../**/*.ts")` passed as `convexTest(schema, modules)` — not an import from a `test.setup` module (which doesn't exist). **Fix (applied)** in the T3 test header.

## 4. Refinements (Optional)
- The T7 cron smoke test introspects `cronJobs()` internals, which may be brittle across Convex versions; the plan already documents a source-regex fallback. Prefer the fallback if the internal shape isn't stable — the invariant (primary/watchdog minute-uniqueness) is what matters, not the introspection mechanism.
- Consider a single shared `activeSubscriptions(ctx)` helper typed with `QueryCtx` rather than `ctx: any` (Critical Convex Lesson: `ctx: {db: any}` breaks typed APIs). Minor — the `any` here is local to read helpers, but tightening to `QueryCtx` is cheap and on-convention.

## 5. Duplication Analysis
### Existing code leveraged (correctly)
| Code | Location | Use |
|------|----------|-----|
| send/resilient/watchdog triad | `convex/telegram/salesSummary/sendSalesSummary.ts` | structural template (T5) |
| `cronRetry.ts` | `convex/telegram/cronRetry.ts` | retry primitives, reused verbatim |
| `deliveryReceipts.ts` | `convex/telegram/deliveryReceipts.ts` | receipts + new `subscriptionSlotKey` alongside `salesSlotKey` |
| `getWibComponents`/`getWibDateStr` | `convex/lib/periodRange.ts` | WIB math (Pitfall #18) |
**Duplication risk:** none — no re-rolled retry/watchdog/receipt logic.

## 6. Phase / Wave Accuracy
| Wave | Assessment | Notes |
|------|------------|-------|
| 1 (T1,T2,T3) | Good | genuinely independent files; codegen-once gate correct |
| 2 (T4) | Good | depends on T2 kinds + T3 types — correct |
| 3 (T5) | Good | integrator; codegen after for self-refs |
| 4 (T6) | Good | crons reference T5 actions |
| 5 (T7) | Good | codegen commit + smoke + full verify |
**Ordering issues:** none. **Critical path** (T3→T4→T5→T6→T7) correctly identified. Shared-file serialization (`_generated/` once-per-wave/commit-in-T7; `crons.ts` only T6; `types.ts`/`queries.ts` only T3) is sound.

## 7. Specialist Agent Recommendations
| Work | Agent | Rationale |
|------|-------|-----------|
| T3/T5/T6 backend | `convex-backend` | Convex internalQuery/action idioms |
| T3/T4 tests | `tdd-test-architect` | convex-test + pure-formatter coverage |
| pre-merge | `code-auditor` | AC8 (internal-only) + AC9 (no writes outside receipts) greps |

## 8. Git Workflow Assessment
| Check | Status |
|-------|--------|
| Feature branch specified | ✅ `feature/subscription-phase-e-slice1` off synced main |
| Branch naming convention | ✅ |
| Merge strategy | ✅ squash-PR (pipeline) |
| Commit checkpoints | ✅ one per task T1–T7 |
| Pre-push build/typecheck | ✅ T7 (`type-check`+`vitest`+`build`+`codegen`) |
| Rollback | ✅ revert (pure-additive, no migration) |
| Deployment order | ✅ no schema → no ordering constraint; `gh run list` split-brain check noted |

## 9. Documentation Checkpoints
| When | Docs |
|------|------|
| merge | `docs/CHANGELOG.md` (always); `docs/API_REFERENCE.md` (new internal fns) |
| — | no `SCHEMA.md` (no schema delta); `CLAUDE.md` Pitfall #21 already covers role-add |

### CHANGELOG draft
~~~markdown
## 2026-06-25 — Subscription Phase E Slice 1 (Telegram notification layer)
- Add `subscription-ops` + `founders` Telegram roles (operator-assigned, ship-dark)
- 6 WIB subscription reminders/summaries + 6 watchdogs reusing the resilient-send playbook
- 6 read-only internal queries + 6 pure formatters; no schema change, read-only (receipts only)
~~~

## 10. Testing Plan Assessment
**Verdict:** Adequate. TDD throughout: config (T1), kinds+slotkey determinism (T2), 6 queries via convex-test incl. EC4/EC6/EC7 (T3), 6 pure formatters incl. empty-state + deleted-product + integer IDR + month-boundary (T4), cron minute-uniqueness smoke (T7). Money/pcs assertions use known expected values.
### Regression risk
- `crons.ts` edited (append-only) — existing cron tests unaffected; new smoke test guards collisions.
- No existing test should break (pure-additive). T7 confirms `git diff convex/schema.ts` empty.

## 11. Edge Cases to Address — covered in plan
- [x] Unassigned chat (EC1, fail-fast) · [x] transient+watchdog (EC2/EC3) · [x] empty states (EC4) · [x] snapshot price (EC5, confirmed) · [x] deleted product (EC6) · [x] week/status exclusion (EC7) · [x] WIB current-week (EC8) · [x] partial multi-chunk (EC9).

## 12. Approval Conditions
**To approve:** C1 ✅, C2 ✅ (applied). 
**Recommended:** I1 ✅ (applied). 
**Status:** Plan approved for execution. Carry the two Refinements (cron-introspection fallback; `QueryCtx` over `ctx: any`) into execution at the implementer's discretion. Q2 reminder copy refines against proof ⑨ during T4.

### Evidence-Before-Mitigation Gate (§4.9)
N/A — additive notification feature, not a flake/race fix. It reuses the watchdog mitigation already evidence-backed by incident 2026-06-02 (`.planning/debug/...telegram-cron-retry-launch-drop.md`).

---
*Generated by /staffreview — plan gate (pipeline step 5).*
