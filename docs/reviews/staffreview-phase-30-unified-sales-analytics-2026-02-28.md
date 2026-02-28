# Staff Review: Phase 30 — Unified Sales Analytics

**Date:** 2026-02-28
**Plans:** `.planning/phases/30-unified-sales-analytics/30-01-PLAN.md`, `30-02-PLAN.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## Plan Structure Validation

### Plan 01 (Backend)
- [x] Git Workflow section: Branch `feature/phase-30-unified-sales-analytics`, checkpoints defined
- [x] Implementation Waves: Wave 1 Backend SEQUENTIAL, Wave 3 Verification SEQUENTIAL
- [x] Documentation Updates: CHANGELOG.md checkbox
- [x] Success Criteria: type-check + build + feature criteria

### Plan 02 (Frontend)
- [x] Git Workflow section: Same branch, checkpoints defined
- [x] Implementation Waves: Wave 1 Hook SEQUENTIAL, Wave 2 Components SEQUENTIAL, Wave 3 Verification SEQUENTIAL + Human
- [x] Documentation Updates: CHANGELOG.md checkbox
- [x] Success Criteria: type-check + build + visual criteria

Status: Plan structure validated

---

## 1. Summary

**Overall Assessment:** Revise (2 Critical, 4 Improvements)

Both plans are well-structured with clear task decomposition, correct dependency ordering, and comprehensive coverage of all 3 requirements. The core approach of "dynamic discovery from data instead of hardcoded arrays" is the right architectural choice. However, there are two critical issues: (1) a 4th hardcoded platform list in `getSyncHealthStatus` that the plan misses entirely, and (2) the `channels` type change breaks the ChannelSummary component's property access pattern mid-task (type error in Task 1 that only resolves in Task 2), creating an undeployable intermediate state. Additionally, the plans have no backend tests whatsoever.

---

## 2. Critical Issues (Must Fix)

| # | Issue | Category | Location in Plan |
|---|-------|----------|------------------|
| 1 | 4th hardcoded platform array missed: `getSyncHealthStatus` (line 980) | Completeness | Plan 01 — not mentioned |
| 2 | No backend tests for any refactored queries | Testing | Plan 01 — all 3 tasks lack TDD |

**Details:**

### Issue 1: Missed Hardcoded Platform Array in getSyncHealthStatus

`convex/externalData/queries.ts` line 980 contains:
```typescript
const platforms = ["k3mart", "gobiz", "internal"] as const;
```

This is the **public** `getSyncHealthStatus` query used by the sync health cards in the OverviewTab header. While Plan 01's verification step says "Verify no hardcoded `["gobiz", "k3mart", "internal"]` arrays remain", it only refactors 3 of the 4 occurrences.

**However:** This query has different semantics — it tracks sync infrastructure health per platform, not revenue. Platforms like GrabFood and BigSeller have their own dedicated sync health UIs (GrabFood Manager, BigSeller Sync Panel). Consignment doesn't sync at all (manual entry). So this array should arguably stay limited to platforms with automated sync.

**Recommendation:** Add a note in Plan 01 acknowledging this 4th occurrence exists and explicitly stating it's intentionally not refactored because `getSyncHealthStatus` tracks automated sync health (only k3mart/gobiz/internal have automated sync). This prevents the executor from either (a) missing it and leaving it as an unintentional oversight, or (b) blindly expanding it to include platforms that don't have sync infrastructure.

### Issue 2: No Backend Tests

Plan 01 modifies 3 critical analytics queries that power the entire Sales Analytics page. The refactoring from fixed-object to dynamic-array `channels` is a breaking change. Yet there are:
- No unit tests for `sourceToPlatform()` (trivial but documents the mapping)
- No integration tests verifying `getDashboardSummaryByPeriodInternal` returns the correct dynamic array shape
- No tests verifying `getLifetimeTotalsInternal` aggregation logic
- No existing test directory (`convex/externalData/__tests__/` does not exist)
- `npm run test` not mentioned in Plan 01's verification (only type-check and build)

**Recommendation:** Add a Task 0 or append to Task 3 with:
1. Create `convex/externalData/__tests__/sourceToPlatform.test.ts` — verify all 7 mappings + default fallback
2. At minimum, add `npm run test` to Plan 01's Wave 3 verification alongside type-check and build
3. Consider integration tests for `getLifetimeTotalsInternal` aggregation with `convex-test` — but this is lower priority since the query is new (not a regression risk)

---

## 3. Improvements (Recommended)

| # | Improvement | Impact | Effort |
|---|-------------|--------|--------|
| 1 | Extract color palette to a shared constant | High | Low |
| 2 | Guard `bigseller` source in `sourceToPlatform` | Medium | Low |
| 3 | Add `npm run test` to verification waves | Medium | Low |
| 4 | Revenue Table filter removal needs more specificity | Medium | Medium |

**Details:**

### Improvement 1: Extract Color Palette to Shared Constant

Plan 02 creates **three separate color maps** that must stay in sync:
- `PLATFORM_COLORS` in SalesChart.tsx (hex codes for Recharts)
- `CHANNEL_COLORS` in OverviewTab.tsx (Tailwind classes for ChannelSummary)
- `platformColors` in OverviewTab.tsx (Tailwind classes for PlatformHierarchy)

These will inevitably drift. When a new channel is added, the developer must update 3 files in 3 different locations.

**Recommendation:** Create a `src/lib/channelColors.ts` shared module:
```typescript
export const CHANNEL_PALETTE = {
  gobiz:       { hex: "#14b8a6", tw: "teal-500" },
  k3mart:      { hex: "#3b82f6", tw: "blue-500" },
  internal:    { hex: "#f59e0b", tw: "amber-500" },
  grabfood:    { hex: "#22c55e", tw: "green-500" },
  shopee:      { hex: "#f97316", tw: "orange-500" },
  tiktok:      { hex: "#8b5cf6", tw: "violet-500" },
  consignment: { hex: "#a855f7", tw: "purple-500" },
} as const;
```
All 3 consumers derive from this single source. Not blocking, but strongly recommended.

### Improvement 2: Guard `bigseller` Source in sourceToPlatform

The `externalSource` union includes 8 values, but `sourceToPlatform()` only maps 7 (missing `bigseller`). While BigSeller orders are stored with their actual platform source (`shopee`/`tiktok`), the `externalRevenue` table may still contain records with `source: "bigseller"` from older sync logic or edge cases.

**Recommendation:** Add `case "bigseller": return "BigSeller";` to the switch. Defensive — costs nothing, prevents a raw `"bigseller"` string from appearing in the UI.

### Improvement 3: Add `npm run test` to Verification Waves

Plan 01's Wave 3 only runs `npm run type-check` and `npm run build`. Existing tests (other modules) could regress from the type changes. Add `npm run test` after type-check.

### Improvement 4: Revenue Table Filter Removal Specificity

Plan 02, Task 2, Step 8 says "remove the radio buttons from the Revenue Table" but the RevenueTable is a sub-component within OverviewTab that accepts `platformFilter` as a prop. The plan lists 5 sub-steps but doesn't specify that the `useExternalRevenue` query is fetched in OverviewTab (line 968), not in RevenueTable. The `platformFilter` state variable controls which source parameter is passed to `useExternalRevenue`.

**Recommendation:** Clarify that:
1. Keep `useExternalRevenue` call with `source: undefined` (fetches all)
2. Remove `platformFilter` state and `setPlatformFilter` calls from OverviewTab
3. Remove `PlatformFilter` type (only used in OverviewTab)
4. Remove the Badge-based filter buttons (lines 1226-1264)
5. Remove `platformFilter` prop from RevenueTable, simplify component
6. Keep `useStoreGrouping` logic but trigger it when `revenueRecords` only contains k3mart records (or remove entirely since legend handles filtering)

---

## 4. Refinements (Minor Suggestions)

- **Color naming:** `GoFood` display name uses `teal-500` but GoFood's brand color is red. The plan acknowledges this is a deliberate choice (teal for GoFood to avoid 3 reds), but a comment in the code would help future devs.
- **Lifetime hero loading skeleton:** The plan shows a `<Skeleton className="h-16 w-full" />` which is 64px — the actual hero card with expanded table could be much taller. Consider a more accurate skeleton.
- **Product name deduplication:** `getLifetimeTotalsInternal` groups unmapped items by exact `productName` string. "Frollie Original 80g" and "Frollie Original (80g)" would be separate entries. This is fine for now but worth noting.
- **Empty state:** LifetimeHero shows loading skeleton but no empty state for when `data.totalUnits === 0`. Consider showing "No sales data yet" instead of "0 units sold".

---

## 5. Duplication Analysis

### Existing Code to Leverage
| Existing Code | Location | How to Use |
|---------------|----------|------------|
| `PlatformBadge` | `src/components/salesAnalytics/OverviewTab.tsx` | Already handles all 8 platform types with distinct colors — no changes needed |
| `GrowthIndicator` | `src/components/salesAnalytics/OverviewTab.tsx` | Already handles `previous=0` → "New" badge — reuse in ChannelSummary |
| `formatCurrency` | `src/lib/utils.ts` | Already used in OverviewTab — use in LifetimeHero |
| `useBigSellerOrderStats` | `src/hooks/convex/useBigSeller.ts` | Already returns `allCostFeeZero` — no new query needed |
| `aggregatePlatformChannel()` | `convex/externalData/queries.ts:506` | Existing pure function — reuse in dynamic refactor, don't rewrite |

### Potential Duplication Risks
- **Three color maps** (SalesChart, ChannelSummary, PlatformHierarchy) — see Improvement 1
- `sourceToPlatform()` logic partially duplicated in `PlatformBadge` component (different purpose — badge styling vs display name, but source→display mapping is shared knowledge)

---

## 6. Phase/Wave Accuracy

| Plan | Wave | Assessment | Notes |
|------|------|------------|-------|
| 01 Task 1 | Wave 1 | Good | sourceToPlatform must change before other queries |
| 01 Task 2 | Wave 1 | Good | getDashboardSummary refactor — core change |
| 01 Task 3 | Wave 1 | Good | New query, no dependencies on Tasks 1-2 but same file |
| 02 Task 1 | Wave 2 | Good | Type change must land before component changes |
| 02 Task 2 | Wave 2 | Needs attention | Very large task (8 steps across 3 files) |
| 02 Task 3 | Wave 2 | Good | Human verify at end |

**Ordering Issues:**
- Plan 02, Task 2 is overloaded — 8 steps touching SalesChart, OverviewTab (ChannelSummary, PlatformHierarchy, LifetimeHero, COGS caveat), and SalesAnalytics.tsx. Consider splitting into 2 tasks: (a) chart + channel refactor, (b) lifetime hero + COGS + cleanup. This makes debugging easier if type-check fails mid-task.

**Missing Phases:**
- None — 2 plans in 2 waves is correct for this scope.

---

## 7. Specialist Agent Recommendations

| Plan | Task | Recommended Agent | Rationale |
|------|------|-------------------|-----------|
| 01 | Tasks 1-3 | `convex-backend` | Pure backend query refactoring in Convex |
| 02 | Task 1 | `react-ui-builder` | Hook type + new hook |
| 02 | Task 2 | `react-ui-builder` | Frontend component work |
| 02 | Task 3 | Human | Visual verification |

---

## 8. Git Workflow Assessment

### Branch Strategy
| Assessment | Status |
|------------|--------|
| Feature branch specified | Yes (`feature/phase-30-unified-sales-analytics`) |
| Branch naming convention | Correct |
| Merge strategy documented | Implicit (same branch for both plans) |

### Commit Strategy
| Plan | Expected Commits | Commit Type | Notes |
|------|------------------|-------------|-------|
| 01 Task 1 | 1 | refactor | sourceToPlatform + getRevenueTimeSeries |
| 01 Task 2 | 1 | refactor | getDashboardSummary + getRevenueByOutlet |
| 01 Task 3 | 1 | feat | getLifetimeTotals |
| 02 Task 1 | 1 | refactor | Type change + hook |
| 02 Task 2 | 2-3 | feat | Components (consider splitting) |

### Pre-Push Verification
- [x] Plan includes `npm run build` check
- [x] Plan includes `npm run type-check` verification
- [ ] Plan includes `npm run test` — **Missing from Plan 01 Wave 3**

### CI/CD Considerations
| Concern | Assessment |
|---------|------------|
| Rollback strategy | Not documented (git revert sufficient) |
| Deployment order | Correct — backend first (Plan 01), then frontend (Plan 02) |
| Data backup needed | No — no schema changes |
| Migration safety | Safe — no schema changes, only query logic |

---

## 9. Documentation Checkpoints

| Plan | Documentation Update Required |
|------|-------------------------------|
| After Plan 02 | docs/CHANGELOG.md |
| After Plan 02 | docs/SCHEMA.md — no changes needed (no schema changes) |
| After Plan 02 | docs/API_REFERENCE.md — consider noting the channels type change |

### CHANGELOG.md Entry (Draft)
```markdown
## 2026-02-28 - Unified Sales Analytics (Phase 30)

**All revenue channels unified in Sales Analytics dashboard.**

- Stacked bar chart shows all 7+ channels (GoFood, GrabFood, K3 Mart, Shopee, Tokopedia, Direct, Consignment) with distinct colors
- Channel breakdown dynamically built from backend data (no hardcoded 3-channel list)
- Lifetime units sold hero card with per-product breakdown table (always shows all-time data)
- Interactive legend-as-filter: click chart legend to toggle channels on/off
- BigSeller COGS caveat banner when Shopee/Tokopedia margins unavailable
- Revenue Table simplified: always shows all channels (per-channel filter removed)
- Platform hierarchy extended with consistent colors for all channels

**Requirements:** ANLY-01, ANLY-02, ANLY-03
```

---

## 10. Testing Plan Assessment

**Overall Testing Verdict:** Missing

### Planned Tests
| Layer | What's Tested | Test Type | Status |
|-------|---------------|-----------|--------|
| Backend | sourceToPlatform mapping | Unit test | **Missing** |
| Backend | getDashboardSummaryByPeriodInternal dynamic channels | convex-test | **Missing** |
| Backend | getLifetimeTotalsInternal aggregation | convex-test | **Missing** |
| Frontend | ChannelSummary dynamic rendering | Component test | **Missing** |
| Frontend | LifetimeHero expand/collapse | Component test | **Missing** |
| Integration | All channels in chart | Manual (Task 3) | Planned |

### Missing Test Coverage (Must Add)

| # | Missing Test | Why It Matters | Suggested Approach |
|---|--------------|----------------|-------------------|
| 1 | `sourceToPlatform` all 7 mappings + default | Documents the mapping contract, prevents regression if someone adds a source | Simple unit test file |
| 2 | Dynamic channels shape from aggregate | The fixed→array type change is breaking — regression must be caught | convex-test with mock externalRevenue records |
| 3 | Existing test suite `npm run test` in Plan 01 | Other modules may break from type changes | Add `npm run test` to verification wave |

### Test Execution Checkpoints
1. After Plan 01: `npm run test` (all existing tests still pass)
2. After Plan 02 Task 1: `npm run type-check` (may fail — expected, resolved in Task 2)
3. After Plan 02 Task 2: `npm run type-check && npm run build && npm run test`
4. Before merge: Full `npm run test && npm run build`

### Regression Risk
- `DashboardSummaryByPeriod` type change will break any component that accesses `channels.k3mart` — scan for all usages
- `PlatformFilter` type removal affects `RevenueTable` and `OverviewTab` — ensure all references cleaned up
- `PLATFORM_COLORS` widening from literal type to `Record<string, string>` may cause TypeScript issues in places that rely on `keyof typeof`

---

## 11. Edge Cases to Address

The plan should explicitly handle:

- [ ] **What if externalRevenueItems has 0 records?** `getLifetimeTotalsInternal` returns empty products array and totalUnits=0 — LifetimeHero should show empty state, not "0 units sold"
- [ ] **What if a source exists in externalRevenue but not in externalRevenueItems?** (e.g., consignment settlements create externalRevenue but not externalRevenueItems) — lifetime totals won't count consignment, but that may be intentional since consignment settlements don't have line-item granularity
- [ ] **What if channels array is empty in getDashboardSummaryByPeriodInternal?** (no revenue data at all) — ChannelSummary should handle gracefully (only show "All Channels" segment with zeros)
- [ ] **Color fallback for unknown sources:** Both `CHANNEL_COLORS` and `platformColors` use fallback (`?? "border-t-gray-500"`, `?? platformColors.internal`) — good, but verify the fallback exists in the map

---

## 12. Approval Conditions

**For Approval, address:**
1. **Critical 1:** Acknowledge the 4th hardcoded platform array in `getSyncHealthStatus` — either add a note explaining it's intentionally unchanged, or refactor it
2. **Critical 2:** Add `npm run test` to Plan 01's verification wave and add at least `sourceToPlatform` unit tests

**Recommended before implementation:**
1. Extract color palette to shared module (Improvement 1)
2. Add `case "bigseller"` to sourceToPlatform (Improvement 2)
3. Clarify Revenue Table filter removal steps (Improvement 4)

---

*Generated by /staffreview skill*
*Staff Developer Review + Principal Developer Review*
