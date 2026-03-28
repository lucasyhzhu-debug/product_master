# Staff Review: Income Statement Debug Fix (Margins + EBITDA)

**Date:** 2026-03-28
**Reviewer:** Triple Review (requirements, code-quality, staff/principal)
**Commits:** 0aaa6df3..6a7285ee (3 commits)
**Branch:** main (debug hotfix)

---

## Summary

Three-commit fix addressing two confirmed bugs in the income statement:

1. **Margin denominator fix** -- All margin calculations (gross, EBIT, net) in `incomeStatement.ts` and per-channel margin in `ChannelRow.tsx` were dividing by `netRevenue` instead of `totalGross`. Fixed in 4 locations (3 backend + 1 frontend).

2. **EBITDA line addition** -- New EBITDA computation (`EBIT + Depreciation + Amortization`) added to backend, with corresponding UI rows in `FinancialStatement.tsx` and CSV export rows in `csvExport.ts`.

**Files changed:** 5 code files + 2 documentation files
**Lines changed:** +107 / -12

---

## Critical Issues

None.

---

## Important Issues

### I1. No test coverage for EBITDA computation
**Flagged by:** code-quality-reviewer, staffreview

The EBITDA feature (new backend fields `depreciationAmount`, `amortizationAmount`, `ebitda`, `ebitdaMarginPercent`) has zero test coverage. No test seeds depreciation (6150) or amortization (6160) journal entries and verifies the EBITDA calculation. If the account code matching or sign convention changes, the regression will be silent.

**Impact:** Medium -- the logic is simple (filter + reduce + add), but untested backend financial logic is a liability.

**Fix:** Add a test case that seeds 6150 and 6160 journal lines and asserts `ebitda = ebit + depreciationAmount + amortizationAmount`.

### I2. EBIT/Net margin tests don't distinguish totalGross vs netRevenue
**Flagged by:** requirements-reviewer, code-quality-reviewer

The existing tests for `ebitMarginPercent` (line 1111) and `netMarginPercent` (line 1174) use scenarios with zero deductions (single gobiz channel, no commissions/discounts), so `totalGross === netRevenue`. The test comments were updated to say "totalGross" but the assertion value would be identical under either denominator. Only the multi-channel cross-test at line 835 (`grossMarginPercent = 56.52`) actually exercises the denominator difference.

**Impact:** Low-Medium -- there IS one test that validates the gross margin denominator change (the multi-channel test), but EBIT margin and net margin denominator changes are not validated by any test where the two denominators differ.

**Fix:** Add a test with deductions (e.g., commission) where `totalGross != netRevenue`, then assert `ebitMarginPercent = ebit / totalGross * 100` with a value that would fail under the old `netRevenue` denominator.

### I3. Duplicated WeekData interface across backend and CSV export
**Flagged by:** staffreview

The `WeekData` interface is defined independently in both `convex/reports/incomeStatement.ts` (line 63) and `src/lib/csvExport.ts` (line 46). Both were manually updated in this fix. The CSV module intentionally avoids importing server code (documented in a comment), but this creates ongoing maintenance risk -- any future field addition must be duplicated in both files or the CSV export silently omits data.

**Impact:** Low -- documented design decision, but has already required parallel edits in this fix.

**Fix:** Consider a shared types file in `src/lib/` that both modules can import, or at minimum add a comment cross-referencing the other file.

---

## Minor Issues

### M1. EBITDA confidence label in CSV is "exact" but should be "calculated"
**Flagged by:** code-quality-reviewer

The EBITDA CSV row (csvExport.ts line 462) uses confidence `"exact"` but EBITDA is derived from EBIT (which depends on COGS which is `"calculated"`) plus D&A amounts. The EBIT row also uses `"exact"`. This is consistent with the existing EBIT pattern, but technically EBITDA is a calculated metric.

### M2. Margin denominator choice is a business decision, not universally standard
**Flagged by:** requirements-reviewer

The fix changes all margins to divide by `totalGross` (gross revenue). Standard accounting practice is mixed:
- **Traditional:** Gross Margin = Gross Profit / Net Revenue (revenue after returns/allowances)
- **FMCG/Platform businesses:** Often use Gross Revenue as denominator to show margins inclusive of platform fees

The debug doc explicitly chose `totalGross`. This is valid for Frollie's use case (margins showing efficiency relative to total customer-facing revenue). The code comment at line 451-453 documents the rationale. No action needed, but worth noting for future audits.

### M3. No D&A breakdown rows in UI
**Flagged by:** staffreview

The EBITDA row shows the total, but there are no sub-rows showing the Depreciation and Amortization amounts individually. The backend computes and returns `depreciationAmount` and `amortizationAmount`, but the frontend only renders the EBITDA total. This is a minor information gap -- users cannot see the D&A breakdown without expanding the OpEx section (where 6150 and 6160 appear as individual line items).

---

## Nitpick

### N1. Phase comment tags
The EBITDA fields are tagged `// EBITDA (Phase 69)` in the interface. This is helpful for archaeology but the debug fix was not a formal phase. Minor -- no action needed.

### N2. CSV export variable naming
`ebitdaMarginStr` and `prevEbitdaMarginStr` follow the existing pattern (`ebitMarginStr`, `prevEbitMarginStr`). Consistent, no issue.

---

## Consensus Issues (2+ reviewers)

| Finding | Reviewers | Severity |
|---------|-----------|----------|
| I1. No EBITDA test coverage | code-quality, staffreview | Important |
| I2. Margin denominator tests don't differentiate | requirements, code-quality | Important |

---

## Verdict

**PASS with 2 Important items.** The core logic is correct -- margin denominators are fixed, EBITDA computation is sound, UI and CSV are consistent. The two Important items are test coverage gaps that should be addressed before the next milestone but do not block the current fix.
