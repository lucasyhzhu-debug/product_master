# Staff Review: Phase 32 — Income Statement Backend (Post-Implementation)

**Date:** 2026-03-02
**Scope:** Plans 32-01, 32-02, 32-03 vs. actual implementation
**Design Doc:** `docs/plans/2026-03-01-income-statement-design.md`
**Prior Review:** `docs/reviews/staffreview-income-statement-design-2026-03-01.md` (design-level)
**Phase Review:** `docs/reviews/staffreview-phase-32-income-statement-backend-2026-03-02.md` (plan-level, pre-implementation)
**Verification Report:** `.planning/phases/32-income-statement-backend/32-VERIFICATION.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 1. Summary

**Overall Assessment:** Approve

Phase 32 is a strong implementation. The code faithfully follows the three plans, addresses all four critical issues from the prior plan-level staffreview, matches the design doc's architecture, and ships with 18 tests (10 unit + 8 integration). The income statement query is 643 lines of well-structured code with a clear separation between I/O (handler) and computation (pure `aggregateWeek`). Financial calculations are correct and edge cases are handled.

There are no blocking issues. The findings below are architectural observations and minor improvements for future phases.

**Scorecard:**
- **Critical Issues:** 0
- **Improvements:** 4
- **Refinements:** 6

---

## 2. Plan-to-Implementation Fidelity

### Plan 32-01: BOM COGS Resolver & Week Range Helper

| Plan Requirement | Implementation | Verdict |
|------------------|----------------|---------|
| `buildProductCOGSMap` exported from `convex/lib/costCalculator.ts` | Exported at line 148 | MATCH |
| Signature: `(bomComponents[], componentTypes[]) -> Map` | Exact match (lines 148-158) | MATCH |
| Step 1: Build componentTypeMap from `_id` | Lines 161-170 | MATCH |
| Step 2: Single-pass `for...of` over bomComponents | Lines 178-197 | MATCH |
| Category logic: `"production"` vs everything else = packaging | Line 190: `if (ct.category === "production")` else packaging | MATCH |
| Skip unknown componentTypeIds silently | Line 180: `if (!ct) continue;` | MATCH |
| Known-value verification: `{ production: 19231, packaging: 1700, total: 20931 }` | Test at `costCalculator.test.ts:30-34` confirms exact values | MATCH |
| `calculateWeekRange` exported from `convex/lib/periodRange.ts` | Exported at line 149 | MATCH |
| Returns `{ currentStart, currentEnd, previousStart, previousEnd }` | Lines 149-161 | MATCH |
| `WEEK_MS` constant | Line 135 | MATCH |
| Do NOT export `getWibComponents` or `wibMidnightToUtc` | Neither exported (remain private functions) | MATCH |

**Fidelity: 11/11 — Perfect match.**

### Plan 32-02: Weekly Income Statement Query

| Plan Requirement | Implementation | Verdict |
|------------------|----------------|---------|
| File: `convex/reports/incomeStatement.ts` | Created, 643 lines | MATCH |
| Export `fetchInternalOrderDataMap` from `convex/externalData/queries.ts` | Line 19: `export async function fetchInternalOrderDataMap(` | MATCH |
| Query name: `getWeeklyIncomeStatement` | Exported at line 481 | MATCH |
| Args: `{ weekStart: v.number() }` | Line 483 | MATCH |
| Step 1: `calculateWeekRange(args.weekStart)` | Line 487 | MATCH |
| Step 2: Parallel data fetching (6-way `Promise.all`) | Lines 491-534 | MATCH |
| Step 2 Phase 2: Fetch revenue items for both periods | Lines 537-568 | MATCH |
| Step 2 Phase 3: `fetchInternalOrderDataMap` for both weeks | Lines 571-574 | MATCH |
| Step 3: Build COGS map via `buildProductCOGSMap` | Lines 577-588 | MATCH |
| Step 4: `aggregateWeek` is PURE (no `ctx`, no `async`) | Line 116: `function aggregateWeek(` — no `ctx`, not `async` | MATCH |
| Step 4a: Internal channel discount = `totalAmount - (finalTotal - deliveryFee)` | Lines 175-177 | MATCH |
| Step 4a: Platform channels use `?? 0` for optional fields | Lines 187-190 | MATCH |
| Step 4a: Consignment: gross = `totalRevenue`, deduction = `revShareAmount` | Lines 292-293 | MATCH |
| Step 4b: COGS via `cogsMap.get(linkedMenuProductId)` | Lines 209-210 | MATCH |
| Step 4b: Unmapped items: COGS = 0, confidence = "missing" | Lines 219-222 | MATCH |
| Step 4c: Consignment COGS via `linkedRevenueId` | Lines 297-343 | MATCH |
| Step 4d: Gap analysis (unmapped, zero-cost, missing channels) | Lines 372-414 | MATCH |
| Step 4e: Totals via `reduce` | Lines 418-445 | MATCH |
| Step 4e: `grossMarginPercent = null` when `netRevenue === 0` | Lines 444-445 | MATCH |
| Step 5: Both weeks aggregated synchronously (no `Promise.all`) | Lines 591-606 | MATCH |
| Step 6: `computeDelta` helper | Lines 87-94 | MATCH |
| Step 6: `grossMarginPp` as percentage point difference | Lines 626-630 | MATCH |
| Step 7: Return structure with `weekStart`, `weekEnd`, `current`, `previous`, `deltas`, `gapAnalysis` | Lines 634-641 | MATCH |
| `ChannelData` interface matches plan | Lines 35-53 | MATCH |
| `GapAnalysis` interface matches plan | Lines 55-65 | MATCH |
| Delivery fees excluded from P&L | Internal: discount calculation excludes `deliveryFee` (line 177). No `deliveryFee` field in `ChannelData`. | MATCH |
| Confidence assignment: `getChannelRevenueConfidence` | Lines 98-112 | MATCH |
| Channel confidence = lowest of revenue + product confidences | Lines 258-264 via `lowestConfidence()` | MATCH |

**Fidelity: 28/28 — Perfect match.**

### Plan 32-03: Verification, Testing & Documentation

| Plan Requirement | Implementation | Verdict |
|------------------|----------------|---------|
| `npm run type-check` passes | Verification report confirms | MATCH |
| `npm run build` passes | Verification report confirms | MATCH |
| 6 unit tests for `buildProductCOGSMap` + `calculateWeekRange` | `costCalculator.test.ts`: 6 `buildProductCOGSMap` + 4 `calculateWeekRange` = 10 tests | EXCEEDS |
| Integration tests for income statement (5 specified) | `incomeStatement.test.ts`: 8 tests | EXCEEDS |
| CHANGELOG entry | Lines 17-30 of `docs/CHANGELOG.md` | MATCH |
| API_REFERENCE entry | Lines 1542-1611 of `docs/API_REFERENCE.md` | MATCH |

**Fidelity: 6/6 — Exceeds plan in test coverage (18 tests vs 11 planned).**

---

## 3. Design Doc Compliance

The design doc (`docs/plans/2026-03-01-income-statement-design.md`) specified the following key architecture decisions. Here is how the implementation maps:

| Design Doc Decision | Section | Implementation | Status |
|---------------------|---------|----------------|--------|
| Real-time query aggregation (no snapshot tables) | Section 2 | `query()` at line 481, not `internalQuery` or `action` | COMPLIANT |
| No new schema tables | Section 5 | No schema changes in Phase 32 | COMPLIANT |
| BOM preloading strategy (prevents N+1) | Section 5 | `menuProductComponents.collect()` + `componentTypes.collect()` at lines 532-533, then `buildProductCOGSMap` builds O(1) lookup map | COMPLIANT |
| Reusable COGS resolver in `costCalculator.ts` | Section 5 | `buildProductCOGSMap` at line 148 | COMPLIANT |
| Revenue from `externalRevenue` + `consignmentSettlements` | Section 4 | Lines 500-533 (parallel fetch) | COMPLIANT |
| Internal discount = `totalAmount - (finalTotal - deliveryFee)` | Section 4 | Line 175-177 | COMPLIANT |
| Consignment: `totalRevenue` as gross, `revShareAmount` as deduction | Section 4 | Lines 292-293 | COMPLIANT |
| Week starts Monday (WIB) | Section 8 Decision 6 | `calculateWeekRange` accepts Monday 00:00 WIB epoch ms | COMPLIANT |
| Unmapped items = honest zero COGS | Section 8 Decision 7 | Lines 219-222: `{ production: 0, packaging: 0, total: 0 }`, confidence "missing" | COMPLIANT |
| Confidence classification on every figure | Section 4 | `Confidence` type at line 24, applied per-product (line 221) and per-channel (line 262) | COMPLIANT |
| Gap analysis inline (not separate query) | Section 8 Decision 5 | `gapAnalysis` is part of `WeekData` return (line 462), returned at line 640 | COMPLIANT |
| Consignment period matching = `periodStart`-in-week | Section 8 Decision 9 | Lines 516-522: `by_period` index with `gte/lt` on `periodStart` | COMPLIANT |
| BOM preloading into in-memory maps | Section 8 Decision 10 | Lines 532-533 preload, lines 577-588 build map | COMPLIANT |

**Design doc specifically said to reuse `getDashboardSummaryByPeriodInternal`:** Section 5 states "The income statement query should **call this internal query** for the revenue section." The implementation does NOT call `getDashboardSummaryByPeriodInternal` — it re-implements revenue aggregation from scratch. However, this was an intentional and correct deviation:

1. `getDashboardSummaryByPeriodInternal` is an `internalQuery` that only accepts `PeriodPreset` (e.g., `"thisWeek"`), not arbitrary epoch ms ranges.
2. It does not include consignment revenue.
3. It does not return per-product line items needed for COGS resolution.
4. The plan-level staffreview (prior review) acknowledged this at Section 5: "Revenue aggregation logic — Plan 32.2 implements per-channel aggregation from scratch. This is intentional — the existing `getDashboardSummaryByPeriodInternal` is an `internalQuery` that only accepts `PeriodPreset`, not arbitrary date ranges. The new code is parallel, not duplicated."

The deviation is justified. The income statement query's revenue aggregation logic follows the same **pattern** as `getDashboardSummaryByPeriodInternal` (group by source, internal discount correction, platform aggregation with `?? 0`) but extends it with per-item COGS resolution and consignment handling.

**Design Doc Compliance: 13/13 decisions honored, 1 justified deviation.**

---

## 4. Prior Staffreview Recommendations Addressed

The design-level staffreview (`staffreview-income-statement-design-2026-03-01.md`) raised 5 critical issues and 5 improvements. The plan-level staffreview raised 4 critical issues. Here is how each was handled:

### Design-Level Staffreview (5 Critical Issues)

| # | Issue | Resolution | Status |
|---|-------|------------|--------|
| 1 | `estimateBallsFromName()` does not exist | Removed entirely. Unmapped items get `confidence: "missing"` and zero COGS (Option C, as recommended). | ADDRESSED |
| 2 | N+1 / full-table-scan in COGS resolution | BOM preloaded into in-memory maps at query start (lines 532-533), then `buildProductCOGSMap` builds O(1) lookup. Follows `getLifetimeTotalsInternal` pattern exactly. | ADDRESSED |
| 3 | Missing mandatory plan sections (Git, Waves, Docs) | All three plans have proper Git Workflow, Implementation Waves, Documentation Updates, and Success Criteria sections. | ADDRESSED |
| 4 | No testing plan | Plan 32-03 includes detailed test specifications with known-value assertions. Implementation delivers 18 tests. | ADDRESSED |
| 5 | Consignment period filtering logic unclear | Explicitly uses `periodStart`-in-week (Option C as recommended). Indexed query with `by_period` (lines 516-529). | ADDRESSED |

### Design-Level Staffreview (5 Improvements)

| # | Improvement | Resolution | Status |
|---|-------------|------------|--------|
| 1 | Reuse `getDashboardSummaryByPeriodInternal` | Intentionally not reused (see Section 3 above). Revenue aggregation re-implemented with same patterns but extended for COGS/consignment. Justified deviation. | CONSIDERED |
| 2 | Use existing `periodRange.ts` for week calculation | `calculateWeekRange` added to `periodRange.ts` as recommended (line 149). Leverages same module without disturbing existing `calculatePeriodRange`. | ADDRESSED |
| 3 | Separate COGS computation as reusable helper | `buildProductCOGSMap` extracted to `convex/lib/costCalculator.ts` as recommended. Pure function, reusable. | ADDRESSED |
| 4 | Use `internalQuery` variant | Kept as regular `query` per reviewer's "on reflection, keep it as a `query`" conclusion. Correct for reactive dashboard use case. | ADDRESSED |
| 5 | Specify BigSeller fee aggregation source | Uses `externalRevenue.commission` consistently for all channels (lines 187-188). No direct `bigsellerOrders` query. Matches recommendation. | ADDRESSED |

### Plan-Level Staffreview (4 Critical Issues)

| # | Issue | Resolution | Status |
|---|-------|------------|--------|
| 1 | `aggregateWeek` embeds `ctx.db` reads but called concurrently | `aggregateWeek` is now a pure function (line 116, no `ctx`, no `async`). All `ctx.db` calls happen in handler lines 500-574. Called synchronously at lines 591-606. | FULLY ADDRESSED |
| 2 | `fetchInternalOrderDataMap` not exported | Exported at `convex/externalData/queries.ts:19`. Imported at `incomeStatement.ts:19`. One-word change. | FULLY ADDRESSED |
| 3 | No backend tests in Phase 32 | Plan 32-03 includes testing wave. 18 tests delivered (10 unit + 8 integration). | FULLY ADDRESSED |
| 4 | Optional fields used without null guards | All optional numeric fields use `?? 0`: `revenueGross` (lines 180, 187), `commission` (188), `adBurn` (189), `promoBurn` (190), `transactionCount` (164, 191). | FULLY ADDRESSED |

### Plan-Level Staffreview (Improvements)

| # | Improvement | Resolution | Status |
|---|-------------|------------|--------|
| 1 | Remove WIB helper exports from Plan 32.1 | Plan 32-01 explicitly says "Do NOT export `getWibComponents` or `wibMidnightToUtc`." Implementation complies. | ADDRESSED |
| 2 | Remove unnecessary `previousRange` variable | Not present in implementation — `range.previousStart`/`previousEnd` used directly (lines 510, 513, 525, 529). | ADDRESSED |
| 3 | Use `by_period` index for consignment settlements | Implementation uses `by_period` index for both current and previous consignment queries (lines 516-529). | ADDRESSED |
| 4 | Add `convex/externalData/queries.ts` to `files_modified` | Plan 32-02 frontmatter lists it in `files_modified`. | ADDRESSED |
| 5 | Remove `QueryCtx` import if `aggregateWeek` becomes pure | No `QueryCtx` import in `incomeStatement.ts` — only `query` and `Doc` imported from Convex. | ADDRESSED |

**All 9 critical issues and 10 improvements from both staffreviews were addressed.**

---

## 5. Architectural Analysis

### 5.1 Query Performance at Scale

The query makes the following database reads (worst case):

| Read | Pattern | Row Count (current scale) | Row Count (1 year) | Notes |
|------|---------|---------------------------|---------------------|-------|
| `externalRevenue` current week | Index `by_period` + filter | ~50-100 | ~50-100 | Per-week, bounded |
| `externalRevenue` previous week | Index `by_period` + filter | ~50-100 | ~50-100 | Per-week, bounded |
| `consignmentSettlements` current | Index `by_period` + filter | ~2-5 | ~2-5 | Very few per week |
| `consignmentSettlements` previous | Index `by_period` + filter | ~2-5 | ~2-5 | Very few per week |
| `menuProductComponents` | Full table scan | ~50 | ~100 | Small reference table |
| `componentTypes` | Full table scan | ~20 | ~30 | Small reference table |
| `externalRevenueItems` per revenue | Index `by_revenue` per ID | ~200-500 total | ~200-500 total | One query per revenue record |
| `orders` for internal discount | Index `by_order_number` per order | ~20-50 | ~20-50 | Via `fetchInternalOrderDataMap` |

**Assessment:** At current SME scale (100-500 transactions/week), this is well within Convex query limits. The `externalRevenueItems` fetch at lines 549-556 issues one indexed query per revenue record — this is the most parallelized read and could be ~100 concurrent `Promise.all` calls for a busy week. Convex handles this well for queries.

**Risk at scale:** If revenue records per week exceed ~500, the `Promise.all` for `externalRevenueItems` (line 549) becomes a large fan-out. At 1000 revenue records, that is 1000 concurrent index lookups. This is unlikely in the near term but worth monitoring.

**Mitigation (future):** If needed, batch the `externalRevenueItems` lookups or add a composite index. Not needed now.

### 5.2 Index Range Query Pattern

The `by_period` index queries at lines 500-529 use `.withIndex("by_period", q => q.gte("periodStart", start)).filter(q => q.lt(q.field("periodStart"), end))`. In Convex, the `.filter()` is a post-index filter — the index scan starts at `start` but reads forward until the table end, then filters in-memory.

For the **previous week** query (line 508-514), this means scanning from `previousStart` to the end of the table, not just to `previousEnd`. This is the same pattern used by `getDashboardSummaryByPeriodInternal` (line 524-526), so it is the established codebase convention. At current scale (~2000 total `externalRevenue` records), the over-read is negligible.

**Improvement for future:** Use `.withIndex("by_period", q => q.gte("periodStart", start).lt("periodStart", end))` to constrain the index range on both ends, eliminating the post-filter. This is a Convex API feature that could be used here. Not a bug — an optimization opportunity.

### 5.3 Correctness of Financial Logic

Verified each financial calculation path:

| Calculation | Code Location | Logic | Correctness |
|-------------|---------------|-------|-------------|
| Internal gross | Line 172 | `orderData.totalAmount` | Correct — pre-discount |
| Internal discount | Lines 175-177 | `totalAmount - (finalTotal - deliveryFee)` | Correct — isolates product discount from delivery |
| Platform gross | Line 187 | `rec.revenueGross ?? 0` | Correct — null-safe |
| Platform commission | Line 188 | `rec.commission ?? 0` | Correct — null-safe |
| Channel net | Lines 197-203 | `gross - discount - commission - adBurn - promoBurn` | Correct — all deductions subtracted |
| Consignment gross | Line 292 | `settlement.totalRevenue` | Correct |
| Consignment rev share | Line 293 | `settlement.revShareAmount` | Correct |
| Consignment net | Line 346 | `consignGross - consignRevShare` | Correct — equals `frolliePayment` |
| COGS per item | Lines 213-218 | `productCogs.production * item.quantity` | Correct — scales by sold quantity |
| Total COGS | Line 442 | `totalProductionCogs + totalPackagingCogs` | Correct |
| Gross profit | Line 443 | `netRevenue - totalCogs` | Correct |
| Gross margin % | Lines 444-445 | `(grossProfit / netRevenue) * 100` or `null` | Correct — null guard on zero |
| Delta amount | Line 91 | `current - previous` | Correct |
| Delta percent | Line 92 | `((current - previous) / previous) * 100` or `null` | Correct — null guard on zero denominator |
| Gross margin pp | Lines 626-630 | `currentMargin - previousMargin` or `null` | Correct — percentage point difference |

**One subtlety worth noting:** The `computeDelta` function (line 92) returns `percent: null` when `previous === 0`. This means a channel that goes from 0 to 100K shows no percentage change (null). This is the correct behavior — infinity percent is meaningless. The frontend should display this as "New" or "N/A" rather than a percentage.

### 5.4 Revenue Items for Consignment Settlements

The implementation has a smart enhancement not explicitly in the plan: at lines 543-547, it adds `linkedRevenueId` values from consignment settlements to the `allRevenueIds` array before fetching `externalRevenueItems`. This means consignment COGS can be resolved via `itemsMap.get(settlement.linkedRevenueId)` at line 299.

This is a correct and important addition — without it, consignment COGS would always be zero because the revenue items wouldn't be fetched. The plan mentioned this flow at Step 4c but didn't explicitly show the addition to `allRevenueIds` in Step 2.

### 5.5 Sorting Channels by Revenue

The implementation adds `channels.sort((a, b) => b.gross - a.gross)` at line 369. This was not in the plan but is a sensible UX improvement — channels are presented in descending revenue order so the most significant channels appear first in the frontend.

---

## 6. Improvements (Recommended)

### Improvement 1: Revenue Aggregation Duplication (Medium Priority)

The income statement query's internal order handling (lines 161-183) and platform channel handling (lines 184-194) duplicate logic from `getDashboardSummaryByPeriodInternal` (lines 538-614). Both implement:
- Group by source
- Internal: `fetchInternalOrderDataMap` -> `totalAmount` for gross, `totalAmount - (finalTotal - deliveryFee)` for discount
- Platform: `revenueGross ?? 0`, `commission ?? 0`, `adBurn ?? 0`, `promoBurn ?? 0`
- Net = gross - deductions

While the deviation from calling `getDashboardSummaryByPeriodInternal` directly is justified (Section 3), the two implementations should eventually be consolidated into a shared helper. If the revenue aggregation logic changes (e.g., a new deduction type), both must be updated.

**Recommendation:** In a future refactor phase, extract revenue aggregation into a shared pure function in `convex/lib/revenueAggregator.ts` that both the dashboard summary and income statement can call. Not blocking for Phase 32.

### Improvement 2: Convex Index Range Optimization (Low Priority)

As noted in Section 5.2, the `by_period` index queries use `.gte()` + `.filter(.lt())` instead of `.gte().lt()` within the index builder. The former scans the index from `start` to table end and post-filters; the latter constrains the index scan itself.

For the previous week query (line 508-514), this means scanning from `previousStart` through all future records, then discarding everything after `previousEnd`. With ~2000 records total, the extra read is ~1500 records per query — negligible now but grows linearly.

**Recommendation:** Update all `by_period` index queries to use chained bounds:
```typescript
.withIndex("by_period", q => q.gte("periodStart", start).lt("periodStart", end))
```
This applies to both `incomeStatement.ts` and `externalData/queries.ts`. Test that Convex supports this chaining pattern first.

### Improvement 3: Missing Test Coverage for Internal Discount Correction (Medium Priority)

The test suite covers empty weeks, unmapped products, known COGS, zero margin, negative net, zero-cost components, deltas, and quantity scaling — but does NOT test the internal order discount correction path. Specifically:

- No test seeds an `externalRevenue` record with `source: "internal"` and an `externalTransactionId` that maps to an order with `totalAmount != finalTotal`.
- The design doc's test case #3 ("Internal order discount correction: totalAmount=100K, finalTotal=85K, deliveryFee=5K -> Gross=100K, Discount=20K") is not implemented.

This is the most complex revenue path (it reads order data for correction) and is currently only verified by the `getDashboardSummaryByPeriodInternal` tests, not by the income statement tests.

**Recommendation:** Add an integration test that seeds an internal revenue record + order with known discount values, and verifies the income statement's per-channel breakdown for the "internal" source.

### Improvement 4: Missing Test Coverage for Consignment Settlement (Medium Priority)

The design doc's test case #6 ("Consignment settlement inclusion: only settlements with `periodStart` inside target week") is not implemented. No test verifies that:
- A settlement with `periodStart` inside the week IS included
- A settlement with `periodStart` outside the week is NOT included
- Consignment gross = `totalRevenue`, deduction = `revShareAmount`

**Recommendation:** Add an integration test that seeds two `consignmentSettlements` — one inside, one outside the target week — and verifies only the first is included in the P&L.

---

## 7. Refinements (Minor Suggestions)

### Refinement 1: `bigseller` Source Handling

The code comment at line 185 lists `bigseller` as a platform channel, but `sourceToPlatform("bigseller")` maps to "BigSeller" (line 1535 of `externalData/queries.ts`). The BigSeller source is actually an aggregator for Shopee/TikTok, not a separate sales channel. Revenue from BigSeller represents the same transactions already captured via Shopee/TikTok sources — potential double-counting risk.

**Assessment:** This is not a code bug — the sync system already handles deduplication at ingest time. But the income statement should document that `bigseller` source represents aggregated Shopee/TikTok data, not a separate channel, to avoid confusion in the frontend.

### Refinement 2: Channel Sorting Stability

Line 369: `channels.sort((a, b) => b.gross - a.gross)`. JavaScript's `Array.sort` is not guaranteed to be stable across engines for equal values. If two channels have identical gross revenue, their order may vary between renders, causing UI flickering.

**Recommendation:** Add a secondary sort key for stability: `channels.sort((a, b) => b.gross - a.gross || a.source.localeCompare(b.source))`.

### Refinement 3: `lowestConfidence` Function Placement

The `lowestConfidence` function (lines 475-477) is defined AFTER the `aggregateWeek` function that calls it (line 263). JavaScript hoists function declarations, so this works, but placing a utility function after its only consumer harms readability.

**Recommendation:** Move `lowestConfidence` and `CONFIDENCE_RANK` above `aggregateWeek` (e.g., after `getChannelRevenueConfidence` at line 112).

### Refinement 4: Test Data Realism

The integration tests use synthetic IDs (auto-generated by `ctx.db.insert`), which is correct. However, the `seedExternalRevenue` helper defaults to `dataOrigin: "api_revenue"` and `confidence: "exact"` — these are realistic defaults. Good.

One gap: no test seeds `transactionType: "return"` records to verify that returns reduce gross revenue naturally. The plan mentions this edge case ("Returns: `transactionType` field on `externalRevenue` — if `"return"`, the `revenueGross` is already negative from sync. No special handling needed") but no test validates it.

### Refinement 5: COGS Map Shares Across Weeks

The `cogsMap` (built at line 577) is the same for both current and previous weeks — it uses the current BOM state, not historical BOM. If ingredient costs changed between the two weeks, the previous week's COGS will be retroactively recalculated at current prices, not historical prices.

This is a known design decision (real-time aggregation, not snapshots) and is documented in the design doc. But it's worth noting that the "previous week delta" for COGS is not a true comparison — it compares previous week revenue against current BOM costs.

**Assessment:** Acceptable for SME scale where ingredient prices change infrequently. Document this limitation in the frontend tooltip or help text when displaying COGS deltas.

### Refinement 6: API_REFERENCE Documentation Accuracy

The API_REFERENCE at line 1567 documents `totalDiscounts` / `totalCommission` / `totalAdBurn` / `totalPromoBurn` / `totalRevShare` as deduction subtotals. These fields are present in the `WeekData` interface (lines 70-76 of `incomeStatement.ts`) and correctly documented. Good attention to detail — the documentation matches the actual return type.

One minor omission: the `channels[].products[]` sub-array is mentioned in the API_REFERENCE but its `ProductDetail` fields (`name`, `quantity`, `revenue`, `cogsPerUnit`, `cogsTotal`, `confidence`) are not individually documented. This is acceptable for a first release but should be expanded when the frontend drill-down (Phase 33) ships.

---

## 8. Test Coverage Analysis

### Planned vs. Delivered

| Design Doc Test Case | Plan 32-03 | Delivered | Status |
|----------------------|------------|-----------|--------|
| #1: BOM COGS accuracy (19231+1700=20931) | Task 32.3.2 Test 1 | `costCalculator.test.ts:18-35` + `incomeStatement.test.ts:226-281` | DELIVERED |
| #2: Multi-channel revenue aggregation | Not in plan | `incomeStatement.test.ts:357-387` (partial — delta test) | PARTIAL |
| #3: Internal order discount correction | Not in plan | NOT DELIVERED | GAP |
| #4: Empty week | Task 32.3.3 Test 1 | `incomeStatement.test.ts:163-176` | DELIVERED |
| #5: Unmapped product COGS = missing | Task 32.3.3 Test 2 | `incomeStatement.test.ts:178-224` | DELIVERED |
| #6: Consignment settlement inclusion | Not in plan | NOT DELIVERED | GAP |
| #7: WIB timezone boundary | Not in plan | NOT DELIVERED | GAP |
| #8: Zero revenue margin = null | Task 32.3.3 Test 4 | `incomeStatement.test.ts:283-294` | DELIVERED |
| #9: Negative net revenue | Task 32.3.3 Test 5 | `incomeStatement.test.ts:296-326` | DELIVERED |
| #10: `buildProductCOGSMap` unit test | Task 32.3.2 Tests 1-4 | `costCalculator.test.ts:18-105` (6 tests) | EXCEEDS |

**Additional tests not in plan but delivered:**
- Zero-cost component gap analysis (`incomeStatement.test.ts:328-355`)
- Delta comparison between weeks (`incomeStatement.test.ts:357-387`)
- Multiple quantity COGS scaling (`incomeStatement.test.ts:389-427`)
- Quantity > 1 packaging components (`costCalculator.test.ts:71-88`)
- Non-production category = packaging (`costCalculator.test.ts:90-105`)
- Week span exactly 7 days (`costCalculator.test.ts:131-137`)
- Handles epoch zero (`costCalculator.test.ts:139-146`)

**Summary:** 18 tests delivered (10 unit + 8 integration). 7 of 10 design doc test cases covered. 3 gaps (internal discount, consignment, WIB boundary). 7 additional tests beyond plan.

---

## 9. Over-Engineering Check

| Feature | In Plans? | In Design Doc? | Assessment |
|---------|-----------|----------------|------------|
| `lowestConfidence` ranking system | Not explicit | Design doc mentions "lowest confidence among line items" | APPROPRIATE — clean implementation of design intent |
| Channel sorting by gross revenue | NOT in plans | NOT in design doc | MINOR ADDITION — sensible UX improvement, not over-engineering |
| `linkedRevenueId` addition to `allRevenueIds` | Implied by plan 32-02 Step 4c | Yes (consignment COGS) | NECESSARY — without this, consignment COGS would always be zero |
| 7 extra tests beyond plan | Plan specified minimum | Design doc specified more | APPROPRIATE — better coverage is not over-engineering |

**No over-engineering found.** All additions serve clear purposes.

---

## 10. Approval Conditions

**Status: APPROVED — No blocking issues.**

**Recommended follow-ups (non-blocking):**
1. Add integration tests for internal order discount correction (design doc test case #3)
2. Add integration test for consignment settlement inclusion/exclusion (design doc test case #6)
3. Add integration test for WIB timezone boundary records (design doc test case #7)
4. Consider extracting shared revenue aggregation logic with `getDashboardSummaryByPeriodInternal` in a future refactor phase
5. Consider optimizing `by_period` index queries to use chained `.gte().lt()` bounds

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
*Post-implementation review comparing plans, design doc, prior reviews, and actual code*
