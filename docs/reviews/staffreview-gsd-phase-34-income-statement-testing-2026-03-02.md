# Staff Review: Phase 34 Income Statement Testing

**Date:** 2026-03-02
**Reviewer:** Claude (Staff Engineer, Post-Implementation)
**Target:** Branch `gsd/phase-34-income-statement-testing` (4 commits, `e17c59c..386e75b`)
**Base:** `main` at `67bb267`
**Plan:** `.planning/phases/34-income-statement-testing/34-01-PLAN.md`
**Design Doc:** `docs/plans/2026-03-01-income-statement-design.md`
**Prior Plan Review:** `docs/reviews/staffreview-phase-34-plan-review-2026-03-02.md`

---

## Summary

Phase 34 delivers a single multi-channel integration test (210 lines, ~58 assertions) combining gobiz, consignment, and internal channels in one test case, plus documentation updates to close out the v1.5 Financial Statements milestone. The implementation is faithful to the plan with one justified deviation (gap analysis counters count revenue item rows, not unit quantities). The sentinel value pattern for consignment double-counting detection was incorporated from the pre-implementation review's top recommendation. The test is well-structured, readable, and exercises the full income statement query pipeline end-to-end. This is a clean, tightly-scoped delivery.

---

## Critical Issues

None. The implementation is correct, the test exercises the intended code paths, and there are no regressions or logic errors.

---

## Improvements

### 1. Existing consignment test still uses matching `revenueGross` -- missed retrofit opportunity

**Files:** `tests/convex/incomeStatement.test.ts`, lines 403-407

The pre-implementation review (Improvement #2) recommended using a sentinel value for `externalRevenue.revenueGross` on the consignment path to prove the query reads from `consignmentSettlements.totalRevenue`, not `externalRevenue`. The multi-channel test correctly implements this (`revenueGross: 99999`). However, the existing standalone consignment test at line 389 ("consignment settlement included with revShare deduction") still seeds `revenueGross: 50000` -- the same value as `totalRevenue: 50000`. This means the older test would pass even if the query incorrectly read gross from the revenue record.

While the multi-channel test now catches this regression class, having the standalone consignment test also use a sentinel (e.g., `revenueGross: 77777`) would make the protection redundant across two independent tests, which is stronger defense.

**Severity:** Low. The multi-channel test already covers this scenario. This is a hardening opportunity, not a gap.

### 2. No inline comment explaining that internal channel `gross` comes from `orders.totalAmount`, not `externalRevenue.revenueGross`

**Files:** `tests/convex/incomeStatement.test.ts`, lines 709-747

The plan seeds `revenueGross: 80000` on the internal externalRevenue record AND `totalAmount: 80000` on the order. The backend reads `gross` from `orders.totalAmount` for internal channels (line 259 of `incomeStatement.ts`), not from `externalRevenue.revenueGross`. These values happen to match, which means a future developer reading the test might assume the assertion validates the externalRevenue path.

The pre-implementation review (Improvement #1) flagged this and recommended an inline comment. The implementation does not include this comment. While this is not a correctness issue, it would improve maintainability. A brief comment like `// NOTE: internal gross comes from orders.totalAmount, not externalRevenue.revenueGross` at the assertion site (line 783) would suffice.

**Severity:** Low. Documentation/readability concern, not correctness.

### 3. Internal channel could also use a sentinel value on `externalRevenue.revenueGross`

**Files:** `tests/convex/incomeStatement.test.ts`, lines 734-738

Extending the sentinel pattern to the internal channel (e.g., `revenueGross: 88888` instead of `80000`) would prove that the internal path reads from `orders.totalAmount`, not from `externalRevenue.revenueGross`. Currently, both are seeded at 80000 and the test cannot distinguish which source is used. This is the same class of improvement as the consignment sentinel -- both values matching means the test passes for either implementation.

**Severity:** Low. The internal discount test at line 473 separately validates the order data lookup path, but it also uses matching values. A sentinel would make the proof airtight.

---

## Refinements

### 4. Gap analysis `totalMappedProducts` / `totalProducts` deviation is correct but under-documented in the test

**Files:** `tests/convex/incomeStatement.test.ts`, lines 817-818

The plan specified `totalMappedProducts === 6` and `totalProducts === 6` (2 units per channel x 3 channels = 6). The implementation correctly deviated to `toBe(3)` because `resolveItemsCOGS` increments `counters.totalProducts` once per `externalRevenueItems` row, not per quantity. The test seeds 1 revenue item row per channel (each with `quantity: 2`), so 3 item rows = 3 total products.

The SUMMARY.md documents this deviation clearly. However, the inline test comment at line 817 (`// 1 revenue item row per channel * 3 channels`) is the only in-test explanation. Consider making this more explicit: `// Counts distinct revenue item rows (not unit quantities): 1 per channel * 3 channels`.

**Severity:** Nitpick. The current comment is adequate.

### 5. Component type codes use suffixed names to avoid collisions (`SMALL_BOX_B`, `MID_BALL_C`, `LARGE_BOX_C`)

**Files:** `tests/convex/incomeStatement.test.ts`, lines 633, 644-645

The test uses suffixed codes like `SMALL_BOX_B`, `MID_BALL_C`, `LARGE_BOX_C` instead of standard codes like `SMALL_BOX`, `MID_BALL`, `LARGE_BOX`. The plan noted that `convex-test` provides isolated databases per test invocation, so code collisions across tests are impossible. Within a single test, however, using the same `code` for different `componentTypes` records could cause ambiguity if the query ever resolves by code instead of ID.

Since `buildProductCOGSMap` resolves by `componentTypeId` (Convex `_id`), not by `code`, the suffixes are technically unnecessary. However, they serve as defensive documentation -- a reader can immediately tell that Product B's "Small Box" is a different record from Product A's "Small Box". The suffixes are a reasonable coding style choice.

**Severity:** Nitpick. No action needed.

### 6. Test does not assert `missingChannels` in gap analysis

**Files:** `tests/convex/incomeStatement.test.ts`, lines 816-819

The gap analysis assertions check `unmappedProducts`, `totalMappedProducts`, `totalProducts`, and `zeroCostComponents`, but do not assert `missingChannels`. The backend populates `missingChannels` from `KNOWN_MISSING_CHANNELS` (currently only `grabfood`). Since the test has no grabfood data, `missingChannels` should contain `[{ source: "grabfood", ... }]`.

This is a minor omission -- the missing channels logic is simple (static list vs. active channels) and unlikely to regress. But asserting it would make the multi-channel test a more complete gap analysis verification.

**Severity:** Nitpick. Low-value assertion for the effort.

### 7. CHANGELOG test count may drift

**Files:** `docs/CHANGELOG.md`, line 46

The CHANGELOG states "684 passing, 0 failures". This was accurate at the time of writing but will become stale as future phases add tests. This is standard practice for changelogs (they record point-in-time state), so no action needed. Just noting that it should not be treated as a current metric.

**Severity:** Nitpick. Expected behavior for changelogs.

---

## Plan Fidelity Assessment

### Plan-to-Implementation Mapping

| Plan Item | Implementation | Status |
|-----------|---------------|--------|
| **Test name:** "multi-channel revenue aggregation: gobiz + consignment + internal" | Line 612: exact match | MATCH |
| **3 BOM-linked products** with specified component costs | Lines 618-646: Product A (BIG_BALL 10000 + SMALL_BOX 2000), Product B (MID_BALL 5000 + SMALL_BOX 2000 + STICKER 500), Product C (MID_BALL 5000 x2 + LARGE_BOX 3000) | MATCH |
| **Gobiz channel:** gross 100000, commission 10000, 2 units Product A | Lines 649-662: exact match | MATCH |
| **Consignment sentinel:** externalRevenue.revenueGross = 99999 | Line 669: `revenueGross: 99999` with sentinel comment | MATCH |
| **Consignment settlement:** totalRevenue 50000, revShare 10000 | Lines 693-707: exact match | MATCH |
| **Internal channel:** order with totalAmount 80000, finalTotal 75000, deliveryFee 10000 | Lines 714-731: exact match | MATCH |
| **Per-channel assertions** (gobiz, consignment, internal) | Lines 764-788: all per-channel gross, deductions, net, COGS verified | MATCH |
| **Cross-channel totals:** totalGross=230000, totalDeductions=35000, netRevenue=195000, totalCogs=65000, grossProfit=130000 | Lines 791-803: exact match | MATCH |
| **grossMarginPercent:** `toBeCloseTo(66.67, 2)` | Line 801: exact match | MATCH |
| **channels.length === 3** | Line 756: exact match | MATCH |
| **Channel ordering:** gross descending | Lines 759-761: gobiz > internal > consignment | MATCH |
| **Channel confidence === "exact"** | Lines 806-808: all 3 channels asserted | MATCH |
| **Product confidence === "calculated"** | Lines 811-813: `.every()` check per channel | MATCH |
| **Gap analysis happy path** | Lines 816-819: unmapped=0, totalMapped=3, totalProducts=3, zeroCost=0 | DEVIATION (see below) |
| **Update CHANGELOG** | Lines 42-46 of diff: Phase 34 entry added | MATCH |
| **Update ROADMAP** | Phase 34 marked `[x]`, v1.5 shipped | MATCH |

### Deviations

| # | Item | Plan Value | Actual Value | Justified? |
|---|------|------------|--------------|------------|
| 1 | `gapAnalysis.totalMappedProducts` | 6 | 3 | Yes. Plan assumed quantity * channels, but `resolveItemsCOGS` counts revenue item rows. 1 row per channel * 3 = 3. Documented in SUMMARY.md. |
| 2 | `gapAnalysis.totalProducts` | 6 | 3 | Same as above. Consistent with implementation. |

Both deviations are the same underlying cause (plan spec error in gap analysis counting semantics). The executor correctly identified and fixed this during implementation. The SUMMARY.md documents it under "Deviations from Plan" with clear explanation. This is a textbook example of good deviation handling.

---

## Design Doc Compliance

| Design Doc Decision | Implementation | Compliant? |
|---------------------|----------------|------------|
| Real-time query aggregation (no snapshots) | Test calls `getWeeklyIncomeStatement` which performs live aggregation | Yes |
| Full BOM COGS (production + packaging) | All 3 products have production + packaging components; assertions split by category | Yes |
| Confidence indicators first-class | Test asserts channel-level (`exact`) and product-level (`calculated`) confidence | Yes |
| Gap analysis inline (same query) | Test asserts `gapAnalysis` fields from the same query result | Yes |
| Consignment folded into P&L | Consignment channel asserted as peer channel alongside gobiz and internal | Yes |
| Unmapped = honest zero COGS | Tested separately in existing "unmapped product" test (line 178) | Yes (existing test) |
| Week starts Monday (WIB) | Uses `TEST_WEEK_START` = Monday 00:00 WIB | Yes |
| BOM preloading into in-memory maps | Tested implicitly -- COGS assertions validate the map lookup works | Yes |

**Design doc test case cross-reference (Section 10):**

| # | Design Doc Test | Actual Test | Status |
|---|----------------|-------------|--------|
| 1 | BOM COGS accuracy | "known BOM COGS accuracy: production + packaging" (line 226) | Covered |
| 2 | Multi-channel revenue aggregation | "multi-channel revenue aggregation" (line 612) -- **Phase 34 addition** | Covered |
| 3 | Internal order discount correction | "internal order discount correction via order data" (line 473) | Covered |
| 4 | Empty week | "empty week returns all zeros, no crash" (line 163) | Covered |
| 5 | Unmapped product COGS = missing | "unmapped product has COGS = 0 and appears in gap analysis" (line 178) | Covered |
| 6 | Consignment settlement inclusion | "consignment settlement included with revShare deduction" (line 389) | Covered |
| 7 | WIB timezone boundary | "WIB timezone boundary: record at Mon 00:01 WIB" (line 537) | Covered |
| 8 | Division by zero: zero revenue margin | "zero net revenue has margin = null, not NaN" (line 283) | Covered |
| 9 | Negative net revenue | "negative net revenue is valid (no crash)" (line 296) | Covered |
| 10 | `buildProductCOGSMap` unit test | `costCalculator.test.ts`: 6 tests in describe("buildProductCOGSMap") | Covered |

**10/10 design doc test cases now have implementations. Phase 34 filled the last gap (#2).**

---

## Test Architecture Assessment

### Strengths

1. **Clear sectioning with comments.** The test uses `// -- 1. Seed...`, `// -- 2. Seed...`, etc. which makes the 210-line test scannable. Each section corresponds to a plan step.

2. **Round-number test data.** All costs are multiples of 1000 (10000, 5000, 2000, 3000, 500). Cross-channel totals are easy to mentally verify (230000, 35000, 195000, 65000, 130000). This follows the CONTEXT.md decision for readability.

3. **Comprehensive assertion coverage.** The test verifies per-channel (gross, deductions, net, COGS split), cross-channel (7 total fields), structural (channel count, ordering), confidence (channel + product level), and gap analysis (4 fields). This is not a shallow smoke test.

4. **Sentinel value is well-placed and commented.** Line 669 uses `revenueGross: 99999` with an inline comment explaining the sentinel purpose. If a regression introduces double-counting, `totalGross` would be 229999 instead of 230000, making the failure message immediately diagnostic.

5. **Reuses existing helper functions.** No new helpers were created. The test uses `seedExternalRevenue`, `seedRevenueItem`, and `seedMenuProductWithBOM` consistently with the other 11 tests, maintaining uniformity.

6. **Isolated test state.** Each test creates a fresh `convexTest(schema)` instance, so there is no cross-test contamination. The suffixed component codes (`SMALL_BOX_B`, etc.) add extra safety within the multi-channel test itself.

### Weaknesses

1. **Long single test.** At 210 lines, this is a large test case. Some teams would split it into smaller focused tests (e.g., separate gobiz-only, consignment-only, internal-only, then a totals-only test). However, the explicit goal of the phase was "multi-channel aggregation in a single test case," and the sectioning comments mitigate readability concerns. This is a design choice, not a defect.

2. **No negative assertion on the sentinel.** The test asserts `totalGross === 230000`, which implicitly proves 99999 was not used. A more explicit assertion like `expect(result.current.totalGross).not.toBe(229999)` would make the sentinel's purpose visible in the assertion output. However, this is redundant -- `toBe(230000)` already fails if the value is 229999. Omission is acceptable.

3. **Internal channel could be more strongly isolated.** As noted in Improvement #3, the internal path seeds `revenueGross: 80000` matching `orders.totalAmount: 80000`, so the test cannot distinguish which source the query reads. This is a missed opportunity for a second sentinel.

### Isolation and Maintenance

- **No shared mutable state.** Each test uses its own `convexTest(schema)` instance.
- **No flaky time dependencies.** All timestamps use the constant `TEST_WEEK_START` or derived values.
- **Helper abstraction is appropriate.** Complex seeding (BOM, outlet, settlement, order) is done inline rather than in new helpers, which keeps the test self-contained at the cost of verbosity. Given this is the only test with 3-channel setup, a helper would be premature abstraction.

---

## Pre-Implementation Review Adoption

The pre-implementation review (`staffreview-phase-34-plan-review-2026-03-02.md`) made 4 improvement recommendations. Here is how they were handled:

| # | Recommendation | Adopted? | Notes |
|---|---------------|----------|-------|
| 1 | Add inline comment that internal `gross` comes from `orders.totalAmount` | No | Comment not present. Low severity. |
| 2 | Seed consignment `externalRevenue.revenueGross` with sentinel (99999) | **Yes** | Line 669: `revenueGross: 99999`. Primary recommendation adopted. |
| 3 | Add `gapAnalysis` assertions (happy path) | **Yes** | Lines 816-819: unmapped, totalMapped, totalProducts, zeroCost all asserted. |
| 4 | Assert channel-level confidence | **Yes** | Lines 806-808: all 3 channels `confidence === "exact"`. |

**3 of 4 recommendations adopted.** The adopted items were the reviewer's top priorities (Improvements #2, #3, #4 in the review). The omitted item (#1, inline comment) was the lowest severity recommendation.

---

## Scope Assessment

| Concern | Assessment |
|---------|------------|
| Scope right-sized? | Yes. One test + documentation updates. Matches the CONTEXT.md constraint: "fill the gap, no scope expansion." |
| Scope creep? | None. No new helper functions, no refactoring of existing tests, no frontend changes. |
| Under-delivered? | The test is substantive (58 assertions, 210 lines). All 4 Phase 34 success criteria are covered. The only gap is the 3 low-severity improvements noted above. |
| Over-engineered? | No. Test data is minimal (3 products, 3 channels, 1 customer, 1 order, 1 outlet, 1 settlement). No unnecessary abstractions. |

---

## Commit Quality

| Commit | Message | Content | Assessment |
|--------|---------|---------|------------|
| `e17c59c` | `test(34-01): add multi-channel revenue aggregation integration test` | 210-line test addition | Clean. Single-purpose commit with test code only. |
| `12d758d` | `docs(34-01): verify success criteria, update CHANGELOG and ROADMAP` | CHANGELOG + ROADMAP updates | Clean. Documentation separated from test code. |
| `c22208e` | `docs(34-01): complete multi-channel test & verification plan` | Planning docs (SUMMARY, VERIFICATION) | Clean. Planning artifacts. |
| `386e75b` | `docs(phase-34): complete phase execution and verification` | STATE updates | Clean. Phase closure. |

All commits follow conventional commit format (`type(scope): description`). Logical separation between test code (commit 1), user-facing docs (commit 2), planning docs (commit 3), and state updates (commit 4).

---

## Verdict

**APPROVE**

Phase 34 is a clean, well-executed delivery that fills the last test gap in the v1.5 Financial Statements milestone. The multi-channel integration test is substantive, correctly structured, and faithfully implements the plan with one justified deviation (gap analysis counting semantics). The sentinel value pattern for consignment double-counting was adopted from the pre-implementation review. All 10 design doc test cases are now implemented. The 3 suggested improvements (sentinel on internal channel, inline comment for internal gross source, retrofit existing consignment test) are all low-severity hardening opportunities that can be addressed in future maintenance if desired.

The v1.5 milestone (Phases 32-34, 9 plans, 161 total plans shipped) is ready to merge to main.

---

*Generated by /staffreview skill (post-implementation)*
*Senior/Principal Engineer Review*
*Phase 34: Income Statement Testing -- 1 plan, 2 tasks, 1 test added, 58 assertions*
