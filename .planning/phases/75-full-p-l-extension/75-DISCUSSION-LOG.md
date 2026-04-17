# Phase 75: Full P&L Extension - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 75-full-p-l-extension
**Areas discussed:** CapEx data source, Per-channel allocation, D/A + FCF layout, CapEx scope & timing

---

## Area Selection

Four gray areas were presented; user selected "all".

1. CapEx data source
2. Per-channel allocation of OpEx/D/A/CapEx
3. D/A + FCF layout
4. CapEx scope & timing

---

## Area 1: CapEx Data Source

### Q1.1 — Primary source for CapEx numbers?

| Option | Description | Selected |
|--------|-------------|----------|
| `fixedAssets` table | Sum `cost` where `acquisitionDate` ∈ period, excluding disposed-in-period | ✓ |
| Journal entries | Sum Dr to accounts 1500 + 1700 in period | |
| Both, reconciled | Primary `fixedAssets`, JE-based as gap-analysis check | |

**User's choice:** Option 1 (`fixedAssets` table)

### Q1.2 — Handle Phase 71 `convertedToAssetId` expenses?

| Option | Description | Selected |
|--------|-------------|----------|
| Ignore | Asset exists in `fixedAssets`, counting both double-counts | |
| Subtract from OpEx | Zero-out original expense total | |
| Leave as-is (trust JE reversal) | JE reversal already pulls from OpEx | ✓ |

**User's choice:** Option 3 — but user asked for implications to ensure OpEx and assets both stay accurate with no double-count and no gaps.

**Implications captured (Claude clarified):** Option 3 works because the reversal JE (`Dr 1500 / Cr 6xxx`) nets the OpEx automatically in the reclassification period. Edge case: period mismatch if original expense and reclassification fall in different periods — correct accounting but can show a negative OpEx row. Phase 77 Data Health check should flag any `convertedToAssetId` missing its reversal JE. → Added to CONTEXT as D-15.

---

## Area 2: Per-Channel Allocation

### Q2.1 — Channel-specific costs definition for Contribution Margin?

| Option | Description | Selected |
|--------|-------------|----------|
| Platform deductions + COGS only | Cleanest, no new attribution logic | ✓ |
| Add channel-tagged OpEx if exists | Requires new schema field | ✓ |
| Rename Gross Profit → Contribution Margin | Keep math, change label | ✓ |

**User's choice:** All three together.
**Notes:** User wants a future-release tax-optimized variant that starts the EBITDA bridge from net-of-commission revenue (for lower taxable base). Direct/channel-tagged OpEx is already captured via platform APIs (commissions pulled from revenue upstream). Tax variant → deferred.

### Q2.2 — Show EBIT/NI/FCF per channel via allocation?

| Option | Description | Selected |
|--------|-------------|----------|
| No — stop at Contribution Margin | Honest, no fake precision | ✓ |
| Yes — allocate OpEx by revenue share to show EBIT per channel | Estimated, risk of misuse | |
| Yes — full per-channel FCF | Matches FIN-02 literally but misleading | |

**User's choice:** Option 1 — stop at Contribution Margin per channel.

### Q2.3 — Zero CapEx presentation?

| Option | Description | Selected |
|--------|-------------|----------|
| Show row with 0 value + helper note | Preserves bridge structure visibility | ✓ |
| Hide row when zero | Cleaner but hides structure | |
| Show row + CTA to add asset | Overkill for P&L | |

**User's choice:** Option 1.

---

## Area 3: D/A + FCF Layout

### Q3 — How should D/A and FCF be laid out?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep EBITDA bridge + add FCF reconciliation below NI | D/A appears twice | |
| Move D/A out of EBITDA, show only in FCF bridge | Loses EBITDA line | |
| Full reorg: EBITDA-first | Revenue → COGS → GP → OpEx(excl D/A) → EBITDA → D/A → EBIT → Other → NI → CapEx → FCF | ✓ |

**User's choice:** Option 3 — full reorganization.

---

## Area 4: CapEx Scope & Timing

### Q4.1 — CapEx scope for the period?

| Option | Description | Selected |
|--------|-------------|----------|
| Gross acquisitions | Simple, matches Asset Register | ✓ |
| Net CapEx (acquisitions − disposal proceeds) | More accurate FCF but mixes periods | |
| Gross excl. `reclassify_to_expense` | Defensive against Phase 71 edge cases | |

**User's choice:** Option 1 — gross acquisitions, ALL assets (converted or otherwise). User asked Claude to clarify Option 3's edge cases.

**Clarification captured:** Option 3 would have excluded Phase-60-disposed assets with `disposalType = "reclassify_to_expense"` (Direction B: asset → expense). Excluding them would be wrong because cash outflow already happened at original acquisition. Option 1 is accounting-correct.

### Q4.2 — Period assignment for CapEx?

| Option | Description | Selected |
|--------|-------------|----------|
| `acquisitionDate` (business date) | Matches Asset Register + depreciation logic | ✓ |
| `acquisitionJeId.entryDate` (posting date) | Audit-aligned but can drift | |
| Expense `createdAt` for Phase 71 converted assets | Mixes timing conventions | |

**User's choice:** Option 1. User added: for converted expenses, use the original expense acquisition date. → This implies Phase 71 conversion must stamp the asset's `acquisitionDate` with the original expense date (research to verify existing code).

---

## Claude's Discretion

- Exact visual styling of FCF bridge (border, separator, muted background)
- D/A row label (single combined line vs split depreciation/amortization rows; default: combined with tooltip)
- Naming: "Free Cash Flow" vs "Free Cash Flow (simplified)" — default plain "Free Cash Flow" + tooltip formula
- Error/edge handling for periods predating the Asset Register (CapEx = 0 with standard helper note)
- OpEx split presentation in the reorganized layout (single row vs expandable section)

## Deferred Ideas

- Tax-optimized EBITDA bridge from net-of-commission revenue (future milestone)
- Channel-tagged direct OpEx (new `journalEntries.channelSource` field) — no current use case
- Net CapEx (acquisitions − disposal proceeds) — current gross is simpler, disposal gain/loss already flows through NI
- Print-friendly P&L view — out of scope per REQUIREMENTS.md
- Monthly/quarterly period selector — already supported
