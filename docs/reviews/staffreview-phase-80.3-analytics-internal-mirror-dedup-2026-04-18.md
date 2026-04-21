# Staff Review: Phase 80.3 — Analytics Internal-Mirror Dedup (R5 Skip)

**Date:** 2026-04-18
**Plan:** `.planning/phases/80.3-analytics-internal-mirror-dedup/80.3-01-PLAN.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)
**Supporting artefacts reviewed:** `80.3-CONTEXT.md`, `80.3-RESEARCH.md`, `.planning/debug/analytics-sales-mismatch.md`, `docs/reviews/staffreview-phase-80-task-4b-addendum-2026-04-14.md`

---

## 0. Plan Structure Validation

```
PLAN VALIDATION CHECKLIST
═════════════════════════
✅ Git Workflow section — branch `feature/80.3-analytics-internal-mirror-dedup`, 4 checkpoints, squash merge
✅ Implementation Waves section — Waves 1-4 with agents + file paths + PARALLEL/SEQUENTIAL marked
✅ Documentation Updates section — CHANGELOG, ROADMAP, HUMAN-UAT, VERIFICATION, SUMMARY
✅ Success Criteria section — type-check, lint, test, build, parity checks, no-regression
═════════════════════════
```

**✅ Plan structure validated — proceeding to review.**

---

## 1. Summary

**Overall Assessment: Approve with Minor Revisions**

The plan is tightly scoped to a single-line code change with comprehensive test-symmetry coverage, and it properly reuses a pattern already established in two sibling files. Research is thorough — all 13 call sites of `loadFilteredData` are enumerated, Phase 80.1 compatibility is verified (unshipped, so single-seam fix suffices), and the staff-review-mandated Test 12b (gobiz contributes as a negative regression) is correctly carried forward. Six Improvements and three Refinements are proposed below; none block approval, but Improvements #1 and #2 affect test executability and should be incorporated before starting Wave 2.

---

## 2. Critical Issues (Must Fix)

**None.**

The plan correctly implements a well-specified fix. The code change is unambiguous, the failure mode of the current behaviour is mathematically demonstrated in the debug session (three self-consistent deltas), and the test plan enforces symmetry across all 11 downstream queries.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|:------:|:------:|
| 1 | Seed mirror rows via direct DB insert, not `syncInternalOrders` action call | High | Low |
| 2 | Document BOM seeding requirement for units-based assertions | High | Low |
| 3 | Add placement-guard comment on R5 skip location | Medium | Trivial |
| 4 | Enumerate the specific per-query invariant for Test 17 | Medium | Low |
| 5 | Correct HUMAN-UAT "commission wedge" phrasing — Analytics reads item-level (pre-commission) revenue | Medium | Trivial |
| 6 | Guard against concurrent 80.1/80.3 prod deploys | Low | Trivial |

### Improvement 1: Seed mirror rows via direct DB insert, not `syncInternalOrders` action

**Location in plan:** Wave 2 Tasks 2.1 and 2.3

**Context:** Plan task 2.1 says "seed a native direct/WhatsApp order → call `syncInternalOrders`". This couples 80.3's test suite to three upstream dependencies of the action:
- `convex/externalData/mutations.ts::createSyncLog` (internal mutation)
- `convex/externalData/queries.ts::getLatestSyncTimestamp` (internal query)
- `convex/integrations/internal/queries.ts::getRevenueOrders` (internal query)

If any of these change signature (ongoing Phase 80.2 touches `externalData/mutations.ts` — see 80.2 PLAN), 80.3 tests break through no fault of their own.

**Recommendation:** Mirror the existing pattern in `convex/externalData/__tests__/revenue-invariants.test.ts` (lines 23-56) — seed both the native order AND its `externalRevenue[source="internal"]` row directly via `t.run(async (ctx) => ctx.db.insert(...))`. Concretely:

```ts
async function seedDirectOrderWithMirror(t: TestT, overrides?: Partial<{...}>) {
  return await t.run(async (ctx) => {
    // 1. Insert native order + orderItems
    const orderId = await ctx.db.insert("orders", { ...nativeOrderDefaults, ...overrides });
    const orderItemId = await ctx.db.insert("orderItems", { orderId, menuProductId, ... });

    // 2. Insert mirror externalRevenue + externalRevenueItems with source="internal"
    const revenueId = await ctx.db.insert("externalRevenue", {
      source: "internal",
      externalTransactionId: orderNumber,
      revenueGross: totalAmount,
      revenueNet: finalTotal - deliveryFee,
      ...
    });
    await ctx.db.insert("externalRevenueItems", {
      revenueId,
      source: "internal",
      linkedMenuProductId: menuProductId,
      ...
    });

    return { orderId, revenueId };
  });
}
```

This is deterministic, fast, and decoupled from the action. A second test file (later, not in 80.3 scope) could cover `syncInternalOrders` itself.

### Improvement 2: BOM seeding requirement for units-based assertions

**Location in plan:** Wave 2 Task 2.1, 2.3 (units/`kpiSummary` assertions)

**Context:** Tests assert `kpiSummary.current.units > 0`, `skuPareto` top-SKU ball counts, `volumeByType` ball-type splits. All of these go through `unitsForOrderItem` which calls `getProductionUnitsPerProduct` (line 5-7 import). Without a seeded BOM (`menuProducts` + `menuProductComponents` + `componentTypes` with `category="production"` and codes `BIG_BALL`/`MID_BALL`), `unitsPerProduct` returns an empty map and every unit assertion returns 0. Symmetric between native and mirror, so Test 12 (`orders === 1 not 2`) still works — but Test 12b (GoFood units > 0) and several Test 17 symmetry assertions **require a real BOM**.

**Recommendation:** Add an explicit helper at the top of the test file:

```ts
async function seedMinimalBomProduct(t: TestT, opts: { ballType: "BIG_BALL" | "MID_BALL" }) {
  return await t.run(async (ctx) => {
    const componentTypeId = await ctx.db.insert("componentTypes", {
      category: "production" as const,
      code: opts.ballType,
      name: opts.ballType === "BIG_BALL" ? "Big Ball 80g" : "Mid Ball 45g",
      ...
    });
    const menuProductId = await ctx.db.insert("menuProducts", { name: "Test Product", ... });
    await ctx.db.insert("menuProductComponents", {
      menuProductId,
      componentTypeId,
      quantity: 1,
    });
    return menuProductId;
  });
}
```

Document that `seedDirectOrderWithMirror` and the gobiz seed both call `seedMinimalBomProduct` to get a valid `menuProductId` before inserting order items. Without this, Wave 2 will hit "units=0" assertion failures during development and the executor will waste time debugging fake failures.

### Improvement 3: Placement-guard comment on R5 skip

**Location in plan:** Wave 1 Task 1.1

**Context:** The research doc specifies placement as "first line of per-row loop, before `transactionType` check". This placement matters: it's cheaper AND avoids loading children for discarded rows at line 135-142. A future refactor could unintentionally move the skip past the child-fetch, which would still be correct but wasteful — and a sloppier refactor could move it past the transactionType filter, which would preserve correctness but change semantics in ways that are hard to reason about.

**Recommendation:** Add an explicit comment in the code change itself:

```ts
for (const r of byPeriod) {
  // R5 — skip the internal mirror. `source === "internal"` rows are a projection
  // of the `orders` table (see convex/integrations/internal/adapter.ts); every
  // such row has a native `orders`+`orderItems` twin loaded separately in
  // loadFilteredData. Including internal rows here would double-count every
  // Direct/WhatsApp/Instagram order. MUST stay at the top of this loop — placing
  // it after the child fetch below at lines ~135-142 would be correct but
  // wasteful (loading then discarding children).
  if (r.source === "internal") continue;
  // Skip returns & delta_inferred; we only want realized sales.
  if (r.transactionType && r.transactionType !== "sales") continue;
  ...
}
```

### Improvement 4: Specific per-query invariant for Test 17

**Location in plan:** Wave 2 Task 2.3

**Context:** Plan says "assert an invariant that a double-count would break (e.g. `kpiSummary.current.orderCount === 1`)". For bucketed queries (`dayHourHeatmap`, `rollingTrend`, `byWeekday` rolling mode), the natural assertion isn't a scalar — it's a sum-across-buckets. A naive implementation could double-count within a bucket and still pass a scalar check by dividing somehow.

**Recommendation:** Enumerate the invariant for each query in the plan or as a comment block in the test file:

| Query | Invariant |
|---|---|
| `kpiSummary` | `current.orderCount === 1` AND `current.netRevenue === <seeded amount>` |
| `byWeekday` | `Σ buckets.orders === 1` AND `Σ buckets.units === <ball count>` |
| `dayHourHeatmap` | `Σ cells.orders === 1` |
| `channelEconomics` | `find(c => c.channel === "Direct").orders === 1` AND `units === <ball count>` |
| `volumeByType` | `Σ ballTypes.count === <total balls for product>` (not 2×) |
| `unitsPerTxnByChannel` | `find(c => c.channel === "Direct").unitsPerTxn === <ball count>` (not 2×) |
| `aovByChannel` | `find(c => c.channel === "Direct").aov === <seeded amount>` |
| `skuPareto` | `skus[0].units === <ball count>` for the seeded SKU |
| `skuChannelMatrix` | cell for (seeded SKU × "Direct") `units === <ball count>` |
| `channelMomentum` | `current.find(c => c.channel === "Direct").orders === 1` |
| `rollingTrend` | `Σ buckets.orders === 1` |

### Improvement 5: Correct "commission wedge" phrasing in HUMAN-UAT

**Location in plan:** Research Section 9 (referenced by plan Wave 3.7)

**Context:** The plan quotes Research Section 9 which says "Revenue delta < 5% (expected ~20% platform-commission wedge)". This is inaccurate. Per `convex/reports/unitEconomics.ts` lines 36-39:

> Commission is a PARENT-level field. Item-level analytics do not apportion commission back to items; commission is only used for order-level reporting (AOV / take-rate).

Analytics "Revenue (Net)" sums `orderItems.lineTotal` + `externalRevenueItems.totalPrice`, both of which are **pre-commission**. Sales Aggregation's "Gross Sales" is also pre-commission. These should match to within rounding after the R5 fix. "Net Sales" on the Sales Aggregation page is post-commission; Analytics has no equivalent.

**Recommendation:** Update HUMAN-UAT checklist phrasing (when 80.3-HUMAN-UAT.md is scaffolded in Wave 3.7):

- Replace "Revenue delta < 5% (expected ~20% platform-commission wedge between Gross and Net; OK as long as both read externalRevenue-only)" with:
- "Analytics Revenue (Net) **exactly matches** Sales Aggregation **Gross Sales** (both are pre-commission item sums). Delta must be < 0.5% (rounding only). Analytics does NOT have a post-commission 'Net Sales' equivalent — the Sales page's Net Sales is lower because it subtracts commissions at the parent level."

This sets correct expectations and prevents the UAT reviewer from accepting a false "within 5% wedge" check that would hide a real bug.

### Improvement 6: Guard against concurrent 80.1/80.3 prod deploys

**Location in plan:** Wave 4 Task 4.2/4.3/4.4

**Context:** Phase 80.1 (Analytics Perf Consolidation) is mid-planning with 3 plan files on the 80.1 branch. If 80.1 merges to main the same day 80.3 merges, the post-deploy parity check at 4.4 is confounded — a failure could be either 80.3's R5 skip mis-applied OR an 80.1 snapshot-query that bypasses `loadExternalStream`.

**Recommendation:** Add a scheduling guard to Wave 4:

> **4.0 — Deploy scheduling.** Before merging 80.3, confirm no 80.1 code commits landed on main that same day (`git log main --since="today" -- convex/reports/unitEconomics.ts`). If 80.1 landed first: re-verify on main that `loadExternalStream` still exists and R5 placement is still valid. If 80.1 is about to land: defer 80.3 merge by one day to preserve a clean attribution window.

---

## 4. Refinements (Minor Suggestions)

- **Date-anchored CHANGELOG wording.** RESEARCH Section 10 mentions `~Rp 517M at 90d`. When the entry actually lands in CHANGELOG, phrase as "as of 2026-04-17 observation" since the raw number depends on measurement date.
- **Acceptance command for Wave 1.** Add a literal paste-and-run verifier: `git grep -c 'source === "internal"' convex/reports/unitEconomics.ts` must output `convex/reports/unitEconomics.ts:1`.
- **File-level `@fileoverview`.** Top of `convex/reports/__tests__/unitEconomics.test.ts`:
  ```ts
  /**
   * @fileoverview R5 internal-mirror skip tests for the Unit Economics
   * analytics loader. Anchors Phase 80.3 regression coverage.
   *
   * Background: `source === "internal"` rows in externalRevenue are a
   * projection of the `orders` table created by syncInternalOrders (so
   * the Sales Aggregation page can count Direct orders from a single
   * source). Analytics MUST skip these rows in loadExternalStream to
   * avoid double-counting every Direct/WhatsApp/Instagram order.
   *
   * Root cause + math verification: .planning/debug/analytics-sales-mismatch.md
   * Original spec: docs/reviews/staffreview-phase-80-task-4b-addendum-2026-04-14.md
   */
  ```
- **"Math-verification" end-to-end assertion (optional).** Consider one additional test that seeds 10 direct orders + 10 mirrors and asserts `kpiSummary.current.orderCount === 10` (not 20). This directly mirrors the prod math-verification delta (265 orders, 265 duplicates) — if it passes in convex-test with deterministic N=10, it will pass in prod with N=265. Good defence against off-by-one or "skip once per row" bugs.

---

## 5. Duplication Analysis

### Existing Code to Leverage

| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `source === "internal"` skip pattern | `convex/externalData/helpers/dashboardHelpers.ts:83`, `convex/reports/incomeStatement.ts:247` | Match comment wording and placement style — these two sibling files already implement the same pattern |
| `convex-test` seeding pattern | `convex/externalData/__tests__/revenue-invariants.test.ts:23-56` (`seedShopeeRevenueWithItems`) | Mirror the `t.run(async (ctx) => ctx.db.insert(...))` approach for direct DB seeding |
| BOM seeding pattern | Any existing test that seeds `menuProductComponents` + `componentTypes` (search `convex/**/*.test.ts` for precedent) | Reuse/adapt instead of building from scratch |
| `channelTaxonomy.toDisplayChannel` / `sourceToDisplayChannel` | `convex/reports/channelTaxonomy.ts` | Use in test assertions to avoid hardcoding the "Direct"/"GoFood" channel strings |

### Potential Duplication Risks

- **`seedDirectOrderWithMirror` could drift from `syncInternalOrders` over time.** Add an inline comment referencing `convex/integrations/internal/adapter.ts` so that if the mirror schema changes (e.g. 80.2 adds fields), the test helper is updated in lock-step. If drift becomes a maintenance issue, consider extracting to a shared `__tests__/seedHelpers.ts`.

---

## 6. Phase/Wave Accuracy

| Wave | Assessment | Notes |
|-------|------------|-------|
| Wave 1 (Backend) | ✅ Good | Single sequential task, clear acceptance criteria |
| Wave 2 (Tests) | ⚠️ Needs minor adjustment | Add BOM seeding helper (Improvement 2) and direct-DB seeding approach (Improvement 1) |
| Wave 3 (Verification) | ✅ Good | Comprehensive gates; optional parity cron noted |
| Wave 4 (Merge + Post-Deploy) | ✅ Good | Add scheduling guard per Improvement 6 |

**Ordering Issues:** None. Waves 1 → 2 (tests after code lands) → 3 (verification) → 4 (merge) is the correct order for a fix whose correctness can be demonstrated deterministically in tests.

**Alternative ordering considered (TDD):** Write tests first (red), then add R5 skip (green). Rejected because the R5 skip is a 1-line change with zero ambiguity — TDD ceremony adds overhead without meaningful safety. If `TDD_MODE` is enabled project-wide, executor should swap Wave 1/2 ordering.

**Missing Phases:** None.

---

## 7. Specialist Agent Recommendations

| Wave | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Wave 1 (code) | `convex-backend` | Single-line backend change in `convex/reports/unitEconomics.ts` — canonical convex-backend scope |
| Wave 2 (tests) | `tdd-test-architect` | Convex-test backend integration tests — canonical scope |
| Wave 3.1 (audit) | `code-auditor` | Type compliance, `QueryCtx`/`MutationCtx` verification, pattern compliance |
| Wave 3.2-3.5 (gates) | Bash (direct) | `npm run type-check/lint/test/build` — no agent needed |
| Wave 3.6-3.7 (UAT + scaffold) | Human + `convex-backend` | UAT is user-driven; UAT scaffold file is small and mechanical |
| Wave 4 (merge + deploy) | Human | Release management |

All recommended agents exist per CLAUDE.md. No new agents needed.

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | ✅ Yes (`feature/80.3-analytics-internal-mirror-dedup`) |
| Branch naming convention | ✅ Correct (`feature/{phase}-{slug}` per CLAUDE.md) |
| Merge strategy documented | ✅ Yes (squash merge via PR) |
| Branched from main (not another feature branch) | ✅ Explicit guard in plan ("start with `git switch main && git pull` per CLAUDE.md pitfall #12") |

### Commit Strategy
| Wave | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| Wave 1 | 1 | `fix(80.3)` | R5 skip + inline comment |
| Wave 2 | 1-3 | `test(80.3)` | Can split Test 12 / 12b / 17 into separate commits or bundle; either is atomic |
| Wave 3 | 1 | `docs(80.3)` | HUMAN-UAT scaffold |
| Wave 4 | 0 (squash) | — | Squash merge via PR |

### Recommended Commit Checkpoints
1. After Wave 1: `fix(80.3): add R5 internal-mirror skip to loadExternalStream` → one commit
2. After Wave 2: `test(80.3): add symmetric internal-skip regression across 11 loadFilteredData callers` → one or three commits
3. After Wave 3: `docs(80.3): add HUMAN-UAT checklist for analytics parity verification` → one commit
4. CHANGELOG update: can be part of the final commit on the branch or separate `docs(80.3): changelog entry`

### Pre-Push Verification
- [x] Plan includes `npm run build` check (Wave 3.5)
- [x] Plan includes `npm run type-check` verification (Wave 3.2)
- [x] Plan includes `npm run lint` verification (Wave 3.3)
- [x] Plan includes `npm run test` — full suite (Wave 3.4)

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | ✅ Documented (straight revert in Research Section 7) |
| Deployment order | ✅ Correct (backend-only; Convex deploy is atomic; no frontend coordination) |
| Data backup needed | ✅ No (read-time aggregation bug, no data written/migrated) |
| Migration safety | ✅ N/A (no schema change) |

### Git Workflow Issues Found
- **Mild concern:** branch naming `feature/80.3-analytics-internal-mirror-dedup` is 43 chars from repo root; with a ~100-char base path on Windows (per CLAUDE.md pitfall #14 — worktree creation risk), total path risk is borderline but acceptable. Shorter alternative `feature/80.3-r5-skip` if space becomes an issue during execution, but not required.

---

## 9. Documentation Checkpoints

| Wave | Documentation Update Required |
|-------|-------------------------------|
| Wave 3.7 | `.planning/phases/80.3-analytics-internal-mirror-dedup/80.3-HUMAN-UAT.md` (created) |
| Pre-merge | `docs/CHANGELOG.md` (entry under `[Unreleased] > Fixed`) |
| Post-merge | `.planning/ROADMAP.md` (mark 80.3 complete) |
| Post-execution | `.planning/phases/80.3-analytics-internal-mirror-dedup/80.3-SUMMARY.md` |
| Post-`/gsd-verify-work` | `.planning/phases/80.3-analytics-internal-mirror-dedup/80.3-VERIFICATION.md` |

All appropriately scoped. No `docs/SCHEMA.md` or `docs/API_REFERENCE.md` updates needed (no schema change, no public API change).

### CHANGELOG.md Entry (Draft — refined from Research Section 10)

```markdown
### Fixed
- **Analytics (`/analytics`) double-counting Direct orders (Phase 80.3).** The Unit
  Economics dashboard was unioning native orders with their `externalRevenue[source="internal"]`
  mirror (created by `syncInternalOrders` for the Sales Aggregation page's use),
  inflating every Direct-channel KPI ~2×. Direct-channel revenue, units, and orders
  now match the Sales Aggregation page's Gross Sales on equivalent date ranges
  (both are pre-commission item sums; Net Sales on the Sales page is lower because
  it subtracts platform commissions at the parent level). If you had set revenue
  targets from Analytics pre-fix (~Rp 517M at 90d as of 2026-04-17 observation),
  the corrected value (~Rp 387M gross / ~Rp 310M net) is the real figure.
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict: Adequate, with Improvements 1-2 applied**

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend aggregator | R5 skip in `loadExternalStream` via `kpiSummary` | convex-test integration | Planned (Test 12) |
| Backend aggregator | gobiz non-skip regression | convex-test integration | Planned (Test 12b) |
| Backend aggregator | Symmetry across 11 callers | convex-test parameterised | Planned (Test 17) |
| Integration | Dev parity with Sales Aggregation | Manual (Wave 3.6) | Planned |
| Integration | Prod parity post-deploy | Manual (Wave 4.4) | Planned |

### Missing Test Coverage
| # | Missing | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | Multi-order scalability assertion (optional) | Validates the fix scales from N=1 to N=10+ deterministically before production N=265 | One test seeding 10 orders + 10 mirrors, asserting `orderCount === 10` (not 20). See Refinement "Math-verification end-to-end assertion". |

Not a Critical gap — the per-query symmetry tests already establish the skip works. This is belt-and-braces.

### Test Execution Checkpoints
All present:
1. After Wave 1: implicit via Wave 2 dependency
2. After Wave 2: Wave 3.4 `npm run test` (full suite)
3. Before merge: implicit via PR CI

### Regression Risk
- **Existing tests that may fail:** none expected — there are no existing tests for `unitEconomics.ts`. The R5 change is additive at the aggregator level; no test fixtures are invalidated.
- **Manual smoke-test checklist:**
  - [ ] `/analytics` renders with expected numbers on dev
  - [ ] `/k3mart-cockpit` Overview unchanged
  - [ ] Income Statement unchanged (separate pipeline — no regression expected)
  - [ ] Bank Reconciliation unchanged (same — no regression expected)

---

## 11. Edge Cases to Address

The plan explicitly handles all of these (in RESEARCH Section 6):

- [x] Cancelled orders (mirrored status filter makes this safe)
- [x] 100%-discount orders (`finalTotal === 0`)
- [x] Historical orphan mirrors (pre-2026-04-10; 80.2 territory)
- [x] Consignment rows (not `source="internal"`, unaffected)
- [x] `bank_statement_reversal` sourceType (doesn't write to externalRevenue)
- [x] Status-changed-to-Cancelled after mirroring (stale mirror; both paths skip)

No missing edge cases identified.

---

## 12. Approval Conditions

**For Approval, address:**
None — no Critical issues.

**Recommended before implementation (apply in this order):**
1. **Improvement 2 (BOM seeding)** — blocking for Wave 2 executability; without it the tests hit `units === 0` false failures
2. **Improvement 1 (direct DB seed)** — reduces test brittleness; should inform the `seedDirectOrderWithMirror` helper design
3. **Improvement 3 (placement-guard comment)** — trivial to include at the same time as the R5 edit in Wave 1
4. **Improvement 4 (specific invariants per query)** — extend test file comments so the symmetry loop is unambiguous
5. **Improvement 5 (HUMAN-UAT wording)** — fold into Wave 3.7 scaffold directly
6. **Improvement 6 (80.1/80.3 deploy guard)** — add to Wave 4 as step 4.0

**Optional (Refinements):**
- Date-anchor CHANGELOG value
- Paste-and-run Wave 1 acceptance command
- `@fileoverview` on test file
- Multi-order scalability assertion

---

## 13. Final Verdict

**Approve with Minor Revisions.** The plan correctly identifies and scopes a genuine production bug, reuses existing patterns from two sibling files, and includes the staff-review-mandated Test 12b negative regression. The six Improvements are low-effort refinements — none require architectural changes. Apply Improvements 1-6 (mechanical fixes to the plan text and test-helper design), then proceed to execution.

Downstream impact is well-understood and bounded: backend-only change, no schema migration, no frontend code, deterministic test coverage, trivial rollback via revert. Prod deploy risk is low; deploy scheduling guard (Improvement 6) is the only meaningful coordination concern.

---

*Generated by /staffreview skill — 2026-04-18*
*Staff Developer Review (Implementation) + Principal Developer Review (Architecture)*
