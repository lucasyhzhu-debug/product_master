# Phase 75: Full P&L Extension — Research

**Researched:** 2026-04-17
**Domain:** Financial Reporting (Income Statement extension)
**Confidence:** HIGH
**Requirements addressed:** FIN-01, FIN-02

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**CapEx Data Source (FIN-01):**
- **D-01:** CapEx is sourced from the `fixedAssets` table. Query: sum `cost` where `acquisitionDate` falls in the period. Denormalized, matches Asset Register UI, no double-counting risk with OpEx.
- **D-02:** Expenses converted to CapEx via Phase 71 (`convertedToAssetId`) are included automatically because the conversion creates a `fixedAssets` row. The JE reversal pattern (Dr 1500 / Cr 6xxx) already pulls the original expense out of OpEx — no separate subtraction logic needed in the P&L query.
- **D-03:** Scope: **gross acquisitions** — do not net out disposal proceeds. Disposal gain/loss already lives in Other Income/Expense (existing behavior) and flows into Net Income before the FCF bridge.
- **D-04:** Include ALL acquisitions regardless of future fate — do NOT exclude assets with `disposalType = "reclassify_to_expense"`. The cash outflow already occurred at acquisition; later reclassification is a non-cash accounting adjustment handled elsewhere.

**CapEx Timing (FIN-01):**
- **D-05:** Primary timing = `fixedAssets.acquisitionDate` (business date). Matches depreciation logic, Asset Register UI, and user mental model.
- **D-06:** For Phase-71-converted expenses: `acquisitionDate` must equal the ORIGINAL expense date (when the expense was first incurred), not the reclassification date. **Research must verify** `convex/expenses/mutations.ts` / `convex/fixedAssets/mutations.ts` already stamps the original expense date; if not, plan includes a one-line fix.

**P&L Layout (FIN-01):**
- **D-07:** Full reorganization — EBITDA-first canonical layout (Revenue → Net Revenue → COGS → Contribution Margin → OpEx-excl-D/A → EBITDA → D/A → EBIT → Other → NI → CapEx → FCF).
- **D-08:** OpEx row must split into `opexExcludingDA` + `depreciationAmortization`. Filter OpEx lines by `DEPRECIATION_EXPENSE_CODE` (6150) and `AMORTIZATION_EXPENSE_CODE` (6160).
- **D-09:** D/A appears ONCE in the new layout (as its own line between EBITDA and EBIT). The old "EBITDA as add-back above EBIT" presentation is replaced, not duplicated.

**Per-Channel Breakdown (FIN-02):**
- **D-10:** Per-channel rows flow through: Gross Revenue → Platform Deductions → Net Revenue → COGS → Contribution Margin (stops here). Rename existing "Gross Profit per channel" header to "Contribution Margin".
- **D-11:** No allocation of OpEx, D/A, CapEx, or FCF to channels. Company-level only below Contribution Margin.
- **D-12:** Channel-specific OpEx is ALREADY captured upstream via platform API deductions — no separate channel-tagged OpEx line needed.

**Free Cash Flow (FIN-01):**
- **D-13:** FCF formula: `Net Income + Depreciation + Amortization − CapEx`. Single subtotal line at the bottom.
- **D-14:** Zero CapEx presentation: always render the CapEx row even when zero. Show `0` with muted helper note "No asset acquisitions this period".

**Data Quality / Gap Analysis:**
- **D-15:** Extend DataQualityPanel with a check for `convertedToAssetId` expenses whose reversal JE is missing.

**CSV Export:**
- **D-16:** `generateIncomeStatementCSV` must gain rows for: OpEx-excluding-D/A, EBITDA, D/A (separated or combined), EBIT, Net Income, CapEx, FCF. Per-channel columns only populate through Contribution Margin; below that, columns are blank and "Company Total" carries the values.

### Claude's Discretion
- Exact visual styling of the FCF bridge (border, muted background, separator) — follow existing PLRow patterns.
- Placement of the D/A row label ("Depreciation & Amortization" vs split into two rows). Default: single combined line with a tooltip breakdown if both amounts are non-zero.
- Naming: "Free Cash Flow (simplified)" vs "Free Cash Flow" — default to just "Free Cash Flow" with a tooltip explaining the formula.
- Error/edge handling for periods pre-dating the Asset Register (no fixedAssets rows) — CapEx shows 0 with the standard helper note.

### Deferred Ideas (OUT OF SCOPE)
- Tax-optimized EBITDA bridge starting from net-of-commission revenue (future v2.1+).
- Channel-tagged direct OpEx (requires schema migration — `journalEntries.channelSource`).
- Net CapEx (acquisitions − disposal proceeds).
- Print-friendly P&L view.
- Monthly/quarterly period selector (already supported by `useFinancials`).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FIN-01 | Income Statement extends from Net Income through Depreciation/Amortization, CapEx, to Free Cash Flow | All blocks in place — D/A is already computed in `aggregateWeek` lines 469-475; CapEx requires adding one `fixedAssets` query to `fetchAndAggregate` Promise.all and a sum/filter in a new pure function. `reversal` JE mechanism is verified wiring OpEx out cleanly. New WeekData fields required: `opexExcludingDA`, `capExAmount`, `freeCashFlow`. |
| FIN-02 | Per-channel breakdown continues through the full P&L flow (Revenue → FCF) | D-10/D-11 SCOPE LIMIT: per-channel stops at Contribution Margin. Existing `ChannelRow` shows Gross, COGS, Gross Margin. This phase renames the per-channel "Gross Margin" label → "Contribution Margin" and adds an explicit per-channel Net Revenue and Contribution Margin amount row within the expanded panel. Below Contribution Margin, channel columns in CSV are blank and company-total column carries values. |
</phase_requirements>

## Overview

Phase 75 extends the existing Income Statement (shipped in Phase 32–34, with EBITDA bridge added later) from its current Net-Income endpoint down to Free Cash Flow. The bulk of the work is **presentation reorganization**, not new computation: depreciation and amortization are already isolated in `aggregateWeek` (lines 469–475, `convex/reports/incomeStatement.ts`), and the only genuinely new data source is `fixedAssets.cost` summed by `acquisitionDate` in-period. The canonical textbook layout (Revenue → Net Revenue → COGS → Contribution Margin → OpEx-excl-D/A → EBITDA → D/A → EBIT → Other → Net Income → CapEx → FCF) replaces the current "OpEx → EBIT → EBITDA-as-addback" arrangement so D/A appears exactly once. Per-channel rows continue to flow from Gross Revenue through Contribution Margin (renamed from "Gross Margin"); OpEx/D/A/CapEx/FCF remain company-level by explicit decision (D-11). CapEx from `fixedAssets` is marked confidence `"exact"` because it is denormalized integer IDR per asset. Scope is bounded to: `convex/reports/incomeStatement.ts` (add CapEx query + computation), `src/pages/FinancialStatement.tsx` (reorder rows, add D/A/CapEx/FCF rows), `src/components/financials/ChannelRow.tsx` (rename labels, show contribution margin amount), `src/components/financials/DataQualityPanel.tsx` (missingReversals check), and `src/lib/csvExport.ts` (new row list).

## Current-State Inventory

### Already implemented — reusable
| Asset | Location | Current behavior |
|-------|----------|------------------|
| Period fetch of `externalRevenue`/`consignmentSettlements` via indexed range | `convex/reports/incomeStatement.ts:543-578` | `by_period` index on both bounds — pattern to mirror for fixedAssets |
| Parallel `Promise.all` batch for all base data | `convex/reports/incomeStatement.ts:541-593` | Add two more entries (current + previous fixedAssets) |
| Journal line aggregation via `aggregateJournalLines` | `convex/lib/journalHelpers.ts:14-44` | OpEx lines already aggregated, grouped by accountId |
| Depreciation/Amortization extraction from OpEx | `convex/reports/incomeStatement.ts:469-475` | Filters `opex.items` by `code === "6150"` / `"6160"` and sums `.total` |
| EBITDA add-back computation | `convex/reports/incomeStatement.ts:475-477` | `ebitda = ebit + depreciationAmount + amortizationAmount` |
| `WeekData` shape | `convex/reports/incomeStatement.ts:67-97` | 32 fields including `opex[]`, `totalOpEx`, `ebit`, `depreciationAmount`, `amortizationAmount`, `ebitda` |
| Channel confidence cascade | `convex/reports/incomeStatement.ts:112-128`, `311-317` | `getChannelRevenueConfidence()` + worstConfidence downgrade |
| `computeDelta` helper (client + server) | `convex/reports/incomeStatement.ts:101-108`, `src/lib/financialHelpers.tsx:73-80` | Reusable for new delta fields |
| `PLRow` with `labelTooltip`, indent, `isBold`, `isTopBorder`, `confidence` props | `src/components/financials/PLRow.tsx:18-31` | All props needed for FCF/CapEx/D/A rows already exist |
| Section expand/collapse (useState pattern) | `src/pages/FinancialStatement.tsx:153-157` | 5 existing section states — add one for FCF bridge group if needed |
| CSV formula-injection sanitizer | `src/lib/csvExport.ts:607-623` | Handles all output |
| `convex-test` + vitest infra | `package.json`, `convex/reports/__tests__/incomeStatement-shopee.test.ts` | Pattern for seed + run query tests exists |

### Missing — must build
| Asset | Why missing | Impact |
|-------|-------------|--------|
| CapEx aggregation from `fixedAssets` | Not needed before Phase 75 | Add pure function, ~15 LOC |
| `opexExcludingDA` field on WeekData | Current UI shows combined OpEx with D/A inside | Add field, derive as `totalOpEx − depreciationAmount − amortizationAmount`; planner must decide whether to surface it as a new field or compute on the client |
| `capExAmount`, `freeCashFlow` fields on WeekData | New lines | Add 2 fields |
| Delta entries for capEx/FCF/opexExcludingDA/da | Not in current deltas | Add 4 entries |
| Per-channel `netRevenue` + `contributionMargin` display values | ChannelRow currently shows gross + cogs + gross margin % only | Add to ChannelRow expanded sub-rows |
| `missingReversals` gap check | Novel | New gapAnalysis field + compute block |
| CSV rows for OpEx-excl-DA, D/A, CapEx, FCF | Novel | ~50 lines of row pushes |

## Key Findings

### 1. fixedAssets index for CapEx aggregation — **VERIFIED NO INDEX EXISTS**

**Finding:** `fixedAssets` has only `by_status`, `by_category`, `by_asset_number` indexes. No `by_acquisitionDate`.

**Evidence:** `convex/schema.ts:2207-2209`:
```
.index("by_status", ["status"])
.index("by_category", ["category"])
.index("by_asset_number", ["assetNumber"])
```

**Recommendation:** Do **NOT** add `by_acquisitionDate` at this phase.

**Rationale:**
- Current table size is small (Phase 60 shipped a few weeks ago; production has <100 assets, and reasonably a few hundred even after a year of use). The table is low-churn — assets are added rarely.
- Convex `.collect()` + JS filter over <1000 docs is sub-millisecond and runs once per income statement query.
- Adding an index costs index-write amplification on every asset mutation (small, but real) and schema churn — not worth it at current scale.
- The query is `ctx.db.query("fixedAssets").collect()` → filter by `acquisitionDate >= periodStart && acquisitionDate < periodEnd && status !== undefined` (all statuses count per D-04) + maybe `disposalType !== "reclassify_to_expense"` if D-04 were the opposite — which it isn't; D-04 says include everything.
- Revisit at 10,000+ assets or if P&L query latency exceeds 200ms.

**Planner guidance:** use `ctx.db.query("fixedAssets").collect()` in the existing Promise.all, then filter in the pure `aggregateWeek` function. Parallel-fetch once, reuse for both current and previous period by passing the full array and filtering twice (same pattern as the shared `revenueItemsMap` in existing code, lines 641-653).

### 2. Phase 71 reclassification — acquisitionDate stamping — **VERIFIED CORRECT**

**Finding:** `convertToCapex` stamps `acquisitionDate = expense.expenseDate` correctly. **No fix needed.**

**Evidence:** `convex/expenses/mutations.ts:842-860`:
```typescript
const assetId = await ctx.db.insert("fixedAssets", {
  assetNumber,
  name: expense.description,
  category: args.category,
  acquisitionDate: expense.expenseDate,   // ← ORIGINAL expense date, not Date.now()
  cost: expense.amount,
  ...
});
```

And the acquisition JE (`convex/expenses/mutations.ts:870-880`) also uses `expense.expenseDate`:
```typescript
const acquisitionJeId = await createJournalEntryWithLines(ctx, {
  date: expense.expenseDate,   // ← same source of truth
  ...
});
```

Asset-number sequencing uses the original date too (`getNextAssetNumber(ctx, categoryConfig.abbr, expense.expenseDate)` — line 837).

**Implication for CapEx aggregation:** A period's CapEx total will include converted-expense acquisitions that happened within the period's date range, matched to the original expense date. This aligns with the EBITDA bridge: the original expense reversal lands in the same accounting period where the expense was booked (because `createReversalEntry` uses `original.date`, `convex/lib/journalEngine.ts:343`), so OpEx is reduced in-period, CapEx is increased in-period — same period, no bridge timing mismatch. **No code change required for D-06.**

### 3. Phase 71 reversal JE pattern — **VERIFIED ATOMIC**

**Finding:** Reversal JE is created atomically with the asset row, in `convertToCapex` (`convex/expenses/mutations.ts:787-930`). sourceType is `"expense_void"`.

**Evidence:**
- `convex/expenses/mutations.ts:814-821`: `createReversalEntry(ctx, expense.journalEntryId, "expense_void", ctx.user._id)` called before asset insert.
- `convex/lib/journalEngine.ts:342-349`: the reversal JE is created via `createJournalEntryWithLines` with `sourceType: "expense_void"`, `sourceId: original.sourceId` (the expense's own sourceId — typically the expense row — threaded through so `by_source` queries still find both).
- `convex/lib/journalEngine.ts:352-355`: the ORIGINAL JE (the expense's initial posting) has `isReversed: true` and `reversedByEntryId: reversalId` patched in the same atomic mutation.

**Exact `sourceType` values relevant to the missingReversals gap check (D-15):**
- Expense's original JE: `sourceType: "expense_approval"` (or whatever the expense flow uses — the reversal pairs it against `"expense_void"` per the `VOID_PAIRING` map at `convex/lib/journalEngine.ts:80`: `expense_approval: "expense_void"`).
- Reversal JE: `sourceType: "expense_void"`.

**Gap check query pattern for D-15:**
```
1. query expenses where convertedToAssetId != null AND journalEntryId != null
2. for each: ctx.db.get(expense.journalEntryId)
3. flag any where `isReversed !== true`
```

This catches a data-integrity regression where a future bug bypasses `createReversalEntry` and creates an asset without voiding the expense JE. In healthy state this list is always empty. The check is cheap (one indexed lookup per converted expense) and can be restricted to the current period via `expenseDate` range.

### 4. Existing EBITDA bridge computation — **VERIFIED "mostly presentation change"**

**Exact location:**
- `convex/reports/incomeStatement.ts:469-474` — depreciation/amortization are filtered out of `opex.items` into their own numbers:
```typescript
const depreciationAmount = opex.items
  .filter((item) => item.code === DEPRECIATION_EXPENSE_CODE)
  .reduce((sum, item) => sum + item.total, 0);
const amortizationAmount = opex.items
  .filter((item) => item.code === AMORTIZATION_EXPENSE_CODE)
  .reduce((sum, item) => sum + item.total, 0);
```
- `convex/reports/incomeStatement.ts:475-477` — `ebitda = ebit + depreciationAmount + amortizationAmount` (add-back pattern).
- `convex/reports/incomeStatement.ts:484-512` — return object includes `opex: opex.items` (still carrying D/A lines), `totalOpEx` (still inclusive of D/A), `ebit`, `depreciationAmount`, `amortizationAmount`, `ebitda`.

**Key insight — D/A is NOT removed from `opex.items` or `totalOpEx`.** It's only extracted as a derived side quantity. So today the UI renders 6150 and 6160 inside the OpEx list AND re-adds them to make EBITDA.

**For Phase 75 D-08, two options:**
- **Option A (recommended):** filter D/A OUT of `opex.items` and add a derived `opexExcludingDA` total. This is cleaner: a single list "OpEx (excl. D/A)" below Contribution Margin, then a separate D/A row below EBITDA. Trade-off: the UI no longer shows D/A inside the OpEx-expand section; users find D/A in its dedicated row.
- **Option B:** keep `opex.items` unchanged, add a computed `opexExcludingDA = totalOpEx - depreciationAmount - amortizationAmount`, and on the frontend filter out the D/A line from the OpEx expand UI. Minimizes backend diff but requires frontend coordination.

**Recommendation:** Option A. Rationale — the query is the single source of truth for the P&L shape, and D-08 reads as "the OpEx row must split". Filtering in the backend lets `csvExport` iterate `opex` without knowing about D/A codes. Additive fields (no removal): add `opexExcludingDA: number` and `depreciationAmortization: number` on WeekData. Keep `depreciationAmount` and `amortizationAmount` for the tooltip breakdown; keep `ebitda`, `ebit` (both already present). Keep `totalOpEx` as sum of everything incl. D/A for back-compat — or remove and have clients compute. Planner decides, but recommend keeping for back-compat within this phase.

**Minimal new fields needed on WeekData:**
```
opexExcludingDA: number           // totalOpEx - depreciationAmount - amortizationAmount
depreciationAmortization: number  // depreciationAmount + amortizationAmount (same as ebitda - ebit)
capExAmount: number                // sum of fixedAssets.cost in-period (all statuses per D-04)
freeCashFlow: number               // netIncome + depreciationAmortization - capExAmount
```

Plus filter 6150/6160 out of `opex.items` (so UI + CSV iterate only non-D/A OpEx lines).

**Minimal new delta entries on deltas shape:**
```
opexExcludingDA: { amount, percent }
depreciationAmortization: { amount, percent }
capExAmount: { amount, percent }
freeCashFlow: { amount, percent }
fcfMarginPp: number | null
```

### 5. Per-channel aggregation today — **VERIFIED path**

**Current data shape per channel** (`convex/reports/incomeStatement.ts:35-53`):
```
{
  source, displayName,
  gross, netRevenue, discount, commission, adBurn, promoBurn, revShare,
  transactions, confidence,
  cogs: { production, packaging, total },
  products: [...ProductDetail]
}
```

**Current rollup path:**
1. `revenueBySource` map groups externalRevenue records by `source` (`lines 215-220`).
2. Per channel: sums gross/deductions, transactions (`lines 232-296`).
3. Per revenue record: `resolveItemsCOGS(items, cogsMap, ...)` populates channel COGS + products (`lines 298-308`).
4. Consignment handled separately via `consignmentSettlements` table, uses `linkedRevenueId` to find externalRevenueItems (`lines 337-384`).
5. `channels.sort((a, b) => b.gross - a.gross)` — sorts descending by gross.

**Contribution Margin per channel (FIN-02 D-10):**
Today it's computed ONLY at render time inside `ChannelRow`:
- `src/components/financials/ChannelRow.tsx:52-58`:
```typescript
const channelGrossProfit = channel.netRevenue - channel.cogs.total;
const channelGrossMargin = channel.gross !== 0 ? (channelGrossProfit / channel.gross) * 100 : null;
```
Label: "Gross Margin" at line 148.

**For FIN-02 D-10:**
- **Minimal change:** rename the label at `ChannelRow.tsx:148` from "Gross Margin" → "Contribution Margin". Add a parallel amount row showing the IDR value (the existing code already has `channelGrossProfit` in scope — just surface it).
- **Optional:** expose `contributionMargin` as a field on ChannelData for CSV export. Doing this in the backend is cleaner because csvExport is client-side and already duplicates the shape (`src/lib/csvExport.ts:16-32`). Add `netRevenue` (already exists) and a new `contributionMargin: number` on ChannelData.
- **No other backend change.** Channel data already carries everything needed down to Contribution Margin.

### 6. Date filtering for fixedAssets — **VERIFIED alignment possible**

**`externalRevenue` period filter uses** `by_period` index on `periodStart`: `.gte("periodStart", currentStart).lt("periodStart", currentEnd)` (half-open interval, exclusive end — `convex/reports/incomeStatement.ts:543-550`).

**Period range conventions** (`convex/lib/periodRange.ts`):
- `calculateWeekRange` (line 201-213): `currentStart` = Monday 00:00 WIB, `currentEnd` = next Monday 00:00 WIB (**exclusive**).
- `calculateMonthRange` (line 149-160): `currentStart` = 1st at 00:00 WIB, `currentEnd` = 1st of next month 00:00 WIB (**exclusive**).
- `calculateCustomRange` (line 172-185): `currentStart` = user value, `currentEnd` = user value (**exclusive**).
- All bounds are UTC epoch ms.

**`fixedAssets.acquisitionDate`** is stored as epoch ms (`convex/schema.ts:2186`: `v.number(), // Epoch ms (business date)`). Phase 60 uses `wibMidnightToUtc(year, m, 1)` when materializing JE dates (`convex/fixedAssets/mutations.ts:354`), so the convention is "WIB midnight in UTC ms".

**Filter expression (pure function):**
```typescript
const capExCurrent = allFixedAssets
  .filter((a) => a.acquisitionDate >= currentStart && a.acquisitionDate < currentEnd)
  .reduce((sum, a) => sum + a.cost, 0);
```

This **exactly matches** the half-open interval used by externalRevenue.by_period — zero mismatch. Assets acquired at Monday 00:00 WIB are attributed to that week; assets acquired at the transitional instant are not double-counted.

**Edge case:** the `allTime` preset (`calculatePeriodRange` line 124-132) uses `currentStart = Date.UTC(2020, 0, 1)`. Assets acquired before Jan 1, 2020 are excluded. Acceptable — Frollie has no pre-2020 fixed assets.

### 7. Zero-CapEx render (D-14) — **VERIFIED pattern support**

**`PLRow` component** supports always-render with zero values — there is no conditional in PLRow itself. Zero formats as "Rp 0" via `formatCurrency(0)` or "(Rp 0)" via `formatNegative(0)`.

**"Muted zero" helper note:** no existing prop on PLRow supports a dedicated helper line.

**Planner options:**
- **Option A (minimal):** add a `labelTooltip` or an inline subdued text below/beside the label. `PLRow` already supports `labelTooltip` (line 30, rendered as dashed-underline hover — see `PLRow.tsx:55-65`). The tooltip text could be "No asset acquisitions this period" when value is 0.
- **Option B (better UX):** add a new optional `helperText` prop to PLRow that renders below the label in smaller muted text when present. ~10 lines of JSX. Cleaner for the user because the note is always visible, not hover-gated.

**Recommendation:** Option B. The D-14 spirit is "preserve bridge visibility" — a tooltip isn't visible at a glance. Planner can justify adding the prop as a small, reusable addition.

### 8. CSV export row ordering (D-16) — **VERIFIED current rows**

**Current `generateIncomeStatementCSV` row list** (in order, `src/lib/csvExport.ts:126-571`):
1. Header row.
2. Gross Revenue (all) — line 148-158.
3. Per-channel Gross Revenue — lines 161-178.
4. Customer Discounts & Vouchers, Platform Commissions, Ad Spend & Promos, Consignment Rev Share (all) — lines 184-234.
5. Per-channel deduction breakdowns (conditional on > 0) — lines 237-289.
6. Net Revenue — lines 291-301.
7. Production COGS, Packaging COGS, Total COGS — lines 303-342.
8. Gross Profit — lines 346-355.
9. Gross Margin % — lines 357-376.
10. Per OpEx account row (+ previous-only items) — lines 381-410.
11. Total Operating Expenses — lines 413-422.
12. EBIT — lines 425-434.
13. EBIT Margin % — lines 437-456.
14. EBITDA — lines 459-468.
15. EBITDA Margin % — lines 471-490.
16. Per Other account row (+ previous-only) — lines 495-524.
17. Total Other Income / Expense — lines 527-536.
18. NET INCOME — lines 539-548.
19. Net Margin % — lines 551-570.
20. Footer: Data Quality Notes — lines 574-604.

**D-16 required insertions (in canonical EBITDA-first order):**

Target row order (keeping per-channel revenue/deductions structure intact at top, changing the P&L summary sequence to match the UI):
- ... through Gross Margin % (unchanged) ...
- (rename "Gross Profit" row → "Gross Profit / Contribution Margin" per D-10; per-channel columns populate here, company-total elsewhere blank)
- Per OpEx account rows — **EXCLUDE 6150/6160** (filter these out for the OpEx section)
- **NEW:** "Total Operating Expenses (excl. D/A)" — use `totalOpEx - depreciationAmortization`
- **NEW/MOVED:** "EBITDA" (existing row, moves up in the order)
- **NEW:** "Depreciation & Amortization" (or split into two rows)
- "EBIT (Operating Profit)" (existing, moves to between D/A and Other)
- "EBITDA Margin %" and "EBIT Margin %" rows can appear together or individually beside their parent subtotals
- Per Other account rows (unchanged)
- Total Other Income / Expense (unchanged)
- NET INCOME (unchanged)
- Net Margin % (unchanged)
- **NEW:** "CapEx (Fixed Asset Acquisitions)" — single company-total row, channel columns blank
- **NEW:** "Free Cash Flow" — single company-total row
- **NEW:** "FCF Margin %" (optional, FCF / totalGross × 100) — discretion
- Footer: existing data quality notes + **NEW:** missingReversals lines if any

**Per-channel column handling in CSV (D-16):**
The current CSV uses a `channel` column populated per-row ("All" for aggregates, `displayName` for channel-specific). For D-16, rows below Contribution Margin should emit `channel = "All"` only. This is already how EBITDA, EBIT, Net Income rows are emitted today — no change.

### 9. D/A in OpEx filtering — **VERIFIED no side effect, filter must be applied**

**Current:** `opex.items` retains D/A lines. `totalOpEx` sums all OpEx including D/A. The D/A extraction at lines 469-474 is **derived-only** — it does not mutate `opex.items`.

**Evidence:** the return object at lines 484-501 passes `opex: opex.items` through unchanged.

**Implication for Phase 75:**
- The backend must actively filter D/A codes (6150, 6160) out of `opex.items` for the new layout.
- `totalOpEx` could either (a) remain inclusive for back-compat (and a new `opexExcludingDA` is derived), or (b) become exclusive (behaves differently, breaks downstream consumers).
- **Recommendation:** keep `totalOpEx` inclusive, add `opexExcludingDA`, BUT filter `opex.items` to exclude 6150/6160. This is the smallest compatible change.

**Safer alternative:** return two arrays — `opex.items` (unchanged, all lines) AND `opexItemsExcludingDA` (filtered). This gives the UI and CSV flexibility without changing existing behavior. Cost: one extra array in the payload (negligible). Planner's choice.

### 10. FinancialStatement.tsx expand/collapse state — **VERIFIED simple useState pattern**

**Current:** 5 useState booleans at `src/pages/FinancialStatement.tsx:153-157`:
```typescript
const [revenueExpanded, setRevenueExpanded] = useState(true);
const [deductionsExpanded, setDeductionsExpanded] = useState(false);
const [cogsExpanded, setCogsExpanded] = useState(false);
const [opexExpanded, setOpexExpanded] = useState(false);
const [otherExpanded, setOtherExpanded] = useState(false);
```

No Context, no reducer — plain useState. SectionHeaderRow takes `isExpanded` + `onToggle`.

**For Phase 75:** adding a 6th `fcfExpanded` state (for a new "Cash Flow Bridge" section containing D/A, CapEx, FCF) or renaming `otherExpanded` — trivial. No architecture concerns.

**Simpler approach:** the D/A, CapEx, FCF rows are subtotal lines, not a collapsible section. They can render as standalone `PLRow`s without a parent `SectionHeaderRow`, matching how EBIT, EBITDA, Net Income are rendered today (not inside an expandable section). Planner default: follow the Net Income pattern — no new expand state needed.

### 11. Confidence classification for CapEx — **pattern already exists**

CapEx sourced from `fixedAssets.cost` is **`"exact"`** (denormalized integer IDR, directly user-entered at asset creation and validated: `cost > 0 && Number.isInteger(cost)` — `convex/fixedAssets/mutations.ts:104-106`).

**Zero-cost assets:** asset creation validates `cost > 0`, so there should be NO `fixedAssets` rows with `cost === 0`. If one ever appears, it indicates data corruption.

**Gap analysis extension (optional but recommended):**
```
gapAnalysis.zeroValueAssets: Array<{ assetNumber: string; name: string }>
```
If this list is non-empty, confidence downgrades to `"calculated"` and the DataQualityPanel flags it. Cost: ~5 LOC.

**Note:** `gapAnalysis.missingCosts` is NOT a pre-existing pattern — the existing gapAnalysis has only `unmappedProducts`, `zeroCostComponents`, `missingChannels`, `totalMappedProducts`, `totalProducts`. D-15 adds `missingReversals`; planner may add `zeroValueAssets` at their discretion.

### 12. Depreciation source — **VERIFIED already from JEs**

**D/A is sourced from `journalEntryLines` via `aggregateJournalLines`, filtered by accountId to opex accounts, then the pure-function extractor at `incomeStatement.ts:469-474` re-filters the resulting `opex.items` by account code (6150/6160).**

**NO separate pull from `fixedAssets.accumulatedDepreciation`.**

**Exact path:**
1. `incomeStatement.ts:587-589` — indexed query: `journalEntryLines.withIndex("by_entryDate", ...)` for current period.
2. `incomeStatement.ts:596` — `opexIds` Set built from accounts of type `opex`.
3. `incomeStatement.ts:604` — `aggregateJournalLines(currentJournalLines, opexIds, accountLookup)` → `{ items: [{ code, name, total }], total }`.
4. `incomeStatement.ts:469-474` — `depreciationAmount = opex.items.filter(code === "6150").reduce(sum)`, same for amortization.

**Phase 60 cron (`convex/crons.ts` — not read but referenced) is responsible for posting monthly depreciation JEs.** When it runs, each JE has `sourceType: "depreciation"`, debits `6150`/`6160` (expense account), credits `1610-1670`/`1710-1730` (accumulated depreciation contra-asset account). The P&L query finds these via the expense debit leg landing in `opexIds` during `aggregateJournalLines`.

**Implication for Phase 75:** NO change needed to depreciation sourcing. Just surface the already-extracted amount as its own row instead of an EBITDA add-back.

### 13. Test infrastructure — **VERIFIED convex-test ready**

**Setup present:**
- `package.json`: `"convex-test": "^0.0.41"`, `"vitest": "^4.0.18"`, `"@vitest/coverage-v8": "^4.0.18"`.
- `npm run test`, `npm run test:watch`, `npm run test:coverage` all defined.
- Existing test for income statement: `convex/reports/__tests__/incomeStatement-shopee.test.ts` (demonstrates pattern: `convexTest(schema)`, seed via `t.run(async ctx => ctx.db.insert(...))`, call query via `t.query(api.reports.incomeStatement.getIncomeStatement, { periodStart, periodEnd })`).
- fixedAssets tests exist too: `convex/fixedAssets/__tests__/helpers.test.ts`, `convex/fixedAssets/mutations.test.ts`.

**Pattern for new tests:**
```typescript
// convex/reports/__tests__/incomeStatement-capex.test.ts
describe("incomeStatement — CapEx and FCF (FIN-01)", () => {
  it("CapEx sums fixedAssets.cost in-period", async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => ctx.db.insert("users", {...}));
    await t.run(async (ctx) => {
      await ctx.db.insert("fixedAssets", {
        assetNumber: "FA-KIT-2603-001",
        name: "Mixer",
        category: "mesin_produksi",
        acquisitionDate: IN_PERIOD_MS,
        cost: 10_000_000,
        salvageValue: 500_000,
        usefulLifeMonths: 96,
        characteristics: [],
        attachmentIds: [],
        status: "active",
        monthlyDepreciation: 0,
        accumulatedDepreciation: 0,
        createdBy: userId,
        createdAt: Date.now(),
      });
    });
    const stmt = await t.query(api.reports.incomeStatement.getIncomeStatement, {
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });
    expect(stmt.current.capExAmount).toBe(10_000_000);
    expect(stmt.current.freeCashFlow).toBe(stmt.current.netIncome + stmt.current.depreciationAmortization - 10_000_000);
  });
});
```

**A dedicated Wave 3 test task is PRACTICAL and recommended.** ~4–6 tests (CapEx aggregation, period boundary, FCF formula, D-04 reclassify inclusion, D-06 converted-expense stamping). ~120 LOC.

## Integration Map

### Backend changes (1 file)

**`convex/reports/incomeStatement.ts`** — extension target:

| Change | Location | Before/After |
|--------|----------|--------------|
| Import | top of file | add nothing new — `DEPRECIATION_EXPENSE_CODE`, `AMORTIZATION_EXPENSE_CODE` already imported at lines 22-24 |
| WeekData interface | lines 67-97 | **Add:** `opexExcludingDA: number`, `depreciationAmortization: number`, `capExAmount: number`, `freeCashFlow: number`, `fcfMarginPercent: number \| null`, `gapAnalysis.missingReversals: Array<{...}>`, `gapAnalysis.zeroValueAssets?: Array<{...}>` |
| fetchAndAggregate Promise.all | lines 541-593 | **Add 2 array entries** querying `fixedAssets` (unfiltered `.collect()`) current + previous. Add 1 entry for `expenses` with `convertedToAssetId != null` current + previous for missingReversals gap check. |
| aggregateWeek signature | lines 197-211 | **Add 2 params:** `fixedAssets: Doc<"fixedAssets">[]`, `missingReversalExpenses: Array<{ expenseId, journalEntryId, isReversed }>` or similar |
| aggregateWeek body | lines 461-512 | **After EBITDA block (lines 468-477), add:** CapEx aggregation filter, FCF = NI + D/A − CapEx, opexExcludingDA = totalOpEx − (dep+amort), filter 6150/6160 out of returned `opex.items`. **After gapAnalysis build (lines 419-425), add:** `missingReversals` list computed from passed-in expense array. |
| Return object | lines 484-512 | Add new fields |
| deltas block | lines 701-755 | **Add deltas for:** `opexExcludingDA`, `depreciationAmortization`, `capExAmount`, `freeCashFlow`, `fcfMarginPp` |

**Estimated backend diff size:** ~60–80 LOC additions, ~10 LOC modifications.

### Frontend changes (5 files)

| File | Change |
|------|--------|
| `src/pages/FinancialStatement.tsx` | **Reorder rows to canonical EBITDA-first layout.** Keep channel rendering within the Revenue section unchanged. Between Contribution Margin (renamed from Gross Profit) and EBIT, new flow: render OpEx section (filter 6150/6160 out of iteration — or use backend's `opex.items` now pre-filtered), Total OpEx (excl. D/A), EBITDA row, D/A row, EBIT row, EBIT Margin %, Other section, Net Income, Net Margin %, **NEW**: CapEx row, FCF row, FCF margin % row. |
| `src/components/financials/ChannelRow.tsx` | Rename label "Gross Margin" → "Contribution Margin" (line 148). Add amount row showing IDR contribution margin (= `netRevenue − cogs.total`). Existing computation at lines 52-54 already yields this value. |
| `src/components/financials/PLRow.tsx` | Optional: add a `helperText` prop for the "No asset acquisitions this period" note (D-14). ~5 LOC. |
| `src/components/financials/DataQualityPanel.tsx` | Add rendering for `gapAnalysis.missingReversals` (and optionally `zeroValueAssets`). Follow existing pattern at lines 135-168 (unmapped products block). |
| `src/lib/csvExport.ts` | Update `WeekData` interface (lines 49-79) with new fields. **Reorder existing rows** to match EBITDA-first layout. **Add new rows:** OpEx-excl-D/A total, D/A, CapEx, FCF, FCF Margin %. **Rename** Gross Profit → Contribution Margin. Channel column "All" for all new rows (below Contribution Margin, no per-channel). |

**Estimated frontend diff size:** ~150 LOC additions/modifications across 5 files.

### Hook layer — no changes

`src/hooks/convex/useFinancials.ts` passes query results through a pass-through `useMemo` (lines 83-113). New WeekData fields flow through automatically because the hook doesn't destructure.

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Phase 71 reversal bypass** — some future bugfix bypasses `createReversalEntry` when creating an asset from expense, causing double-count (expense stays in OpEx AND asset in CapEx) | HIGH if it occurs, LOW probability | D-15 gap check surfaces this. Add to RUN-time tests: test that calls `convertToCapex` then asserts original expense JE has `isReversed=true`. |
| **Reclassified-to-expense asset (Phase 71 Direction B)** in same period as acquisition — P&L double-reports the cash outflow | MEDIUM | D-04 locks it: include all acquisitions regardless of disposal. Reclassification books a new expense in the period of reclassification, not the acquisition period. Reversing earlier CapEx retroactively is NOT in scope. Document clearly in the UI tooltip: "CapEx is gross acquisitions; disposals and reclassifications flow through Net Income". |
| **Pre-Asset-Register periods** — weeks before Phase 60 shipped have no `fixedAssets` rows but the P&L would render CapEx = 0 without context | LOW | Default "No asset acquisitions this period" helper text covers it. Add a distinct "Asset Register began MMM YYYY" note if `fixedAssets` table is empty entirely — optional, D-14 covers the common case. |
| **Index miss on fixedAssets scan** at 10k+ assets | LOW (future) | Current Finding #1: scan acceptable at current scale. Revisit at 1k+ assets. |
| **Depreciation cron lag** — a month's D/A JE not yet posted causes EBITDA to look inflated (no expense subtracted) and D/A to be zero | MEDIUM | **Existing banner** at `FinancialStatement.tsx:280-298` already warns on unposted depreciation (uses `useDepreciationReminder`). Keep; no new work. |
| **Asset disposed within period** — sale proceeds land in Other Income (7300) or Loss on Disposal (7400) — these flow through existing `otherItems` aggregation. Gain/loss is NOT CapEx. | LOW | D-03 locks gross acquisitions. Disposal's cash effect is already captured via `1100 Cash` movements on the JE, which don't affect the P&L. Gain/loss on disposal naturally ends up in NI via "Other". No action. |
| **`lint:convex` pre-commit** hook forbids dynamic imports — `grep -rE "await\s+import\s*\(" convex/` | INFO | Incomings all static. Already follows the rule. |
| **Back-compat on `totalOpEx`** — existing analytics consumers (e.g. ExpenseAnalytics) may read `totalOpEx` inclusive of D/A | LOW | Keep `totalOpEx` unchanged (still inclusive); add new `opexExcludingDA`. Documented in PR. |
| **CSV per-channel blank cells below Contribution Margin** — users may read blanks as "missing data" rather than "not applicable" | LOW | D-16 decision. Consider emitting the literal string `—` or omitting the channel column entirely for those rows. Planner picks; recommend leaving `channel="All"` since that's how summary rows already emit today. |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 + convex-test 0.0.41 |
| Config file | (Convex project uses `vitest` default config; test files discovered by pattern `**/*.test.ts`) |
| Quick run command | `npm run test -- --run convex/reports/__tests__/incomeStatement-capex.test.ts` |
| Full suite command | `npm run test` |
| Build gate | `npm run build` (tsc -b && vite build) — mandatory before merge per CLAUDE.md |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FIN-01 | CapEx = sum(fixedAssets.cost) where acquisitionDate in [periodStart, periodEnd) | unit (query) | `npm run test -- --run convex/reports/__tests__/incomeStatement-capex.test.ts -t "CapEx sums"` | ❌ Wave 0 |
| FIN-01 | Converted-expense asset (Phase 71) counts in CapEx based on ORIGINAL expense date, not reclass date | unit (query) | `npm run test -- ... -t "converted expense uses expenseDate"` | ❌ Wave 0 |
| FIN-01 | FCF = NI + D/A − CapEx (formula correctness across sign combos) | unit (pure function) | `npm run test -- ... -t "FCF formula"` | ❌ Wave 0 |
| FIN-01 | D-04: assets with `disposalType=reclassify_to_expense` still count | unit (query) | `npm run test -- ... -t "reclassified asset included in CapEx"` | ❌ Wave 0 |
| FIN-01 | Zero CapEx period renders CapEx row with 0 and helper text | component (Vitest + Testing Library) OR smoke/manual | manual click-through `/financials` on a period with no assets | MANUAL OK |
| FIN-01 | D/A row renders once, between EBITDA and EBIT, with tooltip showing dep+amort split | component OR smoke/manual | manual click-through | MANUAL OK |
| FIN-02 | Per-channel row shows "Contribution Margin" label (not "Gross Margin") | component (Testing Library) | `npm run test -- --run src/components/financials/ChannelRow.test.tsx` | ❌ Wave 0 |
| FIN-02 | Per-channel row stops at Contribution Margin — no OpEx/D/A/CapEx/FCF shown in ChannelRow expanded panel | component | same | ❌ Wave 0 |
| D-15 | `missingReversals` check finds expenses with convertedToAssetId where journalEntryId has `isReversed !== true` | unit (query) | `npm run test -- ... -t "missingReversals gap flags"` | ❌ Wave 0 |
| D-16 | CSV contains rows: OpEx-excl-DA total, EBITDA, D/A, EBIT, NI, CapEx, FCF in that order | unit (csvExport) | `npm run test -- --run src/lib/__tests__/csvExport.test.ts` | ❌ Wave 0 (or reuse existing) |
| D-16 | CSV per-channel columns are "All" (or blank) below Contribution Margin | unit (csvExport) | same | ❌ Wave 0 |
| CLAUDE.md gate | `npm run build` passes (tsc -b + vite build) | integration | `npm run build` | — |

### Sampling Rate
- **Per task commit:** `npm run test -- --run convex/reports/__tests__/ src/components/financials/ src/lib/__tests__/csvExport.test.ts` (fast, targeted)
- **Per wave merge:** `npm run test` (full suite — ~40s at current size)
- **Phase gate:** Full suite green + `npm run build` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `convex/reports/__tests__/incomeStatement-capex.test.ts` — covers FIN-01 CapEx + FCF scenarios (~6 tests)
- [ ] `convex/reports/__tests__/incomeStatement-gap-missingReversals.test.ts` — covers D-15 (~2 tests)
- [ ] `src/lib/__tests__/csvExport.test.ts` — NEW file (none exists for csvExport today) covering D-16 row order/content (~4 tests)
- [ ] `src/components/financials/ChannelRow.test.tsx` — NEW file covering FIN-02 label rename + scope limit (~2 tests)
- [ ] Framework install: none needed — all deps present.

**Manual-only behaviors:** section-collapse UX, visual styling (border colors, muted text) — covered by human smoke-test after deploy to dev.

## Recommended Plan Breakdown

A clean split into 3 waves, with internal parallel opportunities. Planner can refine; this is the starting shape.

### Wave 0: Test Scaffolding (PARALLEL with Wave 1 backend, ideally slightly ahead)
| Agent | Task | Files |
|-------|------|-------|
| code-auditor / test scaffolder | Create failing tests for FIN-01 CapEx/FCF formula, D-04, D-06, D-15 | `convex/reports/__tests__/incomeStatement-capex.test.ts` (new), `convex/reports/__tests__/incomeStatement-gap-missingReversals.test.ts` (new) |
| code-auditor | CSV export tests | `src/lib/__tests__/csvExport.test.ts` (new) |
| code-auditor | ChannelRow rename test | `src/components/financials/ChannelRow.test.tsx` (new) |

### Wave 1: Backend Extension [PARALLEL tasks within wave]
| Agent | Task | Files |
|-------|------|-------|
| convex-backend | Extend WeekData interface + deltas shape with 5 new fields + gapAnalysis missingReversals | `convex/reports/incomeStatement.ts` |
| convex-backend | Add fixedAssets fetch to Promise.all (current+previous) + add expenses fetch for missingReversals gap check | `convex/reports/incomeStatement.ts` |
| convex-backend | Extend aggregateWeek: CapEx sum, FCF formula, D/A-from-OpEx filter, opexExcludingDA | `convex/reports/incomeStatement.ts` |
| convex-backend | Add deltas for new fields | `convex/reports/incomeStatement.ts` |

### Wave 2: Frontend Reorg [PARALLEL tasks within wave, after Wave 1 ships types]
| Agent | Task | Files |
|-------|------|-------|
| react-ui-builder | Reorganize P&L table rows to EBITDA-first canonical order; add D/A, CapEx, FCF, FCF Margin rows | `src/pages/FinancialStatement.tsx` |
| react-ui-builder | Optional: add `helperText` prop to PLRow for muted zero note (D-14) | `src/components/financials/PLRow.tsx` |
| react-ui-builder | Rename per-channel "Gross Margin" → "Contribution Margin"; add contribution margin amount sub-row | `src/components/financials/ChannelRow.tsx` |
| react-ui-builder | Update DataQualityPanel with missingReversals section | `src/components/financials/DataQualityPanel.tsx` |
| react-ui-builder | Update csvExport: WeekData interface, reordered rows, new CapEx/FCF rows, channel-col rules below Contribution Margin | `src/lib/csvExport.ts` |

### Wave 3: Verification [SEQUENTIAL]
| Agent | Task |
|-------|------|
| code-auditor | Type check + pattern compliance (Convex camelCase, ProtectedRoute gates, no hooks-after-return) |
| Bash | `npm run test` — all Wave 0 tests green |
| Bash | `npm run build` — tsc + vite build pass |
| code-auditor | Final review: D-07 layout matches spec, D-11 per-channel scope honored, CSV matches UI |

### Documentation updates
- [ ] `docs/CHANGELOG.md` — MANDATORY
- [ ] `docs/API_REFERENCE.md` — if new WeekData fields are documented publicly
- [ ] `docs/ROADMAP.md` — mark FIN-01, FIN-02 complete

### Success Criteria
- [ ] `npm run type-check` passes
- [ ] `npm run build` succeeds
- [ ] P&L renders textbook layout (Revenue → Net Revenue → COGS → Contribution Margin → OpEx-excl-D/A → EBITDA → D/A → EBIT → Other → NI → CapEx → FCF)
- [ ] CapEx row always renders, shows Rp 0 + helper text when no acquisitions
- [ ] FCF = NI + D/A − CapEx verified by unit test
- [ ] Per-channel rows show "Contribution Margin" label, stop at that level
- [ ] CSV export matches UI row order, channel columns blank below Contribution Margin
- [ ] DataQualityPanel surfaces missingReversals when applicable
- [ ] No regressions to existing EBITDA/EBIT/NI figures in current test suite

## Open Questions

None blocking. Two minor design choices are left to the planner/implementer within Claude's Discretion:
1. **Split D/A into two rows vs. single combined row?** Default: single combined with tooltip breakdown. (Preferred if `amortizationAmount === 0` in most periods — avoids empty-row noise.)
2. **Add `zeroValueAssets` to gapAnalysis?** Low-priority defensive check; add if cheap, skip if scope tight.

## RESEARCH COMPLETE

**Phase:** 75 — Full P&L Extension
**Confidence:** HIGH

### Key Findings
- Phase 71 `convertToCapex` ALREADY stamps `acquisitionDate = expense.expenseDate` correctly (`convex/expenses/mutations.ts:846`) — no fix needed for D-06.
- Phase 71 reversal JE is ATOMIC with asset creation, uses `sourceType: "expense_void"`; original expense JE is marked `isReversed: true`. The D-15 gap check is a clean query against converted-expense JEs where `isReversed !== true`.
- D/A extraction is ALREADY in `incomeStatement.ts:469-474` — Phase 75 is mostly a presentation reorg. New backend fields needed: `opexExcludingDA`, `depreciationAmortization`, `capExAmount`, `freeCashFlow`.
- `fixedAssets` has NO `by_acquisitionDate` index. At current scale (<1000 assets), scan + filter is acceptable; skip adding the index.
- Half-open date interval on `externalRevenue.by_period` ALREADY matches the convention needed for filtering `fixedAssets.acquisitionDate` — zero alignment risk.
- convex-test + Vitest infrastructure is operational; Wave 0 test tasks are practical (~4 new test files, ~14 tests).

### File Created
`D:\Claude\Product Manager\product_master\.planning\phases\75-full-p-l-extension\75-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Current-state inventory | HIGH | Read every file listed in `<canonical_refs>` directly; confirmed line numbers |
| Phase 71 reversal behavior | HIGH | Traced `convertToCapex` → `createReversalEntry` → `createJournalEntryWithLines` end-to-end with source code confirmation |
| CapEx index decision | HIGH | Schema inspection confirmed no index; scale estimate based on codebase vintage |
| Date filtering alignment | HIGH | Direct comparison of interval conventions in `periodRange.ts`, `fixedAssets/mutations.ts`, and `incomeStatement.ts` |
| Test plan | HIGH | Verified convex-test pattern in existing `incomeStatement-shopee.test.ts` |
| Per-channel scope limit | HIGH | D-10/D-11 explicit; ChannelRow.tsx confirmed to already compute contribution margin |

### Open Questions
None blocking. Two minor design choices (D/A split, zeroValueAssets check) are within Claude's Discretion.

### Ready for Planning
Research complete. Planner can now create PLAN.md files.
