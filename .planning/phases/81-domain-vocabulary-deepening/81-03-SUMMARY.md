---
phase: 81-domain-vocabulary-deepening
plan: 03
subsystem: api
tags: [platform, taxonomy, refactor, eslint, type-safety]

# Dependency graph
requires:
  - phase: 81-domain-vocabulary-deepening
    provides: 81-01 phase context (CONTEXT.md, PATTERNS.md, ESLint scaffold), 81-02 ESLint extension pattern (no-restricted-imports paths + patterns shape)
provides:
  - "Canonical Platform vocabulary module (convex/reports/platform.ts) with 8-literal Platform union, resolvePlatform({source, underlyingSource?, orderChannel?}) → {platform, confidence}, isPlatform runtime guard, platformDisplay forward-compat chokepoint"
  - "Migrated 12 backend + 9 frontend callsites onto resolvePlatform/platformDisplay"
  - "Deleted 3 legacy artifacts (sourceToPlatform function, channelTaxonomy.ts file, sourceToPlatform.test.ts file)"
  - "D-02 user-visible rename shipped: source 'tiktok' renders as 'TikTok' (not 'Tokopedia'); palette color shifted red→violet; 'K3 Mart' → 'K3Mart' (no space); D-04 'Other' literal eliminated from Platform union"
  - "ESLint no-restricted-imports rule extended with 4 ban entries (5 banned exports across 2 deleted modules) — cumulative phase 81 ban list now 9 entries (5 from Plan 02 + 4 from Plan 03)"
  - "Behavior change closing CONTEXT.md ambiguity 138: source='grabfood' now resolves to Platform='GrabFood' (separate from 'GoFood', formerly collapsed by sourceToDisplayChannel)"
affects: [82, 83, future-analytics, future-channel-routing, ADR-0001-cutover]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composable resolver returning {value, confidence} so callers compose with worstConfidence (avoids double-downgrading rows already at 'inferred')"
    - "Local sugar helper (e.g. ProductInventorySettings.displayPlatform) to keep verbose canonical chain readable at high-density usage sites"
    - "Deferred-feature TODO with un-skip pointer in test (Test 10 for linkedMenuProductId.source lookup, pending ADR-0001 schema field)"
    - "ESLint stub-then-revert verification for ban additions"

key-files:
  created:
    - convex/reports/platform.ts
    - convex/reports/__tests__/platform.test.ts
  modified:
    - convex/lib/externalSource.ts (sourceToPlatform deleted)
    - convex/reports/unitEconomics.ts (12 call sites migrated)
    - convex/reports/incomeStatement.ts (3 call sites)
    - convex/externalData/queries.ts (2 call sites)
    - convex/externalData/helpers/dashboardHelpers.ts (2 call sites)
    - src/lib/platformColors.ts (Tokopedia + Other entries dropped, GrabFood + BigSeller added)
    - src/components/bankReconciliation/InlineRevenueDialog.tsx
    - src/components/channelIntegration/ChannelFlagRow.tsx
    - src/components/channelIntegration/ResolutionPreviewPanel.tsx
    - src/components/channelIntegration/SourceBadge.tsx
    - src/pages/ChannelRoutingManager.tsx (5 call sites)
    - src/pages/ProductInventorySettings.tsx (7 call sites via local helper)
    - src/contexts/AnalyticsFilterContext.tsx (clean rename DisplayChannel→Platform)
    - src/components/analytics/AnalyticsFilterBar.tsx (consumer update for clean rename)
    - eslint.config.js (4 new ban entries)
    - tests/convex/unitEconomics.test.ts (test renamed to reflect grabfood→GrabFood D-05 behavior change)
    - convex/reports/__tests__/unitEconomics.test.ts (Phase 80.3 historical comment cleaned)
  deleted:
    - convex/reports/channelTaxonomy.ts
    - convex/externalData/__tests__/sourceToPlatform.test.ts

key-decisions:
  - "Platform literal union has exactly 8 literals — no 'Other' (D-04). Order: Direct first, marketplace cluster alphabetical, BigSeller last (transitional per D-03)."
  - "resolvePlatform is sync-only today — linkedMenuProductId.source lookup branch dropped per staffreview I1 (menuProducts has no source field). When ADR-0001 schema field lands, re-add as Promise-returning + un-skip Test 10."
  - "orderChannel overload prioritized over source → eliminates need for parallel resolveOrderChannelPlatform helper. 'tokopedia' orderChannel literal kept as deprecated synonym for 'tiktok' → 'TikTok' (CONTEXT.md ambiguity 137)."
  - "buildChartColorMap parameter signature kept generic ((source: string) => string) — callers pass `(s) => platformDisplay(resolvePlatform({ source: s as ExternalSource }).platform)` rather than importing the resolver into the palette module."
  - "src/lib/channels.ts NOT touched (out of scope) — that's a per-orders.channel registry at a different abstraction layer; its 'tokopedia' key matches the legacy orders.channel literal still in DB."
  - "L1 clean rename: AnalyticsFilterContext re-exports PLATFORMS + Platform without DisplayChannel alias. AnalyticsFilterBar updated as required consumer."
  - "Behavior change: source='grabfood' resolves to Platform='GrabFood' (NOT 'GoFood'). The legacy collapse closed by D-05 surfaced one stale integration test (renamed test + assertion to match new canonical behavior)."

patterns-established:
  - "Pattern 1: ResolvePlatformRow union arg shape — single resolver handles source-only, source+underlyingSource (D-03 forward-compat), and orderChannel-overload paths from a unified row argument"
  - "Pattern 2: Deferred-feature TODO marker — signature stays sync today, feature un-skip tied to an ADR + schema field landing event"
  - "Pattern 3: ESLint paths + patterns dual-entry — paths block npm-style imports, patterns block all relative-path glob variants (caller paths differ between src/ and convex/)"

requirements-completed: []

# Metrics
duration: ~75 min (resumed across 2 sessions)
completed: 2026-05-11
---

# Phase 81 Plan 03: C1 Platform Resolver Consolidation Summary

**Single canonical Platform vocabulary (convex/reports/platform.ts) with composable resolvePlatform({source, underlyingSource?, orderChannel?}) → {platform, confidence}, replacing 3 conflicting legacy mappers across 21 callsites; ships D-02 user-visible rename (Tokopedia→TikTok red→violet, K3 Mart→K3Mart) and closes ambiguity 138 (grabfood now distinct from GoFood).**

## Performance

- **Duration:** ~75 min (split across 2 sessions due to mid-plan usage limit)
- **Tasks:** 8 (all complete)
- **Files modified:** 16 (2 created, 12 modified, 2 deleted)
- **Tests added:** 37 (in new platform.test.ts; 1 skipped pending ADR-0001 schema field)

## Accomplishments

- Single canonical Platform module with 8-literal union — no 'Other' fallback (D-04), 'BigSeller' transitional (D-03 fades when underlyingSource schema field lands)
- 21 call sites migrated (12 backend + 9 frontend)
- 3 deletions, no shims (D-10): sourceToPlatform function, channelTaxonomy.ts file, sourceToPlatform.test.ts file
- D-02 user-visible rename shipped: 'tiktok' source now correctly renders as 'TikTok' (legacy bug had it as 'Tokopedia'); chart palette color shifted red (#ef4444) → violet (#8b5cf6); 'K3 Mart' → 'K3Mart' (no space)
- ESLint no-restricted-imports extended with 4 ban entries covering 5 banned exports across 2 deleted modules (cumulative phase 81 ban list = 9 entries)
- Behavior change: source='grabfood' now resolves to Platform='GrabFood' (legacy sourceToDisplayChannel collapsed grabfood + gobiz → 'GoFood'; D-05 closes ambiguity 138)
- All 4 quality gates green: type-check, lint (524 baseline preserved, no new errors), test (1825 passed, 3 skipped, 37 new platform tests all green), build (4210 modules, 26s)

## Task Commits

1. **Task 3.1 (RED):** test(81-03): add failing tests for resolvePlatform module (RED) — `6bf17f6f`
2. **Task 3.1 (GREEN) + 3.2:** feat(81-03): add canonical Platform module (GREEN) — `495714a7`
3. **Task 3.3 (Backend Group A):** refactor(81-03): migrate backend group A callsites to resolvePlatform — `af15d622`
4. **Task 3.4 (unitEconomics highest-risk):** refactor(81-03): migrate unitEconomics to resolvePlatform — `9663ea93`
5. **Tasks 3.5 + 3.7a (Frontend + comment cleanup):** refactor(81-03): migrate frontend callsites to resolvePlatform — `ccc40219`
6. **Task 3.6 (Deletions):** refactor(81-03): delete legacy mappers + dead test (D-10) — `b010a81c`
7. **Task 3.7 (ESLint):** chore(81-03): extend no-restricted-imports rule with C1 deletions — `7e586cad`

## Platform Literal Union (Final)

```typescript
export const PLATFORMS = [
  "Direct",       // internal source
  "GoFood",       // gobiz source
  "GrabFood",     // grabfood source (D-05: distinct from GoFood)
  "Shopee",       // shopee source
  "TikTok",       // tiktok source (D-02: NOT "Tokopedia")
  "K3Mart",       // k3mart source (D-02: no space)
  "Consignment",  // consignment source
  "BigSeller",    // bigseller source — transitional (D-03 fades on ADR-0001 schema field)
] as const;
export type Platform = (typeof PLATFORMS)[number];
```

## resolvePlatform Signature + Composability

```typescript
export function resolvePlatform(
  row: {
    source: ExternalSource;
    underlyingSource?: ExternalSource;  // D-03 forward-compat
    orderChannel?: string;               // PATTERNS.md finding #6 overload
  }
): { platform: Platform; confidence: Confidence }
```

**Resolution priority:**
1. `orderChannel` (if set) — `ORDER_CHANNEL_TO_PLATFORM` map; default 'Direct'; 'tokopedia' → 'TikTok' (deprecated synonym, ambiguity 137)
2. `source === "bigseller"` →
   - 2a. `underlyingSource` if present and not "bigseller" → corresponding Platform + confidence='inferred' (ADR-0001 forward-compat — schema field doesn't exist today, branch is dead code until lands)
   - 2b. Fallback: 'BigSeller' transitional + confidence='inferred'
3. `source` via `SOURCE_TO_PLATFORM` map → Platform + confidence='exact'

The {platform, confidence} return shape lets callers compose with `worstConfidence` (analog: convex/reports/incomeStatement.ts:333-335) without double-downgrading rows already at 'inferred'.

## Deferred Feature: linkedMenuProductId Lookup (TODO)

**Status:** Branch removed per staffreview I1 — sync-only today. Test 10 (`bigseller + linkedMenuProductId → linked product source's Platform + inferred`) is `it.skip(...)` with pointer to convexTest harness analog at `convex/integrations/k3mart/__tests__/cascade.test.ts`.

**Why:** `convex/schema.ts:93-118` defines `menuProducts` table with NO `source` field. Adding the lookup branch would create dead code (`product.source` always undefined) and require a `ctx?: QueryCtx` parameter that breaks the sync-only signature.

**TODO grep target:** Search for `TODO(ADR-0001)` in the codebase. Two markers (one in platform.ts, one in platform.test.ts) tied to the ADR-0001 schema-field-landing event:
- `convex/reports/platform.ts` (top-of-file JSDoc + inline note in resolvePlatform)
- `convex/reports/__tests__/platform.test.ts:51-60` (it.skip block)

**Un-skip checklist (when ADR-0001 schema field lands):**
1. Add `menuProducts.source: v.optional(externalSourceValidator)` to schema
2. Add `linkedMenuProductId?: Id<"menuProducts">` + `ctx?: QueryCtx` params to ResolvePlatformRow
3. Implement async lookup branch in resolvePlatform (between 2a and 2b)
4. Make resolvePlatform return `Promise<{platform, confidence}>` and migrate all 21 callsites to await
5. Un-skip Test 10 + implement using convexTest harness pattern
6. Drop the TODO(ADR-0001) markers from platform.ts and platform.test.ts

## Callsite Migration Summary

**Backend (12 sites across 5 files):**
- `convex/externalData/queries.ts` — 2 sites (lines 1502, 1594; commit `af15d622`)
- `convex/externalData/helpers/dashboardHelpers.ts` — 2 sites (lines 95, 110; commit `af15d622`)
- `convex/reports/incomeStatement.ts` — 3 sites (lines 339, 389, 431; commit `af15d622`)
- `convex/reports/unitEconomics.ts` — 12 sites (lines 115, 218, 240, 374, 390, 441, 641, 651, 716, 724, 1063, 1064; commit `9663ea93`)
- `tests/convex/unitEconomics.test.ts` — 1 test renamed for D-05 behavior change (commit `b010a81c`)

**Frontend (9 sites across 9 files):**
- `src/lib/platformColors.ts` — palette pruning (Tokopedia, Other dropped; GrabFood, BigSeller added)
- `src/components/bankReconciliation/InlineRevenueDialog.tsx` — 1 site
- `src/components/channelIntegration/ChannelFlagRow.tsx` — 1 site
- `src/components/channelIntegration/ResolutionPreviewPanel.tsx` — 1 site
- `src/components/channelIntegration/SourceBadge.tsx` — 1 site
- `src/pages/ChannelRoutingManager.tsx` — 5 sites
- `src/pages/ProductInventorySettings.tsx` — 7 sites consolidated through local `displayPlatform()` sugar
- `src/contexts/AnalyticsFilterContext.tsx` — clean rename (DisplayChannel → Platform, no alias per L1)
- `src/components/analytics/AnalyticsFilterBar.tsx` — consumer update for L1 clean rename

## Deletions (D-10 — No Shims)

| Artifact | Type | Why Deleted | Replacement |
|----------|------|-------------|-------------|
| `sourceToPlatform` (function in `convex/lib/externalSource.ts`) | Function | Conflicted with channelTaxonomy.ts mappers; bug `tiktok→Tokopedia` and inconsistent spacing `K3 Mart` vs `K3Mart` | `platformDisplay(resolvePlatform({source}).platform)` from `convex/reports/platform` |
| `convex/reports/channelTaxonomy.ts` | Whole file | DisplayChannel union had `Other` (D-04 violation), `Tokopedia` (D-02 stale), and collapsed gobiz+grabfood → GoFood (ambiguity 138) | `Platform` / `resolvePlatform` / `platformDisplay` from `convex/reports/platform` |
| `convex/externalData/__tests__/sourceToPlatform.test.ts` | Whole file | Tested deleted function; cases migrated | `convex/reports/__tests__/platform.test.ts` (37 tests, 1 skipped) |

## ESLint Banned-Imports List (Cumulative Phase 81)

| Plan | Module | Banned Exports |
|------|--------|----------------|
| 02 | `convex/staffAttendance/flagEngine` | `toWibDateString` |
| 02 | `convex/gofoodDepot/helpers` | `getWibDateString`, `getWibDateStringDaysAgo` |
| 02 | `convex/lib/counter` | `getWibDateStr` (renamed to `getWibMonthDayStr`) |
| 03 | `convex/lib/externalSource` | `sourceToPlatform` |
| 03 | `convex/reports/channelTaxonomy` | (entire module — file deleted) `toDisplayChannel`, `sourceToDisplayChannel`, `DisplayChannel`, `DISPLAY_CHANNELS` |

Each entry has a `paths` block (npm-style import ban) AND a `patterns` block (relative-path glob ban — `**/path` covers caller relative paths from both src/ and convex/). Stub-then-revert verification confirmed both Plan 03 ban entries (sourceToPlatform + DisplayChannel) fire with the canonical-replacement directive.

## D-02 Display Rename Details

**Tokopedia → TikTok**
- Source key `tiktok` previously rendered as 'Tokopedia' via `sourceToPlatform`. Now renders as 'TikTok' via canonical resolver.
- `src/lib/platformColors.ts` palette: Tokopedia entry deleted (color was red `#ef4444`). TikTok entry already existed with violet `#8b5cf6` — surviving canonical entry. Net effect on chart legends: red → violet color shift.
- 'tokopedia' kept as deprecated `orderChannel` literal synonym → 'TikTok' (CONTEXT.md ambiguity 137: post-2023 Tokopedia/TikTok-Shop merger).

**K3 Mart → K3Mart**
- Source key `k3mart` previously rendered as 'K3 Mart' (with space) via `sourceToPlatform` legacy. Now renders as 'K3Mart' (no space) consistently. The space existed only in the now-deleted mapper; `channelTaxonomy.ts` already used the canonical 'K3Mart' spelling.

**'Other' eliminated (D-04)**
- Removed from `src/lib/platformColors.ts` palette. Sources unmapped to a Platform now fall through to FALLBACK gray (acceptable per D-04 rationale: "every Source must resolve cleanly").

## Behavior Change: D-05 Closes Ambiguity 138

**Before (channelTaxonomy.ts):** `sourceToDisplayChannel("grabfood") === "GoFood"` (collapsed with gobiz)

**After (platform.ts):** `resolvePlatform({source: "grabfood"}).platform === "GrabFood"` (distinct from GoFood)

**Surfaced regression:** `tests/convex/unitEconomics.test.ts:824` integration test was named "GoFood externalRevenue row..." but seeded `source: "grabfood"`. Test renamed + assertion updated to expect `channel === "GrabFood"`. Inline comment captures the ambiguity-138 closure for future reviewers.

## Decisions Made

See key-decisions in frontmatter (7 decisions captured).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale doc comments in unitEconomics.ts**
- **Found during:** Task 3.4 (post-migration grep)
- **Issue:** Two file-top comments referenced `channelTaxonomy.ts` (line 33) and `Tokopedia` (line 72) — surface-level cosmetic but would have been caught by Task 3.8's strict grep
- **Fix:** Updated comment 1 to reference `platform.ts (Phase 81 — replaced channelTaxonomy.ts)`; updated comment 2 to remove Tokopedia from external-stream platform list with a "retired Phase 81 → TikTok per D-02" note
- **Files modified:** `convex/reports/unitEconomics.ts` (lines 33-34, 69-74)
- **Verification:** `grep -n "channelTaxonomy\|Tokopedia" convex/reports/unitEconomics.ts` returns only the new, intentional references
- **Committed in:** `9663ea93` (Task 3.4 commit)

**2. [Rule 2 - Missing Critical] Missing GrabFood + BigSeller display palette entries**
- **Found during:** Task 3.5 (platformColors.ts edit)
- **Issue:** After deleting Tokopedia + Other entries, the display palette had only 5 of the 8 Platform literals (Shopee, GoFood, K3Mart, Direct, Consignment, TikTok). Per the plan's `must_haves.truths`: "Color palette aligned with Platform literal union". Missing GrabFood and BigSeller entries would cause grey FALLBACK rendering when those Platforms appear in charts
- **Fix:** Added GrabFood entry (green theme, mirrors GoFood since both are Grab/Gojek delivery clusters) and BigSeller entry (gray theme, mirrors the source-key entry since it's a transitional Platform)
- **Files modified:** `src/lib/platformColors.ts`
- **Verification:** All 8 Platform literals have palette entries; type-check + tests + build green
- **Committed in:** `ccc40219` (Tasks 3.5 + 3.7a commit)

**3. [Rule 1 - Bug surfaced] Integration test conflated grabfood source with GoFood channel**
- **Found during:** Task 3.6 (post-deletion test run)
- **Issue:** `tests/convex/unitEconomics.test.ts:824` was named "GoFood externalRevenue row..." but seeded `source: "grabfood"`. The test passed pre-Plan-03 because `sourceToDisplayChannel` collapsed grabfood + gobiz → "GoFood". Per D-05 (closing ambiguity 138), grabfood now correctly resolves to "GrabFood" — distinct from "GoFood"
- **Fix:** Renamed test to "GrabFood externalRevenue row...", updated `productName` from "Original GoFood" to "Original GrabFood", updated assertion to find `channel === "GrabFood"`, added inline comment capturing the D-05 ambiguity-138 closure
- **Files modified:** `tests/convex/unitEconomics.test.ts` (lines 824-876)
- **Verification:** Full unitEconomics test file passes (24/24 tests)
- **Committed in:** `b010a81c` (Task 3.6 commit)

---

**Total deviations:** 3 auto-fixed (1 cosmetic comment fix, 1 missing-critical palette completeness, 1 surfaced regression from D-05 behavior change)
**Impact on plan:** All three are necessary for plan completeness — none expand scope. Deviation #3 actually validates the plan's purpose (D-05 mechanically caught a test-data bug).

## Issues Encountered

- **Mid-plan usage limit (between commits af15d622 and 9663ea93):** Resumed in a fresh session with the in-flight `unitEconomics.ts` migration uncommitted in working tree. Verified the diff matched plan intent + ran tests before committing. No work lost.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All four quality gates green (type-check, lint baseline preserved at 524, test 1825 passed + 3 skipped, build 4210 modules in 26s)
- Plan ready for triple-review per D-09 (orchestrator runs after this plan completes; do not run from inside the executor)
- Plan 81-04 (final phase plan) can pick up from here for STATE.md / ROADMAP.md / CHANGELOG.md / SCHEMA.md / API_REFERENCE.md updates
- ADR-0001 schema-field-landing (deferred phase) will un-skip Test 10 and add the linkedMenuProductId lookup branch — TODO markers in place

## Self-Check: PASSED

**Files created (verified exist):**
- `convex/reports/platform.ts` — FOUND
- `convex/reports/__tests__/platform.test.ts` — FOUND

**Files deleted (verified absent):**
- `convex/reports/channelTaxonomy.ts` — ABSENT
- `convex/externalData/__tests__/sourceToPlatform.test.ts` — ABSENT

**Commits (verified in git log):**
- `6bf17f6f` test(81-03): add failing tests — FOUND
- `495714a7` feat(81-03): add canonical Platform module — FOUND
- `af15d622` refactor(81-03): backend group A — FOUND
- `9663ea93` refactor(81-03): unitEconomics — FOUND
- `ccc40219` refactor(81-03): frontend callsites — FOUND
- `b010a81c` refactor(81-03): delete legacy mappers — FOUND
- `7e586cad` chore(81-03): extend ESLint rule — FOUND

**Quality gates:**
- `npm run type-check` — PASSED
- `npm run lint` — 524 baseline preserved (no new errors)
- `npm run test` — 1825 passed, 3 skipped (was 1824 + 2 skipped pre-plan; +1 test from grabfood/GrabFood rename, +1 skipped from Test 10 deferred)
- `npm run build` — PASSED (4210 modules, 26s)

---
*Phase: 81-domain-vocabulary-deepening*
*Completed: 2026-05-11*
