# Phase 38: Frontend Giant File Splits - Research

**Researched:** 2026-03-06
**Domain:** React component extraction / frontend refactoring
**Confidence:** HIGH

## Summary

This phase is a pure refactoring effort targeting 4 frontend files totaling 5,518 LOC. All 4 files are well-structured with clear internal component boundaries, making extraction straightforward. The codebase already has established patterns for flat feature directories with barrel index.ts re-exports (kitchen/ has 37 files, inventory/ has 24 files) that serve as proven templates.

The primary risk is WIB time helper duplication (found in 5+ files across the frontend) and `formatRelativeTime` / `formatDateTime` duplication (found in 6+ files). CONTEXT.md correctly identifies consolidating WIB helpers into `src/lib/dateUtils.ts` as a key task. A secondary risk is the `formatCurrencyIDR()` duplicate in GrabFoodManager that should use the existing `formatCurrency` from `src/lib/utils.ts`.

**Primary recommendation:** Extract all inline components as standalone files in their respective feature directories, consolidate shared date utilities into `src/lib/dateUtils.ts`, and update barrel index.ts files. Each file's main export remains the sole public API; extracted sub-components are internal.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **File Organization:** Same feature directory (flat) for all extractions -- matches established kitchen/, inventory/, restock/ patterns
  - OverviewTab extractions -> `src/components/salesAnalytics/` (existing directory)
  - GrabFoodManager tab extractions -> `src/components/salesAnalytics/` (GrabFood is part of sales analytics domain)
  - FinishedGoodsTab extractions -> `src/components/inventory/` (existing directory)
  - VouchersManager extractions -> **new** `src/components/vouchers/` directory
- **Extraction Depth:** Extract ALL inline React components + utils/constants/types + dedup helpers
- **Import/Export Style:** Named exports, barrel index.ts for public components only, no default exports
- **Naming Conventions:** Domain concept naming, rename for clarity during extraction (e.g., ExpandedRevenueItems -> RevenueItemDetails)
- **Shared utils:** WIB time helpers consolidated into `src/lib/dateUtils.ts`
- **Utils file naming:** `*Utils.ts` naming pattern (not helpers/) to avoid Windows filename collision

### Claude's Discretion
- Exact component split boundaries within each file
- Prop interface design for extracted components
- Whether specific small helpers stay in utils file or move with their only consumer
- Order of exports in barrel files

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FFS-01 | OverviewTab.tsx slimmed to under 400 LOC (from 1,273) | 7 inline components identified (GrowthIndicator, ConfidenceBadge, MatchStatusBadge, PlatformBadge, ExpandedRevenueItems, ExpandedInternalOrder, StoreGroupHeader), 2 major sections (ChannelSummary, PlatformHierarchy, LifetimeHero, RevenueTable), plus types/constants/WIB helpers. ~873 LOC extractable. |
| FFS-02 | GrabFoodManager.tsx slimmed to under 600 LOC (from 1,486) | 5 tab components (OrdersTab, StoreStatusTab, MenuTab, SettingsTab, WebhooksTab) + 1 dialog (OutletDialog) + 3 helper functions + 1 constant array. ~1,244 LOC in sub-components; main component is only ~122 LOC (lines 122-243). Target achievable. |
| FFS-03 | FinishedGoodsTab.tsx slimmed to under 600 LOC (from 1,474) | 4 major sections (InlineTransferForm, ProductGroupedView, LocationGroupedView, PlatformGroupedView) + types/helpers. Main FinishedGoodsTab is ~541 LOC (lines 934-1474). Extracting sub-views brings main under 600. |
| FFS-04 | VouchersManager.tsx slimmed to under 600 LOC (from 1,285) | 3 sub-components (VoucherCard, OverrideCard, VoucherForm) + helper functions + types/constants. Main VouchersManager is ~571 LOC (lines 191-762 minus extracted sub-component references). Target achievable but tight. |
</phase_requirements>

## Standard Stack

### Core (no new libraries needed)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| React | ^19.2.0 | Component extraction | All extracted components are standard React function components |
| TypeScript | ~5.9 | Type safety | Prop interfaces for extracted components |

### Supporting (already in project)
| Library | Purpose | Relevant To |
|---------|---------|-------------|
| lucide-react | Icons | Icons will move with their consumer component |
| sonner (toast) | Notifications | Stays in components that trigger mutations |
| react-router-dom | Navigation | Stays in OverviewTab main (useNavigate, useSearchParams) |
| convex/react | Data hooks | Hooks stay in outermost component, data passed via props |

**No new installations required.** This is pure code reorganization.

## Architecture Patterns

### Recommended Project Structure (after extraction)

```
src/components/salesAnalytics/
  OverviewTab.tsx              # Main orchestrator (~350-400 LOC)
  ChannelSummary.tsx           # Channel breakdown cards (~100 LOC)
  PlatformHierarchy.tsx        # Platform -> outlet drill-down (~100 LOC)
  LifetimeHero.tsx             # Lifetime totals card (~45 LOC)
  RevenueTable.tsx             # Revenue details table (~180 LOC)
  RevenueItemDetails.tsx       # Expanded revenue items row (~50 LOC)
  InternalOrderDetails.tsx     # Expanded internal order row (~80 LOC)
  StoreGroupHeader.tsx         # K3Mart store group header row (~35 LOC)
  GrowthIndicator.tsx          # Growth % badge (~30 LOC)
  ConfidenceBadge.tsx          # Confidence level badge (~20 LOC)
  MatchStatusBadge.tsx         # Match status badge (~30 LOC)
  PlatformBadge.tsx            # Platform name badge (~10 LOC)
  overviewUtils.ts             # Types, constants, WIB helpers (~40 LOC)
  index.ts                     # Updated barrel (OverviewTab public)
  ... (existing files unchanged)

src/components/salesAnalytics/  (GrabFood extractions also here)
  OrdersTab.tsx                # Orders tab content (~240 LOC)
  StoreStatusTab.tsx           # Store status tab content (~230 LOC)
  MenuTab.tsx                  # Menu tab content (~215 LOC)
  GrabFoodSettingsTab.tsx      # Settings tab content (~220 LOC)
  WebhooksTab.tsx              # Webhooks tab content (~170 LOC)
  OutletDialog.tsx             # Outlet add/edit dialog (~105 LOC)
  grabFoodUtils.ts             # formatCurrencyIDR -> use formatCurrency, formatRelativeTime -> dateUtils

src/components/inventory/
  InlineTransferForm.tsx       # Transfer form component (~125 LOC)
  ProductGroupedView.tsx       # Product-grouped stock view (~210 LOC)
  LocationGroupedView.tsx      # Location-grouped stock view (~250 LOC)
  PlatformGroupedView.tsx      # Platform-grouped stock view (~145 LOC)
  finishedGoodsUtils.ts        # Types + platform helper functions (~55 LOC)
  index.ts                     # Updated barrel (FinishedGoodsTab public)
  ... (existing files unchanged)

src/components/vouchers/       (NEW directory)
  VoucherCard.tsx              # Voucher display card (~130 LOC)
  OverrideCard.tsx             # Manager override card (~90 LOC)
  VoucherForm.tsx              # Create/edit form (~270 LOC)
  FreeVoucherDialog.tsx        # Free voucher creation dialog (~100 LOC)
  voucherUtils.ts              # Helper functions + types + constants (~55 LOC)
  index.ts                     # Barrel: VoucherCard, OverrideCard, VoucherForm, FreeVoucherDialog

src/lib/
  dateUtils.ts                 # NEW: Consolidated WIB + formatting helpers
```

### Pattern 1: Props-Down Extraction
**What:** Parent component owns all hooks and state; extracted children receive data via props.
**When to use:** Always, for this refactoring phase.
**Example:**
```typescript
// Before (inline in OverviewTab.tsx):
function ChannelSummary({ currentPeriod, previousPeriod }: {
  currentPeriod: PeriodData;
  previousPeriod: PeriodData;
}) { ... }

// After (ChannelSummary.tsx):
import type { PeriodData } from "./overviewUtils";
import { GrowthIndicator } from "./GrowthIndicator";

interface ChannelSummaryProps {
  currentPeriod: PeriodData;
  previousPeriod: PeriodData;
}

export function ChannelSummary({ currentPeriod, previousPeriod }: ChannelSummaryProps) { ... }
```

### Pattern 2: Barrel Re-exports for Public API
**What:** Only components consumed outside the directory go in index.ts.
**When to use:** When a component is used by a page or another feature directory.
**Example:**
```typescript
// src/components/salesAnalytics/index.ts
export { OverviewTab } from "./OverviewTab";
// GrowthIndicator, ConfidenceBadge, etc. are NOT exported -- internal only
```

### Pattern 3: Shared Utility Consolidation
**What:** Identical helper functions duplicated across files get consolidated into a shared module.
**When to use:** When 2+ files have the same function.
**Example:**
```typescript
// src/lib/dateUtils.ts
export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export function utcToWibDateStr(utcMs: number): string {
  return new Date(utcMs + WIB_OFFSET_MS).toISOString().split("T")[0];
}

export function wibDateStrToUtcMs(dateStr: string): number {
  return new Date(dateStr).getTime() - WIB_OFFSET_MS;
}
```

### Anti-Patterns to Avoid
- **Moving hooks into extracted components:** Hooks (useQuery, useMutation, etc.) should stay in the parent. Extracted components receive data via props. Exception: LifetimeHero and PlatformHierarchy already own their hooks and can keep them since they're self-contained.
- **Creating deep subdirectory nesting:** Flat alongside siblings, not `salesAnalytics/overview/components/`.
- **Breaking the default export contract:** VouchersManager has both `export function VouchersManager` and `export default VouchersManager`. App.tsx uses the named export. Keep both for backward compatibility but note the CONTEXT.md says "no default exports" -- the `export default` on line 1285 can be removed since App.tsx explicitly destructures the named export.
- **Extracting closure-mutating helpers as pure functions:** The `renderRow` function inside RevenueTable closes over `expandedId` and `setExpandedId`. It must stay in RevenueTable or receive those as props.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Currency formatting | `formatCurrencyIDR()` in GrabFoodManager | `formatCurrency()` from `src/lib/utils.ts` | Already exists, handles null, uses Intl.NumberFormat |
| Relative time formatting | Local `formatRelativeTime()` in 6+ files | `formatRelativeTime()` from `src/lib/formatters.ts` | Already exported, same logic |
| WIB date conversion | Local `WIB_OFFSET_MS` + helpers in OverviewTab | `src/lib/dateUtils.ts` (new shared module) | Currently duplicated in OverviewTab, FinancialStatement, financialHelpers.tsx |

**Key insight:** The biggest dedup win is consolidating WIB helpers. Currently duplicated in: OverviewTab.tsx (lines 60-70), financialHelpers.tsx (line 29), FinancialStatement.tsx (imported from financialHelpers). The new `src/lib/dateUtils.ts` should be the single source for `WIB_OFFSET_MS`, `utcToWibDateStr`, `wibDateStrToUtcMs`.

## Common Pitfalls

### Pitfall 1: Import Path Breakage After Move
**What goes wrong:** Moving a component to a new file but missing an import site.
**Why it happens:** Components used via barrel may also be imported directly elsewhere.
**How to avoid:** Grep for every component name before and after extraction. Check both barrel and direct imports.
**Warning signs:** `npm run build` catches TypeScript import errors.

### Pitfall 2: LOC Target Overshoot
**What goes wrong:** After extraction, the parent file is still over the LOC target.
**Why it happens:** Import statements, types, and orchestration logic add up.
**How to avoid:** Count extractable LOC per component BEFORE writing plans. The math:
- OverviewTab: 1,273 - (extractable ~873) = ~400 LOC. Tight but achievable.
- GrabFoodManager: 1,486 - (extractable ~1,244) = ~242 LOC (well under 600).
- FinishedGoodsTab: 1,474 - (extractable ~785) = ~689 LOC. Over 600! Must also extract settings panel (~140 LOC) to reach target.
- VouchersManager: 1,285 - (extractable ~714) = ~571 LOC. Under 600 but tight.
**Warning signs:** Running `wc -l` after each extraction wave.

### Pitfall 3: Self-Contained Components with Internal Hooks
**What goes wrong:** Extracting a component that owns its own hooks and trying to lift state up.
**Why it happens:** Some inline components (LifetimeHero, PlatformHierarchy, OverrideCard) call their own hooks.
**How to avoid:** These components should keep their hooks. They are self-contained and receive minimal props. Don't refactor their data flow -- just move them to their own files.
**Affected components:**
- `LifetimeHero` -- uses `useLifetimeTotals()` internally
- `PlatformHierarchy` -- uses `useRevenueByOutlet()` internally
- `OverrideCard` -- uses `useQuery(api.vouchers.queries.getOverrideOrderDetails)` internally
- `WebhooksTab` -- uses `useQuery(api.externalData.queries.getLatestWebhookError)` and `useProtectedMutation` internally
- `SettingsTab` -- uses `useQuery(api.externalData.queries.getProductMappings)` and `useProtectedMutation` internally

### Pitfall 4: Windows Path Collision
**What goes wrong:** Creating `helpers/` directory alongside `helpers.ts` file.
**Why it happens:** Node.js resolves them differently but IDEs may confuse them on Windows.
**How to avoid:** Use `*Utils.ts` naming per CONTEXT.md (e.g., `overviewUtils.ts`, `grabFoodUtils.ts`).
**Reference:** Phase 36 lesson in MEMORY.md.

### Pitfall 5: FinishedGoodsTab Settings Panel Not Extracted
**What goes wrong:** FinishedGoodsTab stays at ~689 LOC after extracting the 4 view components.
**Why it happens:** The settings panel (lines 1222-1364, ~142 LOC) is part of the main component body.
**How to avoid:** Extract the settings panel as `FinishedGoodsSettings.tsx`. It receives settings state and callbacks via props.

### Pitfall 6: Forgetting the default export removal
**What goes wrong:** VouchersManager.tsx line 1285 has `export default VouchersManager` alongside the named export.
**Why it happens:** Legacy pattern. CONTEXT.md says no default exports.
**How to avoid:** Remove line 1285 during extraction. App.tsx already uses the named export path: `.then(m => ({ default: m.VouchersManager }))`.

## Code Examples

### Extractable Component Inventory

#### OverviewTab.tsx (1,273 LOC) -> Target: <400 LOC

| Component/Section | Lines | LOC | Self-Contained Hooks? | Extraction File |
|-------------------|-------|-----|----------------------|-----------------|
| Types (ConfidenceLevel, MatchConfidence) | 44-45 | 2 | No | overviewUtils.ts |
| PERIOD_PRESETS, DEFAULT_PERIOD, PERIOD_STORAGE_KEY | 47-59 | 13 | No | overviewUtils.ts |
| WIB helpers (WIB_OFFSET_MS, utcToWibDateStr, wibDateStrToUtcMs) | 60-70 | 11 | No | src/lib/dateUtils.ts |
| GrowthIndicator | 74-101 | 28 | No | GrowthIndicator.tsx |
| ConfidenceBadge | 103-122 | 20 | No | ConfidenceBadge.tsx |
| MatchStatusBadge | 124-153 | 30 | No | MatchStatusBadge.tsx |
| SOURCE_DISPLAY_NAMES + PlatformBadge | 155-174 | 20 | No | PlatformBadge.tsx |
| ExpandedRevenueItems (renamed: RevenueItemDetails) | 178-246 | 69 | Yes (useRevenueItems) | RevenueItemDetails.tsx |
| ExpandedInternalOrder (renamed: InternalOrderDetails) | 248-342 | 95 | Yes (useOrderDetailsByOrderNumber) | InternalOrderDetails.tsx |
| RevenueRecord type + StoreGroupHeader | 346-397 | 52 | No | StoreGroupHeader.tsx |
| PeriodData type + ChannelSummary | 401-567 | 167 | No | ChannelSummary.tsx |
| PlatformHierarchy | 571-671 | 101 | Yes (useRevenueByOutlet) | PlatformHierarchy.tsx |
| LifetimeHero | 675-718 | 44 | Yes (useLifetimeTotals) | LifetimeHero.tsx |
| RevenueTable | 722-903 | 182 | No (uses WIB helpers) | RevenueTable.tsx |
| **Total extractable** | | **~834** | | |
| **Remaining main component** | 907-1273 | **~367** + imports | | OverviewTab.tsx |

**Math verification:** 1,273 - 834 = 439. Adding ~30 LOC of new imports and removing ~60 LOC of now-unused imports = ~400-410 LOC. Target is <400, which is tight. To ensure target is met: extract the loading skeleton (lines 1001-1029, ~29 LOC) into the main render as a simpler pattern, or move the hero cards section (lines 1066-1185, ~120 LOC) into a `HeroCards.tsx` component.

**Recommended additional extraction:** HeroCards (lines 1066-1185, ~120 LOC) as a separate component receiving `currentPeriod` and `previousPeriod` props. This brings the main OverviewTab down to ~280-300 LOC.

#### GrabFoodManager.tsx (1,486 LOC) -> Target: <600 LOC

| Component/Section | Lines | LOC | Self-Contained Hooks? | Extraction File |
|-------------------|-------|-----|----------------------|-----------------|
| formatCurrencyIDR | 87-90 | 4 | No | REMOVE (use formatCurrency) |
| formatDateTime | 92-105 | 14 | No | src/lib/dateUtils.ts |
| formatRelativeTime | 107-116 | 10 | No | src/lib/dateUtils.ts |
| OrdersTab (+ interface) | 249-483 | 235 | No | OrdersTab.tsx |
| StoreStatusTab (+ interface) | 490-721 | 232 | No (uses useGrabFoodActions via parent) | StoreStatusTab.tsx |
| MenuTab (+ interface + MenuItem type) | 727-952 | 226 | No | MenuTab.tsx |
| SettingsTab (+ interface) | 958-1186 | 229 | Yes (useQuery, useProtectedMutation) | GrabFoodSettingsTab.tsx |
| WEBHOOK_ENDPOINTS + WebhooksTab | 1192-1370 | 179 | Yes (useQuery, useProtectedMutation) | WebhooksTab.tsx |
| OutletDialog (+ interface) | 1376-1486 | 111 | Yes (useProtectedMutation) | OutletDialog.tsx |
| **Total extractable** | | **~1,240** | | |
| **Remaining main component** | 122-243 | **~122** + imports | | GrabFoodManager.tsx |

**Math verification:** 1,486 - 1,240 = 246 LOC. Adding ~40 LOC of new imports = ~286 LOC. Well under 600 target.

Note: `formatCurrencyIDR()` is a near-duplicate of `formatCurrency()` from `src/lib/utils.ts`. The difference: `formatCurrencyIDR` returns "Rp 0" for null while `formatCurrency` returns "-". For GrabFood context, "Rp 0" is more appropriate. Options: (a) replace with `formatCurrency` and handle the null case at call sites, or (b) keep as `grabFoodUtils.ts` helper. CONTEXT.md says "Deduplicate obvious identical helpers" -- recommend option (a) since the difference is trivial.

#### FinishedGoodsTab.tsx (1,474 LOC) -> Target: <600 LOC

| Component/Section | Lines | LOC | Self-Contained Hooks? | Extraction File |
|-------------------|-------|-----|----------------------|-----------------|
| Types (GroupingMode, AdjustDialogState) | 75-83 | 9 | No | finishedGoodsUtils.ts |
| Platform helpers (bucketLocationType, locationTypeLabel) | 89-115 | 27 | No | finishedGoodsUtils.ts |
| InlineTransferState type | 117-127 | 11 | No | finishedGoodsUtils.ts |
| GroupedProductRow type | 130-145 | 16 | No | finishedGoodsUtils.ts |
| InlineTransferForm (+ type) | 150-288 | 139 | No | InlineTransferForm.tsx |
| ProductGroupedView (+ type) | 294-514 | 221 | No | ProductGroupedView.tsx |
| LocationGroupedView (+ type) | 520-783 | 264 | No | LocationGroupedView.tsx |
| PlatformGroupedView (+ type) | 789-928 | 140 | No | PlatformGroupedView.tsx |
| **Total extractable** | | **~827** | | |
| **Remaining main component** | 934-1474 | **~541** + imports | | FinishedGoodsTab.tsx |

**Math verification:** 1,474 - 827 = 647 LOC. Over 600 target! Must also extract the settings panel (lines 1222-1364, ~143 LOC) to reach ~504 LOC. This brings it well under 600.

**Required additional extraction:** FinishedGoodsSettings (lines 1222-1364, ~143 LOC) as a component receiving settings state, handlers, locations, and save callback via props.

#### VouchersManager.tsx (1,285 LOC) -> Target: <600 LOC

| Component/Section | Lines | LOC | Self-Contained Hooks? | Extraction File |
|-------------------|-------|-----|----------------------|-----------------|
| Helper functions (formatDate, formatDateTime, getVoucherStatus, formatDiscountValue) | 98-149 | 52 | No | voucherUtils.ts |
| VoucherFormState interface + initialFormState | 155-185 | 31 | No | voucherUtils.ts |
| VoucherCard (+ interface) | 768-892 | 125 | No | VoucherCard.tsx |
| OverrideCard (+ interface) | 898-1000 | 103 | Yes (useQuery) | OverrideCard.tsx |
| VoucherForm (+ interface) | 1006-1283 | 278 | No | VoucherForm.tsx |
| Free Voucher Dialog JSX (lines 664-759) | 664-759 | 96 | No | FreeVoucherDialog.tsx |
| **Total extractable** | | **~685** | | |
| **Remaining main component** | 191-762 minus extracted | **~600** + imports | | VouchersManager.tsx |

**Math verification:** 1,285 - 685 = 600 LOC. Exactly at the limit. To get safely under: also extract the Free Voucher form state and handler (freeForm state + handleCreateFree, ~33 LOC of state/handler) into FreeVoucherDialog so it's self-contained. This brings the main page to ~567 LOC.

**Note:** VouchersManager has `export default VouchersManager` on line 1285. Per CONTEXT.md (no default exports), remove this during extraction. App.tsx already uses the named export.

### Shared dateUtils.ts Design

```typescript
// src/lib/dateUtils.ts

/** WIB (UTC+7) offset in milliseconds */
export const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Convert UTC epoch ms to a WIB date string (YYYY-MM-DD) */
export function utcToWibDateStr(utcMs: number): string {
  return new Date(utcMs + WIB_OFFSET_MS).toISOString().split("T")[0];
}

/** Convert WIB date string (YYYY-MM-DD) to UTC epoch ms at WIB midnight */
export function wibDateStrToUtcMs(dateStr: string): number {
  return new Date(dateStr).getTime() - WIB_OFFSET_MS;
}

/** Format a WIB time string (HH:MM) from UTC epoch ms */
export function utcToWibTimeStr(utcMs: number): string {
  const wib = new Date(utcMs + WIB_OFFSET_MS);
  const h = wib.getUTCHours().toString().padStart(2, "0");
  const m = wib.getUTCMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

/** Format a timestamp to Indonesian locale datetime string */
export function formatDateTimeId(timestamp: number): string {
  return new Date(timestamp).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format a timestamp to Indonesian locale date string */
export function formatDateId(timestamp: number | undefined): string {
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
```

**Note:** `src/lib/formatters.ts` already exports `formatRelativeTime`. Do NOT duplicate it in dateUtils.ts -- import from formatters.ts where needed.

**Note:** `src/lib/financialHelpers.tsx` already exports `WIB_OFFSET_MS`. After creating dateUtils.ts, update financialHelpers.tsx to import from dateUtils.ts instead of defining its own constant. Similarly update FinancialStatement.tsx.

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Everything inline in one file | Extract to flat feature directory | Standard React pattern; reduces cognitive load |
| Duplicated utility functions | Shared module imports | Eliminates WIB/formatter drift between files |
| Mixed default + named exports | Named exports only | Consistent with codebase convention |

## Open Questions

1. **FinishedGoodsTab settings extraction scope**
   - What we know: Settings panel is ~143 LOC embedded in the main component. Extracting it requires passing 7+ state values and 3+ callbacks as props.
   - What's unclear: Whether the settings initialization pattern (lines 961-967, conditional state set without useEffect) should be cleaned up during extraction.
   - Recommendation: Extract as-is during this phase. The initialization pattern works and changing it risks regression. Flag for future cleanup if desired.

2. **GrabFoodManager `formatCurrencyIDR` vs `formatCurrency` behavior difference**
   - What we know: `formatCurrencyIDR` returns "Rp 0" for null; `formatCurrency` returns "-" for null.
   - What's unclear: Whether GrabFood UX prefers "Rp 0" or "-" for null amounts.
   - Recommendation: Replace with `formatCurrency` -- the "-" convention is used everywhere else. If "Rp 0" is specifically needed, handle at call site with `formatCurrency(amount ?? 0)`.

3. **Whether to update FinancialStatement.tsx WIB imports in this phase**
   - What we know: FinancialStatement.tsx imports `WIB_OFFSET_MS` from `financialHelpers.tsx` and defines its own `utcToWibDateStr` and `wibDateStrToUtc`.
   - Recommendation: Out of scope for this phase. Only consolidate WIB helpers from the 4 target files. Note the debt for a future quick task.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 |
| Config file | vitest.config.ts |
| Quick run command | `npm run test` |
| Full suite command | `npm run test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FFS-01 | OverviewTab under 400 LOC | manual-only | `wc -l src/components/salesAnalytics/OverviewTab.tsx` | N/A |
| FFS-02 | GrabFoodManager under 600 LOC | manual-only | `wc -l src/pages/GrabFoodManager.tsx` | N/A |
| FFS-03 | FinishedGoodsTab under 600 LOC | manual-only | `wc -l src/components/inventory/FinishedGoodsTab.tsx` | N/A |
| FFS-04 | VouchersManager under 600 LOC | manual-only | `wc -l src/pages/VouchersManager.tsx` | N/A |
| ALL | No type errors after extraction | unit | `npm run type-check` | N/A |
| ALL | Build succeeds | integration | `npm run build` | N/A |

**Justification for manual-only LOC checks:** LOC targets are verified by `wc -l` at the end of each wave. There is no unit test framework for LOC counting -- it's a build verification step.

### Sampling Rate
- **Per task commit:** `npm run type-check` (fast, catches import errors)
- **Per wave merge:** `npm run build` (full TypeScript + Vite build)
- **Phase gate:** Full build green + LOC verification via `wc -l`

### Wave 0 Gaps
- [ ] `src/lib/dateUtils.ts` -- shared WIB helpers (must be created before extraction begins)
- [ ] `src/components/vouchers/` directory -- must be created
- [ ] `src/components/vouchers/index.ts` -- barrel file

## Sources

### Primary (HIGH confidence)
- Direct source code analysis of all 4 target files (read in full)
- Existing barrel files: `src/components/salesAnalytics/index.ts`, `src/components/inventory/index.ts`
- Existing shared utils: `src/lib/utils.ts`, `src/lib/formatters.ts`, `src/lib/financialHelpers.tsx`
- LOC verified via `wc -l` on all 4 files

### Secondary (MEDIUM confidence)
- Kitchen directory structure (37 files) as reference pattern for flat extraction
- WIB duplication grep across entire `src/` directory
- Import site analysis via grep for all 4 component names

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, pure refactoring
- Architecture: HIGH -- patterns already proven in kitchen/ and inventory/ directories
- Pitfalls: HIGH -- based on direct code analysis and Phase 36 lessons from MEMORY.md
- LOC targets: MEDIUM -- math verified but OverviewTab and VouchersManager are tight; may need one extra extraction each

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable -- no external dependencies)
