# Staff Review: Phase 34 Plan -- Income Statement Testing

**Date:** 2026-03-02
**Reviewer:** Claude (Staff Engineer)
**Target:** `.planning/phases/34-income-statement-testing/34-01-PLAN.md`
**Branch:** `gsd/phase-33-income-statement-frontend`
**Prior Reviews:**
- Design doc: `docs/reviews/staffreview-income-statement-design-2026-03-01.md`
- Phase 32 backend: `docs/reviews/staffreview-phase-32-income-statement-backend-2026-03-02.md`
- Phase 33 pre-implementation: `docs/reviews/staffreview-phase-33-income-statement-frontend-2026-03-02.md`
- Phase 33 triple review: `docs/reviews/staffreview-phase-33-triple-review-2026-03-02.md`

---

## Summary

Phase 34-01 is a focused, well-scoped plan that adds a single multi-channel integration test and closes out the v1.5 milestone with documentation updates. The plan faithfully maps to the CONTEXT.md locked decisions and correctly identifies the one remaining test gap: a multi-channel revenue aggregation test combining 3+ channels in a single test case. The test design uses round numbers, reuses existing helpers, and covers the correct cross-channel assertions. The plan is implementable as-is with one important improvement and a few minor refinements.

---

## Critical Issues

None. The plan is structurally sound, correctly scoped, and covers the target requirements.

---

## Improvements

### 1. Internal channel discount seeding relies on order lookup, but the plan's test data setup may produce incorrect discount values

**Location:** Plan Task 1, step 4 (internal channel seeding), lines 159-164

The plan seeds an internal channel with:
```
totalAmount: 80000, finalTotal: 75000, deliveryFee: 10000
Discount = totalAmount - (finalTotal - deliveryFee) = 80000 - (75000 - 10000) = 15000
```

This math is correct. However, looking at the backend code in `convex/reports/incomeStatement.ts` (lines 244-273), the internal channel discount correction only kicks in when `rec.externalTransactionId` matches an order via `orderDataMap`. The plan's step 4 seeds `externalTransactionId: "0105-002"` and creates an order with `orderNumber: "0105-002"`, which should match via `fetchInternalOrderDataMap`.

But looking more closely at `fetchInternalOrderDataMap` (imported from `convex/externalData/queries.ts`), the matching happens by `orderNumber`. The plan creates the order with `orderNumber: "0105-002"`. The existing internal discount test (lines 473-535 of the test file) uses this exact pattern and it works. So the plan's approach is correct.

**However**, there is a subtlety: the plan asserts `internal: gross=80000, discount=15000, netRevenue=65000` but the total cross-channel assertions show `totalDiscounts = 15000`. This is correct only if gobiz and consignment have zero discounts, which they should (gobiz has commission, not discount; consignment has revShare, not discount). Verified: the plan is internally consistent.

**The real concern is test isolation.** The multi-channel test creates 3 products with unique BOM codes (e.g., "BIG_BALL_A", "SMALL_BOX_A"), 3 revenue records, a customer, an order, a consignment outlet, and a consignment settlement. This is a complex fixture. If `seedMenuProductWithBOM` creates componentTypes with codes like "BIG_BALL_A", those are unique per test invocation (convex-test isolates state), so there is no collision risk with the other 11 tests. This is fine.

**The actual improvement:** The plan should explicitly call out that the internal channel's `netRevenue` assertion must account for the backend's behavior when `orderDataMap` returns the order data. Specifically, the backend computes `channelGross = orderData.totalAmount` (not `revenueGross`). The plan seeds `revenueGross: 80000` AND `orderData.totalAmount: 80000` to match, but if these values ever diverged, the test would be testing the wrong thing. Add an inline comment in the test clarifying that `gross` for internal comes from `orders.totalAmount`, not `externalRevenue.revenueGross`.

**Severity:** Low-medium. The test will work correctly as written, but without the comment, a future maintainer might not understand why internal channel gross = 80000.

### 2. Consignment gross revenue assertion should verify it comes from `consignmentSettlements.totalRevenue`, not `externalRevenue.revenueGross`

**Location:** Plan Task 1, step 3 (consignment seeding) and per-channel assertions (line 170)

The plan seeds both `externalRevenue` with `source: "consignment", revenueGross: 50000` AND `consignmentSettlements` with `totalRevenue: 50000`. Looking at the backend (`incomeStatement.ts:229-233`), the `aggregateWeek` function explicitly **skips** `source === "consignment"` in the externalRevenue loop and processes consignment **only** via `consignmentSettlements` (section 4c, lines 334-381). This means:

- Consignment `gross` comes from `settlement.totalRevenue` (line 341), NOT from `externalRevenue.revenueGross`
- Both are seeded as 50000, so the assertion passes either way
- But the test does not verify that the externalRevenue record's `revenueGross` is irrelevant

**Recommendation:** Either (a) seed the `externalRevenue` record with a different `revenueGross` value (e.g., 99999) to prove the assertion doesn't accidentally depend on it, or (b) add a comment explaining that the `externalRevenue` record for consignment is used only for its ID (to link revenue items via `linkedRevenueId`), not for its `revenueGross` amount. Option (a) is the stronger assertion and would catch a regression if the backend accidentally starts double-counting consignment.

**Severity:** Medium. The test as written would pass for the wrong reason if the backend had a double-counting bug.

### 3. Missing assertion for `gapAnalysis` fields in the multi-channel test

**Location:** Plan Task 1, step 5 (assertions), lines 166-188

The plan asserts per-channel COGS, cross-channel totals, channel ordering, and product confidence. However, it does not assert `gapAnalysis` fields:

- `gapAnalysis.unmappedProducts` should be empty (all 3 products are BOM-linked)
- `gapAnalysis.totalMappedProducts` should be 6 (2+2+2 revenue items, all mapped)
- `gapAnalysis.totalProducts` should be 6
- `gapAnalysis.zeroCostComponents` should be empty (all BOM components have non-zero costs)

These assertions would strengthen the test significantly. The existing tests for unmapped products and zero-cost components test those scenarios individually, but the multi-channel test should verify that the "happy path" (all products mapped, no zero-cost components) produces a clean gap analysis.

**Severity:** Medium. Missing gap analysis assertions mean the test would still pass if the gap analysis logic had a regression that incorrectly flagged mapped products as unmapped.

### 4. Confidence assertion at channel level is incomplete

**Location:** Plan Task 1, step 5, line 188

The plan asserts:
> **Product confidence:** All 3 channels should have products with confidence = "calculated" (all BOM-linked)

This checks product-level confidence but not channel-level confidence. The backend computes channel-level confidence as `worstConfidence(revenueConfidence, productConfidence)`:
- gobiz revenue confidence = "exact" (line 100 of incomeStatement.ts), no missing COGS -> channel confidence = "exact"
- consignment revenue confidence = "exact" (line 105), no missing COGS -> channel confidence = "exact"
- internal revenue confidence = "exact" (line 100), no missing COGS -> channel confidence = "exact"

The test should assert `channel.confidence` for each channel, not just product confidence. This verifies the `worstConfidence` logic works correctly in the multi-channel context.

**Severity:** Low-medium. Channel confidence is indirectly tested by the existing unmapped product test, but the multi-channel test should verify the happy path.

---

## Refinements

### 5. Test count assertion in plan may be off

**Location:** Task 2, step 3, line 232

The plan states `"684 passing (683 + 1 new)"` but the CONTEXT.md says the current count is 683. This is correct as stated. However, the plan says "adjust the test count based on actual `npm run test` output," which is good defensive practice. No action needed.

### 6. The criteria-to-test audit trail mapping is inline in the plan, not extracted

**Location:** Task 2, step 2

The audit trail mapping is presented as a table in the plan's action section. This is good for the executor, but the CONTEXT.md says to produce it either "in plan summary, verification doc, or both." The plan should clarify that this mapping should appear in the 34-01-SUMMARY.md output file (which the plan's `<output>` section does specify). Minor point -- the executor will likely do this correctly.

### 7. Plan mentions consignment `revSharePercent: 20` on the outlet but the assertion derives revShare from the settlement's `revShareAmount: 10000`

**Location:** Task 1, step 3, lines 153-157

The plan creates a consignment outlet with `revSharePercent: 20` and a settlement with `revShareAmount: 10000`. The backend uses `settlement.revShareAmount` directly (line 343 of incomeStatement.ts: `consignRevShare += settlement.revShareAmount`). The outlet's `revSharePercent` is not read by the income statement query -- it is used during settlement creation, not P&L aggregation.

The plan's test data is consistent (20% of 50000 = 10000), but seeding the outlet's `revSharePercent` is unnecessary for the test. It does not hurt anything (the schema requires it), but the executor should understand that the assertion is validating `settlement.revShareAmount`, not a percentage calculation.

No action required -- just a clarity point.

### 8. The plan does not mention updating the `REQUIREMENTS.md` traceability table

**Location:** Plan Task 2

The plan updates CHANGELOG.md and ROADMAP.md, but REQUIREMENTS.md currently shows IS-13 and IS-14 as "Complete" with attribution to Phase 32. If Phase 34 adds more tests that further verify IS-13 and IS-14, the traceability table could note Phase 34's contribution. However, since the REQUIREMENTS.md already marks these as complete (from Phase 32's tests), this is a minor omission.

No action required unless the team wants to track per-phase test additions in the traceability matrix.

---

## Plan Fidelity to CONTEXT.md

| CONTEXT.md Decision | Plan Coverage | Verdict |
|---------------------|---------------|---------|
| Combine gobiz + consignment + internal in one test | Task 1: all 3 channels seeded and asserted | MATCH |
| Assert cross-channel totals | Task 1: totalGross, totalDeductions, netRevenue, totalCogs, grossProfit | MATCH |
| Channels sorted by gross descending | Task 1: explicit ordering assertion | MATCH |
| All 3 BOM-linked, no unmapped | Task 1: all products linked | MATCH |
| No delta comparison in multi-channel test | Task 1: no delta assertions | MATCH |
| Backend only, no frontend E2E | Plan scope: tests/convex/ only | MATCH |
| Audit trail mapping criteria to tests | Task 2: explicit table | MATCH |
| Round numbers for readability | Task 1: 100K, 50K, 80K, 10K, etc. | MATCH |
| Reuse existing helpers | Task 1: seedExternalRevenue, seedRevenueItem, seedMenuProductWithBOM | MATCH |
| Consignment with outlet + settlement + linkedRevenueId | Task 1: full fixture | MATCH |
| Update CHANGELOG + ROADMAP | Task 2: explicit steps | MATCH |

**CONTEXT.md Fidelity: 11/11 decisions covered. No gaps.**

---

## Requirement Coverage

| Requirement | Plan Coverage | Status |
|-------------|---------------|--------|
| **IS-13**: Known-value COGS assertions (production + packaging split) | Existing tests (Phase 32) + multi-channel test adds 3 more products with known COGS | COVERED |
| **IS-14**: Multi-channel revenue aggregation + edge cases | Multi-channel test (gobiz+consignment+internal) + existing edge case tests (empty, zero, negative, unmapped) | COVERED |

**Requirements: 2/2 fully covered by the combination of existing Phase 32 tests + Phase 34 additions.**

---

## Design Doc Test Case Cross-Reference

The design doc (Section 10) specifies 10 test cases. Cross-referencing with actual tests:

| # | Design Doc Test Case | Actual Test | Status |
|---|---------------------|-------------|--------|
| 1 | BOM COGS accuracy | `incomeStatement.test.ts`: "known BOM COGS accuracy: production + packaging" | EXISTS |
| 2 | Multi-channel revenue aggregation | Phase 34 adds this | ADDING |
| 3 | Internal order discount correction | `incomeStatement.test.ts`: "internal order discount correction via order data" | EXISTS |
| 4 | Empty week | `incomeStatement.test.ts`: "empty week returns all zeros, no crash" | EXISTS |
| 5 | Unmapped product COGS = missing | `incomeStatement.test.ts`: "unmapped product has COGS = 0 and appears in gap analysis" | EXISTS |
| 6 | Consignment settlement inclusion | `incomeStatement.test.ts`: "consignment settlement included with revShare deduction" | EXISTS |
| 7 | WIB timezone boundary | `incomeStatement.test.ts`: "WIB timezone boundary: record at Mon 00:01 WIB" | EXISTS |
| 8 | Division by zero: zero revenue margin | `incomeStatement.test.ts`: "zero net revenue has margin = null, not NaN" | EXISTS |
| 9 | Negative net revenue | `incomeStatement.test.ts`: "negative net revenue is valid (no crash)" | EXISTS |
| 10 | `buildProductCOGSMap` unit test | `costCalculator.test.ts`: 6 tests in describe("buildProductCOGSMap") | EXISTS |

**Design doc test coverage: 10/10 test cases implemented after Phase 34.**

---

## Prior Review Impact Assessment

### From Phase 33 Triple Review (`staffreview-phase-33-triple-review-2026-03-02.md`):

1. **Chevron direction fix (Important #1):** Fixed in Plan 33-04. No Phase 34 impact.
2. **Dark mode token violation (Important #2):** Fixed in Plan 33-04. No Phase 34 impact.
3. **File size (Refinement #3):** Addressed in Plan 33-04 with component extraction. No Phase 34 impact.
4. **`computeDelta` duplication (Refinement #4):** Low severity, not Phase 34's scope.
5. **CSV delta sign convention (Refinement #5):** Documented, not Phase 34's scope.
6. **Channel disappearance from previous week (Refinement #6):** Not tested by Phase 34, but this is a design decision, not a bug.

**No Phase 33 review findings affect Phase 34's plan.** All important issues were addressed in Plan 33-04.

### From Phase 33 Pre-Implementation Review:

1. **`isCurrentWeek` fix (Critical #1):** Implemented. No Phase 34 impact.
2. **`getCurrentWeekStart()` unit test recommendation:** The pre-implementation review suggested "Consider adding a unit test for `getCurrentWeekStart()` to verify WIB week boundary correctness." Phase 34 does NOT add this test -- but `calculateWeekRange` (the backend equivalent) already has 4 unit tests in `costCalculator.test.ts`. The frontend function is a simple duplicate of the backend logic. This is a minor gap but not a Phase 34 blocker.

---

## Over/Under Engineering Assessment

| Concern | Assessment |
|---------|------------|
| Scope right-sized? | Yes. One test + docs. Matches the CONTEXT.md constraint of "fill the gap, no scope expansion." |
| Too little? | The gap analysis assertions (Improvement #3) and channel confidence assertions (Improvement #4) would meaningfully strengthen the test, but the test as written still validates the core multi-channel aggregation logic. |
| Too much? | No over-engineering. The test data is realistic and the assertions are specific. |
| Test data complexity? | Acceptable. Three products, three channels, one customer, one order, one outlet, one settlement. The consignment fixture is necessarily complex because the backend has a separate code path for consignment. |

---

## Executor Actionability

The plan is highly actionable for an autonomous executor:

1. **Clear placement:** "After the last existing test" in the existing describe block.
2. **Explicit test name:** `"multi-channel revenue aggregation: gobiz + consignment + internal"`
3. **Step-by-step seeding:** Each channel has numbered steps with exact helper calls and parameter values.
4. **Known-value assertions:** All expected values are pre-computed with arithmetic shown inline (e.g., `2*10000 = 20000`).
5. **Component code collision avoidance:** Explicit instruction to use unique codes per product (e.g., "BIG_BALL_A").
6. **Verification command:** Exact `npx vitest run` command specified.

**Actionability: 9/10.** The only gap is that the executor must figure out the exact schema fields for `orders` insertion (the plan specifies `orderNumber`, `totalAmount`, `finalTotal`, `deliveryFee` but the orders schema has many more required fields). The existing internal discount test (lines 473-499) provides the exact template, but the plan does not reference it explicitly.

---

## Verdict

**APPROVE WITH CONDITIONS**

The plan is well-scoped, correctly targeted, and maps faithfully to both CONTEXT.md decisions and requirements IS-13/IS-14. It is implementable as-is and will produce a working test. However, two improvements would significantly strengthen the test's ability to catch regressions:

1. **(Recommended)** Seed consignment `externalRevenue.revenueGross` with a different value than `consignmentSettlements.totalRevenue` to prove the test does not accidentally depend on the wrong data source (Improvement #2).
2. **(Recommended)** Add `gapAnalysis` assertions to verify the happy path produces a clean gap analysis (Improvement #3).

These are non-blocking -- the executor can proceed and incorporate these improvements during implementation.

---

*Generated by /staffreview skill*
*Senior/Principal Engineer Review (Pre-Implementation)*
*Phase 34: Income Statement Testing -- 1 plan, 2 tasks, 2 requirements*
