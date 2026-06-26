# Staff Review: Subscription Phase E Slice-2 — Rule Enforcement (IMPLEMENTATION)

**Date:** 2026-06-27
**Branch:** `feature/subscription-rule-enforcement`
**Range:** `dbb0671d..237bf66e` (30 files, ~2,038 insertions)
**Reviewer:** Staff/Principal Engineer review — plan-to-implementation fidelity + architectural risk
**Artifacts:** plan `docs/superpowers/plans/2026-06-26-subscription-rule-enforcement.md`; spec (rev-2) `…-design.md`; spec/plan staffreviews (2026-06-26).

---

## Summary

A faithful, high-quality implementation of Slice-2. All 15 planned tasks landed with the planned file footprint, the date-relative cutoff predicate from spec-C1 is implemented correctly (not "tomorrow"-hardcoded), the warn-not-lock distinction holds (the cron's per-day `locked` write never gates editing — `saveWeekPlan` only blocks on week *status*), clause-8 COGS alerting stays dropped, and the two new schema fields are additive-optional with no migration. The AC11 verify-only audit is thorough and the 8 confidential fields + 10 strip sites are confirmed. Gates are green: I ran the new backend suites — **34/34 pass** (enforcement predicates, crons, guards, above-baseline wiring, cron-uniqueness).

No Critical issues. Two **Important** findings concern slow-burn architecture (an unbounded `subscriptionWeeks` read that grows with calendar time, and an under-documented/untested cross-slice coupling on the `plannedDays[].locked` field that the Slice-1 nudge reads). Neither breaks current behavior; both match patterns the carried Slice-1 lessons explicitly warned about. The remainder are minor coverage/cleanup items.

**Verdict: APPROVE WITH FOLLOW-UPS.** Mergeable as-is; address Important-1 (bound the cron scan) before the subscription base ages, and Important-2 (document + regression-test the cross-slice `locked` coupling) in this slice or a fast-follow.

---

## Critical Issues

None. No correctness-breaking defect found; the plan's spec-C1 (date-relative cutoff) and plan-C1 (`sessionId` protected-handler test harness) fixes are both correctly reflected in the code and tests.

---

## Improvements (Important)

### I1 — `flipDayLocksAtCutoff` reads **all** weeks per subscription; the read grows unbounded with calendar time
`convex/subscriptions/enforcement/flipDayLocksAtCutoff.ts:30-33` collects every `subscriptionWeeks` row for each active/terminating sub:

```ts
const weeks = await ctx.db
  .query("subscriptionWeeks")
  .withIndex("by_subscription_weekStart", (q) => q.eq("subscriptionId", sub._id))
  .collect();           // ← no upper/lower bound on weekStart
for (const week of weeks) {
  if (week.status === "reconciled" || week.status === "closed") continue;  // skipped only AFTER the read
```

Terminal weeks are skipped *in-loop*, not excluded from the query, so the daily cron re-reads the subscription's entire week history forever (≈+52 rows per sub per year). This directly contradicts the spec's own C9 rationale — §2.2 says "iterate only non-terminal weeks **to bound the set**" — and the carried Slice-1 lesson (`lessons_subscription_phase_e_slice1_triple_review.md`: "**bound `currentWeek` scan (calendar-time growth)**"). It is the same class of issue, reintroduced.

It is not a correctness bug (already-locked past days hit `!d.locked` → no patch; reconciled/closed are skipped; idempotent), purely read-volume growth in a daily cron.

**Fix:** range-bound the index to the only weeks that can hold a not-yet-past-cutoff day — e.g. `weekStart >= now - 14*DAY_MS` (older weeks' days are all past-cutoff and, after one run, already `locked`), or iterate `subscriptionWeeks.by_status` for the non-terminal statuses and resolve the sub. Keeps the read O(active subs) instead of O(all weeks ever).

### I2 — Cross-slice coupling on `plannedDays[].locked`; the spec's "Slice-1 does not read the locked flag" claim is wrong, and the interaction is untested
Slice-2's cron now **writes** `plannedDays[].locked = true`. Slice-1's "change cutoff" nudge **reads** it: `convex/subscriptions/reminders/queries.ts:106` filters `… && !pd.locked` in `getDaysApproachingCutoff` (the 05:30 UTC Telegram nudge). The Slice-2 spec §10 asserts "*the nudge in Slice 1 only notifies, it does not read the `locked` flag — no hard dependency*" — that is factually incorrect; it does read it.

Current behavior is **benign**: the cron fires 05:25 UTC (12:25 WIB), 5 min before the nudge, and the date-relative predicate does **not** lock "tomorrow's" day at 12:25 (its cutoff is 13:00 WIB), so the nudge still sees `!pd.locked === true` and fires. But this is a genuine writer/reader coupling across slices, resting entirely on cron-minute ordering and the WIB cutoff offset, with **no regression test** pinning it. A future change to either cron's minute, or to `changeCutoffHour`/`changeCutoffDayOffset`, could silently start suppressing the nudge.

**Fix:** (a) correct the spec note; (b) add a convex-test asserting `getDaysApproachingCutoff` still emits the row for tomorrow's day when the cutoff cron has run at the 05:25 fire-time; (c) ideally decouple — the nudge's intent ("approaching cutoff") is better expressed against `cutoffMs(date)` than against the lock side-effect.

---

## Improvements (Minor)

### M1 — `flipDayLocksAtCutoff` test under-covers the spec's T3 matrix
`flipDayLocksAtCutoff.test.ts` covers lock-past/not-future, idempotency, and metadata-only — but omits three cases the spec testing-focus T3 called for: **ended-sub skipped**, **terminating-sub included**, and **missed-run multi-day catch-up** (two past-cutoff days locked in one run). The code is structurally correct (status filter excludes `ended`; `terminating` is explicitly unioned in), but those branches are unverified. Add them — cheap, and they pin EC2/EC10.

### M2 — Dead predicate exports (`permanentChangeEffective` / `terminationEffective`)
`enforcement/effectiveDates.ts` exports and tests `permanentChangeEffective` and `terminationEffective`, but neither is used in production: `scheduleBaselineChange`/`giveTerminationNotice` use `effectiveDateOf`, `applyPendingBaselineChanges` inlines `pending.effectiveDate <= now`, and the termination guard inlines `weekStart > sub.endDate`. They're only referenced by their own unit tests. Mild over-engineering — either wire the apply-cron/guard to call them (removes a magic comparison and makes the boundary semantics single-sourced) or drop them. Prefer the former for the apply cron.

### M3 — `applyPendingBaselineChanges` full-scans every subscription (incl. `draft`/`ended`)
`applyPendingBaselineChanges.ts:9` does `.query("subscriptions").collect()` across all statuses. Acceptable per C9 (table is account-bounded, not calendar-bounded) and idempotent, but a `by_status` scan of `active`/`terminating` would be tighter and consistent with the cutoff cron. Low priority.

---

## Refinements (Nitpick)

- **N1 — Field/prop name overload.** The schema field `plannedDays[].locked` now means "past cutoff," while the `DayPlanCell`/`WeekCalendarGrid` `locked` **prop** means "grid edit-lock (week not editable)," and the new `pastCutoff` prop is fed *from* `day.locked`. Three meanings, two share a name. Functionally separated and commented in `SubscriptionSchedulePage.tsx:205`, but the overload invites future confusion — a short schema-field comment ("set by flipDayLocksAtCutoff; UI surfaces as pastCutoff, NOT an edit-lock") would help.
- **N2 — No-op baseline change.** `SubscriptionSettingsDialog` will `scheduleBaselineChange` even when `newQty === baselineDailyQty`, staging a pending change that does nothing in 14 days. Consider disabling submit when unchanged.
- **N3 — D12 error state.** Errors surface via `toast` only (consistent with the existing CRM dialog pattern); there's no inline error region. Acceptable, noted for completeness.

---

## Verdict

**APPROVE WITH FOLLOW-UPS.**

Plan fidelity is excellent — every task built as specified, no scope creep, clause-8 correctly dropped, both prior staffreview Criticals (date-relative cutoff; `sessionId` test harness) correctly incorporated, gates green (34/34 new tests pass, AC11 audit PASS). The warn-not-lock semantics, server-side strip (D11), and additive-schema discipline all hold.

Merge is safe. Track as fast-follows:
1. **(Important)** Bound the `flipDayLocksAtCutoff` week read (I1) — same calendar-growth pattern the Slice-1 retro flagged.
2. **(Important)** Correct the spec claim and add a regression test for the Slice-1 `!pd.locked` nudge coupling (I2).
3. **(Minor)** Fill the `flipDayLocksAtCutoff` T3 test gaps (M1); resolve the dead effective-date predicates (M2).

Post-merge: confirm `gh run list` Deploy is green (additive fields deploy clean — `lesson_convex_index_deploy_validation`), and the still-pending live persona-UAT of the two FE journeys (cutoff warning/badge in the grid; baseline/termination dialog) per the plan's headless-pending flag.
