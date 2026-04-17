# Phase 75: Full P&L Extension - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the Income Statement so the statement flows fully from Gross Revenue through to Free Cash Flow, with per-channel breakdown stopping at Contribution Margin and everything below kept company-level. CapEx is sourced from `fixedAssets`, D/A is pulled out of OpEx into its own line, and FCF is reconciled as `Net Income + D/A − CapEx`.

**Requirements:** FIN-01 (P&L extends NI → D/A → CapEx → FCF), FIN-02 (per-channel flows through Contribution Margin)

**Not in scope:** monthly/quarterly consolidation (already supported), print-friendly view (deferred), tax-optimized EBITDA bridge from net-of-commission revenue (deferred — see `<deferred>`).

</domain>

<decisions>
## Implementation Decisions

### CapEx Data Source (FIN-01)
- **D-01:** CapEx is sourced from the `fixedAssets` table. Query: sum `cost` where `acquisitionDate` falls in the period. Denormalized, matches Asset Register UI, no double-counting risk with OpEx.
- **D-02:** Expenses converted to CapEx via Phase 71 (`convertedToAssetId`) are included automatically because the conversion creates a `fixedAssets` row. The JE reversal pattern (Dr 1500 / Cr 6xxx) already pulls the original expense out of OpEx — no separate subtraction logic needed in the P&L query.
- **D-03:** Scope: **gross acquisitions** — do not net out disposal proceeds. Disposal gain/loss already lives in Other Income/Expense (existing behavior) and flows into Net Income before the FCF bridge.
- **D-04:** Include ALL acquisitions regardless of future fate — do NOT exclude assets with `disposalType = "reclassify_to_expense"`. The cash outflow already occurred at acquisition; later reclassification is a non-cash accounting adjustment handled elsewhere.

### CapEx Timing (FIN-01)
- **D-05:** Primary timing = `fixedAssets.acquisitionDate` (business date). Matches depreciation logic, Asset Register UI, and user mental model.
- **D-06:** For Phase-71-converted expenses: `acquisitionDate` must equal the ORIGINAL expense date (when the expense was first incurred), not the reclassification date. **Research must verify** `convex/expenses/mutations.ts` / `convex/fixedAssets/mutations.ts` already stamps the original expense date; if not, plan includes a one-line fix.

### P&L Layout (FIN-01)
- **D-07:** **Full reorganization** of the statement — EBITDA-first canonical layout:
  ```
  Revenue (gross)
    − Discounts & Vouchers
    − Commission
    − Ad/Promo Burn
    − Consignment Rev Share
  = Net Revenue
    − COGS (production + packaging)
  = Gross Profit / Contribution Margin
    − OpEx (excl. D/A)
  = EBITDA
    − D/A (GL 6150 Depreciation + 6160 Amortization)
  = EBIT
    − Other Income/Expense (net)
  = Net Income
    − CapEx (gross acquisitions in period)
  = Free Cash Flow
  ```
- **D-08:** OpEx row must split into `opexExcludingDA` + `depreciationAmortization`. The existing `DEPRECIATION_EXPENSE_CODE` (6150) and `AMORTIZATION_EXPENSE_CODE` (6160) constants from `convex/fixedAssets/helpers.ts` are the source of truth — filter OpEx lines by these codes, same pattern the current EBITDA bridge already uses.
- **D-09:** D/A appears ONCE in the new layout (as its own line between EBITDA and EBIT). The old "EBITDA as add-back above EBIT" presentation is replaced, not duplicated.

### Per-Channel Breakdown (FIN-02)
- **D-10:** Per-channel rows flow through: Gross Revenue → Platform Deductions → Net Revenue → COGS → **Contribution Margin** (stops here). Rename existing "Gross Profit per channel" header to "Contribution Margin" for accuracy.
- **D-11:** **No allocation of OpEx, D/A, CapEx, or FCF to channels.** Company-level only below Contribution Margin. Honest about the limits of cost attribution — no fake-precision revenue-share estimates.
- **D-12:** Channel-specific OpEx is ALREADY captured upstream via platform API deductions (commission, adBurn, promoBurn, revShare) — these are pulled from revenue before it lands in our system, so no separate channel-tagged OpEx line is needed. If a future phase adds manual channel tagging for direct costs, it can extend the channel row without schema migration.

### Free Cash Flow (FIN-01)
- **D-13:** FCF formula: `Net Income + Depreciation + Amortization − CapEx`. Single subtotal line, shown at the bottom of the statement as the ending metric.
- **D-14:** Zero CapEx presentation: always render the CapEx row even when the period has no acquisitions. Show `0` with a muted helper note like "No asset acquisitions this period". Preserves bridge structure visibility.

### Data Quality / Gap Analysis
- **D-15:** Extend the existing DataQualityPanel with a check for `convertedToAssetId` expenses whose reversal JE is missing. If this check ever lights up, the P&L has a silent double-count; Phase 77 can build on this check later.

### CSV Export
- **D-16:** `generateIncomeStatementCSV` in `src/lib/csvExport.ts` must gain rows for: OpEx-excluding-D/A, EBITDA, D/A (separated or combined), EBIT, Net Income, CapEx, FCF. Per-channel columns only populate through Contribution Margin — below that, columns are blank and the "Company Total" column carries the values.

### Claude's Discretion
- Exact visual styling of the FCF bridge (border, muted background, separator) — follow existing PLRow patterns.
- Placement of the D/A row label (e.g., "Depreciation & Amortization" vs split into two rows). Default: single combined line with a tooltip breakdown if both amounts are non-zero.
- Naming: "Free Cash Flow (simplified)" vs "Free Cash Flow" — default to just "Free Cash Flow" with a tooltip explaining the formula.
- Error/edge handling for periods pre-dating the Asset Register (no fixedAssets rows) — CapEx shows 0 with the standard helper note.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Income Statement Core
- `convex/reports/incomeStatement.ts` — Current P&L query with EBITDA/EBIT/NI computation; extension target for CapEx + FCF
- `convex/lib/costCalculator.ts` — `buildProductCOGSMap`, shared COGS resolution (honors Phase 70 COGS override)
- `convex/lib/periodRange.ts` — `calculateWeekRange`, WIB timezone helpers
- `convex/lib/journalHelpers.ts` — `aggregateJournalLines` for OpEx/Other breakdown
- `convex/lib/confidence.ts` — Confidence classification types

### Fixed Assets (CapEx Source)
- `convex/schema.ts` lines ~2188-2215 — `fixedAssets` table definition (`acquisitionDate`, `cost`, `acquisitionJeId`, `sourceExpenseId`, `disposalType`)
- `convex/fixedAssets/helpers.ts` — `DEPRECIATION_EXPENSE_CODE` (6150), `AMORTIZATION_EXPENSE_CODE` (6160), `ASSET_CATEGORIES`
- `convex/fixedAssets/queries.ts` — Existing asset queries; reference for CapEx aggregation pattern
- `convex/fixedAssets/mutations.ts` — Asset creation; verify `acquisitionDate` stamping logic for converted expenses

### Phase 71 Reclassification Bridge
- `convex/schema.ts` `expenses.convertedToAssetId` field (line ~1814) — Expense→Asset link
- `convex/schema.ts` `expenses.sourceAssetId` field (line ~1815) — Asset→Expense reclassification link (Direction B)
- `convex/expenses/mutations.ts` — Convert-to-asset mutation; verify reversal JE pattern
- `.planning/phases/71-bulk-expense-upload-asset-reclassification/` — Context + plans for EXP-04 reclassification flow

### Frontend
- `src/pages/FinancialStatement.tsx` — Main P&L page (line 123 onward), comparison mode, CSV download
- `src/components/financials/PLRow.tsx` — Line-item row component
- `src/components/financials/ChannelRow.tsx` — Per-channel breakdown row
- `src/components/financials/DataQualityPanel.tsx` — Gap analysis panel (extend with convertedToAssetId check)
- `src/lib/financialHelpers.ts` — `computeDelta`, `DeltaIndicator`, `SectionHeaderRow`, `PLTableSkeleton`
- `src/lib/csvExport.ts` — `generateIncomeStatementCSV` (add new rows)
- `src/hooks/convex/useFinancials.ts` — Hook wiring
- `src/lib/dateUtils.ts` — WIB timezone frontend helpers

### Prior Phase Context
- `.planning/phases/70-data-accuracy-foundation/70-CONTEXT.md` — D-07 to D-10 COGS override rules (must be honored downstream)
- `.planning/phases/49-*` (if archived) or v1.7 milestone archive — EBITDA bridge origin
- `.planning/phases/60-*` (if archived) or v1.8 milestone archive — Asset Register with depreciation

### Requirements
- `.planning/REQUIREMENTS.md` §FIN-01, FIN-02 — Active v2.0 requirements
- `.planning/ROADMAP.md` Phase 75 — Goal + success criteria

### Docs to Update
- `docs/CHANGELOG.md` (MANDATORY after merge)
- `docs/API_REFERENCE.md` if new query args added
- `docs/ROADMAP.md` if FIN-01/FIN-02 marked complete

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **EBITDA computation already isolated**: `depreciationAmount` and `amortizationAmount` are already computed in `aggregateWeek` via `opex.items.filter(code === 6150)` / `6160`. The reorganization is mostly a presentation change — split the OpEx row into two subtotals instead of computing the add-back.
- **Journal aggregation via `aggregateJournalLines`**: Already scans `journalEntryLines` by `by_entryDate` index. No N+1 concern.
- **Gap analysis pattern**: `gapAnalysis` field on `WeekData` already extends with structured findings — add a `missingReversals` array for the Phase 71 check.
- **Period fetch pattern**: `ctx.db.query("externalRevenue").withIndex("by_period", ...)` — mirror for `fixedAssets` (needs new index? check).
- **DataQualityPanel** already extensible with new `missingReversals` check without schema migration.

### Established Patterns
- **Real-time query aggregation** (v1.5): no snapshot tables, all computed live. Continue this — CapEx aggregation is a single indexed scan, cheap.
- **Confidence classification** (v1.5): every figure tagged exact/calculated/inferred/missing. CapEx should be `"exact"` when sourced from `fixedAssets`, `"calculated"` if any assets have zero-cost components flagged by gap analysis.
- **Margin denominator**: percentages use `totalGross` (not `netRevenue`) as base. Continue this for new % rows (EBIT%, EBITDA%, NI%, FCF%).
- **Single-query journal aggregation**: OpEx sourced by `by_entryDate` index, grouped in-memory. No N+1. Same pattern for CapEx from `fixedAssets`.
- **fixedAssets index choice**: schema has `by_status`, `by_category`, `by_asset_number`. No `by_acquisitionDate` index exists — **research must decide**: add one (small table, low churn) OR scan + filter (acceptable for <1000 assets). Likely acceptable to scan at current scale.

### Integration Points
- `incomeStatement.ts` `fetchAndAggregate` — add `fixedAssets` query to the Promise.all batch for current + previous period
- `aggregateWeek` — add CapEx computation, FCF computation, return new fields on `WeekData`
- `FinancialStatement.tsx` — add new rows below Net Income, adjust section collapse groups, update expand/collapse state for new FCF section
- `csvExport.ts` — extend row list
- `DataQualityPanel` — add "Missing reversal JEs" check

</code_context>

<specifics>
## Specific Ideas

- **Rename Gross Profit → Contribution Margin** at the per-channel breakdown level, but keep "Gross Profit" as a company-level subtotal name for continuity (or rename both if clarity dictates — Claude's discretion in the UI spec phase).
- **Full reorg** is preferred over "keep EBITDA bridge + add FCF below" to avoid D/A appearing twice. Standard textbook layout lands cleaner.
- **FCF row must always render** even at 0 to make the bridge visible as a structural element, not a conditional add-on.
- **No per-channel allocation fakery** — honest representation beats allocated-by-revenue-share estimates that users would treat as exact.

</specifics>

<deferred>
## Deferred Ideas

- **Tax-optimized EBITDA bridge variant** — Alternative P&L presentation starting EBITDA from net-of-commission revenue (not gross revenue) so taxable-revenue base is lower. Worth considering once tax/PPh line is added. Future milestone (v2.1+).
- **Channel-tagged direct OpEx** — Schema already supports platform-deducted OpEx (commissions, ads, promo) via externalRevenue. Manual channel tagging for non-platform direct costs (e.g., dedicated kitchen staff for one channel) would require new `journalEntries.channelSource` field. Defer unless a real use case emerges.
- **Net CapEx (acquisitions − disposal proceeds)** — Could refine FCF to use net CapEx instead of gross. Current gross approach is simpler and disposal gain/loss already flows through NI. Revisit if FCF reporting needs more precision.
- **Print-friendly P&L view** — Out of scope per `.planning/REQUIREMENTS.md`. CSV export covers external sharing.
- **Monthly/quarterly period selector** — Already supported by `useFinancials` / `PeriodMode`. No new work.

</deferred>

---

*Phase: 75-full-p-l-extension*
*Context gathered: 2026-04-17*
