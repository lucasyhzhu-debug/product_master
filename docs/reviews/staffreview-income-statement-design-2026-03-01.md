# Staff Review: Income Statement Feature Design

**Date:** 2026-03-01
**Plan:** `docs/plans/2026-03-01-income-statement-design.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 1. Summary

**Overall Assessment:** Revise

The design document demonstrates excellent domain analysis — the data source mapping, COGS resolution strategy, and confidence classification system are well thought out. However, this is a **design document, not an implementation plan**. It is missing 3 of the 4 CLAUDE.md-mandatory sections (Git Workflow, Implementation Waves, Documentation Updates). The plan also has no testing strategy, underestimates the query complexity of real-time BOM COGS resolution across all channels, and references a function (`estimateBallsFromName`) that does not exist in the codebase.

**Scorecard:**
- **Critical Issues:** 5
- **Improvements:** 5
- **Refinements:** 4

---

## 2. Critical Issues (Must Fix)

Issues that would cause implementation failure or serious bugs.

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | `estimateBallsFromName()` does not exist | Logic/Reference | Section 3 COGS Resolution, Section 4 Step 6 |
| 2 | Query reads entire `externalRevenueItems` + `menuProductComponents` + `componentTypes` tables | Performance | Section 4 Step 6 |
| 3 | Missing mandatory plan sections (Git Workflow, Waves, Docs) | Plan Structure | Entire document |
| 4 | No testing plan at all | Testing | Missing |
| 5 | Consignment period filtering has no date field on settlements | Logic | Section 4 Step 3 |

**Details:**

### Issue 1: `estimateBallsFromName()` does not exist

The plan references `estimateBallsFromName()` in both the COGS Resolution table (Section 3) and the computation steps (Section 4 Step 6) as a fallback for unmapped products. **This function does not exist anywhere in the codebase.**

Grep for `estimateBalls`, `estimateBallsFromName`, and related patterns yields zero results. The CLAUDE.md mentions it but it was never implemented — the lifetime totals query (`getLifetimeTotalsInternal`) uses `avgRevenuePerBall` as a revenue-based estimation instead, not a name-based ball count estimator.

**Recommendation:** Either:
- (a) Implement `estimateBallsFromName()` as part of this feature (adds scope), or
- (b) Use the existing `avgRevenuePerBall` pattern: for unmapped items, estimate COGS as `(revenue / avgRevenuePerBall) * avgCOGSPerBall`, or
- (c) Report unmapped items with `confidence: "missing"` and zero COGS (simplest, most honest)

Recommended: Option (c) for the initial release — unmapped items show revenue but no COGS, flagged in the data quality panel. This is honest and avoids inventing unreliable estimates.

### Issue 2: N+1 / Full-Table-Scan Performance in COGS Resolution

The plan's Step 6 requires: "For COGS: resolve via `linkedMenuProductId` -> BOM". This means for EVERY `externalRevenue` record (or `externalRevenueItems` record) with a `linkedMenuProductId`, the query must:
1. Look up `menuProductComponents` for that product
2. Look up `componentTypes.unitCostIdr` for each component
3. Sum production + packaging COGS

At weekly scale this could be 100-500+ revenue items. The naive approach would be N+1 queries. The existing `getLifetimeTotalsInternal` handles this by loading ALL `menuProductComponents` and `componentTypes` upfront into memory maps, but that scans the entire tables.

**Recommendation:** Follow the `getLifetimeTotalsInternal` pattern: preload `menuProductComponents` and `componentTypes` into in-memory maps at the start of the query, then do lookups from the maps. This is a single pass O(n) approach. Document this pattern explicitly in the plan so the implementer doesn't create N+1 lookups.

### Issue 3: Missing Mandatory Plan Sections

Per CLAUDE.md "Planning Requirements," every implementation plan MUST have:
1. ✅ (Partial) Success Criteria — exists but incomplete
2. ❌ **Git Workflow** — no branch name, no checkpoint strategy
3. ❌ **Implementation Waves** — no agents assigned, no PARALLEL/SEQUENTIAL marking
4. ❌ **Documentation Updates** — no CHANGELOG checkbox

**Recommendation:** See Section 6 (Plan Structure Additions) below for the missing sections.

### Issue 4: No Testing Plan

The plan has zero testing strategy. Section 8 "Success Criteria" only lists build/type-check requirements plus feature acceptance. There are no:
- Backend tests for the new `getWeeklyIncomeStatement` query
- Tests for BOM COGS resolution correctness
- Tests for edge cases (empty week, single channel, all channels missing COGS)
- Financial calculation accuracy tests with known expected outputs

For a **financial feature**, calculation correctness tests are not optional — they are critical.

**Recommendation:** See Section 10 (Testing Plan Assessment) below for required tests.

### Issue 5: Consignment Period Filtering Assumption

The plan states: "Fetch `consignmentSettlements` in range (filter by periodStart/periodEnd overlap)."

The schema confirms `consignmentSettlements` has `periodStart` and `periodEnd` fields with a `by_period` index on `periodStart`. However, settlements may span multiple weeks (e.g., a monthly settlement period). The plan doesn't specify the overlap logic: should a settlement that spans Feb 15 - Mar 15 be included in the Feb 24 - Mar 2 week? If so, how should the revenue be prorated?

**Recommendation:** Clarify the overlap rule:
- **Option A (simple):** Include the full settlement amount in the week containing `periodStart`. This may double-count across weeks for multi-week settlements.
- **Option B (prorated):** Prorate the settlement amount proportionally across the weeks it spans. More accurate but more complex.
- **Option C (match only):** Only include settlements where `periodStart` falls within the target week. Simple and deterministic, but misses settlements that start in prior weeks but overlap.

Recommended: Option C for initial release (simplest, no proration complexity). Document the limitation.

---

## 3. Improvements (Recommended)

Changes that would significantly improve the implementation.

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Reuse `getDashboardSummaryByPeriodInternal` aggregation logic | High | Medium |
| 2 | Use existing `periodRange.ts` for week calculation | High | Low |
| 3 | Separate COGS computation into a reusable internal helper | High | Medium |
| 4 | Add `internalQuery` variant for the income statement | Medium | Low |
| 5 | Specify the BigSeller fee aggregation source | Medium | Low |

**Details:**

### Improvement 1: Reuse `getDashboardSummaryByPeriodInternal` Aggregation

The existing `getDashboardSummaryByPeriodInternal` (line 495 of `convex/externalData/queries.ts`) already does 80% of what the income statement revenue section needs:
- Fetches `externalRevenue` by period range
- Handles internal order discount correction via `fetchInternalOrderDataMap`
- Aggregates by channel with gross, net, commission, adBurn, promoBurn
- Computes delta vs previous period

Rather than writing a new query from scratch, the income statement query should either:
- Call the internal query directly and layer COGS on top, or
- Extract the revenue aggregation into a shared helper and use it in both places

This avoids duplicating ~150 lines of revenue aggregation logic.

### Improvement 2: Use Existing `periodRange.ts`

The plan specifies `{ weekStart: number }` as the query arg. The project already has `convex/lib/periodRange.ts` with `calculatePeriodRange()` supporting `"thisWeek"` preset (Monday start, WIB timezone). Consider using or extending this utility rather than implementing custom week range logic.

However, `periodRange.ts` doesn't currently support arbitrary week navigation (prev/next week). You'll need to either:
- Add a `"week"` preset with a `weekStart` parameter, or
- Compute the week range in the query handler using the same WIB logic

### Improvement 3: Extract COGS Resolution as Reusable Helper

The BOM -> COGS resolution pattern (preload components/types, build maps, resolve per-product) will be needed in:
- This income statement query
- Future product-level P&L drill-downs
- Potentially in `getDashboardSummaryByPeriodInternal` if it ever needs COGS

Extract it as a pure helper function in `convex/lib/costCalculator.ts`:
```typescript
export function resolveProductCOGS(
  productId: string,
  bomComponents: Doc<"menuProductComponents">[],
  componentTypes: Doc<"componentTypes">[]
): { production: number; packaging: number; total: number } | null
```

This fits the existing `calculateMenuProductCOGS` pattern in that file.

### Improvement 4: Use `internalQuery` for the Income Statement

The design specifies a regular `query`, but this is a heavyweight aggregation reading 7+ tables. Consider making it an `internalQuery` called from an `action` that caches or rate-limits. However, since this is a read-only dashboard page, a regular `query` with reactive updates is actually fine — it will re-execute on any underlying data change, which is the desired behavior.

On reflection, keep it as a `query`. But note that **if** you also add a `getIncomeStatementGapAnalysis` as a separate query (as the plan suggests), the same tables will be scanned twice. Consider combining them into a single query that returns both the P&L and the gap analysis.

### Improvement 5: BigSeller Fee Source Clarification

The plan's deductions section says "Seller Shipping Fees <- bigsellerOrders fee fields." But the current revenue sync already stores `commission` on `externalRevenue`. The question is: should the income statement read detailed fees from `bigsellerOrders` directly (sellerShippingFee, otherFee, etc.), or use the already-summarized `externalRevenue.commission`?

**Recommendation:** Use `externalRevenue.commission` for the P&L (consistent with all channels). Add a separate drill-down for BigSeller fee breakdown if needed later. Don't mix data source granularity in the top-level P&L.

The exception is `sellerShippingFee` — this is NOT included in `externalRevenue.commission`. It's a separate cost. You'll need to either:
- Include it in `externalRevenue` during sync (preferred — normalize at ingest time)
- Or query `bigsellerOrders` separately for shipping fees (adds complexity)

---

## 4. Refinements (Minor Suggestions)

- The UI mockup shows amounts in "K" format (e.g., "12,450K"). In Indonesian business context, the standard abbreviation is "Jt" (Juta = million) for millions and "Rb" (Ribu) for thousands. Consider using `formatCurrency` from `src/lib/utils.ts` which already handles IDR formatting.
- The "Week starts Monday" decision should account for Indonesia where Monday is standard — confirmed correct. But ensure the `periodRange.ts` week calculation uses Monday (it currently does for `"thisWeek"` — verify this handles arbitrary week navigation).
- The CSV export format description is vague. Specify whether it should be a pivot table (channels as columns) or a flat list (one row per line item). The flat list is more flexible for external analysis.
- Consider adding a "print-friendly" view mode that hides the navigation and gap analysis panel for reports that need to be shared with partners or accountants.

---

## 5. Duplication Analysis

### Existing Code to Leverage

| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `getDashboardSummaryByPeriodInternal` | `convex/externalData/queries.ts:495` | Base revenue aggregation logic (channels, internal discount correction) |
| `fetchInternalOrderDataMap` | `convex/externalData/queries.ts:19` | Internal order discount/delivery lookup pattern |
| `calculateMenuProductCOGS` | `convex/lib/costCalculator.ts:101` | Per-product BOM COGS calculation |
| `getLifetimeTotalsInternal` | `convex/externalData/queries.ts:1762` | BOM preloading + in-memory map pattern |
| `calculatePeriodRange` | `convex/lib/periodRange.ts:56` | Period range calculation with WIB timezone |
| `sourceToPlatform` | `convex/externalData/queries.ts` | Source -> display name mapping |
| `getPlatformPalette` | `src/lib/platformColors.ts` | Channel color system for UI |
| `formatCurrency` | `src/lib/utils.ts` | IDR formatting |
| `GrowthIndicator` component | `src/components/salesAnalytics/OverviewTab.tsx:74` | Delta % indicator UI |

### Potential Duplication Risks

- **Revenue aggregation logic:** If the income statement re-implements channel aggregation instead of reusing `getDashboardSummaryByPeriodInternal`, you'll have two copies of the same logic that must be kept in sync.
- **BOM resolution maps:** The `getLifetimeTotalsInternal` query builds `menuProductBallCount` from BOM. The income statement needs a similar map but for COGS not just ball counts. Extract the BOM preloading into a shared helper.
- **Period navigation UI:** The `OverviewTab` already has period preset buttons. The income statement has prev/next week navigation. These are different patterns — no duplication risk.

---

## 6. Plan Structure Additions

The following mandatory sections are missing from the design document and must be added before implementation:

### Git Workflow (ADDED)

```markdown
## Git Workflow
**Branch:** `feature/income-statement`
**Base:** `main` (merge current `fix/sales-analytics-ball-estimate` first)
**Checkpoints:**
1. After backend query implementation -> commit
2. After frontend page + hook -> commit
3. After CSV export -> commit
4. After tests -> commit
5. Final build verification -> merge to main

**Pre-merge:**
- `npm run test` passes
- `npm run build` passes
```

### Implementation Waves (ADDED)

```markdown
## Implementation Waves

### Wave 1: Backend [SEQUENTIAL]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Extract shared BOM COGS resolver helper | `convex/lib/costCalculator.ts` |
| convex-backend | Implement `getWeeklyIncomeStatement` query | `convex/reports/incomeStatement.ts` |
| convex-backend | Implement week range calculation for arbitrary weeks | `convex/lib/periodRange.ts` (extend or inline) |

### Wave 2: Frontend [PARALLEL, after Wave 1]
| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | Create FinancialStatement page with P&L layout | `src/pages/FinancialStatement.tsx` |
| react-ui-builder | Create useFinancials hook with week navigation state | `src/hooks/convex/useFinancials.ts` |
| react-ui-builder | Add route + nav entry | `src/App.tsx` |
| react-ui-builder | Implement CSV export function | Inside page or `src/lib/csvExport.ts` |

### Wave 3: Testing [SEQUENTIAL, after Wave 2]
| Agent | Task | Files |
|-------|------|-------|
| tdd-test-architect | Backend tests for income statement query | `tests/convex/incomeStatement.test.ts` |
| code-auditor | Type check + pattern compliance | -- |
| Bash | `npm run test && npm run build` | -- |
```

### Documentation Updates (ADDED)

```markdown
## Documentation Updates
- [ ] CHANGELOG.md — New "Income Statement" feature entry
- [ ] API_REFERENCE.md — New `reports.incomeStatement` query docs
- [ ] ROADMAP.md — Mark income statement as implemented, note OpEx/EBIT as future
```

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| BOM COGS resolver helper | `convex-backend` | Pure function in costCalculator.ts |
| Income statement query | `convex-backend` | Complex Convex query with multiple table joins |
| Period range extension | `convex-backend` | Small addition to existing utility |
| Page + hook + route | `react-ui-builder` | Standard page with shadcn/ui components |
| CSV export | `react-ui-builder` | Frontend-only utility |
| Backend tests | `tdd-test-architect` | Financial calculation tests need known-value cases |
| Code audit | `code-auditor` | Type check + pattern compliance |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | ❌ Missing (added in Section 6) |
| Branch naming convention | ❌ Missing (added: `feature/income-statement`) |
| Merge strategy documented | ❌ Missing (added) |

### Commit Strategy
| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| Backend COGS helper | 1 | feat | Reusable helper in costCalculator.ts |
| Income statement query | 1 | feat | Core query logic |
| Frontend page + hook | 1 | feat | Page, hook, route |
| CSV export | 1 | feat | Could merge with page commit |
| Tests | 1 | test | Backend calculation tests |
| Docs | 1 | docs | CHANGELOG + API_REFERENCE |

### Recommended Commit Checkpoints
1. `feat: add BOM COGS resolver helper to costCalculator`
2. `feat: implement weekly income statement query`
3. `feat: add Income Statement page with week navigation`
4. `feat: add CSV export for income statement`
5. `test: add income statement query tests`
6. `docs: update CHANGELOG and API_REFERENCE`

### Pre-Push Verification
- [ ] Plan includes `npm run build` check ✅
- [ ] Plan includes `npm run type-check` verification ✅
- [ ] Plan includes local testing before push ❌ (no test execution checkpoint specified)

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | ❌ Missing — no schema changes, so standard revert is safe |
| Deployment order | ✅ Safe — no new tables, query-only changes |
| Data backup needed | No — read-only feature, no data mutations |
| Migration safety | ✅ N/A — no schema changes |

### Git Workflow Issues Found
- No branch creation step at the start
- No mention of current branch (`fix/sales-analytics-ball-estimate`) needing merge first
- No commit checkpoints defined
- Missing CHANGELOG.md update requirement

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| After Wave 1 (Backend) | `docs/API_REFERENCE.md` — new query signature |
| After Wave 3 (Verification) | `docs/CHANGELOG.md` — feature entry |
| If periodRange.ts extended | `docs/CODE_STYLE.md` — if new pattern introduced |

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-03-XX - Income Statement (Revenue -> Gross Profit)

**Weekly income statement with per-channel breakdown and BOM-resolved COGS**

- Added `/financials` page with weekly P&L view (Revenue -> COGS -> Gross Profit)
- Full BOM COGS resolution (production + packaging) across all 7 channels
- Per-channel revenue breakdown with data confidence indicators
- Previous week comparison with delta amounts and percentages
- Data quality panel showing unmapped products, missing channels, and COGS gaps
- CSV export with all line items and confidence flags
- Consignment settlements integrated into unified P&L view

**Files Added:**
- `convex/reports/incomeStatement.ts` — Income statement query
- `src/pages/FinancialStatement.tsx` — Income statement page
- `src/hooks/convex/useFinancials.ts` — Financial data hook
- `tests/convex/incomeStatement.test.ts` — Backend tests

**Files Modified:**
- `convex/lib/costCalculator.ts` — Shared BOM COGS resolver
- `src/App.tsx` — New route `/financials`
- `src/hooks/convex/index.ts` — Export new hook
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** Missing

The design document has **zero testing strategy**. For a financial reporting feature, this is Critical.

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | BOM COGS resolution accuracy | Financial calculations must be verified with known inputs/outputs | `convex-test` with seeded BOM data: 1 BIG_BALL (Rp 19,231) + 1 box (Rp 1,500) = expected total |
| 2 | Revenue aggregation by channel | Must match existing `getDashboardSummaryByPeriodInternal` output | `convex-test` with seeded `externalRevenue` records across 3+ channels |
| 3 | Internal order discount correction | The `fetchInternalOrderDataMap` pattern is complex | Test with orders that have discounts and delivery fees |
| 4 | Empty week handling | Must not crash, should return zero values | Test with a week range that has no records |
| 5 | Unmapped product handling | Items without `linkedMenuProductId` should show `confidence: "missing"` | Test with a mix of mapped and unmapped revenue items |
| 6 | Consignment integration | Revenue and rev share must aggregate correctly | Test with consignment settlements that overlap the target week |
| 7 | Week boundary correctness (WIB timezone) | Mon 00:00 WIB != Mon 00:00 UTC | Test with records at WIB midnight boundary |

### Test Execution Checkpoints
1. After backend implementation: `npm run test` (all existing + new backend tests pass)
2. After frontend implementation: `npm run test` (all tests pass)
3. Before merge: Full `npm run test && npm run build` verification

### Regression Risk
- Existing `getDashboardSummaryByPeriodInternal` tests may be affected if shared logic is extracted
- No existing tests reference `reports/` directory, so no direct regression risk from new files
- Adding a new page route to `App.tsx` could affect route ordering — smoke test navigation

---

## 11. Edge Cases to Address

The plan should explicitly handle:

- [ ] **Week with zero transactions across all channels** — should display zeros, not error
- [ ] **Channel with revenue but no BOM-linked products** — all COGS shows as "missing" for that channel
- [ ] **Deleted orders that are referenced by `externalRevenue` records** — the `fetchInternalOrderDataMap` fallback handles this, but verify
- [ ] **Consignment settlements spanning multiple weeks** — how to attribute (see Critical Issue 5)
- [ ] **Products where `componentTypes.unitCostIdr` is 0 or null** — should flag in gap analysis
- [ ] **Week navigation beyond available data** — what does "no data" look like for very old weeks?
- [ ] **Concurrent data changes during render** — Convex handles this via reactive queries, but verify large aggregations don't cause flickering
- [ ] **Division by zero in margin calculation** — when net revenue = 0, margin % should show "N/A" not NaN
- [ ] **Negative deductions exceeding revenue** — what if commissions + fees > gross revenue for a channel?

---

## 12. Approval Conditions

**For Approval, address:**
1. Remove `estimateBallsFromName()` reference — replace with `confidence: "missing"` for unmapped items
2. Add the 3 missing mandatory plan sections (Git Workflow, Waves, Docs) — drafts provided above
3. Add a testing plan with financial calculation accuracy tests
4. Clarify consignment settlement period overlap logic
5. Document the BOM preloading strategy to prevent N+1 queries

**Recommended before implementation:**
1. Merge or resolve current `fix/sales-analytics-ball-estimate` branch before creating feature branch
2. Extract shared revenue aggregation logic from `getDashboardSummaryByPeriodInternal` to avoid duplication
3. Clarify BigSeller `sellerShippingFee` data source (externalRevenue vs bigsellerOrders direct query)
4. Specify CSV format (pivot vs flat)
5. Combine `getWeeklyIncomeStatement` and `getIncomeStatementGapAnalysis` into a single query

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
