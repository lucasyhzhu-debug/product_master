# Staff Review: Subscription Phase E — Slice 1 (Telegram notification layer) — SPEC

**Date:** 2026-06-25
**Artifact:** `docs/superpowers/specs/2026-06-25-subscription-phase-e-slice1-notifications-SPEC.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Artifact type:** SPEC (not a plan) — Implementation Waves / Git Workflow / commit-checkpoint sections are intentionally deferred to the plan stage (next pipeline step). Not flagged as gaps.

---

## 0. Structure
✅ Spec validated for a spec: Scope (§1), Data/flow (§2), ACs (§3), Edge cases (§4), Testing focus (§5), Access/rollback (§6), Schema (§7 — none), Dependencies (§8), Open questions (§9), follow-slice charter (§10). Wave/git/commit sections belong to the plan, not this spec.

## 1. Summary
**Overall Assessment:** Approve (after the inline fixes below, all applied).
The slice is well-scoped — a faithful clone of the proven `sales-updates` resilient/watchdog/receipt playbook, pure-additive, no schema, ship-dark. The decomposition (notifications now; enforcement+schema later) is correct and lowers risk. Grounding the kind-6 (founders delivery-progress) read against real schema surfaced three concrete correctness issues, all fixed in the spec.

## 2. Critical Issues (Must Fix) — all addressed inline

| # | Issue | Category | Location |
|---|-------|----------|----------|
| C1 | Wrong delivered-status literal for kind 6 | Logic/Correctness | §2.2, AC5, EC7, §8, Q-delivered |

### C1: Kind 6 delivered count keyed on legacy statuses
The spec originally defined "delivered" as `CompleteShipped`/`PickedUp`. Per `convex/schema.ts:223`, those are **LEGACY** statuses ("kept for unmigrated production docs"); the **current canonical terminal status is `"Complete"`** (comment: "Replaces CompleteShipped/PickedUp"). Subscription orders are Phase-B-new, so they will only ever be `"Complete"` — counting only the legacy literals would yield **always-zero delivered pcs**, silently breaking the founders summary.
**Fix (applied):** delivered = `status === "Complete"`; Q-delivered resolved at spec time; legacy literals noted as unnecessary-but-harmless. Reused for Phase D AC13 parity.

## 3. Improvements (Recommended) — all addressed inline

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| I1 | Specify kind-6 delivered read path — qty is in `orderItems`, not `orders` | H | L |
| I2 | Prefer `orders.by_subscriptionWeek` over `by_subscription`+date-window | M | L |
| I3 | WIB current-week lookup via stored `weekStart/weekEnd`, not recomputed | M | L |
| I4 | Document `assertKnownRole` as the AC1 binding mechanism | L | L |

### I1: Delivered pcs must sum `orderItems.quantity`
`orders` has no qty field (`schema.ts:364`: `quantity` lives on `orderItems`). The read must: current week → its `Complete` subscription orders → per order, sum `orderItems.quantity` via `orderItems.by_order`. Both `weekPlannedPcs` (`ScheduleLine.qty`) and `deliveredPcs` (`orderItems.quantity`) are **product-level** pcs — consistent with "pcs = product pieces, not BOM balls". Bounded N+1 (cron context) — documented as acceptable, no pre-optimization. (Applied in §2.2.)

### I2: Use the precise index
`orders.by_subscriptionWeek` (`schema.ts:355`) ties orders directly to a week — cleaner than `by_subscription` + a `weekStart..weekEnd` date filter. Spec now prefers it, with the date-window as a documented fallback and a plan-time check that B populates `orders.subscriptionWeekId` (new open Q-week-link).

### I3: Current-week resolution
`calculateWeekRange(weekStartMs)` exists (`periodRange.ts:201`) but the current week is found from the **subscriptionWeek's stored `weekStart..weekEnd`** (range scan on `by_subscription_weekStart`), not by recomputing a week from `now`. EC8 updated.

### I4: AC1 mechanism
`getChatIdByRole` args are `{role: v.string()}` (no compile gate), but `chatRegistry.ts assertKnownRole` (called by `assignRole`) rejects unknown roles — so appending to `KNOWN_TELEGRAM_ROLES` is precisely what lets an operator bind a chat in `/admin/telegram-chats`. Noted in AC1.

## 4. Refinements (Optional)
- Add a kind-6 fixture with a **multi-line-item** order to lock the `orderItems.quantity` summation (folded into §5 T3 fixtures).
- EC4 ("nothing due") copy: decide per-kind whether to send a benign "nothing due" line or skip — lock in the formatter tests (Q2).

## 5. Duplication Analysis
### Existing code to leverage (the slice already mandates these)
| Code | Location | How to use |
|------|----------|------------|
| `sendSalesSummary` triad shape | `convex/telegram/salesSummary/sendSalesSummary.ts` | structural template for the kind-parameterized triad |
| `cronRetry.ts` | `convex/telegram/cronRetry.ts` | reuse `isTransientError`/`resilientRetryDelayMs`/`RESILIENT_MAX_ATTEMPTS` verbatim |
| `deliveryReceipts.ts` | `convex/telegram/deliveryReceipts.ts` | `wasDelivered`/`recordDelivery`; add `subscriptionSlotKey` alongside `salesSlotKey` |
| `getChatIdByRole`/`getChatAuth` | `convex/telegram/chatRegistry.ts` | role→chatId resolution |
| `getWibDateStr`/`calculateWeekRange`/`getWibComponents` | `convex/lib/periodRange.ts` | WIB math (Pitfall #18 — canonical only) |
**Duplication risk:** none — the slice is explicit about reusing the playbook rather than re-rolling retry/watchdog logic (AC2/AC3).

## 6. Phase / Wave Accuracy
Deferred to the plan. Decomposition (Slice 1 notifications / Slice 2 enforcement) validated: §10 keeps schema + B-code edits out of this slice. Correct ordering.

## 7. Specialist Agent Recommendations (for the plan's execution)
| Work | Agent | Rationale |
|------|-------|-----------|
| read queries + send actions + crons | `convex-backend` | all backend, Convex idioms |
| formatter unit tests + convex-test query tests | `tdd-test-architect` | pure-formatter + convex-test coverage |
| pre-merge audit | `code-auditor` | grep internalQuery/internalAction-only (AC8), no writes outside receipts (AC9) |

## 8. Git Workflow Assessment
Deferred to plan. Pipeline convention: feature branch off synced main, squash-merge PR. Pre-push: `npm run type-check` + `npx vitest run convex/telegram convex/subscriptions` + `npm run build` + `npx convex codegen` (AC12). Rollback = revert (pure-additive, no migration). `gh run list` split-brain check after merge.

## 9. Documentation Checkpoints
At execution/merge: `docs/CHANGELOG.md` (always); `docs/API_REFERENCE.md` (new internal actions/queries); `CLAUDE.md` Pitfall #21 already covers the role-add pattern (no edit needed). No `SCHEMA.md` change (no schema).

## 10. Testing Plan Assessment
**Verdict:** Adequate (for a spec). Six pure formatters (T2) + `getWeeklyDeliveryProgress` shaping (T3) + five read queries (T4) + slot-key determinism (T1) + cron-collision smoke (T5), with concrete fixtures. Plan must convert these into TDD steps with real signatures.

## 11. Edge Cases — covered
EC1 unassigned chat, EC2 transient+watchdog, EC3 receipt-fail idempotency, EC4 empty-state, EC5 snapshot price, EC6 deleted product, EC7 week/status exclusion, EC8 WIB current-week, EC9 partial multi-chunk send. Added kind-6 multi-line-item fixture (Refinement).

## 12. Approval Conditions
**To approve:** C1 ✅ (applied). 
**Recommended:** I1–I4 ✅ (applied). 
**Status:** Spec approved for planning. Carry Q2 (copy) and Q-week-link into the plan as plan-time verifications.

### Evidence-Before-Mitigation Gate (§4.9)
N/A — this slice adds new outbound notifications; it is not a fix to a flake/race/transient. (It *reuses* the watchdog mitigation that was already evidence-backed by incident 2026-06-02 / `.planning/debug/...telegram-cron-retry-launch-drop.md`.)

---
*Generated by /staffreview — spec gate (pipeline step 3).*
