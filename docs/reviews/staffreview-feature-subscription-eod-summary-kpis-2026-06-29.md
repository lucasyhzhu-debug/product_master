# Staff Review — feature/subscription-eod-summary-kpis

**Commit:** 7298d9ed vs origin/main
**Reviewer:** staff-eng review (2026-06-29)
**Scope:** Extend the existing `weekly-delivery-progress` Telegram reminder (daily founders summary) with four end-of-day KPIs — `shippedTodayPcs`, `weeklyQty`, `weeklyLeft`, `creditRemaining`.

---

## Summary

The change is small, well-contained, and additive: it threads four new fields onto `DeliveryProgressRow`, computes them inside the existing `getWeeklyDeliveryProgress` internalQuery, and renders them in `formatWeeklyDeliveryProgress`. `tsc -p convex` passes; the new unit tests assert the query and formatter behaviour (13/14 formatter tests pass — the single failure is a 5s cold-start worker timeout on this machine, not a logic defect; setup alone took 53s).

The architectural call to **extend the existing kind rather than fork a new one** is correct and low-risk: `getWeeklyDeliveryProgress`/`DeliveryProgressRow`/`formatWeeklyDeliveryProgress` form a closed producer→type→consumer triangle (verified — the query is the only producer, the formatter the only consumer, and all test literals were updated), so adding required fields can't silently break an unlisted caller. `creditRemaining` correctly reads the derived pool via `deriveCreditPool` (CRM C10), not a denormalised total.

**However, the build diverges from the locked SPEC on three substantive points** — ball-counting, the acceptance-test shape, and the "shipped today" time key — and the SPEC's own Decisions block is now stale relative to what shipped. None are merge-blockers if the team consciously accepts them, but the ball-counting gap directly undercuts the stated purpose of this feature ("the daily message is the primary proof the whole flow works").

---

## Critical Issues

### C1 — KPIs count product rows, not BOM-resolved balls (violates SPEC + Business Rule #13)

SPEC §Slice 4 (lines 83–84) and the locked Decision (line 113) are explicit: *"Shipped today — BOM-resolved balls (Big+Mid)… Count balls, NOT product rows (Business Rule #13)"* and *"Left = `weeklyQty − (BOM balls delivered Mon→today this week)`"*. The SPEC even names the helper to reuse (`calculateBallStatsFromItems` / `buildBallCountMap` / `computeBallTotals`, line 119).

The implementation instead sums raw `orderItems.quantity`:

```ts
shippedTodayPcs += itemLists[i].reduce((s, it) => s + it.quantity, 0);
...
const weeklyLeft = Math.max(0, weeklyQty - deliveredPcs); // deliveredPcs = Σ it.quantity
```

This is the exact anti-pattern called out in CLAUDE.md Pitfall #13 / Business Rule #13: a product row is not a ball. A `Bite Triple` line (`quantity: 1`) is 3 balls; a hamper line is N balls. For any subscription whose SKUs are not strictly 1-ball singles, `shippedTodayPcs` and `weeklyLeft` undercount, and `weeklyQty` (the allotment, presumably expressed in balls) won't reconcile against a row-counted "used".

Note the **pre-existing** `weekPlannedPcs`/`deliveredPcs` already count rows, so this code is internally consistent with the kind it extends — but the SPEC explicitly asked Slice 4 to count balls, and this is the metric Lucas designated as the acceptance proof. If B2B subscription products happen to all be 1-ball singles today the runtime impact is currently nil, but the metric is wrong by construction and will drift the moment a multi-ball SKU is subscribed. **Resolve by routing the qty sums through the BOM ball helper, or explicitly record (in SPEC + CHANGELOG) that "pcs" here means product rows and amend Business Rule #13's applicability.**

---

## Improvements (Important)

### I1 — Acceptance test is weaker than the SPEC mandated

SPEC §Slice 4 (lines 104–110) makes the acceptance test the headline deliverable: extract a **pure `composeSubscriptionDaySummary(...)`** and assert the **composed message string equals the expected shipped/left/credit line-for-line**. The build reuses the existing `formatWeeklyDeliveryProgress` and asserts loose substrings (`toContain("Shipped today: 5")`, `toMatch(/13 left/i)`, `toMatch(/17[.,]400[.,]000/)`). There is no exact-string lock, so message wording/ordering can regress silently, and the regex `/17[.,]400[.,]000/` would also match `170.400.000` — a weak guard on the money path. The query test also only covers the positive `deliveryDate === today` path; there is no negative case proving an order with `deliveryDate !== today` is excluded from `shippedTodayPcs`. Add a line-for-line equality test on the composed block and a deliveryDate-mismatch exclusion case.

### I2 — "Shipped today" keyed on scheduled `deliveryDate`, not actual ship/recognition time

`shippedTodayPcs` filters `status === "Complete" && wibDayKey(o.deliveryDate) === todayKey`. `deliveryDate` is the **scheduled** date set at order creation, not when the order was actually delivered/recognized. Failure modes:

- Order scheduled yesterday, marked Complete today → counted as *yesterday*, missing from today's "shipped today".
- Order scheduled today but its `deliveryDate` later edited/rolled → drops out even though it shipped today.
- The actual recognition signal — the drawdown ledger entry's `_creationTime` — is ignored.

For a message literally titled "Shipped today", keying on the day the credit was actually drawn down (or a delivered-at timestamp) is more truthful than the schedule. If the team accepts "scheduled == actual" as an operating invariant (staff always set `deliveryDate` to the real ship day before marking Complete), document that assumption in code; otherwise key on completion/drawdown time.

### I3 — Message now shows two competing "remaining" numbers

The rendered block is additive on top of the legacy lines:

```
Shipped today: 5 pcs
Used this week: 8/21 — 13 left        ← weekly allotment remaining (weeklyQty − used)
8 out of 21                            ← legacy plan line
13 pcs remaining in quota             ← weekPlannedPcs − deliveredPcs
Credit remaining: Rp 17.400.000
```

`weeklyLeft` (allotment) and `remaining` (live plan) are *different concepts* that coincide only when `weeklyQty === weekPlannedPcs`. The SPEC example (lines 92–97) is a clean 3-line message; the shipped message stacks five lines with two unlabelled "remaining" values that will diverge the moment a cafe over/under-orders vs plan — exactly the scenario Q5 flagged. Founders reading "13 left" and "13 pcs remaining in quota" today will read them as the same thing and be confused when they differ. Consolidate to the SPEC's three lines, or label the two clearly (e.g. "allotment left" vs "vs plan").

---

## Refinements (Minor / Nitpick)

### M1 — SPEC Decisions block is now stale (recipient + new-kind)

The locked Decisions (SPEC lines 112–120) say **Recipient = `subscription-ops`** and *"Add an end-of-day 'day-summary' kind rather than a parallel system."* What shipped sends to **`founders`** (verified: `roleForKind["weekly-delivery-progress"] = "founders"`, unchanged) and reuses the existing kind rather than adding a `day-summary` kind. This matches the later verbal call ("keep founders, extend the existing kind") and the commit framing, so the *code* is consistent with current intent — but the SPEC was never reconciled and commit `cd69ed2f` literally records "recipient=subscription-ops". A future reader auditing against the SPEC will see a contradiction. Update SPEC lines 114/120 to record the keep-founders / extend-existing-kind decision.

### M2 — `sub.weeklyQty ?? 0` is dead-defensive and silently degrades

`weeklyQty` is a required `v.number()` (schema.ts:2523), so `?? 0` can never fire for a valid row. Harmless, but if a malformed/legacy sub ever lacks it the message prints `Used this week: N/0 — 0 left` with no signal that the allotment is unknown. Either drop the `?? 0` (let it surface) or render an explicit "allotment not set".

### M3 — `creditRemaining` is week-scoped

The ledger query is `by_subscriptionWeek` (week-scoped), matching SPEC line 88 (`deriveCreditPool(weekLedger)`). Correct per spec — flagging only so it's a conscious choice: if credit ever rolls across weeks at the subscription level, a week-scoped pool underreports the customer's true remaining credit. Confirm week-scoping is the intended ledger boundary.

### N1 — Comment conflates "delivered" (status) with "deliveryDate" (schedule)

`// delivered orders whose deliveryDate is today` — the orders are *Complete* (a status), filtered by a *scheduled* date. Tighten the comment to avoid implying `deliveryDate` is an actual-delivery timestamp (ties to I2).

### N2 — `wibDayKey` integer key

`year*10000 + (month+1)*100 + day` is fine and avoids string allocation; minor note that it duplicates the month+1 (0-indexed → 1-indexed) conversion that already bit the formatter (see the `22/06/26` regression-guard test) — keep the two in lockstep.

---

## Verdict

Mergeable as an incremental founders-message enhancement **once C1 is resolved or consciously waived in writing**, because C1 is the difference between this message being "the primary proof the flow works" (SPEC's stated purpose) and a row-count approximation. I1–I3 should be addressed before this is relied on operationally. M1 (SPEC reconciliation) is cheap and prevents future audit confusion.
