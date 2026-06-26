# Staff Review: Subscription Phase E Slice-2 — Rule-Enforcement (SPEC)

**Date:** 2026-06-26
**Artifact:** `docs/superpowers/specs/2026-06-26-subscription-rule-enforcement-design.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Artifact type:** Spec (pre-plan). Reviewed for grounding correctness, scope, schema, logic, testability, rollback.

---

## 1. Summary

**Overall Assessment:** Revise (one Critical, three Improvements — all addressed inline in spec rev-2).

The spec is well-grounded against real code (field names, line numbers, strip sites, cron minutes all verified). The locked design is faithfully transcribed. **One genuine correctness defect surfaced from grounding the WIB cutoff math: the `flipDayLocksAtCutoff` firing time (12:25 WIB) is _before_ the 13:00-WIB cutoff it enforces, so "lock tomorrow's day past its cutoff" cannot be literally true at fire time.** Fixed by making the lock predicate date-relative (lock any day whose cutoff `≤ now`) rather than hardcoding "tomorrow", which also makes the firing time a convenience rather than a correctness lever and gives free catch-up on a missed run.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location |
|---|-------|----------|----------|
| C1 | Cutoff-lock firing time precedes the cutoff it enforces → "lock tomorrow's day past cutoff" is false at fire time | Logic / WIB | §1 rule 1, §2.2 `flipDayLocksAtCutoff`, AC2 |

### Issue C1: `flipDayLocksAtCutoff` fires before the cutoff elapses

`changeCutoffDayOffset = -1`, `changeCutoffHour = 13` ⇒ the cutoff for a delivery on day **D** is **(D−1) 13:00 WIB**. The cron is specified to fire at **12:25 WIB** (05:25 UTC, "just before the 12:30 nudge") and lock **tomorrow's** day.

Walk it through at `now = T 12:25 WIB`:
- **Tomorrow (D = T+1):** cutoff = `T 13:00` ≤ `T 12:25`? **No** — the cutoff is still 35 min in the future. Locking tomorrow here is **premature** and contradicts AC2 ("whose cutoff has passed").
- **Today (D = T):** cutoff = `(T−1) 13:00` ≤ `T 12:25`? **Yes** — today's delivery day became past-cutoff at yesterday 13:00, and **no run has locked it yet** (yesterday's 12:25 run evaluated `T` and found `(T−1)13:00 > (T−1)12:25` → did not lock).

So "fire at 12:25 + lock tomorrow" is off by one day relative to the actual cutoff rule. "Lock tomorrow's day" pairs correctly only with a **post-13:00** firing.

**Recommendation (keeps the locked 12:25 fire, makes it correct):** implement the lock decision **date-relative**, not "tomorrow"-hardcoded. For each non-`locked` `plannedDays[]` entry in the subscription's current/upcoming weeks, set `locked = true` iff `cutoffMsFor(day.date) ≤ now`, where `cutoffMsFor(deliveryDateMs)` = WIB-midnight of `(deliveryDate + changeCutoffDayOffset*DAY)` plus `changeCutoffHour` hours (computed via `periodRange` `getWibComponents`/`wibMidnightToUtc`). This:
1. Locks exactly the days whose cutoff has elapsed as of `now` (correct at any firing time).
2. Is idempotent and self-healing — a missed daily run is caught up on the next run (no watchdog needed).
3. Makes 12:25 WIB a harmless convenience (it locks today + any earlier past-cutoff day; tomorrow gets locked by the next day's run once `T 13:00` passes).

This is the robust shape; "tomorrow's day" was a lossy shorthand for "the day whose cutoff just passed". **Resolved inline in spec rev-2** (§1 rule 1, §2.2, AC2, EC, T3 updated).

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| I1 | Settings dialog is subscription-scoped, but the existing `CrmFieldsEditDialog` is customer-scoped — spec must not imply reuse | M | L |
| I2 | `applyPendingBaselineChanges` / `flipDayLocksAtCutoff` scan shape — state bounded-scan rationale (no index on `pendingBaselineChange`) | M | L |
| I3 | Baseline change does not retro-sweep existing weeks' `needsSupplierConfirmation` (recomputed lazily on edit) — document | L | L |

### I1: Settings dialog scope
`CustomerDashboard.tsx:145 CrmFieldsEditDialog` edits **customer** CRM fields, not a subscription. The new baseline/termination triggers are subscription-scoped. The spec already adds a **new** subscription-scoped dialog (good) and flags this as Q2 — keep that explicit so the implementer does not try to extend the customer dialog. **Already in spec §2.2 + Q2.**

### I2: Scan shape
`subscriptions` has only `by_customer`/`by_status` — no index on `pendingBaselineChange`. `applyPendingBaselineChanges` will full-scan `subscriptions` (or scan `by_status` active). That's fine in cron context (subscription count is tiny — C9 bounded), but state it so a reviewer doesn't flag an unbounded scan. Same for `flipDayLocksAtCutoff`. **Added to spec §2.2 + Q3.**

### I3: Lazy flag recompute
`needsSupplierConfirmation` is recomputed only at the three `plannedDays` write sites. A `baselineDailyQty` change (via apply cron) does **not** re-sweep already-written weeks' flags. Since the flag is warn-only, this is acceptable, but document it so it isn't read as a bug. **Added to spec EC.**

---

## 4. Refinements (Optional)

- R1: Consider mirroring the baseline/termination controls onto `SubscriptionPage.tsx` (canonical per-sub page) for discoverability — spec Q2 already raises this; plan-time call.
- R2: AC11 audit checklist could enumerate the exact 10 strip sites verbatim so the verify task is a literal grep-and-tick. Spec §2.1 already lists them.

## 5. Duplication Analysis

### Existing code to leverage
| Code | Location | How to use |
|------|----------|------------|
| `detectAboveBaseline` analog `aggregateQtyByProduct` | `convex/subscriptions/amend.ts:10` | day-total can reuse the same per-day summation shape (pure) |
| WIB math | `convex/lib/periodRange.ts` | cutoff/effective-date — do NOT hand-roll Date (Pitfall #18) |
| strip helpers | `convex/orders/helpers/stripSubscriptionPricing.ts` | AC11 verify-only; nothing to build |
| `internalMutation` cron pattern | `convex/crons.ts` + `internal.*` refs | register the 2 new crons |

### Potential duplication risks
- `detectAboveBaseline` vs `aggregateQtyByProduct`: the former needs only the **day total**, the latter is per-product. Keep `detectAboveBaseline` as its own pure fn (different output) but it may call/inline the same sum.

## 6. Phase / Wave Accuracy
Spec, not a plan — wave breakdown is the plan's job. Schema-first ordering is correctly implied (§2.2 "first task: schema delta + codegen").

## 7. Testing Plan Assessment
**Verdict:** Adequate. Pure predicates (TDD), convex-test for crons/guards/mutations, cron-minute smoke. T3 updated to test the date-relative lock predicate at multiple `now` values + idempotency. Money: no new money math (warn/flag/metadata only) — correctly out of scope.

## 8. Edge Cases
Covered: boundary equality (above-baseline + effective-date), idempotency, in-flight-week allowance, undefined-endDate no-op, double-notice rejection, lazy flag recompute (added). 

## 9. Approval Conditions
**To approve:** C1 resolved (done inline rev-2).
**Recommended:** I1–I3 documented (done inline rev-2).

---

*Generated via /staffreview (skill read from disk; background-agent Skill-tool fallback).*
