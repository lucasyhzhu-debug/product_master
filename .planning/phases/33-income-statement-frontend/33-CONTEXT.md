# Phase 33: Income Statement Frontend - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can view, navigate, and export a weekly income statement with full channel breakdown and data quality transparency. Standalone `/financials` page consuming the `getWeeklyIncomeStatement` backend query from Phase 32. No schema changes, no backend modifications.

</domain>

<decisions>
## Implementation Decisions

### P&L Table Layout
- Collapsible rows: section headers (Revenue, Deductions, COGS, Gross Profit) always visible
- Gross Revenue row expands to reveal per-channel breakdown rows underneath
- Claude's discretion on whether Deductions and COGS sections are also collapsible (decide based on row count)
- Colored dots from `platformColors.ts` next to each channel name for visual identity (consistent with Sales Analytics)
- Parentheses for negative values (deductions shown as `(Rp 320.000)`) -- accounting convention, matches design doc

### Confidence Indicators
- Inline symbols next to numbers, NOT badge components:
  - `exact`: no indicator (clean number)
  - `calculated`: small calc icon
  - `inferred`: ~ prefix
  - `missing`: dash (--) with warning icon
- Hover tooltips explain each symbol (e.g., "Inferred: estimated from stock delta")
- No persistent legend bar -- tooltips are sufficient
- Confidence shown at channel-total level only (not repeated on every cell in the row)
- Missing COGS displays `-- warning-icon` instead of `Rp 0` -- visually distinct from actual zero cost

### Data Quality Panel
- Positioned below the P&L table as a collapsible card
- Auto-expands when issues exist; collapsed only when all data is clean
- Each issue includes a clickable link to the relevant fix page:
  - Unmapped products -> `/analytics?tab=mappings` (Sales Analytics > Mappings)
  - Zero-cost components -> `/component-types` (Component Types Manager)
  - Missing channels -> descriptive text (external blocker, no fix page)
- Includes positive coverage stat: e.g., "42/45 products have BOM-linked COGS" with green tint
- Summary line when collapsed: "3 issues found" (or "All clear" with green check)

### Mobile Responsiveness
- Hide comparison columns (Prev Week, Delta) by default on mobile
- Toggle button ("Show comparison") reveals comparison columns when tapped
- Button-only week navigation (prev/next arrows flanking week label) -- no swipe gestures
- Export CSV button in PageHeader actions area (consistent with other pages)
- Same collapse/expand behavior for channel drill-down as desktop (inline expand, not bottom sheet)
- Follow 280px minimum width pattern from CODE_STYLE.md

### Week Navigation
- Prev/Next arrow buttons flanking the week label
- Week label format: "Week of Feb 24 - Mar 2, 2026" (WIB timezone Monday-start boundaries)
- Week start computed as Monday 00:00 WIB, passed as epoch ms to backend query
- No limit on navigation range -- empty weeks show zero values gracefully

### CSV Export
- Flat-format CSV (one row per line item) as specified in design doc
- Columns: period, section, channel, line_item, amount_idr, confidence, prev_week_idr, delta_pct
- Footer rows with data quality notes (unmapped count, missing channels)
- Filename: `income-statement-YYYY-MM-DD.csv` (week start date)

### Claude's Discretion
- Which P&L sections beyond Gross Revenue are collapsible (based on row count analysis)
- Loading skeleton design while query fetches
- Exact spacing, typography, and indentation levels for P&L rows
- Error state handling (query failure, network error)
- Whether to extract CSV generation into `src/lib/csvExport.ts` or keep inline in hook
- Exact tooltip content wording for confidence symbols
- Animation for expand/collapse transitions (Framer Motion or CSS)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GrowthIndicator` (`src/components/salesAnalytics/OverviewTab.tsx:74`): Delta rendering with arrow icons, percentage, and color coding. Supports `invertColor` for cost metrics. Reuse directly for delta column.
- `ConfidenceBadge` (`src/components/salesAnalytics/OverviewTab.tsx:103`): Badge component for 3 levels (exact/inferred/manual). NOT reusable as-is -- income statement needs inline symbols for 4 levels, not badges. Build new `ConfidenceIndicator` component.
- `getPlatformPalette` (`src/lib/platformColors.ts`): Channel color system with hex, Tailwind classes, dot colors. Use `.dot` class for channel row colored dots.
- `formatCurrency` (`src/lib/utils.ts`): IDR formatting (Rp X.XXX.XXX). Reuse for all amount cells.
- `PageHeader` (`src/components/layout/PageHeader.tsx`): Standard page header with title, description, and action slots. Place Export CSV button here.
- `Card/CardContent/CardHeader` (shadcn/ui): Use for data quality panel.
- `Skeleton` (shadcn/ui): Use for loading states.
- `Collapsible` (shadcn/ui): May be useful for expand/collapse rows, or build custom with ChevronDown/ChevronRight icons.

### Established Patterns
- Page structure: `SalesAnalytics.tsx` uses `PageHeader` + `Tabs` layout. Income statement is simpler -- single-view page, no tabs.
- Hook pattern: `useSalesAnalytics.ts` wraps queries with `useQuery` and returns `{ data, isLoading }`. Follow same pattern for `useFinancials.ts`.
- Route setup: `src/App.tsx` with `ProtectedRoute` + `canAccessDashboard` permission.
- WIB timezone helpers: `OverviewTab.tsx` has `utcToWibDateStr` and `wibDateStrToUtcMs`. May reuse or follow pattern for week start calculation.
- Period navigation: OverviewTab uses `PERIOD_PRESETS` dropdown. Income statement uses prev/next buttons instead (week granularity only).
- Barrel exports: `src/hooks/convex/index.ts` re-exports all hooks.

### Integration Points
- Route: Add `/financials` to `src/App.tsx` with `canAccessDashboard` permission guard
- Navigation: Add "Income Statement" / "Financials" entry in sidebar/nav
- Backend query: `api.reports.incomeStatement.getWeeklyIncomeStatement` -- single arg `{ weekStart: number }`
- Backend return shape: `{ weekStart, weekEnd, current: WeekData, previous: WeekData, deltas }` where `WeekData` has `channels[]`, totals, and `gapAnalysis`
- Hook barrel: Export from `src/hooks/convex/index.ts`

</code_context>

<specifics>
## Specific Ideas

- Design doc Section 6 has a full ASCII mockup of the P&L layout -- follow as the structural reference
- "I like how Twitter shows the new posts indicator" -- user preference for non-disruptive data updates (relevant for real-time Convex auto-refresh)
- Use parentheses `(Rp X)` for deductions, matching the design doc mockup exactly
- Channel colors should visually match Sales Analytics for cross-page consistency
- Coverage stat in data quality panel inspired by "42/45 products have BOM-linked COGS" line in design doc mockup
- Phase 32 context notes: "Use `/frontend-design` skill for Phase 33 UI design (user request)"

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope. Future items already tracked in design doc Section 7:
- Monthly/quarterly period views -- follow-up after weekly is solid
- Print-friendly P&L view -- follow-up
- Budget vs. actual comparison -- requires OpEx/budget system
- Per-outlet consignment breakdown in P&L -- possible enhancement

</deferred>

---

*Phase: 33-income-statement-frontend*
*Context gathered: 2026-03-02*
