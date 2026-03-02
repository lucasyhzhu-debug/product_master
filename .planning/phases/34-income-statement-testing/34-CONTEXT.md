# Phase 34: Income Statement Testing - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify backend income statement computations with known-value test cases. The main gap is a multi-channel revenue aggregation test (3+ channels in a single test case). All other success criteria are already covered by existing tests from Phase 32 (Plan 32-03). This phase fills the gap, runs verification, and documents the audit trail.

</domain>

<decisions>
## Implementation Decisions

### Multi-channel test design
- Combine gobiz + consignment + internal in a single test case (covers all 3 deduction types: platform commissions, revShare, customer discounts)
- Assert cross-channel totals (totalGross, totalDeductions, netRevenue, totalCogs, grossProfit) are correct sums across channels
- Verify channels are sorted by gross revenue descending
- All 3 channels have BOM-linked products (no unmapped products in this test — dedicated unmapped test already exists)
- No delta comparison in multi-channel test (tested separately in existing delta test)

### Test scope boundaries
- Fill the multi-channel gap + verify all 4 success criteria are met — no scope expansion
- Backend only — no frontend E2E tests (Phase 33 UAT passed 11/11)
- Create an audit trail mapping each success criterion to the specific test(s) that cover it

### Test data realism
- Use simplified round numbers (IDR 10,000, 20,000, etc.) for easy mental math when reading assertions
- Reuse existing helper functions (seedExternalRevenue, seedRevenueItem, seedMenuProductWithBOM) — no new helpers needed
- Include realistic consignment fixture with consignmentOutlet (revSharePercent) and settlement (linkedRevenueId) to exercise the revShare deduction pathway

### Additional edge cases
- No additional edge cases beyond success criteria — existing 17 tests cover required scenarios
- Stick to the 4 success criteria to avoid scope creep in a verification phase

### Documentation
- Update CHANGELOG.md with new test + final test count
- Update ROADMAP.md to mark Phase 34 complete

### Claude's Discretion
- Exact test variable naming and assertion ordering
- Whether to add inline comments explaining the math in the multi-channel test
- How to format the criteria-to-test audit trail (in plan summary, verification doc, or both)

</decisions>

<specifics>
## Specific Ideas

- The multi-channel test should make the math easy to follow: e.g., gobiz gross 100K with 10K commission, consignment 50K with 10K revShare, internal 80K with 15K discount. Totals should be obvious when scanning the test.
- Consignment fixture should follow the existing pattern from the `consignment settlement included with revShare deduction` test — outlet + settlement + linkedRevenueId.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `seedExternalRevenue()`: Seeds externalRevenue records with configurable source, amounts, dates
- `seedRevenueItem()`: Seeds externalRevenueItems with linkedMenuProductId support
- `seedMenuProductWithBOM()`: Creates menu product + componentTypes + menuProductComponents in one call
- Existing consignment fixture pattern (test line 389-471): outlet + settlement + linkedRevenueId + revenue items

### Established Patterns
- Tests use `convex-test` with `convexTest(schema)` for each test (isolated state)
- `TEST_WEEK_START` constant: Monday 2026-01-05 00:00 WIB = Sunday 2026-01-04 17:00 UTC
- Assertions follow the pattern: seed data, call query, assert specific fields
- All integration tests are in `describe("getWeeklyIncomeStatement", ...)` block

### Integration Points
- `tests/convex/incomeStatement.test.ts` — add multi-channel test to existing describe block
- `tests/convex/costCalculator.test.ts` — 6 buildProductCOGSMap tests + 4 calculateWeekRange tests (no changes needed)
- `convex/reports/incomeStatement.ts` — the query under test (no changes needed)

### Current Test Count
- 39 test files, 683 tests passing
- Income statement: 11 integration tests + 10 unit tests = 21 income statement tests

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 34-income-statement-testing*
*Context gathered: 2026-03-02*
