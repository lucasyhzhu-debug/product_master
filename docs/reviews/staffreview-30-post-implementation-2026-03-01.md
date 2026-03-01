# Consolidated Review: Phase 30 — Unified Sales Analytics (Post-Implementation)

**Date:** 2026-03-01
**Branch:** `gsd/phase-30-unified-sales-analytics` (8 commits, 12 files, +791/-198 lines)
**Plans:** `30-01-PLAN.md` (backend), `30-02-PLAN.md` (frontend)
**Reviews:** /staffreview (plan review) + /code-review (implementation review)
**Build Status:** type-check PASS | build PASS | 633 tests PASS (0 failures)

---

## Executive Summary

**Overall Assessment:** Revise — 3 issues to fix before merge

The implementation faithfully follows both plans and the core refactoring (hardcoded 3-platform → dynamic discovery) is architecturally sound. Type-check, build, and all 633 tests pass. However, there are 3 actionable issues that should be addressed before merging to main: a broken E2E test, missing backend unit tests, and a dark mode pattern violation.

---

## Issues Found (Prioritized)

### ISSUE 1: E2E Test Will Fail — Removed Platform Filter Badges Still Referenced
**Severity:** CRITICAL (will break CI if E2E tests are enabled)
**File:** `tests/e2e/sales-analytics-overview.spec.ts:158-213`
**Category:** Regression / Test Drift

The `US-8: Platform filter badges work and are intuitive` test (line 158) expects four filter badges `["All", "K3 Mart", "GoBiz", "Internal"]` in the Revenue Table header. Phase 30 **removed all four badges** — the chart legend is now the filter. This test will fail when E2E tests run.

**Lines affected:**
- Line 166: `const filterBadges = ["All", "K3 Mart", "GoBiz", "Internal"];`
- Lines 170-210: Click interactions on removed elements
- Line 241: Description assertion now stale (`"K3 Mart and GoBiz"`)

**Fix:** Either delete test `US-8` entirely (platform filter is a removed feature, not a broken one), or rewrite it to test the chart legend-as-filter interaction instead. Recommend deletion — the feature was intentionally removed.

---

### ISSUE 2: No Backend Tests for New/Refactored Queries
**Severity:** HIGH (prevents regression detection)
**Category:** Testing Gap
**Flagged by:** staffreview Critical #2 — NOT addressed in implementation

Phase 30 modified 3 critical analytics queries and added 2 new ones. Zero tests were added.

| Query | Change Type | Test Status |
|-------|-------------|-------------|
| `sourceToPlatform()` | Extended from 3→8 cases | **No test** |
| `getRevenueTimeSeries` | Hardcoded→dynamic discovery | **No test** |
| `getDashboardSummaryByPeriodInternal` | Fixed object→dynamic array (BREAKING) | **No test** |
| `getRevenueByOutletInternal` | Sort order changed | **No test** |
| `getLifetimeTotalsInternal` | NEW query (full table scan) | **No test** |

**Recommended minimum tests:**
1. `sourceToPlatform` — 8 mappings + default fallback (trivial unit test, documents the contract)
2. `getLifetimeTotalsInternal` — verify aggregation with known input/output (convex-test)
3. `getDashboardSummaryByPeriodInternal` — verify `channels` is array, verify internal order discount correction preserved

---

### ISSUE 3: COGS Caveat Banner Uses Raw Tailwind Colors (Dark Mode Pattern Violation)
**Severity:** MEDIUM (pattern violation per CODE_STYLE.md)
**File:** `src/components/salesAnalytics/OverviewTab.tsx:1278-1285`

The BigSeller COGS caveat banner uses hardcoded `dark:` class overrides:
```tsx
<div className="... text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 ...">
```

Per CODE_STYLE.md "Dark Mode" section, the project standard is to use CSS variable tokens:
```tsx
// Should be:
<div className="... text-[var(--color-status-warning)] bg-[var(--color-status-warning-bg)] border border-[var(--color-status-warning)]/30 ...">
```

This is the ONLY raw dark-mode override in the Phase 30 diff. All other components correctly use the token system.

---

## Non-Blocking Observations

### OBS 1: Three Separate Color Maps (Drift Risk)
**Flagged by:** staffreview Improvement #1 — NOT addressed

Three independent color maps must stay in sync manually:
- `PLATFORM_COLORS` in `SalesChart.tsx` (hex codes for Recharts)
- `CHANNEL_COLORS` in `OverviewTab.tsx` (Tailwind classes for ChannelSummary)
- `platformColors` in `OverviewTab.tsx` (Tailwind classes for PlatformHierarchy)

When a 9th channel is added, the developer must update 3 locations. A shared `src/lib/channelColors.ts` module would eliminate this. Not blocking, but recommended as follow-up tech debt.

### OBS 2: No Empty State for LifetimeHero
When `data.totalUnits === 0`, the hero displays "0 units sold" with `Rp 0 lifetime revenue`. A dedicated empty state ("No sales data yet — sync your first channel to get started") would be more user-friendly. Not blocking — the current behavior is correct, just not elegant.

### OBS 3: Unsafe Type Cast in useLifetimeTotals
**File:** `src/hooks/convex/useExternalData.ts:175`
```typescript
setData(result as LifetimeTotals);
```
The action returns `Promise<unknown>` and we cast without runtime validation. This is consistent with the existing pattern (`useDashboardSalesSummaryByPeriod` does the same), so it's not a regression, but it's a project-wide weakness. If the backend shape changes, the frontend silently receives wrong data with no error.

### OBS 4: Full Table Scan Acknowledged
`getLifetimeTotalsInternal` scans both `externalRevenueItems` AND `externalRevenue` tables entirely. The code has a correct NOTE: "Full table scan — acceptable at current scale (~1K records). When externalRevenueItems exceeds ~50K rows, consider pre-aggregation (ANLY-04)." This is fine for now.

### OBS 5: getSyncHealthStatus Intentionally Unchanged
The staffreview flagged the 4th hardcoded platform array at `queries.ts:1009`. The plan and implementation correctly left it unchanged — `getSyncHealthStatus` tracks automated sync infrastructure (only k3mart/gobiz/internal), not analytics. The NOTE in the plan was sufficient.

---

## What Was Done Well

1. **Dynamic discovery pattern** — Instead of expanding the hardcoded array from 3→8, the code discovers platforms from data (`[...new Set(records.map(r => r.source))]`). This means platform 9 requires ZERO backend changes.
2. **Internal order discount correction preserved** — The special handling for internal orders (looking up real orders for pre-discount totals) survived the refactoring intact.
3. **No new reactive subscriptions** — Lifetime totals use the on-demand action fetch pattern, not `useQuery`. This prevents bandwidth regression.
4. **Clean removal of platformFilter** — The `PlatformFilter` type, state, Badge UI, and all references were completely removed. No dead code left behind.
5. **Color consistency across maps** — While there are 3 separate maps, all 3 are currently consistent (GoFood=teal, K3 Mart=blue, Direct=amber, etc.).
6. **Responsive grid** — ChannelSummary uses `grid-cols-2 md:grid-cols-3 lg:grid-cols-4` for graceful scaling to 7+ channels.

---

## Staffreview Recommendations Tracking

| # | Recommendation | Status | Notes |
|---|----------------|--------|-------|
| Critical 1 | Acknowledge getSyncHealthStatus 4th array | ✅ Done | Plan has explicit NOTE |
| Critical 2 | Add backend tests | ❌ Not done | See Issue 2 |
| Improve 1 | Extract color palette to shared module | ❌ Not done | See OBS 1 |
| Improve 2 | Add `bigseller` to sourceToPlatform | ✅ Done | `case "bigseller": return "BigSeller"` added |
| Improve 3 | Add `npm run test` to verification | ✅ Done | Plan includes it, all 633 pass |
| Improve 4 | Revenue Table filter removal specificity | ✅ Done | Cleanly removed |

---

## Lessons Learned (Document for Future Phases)

### LESSON 1: E2E Tests Drift When UI Features Are Removed
When removing a UI feature (platform filter badges), ALWAYS grep for references in `tests/e2e/` and update or delete affected tests. The Vitest unit tests (633 passing) don't cover E2E scenarios, so they won't catch this.

**Pattern to follow:**
```bash
# Before removing any UI element, check:
grep -rn "REMOVED_FEATURE_NAME" tests/e2e/ src/
```

### LESSON 2: Breaking Type Changes Need Tests
Changing `channels` from a fixed object `{ k3mart, gobiz, internal }` to a dynamic array `ChannelBreakdown[]` is a breaking type change. While TypeScript catches compile-time mismatches, it cannot verify runtime correctness (does the array contain the right data? are totals calculated correctly?). Backend tests with known input/output pairs are the safety net.

### LESSON 3: Color Maps Should Be Single-Source
Having 3 color maps for the same concept (hex for Recharts, Tailwind classes for CSS borders, Tailwind classes for CSS backgrounds) is a maintenance burden. Future phases should extract to a shared module when adding new platforms.

### LESSON 4: Dark Mode Pattern Compliance
The project has a CSS variable token system (`--color-status-*`) specifically to avoid scattered `dark:` class overrides. New components should use tokens first, raw Tailwind only for unique one-off colors not covered by the token system.

### LESSON 5: Action Return Type Safety
Convex actions return `Promise<unknown>`. Casting `result as SomeType` without validation is a project-wide pattern but creates silent failures. Consider adding a lightweight runtime shape check (e.g., `if (!result || typeof result !== 'object')`) for critical data paths.

---

## Fix Priority (Before Merge)

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| 1 | Fix E2E test US-8 (delete or rewrite) | 5 min | Prevents CI failure |
| 2 | Add `sourceToPlatform` unit test | 10 min | Documents mapping contract |
| 3 | Fix COGS banner dark mode tokens | 2 min | Pattern compliance |

---

*Generated by consolidated /staffreview + /code-review analysis*
*Staff Developer Review + Principal Developer Review + Code Implementation Review*
