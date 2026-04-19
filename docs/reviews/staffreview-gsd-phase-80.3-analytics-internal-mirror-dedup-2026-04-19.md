# Staff Review: Phase 80.3 — Analytics Internal-Mirror Dedup (R5 Skip)

**Date:** 2026-04-19
**Branch:** `gsd/phase-80.3-analytics-internal-mirror-dedup`
**Commits reviewed:** `89fa6998`, `3da27c94`, `77dca7c7`, `b40b8c9e`, `2731232b`, `5e9e9cd4`
**Scope reviewed:**
- `convex/reports/unitEconomics.ts` (+9 lines)
- `convex/reports/__tests__/unitEconomics.test.ts` (+460 lines, new)
- `convex/reports/__tests__/unitEconomics-unlinked.test.ts` (+47 lines)
- `.planning/phases/80.3-analytics-internal-mirror-dedup/*.md`
- `docs/CHANGELOG.md` entry
- `docs/reviews/staffreview-phase-80-task-4b-addendum-2026-04-14.md` (original R5 spec)

**Reviewers:** Staff Engineer (Implementation) + Principal Engineer (Architecture)

---

## 1. Summary

**Overall Assessment: APPROVE — Ship after addressing 2 Minor/Refinement items.**

This is a near-exemplary small-change PR. The production diff is 9 lines (one `continue` + an 8-line comment) applied at the optimal seam (`loadExternalStream`, first statement of the per-row loop). The R5 rule is correctly narrow — it matches `source === "internal"` only, as the 2026-04-14 addendum explicitly mandated. The one-line skip short-circuits before the `transactionType` filter, before the timestamp/channel filters, and before the N+1 `externalRevenueItems` child fetch — which means for prod's ~2,400 internal mirror rows, the fix also saves ~2,400 index scans per `loadFilteredData` invocation. That's a correctness fix that incidentally pays for itself in read quota.

Test coverage is thorough: 13 new tests plus 1 re-seeded pre-existing test. Test 12b (the "gobiz still contributes" negative regression the addendum called *"non-optional"*) is present and asserts hard numeric invariants. Test 17 parameterises across all 11 reducers — verified via the 3 post-80.1 snapshot queries — with per-reducer specific invariants (not tautologies). The deterministic-timestamp rule is honored in the new file.

**Plan fidelity:** three deviations from the written PLAN were flagged up-front in `80.3-SUMMARY.md` (§Deviations). All three are correctly handled and architecturally sound (see §6 below).

**What needs action before merge:**
1. **Minor (IN-01 carried from gsd-code-reviewer):** Pre-existing `Date.now()` in the modified `unitEconomics-unlinked.test.ts` violates the Phase 73 rule listed as a non-negotiable on the 80.3 PLAN. Since 80.3 actively modifies this file, the cleanup cost is ~4 lines and should be done in this PR rather than deferred.
2. **Refinement:** The prior-period window (consumed by `reduceKpi` and `reduceChannelMomentum`) is structurally covered by R5 (same `loadExternalStream` seam) but is not explicitly tested. Test 17 seeds only in the current window. This is belt-and-suspenders territory, not a correctness gap, but one additional test would make the claim demonstrable rather than inferred.

Everything else is either correct as-shipped or is a nit.

**What the user should NOT change before merge:** the three deviations in `80.3-SUMMARY.md`. Each is the correct call given what landed on main between the PLAN being written (2026-04-18) and execution (2026-04-19).

---

## 2. Critical Issues (Must Fix)

**None.** The R5 rule is correct, narrow, and placed optimally. Test 12b is present and hard-asserts the gobiz regression guard. The schema literal `"internal"` is matched exactly. No architectural red flags.

---

## 3. Improvements (Recommended)

### IMP-01: Test the prior-period window explicitly

**Location:** `convex/reports/__tests__/unitEconomics.test.ts` §Test 17
**Impact:** Low (structural guarantee) / Medium (future-refactor safety)

`reduceKpi` and `reduceChannelMomentum` consume both `current` and `prior` `WindowData` — the prior is loaded by `loadPriorPeriodFilteredData` (line 434), which forwards to the *same* `loadFilteredData` (and therefore the same `loadExternalStream`) with a shifted window. The R5 skip is structurally guaranteed to apply to both periods because it lives in a single shared function.

However, Test 17 currently seeds data *only* in the current window (`NOW`). The prior-period call is exercised but always returns zero rows. If a future refactor inadvertently forked `loadPriorPeriodFilteredData` to bypass `loadExternalStream` (e.g. "optimization" to skip external fetch for prior), the test suite would silently continue to pass.

**Recommendation:** Add one test that seeds an internal mirror in the prior window and asserts `kpi.prior.orderCount === 1` (not 2). Example sketch:

```ts
it("kpi.prior window: internal mirror in prior period is also skipped", async () => {
  const t = convexTest(schema);
  const mp = await seedMenuProduct(t, "Original 80g", "ORIGINAL_PRIOR", 23000);
  await seedBigBallBom(t, mp, 1);
  const PRIOR = NOW - 2 * 86400000; // 2 days before current window
  // seedDirectOrderWithMirror would need a `ts` override param
  await seedDirectOrderWithMirror(t, mp, "0417-001", PRIOR);
  const r = await t.query(api.reports.unitEconomics.kpiAndChannelSnapshot, {
    fromTs: NOW - 86400000,
    toTs: NOW + 86400000,
  });
  expect(r.kpi.prior.orderCount).toBe(1); // not 2
});
```

This is ~15 LOC and closes the only structural test gap. Not strictly required (the single-seam invariant holds at HEAD), but it's cheap insurance for the 80.1 follow-up work that's already in motion.

### IMP-02: Clean up pre-existing `Date.now()` in the modified test file

**Location:** `convex/reports/__tests__/unitEconomics-unlinked.test.ts:122,164`
**Impact:** Low (tests pass today) / Medium (violates stated non-negotiable)

The 80.3 PLAN explicitly lists:

> **Deterministic timestamps in tests, no `Date.now()`** (Phase 73 lesson).

as a non-negotiable. The new `unitEconomics.test.ts` correctly uses `const NOW = 1713400000000`. But when 80.3 added a 40-line block to the second test in `unitEconomics-unlinked.test.ts` (seeding the native `orders`+`orderItems` twin), the pre-existing `const now = Date.now()` calls were not refactored.

The gsd-code-reviewer already flagged this (WR-01 in `80.3-REVIEW.md`). Given that:
- This PR actively modifies the file (adds 47 lines inside the second test),
- The new file co-located in the same directory already uses the correct pattern,
- The cleanup is ~4 lines, and
- 80.3's own PLAN lists the rule as a non-negotiable,

it's cheaper to fix now than to defer. Replace both `Date.now()` with the same `NOW` constant pattern. One commit, one diff, no behavior change (tests still pass by arithmetic since both seed and query use the same local `now` within a test).

### IMP-03: Archaeology comment — prepend `(Phase 80.3)` to the R5 inline comment

**Location:** `convex/reports/unitEconomics.ts:155`
**Impact:** Low (ergonomic)

The 8-line R5 comment is thorough (references both the adapter module and the staff-review addendum spec) but omits the phase number. Other comments in the same file do include them (line 19: `Phase 80 UAT-01 (MAJOR)`, line 24: `Phase 80.1 Plan 01`). A future `git blame` on line 163 returns SHA `89fa6998` — discoverable, but requires archaeology.

**Recommendation:** Change the first line from

```
// R5 — skip the internal mirror. Rows with the `internal` source are a
```

to

```
// R5 (Phase 80.3) — skip the internal mirror. Rows with the `internal` source are a
```

One-word change. Consistent with neighboring comment style.

---

## 4. Refinements (Minor Suggestions)

### REF-01: DRY the 11 Test 17 symmetry tests

**Location:** `convex/reports/__tests__/unitEconomics.test.ts:290-460`

All 11 Test 17 cases share identical setup:
```ts
const t = convexTest(schema);
const mp = await seedMenuProduct(t, "Original 80g", "ORIGINAL_XXX", 23000);
await seedBigBallBom(t, mp, 1);
await seedDirectOrderWithMirror(t, mp);
const r = await t.query(api.reports.unitEconomics.<snapshot>, { fromTs, toTs });
```

The only per-test deltas are the SKU-code suffix (`_KPI`, `_CHE`, `_CMO`, …), the snapshot query, and the assertion. A `setupSymmetryFixture(t, suffix)` helper would collapse 5 lines to 2 per test.

**Why this is a REFINEMENT not an IMPROVEMENT:** the duplication is regular (low cognitive cost), each test reads clearly in isolation, and aggressive DRY-ing tends to obscure the per-test intent. Leave as-is unless you're adding more symmetry tests (e.g. IMP-01's prior-period tests, or Phase 80.1 follow-ups).

### REF-02: Fix the header comment's 11-query inventory

**Location:** `convex/reports/__tests__/unitEconomics.test.ts:22-30`

The header prose lists `unitsPerTxnByChannel` and `aovByChannel` as among the 11 queries. Neither exists as a reducer. Their values are fields on `reduceKpi`'s return shape (`unitsPerTxn`, `aovNet`, `aovGross`) — not separate reducers. The actual 11 reducers exported by `unitEconomics.ts` are: `reduceKpi`, `reduceChannelEconomics`, `reduceChannelMomentum`, `reduceByWeekday`, `reduceByWeekdayRolling`, `reduceRollingTrend`, `reduceDayHourHeatmap`, `reduceVolumeByType`, `reduceTypeMixOverTime`, `reduceSkuTop`, `reduceSkuChannelMatrix` — and Test 17 has 11 tests covering exactly these.

Coverage is correct; only the prose is wrong (it's carried over from RESEARCH.md §1 which was written pre-80.1). Suggested replacement is in `80.3-REVIEW.md` IN-01.

### REF-03: `80.3-SUMMARY.md` calls this `type: code-fix`; consider adding a RED-commit discipline note

**Location:** `80.3-SUMMARY.md:95-97` (TDD Gate Compliance)

The summary notes:
> "all 13 new tests were verified to fail red against the pre-R5 code (the executor ran the tests once after writing them and observed all 13 failures […]); then Wave 1's R5 skip flipped them green."

Since Wave 1 landed before Wave 2 (per the PLAN's sequencing), there is no discrete RED commit in git history — the executor verified RED locally, then committed the already-green tests. This is defensible for a 1-line fix, but the SUMMARY's wording might encourage future phases to skip RED commits on larger refactors where the discipline matters more.

**Recommendation:** Add a one-line caveat to the SUMMARY:
> "For larger refactors where RED→GREEN progression is non-trivial, prefer committing failing tests first and flipping them in a follow-up commit to preserve the RED/GREEN trail."

Not blocking; stylistic only.

---

## 5. Nitpicks

### NIT-01: Unused `RevenueBearing` opportunity

The original addendum (Improvement 3) recommended defining a named `RevenueBearing` interface in `revenueHelpers.ts` to preserve nominal-ish type safety when the helpers accept both `Doc<"orderItems">` and `UnifiedItem` shapes. This was out-of-scope for 80.3 (scope was the R5 skip, not Task 4b-wide typing), but it's worth noting for a future tech-debt pass — the current structural typing (`{ lineTotal: number; discountAmount?: number }`) would accept a bare object that happens to have those two fields. Low-priority, leave for later.

### NIT-02: Inline comment ends with a bare URL-style path

`// Authoritative spec: docs/reviews/staffreview-phase-80-task-4b-addendum-2026-04-14.md.`

Trailing period after a `.md` looks odd in syntax-highlighted code. Cosmetic; leave as-is.

---

## 6. Deviations from PLAN — Correctness Assessment

The `80.3-SUMMARY.md` §Deviations section flags three deviations from the PLAN. All three are handled correctly:

### Deviation 1: Phase 80.1 shipped between PLAN writing and execution — APPROVED

The PLAN (authored 2026-04-18) stated Phase 80.1 was "NOT YET SHIPPED" and specified Test 17 should iterate the 11 standalone legacy queries. Verified via `git log`: Phase 80.1 actually merged on 2026-04-18 (commit `daf2997a`, "Phase 80.1: Analytics Perf & Chart Primitives Consolidation (#148)"), which consolidated the 11 reducers into 3 grouped snapshot queries (`kpiAndChannelSnapshot`, `timeSeriesSnapshot`, `skuSnapshot`).

**Executor's adaptation:** Test 17 still covers all 11 reducers, but each test invokes the appropriate snapshot query and asserts on the inner reducer's output field (e.g. `kpiAndChannelSnapshot.kpi`, `timeSeriesSnapshot.byWeekday`, `skuSnapshot.skuTop`).

**Assessment:** This is the correct adaptation. The original PLAN's invariant was "all 11 reducers must have symmetry coverage" — coverage is preserved; the call path changed because the public API shape changed. This aligns explicitly with the PLAN's own Risk #2 mitigation ("if Phase 80.1 ships first, R5 is unchanged").

**Forward note:** the PLAN's "Post-merge" step includes updating the Phase 80.1 PLAN to "extend Test 17 when snapshots ship." 80.1 has already shipped, so that forward-note should be closed out either as DONE (tests already written) or removed.

### Deviation 2: Comment wording — rephrased to keep `git grep` acceptance gate at 1 hit — APPROVED

The PLAN's Wave 1 acceptance gate said: `git grep 'source === "internal"' convex/reports/unitEconomics.ts` returns exactly 1 hit. The executor's initial comment included the literal string `source === "internal"`, producing 2 hits. The executor rephrased the comment (using backticks to quote just `internal` instead of the full expression) so the acceptance gate passes cleanly.

**Assessment:** Correct. The acceptance gate is a grep-invariant; satisfying it by rephrasing documentation is exactly the intended discipline. The resulting comment is arguably clearer (quoting just `internal` rather than the Boolean expression reads more natural). Verified current state: 1 hit at line 163.

### Deviation 3: Pre-existing Phase 80.2 test re-seeded to preserve the assertion under R5 — APPROVED

The existing test at `unitEconomics-unlinked.test.ts:153` ("does not regress already-linked parent with children (internal source)") was written under Phase 80.2 when internal-mirror rows WERE counted as revenue contributors. Post-R5 that test would break — the internal mirror contributes 0, not 46000 — so the assertion `expect(ours?.revenue).toBe(46000)` needs an actual data source.

**Executor's fix:** Added a native `orders` + `orderItems` twin to the seed (matching what `syncInternalOrders` writes in production), so the 46000 revenue now comes from the native order. The internal mirror is skipped by R5, contributing 0. An inline comment documents the post-R5 invariant.

**Assessment:** Correct and honest. The alternative (deleting the test, or changing the assertion to 0) would have been worse — the assertion value `46000` is the business-meaningful number for an Original 80g × 2. Re-seeding to preserve the production-accurate data flow is the right call. The executor explicitly flagged this in the SUMMARY (not hidden).

---

## 7. Architectural Risks

### Coupling risk: LOW

The R5 skip lives inside a single private function (`loadExternalStream`) called from exactly one place (`loadFilteredData`). `loadFilteredData` is called from exactly 3 snapshot impls (`kpiAndChannelSnapshotImpl`, `timeSeriesSnapshotImpl`, `skuSnapshotImpl`) plus the prior-period helper (`loadPriorPeriodFilteredData`, which forwards to the same function). The single-seam invariant is preserved post-80.1 and the fix covers 100% of the analytics surface.

Verified:
- `git grep loadExternalStream convex/reports/unitEconomics.ts` returns 2 hits (definition + sole callsite at line 377).
- `git grep loadFilteredData convex/reports/unitEconomics.ts` returns callsites only inside this file (no external module consumes it — it's not exported).

### Real-time subscription load: NEUTRAL

Convex queries are reactive. Post-deploy every subscriber (manager + admin dashboards) recomputes once. For a 90-day window at current volume (~2,400 internal mirror rows), the fix actually REDUCES load: the skip short-circuits before the `externalRevenueItems` child fetch (line 174), saving ~2,400 index scans per query invocation. This is visible in the gsd-code-reviewer's verification note.

No thundering-herd or fan-out concerns.

### Schema implications: NONE

Zero schema changes. R5 uses the existing `v.literal("internal")` literal at `convex/schema.ts:21`. No migration, no backfill, no index changes.

### Prod rollout risk: LOW

The KPI-drop impact (Revenue ~Rp 517M → Rp 387M, Units 9,493 → 8,876, Orders 2,629 → 2,364) is documented in the CHANGELOG user-facing section with pre/post numbers. Users who set targets from the inflated Analytics page will see the drop and read the CHANGELOG. Convex deploys atomically — no rollout window where half-users see old and half-users see new.

Rollback path is a one-line `git revert` of `89fa6998`. Tests would immediately fail red, providing a clear signal.

### Historical data reconciliation: N/A

Analytics is a live read, not a persisted report. No historical data to backfill.

---

## 8. Missing Pieces

**None blocking.** Cross-referenced the PLAN's §Success Criteria against what shipped:

| PLAN Success Criterion | Status |
|---|---|
| `npm run type-check` passes | PASS (per SUMMARY Wave 3.2) |
| `npm run lint` passes | PASS in-scope; 504 pre-existing errors deferred in `deferred-items.md` |
| `npm run test` passes with 13+ new tests | PASS — 13 new, 2 modified, full suite 1633/1633 |
| `npm run build` succeeds | PASS (per SUMMARY Wave 3.5) |
| `loadExternalStream` contains exactly 1 `source === "internal"` skip | PASS (line 163) |
| All 11 `loadFilteredData` callers have symmetry coverage | PASS (via 3 snapshot queries) |
| Test 12b negative regression present | PASS (lines 252-276) |
| Dev parity check (Units + Orders exact match) | PENDING — Wave 3.6 HUMAN-UAT |
| Prod parity check post-deploy | PENDING — Wave 4.4 |
| CHANGELOG entry added | PASS (20 lines, user-facing language) |
| `/triple-review` executed and findings addressed | PENDING — Wave 4.1 |
| No frontend changes (zero `src/` edits) | PASS |
| No schema changes (zero `convex/schema.ts` edits) | PASS |

The 4 PENDING items are correctly scoped to the user (Waves 3.6 + 4.*), not the automated execution.

---

## 9. Over-Engineering Check

**None.** The production code is 1 line. The test file is 460 lines for 13 tests covering 11 reducers × 3 snapshot queries plus the Test 12 / 12b / 17 tiers — this is proportional to the symmetry-claim burden (the non-optional staff-review mandate). No feature flags, no metric plumbing, no dashboard scaffolding. The 8-line comment on the skip is load-bearing (it's the institutional memory for why R5 exists — the whole reason this phase exists is that commit `59069988` claimed R5 was applied but never touched code).

The `seedDirectOrderWithMirror` + `seedGobizRevenue` helpers at the top of `unitEconomics.test.ts` are proportional: they both encapsulate a realistic production write shape (matching `syncInternalOrders` for the former, matching the `gobiz` adapter for the latter). Each is used by multiple tests. No YAGNI violations.

---

## 10. Design Doc Compliance (R5 spec)

Cross-check against `docs/reviews/staffreview-phase-80-task-4b-addendum-2026-04-14.md` §2 "Critical Issue 1":

| Addendum mandate | 80.3 delivery |
|---|---|
| R5 replacement: `if (parentRev.source === "internal") continue;` | DELIVERED at `unitEconomics.ts:163` — exact literal match |
| "Do not cross-reference externalTransactionId against any orders field" | COMPLIED — no externalTransactionId lookup introduced |
| Fix Test 12 fixture (change gobiz → internal) | DELIVERED — Test 12 seeds a whatsapp native + internal mirror |
| Add Test 12b (gobiz contributes) — "non-optional" | DELIVERED — lines 252-276 with hard `> 0` asserts on units, net, orderCount + GoFood channel assertion |
| Add Test 17 (internal skip symmetric — "counted exactly once") | DELIVERED — 11 tests, each with specific numeric invariant |
| `externalSourceToDisplayChannel("gobiz") → "GoFood"` | OUT-OF-SCOPE for 80.3 — already present in `channelTaxonomy.ts` from Phase 80 Task 4b. Verified via `sourceToDisplayChannel` at `unitEconomics.ts:11`. |

**Full compliance.** No gaps against the 2026-04-14 spec.

---

## 11. Approval Conditions

**For Approval:**
1. (Recommended, not blocking) Address IMP-02 — replace the two `Date.now()` calls in `unitEconomics-unlinked.test.ts` with the `NOW` constant pattern. ~4-line change.

**Recommended before merge:**
2. IMP-01 — add one prior-period symmetry test. ~15 LOC.
3. IMP-03 — prepend `(Phase 80.3)` to the R5 comment's first line. 1-word change.
4. REF-02 — fix the header comment's 11-query inventory to reflect post-80.1 reducer names.

**Optional:**
5. REF-01 — DRY the 11 Test 17 cases into a fixture helper. Skip unless adding more symmetry tests.
6. NIT-02 — trailing period after `.md` in the inline comment. Cosmetic.

**Not required (verified correct as-shipped):**
- R5 rule narrowness (matches `"internal"` only, not `gobiz`/`k3mart`/etc.)
- R5 placement (first statement in per-row loop, before all filters and child fetch)
- Schema literal fidelity (`"internal"` matches `v.literal("internal")` at `schema.ts:21`)
- Single-seam coverage (verified — 100% of analytics queries route through `loadExternalStream`)
- Test 12b negative regression (hard-asserts `> 0` on units + GoFood channel existence)
- Test 17 specific invariants (numeric equals, not tautologies)
- `QueryCtx`/`MutationCtx` typing in tests (uses `ReturnType<typeof convexTest>`)
- All 3 deviations from PLAN (each flagged in SUMMARY and architecturally sound)

---

## 12. Principal Commentary — The Ghost-Commit Pattern

Phase 80.3 exists because commit `59069988` ("fix(80): apply Task 4b staff-review fixes — gobiz is GoFood, R5 skip internal only") claimed in its subject line to apply R5 but only modified plan documents. The production double-count persisted on prod for 5 days (2026-04-14 → 2026-04-19) before being rediscovered via analytics-vs-sales parity check.

**Architectural lesson (worth a MEMORY.md entry if not already there):** commit messages that claim behavioral fixes must be verifiable against a code-level acceptance gate. The 80.3 PLAN's own Wave 1 acceptance (`git grep 'source === "internal"' | 1 hit`) is exactly the style of gate that would have caught 59069988 at the PR stage. Recommend: when a future staff-review calls out a code fix, the PR merging it must include a grep-based acceptance check in its body — reviewers verify the grep output, not the prose. 80.3 itself demonstrates the pattern correctly.

**Related architectural observation:** R5's correct behavior is non-obvious — the "skip internal but keep gobiz" rule inverts what the literal source names might suggest ("internal" sounds like first-party data worth keeping; "gobiz" sounds like a platform mirror worth skipping). Both of those intuitions are wrong, and the addendum spent ~1000 words explaining why. The 8-line comment on the R5 skip captures enough of that rationale for a future dev to not remove the skip by mistake. Good.

---

*Generated by /staffreview skill — scope limited to branch `gsd/phase-80.3-analytics-internal-mirror-dedup` (commits 89fa6998..5e9e9cd4)*
*Staff Engineer Review + Principal Engineer Review*
