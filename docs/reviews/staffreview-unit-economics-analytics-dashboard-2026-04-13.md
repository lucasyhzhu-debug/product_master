# Staff Review: Unit Economics Analytics Dashboard

**Date:** 2026-04-13
**Plan:** `docs/superpowers/plans/2026-04-13-unit-economics-analytics-dashboard.md`
**Spec:** `docs/superpowers/specs/2026-04-13-unit-economics-analytics-dashboard-design.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 0. Plan Structure Validation

✅ Plan structure validated — all 4 mandatory sections present (Git Workflow, Implementation Waves, Documentation Updates, Success Criteria).

---

## 1. Summary

**Overall Assessment:** **Revise**

The plan is well-decomposed (16 atomic tasks, TDD regression guard for the critical dynamic-unit rule, sensible frontend/backend separation) and the spec coverage is tight. However, three concrete issues need attention before implementation: (1) every Convex query does a **full table scan** on `orders` and `orderItems` — guaranteed to become a prod problem inside of 6 months of data; (2) existing utilities (`platformColors.ts`, `periodRange.ts`) are duplicated instead of reused; (3) the dispatch planner still contains the hardcoded `BIG_BALL/MID_BALL` that this plan's Critical Rule §3 explicitly forbids — leaving it means the "units sold" number in the dispatch view will drift from the analytics view the moment Hazelnut volume matters.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|---|---|---|
| 1 | Full table scans via `ctx.db.query("orders").collect()` | Performance | T2 `loadFilteredData` |
| 2 | Manual `quantity * unitPrice - discountAmount` math ignores denormalized `lineTotal` | Logic / DRY | T2-T7 (most queries) |
| 3 | Existing `BIG_BALL/MID_BALL` hardcode in `convex/dispatchPlanner/queries.ts:286` violates this plan's §3 | Correctness drift | Not addressed |
| 4 | Frontend component tests missing entirely | Testing | T14 scope |

### Issue 1: Unbounded full-table scans on every query

**Problem.** `loadFilteredData` in T2 does `ctx.db.query("orders").collect()` and `ctx.db.query("orderItems").collect()` with no index, then filters in JS. That's fine at current scale (few thousand orders) but:
- The dashboard has **11 queries**, each doing its own scan.
- Opening the page with default 30-day filter triggers ~11 × (all-orders + all-items) reads.
- Convex memory rule from project memory: *"Both bounds MUST be inside `.withIndex()` — `.filter()` is post-scan."* This plan violates that guidance.
- Orders has `by_status_due_date` and `by_kitchen_visible` indexes — **but none on `completedAt` or `orderDate`**. So there's no existing bounded path.

**Recommendation.**
1. **Add index** to `convex/schema.ts` orders table: `.index("by_completed_at", ["completedAt"])` and/or `.index("by_order_date", ["orderDate"])`.
2. In `loadFilteredData`, use `.withIndex("by_completed_at", q => q.gte("completedAt", args.fromTs).lt("completedAt", args.toTs))`.
3. For orders where `completedAt` is undefined (legacy/draft), fall back path: separately query `by_order_date` and dedupe.
4. For orderItems, either batch-load by `orderId` using the existing `by_order` index (one call per order) — or accept the scan but at least filter to only the order IDs in the window client-side. The current plan scans ALL orderItems globally which is the worst shape.
5. Add this as a new **Task 1.5** before Task 2.

**Alternative (deferred):** A daily materialized aggregate table keyed by `(date, channel, menuProductId)` — good v2 but overkill for v1 if indexes are added.

### Issue 2: Recomputing `lineTotal` / `lineCost` manually

**Problem.** The schema already denormalizes derived values:
```
lineTotal: quantity * unitPrice - discountAmount  (DERIVED, computed at creation/update)
lineCost:  quantity * unitCost                   (DERIVED)
lineMargin: lineTotal - lineCost                 (DERIVED)
```
The plan manually recomputes `it.quantity * it.unitPrice` and subtracts `it.discountAmount` in at least 6 places (T2 `computeKpis`, T3 `dayHourHeatmap`, T4 `channelEconomics`, T6 `skuPareto`, T6 `skuChannelMatrix`, T7 `channelMomentum`, T7 `rollingTrend`). Risks:
- Divergence if denormalization rules ever change (e.g., a new discount type that gets baked into `lineTotal` but not into the manual formula).
- Additional arithmetic per item for no benefit.

**Recommendation.**
- Define two helpers in `productionUnitHelpers.ts` (or a new `convex/reports/revenueHelpers.ts`):
  ```typescript
  export function itemGross(it: Doc<"orderItems">): number {
    return it.lineTotal + (it.discountAmount ?? 0);
  }
  export function itemNet(it: Doc<"orderItems">): number {
    return it.lineTotal;
  }
  ```
- Replace every manual `quantity * unitPrice - discountAmount` with `itemNet(it)` and every `quantity * unitPrice` with `itemGross(it)`.
- Update T2–T7 code blocks in the plan.

### Issue 3: Existing `BIG_BALL/MID_BALL` hardcode not addressed

**Problem.** Plan spec §3 says the hardcoded pattern "MUST NOT be repeated" — but the offending code at `convex/dispatchPlanner/queries.ts:286-302` still exists. If Hazelnut volume grows and analytics shows the right number while dispatch planning shows the wrong one, the kitchen will under-produce. This is the exact Pitfall #11 the spec was written to prevent — now selectively.

**Recommendation.** Add a new optional task (T1.6 or fold into T1):
- Refactor `dispatchPlanner/queries.ts` to use `getProductionUnitsByTypePerProduct` from the new helper.
- Return a dynamic `unitsByType: Record<string, number>` instead of hardcoded `{bigBalls, midBalls}`.
- This is NOT optional if v1 ships before a Hazelnut production ramp — it's a silent correctness bug waiting to happen.
- If the refactor is too risky in this phase, at minimum add a **runtime guard**: in the dispatchPlanner query, fetch all `category=production, unit=pcs` componentTypes and throw if any code besides `BIG_BALL/MID_BALL` is encountered. Loud failure > silent undercounting.

### Issue 4: Frontend tests missing

**Problem.** T14 has excellent backend tests (5 cases covering the regression-critical Hazelnut path) but no frontend tests at all. Per staffreview rubric: "every new module needs tests". 14 new React components with zero tests is **Insufficient**.

**Recommendation.** Add **Task 14.5: Frontend smoke tests**:
- Test `KpiRow` renders tiles for current + delta pairs, handles `undefined` query result (loading), handles zero prior (null delta → "—").
- Test `AnalyticsFilterBar` round-trips state through URL params.
- Test one chart widget (e.g., `WeekdayDualAxisChart`) with mock query data → sanity-check it renders without throwing.
- Use existing Vitest + `@testing-library/react` setup (verify in `package.json`).
- Minimum 3 component test files is the bar.

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|---|---|---|
| 1 | Reuse `src/lib/platformColors.ts` instead of duplicate `CHANNEL_COLORS` | High | Low |
| 2 | Reuse `convex/lib/periodRange.ts` helpers for Jakarta dates | Medium | Low |
| 3 | Make `channelMomentum` bucket count adaptive to window width | Medium | Low |
| 4 | Memoize `unitsPerProduct` result across queries on one page-load | Medium | Medium |
| 5 | T13 Step 3 (nav entry) is vague — spell out the exact file | Low | Low |
| 6 | Document why the spec's "contribution margin" was dropped from KPI tiles | Low | Low |

### Improvement 1: Reuse `platformColors.ts`

The plan defines `CHANNEL_COLORS` inline in `RevPerUnitChart.tsx` and `UnitsByTypeStackedBars.tsx` and possibly others. `src/lib/platformColors.ts` is explicitly flagged in CLAUDE.md memory as the **single source of truth** for chart colors (keyed by raw source, has hex + Tailwind variants).

**Mapping gap:** platformColors keys are raw sources (`shopee`, `gobiz`, `grabfood`, `consignment`…) but the analytics plan uses display channels (`Shopee`, `Direct`, `GoFood`, `Consignment`). Resolve this by either:
- (a) Adding a `DISPLAY_CHANNEL_TO_SOURCE_KEY` map and calling `getPlatformPalette(mapped)` — keeps single source of truth.
- (b) Extending `platformColors.ts` to include the display-channel aggregates (`Direct`, `K3Mart`, `GoFood` as first-class keys).

Option (b) is cleaner. Add to T11 Step 1 + T12 Step 1.

### Improvement 2: Reuse `periodRange.ts` helpers

`convex/lib/periodRange.ts` already exports `getWibComponents(utcMs)` and `wibMidnightToUtc(y, m, d)`. The plan's inline `getJakartaDate` and `bucketKey` duplicate this logic. **Use the library.**

**Also:** `periodRange.ts` defines a `PeriodPreset` enum + `calculatePeriodRange()` returning `{currentStart, currentEnd, previousStart, previousEnd}`. The plan's `priorPeriod()` helper reinvents a naive version (shift by span). For any preset other than "lastNdays", `calculatePeriodRange` is smarter (respects day/week/month boundaries). Recommend T8 `AnalyticsFilterContext` expose preset selection (`"last7days"`, `"last30days"`, etc.) and use `calculatePeriodRange` on the backend side to derive both windows.

### Improvement 3: Adaptive momentum bucket count

`channelMomentum` hardcodes 6 buckets. For a 7-day window that's ~28-hour buckets (odd). For a 180-day window each bucket is 30 days (fine). Trivial fix: pick bucket count based on span — `span ≤ 14d → 7 days`, `≤ 90d → 13 weeks`, `> 90d → 12 months`. Cosmetic.

### Improvement 4: Shared `unitsPerProduct` across queries

Each of the 11 queries calls `getProductionUnitsPerProduct(ctx)` → reads all componentTypes + menuProductComponents every time. Same for one page-load. Since Convex queries are isolated, true memoization requires a cached aggregate — defer to v2 if performance isn't felt. But cheaper: **pass `unitsPerProduct` into hook-level memo** (skip — queries can't share). Alternative: add a dedicated query `unitEconomicsBundle` that returns all 11 payloads in one roundtrip. Defers to v2.

### Improvement 5: Specify nav file explicitly

T13 Step 3 says "Find the primary nav component (likely `src/components/layout/Header.tsx` or similar)". Ambiguity invites skipping. Either:
- Determine the file during planning and write it verbatim, OR
- Mark it as a research step with "`grep -l 'SalesAnalytics' src/components/layout/`" and commit only after seeing result.

### Improvement 6: Document the contribution-margin omission

Spec §2 explicitly defers contribution margin. KPI tile A4 is "Rev / unit" which is a proxy. The plan doesn't explain to future readers why "margin per unit" isn't there. Add a one-line note in T10 Step 1 comment block.

---

## 4. Refinements (Minor Suggestions)

- `bucketKey` ISO-week implementation is approximate — fine; add a brief comment noting this is not RFC 3339 week numbering but close enough for UI.
- `DisplayChannel` type is duplicated in `channelTaxonomy.ts` (Convex) and `AnalyticsFilterContext.tsx` (frontend). Cross-boundary sharing is hard in Convex — current split is acceptable. Add a comment that these two declarations must stay in sync.
- T8 `Calendar` range picker — `onSelect` only triggers when both `from` and `to` exist. Empty-range edge case (user picks `from` but closes without `to`): filter stays on prior value, which is fine but silent.
- T10 `DayHourHeatmap` renders 7 `<>...</>` fragments inline inside a grid — React keys on fragments are lost. Convert to explicit `<div className="contents">` wrappers with `key={row}`.
- T11 `RevPerUnitChart`'s `Bar dataKey="value"` with per-cell fill — Recharts 3.x accepts this pattern, but prefer `fill={({ payload }) => CHANNEL_COLORS[payload.channel]}` to avoid React key warnings.
- T14 tests don't cover `volumeByType`, `skuPareto`, `channelMomentum`, `rollingTrend`, `channelEconomics`. They'd pass without the dynamic-unit rule, but at minimum `volumeByType` needs a Hazelnut-present assertion (it feeds the only UI that's supposed to visualize the new product).
- `TakeRateTable` note says "v1 excludes platform fees" — add this also to `RevPerUnitChart` tooltip since rev/unit would be lower once fees are included.
- Commit for the spec and plan should ideally use `docs(analytics): ...` not bare `docs: ...` to match repo conventions for category tagging. Not blocking.

---

## 5. Duplication Analysis

### Existing Code to Leverage

| Existing Code | Location | How to Use |
|---|---|---|
| `getPlatformPalette(source)` + `PLATFORM_COLORS` | `src/lib/platformColors.ts` | Replace all inline `CHANNEL_COLORS` maps in analytics widgets |
| `getWibComponents(utcMs)` + `wibMidnightToUtc(y,m,d)` | `convex/lib/periodRange.ts` | Replace inline `getJakartaDate` and parts of `bucketKey` |
| `calculatePeriodRange(preset)` | `convex/lib/periodRange.ts` | Drive WoW prior-window calculation (smarter than naive span shift) |
| `formatCurrency` | `src/lib/utils.ts` | Used in plan — good ✓ |
| `PageHeader`, `Card`, `Button`, `Popover`, `Checkbox`, `Calendar` | `src/components/layout`, `src/components/ui` | Used in plan — good ✓ |
| `ProtectedRoute` with `permission="canAccessDashboard"` | `src/components/auth/ProtectedRoute.tsx` | Used in plan — good ✓ |
| `lazyWithPreload` + `ChunkErrorBoundary` route wrapper | `src/lib/lazyWithPreload.ts` + components | Used in plan — good ✓ |
| `toDisplayChannel` — new; consider consolidating with `sourceToPlatform` | Already exists in `convex/lib/externalSource.ts` per memory | Verify overlap; may be able to reuse |

### Potential Duplication Risks

- **CRITICAL:** `CHANNEL_COLORS` duplicated from `platformColors.ts` (Improvement 1).
- **HIGH:** `getJakartaDate` duplicated from `getWibComponents` (Improvement 2).
- **MEDIUM:** `priorPeriod` reinvents `calculatePeriodRange` (Improvement 2).
- **LOW:** `DisplayChannel` declared twice (backend + frontend) — acceptable cross-boundary, documented.
- **LOW:** `toDisplayChannel` may overlap with existing `sourceToPlatform` in `convex/lib/externalSource.ts` — verify before creating new file.

---

## 6. Phase/Wave Accuracy

| Wave | Assessment | Notes |
|---|---|---|
| W1 Backend | Good (sequential) | Correctly marked sequential; plan acknowledges same-file serialization |
| W2 Frontend | Good | Widgets naturally decompose; Task 13 is the only cross-dependency |
| W3 Verification | Missing frontend tests | Add T14.5 |

**Ordering Issues:** None. Backend precedes frontend precedes verification. Good.

**Missing Phases:**
- **T1.5 — Add indexes** (before T2). Small schema change + regeneration.
- **T1.6 — Migrate dispatchPlanner off hardcoded codes** (after T1). Closes Critical Issue 3.
- **T14.5 — Frontend smoke tests** (in W3 before T15). Closes Critical Issue 4.

---

## 7. Specialist Agent Recommendations

| Phase / Task | Recommended Agent | Rationale |
|---|---|---|
| T1, T1.5, T1.6 (helpers + index + migration) | `convex-backend` | Schema + pure functions + cross-module refactor |
| T2–T7 (all queries) | `convex-backend` | Sequential on same file, one agent maintains context |
| T8 (filter context) | `react-ui-builder` | React context + react-router integration |
| T9 (hooks) | `react-ui-builder` | Thin hook layer |
| T10–T12 (widgets) | `react-ui-builder` (can parallelize by row) | Each row's widgets share no state — genuine parallel opportunity |
| T13 (page + route) | `react-ui-builder` | Needs all widgets shipped first |
| T14, T14.5 (tests) | `tdd-test-architect` | Integration test suite + smoke tests |
| T15 (type/lint/test) | `code-auditor` | Pattern compliance check |
| T16 (build + docs) | Bash + human commit | Scripted verification |

**Cross-cutting:** Consider `cto-orchestrator` to coordinate if T1.6 (dispatchPlanner refactor) ends up with scope creep.

---

## 8. Git Workflow Assessment

### Branch Strategy

| Assessment | Status |
|---|---|
| Feature branch specified | ✅ `feature/analytics-dashboard-spec` (already exists with spec + plan) |
| Branch naming convention | ✅ Matches `feature/{slug}` rule |
| Merge strategy documented | ⚠️ Implicit — CLAUDE.md standard applies (PR → review → merge) but plan should make the PR step explicit |

### Commit Strategy

| Phase | Expected Commits | Commit Type | Notes |
|---|---|---|---|
| T1–T7 | 7 commits | feat | Atomic per task ✓ |
| T8–T13 | 6 commits | feat | Atomic per task ✓ |
| T14–T14.5 | 2 commits (after additions) | test | |
| T15 | 0–1 (only if fixes) | fix | |
| T16 | 1 | docs | Multi-file docs update is acceptable here |

**Total:** ~16–18 commits on feature branch. Clean.

### Recommended Commit Checkpoints

The plan already lists explicit commits per task ✓. No changes needed.

### Pre-Push Verification

- [x] Plan includes `npm run build` (T16)
- [x] Plan includes `npm run type-check` (T15)
- [x] Plan includes `npm run test` (T15)

### CI/CD Considerations

| Concern | Assessment |
|---|---|
| Rollback strategy | ⚠️ Missing — reverting all 16+ commits is messy; recommend squash-merge into main so revert = 1 commit |
| Deployment order | ✅ Backend merges with schema index first; frontend relies on API types generated by Convex |
| Data backup needed | No — read-only additions |
| Migration safety | ✅ Only a new non-unique index on `orders` — safe additive schema change |

### Git Workflow Issues Found

- **Issue:** No explicit PR step — add "Open PR against `main`" after T16 Step 7.
- **Issue:** Recommend squash-merge to main (one revertable commit) — document in PR body.

---

## 9. Documentation Checkpoints

| Phase | Documentation Update Required |
|---|---|
| T1.5 (if added) | `docs/SCHEMA.md` — new index on orders |
| T16 | `docs/CHANGELOG.md`, `docs/API_REFERENCE.md`, `docs/ROADMAP.md`, `CLAUDE.md` Quick File Finder |

### CHANGELOG.md Entry (Draft)

```markdown
## 2026-04-XX - Unit Economics Analytics Dashboard

**New `/analytics` page with 13 widgets answering "where's money from, how much per unit, is it growing"**

- Add `/analytics` route protected by `canAccessDashboard` (manager + admin)
- Backend: 11 new queries in `convex/reports/unitEconomics.ts` + shared filter loader
- Dynamic production-unit counting: Big Ball + Mid Ball + Hazelnut (+future) always counted via `getProductionUnitsPerProduct` — no hardcoded codes
- Filter state URL-synced (bookmarkable dashboard views)
- New index on orders.completedAt for bounded date-range scans

**Files Modified:**
- `convex/schema.ts` (new index)
- `convex/reports/productionUnitHelpers.ts`, `channelTaxonomy.ts`, `unitEconomics.ts` (new)
- `convex/dispatchPlanner/queries.ts` (migrated off hardcoded codes)
- `src/pages/AnalyticsDashboard.tsx`, `src/components/analytics/*`, `src/hooks/convex/useAnalytics.ts`, `src/contexts/AnalyticsFilterContext.tsx` (new)
- `src/App.tsx`, nav layout (route + link)
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** **Insufficient** — strong backend regression guard, no frontend coverage.

### Planned Tests

| Layer | What's Tested | Test Type | Status |
|---|---|---|---|
| Backend | `kpiSummary` with Hazelnut | convex-test | Planned ✓ |
| Backend | Draft/Cancelled exclusion | convex-test | Planned ✓ |
| Backend | WoW delta arithmetic | convex-test | Planned ✓ |
| Backend | Channel filter | convex-test | Planned ✓ |
| Backend | `byWeekday` bucketing | convex-test | Planned ✓ |
| Backend | `volumeByType`, `skuPareto`, `channelMomentum`, `rollingTrend`, `channelEconomics` | convex-test | **Missing** |
| Frontend | All 14 components | Vitest + RTL | **Missing** |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|---|---|---|
| 1 | `volumeByType` with Hazelnut present | This query drives the D1/D4 widgets — the only place Hazelnut growth is visualized | Seed one Hazelnut-linked product, assert `series` includes `HAZELNUT_REGULAR` with non-zero values |
| 2 | `channelEconomics` take-rate math | Core CFO number; easy to get backwards | Seed 2 channels, assert takePct = discount/gross in fixture |
| 3 | `skuPareto` Other bucket + cumulativePct monotonic | Pareto UX depends on cumulative being non-decreasing | Seed 12 products, assert 10 top + 1 "Other", cumulativePct runs 0→100 |
| 4 | `rollingTrend` window calculation | 7d/28d rolling math is easy to off-by-one | Seed 35 days, assert rolling28[34] ≈ mean of last 28 |
| 5 | `KpiRow` component | Loading state, zero-prior null handling, formatting | Vitest + RTL, mock `useKpiSummary` to return undefined then real value |
| 6 | `AnalyticsFilterBar` URL sync | Bookmarkable filter state is in success criteria | Render inside MemoryRouter, click preset, assert URL params update |
| 7 | One chart widget renders without throwing | Recharts 3.x API regression guard | `WeekdayDualAxisChart` mock data → render in jsdom |

### Test Execution Checkpoints

The plan should run tests at:
1. After T7 (all backend queries done): `npm run test -- tests/convex/unitEconomics.test.ts`
2. After T14.5 (frontend smoke tests): `npm run test`
3. Before merge (T16): Full `npm run test && npm run build`

### Regression Risk

- `convex/dispatchPlanner/queries.ts` — if migrated (see Critical Issue 3), existing kitchen UI flows must smoke test.
- `convex/reports/dailySales.ts` — unchanged but patterns diverge; no direct regression.
- No existing tests likely to break — this is net-new surface.

---

## 11. Edge Cases to Address

The plan should explicitly handle:

- [ ] Order with `completedAt = undefined` and `orderDate` only (legacy data) — plan uses `?? orderDate` fallback ✓ but once `by_completed_at` index is added, these orders become invisible to the index-bounded query. Document this constraint or use a second query path for legacy orders.
- [ ] `menuProductComponents` row referencing a deleted/inactive componentType — plan filters by `category && unit` but doesn't check deletion. Acceptable since deletion is soft.
- [ ] Product with no BOM rows at all (new product, not yet configured) — `unitsForOrderItem` returns 0 → correctly excluded from unit counts. Good.
- [ ] Manual orderItems with `menuProductId = undefined` — excluded from unit counts but INCLUDED in SKU Pareto (by `productName`). Document this asymmetry in a comment.
- [ ] Timezone DST — Indonesia doesn't observe DST, so WIB offset is always +7. Safe, but comment for future readers.
- [ ] Filter with `channels: []` (user deselected all) — plan treats empty array as "no filter" (= all channels). Matches memory rule that empty = none-selected. Verify this is the intended UX (some UIs interpret empty = show nothing).
- [ ] `fromTs > toTs` (user picks backward range) — no guard; returns empty results silently. Add validator.
- [ ] Very long range (>1 year) — no hard limit; performance risk without indexes (Critical Issue 1).

---

## 12. Approval Conditions

**For Approval, address:**
1. **Add `by_completed_at` index + bounded query path** (Critical Issue 1). Either new task T1.5 or bake into T2.
2. **Use `lineTotal` instead of recomputing** (Critical Issue 2). Simple refactor of T2–T7 code blocks.
3. **Decide on dispatchPlanner migration** (Critical Issue 3). Either new task T1.6 or add runtime guard with explicit doc of the known drift.
4. **Add frontend smoke tests** (Critical Issue 4). New task T14.5 with minimum 3 component tests.

**Recommended before implementation:**
1. Reuse `platformColors.ts` for channel colors.
2. Reuse `periodRange.ts` helpers for Jakarta dates + prior-period.
3. Specify nav file path in T13 Step 3 exactly.
4. Add backend tests for `volumeByType`, `channelEconomics`, `skuPareto`, `rollingTrend`.
5. Document squash-merge strategy in PR step.

**Optional:**
- Adaptive bucket count in `channelMomentum`.
- `unitEconomicsBundle` single-query optimization (v2).
- ISO-week RFC compliance.

---

## Next Steps

1. **Author updates the plan** to address the 4 Critical issues and top 3 Improvements (est. 30 min).
2. **Re-run `/staffreview`** (optional) to confirm or skip if changes are straightforward.
3. **Execute the plan** via `subagent-driven-development` once Critical items are resolved.

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
