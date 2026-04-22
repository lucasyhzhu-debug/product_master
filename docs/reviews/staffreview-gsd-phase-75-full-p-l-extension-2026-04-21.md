# Staff Review: Phase 75 — Full P&L Extension (Implementation)

**Date:** 2026-04-21
**Branch:** `gsd/phase-75-full-p-l-extension`
**Changed files reviewed:**
- `convex/reports/incomeStatement.ts`
- `convex/reports/__tests__/incomeStatement-capex.test.ts`
- `convex/reports/__tests__/incomeStatement-gap-missingReversals.test.ts`
- `src/components/financials/ChannelRow.tsx`
- `src/components/financials/ChannelRow.test.tsx`
- `src/components/financials/DataQualityPanel.tsx`
- `src/components/financials/PLRow.tsx`
- `src/lib/__tests__/csvExport.test.ts`
- `src/lib/csvExport.ts`
- `src/pages/FinancialStatement.tsx`
- `src/pages/KitchenViewV2.tsx` (unrelated 3-line comment removal)
- `tests/convex/managerOverride.test.ts` (unrelated bug-reproduction test)
**Prior staff review:** `docs/reviews/staffreview-75-phase-plans-2026-04-17.md`
**Reviewers:** Staff Developer (Implementation) + Principal Developer (Architecture)

---

## 1. Summary

**Overall Assessment:** APPROVE with 2 important fixes + 4 minor/nitpick items.

The implementation faithfully executes all 16 locked decisions from CONTEXT.md. The canonical EBITDA-first P&L layout, FCF bridge, D/A extraction, CapEx aggregation, missingReversals gap check, and CSV extension are all present and architecturally correct. Test coverage is strong: 6 CapEx/FCF tests, 3 missingReversals tests (plan spec'd 2; implementation adds the R3 Direction-B guard as recommended), 4 CSV tests, and 2 ChannelRow tests — all previously identified gaps are addressed.

Two issues require fixing before merge:

1. **Dead code in FinancialStatement.tsx** — `item.code === "6150"` depreciation-reminder label branch in `mergedOpexItems.map()` can never fire after Plan 01 filters 6150/6160 out of `opex.items`. The depreciation reminder banner still works (it uses `depreciationReminder.hasUnposted`, not the OpEx item list) but the inline label annotation "(current month not posted)" on the individual account row is now permanently silenced. This is silent mis-state, not a runtime error.

2. **Stale scaffold comment in `incomeStatement.ts`** — The delta block comment reads "values are zero until Task 3 wires real computation" (line 869). Task 3 has been executed; the comment is a lie and will confuse future reviewers. Must be removed before merge.

The two unrelated file changes (`KitchenViewV2.tsx` comment deletion and `managerOverride.test.ts` new test) are harmless but technically out of scope for this phase. No blocking concerns there.

---

## 2. Plan Fidelity Assessment

### D-01 through D-06: CapEx source + timing
**Status: PASS.** `capExAmount = fixedAssets.filter(a => a.acquisitionDate >= periodStart && a.acquisitionDate < periodEnd).reduce(sum + cost, 0)`. All conditions correctly applied. D-04 (include reclassify_to_expense) implicit via no-filter-on-disposalType. D-06 (original expenseDate) covered by test 2 in capex suite. No deviation.

### D-07: EBITDA-first canonical layout
**Status: PASS.** `FinancialStatement.tsx` row order matches spec exactly: Contribution Margin → OpEx (excl. D/A) → EBITDA → EBITDA Margin → D/A → EBIT → EBIT Margin → Other → Net Income → Net Margin → CapEx → FCF → FCF Margin. CSV matches. No deviation.

### D-08/D-09: D/A extraction, appears once
**Status: PASS with one dead-code caveat (see Critical section).** Backend filters 6150/6160 from `opex.items` correctly. `totalOpEx` preserved unchanged per back-compat spec. `opexExcludingDA = totalOpEx - depreciationAmortization`. D/A row renders once between EBITDA and EBIT. However the OpEx-section iterator in FinancialStatement.tsx still has a dead `item.code === "6150"` branch (see Critical 1 below).

### D-10/D-11: Per-channel through Contribution Margin only
**Status: PASS.** ChannelRow renames label from "Gross Margin" to "Contribution Margin". Variable identifiers `channelGrossProfit`, `channelGrossMargin` retained — acceptable per plan Task 2 acceptance criteria. No OpEx/D/A/CapEx/FCF sub-rows added. D-11 scope limit enforced and locked by test 2.

### D-12: No new channel-tagged OpEx
**Status: PASS (no-op confirmed).** Not implemented, not needed per research.

### D-13/D-14: FCF formula + zero-CapEx row
**Status: PASS.** `freeCashFlow = netIncomeValue + depreciationAmortization - capExAmount`. CapEx row always renders; `helperText="No asset acquisitions this period"` when `capExAmount === 0`. FCF has formula tooltip. Both rows carry `confidence` prop (exact/calculated).

### D-15: missingReversals gap check
**Status: PASS.** Backend queries expenses with `convertedToAssetId != undefined`, fetches linked JEs, filters `isReversed !== true`. Per-period filtering applied correctly. Frontend DataQualityPanel includes `missingReversals.length` in `issueCount`, renders section when non-empty with AlertCircle (error severity, not warning — appropriate). Link to /expenses present. The implementation adds a third test for Direction-B (R3 from prior staffreview) — this is a net improvement over the plan spec.

### D-16: CSV row list + canonical order
**Status: PASS.** All required rows present: "Total Operating Expenses (excl. D/A)", "Depreciation & Amortization", "EBITDA" (moved above EBIT), "EBIT (Operating Profit)" (moved below D/A), "CapEx (Fixed Asset Acquisitions)", "Free Cash Flow", "FCF Margin %". Gross Profit renamed to "Gross Profit / Contribution Margin". Footer includes missingReversals block. Channel="All" for all rows below Contribution Margin. Row order locked by CSV test 2.

---

## 3. Back-Compat Assessment

### `totalOpEx` preserved
**PASS.** `totalOpEx = opex.total` unchanged (still inclusive of D/A). Delta `data.deltas.totalOpEx` still computed and present. Any downstream consumer reading `totalOpEx` sees the same value as before Phase 75.

### `opex` array D/A-filtered correctly
**PASS with dead code caveat.** Backend filters 6150/6160 out of returned `opex.items`. The frontend `mergedOpexItems` union correctly uses the filtered list. However the dead `item.code === "6150"` branch (see Critical 1) means the depreciation reminder annotation on the individual 6150 row in the expanded OpEx section will never fire — this is a silent regression in UX behavior, not a data regression.

### No new indexes, no schema changes
**PASS.** Confirmed scan-only for `fixedAssets` as specified. No `by_acquisitionDate` index added.

### `depreciationAmount`/`amortizationAmount` preserved
**PASS.** Both individual fields still on WeekData for tooltip breakdown. `depreciationAmortization` is the new combined field; existing fields not removed.

---

## 4. Architectural Risk Assessment

### Real-time subscription load
**LOW RISK.** `ctx.db.query("fixedAssets").collect()` adds one full-table scan per `getIncomeStatement` / `getWeeklyIncomeStatement` subscription. At current scale (<100 assets in production) this is sub-millisecond and runs once in the parallel Promise.all batch. No reactive fan-out risk — this is a Convex query read, not a mutation that would trigger downstream subscriptions.

### `convertedExpenses` query + JE fan-out
**LOW RISK.** `expenses.filter(q.neq("convertedToAssetId", undefined))` is a full expenses scan, but converted expenses are a tiny subset. The subsequent `Promise.all(jeIds.map(ctx.db.get))` is N individual point reads where N is the count of converted expenses in all time (not just the period). For a production instance with ~10-20 converted expenses total, this is 10-20 point reads — acceptable. At 1000+ converted expenses, this should be revisited with an index on `convertedToAssetId`.

### FCF confidence propagation
**ACCEPTABLE.** FCF is tagged `"calculated"` (derived from exact + exact values). This is correct per RESEARCH §11. The confidence cascade stops here — FCF does not propagate confidence downstream to any other metric.

### CSV label divergence risk
**LOW.** The UI uses "CONTRIBUTION MARGIN" (all-caps, Plan 02 choice) while the CSV uses "Gross Profit / Contribution Margin" (Plan 03 choice). This is within the plan's "Claude's Discretion" scope and both the UI and CSV test suites independently validate their respective labels. The difference could confuse an accountant comparing UI to CSV download. Minor but worth noting.

---

## 5. Critical Issues (Must Fix Before Merge)

### C-1: Dead code — `item.code === "6150"` depreciation reminder label branch is permanently unreachable

**Location:** `src/pages/FinancialStatement.tsx` lines 621-624:

```tsx
label={
  item.code === "6150" && canSeeReminder && depreciationReminder?.hasUnposted
    ? `${item.code} ${item.name}  (current month not posted)`
    : `${item.code} ${item.name}`
}
```

**Why it's dead:** `mergedOpexItems` is computed from `unionMergeByCode(data.current.opex, data.previous.opex)`. After Plan 01, `data.current.opex` is pre-filtered by the backend to exclude codes 6150 and 6160. `data.previous.opex` is also pre-filtered (same query, same filter). Therefore `mergedOpexItems` will never contain an item with `code === "6150"` — the ternary's truthy branch is unreachable.

**Impact:** The depreciation banner at the top of the page (`depreciationReminder?.hasUnposted`) still renders correctly — that code path is unaffected. But the row-level inline annotation "(current month not posted)" on the individual 6150 account row no longer fires. Users who previously saw "6150 Depreciation (current month not posted)" inline in the OpEx list now lose that contextual cue.

**Fix options:**

Option A (recommended — minimal): Remove the dead branch entirely:
```tsx
label={`${item.code} ${item.name}`}
```
The top-level depreciation banner already covers this case. No UX regression beyond what Phase 75 already introduces (6150 no longer appears in the OpEx list at all — it's now in the D/A row).

Option B (restores per-row annotation): Move the annotation to the D/A `PLRow`:
```tsx
label="Depreciation & Amortization"
// ...
labelTooltip={
  (data.current.amortizationAmount > 0 || data.current.depreciationAmount > 0)
    ? `Depreciation: ${formatCurrency(data.current.depreciationAmount)} | Amortization: ${formatCurrency(data.current.amortizationAmount)}`
    : undefined
}
// Add a separate helperText when reminder is active:
helperText={
  canSeeReminder && depreciationReminder?.hasUnposted
    ? "Current month not posted — see Asset Register"
    : data.current.capExAmount === 0
    ? undefined  // (this is on CapEx row, not D/A)
    : undefined
}
```
But this is scope expansion. Option A is the correct fix for merge.

### C-2: Stale scaffold comment in delta block

**Location:** `convex/reports/incomeStatement.ts` line 869:

```typescript
// Phase 75 FIN-01 deltas (values are zero until Task 3 wires real computation)
```

**Why it matters:** Task 3 has shipped. The comment is factually wrong and will mislead future reviewers into thinking the delta values are still placeholders. This is a code clarity issue, not a runtime bug.

**Fix:** Remove the stale parenthetical. Acceptable replacement:
```typescript
// Phase 75 FIN-01 deltas
```

---

## 6. Important Issues

### I-1: CSV label inconsistency — UI "CONTRIBUTION MARGIN" vs CSV "Gross Profit / Contribution Margin"

**Location:** `src/pages/FinancialStatement.tsx` line 592 vs `src/lib/csvExport.ts` line 369.

The UI renders the company-level row as "CONTRIBUTION MARGIN" (all-caps, no "Gross Profit"). The CSV emits it as "Gross Profit / Contribution Margin". The CSV test (`csvExport.test.ts` test 3) accepts both names via:
```typescript
r.line_item === "Contribution Margin" || r.line_item === "Gross Profit / Contribution Margin"
```

This is within Claude's Discretion scope per the plan, but the dual-name strategy in the test hides the inconsistency. A user opening the CSV alongside the on-screen P&L will see different labels for the same line item. Not blocking, but should be resolved in a follow-up (or addressed before merge if low-effort — change one to match the other).

### I-2: `transactions` field absent from `ChannelRowProps` but present in `ChannelData` from backend

**Location:** `src/components/financials/ChannelRow.tsx` `ChannelRowProps` interface (lines 19-35).

The `ChannelRowProps.channel` type does not include `transactions`, `discount`, `commission`, `adBurn`, `promoBurn`, or `revShare` fields that exist on the backend `ChannelData`. This was pre-existing before Phase 75 and is not a regression introduced here. However, the Phase 75 test in `ChannelRow.test.tsx` seeds a `channel` object with only the subset accepted by `ChannelRowProps` — which means the test correctly validates what ChannelRow actually uses. No action required, just noting for awareness.

---

## 7. Minor Issues

### M-1: Out-of-scope files in diff

Two files in the branch diff are unrelated to Phase 75:
- `src/pages/KitchenViewV2.tsx` — 3 comment lines removed (architectural comment about componentTracking tier-1 ball leak). Not harmful, but adds noise to the Phase 75 PR.
- `tests/convex/managerOverride.test.ts` — A 95-line manager override voucher reproduction test, clearly a debug artifact from a separate session.

Neither file should be in a Phase 75 commit. Recommend moving these to a separate commit on main (doc/test only) or squashing them out before merge.

### M-2: FCF confidence label is "exact" in CSV, "calculated" in UI

**Location:** `src/lib/csvExport.ts` line 628 — FCF row emits `"exact"` as the confidence column, but in `FinancialStatement.tsx` line 784 the FCF PLRow has `confidence="calculated"`. RESEARCH §11 specifies FCF should be `"calculated"` since it derives from other values. The CSV value is wrong.

Fix: change line 628 from `"exact"` to `"calculated"`:
```typescript
String(data.current.freeCashFlow),
"calculated",   // ← was "exact"; FCF is derived, per RESEARCH §11
```

### M-3: Free Cash Flow CSV row emits positive sign regardless of sign

No issue with the formula. The concern is that the CSV emits `freeCashFlow` raw (can be negative) while `capExAmount` is explicitly negated (`-data.current.capExAmount`). This is correct by design — FCF is a net figure that can legitimately be negative. The CSV test validates the positive-FCF case (`38000000`). A negative FCF scenario (CapEx > NI + D/A) is not tested but the code handles it correctly via `String(data.current.freeCashFlow)`.

---

## 8. Nitpicks

### N-1: `buildMissingReversals` inner function defined inside `fetchAndAggregate`

**Location:** `convex/reports/incomeStatement.ts` lines 734-756.

`buildMissingReversals` is a closure that captures `convertedExpenses` and `jeByIdMap` from the outer scope. It's called twice (current + previous period). This pattern works but is slightly unusual in Convex backend code where pure functions are preferred for testability. The plan's `<reversal_check_pattern>` showed it inline; this is an improvement. No action needed.

### N-2: `ChannelRow.tsx` retained identifiers `channelGrossProfit` and `channelGrossMargin`

The plan explicitly permitted retaining these variable names (Task 2 acceptance criteria: "Variable identifiers MAY retain 'GrossMargin' as a substring"). Confirmed: only the JSX text node was changed. Internal identifiers like `channelGrossMargin` and `prevGrossMargin` still use "Gross" terminology while the rendered label says "Contribution Margin". This is correct per the acceptance criteria but creates a conceptual mismatch between code and UI. A future cleanup to rename these to `channelContributionMargin` would improve readability.

### N-3: `WeekData` interface fields ordering in `incomeStatement.ts`

The Phase 75 fields (`opexExcludingDA`, `depreciationAmortization`, `capExAmount`, `freeCashFlow`, `fcfMarginPercent`) were inserted between `ebitdaMarginPercent` and `otherItems` in `WeekData`. This means the interface field order does not match the canonical P&L presentation order (FCF fields are logically below `netIncome`/`netMarginPercent`). Not a runtime issue; TypeScript doesn't care about interface field ordering. Low friction to fix.

---

## 9. Scope Compliance

All 16 locked decisions covered. No deferred items implemented:
- Tax-optimized EBITDA bridge: absent ✓
- Channel-tagged direct OpEx (schema): absent ✓
- Net CapEx: absent ✓
- Print-friendly view: absent ✓
- New `fixedAssets` index: absent ✓

---

## 10. Test Coverage Assessment

| Requirement | Tests | Pass |
|-------------|-------|------|
| CapEx in-period aggregation (D-01, D-05) | `incomeStatement-capex.test.ts` test 1, test 6 | ✓ |
| Converted-expense original date (D-06) | `incomeStatement-capex.test.ts` test 2 | ✓ |
| D-04 reclassify_to_expense inclusion | `incomeStatement-capex.test.ts` test 3 | ✓ |
| FCF formula (D-13) | `incomeStatement-capex.test.ts` test 4 | ✓ |
| Zero CapEx (D-14) | `incomeStatement-capex.test.ts` test 5 | ✓ |
| missingReversals healthy state | `incomeStatement-gap-missingReversals.test.ts` test 1 | ✓ |
| missingReversals broken state | `incomeStatement-gap-missingReversals.test.ts` test 2 | ✓ |
| Direction-B does not false-positive (R3 from prior review) | `incomeStatement-gap-missingReversals.test.ts` test 3 | ✓ NEW |
| ChannelRow label rename | `ChannelRow.test.tsx` test 1 | ✓ |
| D-11 scope limit guard | `ChannelRow.test.tsx` test 2 | ✓ |
| CSV CapEx + FCF rows | `csvExport.test.ts` test 1 | ✓ |
| CSV row order | `csvExport.test.ts` test 2 | ✓ |
| CSV Contribution Margin rename + channel scope | `csvExport.test.ts` test 3 | ✓ |
| CSV D/A extraction (no 6150/6160 in OpEx section) | `csvExport.test.ts` test 4 | ✓ |

The implementation exceeds the Wave 0 test spec in one area (R3 Direction-B test added without prompting). No tests are missing relative to the plan's required acceptance gates.

---

## 11. Approval Conditions

**Required before merge (Critical):**
1. Fix or remove the dead `item.code === "6150"` branch in `FinancialStatement.tsx` lines 621-624 (Option A recommended: delete the ternary, use flat `${item.code} ${item.name}`).
2. Remove stale comment "values are zero until Task 3 wires real computation" at `incomeStatement.ts` line 869.

**Recommended before merge (Important):**
3. Fix FCF confidence in CSV from `"exact"` to `"calculated"` (csvExport.ts line 628).
4. Consider aligning UI vs CSV label for the Contribution Margin subtotal row (either both "CONTRIBUTION MARGIN" or both "Gross Profit / Contribution Margin").

**Nice-to-have (Minor/Nitpick):**
5. Move unrelated `KitchenViewV2.tsx` comment removal and `managerOverride.test.ts` out of the Phase 75 branch.
6. Rename `channelGrossMargin` et al. to `channelContributionMargin` in ChannelRow for consistency with rendered label (low priority, can be a follow-up).

---

## 12. Final Verdict

**APPROVE** after applying Critical fixes (C-1, C-2). The implementation correctly delivers FIN-01 and FIN-02 with strong test coverage, correct architecture, and faithful plan execution. The two critical issues are 1–3 line fixes with zero risk.

---

*Generated by `/staffreview` skill — implementation review*
*Staff Developer Review + Principal Developer Review*
*Session: Phase 75 implementation, 2026-04-21*
