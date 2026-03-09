# Phase 38: Frontend Giant File Splits - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Split the 4 largest frontend components (all >1,200 LOC) into focused sub-components. Pure refactoring — zero feature changes, zero API changes. Target LOC per requirement: OverviewTab <400, GrabFoodManager <600, FinishedGoodsTab <600, VouchersManager <600.

</domain>

<decisions>
## Implementation Decisions

### File Organization
- **Same feature directory (flat)** for all extractions — matches established kitchen/, inventory/, restock/ patterns
- OverviewTab extractions → `src/components/salesAnalytics/` (existing directory)
- GrabFoodManager tab extractions → `src/components/salesAnalytics/` (GrabFood is part of sales analytics domain; GrabFoodCredentialsDialog, OutletCard already live there)
- FinishedGoodsTab extractions → `src/components/inventory/` (existing directory, already has 6 sibling components)
- VouchersManager extractions → **new** `src/components/vouchers/` directory (matches domain pattern: orders/, kitchen/, inventory/)
- No subdirectories per parent component — flat alongside siblings

### Extraction Depth
- Extract **all** inline React components into their own files, regardless of size (even <30 LOC badges/indicators)
- Also extract utility functions, constants, and type definitions into domain-scoped utils files
- Deduplicate obvious identical helpers during extraction (e.g., `formatCurrencyIDR()` → use existing `formatCurrency` from `src/lib/utils.ts`)
- Consolidate WIB time helpers (utcToWibDateStr, wibDateStrToUtcMs, formatRelativeTime, formatDateTime, WIB_OFFSET_MS) into shared `src/lib/dateUtils.ts` — currently duplicated across OverviewTab and GrabFoodManager

### Import/Export Style
- **Named exports** for all extracted components (matches codebase convention)
- Barrel `index.ts` only exports **public** components (consumed outside the directory) — internal sub-components use direct relative imports
- VouchersManager page imports from barrel: `import { VoucherForm, ... } from '@/components/vouchers'`
- No default exports

### Naming Conventions
- **Domain concept naming** — name files after what the component represents, not its visual role (RevenueItemRow, not ExpandableRow; VoucherForm, not CreateEditForm)
- Rename for clarity during extraction when inline names are awkward (e.g., ExpandedRevenueItems → RevenueItemDetails, ExpandedInternalOrder → InternalOrderDetails)
- Keep good existing names as-is
- No parent prefixes or unnecessary suffixes (no OverviewGrowthIndicator, no VoucherFormComponent)
- Domain-scoped utils files: overviewUtils.ts, voucherUtils.ts (matches existing settlementUtils.ts)
- Shared utils → `src/lib/dateUtils.ts`

### Claude's Discretion
- Exact component split boundaries within each file (which JSX sections become which components)
- Prop interface design for extracted components
- Whether specific small helpers stay in utils file or move with their only consumer
- Order of exports in barrel files

</decisions>

<specifics>
## Specific Ideas

- GrabFoodManager has clear tab sections (Orders, Menu, Settings) that map to natural component boundaries
- OverviewTab has ~7 inline function components (GrowthIndicator, ConfidenceBadge, MatchStatusBadge, PlatformBadge, ExpandedRevenueItems, ExpandedInternalOrder, StoreGroupHeader) plus utility functions — all extractable
- FinishedGoodsTab already follows extraction pattern (imports from 6 siblings) — continue that pattern for remaining inline code (InlineTransferForm, ProductGroupedView, and related types)
- Phase 36 lesson: "helpers/ directory alongside helpers.ts file is fragile on Windows" — use `*Utils.ts` naming to avoid conflict with any existing helpers files

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/utils.ts`: formatCurrency, cn — replace local duplicates
- `src/components/salesAnalytics/index.ts`: barrel already exports OverviewTab, SalesChart, SettingsTab, etc.
- `src/components/inventory/index.ts`: barrel already exports StatCard, ComponentRow, BatchCard, etc.
- `src/components/salesAnalytics/settlementUtils.ts`: established utils file pattern in this directory
- Kitchen directory (20+ components): reference pattern for successful flat extraction

### Established Patterns
- Flat feature directories with barrel index.ts re-exports
- Named exports, no default exports
- Direct relative imports for internal sub-components
- Domain-scoped utility files alongside components

### Integration Points
- `src/pages/SalesAnalytics.tsx` imports OverviewTab via barrel
- `src/pages/GrabFoodManager.tsx` is a standalone page (route in App.tsx)
- `src/pages/VouchersManager.tsx` is a standalone page (route in App.tsx)
- `src/pages/InventoryManager.tsx` imports FinishedGoodsTab via barrel

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 38-frontend-giant-file-splits*
*Context gathered: 2026-03-05*
