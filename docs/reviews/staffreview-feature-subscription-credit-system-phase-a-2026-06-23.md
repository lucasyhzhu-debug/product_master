# Staff Review: Subscription & Credit System — Phase A (Backend Spine)

**Date:** 2026-06-23
**Branch:** `feature/subscription-credit-system-phase-a`
**Range:** `7e27ff27..d7b60ef5` (7 commits)
**Reviewer:** Senior Engineer (plan-fidelity + architectural-risk pass)
**Scope under review:** Phase A ONLY — schema, pure credit-math, append-only ledger, subscription CRUD, week-seed. Order generation / invoicing / CRM UI / Telegram (Phases B–E) are intentionally absent and that absence is correct.

---

## 1. Summary

**Overall Assessment: Approve.** Phase A is a faithful, disciplined execution of the plan with no scope creep and no shortcuts. Every Task A1–A7 landed as written; the staffreview spec fixes (C1 `orderId` optional, C2 `items[].date`, I2 `weeklyQty` derived) are all present in code, not just docs. The verification gate is green on my machine:

- `npx vitest run convex/subscriptions` → **13 passed** (creditMath 6, rollover 5, weeks 2)
- `npm run type-check` → **pass** (both `tsc` and `convex/tsconfig.json`)
- `npm run build` → **built in 38.9s**, no vendor-bundle-cap breach (Phase A is backend-only, no chunk movement — Pitfall #16 respected)
- `convex/_generated/api.d.ts` regenerated and committed (all 7 subscription modules registered — avoids the Phase-76/81 stale-codegen recurrence)

The append-only-ledger + re-derived-pool architecture is sound: the ledger is the single source of truth and the denormalised pool on `subscriptionWeeks` is recomputed by full replay on every `postLedgerEntry`, so the two cannot drift. The `invoices.orderId → optional` blast radius was correctly scoped — the only field dereference (`finalize:396`) is guarded; every other `by_order` consumer keys off `args.orderId` (the always-defined argument), not the now-optional field.

Findings below are all **Minor / Nitpick** — none block merge. The two most worth noting (M1, M2) are Phase-B/C landmines to carry forward, not Phase-A defects.

---

## 2. Critical Issues (Must Fix)

**None.** No correctness, security, type-safety, or access-control defects. All five new `protectedQuery`/`protectedMutation` registrations use `roles: ["manager", "admin"]` — superset-aligned with the future `/crm` route, respecting Pitfall #19. No deprecated `productionType`/`productionUnits` and no banned Phase-81 imports were introduced.

---

## 3. Improvements (Recommended — none blocking)

### M1 — `computeRolloverExpiry.weeksCarried` has no producer; the FIFO horizon is undefined until Phase C wires it (carry-forward landmine)

**Where:** `convex/subscriptions/rollover.ts:1-12`; consumed by nobody in Phase A.

**What:** The pure decision function is correct and well-tested (5 cases incl. `null` opt-out and zero-leftover). But `weeksCarried` — "how many weeks this credit has already rolled" — is an input with **no source of truth in the schema**. `creditLedger` has `rolloverFromWeekId` (the immediate parent week) but no `weeksCarried` / `rollGeneration` counter, so to compute `weeksCarried` at reconcile time Phase C must walk the `rolloverFromWeekId` chain backwards across weeks. The §13.1 spec promises "FIFO (oldest week first)" + deterministic expiry at the horizon; that determinism depends entirely on a traversal that does not yet exist.

**Why it matters:** This is the single highest-risk deferred coupling. If Phase C computes `weeksCarried` wrong (e.g. counts the current week, or fails to chain across a `unitPrice` change — spec §11 edge case), credit either expires a week early or becomes an untracked liability that never expires. Not a Phase-A bug (the fn is pure and the input contract is explicit), but flag it loudly in the Phase-C plan: **the `weeksCarried` derivation from the ledger chain is itself a TDD target with a multi-week fixture**, exactly as the spec testing table row 2 demands.

**Recommendation:** No code change now. In the Phase-C charter, add an explicit task: "derive `weeksCarried` by walking `rolloverFromWeekId` from the carried `topup` entry; unit-test the chain length across ≥3 rolled weeks including one with a mid-stream `unitPrice` change." Consider a denormalised `rollGeneration: number` on the carry `topup` entry to make this O(1) instead of a chain walk.

### M2 — `postLedgerEntry` running-balance + pool re-derivation is correct but is the cross-week consistency seam Phase B/C will stress

**Where:** `convex/subscriptions/ledger.ts:20-53`.

**What:** Two reads + one insert + one full-week replay per entry. `prevBalance` comes from `order("desc").first()` on `by_subscriptionWeek`; `balanceAfter` is then `prev + amount`; the pool is re-derived from the entire week's entries and patched onto `subscriptionWeeks`. At subscription volume (tens of entries/week) this O(entries) replay is fine — the plan-staffreview already accepted this (§4 refinement).

**Why it matters (forward-looking):** (a) The function takes a raw `MutationCtx` and is not itself transactional across multiple calls — Phase B's "confirm generates orders + drawdowns + weekly invoice atomically" (spec §11 edge case) must call `postLedgerEntry` inside the *same* mutation as the order/invoice writes, or a partial failure leaves orphan orders vs. an un-drawn pool. (b) `balanceAfter` is derived from the *last entry by creation order within the week*, while the pool is derived by *type-aware replay of all entries*. These are two independent representations of "remaining"; they agree today because both are linear sums, but any future non-linear ledger type (none planned) would split them. (c) There is no guard against posting against a `subscriptionWeek` in a terminal status (`closed`) — Phase C reconcile should add one.

**Recommendation:** No change in Phase A. Phase B must wrap order-gen + drawdown in one mutation (the spec already calls this out; keep it as a hard test assertion). Phase C reconcile should reject `postLedgerEntry` on `closed` weeks.

### M3 — `createSubscription` accepts an unvalidated `scheduleTemplate` (no dayOfWeek range / non-empty / dedupe checks)

**Where:** `convex/subscriptions/mutations.ts:29-48`.

**What:** `weeklyQty` is correctly derived from the template (I2 fix landed). But the handler does not validate that `dayOfWeek ∈ 0..6`, that the template is non-empty, that a day isn't listed twice, or that `qty > 0` / `unitPrice >= 0`. A caller could create a subscription with `dayOfWeek: 9`, which `buildPlannedDays` (`weeks.ts:21`) would then expand into a delivery date 9 days past `weekStart` — silently outside the Mon–Sun week, with `weekEnd` computed independently as `weekStart + 7d - 1`.

**Why it matters:** Low blast radius in Phase A (no UI, manager+admin only, no order generation yet), but it's a latent data-quality hole that becomes a real scheduling bug the moment Phase B generates orders off the template. The mockup/UI in Phase B will likely constrain this, but backend should not trust the client.

**Recommendation:** Add a cheap guard in `createSubscription`/`updateSubscription` (or a shared `validateScheduleTemplate` pure fn — testable, and reusable by Phase B): non-empty, each `dayOfWeek` in 0..6, no duplicate `dayOfWeek`, `qty > 0`. Defer to Phase B is acceptable if explicitly noted in that plan.

---

## 4. Refinements (Optional / Nitpick)

### N1 — `getWeekPool` returns both the denormalised pool (on `week`) and a freshly-derived `pool` for the same data

**Where:** `convex/subscriptions/queries.ts:25-36`. The handler returns `{ week, pool: deriveCreditPool(entries), entries }`. `week` already carries `creditIssued/Consumed/Remaining/Expired` (denormalised by `postLedgerEntry`), and `pool` recomputes the identical numbers from `entries`. This is a deliberate self-checking belt-and-suspenders read, and harmless — but the consumer now has two sources for the same four numbers and could pick the wrong one. Consider documenting which is authoritative (the derived `pool` is, by definition) or dropping the denormalised fields from the returned `week` in the UI layer. Not worth changing the query.

### N2 — `productNames[id] ?? "Unknown"` sentinel persists into stored `plannedDays`

**Where:** `convex/subscriptions/weeks.ts:25`. If a `menuProducts` row referenced by the template is deleted before `seedWeek` runs, the seeded week stores `productName: "Unknown"` permanently (spec §11 edge case "product later removed"). Phase A is correct to not over-engineer this, but Phase B should decide whether seeding should *fail loudly* on a missing product rather than bake a sentinel into the immutable-ish week. Flag for the Phase-B plan.

### N3 — `computeLineTotal` uses `Math.round(qty * unitPrice)`

**Where:** `convex/subscriptions/creditMath.ts:3-5`. Money is integer IDR and both inputs are integers, so `Math.round` is a no-op in practice — it's defensive against a fractional `qty` ever arriving. Fine; no change. (Matches the "integers, never floats" constraint.)

### N4 — `weeks.test.ts` filename vs. plan

The plan A6 named the test `weeks.test.ts` and the pure builder `buildPlannedDays`; both match. (Noting only because the plan's File Structure line listed `weeks.test.ts` testing a `buildWeekFromTemplate` that was renamed to `buildPlannedDays` — the rename is consistent across `weeks.ts`, its test, and the A6 task body. No drift.)

---

## 5. Plan Fidelity — Task-by-Task

| Task | Planned | Built | Verdict |
|------|---------|-------|---------|
| A1 schema (4 tables + additive fields, `orderId` optional, `items[].date`, `finalize` guard) | yes | `schema.ts` matches plan byte-for-intent; `finalize:396` guarded exactly as specified | ✅ exact |
| A2 types + creditMath (TDD) | yes | `types.ts`, `creditMath.ts`, 6 tests incl. refund-not-consumption | ✅ exact |
| A3 rollover FIFO (TDD) | yes | `rollover.ts`, 5 tests incl. `null` opt-out + zero-leftover | ✅ exact |
| A4 append-only ledger helper | yes | `ledger.ts` — running balance + full re-derive | ✅ exact |
| A5 CRUD (manager+admin) | yes | `mutations.ts` + `queries.ts`; `weeklyQty` derived (I2); customer-existence guard | ✅ exact |
| A6 week seed (TDD pure builder + idempotent mutation) | yes | `weeks.ts` — `buildPlannedDays` + idempotent `seedWeek` (by_subscription_weekStart dedupe) | ✅ exact |
| A7 docs + verification gate | yes | SCHEMA.md (+212 lines, all 4 tables + field adds documented incl. `orderId` optional note), CHANGELOG entry | ✅ exact |

**Scope creep:** none. **Shortcuts:** none. **Missing Phase-A pieces:** none. Every Phase-A success-criterion checkbox is objectively satisfied.

## 6. Spec / Staffreview Compliance

- **`schedule = invoice = credit` invariant enforced by type:** ✅ `ScheduleLine` defined once in `types.ts` and reused by `PlannedDay`, the schema's `plannedDays[].items`, and (per design) the future invoice/order builders. The shared type is the structural enforcement mechanism the spec R2 asked for.
- **C1 (`orderId` optional + blast radius):** ✅ field optional; `finalize:396` guarded; all other `by_order` queries use the always-defined `args.orderId`. Grep across `convex/` and `src/` confirms no other `invoice.orderId` field dereference.
- **C2 (`items[].date`):** ✅ added as `v.optional(v.number())` — existing standard invoices unaffected (date null → flat render).
- **I2 (`weeklyQty` derived, not re-keyed):** ✅ computed in-handler from `scheduleTemplate`; not a `createSubscription` arg. `updateSubscription` *does* still expose `weeklyQty` as an optional arg (drift re-introduction risk if a caller passes it without updating the template) — minor, acceptable for an admin-only mutation, but worth a comment.
- **Ship-dark / additive:** ✅ all new tables additive; all new fields optional; `orderId` widened not dropped; no migration required; revert = revert commits.
- **WIB / Pitfall #18:** Phase A uses raw `weekStart`/`DAY_MS` arithmetic in the *pure* builder (correct — it's timezone-agnostic given a Monday-WIB `weekStart`). The actual WIB Monday-boundary computation is deferred to Phase B's caller, which the plan states must use `convex/lib/periodRange.ts`. No hand-rolled WIB week math was introduced. ✅ (carry forward: Phase B must source `weekStart` from the WIB helpers, not `Date.now()` arithmetic.)

## 7. Architectural Risk Register (forward-looking)

| Risk | Phase | Severity | Mitigation in plan? |
|------|-------|----------|---------------------|
| `weeksCarried` derivation from ledger chain (M1) | C | High if mishandled | Spec testing row 2 names it; make it an explicit TDD task |
| Atomic confirm: orders + drawdown + invoice in one mutation (M2) | B | High | Spec §11 edge case lists it; keep as hard test assertion |
| Analytics pollution: 1,050 pcs/wk at confidential price leaking into `/financials` + channel reports (spec I3) | B | High | Spec §4.4 mandates audit before B merge — **not yet addressed, correctly out of Phase-A scope** |
| Unvalidated schedule template → bad delivery dates (M3) | B | Medium | Add `validateScheduleTemplate` |
| `postLedgerEntry` on terminal-status week (M2c) | C | Medium | Add status guard in reconcile |
| Missing-product sentinel in seeded week (N2) | B | Low | Decide fail-loud vs sentinel |

## 8. Over-Engineering Check

None. The code is appropriately minimal for a spine: pure functions are pure, the ledger helper does exactly one job, CRUD is thin. The only arguable "extra" is `getWeekPool` returning both denormalised and re-derived pools (N1) — a defensible self-check, not gold-plating. The `Math.round` (N3) is one character of defensiveness. No premature abstraction, no speculative Phase-B/C code smuggled in.

---

## 9. Verdict

**Approve and merge.** Phase A is a clean, test-backed, plan-faithful backend spine with green type-check/test/build gates and committed codegen. No Critical or Important defects. The Minor findings (M1–M3) are forward-carried risks to bake into the Phase-B and Phase-C plans, not blockers. Recommend adding M1 (`weeksCarried` derivation as a TDD target), M2 (atomic confirm + terminal-status guard), and M3 (`validateScheduleTemplate`) as explicit tasks when those phases are planned via the spec→plan pipeline.

---

*Generated by senior-engineer staffreview (Phase A fidelity + architectural-risk pass)*
