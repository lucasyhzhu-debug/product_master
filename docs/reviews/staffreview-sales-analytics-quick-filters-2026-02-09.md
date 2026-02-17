# Staff Review: Sales Analytics Dashboard Enhancement

**Date:** 2026-02-09
**Plan:** `C:\Users\Irfan\.claude\plans\eager-conjuring-abelson.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 0. Plan Structure Validation

```
PLAN VALIDATION CHECKLIST
=========================

[x] Git Workflow section exists?
  -> Branch name specified? YES: feature/sales-analytics-quick-filters
  -> Checkpoint strategy defined? YES: After Wave 1, 2, 3

[x] Implementation Waves section exists?
  -> Agents assigned? PARTIAL - agents referenced by name (convex-backend, react-ui-builder, code-auditor) but not in formal table
  -> File paths specified? YES
  -> PARALLEL/SEQUENTIAL marked? PARTIAL - Wave 3 says SEQUENTIAL, Waves 1-2 imply parallel but don't use explicit markers

[x] Documentation Updates section exists?
  -> CHANGELOG.md checkbox? YES

[x] Success Criteria section exists?
  -> Type check requirement? YES
  -> Build requirement? YES

=========================
RESULT: PASS (minor formatting gaps)
```

**Plan Structure Additions:**
- Wave 1 and Wave 2 headers should include explicit `[PARALLEL]` markers per CLAUDE.md template
- Agent assignment table format should match CLAUDE.md template (pipe-separated table with Agent | Task | Files columns)

---

## 1. Summary

**Overall Assessment:** REVISE (1 Critical, 4 Improvements, 4 Refinements)

The plan is well-researched and architecturally sound. It correctly identifies existing indexes, avoids unnecessary backend changes for K3 Mart grouping (pure frontend), and leaves the existing `getDashboardSummary` untouched. The main blocker is the complete absence of a testing plan for a feature with non-trivial timezone logic and 5 interacting UI features. The WIB timezone calculation for `calculatePeriodRange()` is an area where bugs are almost guaranteed without tests. Address the testing gap and the reuse opportunities below, and this plan is ready to build.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | No testing plan for WIB timezone calculations or growth indicator logic | Testing | Wave 3 / Success Criteria |

**Details:**

### Issue 1: Missing Testing Plan

The plan's verification section only includes `type-check` and `build`. For a feature with:
- **WIB timezone math** (UTC+7 offset, month boundaries, DST-free but leap-year-aware)
- **Period comparison logic** (current vs previous period aggregation)
- **Growth percentage calculation** (division by zero, negative growth, no-data states)
- **AOV calculation** (zero transactions edge case)

...automated tests are mandatory, not optional.

**Recommendation:** Add a testing wave between Wave 2 and Wave 3:

```markdown
### Wave 2.5: Testing [SEQUENTIAL, after Wave 2]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Unit tests for calculatePeriodRange() - all 5 presets, month boundaries, edge cases | convex/externalData/__tests__/periodRange.test.ts |
| convex-backend | Unit tests for reduceRevenue aggregation with known inputs/outputs | convex/externalData/__tests__/periodRange.test.ts |
```

Minimum test cases for `calculatePeriodRange()`:
1. "today" preset at 2:00 AM WIB (should use WIB midnight, not UTC midnight)
2. "thisMonth" on March 1st (previous period = full February)
3. "yesterday" near midnight WIB (boundary condition)
4. "last30days" spanning month boundary
5. All 5 presets return `previousStart < previousEnd < currentStart < currentEnd`

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Reuse WIB timezone logic from GoBiz helpers | High | Low |
| 2 | Extract `calculatePeriodRange()` to a testable standalone file | High | Low |
| 3 | Performance guard on `getDashboardSummaryByPeriod` for "Last 30 Days" | Medium | Low |
| 4 | Fix the N+1 all-orders scan in existing `getRevenue` enrichment | Medium | Medium |

**Details:**

### Improvement 1: Reuse WIB Timezone Logic

`convex/integrations/gobiz/helpers.ts` already has a battle-tested `wibDateToUtcRange(dateStr)` function that correctly converts WIB dates to UTC epoch ranges. The new `calculatePeriodRange()` needs the same logic.

**Current GoBiz helper (lines 23-35):**
```typescript
export function wibDateToUtcRange(dateStr: string): { from: number; to: number } {
  const [year, month, day] = dateStr.split("-").map(Number);
  const wibStartHour = 0 - 7; // WIB midnight = UTC -7h
  const startUtc = Date.UTC(year, month - 1, day, wibStartHour, 0, 0, 0);
  const wibEndHour = 23 - 7;
  const endUtc = Date.UTC(year, month - 1, day, wibEndHour, 59, 59, 999);
  return { from: startUtc, to: endUtc };
}
```

**Recommendation:** Either:
- (a) Move `wibDateToUtcRange` to `convex/lib/dateUtils.ts` and import from both GoBiz and externalData, OR
- (b) Import directly from `convex/integrations/gobiz/helpers.ts` (simpler, but creates a coupling to integration module)

Option (a) is preferred for separation of concerns.

### Improvement 2: Extract Period Range Helper to Standalone File

The plan puts `calculatePeriodRange()` inside `convex/externalData/queries.ts`. This makes it hard to unit test independently. Since this function has complex date math, it should be a pure function in its own file.

**Recommendation:** Create `convex/lib/periodRange.ts` (or `convex/externalData/helpers.ts`) with:
- `calculatePeriodRange(preset: string): { currentStart, currentEnd, previousStart, previousEnd, periodLabel, comparisonLabel }`
- Import into `queries.ts`
- Import into test file for direct testing

### Improvement 3: Performance Guard for Large Period Queries

"Last 30 Days" + comparison period = 60 days of revenue data. With K3 Mart (7 outlets) + GoBiz + Internal all syncing daily, this could be 1000+ records to aggregate.

The `by_period` index supports `gte("periodStart", start).lt("periodStart", end)` range clauses, which is good. But collecting ALL records and reducing in JS is O(n).

**Recommendation:** Add a comment documenting the expected dataset size and performance characteristics. If volume grows beyond ~5000 records per query, consider:
- A materialized aggregation table (future optimization)
- Using `.take(10000)` as a safety cap with a warning log

For now, the current approach is acceptable given the business scale.

### Improvement 4: Fix N+1 All-Orders Scan in `getRevenue`

The existing `getRevenue` query (line 149) does:
```typescript
const orders = await ctx.db.query("orders").collect(); // Scans ALL orders
```

This is used to match `externalTransactionId` to `orderNumber` for customer name enrichment. Since the `by_order_number` index exists, this should use per-order lookups instead.

**Recommendation:** This is outside the plan scope but worth noting. The new `getOrderDetailsByOrderNumber` query correctly uses the index. Consider a follow-up ticket to fix the existing `getRevenue` enrichment to use:
```typescript
const order = await ctx.db.query("orders")
  .withIndex("by_order_number", q => q.eq("orderNumber", txnId))
  .first();
```

---

## 4. Refinements (Minor Suggestions)

- **URL param default:** The plan says "Last 7 Days" is default when no URL param. Consider using `useSearchParams` with a computed default rather than always writing "last7days" to the URL. Omit the param for the default to keep URLs clean.
- **Responsive grid for AOV card:** The plan references `grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6` in the original spec, but the implementation plan doesn't specify exact breakpoints. Current layout is `md:grid-cols-2 lg:grid-cols-4/5`. Document the intended grid.
- **StoreGroupHeader accessibility:** Add `aria-expanded` attribute to the collapsible store group headers for screen reader support.
- **GrowthIndicator reuse:** The `OrderStatsCards.tsx` (lines 74-88) has an inline growth pattern with `ArrowUp`/`ArrowDown` + colored text + percentage. Consider extracting this to a shared `<GrowthIndicator />` in `src/components/shared/` so both Dashboard and Sales Analytics use the same component.

---

## 5. Duplication Analysis

### Existing Code to Leverage
| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `wibDateToUtcRange()` | `convex/integrations/gobiz/helpers.ts:23` | Reuse WIB-to-UTC date math for period boundaries |
| Growth indicator pattern | `src/components/dashboard/OrderStatsCards.tsx:74-88` | Template for `GrowthIndicator` component design |
| `ExpandedRevenueItems` | `src/components/salesAnalytics/OverviewTab.tsx:109-177` | Pattern for `ExpandedInternalOrder` (nested tr, colSpan, bg-muted/30, skeleton loading) |
| Revenue aggregation | `convex/externalData/queries.ts:241-246` | Existing reduce pattern for `totalGross`, `totalNet`, etc. |
| `formatCurrency()` | `src/lib/utils.ts` | Already imported in OverviewTab, reuse for AOV and store group totals |
| `PlatformBadge` | `src/components/salesAnalytics/OverviewTab.tsx:87-107` | Reuse in `ExpandedInternalOrder` for channel display |
| `cn()` utility | `src/lib/utils.ts` | For conditional class merging in growth indicator |

### Potential Duplication Risks
- **Risk:** Creating a new `formatCurrency` in the AOV card instead of using `src/lib/utils.ts` (the `OrderStatsCards.tsx` has its own local `formatCurrency` with abbreviated format - avoid importing the wrong one)
- **Risk:** Reimplementing WIB timezone logic from scratch instead of reusing GoBiz helper

---

## 6. Phase/Wave Accuracy

| Phase | Assessment | Notes |
|-------|------------|-------|
| Wave 1: Backend | Good | Two queries + 1 helper. Clean scope. No schema changes needed. |
| Wave 2: Frontend | Needs Adjustment | Large scope (5 UI features in 1 file). Consider splitting into 2a (hooks) and 2b (OverviewTab) as already noted. |
| Wave 3: Verification | Needs Adjustment | Missing testing step. Only has type-check + build. |

**Ordering Issues:**
- Wave 2 frontend work depends on Wave 1 backend being complete AND `npx convex dev` running to generate types. The plan correctly states "after Wave 1 passes type-check" but should note `npx convex dev` must be active.

**Missing Phases:**
- **Wave 2.5: Testing** - Unit tests for `calculatePeriodRange()` and aggregation logic (see Critical Issue #1)
- **Wave 4: Documentation** - CHANGELOG.md and API_REFERENCE.md updates should be a separate wave to ensure they happen

---

## 7. Specialist Agent Recommendations

| Phase | Recommended Agent | Rationale |
|-------|-------------------|-----------|
| Wave 1: Backend queries + helper | `convex-backend` | Backend mutation/query specialist, knows Convex patterns |
| Wave 2a: Hook layer | `react-ui-builder` | Frontend hook + barrel export specialist |
| Wave 2b: OverviewTab UI | `react-ui-builder` | Complex UI with multiple interacting features |
| Wave 2.5: Backend tests | `convex-backend` | Uses convex-test patterns |
| Wave 3: Verification | `code-auditor` | Type check + pattern compliance |
| Wave 4: Docs | `convex-backend` or manual | API_REFERENCE + CHANGELOG updates |

**Parallelism opportunities:**
- Wave 2a (hooks) and Wave 2b (UI) can run in parallel since hooks are a separate file
- Wave 1's two queries (1a + 1b) can be written by a single `convex-backend` agent sequentially (same file)

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | YES: `feature/sales-analytics-quick-filters` |
| Branch naming convention | CORRECT: `feature/{name}` per CLAUDE.md |
| Merge strategy documented | IMPLICIT: plan says "after Wave 3 verification" but no explicit merge step |

### Commit Strategy
| Phase | Expected Commits | Commit Type | Notes |
|-------|------------------|-------------|-------|
| Wave 1 | 1 | feat | Backend queries + period helper |
| Wave 2a | 1 | feat | Hook layer additions |
| Wave 2b | 1-2 | feat | OverviewTab UI enhancements (could split period filters from K3 grouping) |
| Wave 2.5 | 1 | test | Period range unit tests |
| Wave 3 | 0 | -- | Verification only, no code changes |
| Wave 4 | 1 | docs | CHANGELOG + API_REFERENCE |

### Recommended Commit Checkpoints
1. After Wave 1 backend: `feat: add period-based dashboard summary and order detail queries`
2. After Wave 2a hooks: `feat: add period preset and order detail hooks`
3. After Wave 2b UI: `feat: enhance sales analytics with period filters, growth indicators, AOV, internal order expansion, K3 Mart store grouping`
4. After Wave 2.5 tests: `test: add unit tests for period range calculations`
5. After Wave 4 docs: `docs: update CHANGELOG and API_REFERENCE for sales analytics enhancements`

### Pre-Push Verification
- [x] Plan includes `npm run build` check
- [x] Plan includes `npm run type-check` verification
- [ ] Plan includes local testing before push (MISSING)

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | SAFE - no schema changes, no data mutations, just new queries + UI. Revert commit is sufficient. |
| Deployment order | CORRECT - backend deploys first (Convex), then frontend (Vercel rebuild). Both trigger on push to main. |
| Data backup needed | No - read-only queries, no data modifications |
| Migration safety | N/A - no migrations |

### Git Workflow Issues Found
- No explicit `npm run build` verification step between Wave 1 and Wave 2 (plan says "after Wave 1 passes type-check" but doesn't specify running it)
- Missing explicit merge step and PR creation instructions

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|-------|-------------------------------|
| Wave 4 (Post-verification) | `docs/CHANGELOG.md`, `docs/API_REFERENCE.md` |

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-02-09 - Sales Analytics Dashboard Enhancement

**Quick-filter period presets, growth indicators, AOV metric, expandable internal orders, and K3 Mart store grouping**

### Added
- Period filter presets (Today, Yesterday, Last 7 Days, Last 30 Days, This Month) with URL persistence
- Period-over-period growth indicators (% change vs comparable previous period) on all summary cards
- Average Order Value (AOV) metric card
- Expandable internal order rows with order details and "View Full Order" link
- K3 Mart store grouping with collapsible sub-totals when K3 Mart filter is active

### Backend
- New query: `getDashboardSummaryByPeriod` - period-aware summary with current/previous comparison
- New query: `getOrderDetailsByOrderNumber` - order details for expanded row display

**Files Modified:**
- `convex/externalData/queries.ts`
- `src/hooks/convex/useExternalData.ts`
- `src/hooks/convex/index.ts`
- `src/components/salesAnalytics/OverviewTab.tsx`
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** MISSING

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | `calculatePeriodRange()` | convex-test / vitest | MISSING |
| Backend | `getDashboardSummaryByPeriod` aggregation | convex-test | MISSING |
| Backend | `getOrderDetailsByOrderNumber` | convex-test | MISSING |
| Frontend | `GrowthIndicator` component | Vitest + RTL | MISSING |
| Frontend | Period filter URL persistence | Manual | MISSING |
| Integration | Full flow: select period -> cards update -> table syncs | Manual | MISSING |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | `calculatePeriodRange()` for all 5 presets | WIB timezone math is error-prone; month/year boundaries are edge cases | Pure function unit tests with known input/output pairs. Test at various times of day. |
| 2 | Revenue aggregation with zero records | Div-by-zero in AOV, growth calc with no previous data | Unit test with empty arrays |
| 3 | Growth percentage edge cases | 0->0 (should be 0%), 0->100 (should be "New" or 100%), negative values | Unit tests for the percentage calculation helper |

### Test Execution Checkpoints
1. After backend implementation: `npm run test` (existing tests still pass + new period range tests)
2. After frontend implementation: `npm run test` (all existing tests pass)
3. Before merge: Full `npm run test && npm run build` verification

### Regression Risk
- Existing `getDashboardSummary` must continue working (used by main Dashboard `SalesWidget`)
- Existing GoBiz expandable rows must still work after expand condition is broadened
- Platform filter + date filter interaction must not break

---

## 11. Edge Cases to Address

The plan should explicitly handle:

- [x] Zero transactions (AOV = Rp 0) - covered in plan
- [x] No previous period data (growth shows "New") - covered in plan
- [x] Internal order deleted after sync (expanded row shows "Order not found") - covered in plan
- [x] K3 Mart record with no outletId (groups under "Unknown Store") - covered in plan
- [ ] **Period switches during loading** - plan mentions "Convex reactive query handles naturally" but doesn't specify skeleton/loading behavior for the transition
- [ ] **"This Month" on the 1st of the month** - previous period = full previous month (28-31 days), current period = only today. Growth comparison may be misleading. Consider showing "1 day vs 31 days" in the comparison label.
- [ ] **Revenue table empty after period sync** - if revenue table dateFrom/dateTo auto-sync excludes all records, show a meaningful empty state (not just "No records match")
- [ ] **Browser back/forward with URL params** - `useSearchParams` should respond to popstate events correctly. Need to verify `setSearchParams` doesn't push duplicate history entries.

---

## 12. Approval Conditions

**For Approval, address:**
1. **Add testing plan** (Critical Issue #1) - at minimum, unit tests for `calculatePeriodRange()` with WIB timezone edge cases

**Recommended before implementation:**
1. Extract `calculatePeriodRange()` to a standalone pure-function file for testability
2. Reuse `wibDateToUtcRange()` WIB logic from GoBiz helpers (or extract to shared `convex/lib/dateUtils.ts`)
3. Add explicit `npm run type-check` step between Wave 1 and Wave 2
4. Add Wave 4 (Documentation) as an explicit wave

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
